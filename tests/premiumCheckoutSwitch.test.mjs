import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ready = read('supabase/migrations/20261016012000_premium_purchase_readiness.sql');
const switchSql = read('supabase/migrations/20261016013000_premium_checkout_independent_activation.sql');
const client = read('src/monetization/premiumServerClient.ts');
const provider = read('src/monetization/PremiumStateProvider.tsx');
const requestOwner = read('src/monetization/premiumRequestOwner.ts');

describe('Premium Production fulfillment and checkout separation', () => {
  test('commercial checkout is independently false by default on every new installation', () => {
    assert.match(switchSql, /ADD COLUMN IF NOT EXISTS checkout_enabled boolean NOT NULL DEFAULT false;/);
    assert.match(switchSql, /IF EXISTS \(SELECT 1 FROM public\.premium_runtime_config WHERE checkout_enabled\)/);
    assert.match(switchSql, /RAISE EXCEPTION 'checkout_enabled_must_remain_false_at_install'/);
  });
  test('paid checkout requires explicit switch, backend fulfillment, approved features, and authenticated account', () => {
    assert.match(switchSql, /IF NOT v_runtime\.webhook_processing THEN/);
    assert.match(switchSql, /IF NOT v_runtime\.checkout_enabled THEN/);
    assert.match(switchSql, /'reason', 'checkout_disabled'/);
    assert.match(switchSql, /'daily_load_premium', 'smart_inbox_extract', 'momentum_report'/);
    assert.match(switchSql, /rollout_status = 'general' AND limit_status = 'owner_approved'/);
    assert.match(switchSql, /v_account uuid := auth\.uid\(\)/);
    assert.doesNotMatch(switchSql, /p_account_id|p_entitlement_id|p_user_id/);
  });
  test('anonymous clients cannot query privileged paid readiness', () => {
    assert.match(switchSql, /REVOKE ALL ON FUNCTION public\.premium_purchase_readiness\(\) FROM PUBLIC;/);
    assert.match(switchSql, /REVOKE ALL ON FUNCTION public\.premium_purchase_readiness\(\) FROM anon;/);
    assert.match(switchSql, /GRANT EXECUTE ON FUNCTION public\.premium_purchase_readiness\(\) TO authenticated;/);
  });
  test('existing Staging function is preserved as the prior migration; never silently edit it', () => {
    assert.doesNotMatch(ready, /checkout_enabled/);
    assert.match(ready, /public\.premium_account_lifecycle\(v_account\)/);
  });
  test('onboarding and feature paywalls ask server identity eligibility before native checkout', () => {
    assert.match(client, /premiumRpc\(client, owner, process\.env\.EXPO_PUBLIC_REVENUECAT_STORE === 'test' \? 'premium_test_store_purchase_readiness' : 'premium_purchase_readiness'\)/);
    assert.match(requestOwner, /client\.rpc\(name, args\)/);
    assert.match(requestOwner, /session\.user\.id !== owner\.accountId/);
    assert.match(requestOwner, /request\.setHeader\('Authorization', authorization\)/);
    assert.match(client, /timeout|setTimeout/);
    assert.match(provider, /const readiness = await client\.purchaseReadiness\?\.\(\)/);
    assert.match(provider, /readiness\?\.ready === true/);
    assert.match(provider, /outcome = ready && isCurrent\(\) \? await presentPaywall\(placement\)/);
  });
});
