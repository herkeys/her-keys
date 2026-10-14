import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('Staging and Production both enforce RevenueCat HMAC at the server, not only in the CLI',()=>{
  const runtime=read('supabase/functions/_shared/premium/runtime.ts');
  assert.match(runtime,/requireHmac:\s*deployment === 'production' \|\| deployment === 'staging'/);
  assert.match(runtime,/REVENUECAT_WEBHOOK_HMAC_SECRET/);
});
test('only Staging Auth app_metadata can unlock the tester guard, and Production cannot use it',()=>{
  const sql=read('supabase/functions/_shared/premium/staging_tester_guard.sql');
  assert.match(sql,/rt\.environment = 'staging'/);
  assert.match(sql,/raw_app_meta_data/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/raw_user_meta_data/);
  assert.match(sql,/v_reason := 'feature_disabled'/);
  const operator=read('scripts-dev/premium-final-config.mjs');
  assert.match(operator,/if \(requested!=='staging'\)/);
  assert.match(operator,/Production Premium fail-closed read-back failed/);
});
test('operator never logs credential values and never writes to production',()=>{
  const operator=read('scripts-dev/premium-final-config.mjs');
  const raw=read('scripts-dev/premium-final-config/core.mjs');
  assert.doesNotMatch(operator,/console\.log\(.*REVENUECAT_WEBHOOK_AUTH/);
  assert.doesNotMatch(raw,/console\.log\(/);
  assert.doesNotMatch(operator,/\.from\(['"]premium_entitlements['"]\)\.update\(/);
  assert.match(operator,/clientFor\('production'\)/);
});
