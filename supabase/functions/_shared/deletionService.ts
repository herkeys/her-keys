import { adminClient, requireUser, AuthError } from './supabaseAdmin.ts';
import { encryptSecret, decryptSecret, randomUrlSafe, sha256Base64Url } from './crypto.ts';
import { json, options } from './http.ts';
import { isOpaqueProof, safeCategory, recoveryEmail } from './deletionCore.ts';

export async function command(action: string, args: Record<string, unknown> = {}): Promise<any> {
 const { data, error } = await adminClient().rpc('herkeys_deletion_command', { p_action: action, p_args: args });
 if (error) throw new Error(error.message);
 return data;
}
async function recoveryPayload(email: string, token: string) {
 return encryptSecret(JSON.stringify({email:deliveryRecipient(email),token}));
}
export function deliveryRecipient(email:string):string {
 if(Deno.env.get('SUPABASE_URL')!=='https://fhhudicklmpofuzkxeqe.supabase.co')return email;
 const allowed=Deno.env.get('DELETION_STAGING_RECIPIENT');if(!allowed)throw new Error('staging_recipient_unconfigured');
 const [local,domain]=allowed.toLowerCase().split('@');
 const candidate=email.toLowerCase();
 if(candidate!==allowed.toLowerCase() && !(candidate.startsWith(local+'+herkeys-deletion-') && candidate.endsWith('@'+domain)))throw new Error('staging_recipient_not_allowed');
 return allowed;
}
export async function queueRecovery(accountId: string, email: string) {
 const token = randomUrlSafe();
 const encrypted = await recoveryPayload(email, token);
 await command('resend', { account_id:accountId, recovery_hash:await sha256Base64Url(token), ...encrypted });
}
export async function reconcileRestoration(requestId: string, accountId: string): Promise<boolean> {
 const state=await adminClient().from('account_deletion_requests').select('auth_deactivation_pending,status').eq('id',requestId).single();
 if(state.error || state.data?.auth_deactivation_pending || state.data?.status!=='restoring')return false;
 const user=await adminClient().auth.admin.getUserById(accountId);
 if(!user.data.user?.email) return false;
 const encrypted=await encryptSecret(JSON.stringify({email:deliveryRecipient(user.data.user.email)}));
 const {error}=await adminClient().auth.admin.updateUserById(accountId,{ban_duration:'none'});
 if(error) return false;
 await command('restored',{request_id:requestId,...encrypted});
 return true;
}
export async function handleDeletion(req: Request, action: 'request'|'restore'|'resend'|'status') {
 if(req.method==='OPTIONS') return options();
 if(req.method!=='POST') return json({error:'method_not_allowed'},405);
 try {
  if(Number(req.headers.get('content-length')??0)>4096) return json({error:'invalid_request'},400);
  const raw=await req.text(); if(raw.length>4096) return json({error:'invalid_request'},400);
  const body=JSON.parse(raw || '{}');
  if(action==='request') {
   const user=await requireUser(req, true);
   if(user.is_anonymous || !user.email_confirmed_at || !user.email) return json({error:'verified_identity_required'},403);
   if(Deno.env.get('SUPABASE_URL')==='https://fhhudicklmpofuzkxeqe.supabase.co' && user.app_metadata?.deletion_certification_fixture!==true)
    return json({error:'staging_disposable_fixture_required'},403);
   if(!isOpaqueProof(body.receipt)) return json({error:'invalid_receipt'},400);
   const bearer=req.headers.get('authorization')!.slice(7);
   const {data:claims,error}=await adminClient().auth.getClaims(bearer);
   if(error || claims?.claims.sub!==user.id) return json({error:'unauthorized'},401);
   const token=randomUrlSafe(); const encrypted=await recoveryPayload(user.email,token);
   const result=await command('request',{account_id:user.id,session_id:claims.claims.session_id,
    receipt_hash:await sha256Base64Url(body.receipt),recovery_hash:await sha256Base64Url(token),...encrypted});
   if(result.duplicate)return json({...result,email_status:'previously_queued'});
   // Restrictive database state is authoritative even if Auth/provider calls fail.
   const revoke=await adminClient().auth.admin.signOut(bearer,'global');
   const ban=await adminClient().auth.admin.updateUserById(user.id,{ban_duration:'876000h'});
   await command('deactivation_ack',{request_id:result.request_id,auth_ban:!ban.error,session_revocation:!revoke.error});
   return json({...result,email_status:'queued',auth_reconciliation_pending:!!ban.error || !!revoke.error});
  }
  if(action==='status') {
   if(!isOpaqueProof(body.receipt)) return json({error:'invalid_receipt'},400);
   const result=await command('status',{receipt_hash:await sha256Base64Url(body.receipt)});
   return json(result,result.status==='unknown'?404:200);
  }
  if(action==='restore') {
   if(!isOpaqueProof(body.token)) return json({status:'invalid_or_expired'},400);
   const result=await command('restore',{recovery_hash:await sha256Base64Url(body.token)});
   if(result.status!=='restoring') return json({status:'invalid_or_expired'},400);
   const restored=await reconcileRestoration(result.request_id,result.account_id);
   return json({status:restored?'restored':'recovery_pending',sign_in_required:true},restored?200:202);
  }
  // Same public response for existing, unknown, expired, and rate-limited addresses.
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({status:'If recovery is available, a message will be queued.'});
  const limit=await command('rate_limit',{key_hash:await sha256Base64Url(email)});
  if(limit.allowed) {
   const pending=await command('lookup_pending',{email});
   if(pending.account_id) await queueRecovery(pending.account_id,email);
  }
  return json({status:'If recovery is available, a message will be queued.'});
 } catch(error) {
  if(action==='resend') {
   console.warn('deletion_resend_unavailable');
   return json({status:'If recovery is available, a message will be queued.'});
  }
  if(error instanceof AuthError) return json({error:'unauthorized'},401);
  const category=safeCategory(error);
  if(category==='recent_auth_required') return json({error:category},403);
  return json({error:'temporarily_unavailable'},503);
 }
}

