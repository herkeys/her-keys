-- Zero-data interlock — post-apply invariants.
--
-- The interlock's BEHAVIOR (ENV A succeeds empty, ENV B1/B2 abort atomically)
-- is proven by run.mjs, which is the deterministic artifact for it: a SQL file
-- running inside an already-migrated database cannot re-apply the migration,
-- and re-applying it against a populated ENV C would be a harness defect rather
-- than a test.
--
-- What this file pins is the SHAPE the interlock exists to protect, so a future
-- change that silently altered the migration outcome fails here too.
\pset format unaligned
\pset tuples_only on

-- 34 through F05; HK-FEATURE-13 (People OS) adds person_contexts and person_task_links.
SELECT CASE WHEN count(*) = 36 THEN 'PASS' ELSE 'FAIL' END
       || ' | 36 application tables exist after the migration (' || count(*)::text || ')'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | every application table has RLS enabled ('
       || coalesce(string_agg(c.relname, ', '), 'none') || ' lack it)'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- The destructive change the interlock protects: text primary keys became uuid.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | no application id column is still text ('
       || coalesce(string_agg(table_name || '.' || column_name, ', '), 'none') || ')'
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'id' AND data_type <> 'uuid';

SELECT CASE WHEN data_type = 'uuid' THEN 'PASS' ELSE 'FAIL' END
       || ' | profiles.id remains the Supabase Auth user id (' || data_type || ')'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='id';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | profiles.id still references auth.users'
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'f'
  AND confrelid = 'auth.users'::regclass;

-- The two tables the migration introduces.
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END
       || ' | change_log and account_claims exist'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('change_log','account_claims');

-- Deferred mechanisms must NOT be present (SD4-013/021/028/030/034, B4-P0-057/066).
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | no DEFERRABLE constraint shipped (B4-P0-057 category reorder stays deferred)'
FROM pg_constraint WHERE condeferrable;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | no archival/removal column on household_members (B4-P0-066 stays deferred)'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='household_members'
  AND column_name IN ('status','archived_at','deleted_at','removed_at');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | purge_account ships no body (SD4-030 deferred)'
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname='purge_account';

-- No synthetic application data may arrive from the migration itself. ENV C
-- fixtures are inserted by the harness AFTER the migration, never by it.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | the migration itself created no application rows in change_log for a non-existent household'
FROM public.change_log cl
WHERE NOT EXISTS (SELECT 1 FROM public.households h WHERE h.id = cl.household_id);
