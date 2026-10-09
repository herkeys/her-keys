import { AuthError, adminClient, requireUser } from '../_shared/supabaseAdmin.ts';
import { json, options } from '../_shared/http.ts';

// This function is NEVER allowed to send from Staging or any other project.
// The server also needs an explicitly enabled production secret switch.
const PRODUCTION_URL = 'https://npykvnxnehlsdlbumzwk.supabase.co';
const TEMPLATE_ALIAS = 'herkeys-welcome-v1';
const FROM = 'Her Keys <accounts@herkeys.app>';
const MAX_ACCOUNT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Deno.env.get('SUPABASE_URL') !== PRODUCTION_URL ||
      Deno.env.get('HER_KEYS_TRANSACTIONAL_EMAILS_ENABLED') !== 'true') {
    return json({ status: 'disabled' }, 503);
  }
  try {
    // Never trust an email address from the mobile app or a request body.
    // A valid bearer token is checked by Supabase Auth and determines recipient.
    const user = await requireUser(req);
    if (user.is_anonymous || !user.email || !user.email_confirmed_at) {
      return json({ status: 'not_eligible' }, 200);
    }
    const created = Date.parse(user.created_at);
    if (!Number.isFinite(created) || created > Date.now() ||
        Date.now() - created > MAX_ACCOUNT_AGE_MS) {
      return json({ status: 'not_eligible' }, 200);
    }

    const admin = adminClient();
    const { data: claimed, error: claimError } = await admin.rpc(
      'herkeys_claim_welcome_email', { p_user_id: user.id },
    );
    if (claimError) return json({ status: 'unavailable' }, 503);
    if (claimed !== true) return json({ status: 'already_claimed' }, 200);

    const token = Deno.env.get('RESEND_HERKEYS_SENDING_API_KEY');
    if (!token) return json({ status: 'not_configured' }, 503);
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `herkeys-welcome-v1-${user.id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [user.email],
          template: { id: TEMPLATE_ALIAS },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Unknown transport outcome: retry with the SAME Resend idempotency key
      // after the minimum lock duration, never a new request ID.
      return json({ status: 'delivery_unconfirmed' }, 503);
    }
    if (!response.ok) {
      // Avoid logging provider bodies; they may contain the recipient.
      await admin.from('herkeys_welcome_email_receipts')
        .update({ status: 'retryable' })
        .eq('user_id', user.id)
        .eq('status', 'sending');
      return json({ status: 'delivery_unavailable' }, 503);
    }
    const delivery = await response.json().catch(() => null);
    const messageId = delivery && typeof delivery.id === 'string'
      ? delivery.id.slice(0, 255)
      : null;
    const { error: receiptError } = await admin.from('herkeys_welcome_email_receipts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: messageId,
      })
      .eq('user_id', user.id)
      .eq('status', 'sending');
    // If this write fails, a subsequent retry will reuse the Resend
    // idempotency key while inside the safe 24-hour window.
    if (receiptError) return json({ status: 'delivery_unconfirmed' }, 503);
    return json({ status: 'accepted' }, 200);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    return json({ status: 'unavailable' }, 503);
  }
});
