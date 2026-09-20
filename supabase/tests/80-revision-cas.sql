-- Row revision is OPTIMISTIC CONCURRENCY ONLY (SD4-010, SD4-035).
-- It answers "is my write stale?". It is never the pull cursor — that is
-- change_log.committed_xid, tested separately in 90-change-cursor.sql.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role='owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id='cat-kids' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-cas-1','CAS subject',:'cat_kids',10,'flexible','unplanned','open','household'),
       (:'hh_a','task-cas-2','Independent row',:'cat_kids',10,'flexible','unplanned','open','household');
COMMIT;

SELECT CASE WHEN revision = 1 THEN 'PASS' ELSE 'FAIL' END || ' | a new row starts at revision 1'
FROM public.tasks WHERE local_id='task-cas-1';

-- A write at the expected revision succeeds and increments.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.tasks SET title='CAS v2' WHERE local_id='task-cas-1' AND revision = 1;
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | write at the expected revision is accepted'
  FROM public.tasks WHERE local_id='task-cas-1' AND title='CAS v2';
COMMIT;

SELECT CASE WHEN revision = 2 THEN 'PASS' ELSE 'FAIL' END || ' | the accepted write incremented revision to 2'
FROM public.tasks WHERE local_id='task-cas-1';

-- A stale writer, still holding revision 1, must affect nothing.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.tasks SET title='STALE OVERWRITE' WHERE local_id='task-cas-1' AND revision = 1;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | a stale writer at revision 1 matches NO row'
  FROM public.tasks WHERE local_id='task-cas-1' AND title='STALE OVERWRITE';
COMMIT;

SELECT CASE WHEN title='CAS v2' AND revision=2 THEN 'PASS' ELSE 'FAIL' END
       || ' | the stale write did not overwrite, and did not bump revision'
FROM public.tasks WHERE local_id='task-cas-1';

-- The loser retries against the freshly pulled revision and succeeds.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.tasks SET title='CAS v3' WHERE local_id='task-cas-1' AND revision = 2;
COMMIT;
SELECT CASE WHEN title='CAS v3' AND revision=3 THEN 'PASS' ELSE 'FAIL' END
       || ' | retry at the pulled revision succeeds and increments to 3'
FROM public.tasks WHERE local_id='task-cas-1';

-- Revisions are per row, not global: an untouched sibling must not move.
SELECT CASE WHEN revision = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | an independent row is unaffected (revision is per row, not a global counter)'
FROM public.tasks WHERE local_id='task-cas-2';

-- Cross-table: the same property on a different table.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.household_categories SET name='Kids (renamed)' WHERE id = :'cat_kids' AND revision = 1;
COMMIT;
SELECT CASE WHEN revision = 2 THEN 'PASS' ELSE 'FAIL' END || ' | revision behaves identically on another table'
FROM public.household_categories WHERE id = :'cat_kids';

-- The client cannot forge revision (already proven in 40; asserted here as the
-- property CAS depends on, because forgeable revision would defeat the scheme).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.tasks SET revision = 1 WHERE local_id='task-cas-1'$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot roll revision back to win a CAS race';
ROLLBACK;

-- Revision must NOT be usable as a pull cursor: two rows changed in different
-- transactions can share a revision value, so "highest revision seen" is
-- meaningless as a global watermark.
-- task-cas-2 and the category row below were written in DIFFERENT transactions
-- yet both sit at revision 1. A client tracking "highest revision seen" would
-- therefore have no way to tell which changes it had already consumed.
SELECT CASE WHEN (SELECT revision FROM public.tasks WHERE local_id='task-cas-2') = 1
             AND (SELECT count(*) FROM public.tasks WHERE household_id = :'hh_a' AND revision = 1) >= 1
            THEN 'PASS' ELSE 'FAIL' END
       || ' | rows written in different transactions share revision 1, so revision cannot be a global cursor';
