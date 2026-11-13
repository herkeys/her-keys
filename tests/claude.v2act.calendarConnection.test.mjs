import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';

/*
 * HK-V2ACT-CAL-01/02/04: Google Calendar connection lifecycle.
 *
 * Server: the SHIPPING Deno handlers are executed with only storage, crypto, auth and network replaced (same technique as
 * tests/aiConsentHandler.test.mjs). These are deterministic handler tests, not evidence of live Google delivery.
 * Client: the real bridge hook and panel, with the account and provider modules replaced by controllable ports.
 */

// ---------------------------------------------------------------------------------------------------------------------------------
// Server: calendar-data
// ---------------------------------------------------------------------------------------------------------------------------------

const load = (path) => stripTypeScriptTypes(readFileSync(path, 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, ''));
const calendarDataSource = load('supabase/functions/calendar-data/index.ts');
const calendarOauthSource = load('supabase/functions/calendar-oauth/index.ts');

function storage({ rows = [], deleteError = null } = {}) {
  const ops = [];
  const from = (table) => {
    const op = { table, kind: 'select', filters: [], values: null };
    const q = {
      select: () => q,
      delete: () => { op.kind = 'delete'; return q; },
      update: (values) => { op.kind = 'update'; op.values = values; return q; },
      insert: (values) => { op.kind = 'insert'; op.values = values; ops.push(op); return Promise.resolve({ error: null }); },
      upsert: (values) => { op.kind = 'upsert'; op.values = values; ops.push(op); return Promise.resolve({ error: null }); },
      eq: (k, v) => { op.filters.push(['eq', k, v]); return q; },
      lt: (k, v) => { op.filters.push(['lt', k, v]); return q; },
      maybeSingle: async () => {
        ops.push(op);
        const match = rows.find((row) => row.table === table && op.filters.every(([, k, v]) => row[k] === v));
        return { data: match ?? null, error: null };
      },
      then: (resolve, reject) => {
        ops.push(op);
        if (op.kind === 'delete') {
          if (!deleteError) {
            for (let i = rows.length - 1; i >= 0; i -= 1) {
              if (rows[i].table === table && op.filters.every(([, k, v]) => rows[i][k] === v)) rows.splice(i, 1);
            }
          }
          return Promise.resolve({ error: op.kind === 'delete' ? deleteError : null }).then(resolve, reject);
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return { ops, rows, client: { from } };
}

const connectionRow = (status, user = 'account-a') => ({
  table: 'external_calendar_connections', id: `conn-${user}`, user_id: user, provider: 'google', provider_account_id: 'primary',
  scopes: [], refresh_token_ciphertext: 'cipher', refresh_token_iv: 'iv', selected_calendar_ids: ['primary'], status,
  connected_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', last_sync_at: null,
});

function calendarData({ rows = [], deleteError = null, revoke = async () => new Response('', { status: 200 }), decrypt = async () => 'refresh-token', user = 'account-a', authorized = true } = {}) {
  let handler;
  const store = storage({ rows, deleteError });
  const fetches = [];
  class AuthError extends Error {}
  class ReauthErrorShadow extends Error {}
  const sandbox = {
    AuthError, ReauthErrorShadow, Response, Request, URL, URLSearchParams, AbortSignal, Promise, Set, Array, Date, JSON, Number,
    console: { error() {} },
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response('ok'),
    requireUser: async () => { if (!authorized) throw new AuthError('invalid'); return { id: user }; },
    adminClient: () => store.client,
    decryptSecret: (...args) => decrypt(...args),
    Deno: { env: { get: () => 'configured' }, serve: (fn) => { handler = fn; } },
    fetch: async (url, init) => {
      fetches.push(String(url));
      if (String(url).includes('/revoke')) return revoke(url, init);
      if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      throw new Error(`unexpected fetch ${url}`);
    },
  };
  runInNewContext(calendarDataSource, sandbox);
  return {
    store, fetches,
    async call(action) {
      const res = await handler(new Request('https://synthetic.invalid/calendar-data', { method: 'POST', body: JSON.stringify({ action }) }));
      return { status: res.status, body: await res.json() };
    },
  };
}

describe('calendar-data disconnect (HK-V2ACT-CAL-02)', () => {
  for (const status of ['connected', 'reauth_required', 'revoked']) {
    test(`a ${status} connection is removed and reported disconnected`, async () => {
      const h = calendarData({ rows: [connectionRow(status)] });
      const result = await h.call('disconnect');
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.connection, { connected: false, state: 'disconnected' });
      assert.equal(h.store.rows.length, 0, 'the stored credential row is gone');
      const del = h.store.ops.find((op) => op.kind === 'delete');
      assert.deepEqual(del.filters, [['eq', 'id', 'conn-account-a'], ['eq', 'user_id', 'account-a']], 'deletion is scoped to the caller');
    });
  }

  test('revocation failure or an undecryptable credential never keeps the row', async () => {
    for (const opts of [
      { revoke: async () => { throw new Error('google unreachable'); } },
      { decrypt: async () => { throw new Error('bad key'); } },
    ]) {
      const h = calendarData({ rows: [connectionRow('reauth_required')], ...opts });
      const result = await h.call('disconnect');
      assert.equal(result.status, 200);
      assert.equal(h.store.rows.length, 0);
    }
  });

  test('disconnecting with no stored connection is already done (idempotent, 200)', async () => {
    const h = calendarData();
    const result = await h.call('disconnect');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.connection, { connected: false, state: 'disconnected' });
    assert.deepEqual(h.fetches, []);
  });

  test("another account's connection is neither read nor removed", async () => {
    const h = calendarData({ rows: [connectionRow('connected', 'account-b')], user: 'account-a' });
    const result = await h.call('disconnect');
    assert.equal(result.status, 200);
    assert.equal(h.store.rows.length, 1, "account-b's row is untouched");
    assert.equal(h.store.ops.some((op) => op.kind === 'delete'), false);
  });

  test('a failed deletion is reported as a failure, never as disconnected', async () => {
    const h = calendarData({ rows: [connectionRow('connected')], deleteError: { code: 'db_down' } });
    const result = await h.call('disconnect');
    assert.equal(result.status, 500);
    assert.notEqual(result.body.connection?.state, 'disconnected');
  });

  test('negative control: reading calendars from a lapsed connection still answers reauth_required (409)', async () => {
    const h = calendarData({ rows: [connectionRow('reauth_required')] });
    const result = await h.call('listCalendars');
    assert.equal(result.status, 409);
    assert.equal(result.body.connection.state, 'reauth_required');
    assert.equal(h.store.rows.length, 1);
  });

  test('an unauthenticated caller is refused before any storage access', async () => {
    const h = calendarData({ rows: [connectionRow('connected')], authorized: false });
    const result = await h.call('disconnect');
    assert.equal(result.status, 401);
    assert.equal(h.store.ops.length, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Server: calendar-oauth callback (HK-V2ACT-CAL-04)
// ---------------------------------------------------------------------------------------------------------------------------------

function calendarOauth({ restricted = false, authorized = true } = {}) {
  let handler;
  class AuthError extends Error {}
  const store = storage({ rows: [{ table: 'calendar_oauth_states', state_hash: 'hash:synthetic-state-0123456789abcdef', user_id: 'account-a', code_verifier: 'v', redirect_uri: 'https://x', expires_at: '2999-01-01T00:00:00.000Z', completion_hash: null }] });
  const sandbox = {
    AuthError, Response, Request, URL, URLSearchParams, AbortSignal, Promise, Set, Array, Date, JSON,
    console: { error() {} },
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response('ok'),
    requireUser: async () => { if (!authorized) throw new AuthError('invalid'); return { id: 'account-a' }; },
    assertAccountActive: async () => { if (restricted) throw new AuthError('restricted'); },
    adminClient: () => store.client,
    sha256Base64Url: async (value) => `hash:${value}`,
    randomUrlSafe: () => 'random',
    encryptSecret: async () => ({ ciphertext: 'c', iv: 'i' }),
    Deno: { env: { get: (key) => (key === 'HERKEYS_CALENDAR_APP_REDIRECT_URI' ? undefined : 'configured') }, serve: (fn) => { handler = fn; } },
    fetch: async () => { throw new Error('no network in this test'); },
  };
  runInNewContext(calendarOauthSource, sandbox);
  return { store, handler: (req) => handler(req) };
}

describe('calendar-oauth callback failures return to the app (HK-V2ACT-CAL-04)', () => {
  test('a restricted account completing Google consent is redirected to the app, not left on a JSON page', async () => {
    const h = calendarOauth({ restricted: true });
    const res = await h.handler(new Request('https://synthetic.invalid/calendar-oauth?code=c&state=synthetic-state-0123456789abcdef'));
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('Location'));
    assert.equal(location.protocol, 'herkeys:');
    assert.equal(location.searchParams.get('status'), 'error');
    assert.equal(location.searchParams.get('detail'), 'account_restricted');
    assert.equal(h.store.ops.some((op) => op.kind === 'upsert'), false, 'no connection is stored');
  });

  test('negative control: an unauthenticated POST to begin consent is still a 401', async () => {
    const h = calendarOauth({ authorized: false });
    const res = await h.handler(new Request('https://synthetic.invalid/calendar-oauth', { method: 'POST', body: '{}' }));
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Client: the bridge hook and panel (HK-V2ACT-CAL-01 / CAL-02)
// ---------------------------------------------------------------------------------------------------------------------------------

const ports = new URL('./support/v2actCalendarPorts.mjs', import.meta.url).href;
const rnWithAlert = new URL('./hk-f01f13/support/rn-with-alert.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (/(^|\/)(AccountProvider|accountRuntimeInstance)$/.test(specifier) || specifier === 'expo-web-browser') return next(ports, context);
    if (specifier === 'react-native' && /src[\\/]features[\\/]calendar[\\/]GoogleCalendarPanel/.test(context.parentURL ?? '')) return next(rnWithAlert, context);
    return next(specifier, context);
  },
});
const { calendarFixture } = await import('./support/v2actCalendarPorts.mjs');
const { useGoogleCalendarBridge } = await import('../src/features/calendar/useGoogleCalendarBridge.ts');
const { GoogleCalendarPanel } = await import('../src/features/calendar/GoogleCalendarPanel.tsx');
const { Alert } = await import('./hk-f01f13/support/rn-with-alert.mjs');

const bound = (accountId) => ({ state: { kind: 'accountBound', session: { accountId }, householdId: `household-${accountId}` } });
const event = (id) => ({ sourceCalendarId: 'primary', sourceEventId: id, sourceCalendarSummary: 'Primary', title: id, startsAt: null, startDate: '2026-11-13', readOnly: true });
const flush = () => TestRenderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });

let latest;
function Probe({ date }) {
  latest = useGoogleCalendarBridge(date, 'UTC', true);
  return null;
}

const mounted = [];
afterEach(async () => {
  for (const r of mounted.splice(0)) await TestRenderer.act(() => r.unmount());
  calendarFixture.reset();
  Alert.calls.length = 0;
  latest = undefined;
});
const mount = async (el) => { const r = await render(el); mounted.push(r); return r; };
const settle = async (name, value) => { calendarFixture.answer(name, value); await flush(); };
const connected = { kind: 'ready', value: { connected: true, state: 'connected', selectedCalendarIds: ['primary'] } };
const calendars = { kind: 'ready', value: { calendars: [{ id: 'primary', summary: 'Primary' }], selectedCalendarIds: ['primary'] } };

describe('bridge: answers apply only to the request that is still current (HK-V2ACT-CAL-01)', () => {
  test("a slow answer for the previous day never replaces the newer day's events", async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<Probe date="2026-11-13" />);
    await settle('calendarStatus', connected);
    await settle('listCalendars', calendars);
    // Day 1's events are now in flight. She moves to day 2 before they arrive.
    await TestRenderer.act(() => r.update(<Probe date="2026-11-14" />));
    await settle('calendarStatus', connected);
    await settle('listCalendars', calendars);
    // Day 2 answers first, then day 1's late answer arrives.
    calendarFixture.answerWhere('calendarEvents', ([min]) => min.startsWith('2026-11-14'), { kind: 'ready', value: { events: [event('day-2')], syncedAt: 'now' } });
    await flush();
    calendarFixture.answerWhere('calendarEvents', ([min]) => min.startsWith('2026-11-13'), { kind: 'ready', value: { events: [event('day-1')], syncedAt: 'then' } });
    await flush();
    assert.deepEqual(latest.events.map((e) => e.sourceEventId), ['day-2']);
    assert.equal(latest.availability, 'connected');
  });

  test("changing day clears the previous day's events while the new day loads", async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<Probe date="2026-11-13" />);
    await settle('calendarStatus', connected);
    await settle('listCalendars', calendars);
    await settle('calendarEvents', { kind: 'ready', value: { events: [event('day-1')], syncedAt: 'now' } });
    assert.deepEqual(latest.events.map((e) => e.sourceEventId), ['day-1']);
    await TestRenderer.act(() => r.update(<Probe date="2026-11-14" />));
    assert.deepEqual(latest.events, []);
    assert.equal(latest.availability, 'checking');
  });

  test('a disconnect supersedes a load still in flight: removed calendars are not reinstated', async () => {
    calendarFixture.account = bound('a');
    await mount(<Probe date="2026-11-13" />);
    await settle('calendarStatus', connected);
    // listCalendars is in flight when she disconnects.
    let disconnecting;
    await TestRenderer.act(async () => { disconnecting = latest.disconnect(); });
    calendarFixture.answer('disconnectCalendar', { kind: 'ready', value: { connected: false, state: 'disconnected' } });
    await TestRenderer.act(async () => { await disconnecting; });
    calendarFixture.answer('listCalendars', calendars);
    await flush();
    assert.equal(latest.availability, 'disconnected');
    assert.deepEqual(latest.calendars, []);
    assert.equal(calendarFixture.calls.some((c) => c.name === 'calendarEvents'), false, 'the stale load stopped');
  });

  test('a different account reloads instead of keeping the previous account’s calendars', async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<Probe date="2026-11-13" />);
    await settle('calendarStatus', connected);
    await settle('listCalendars', calendars);
    await settle('calendarEvents', { kind: 'ready', value: { events: [event('a-event')], syncedAt: 'now' } });
    calendarFixture.account = bound('b');
    await TestRenderer.act(() => r.update(<Probe date="2026-11-13" />));
    assert.deepEqual(latest.events, [], "account a's events are gone immediately");
    assert.deepEqual(latest.calendars, []);
    assert.equal(calendarFixture.calls.filter((c) => c.name === 'calendarStatus').length, 2, 'account b is asked afresh');
  });

  test('signed out: dormant, no provider call, nothing retained', async () => {
    calendarFixture.account = { state: { kind: 'unauthenticated' } };
    await mount(<Probe date="2026-11-13" />);
    await flush();
    assert.equal(latest.availability, 'dormant');
    assert.equal(calendarFixture.calls.length, 0);
  });
});

