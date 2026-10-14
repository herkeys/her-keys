import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.3';
import { adminClient, requireUser, AuthError } from './supabaseAdmin.ts';
import { encryptSecret } from './crypto.ts';
import { json, options } from './http.ts';
export async function appleClientSecret():Promise<string> {
 const clientId=Deno.env.get('APPLE_DELETION_CLIENT_ID'),team=Deno.env.get('APPLE_DELETION_TEAM_ID'),kid=Deno.env.get('APPLE_DELETION_KEY_ID'),pem=Deno.env.get('APPLE_DELETION_PRIVATE_KEY');
 if(!clientId||!team||!kid||!pem) throw new Error('apple_revocation_unconfigured');
 const key=await importPKCS8(pem.replace(/\\n/g,'\n'),'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid}).setIssuer(team).setAudience('https://appleid.apple.com')
  .setSubject(clientId).setIssuedAt().setExpirationTime('5m').sign(key);
}
export async function captureAppleCredential(req:Request) {
 if(req.method==='OPTIONS') return options();
 if(req.method!=='POST') return json({error:'method_not_allowed'},405);
 try {
  const user=await requireUser(req);
  const apple=user.identities?.find(i=>i.provider==='apple');
  if(!apple) return json({error:'apple_identity_required'},403);
  const body=await req.json();
  if(typeof body.code!=='string'||body.code.length>2048) return json({error:'invalid_code'},400);
  const response=await fetch('https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:Deno.env.get('APPLE_DELETION_CLIENT_ID')!,client_secret:await appleClientSecret(),
    grant_type:'authorization_code',code:body.code}),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return json({error:'apple_exchange_unavailable'},503);
  const tokens=await response.json();
  const verified=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
   {issuer:'https://appleid.apple.com',audience:Deno.env.get('APPLE_DELETION_CLIENT_ID')!});
  if(verified.payload.sub!==apple.identity_data?.sub || typeof tokens.refresh_token!=='string')
   return json({error:'identity_mismatch'},403);
  const encrypted=await encryptSecret(tokens.refresh_token);
  const {error}=await adminClient().from('apple_revocation_credentials').upsert({
   account_id:user.id,token_ciphertext:encrypted.ciphertext,token_iv:encrypted.iv,updated_at:new Date().toISOString()
  });
  if(error) return json({error:'credential_storage_unavailable'},503);
  return json({status:'stored'});
 } catch(error) {return json({error:error instanceof AuthError?'unauthorized':'temporarily_unavailable'},error instanceof AuthError?401:503);}
}
