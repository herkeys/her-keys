-- NHR-05 / NHR-06: private.is_trusted_server_context() is a SECURITY BOUNDARY.
--
-- The concern NHR-06 raised at SD4 closure was the assumption about
-- current_user / the effective PostgreSQL role. This file attacks that
-- assumption rather than exercising its happy path.
\pset format unaligned
\pset tuples_only on

-- A probe that reports the predicate as whatever role is currently effective.
-- SECURITY INVOKER, so it inherits the caller's role exactly.
-- Returns FALSE both when the predicate says "not trusted" and when the caller
-- cannot even reach it. Both are the same answer to the security question, and
-- collapsing them keeps the attack table readable.
CREATE OR REPLACE FUNCTION herkeys_test.probe_trusted()
  RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
AS $fn$
BEGIN
  RETURN private.is_trusted_server_context();
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.probe_trusted() TO anon, authenticated, service_role;

-- The same probe as SECURITY DEFINER owned by a NON-trusted role, to prove a
-- definer call path cannot manufacture trust it was not given.
-- Roles are cluster-wide, so this must be idempotent across reruns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'herkeys_test_definer') THEN
    CREATE ROLE herkeys_test_definer NOLOGIN;
  END IF;
END $$;
GRANT herkeys_test_definer TO CURRENT_USER;  -- required to reassign ownership
-- Reassigning ownership requires the new owner to hold CREATE on the schema.
GRANT USAGE, CREATE ON SCHEMA herkeys_test TO herkeys_test_definer;
GRANT USAGE ON SCHEMA private TO herkeys_test_definer;
GRANT EXECUTE ON FUNCTION private.is_trusted_server_context() TO herkeys_test_definer;
CREATE OR REPLACE FUNCTION herkeys_test.probe_definer()
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
BEGIN
  RETURN private.is_trusted_server_context();
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$fn$;
ALTER FUNCTION herkeys_test.probe_definer() OWNER TO herkeys_test_definer;
GRANT EXECUTE ON FUNCTION herkeys_test.probe_definer() TO anon, authenticated;

-- ---- the explicitly trusted actor ----------------------------------------
SELECT CASE WHEN current_user = 'postgres' AND private.is_trusted_server_context() THEN 'PASS' ELSE 'FAIL' END
       || ' | trusted: the migration/definer owner role IS trusted (current_user=' || current_user || ')';

-- ---- anon ----------------------------------------------------------------
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.probe_trusted() = false THEN 'PASS' ELSE 'FAIL' END || ' | anon: is_trusted_server_context() is FALSE';
SELECT CASE WHEN herkeys_test.probe_definer() = false THEN 'PASS' ELSE 'FAIL' END
       || ' | anon: a SECURITY DEFINER path owned by an untrusted role does NOT escalate';
ROLLBACK;

-- ---- authenticated -------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.probe_trusted() = false THEN 'PASS' ELSE 'FAIL' END || ' | authenticated: is_trusted_server_context() is FALSE';
SELECT CASE WHEN herkeys_test.probe_definer() = false THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated: SECURITY DEFINER by an untrusted owner does NOT escalate';
ROLLBACK;

-- ---- service_role: trusted for RLS, but NOT this boundary ----------------
-- service_role bypasses RLS, which is a different question from being the
-- trusted server context. Proving they are separate is the point.
BEGIN;
SET LOCAL ROLE service_role;
SELECT CASE WHEN herkeys_test.probe_trusted() = false THEN 'PASS' ELSE 'FAIL' END
       || ' | service_role: is_trusted_server_context() is FALSE (RLS bypass is a different boundary)';
ROLLBACK;

-- ---- ordinary RPC / PostgREST execution ----------------------------------
-- The real client entry points are SECURITY DEFINER owned by postgres, so they
-- DO run trusted. What must not happen is a client reaching the predicate
-- itself, or reaching the historical-backfill branch outside those entry points.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.is_trusted_server_context()') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated cannot call the predicate directly (no EXECUTE)';
ROLLBACK;

-- ---- role inheritance / session identity --------------------------------
-- The concern NHR-06 raised: could trust leak from session identity or role
-- membership rather than the effective role? This proves it reads current_user
-- and nothing else. The session is still postgres throughout; only the
-- effective role changes, and the answer changes with it.
BEGIN;
SELECT CASE WHEN session_user = 'postgres' AND herkeys_test.probe_trusted() THEN 'PASS' ELSE 'FAIL' END
       || ' | baseline: session_user=postgres, current_user=postgres -> TRUSTED';
SET LOCAL ROLE authenticated;
SELECT CASE WHEN session_user = 'postgres' AND current_user = 'authenticated' AND herkeys_test.probe_trusted() = false
            THEN 'PASS' ELSE 'FAIL' END
       || ' | session_user is STILL postgres but current_user=authenticated -> NOT trusted';
RESET ROLE;
SELECT CASE WHEN herkeys_test.probe_trusted() THEN 'PASS' ELSE 'FAIL' END
       || ' | RESET ROLE restores the trusted context, so the boundary tracks current_user exactly';
ROLLBACK;

-- A role that merely holds EXECUTE on the predicate is still not trusted by it.
SELECT CASE WHEN has_function_privilege('herkeys_test_definer', 'private.is_trusted_server_context()', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END
       || ' | an untrusted role may hold EXECUTE on the predicate and still be told FALSE (privilege is not trust)';

-- ---- the GUC that used to gate this is gone ------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SET LOCAL herkeys.claim = 'on';
SET LOCAL herkeys.purge = 'on';
SELECT CASE WHEN herkeys_test.probe_trusted() = false THEN 'PASS' ELSE 'FAIL' END
       || ' | setting herkeys.claim / herkeys.purge buys a client nothing (GUC is no longer a boundary)';
ROLLBACK;

-- ---- no security-relevant herkeys.* GUC remains in any routine ----------
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | no shipped routine reads a herkeys.* GUC ('
       || coalesce(string_agg(n.nspname || '.' || p.proname, ', '), 'none') || ')'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
  AND p.prosrc LIKE '%herkeys.%';

-- Cleanup. DROP OWNED BY clears both owned objects and granted privileges,
-- which a plain REVOKE list misses; roles are cluster-wide, so leaving one
-- behind would break the next run.
DROP FUNCTION herkeys_test.probe_definer();
DROP FUNCTION herkeys_test.probe_trusted();
DROP OWNED BY herkeys_test_definer;
DROP ROLE herkeys_test_definer;
