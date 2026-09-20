-- RLS actor matrix. Proves BOTH directions: unauthorized access fails AND
-- legitimate approved access succeeds. Over-restriction is not a pass.
--
-- Actors: anon, owner (USER A), same-household member (USER B),
-- unrelated user (USER C), service_role.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

-- A household-scoped event owned by household A, created by the owner.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.events (household_id, local_id, title, category_id, starts_at, ends_at, commitment, status, scope)
SELECT hm.household_id, 'evt-hh-1', 'School run', c.id,
       now() + interval '1 day', now() + interval '1 day 30 minutes', 'fixed', 'active', 'household'
FROM public.household_members hm
JOIN public.household_categories c ON c.household_id = hm.household_id AND c.local_id = 'cat-kids'
WHERE hm.profile_id = :'ua' AND hm.role = 'owner';
COMMIT;

-- A personal-scope task owned by USER A.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
SELECT hm.household_id, 'task-personal-1', :'ua', 'Call the bank', c.id, 15, 'flexible', 'unplanned', 'open', 'personal'
FROM public.household_members hm
JOIN public.household_categories c ON c.household_id = hm.household_id AND c.local_id = 'cat-money'
WHERE hm.profile_id = :'ua' AND hm.role = 'owner';
COMMIT;

-- ---- anon holds nothing at all ----------------------------------------
-- Note the layer: anon is refused by the PRIVILEGE system, before RLS is even
-- consulted. It holds no table privilege, so this is a stronger denial than an
-- empty result set would be.
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.events')     THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY events (privilege layer)';
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.tasks')      THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY tasks (privilege layer)';
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.profiles')   THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY profiles (privilege layer)';
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.households') THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY households (privilege layer)';
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.action_records') THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY action_records (privilege layer)';
SELECT CASE WHEN herkeys_test.test_denied('SELECT private.is_household_member(gen_random_uuid())') THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY the RLS helper function';
ROLLBACK;

-- ---- household owner ---------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own household row'      FROM public.households;
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW household-scope event'  FROM public.events WHERE local_id = 'evt-hh-1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own personal-scope task' FROM public.tasks WHERE local_id = 'task-personal-1';
SELECT CASE WHEN count(*) = 8 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW all 8 starter categories' FROM public.household_categories;
SELECT CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own household members'   FROM public.household_members;
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW own profile only'        FROM public.profiles;
ROLLBACK;

-- ---- same-household second member --------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | member: ALLOW household-scope event'  FROM public.events WHERE local_id = 'evt-hh-1';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | member: DENY another member personal task' FROM public.tasks WHERE local_id = 'task-personal-1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | member: ALLOW the shared household row' FROM public.households;
SELECT CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL' END || ' | member: ALLOW household+child categories, DENY owner-private ones' FROM public.household_categories;
ROLLBACK;

-- ---- unrelated authenticated user --------------------------------------
-- Household A's uuid is resolved with the role RESET, i.e. outside anyone's
-- RLS. Resolving it from inside USER C's session would silently return USER C's
-- OWN household, because every bootstrap creates a member with local_id
-- 'user-1' — the earlier version of this test did exactly that and passed for
-- the wrong reason.
RESET ROLE;
SELECT hm.household_id AS hh_a
FROM public.household_members hm
WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: DENY other household events' FROM public.events WHERE local_id = 'evt-hh-1';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: DENY other household tasks'  FROM public.tasks;
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: ALLOW only their own household' FROM public.households;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: DENY household A members by household uuid'
  FROM public.household_members WHERE household_id = :'hh_a';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: DENY household A categories by household uuid'
  FROM public.household_categories WHERE household_id = :'hh_a';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated: DENY even with the exact household uuid'
  FROM public.households WHERE id = :'hh_a';
ROLLBACK;

-- ---- membership is privileged infrastructure ---------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied($q$
  INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
  SELECT hm.household_id, 'user-hack', NULL, 'adult', 'member', NULL, 'personal'
  FROM public.household_members hm WHERE hm.local_id = 'user-1' LIMIT 1
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY client INSERT into household_members';
SELECT CASE WHEN herkeys_test.test_denied($q$
  UPDATE public.household_members SET role = 'owner' WHERE local_id = 'user-2'
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | member: DENY client UPDATE of household_members';
ROLLBACK;

-- ---- service_role is an explicit actor ---------------------------------
BEGIN;
SET LOCAL ROLE service_role;
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | service_role: sees BOTH households (RLS bypass proven, not inferred)' FROM public.households;
SELECT CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL' END || ' | service_role: sees events across households' FROM public.events;
ROLLBACK;
