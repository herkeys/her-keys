import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const S='aaaaaaaa-1111-4111-8111-111111111111';
test('V2 deletion: cross-account event redaction, private review history and independent terminal checks',async t=>{
 const db=await deletionDatabase();t.after(()=>db.close());
 const q=(sql,args=[])=>db.query(sql,args);
 const cmd=async(action,args={})=>(await q('select public.herkeys_deletion_command($1,$2::jsonb) r',[action,JSON.stringify(args)])).rows[0].r;
 for(const actor of [A,B]) {
  await q('insert into auth.users(id,email) values($1,$2)',[actor,actor+'@local.test']);
  await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${actor}"}';select public.bootstrap_account(gen_random_uuid(),'UTC',null);reset role;`);
  await q("insert into private.ai_response_reports(account_id,surface,message_id,reason,client_dedupe_key,review_history) values($1,'talk_it_out','fixture','unsafe',gen_random_uuid(),$2)",
   [actor,JSON.stringify([{reviewerId:A,from:'pending',to:'reviewing'}])]);
 }
 await q("insert into public.premium_subscriber_identities(provider_user_id,account_id,kind,status,source) values('owned-alias',$1,'alias','verified','reconcile')",[A]);
 const mixed=(await q(`insert into public.premium_events(event_id,environment,event_type,account_id,app_user_id,original_app_user_id,aliases,transferred_from,transferred_to,payload)
  values('mixed-transfer','SANDBOX','TRANSFER',$1::text::uuid,$1::text,$2::text,jsonb_build_array($1::text,$2::text,'owned-alias'),jsonb_build_array($2::text),jsonb_build_array($1::text),jsonb_build_object('nested',jsonb_build_array($1::text,$2::text,'owned-alias'))) returning id`,[B,A])).rows[0].id;
 const untouched=(await q("insert into public.premium_events(event_id,environment,event_type,account_id,app_user_id) values('unrelated','SANDBOX','RENEWAL',$1::text::uuid,$1::text) returning to_jsonb(premium_events) row",[B])).rows[0].row;
 await q('insert into auth.sessions(id,user_id) values($1,$2)',[S,A]);
 const request=await cmd('request',{account_id:A,session_id:S,receipt_hash:'v'.repeat(43),recovery_hash:'w'.repeat(43)});
 await cmd('deactivation_ack',{request_id:request.request_id,auth_ban:true});
 await q("update public.account_deletion_requests set requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' where id=$1",[request.request_id]);
 await db.exec('update public.account_deletion_control set enabled=true,dry_run=false');
 const claim=(await cmd('claim')).requests[0],args={request_id:claim.id,fence:claim.fence};
 await t.test('expired requests remain visible to monitoring when processing is disabled',async()=>{
  await db.exec('begin');try{
   await db.exec('update public.account_deletion_control set enabled=false');
   assert.equal((await cmd('health')).overdue_requests,1);
  }finally{await db.exec('rollback');}
 });
 await t.test('scoped processing requires a live allowlist and cannot drain unrelated mail',async()=>{
  await db.exec('begin');try {
   await db.exec('update public.account_deletion_control set test_scope_only=true');
   await db.exec('savepoint refused');
   await assert.rejects(cmd('check',args),/lease_or_control_refused/);await db.exec('rollback to refused');
   await q("insert into private.deletion_test_scope values($1,now()+interval '1 minute')",[A]);
   assert.equal((await cmd('check',args)).account_id,A);assert.deepEqual(await cmd('claim_email'),[]);
   await q("update private.deletion_test_scope set expires_at=now()-interval '1 second' where account_id=$1",[A]);
   await assert.rejects(cmd('check',args),/lease_or_control_refused/);
  } finally {await db.exec('rollback');}
 });
 await t.test('an account identifier added to global configuration must be reclassified',async()=>{
  await db.exec('begin');try {
   await db.exec('alter table public.premium_runtime_config add column account_id uuid');
   await assert.rejects(cmd('database_cleanup',args),/unclassified_relationship:public.premium_runtime_config/);
  } finally {await db.exec('rollback');}
 });
 await t.test('new client-readable ledger and definer RPCs refuse deactivated actors',async()=>{
  await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${A}"}'`);
  try {
   assert.equal((await q('select * from public.premium_decisions')).rows.length,0);
   await assert.rejects(q("select public.premium_decision_transition(gen_random_uuid(),'approved')"),/account_deactivated/);
   await assert.rejects(q("select public.submit_ai_response_report('talk_it_out','fixture','unsafe',gen_random_uuid())"),/account_deactivated/);
  } finally {await db.exec('reset role');}
  await assert.rejects(q('insert into public.premium_reconcile_state(account_id) values($1)',[A]),/account_deactivated/);
 });
 for(const table of ['public.unknown_application_fixture','private.unknown_private_fixture','public.account_deletion_unknown_fixture']) {
  await t.test('unknown schema resource fails closed with its name: '+table,async()=>{
   await db.exec('begin');try {
    await db.exec('create table '+table+'(id uuid)');
    await assert.rejects(cmd('database_cleanup',args),error=>error.message.includes('unclassified_resource:'+table));
   } finally {await db.exec('rollback');}
  });
 }
 await cmd('cleanup_safe',args);await cmd('database_cleanup',args);
 await t.test('only the explicitly optional welcome ledger may be absent at verification',async()=>{
  for(const [table,optional]of [['herkeys_welcome_email_receipts',true],['premium_reconcile_state',false]]){
   await db.exec('begin');try{
    await db.exec('drop table public.'+table+' cascade');
    if(optional)await q('select private.deletion_verify_resources($1,$2)',[A,claim.id]);
    else await assert.rejects(q('select private.deletion_verify_resources($1,$2)',[A,claim.id]),/terminal_verification_failed:missing_resource:premium_reconcile_state/);
   }finally{await db.exec('rollback');}
  }
 });
 await t.test('exact provider identity redaction preserves the other adult and idempotency',async()=>{
  const row=(await q('select * from public.premium_events where id=$1',[mixed])).rows[0];
  assert.equal(row.account_id,B);assert.equal(row.app_user_id,B);assert.equal(row.original_app_user_id,null);
  assert.deepEqual(row.aliases,[B]);assert.deepEqual(row.transferred_from,[]);assert.deepEqual(row.transferred_to,[B]);
  assert.deepEqual(row.payload,{nested:[B]});assert.equal(row.event_id,'mixed-transfer');
  assert.deepEqual((await q('select to_jsonb(e) row from public.premium_events e where id=$1',[untouched.id])).rows[0].row,untouched);
  assert.equal((await q('select count(*) n from private.ai_response_reports where account_id=$1',[A])).rows[0].n,0);
  const other=(await q('select review_history from private.ai_response_reports where account_id=$1',[B])).rows[0];
  assert.deepEqual(other.review_history,[{reviewerId:null,from:'pending',to:'reviewing'}]);
 });
 for(const missing of ['database','auth','storage','providers'])await t.test('missing '+missing+' evidence cannot finish',async()=>{
  await db.exec('begin');try {
   await q('delete from auth.users where id=$1',[A]);
   await q('update public.account_deletion_requests set evidence=$2 where id=$1',[claim.id,JSON.stringify(Object.fromEntries(['database','auth','storage','providers'].filter(x=>x!==missing).map(x=>[x,true])))]);
   await assert.rejects(cmd('finish',args),/terminal_verification_failed/);
  } finally {await db.exec('rollback');}
 });
 await t.test('claimed booleans cannot hide actual storage',async()=>{
  await db.exec('begin');try {
   await q('delete from auth.users where id=$1',[A]);
   await q("update public.account_deletion_requests set evidence=evidence||'{\"auth\":true,\"storage\":true,\"providers\":true}' where id=$1",[claim.id]);
   await q("insert into storage.objects(bucket_id,name,owner_id) values('fixture','owned', $1)",[A]);
   await assert.rejects(cmd('finish',args),/terminal_verification_failed:storage_remaining/);
  } finally {await db.exec('rollback');}
 });
 await t.test('independent verification rejects late private metadata and provider aliases',async()=>{
  for(const sql of [
   `insert into private.ai_response_reports(account_id,surface,message_id,reason,client_dedupe_key) values('${A}','talk_it_out','late','other',gen_random_uuid())`,
   `update public.premium_events set aliases=jsonb_build_array('owned-alias') where id='${mixed}'`
  ]) {
   await db.exec('begin');try {
    await db.exec(sql);
    await assert.rejects(cmd('finish',args),/terminal_verification_failed:custom_resource_remaining/);
   } finally {await db.exec('rollback');}
  }
 });
 await t.test('successful retry recounts resources and keeps only approved minimal proof',async()=>{
  for(const resource of ['auth','providers','storage'])await cmd('evidence',{...args,resource,result:true});
  await q('delete from auth.users where id=$1',[A]);await cmd('finish',args);
  const proof=(await q('select * from public.account_deletion_terminal_proofs')).rows[0];
  assert.deepEqual(Object.keys(proof).sort(),['expires_at','purged_at','receipt_hash','resource_counts','verified_at']);
  assert.ok(proof.resource_counts.verified_resource_groups>=52);
  assert.ok(!JSON.stringify(proof).includes(A));assert.ok(!JSON.stringify(proof).includes('owned-alias'));
  assert.equal((await q('select count(*) n from auth.users where id=$1',[B])).rows[0].n,1);
  const late=(await q(`insert into public.premium_events(event_id,environment,event_type,account_id,app_user_id,aliases)
   values('late-deleted-account','SANDBOX','TRANSFER',$1::text::uuid,$2::text,jsonb_build_array($1::text,$2::text)) returning account_id,app_user_id,aliases`,[B,A])).rows[0];
  assert.deepEqual(late,{account_id:B,app_user_id:null,aliases:[B]});
 });
});
