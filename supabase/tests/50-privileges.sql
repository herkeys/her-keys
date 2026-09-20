-- Privilege posture: Layer 1 secure defaults, Layer 2 explicit per-object
-- grants, and the load-bearing grants that a hardening pass must never strand.
\pset format unaligned
\pset tuples_only on

-- anon holds nothing, anywhere.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | anon holds no privilege on any public table'
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | anon holds no EXECUTE on any public routine'
FROM information_schema.role_routine_grants
WHERE grantee = 'anon' AND routine_schema = 'public';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | PUBLIC holds no EXECUTE on any public routine'
FROM information_schema.role_routine_grants
WHERE grantee = 'PUBLIC' AND routine_schema = 'public';

-- Section 4 of the correction: ALTER DEFAULT PRIVILEGES only affects FUTURE
-- objects, so every function this migration already created is verified
-- directly, in BOTH schemas, rather than assumed from the default.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | no shipped routine in public/private grants PUBLIC or anon EXECUTE ('
       || coalesce(string_agg(n.nspname || '.' || p.proname, ', '), 'none') || ')'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
  AND (p.proacl IS NULL OR EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a
        WHERE a.privilege_type = 'EXECUTE'
          AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon'))));

-- RLS cannot govern TRUNCATE, so the client role must not hold it.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated holds no TRUNCATE / REFERENCES / TRIGGER on any table'
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public'
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

-- DELETE only where a client delete path genuinely exists.
SELECT CASE WHEN coalesce(string_agg(DISTINCT table_name, ','), '') = 'discovery_answers' THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated holds DELETE only on discovery_answers (' || coalesce(string_agg(DISTINCT table_name, ','), 'none') || ')'
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type = 'DELETE';

-- Layer 1: a NEW object must not inherit anon or PUBLIC access. Created here as
-- the migration-owning role, with no privilege statement of its own.
CREATE TABLE public.zz_layer1_probe (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.zz_layer1_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | Layer 1: a forgotten new TABLE grants anon nothing'
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'zz_layer1_probe';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | Layer 1: a forgotten new FUNCTION grants anon nothing'
FROM information_schema.role_routine_grants
WHERE grantee = 'anon' AND routine_schema = 'public' AND routine_name = 'zz_layer1_probe_fn';

-- Layer 1 GLOBAL default: a forgotten new function must NOT arrive with the
-- hardwired PUBLIC EXECUTE. A schema-scoped revoke cannot achieve this; the
-- global FOR ROLE form can, and this is the proof that the shipped statement
-- is load-bearing rather than decorative.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | Layer 1 GLOBAL: a forgotten new FUNCTION grants PUBLIC nothing'
FROM information_schema.role_routine_grants
WHERE grantee = 'PUBLIC' AND routine_schema = 'public' AND routine_name = 'zz_layer1_probe_fn';

SELECT CASE WHEN NOT has_function_privilege('public', 'public.zz_layer1_probe_fn()', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | Layer 1 GLOBAL: PUBLIC cannot EXECUTE the forgotten function';

SELECT CASE WHEN defaclacl::text = '{postgres=X/postgres}' THEN 'PASS' ELSE 'FAIL' END
       || ' | Layer 1 GLOBAL: pg_default_acl carries the global routine entry (' || defaclacl::text || ')'
FROM pg_default_acl WHERE defaclobjtype = 'f' AND defaclnamespace = 0;

-- Layer 3 remains independent defense in depth: even with Layer 1 working, a
-- routine that somehow carries PUBLIC EXECUTE must still abort the migration.
GRANT EXECUTE ON FUNCTION public.zz_layer1_probe_fn() TO PUBLIC;
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()')
            THEN 'PASS' ELSE 'FAIL' END || ' | Layer 3: assertion still REJECTS a routine carrying PUBLIC EXECUTE';
REVOKE EXECUTE ON FUNCTION public.zz_layer1_probe_fn() FROM PUBLIC;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | Layer 1: a forgotten new FUNCTION grants authenticated nothing'
FROM information_schema.role_routine_grants
WHERE grantee = 'authenticated' AND routine_schema = 'public' AND routine_name = 'zz_layer1_probe_fn';

-- Layer 2 fail-closed: the probe table has no policy, so the assertion must
-- refuse to certify this schema.
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()')
            THEN 'PASS' ELSE 'FAIL' END || ' | fail-closed assertion REJECTS a table with no policy';

DROP FUNCTION public.zz_layer1_probe_fn();
DROP TABLE public.zz_layer1_probe;

SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()')
            THEN 'PASS' ELSE 'FAIL' END || ' | fail-closed assertion passes again once the offending table is gone';

-- Load-bearing grants: removing any of these breaks every scoped read.
SELECT CASE WHEN has_schema_privilege('authenticated', 'private', 'USAGE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated retains USAGE on schema private';

SELECT CASE WHEN has_function_privilege('authenticated', 'private.is_household_member(uuid)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated retains EXECUTE on is_household_member';
SELECT CASE WHEN has_function_privilege('authenticated', 'private.can_access_scoped_row(uuid,text,uuid)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated retains EXECUTE on can_access_scoped_row';
SELECT CASE WHEN has_function_privilege('authenticated', 'private.resolve_household_context(uuid)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated retains EXECUTE on resolve_household_context';
SELECT CASE WHEN to_regprocedure('private.current_household_id()') IS NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | the LIMIT-1 current_household_id() no longer exists: a household is named, never guessed';

-- Client entry points are callable; the trusted-only ones are not.
SELECT CASE WHEN has_function_privilege('authenticated', 'public.bootstrap_account(uuid,text,uuid)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated may call bootstrap_account';
SELECT CASE WHEN has_function_privilege('authenticated', 'public.sync_pull(xid8,uuid)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated may call sync_pull';
SELECT CASE WHEN NOT has_function_privilege('authenticated', 'private.assert_app_schema_secured()', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated may NOT call the schema assertion';
SELECT CASE WHEN NOT has_function_privilege('authenticated', 'private.is_trusted_server_context()', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated may NOT call is_trusted_server_context';

-- Platform machinery is untouched: rls_auto_enable keeps exactly the posture
-- the Phase 1 capture recorded, and Her Keys did not seize ownership of it.
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | platform rls_auto_enable() still present and unmodified'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | platform ensure_rls event trigger still present'
FROM pg_event_trigger WHERE evtname = 'ensure_rls';
