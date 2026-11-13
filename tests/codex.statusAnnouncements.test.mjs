import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { afterEach, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo, Platform } from 'react-native';
import { render } from './support/render.tsx';
import { emptyNamespace } from '../src/domain/sync/syncTypes.ts';
import { noticeFixture } from './support/codexNoticePorts.mjs';

const stub = new URL('./support/codexNoticePorts.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/(AccountProvider|AppStateProvider|PremiumStateProvider|usePremiumHome)$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { SyncNotice } = await import('../src/features/today/SyncNotice.tsx');
const { PersistenceNotice } = await import('../src/features/today/PersistenceNotice.tsx');
const { PremiumHomeView } = await import('../src/features/premium/PremiumHome.tsx');
const spoken = [], mounted = [];
AccessibilityInfo.announceForAccessibility = value => spoken.push(value);
afterEach(async () => {
  for (const r of mounted.splice(0)) await TestRenderer.act(() => r.unmount());
  spoken.length = 0; Platform.OS = 'ios'; noticeFixture.namespace = null;
  noticeFixture.snapshot = { recovery: null, persistenceDegraded: false };
});
const mount = async el => { const r = await render(el); mounted.push(r); return r; };
const update = async (r, el) => TestRenderer.act(() => r.update(el));

test('sync attention appearing is spoken once on iOS, with no hook-order change', async () => {
  Platform.OS = 'ios';
  const r = await mount(<SyncNotice />);
  noticeFixture.namespace = { ...emptyNamespace({ accountId: 'a', householdId: 'h', deviceId: 'd' }), backlog: true };
  await update(r, <SyncNotice />); await update(r, <SyncNotice />);
  assert.deepEqual(spoken, ['Some changes need your attention.']);
  noticeFixture.namespace = null;
  await update(r, <SyncNotice />);
  assert.equal(spoken.length, 1);
});

test('new persistence failures are spoken on iOS and retained as an Android live region', async () => {
  Platform.OS = 'ios';
  const r = await mount(<PersistenceNotice />);
  noticeFixture.snapshot = { recovery: null, persistenceDegraded: true };
  await update(r, <PersistenceNotice />);
  assert.deepEqual(spoken, ['Some recent changes may not be saved yet.']);
  assert.equal(r.root.findByType('View').props.accessibilityLiveRegion, 'polite');
});

const home = (notice = null, manageNotice = null) => ({
  copy: { tone: 'neutral', status: 'Free', title: 'Her Keys Premium', body: 'Choose what helps.' },
  capabilities: [], upgrade: { presenting: false, notice: notice ? { message: notice } : null }, managing: false, manageNotice,
});
test('new Premium purchase and management notices are each spoken once on iOS', async () => {
  Platform.OS = 'ios';
  const r = await mount(<PremiumHomeView home={home()} hold={false} />);
  await update(r, <PremiumHomeView home={home('Premium could not be reached.')} hold={false} />);
  await update(r, <PremiumHomeView home={home('Premium could not be reached.', 'Could not open subscriptions.')} hold={false} />);
  await update(r, <PremiumHomeView home={home('Premium could not be reached.', 'Could not open subscriptions.')} hold={false} />);
  assert.deepEqual(spoken, ['Premium could not be reached.', 'Could not open subscriptions.']);
});

test('Android never receives a duplicate announcement through the iOS API', async () => {
  Platform.OS = 'android';
  const r = await mount(<PremiumHomeView home={home()} hold={false} />);
  await update(r, <PremiumHomeView home={home('Try again.')} hold={false} />);
  assert.deepEqual(spoken, []);
});

test('account deletion uses the canonical owner-approved privacy URL', () => {
  const source = readFileSync('src/features/account/DeleteAccountPanel.tsx', 'utf8');
  assert.match(source, /open\(HER_KEYS_LEGAL_URLS\.privacy\)/);
  assert.doesNotMatch(source, /https:\/\/herkeys\.app\/privacy/);
});
