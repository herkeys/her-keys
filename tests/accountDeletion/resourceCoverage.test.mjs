import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deletionDatabase} from '../../supabase/tests/deletion-database.mjs';

// Reuse the repository's governed, RLS-authored population rather than inventing
// a second schema or disabling integrity triggers to make deletion tests pass.
async function fixture(db,path,vars={}) {
 let source=await readFile(new URL('../../supabase/tests/helpers/'+path,import.meta.url),'utf8');
 if(path==='20-wave3-population.sql'&&vars.omit_second_adult_population) {
  const start=source.indexOf('-- ============ USER B'),end=source.indexOf('-- ============ USER C');
  assert.ok(start>0&&end>start);source=source.slice(0,start)+source.slice(end);
 }
 const substitute=sql=>sql.replace(/:'([a-z_0-9]+)'/g,(_,name)=>{
  assert.ok(Object.hasOwn(vars,name),'missing fixture variable '+name);
  return "'"+String(vars[name]).replaceAll("'","''")+"'";
 }).replace(/(?<!:):([a-z_][a-z_0-9]*)/g,(_,name)=>{
  assert.ok(Object.hasOwn(vars,name),'missing raw fixture variable '+name);
  assert.match(String(vars[name]),/^\d+$/,'only numeric raw fixture substitutions are allowed');
  return String(vars[name]);
 });
 const execute=async sql=>{
  const result=await db.exec(substitute(sql));
  for(const statement of result)for(const row of statement.rows??[])for(const value of Object.values(row))
   if(typeof value==='string')assert.ok(!value.startsWith('FAIL |'),value);
  return result;
 };
 let sql='';
 for(const line of source.split(/\r?\n/)) {
  const set=line.match(/^\\set\s+(\w+)\s+'([^']*)'\s*$/);
  if(set){vars[set[1]]=set[2];continue;}
  if(/^\\pset\s/.test(line))continue;
  if(/\\gset\s*$/.test(line)) {
   sql+=line.replace(/\\gset\s*$/,'');
   const results=await execute(sql);
   assert.equal(results.at(-1).rows.length,1,'fixture gset must be unambiguous');
   Object.assign(vars,results.at(-1).rows[0]);sql='';
  }else sql+=line+'\n';
 }
 if(sql.trim())await execute(sql);
 return vars;
}

async function populateRemainingResources(db,vars) {
 const insert=async(table,row)=>{
  const error=(await db.query('select herkeys_test.ins($1,$2::jsonb) as error',[table,JSON.stringify(row)])).rows[0].error;
  assert.equal(error,null,table+' fixture refused: '+error);
  return (await db.query(`select id from public.${table} where household_id=$1 and local_id=$2 and profile_id=$3`,[row.household_id,row.local_id,row.profile_id])).rows[0].id;
 };
 const actors=[[vars.ua,vars.hh_a],...vars.omit_second_adult_population?[]:[[vars.ub,vars.hh_a]],[vars.uc,vars.hh_c]];
 for(const [actor,household] of actors) {
  const base={household_id:household,profile_id:actor};
  await db.query("insert into public.account_consents(account_id,consent_type,policy_version,granted) values($1,'privacy','fixture-v1',true)",[actor]);
  await db.query("insert into public.calendar_oauth_states(state_hash,user_id,code_verifier,redirect_uri,expires_at) values($1,$2,'fixture-verifier','https://example.invalid/callback',now()+interval '10 minutes')",['state-'+actor,actor]);
  await db.query("insert into public.external_calendar_connections(user_id,provider,scopes,refresh_token_ciphertext,refresh_token_iv) values($1,'google',array['test'],'encrypted-fixture','fixture-iv')",[actor]);
  await db.query("insert into public.apple_revocation_credentials(account_id,token_ciphertext,token_iv) values($1,'encrypted-fixture','fixture-iv')",[actor]);
  await db.query("insert into public.herkeys_welcome_email_receipts(user_id,status,sent_at,provider_message_id) values($1,'sent',now(),'fixture-provider-id')",[actor]);
  const discovery=await insert('discovery_records',{...base,local_id:'coverage-discovery',topic_id:'fixture-topic'});
  await db.query("insert into public.discovery_answers(discovery_id,answer_order,question_id,option_id) values($1,1,'fixture-question','fixture-option')",[discovery]);
  await insert('external_references',{...base,local_id:'coverage-external',provider:'google',external_account:'fixture-account-'+actor,external_object_id:'fixture-object',origin:'external',direction:'inbound',authority:'external',status:'active'});
  await insert('automation_authorities',{...base,local_id:'coverage-authority',category:'internal_reminder',mode:'ask_approval',max_consequence:'low',persistent:false,granted_at:new Date().toISOString()});
  const intent=await insert('action_intents',{...base,local_id:'coverage-intent',category:'internal_reminder',consequence:'low',reversibility:'reversible',summary_code:'fixture_reminder',permitted_mode:'ask_approval',producer:'system-derived'});
  const decision=await insert('intent_decisions',{...base,local_id:'coverage-decision',intent_id:intent,decision:'approved',basis:'explicit',decided_at:new Date().toISOString()});
  const execution=await insert('action_executions',{...base,local_id:'coverage-execution',intent_id:intent,decision_id:decision,attempt:1,attempted_at:new Date().toISOString(),result:'succeeded',error_class:'none',reversibility:'reversible',producer:'automation'});
  await insert('action_outcomes',{...base,local_id:'coverage-outcome',execution_id:execution,kind:'verified',observed_at:new Date().toISOString(),producer:'system-derived'});
 }
}

