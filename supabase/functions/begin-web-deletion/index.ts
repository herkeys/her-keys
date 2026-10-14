import {adminClient} from '../_shared/supabaseAdmin.ts';
import {command} from '../_shared/deletionService.ts';
import {sha256Base64Url} from '../_shared/crypto.ts';
import {json,options} from '../_shared/http.ts';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return options();
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 const generic={status:'If this address can be verified, check your email for a sign-in code.'};
 try{
  const raw=await req.text();if(raw.length>4096)return json(generic);
  const body=JSON.parse(raw),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json(generic);
  const limit=await command('rate_limit',{key_hash:await sha256Base64Url('verify:'+email)});
  if(limit.allowed)await adminClient().auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  return json(generic);
 }catch{return json(generic);}
});
