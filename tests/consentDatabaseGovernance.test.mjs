import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync('supabase/migrations/20261009060000_v2_account_consents.sql', 'utf8');
const executable = migration.replace(/--.*$/gm, '');

test('consent data is account-owned, append-only and versioned', () => {
  assert.match(executable, /CREATE TABLE public\.account_consents\s*\(/);
  assert.match(executable, /account_id uuid NOT NULL REFERENCES auth\.users\(id\)/);
  assert.match(executable, /consent_type text NOT NULL/);
  assert.match(executable, /'terms', 'privacy', 'age18', 'ai_processing'/);
  assert.match(executable, /policy_version text NOT NULL/);
  assert.match(executable, /recorded_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/);
  assert.match(executable, /CREATE INDEX account_consents_latest_idx/);
  assert.doesNotMatch(executable, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER TYPE)\b/i);
  assert.doesNotMatch(executable, /GRANT\s+(?:UPDATE|DELETE|ALL)\b[^;]*\bTO\s+(?:anon|authenticated)/i);
});

test('consent server timestamps and UUIDs cannot be supplied by the app', () => {
  assert.match(executable, /REVOKE ALL ON TABLE public\.account_consents FROM PUBLIC, anon, authenticated/);
  assert.match(executable, /GRANT SELECT ON TABLE public\.account_consents TO authenticated/);
  assert.match(executable, /GRANT INSERT \(account_id, consent_type, policy_version, granted\)\s+ON TABLE public\.account_consents TO authenticated/);
  assert.doesNotMatch(executable, /GRANT INSERT\s+ON TABLE public\.account_consents TO authenticated/);
  assert.doesNotMatch(executable, /GRANT INSERT\s*\([^)]*\b(?:id|recorded_at)\b/);
});

test('consent RLS never permits cross-account reads or writes', () => {
  assert.match(executable, /ENABLE ROW LEVEL SECURITY/);
  assert.match(executable, /FORCE ROW LEVEL SECURITY/);
  assert.match(executable, /CREATE POLICY account_consents_select_own[\s\S]*?FOR SELECT TO authenticated\s+USING \(account_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.match(executable, /CREATE POLICY account_consents_insert_own[\s\S]*?FOR INSERT TO authenticated\s+WITH CHECK \(account_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.doesNotMatch(executable, /\bTO anon\b/i);
});
