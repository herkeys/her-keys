import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {SECRET_NAMES, preflightLocal, eventFixture, signWebhook, verifyWebhook,
 projectionComparison, classifyWebhookResult} from '../../scripts-dev/premium-final-config/core.mjs';

function config() {
  return Object.fromEntries(['staging','production'].map(env=>[env,{
    PREMIUM_ENVIRONMENT:env,
    ...Object.fromEntries(SECRET_NAMES.map(n=>[n,randomBytes(32).toString('hex')]))
  }]));
}
test('full environment configuration passes; missing or shared values fail',()=>{
  const ok=config();assert.equal(preflightLocal(ok).passed,true);
  for(const env of ['staging','production']) for(const key of SECRET_NAMES){
    const missing=structuredClone(ok);delete missing[env][key];
    assert.equal(preflightLocal(missing).passed,false);
    const shared=structuredClone(ok);shared.production[key]=shared.staging[key];
    assert.equal(preflightLocal(shared).passed,false);
  }
  const mislabeled=structuredClone(ok);mislabeled.staging.PREMIUM_ENVIRONMENT='production';
  assert.equal(preflightLocal(mislabeled).passed,false);
  assert.equal(JSON.stringify(preflightLocal(ok)).includes(ok.staging.REVENUECAT_WEBHOOK_AUTH),false);
});
test('all provider lifecycle event types have local fixtures',()=>{
  const accountId='3bb7a180-a2db-4da0-b9b3-5a556fa25412';
  for(const type of ['INITIAL_PURCHASE','RENEWAL','CANCELLATION','UNCANCELLATION','EXPIRATION',
    'BILLING_ISSUE','PRODUCT_CHANGE','TRANSFER','SUBSCRIBER_ALIAS','NON_RENEWING_PURCHASE','TEST']){
    const event=eventFixture(type,{accountId});
    assert.equal(event.event.type,type);
    assert.equal(event.event.environment,'SANDBOX');
    assert.equal(event.event.entitlement_ids[0],'her_keys_plus');
  }
  assert.throws(()=>eventFixture('NOT_A_PROVIDER_EVENT'));
});
test('local HMAC contract rejects altered content, wrong key and stale timestamp',()=>{
  const raw=JSON.stringify(eventFixture('TEST'));
  const key=randomBytes(32).toString('hex');
  const now=Math.floor(Date.now()/1000);
  const signature=signWebhook(raw,key,now);
  assert.equal(verifyWebhook(raw,signature,key,now*1000),true);
  assert.equal(verifyWebhook(raw+' ',signature,key,now*1000),false);
  assert.equal(verifyWebhook(raw,signature,randomBytes(32).toString('hex'),now*1000),false);
  assert.equal(verifyWebhook(raw,signWebhook(raw,key,now-301),key,now*1000),false);
  assert.equal(verifyWebhook(raw,'',key,now*1000),false);
});
test('categorize failure, replay receipt and provider mismatch without granting access',()=>{
  assert.equal(classifyWebhookResult(503,{error:'not_configured'}),'missing_dashboard_configuration');
  assert.equal(classifyWebhookResult(401,{}),'unauthorized');
  assert.equal(classifyWebhookResult(200,{status:'ignored_test'}),'ignored_test');
  const subscription={subscriber:{entitlements:{her_keys_plus:{expires_date:null}}}};
  assert.equal(projectionComparison(subscription,null).category,'missing');
  assert.equal(projectionComparison(subscription,{state:'free',needs_reconcile:false}).category,'conflicting');
  assert.equal(projectionComparison(subscription,{state:'premium_active',needs_reconcile:false}).matched,true);
});
