import {parseDeletionReceipt,canEraseDeletedNamespace,canResetLocalNamespace} from './deletion';
import type {AccountRuntime} from './accountRuntime';
import type {AccountSession} from './identity';
import type {SecureStorageAdapter,SecureSessionStore} from './secureSession';
import type {SyncRuntime} from '../sync/syncRuntime';
import type {AppStore} from '../../state/appStore';
import {activeAccountId} from './authState';
interface DeletionDependencies {
 secure:SecureStorageAdapter;sessions:SecureSessionStore;accountRuntime:AccountRuntime;appStore:AppStore;
 syncRuntime:Pick<SyncRuntime,'stop'|'idle'|'onAccountState'> & Partial<Pick<SyncRuntime,'setAccessSuspended'>>;
 call(name:string,body:unknown,token?:string):Promise<any>;
 activeStatus(token:string):Promise<boolean>;
 refresh(session:AccountSession):Promise<AccountSession>;
 report?(event:string):void;
 randomProof():string;fingerprint(accountId:string):Promise<string>;
}
// A recent positive server check permits only this device's local household during a network outage.
// It never authorizes cloud traffic, purchases, AI, or a namespace without its own durable session.
export const OFFLINE_ACCOUNT_ACCESS_MAX_AGE_MS=24*60*60*1000;
export function createDeletionRuntime({secure,sessions,accountRuntime,appStore,syncRuntime,call,activeStatus,refresh,randomProof,fingerprint,report}:DeletionDependencies) {
const KEY='herkeys.secure.deletionReceipt';
const ACTIVE_KEY='herkeys.secure.lastActive.';
const deniedAccounts=new Set<string>();
syncRuntime.setAccessSuspended?.(true);
async function readReceipt(accountId:string|null){
 if(!accountId)return null;
 const scoped=await secure.getItem(KEY+'.'+accountId);
 if(scoped!==null)return parseDeletionReceipt(scoped);
 const legacy=parseDeletionReceipt(await secure.getItem(KEY));
 return legacy?.accountId===accountId?legacy:null;
}
async function deleteReceipt(accountId:string){
 await secure.deleteItem(KEY+'.'+accountId);
 const legacy=parseDeletionReceipt(await secure.getItem(KEY));
 if(legacy?.accountId===accountId)await secure.deleteItem(KEY);
}
type Gate={kind:'checking'|'active'|'offline_local'|'pending'|'review'|'unavailable'|'purged'|'restored';deadline?:string};
let gate:Gate={kind:'checking'},inFlight:Promise<void>|null=null;
let scopeVersion=0,operationVersion=0,mutating=false,checkAgain=false;
const scopeKey=()=>JSON.stringify([appStore.currentIdentity().binding?.accountId??null,activeAccountId(accountRuntime.getState())??appStore.currentIdentity().binding?.accountId??null]);
let lastScope=scopeKey();
const observe=()=>{const next=scopeKey();if(next!==lastScope){lastScope=next;scopeVersion++;syncRuntime.setAccessSuspended?.(true);if((inFlight||mutating)&&(appStore.currentIdentity().binding||activeAccountId(accountRuntime.getState())))checkAgain=true;}};
accountRuntime.subscribe(observe);appStore.subscribe(observe);
function capture(){
 observe();const scope=scopeVersion,operation=operationVersion;
 const current=()=>{observe();return scope===scopeVersion&&operation===operationVersion;};
 return {current,assert(){if(!current())throw new Error('local_namespace_changed');}};
}
const matchesAccount=(id:string)=>appStore.currentIdentity().binding?.accountId===id
 && (activeAccountId(accountRuntime.getState())===null||activeAccountId(accountRuntime.getState())===id);
const listeners=new Set<()=>void>();
function publish(next:Gate) {
 gate=next; appStore.setAccountAccessBlocked(next.kind!=='active'&&next.kind!=='offline_local');
 syncRuntime.setAccessSuspended?.(next.kind!=='active');
 if(next.kind!=='active')syncRuntime.stop();
 else syncRuntime.onAccountState(accountRuntime.getState());
 for(const listener of listeners)listener();
}
async function check() {
 const scope=capture();
 let offlineAccount:string|null=null;
 let lastActive:{accountId:string;checkedAt:number}|null=null;
 try {
  const receipt=await readReceipt(appStore.currentIdentity().binding?.accountId??null);
  scope.assert();
  if(receipt) {
   if(!matchesAccount(receipt.accountId))throw new Error('receipt_namespace_mismatch');
   const status=await call('deletion-status',{receipt:receipt.proof});
   scope.assert();
   if(status.status==='purged') {
    const permitted=()=>scope.current()&&matchesAccount(receipt.accountId)&&canEraseDeletedNamespace(status,receipt,appStore.currentIdentity().binding?.accountId??null);
    if(!permitted())throw new Error('terminal_proof_cannot_authorize_this_namespace');
    syncRuntime.stop();await syncRuntime.idle();
    if(!permitted())throw new Error('local_namespace_changed');
    await accountRuntime.signOut(receipt.accountId);
    if(!permitted()||!await appStore.reset(receipt.accountId))throw new Error('local_cleanup_unavailable');
    await deleteReceipt(receipt.accountId);
    if(appStore.currentIdentity().binding||activeAccountId(accountRuntime.getState()))return;
    publish({kind:'purged'});return;
   }
   if(status.status==='restored') {
    await accountRuntime.signOut(receipt.accountId);scope.assert();await deleteReceipt(receipt.accountId);scope.assert();publish({kind:'restored'});return;
   }
   publish({kind:status.status==='failed'?'review':'pending',deadline:status.deadline});return;
  }
  let session=await sessions.read(Date.now());
  scope.assert();
  if(session.kind==='unavailable'||session.kind==='unreadable')throw new Error('session_unavailable');
  if(session.kind==='session') {
   const namespace=appStore.currentIdentity().binding?.accountId??null,actor=activeAccountId(accountRuntime.getState());
   // Another account's session on this household is the quarantine (or, at launch, the restore that will produce it): that
   // account's OWN credential decides only its own status, and the route table opens nothing but the conflict screen. Refusing it
   // here showed "Account status unavailable" offering a reset of the OTHER account's household, and — since the gate then
   // unmounted AccountProvider — the restore that resolves it never ran (AE2E-D05). A session that contradicts a known actor is
   // still refused.
   const foreign=actor===null||(accountRuntime.getState().kind==='boundOther'&&actor===session.session.accountId);
   if((namespace&&namespace!==session.session.accountId&&!foreign)||(actor&&actor!==session.session.accountId))throw new Error('session_namespace_mismatch');
   if(namespace===session.session.accountId&&(actor===null||actor===namespace)&&!deniedAccounts.has(namespace)) {
    const raw=await secure.getItem(ACTIVE_KEY+namespace);scope.assert();
    try {lastActive=raw?JSON.parse(raw):null;}catch{lastActive=null;}
    offlineAccount=namespace;
   }
   if(session.expired) {
    const refreshed=await refresh(session.session);scope.assert();
    await sessions.write(refreshed);scope.assert();
    session=await sessions.read(Date.now());if(session.kind!=='session')throw new Error('session_unavailable');
   }
   const active=await activeStatus(session.session.accessToken);scope.assert();
   if(!active){deniedAccounts.add(session.session.accountId);await secure.deleteItem(ACTIVE_KEY+session.session.accountId);scope.assert();publish({kind:'pending'});return;}
   deniedAccounts.delete(session.session.accountId);
   await secure.setItem(ACTIVE_KEY+session.session.accountId,JSON.stringify({accountId:session.session.accountId,checkedAt:Date.now()}));scope.assert();
  }
  publish({kind:'active'});
 } catch(error) {
  if(!scope.current())return;
  report?.(`account.access_check_failed.${error instanceof Error?error.name:'non_error'}.cached_${!!lastActive}.scoped_${!!offlineAccount}`);
  const networkFailure=error instanceof Error&&new Set(['TypeError','AbortError','TimeoutError','AuthRetryableFetchError','AccountAccessNetworkError']).has(error.name);
  const age=lastActive?Date.now()-lastActive.checkedAt:NaN;
  if(networkFailure&&offlineAccount&&lastActive?.accountId===offlineAccount&&Number.isFinite(age)&&age>=0&&age<=OFFLINE_ACCOUNT_ACCESS_MAX_AGE_MS
    &&!deniedAccounts.has(offlineAccount)&&appStore.currentIdentity().binding?.accountId===offlineAccount)publish({kind:'offline_local'});
  else publish({kind:'unavailable'});
 }
}
function runCheck():Promise<void>{
 if(mutating)return Promise.resolve();
 return inFlight??=(check().finally(()=>{inFlight=null;if(checkAgain){checkAgain=false;void runCheck();}}));
}
return {
 getSnapshot:()=>gate,
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 restrict(){publish({kind:'checking'});},
 check:runCheck,
 continueToSignIn(){if(gate.kind==='purged'||gate.kind==='restored')publish({kind:'active'});},
 async request(){
  if(mutating)throw new Error('deletion_operation_in_progress');
  mutating=true;operationVersion++;const scope=capture();
  try {
  const account=accountRuntime.getState();
  if(account.kind!=='accountBound')throw new Error('Please sign in again before deleting.');
  let receipt=await readReceipt(account.session.accountId);
  scope.assert();
  if(receipt && receipt.accountId!==account.session.accountId)throw new Error('Another account has a pending deletion receipt.');
  receipt??={accountId:account.session.accountId,proof:randomProof()};
  deniedAccounts.add(account.session.accountId);await secure.deleteItem(ACTIVE_KEY+account.session.accountId);scope.assert();
  await secure.setItem(KEY+'.'+receipt.accountId,JSON.stringify(receipt)); // durable BEFORE a request whose response might be lost
  scope.assert();
  publish({kind:'checking'});await syncRuntime.idle();await appStore.flush();
  scope.assert();
  try {
   const result=await call('request-account-deletion',{receipt:receipt.proof},account.session.accessToken);
   scope.assert();
   receipt.deadline=result.deadline;await secure.setItem(KEY+'.'+receipt.accountId,JSON.stringify(receipt));
   scope.assert();
   publish({kind:'pending',deadline:result.deadline});
   await accountRuntime.signOut(account.session.accountId);
  } catch(error) {
   if(!scope.current())throw error;
   // Only a positive active-account answer permits resuming local use after an ambiguous request.
   try {const active=await activeStatus(account.session.accessToken);scope.assert();if(active){await deleteReceipt(account.session.accountId);scope.assert();publish({kind:'active'});}else publish({kind:'pending'});}
   catch {if(scope.current())publish({kind:'unavailable'});}
   throw error;
  }
  } finally {mutating=false;if(checkAgain){checkAgain=false;void runCheck();}}
 },
 async resend(email:string){return call('resend-restoration-email',{email});},
 async importReceipt(proof:string){
  if(mutating)throw new Error('deletion_operation_in_progress');
  operationVersion++;const scope=capture();
  const accountId=appStore.currentIdentity().binding?.accountId;
  if(!accountId||!/^[A-Za-z0-9_-]{43}$/.test(proof))throw new Error('receipt_namespace_required');
  const status=await call('deletion-status',{receipt:proof});
  scope.assert();const expectedFingerprint=await fingerprint(accountId);scope.assert();
  if(status.account_fingerprint!==expectedFingerprint)throw new Error('receipt_for_another_account');
  await secure.setItem(KEY+'.'+accountId,JSON.stringify({accountId,proof,deadline:status.deadline}));
  scope.assert();
  await check();
 },
 localAccountId(){return appStore.currentIdentity().binding?.accountId??null;},
 async resetLocalData(confirmation:string,expectedAccountId:string|null){
  if(mutating)throw new Error('deletion_operation_in_progress');
  mutating=true;operationVersion++;const scope=capture();
  try {
  const permitted=()=>scope.current()&&canResetLocalNamespace(confirmation,expectedAccountId,appStore.currentIdentity().binding?.accountId??null);
  if(!permitted())throw new Error('local_reset_confirmation_required');
  publish({kind:'checking'});syncRuntime.stop();await syncRuntime.idle();
  if(!permitted())throw new Error('local_namespace_changed');
  await accountRuntime.signOut(expectedAccountId!);
  if(!permitted()||!await appStore.reset(expectedAccountId!))throw new Error('local_cleanup_unavailable');
  const receipt=await readReceipt(expectedAccountId);
  if(appStore.currentIdentity().binding||activeAccountId(accountRuntime.getState()))return;
  if(receipt?.accountId===expectedAccountId)await deleteReceipt(expectedAccountId!);
  publish({kind:'active'});
  } catch(error){if(scope.current())publish({kind:'unavailable'});throw error;}
  finally {mutating=false;if(checkAgain){checkAgain=false;void runCheck();}}
 }
};
}
