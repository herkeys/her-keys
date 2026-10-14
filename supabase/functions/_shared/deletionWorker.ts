import { adminClient } from './supabaseAdmin.ts';
import { command, drainDeletionEmail, reconcileRestoration, deliveryRecipient } from './deletionService.ts';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { safeCategory } from './deletionCore.ts';

async function checked(query: any) { const {data,error}=await query; if(error) throw new Error('database_unavailable'); return data; }
async function providerRequest(url:string, init:RequestInit) {
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
 if(!response.ok && response.status!==404) throw new Error('provider_unavailable');
 return response;
}
export async function processDeletions() {
 const admin=adminClient();
 // Auth deactivation and recovery are reconciled independently from the destructive switch.
 const pending=await checked(admin.from('account_deletion_requests').select('id,account_id,status,evidence,auth_deactivation_pending,deactivated_at')
  .in('status',['restoring','deactivated']).limit(20));
 for(const r of pending) {
  if(r.status==='restoring') await reconcileRestoration(r.id,r.account_id);
  else if(r.auth_deactivation_pending && Date.parse(r.deactivated_at)<Date.now()-300000) {
   const claim=await command('claim_deactivation',{request_id:r.id});
   if(!claim.claimed)continue;
   const {error}=await admin.auth.admin.updateUserById(r.account_id,{ban_duration:'876000h'});
   await command('deactivation_ack',{request_id:r.id,auth_ban:!error,session_revocation:false});
  }
 }
 await drainDeletionEmail();
 const run=await command('claim');
 for(const request of run.requests) {
  const args={request_id:request.id,fence:request.fence};
  const fence=()=>command('check',args);
  const evidence=(resource:string,result:unknown)=>command('evidence',{...args,resource,result});
  try {
   await fence();
   await command('cleanup_safe',args);
   // Capture the completion recipient only in a restricted encrypted outbox before Auth disappears.
   const userResult=await admin.auth.admin.getUserById(request.account_id);
   if(userResult.data.user?.email) {
    const encrypted=await encryptSecret(JSON.stringify({email:deliveryRecipient(userResult.data.user.email)}));
    await command('prepare_completion',{...args,...encrypted});
   }
   let providersComplete=true;
   if(!request.evidence.providers) {
    try {
     const connections=await checked(admin.from('external_calendar_connections').select('refresh_token_ciphertext,refresh_token_iv').eq('user_id',request.account_id));
     for(const connection of connections) {
      await fence();
      const token=await decryptSecret(connection.refresh_token_ciphertext,connection.refresh_token_iv);
      await providerRequest('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
       body:new URLSearchParams({token})});
     }
     const credentials=await checked(admin.from('apple_revocation_credentials').select('token_ciphertext,token_iv').eq('account_id',request.account_id));
     for(const credential of credentials) {
      const { appleClientSecret }=await import('./deletionApple.ts');
      await fence();
      await providerRequest('https://appleid.apple.com/auth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
       body:new URLSearchParams({client_id:Deno.env.get('APPLE_DELETION_CLIENT_ID')!,client_secret:await appleClientSecret(),
        token:await decryptSecret(credential.token_ciphertext,credential.token_iv),token_type_hint:'refresh_token'})});
     }
     if(!credentials.length && userResult.data.user?.identities?.some(i=>i.provider==='apple')) {
      await evidence('apple_legacy','manual_revocation_required');
      throw new Error('apple_revocation_requires_action');
     }
     const rcKey=Deno.env.get('REVENUECAT_DELETION_API_KEY'), rcProject=Deno.env.get('REVENUECAT_PROJECT_ID');
     if(!rcKey || !rcProject) throw new Error('revenuecat_not_configured');
     await fence();
     const rcUrl='https://api.revenuecat.com/v2/projects/'+encodeURIComponent(rcProject)+'/customers/'+encodeURIComponent(request.account_id);
     await providerRequest(rcUrl,{method:'DELETE',headers:{Authorization:'Bearer '+rcKey}});
     await fence();
     const rcCheck=await providerRequest(rcUrl,{method:'GET',headers:{Authorization:'Bearer '+rcKey}});
     if(rcCheck.status!==404) throw new Error('revenuecat_deletion_pending');
     await evidence('providers',true);
    } catch {
     providersComplete=false; await evidence('provider_failure','requires_retry');
    }
   }
   // Independent private-data cleanup continues while provider revocation is retried.
   // Keep revocation material only during the bounded retry budget; unresolved
   // provider work remains an operational failure after local erasure.
   // Storage object deletion uses the Storage API, never SQL metadata deletion.
   await fence();
   const objects: {bucket_id:string;name:string}[]=await command('storage_inventory',args);
   for(const bucket of new Set((objects??[]).map(o=>o.bucket_id as string))) {
    await fence();
    const {error}=await admin.storage.from(bucket).remove(objects!.filter(o=>o.bucket_id===bucket).map(o=>o.name));
    if(error) throw new Error('storage_cleanup_failed');
   }
   if((await command('storage_inventory',args)).length!==0) throw new Error('storage_cleanup_incomplete');
   await evidence('storage',true);
   if(providersComplete || request.attempts>=run.max_attempts) {
    await fence();
    await checked(admin.from('external_calendar_connections').delete().eq('user_id',request.account_id));
    await checked(admin.from('apple_revocation_credentials').delete().eq('account_id',request.account_id));
   }
   await fence();
   const cleanup=await command('database_cleanup',args);
   if(cleanup.partial) {
    // Exclusively owned credentials are independent of shared household ownership.
    if(providersComplete) {
     await checked(admin.from('external_calendar_connections').delete().eq('user_id',request.account_id));
     await checked(admin.from('apple_revocation_credentials').delete().eq('account_id',request.account_id));
    }
    await command('retry',{...args,category:'shared_resources_pending_review',permanent:!cleanup.more_work});
    continue;
   }
   if(!providersComplete && request.attempts<run.max_attempts) throw new Error('provider_retry_required');
   await fence();
   const existing=await admin.auth.admin.getUserById(request.account_id);
   if(existing.data.user) { const {error}=await admin.auth.admin.deleteUser(request.account_id); if(error) throw new Error('auth_delete_failed'); }
   const verifyAuth=await admin.auth.admin.getUserById(request.account_id);
   if(verifyAuth.data.user || (verifyAuth.error && verifyAuth.error.status!==404)) throw new Error('auth_verification_failed');
   await evidence('auth',true);
   if(!providersComplete) throw new Error('provider_retry_required');
   await command('finish',args);
  } catch(error) {
   const category=safeCategory(error);
   try { await command('retry',{...args,category,permanent:category==='shared_household_requires_policy' || category==='unclassified_resource'}); }
   catch { /* A fenced worker has no authority to change the new owner's attempt. */ }
  }
 }
 await drainDeletionEmail();
 await command('complete_run',{run_id:run.run_id});
 return {run_id:run.run_id,claimed:run.requests.length,dry_run:run.dry_run,enabled:run.enabled};
}
