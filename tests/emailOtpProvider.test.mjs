/**
 * The Supabase adapter behind the passwordless-email port.
 *
 * A fake client stands in for supabase-js, shaped like the installed version's `auth.signInWithOtp` / `auth.verifyOtp`
 * (checked against node_modules/@supabase/auth-js types: `SignInWithPasswordlessCredentials`, `VerifyEmailOtpParams`,
 * `EmailOtpType`). What is proven here is the wiring this app owns: exactly what is sent, how each real failure shape is
 * named, and that no message, address or code can leave through a result.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createSupabaseEmailOtp } from '../src/platform/emailOtpProvider.ts';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'Sentinel.Address+tag@example.test';
const CODE = '918273';

/** auth-js failure shapes, as `lib/fetch.js` builds them: AuthApiError (status + code), AuthRetryableFetchError (0 / 502-504). */
const apiError = (status, code, message = `Email address "${EMAIL}" is invalid`) => ({ name: 'AuthApiError', status, code, message });
const networkError = (status = 0) => ({ name: 'AuthRetryableFetchError', status, code: undefined, message: `fetch failed for ${EMAIL}` });

const supabaseSession = (userId = ACCOUNT_A) => ({
  access_token: 'access-token-value',
  refresh_token: 'refresh-token-value',
  expires_at: 1_800_000_000,
  user: { id: userId, email: EMAIL.toLowerCase(), user_metadata: {} },
});

function fakeClient({ otp = { data: {}, error: null }, verify = { data: { session: supabaseSession() }, error: null }, throws = false } = {}) {
  const calls = { signInWithOtp: [], verifyOtp: [] };
  return {
    calls,
    auth: {
      async signInWithOtp(credentials) {
        calls.signInWithOtp.push(credentials);
        if (throws) throw new Error(`socket closed for ${EMAIL}`);
        return otp;
      },
      async verifyOtp(params) {
        calls.verifyOtp.push(params);
        if (throws) throw new Error(`socket closed for ${EMAIL} ${CODE}`);
        return verify;
      },
    },
  };
}

describe('requesting a code', () => {
  test('sends exactly the passwordless request: the address as typed, sign-up allowed, and no redirect', async () => {
    const client = fakeClient();
    const port = createSupabaseEmailOtp(client);
    assert.equal(port.isAvailable(), true);
    assert.deepEqual(await port.request(EMAIL), { kind: 'sent' });
    assert.deepEqual(client.calls.signInWithOtp, [{ email: EMAIL, options: { shouldCreateUser: true } }]);
    // No `emailRedirectTo`: this app signs in with the code she types, never by following a link.
    assert.equal('emailRedirectTo' in client.calls.signInWithOtp[0].options, false);
  });

  test('a resend is the same request again, one call per press', async () => {
    const client = fakeClient();
    const port = createSupabaseEmailOtp(client);
    await port.request(EMAIL);
    await port.request(EMAIL);
    assert.equal(client.calls.signInWithOtp.length, 2);
  });

  test('Supabase\'s real refusals are named for what they are', async () => {
    const cases = [
      [apiError(429, 'over_email_send_rate_limit'), { kind: 'rateLimited', detail: 'over_email_send_rate_limit' }],
      [apiError(429, 'over_request_rate_limit'), { kind: 'rateLimited', detail: 'over_request_rate_limit' }],
      [apiError(429, undefined), { kind: 'rateLimited', detail: 'status_429' }],
      [apiError(400, 'email_address_invalid'), { kind: 'rejected', detail: 'email_address_invalid' }],
      [apiError(422, 'signup_disabled'), { kind: 'rejected', detail: 'signup_disabled' }],
      [apiError(400, 'email_provider_disabled'), { kind: 'rejected', detail: 'email_provider_disabled' }],
      [apiError(400, 'otp_disabled'), { kind: 'rejected', detail: 'otp_disabled' }],
      [apiError(400, 'email_address_not_authorized'), { kind: 'rejected', detail: 'email_address_not_authorized' }],
      [networkError(0), { kind: 'unreachable', detail: 'status_0' }],
      [networkError(503), { kind: 'unreachable', detail: 'status_503' }],
      [apiError(504, 'request_timeout'), { kind: 'unreachable', detail: 'request_timeout' }],
      [apiError(500, 'unexpected_failure'), { kind: 'unreachable', detail: 'unexpected_failure' }],
    ];
    for (const [error, expected] of cases) {
      assert.deepEqual(await createSupabaseEmailOtp(fakeClient({ otp: { data: {}, error } })).request(EMAIL), expected, JSON.stringify(expected));
    }
  });

  test('a client that throws is unreachable, and the thrown text goes nowhere', async () => {
    const result = await createSupabaseEmailOtp(fakeClient({ throws: true })).request(EMAIL);
    assert.deepEqual(result, { kind: 'unreachable', detail: 'request_threw' });
  });
});

