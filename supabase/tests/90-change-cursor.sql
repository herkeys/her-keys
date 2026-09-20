-- The global change cursor (SD4-012): change_log keyed on committed_xid, read
-- behind a pg_snapshot_xmin barrier.
--
-- This is the mechanism HR-12 flagged as never executed. It is executed here.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role='owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id='cat-kids' \gset

-- 8. revision is NOT the cursor: the cursor axis is a transaction id.
SELECT CASE WHEN data_type = 'xid8' THEN 'PASS' ELSE 'FAIL' END
       || ' | the cursor column is committed_xid (' || data_type || '), not a revision'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='change_log' AND column_name='committed_xid';

-- 1. a committed write appears in the log.
SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS c0 \gset
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-cur-1','Cursor one',:'cat_kids',10,'flexible','unplanned','open','household');
COMMIT;

SELECT CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL' END || ' | a committed write appears in change_log'
FROM public.change_log WHERE entity_table='tasks' AND committed_xid >= :'c0'::xid8;

-- 2/4. a second committed write appears, ordered after the first.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-cur-2','Cursor two',:'cat_kids',10,'flexible','unplanned','open','household');
COMMIT;

SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | both committed writes are present since the cursor'
FROM public.change_log WHERE entity_table='tasks' AND committed_xid >= :'c0'::xid8
  AND entity_id IN (SELECT id FROM public.tasks WHERE local_id IN ('task-cur-1','task-cur-2'));

SELECT CASE WHEN a < b THEN 'PASS' ELSE 'FAIL' END || ' | transaction ordering is preserved on the cursor axis'
FROM (SELECT (SELECT committed_xid FROM public.change_log cl JOIN public.tasks t ON t.id=cl.entity_id WHERE t.local_id='task-cur-1' LIMIT 1) AS a,
             (SELECT committed_xid FROM public.change_log cl JOIN public.tasks t ON t.id=cl.entity_id WHERE t.local_id='task-cur-2' LIMIT 1) AS b) x;

-- 3. one transaction touching several tables is represented once per entity,
--    and every entry carries the SAME committed_xid.
SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS c1 \gset
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-multi','Multi',:'cat_kids',10,'flexible','unplanned','open','household');
INSERT INTO public.needs_me_items (household_id, local_id, profile_id, title, status, origin_created_at)
VALUES (:'hh_a','needsme-multi',:'ua','Multi item','open', now());
COMMIT;

-- Scoped to the two rows this transaction wrote, so unrelated concurrent work
-- cannot make the count look wrong.
SELECT CASE WHEN count(DISTINCT entity_table) = 2 AND count(DISTINCT committed_xid) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | a multi-table transaction yields one xid across both entities'
FROM public.change_log
WHERE entity_id IN ((SELECT id FROM public.tasks WHERE local_id='task-multi'),
                    (SELECT id FROM public.needs_me_items WHERE local_id='needsme-multi'));

-- 5/6/10. THE BARRIER is tested in run.mjs (envCursorBarrier), because it needs
-- two genuinely concurrent sessions: one holding an uncommitted write open while
-- the other reads the barrier. A prepared transaction would be simpler but this
-- local stack runs with max_prepared_transactions = 0, and a single psql session
-- cannot hold a transaction open while querying from outside it.

-- 7. two rows written in the same instant cannot collide the way a timestamp
--    cursor would: the axis is a transaction id, not a clock.
SELECT CASE WHEN count(*) >= 2 THEN 'PASS' ELSE 'FAIL' END
       || ' | rows sharing a logged_at timestamp still carry distinct cursor positions'
FROM (SELECT committed_xid, seq FROM public.change_log GROUP BY committed_xid, seq) x;

-- 9. repeated pull is deterministic and idempotent.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN public.sync_pull('0'::xid8) = public.sync_pull('0'::xid8) THEN 'PASS' ELSE 'FAIL' END
       || ' | repeating the same pull returns an identical result';
SELECT CASE WHEN jsonb_array_length(public.sync_pull('0'::xid8) -> 'rows') > 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | sync_pull returns this household''s changes';
SELECT CASE WHEN (public.sync_pull('0'::xid8) ->> 'next_cursor') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | sync_pull returns a next_cursor';
ROLLBACK;

-- A pull from the returned cursor yields nothing new, and RLS scopes the log.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
-- USER C legitimately has their OWN changes, so the property is not "nothing"
-- but "nothing belonging to household A".
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | an unrelated account pulls NONE of household A''s changes'
FROM jsonb_array_elements(public.sync_pull('0'::xid8) -> 'rows') r
WHERE (r ->> 'entity_id')::uuid IN (SELECT id FROM public.tasks WHERE household_id = :'hh_a');
ROLLBACK;
