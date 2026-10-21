import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {signDeletionRequest,evaluateMonitorResponse,runWatchdog,ALLOWED_PROJECTS} from '../../scripts-dev/deletion-watchdog.mjs';

const STAGING='https://fhhudicklmpofuzkxeqe.supabase.co';
const json=(status,body)=>new Response(typeof body==='string'?body:JSON.stringify(body),{status});

test('DEL-P2-005: watchdog signs exactly like herkeys_verify_deletion_worker',()=>{
 const {timestamp,signature}=signDeletionRequest('disposable-key',1792540000123);
 assert.equal(timestamp,'1792540000');
 assert.match(signature,/^[0-9a-f]{64}$/);
 assert.equal(signature,createHmac('sha256','disposable-key').update('herkeys-deletion:1792540000').digest('hex'));
 const sql=readFileSync(new URL('../../supabase/migrations/20261014002726_account_deletion_lifecycle.sql',import.meta.url),'utf8');
 assert.match(sql,/convert_to\('herkeys-deletion:'\|\|p_timestamp,'UTF8'\)/,'SQL scheme changed; update the watchdog');
 assert.match(sql,/p_timestamp !~ '\^\[0-9\]\{10\}\$'/);
});
test('DEL-P2-005: only an explicit healthy answer passes; silence, errors and attention all fail',()=>{
 assert.deepEqual(evaluateMonitorResponse(200,{healthy:true}),{ok:true,reason:'healthy'});
 for(const [status,body] of [[200,{healthy:false,alert:'accepted'}],[200,{healthy:false,alert:'already_claimed'}],[200,{}],[200,null],
  [503,{error:'monitor_unavailable'}],[401,{error:'unauthorized'}],[500,null],[404,null]])
  assert.equal(evaluateMonitorResponse(status,body).ok,false,status+' '+JSON.stringify(body));
});
test('DEL-P2-005: watchdog refuses unknown targets and missing keys without any network call',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return json(200,{healthy:true});};
 assert.equal((await runWatchdog({projectUrl:'https://attacker.example',key:'k',fetcher})).reason,'watchdog_target_not_allowed');
 assert.equal((await runWatchdog({projectUrl:STAGING,key:'',fetcher})).reason,'watchdog_unconfigured');
 assert.equal(calls,0);
 assert.deepEqual(ALLOWED_PROJECTS.sort(),[STAGING,'https://npykvnxnehlsdlbumzwk.supabase.co'].sort());
});
test('DEL-P2-005: watchdog calls the monitor once when healthy, retries one transient failure, never retries an authoritative answer',async()=>{
 const seen=[];
 const ok=await runWatchdog({projectUrl:STAGING,key:'k',fetcher:async(url,init)=>{seen.push({url,init});return json(200,{healthy:true});}});
 assert.equal(ok.ok,true);assert.equal(seen.length,1);
 assert.equal(seen[0].url,STAGING+'/functions/v1/monitor-account-deletions');
 assert.equal(seen[0].init.method,'POST');assert.match(seen[0].init.headers['x-deletion-signature'],/^[0-9a-f]{64}$/);
 let n=0;
 assert.equal((await runWatchdog({projectUrl:STAGING,key:'k',fetcher:async()=>{if(n++===0)throw new TypeError('fetch failed');return json(200,{healthy:true});}})).ok,true);
 n=0;
 const down=await runWatchdog({projectUrl:STAGING,key:'k',fetcher:async()=>{n++;return json(503,{error:'monitor_unavailable'});}});
 assert.equal(down.ok,false);assert.equal(n,2);assert.equal(down.reason,'monitor_http_503');
 n=0;
 const attention=await runWatchdog({projectUrl:STAGING,key:'k',fetcher:async()=>{n++;return json(200,{healthy:false,alert:'accepted'});}});
 assert.equal(attention.ok,false);assert.equal(n,1);
 n=0;
 const unauthorized=await runWatchdog({projectUrl:STAGING,key:'k',fetcher:async()=>{n++;return json(401,{error:'unauthorized'});}});
 assert.equal(unauthorized.reason,'watchdog_unauthorized');assert.equal(n,1);
});
test('DEL-P2-005: the workflow stays inert until enabled and reads the key only from secrets',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/account-deletion-watchdog.yml',import.meta.url),'utf8');
 assert.match(wf,/if: vars\.DELETION_WATCHDOG_ENABLED == 'true'/);
 assert.match(wf,/DELETION_WORKER_KEY: \$\{\{ secrets\.DELETION_WORKER_KEY \}\}/);
 assert.match(wf,/permissions:\r?\n  contents: read/,'permissions remain read-only on LF and CRLF checkouts');
 assert.match(wf.replace(/\r?\n/g,'\r\n'),/permissions:\r?\n  contents: read/,'Windows CRLF must not weaken the permission check');
 assert.doesNotMatch(wf,/pull_request/,'a fork PR must never receive the worker key');
});
