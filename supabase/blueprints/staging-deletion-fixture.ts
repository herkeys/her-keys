// Temporary Staging-only certification harness. Never deploy to Production.
// Remove the deployed harness after certification. Uses the normal public APIs.
import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {adminClient} from '../functions/_shared/supabaseAdmin.ts';
import {randomUrlSafe} from '../functions/_shared/crypto.ts';
import {json} from '../functions/_shared/http.ts';
Deno.serve(async req=>{
 if(Deno.env.get('SUPABASE_URL')!=='https://fhhudicklmpofuzkxeqe.supabase.co')return json({error:'staging_only'},403);
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const admin=adminClient();
 const proof=await admin.rpc('herkeys_verify_deletion_worker',{
  p_timestamp:req.headers.get('x-deletion-timestamp')??'',p_signature:req.headers.get('x-deletion-signature')??''});
 if(proof.error||proof.data!==true)return json({error:'unauthorized'},401);
 try {
  const limit=await admin.rpc('herkeys_deletion_command',{p_action:'rate_limit',p_args:{key_hash:'staging-certification-fixtures'}});
  if(limit.error||!limit.data.allowed)return json({error:'fixture_limit'},429);
  const recipient=Deno.env.get('DELETION_STAGING_RECIPIENT');
  if(!recipient)throw new Error('recipient_unconfigured');
  const [local,domain]=recipient.split('@');
  const email=local+'+herkeys-deletion-'+crypto.randomUUID()+'@'+domain;
  const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{deletion_certification_fixture:true}});
  if(created.error||!created.data.user)throw new Error('fixture_creation_failed');
  const link=await admin.auth.admin.generateLink({type:'magiclink',email});
  if(link.error)throw new Error('fixture_identity_failed');
  const authClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await authClient.auth.verifyOtp({type:'email',token_hash:link.data.properties.hashed_token});
  if(verified.error||!verified.data.session)throw new Error('fixture_verification_failed');
  const jwt=verified.data.session.access_token;
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{
   auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+jwt}}});
  const boot=await client.rpc('bootstrap_account',{p_claim_key:crypto.randomUUID(),p_timezone:'UTC',p_device_id:crypto.randomUUID()});
  if(boot.error)throw new Error('fixture_bootstrap_failed');
  const receipt=randomUrlSafe();
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/request-account-deletion',{
   method:'POST',headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
   body:JSON.stringify({receipt}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  // No session, provider credential, or email address appears in the result.
  return json({account_id:created.data.user.id,receipt,request_http:response.status,result});
 } catch {return json({error:'fixture_unavailable'},503);}
});
