import { adminClient } from './supabaseAdmin.ts';
import { command, drainDeletionEmail, reconcileRestoration, deliveryRecipient } from './deletionService.ts';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { safeCategory, verifiedAuthAbsence, needsProviderReconciliation, providerSettled } from './deletionCore.ts';
import {revokeGoogle,settleGoogleRevocation,revokeApple,settleAppleRevocation,deleteRevenueCatCustomer} from './deletionProviders.ts';

async function checked(query: any) { const {data,error}=await query; if(error) throw new Error('database_unavailable'); return data; }
export async function processDeletions() {
 const admin=adminClient();
 // Auth deactivation and recovery are reconciled independently from the destructive switch.
 const scope=await command('processing_scope');
 let pendingQuery=admin.from('account_deletion_requests').select('id,account_id,status,evidence,auth_deactivation_pending,deactivated_at')
  .in('status',['restoring','deactivated']).limit(20);
 if(scope.scoped)pendingQuery=pendingQuery.in('account_id',scope.accounts);
 const pending=scope.scoped&&!scope.accounts.length?[]:await checked(pendingQuery);
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
   const authLookupUnavailable=!!userResult.error&&!verifiedAuthAbsence(userResult)
    || (!userResult.data.user&&!verifiedAuthAbsence(userResult));
   if(authLookupUnavailable)await evidence('auth_lookup_failure','requires_retry');
   if(userResult.data.user?.email) {
    const encrypted=await encryptSecret(JSON.stringify({email:deliveryRecipient(userResult.data.user.email)}));
    await command('prepare_completion',{...args,...encrypted});
   }
   let providersComplete=!authLookupUnavailable;
   if(needsProviderReconciliation(request.evidence)) {
    async function provider(name:string,work:()=>Promise<void|'manual_revocation_required'|'credential_already_invalid'>) {
     if(providerSettled(name,request.evidence[name]))return;
     try {await evidence(name,(await work())??true);}
     catch {providersComplete=false;await evidence(name,'requires_retry');}
    }
    await provider('google_revoked',async()=>{
     const connections=await checked(admin.from('external_calendar_connections').select('refresh_token_ciphertext,refresh_token_iv').eq('user_id',request.account_id));
     const tokens:string[]=[];
     for(const connection of connections)tokens.push(await decryptSecret(connection.refresh_token_ciphertext,connection.refresh_token_iv));
     const outcome=await settleGoogleRevocation(tokens,async token=>{await fence();await revokeGoogle(token);});
     if(outcome==='credential_already_invalid')return 'credential_already_invalid';
    });
    await provider('apple_revoked',async()=>{
     if(authLookupUnavailable)throw new Error('apple_identity_unverified');
     if(!userResult.data.user&&!Array.isArray(request.evidence.identity_providers))throw new Error('apple_identity_unverified');
     const credentials=await checked(admin.from('apple_revocation_credentials').select('token_ciphertext,token_iv').eq('account_id',request.account_id));
     const tokens:string[]=[];
     for(const credential of credentials)tokens.push(await decryptSecret(credential.token_ciphertext,credential.token_iv));
     const appleLinked=request.evidence.apple_legacy==='manual_revocation_required'
      || request.evidence.identity_providers?.includes('apple') || !!userResult.data.user?.identities?.some(i=>i.provider==='apple');
     const outcome=await settleAppleRevocation(appleLinked,tokens,async token=>{
      const { appleClientSecret }=await import('./deletionApple.ts');
      await fence();
      await revokeApple(token,Deno.env.get('APPLE_DELETION_CLIENT_ID')!,await appleClientSecret());
     });
     if(outcome==='manual_revocation_required') {
      // Erasure continues; Apple's grant is not claimed revoked. The user is told
      // how to remove Her Keys from their Apple Account (completion email/app).
      await evidence('apple_legacy','manual_revocation_required');
      return 'manual_revocation_required';
     }
    });
    await provider('revenuecat_deleted',async()=>{
     const rcKey=Deno.env.get('REVENUECAT_DELETION_API_KEY'), rcProject=Deno.env.get('REVENUECAT_PROJECT_ID');
     if(!rcKey || !rcProject) throw new Error('revenuecat_not_configured');
     await fence();
     await deleteRevenueCatCustomer(request.account_id,rcKey,rcProject);
    });
    if(providersComplete)await evidence('providers',true);
    else await evidence('provider_failure','requires_retry');
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
    await command('retry',{...args,category:'shared_resources_pending_review',permanent:!cleanup.more_work&&providersComplete});
    continue;
   }
   if(!providersComplete && request.attempts<run.max_attempts) throw new Error('provider_retry_required');
   await fence();
   const existing=await admin.auth.admin.getUserById(request.account_id);
   if(existing.data.user) { const {error}=await admin.auth.admin.deleteUser(request.account_id); if(error) throw new Error('auth_delete_failed'); }
   const verifyAuth=await admin.auth.admin.getUserById(request.account_id);
   if(!verifiedAuthAbsence(verifyAuth)) throw new Error('auth_verification_failed');
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
