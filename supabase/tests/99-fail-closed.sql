-- private.assert_app_schema_secured() must ABORT the migration that created a
-- broken object, and must NOT fire on platform machinery it does not own.
--
-- Every case deliberately breaks something, proves detection, then repairs it
-- and proves the assertion passes again — so a false negative and a false
-- positive are both ruled out.
\pset format unaligned
\pset tuples_only on

-- Baseline: the shipped schema is certified.
SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | baseline: the shipped schema passes the assertion';

-- 1. an application table without RLS.
CREATE TABLE public.zz_norls (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.zz_norls DISABLE ROW LEVEL SECURITY;
CREATE POLICY zz_norls_p ON public.zz_norls FOR SELECT TO authenticated USING (true);
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS an application table with RLS disabled';
DROP TABLE public.zz_norls;

-- 2. RLS enabled but no policy: enabled-and-empty denies everything, which is
--    almost always a mistake rather than an intent.
CREATE TABLE public.zz_nopolicy (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS an application table with no policy at all';
DROP TABLE public.zz_nopolicy;

-- 3. an unintended anon relation privilege.
CREATE TABLE public.zz_anonpriv (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE POLICY zz_anonpriv_p ON public.zz_anonpriv FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.zz_anonpriv TO anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS an unintended anon relation privilege';
REVOKE SELECT ON public.zz_anonpriv FROM anon;
SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | passes again once the anon privilege is removed (no false positive)';
DROP TABLE public.zz_anonpriv;

-- 4. PUBLIC routine EXECUTE.
CREATE FUNCTION public.zz_pubfn() RETURNS int LANGUAGE sql AS 'SELECT 1';
GRANT EXECUTE ON FUNCTION public.zz_pubfn() TO PUBLIC;
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS PUBLIC EXECUTE on an application routine';
REVOKE EXECUTE ON FUNCTION public.zz_pubfn() FROM PUBLIC;

-- 5. anon routine EXECUTE.
GRANT EXECUTE ON FUNCTION public.zz_pubfn() TO anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS anon EXECUTE on an application routine';
REVOKE EXECUTE ON FUNCTION public.zz_pubfn() FROM anon;
DROP FUNCTION public.zz_pubfn();

-- 6. the same invariant inside the private schema.
CREATE FUNCTION private.zz_privfn() RETURNS int LANGUAGE sql AS 'SELECT 1';
GRANT EXECUTE ON FUNCTION private.zz_privfn() TO anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | DETECTS anon EXECUTE on a private-schema routine';
REVOKE EXECUTE ON FUNCTION private.zz_privfn() FROM anon;
DROP FUNCTION private.zz_privfn();

-- ---- NO FALSE POSITIVES ON PLATFORM OBJECTS -----------------------------
-- The assertion inspects public and private only. auth, storage, extensions,
-- graphql and every other platform schema are outside its predicate, so
-- platform objects that would trip it if they were in scope must not.

CREATE TABLE auth.zz_platform_table (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
GRANT SELECT ON auth.zz_platform_table TO anon;              -- would be a violation in public
CREATE FUNCTION auth.zz_platform_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
GRANT EXECUTE ON FUNCTION auth.zz_platform_fn() TO anon;      -- likewise

SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | does NOT fire on an auth-schema table with RLS off and anon SELECT';

DROP FUNCTION auth.zz_platform_fn();
DROP TABLE auth.zz_platform_table;

-- The platform event trigger and its handler are untouched and do not trip it.
SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | does NOT fire on the platform ensure_rls machinery it deliberately leaves alone';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | rls_auto_enable retains exactly its baseline EXECUTE holders (postgres, service_role)'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='rls_auto_enable'
  AND p.proacl::text = '{postgres=X/postgres,service_role=X/postgres}';

-- The test-only helper schema is likewise out of scope and must not trip it.
SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | does NOT fire on the harness helper schema';

-- Final: the schema is certified again after every deliberate break.
SELECT CASE WHEN NOT herkeys_test.test_denied('SELECT private.assert_app_schema_secured()') THEN 'PASS' ELSE 'FAIL' END
       || ' | the schema is certified again after every deliberate break was repaired';
