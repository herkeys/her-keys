import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const SA='aaaaaaaa-1111-4111-8111-111111111111',SB='bbbbbbbb-2222-4222-8222-222222222222';
test('account deletion: real SQL state, privileges, recovery and purge',async t=>{
 const db=await deletionDatabase();
 t.after(()=>db.close());
 const q=(sql,args=[])=>db.query(sql,args);
 const cmd=async(action,args={})=>(await q('select public.herkeys_deletion_command($1,$2::jsonb) as r',[action,JSON.stringify(args)])).rows[0].r;
 const as=async(id,work)=>{await q('set role authenticated');await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id})]);try{return await work();}finally{await q('reset role');}};
 for(const[id,s]of [[A,SA],[B,SB]]) {
  await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@local.test']);
  await q('insert into auth.sessions(id,user_id) values($1,$2)',[s,id]);
  await as(id,()=>q("select public.bootstrap_account(gen_random_uuid(),'America/New_York',null)"));
 }
 let request;
 const params={account_id:A,session_id:SA,receipt_hash:'r'.repeat(43),recovery_hash:'t'.repeat(43),ciphertext:'encrypted-test-fixture',iv:'test-iv'};
 await t.test('internal command is denied to authenticated and anon',async()=>{
  await assert.rejects(as(A,()=>cmd('request',params)),/permission denied/);
  await q('set role anon');try{await assert.rejects(cmd('claim'),/permission denied/);}finally{await q('reset role');}
 });
 await t.test('stale auth cannot request deletion',async()=>{
  await q("update auth.sessions set created_at=now()-interval '1 hour' where id=$1",[SA]);
  await assert.rejects(cmd('request',params),/recent_auth_required/);
  await q('update auth.sessions set created_at=now() where id=$1',[SA]);
 });
 await t.test('request records exactly 30 days and queues encrypted recovery',async()=>{
  request=await cmd('request',params);
  const rows=(await q('select grace_period_ends_at-requested_at as delta,status from public.account_deletion_requests')).rows;
  assert.equal(rows[0].status,'deactivated');assert.match(rows[0].delta,/30 days/);
  assert.equal((await q('select count(*) as n from public.account_deletion_outbox')).rows[0].n,1);
 });
 await t.test('duplicate requests preserve deadline and do not queue another email',async()=>{
  const dup=await cmd('request',params);assert.equal(dup.request_id,request.request_id);assert.equal(dup.deadline,request.deadline);
  assert.equal(dup.duplicate,true);assert.equal((await q('select count(*) as n from public.account_deletion_outbox')).rows[0].n,1);
 });
 await t.test('previously issued JWT loses ordinary RLS access and RPC authority',async()=>{
  const before=await as(A,()=>q('select * from public.profiles'));assert.equal(before.rows.length,0);
  await assert.rejects(as(A,()=>q("select public.bootstrap_account(gen_random_uuid(),'UTC',null)")),/account_deactivated/);
  assert.equal((await as(B,()=>q('select * from public.profiles'))).rows.length,1);
 });
 await t.test('worker disabled and dry-run cannot claim',async()=>{
  assert.equal((await cmd('claim')).requests.length,0);
  await q('update public.account_deletion_control set enabled=true,dry_run=true');
  assert.equal((await cmd('claim')).requests.length,0);
 });
 await t.test('enabled worker cannot delete before the deadline',async()=>{
  await q('update public.account_deletion_control set dry_run=false');
  assert.equal((await cmd('claim')).requests.length,0);
 });
 await t.test('replacement recovery invalidates previous token without extending deadline',async()=>{
  await cmd('resend',{account_id:A,recovery_hash:'n'.repeat(43),ciphertext:'replacement',iv:'iv'});
  assert.equal((await cmd('restore',{recovery_hash:'t'.repeat(43)})).status,'invalid_or_expired');
  assert.equal((await cmd('status',{receipt_hash:'r'.repeat(43)})).deadline,request.deadline);
 });
 await t.test('single-use recovery reserves against purge but does not falsely restore',async()=>{
  const r=await cmd('restore',{recovery_hash:'n'.repeat(43)});assert.equal(r.status,'restoring');
  assert.equal((await cmd('restore',{recovery_hash:'n'.repeat(43)})).status,'invalid_or_expired');
  assert.equal((await cmd('status',{receipt_hash:'r'.repeat(43)})).status,'pending');
  assert.equal((await cmd('claim')).requests.length,0);
  await assert.rejects(cmd('restored',{request_id:r.request_id,ciphertext:'confirmation',iv:'iv'}),/invalid_transition/);
  const failed=await cmd('deactivation_ack',{request_id:r.request_id,auth_ban:false,session_revocation:true});
  assert.equal(failed.reconciliation_pending,true);
  await assert.rejects(cmd('restored',{request_id:r.request_id,ciphertext:'confirmation',iv:'iv'}),/invalid_transition/);
  await cmd('deactivation_ack',{request_id:r.request_id,auth_ban:true,session_revocation:false});
  assert.equal((await q('select count(*) as n from auth.sessions where user_id=$1',[A])).rows[0].n,0);
  assert.equal((await q('select count(*) as n from auth.sessions where user_id=$1',[B])).rows[0].n,1);
  await cmd('restored',{request_id:r.request_id,ciphertext:'confirmation',iv:'iv'});
  assert.equal((await cmd('status',{receipt_hash:'r'.repeat(43)})).status,'restored');
  assert.equal((await as(A,()=>q('select * from public.profiles'))).rows.length,1);
 });
 await t.test('new lifecycle after restoration has a new deadline',async()=>{
  await q('insert into auth.sessions(id,user_id) values($1,$2)',[SA,A]);
  request=await cmd('request',{...params,receipt_hash:'s'.repeat(43),recovery_hash:'x'.repeat(43)});
  assert.equal(request.duplicate,false);
 });
 await t.test('expired requests cannot restore; workers compete through claims',async()=>{
  await q("update public.account_deletion_requests set requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' where id=$1",[request.request_id]);
  assert.equal((await cmd('restore',{recovery_hash:'x'.repeat(43)})).status,'invalid_or_expired');
  const first=await cmd('claim'),second=await cmd('claim');
  assert.equal(first.requests.length,1);assert.equal(second.requests.length,0);
  request={...request,...first.requests[0]};
 });
 await t.test('wrong fencing token and kill switch refuse destructive work',async()=>{
  await assert.rejects(cmd('database_cleanup',{request_id:request.id,fence:0}),/lease_or_control_refused/);
  await q('update public.account_deletion_control set enabled=false');
  await assert.rejects(cmd('database_cleanup',{request_id:request.id,fence:request.fence}),/lease_or_control_refused/);
  await q('update public.account_deletion_control set enabled=true');
 });
 await t.test('false terminal success is refused',async()=>{
  await assert.rejects(cmd('finish',{request_id:request.id,fence:request.fence}),/terminal_verification_failed/);
 });
 await t.test('expired lease can be reclaimed and old worker loses authority',async()=>{
  const previous=request.fence;
  await q("update public.account_deletion_requests set lease_until=now()-interval '1 second' where id=$1",[request.id]);
  const next=await cmd('claim');request={...request,...next.requests[0]};
  assert.equal(request.fence,previous+1);
  await assert.rejects(cmd('check',{request_id:request.id,fence:previous}),/lease_or_control_refused/);
 });
 await t.test('complete database cleanup preserves the other account',async()=>{
  await cmd('database_cleanup',{request_id:request.id,fence:request.fence});
  assert.equal((await q('select * from public.profiles where id=$1',[A])).rows.length,0);
  assert.equal((await q('select * from public.profiles where id=$1',[B])).rows.length,1);
 });
 await t.test('purged requires Auth absence and independent resource evidence',async()=>{
  for(const resource of ['storage','providers','auth'])await cmd('evidence',{request_id:request.id,fence:request.fence,resource,result:true});
  await assert.rejects(cmd('finish',{request_id:request.id,fence:request.fence}),/terminal_verification_failed/);
  await q('delete from auth.users where id=$1',[A]);
  await cmd('finish',{request_id:request.id,fence:request.fence});
  const status=await cmd('status',{receipt_hash:'s'.repeat(43)});
  assert.equal(status.status,'purged');assert.ok(status.purged_at);assert.ok(status.verified_at);
  assert.equal((await q('select account_id from public.account_deletion_requests where id=$1',[request.id])).rows[0].account_id,null);
 });
 await t.test('resend rate limit has a bounded window and unknown receipts disclose nothing',async()=>{
  for(let i=0;i<5;i++)assert.equal((await cmd('rate_limit',{key_hash:'test'})).allowed,true);
  assert.equal((await cmd('rate_limit',{key_hash:'test'})).allowed,false);
  assert.equal((await cmd('status',{receipt_hash:'z'.repeat(43)})).status,'unknown');
 });
});
