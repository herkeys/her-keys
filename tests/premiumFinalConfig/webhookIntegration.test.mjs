import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {eventFixture,signWebhook} from '../../scripts-dev/premium-final-config/core.mjs';
import {parseWebhookBody,concernsPremium} from '../../supabase/functions/_shared/premium/events.ts';
import {verifyWebhookRequest} from '../../supabase/functions/_shared/premium/webhookAuth.ts';

const encode=(value)=>new TextEncoder().encode(JSON.stringify(value));
const id='2b643f3a-dd49-409c-9fdb-0e1ea18f1831';
const auth=randomBytes(32).toString('hex');
const secret=randomBytes(32).toString('hex');
const config={authorizationSecret:auth,hmacSecret:secret,requireHmac:true,toleranceSeconds:300};

test('every locally generated provider event parses through the EXACT shipped webhook parser',()=>{
 const types=['INITIAL_PURCHASE','RENEWAL','CANCELLATION','UNCANCELLATION','EXPIRATION',
   'BILLING_ISSUE','PRODUCT_CHANGE','TRANSFER','SUBSCRIBER_ALIAS','NON_RENEWING_PURCHASE','TEST'];
 for(const type of types){
   const fixture=eventFixture(type,{accountId:id});
   const parsed=parseWebhookBody(encode(fixture));
   assert.equal(parsed.ok,true,type);
   assert.equal(parsed.event.event_type,type);
   assert.equal(parsed.event.environment,'SANDBOX');
   if(type!=='TEST')assert.equal(concernsPremium(parsed.event),'yes');
 }
});
test('locally generated raw-body signatures verify against the EXACT shipped HMAC validator',async()=>{
 const raw=JSON.stringify(eventFixture('TEST',{accountId:id}));
 const rawBody=new TextEncoder().encode(raw);
 const nowMs=Date.now();
 const signature=signWebhook(raw,secret,Math.floor(nowMs/1000));
 const input={rawBody,authorizationHeader:auth,signatureHeader:signature,config,nowMs};
 assert.deepEqual(await verifyWebhookRequest(input),{ok:true,hmacVerified:true});
 assert.equal((await verifyWebhookRequest({...input,authorizationHeader:null})).ok,false);
 assert.equal((await verifyWebhookRequest({...input,authorizationHeader:'incorrect'})).ok,false);
 assert.equal((await verifyWebhookRequest({...input,signatureHeader:null})).ok,false);
 assert.equal((await verifyWebhookRequest({...input,signatureHeader:signWebhook(raw,randomBytes(32).toString('hex'),Math.floor(nowMs/1000))})).ok,false);
 assert.equal((await verifyWebhookRequest({...input,signatureHeader:signWebhook(raw,secret,Math.floor(nowMs/1000)-301)})).ok,false);
 assert.equal((await verifyWebhookRequest({...input,rawBody:new TextEncoder().encode(raw+' ')})).ok,false);
});
test('bad fixture and maliciously malformed provider payloads fail without a grant',()=>{
 assert.equal(parseWebhookBody(new Uint8Array()).ok,false);
 assert.equal(parseWebhookBody(new TextEncoder().encode('not json')).ok,false);
 const bad=eventFixture('INITIAL_PURCHASE',{accountId:id});
 bad.event.environment='UNKNOWN';
 assert.equal(parseWebhookBody(encode(bad)).ok,false);
 const wrong=eventFixture('INITIAL_PURCHASE',{accountId:id});
 wrong.event.entitlement_ids=['unrelated'];
 const parsed=parseWebhookBody(encode(wrong));
 assert.equal(parsed.ok,true);
 assert.equal(concernsPremium(parsed.event),'no');
});
