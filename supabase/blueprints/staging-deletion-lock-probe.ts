// Temporary, HMAC-protected Staging fixture probe. Retire after certification.
import {adminClient} from '../functions/_shared/supabaseAdmin.ts';
import {json} from '../functions/_shared/http.ts';
Deno.serve(async req=>{
 if(Deno.env.get('SUPABASE_URL')!=='https://fhhudicklmpofuzkxeqe.supabase.co')return json({error:'staging_only'},403);
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const admin=adminClient();
 const proof=await admin.rpc('herkeys_verify_deletion_worker',{p_timestamp:req.headers.get('x-deletion-timestamp')??'',p_signature:req.headers.get('x-deletion-signature')??''});
 if(proof.error||proof.data!==true)return json({error:'unauthorized'},401);
 let inserted:string|undefined;
 try {
  const body=await req.json();
  if(body.owner===body.other||![body.owner,body.other].every(v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)))return json({error:'fixture_required'},400);
  for(const id of [body.owner,body.other]) {
   const user=await admin.auth.admin.getUserById(id);
   if(user.error||user.data.user?.app_metadata.deletion_certification_fixture!==true)throw new Error('fixture_only');
  }
  const member=await admin.from('household_members').select('household_id').eq('profile_id',body.owner).single();
  if(member.error)throw new Error('fixture_household_required');
  const lock=admin.rpc('herkeys_certify_deletion_household_lock',{p_account:body.owner}).then(r=>r);
  await new Promise(resolve=>setTimeout(resolve,750));
  const started=performance.now();
  const record=await admin.from('goals').insert({household_id:member.data.household_id,profile_id:body.other,
   local_id:'lock-probe-'+crypto.randomUUID(),title:'Disposable ownership lock probe',status:'active',producer:'user-action',
   origin_created_at:new Date().toISOString(),origin_updated_at:new Date().toISOString()}).select('id').single();
  const waited=performance.now()-started;
  inserted=record.data?.id;
  const held=await lock;
  if(record.error||held.error||!inserted)throw new Error('probe_unavailable');
  const removed=await admin.from('goals').delete().eq('id',inserted).eq('profile_id',body.other).select('id');
  if(removed.error||removed.data.length!==1)throw new Error('probe_cleanup_failed');
  inserted=undefined;
  return json({insert_wait_ms:Math.round(waited),lock_ms:4000,concurrent_insert_blocked:waited>=2500,probe_row_removed:true});
 } catch {return json({error:'lock_probe_unavailable'},503);}
 finally {if(inserted)await admin.from('goals').delete().eq('id',inserted);}
});