for(const scenario of ['shared','former_member','single'])test('all 43 registered resources: '+scenario+' and unrelated isolation',async t=>{
 const shared=scenario!=='single';
 const db=await deletionDatabase();t.after(()=>db.close());
 await db.exec(await readFile(new URL('../../supabase/tests/helpers/01-test-helpers.sql',import.meta.url),'utf8'));
 await db.exec('BEGIN');await fixture(db,'10-fixtures.sql');await db.exec('COMMIT');
 const vars=await fixture(db,'20-wave3-population.sql',{omit_second_adult_population:!shared});
 await fixture(db,'21-wave3-after-chain.sql',vars);
 await populateRemainingResources(db,vars);
 if(!shared) {
  // The second actor has no authored population in this scenario. Removing its
  // fixture-only membership/profile gives a real single-adult household with a child.
  await db.query('delete from public.household_members where profile_id=$1',[vars.ub]);
  await db.query('delete from public.profiles where id=$1',[vars.ub]);
 }
 if(scenario==='former_member') {
  // No current membership is not permission to erase the other adult's records.
  await db.query('delete from public.household_members where profile_id=$1',[vars.ub]);
  assert.equal((await db.query('select private.deletion_has_other_household_owners($1) as protected',[vars.ua])).rows[0].protected,true);
 }
 const tables=(await db.query('select table_name,owner_column,household_scoped from private.deletion_resource_registry order by table_name')).rows;
 const populated=[];
 for(const {table_name:table}of tables) {
  const count=(await db.query(`select count(*) as n from public.${table}`)).rows[0].n;
  if(count>0)populated.push(table);
 }
 assert.deepEqual(populated,tables.map(t=>t.table_name),'every registered resource must contain a fixture');
 t.diagnostic('Populated resources: '+populated.join(', '));
 const A=vars.ua,B=vars.ub,C=vars.uc;
 const ownedSnapshot=async actor=>{
  const result={};
  for(const {table_name:table,owner_column:owner}of tables)
   result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') as rows from public.${table} r where ${owner}=$1`,[actor])).rows[0].rows;
  return result;
 };
 const beforeB=await ownedSnapshot(B),beforeC=await ownedSnapshot(C);
 const session='aaaaaaaa-1111-4111-8111-111111111111';
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,A]);
 const cmd=async(action,args={})=>(await db.query('select public.herkeys_deletion_command($1,$2::jsonb) as r',[action,JSON.stringify(args)])).rows[0].r;
 const request=await cmd('request',{account_id:A,session_id:session,receipt_hash:'c'.repeat(43),recovery_hash:'d'.repeat(43)});
 await cmd('deactivation_ack',{request_id:request.request_id,auth_ban:true,session_revocation:false});
 await db.query("update public.account_deletion_requests set requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' where id=$1",[request.request_id]);
 await db.exec('update public.account_deletion_control set enabled=true,dry_run=false');
 const claim=(await cmd('claim')).requests[0];assert.ok(claim);
 const args={request_id:claim.id,fence:claim.fence};
 await cmd('cleanup_safe',args);
 const result=await cmd('database_cleanup',args);
 assert.deepEqual(await ownedSnapshot(B),beforeB,'another adult private data must be byte-identical');
 assert.deepEqual(await ownedSnapshot(C),beforeC,'unrelated household data must be byte-identical');
 if(!shared) {
  assert.equal(result.partial,undefined);
  assert.equal((await db.query('select count(*) as n from public.households where id=$1',[vars.hh_a])).rows[0].n,0);
  assert.equal((await db.query('select count(*) as n from public.profiles where id=$1',[A])).rows[0].n,1,'provider material keeps the profile restricted until provider cleanup');
  assert.equal((await db.query('select count(*) as n from public.external_calendar_connections where user_id=$1',[A])).rows[0].n,1);
  await assert.rejects(cmd('finish',args),/terminal_verification_failed/);
  // This is the database leg after provider success. Live credential revocation
  // is a separate certification; no local test purports to contact Apple/Google.
  await db.query('delete from public.external_calendar_connections where user_id=$1',[A]);
  await db.query('delete from public.apple_revocation_credentials where account_id=$1',[A]);
  await cmd('database_cleanup',args);
  for(const {table_name:table,owner_column:owner}of tables)
   assert.equal((await db.query(`select count(*) as n from public.${table} where ${owner}=$1`,[A])).rows[0].n,0,table+' must have no departing-account rows');
  assert.equal((await db.query('select count(*) as n from public.profiles where id=$1',[A])).rows[0].n,0);
  assert.deepEqual(await ownedSnapshot(C),beforeC);
  for(const resource of ['providers','storage','auth'])await cmd('evidence',{...args,resource,result:true});
  await assert.rejects(cmd('finish',args),/terminal_verification_failed/);
  await db.query('delete from auth.users where id=$1',[A]);
  await cmd('finish',args);
  const status=await cmd('status',{receipt_hash:'c'.repeat(43)});assert.equal(status.status,'purged');
  assert.ok(status.resource_counts.verified_resource_groups>=42);
  return;
 }
 assert.equal(result.partial,true);
 const cases=(await db.query('select resource_table,resource_id,reason,restrict_access from public.account_deletion_cases where request_id=$1',[claim.id])).rows;
 assert.ok(cases.some(c=>c.reason==='child_ownership_not_inferred_from_membership'));
 assert.ok(cases.every(c=>c.restrict_access));
 await assert.rejects(cmd('finish',args),/terminal_verification_failed/);
 assert.equal((await cmd('status',{receipt_hash:'c'.repeat(43)})).status,'pending');
 assert.equal((await db.query('select count(*) as n from public.account_deletion_terminal_proofs')).rows[0].n,0);
 assert.ok((await db.query('select count(*) as n from public.households where id=$1',[vars.hh_a])).rows[0].n>0);
});
