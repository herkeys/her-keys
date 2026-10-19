import {adminClient} from './supabaseAdmin.ts';
import {command} from './deletionService.ts';
import {sha256Base64Url} from './crypto.ts';
import {deletionHealthNeedsAttention} from './deletionCore.ts';
export async function pollDeletionDelivery() {
 const admin=adminClient(),key=Deno.env.get('RESEND_API_KEY');if(!key)return;
 const {data,error}=await admin.from('account_deletion_outbox').select('id,provider_message_id')
  .eq('status','accepted').eq('delivery_status','unconfirmed').order('delivery_checked_at',{nullsFirst:true}).limit(10);
 if(error)throw new Error('email_monitor_unavailable');
 for(const row of data??[]) {
  const response=await fetch('https://api.resend.com/emails/'+encodeURIComponent(row.provider_message_id),{
   headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
  if(!response.ok)continue;
  const result=await response.json(),event=result.last_event;
  const terminal=['delivered','bounced','complained','failed','suppressed'];
  const {error:writeError}=await admin.from('account_deletion_outbox').update({
   delivery_status:terminal.includes(event)?event:'unconfirmed',delivery_checked_at:new Date().toISOString()
  }).eq('id',row.id);
  if(writeError)throw new Error('email_monitor_unavailable');
 }
}
export async function monitorDeletions() {
 await pollDeletionDelivery();
 const health=await command('health');
 const unhealthy=deletionHealthNeedsAttention(health);
 if(!unhealthy)return {healthy:true};
 const recipient=Deno.env.get('DELETION_ALERT_RECIPIENT'),key=Deno.env.get('RESEND_API_KEY');
 if(!recipient||!key)throw new Error('deletion_alert_not_configured');
 const fingerprint=await sha256Base64Url(JSON.stringify({failed:health.failed,overdue_cases:health.overdue_cases,overdue_requests:health.overdue_requests,
  scheduler_stale:health.scheduler_stale,stale_leases:health.stale_leases,email_problems:health.email_problems,
  retention_stale:health.retention_stale,retention_failed:health.retention_failed,retention_overdue:health.retention_overdue,hour:Math.floor(Date.now()/3600000)}));
 const admin=adminClient();
 let claim=await admin.from('account_deletion_alerts').insert({fingerprint}).select('id').single();
 if(claim.error) {
  if(claim.error.code!=='23505')throw new Error('alert_claim_unavailable');
  claim=await admin.from('account_deletion_alerts').update({status:'sending',lease_until:new Date(Date.now()+120000).toISOString()})
   .eq('fingerprint',fingerprint).in('status',['sending','failed']).lt('lease_until',new Date().toISOString()).select('id').single();
  if(claim.error)return {healthy:false,alert:'already_claimed'};
 }
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
  Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'herkeys-deletion-alert-'+claim.data.id
 },body:JSON.stringify({from:'Her Keys <accounts@herkeys.app>',to:[recipient],
  subject:'Her Keys deletion lifecycle requires attention',
  text:'Environment: '+Deno.env.get('SUPABASE_URL')+'\nOperational counts only: '+JSON.stringify(health)+'\nReview lifecycle operations and use the kill switch if needed. No customer data is included.'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok) {
  await admin.from('account_deletion_alerts').update({status:'failed'}).eq('id',claim.data.id);
  throw new Error('alert_delivery_unavailable');
 }
 const result=await response.json();
 if(typeof result.id!=='string')throw new Error('alert_acceptance_unconfirmed');
 const write=await admin.from('account_deletion_alerts').update({status:'accepted',sent_at:new Date().toISOString(),provider_message_id:result.id}).eq('id',claim.data.id);
 if(write.error)throw new Error('alert_receipt_unavailable');
 return {healthy:false,alert:'accepted'};
}
