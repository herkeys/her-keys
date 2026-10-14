import * as Crypto from 'expo-crypto';
import {supabaseConfig} from '../config/supabase';
import {createDeviceSecureStorage} from '../platform/secureStore';
import {createSecureSessionStore} from '../domain/account/secureSession';
import {parseDeletionReceipt,canEraseDeletedNamespace,type DeletionReceipt} from '../domain/account/deletion';
import {accountRuntime,syncRuntime} from './accountRuntimeInstance';
import {appStore} from './appStoreInstance';
import {createSupabaseClient} from '../platform/supabaseCloud';
import {sessionFromSupabase} from '../platform/sessionMapping';

const secure=createDeviceSecureStorage(), sessions=createSecureSessionStore(secure);
const KEY='herkeys.secure.deletionReceipt';
type Gate={kind:'checking'|'active'|'pending'|'review'|'unavailable'|'purged'|'restored';deadline?:string};
let gate:Gate={kind:'checking'},inFlight:Promise<void>|null=null;
const listeners=new Set<()=>void>();
function publish(next:Gate) {
 gate=next; appStore.setAccountAccessBlocked(next.kind!=='active');
 if(next.kind!=='active')syncRuntime.stop();
 else syncRuntime.onAccountState(accountRuntime.getState());
 for(const listener of listeners)listener();
}
async function call(name:string,body:unknown,token?:string):Promise<any>{
 if(!supabaseConfig.url || !supabaseConfig.anonKey)throw new Error('not_configured');
 const response=await fetch(supabaseConfig.url+'/functions/v1/'+name,{method:'POST',headers:{
  'Content-Type':'application/json',apikey:supabaseConfig.anonKey,...(token?{Authorization:'Bearer '+token}:{})
 },body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'temporarily_unavailable');
 return result;
}
async function activeStatus(token:string):Promise<boolean> {
 const response=await fetch(supabaseConfig.url+'/rest/v1/rpc/account_access_status',{method:'POST',headers:{
  'Content-Type':'application/json',apikey:supabaseConfig.anonKey!,Authorization:'Bearer '+token
 },body:'{}',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('status_unavailable');
 return await response.json()==='active';
}
async function check() {
 try {
  const receipt=parseDeletionReceipt(await secure.getItem(KEY));
  if(receipt) {
   const status=await call('deletion-status',{receipt:receipt.proof});
   if(status.status==='purged') {
    const identity=appStore.currentIdentity();
    if(canEraseDeletedNamespace(status,receipt,identity.binding?.accountId??null)) {
     syncRuntime.stop();await syncRuntime.idle();await accountRuntime.signOut();
     if(!await appStore.reset())throw new Error('local_cleanup_unavailable');
     await secure.deleteItem(KEY);
    }
    publish({kind:'purged'});return;
   }
   if(status.status==='restored') {
    await accountRuntime.signOut();await secure.deleteItem(KEY);publish({kind:'restored'});return;
   }
   publish({kind:status.status==='failed'?'review':'pending',deadline:status.deadline});return;
  }
  let session=await sessions.read(Date.now());
  if(session.kind==='unavailable'||session.kind==='unreadable')throw new Error('session_unavailable');
  if(session.kind==='session') {
   if(session.expired) {
    const auth=createSupabaseClient();if(!auth)throw new Error('not_configured');
    const refreshed=await auth.auth.refreshSession({refresh_token:session.session.refreshToken});
    if(refreshed.error || !refreshed.data.session || refreshed.data.session.user.id!==session.session.accountId)throw new Error('refresh_unavailable');
    await sessions.write(sessionFromSupabase(refreshed.data.session,session.session.accountId,session.session.provider));
    session=await sessions.read(Date.now());if(session.kind!=='session')throw new Error('session_unavailable');
   }
   if(!await activeStatus(session.session.accessToken)){publish({kind:'pending'});return;}
  }
  publish({kind:'active'});
 } catch {publish({kind:'unavailable'});}
}
export const deletionRuntime={
 getSnapshot:()=>gate,
 subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 restrict(){publish({kind:'checking'});},
 check(){return inFlight??=(check().finally(()=>{inFlight=null;}));},
 continueToSignIn(){publish({kind:'active'});},
 async request(){
  const account=accountRuntime.getState();
  if(account.kind!=='accountBound')throw new Error('Please sign in again before deleting.');
  let receipt=parseDeletionReceipt(await secure.getItem(KEY));
  if(receipt && receipt.accountId!==account.session.accountId)throw new Error('Another account has a pending deletion receipt.');
  receipt??={accountId:account.session.accountId,proof:base64Url(Crypto.getRandomBytes(32))};
  await secure.setItem(KEY,JSON.stringify(receipt)); // durable BEFORE a request whose response might be lost
  publish({kind:'checking'});await syncRuntime.idle();await appStore.flush();
  try {
   const result=await call('request-account-deletion',{receipt:receipt.proof},account.session.accessToken);
   receipt.deadline=result.deadline;await secure.setItem(KEY,JSON.stringify(receipt));
   publish({kind:'pending',deadline:result.deadline});
   await accountRuntime.signOut();
  } catch(error) {
   // Only a positive active-account answer permits resuming local use after an ambiguous request.
   try {if(await activeStatus(account.session.accessToken)){await secure.deleteItem(KEY);publish({kind:'active'});}else publish({kind:'pending'});}
   catch {publish({kind:'unavailable'});}
   throw error;
  }
 },
 async resend(email:string){return call('resend-restoration-email',{email});}
};
function base64Url(bytes:Uint8Array):string {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let result='',bits=0,value=0;
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=6){bits-=6;result+=alphabet[(value>>>bits)&63];}}
 if(bits)result+=alphabet[(value<<(6-bits))&63];return result;
}
