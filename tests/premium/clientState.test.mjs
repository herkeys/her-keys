import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { deriveFeatureState, isUsable } from '../../src/monetization/premiumFeatureState.ts';
import { premiumCopyFor, purchaseOutcomeNotice } from '../../src/monetization/premiumCopy.ts';
import { createPremiumServerClient } from '../../src/monetization/premiumServerClient.ts';
import { AUTHORIZATION_REASONS, ENTITLED_STATES, NEXT_ACTIONS, SERVER_ENTITLEMENT_STATES } from '../../src/monetization/premiumTypes.ts';

const FEATURE = 'daily_load_premium';
const snapshot = (over = {}) => ({
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', load: 'ready', manifest: [{ featureKey: FEATURE, displayName: 'Daily Load', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null }],
  verification: 'idle', lastVerify: null,
  server: { state: 'free', expiresAt: null, graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' },
  ...over,
});
const withServer = (state, extra = {}) => snapshot({ server: { state, expiresAt: '2026-11-13T00:00:00Z', graceExpiresAt: '2026-11-16T00:00:00Z', canceled: false, needsReconcile: false, checkedAt: '', ...extra } });
const derive = (over = {}) => deriveFeatureState({ accountBound: true, featureKey: FEATURE, snapshot: snapshot(), storeStatus: 'free', decision: null, ...over });
const decision = (over = {}) => ({ outcome: 'denied', reason: 'requires_premium', entitlementState: 'free', via: null, nextAction: 'open_paywall', quota: null, decisionId: 'd', replay: false, ...over });

describe('the unified Premium feature state', () => {
  test('signed out: Premium needs an account, and the account is the only thing that can be entitled', () => {
    assert.equal(derive({ accountBound: false }).kind, 'signed_out');
    assert.equal(derive({ snapshot: snapshot({ accountId: null }) }).kind, 'signed_out');
  });

  test('loading until the server has answered', () => {
    assert.equal(derive({ snapshot: snapshot({ server: null, load: 'loading' }) }).kind, 'loading');
    assert.equal(derive({ snapshot: snapshot({ server: null, load: 'idle' }) }).kind, 'loading');
  });

  test('ENTITLED only when the SERVER says so — the store SDK alone can never unlock a feature', () => {
    for (const storeStatus of ['plus', 'free', 'unknown', 'loading']) {
      const state = derive({ snapshot: snapshot({ server: { state: 'free', expiresAt: null, graceExpiresAt: null, canceled: false, needsReconcile: false, checkedAt: '' } }), storeStatus });
      assert.notEqual(state.kind, 'entitled', `store=${storeStatus}`);
      assert.equal(isUsable(state), false, `store=${storeStatus}`);
    }
    assert.equal(derive({ snapshot: withServer('premium_active'), storeStatus: 'free' }).kind, 'entitled', 'the server wins even when the SDK lags');
  });

  test('the three paid server states are entitled, each described truthfully', () => {
    assert.deepEqual(derive({ snapshot: withServer('premium_active') }), { kind: 'entitled', subscription: 'active', endsOn: '2026-11-13T00:00:00Z' });
    assert.deepEqual(derive({ snapshot: withServer('premium_canceled_active', { canceled: true }) }), { kind: 'entitled', subscription: 'canceled', endsOn: '2026-11-13T00:00:00Z' });
    assert.deepEqual(derive({ snapshot: withServer('premium_billing_grace') }), { kind: 'entitled', subscription: 'grace', endsOn: '2026-11-16T00:00:00Z' });
    for (const state of ENTITLED_STATES) assert.equal(isUsable(derive({ snapshot: withServer(state) })), true, state);
  });

  test('free and unknown server states with a free store are an upgrade prompt', () => {
    assert.equal(derive({ snapshot: withServer('free') }).kind, 'upgrade_required');
    assert.equal(derive({ snapshot: withServer('unknown') }).kind, 'upgrade_required');
  });

  test('expired and refunded are different, and both leave her information alone', () => {
    assert.deepEqual(derive({ snapshot: withServer('premium_expired') }), { kind: 'subscription_expired', revoked: false });
    assert.deepEqual(derive({ snapshot: withServer('premium_revoked') }), { kind: 'subscription_expired', revoked: true });
  });

  test('the store says paid but the server has not agreed: verification, in each honest flavour', () => {
    const paid = (over) => derive({ storeStatus: 'plus', snapshot: snapshot(over) });
    assert.deepEqual(paid({ verification: 'checking' }), { kind: 'verification_pending', cause: 'checking', canRetry: false });
    // MID-SCHEDULE (idle/pending) she is only ever told "confirming": a single read can race a late webhook, so no mismatch or outage is claimed yet.
    for (const lastVerify of [null, 'rate_limited', 'reconciled', 'provider_unavailable', 'unreachable', 'conflict']) {
      assert.deepEqual(paid({ verification: 'pending', lastVerify }), { kind: 'verification_pending', cause: 'checking', canRetry: false }, `pending/${lastVerify}`);
      assert.deepEqual(paid({ verification: 'idle', lastVerify }), { kind: 'verification_pending', cause: 'checking', canRetry: false }, `idle/${lastVerify}`);
    }
    // ONLY once the whole schedule is spent does what the server last said become worth saying.
    assert.deepEqual(paid({ verification: 'gave_up', lastVerify: 'rate_limited' }), { kind: 'verification_pending', cause: 'delayed', canRetry: true });
    assert.deepEqual(paid({ verification: 'gave_up', lastVerify: 'provider_unavailable' }), { kind: 'verification_pending', cause: 'outage', canRetry: true });
    assert.deepEqual(paid({ verification: 'gave_up', lastVerify: 'unreachable' }), { kind: 'verification_pending', cause: 'outage', canRetry: true });
    assert.deepEqual(paid({ verification: 'gave_up', lastVerify: 'reconciled' }), { kind: 'verification_pending', cause: 'account_mismatch', canRetry: true });
    assert.deepEqual(paid({ server: null, load: 'unavailable' }), { kind: 'verification_pending', cause: 'outage', canRetry: true });
  });

  test('with the server unreachable and no purchase in play, the feature is simply unavailable for now (Free is untouched)', () => {
    assert.deepEqual(derive({ snapshot: snapshot({ server: null, load: 'unavailable' }) }), { kind: 'feature_unavailable', cause: 'service' });
    assert.deepEqual(derive({ storeStatus: 'unknown', snapshot: withServer('free') }), { kind: 'feature_unavailable', cause: 'service' });
  });

  test('the account being deleted overrides everything', () => {
    assert.equal(derive({ snapshot: withServer('deletion_pending') }).kind, 'account_deactivated');
    assert.equal(derive({ snapshot: withServer('deletion_pending'), decision: decision({ reason: 'allowed', outcome: 'allowed' }) }).kind, 'account_deactivated');
  });

  test('a release switch in the manifest closes the feature even for a paying customer', () => {
    const closed = snapshot({ manifest: [{ featureKey: FEATURE, displayName: 'Daily Load', tier: 'premium', available: false, requiresAiConsent: false, minAppVersion: null }], server: withServer('premium_active').server });
    assert.deepEqual(derive({ snapshot: closed }), { kind: 'feature_unavailable', cause: 'disabled' });
  });

  test('a real server decision is shown as what it was: consent, limit, kill switch, outage, busy, ownership', () => {
    const entitled = withServer('premium_active');
    assert.equal(derive({ snapshot: entitled, decision: decision({ reason: 'requires_ai_consent', nextAction: 'grant_ai_consent' }) }).kind, 'consent_required');
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'quota_exhausted', nextAction: 'wait_for_reset', quota: { period: 'month', periodStart: 'a', periodEnd: '2026-11-01', used: 5, reserved: 0, limit: 5, remaining: 0 } }) }), { kind: 'usage_limit_reached', resetsOn: '2026-11-01', canUpgrade: false });
    assert.deepEqual(derive({ snapshot: withServer('free'), decision: decision({ reason: 'quota_exhausted', nextAction: 'open_paywall' }) }), { kind: 'usage_limit_reached', resetsOn: null, canUpgrade: true });
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'feature_disabled', nextAction: 'update_app' }) }), { kind: 'feature_unavailable', cause: 'update_app' });
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'feature_disabled', nextAction: 'none' }) }), { kind: 'feature_unavailable', cause: 'disabled' });
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'service_unavailable', nextAction: 'retry_later' }) }), { kind: 'feature_unavailable', cause: 'service' });
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'rate_limited', nextAction: 'retry_later' }) }), { kind: 'feature_unavailable', cause: 'busy' });
    assert.deepEqual(derive({ snapshot: entitled, decision: decision({ reason: 'ownership_denied', nextAction: 'none' }) }), { kind: 'feature_unavailable', cause: 'ownership' });
    assert.equal(derive({ snapshot: entitled, decision: decision({ reason: 'account_deactivated' }) }).kind, 'account_deactivated');
  });

  test('a SUBSCRIPTION denial goes stale once the server\'s own state has moved on (a purchase completed since)', () => {
    const stale = decision({ reason: 'requires_premium' });
    assert.equal(derive({ snapshot: withServer('free'), decision: stale }).kind, 'upgrade_required');
    assert.equal(derive({ snapshot: withServer('premium_active'), decision: stale }).kind, 'entitled');
    assert.equal(derive({ snapshot: withServer('premium_active'), decision: decision({ reason: 'entitlement_expired' }) }).kind, 'entitled');
  });

  test('an approved free allowance is its own state, and only when the server said so', () => {
    const viaAllowance = decision({ outcome: 'allowed', reason: 'allowed', via: 'free_allowance', nextAction: 'none' });
    assert.equal(derive({ snapshot: withServer('free'), decision: viaAllowance }).kind, 'free_allowance');
    assert.equal(derive({ snapshot: withServer('free'), decision: null }).kind, 'upgrade_required');
    assert.equal(isUsable({ kind: 'free_allowance' }), true);
  });

  test('every unusable kind is unusable', () => {
    for (const kind of ['signed_out', 'loading', 'upgrade_required', 'verification_pending', 'subscription_expired', 'feature_unavailable', 'consent_required', 'usage_limit_reached', 'account_deactivated']) {
      assert.equal(isUsable({ kind }), false, kind);
    }
  });
});

