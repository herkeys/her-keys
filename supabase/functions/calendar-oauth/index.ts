import { AuthError, adminClient, requireUser, assertAccountActive } from '../_shared/supabaseAdmin.ts';
import { decryptSecret, encryptSecret, randomUrlSafe, sha256Base64Url } from '../_shared/crypto.ts';
import { json, options } from '../_shared/http.ts';

type User = Awaited<ReturnType<typeof requireUser>>;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

/** How long a started consent attempt may wait for Google's callback. */
const ATTEMPT_TTL_MS = 10 * 60_000;
/**
 * How long Google's authorization waits for the SAME signed-in account to redeem it. Shorter than Google's own code lifetime, so a
 * redeemed code is still exchangeable, and short enough that an unredeemed authorization disappears quickly.
 */
const COMPLETION_TTL_MS = 5 * 60_000;
/** randomUrlSafe(32) is 43 characters; anything else is not a handle this server issued. */
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const GOOGLE_TIMEOUT_MS = 10_000;

/*
 * HK-V2ACT-CAL-03 — Google Calendar consent completes only for the Her Keys account that started it.
 *
 * The callback is opened by Google in a browser that carries NO Her Keys session, so it cannot know who is completing consent. Before
 * this repair it exchanged the code and stored the refresh token on the account that STARTED the attempt: anyone who got another person
 * to finish consent on an authorization URL they had started received that person's calendar (account-linking CSRF).
 *
 * Now the callback only records that Google authorized the attempt: Google's code is kept here, encrypted, under the hash of a fresh,
 * unpredictable, single-use completion handle that is returned to the app in the redirect. Nothing reaches Google and nothing is stored
 * on any account until a signed-in caller redeems the handle AND is the account that started the attempt. Redemption consumes the
 * handle whatever the outcome, so a wrong account, a replay or an expired handle can never be retried. The app never sees the code,
 * the PKCE verifier or any Google token.
 */

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

