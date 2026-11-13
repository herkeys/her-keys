-- HK-V2ACT-GUARD-01: the pending-deletion provider-write guard must run for the role that actually writes provider tables.
--
-- private.refuse_pending_provider_write() guards calendar_oauth_states, external_calendar_connections, apple_revocation_credentials and
-- the Premium tables. Edge Functions write the Calendar and Apple tables DIRECTLY as service_role, which has no USAGE on schema private.
-- The guard ran with invoker rights, so its call to private.account_is_active() failed with "permission denied for schema private" on
-- EVERY write, for active accounts too: Google Calendar could not start or complete consent, store a connection, record a sync or
-- mark a lapsed grant. (Premium tables are written through SECURITY DEFINER RPCs, so they were unaffected.)
--
-- Least privilege: the guard alone runs as its owner, with an empty search_path (already set). No schema, table or function grant is
-- added to service_role or any client role, and the guard's logic is unchanged, so an account pending deletion is still refused.
BEGIN;

ALTER FUNCTION private.refuse_pending_provider_write() SECURITY DEFINER;
REVOKE ALL ON FUNCTION private.refuse_pending_provider_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE fn record;
BEGIN
  SELECT p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner INTO fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private' AND p.proname = 'refuse_pending_provider_write';
  ASSERT fn.prosecdef, 'the provider-write guard must run as its owner';
  ASSERT fn.proconfig = ARRAY['search_path=""'], 'the provider-write guard must keep an empty search_path';
  ASSERT NOT has_schema_privilege('service_role', 'private', 'USAGE'), 'no schema grant may be added to service_role';
  ASSERT NOT has_function_privilege('anon', 'private.refuse_pending_provider_write()', 'EXECUTE'), 'anon must not call the guard';
  ASSERT NOT has_function_privilege('authenticated', 'private.refuse_pending_provider_write()', 'EXECUTE'), 'authenticated must not call the guard';
END $$;

COMMIT;
