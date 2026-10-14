import {adminClient} from '../_shared/supabaseAdmin.ts';
import {json} from '../_shared/http.ts';
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const admin=adminClient();
 const verified=await admin.rpc('herkeys_verify_deletion_worker',{
  p_timestamp:req.headers.get('x-deletion-timestamp')??'',p_signature:req.headers.get('x-deletion-signature')??''});
 if(verified.error||verified.data!==true)return json({error:'unauthorized'},401);
 try {
  const result=await admin.rpc('herkeys_expire_deletion_proofs');
  if(result.error||result.data.remaining_expired>0)throw new Error('retention_cleanup_incomplete');
  const rates=await admin.from('account_deletion_rate_limits').delete().lt('window_start',new Date(Date.now()-86400000).toISOString());
  if(rates.error)throw new Error('rate_limit_expiry_failed');
  return json(result.data);
 } catch {
  await admin.from('account_deletion_retention_control').update({last_failure_at:new Date().toISOString(),failure_category:'retention_cleanup_failed'}).eq('singleton',true);
  return json({error:'retention_cleanup_failed'},503);
 }
});
