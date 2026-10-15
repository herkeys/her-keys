import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => readFileSync(new URL('../../'+name, import.meta.url),'utf8');
const migration = load('supabase/migrations/20261015140000_premium_stale_projection_guard.sql');
const foundation = load('supabase/migrations/20261015120000_premium_entitlement_foundation.sql');
const staging = load('supabase/functions/_shared/premium/staging_tester_guard.sql');
const sqlTests = load('supabase/tests/82-premium-authorization.sql');

test('new migration preserves original state derivation and explicitly fails closed when provider reconciliation is pending',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.premium_entitlement_state\(/);
  assert.match(migration,/v_found AND e\.needs_reconcile THEN[\s\S]*?RETURN 'unknown'/);
  assert.match(migration,/premium_account_lifecycle\(p_account\) = 'deletion_pending'/);
  assert.match(migration,/public\.premium_derive_state\(/);
  assert.doesNotMatch(migration,/UPDATE public\.premium_entitlements|GRANT .*authenticated|ALTER TABLE/);
});
test('both foundation and Staging server authorization delegate entitlement calculation to the patched function',()=>{
  assert.match(foundation,/v_state := public\.premium_entitlement_state\(p_account, v_now\)/);
  assert.match(staging,/v_state := public\.premium_entitlement_state\(p_account, v_now\)/);
  assert.match(sqlTests,/needs_reconcile denies a previously active projection/);
  assert.match(sqlTests,/pending provider reconciliation cannot authorize Daily Load computation/);
  assert.match(sqlTests,/pending provider reconciliation cannot authorize Smart Inbox AI spending/);
});
