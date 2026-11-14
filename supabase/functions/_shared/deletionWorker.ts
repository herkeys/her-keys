import { adminClient } from './supabaseAdmin.ts';
import { command, drainDeletionEmail, reconcileDeletionAccess, deliveryRecipient } from './deletionService.ts';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { safeCategory, verifiedAuthAbsence, needsProviderReconciliation, providerSettled } from './deletionCore.ts';
import {revokeGoogle,settleGoogleRevocation,revokeApple,settleAppleRevocation,deleteRevenueCatCustomer} from './deletionProviders.ts';

async function checked(query: any) { const {data,error}=await query; if(error) throw new Error('database_unavailable'); return data; }
export async function processDeletions() {
 const admin=adminClient();
 // Auth deactivation and recovery are reconciled independently from the destructive switch.
 await reconcileDeletionAccess().catch(()=>console.warn('deletion_access_reconciliation_unavailable'));
 await drainDeletionEmail().catch(()=>console.warn('deletion_email_drain_unavailable'));
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
   const providerEvidence={...request.evidence};
   if(needsProviderReconciliation(request.evidence)) {
    async function provider(name:string,work:()=>Promise<void|'manual_revocation_required'|'credential_already_invalid'>) {
     if(providerSettled(name,request.evidence[name]))return;
     try {const result=(await work())??true;await evidence(name,result);providerEvidence[name]=result;}
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
   // Retain unresolved revocation material in restricted storage for reviewed
   // retry. Removing it at exhaustion would turn a later empty lookup into
   // false evidence that the grant never existed.
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
   if(providerSettled('google_revoked',providerEvidence.google_revoked)) {
    await fence();
    await checked(admin.from('external_calendar_connections').delete().eq('user_id',request.account_id));
   }
   if(providerSettled('apple_revoked',providerEvidence.apple_revoked)) {
    await fence();
    await checked(admin.from('apple_revocation_credentials').delete().eq('account_id',request.account_id));
   }
   await fence();
   const cleanup=await command('database_cleanup',args);
   if(cleanup.partial) {
    await command('retry',{...args,category:'shared_resources_pending_review',permanent:!cleanup.more_work&&providersComplete});
    continue;
   }
   if(!providersComplete) throw new Error('provider_retry_required');
   await fence();
   const existing=await admin.auth.admin.getUserById(request.account_id);
   if(existing.data.user) { const {error}=await admin.auth.admin.deleteUser(request.account_id); if(error) throw new Error('auth_delete_failed'); }
   const verifyAuth=await admin.auth.admin.getUserById(request.account_id);
   if(!verifiedAuthAbsence(verifyAuth)) throw new Error('auth_verification_failed');
   await evidence('auth',true);
   await command('finish',args);
  } catch(error) {
   const category=safeCategory(error);
   try { await command('retry',{...args,category,permanent:category==='shared_household_requires_policy' || category==='unclassified_resource'}); }
   catch { /* A fenced worker has no authority to change the new owner's attempt. */ }
  }
 }
 await command('complete_run',{run_id:run.run_id});
 return {run_id:run.run_id,claimed:run.requests.length,dry_run:run.dry_run,enabled:run.enabled};
}