function appRedirect(status: string, extra: { detail?: string; handle?: string } = {}): Response {
  const target = new URL(Deno.env.get('HERKEYS_CALENDAR_APP_REDIRECT_URI') ?? 'herkeys://calendar-connected');
  target.searchParams.set('status', status);
  if (extra.detail) target.searchParams.set('detail', extra.detail.slice(0, 120));
  if (extra.handle) target.searchParams.set('handle', extra.handle);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function begin(req: Request, user: User): Promise<Response> {
  if (!configured()) return json({ status: 'unavailable', reason: 'google_calendar_not_configured' }, 503);

  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = redirectUriFor(req);
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();

  const admin = adminClient();
  await admin.from('calendar_oauth_states').delete().lt('expires_at', new Date().toISOString());
  // One outstanding consent attempt per Her Keys account. Starting again also discards an unredeemed authorization from an earlier
  // attempt, and keeps an authenticated caller from accumulating unbounded state rows.
  await admin.from('calendar_oauth_states').delete().eq('user_id', user.id);
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

/** Google's return. Records the authorization for later authenticated redemption; exchanges nothing and stores nothing on an account. */
async function callback(req: Request): Promise<Response> {
  if (!configured()) return appRedirect('error', { detail: 'not_configured' });

  const url = new URL(req.url);
  if (url.searchParams.get('error')) return appRedirect('cancelled', { detail: url.searchParams.get('error') ?? undefined });

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return appRedirect('error', { detail: 'missing_code_or_state' });
  if (!STATE_PATTERN.test(state) || code.length > 2048) return appRedirect('error', { detail: 'invalid_state' });

  const admin = adminClient();
  const stateHash = await sha256Base64Url(state);
  const { data: pending, error: pendingError } = await admin
    .from('calendar_oauth_states')
    .select('state_hash,user_id,expires_at,completion_hash')
    .eq('state_hash', stateHash)
    .maybeSingle();

  // Unknown, or already used once: a state authorizes exactly one callback.
  if (pendingError || !pending || pending.completion_hash !== null) return appRedirect('error', { detail: 'invalid_state' });
  if (Date.parse(pending.expires_at) <= Date.now()) {
    await admin.from('calendar_oauth_states').delete().eq('state_hash', stateHash);
    return appRedirect('error', { detail: 'expired_state' });
  }
  await assertAccountActive(pending.user_id);

  const handle = randomUrlSafe(32);
  const sealed = await encryptSecret(code);
  // Conditional on the state still being unused: of two racing callbacks for one state, exactly one records an authorization.
  const { data: recorded, error: recordError } = await admin
    .from('calendar_oauth_states')
    .update({
      completion_hash: await sha256Base64Url(handle),
      authorization_code_ciphertext: sealed.ciphertext,
      authorization_code_iv: sealed.iv,
      completion_expires_at: new Date(Date.now() + COMPLETION_TTL_MS).toISOString(),
    })
    .eq('state_hash', stateHash)
    .is('completion_hash', null)
    .select('state_hash');
  if (recordError) throw recordError;
  if (!Array.isArray(recorded) || recorded.length !== 1) return appRedirect('error', { detail: 'invalid_state' });

  return appRedirect('authorized', { handle });
}

function rejected(reason: string, status: number): Response {
  return json({ status: 'rejected', reason }, status);
}

/** The signed-in app redeems Google's authorization. Only the account that started the attempt can; every handle works at most once. */
async function complete(user: User, body: Record<string, unknown>): Promise<Response> {
  if (!configured()) return json({ status: 'unavailable', reason: 'google_calendar_not_configured' }, 503);
  const handle = typeof body.handle === 'string' ? body.handle : '';
  if (!HANDLE_PATTERN.test(handle)) return rejected('invalid_completion', 400);

  const admin = adminClient();
  // Consume first, decide second: the row is deleted atomically, so a handle is single-use whether this redemption succeeds, belongs
  // to another account, or has expired. Of two racing redemptions only one receives the row.
  const { data: consumed, error: consumeError } = await admin
    .from('calendar_oauth_states')
    .delete()
    .eq('completion_hash', await sha256Base64Url(handle))
    .select('user_id,code_verifier,redirect_uri,authorization_code_ciphertext,authorization_code_iv,completion_expires_at');
  if (consumeError) throw consumeError;
  const pending = Array.isArray(consumed) && consumed.length === 1 ? consumed[0] : null;
  if (!pending) return rejected('invalid_completion', 409);
  if (pending.user_id !== user.id) {
    console.error('[calendar-oauth] completion refused: account mismatch');
    return rejected('account_mismatch', 403);
  }
  if (!pending.completion_expires_at || Date.parse(pending.completion_expires_at) <= Date.now()) return rejected('expired_completion', 409);

  let code: string;
  try {
    code = await decryptSecret(pending.authorization_code_ciphertext, pending.authorization_code_iv);
  } catch {
    return rejected('invalid_completion', 409);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!,
      code,
      code_verifier: pending.code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: pending.redirect_uri,
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>;
  const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : null;
  const refreshToken = typeof tokenPayload.refresh_token === 'string' ? tokenPayload.refresh_token : null;
  if (!tokenResponse.ok || !accessToken || !refreshToken) return rejected('token_exchange_failed', 502);

  const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const calendarPayload = await calendarsResponse.json().catch(() => ({})) as { items?: Array<Record<string, unknown>> };
  if (!calendarsResponse.ok) return rejected('calendar_list_failed', 502);

  const calendars = Array.isArray(calendarPayload.items) ? calendarPayload.items : [];
  const primary = calendars.find((item) => item.primary === true) ?? calendars[0] ?? null;
  const primaryId = primary && typeof primary.id === 'string' ? primary.id : null;

  const { data: existing } = await admin
    .from('external_calendar_connections')
    .select('selected_calendar_ids')
    .eq('user_id', user.id)
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
      user_id: user.id,
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

  return json({ status: 'ready', connection: { connected: true, state: 'connected', selectedCalendarIds } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();

  try {
    if (req.method === 'GET') return await callback(req);
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const user = await requireUser(req);
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      // An empty body starts a consent attempt, exactly as before.
    }
    if (body.action === 'complete') return await complete(user, body);
    return await begin(req, user);
  } catch (error) {
    // The GET callback is opened by Google inside the app's auth browser, which waits for the app redirect. A bare JSON body there
    // strands her on a blank page, so every callback failure — a restricted account included — returns to the app (HK-V2ACT-CAL-04).
    if (req.method === 'GET') return appRedirect('error', { detail: error instanceof AuthError ? 'account_restricted' : 'internal_error' });
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[calendar-oauth] internal error', error instanceof Error ? error.name : 'unknown');
    return json({ status: 'unavailable', reason: 'calendar_oauth_internal_error' }, 500);
  }
});
