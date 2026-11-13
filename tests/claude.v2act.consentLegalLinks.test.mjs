/**
 * HK-V2ACT-CONSENT-01 — the mandatory consent gate asks her to review the complete Terms and Privacy Policy. A document that
 * cannot be opened must say so; before this repair the press silently did nothing (and left an unhandled rejection).
 *
 * The gate is the real component; only the ledger, the account context and the notification provider are scripted (same harness
 * as tests/consentRecovery.test.mjs). Nothing here is native evidence.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Linking } from 'react-native';
import { fixture } from './support/consentGate/stubs.mjs';
import { render } from './support/render.tsx';
import { HER_KEYS_LEGAL_URLS } from '../src/config/legal.ts';

const stub = new URL('./support/consentGate/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/(consentBackend|AccountProvider|LocalNotificationProvider)$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { ConsentGate, ConsentLegalView, LEGAL_DOCUMENT_FAILED } = await import('../src/features/consent/ConsentFlow.tsx');
const { Text } = await import('react-native');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const sessionOf = (accountId) => ({ accountId, accessToken: 't', refreshToken: 'r', expiresAt: '2099-01-01T00:00:00.000Z', provider: 'password' });
const gate = (session) => <ConsentGate session={session}><Text>APP-IS-OPEN</Text></ConsentGate>;
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const legal = (r) => r.root.findByType(ConsentLegalView).props;

const realOpen = Linking.openURL;
const mounted = [];
afterEach(async () => {
  Linking.openURL = realOpen;
  for (const r of mounted.splice(0)) await act(() => r.unmount());
});
const mount = async (session) => {
  Object.assign(fixture, { reads: [], read: async () => ({ kind: 'ok', receipts: [] }), record: async () => ({ kind: 'unavailable' }), signOutCalls: 0, signOut: async () => {} });
  const r = await render(gate(session));
  mounted.push(r);
  await settle();
  return r;
};

test('a Terms or Privacy document that cannot be opened is reported on the consent screen', async () => {
  for (const url of [HER_KEYS_LEGAL_URLS.terms, HER_KEYS_LEGAL_URLS.privacy]) {
    const opened = [];
    Linking.openURL = async (u) => { opened.push(u); throw new Error('no handler'); };
    const r = await mount(sessionOf(A));
    assert.equal(legal(r).issue, null);
    await act(() => legal(r).onOpenDocument(url));
    await settle();
    assert.deepEqual(opened, [url], 'the exact owner-approved document was requested');
    assert.equal(legal(r).issue, LEGAL_DOCUMENT_FAILED);
  }
});

test('a successful open shows no notice and clears an earlier one', async () => {
  let fail = true;
  Linking.openURL = async () => { if (fail) throw new Error('no handler'); };
  const r = await mount(sessionOf(A));
  await act(() => legal(r).onOpenDocument(HER_KEYS_LEGAL_URLS.terms));
  await settle();
  assert.equal(legal(r).issue, LEGAL_DOCUMENT_FAILED);
  fail = false;
  await act(() => legal(r).onOpenDocument(HER_KEYS_LEGAL_URLS.terms));
  await settle();
  assert.equal(legal(r).issue, null);
});

test('a late failure for a previous account is not shown to the next one', async () => {
  let reject;
  Linking.openURL = () => new Promise((_, r) => { reject = r; });
  const r = await mount(sessionOf(A));
  await act(() => legal(r).onOpenDocument(HER_KEYS_LEGAL_URLS.privacy));
  await act(() => r.update(gate(sessionOf(B))));
  await settle();
  await act(async () => { reject(new Error('late')); });
  await settle();
  assert.equal(legal(r).issue, null);
});

test('the Read buttons route through the gate, and the commit gate and receipts are untouched', async () => {
  const opened = [];
  Linking.openURL = async (u) => { opened.push(u); };
  const r = await mount(sessionOf(A));
  const press = (label) => r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0].props.onPress();
  await act(() => press('Read Terms and Conditions'));
  await act(() => press('Read Privacy Policy'));
  assert.deepEqual(opened, [HER_KEYS_LEGAL_URLS.terms, HER_KEYS_LEGAL_URLS.privacy]);
  assert.equal(legal(r).issue, null);
  assert.equal(/APP-IS-OPEN/.test(JSON.stringify(r.toJSON())), false, 'reading a document never opens the app');
});
