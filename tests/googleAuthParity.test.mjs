import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import './support/googleAuth/register.mjs';

/**
 * GOOGLE IDENTITY — ONE ARCHITECTURE, iOS == ANDROID.
 *
 * Google sign-in is Supabase Auth OAuth (PKCE), opened in the system auth session and returning to exactly
 * `herkeys://auth/callback`. These tests run the REAL `googleProvider.ts` (native modules stubbed) and, in the last block, the
 * REAL supabase-js client built by `createSupabaseClient()` against a scripted network, so the PKCE verifier round trip is
 * proven in the library itself rather than assumed.
 */

// The composition's Supabase config is read at import time; point it at Staging before anything loads it.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fhhudicklmpofuzkxeqe.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
process.env.EXPO_PUBLIC_HERKEYS_BACKEND = 'staging';

const { createGoogleProvider } = await import('../src/platform/googleProvider.ts');
const { createAppleProvider } = await import('../src/platform/appleProvider.ts');
const { GOOGLE_IDENTITY_REDIRECT, isGoogleIdentityCallback, parseOAuthCallback, routerPathForSystemLink } = await import(
  '../src/platform/googleIdentityOAuth.ts'
);
const { createSupabaseClient } = await import('../src/platform/supabaseCloud.ts');

const read = (path) => readFileSync(path, 'utf8');
const IDENTITY_FILES = ['src/platform/googleProvider.ts', 'src/platform/googleIdentityOAuth.ts'];
const identitySource = () => IDENTITY_FILES.map(read).join('\n');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const AUTHORIZE = 'https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/authorize?provider=google&redirect_to=herkeys%3A%2F%2Fauth%2Fcallback';

const supabaseSession = (id = ACCOUNT) => ({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 2_000_000_000,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id, user_metadata: { full_name: 'Maya Rivers', sub: 'google-sub-1' } },
});

/** A Supabase client double that records every auth call, in order. */
function fakeSupabase(over = {}) {
  const calls = [];
  const auth = {
    async signInWithOAuth(args) {
      calls.push(['signInWithOAuth', args]);
      return over.signInWithOAuth ? over.signInWithOAuth(args) : { data: { provider: 'google', url: AUTHORIZE }, error: null };
    },
    async exchangeCodeForSession(code) {
      calls.push(['exchangeCodeForSession', code]);
      if (over.exchange) return over.exchange(code);
      const session = over.session ?? supabaseSession();
      return { data: { session, user: session.user }, error: null };
    },
    async signInWithIdToken(args) {
      calls.push(['signInWithIdToken', args]);
      const session = over.session ?? supabaseSession();
      return { data: { session, user: session.user }, error: null };
    },
    async setSession(args) {
      calls.push(['setSession', args]);
      return { data: { session: null }, error: null };
    },
  };
  return { client: { auth }, calls };
}

/** Script the in-app auth session. */
function browser(respond) {
  globalThis.__hkWebBrowser = { calls: [], respond };
  return globalThis.__hkWebBrowser;
}
const returnTo = (url) => browser(async () => ({ type: 'success', url }));

async function googleOn(os, over, respond = async () => ({ type: 'success', url: `${GOOGLE_IDENTITY_REDIRECT}?code=pkce-code-1` })) {
  globalThis.__hkPlatformOS = os;
  globalThis.__hkPlatformReads = 0;
  const supa = fakeSupabase(over);
  const web = browser(respond);
  const provider = createGoogleProvider(supa.client);
  const available = await provider.isAvailable();
  const result = await provider.signIn();
  return { available, result, supabaseCalls: supa.calls, browserCalls: web.calls, platformReads: globalThis.__hkPlatformReads };
}

