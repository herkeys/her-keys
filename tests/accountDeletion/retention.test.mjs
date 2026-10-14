import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';
test('terminal proof retention: exact whitelist, expiry refusal, actual deletion and nonterminal preservation',async t=>{
 const db=await deletionDatabase();t.after(()=>db.close());
 const q=(sql,args=[])=>db.query(sql,args);
 const cmd=async(action,args={})=>(await q('select public.herkeys_deletion_command($1,$2::jsonb) as r',[action,JSON.stringify(args)])).rows[0].r;
 const columns=(await q("select column_name from information_schema.columns where table_schema='public' and table_name='account_deletion_terminal_proofs' order by column_name")).rows.map(r=>r.column_name);
 assert.deepEqual(columns,['expires_at','purged_at','receipt_hash','resource_counts','verified_at']);
 for(const [receipt,age] of [['e'.repeat(43),366],['f'.repeat(43),364]])await q(`insert into public.account_deletion_terminal_proofs
  values($1,now()-make_interval(days=>$2),now()-make_interval(days=>$2),'{}',now()-make_interval(days=>$2)+interval '365 days')`,[receipt,age]);
 const A='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-1111-4111-8111-111111111111';
 await q('insert into auth.users(id,email) values($1,$2)',[A,'fixture@local.test']);
 await q('insert into auth.sessions(id,user_id) values($1,$2)',[S,A]);
 await cmd('request',{account_id:A,session_id:S,receipt_hash:'p'.repeat(43),recovery_hash:'q'.repeat(43)});
 assert.equal((await cmd('status',{receipt_hash:'e'.repeat(43)})).status,'unknown');
 assert.equal((await cmd('status',{receipt_hash:'f'.repeat(43)})).status,'purged');
 await db.exec('set role authenticated');
 try{await assert.rejects(q('select public.herkeys_expire_deletion_proofs()'),/permission denied/);
  await assert.rejects(q('select * from public.account_deletion_terminal_proofs'),/permission denied/);
 }finally{await db.exec('reset role');}
 const result=(await q('select public.herkeys_expire_deletion_proofs() as r')).rows[0].r;
 assert.equal(result.proofs_deleted,1);assert.equal(result.remaining_expired,0);
 assert.equal((await q('select count(*) as n from public.account_deletion_terminal_proofs')).rows[0].n,1);
 assert.equal((await cmd('status',{receipt_hash:'p'.repeat(43)})).status,'pending');
 assert.equal((await q('select count(*) as n from public.account_deletion_requests')).rows[0].n,1);
 assert.ok((await q('select last_success_at from public.account_deletion_retention_control')).rows[0].last_success_at);
});
