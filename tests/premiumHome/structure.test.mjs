/**
 * The Premium surface has exactly ONE Restore Purchases control and ONE navigation path to it; the home is a purchase surface that
 * gates nothing; and no price lives in the app's own copy. These are source-level guards plus one rendered placement test.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { fixture } from '../support/premium/stubs.mjs';
import { render } from '../support/render.tsx';

const stub = new URL('../support/premium/stubs.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'expo-router') return next(stub, context);
  return next(specifier, context);
} });
const { AccountPanel } = await import('../../src/features/account/AccountPanel.tsx');
const { openAccountToRestore } = await import('../../src/monetization/accountNavigation.ts');

const read = (file) => readFileSync(file, 'utf8');
const walk = (dir) => readdirSync(dir, { recursive: true, withFileTypes: false })
  .map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`)
  .filter((f) => /\.(ts|tsx)$/.test(f));
const sources = [...walk('src'), ...walk('app')];

describe('one Restore Purchases control, one path to it', () => {
  test('the control is mounted by exactly one route: the Account screen', () => {
    const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const mounts = sources.filter((f) => /<RestorePurchasesControl\b/.test(code(f)));
    assert.deepEqual(mounts, ['app/sign-in.tsx']);
  });
  test('only the control itself starts a store restore', () => {
    const callers = sources.filter((f) => /\buseRestorePurchases\(/.test(read(f)) && !f.endsWith('useRestorePurchases.ts'));
    assert.deepEqual(callers, ['src/features/account/RestorePurchasesControl.tsx']);
  });
  test('the Premium home renders no restore control and never starts a restore', () => {
    for (const file of sources.filter((f) => f.startsWith('src/features/premium/'))) {
      assert.doesNotMatch(read(file), /RestorePurchasesControl|useRestorePurchases|\.restore\(|restorePurchases/i, file);
      assert.doesNotMatch(read(file), /label=["'`{][^>]*restore/i, `${file} has no restore button`);
    }
  });
  test('a "restore" action in a Premium notice navigates to Your Account; it never opens the paywall or restores in place', () => {
    for (const file of ['src/features/daily-load/premium/PremiumDailyLoadSection.tsx', 'src/features/momentum/premium/PremiumMomentumSection.tsx']) {
      const lines = read(file).split(/\r?\n/).filter((line) => /(copy\.action|copy\.secondaryAction) === 'restore'/.test(line));
      assert.equal(lines.length, 2, `${file} has its two restore affordances`);
      for (const line of lines) {
        assert.match(line, /openAccountToRestore\(\)/, file);
        assert.doesNotMatch(line, /upgrade\.start|restore\(/, `${file} must not open the paywall under a restore label`);
      }
    }
  });
  test('the words say where: "Restore in Your Account", never a bare "Restore purchases" button in a feature notice', () => {
    const copy = read('src/monetization/premiumCopy.ts');
    assert.doesNotMatch(copy, /(Label|label): 'Restore purchases'/);
    assert.match(copy, /secondaryLabel: 'Restore in Your Account'/);
  });
  test('openAccountToRestore pushes the single Account route', async () => {
    fixture.navigation.length = 0;
    await openAccountToRestore();
    assert.deepEqual(fixture.navigation, ['/sign-in']);
  });
});

describe('the Account screen places the one control inside the Premium section', () => {
  const props = { mode: 'connected', providers: [], busy: false, failed: false, onSignIn() {}, onSignOut() {}, onClose() {} };
  const labels = (r) => r.root.findAllByType('Pressable').map((node) => node.props.accessibilityLabel);
  const restore = <React.Fragment>{React.createElement('Pressable', { accessibilityLabel: 'Restore purchases' })}</React.Fragment>;

  test('with a Premium section: Premium first, then the single Restore control, then Sign out — and no second restore in the footer', async () => {
    const r = await render(<AccountPanel {...props} premiumSection={React.createElement('Pressable', { accessibilityLabel: 'PREMIUM-SECTION' })} restoreControl={restore} />);
    try {
      const order = labels(r).filter((l) => ['PREMIUM-SECTION', 'Restore purchases', 'Sign out', 'Done'].includes(l));
      assert.deepEqual(order, ['PREMIUM-SECTION', 'Restore purchases', 'Sign out', 'Done']);
      assert.equal(labels(r).filter((l) => l === 'Restore purchases').length, 1);
    } finally { await TestRenderer.act(async () => r.unmount()); }
  });
  test('without a Premium section the footer is exactly as before (one Restore control)', async () => {
    const r = await render(<AccountPanel {...props} restoreControl={restore} />);
    try {
      assert.deepEqual(labels(r).filter((l) => ['Restore purchases', 'Sign out', 'Done'].includes(l)), ['Restore purchases', 'Sign out', 'Done']);
    } finally { await TestRenderer.act(async () => r.unmount()); }
  });
  test('the legacy onRestore path still renders one control, and the Premium section is not shown outside the connected state', async () => {
    const connected = await render(<AccountPanel {...props} onRestore={() => {}} premiumSection={React.createElement('Pressable', { accessibilityLabel: 'PREMIUM-SECTION' })} />);
    const signedOut = await render(<AccountPanel {...props} mode="signIn" providers={['google']} premiumSection={React.createElement('Pressable', { accessibilityLabel: 'PREMIUM-SECTION' })} restoreControl={restore} />);
    try {
      assert.equal(labels(connected).filter((l) => l === 'Restore purchases').length, 1);
      assert.equal(labels(signedOut).includes('PREMIUM-SECTION'), false);
      assert.equal(labels(signedOut).includes('Restore purchases'), false, 'signed out: no restore, no Premium');
    } finally { await TestRenderer.act(async () => { connected.unmount(); signedOut.unmount(); }); }
  });
});

describe('the home gates nothing and shows no price', () => {
  test('the Premium home never uses usePremiumFeature (it opens the purchase interface; the server gates each tool when it runs)', () => {
    for (const file of sources.filter((f) => f.startsWith('src/features/premium/'))) assert.doesNotMatch(read(file), /\busePremiumFeature\b/, file);
  });
  test('the home and its copy reference no price, currency or offering package: a price is rendered only by the store’s own purchase interface', () => {
    const files = [...sources.filter((f) => f.startsWith('src/features/premium/')), 'src/monetization/premiumHomeCopy.ts', 'src/monetization/premiumHomeState.ts', 'src/monetization/subscriptionManagement.ts'];
    for (const file of files) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // A direction to check the store's renewal price is not a locally rendered monetary amount.
      assert.doesNotMatch(code, /priceString|\.price\b|price\s*:|currencyCode|availablePackages|fetchCurrentOffering|getOfferings|\$\d/i, file);
    }
  });
});