describe('1. iOS and Android execute the same Google OAuth path', () => {
  test('the real provider produces an identical call trace and result on ios and android, and never reads Platform.OS', async () => {
    const ios = await googleOn('ios');
    const android = await googleOn('android');

    assert.equal(ios.result.kind, 'success');
    assert.deepEqual(android, ios);
    assert.equal(ios.platformReads, 0, 'Platform.OS was read on the ios run');
    assert.equal(android.platformReads, 0, 'Platform.OS was read on the android run');
    assert.deepEqual(ios.supabaseCalls.map(([name]) => name), ['signInWithOAuth', 'exchangeCodeForSession']);
    assert.deepEqual(ios.browserCalls.map((call) => call.fn), ['openAuthSessionAsync']);
  });

  test('availability is the same on both platforms and needs no platform Google client id', async () => {
    const saved = Object.keys(process.env).filter((key) => key.startsWith('EXPO_PUBLIC_GOOGLE_'));
    for (const key of saved) delete process.env[key];
    for (const os of ['ios', 'android']) {
      globalThis.__hkPlatformOS = os;
      assert.equal(await createGoogleProvider(fakeSupabase().client).isAvailable(), true, os);
    }
  });

  test('the old per-platform OIDC machinery is gone from the identity path', () => {
    const code = stripComments(identitySource());
    assert.doesNotMatch(code, /expo-auth-session|AuthRequest|makeRedirectUri|ResponseType|promptAsync/);
    assert.doesNotMatch(code, /signInWithIdToken|id_token|nonce/);
    assert.doesNotMatch(code, /iosClientId|androidClientId|webClientId|EXPO_PUBLIC_GOOGLE_/);
    assert.doesNotMatch(code, /maybeCompleteAuthSession/, 'web-only; not part of the mobile path');
  });

  test('no Google client id config remains for availability to depend on', () => {
    const files = filesUnder('src').concat(filesUnder('app'));
    for (const file of files) assert.doesNotMatch(read(file), /googleAuthConfig|EXPO_PUBLIC_GOOGLE_(IOS|ANDROID|WEB)_CLIENT_ID/, file);
  });

  test('web is isolated at the composition root, not branched inside the provider', () => {
    const root = read('src/store/accountRuntimeInstance.ts');
    assert.match(root, /secureStorageAvailable \? \[createGoogleProvider\(providerClient\)\] : \[\]/);
    assert.match(read('src/platform/secureStore.ts'), /export const secureStorageAvailable = Platform\.OS !== 'web';/);
  });
});

describe('2. the identity redirect is exactly herkeys://auth/callback', () => {
  test('the constant, the Supabase request and the auth session all use it verbatim', async () => {
    assert.equal(GOOGLE_IDENTITY_REDIRECT, 'herkeys://auth/callback');
    const run = await googleOn('android');
    const [, args] = run.supabaseCalls[0];
    assert.deepEqual(args, {
      provider: 'google',
      options: { redirectTo: 'herkeys://auth/callback', skipBrowserRedirect: true },
    });
    assert.deepEqual(run.browserCalls[0], { fn: 'openAuthSessionAsync', url: AUTHORIZE, redirectUrl: 'herkeys://auth/callback' });
  });

  test('the literal appears exactly once in client source — the one constant', () => {
    const hits = filesUnder('src').concat(filesUnder('app')).flatMap((file) =>
      [...stripComments(read(file)).matchAll(/herkeys:\/\/auth\/callback/g)].map(() => file)
    );
    assert.deepEqual(hits, ['src/platform/googleIdentityOAuth.ts']);
    assert.match(read('src/platform/googleIdentityOAuth.ts'), /export const GOOGLE_IDENTITY_REDIRECT = 'herkeys:\/\/auth\/callback';/);
  });

  test('only the exact route is accepted as the callback', () => {
    for (const ok of ['herkeys://auth/callback', 'herkeys://auth/callback?code=1', 'herkeys://auth/callback#error=x', 'HERKEYS://auth/callback?code=1']) {
      assert.equal(isGoogleIdentityCallback(ok), true, ok);
    }
    for (const bad of [
      'herkeys://auth/callbackX?code=1',
      'herkeys://auth/callback/evil?code=1',
      'herkeys://calendar-connected?code=1',
      'evil://auth/callback?code=1',
      'https://auth/callback?code=1',
      'herkeys://auth?code=1',
    ]) {
      assert.equal(isGoogleIdentityCallback(bad), false, bad);
    }
  });

  test('a return to any other route is refused and nothing is exchanged', async () => {
    for (const url of ['herkeys://auth/callbackX?code=c', 'herkeys://somewhere?code=c', 'https://evil.example/auth/callback?code=c']) {
      const run = await googleOn('ios', undefined, async () => ({ type: 'success', url }));
      assert.equal(run.result.kind, 'providerError', url);
      assert.deepEqual(run.supabaseCalls.map(([name]) => name), ['signInWithOAuth'], url);
    }
  });

  test('Android: the router is told to ignore the identity callback, and every other link passes through', () => {
    assert.equal(routerPathForSystemLink('herkeys://auth/callback?code=abc'), null);
    assert.equal(routerPathForSystemLink('/auth/callback?code=abc'), null);
    assert.equal(routerPathForSystemLink('herkeys://calendar-connected?status=connected'), 'herkeys://calendar-connected?status=connected');
    assert.equal(routerPathForSystemLink('herkeys://dev-tools'), 'herkeys://dev-tools');
    assert.equal(routerPathForSystemLink('/today'), '/today');

    const intent = read('app/+native-intent.tsx');
    assert.match(intent, /export function redirectSystemPath/);
    assert.match(intent, /routerPathForSystemLink\(path\)/);
  });
});