describe('panel: a connection needing re-authorization can be removed (HK-V2ACT-CAL-02)', () => {
  const texts = (r) => r.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
  const buttons = (r) => r.root.findAll((n) => typeof n.props?.label === 'string' && typeof n.props?.onPress === 'function');

  test('reauth_required offers Reconnect AND a confirmed Disconnect that removes the connection', async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<GoogleCalendarPanel selectedDate="2026-11-13" timezone="UTC" showEvents />);
    await settle('calendarStatus', { kind: 'ready', value: { connected: false, state: 'reauth_required', selectedCalendarIds: ['primary'] } });
    const labels = buttons(r).map((b) => b.props.label);
    assert.ok(labels.includes('Reconnect'));
    assert.ok(labels.includes('Disconnect'));
    await TestRenderer.act(async () => { buttons(r).find((b) => b.props.label === 'Disconnect').props.onPress(); });
    assert.equal(Alert.calls.length, 1, 'the destructive action is confirmed first');
    assert.equal(calendarFixture.calls.some((c) => c.name === 'disconnectCalendar'), false, 'nothing happens before confirmation');
    const destructive = Alert.calls[0][2].find((b) => b.style === 'destructive');
    await TestRenderer.act(async () => { destructive.onPress(); });
    await settle('disconnectCalendar', { kind: 'ready', value: { connected: false, state: 'disconnected' } });
    assert.ok(texts(r).includes('Connect Google Calendar'));
    assert.equal(buttons(r).some((b) => b.props.label === 'Disconnect'), false);
  });

  test('a failed removal says so and keeps the reconnect state', async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<GoogleCalendarPanel selectedDate="2026-11-13" timezone="UTC" showEvents />);
    await settle('calendarStatus', { kind: 'ready', value: { connected: false, state: 'reauth_required', selectedCalendarIds: [] } });
    await TestRenderer.act(async () => { buttons(r).find((b) => b.props.label === 'Disconnect').props.onPress(); });
    await TestRenderer.act(async () => { Alert.calls[0][2].find((b) => b.style === 'destructive').onPress(); });
    await settle('disconnectCalendar', { kind: 'unavailable', reason: 'network_unavailable' });
    assert.ok(texts(r).includes('Google Calendar could not be disconnected. Try again.'));
    assert.ok(texts(r).includes('Reconnect Google Calendar'));
  });

  test('negative control: a never-connected account sees Connect only, no Disconnect', async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<GoogleCalendarPanel selectedDate="2026-11-13" timezone="UTC" showEvents />);
    await settle('calendarStatus', { kind: 'ready', value: { connected: false, state: 'disconnected', selectedCalendarIds: [] } });
    const labels = buttons(r).map((b) => b.props.label);
    assert.deepEqual(labels, ['Connect Google Calendar']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Client: authenticated completion (HK-V2ACT-CAL-03)
// ---------------------------------------------------------------------------------------------------------------------------------

const { completionHandleOf } = await import('../src/features/calendar/useGoogleCalendarBridge.ts');
const HANDLE = 'A'.repeat(21) + '_-' + 'b'.repeat(20);

describe('completion handle parsing (HK-V2ACT-CAL-03)', () => {
  test('only the exact Calendar return with status=authorized and a well-formed handle yields a handle', () => {
    assert.equal(HANDLE.length, 43);
    assert.equal(completionHandleOf(`herkeys://calendar-connected?status=authorized&handle=${HANDLE}`), HANDLE);
    // The form the DEPLOYED callback actually emits (observed 2026-11-13: `herkeys://calendar-connected/?status=...`).
    assert.equal(completionHandleOf(`herkeys://calendar-connected/?status=authorized&handle=${HANDLE}`), HANDLE);
    for (const url of [
      undefined, '',
      `herkeys://calendar-connected?status=connected&handle=${HANDLE}`,
      `herkeys://calendar-connected?status=error&detail=invalid_state`,
      `herkeys://calendar-connected?status=authorized`,
      `herkeys://calendar-connected?status=authorized&handle=${HANDLE}x`,
      `herkeys://calendar-connected?status=authorized&handle=${HANDLE}&handle=${HANDLE}`,
      `herkeys://calendar-connected?status=authorized&status=authorized&handle=${HANDLE}`,
      `herkeys://calendar-connectedX?status=authorized&handle=${HANDLE}`,
      `herkeys://auth/callback?status=authorized&handle=${HANDLE}`,
      `/calendar-connected?status=authorized&handle=${HANDLE}`,
      `https://evil.example/calendar-connected?status=authorized&handle=${HANDLE}`,
      `herkeys://calendar-connected?status=authorized&handle=${HANDLE}&pad=${'x'.repeat(1100)}`,
    ]) assert.equal(completionHandleOf(url), null, String(url));
  });
});

describe('bridge: Connect redeems the handle only for the account that started it (HK-V2ACT-CAL-03)', () => {
  const disconnected = { kind: 'ready', value: { connected: false, state: 'disconnected', selectedCalendarIds: [] } };
  const begun = { kind: 'ready', value: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirectUri: 'r', scopes: [] } };
  const start = async () => {
    calendarFixture.account = bound('a');
    const r = await mount(<Probe date="2026-11-13" />);
    await settle('calendarStatus', disconnected);
    let connecting;
    await TestRenderer.act(async () => { connecting = latest.connect(); });
    calendarFixture.answer('beginCalendarConnection', begun);
    await flush();
    return { r, connecting };
  };

  test('authorized: the handle is redeemed as the same account, then the panel reloads from the server', async () => {
    calendarFixture.browser = async () => ({ type: 'success', url: `herkeys://calendar-connected?status=authorized&handle=${HANDLE}` });
    const { connecting } = await start();
    const redeem = calendarFixture.calls.find((c) => c.name === 'completeCalendarConnection');
    assert.deepEqual(redeem.args, [HANDLE]);
    calendarFixture.answer('completeCalendarConnection', { kind: 'ready', value: { connected: true, state: 'connected', selectedCalendarIds: ['primary'] } });
    await flush();
    calendarFixture.answer('calendarStatus', connected);
    await flush();
    calendarFixture.answer('listCalendars', calendars);
    await flush();
    calendarFixture.answer('calendarEvents', { kind: 'ready', value: { events: [], syncedAt: 'now' } });
    await TestRenderer.act(async () => { await connecting; });
    assert.equal(latest.availability, 'connected');
  });

  test('the account changed while Google consent was open: nothing is redeemed', async () => {
    let finishConsent;
    calendarFixture.browser = () => new Promise((resolve) => { finishConsent = resolve; });
    const { r, connecting } = await start();
    // Another account becomes current (and renders) while the system browser is still open.
    calendarFixture.account = bound('b');
    await TestRenderer.act(() => r.update(<Probe date="2026-11-13" />));
    await TestRenderer.act(async () => { finishConsent({ type: 'success', url: `herkeys://calendar-connected?status=authorized&handle=${HANDLE}` }); await connecting; });
    assert.equal(calendarFixture.calls.some((c) => c.name === 'completeCalendarConnection'), false);
  });

  test('cancelled, dismissed or error returns redeem nothing', async () => {
    for (const result of [{ type: 'cancel' }, { type: 'dismiss' }, { type: 'success', url: 'herkeys://calendar-connected?status=cancelled&detail=access_denied' }, { type: 'success', url: 'herkeys://calendar-connected?status=error&detail=invalid_state' }]) {
      calendarFixture.reset();
      calendarFixture.browser = async () => result;
      const { connecting } = await start();
      if (result.type === 'success') { await flush(); if (calendarFixture.pending.some((p) => p.name === 'calendarStatus')) calendarFixture.answer('calendarStatus', disconnected); }
      await TestRenderer.act(async () => { await connecting; });
      assert.equal(calendarFixture.calls.some((c) => c.name === 'completeCalendarConnection'), false, JSON.stringify(result));
      for (const m of mounted.splice(0)) await TestRenderer.act(() => m.unmount());
    }
  });

  test('a refused redemption is shown as an error, never as connected', async () => {
    calendarFixture.browser = async () => ({ type: 'success', url: `herkeys://calendar-connected?status=authorized&handle=${HANDLE}` });
    const { connecting } = await start();
    calendarFixture.answer('completeCalendarConnection', { kind: 'unavailable', reason: 'function_unavailable' });
    await TestRenderer.act(async () => { await connecting; });
    assert.equal(latest.availability, 'error');
    assert.equal(calendarFixture.calls.filter((c) => c.name === 'calendarStatus').length, 1, 'no reload pretends it connected');
  });
});
