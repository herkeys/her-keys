export type DeletionStatus = { status: 'pending' | 'restored' | 'failed' | 'purged' | 'unknown'; deadline?: string; purged_at?: string | null; verified_at?: string | null };
export function isOpaqueProof(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function verifiedAuthAbsence(result: {data:{user:unknown};error:{status?:number}|null}):boolean {
 return result.data.user===null && result.error?.status===404;
}
export function verifiedProviderEvidence(evidence:Record<string,unknown>):boolean {
 return ['google_revoked','apple_revoked','revenuecat_deleted'].every(key=>evidence[key]===true);
}
export function needsProviderReconciliation(evidence:Record<string,unknown>):boolean {
 return !verifiedProviderEvidence(evidence)||evidence.providers!==true;
}
export function deletionHealthNeedsAttention(health:Record<string,unknown>):boolean {
 return ['scheduler_stale','retention_stale','retention_failed'].some(key=>health[key]===true)
  || ['failed','overdue_cases','overdue_requests','stale_leases','email_problems','retention_overdue']
   .some(key=>typeof health[key]==='number'&&(health[key] as number)>0);
}
export function isVerifiedPurge(value: unknown): value is DeletionStatus {
 if (!value || typeof value !== 'object') return false;
 const v = value as DeletionStatus;
 return v.status === 'purged' && typeof v.purged_at === 'string' && Number.isFinite(Date.parse(v.purged_at))
  && typeof v.verified_at === 'string' && Number.isFinite(Date.parse(v.verified_at));
}
export function safeCategory(error: unknown): string {
 const message = error instanceof Error ? error.message : '';
 return ['shared_household_requires_policy','unclassified_resource','recent_auth_required','lease_or_control_refused','terminal_verification_failed']
  .find(code => message.includes(code)) ?? 'operation_unavailable';
}
export function recoveryEmail(kind: string, deadline: string, recoveryUrl?: string) {
 const date = new Date(deadline).toISOString();
 const recovery = kind === 'recovery';
 const subject = kind === 'problem' ? 'Your Her Keys deletion request requires privacy review' : recovery ? 'Your Her Keys account is deactivated — recovery available' :
  kind === 'restored' ? 'Your Her Keys account has been restored' : 'Your Her Keys account has been permanently deleted';
 const lines = kind === 'problem' ? ['Your account remains disabled. Permanent deletion is not yet complete.',
  'Some shared resources require manual privacy review. We will not automatically transfer ownership or erase another adult’s records.',
  'Our operator target is to resolve the case within seven days after escalation. Your personal information must not be retained indefinitely; unresolved cases remain open and are escalated.',
  'Use your private deletion receipt to check status, or contact Her Keys support.'] : recovery ? [
  'Your account access has stopped. Your deletion request is recorded.',
  'You can recover your account before ' + date + ' (UTC). After this deadline permanent deletion will be processed automatically.',
  'This replacement link supersedes any earlier recovery link. Open it and confirm to restore; then sign in again.',
  recoveryUrl ?? '', 'Account deletion does not cancel an Apple or Google subscription.',
 ] : [kind === 'restored' ? 'Account access is restored. Please sign in again.' : 'Her Keys account data has been permanently deleted after verification.'];
 const text = subject + '\n\n' + lines.join('\n\n') + '\n\nSubscription management: https://apps.apple.com/account/subscriptions or https://play.google.com/store/account/subscriptions\nSupport: https://herkeys.app/support';
 const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return { subject, text, html: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(subject)+'</title></head><body style="font:16px/1.6 Arial,sans-serif;background:#faf7f1;color:#272721"><main style="max-width:560px;margin:auto;padding:24px"><h1 style="font-size:24px">Her Keys</h1><h2 style="font-size:20px">'+escape(subject)+'</h2>'+lines.map(s=>'<p>'+escape(s)+'</p>').join('')+(recoveryUrl?'<p><a style="display:inline-block;padding:14px 24px;background:#272721;color:#fff" href="'+escape(recoveryUrl)+'">Restore my account</a></p>':'')+'<p><a href="https://herkeys.app/support">Contact support</a></p></main></body></html>' };
}
