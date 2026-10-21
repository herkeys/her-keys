import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { RELEASE_BRANCHES, checkProvenance, checkReleaseBackendTarget, readProvenance } from '../scripts/verify-release-identity.mjs';
const SHA='a'.repeat(40),OTHER='b'.repeat(40);
const good={branch:RELEASE_BRANCHES[0],head:SHA,upstreamHead:SHA,remoteHead:SHA,trackedChanges:[]};
test('release provenance requires full SHA and actual current remote, beyond the cached upstream',()=>{
  assert.deepEqual(checkProvenance(good),[]);
  for(const remoteHead of ['',OTHER]) assert.match(checkProvenance({...good,remoteHead}).join(' '),/remote:/);
  assert.match(checkProvenance({...good,head:'a',upstreamHead:'a',remoteHead:'a'}).join(' '),/exact full commit/);
});
test('only the exact V2 candidate is added; other integration, candidate, release prefixes and the unfinished repair remain unauthorized',()=>{
  for(const branch of ['integration/anything','candidate/anything','release/anything','repair/v2-shared-backend-convergence-20261017']){
    assert.match(checkProvenance({...good,branch}).join(' '),/not an authorized release branch/);
  }
  assert.deepEqual(RELEASE_BRANCHES,['build/02-gemini-integration','integration/build2-candidate-20261020']);
  assert.deepEqual(checkProvenance({...good,branch:'integration/build2-candidate-20261020'}),[]);
});
function reader({live=OTHER,remote='origin',upstream=SHA}={}){
  const calls=[];
  const run=args=>{
    calls.push(args);
    if(args[0]==='ls-remote') return live?live+'\trefs/heads/'+RELEASE_BRANCHES[0]+'\n':'';
    if(args[0]==='config') return args[2].endsWith('.remote')?remote:'refs/heads/'+RELEASE_BRANCHES[0];
    if(args[1]==='--abbrev-ref') return RELEASE_BRANCHES[0];
    if(args[1]==='@{u}') return upstream;
    if(args[1]==='HEAD') return SHA;
    return '';
  };
  return {calls,run};
}
test('remote lookup asks Git for the exact configured upstream and detects stale cached refs',()=>{
  const r=reader();
  const p=readProvenance(r.run);
  assert.equal(p.upstreamHead,SHA);assert.equal(p.remoteHead,OTHER);
  assert.deepEqual(r.calls.find(a=>a[0]==='ls-remote'),['ls-remote','--exit-code','--refs','origin','refs/heads/'+RELEASE_BRANCHES[0]]);
  assert.match(checkProvenance(p).join(' '),/remote: current remote HEAD differs/);
});
test('missing/offline and local-only upstreams cannot prove a pushed remote SHA',()=>{
  for(const options of [{live:''},{upstream:''},{remote:'.'},{remote:''}]){
    const r=reader(options),p=readProvenance(r.run);
    assert.equal(p.remoteHead,'');
    assert.ok(checkProvenance(p).length);
  }
});
test('store release preflight requires Production, client config, empty data and mandatory consent outside EAS too',()=>{
  const env={EXPO_PUBLIC_HERKEYS_BACKEND:'production',EXPO_PUBLIC_SUPABASE_URL:'https://npykvnxnehlsdlbumzwk.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',EXPO_PUBLIC_HERKEYS_DATA_MODE:'empty',EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE:'true'};
  assert.deepEqual(checkReleaseBackendTarget(env),[]);
  for(const change of [
    {EXPO_PUBLIC_HERKEYS_BACKEND:'staging',EXPO_PUBLIC_SUPABASE_URL:'https://fhhudicklmpofuzkxeqe.supabase.co'},
    {EXPO_PUBLIC_SUPABASE_URL:'https://wrong.invalid'},
    {EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},
    {EXPO_PUBLIC_HERKEYS_DATA_MODE:'demo'},
    {EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE:undefined},
  ])assert.ok(checkReleaseBackendTarget({...env,...change}).length);
  const source=readFileSync('scripts/verify-release-identity.mjs','utf8');
  assert.match(source,/if \(release\) \{\s*failures.push\(\.\.\.checkReleaseBackendTarget\(process.env\)\)/);
});