export async function drainDeletionEmail() {
 const admin=adminClient();
 const rows=await command('claim_email');
 for(const row of rows) {
  try {
   const payload=JSON.parse(await decryptSecret(row.payload_ciphertext,row.payload_iv));
   const project=Deno.env.get('SUPABASE_URL');
   if(project==='https://fhhudicklmpofuzkxeqe.supabase.co' && payload.email!==Deno.env.get('DELETION_STAGING_RECIPIENT'))
    throw new Error('staging_recipient_not_allowed');
   if(Deno.env.get('DELETION_EMAIL_ENABLED')!=='true') throw new Error('email_disabled');
   const key=Deno.env.get('RESEND_API_KEY'); if(!key) throw new Error('email_unconfigured');
   const base=Deno.env.get('SUPABASE_URL')==='https://fhhudicklmpofuzkxeqe.supabase.co'
    ?(Deno.env.get('DELETION_RECOVERY_BASE_URL')??'https://herkeys.app/account/restore'):'https://herkeys.app/account/restore';
   if(base!=='https://herkeys.app/account/restore' && base!=='http://localhost:3100/account/restore')throw new Error('invalid_recovery_origin');
   const message=recoveryEmail(row.kind,row.deadline,payload.token?base+'#token='+payload.token:undefined);
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
    Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'herkeys-deletion-'+row.id
   },body:JSON.stringify({from:'Her Keys <accounts@herkeys.app>',to:[payload.email],...message}),signal:AbortSignal.timeout(10000)});
   if(!response.ok) throw new Error('email_provider_failed');
   const data=await response.json();
   if(typeof data.id!=='string') throw new Error('email_acceptance_unconfirmed');
   const accepted=await admin.from('account_deletion_outbox').update({status:'accepted',provider_message_id:data.id,
    payload_ciphertext:null,payload_iv:null,lease_until:null}).eq('id',row.id).eq('attempts',row.attempts);
   if(accepted.error)throw new Error('email_acceptance_persistence_failed');
  } catch {
   const failed=await admin.from('account_deletion_outbox').update({status:'failed',lease_until:null,
    next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**row.attempts)).toISOString()}).eq('id',row.id).eq('attempts',row.attempts);
   if(failed.error)throw new Error('email_retry_persistence_failed');
  }
 }
}
