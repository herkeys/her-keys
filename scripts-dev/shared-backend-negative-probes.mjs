// Read-only denial probes: deliberately unauthenticated/malformed; no valid event or content.
const projects = {staging:'fhhudicklmpofuzkxeqe',production:'npykvnxnehlsdlbumzwk'};
const results=[];
for (const [environment,ref] of Object.entries(projects)) {
  for (const [name,slug,headers] of [
    ['ai-missing-jwt','herkeys-ai',{}],
    ['ai-invalid-jwt','herkeys-ai',{Authorization:'Bearer deliberately-invalid-synthetic-token'}],
    ['webhook-missing-credentials','revenuecat-webhook',{}],
    ['webhook-invalid-credentials','revenuecat-webhook',{Authorization:'deliberately-invalid-synthetic-credential','X-RevenueCat-Webhook-Signature':'t=1,v1='+'0'.repeat(64)}],
    ['ops-missing-credentials','premium-ops',{}],
    ['premium-gate-missing-jwt','premium-gate',{}],
    ['reconcile-missing-jwt','premium-reconcile',{}],
  ]) {
    const started=performance.now();
    try {
      const res=await fetch('https://'+ref+'.supabase.co/functions/v1/'+slug,{
        method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}',signal:AbortSignal.timeout(15000),
      });
      const data=await res.json().catch(()=>({}));
      results.push({environment,name,status:res.status,reason:data.reason??data.error??data.message??null,requestId:data.requestId??null,latencyMs:Math.round(performance.now()-started),classification:[401,403,503].includes(res.status)?'PASS':'UNVERIFIED'});
    }catch{results.push({environment,name,classification:'BLOCKED_TEST',reason:'transport_unavailable'});}
  }
}
process.stdout.write(JSON.stringify({at:new Date().toISOString(),scope:'negative probes only; no authenticated consent or provider-delivery proof',results},null,2)+'\n');

