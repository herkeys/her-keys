import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';

/*
 * HK-V2ACT-CAL-03 — Google Calendar account-linking CSRF.
 *
 * The SHIPPING calendar-oauth handler is executed in a VM against a simulated Google that enforces PKCE (S256), the registered redirect
 * URI and single-use authorization codes, and against an in-memory copy of the two service-only tables. Only storage, crypto key
 * material, auth and network are replaced. The PREVIOUS handler (807de59, the last version before this repair) is run through the same
 * attack to demonstrate the vulnerability this repair closes. Deterministic handler evidence; not live Google evidence.
 */

const PREVIOUS = '807de591ab36f751ace846a2f2940e56cd2eb9f6';
const strip = (source) => stripTypeScriptTypes(source.replace(/^import [\s\S]*?;\r?\n/gm, ''));
const currentSource = strip(readFileSync('supabase/functions/calendar-oauth/index.ts', 'utf8'));
const previousSource = strip(execFileSync('git', ['show', `${PREVIOUS}:supabase/functions/calendar-oauth/index.ts`], { encoding: 'utf8' }));

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sha = (value) => b64url(createHash('sha256').update(value).digest());
const CALLBACK = 'https://synthetic.supabase.invalid/functions/v1/calendar-oauth';

/** In-memory PostgREST subset over named tables, with atomic delete/update + select returning, as PostgREST does. */
function database() {
  const tables = { calendar_oauth_states: [], external_calendar_connections: [] };
  const from = (table) => {
    const op = { kind: 'select', filters: [], values: null, returning: false };
    const match = (row) => op.filters.every(([type, k, v]) => (type === 'eq' ? row[k] === v : type === 'is' ? (row[k] ?? null) === v : type === 'lt' ? row[k] < v : true));
    const run = () => {
      const rows = tables[table];
      if (op.kind === 'delete') {
        const removed = rows.filter(match);
        tables[table] = rows.filter((row) => !match(row));
        return { data: op.returning ? removed.map((r) => ({ ...r })) : null, error: null };
      }
      if (op.kind === 'update') {
        const changed = rows.filter(match);
        for (const row of changed) Object.assign(row, op.values);
        return { data: op.returning ? changed.map((r) => ({ ...r })) : null, error: null };
      }
      if (op.kind === 'insert') {
        rows.push({ completion_hash: null, authorization_code_ciphertext: null, authorization_code_iv: null, completion_expires_at: null, ...op.values });
        return { data: null, error: null };
      }
      if (op.kind === 'upsert') {
        const existing = rows.find((r) => r.user_id === op.values.user_id && r.provider === op.values.provider);
        if (existing) Object.assign(existing, op.values); else rows.push({ id: `conn-${op.values.user_id}`, ...op.values });
        return { data: null, error: null };
      }
      return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => { if (op.kind !== 'select') op.returning = true; return q; },
      delete: () => { op.kind = 'delete'; return q; },
      update: (values) => { op.kind = 'update'; op.values = values; return q; },
      insert: (values) => { op.kind = 'insert'; op.values = values; return Promise.resolve(run()); },
      upsert: (values) => { op.kind = 'upsert'; op.values = values; return Promise.resolve(run()); },
      eq: (k, v) => { op.filters.push(['eq', k, v]); return q; },
      is: (k, v) => { op.filters.push(['is', k, v]); return q; },
      lt: (k, v) => { op.filters.push(['lt', k, v]); return q; },
      maybeSingle: async () => { const { data } = run(); return { data: data[0] ?? null, error: null }; },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  };
  return { tables, client: { from } };
}

/** A Google that issues single-use codes bound to the consenting Google user, the PKCE challenge and the redirect URI. */
function google() {
  const codes = new Map();
  const log = [];
  return {
    log,
    /** A person signed in to Google as `googleUser` approves consent on `authorizationUrl`; returns the browser's callback URL. */
    consent(authorizationUrl, googleUser) {
      const url = new URL(authorizationUrl);
      const code = `code-${googleUser}-${randomBytes(6).toString('hex')}`;
      codes.set(code, { googleUser, challenge: url.searchParams.get('code_challenge'), redirectUri: url.searchParams.get('redirect_uri'), used: false });
      return `${url.searchParams.get('redirect_uri')}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(url.searchParams.get('state'))}`;
    },
    async fetch(input, init) {
      const url = String(input);
      log.push(url);
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(String(init.body));
        const grant = codes.get(body.get('code'));
        if (!grant || grant.used || sha(body.get('code_verifier')) !== grant.challenge || body.get('redirect_uri') !== grant.redirectUri) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        grant.used = true;
        return Response.json({ access_token: `at-${grant.googleUser}`, refresh_token: `rt-${grant.googleUser}` });
      }
      if (url.startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList')) {
        const who = String(init.headers.Authorization).replace('Bearer at-', '');
        return Response.json({ items: [{ id: `${who}-primary`, primary: true }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  };
}

function world(source = currentSource, { restricted = new Set() } = {}) {
  let handler;
  let now = Date.parse('2026-11-13T12:00:00.000Z');
  const db = database();
  const g = google();
  class AuthError extends Error {}
  const sandbox = {
    AuthError, Response, Request, URL, URLSearchParams, AbortSignal, Promise, Set, Map, Array, JSON, Number, Boolean, Object,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    console: { error() {} },
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response('ok'),
    requireUser: async (req) => {
      const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      if (!token) throw new AuthError('missing');
      if (restricted.has(token)) throw new AuthError('restricted');
      return { id: token };
    },
    assertAccountActive: async (id) => { if (restricted.has(id)) throw new AuthError('restricted'); },
    adminClient: () => db.client,
    sha256Base64Url: async (value) => sha(value),
    randomUrlSafe: (bytes = 32) => b64url(randomBytes(bytes)),
    // Opaque server-side sealing; the key never leaves the server in production.
    encryptSecret: async (value) => ({ ciphertext: `sealed:${Buffer.from(value).toString('base64')}`, iv: 'iv' }),
    decryptSecret: async (ciphertext) => Buffer.from(String(ciphertext).replace('sealed:', ''), 'base64').toString(),
    Deno: { env: { get: (key) => (key === 'HERKEYS_CALENDAR_APP_REDIRECT_URI' ? undefined : 'configured') }, serve: (fn) => { handler = fn; } },
    fetch: (input, init) => g.fetch(input, init),
  };
  runInNewContext(source, sandbox);
  const post = async (account, body) => {
    const headers = account ? { Authorization: `Bearer ${account}` } : {};
    const res = await handler(new Request(CALLBACK, { method: 'POST', headers, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return {
    db, g,
    advance: (ms) => { now += ms; },
    begin: async (account) => (await post(account, {})).body,
    complete: (account, handle) => post(account, { action: 'complete', handle }),
    async callback(url) {
      const res = await handler(new Request(url));
      const location = res.headers.get('Location');
      const target = location ? new URL(location) : null;
      return { status: res.status, location, status_: target?.searchParams.get('status') ?? null, detail: target?.searchParams.get('detail') ?? null, handle: target?.searchParams.get('handle') ?? null };
    },
    connections: () => db.tables.external_calendar_connections,
    tokenExchanges: () => g.log.filter((u) => u === 'https://oauth2.googleapis.com/token').length,
  };
}

const ATTACKER = 'account-attacker';
const VICTIM = 'account-victim';

describe('the vulnerability on the previous implementation (807de59)', () => {
  test('an attacker who starts consent and gets a victim to finish it receives the victim’s Google Calendar', async () => {
    const w = world(previousSource);
    const started = await w.begin(ATTACKER);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    assert.equal(back.status_, 'connected');
    const stolen = w.connections().find((c) => c.user_id === ATTACKER);
    assert.ok(stolen, 'the previous callback stored a connection on the account that STARTED consent, with no Her Keys session');
    assert.match(stolen.refresh_token_ciphertext, /^sealed:/);
    assert.equal(Buffer.from(stolen.refresh_token_ciphertext.replace('sealed:', ''), 'base64').toString(), 'rt-victim-google');
  });
});

describe('HK-V2ACT-CAL-03: consent completes only for the signed-in account that started it', () => {
  test('the same attack now stores nothing, exchanges nothing, and the victim’s own app cannot complete it either', async () => {
    const w = world();
    const started = await w.begin(ATTACKER);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    assert.equal(back.status, 302);
    assert.equal(back.status_, 'authorized');
    assert.equal(w.connections().length, 0, 'nothing is stored by a browser with no Her Keys session');
    assert.equal(w.tokenExchanges(), 0, 'Google’s code is not exchanged at the callback');
    // The redirect lands on the victim's device. Her app, signed in as herself, tries to finish it: refused, and the handle is burned.
    const victimTry = await w.complete(VICTIM, back.handle);
    assert.equal(victimTry.status, 403);
    assert.equal(victimTry.body.reason, 'account_mismatch');
    // Even if the attacker later obtains the handle, it no longer exists.
    const attackerTry = await w.complete(ATTACKER, back.handle);
    assert.equal(attackerTry.status, 409);
    assert.equal(w.connections().length, 0);
    assert.equal(w.tokenExchanges(), 0);
    assert.equal(w.db.tables.calendar_oauth_states.length, 0, 'the authorization is gone, not waiting to be retried');
  });

  test('the legitimate flow: the account that started consent redeems once and is connected', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    const done = await w.complete(VICTIM, back.handle);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body, { status: 'ready', connection: { connected: true, state: 'connected', selectedCalendarIds: ['victim-google-primary'] } });
    assert.equal(w.connections().length, 1);
    assert.equal(w.connections()[0].user_id, VICTIM);
    assert.equal(w.tokenExchanges(), 1);
  });

  test('no Google code, PKCE verifier or token ever reaches the app (redirect or JSON)', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const callbackUrl = w.g.consent(started.authorizationUrl, 'victim-google');
    const code = new URL(callbackUrl).searchParams.get('code');
    const back = await w.callback(callbackUrl);
    const done = await w.complete(VICTIM, back.handle);
    const verifier = w.db.tables.calendar_oauth_states[0]?.code_verifier;
    const seen = [back.location, JSON.stringify(done.body), JSON.stringify(started)].join(' ');
    assert.equal(seen.includes(code), false, 'authorization code');
    assert.doesNotMatch(seen, /rt-victim-google|at-victim-google/, 'Google tokens');
    if (verifier) assert.equal(seen.includes(verifier), false, 'PKCE verifier');
    assert.match(back.handle, /^[A-Za-z0-9_-]{43}$/, 'an unpredictable 256-bit handle');
    const stored = w.db.tables.calendar_oauth_states;
    assert.equal(stored.length, 0);
  });

  test('the pending authorization is stored only as a hash of the handle and a sealed code', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const callbackUrl = w.g.consent(started.authorizationUrl, 'victim-google');
    const code = new URL(callbackUrl).searchParams.get('code');
    const back = await w.callback(callbackUrl);
    const [row] = w.db.tables.calendar_oauth_states;
    assert.equal(row.completion_hash, sha(back.handle));
    assert.notEqual(row.completion_hash, back.handle);
    assert.equal(JSON.stringify(row).includes(code), false, 'the code is stored sealed, never in the clear');
    assert.equal(Date.parse(row.completion_expires_at) - Date.parse('2026-11-13T12:00:00.000Z'), 5 * 60_000);
  });

  test('replay: a handle redeems once; a replayed Google callback records nothing new', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const callbackUrl = w.g.consent(started.authorizationUrl, 'victim-google');
    const back = await w.callback(callbackUrl);
    const again = await w.callback(callbackUrl);
    assert.equal(again.status_, 'error');
    assert.equal(again.detail, 'invalid_state');
    assert.equal(again.handle, null);
    assert.equal((await w.complete(VICTIM, back.handle)).status, 200);
    const replay = await w.complete(VICTIM, back.handle);
    assert.equal(replay.status, 409);
    assert.equal(replay.body.reason, 'invalid_completion');
    assert.equal(w.tokenExchanges(), 1);
  });

  test('concurrent redemptions of one handle: exactly one succeeds', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    const results = await Promise.all([w.complete(VICTIM, back.handle), w.complete(VICTIM, back.handle)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(w.tokenExchanges(), 1);
  });

  test('expired: a handle older than five minutes is refused and consumed; an expired state is refused at the callback', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    w.advance(5 * 60_000 + 1);
    const late = await w.complete(VICTIM, back.handle);
    assert.equal(late.status, 409);
    assert.equal(late.body.reason, 'expired_completion');
    assert.equal(w.connections().length, 0);
    assert.equal(w.tokenExchanges(), 0);
    assert.equal(w.db.tables.calendar_oauth_states.length, 0);

    const w2 = world();
    const s2 = await w2.begin(VICTIM);
    const callbackUrl = w2.g.consent(s2.authorizationUrl, 'victim-google');
    w2.advance(10 * 60_000 + 1);
    const stale = await w2.callback(callbackUrl);
    assert.equal(stale.detail, 'expired_state');
    assert.equal(stale.handle, null);
  });

  test('account switching: starting again discards the earlier authorization; another account cannot redeem it', async () => {
    const w = world();
    const first = await w.begin(VICTIM);
    const firstBack = await w.callback(w.g.consent(first.authorizationUrl, 'victim-google'));
    await w.begin(VICTIM);
    assert.equal((await w.complete(VICTIM, firstBack.handle)).status, 409, 'an earlier authorization does not survive a new attempt');
    const second = await w.begin(VICTIM);
    const secondBack = await w.callback(w.g.consent(second.authorizationUrl, 'victim-google'));
    // The app switched to another account before finishing: refused, burned, nothing stored on either account.
    assert.equal((await w.complete('account-other', secondBack.handle)).status, 403);
    assert.equal((await w.complete(VICTIM, secondBack.handle)).status, 409);
    assert.equal(w.connections().length, 0);
  });

  test('incomplete or malformed authorizations are refused without touching Google', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const cancelled = await w.callback(`${CALLBACK}?error=access_denied&state=${new URL(started.authorizationUrl).searchParams.get('state')}`);
    assert.equal(cancelled.status_, 'cancelled');
    assert.equal(cancelled.handle, null);
    assert.equal((await w.callback(`${CALLBACK}?state=only`)).detail, 'missing_code_or_state');
    assert.equal((await w.callback(`${CALLBACK}?code=c&state=never-issued-state-value`)).detail, 'invalid_state');
    assert.equal((await w.complete(VICTIM, b64url(randomBytes(32)))).status, 409, 'a handle this server never issued');
    for (const bad of ['', 'short', 'x'.repeat(43) + '!', 'a'.repeat(44), 42]) {
      const r = await w.complete(VICTIM, bad);
      assert.equal(r.status, 400, String(bad));
      assert.equal(r.body.reason, 'invalid_completion');
    }
    assert.equal(w.tokenExchanges(), 0);
    assert.equal(w.connections().length, 0);
  });

  test('redemption requires a valid Her Keys session; a restricted account is refused at callback and at redemption', async () => {
    const restricted = new Set();
    const w = world(currentSource, { restricted });
    const started = await w.begin(VICTIM);
    const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
    assert.equal((await w.complete(null, back.handle)).status, 401);
    restricted.add(VICTIM);
    assert.equal((await w.complete(VICTIM, back.handle)).status, 401);
    assert.equal(w.connections().length, 0);

    const w2 = world(currentSource, { restricted });
    restricted.delete(VICTIM);
    const s2 = await w2.begin(VICTIM);
    const url2 = w2.g.consent(s2.authorizationUrl, 'victim-google');
    restricted.add(VICTIM);
    const refused = await w2.callback(url2);
    assert.equal(refused.status, 302);
    assert.equal(refused.detail, 'account_restricted');
    assert.equal(refused.handle, null);
  });

  test('a failed Google exchange stores nothing and the handle cannot be retried', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const callbackUrl = w.g.consent(started.authorizationUrl, 'victim-google');
    const back = await w.callback(callbackUrl);
    // Spend the code at Google first, so the server's exchange is refused (invalid_grant).
    const code = new URL(callbackUrl).searchParams.get('code');
    const verifier = w.db.tables.calendar_oauth_states[0].code_verifier;
    await w.g.fetch('https://oauth2.googleapis.com/token', { body: new URLSearchParams({ code, code_verifier: verifier, redirect_uri: CALLBACK }).toString() });
    const failed = await w.complete(VICTIM, back.handle);
    assert.equal(failed.status, 502);
    assert.equal(failed.body.reason, 'token_exchange_failed');
    assert.equal(w.connections().length, 0);
    assert.equal((await w.complete(VICTIM, back.handle)).status, 409);
  });

  test('reconnect keeps her earlier calendar choices that still exist', async () => {
    const w = world();
    for (let round = 0; round < 2; round += 1) {
      const started = await w.begin(VICTIM);
      const back = await w.callback(w.g.consent(started.authorizationUrl, 'victim-google'));
      assert.equal((await w.complete(VICTIM, back.handle)).status, 200);
    }
    assert.equal(w.connections().length, 1);
    // Arrays built inside the handler's VM realm: compare by value.
    assert.deepEqual(JSON.parse(JSON.stringify(w.connections()[0].selected_calendar_ids)), ['victim-google-primary']);
  });

  test('PKCE and the read-only scopes are unchanged in the authorization request', async () => {
    const w = world();
    const started = await w.begin(VICTIM);
    const url = new URL(started.authorizationUrl);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), sha(w.db.tables.calendar_oauth_states[0].code_verifier));
    assert.equal(url.searchParams.get('redirect_uri'), CALLBACK);
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly');
    assert.equal(JSON.stringify(started).includes(w.db.tables.calendar_oauth_states[0].code_verifier), false);
  });
});
