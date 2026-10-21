import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionDatabase } from '../../supabase/tests/deletion-database.mjs';
import { createPremiumServerClient } from '../../src/monetization/premiumServerClient.ts';
test('Test Store checkout is Staging-only, tester-only and independent of commercial checkout',async()=>{
 const db=await deletionDatabase();const a='11111111-1111-4111-8111-111111111111';
 try{
  await db.exec(`alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'; insert into auth.users(id) values ('${a}');
   update public.premium_runtime_config set environment='staging',test_store_checkout_enabled=true,checkout_enabled=false;
   update public.premium_feature_config set enabled=true,released=true,rollout_status='staging_only' where feature_key in ('daily_load_premium','smart_inbox_extract','momentum_report');
   select set_config('request.jwt.claims','{"sub":"${a}"}',false); set role authenticated;`);
  const readiness=async name=>(await db.query('select public.'+name+'() as r')).rows[0].r;
  assert.equal((await readiness('premium_purchase_readiness')).ready,false);
  assert.deepEqual(await readiness('premium_test_store_purchase_readiness'),{ready:false,reason:'tester_not_eligible'});
  await db.exec(`reset role; update auth.users set raw_app_meta_data='{"herkeys_premium_tester":true}' where id='${a}'; set role authenticated;`);
  assert.deepEqual(await readiness('premium_test_store_purchase_readiness'),{ready:true,reason:'ready'});
  assert.equal((await readiness('premium_purchase_readiness')).ready,false);
  await db.exec('reset role;');
  await assert.rejects(db.exec("update public.premium_runtime_config set environment='production'"),/premium_test_store_staging_only/);
  await db.exec("update public.premium_runtime_config set test_store_checkout_enabled=false,environment='production',allow_test_fixtures=false");
  assert.equal((await readiness('premium_test_store_purchase_readiness')).ready,false);
 }finally{await db.close();}
});
test('the client chooses the separate readiness RPC only for an explicit Test Store build',async()=>{
 const old=process.env.EXPO_PUBLIC_REVENUECAT_STORE;const names=[];
 const client=createPremiumServerClient({rpc:async name=>{names.push(name);return {data:{ready:false,reason:'checkout_disabled'},error:null};}});
 try{
  process.env.EXPO_PUBLIC_REVENUECAT_STORE='test';await client.purchaseReadiness();
  process.env.EXPO_PUBLIC_REVENUECAT_STORE='native';await client.purchaseReadiness();
  assert.deepEqual(names,['premium_test_store_purchase_readiness','premium_purchase_readiness']);
 }finally{if(old===undefined)delete process.env.EXPO_PUBLIC_REVENUECAT_STORE;else process.env.EXPO_PUBLIC_REVENUECAT_STORE=old;}
});
