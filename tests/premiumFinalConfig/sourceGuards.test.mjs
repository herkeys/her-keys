import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cli=readFileSync(new URL('../../scripts-dev/premium-final-config.mjs',import.meta.url),'utf8');
const core=readFileSync(new URL('../../scripts-dev/premium-final-config/core.mjs',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/functions/_shared/premium/staging_tester_guard.sql',import.meta.url),'utf8');

test('mutating CLI targets the Staging project only',()=>{
  assert.match(cli,/function requireStaging\(/);
  assert.match(cli,/write commands are pinned to Staging/);
  assert.match(cli,/function client\(\) \{return clientFor\('staging'\);\}/);
  assert.match(cli,/clientFor\(environment\)/);
  assert.doesNotMatch(cli,/clientFor\('production'\)\.from\(/);
});
test('allowlist is server side, uses admin-only app metadata, fails closed before quota',()=>{
  assert.match(sql,/rt\.environment = 'staging'/);
  assert.match(sql,/cfg\.rollout_status = 'staging_only'/);
  assert.match(sql,/auth\.users u/);
  assert.match(sql,/raw_app_meta_data->>'herkeys_premium_tester'/);
  assert.doesNotMatch(sql,/u\.raw_user_meta_data/);
  const allow=sql.indexOf("v_checks := v_checks || jsonb_build_object('staging_allowlist', false)");
  const entitlement=sql.indexOf('-- 6. entitlement, or an APPROVED free allowance');
  assert.ok(allow>0&&entitlement>allow);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.premium_staging_allowlist_guard_ready\(\) FROM PUBLIC, anon, authenticated/);
});
test('release targets only three actual Premium features, not Village or CoParent',()=>{
  assert.match(cli,/FEATURES/);
  assert.match(cli,/rollout_status:'staging_only'/);
  assert.match(cli,/premium_staging_allowlist_guard_ready/);
  assert.doesNotMatch(cli,/village_delegation|coparent_plus/);
});
test('signed-event transport does not claim it verifies a customer purchase',()=>{
  assert.match(cli,/actualPurchaseVerified:false,entitlementGrantVerified:false/);
  assert.match(cli,/projectionUpdated/);
  assert.match(cli,/projectionBefore/);
  assert.match(cli,/projectionAfter/);
  assert.match(core,/not_configured/);
  assert.match(cli,/signed TEST smoke/);
});

test('activation and verification independently require Production to remain fail-closed',()=>{
  assert.match(cli,/async function assertProductionFailClosed\(\)/);
  assert.match(cli,/r\.premium_enabled!==false/);
  assert.match(cli,/r\.webhook_processing!==false/);
  assert.match(cli,/r\.allow_test_fixtures!==false/);
  assert.match(cli,/rows\.some\(f=>f\.enabled\|\|f\.released\)/);
  const activation=cli.substring(cli.indexOf('async function setWindow'),cli.indexOf('async function signedSmoke'));
  assert.ok(activation.split('await assertProductionFailClosed()').length>=3);
});
