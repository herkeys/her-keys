import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionDatabase as fullChainDatabase } from '../supabase/tests/deletion-database.mjs';

// Disposable embedded PostgreSQL only. No hosted users, purchases, entitlements,
// lifecycle commands, configuration or schema are created/changed by this test.
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
test('shared backend SQL privileges, consent and household isolation after the complete migration chain', async t => {
  const db=await fullChainDatabase(); t.after(()=>db.close());
  const q=(sql,args=[])=>db.query(sql,args);
  const as=async(id,fn)=>{
    await q('set role authenticated');
    await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id}:{})]);
    try{return await fn();}finally{await q('reset role');}
  };
  for(const id of [A,B]){
    await q('insert into auth.users(id,email) values($1,$2)',[id,'synthetic-'+id+'@local.test']);
    await as(id,()=>q("select public.bootstrap_account(gen_random_uuid(),'UTC',null)"));
  }
  const household=async id=>(await q('select household_id from public.household_members where profile_id=$1',[id])).rows[0].household_id;
  const HA=await household(A),HB=await household(B);
  const recordConsent=id=>as(id,()=>q("insert into public.account_consents(account_id,consent_type,policy_version,granted) values($1,'ai_processing','ai-data-processing-initial-v1',true)",[id]));
  await recordConsent(A); await recordConsent(B);
  await t.test('consumer SELECT sees only its own consent receipts',async()=>{
    for(const id of [A,B]){
      const rows=(await as(id,()=>q('select account_id from public.account_consents'))).rows;
      assert.deepEqual(rows.map(r=>r.account_id),[id]);
    }
  });
  await t.test('cross-account consent append is rejected by RLS',async()=>{
    await assert.rejects(as(A,()=>q("insert into public.account_consents(account_id,consent_type,policy_version,granted) values($1,'ai_processing','v',true)",[B])),/row-level security/);
  });
  await t.test('server timestamp, update and delete cannot be forged by a consumer',async()=>{
    await assert.rejects(as(A,()=>q("insert into public.account_consents(account_id,consent_type,policy_version,granted,recorded_at) values($1,'ai_processing','v',true,now())",[A])),/permission denied/);
    await assert.rejects(as(A,()=>q('update public.account_consents set granted=false')),/permission denied/);
    await assert.rejects(as(A,()=>q('delete from public.account_consents')),/permission denied/);
  });
  await t.test('withdrawal is append-only and becomes the latest authoritative decision',async()=>{
    await as(A,()=>q("insert into public.account_consents(account_id,consent_type,policy_version,granted) values($1,'ai_processing','ai-data-processing-initial-v1',false)",[A]));
    const rows=(await as(A,()=>q('select granted from public.account_consents order by recorded_at desc,id desc'))).rows;
    assert.equal(rows.length,2); assert.equal(rows[0].granted,false);
  });
  await t.test('one household cannot read or rename the other household',async()=>{
    assert.equal((await as(A,()=>q('select id from public.households where id=$1',[HA]))).rows.length,1);
    assert.equal((await as(A,()=>q('select id from public.households where id=$1',[HB]))).rows.length,0);
    const before=(await q('select display_name from public.households where id=$1',[HB])).rows;
    await assert.rejects(as(A,()=>q("update public.households set display_name='attempted cross-account edit' where id=$1 returning id",[HB])),/permission denied/);
    assert.deepEqual((await q('select display_name from public.households where id=$1',[HB])).rows,before);
  });
  await t.test('consumer cannot invoke service authorization with another account',async()=>{
    await assert.rejects(as(A,()=>q("select public.premium_authorize($1,'daily_load_premium',$2,'synthetic-key')",[B,HB])),/permission denied/);
    await assert.rejects(as(A,()=>q("select public.premium_apply_projection($1,0,'{}')",[B])),/permission denied/);
    await assert.rejects(as(A,()=>q("select public.premium_record_event('{}')")),/permission denied/);
  });
  await t.test('service receipts and provider identities are invisible to consumers',async()=>{
    for(const table of ['premium_events','premium_subscriber_identities','premium_runtime_config']){
      await assert.rejects(as(A,()=>q('select * from public.'+table)),/permission denied/);
    }
  });
  await t.test('privileged decision RPC derives identity and checks household ownership',async()=>{
    await assert.rejects(as(A,()=>q("select public.premium_decision_record($1,'daily_load_premium','daily_load.review','synthetic-key','{}',$2)",[HB,'0'.repeat(64)])),/ownership_denied/);
    await assert.rejects(as(A,()=>q("select public.premium_decision_record($1,'daily_load_premium','daily_load.review','synthetic-key','{}',$2)",[HA,'0'.repeat(64)])),/not_authorized/);
    await assert.rejects(as(null,()=>q("select public.premium_decision_record($1,'daily_load_premium','daily_load.review','synthetic-key','{}',$2)",[HA,'0'.repeat(64)])),/not_authenticated/);
  });
  await t.test('readiness cannot enable checkout and does not accept another account argument',async()=>{
    const result=await as(A,()=>q('select public.premium_purchase_readiness() as r'));
    assert.equal(result.rows[0].r.ready,false);
    await assert.rejects(as(A,()=>q('select public.premium_purchase_readiness($1::uuid)',[B])),/does not exist/);
  });
  await t.test('provider-event deduplication is durable in SQL and scoped by environment',async()=>{
    const event={event_id:'synthetic-test-event',event_type:'TEST',environment:'SANDBOX'};
    const receipt=async e=>(await q('select public.premium_record_event($1::jsonb) as r',[JSON.stringify(e)])).rows[0].r;
    const first=await receipt(event),duplicate=await receipt(event),other=await receipt({...event,environment:'PRODUCTION'});
    assert.equal(first.duplicate,false);assert.equal(duplicate.duplicate,true);
    assert.equal(first.id,duplicate.id);assert.notEqual(first.id,other.id);
    assert.equal((await q('select count(*) as n from public.premium_entitlements')).rows[0].n,0);
  });
  await t.test('anonymous callers cannot read consent, provider receipts or invoke readiness',async()=>{
    await q('set role anon');
    try{
      for(const sql of ['select * from public.account_consents','select * from public.premium_events','select public.premium_purchase_readiness()']){
        await assert.rejects(q(sql),/permission denied/);
      }
    }finally{await q('reset role');}
  });
});

