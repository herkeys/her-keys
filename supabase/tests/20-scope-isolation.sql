-- Scope isolation across all five visibility scopes.
-- personal / professional / coparent-shared are OWNER-ONLY for all of Build 4.
-- household / child are visible to authorized household members.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'

RESET ROLE;
SELECT hm.household_id AS hh_a
FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT id AS cat_work  FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-work' \gset
SELECT id AS cat_kids  FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset
SELECT id AS child_a   FROM public.household_members     WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset

-- USER A creates one row in each owner-only scope, plus a child-scoped row.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope) VALUES
  (:'hh_a', 'task-prof-1',  :'ua', 'Quarterly review',  :'cat_work', 30, 'flexible', 'unplanned', 'open', 'professional'),
  (:'hh_a', 'task-cop-1',   :'ua', 'Swap weekend',      :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'coparent-shared');
INSERT INTO public.tasks (household_id, local_id, subject_member_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'task-child-1', :'child_a', 'Field trip form', :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'child');
COMMIT;

-- Owner sees everything they own plus everything household/child scoped.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own professional-scope row'    FROM public.tasks WHERE local_id = 'task-prof-1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own coparent-shared row'       FROM public.tasks WHERE local_id = 'task-cop-1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW child-scope row'               FROM public.tasks WHERE local_id = 'task-child-1';
ROLLBACK;

-- The second household member is denied every owner-only scope, including
-- coparent-shared: that scope is a private category, never a grant of access
-- to another account (B4-P0-038 / SD4-033).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | member: DENY another owner professional row'  FROM public.tasks WHERE local_id = 'task-prof-1';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | member: DENY another owner coparent-shared row' FROM public.tasks WHERE local_id = 'task-cop-1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | member: ALLOW child-scope row (household visibility)' FROM public.tasks WHERE local_id = 'task-child-1';
ROLLBACK;

-- The household OWNER is likewise denied a second member's private row. The
-- owner of the household is not the owner of every row in it.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'task-b-personal', :'ub', 'Therapy', :'cat_kids', 60, 'fixed', 'unplanned', 'open', 'personal');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY a second member private row (owner is not superuser of the household)'
  FROM public.tasks WHERE local_id = 'task-b-personal';
ROLLBACK;

-- A private-scope row with no owner is unstorable, for every role including the
-- table owner: the CHECK binds regardless of RLS.
RESET ROLE;
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L, 'task-noowner', NULL, 'Orphan', %L, 10, 'flexible', 'unplanned', 'open', 'personal')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | private-scope row with NULL owner is rejected for every role';

-- A shared-scope row must NOT carry a misleading owner.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L, 'task-badowner', %L, 'Mislabelled', %L, 10, 'flexible', 'unplanned', 'open', 'household')
$q$, :'hh_a', :'ua', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | household-scope row with an owner is rejected';
