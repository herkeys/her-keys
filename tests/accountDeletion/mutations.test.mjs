import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';
const A='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-1111-4111-8111-111111111111';
test('critical lifecycle negative controls detect unsafe guard mutations',async t=>{
 const db=await deletionDatabase();t.after(()=>db.close());
 await db.query('insert into auth.users(id,email) values($1,$2)',[A,'fixture@local.test']);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[S,A]);
 await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${A}"}';select public.bootstrap_account(gen_random_uuid(),'UTC',null);reset role;`);
 const cmd=async(action,args={})=>(await db.query('select public.herkeys_deletion_command($1,$2::jsonb) as r',[action,JSON.stringify(args)])).rows[0].r;
 const request=await cmd('request',{account_id:A,session_id:S,receipt_hash:'r'.repeat(43),recovery_hash:'t'.repeat(43)});
 await db.exec('update public.account_deletion_control set enabled=true,dry_run=false');
 async function mutation(work){await db.exec('begin');try{await work();}finally{await db.exec('rollback');}}
 await t.test('removing the restrictive policy exposes stale-JWT profile access',async()=>{
  await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${A}"}'`);
  assert.equal((await db.query('select * from public.profiles')).rows.length,0);await db.exec('reset role');
  await mutation(async()=>{
   await db.exec('drop policy deletion_active_account on public.profiles');
   await db.exec(`set local role authenticated;set local request.jwt.claims='{"sub":"${A}"}'`);
   assert.equal((await db.query('select * from public.profiles')).rows.length,1);
  });
 });
 await t.test('granting command execution to authenticated crosses the worker authority boundary',async()=>{
  await mutation(async()=>{
   await db.exec('grant execute on function public.herkeys_deletion_command(text,jsonb) to authenticated;set local role authenticated');
   assert.equal((await cmd('claim')).enabled,true);
  });
 });
 await t.test('removing expiry eligibility makes an early purge claim possible',async()=>{
  assert.equal((await cmd('claim')).requests.length,0);
  await mutation(async()=>{
   const row=(await db.query("select oid,prosrc from pg_proc where oid='public.herkeys_deletion_command(text,jsonb)'::regprocedure")).rows[0];
   const definition=(await db.query('select pg_get_functiondef($1::oid) as body',[row.oid])).rows[0].body;
   const unsafe=definition.replace('AND grace_period_ends_at<=v_now AND coalesce(retry_at,v_now)<=v_now','AND coalesce(retry_at,v_now)<=v_now');
   assert.notEqual(unsafe,definition);await db.exec(unsafe);
   assert.equal((await cmd('claim')).requests.length,1);
  });
 });
 await t.test('approved shared policy deletes private records, restricts ambiguous records and preserves the other adult',async()=>{
  const B='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users(id,email) values($1,$2)',[B,'other@local.test']);
  await db.query("insert into public.profiles(id,timezone) values($1,'UTC')",[B]);
  await db.query(`insert into public.household_members(household_id,local_id,profile_id,member_type,role,scope)
   select household_id,'other-adult',$1,'adult','member','personal' from public.household_members where profile_id=$2`,[B,A]);
  for(const actor of [A,B])await db.query(`insert into public.goals(household_id,local_id,profile_id,title,status,producer,origin_created_at,origin_updated_at)
   select household_id,'private-goal',$1,'Private goal','active','user-action',now(),now() from public.household_members where profile_id=$2`,[actor,A]);
  await db.query("update public.account_deletion_requests set requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' where id=$1",[request.request_id]);
  const claim=(await cmd('claim')).requests[0];
  await mutation(async()=>{
   await db.exec('create table public.unclassified_fixture(id uuid primary key)');
   await assert.rejects(cmd('database_cleanup',{request_id:claim.id,fence:claim.fence}),/unclassified_resource/);
  });
  const partial=await cmd('database_cleanup',{request_id:claim.id,fence:claim.fence});
  assert.equal(partial.partial,true);assert.ok(partial.unresolved>0);
  assert.equal((await db.query('select count(*) as n from public.goals where profile_id=$1',[A])).rows[0].n,0);
  assert.equal((await db.query('select count(*) as n from public.goals where profile_id=$1',[B])).rows[0].n,1);
  assert.equal((await db.query('select count(*) as n from public.households')).rows[0].n,1);
  assert.equal((await db.query('select count(*) as n from public.profiles')).rows[0].n,2);
  const repeated=await cmd('database_cleanup',{request_id:claim.id,fence:claim.fence});
  assert.equal(repeated.unresolved,partial.unresolved);
  await mutation(async()=>{
   await cmd('retry',{request_id:claim.id,fence:claim.fence,category:'shared_resources_pending_review',permanent:false});
   assert.equal((await db.query('select status from public.account_deletion_requests where id=$1',[claim.id])).rows[0].status,'partial_purge_pending_review');
   assert.equal((await cmd('status',{receipt_hash:'r'.repeat(43)})).status,'failed');
   await db.query('update public.account_deletion_requests set retry_at=now() where id=$1',[claim.id]);
   const next=(await cmd('claim')).requests[0];assert.equal(next.id,claim.id);assert.equal(next.fence,claim.fence+1);
   await assert.rejects(cmd('check',{request_id:claim.id,fence:claim.fence}),/lease_or_control_refused/);
  });
  const reviewCase=(await db.query("select id from public.account_deletion_cases where request_id=$1 and resource_table='household_members'",[claim.id])).rows[0];
  await assert.rejects(db.query('select public.herkeys_resolve_deletion_case($1,$2)',[reviewCase.id,'fixture-operator-review']),/resource_still_exists/);
  await assert.rejects(cmd('finish',{request_id:claim.id,fence:claim.fence}),/terminal_verification_failed/);
  await cmd('retry',{request_id:claim.id,fence:claim.fence,category:'shared_resources_pending_review',permanent:true});
  await assert.rejects(cmd('requeue_reviewed',{request_id:claim.id,resolution_reference:'operator-reviewed'}),/unresolved_cases/);
  assert.equal((await cmd('status',{receipt_hash:'r'.repeat(43)})).status,'failed');
  await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${B}"}'`);
  try {
   assert.equal((await db.query('select * from public.household_members where profile_id=$1',[A])).rows.length,0);
   await assert.rejects(db.query("update public.household_members set role='owner' where profile_id=$1",[B]),/permission denied/);
  } finally {await db.exec('reset role');}
  // An operator must reconcile the exact resource before the case can close.
  await db.query('delete from public.household_members where profile_id=$1',[A]);
  await db.query('select public.herkeys_resolve_deletion_case($1,$2)',[reviewCase.id,'fixture-operator-review']);
  assert.ok((await db.query('select resolved_at from public.account_deletion_cases where id=$1',[reviewCase.id])).rows[0].resolved_at);
  await assert.rejects(cmd('requeue_reviewed',{request_id:claim.id,resolution_reference:'fixture-operator-review'}),/unresolved_cases/);
  assert.equal((await db.query('select count(*) as n from public.profiles where id=$1',[B])).rows[0].n,1);
 });
});
