type Fetcher=typeof fetch;
async function request(fetcher:Fetcher,url:string,init:RequestInit,allowMissing=false) {
 const response=await fetcher(url,{...init,signal:AbortSignal.timeout(15000)});
 if(!response.ok&&!(allowMissing&&response.status===404))throw new Error('provider_unavailable');
 return response;
}
export async function revokeGoogle(token:string,fetcher:Fetcher=fetch) {
 const response=await fetcher('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({token}),signal:AbortSignal.timeout(15000)});
 if(response.ok)return;
 // Google answers invalid_token when the grant was already removed or the token
 // expired. Nothing usable remains to revoke; anything else stays retryable.
 if(response.status===400&&(await response.json().catch(()=>null))?.error==='invalid_token')throw new Error('google_credential_unusable');
 throw new Error('provider_unavailable');
}
export type GoogleRevocationOutcome='revoked'|'credential_already_invalid';
export async function settleGoogleRevocation(tokens:string[],revoke:(token:string)=>Promise<void>):Promise<GoogleRevocationOutcome> {
 let invalid=false;
 for(const token of tokens) {
  try {await revoke(token);}
  catch(error) {if(error instanceof Error&&error.message==='google_credential_unusable')invalid=true;else throw error;}
 }
 return invalid?'credential_already_invalid':'revoked';
}
export async function revokeApple(token:string,clientId:string,clientSecret:string,fetcher:Fetcher=fetch) {
 const response=await fetcher('https://appleid.apple.com/auth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,token,token_type_hint:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(response.ok)return;
 // Only Apple's explicit invalid_grant says this stored token can never revoke
 // anything. Client/configuration errors and outages stay retryable failures.
 if(response.status===400&&(await response.json().catch(()=>null))?.error==='invalid_grant')throw new Error('apple_credential_unusable');
 throw new Error('provider_unavailable');
}
// Apple requires deletion to proceed when no usable revocation material exists
// (TN3194, Guideline 5.1.1(v)). That outcome is recorded as manual revocation
// required, never as revoked. Outages and misconfiguration still throw.
export type AppleRevocationOutcome='revoked'|'not_linked'|'manual_revocation_required';
export async function settleAppleRevocation(appleLinked:boolean,tokens:string[],revoke:(token:string)=>Promise<void>):Promise<AppleRevocationOutcome> {
 let unusable=false;
 for(const token of tokens) {
  try {await revoke(token);}
  catch(error) {if(error instanceof Error&&error.message==='apple_credential_unusable')unusable=true;else throw error;}
 }
 if(tokens.length)return unusable?'manual_revocation_required':'revoked';
 return appleLinked?'manual_revocation_required':'not_linked';
}
export async function deleteRevenueCatCustomer(accountId:string,key:string,project:string,fetcher:Fetcher=fetch) {
 if(!key||project!=='proj93809efe')throw new Error('revenuecat_not_configured_for_herkeys');
 const url='https://api.revenuecat.com/v2/projects/'+encodeURIComponent(project)+'/customers/'+encodeURIComponent(accountId);
 await request(fetcher,url,{method:'DELETE',headers:{Authorization:'Bearer '+key}},true);
 const verification=await request(fetcher,url,{method:'GET',headers:{Authorization:'Bearer '+key}},true);
 if(verification.status!==404)throw new Error('revenuecat_deletion_pending');
}
