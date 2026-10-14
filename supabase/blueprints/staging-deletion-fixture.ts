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
 const body=await req.json().catch(()=>({}));
 if(body.action==='inspect_storage') {
  if(typeof body.bucket!=='string'||!/^deletion-certification-[0-9a-f-]{36}$/.test(body.bucket))return json({error:'invalid_fixture_bucket'},400);
  const listed=await admin.storage.from(body.bucket).list('',{search:'fixture.txt'});
  const downloaded=await admin.storage.from(body.bucket).download('fixture.txt');
  return json({list_ok:!listed.error,object_count:listed.data?.length??null,download_ok:!downloaded.error,object_missing:!!downloaded.error&&downloaded.error.message.toLowerCase().includes('object not found')});
 }
 const rcProject=Deno.env.get('REVENUECAT_PROJECT_ID'),rcKey=Deno.env.get('REVENUECAT_DELETION_API_KEY');
 if(body.action==='inspect_customer') {
  if(rcProject!=='proj93809efe'||!rcKey||typeof body.account_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.account_id))return json({error:'invalid_fixture_lookup'},400);
  const response=await fetch('https://api.revenuecat.com/v2/projects/'+rcProject+'/customers/'+body.account_id,{
   headers:{Authorization:'Bearer '+rcKey},signal:AbortSignal.timeout(10000)});
  const customer=response.ok?await response.json():null;
  return json({http:response.status,present:response.status===200,identity_matches:customer?.id===body.account_id});
 }
 if(body.action==='configuration') {
  if(rcProject!=='proj93809efe'||!rcKey)return json({project_matches:rcProject==='proj93809efe',key_configured:!!rcKey},503);
  const headers={Authorization:'Bearer '+rcKey};
  const project=await fetch('https://api.revenuecat.com/v2/projects?limit=100',{headers,signal:AbortSignal.timeout(10000)});
  const projectData=project.ok?await project.json():null;
  const lookup=await fetch('https://api.revenuecat.com/v2/projects/'+rcProject+'/customers/herkeys-deletion-connectivity-'+crypto.randomUUID(),{headers,signal:AbortSignal.timeout(10000)});
  return json({project_matches:true,key_configured:true,project_http:project.status,project_resolved:projectData?.items?.some((p:{id:string})=>p.id===rcProject)??false,customer_lookup_http:lookup.status,read_authorized:lookup.status===404});
 }
 let step='initialize';
 try {
  const resuming=typeof body.resume_account_id==='string'&&/^[0-9a-f-]{36}$/i.test(body.resume_account_id);
  if(!resuming){const limit=await admin.rpc('herkeys_deletion_command',{p_action:'rate_limit',p_args:{key_hash:'staging-certification-fixtures'}});
   if(limit.error||!limit.data.allowed)return json({error:'fixture_limit'},429);}
  const recipient=Deno.env.get('DELETION_STAGING_RECIPIENT');
  if(!recipient)throw new Error('recipient_unconfigured');
  const [local,domain]=recipient.split('@');
  let email=local+'+herkeys-deletion-'+crypto.randomUUID()+'@'+domain;
  const created=resuming?await admin.auth.admin.getUserById(body.resume_account_id):await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{deletion_certification_fixture:true}});
  if(created.error||!created.data.user)throw new Error('fixture_creation_failed');
  if(resuming){
   if(created.data.user.app_metadata.deletion_certification_fixture!==true||!created.data.user.email?.startsWith(local+'+herkeys-deletion-')||!created.data.user.email.endsWith('@'+domain))throw new Error('fixture_resume_refused');
   const open=await admin.from('account_deletion_requests').select('id').eq('account_id',created.data.user.id).neq('status','restored');
   if(open.error||open.data.length)throw new Error('fixture_already_requested');
   email=created.data.user.email;
  }
  let rcCreateHttp:number|null=null;
  if(body.create_revenuecat_fixture===true&&!resuming) {
   step='revenuecat_create';
   if(rcProject!=='proj93809efe'||!rcKey)throw new Error('revenuecat_configuration_required');
   const response=await fetch('https://api.revenuecat.com/v2/projects/'+rcProject+'/customers',{
    method:'POST',headers:{Authorization:'Bearer '+rcKey,'Content-Type':'application/json'},
    body:JSON.stringify({id:created.data.user.id}),signal:AbortSignal.timeout(15000)});
   rcCreateHttp=response.status;
   if(response.status!==201)throw new Error('disposable_customer_not_created');
  }
  step='identity';
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
  let storageBucket:string|null=null,otherAdult:string|null=null;
  if(body.shared_storage_fixture===true) {
   step='shared_fixture';
   if(!resuming){
   const other=await admin.auth.admin.createUser({email:local+'+herkeys-deletion-'+crypto.randomUUID()+'@'+domain,email_confirm:true,app_metadata:{deletion_certification_fixture:true}});
   if(other.error||!other.data.user)throw new Error('other_fixture_failed');
   otherAdult=other.data.user.id;
   const profile=await admin.from('profiles').insert({id:otherAdult,timezone:'UTC'});
   const membership=await admin.from('household_members').insert({household_id:boot.data.household_id,local_id:'other-adult',profile_id:otherAdult,member_type:'adult',role:'member',scope:'personal'});
   if(profile.error||membership.error)throw new Error('shared_membership_failed');
   for(const actor of [created.data.user.id,otherAdult]) {
    const goal=await admin.from('goals').insert({household_id:boot.data.household_id,local_id:'private-'+actor,profile_id:actor,title:'Disposable private goal',status:'active',producer:'user-action',origin_created_at:new Date().toISOString(),origin_updated_at:new Date().toISOString()});
    if(goal.error)throw new Error('shared_private_fixture_failed');
   }
   }else{
    const member=await admin.from('household_members').select('profile_id').eq('household_id',boot.data.household_id).neq('profile_id',created.data.user.id).not('profile_id','is',null).single();
    if(member.error)throw new Error('fixture_partner_missing');
    const partner=await admin.auth.admin.getUserById(member.data.profile_id);
    if(partner.data.user?.app_metadata.deletion_certification_fixture!==true)throw new Error('fixture_partner_not_disposable');
    otherAdult=partner.data.user.id;
   }
   const shared=await admin.from('household_categories').upsert({household_id:boot.data.household_id,local_id:'shared-retained-category',name:'Disposable legitimate shared category',status:'active',sort_order:9999,scope:'household',producer:'user-action'},{onConflict:'household_id,local_id'});
   if(shared.error)throw new Error('shared_retained_fixture_failed');
   step='storage_fixture';storageBucket='deletion-certification-'+crypto.randomUUID();
   const bucket=await admin.storage.createBucket(storageBucket,{public:false});
   if(bucket.error)throw new Error('fixture_bucket_failed');
   const upload=await client.storage.from(storageBucket).upload('fixture.txt',new TextEncoder().encode('Disposable Her Keys deletion certification'),{contentType:'text/plain',upsert:false});
   if(upload.error)throw new Error('fixture_upload_failed');
  }
  const receipt=randomUrlSafe();
  step='request';
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/request-account-deletion',{
   method:'POST',headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
   body:JSON.stringify({receipt}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  const stale=await client.from('profiles').select('id');
  const forbidden=await client.rpc('bootstrap_account',{p_claim_key:crypto.randomUUID(),p_timezone:'UTC',p_device_id:crypto.randomUUID()});
  let rcPreserved:boolean|null=null;
  if(body.create_revenuecat_fixture===true) {
   const lookup=await fetch('https://api.revenuecat.com/v2/projects/'+rcProject+'/customers/'+created.data.user.id,{
    headers:{Authorization:'Bearer '+rcKey},signal:AbortSignal.timeout(15000)});
   const customer=lookup.ok?await lookup.json():null;
   rcPreserved=lookup.status===200&&customer.id===created.data.user.id;
  }
  // No session, provider credential, or email address appears in the result.
  return json({account_id:created.data.user.id,receipt,request_http:response.status,result,
   stale_rls_refused:!stale.error&&stale.data.length===0,stale_rpc_refused:!!forbidden.error,
   revenuecat_created_http:rcCreateHttp,revenuecat_customer_preserved:rcPreserved,storage_bucket:storageBucket,other_adult:otherAdult,household_id:body.shared_storage_fixture===true?boot.data.household_id:undefined});
 } catch {return json({error:'fixture_unavailable',step},503);}
});