describe('verifying a code', () => {
  test('sends exactly the email verification and maps the session through the existing mapping, keyed on the user id', async () => {
    const client = fakeClient();
    const result = await createSupabaseEmailOtp(client).verify(EMAIL, CODE);
    assert.deepEqual(client.calls.verifyOtp, [{ email: EMAIL, token: CODE, type: 'email' }]);
    assert.deepEqual(result, {
      kind: 'success',
      session: {
        accountId: ACCOUNT_A,
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        expiresAt: 1_800_000_000_000,
        provider: { provider: 'email', subject: null, suggestedDisplayName: null },
      },
    });
    assert.equal(JSON.stringify(result).toLowerCase().includes(EMAIL.toLowerCase()), false, 'the session carries no address: the account is the user id');
  });

  test('a wrong code and an expired code are one answer from Supabase, and are reported as one', async () => {
    // GoTrue returns `otp_expired` ("Token has expired or is invalid") for both; an older service sends a bare 401/403.
    for (const error of [apiError(403, 'otp_expired', 'Token has expired or is invalid'), apiError(403, undefined, 'Token has expired or is invalid'), apiError(401, undefined, 'x')]) {
      const result = await createSupabaseEmailOtp(fakeClient({ verify: { data: { session: null }, error } })).verify(EMAIL, CODE);
      assert.equal(result.kind, 'codeRejected', JSON.stringify(error));
    }
  });

  test('other failures are not mistaken for a bad code', async () => {
    const cases = [
      [apiError(429, 'over_request_rate_limit'), { kind: 'rateLimited', detail: 'over_request_rate_limit' }],
      [networkError(0), { kind: 'unreachable', detail: 'status_0' }],
      [networkError(502), { kind: 'unreachable', detail: 'status_502' }],
      [apiError(400, 'validation_failed'), { kind: 'failed', detail: 'validation_failed' }],
      [apiError(403, 'user_banned'), { kind: 'failed', detail: 'user_banned' }],
    ];
    for (const [error, expected] of cases) {
      assert.deepEqual(await createSupabaseEmailOtp(fakeClient({ verify: { data: { session: null }, error } })).verify(EMAIL, CODE), expected, JSON.stringify(expected));
    }
  });

  test('no session, or a user id that is not a uuid, is a failure — never a half-trusted success', async () => {
    assert.deepEqual(await createSupabaseEmailOtp(fakeClient({ verify: { data: { session: null }, error: null } })).verify(EMAIL, CODE), { kind: 'failed', detail: 'no_session' });
    for (const id of [EMAIL, 'not-a-uuid', undefined, '']) {
      // Built by hand: `supabaseSession(undefined)` would fall back to its default, valid id.
      const session = { ...supabaseSession(), user: { id } };
      const result = await createSupabaseEmailOtp(fakeClient({ verify: { data: { session }, error: null } })).verify(EMAIL, CODE);
      assert.deepEqual(result, { kind: 'failed', detail: 'account_id_not_uuid' }, String(id));
    }
    assert.deepEqual(await createSupabaseEmailOtp(fakeClient({ throws: true })).verify(EMAIL, CODE), { kind: 'unreachable', detail: 'verify_threw' });
  });
});

describe('nothing sensitive leaves through a result', () => {
  test('no result ever carries Supabase\'s message, the address, or the code', async () => {
    const hostile = [
      apiError(400, 'email_address_invalid', `Email address "${EMAIL}" is invalid`),
      apiError(403, 'otp_expired', `Token ${CODE} has expired for ${EMAIL}`),
      apiError(400, `Bad Code With "${EMAIL}"`, `message ${EMAIL} ${CODE}`),
      apiError(undefined, undefined, `${EMAIL} ${CODE}`),
      networkError(0),
    ];
    for (const error of hostile) {
      const requested = await createSupabaseEmailOtp(fakeClient({ otp: { data: {}, error } })).request(EMAIL);
      const verified = await createSupabaseEmailOtp(fakeClient({ verify: { data: { session: null }, error } })).verify(EMAIL, CODE);
      for (const result of [requested, verified]) {
        const text = JSON.stringify(result);
        assert.equal(text.includes(EMAIL) || text.includes(CODE) || text.includes('message') || text.includes('Token'), false, text);
        assert.match(result.detail, /^[a-z0-9_]{1,64}$/, 'a detail is a machine code or a status, nothing else');
      }
    }
  });

  test('the adapter logs nothing, persists nothing, and reads no secret from the environment', () => {
    const source = readFileSync('src/platform/emailOtpProvider.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    assert.doesNotMatch(source, /console\.|AsyncStorage|SecureStore|secure-store|localStorage|process\.env|EXPO_PUBLIC|\.message|emailRedirectTo|signInWithPassword|password/i);
    assert.match(source, /signInWithOtp\(\{ email, options: \{ shouldCreateUser: true \} \}\)/);
    assert.match(source, /verifyOtp\(\{ email, token: code, type: 'email' \}\)/);
  });

  test('email rides the isolated provider client, and the welcome tree never calls the auth service itself', () => {
    const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const root = strip(readFileSync('src/store/accountRuntimeInstance.ts', 'utf8'));
    // The transport client (`client`) is the one sync, AI and the other server features use. Email must not sign in on it.
    assert.match(root, /createSupabaseEmailOtp\(providerClient\)/);
    assert.doesNotMatch(root, /createSupabaseEmailOtp\(client\)/);
    assert.match(root, /emailOtp,\s*cloud:/, 'the port is handed to the ONE account runtime, not to a second authority');
    // The only callers of the Supabase OTP methods in the whole app are this adapter.
    for (const file of [...sourceFiles('src'), ...sourceFiles('app')]) {
      if (file === 'src/platform/emailOtpProvider.ts') continue;
      assert.doesNotMatch(strip(readFileSync(file, 'utf8')), /signInWithOtp|verifyOtp\(/, file);
    }
  });
});

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : /\.(ts|tsx)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []
  );
}