describe('3 & 4. identity and Calendar redirects never cross', () => {
  test('Google identity never uses herkeys://calendar-connected', async () => {
    assert.doesNotMatch(stripComments(identitySource()), /calendar-connected/);
    assert.doesNotMatch(identitySource(), /calendar\.events|calendar\.calendarlist|googleapis\.com\/auth\/calendar/);
    const run = await googleOn('ios');
    assert.doesNotMatch(JSON.stringify(run.supabaseCalls) + JSON.stringify(run.browserCalls), /calendar-connected/);

    // A Calendar return delivered to the identity session is not an identity callback.
    const stray = await googleOn('android', undefined, async () => ({ type: 'success', url: 'herkeys://calendar-connected?code=c' }));
    assert.equal(stray.result.kind, 'providerError');
    assert.deepEqual(stray.supabaseCalls.map(([name]) => name), ['signInWithOAuth']);
  });

  test('Calendar never uses herkeys://auth/callback, and still uses its own route', () => {
    const bridge = read('src/features/calendar/useGoogleCalendarBridge.ts');
    const oauth = read('supabase/functions/calendar-oauth/index.ts');
    for (const source of [bridge, oauth, read('supabase/functions/.env.example')]) {
      assert.doesNotMatch(source, /auth\/callback|GOOGLE_IDENTITY_REDIRECT|googleIdentityOAuth/);
    }
    assert.match(bridge, /const HER_KEYS_CALENDAR_REDIRECT_URI = 'herkeys:\/\/calendar-connected';/);
    assert.match(bridge, /openAuthSessionAsync\(result\.value\.authorizationUrl, HER_KEYS_CALENDAR_REDIRECT_URI\)/);
    assert.match(oauth, /'herkeys:\/\/calendar-connected'/);
    assert.match(oauth, /\/functions\/v1\/calendar-oauth|calendar-oauth/);
  });
});

describe('5. no Google client secret exists in client code', () => {
  test('no secret-shaped Google material in app source, public env or app config', () => {
    const files = [...filesUnder('src'), ...filesUnder('app'), '.env.example', 'app.json', 'eas.json'];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /GOCSPX-[A-Za-z0-9_-]+/, `${file}: Google client secret value`);
      assert.doesNotMatch(source, /client_secret|clientSecret|CLIENT_SECRET/, `${file}: client secret reference`);
      assert.doesNotMatch(source, /EXPO_PUBLIC_[A-Z_]*SECRET/, `${file}: public secret variable`);
    }
  });

  test('the identity request sends no secret of any kind', async () => {
    const run = await googleOn('ios');
    assert.doesNotMatch(JSON.stringify(run), /secret/i);
  });
});

