import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { AiConsentControl } from '../src/features/consent/AiConsentControl.tsx';
import { HER_KEYS_CONSENT_VERSIONS as V } from '../src/domain/consent.ts';
import { boundedConsentRead } from '../src/features/consent/consentSummary.ts';
import { createConsentLedger } from '../src/platform/consentBackend.ts';

const A = '11111111-1111-4111-8111-111111111111';
const receipt = (consent_type, granted, recorded_at = '2026-11-13T12:00:00Z') => ({ consent_type, policy_version: V[consent_type], granted, recorded_at });
const result = granted => ({ kind: 'ok', receipts: [receipt('ai_processing', granted)] });
const view = { kind: 'known', aiDecisionRecorded: true, aiPermitted: true };
const settle = () => TestRenderer.act(async () => { await new Promise(resolve => setImmediate(resolve)); });
const press = async (r, label) => TestRenderer.act(async () => { await r.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === label).props.onPress(); });
const text = r => r.root.findAllByType('Text').map(n => [n.props.children].flat(Infinity).join('')).join(' ');

function clientFor(rows, { user = A, failInsert = false, failRead = false } = {}) {
  const inserted = [], queries = [];
  return { inserted, queries, auth: { setSession: async () => ({ data: { user: { id: user } }, error: null }) }, from() {
    const filters = {};
    const query = {
      select() { return this; }, eq(k, v) { filters[k] = v; return this; }, order() { return this; },
      async limit(n) {
        queries.push({ ...filters, limit: n });
        return { data: rows.filter(r => r.consent_type === filters.consent_type).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)).slice(0, n), error: failRead ? {} : null };
      },
      async insert(value) {
        inserted.push(value);
        if (!failInsert) rows.push({ ...value, recorded_at: '2026-11-14T00:00:00Z' });
        return { error: failInsert ? {} : null };
      },
    };
    return query;
  } };
}
const session = { accountId: A, accessToken: 'test', refreshToken: 'test' };

test('AI choice appends only the owned AI receipt and confirms server state', async () => {
  const client = clientFor([receipt('terms', true), receipt('privacy', true), receipt('age18', true), receipt('ai_processing', true)]);
  const answer = await createConsentLedger(session, client).changeAiProcessing(false);
  assert.equal(answer.kind, 'ok');
  assert.equal(answer.receipts.find(r => r.consent_type === 'ai_processing').granted, false);
  assert.deepEqual(client.inserted, [{ account_id: A, consent_type: 'ai_processing', policy_version: V.ai_processing, granted: false }]);
  assert.ok(client.queries.every(q => q.account_id === A && q.limit === 1));
});

test('many AI changes cannot hide legal receipts; reads latest of each type', async () => {
  const rows = ['terms', 'privacy', 'age18'].map(t => receipt(t, true, '2026-01-01T00:00:00Z'));
  for (let i = 0; i < 150; i++) rows.push(receipt('ai_processing', true));
  const answer = await createConsentLedger(session, clientFor(rows)).read();
  assert.equal(answer.kind, 'ok');
  assert.deepEqual(answer.receipts.map(r => r.consent_type).sort(), Object.keys(V).sort());
});

test('wrong identity, failed write and failed confirmation never report a saved choice', async () => {
  for (const options of [{ user: 'another-user' }, { failInsert: true }, { failRead: true }]) {
    const client = clientFor([], options);
    assert.deepEqual(await createConsentLedger(session, client).changeAiProcessing(false), { kind: 'unavailable' });
    if (options.user) assert.equal(client.inserted.length, 0);
  }
});

test('review is explicit, revoke saves false, and success waits for confirmation', async () => {
  const choices = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const r = await render(<AiConsentControl view={view} save={value => { choices.push(value); return pending; }} recheck={() => {}} />);
  try {
    assert.deepEqual(choices, []);
    await press(r, 'Review AI privacy choice');
    await press(r, 'Continue without optional AI Data Processing');
    assert.deepEqual(choices, [false]);
    assert.doesNotMatch(text(r), /AI data processing is off\./);
    await TestRenderer.act(async () => finish(result(false)));
    await settle();
    assert.match(text(r), /AI data processing is off\./);
  } finally { await TestRenderer.act(() => r.unmount()); }
});

test('failed or mismatched receipts do not claim revocation', async () => {
  for (const response of [{ kind: 'unavailable' }, result(true)]) {
    const r = await render(<AiConsentControl view={view} save={async () => response} recheck={() => {}} />);
    try {
      await press(r, 'Review AI privacy choice');
      await press(r, 'Continue without optional AI Data Processing');
      await settle();
      assert.match(text(r), /could not confirm/);
      assert.doesNotMatch(text(r), /AI data processing is off\./);
    } finally { await TestRenderer.act(() => r.unmount()); }
  }
});

test('account-key remount drops late save results and clears prior notices', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let rechecks = 0;
  const r = await render(<AiConsentControl key="A" view={view} save={() => pending} recheck={() => { rechecks++; }} />);
  try {
    await press(r, 'Review AI privacy choice');
    await press(r, 'Continue without optional AI Data Processing');
    await TestRenderer.act(() => r.update(<AiConsentControl key="B" view={view} save={async () => result(true)} recheck={() => { rechecks++; }} />));
    await TestRenderer.act(() => finish(result(false)));
    await settle();
    assert.equal(rechecks, 0);
    assert.doesNotMatch(text(r), /AI data processing is off\./);
  } finally { await TestRenderer.act(() => r.unmount()); }
});

test('a synchronous ledger exception and a never-settling request are bounded failures', async () => {
  assert.deepEqual(await boundedConsentRead(() => { throw Error('unavailable'); }, 20), { kind: 'unavailable' });
  assert.deepEqual(await boundedConsentRead(() => new Promise(() => {}), 20), { kind: 'unavailable' });
});
