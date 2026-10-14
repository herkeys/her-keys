/**
 * B2B-N02 / SC-02 — the reusable Restore Purchases control that Settings mounts.
 *
 * The control is driven through the real hook against the same SDK-boundary stand-in the account route tests use. Nothing here
 * proves a native store restore (NOT RUN); it proves the source contract Settings relies on: the control acts only for the
 * bound account it is given, is single-flight, tells its host when it is busy, reports each outcome in words, and can never
 * show or apply one account's result to another.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';
import { fixture } from './support/restoreRoute.mjs';
import { render } from '../support/render.tsx';

const stub = new URL('./support/restoreRoute.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (/\/RevenueCatProvider$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { RestorePurchasesControl } = await import('../../src/features/account/RestorePurchasesControl.tsx');
const { restoreNoticeFor } = await import('../../src/monetization/useRestorePurchases.ts');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const text = (r) => r.root.findAllByType('Text').map((node) => node.props.children).flat().join(' ');
const button = (r, label) => r.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label);
const act = async (f) => TestRenderer.act(async () => { await f(); });

for (const platform of ['android', 'ios']) {
  test(`SC-02 ${platform}: the control restores for the bound account, reports each outcome and tells its host when it is busy`, async () => {
    const previous = Platform.OS;
    Platform.OS = platform;
    try {
      for (const [outcome, message] of [
        [{ kind: 'restored' }, /purchase was restored/],
        [{ kind: 'no_purchases_found' }, /No Premium purchase was found/],
        [{ kind: 'unavailable' }, /Reconnect your account/],
        [{ kind: 'error', message: 'private SDK detail' }, /couldn’t be restored/],
      ]) {
        const calls = [];
        const busy = [];
        fixture.entitlement = { restore: async (id) => { calls.push(id); return outcome; } };
        const r = await render(<RestorePurchasesControl accountId={A} onRestoringChange={(v) => busy.push(v)} />);
        try {
          await act(() => button(r, 'Restore purchases').props.onPress());
          assert.deepEqual(calls, [A], 'the SDK boundary is handed the bound account UUID');
          assert.match(text(r), message);
          assert.doesNotMatch(text(r), /private SDK detail/);
          assert.equal(busy.at(-1), false, 'the host is told the restore ended');
          assert.equal(button(r, 'Restore purchases').props.disabled, false, 'retry is available after every outcome');
        } finally { await act(() => r.unmount()); }
      }
    } finally { Platform.OS = previous; }
  });
}

test('SC-02: the host is told while a restore is pending, and again when it ends', async () => {
  let settle;
  const busy = [];
  fixture.entitlement = { restore: () => new Promise((resolve) => { settle = resolve; }) };
  const r = await render(<RestorePurchasesControl accountId={A} onRestoringChange={(v) => busy.push(v)} />);
  try {
    await act(() => button(r, 'Restore purchases').props.onPress());
    assert.equal(busy.at(-1), true, 'pending: the host may hold Sign out and Delete');
    await act(() => settle({ kind: 'no_purchases_found' }));
    assert.equal(busy.at(-1), false);
  } finally { await act(() => r.unmount()); }
});

test('SC-02: nothing renders, and nothing can start, without a bound account', async () => {
  let calls = 0;
  fixture.entitlement = { restore: async () => { calls++; return { kind: 'restored' }; } };
  const r = await render(<RestorePurchasesControl accountId={null} />);
  try {
    assert.equal(button(r, 'Restore purchases'), undefined);
    assert.equal(calls, 0);
  } finally { await act(() => r.unmount()); }
});

test('SC-02: a blocked host cannot start a restore', async () => {
  let calls = 0;
  fixture.entitlement = { restore: async () => { calls++; return { kind: 'restored' }; } };
  const r = await render(<RestorePurchasesControl accountId={A} blocked />);
  try {
    assert.equal(button(r, 'Restore purchases').props.disabled, true);
    await act(() => button(r, 'Restore purchases').props.onPress());
    assert.equal(calls, 0);
  } finally { await act(() => r.unmount()); }
});

test('SC-02: loading state is single-flight and another account never receives the late result', async () => {
  let settle;
  const calls = [];
  fixture.entitlement = { restore: (id) => { calls.push(id); return new Promise((resolve) => { settle = resolve; }); } };
  const r = await render(<RestorePurchasesControl accountId={A} />);
  try {
    const press = button(r, 'Restore purchases').props.onPress;
    await act(() => { press(); press(); });
    assert.deepEqual(calls, [A], 'a second press while pending does nothing');
    assert.equal(button(r, 'Restoring purchases…').props.disabled, true);
    await act(() => r.update(<RestorePurchasesControl accountId={B} />));
    await act(() => settle({ kind: 'restored' }));
    assert.doesNotMatch(text(r), /purchase was restored/, 'account A’s result is not shown to account B');
    assert.equal(button(r, 'Restore purchases').props.disabled, false);
    await act(() => r.update(<RestorePurchasesControl accountId={A} />));
    assert.doesNotMatch(text(r), /purchase was restored/, 'and is not resurrected when A returns');
  } finally { await act(() => r.unmount()); }
});

test('SC-02: a restore that throws is recoverable, and an unmounted control ignores a late result', async () => {
  fixture.entitlement = { restore: async () => { throw new Error('offline'); } };
  const failing = await render(<RestorePurchasesControl accountId={A} />);
  await act(() => button(failing, 'Restore purchases').props.onPress());
  assert.match(text(failing), /couldn’t be restored/);
  assert.equal(button(failing, 'Restore purchases').props.disabled, false);
  await act(() => failing.unmount());

  let settle;
  fixture.entitlement = { restore: () => new Promise((resolve) => { settle = resolve; }) };
  const pending = await render(<RestorePurchasesControl accountId={A} />);
  await act(() => button(pending, 'Restore purchases').props.onPress());
  await act(() => pending.unmount());
  await act(() => settle({ kind: 'restored' }));
});

test('SC-02: outcome words never leak an SDK message and cover every outcome kind', () => {
  for (const outcome of [{ kind: 'restored' }, { kind: 'no_purchases_found' }, { kind: 'unavailable' }, { kind: 'error', message: 'StoreKit: SKErrorDomain 2' }]) {
    const words = restoreNoticeFor(outcome);
    assert.ok(words.length > 10);
    assert.doesNotMatch(words, /SKErrorDomain|StoreKit/);
  }
});
