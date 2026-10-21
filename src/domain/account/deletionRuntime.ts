import {parseDeletionReceipt,canEraseDeletedNamespace,canResetLocalNamespace} from './deletion';
import type {AccountRuntime} from './accountRuntime';
import type {AccountSession} from './identity';
import type {SecureStorageAdapter,SecureSessionStore} from './secureSession';
import type {SyncRuntime} from '../sync/syncRuntime';
import type {AppStore} from '../../state/appStore';
import {activeAccountId} from './authState';
interface DeletionDependencies {
 secure:SecureStorageAdapter;sessions:SecureSessionStore;accountRuntime:AccountRuntime;appStore:AppStore;
 syncRuntime:Pick<SyncRuntime,'stop'|'idle'|'onAccountState'>;
 call(name:string,body:unknown,token?:string):Promise<any>;
 activeStatus(token:string):Promise<boolean>;
 refresh(session:AccountSession):Promise<AccountSession>;
 randomProof():string;fingerprint(accountId:string):Promise<string>;
}
export function createDeletionRuntime({secure,sessions,accountRuntime,appStore,syncRuntime,call,activeStatus,refresh,randomProof,fingerprint}:DeletionDependencies) {
const KEY='herkeys.secure.deletionReceipt';
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
type Gate={kind:'checking'|'active'|'pending'|'review'|'unavailable'|'purged'|'restored';deadline?:string};
let gate:Gate={kind:'checking'},inFlight:Promise<void>|null=null;
let scopeVersion=0,operationVersion=0,mutating=false,checkAgain=false;
const scopeKey=()=>JSON.stringify([appStore.currentIdentity().binding?.accountId??null,activeAccountId(accountRuntime.getState())??appStore.currentIdentity().binding?.accountId??null]);
let lastScope=scopeKey();
const observe=()=>{const next=scopeKey();if(next!==lastScope){lastScope=next;scopeVersion++;if((inFlight||mutating)&&(appStore.currentIdentity().binding||activeAccountId(accountRuntime.getState())))checkAgain=true;}};
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
 gate=next; appStore.setAccountAccessBlocked(next.kind!=='active');
 if(next.kind!=='active')syncRuntime.stop();
 else syncRuntime.onAccountState(accountRuntime.getState());
 for(const listener of listeners)listener();
}
async function check() {
 const scope=capture();
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
   if((namespace&&namespace!==session.session.accountId)||(actor&&actor!==session.session.accountId))throw new Error('session_namespace_mismatch');
   if(session.expired) {
    const refreshed=await refresh(session.session);scope.assert();
    await sessions.write(refreshed);scope.assert();
    session=await sessions.read(Date.now());if(session.kind!=='session')throw new Error('session_unavailable');
   }
   const active=await activeStatus(session.session.accessToken);scope.assert();
   if(!active){publish({kind:'pending'});return;}
  }
  publish({kind:'active'});
 } catch {if(scope.current())publish({kind:'unavailable'});}
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
