import { AuthError, adminClient, requireUser } from '../_shared/supabaseAdmin.ts';
import { encryptSecret, randomUrlSafe, sha256Base64Url } from '../_shared/crypto.ts';
import { json, options } from '../_shared/http.ts';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

function configured(): boolean {
  return Boolean(
    Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') &&
    Deno.env.get('EXTERNAL_TOKEN_ENCRYPTION_KEY_B64')
  );
}

function redirectUriFor(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}${url.pathname}`;
}

function appRedirect(status: string, detail?: string): Response {
  const target = new URL(Deno.env.get('HERKEYS_CALENDAR_APP_REDIRECT_URI') ?? 'herkeys://calendar-connected');
  target.searchParams.set('status', status);
  if (detail) target.searchParams.set('detail', detail.slice(0, 120));
  return Response.redirect(target.toString(), 302);
}

async function begin(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (!configured()) return json({ status: 'unavailable', reason: 'google_calendar_not_configured' }, 503);

  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = redirectUriFor(req);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const admin = adminClient();
  await admin.from('calendar_oauth_states').delete().lt('expires_at', new Date().toISOString());
  const { error } = await admin.from('calendar_oauth_states').insert({
    state_hash: await sha256Base64Url(state),
    user_id: user.id,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return json({
    status: 'ready',
    authorizationUrl: url.toString(),
    redirectUri,
    scopes: [...SCOPES],
  });
}

async function callback(req: Request): Promise<Response> {
  if (!configured()) return appRedirect('error', 'not_configured');

  const url = new URL(req.url);
  if (url.searchParams.get('error')) return appRedirect('cancelled', url.searchParams.get('error') ?? undefined);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return appRedirect('error', 'missing_code_or_state');

  const admin = adminClient();
  const stateHash = await sha256Base64Url(state);
  const { data: pending, error: pendingError } = await admin
    .from('calendar_oauth_states')
    .select('state_hash,user_id,code_verifier,redirect_uri,expires_at')
    .eq('state_hash', stateHash)
    .maybeSingle();

  if (pendingError || !pending) return appRedirect('error', 'invalid_state');
  await admin.from('calendar_oauth_states').delete().eq('state_hash', stateHash);

  if (Date.parse(pending.expires_at) <= Date.now()) return appRedirect('error', 'expired_state');

  const tokenBody = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!,
    client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!,
    code,
    code_verifier: pending.code_verifier,
    grant_type: 'authorization_code',
    redirect_uri: pending.redirect_uri,
  });

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
  const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : null;
  const refreshToken = typeof tokenPayload.refresh_token === 'string' ? tokenPayload.refresh_token : null;

  if (!tokenResponse.ok || !accessToken || !refreshToken) {
    return appRedirect('error', 'token_exchange_failed');
  }

  const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const calendarPayload = await calendarsResponse.json() as { items?: Array<Record<string, unknown>> };
  if (!calendarsResponse.ok) return appRedirect('error', 'calendar_list_failed');

  const calendars = Array.isArray(calendarPayload.items) ? calendarPayload.items : [];
  const primary = calendars.find((item) => item.primary === true) ?? calendars[0] ?? null;
  const primaryId = primary && typeof primary.id === 'string' ? primary.id : null;

  const { data: existing } = await admin
    .from('external_calendar_connections')
    .select('selected_calendar_ids')
    .eq('user_id', pending.user_id)
    .eq('provider', 'google')
    .maybeSingle();

  const validIds = new Set(calendars.map((item) => typeof item.id === 'string' ? item.id : null).filter(Boolean));
  const priorSelection = Array.isArray(existing?.selected_calendar_ids)
    ? existing.selected_calendar_ids.filter((id: unknown) => typeof id === 'string' && validIds.has(id))
    : [];
  const selectedCalendarIds = priorSelection.length > 0 ? priorSelection : primaryId ? [primaryId] : [];

  const encrypted = await encryptSecret(refreshToken);
  const now = new Date().toISOString();
  const { error: upsertError } = await admin.from('external_calendar_connections').upsert(
    {
      user_id: pending.user_id,
      provider: 'google',
      provider_account_id: primaryId,
      scopes: [...SCOPES],
      refresh_token_ciphertext: encrypted.ciphertext,
      refresh_token_iv: encrypted.iv,
      selected_calendar_ids: selectedCalendarIds,
      status: 'connected',
      connected_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id,provider' },
  );
  if (upsertError) throw upsertError;

  return appRedirect('connected');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();

  try {
    if (req.method === 'GET') return await callback(req);
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    return await begin(req);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    if (req.method === 'GET') return appRedirect('error', 'internal_error');
    console.error('[calendar-oauth] internal error', error instanceof Error ? error.name : 'unknown');
    return json({ status: 'unavailable', reason: 'calendar_oauth_internal_error' }, 500);
  }
});