describe('6. no token is persisted outside the existing secure-session boundary', () => {
  test('the identity path imports no storage and writes nothing', () => {
    const code = stripComments(identitySource());
    assert.doesNotMatch(code, /async-storage|AsyncStorage|expo-secure-store|SecureStore|localStorage|persistence\//);
    assert.doesNotMatch(code, /setItem|setItemAsync|writeFile/);
    assert.doesNotMatch(code, /setSession\(/, 'the provider client is never handed a second session from the URL');
  });

  test('the Supabase client keeps no session of its own and runs PKCE', () => {
    const cloud = read('src/platform/supabaseCloud.ts');
    assert.match(cloud, /persistSession: false/);
    assert.match(cloud, /autoRefreshToken: false/);
    assert.match(cloud, /detectSessionInUrl: false/);
    assert.match(cloud, /flowType: 'pkce'/);
    assert.doesNotMatch(cloud, /storage:/);
  });

  test('the provider hands the session back only as a ProviderResult for the account runtime to own', async () => {
    const run = await googleOn('android');
    assert.equal(run.result.kind, 'success');
    // The runtime (not the provider) decides where it lives: secureSession + the quarantined provider client.
    const root = read('src/store/accountRuntimeInstance.ts');
    assert.match(root, /const sessions = createSecureSessionStore\(createDeviceSecureStorage\(\)\);/);
    assert.match(root, /createGoogleProvider\(providerClient\)/);
    assert.doesNotMatch(root, /createGoogleProvider\(client\)/, 'Google must authenticate on the isolated provider client');
  });

  test('a callback carrying tokens in the URL (implicit flow) is refused, never installed', async () => {
    for (const url of [
      'herkeys://auth/callback#access_token=a&refresh_token=r&expires_in=3600',
      'herkeys://auth/callback?code=c&access_token=a',
      'herkeys://auth/callback?code=c#provider_token=p',
    ]) {
      const run = await googleOn('ios', undefined, async () => ({ type: 'success', url }));
      assert.equal(run.result.kind, 'providerError', url);
      assert.deepEqual(run.supabaseCalls.map(([name]) => name), ['signInWithOAuth'], url);
    }
  });
});

describe('7. cancellation returns cancelled', () => {
  for (const type of ['cancel', 'dismiss']) {
    test(`an auth session that ends as ${type} is cancelled on both platforms, with no exchange`, async () => {
      for (const os of ['ios', 'android']) {
        const run = await googleOn(os, undefined, async () => ({ type }));
        assert.deepEqual(run.result, { kind: 'cancelled' }, os);
        assert.deepEqual(run.supabaseCalls.map(([name]) => name), ['signInWithOAuth'], os);
      }
    });
  }
});

describe('8. provider / OAuth failure returns providerError', () => {
  const cases = [
    ['Supabase refuses to start the flow', { signInWithOAuth: () => ({ data: { provider: 'google', url: null }, error: { message: 'Unsupported provider: provider is not enabled' } }) }, undefined, /not enabled/],
    ['Supabase returns no URL', { signInWithOAuth: () => ({ data: { provider: 'google', url: null }, error: null }) }, undefined, /no Google authorization URL/],
    ['signInWithOAuth throws', { signInWithOAuth: () => { throw new Error('offline'); } }, undefined, /offline/],
    ['the auth session throws', undefined, async () => { throw new Error('ERR_WEB_BROWSER_LOCKED'); }, /LOCKED/],
    ['the auth session is locked', undefined, async () => ({ type: 'locked' }), /locked/],
    ['Google denies access (query)', undefined, async () => ({ type: 'success', url: 'herkeys://auth/callback?error=access_denied&error_description=The+user+denied' }), /access_denied: The user denied/],
    ['Supabase reports an error (fragment)', undefined, async () => ({ type: 'success', url: 'herkeys://auth/callback#error=server_error&error_code=bad_oauth_state&error_description=OAuth%20state%20expired' }), /bad_oauth_state: OAuth state expired/],
    ['the callback has no code', undefined, async () => ({ type: 'success', url: 'herkeys://auth/callback' }), /no code/],
    ['the code exchange fails', { exchange: () => ({ data: { session: null, user: null }, error: { message: 'invalid flow state, no valid flow state found' } }) }, undefined, /invalid flow state/],
    ['the code exchange throws', { exchange: () => { throw new Error('socket hang up'); } }, undefined, /socket hang up/],
    ['the exchange yields no session', { exchange: () => ({ data: { session: null, user: null }, error: null }) }, undefined, /no session/],
    ['the account id is not a uuid', { session: supabaseSession('not-a-uuid') }, undefined, /uuid/],
  ];
  for (const [name, over, respond, detail] of cases) {
    test(name, async () => {
      for (const os of ['ios', 'android']) {
        const run = await googleOn(os, over, respond);
        assert.equal(run.result.kind, 'providerError', `${os}: ${JSON.stringify(run.result)}`);
        assert.match(run.result.detail, detail, os);
      }
    });
  }

  test('callback parsing: first value wins, both halves are read, malformed escapes are dropped', () => {
    assert.deepEqual(parseOAuthCallback('herkeys://auth/callback?code=a&code=b'), { code: 'a', error: null, errorDescription: null, carriesTokens: false });
    assert.equal(parseOAuthCallback('herkeys://auth/callback#code=f').code, 'f');
    assert.equal(parseOAuthCallback('herkeys://auth/callback?code=%E0%A4%A').code, null);
    assert.equal(parseOAuthCallback('herkeys://auth/callback?code=').code, null);
  });
});

describe('9. a successful OAuth return produces the same AccountSession shape as Apple', () => {
  test('Google and Apple map one Supabase session to structurally identical AccountSessions', async () => {
    const google = (await googleOn('ios')).result;

    globalThis.__hkPlatformOS = 'ios';
    globalThis.__hkApple = { credential: { identityToken: 'apple-id-token', user: 'apple-sub', fullName: { givenName: 'Maya', familyName: 'Rivers' } } };
    const apple = await createAppleProvider(fakeSupabase().client).signIn();

    assert.equal(google.kind, 'success');
    assert.equal(apple.kind, 'success');
    const shape = (value) =>
      value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]))
        : typeof value;
    assert.deepEqual(shape(google.session), shape(apple.session));

    const { provider: gp, ...gs } = google.session;
    const { provider: ap, ...as } = apple.session;
    assert.deepEqual(gs, as, 'account id, tokens and expiry are mapped identically');
    assert.deepEqual(gs, { accountId: ACCOUNT, accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 2_000_000_000_000 });
    assert.deepEqual(gp, { provider: 'google', subject: 'google-sub-1', suggestedDisplayName: 'Maya Rivers' });
    assert.deepEqual(ap, { provider: 'apple', subject: 'apple-sub', suggestedDisplayName: 'Maya Rivers' });
  });

  test('both go through the one sessionMapping boundary', () => {
    assert.match(read('src/platform/googleIdentityOAuth.ts'), /import \{ sessionFromSupabase \} from '\.\/sessionMapping';/);
    assert.match(read('src/platform/appleProvider.ts'), /import \{ sessionFromSupabase \} from '\.\/sessionMapping';/);
  });
});

