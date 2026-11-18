-- Service-only tables deny client access through ACLs and RLS. Make the
-- RLS deny explicit so the existing fail-closed schema assertion still
-- catches accidental omissions on every other application table.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE
  table_name text;
  table_oid regclass;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'account_deletion_alerts',
    'account_deletion_cases',
    'account_deletion_control',
    'account_deletion_outbox',
    'account_deletion_rate_limits',
    'account_deletion_receipts',
    'account_deletion_requests',
    'account_deletion_retention_control',
    'account_deletion_retention_runs',
    'account_deletion_runs',
    'account_deletion_terminal_proofs',
    'apple_revocation_credentials',
    'calendar_oauth_states',
    'herkeys_welcome_email_receipts',
    'premium_authorization_audit',
    'premium_entitlements',
    'premium_events',
    'premium_feature_config',
    'premium_reconcile_state',
    'premium_runtime_config',
    'premium_subscriber_identities',
    'premium_usage',
    'premium_usage_events',
    'premium_usage_global'
  ]
  LOOP
    table_oid := to_regclass(format('public.%I', table_name));

    -- Welcome email is deliberately Production-only.
    IF table_oid IS NULL AND table_name = 'herkeys_welcome_email_receipts' THEN
      CONTINUE;
    END IF;

    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid = table_oid AND relkind = 'r' AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected an RLS-enabled service table: %', table_name;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = table_oid) THEN
      RAISE EXCEPTION 'Unexpected existing policy on service table: %', table_name;
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) AS client(role_name)
      WHERE has_table_privilege(client.role_name, table_oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
        OR has_any_column_privilege(client.role_name, table_oid, 'SELECT, INSERT, UPDATE, REFERENCES')
    ) THEN
      RAISE EXCEPTION 'Unexpected client grant on service table: %', table_name;
    END IF;

    EXECUTE format(
      'CREATE POLICY service_table_client_deny ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name
    );
  END LOOP;
END;
$migration$;

SELECT private.assert_app_schema_secured();

COMMIT;
