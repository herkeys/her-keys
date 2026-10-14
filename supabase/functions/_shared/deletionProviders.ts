type Fetcher=typeof fetch;
async function request(fetcher:Fetcher,url:string,init:RequestInit,allowMissing=false) {
 const response=await fetcher(url,{...init,signal:AbortSignal.timeout(15000)});
 if(!response.ok&&!(allowMissing&&response.status===404))throw new Error('provider_unavailable');
 return response;
}
export async function revokeGoogle(token:string,fetcher:Fetcher=fetch) {
 await request(fetcher,'https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});
}
export async function revokeApple(token:string,clientId:string,clientSecret:string,fetcher:Fetcher=fetch) {
 await request(fetcher,'https://appleid.apple.com/auth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,token,token_type_hint:'refresh_token'})});
}
export async function deleteRevenueCatCustomer(accountId:string,key:string,project:string,fetcher:Fetcher=fetch) {
 if(!key||project!=='proj93809efe')throw new Error('revenuecat_not_configured_for_herkeys');
 const url='https://api.revenuecat.com/v2/projects/'+encodeURIComponent(project)+'/customers/'+encodeURIComponent(accountId);
 await request(fetcher,url,{method:'DELETE',headers:{Authorization:'Bearer '+key}},true);
 const verification=await request(fetcher,url,{method:'GET',headers:{Authorization:'Bearer '+key}},true);
 if(verification.status!==404)throw new Error('revenuecat_deletion_pending');
}
