import * as Crypto from 'expo-crypto';
import {isAuthRetryableFetchError} from '@supabase/supabase-js';
import {supabaseConfig} from '../config/supabase';
import {createDeviceSecureStorage} from '../platform/secureStore';
import {createSecureSessionStore} from '../domain/account/secureSession';
import {createDeletionRuntime} from '../domain/account/deletionRuntime';
import {fetchAccountAccessStatus} from '../domain/account/accountAccessStatus';
import {accountRuntime,syncRuntime} from './accountRuntimeInstance';
import {appStore} from './appStoreInstance';
import {createSupabaseClient} from '../platform/supabaseCloud';
import {sessionFromSupabase} from '../platform/sessionMapping';
const secure=createDeviceSecureStorage(),sessions=createSecureSessionStore(secure);
async function call(name:string,body:unknown,token?:string):Promise<any>{
 if(!supabaseConfig.url || !supabaseConfig.anonKey)throw new Error('not_configured');
 const response=await fetch(supabaseConfig.url+'/functions/v1/'+name,{method:'POST',headers:{
  'Content-Type':'application/json',apikey:supabaseConfig.anonKey,...(token?{Authorization:'Bearer '+token}:{})
 },body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'temporarily_unavailable');
 return result;
}
async function activeStatus(token:string):Promise<boolean> {
 if(!supabaseConfig.url||!supabaseConfig.anonKey)throw new Error('not_configured');
 return fetchAccountAccessStatus(fetch,supabaseConfig.url,supabaseConfig.anonKey,token);
}
export const deletionRuntime=createDeletionRuntime({
 secure,sessions,accountRuntime,appStore,syncRuntime,call,activeStatus,
 report:event=>{if(__DEV__)console.info('[herkeys] '+event);},
 randomProof:()=>base64Url(Crypto.getRandomBytes(32)),
 fingerprint:accountId=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'herkeys-deletion:'+accountId),
 async refresh(session){
  const auth=createSupabaseClient();if(!auth)throw new Error('not_configured');
  const result=await auth.auth.refreshSession({refresh_token:session.refreshToken});
  if(result.error){if(isAuthRetryableFetchError(result.error))throw result.error;throw new Error('refresh_unavailable');}
  if(!result.data.session||result.data.session.user.id!==session.accountId)throw new Error('refresh_unavailable');
  return sessionFromSupabase(result.data.session,session.accountId,session.provider);
 }
});
function base64Url(bytes:Uint8Array):string {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let result='',bits=0,value=0;
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=6){bits-=6;result+=alphabet[(value>>>bits)&63];}}
 if(bits)result+=alphabet[(value<<(6-bits))&63];return result;
}