const ALL_STATES = [
  { kind: 'signed_out' }, { kind: 'loading' },
  { kind: 'entitled', subscription: 'active', endsOn: '2026-11-13T00:00:00Z' }, { kind: 'entitled', subscription: 'canceled', endsOn: '2026-11-13T00:00:00Z' },
  { kind: 'entitled', subscription: 'grace', endsOn: '2026-11-16T00:00:00Z' }, { kind: 'entitled', subscription: 'grace', endsOn: null }, { kind: 'entitled', subscription: 'canceled', endsOn: null },
  { kind: 'free_allowance' }, { kind: 'upgrade_required' },
  ...['checking', 'delayed', 'account_mismatch', 'outage'].map((cause) => ({ kind: 'verification_pending', cause, canRetry: true })),
  { kind: 'subscription_expired', revoked: false }, { kind: 'subscription_expired', revoked: true },
  ...['disabled', 'service', 'update_app', 'ownership', 'busy'].map((cause) => ({ kind: 'feature_unavailable', cause })),
  { kind: 'consent_required' }, { kind: 'usage_limit_reached', resetsOn: '2026-11-01T00:00:00Z', canUpgrade: true }, { kind: 'usage_limit_reached', resetsOn: null, canUpgrade: false },
  { kind: 'account_deactivated' },
];
const fmt = (iso) => `«${iso}»`;

