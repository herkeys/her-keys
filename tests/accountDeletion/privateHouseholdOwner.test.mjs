import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const S='aaaaaaaa-1111-4111-8111-111111111111';
test('a former adult whose only household record is a private Premium receipt prevents whole-household cascade',async t=>{
 const db=await deletionDatabase();t.after(()=>db.close());const q=(sql,args=[])=>db.query(sql,args);
 for(const actor of [A,B])await q('insert into auth.users(id,email) values($1,$2)',[actor,actor+'@local.test']);
 await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${A}"}';select public.bootstrap_account(gen_random_uuid(),'UTC',null);reset role;`);
 const h=(await q('select household_id from public.household_members where profile_id=$1',[A])).rows[0].household_id;
 await q("insert into public.profiles(id,timezone) values($1,'UTC')",[B]);
 await q("insert into public.household_members(household_id,local_id,profile_id,member_type,role,scope) values($1,'former-adult',$2,'adult','member','personal')",[h,B]);
 await q("insert into public.premium_usage_events(account_id,feature_key,idempotency_key,status,units,cost_units,via,period_start) values($1,'daily_load_premium','former-member-receipt','completed',1,1,'premium',current_date)",[B]);
 await db.exec(`set role authenticated;set request.jwt.claims='{"sub":"${B}"}'`);
 try{await q("select public.premium_decision_record($1,'daily_load_premium','fixture.receipt','former-member-receipt','{}',repeat('a',64))",[h]);}finally{await db.exec('reset role');}
 await q('delete from public.household_members where profile_id=$1',[B]);
 await q('delete from public.change_log where owner_profile_id=$1',[B]);
 // Prove the pre-repair membership/household-scoped guard has no other evidence.
 const oldGuard=(await q("select pg_get_functiondef('private.deletion_has_other_household_owners(uuid)'::regprocedure) body")).rows[0].body;
 const start=oldGuard.indexOf('FROM private.deletion_resource_registry r WHERE'),end=oldGuard.indexOf(' LOOP',start);
 assert.ok(start>0&&end>start);
 await db.exec('begin');try{
  await db.exec(oldGuard.slice(0,start)+'FROM private.deletion_resource_registry WHERE household_scoped'+oldGuard.slice(end));
  assert.equal((await q('select private.deletion_has_other_household_owners($1) protected',[A])).rows[0].protected,false,'negative control must reproduce the lost ownership evidence');
 }finally{await db.exec('rollback');}
 const before=(await q('select to_jsonb(d) row from public.premium_decisions d where account_id=$1',[B])).rows[0].row;
 assert.equal((await q('select private.deletion_has_other_household_owners($1) protected',[A])).rows[0].protected,true);
 await q('insert into auth.sessions(id,user_id) values($1,$2)',[S,A]);
 const cmd=async(action,args={})=>(await q('select public.herkeys_deletion_command($1,$2::jsonb) r',[action,JSON.stringify(args)])).rows[0].r;
 const request=await cmd('request',{account_id:A,session_id:S,receipt_hash:'h'.repeat(43),recovery_hash:'i'.repeat(43)});
 await q("update public.account_deletion_requests set requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' where id=$1",[request.request_id]);
 await db.exec('update public.account_deletion_control set enabled=true,dry_run=false');const claim=(await cmd('claim')).requests[0];
 const args={request_id:claim.id,fence:claim.fence};assert.equal((await cmd('database_cleanup',args)).partial,true);
 assert.deepEqual((await q('select to_jsonb(d) row from public.premium_decisions d where account_id=$1',[B])).rows[0].row,before);
 assert.equal((await q('select count(*) n from public.households where id=$1',[h])).rows[0].n,1);
 assert.equal((await q('select count(*) n from public.household_members where profile_id=$1',[B])).rows[0].n,0,'no automatic ownership/membership transfer');
 await assert.rejects(cmd('finish',args),/terminal_verification_failed/);
});
