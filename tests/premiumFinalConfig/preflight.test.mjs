import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, FEATURES, preflightLocal, projectionComparison } from '../../scripts-dev/premium-final-config/core.mjs';

test('Staging and Production remain distinct projects',()=>{
  assert.notEqual(PROJECTS.staging, PROJECTS.production);
  assert.deepEqual(FEATURES,['daily_load_premium','smart_inbox_extract','momentum_report']);
});
test('Preflight refuses missing configuration without displaying values',()=>{
  const result=preflightLocal({staging:{},production:{}});
  assert.equal(result.passed,false);
  assert.ok(Object.values(result.checks.staging).every(x=>x===false));
});
test('Server projection cannot be inferred from a webhook alone',()=>{
  const source={subscriber:{entitlements:{her_keys_plus:{expires_date:null}}}};
  const comparison=projectionComparison(source,null);
  assert.equal(comparison.matched,false);
  assert.equal(comparison.category,'missing');
});