describe('every word Her Keys says about Premium', () => {
  const copies = ALL_STATES.map((state) => ({ state, copy: premiumCopyFor(state, 'Daily Load', fmt) }));

  test('the product is "Her Keys Premium"; the technical entitlement id and the old name never reach her', () => {
    for (const { state, copy } of copies) {
      const words = `${copy.title} ${copy.body} ${copy.actionLabel ?? ''} ${copy.secondaryLabel ?? ''}`;
      assert.doesNotMatch(words, /her_keys_plus|Her Keys\+|\bPlus\b/, JSON.stringify(state));
    }
    assert.ok(copies.some(({ copy }) => copy.title.includes('Her Keys Premium')));
  });

  test('no price, no limit number and no count is ever stated (none is owner-approved)', () => {
    for (const { state, copy } of copies) {
      const words = `${copy.title} ${copy.body}`.replace(/«[^»]*»/g, '');
      assert.doesNotMatch(words, /\$|\d/, `${JSON.stringify(state)}: ${words}`);
    }
  });

  test('every state that stops her says Free is untouched, and every end-of-subscription state says her information is safe', () => {
    for (const { state, copy } of copies) {
      // A closing account is the one state where promising "Free still works" would be misleading: the account itself is being deleted.
      if (['entitled', 'free_allowance', 'loading', 'account_deactivated'].includes(state.kind)) continue;
      assert.match(`${copy.title} ${copy.body}`, /free in Her Keys still works|Nothing has changed|Everything free/i, JSON.stringify(state));
    }
    for (const revoked of [true, false]) {
      assert.match(premiumCopyFor({ kind: 'subscription_expired', revoked }, 'Daily Load', fmt).body, /everything you saved is still yours and still here/i);
    }
  });

  test('a pending verification NEVER claims Premium is on', () => {
    for (const { state, copy } of copies.filter(({ state }) => state.kind === 'verification_pending')) {
      assert.doesNotMatch(`${copy.title} ${copy.body}`, /Premium is on|is active|you now have/i, JSON.stringify(state));
    }
    assert.doesNotMatch(purchaseOutcomeNotice({ kind: 'purchased' }).message, /is on|is active/i);
    assert.match(purchaseOutcomeNotice({ kind: 'purchased' }).message, /confirming/i);
  });

  test('exactly one purchase action per state, never two buy buttons', () => {
    for (const { state, copy } of copies) {
      assert.ok(!(copy.action === 'upgrade' && copy.secondaryAction === 'upgrade'), JSON.stringify(state));
      if (copy.action !== 'none') assert.ok(copy.actionLabel, `${JSON.stringify(state)} has an action with no label`);
      if (copy.secondaryAction !== 'none') assert.ok(copy.secondaryLabel);
    }
    assert.equal(premiumCopyFor({ kind: 'upgrade_required' }, 'Daily Load', fmt).action, 'upgrade');
    assert.equal(premiumCopyFor({ kind: 'verification_pending', cause: 'delayed', canRetry: true }, 'Daily Load', fmt).action, 'verify');
    assert.equal(premiumCopyFor({ kind: 'verification_pending', cause: 'account_mismatch', canRetry: true }, 'Daily Load', fmt).action, 'restore');
    assert.equal(premiumCopyFor({ kind: 'consent_required' }, 'Daily Load', fmt).action, 'manage_consent');
    assert.equal(premiumCopyFor({ kind: 'feature_unavailable', cause: 'update_app' }, 'Daily Load', fmt).action, 'update_app');
  });

  test('billing grace tells her the provider\'s date and to fix the payment — it adds no grace of its own', () => {
    const { body } = premiumCopyFor({ kind: 'entitled', subscription: 'grace', endsOn: '2026-11-16T00:00:00Z' }, 'Daily Load', fmt);
    assert.match(body, /«2026-11-16T00:00:00Z»/);
    assert.match(body, /payment method/i);
  });

  test('a canceled-but-paid subscription says it stays on through the paid term', () => {
    assert.match(premiumCopyFor({ kind: 'entitled', subscription: 'canceled', endsOn: '2026-11-13T00:00:00Z' }, 'Daily Load', fmt).body, /won’t renew[\s\S]*«2026-11-13T00:00:00Z»/);
  });

  test('every restore and paywall outcome has words, none leaks an SDK message, and "no purchases" names the other-account cause', () => {
    const outcomes = [
      { kind: 'purchased' }, { kind: 'restored' }, { kind: 'already_entitled' }, { kind: 'cancelled' }, { kind: 'no_offering' }, { kind: 'unavailable' }, { kind: 'error', message: 'StoreKit SKErrorDomain 2' },
      { kind: 'restore', restore: { kind: 'restored' } }, { kind: 'restore', restore: { kind: 'no_purchases_found' } }, { kind: 'restore', restore: { kind: 'unavailable' } }, { kind: 'restore', restore: { kind: 'error', message: 'private' } },
    ];
    for (const outcome of outcomes) {
      const notice = purchaseOutcomeNotice(outcome);
      assert.ok(notice && notice.message.length > 10, JSON.stringify(outcome));
      assert.doesNotMatch(notice.message, /StoreKit|SKErrorDomain|private/);
    }
    assert.match(purchaseOutcomeNotice({ kind: 'restore', restore: { kind: 'no_purchases_found' } }).message, /different (store|Her Keys) account/i);
    assert.equal(purchaseOutcomeNotice({ kind: 'continued_without_plus' }), null);
  });
});