describe('10. no platform-specific Google redirect branch remains', () => {
  test('the identity files never import react-native or mention a platform', () => {
    const code = stripComments(identitySource());
    assert.doesNotMatch(code, /from 'react-native'/);
    assert.doesNotMatch(code, /\bPlatform\b|Platform\.OS|Platform\.select/);
    assert.doesNotMatch(code, /'ios'|'android'|"ios"|"android"|\.ios\.|\.android\./);
  });

  test('there is no platform-suffixed Google provider file for Metro to pick instead', () => {
    const platformFiles = readdirSync('src/platform').filter((name) => /^google.*\.(ios|android|native|web)\.tsx?$/.test(name));
    assert.deepEqual(platformFiles, []);
  });
});

describe('the REAL supabase-js client: PKCE round trip with persistSession off', () => {
  test('authorize URL, verifier/challenge pairing, in-memory session, and single-use code', async () => {
    const requests = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ url, method: init.method ?? 'GET', body });
      if (url.startsWith('https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/token?grant_type=pkce')) {
        return new Response(JSON.stringify(supabaseSession()), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500, headers: { 'content-type': 'application/json' } });
    };
    try {
      const client = createSupabaseClient();
      assert.ok(client, 'Staging config should produce a client');

      let authorize = null;
      globalThis.__hkPlatformOS = 'android';
      browser(async (url) => {
        authorize = new URL(url);
        return { type: 'success', url: 'herkeys://auth/callback?code=real-code-1' };
      });
      const result = await createGoogleProvider(client).signIn();

      assert.equal(result.kind, 'success', JSON.stringify(result));
      assert.equal(authorize.origin + authorize.pathname, 'https://fhhudicklmpofuzkxeqe.supabase.co/auth/v1/authorize');
      assert.equal(authorize.searchParams.get('provider'), 'google');
      assert.equal(authorize.searchParams.get('redirect_to'), 'herkeys://auth/callback');
      // skipBrowserRedirect is a client-side switch in supabase-js; it never reaches the authorize URL.
      assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
      assert.doesNotMatch(authorize.search, /sb_flow_id/, 'the redirect must stay exactly the allow-listed route');

      const exchange = requests.filter((r) => r.url.includes('/auth/v1/token?grant_type=pkce'));
      assert.equal(exchange.length, 1);
      assert.equal(exchange[0].body.auth_code, 'real-code-1');
      const challenge = createHash('sha256').update(exchange[0].body.code_verifier).digest('base64url');
      assert.equal(challenge, authorize.searchParams.get('code_challenge'), 'the verifier held in memory matches the challenge sent');

      assert.deepEqual(result.session, {
        accountId: ACCOUNT,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: 2_000_000_000_000,
        provider: { provider: 'google', subject: 'google-sub-1', suggestedDisplayName: 'Maya Rivers' },
      });
      assert.equal(typeof globalThis.localStorage, 'undefined', 'nothing may reach for web storage');

      // The verifier was consumed: the same code, replayed, never reaches the token endpoint.
      browser(async () => ({ type: 'success', url: 'herkeys://auth/callback?code=real-code-1' }));
      const before = requests.length;
      const replayClient = createSupabaseClient();
      const { data, error } = await replayClient.auth.exchangeCodeForSession('real-code-1');
      assert.equal(data.session, null);
      assert.match(error?.name ?? '', /PKCECodeVerifierMissing/);
      assert.equal(requests.length, before, 'no verifier, no token request');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
