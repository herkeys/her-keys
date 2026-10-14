import {adminClient} from '../_shared/supabaseAdmin.ts';
import {monitorDeletions} from '../_shared/deletionMonitor.ts';
import {json} from '../_shared/http.ts';
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const verified=await adminClient().rpc('herkeys_verify_deletion_worker',{
  p_timestamp:req.headers.get('x-deletion-timestamp')??'',p_signature:req.headers.get('x-deletion-signature')??''});
 if(verified.error||verified.data!==true)return json({error:'unauthorized'},401);
 try{return json(await monitorDeletions());}catch{return json({error:'monitor_unavailable'},503);}
});