describe('client and server agree on the contract', () => {
  const types = readFileSync(new URL('../../supabase/functions/_shared/premium/types.ts', import.meta.url), 'utf8');
  const literals = (name) => {
    const block = types.slice(types.indexOf(`export type ${name} =`));
    assert.ok(types.indexOf(`export type ${name} =`) >= 0, `missing server type ${name}`);
    assert.ok(block.indexOf(';') >= 0, `unterminated server type ${name}`);
    return [...block.slice(0, block.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  test('entitlement states, authorization reasons and next actions are identical sets', () => {
    assert.deepEqual([...SERVER_ENTITLEMENT_STATES].sort(), literals('EntitlementState').sort());
    assert.deepEqual([...AUTHORIZATION_REASONS].sort(), literals('AuthorizationReason').sort());
    assert.deepEqual([...NEXT_ACTIONS].sort(), literals('NextAction').sort());
  });

  test('the entitled set matches the server\'s own isEntitled', async () => {
    const { isEntitled } = await import('../../supabase/functions/_shared/premium/entitlementState.ts');
    for (const state of SERVER_ENTITLEMENT_STATES) assert.equal(ENTITLED_STATES.includes(state), isEntitled(state), state);
  });
});

describe('the server client parses strictly', () => {
  const fake = ({ rpc = {}, invoke = {} } = {}) => createPremiumServerClient({
    rpc: async (name) => rpc[name] ?? { data: null, error: { message: 'x' } },
    functions: { invoke: async (name) => invoke[name] ?? { data: null, error: { message: 'x' } } },
  });

  test('a well-formed entitlement is parsed; anything else is "unavailable", never an interpretation', async () => {
    const good = await fake({ rpc: { premium_my_entitlement: { data: { state: 'premium_active', expiresAt: '2026-11-13T00:00:00Z', canceled: false, needsReconcile: false, checkedAt: 'x' }, error: null } } }).entitlement();
    assert.equal(good.kind, 'ok');
    assert.equal(good.value.state, 'premium_active');
    for (const data of [null, 'x', { state: 'platinum' }, { state: 'premium_active', canceled: 'yes' }, [], {}]) {
      assert.equal((await fake({ rpc: { premium_my_entitlement: { data, error: null } } }).entitlement()).kind, 'unavailable', JSON.stringify(data));
    }
    assert.equal((await fake({ rpc: { premium_my_entitlement: { data: { state: 'free' }, error: { message: 'boom' } } } }).entitlement()).kind, 'unavailable');
  });

  test('a throwing transport is unavailable, not an exception', async () => {
    const client = createPremiumServerClient({ rpc: async () => { throw new Error('network'); }, functions: { invoke: async () => { throw new Error('network'); } } });
    assert.equal((await client.entitlement()).kind, 'unavailable');
    assert.equal((await client.manifest()).kind, 'unavailable');
    assert.equal((await client.verify()).kind, 'unavailable');
    assert.equal((await client.authorize({ feature: 'x', idempotencyKey: 'k-0000001' })).kind, 'unavailable');
  });

  test('the manifest is validated field by field', async () => {
    const entry = { featureKey: 'daily_load_premium', displayName: 'Daily Load', tier: 'premium', available: true, requiresAiConsent: false, minAppVersion: null };
    assert.equal((await fake({ rpc: { premium_feature_manifest: { data: [entry], error: null } } }).manifest()).kind, 'ok');
    assert.equal((await fake({ rpc: { premium_feature_manifest: { data: [{ ...entry, tier: 'gold' }], error: null } } }).manifest()).kind, 'unavailable');
    assert.equal((await fake({ rpc: { premium_feature_manifest: { data: [{ ...entry, premiumLimit: 5 }], error: null } } }).manifest()).kind, 'ok', 'extra server fields are tolerated, never surfaced');
  });

  test('a decision is parsed; a server 400 is "invalid", a 503 with a typed body is still an answer, a bare failure is unavailable', async () => {
    const body = { outcome: 'denied', reason: 'requires_premium', entitlementState: 'free', nextAction: 'open_paywall', quota: null, decisionId: 'd1', replay: false, via: null };
    const ok = await fake({ invoke: { 'premium-gate': { data: body, error: null } } }).authorize({ feature: 'f', idempotencyKey: 'k-0000001' });
    assert.equal(ok.kind, 'decision');
    assert.equal(ok.decision.nextAction, 'open_paywall');
    const bad = await fake({ invoke: { 'premium-gate': { data: null, error: { context: { status: 400 } } } } }).authorize({ feature: 'f', idempotencyKey: 'k-0000001' });
    assert.equal(bad.kind, 'invalid');
    const outage = await fake({ invoke: { 'premium-gate': { data: { outcome: 'denied', reason: 'service_unavailable', nextAction: 'retry_later' }, error: { context: { status: 503 } } } } }).authorize({ feature: 'f', idempotencyKey: 'k-0000001' });
    assert.equal(outage.kind, 'decision');
    assert.equal(outage.decision.reason, 'service_unavailable');
    assert.equal((await fake({ invoke: { 'premium-gate': { data: null, error: { context: { status: 500 } } } } }).authorize({ feature: 'f', idempotencyKey: 'k-0000001' })).kind, 'unavailable');
    assert.equal((await fake({ invoke: { 'premium-gate': { data: { outcome: 'allowed', reason: 'mystery' }, error: null } } }).authorize({ feature: 'f', idempotencyKey: 'k-0000001' })).kind, 'unavailable', 'an unknown reason is not trusted');
  });

  test('verify reports the server\'s typed status', async () => {
    assert.deepEqual(await fake({ invoke: { 'premium-reconcile': { data: { status: 'rate_limited', state: 'free' }, error: null } } }).verify(), { kind: 'ok', status: 'rate_limited' });
    assert.deepEqual(await fake({ invoke: { 'premium-reconcile': { data: { status: 'provider_unavailable' }, error: { context: { status: 503 } } } } }).verify(), { kind: 'ok', status: 'provider_unavailable' });
    assert.equal((await fake({ invoke: { 'premium-reconcile': { data: { status: 'dunno' }, error: null } } }).verify()).kind, 'unavailable');
  });

  test('the client never sends an account, a household-less entitlement or a Premium flag: the request it builds is the gate\'s strict schema', async () => {
    let sent;
    const client = createPremiumServerClient({ rpc: async () => ({ data: null, error: null }), functions: { invoke: async (_name, options) => { sent = options.body; return { data: null, error: { message: 'x' } }; } } });
    await client.authorize({ feature: 'daily_load_premium', householdId: 'h', idempotencyKey: 'k-0000001', appVersion: '1.0.0' });
    assert.deepEqual(Object.keys(sent).sort(), ['appVersion', 'feature', 'householdId', 'idempotencyKey']);
  });
});
