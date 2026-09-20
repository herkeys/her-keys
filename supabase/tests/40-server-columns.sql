-- Server-owned columns are protected by PRIVILEGE, not by trigger overwrite.
-- The owner-approved property is PREVENTION: the write is refused, rather than
-- accepted and then corrected.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset

-- The privilege catalog is the evidence: authenticated must hold no INSERT or
-- UPDATE privilege on any server-owned column.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | authenticated holds NO write privilege on any server-owned column ('
       || coalesce(string_agg(DISTINCT table_name || '.' || column_name, ', '), 'none') || ')'
FROM information_schema.column_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND privilege_type IN ('INSERT', 'UPDATE')
  AND column_name IN ('id', 'revision', 'created_at', 'updated_at',
                      'logical_day', 'timezone_at_decision', 'subject_member_type');

-- And the write itself is refused, as the client role, at the privilege layer.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (id, household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (gen_random_uuid(), %L, 'task-forced-id', 'Forced id', %L, 5, 'flexible','unplanned','open','household')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | client INSERT naming id is REFUSED';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, revision, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L, 'task-forced-rev', 99, 'Forced revision', %L, 5, 'flexible','unplanned','open','household')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | client INSERT naming revision is REFUSED';

SELECT CASE WHEN herkeys_test.test_denied($q$
  UPDATE public.tasks SET revision = 500 WHERE local_id = 'task-nosubject'
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | client UPDATE naming revision is REFUSED';

SELECT CASE WHEN herkeys_test.test_denied($q$
  UPDATE public.tasks SET updated_at = now() - interval '10 years' WHERE local_id = 'task-nosubject'
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | client UPDATE naming updated_at is REFUSED';

SELECT CASE WHEN herkeys_test.test_denied($q$
  UPDATE public.tasks SET subject_member_type = 'adult' WHERE local_id = 'task-nosubject'
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | client UPDATE naming subject_member_type is REFUSED';

-- Omitting the server-owned column is the intended path and must work.
SELECT CASE WHEN NOT herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L, 'task-clean', 'Ordinary write', %L, 5, 'flexible','unplanned','open','household')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | omitting server-owned columns is ALLOWED';
ROLLBACK;

-- The server still maintains them.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'task-rev-check', 'Revision check', :'cat_kids', 5, 'flexible','unplanned','open','household');
SELECT CASE WHEN revision = 1 AND id IS NOT NULL AND created_at IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | server sets id, revision and created_at on INSERT'
FROM public.tasks WHERE local_id = 'task-rev-check';
UPDATE public.tasks SET title = 'Revision check 2' WHERE local_id = 'task-rev-check';
SELECT CASE WHEN revision = 2 THEN 'PASS' ELSE 'FAIL' END || ' | server increments revision on UPDATE'
FROM public.tasks WHERE local_id = 'task-rev-check';
COMMIT;

-- One Move day columns carry no WRITE grant (NHR-05). SELECT is intended: the
-- client must be able to read which day a decision belongs to.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | logical_day / timezone_at_decision carry no INSERT or UPDATE grant'
FROM information_schema.column_privileges
WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'one_move_records'
  AND privilege_type IN ('INSERT', 'UPDATE')
  AND column_name IN ('logical_day', 'timezone_at_decision');

SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | logical_day / timezone_at_decision remain readable'
FROM information_schema.column_privileges
WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'one_move_records'
  AND privilege_type = 'SELECT'
  AND column_name IN ('logical_day', 'timezone_at_decision');
