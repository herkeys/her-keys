import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagingActivationProof } from '../../scripts-dev/premium-final-config/core.mjs';

const accountId = 'a0380c6d-a220-4cc3-8c55-1eb612e5709c';
const otherId = 'fd1b6c84-5b7f-4b94-8dfb-9cb188e9e2af';
const now = Date.parse('2026-10-14T20:00:00.000Z');
const day = 86400000;
const iso = (ms) => new Date(ms).toISOString();
function evidence() {
  const expiry = iso(now + day);
  return {
    provider: {subscriber:{
      original_app_user_id:accountId,
      aliases:[accountId],
      entitlements:{her_keys_plus:{product_identifier:'native.test.monthly',expires_date:expiry}},
      subscriptions:{'native.test.monthly':{store:'app_store',is_sandbox:true,expires_date:expiry,refunded_at:null}}
    }},
    projection: {
      account_id:accountId, source:'reconcile',environment:'SANDBOX',product_id:'native.test.monthly',
      store:'app_store',has_entitlement:true,expires_at:expiry,grace_expires_at:null,revoked_at:null,
      last_reconciled_at:iso(now - 10_000),needs_reconcile:false,state:'premium_active'
    }
  };
}
function check(change) {
  const {provider,projection}=evidence();
  change(provider,projection);
  return stagingActivationProof(provider,projection,accountId,now);
}
test('only an account-matched, freshly reconciled native Sandbox subscriber qualifies',()=>{
  const {provider,projection}=evidence();
  assert.deepEqual(stagingActivationProof(provider,projection,accountId,now),{
    eligible:true,reason:'native_sandbox_provider_and_projection_match'
  });
  assert.equal(stagingActivationProof(provider,projection,otherId,now).eligible,false);
});
test('synthetic fixture, missing provider, missing entitlement and false account deny',()=>{
  assert.equal(stagingActivationProof(null,evidence().projection,accountId,now).reason,'missing_subscriber');
  assert.equal(check(p=>{p.subscriber.entitlements={};}).reason,'missing_provider_entitlement');
  assert.equal(check(p=>{p.subscriber.subscriptions['native.test.monthly'].store='TEST_STORE';}).reason,'unverified_native_sandbox_store');
  assert.equal(check(p=>{p.subscriber.subscriptions['native.test.monthly'].is_sandbox=false;}).reason,'unverified_native_sandbox_store');
  assert.equal(check(p=>{p.subscriber.subscriptions={};}).reason,'unverified_native_sandbox_store');
});
test('identity aliases, account switch, and transfer uncertainty deny',()=>{
  assert.equal(check(p=>{p.subscriber.aliases.push(otherId);}).reason,'ambiguous_provider_identity');
  assert.equal(check(p=>{p.subscriber.original_app_user_id=otherId;}).reason,'ambiguous_provider_identity');
  assert.equal(check(p=>{delete p.subscriber.original_app_user_id;}).reason,'ambiguous_provider_identity');
  assert.equal(check(p=>{delete p.subscriber.aliases;}).eligible,true); // Official REST v1 response omits aliases.
  assert.equal(check(p=>{p.subscriber.aliases='unknown';}).reason,'ambiguous_provider_identity');
});
test('expired, refunded, invalid provider dates deny including missing subscription expiry',()=>{
  assert.equal(check((p,d)=>{p.subscriber.entitlements.her_keys_plus.expires_date=iso(now-1000);p.subscriber.subscriptions['native.test.monthly'].expires_date=iso(now-1000);d.expires_at=iso(now-1000);}).reason,'expired_provider_entitlement');
  assert.equal(check(p=>{p.subscriber.subscriptions['native.test.monthly'].refunded_at=iso(now-1000);}).reason,'provider_refund');
  assert.equal(check(p=>{p.subscriber.subscriptions['native.test.monthly'].expires_date=null;}).reason,'invalid_provider_dates');
  assert.equal(check(p=>{p.subscriber.subscriptions['native.test.monthly'].expires_date=iso(now+day*3);}).reason,'invalid_provider_dates');
});
test('fresh provider cannot activate an old, dirty, fake or mismatched projection',()=>{
  assert.equal(check((p,d)=>{d.last_reconciled_at=iso(now-300001);}).reason,'stale_projection');
  assert.equal(check((p,d)=>{d.last_reconciled_at=null;}).reason,'stale_projection');
  assert.equal(check((p,d)=>{d.source='test_fixture';}).reason,'untrusted_projection');
  assert.equal(check((p,d)=>{d.source='webhook';}).reason,'untrusted_projection');
  assert.equal(check((p,d)=>{d.needs_reconcile=true;}).reason,'untrusted_projection');
  assert.equal(check((p,d)=>{d.environment='PRODUCTION';}).reason,'untrusted_projection');
  assert.equal(check((p,d)=>{d.revoked_at=iso(now);}).reason,'untrusted_projection');
  assert.equal(check((p,d)=>{d.product_id='another';}).reason,'projection_provider_mismatch');
  assert.equal(check((p,d)=>{d.store='PLAY_STORE';}).reason,'projection_provider_mismatch');
  assert.equal(check((p,d)=>{d.expires_at=iso(now+day*3);}).reason,'projection_expiry_mismatch');
  assert.equal(check((p,d)=>{d.state='deletion_pending';}).reason,'not_entitled');
});
test('provider and projection must agree on an unexpired grace period',()=>{
  assert.equal(check((p,d)=>{
    const x=iso(now-1000),g=iso(now+3600000);
    p.subscriber.entitlements.her_keys_plus.expires_date=x;
    p.subscriber.entitlements.her_keys_plus.grace_period_expires_date=g;
    p.subscriber.subscriptions['native.test.monthly'].expires_date=x;
    d.expires_at=x;d.grace_expires_at=g;d.state='premium_billing_grace';
  }).eligible,true);
  assert.equal(check((p,d)=>{
    const x=iso(now-1000),g=iso(now+3600000);
    p.subscriber.entitlements.her_keys_plus.expires_date=x;
    p.subscriber.entitlements.her_keys_plus.grace_period_expires_date=g;
    p.subscriber.subscriptions['native.test.monthly'].expires_date=x;
    d.expires_at=x;d.grace_expires_at=null;d.state='premium_billing_grace';
  }).reason,'projection_grace_mismatch');
});
test('CLI requires provider lookup within enable and cannot accept local synthetic receipt',()=>{
  const cli=readFileSync(new URL('../../scripts-dev/premium-final-config.mjs',import.meta.url),'utf8');
  const activation=cli.slice(cli.indexOf('async function setWindow('),cli.indexOf('async function signedSmoke('));
  assert.match(activation,/--provider-test-event-id/);
  assert.match(activation,/providerEventId\.startsWith\('hk-preflight-'\)/);
  assert.match(activation,/api\.revenuecat\.com\/v1\/subscribers/);
  assert.match(activation,/stagingActivationProof\(rcCall\.data,projected,accountId\)/);
  assert.match(activation,/config\.premium_enabled===true && config\.webhook_processing===true/);
  assert.match(activation,/fail-closed rollback attempted/);
  assert.doesNotMatch(activation,/\.from\('premium_entitlements'\)\.update\(/);
});
