/**
 * The words of the Premium home are a table with rules: no price, no technical identifier, no second Restore button, an honest
 * description of each of the three tools, and a "next step" for every state.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CAPABILITY_TEXT, PREMIUM_CAPABILITY_KEYS, capabilityViews, premiumHomeCopyFor } from '../../src/monetization/premiumHomeCopy.ts';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../src/monetization/entitlement.ts';

const ALL_STATES = [
  { kind: 'signed_out' }, { kind: 'loading' }, { kind: 'free' },
  { kind: 'active', endsOn: '2026-11-13T00:00:00Z' }, { kind: 'active', endsOn: null },
  { kind: 'canceled_active', endsOn: '2026-11-13T00:00:00Z' }, { kind: 'canceled_active', endsOn: null },
  { kind: 'billing_grace', endsOn: '2026-10-20T00:00:00Z' }, { kind: 'billing_grace', endsOn: null },
  { kind: 'verification_pending', cause: 'checking', canRetry: false }, { kind: 'verification_pending', cause: 'delayed', canRetry: true },
  { kind: 'verification_pending', cause: 'outage', canRetry: true }, { kind: 'verification_pending', cause: 'account_mismatch', canRetry: true },
  { kind: 'expired' }, { kind: 'revoked' }, { kind: 'unavailable' }, { kind: 'account_closing' },
];
const format = (iso) => `<<${iso.slice(0, 10)}>>`;
const everyWord = (copy) => [copy.status, copy.title, copy.body, copy.primary?.label, copy.manage?.label].filter(Boolean).join('\n');

describe('rules every state obeys', () => {
  for (const state of ALL_STATES) {
    const name = `${state.kind}${state.cause ? `/${state.cause}` : ''}${'endsOn' in state ? (state.endsOn ? '/dated' : '/undated') : ''}`;
    test(`${name}: no price, no technical id, names the product, never blames her`, () => {
      const words = everyWord(premiumHomeCopyFor(state, format));
      assert.doesNotMatch(words, /her_keys_plus|entitlement|revenuecat|\bRC\b/i, 'no technical identifier');
      assert.doesNotMatch(words, /[$€£¥]|\bUSD\b|\d+\.\d{2}|per (month|year)|\/(mo|yr)|\bfree trial\b|\bdiscount\b|\bsave \d/i, 'no price, currency, trial or discount');
      assert.doesNotMatch(words, /\byou (failed|forgot|didn’t pay)\b|\byour fault\b/i);
      assert.doesNotMatch(words, /undefined|null|\[object/);
    });
  }
  test('only states that can be acted on carry a primary action, and no state offers a second Restore Purchases button', () => {
    for (const state of ALL_STATES) {
      const copy = premiumHomeCopyFor(state, format);
      for (const item of [copy.primary, copy.manage]) {
        if (item) assert.doesNotMatch(item.label, /restore/i, `${state.kind} must not render a restore button`);
      }
      assert.ok(['upgrade', 'verify', 'retry', 'manage'].includes(copy.primary?.action ?? 'upgrade'));
    }
  });
  test('the purchase action exists exactly where she can buy: Free, Expired, Revoked', () => {
    const buyable = ALL_STATES.filter((state) => premiumHomeCopyFor(state, format).primary?.action === 'upgrade').map((s) => s.kind);
    assert.deepEqual([...new Set(buyable)].sort(), ['expired', 'free', 'revoked']);
  });
  test('manage is offered exactly where a store subscription exists to manage', () => {
    const manageable = ALL_STATES.filter((state) => premiumHomeCopyFor(state, format).manage !== null).map((s) => s.kind);
    assert.deepEqual([...new Set(manageable)].sort(), ['active', 'billing_grace', 'canceled_active', 'verification_pending']);
  });
  test('a retry is offered only when the state can be retried', () => {
    assert.equal(premiumHomeCopyFor({ kind: 'verification_pending', cause: 'checking', canRetry: false }, format).primary, null);
    assert.equal(premiumHomeCopyFor({ kind: 'verification_pending', cause: 'delayed', canRetry: true }, format).primary?.action, 'verify');
    assert.equal(premiumHomeCopyFor({ kind: 'unavailable' }, format).primary?.action, 'retry');
  });
});

describe('what each state says', () => {
  const copy = (state) => premiumHomeCopyFor(state, format);
  test('Free says Free is untouched and points at the purchase interface, with no number', () => {
    const free = copy({ kind: 'free' });
    assert.equal(free.status, 'Free plan');
    assert.match(free.body, /Everything free in Her Keys still works/);
    assert.equal(free.primary.label, `See ${HER_KEYS_PREMIUM_DISPLAY_NAME}`);
  });
  test('Active states the period from the server date; Canceled says it will not renew; Grace says what to fix', () => {
    assert.match(copy({ kind: 'active', endsOn: '2026-11-13T00:00:00Z' }).body, /runs through <<2026-11-13>>/);
    assert.match(copy({ kind: 'canceled_active', endsOn: '2026-11-13T00:00:00Z' }).title, /won’t renew/);
    assert.match(copy({ kind: 'canceled_active', endsOn: '2026-11-13T00:00:00Z' }).body, /through <<2026-11-13>>/);
    assert.match(copy({ kind: 'billing_grace', endsOn: '2026-10-20T00:00:00Z' }).body, /until <<2026-10-20>>/);
    assert.equal(copy({ kind: 'billing_grace', endsOn: null }).manage.label, 'Update payment method');
  });
  test('Expired and Revoked say the data is safe and that the Free tools work', () => {
    for (const kind of ['expired', 'revoked']) {
      const words = copy({ kind }).body;
      assert.match(words, /still yours and still here/);
      assert.match(words, /Everything free in Her Keys still works/);
    }
    assert.match(copy({ kind: 'revoked' }).title, /refunded/);
    assert.doesNotMatch(copy({ kind: 'expired' }).title, /refunded/);
  });
  test('Verification Pending never says Premium is on or guarantees store billing behavior', () => {
    for (const cause of ['checking', 'delayed', 'outage', 'account_mismatch']) {
      const c = copy({ kind: 'verification_pending', cause, canRetry: true });
      assert.doesNotMatch(c.title, /is on\b/i);
      assert.equal(c.tone === 'success', false);
    }
    const delayed = copy({ kind: 'verification_pending', cause: 'delayed', canRetry: true }).body;
    assert.match(delayed, /Check your store subscription settings before trying to purchase again/);
    assert.doesNotMatch(delayed, /won’t be charged twice/);
    assert.match(copy({ kind: 'verification_pending', cause: 'account_mismatch', canRetry: true }).body, /another Her Keys account/);
  });
  test('Service Unavailable says nothing changed', () => {
    assert.match(copy({ kind: 'unavailable' }).body, /Nothing has changed on your account/);
  });
});

describe('the three tools', () => {
  test('exactly the three Stage 1 tools, each with a plain summary and where to find it', () => {
    assert.deepEqual([...PREMIUM_CAPABILITY_KEYS], ['daily_load_premium', 'smart_inbox_extract', 'momentum_report']);
    assert.deepEqual(Object.keys(CAPABILITY_TEXT).sort(), [...PREMIUM_CAPABILITY_KEYS].sort());
    for (const key of PREMIUM_CAPABILITY_KEYS) {
      const text = CAPABILITY_TEXT[key];
      assert.ok(text.name.length > 3 && text.summary.length > 40 && text.where.length > 10, key);
      assert.doesNotMatch(`${text.name} ${text.summary} ${text.where}`, /[$€£]|\d|unlimited|guarantee|never miss|automatically (changes|moves|saves)/i, `${key} claims nothing it does not do and states no number`);
    }
  });
  test('the tools that change or save things say nothing happens without her approval; the weekly review does not score her', () => {
    assert.match(CAPABILITY_TEXT.daily_load_premium.summary, /until you approve/);
    assert.match(CAPABILITY_TEXT.smart_inbox_extract.summary, /nothing is saved until you approve/i);
    assert.match(CAPABILITY_TEXT.smart_inbox_extract.summary, /only if you have allowed/);
    assert.match(CAPABILITY_TEXT.momentum_report.summary, /doesn’t score you/);
  });
  test('"Ready" only when the server says entitled; Free and pending are "Part of Her Keys Premium", never Ready', () => {
    const manifestReady = PREMIUM_CAPABILITY_KEYS.map((featureKey) => ({ featureKey, tier: 'premium', available: true }));
    const statusOf = (state, manifest = manifestReady) => capabilityViews(state, manifest).map((c) => c.status);
    for (const kind of ['active', 'canceled_active', 'billing_grace']) assert.deepEqual(statusOf({ kind, endsOn: null }), ['ready', 'ready', 'ready']);
    for (const state of [{ kind: 'free' }, { kind: 'loading' }, { kind: 'unavailable' }, { kind: 'signed_out' }, { kind: 'verification_pending', cause: 'checking', canRetry: false }]) {
      assert.deepEqual(statusOf(state), ['included', 'included', 'included'], state.kind);
    }
    assert.deepEqual(statusOf({ kind: 'expired' }), ['paused', 'paused', 'paused']);
    assert.deepEqual(statusOf({ kind: 'revoked' }), ['paused', 'paused', 'paused']);
    assert.deepEqual(statusOf({ kind: 'account_closing' }), ['paused', 'paused', 'paused']);
  });
  test('the server manifest can switch a tool off: it is then shown as not switched on, even for a paying customer', () => {
    const manifest = PREMIUM_CAPABILITY_KEYS.map((featureKey) => ({ featureKey, displayName: featureKey, tier: 'premium', available: featureKey !== 'smart_inbox_extract', requiresAiConsent: false, minAppVersion: null }));
    const views = capabilityViews({ kind: 'active', endsOn: null }, manifest);
    assert.deepEqual(views.map((c) => c.status), ['ready', 'unavailable', 'ready']);
    assert.equal(views[1].statusLabel, 'Not switched on for your account yet');
    const unknown = capabilityViews({ kind: 'active', endsOn: null }, null);
    assert.deepEqual(unknown.map((c) => c.status), ['unavailable', 'unavailable', 'unavailable'],
      'a subscriber is never shown three ready features without a server manifest');
  });
});
