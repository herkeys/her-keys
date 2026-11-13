import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';

/*
 * Emergency Production mitigation for HK-V2ACT-CAL-03: `supabase/functions/_emergency/calendar-oauth-paused` deployed under the
 * `calendar-oauth` slug. These tests execute the EXACT mitigation file, and the pre-repair `calendar-oauth` / `calendar-data` sources
 * at 4f17b91 (the versions the Production deployment record pins), in a VM. Storage, auth, crypto key material and network are
 * replaced. Deterministic handler evidence, not live evidence; the live before/after probes are recorded in the ledger.
 */

const BEFORE = '4f17b917ce8c30c6890c9b2819c191636208d6d6';
const MITIGATION_PATH = 'supabase/functions/_emergency/calendar-oauth-paused/index.ts';
const strip = (s) => stripTypeScriptTypes(s.replace(/^import [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, ''));
const mitigationRaw = readFileSync(MITIGATION_PATH, 'utf8');
const mitigation = strip(mitigationRaw);
const fromGit = (path) => strip(execFileSync('git', ['show', `${BEFORE}:${path}`], { encoding: 'utf8' }));
const oauthBefore = fromGit('supabase/functions/calendar-oauth/index.ts');
const dataBefore = fromGit('supabase/functions/calendar-data/index.ts');

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sha = (v) => b64url(createHash('sha256').update(v).digest());
const CALLBACK = 'https://synthetic.supabase.invalid/functions/v1/calendar-oauth';

/** Shared in-memory tables and a Google that enforces PKCE + single-use codes, so several handlers can act on one world. */
function world() {
  const tables = { calendar_oauth_states: [], external_calendar_connections: [] };
  const fetches = [];
  const codes = new Map();
  const from = (table) => {
    const op = { kind: 'select', filters: [], values: null };
    const match = (r) => op.filters.every(([k, v, t]) => (t === 'lt' ? r[k] < v : r[k] === v));
    const run = () => {
      if (op.kind === 'delete') { const gone = tables[table].filter(match); tables[table] = tables[table].filter((r) => !match(r)); return { data: gone, error: null }; }
      if (op.kind === 'update') { for (const r of tables[table].filter(match)) Object.assign(r, op.values); return { data: null, error: null }; }
      if (op.kind === 'insert') { tables[table].push({ ...op.values }); return { data: null, error: null }; }
      if (op.kind === 'upsert') {
        const e = tables[table].find((r) => r.user_id === op.values.user_id && r.provider === op.values.provider);
        if (e) Object.assign(e, op.values); else tables[table].push({ id: `conn-${op.values.user_id}`, ...op.values });
        return { data: null, error: null };
      }
      return { data: tables[table].filter(match).map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q, delete: () => { op.kind = 'delete'; return q; }, update: (v) => { op.kind = 'update'; op.values = v; return q; },
      insert: (v) => { op.kind = 'insert'; op.values = v; return Promise.resolve(run()); },
      upsert: (v) => { op.kind = 'upsert'; op.values = v; return Promise.resolve(run()); },
      eq: (k, v) => { op.filters.push([k, v, 'eq']); return q; }, lt: (k, v) => { op.filters.push([k, v, 'lt']); return q; },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  const google = async (input, init = {}) => {
    const url = String(input);
    fetches.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(init.body));
      if (body.get('grant_type') === 'refresh_token') {
        const who = body.get('refresh_token').replace('rt-', '');
        return Response.json({ access_token: `at-${who}` });
      }
      const g = codes.get(body.get('code'));
      if (!g || g.used || sha(body.get('code_verifier')) !== g.challenge) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      g.used = true;
      return Response.json({ access_token: `at-${g.who}`, refresh_token: `rt-${g.who}` });
    }
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
    if (url.startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList')) {
      const who = String(init.headers.Authorization).replace('Bearer at-', '');
      return Response.json({ items: [{ id: `${who}-primary`, primary: true, summary: 'Primary' }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return {
    tables, fetches,
    consent(authorizationUrl, who) {
      const u = new URL(authorizationUrl);
      const code = `code-${who}-${randomBytes(4).toString('hex')}`;
      codes.set(code, { who, challenge: u.searchParams.get('code_challenge'), used: false });
      return `${CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(u.searchParams.get('state'))}`;
    },
    handler(source, { trapStorage = false } = {}) {
      let fn;
      class AuthError extends Error {}
      const trap = (name) => () => { throw new Error(`mitigation touched ${name}`); };
      const sandbox = {
        AuthError, Response, Request, URL, URLSearchParams, AbortSignal, Promise, Set, Map, Array, JSON, Number, Date, Object,
        console: { error() {} },
        json: (body, status = 200) => Response.json(body, { status }),
        options: () => new Response('ok'),
        requireUser: trapStorage ? trap('requireUser') : async (req) => {
          const t = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
          if (!t) throw new AuthError('missing');
          return { id: t };
        },
        assertAccountActive: trapStorage ? trap('assertAccountActive') : async () => {},
        adminClient: trapStorage ? trap('adminClient') : () => ({ from }),
        sha256Base64Url: async (v) => sha(v),
        randomUrlSafe: (n = 32) => b64url(randomBytes(n)),
        encryptSecret: async (v) => ({ ciphertext: `sealed:${v}`, iv: 'iv' }),
        decryptSecret: async (c) => String(c).replace('sealed:', ''),
        Deno: { env: { get: (k) => (k === 'HERKEYS_CALENDAR_APP_REDIRECT_URI' ? undefined : trapStorage ? trap(`env ${k}`)() : 'configured') }, serve: (f) => { fn = f; } },
        fetch: trapStorage ? trap('fetch') : google,
      };
      runInNewContext(source, sandbox);
      return fn;
    },
  };
}

const post = async (fn, account, body = {}) => {
  const res = await fn(new Request(CALLBACK, { method: 'POST', headers: account ? { Authorization: `Bearer ${account}` } : {}, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const get = async (fn, url) => {
  const res = await fn(new Request(url));
  const loc = res.headers.get('Location');
  return { status: res.status, loc, params: loc ? new URL(loc).searchParams : null };
};

describe('the mitigation refuses every connection path and touches nothing', () => {
  test('starting consent is refused with the existing unavailable shape, for any caller and any body', async () => {
    const fn = world().handler(mitigation, { trapStorage: true });
    for (const [account, body] of [[null, {}], ['account-a', {}], ['account-a', { action: 'complete', handle: 'x'.repeat(43) }], ['account-a', 'not json']]) {
      const r = await post(fn, account, body);
      assert.equal(r.status, 503);
      assert.deepEqual(r.body, { status: 'unavailable', reason: 'calendar_connect_paused' });
    }
  });

  test('every Google callback returns to the app as an error, exchanging no code and writing nothing', async () => {
    const fn = world().handler(mitigation, { trapStorage: true });
    for (const url of [`${CALLBACK}?code=c&state=s`, `${CALLBACK}?error=access_denied&state=s`, CALLBACK]) {
      const r = await get(fn, url);
      assert.equal(r.status, 302);
      assert.equal(r.loc, 'herkeys://calendar-connected?status=error&detail=connect_paused');
    }
  });

  test('OPTIONS answers CORS; other methods are refused', async () => {
    const fn = world().handler(mitigation, { trapStorage: true });
    assert.equal((await fn(new Request(CALLBACK, { method: 'OPTIONS' }))).status, 200);
    assert.equal((await fn(new Request(CALLBACK, { method: 'PUT' }))).status, 405);
  });

  test('the file holds no storage, Google credential, network or shared auth/crypto dependency', () => {
    const code = mitigationRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.deepEqual([...code.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]), ['../../_shared/http.ts']);
    assert.doesNotMatch(code, /adminClient|requireUser|supabaseAdmin|crypto\.ts|fetch\(|GOOGLE_|EXTERNAL_TOKEN|refresh_token|\.from\(/);
  });
});

describe('the account-linking attack before and after the mitigation', () => {
  test('before (deployed 4f17b91 callback): the attacker receives the victim’s calendar', async () => {
    const w = world();
    const live = w.handler(oauthBefore);
    const started = (await post(live, 'account-attacker')).body;
    await get(live, w.consent(started.authorizationUrl, 'victim-google'));
    const stolen = w.tables.external_calendar_connections.find((c) => c.user_id === 'account-attacker');
    assert.ok(stolen);
    assert.equal(stolen.refresh_token_ciphertext, 'sealed:rt-victim-google');
  });

  test('after: an authorization started BEFORE deployment cannot be completed, and a new one cannot start', async () => {
    const w = world();
    const started = (await post(w.handler(oauthBefore), 'account-attacker')).body;
    const callbackUrl = w.consent(started.authorizationUrl, 'victim-google');
    const paused = w.handler(mitigation, { trapStorage: true });
    const back = await get(paused, callbackUrl);
    assert.equal(back.params.get('detail'), 'connect_paused');
    assert.equal(w.tables.external_calendar_connections.length, 0, 'no credential written');
    assert.equal(w.fetches.includes('https://oauth2.googleapis.com/token'), false, 'Google’s code was never exchanged');
    assert.equal((await post(paused, 'account-attacker')).status, 503);
  });
});

describe('existing connections, read-only sync and disconnect are untouched (calendar-data is not redeployed)', () => {
  const seed = (w, user) => w.tables.external_calendar_connections.push({
    id: `conn-${user}`, user_id: user, provider: 'google', provider_account_id: `${user}-g-primary`, scopes: [],
    refresh_token_ciphertext: `sealed:rt-${user}-g`, refresh_token_iv: 'iv', selected_calendar_ids: [`${user}-g-primary`], status: 'connected',
    connected_at: 'then', updated_at: 'then', last_sync_at: null,
  });
  const call = async (fn, account, action, extra = {}) => post(fn, account, { action, ...extra });

  test('with the mitigation live, an existing connection still reports, lists calendars and reads events', async () => {
    const w = world();
    seed(w, 'account-a');
    w.handler(mitigation, { trapStorage: true });
    const data = w.handler(dataBefore);
    const status = await call(data, 'account-a', 'status');
    assert.equal(status.body.connection.connected, true);
    const listed = await call(data, 'account-a', 'listCalendars');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.calendars[0].id, 'account-a-g-primary');
  });

  test('with the mitigation live, she can still disconnect: the stored credential is removed', async () => {
    const w = world();
    seed(w, 'account-a');
    seed(w, 'account-b');
    w.handler(mitigation, { trapStorage: true });
    const data = w.handler(dataBefore);
    const r = await call(data, 'account-a', 'disconnect');
    assert.equal(r.status, 200);
    assert.deepEqual(w.tables.external_calendar_connections.map((c) => c.user_id), ['account-b'], 'only her row is removed');
  });
});

describe('shipped app builds degrade quietly', () => {
  test('the 4f17b91 bridge (the shipped one) turns an unavailable start into the dormant state without opening a browser', () => {
    const bridge = execFileSync('git', ['show', `${BEFORE}:src/features/calendar/useGoogleCalendarBridge.ts`], { encoding: 'utf8' });
    assert.match(bridge, /const result = await externalIntelligenceClient\.beginCalendarConnection\(\);\s*if \(result\.kind !== 'ready'\) \{\s*setAvailability\(result\.kind === 'unavailable' \? 'dormant' : 'error'\);/);
    assert.ok(bridge.indexOf('beginCalendarConnection') < bridge.indexOf('openAuthSessionAsync'), 'the browser opens only after a ready start');
    const client = execFileSync('git', ['show', `${BEFORE}:src/platform/externalIntelligenceClient.ts`], { encoding: 'utf8' });
    assert.match(client, /if \(error\) \{[\s\S]*?return \{ kind: 'unavailable', reason, detail: error\.message \};/, 'a 503 is reported as unavailable, not as unauthorized');
  });
});
