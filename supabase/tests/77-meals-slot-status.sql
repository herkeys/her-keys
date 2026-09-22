-- HK-FEATURE-08-MEALS — meal_plan_entries.meal_slot and .status, attacked as real roles under real RLS.
--
-- The additive migration adds a closed slot vocabulary and an active/archived lifecycle to the EXISTING meal_plan_entries table.
-- This suite proves, against real PostgreSQL with real roles and JWT claims (never a mock), that:
--   - the columns, defaults, CHECKs and column grants are exactly what the contract says;
--   - removal is an ordinary UPDATE that the change log records as an upsert, and there is no way to DELETE;
--   - an unrelated account and anon get nothing, the owner and a same-household member get exactly what the scopes allow;
--   - the same-household second account is a CONSTRUCTED actor (helpers/10-fixtures.sql): no product path creates a second adult.
--
-- Everything runs inside ONE transaction that is rolled back, so it leaves no rows and no change_log entries for the suites after it.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_meals FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-meals' \gset
SELECT id AS cat_meals_c FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-meals' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset

BEGIN;

-- ---- 1. THE SHAPE: the columns, their defaults, the CHECKs and the grants are exactly the contract ---------------------
SELECT CASE WHEN (SELECT data_type || '/' || is_nullable || '/' || column_default FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'meal_plan_entries' AND column_name = 'meal_slot') = $$text/NO/'unspecified'::text$$
            THEN 'PASS' ELSE 'FAIL' END || ' | meal_slot is text NOT NULL defaulting to the explicit not-stated value, never dinner';
SELECT CASE WHEN (SELECT data_type || '/' || is_nullable || '/' || column_default FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'meal_plan_entries' AND column_name = 'status') = $$text/NO/'active'::text$$
            THEN 'PASS' ELSE 'FAIL' END || ' | status is text NOT NULL defaulting to active (an existing row is a live plan)';
SELECT CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.meal_plan_entries'::regclass AND contype = 'c'
                    AND conname IN ('meal_plan_entries_meal_slot_check', 'meal_plan_entries_status_check')) = 2
            THEN 'PASS' ELSE 'FAIL' END || ' | both CHECK constraints exist under their contract names';
SELECT CASE WHEN herkeys_test.error_of('SELECT private.assert_app_schema_secured()') IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | the fail-closed schema assertion still passes with the two columns present';
SELECT CASE WHEN has_column_privilege('authenticated', 'public.meal_plan_entries', 'meal_slot', 'INSERT')
             AND has_column_privilege('authenticated', 'public.meal_plan_entries', 'meal_slot', 'UPDATE')
             AND has_column_privilege('authenticated', 'public.meal_plan_entries', 'status', 'INSERT')
             AND has_column_privilege('authenticated', 'public.meal_plan_entries', 'status', 'UPDATE')
            THEN 'PASS' ELSE 'FAIL' END || ' | authenticated may INSERT and UPDATE exactly these two columns (column-level grants)';
SELECT CASE WHEN NOT has_column_privilege('authenticated', 'public.meal_plan_entries', 'revision', 'UPDATE')
             AND NOT has_column_privilege('authenticated', 'public.meal_plan_entries', 'id', 'UPDATE')
             AND NOT has_column_privilege('authenticated', 'public.meal_plan_entries', 'household_id', 'UPDATE')
             AND NOT has_column_privilege('authenticated', 'public.meal_plan_entries', 'created_at', 'UPDATE')
            THEN 'PASS' ELSE 'FAIL' END || ' | the server-owned columns (revision, id, household_id, created_at) are still not writable by a client';
SELECT CASE WHEN NOT has_column_privilege('anon', 'public.meal_plan_entries', 'meal_slot', 'SELECT')
             AND NOT has_column_privilege('anon', 'public.meal_plan_entries', 'status', 'INSERT')
            THEN 'PASS' ELSE 'FAIL' END || ' | anon holds no privilege on the new columns';
SELECT CASE WHEN (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema = 'public' AND table_name = 'meal_plan_entries' AND privilege_type = 'DELETE' AND grantee IN ('authenticated', 'anon')) = 0
             AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'meal_plan_entries' AND cmd = 'DELETE') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | there is still NO delete grant and NO delete policy: removal can only be an archive';

-- ---- 2. THE VOCABULARY IS CLOSED, and it is refused by name --------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';

SELECT CASE WHEN count(*) FILTER (WHERE herkeys_test.ins('meal_plan_entries', jsonb_build_object(
              'household_id', :'hh_a', 'local_id', 'f08-slot-' || s.slot, 'meal_date', '2026-09-22', 'title', 'Slot ' || s.slot,
              'category_id', :'cat_meals', 'scope', 'household', 'meal_slot', s.slot)) IS NULL) = 6
            THEN 'PASS' ELSE 'FAIL' END || ' | all six slots are accepted: unspecified, breakfast, lunch, dinner, snack, other'
FROM unnest(ARRAY['unspecified', 'breakfast', 'lunch', 'dinner', 'snack', 'other']) AS s(slot);

SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-bad-slot', 'meal_date', '2026-09-22',
              'title', 'x', 'category_id', :'cat_meals', 'scope', 'household', 'meal_slot', 'dessert')) LIKE '23514%meal_plan_entries_meal_slot_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | an unknown slot is refused by the slot CHECK, by name';
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-bad-slot2', 'meal_date', '2026-09-22',
              'title', 'x', 'category_id', :'cat_meals', 'scope', 'household', 'meal_slot', 'DINNER')) LIKE '23514%meal_plan_entries_meal_slot_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | the vocabulary is case-exact: DINNER is not dinner';
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-null-slot', 'meal_date', '2026-09-22',
              'title', 'x', 'category_id', :'cat_meals', 'scope', 'household', 'meal_slot', NULL)) LIKE '23502%'
            THEN 'PASS' ELSE 'FAIL' END || ' | an explicit NULL slot is refused (not-stated is the value unspecified, never NULL)';
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-bad-status', 'meal_date', '2026-09-22',
              'title', 'x', 'category_id', :'cat_meals', 'scope', 'household', 'status', 'deleted')) LIKE '23514%meal_plan_entries_status_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | an unknown status (deleted) is refused by the status CHECK, by name';
SELECT CASE WHEN count(*) FILTER (WHERE herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-bad-status-' || s.v,
              'meal_date', '2026-09-22', 'title', 'x', 'category_id', :'cat_meals', 'scope', 'household', 'status', s.v)) LIKE '23514%meal_plan_entries_status_check%') = 3
            THEN 'PASS' ELSE 'FAIL' END || ' | eaten, skipped and completed are not statuses: removal can never be recorded as an execution'
FROM unnest(ARRAY['eaten', 'skipped', 'completed']) AS s(v);

-- an insert that says nothing about slot or status is a live plan with no stated slot
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-defaults', 'meal_date', '2026-09-22',
              'title', 'Tacos', 'category_id', :'cat_meals', 'scope', 'household')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | a client that omits slot and status can still insert (an older client keeps working)';
SELECT CASE WHEN (SELECT meal_slot || '/' || status FROM public.meal_plan_entries WHERE local_id = 'f08-defaults') = 'unspecified/active'
            THEN 'PASS' ELSE 'FAIL' END || ' | and it reads back as unspecified and active';

-- ---- 3. THE OWNER: removal is an UPDATE, the server keeps the counter, nothing can be deleted ---------------------------
SELECT revision AS rev0 FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner' \gset
UPDATE public.meal_plan_entries SET status = 'archived', meal_slot = 'lunch' WHERE local_id = 'f08-slot-dinner';
SELECT CASE WHEN (SELECT status || '/' || meal_slot || '/' || (revision - :rev0)::text FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner') = 'archived/lunch/1'
            THEN 'PASS' ELSE 'FAIL' END || ' | the owner archives and re-slots in ONE update, and the server bumps the revision by exactly one';
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | an archived row is still there: removal deleted nothing';
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.meal_plan_entries SET revision = 99 WHERE local_id = 'f08-slot-dinner'$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot write the revision counter';
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.meal_plan_entries SET household_id = gen_random_uuid() WHERE local_id = 'f08-slot-dinner'$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot move a plan to another household';
SELECT CASE WHEN herkeys_test.error_of($q$DELETE FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner'$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a hard DELETE is denied to the owner (no meal-specific delete test existed before this one)';
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id LIKE 'f08-%') = 7
            THEN 'PASS' ELSE 'FAIL' END || ' | all seven plans the owner created (six slots and one defaulted) are still there after the attacks';

-- ---- 4. THE CHANGE LOG: an archive is an upsert pointer that another device pulls, not a tombstone --------------------
RESET ROLE;
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE entity_table = 'meal_plan_entries' AND op = 'upsert'
                    AND entity_id = (SELECT id FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner')) >= 2
             AND (SELECT count(*) FROM public.change_log WHERE entity_table = 'meal_plan_entries' AND op = 'tombstone'
                    AND entity_id = (SELECT id FROM public.meal_plan_entries WHERE local_id = 'f08-slot-dinner')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | the archive reached the change log as an upsert (create, then archive), never as a tombstone';

-- ---- 5. AN UNRELATED ACCOUNT AND ANON get nothing, and the owner is not merely over-restricted -----------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id LIKE 'f08-%') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | an unrelated account sees none of household A''s plans';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.meal_plan_entries (household_id, local_id, meal_date, title, category_id, scope, producer)
              VALUES (%L, 'f08-intruder', '2026-09-22', 'x', %L, 'household', 'user-action')$q$, :'hh_a', :'cat_meals')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | an unrelated account cannot INSERT a plan into household A (row-level security)';
WITH u AS (UPDATE public.meal_plan_entries SET status = 'archived' WHERE local_id = 'f08-defaults' RETURNING 1) SELECT count(*) AS c_archived FROM u \gset
SELECT CASE WHEN :c_archived = 0 THEN 'PASS' ELSE 'FAIL' END || ' | an unrelated account cannot archive household A''s plan: the row is invisible to it';
WITH u AS (UPDATE public.meal_plan_entries SET meal_slot = 'snack' WHERE local_id = 'f08-defaults' RETURNING 1) SELECT count(*) AS c_reslot FROM u \gset
SELECT CASE WHEN :c_reslot = 0 THEN 'PASS' ELSE 'FAIL' END || ' | nor re-slot it';
SELECT CASE WHEN herkeys_test.error_of($q$DELETE FROM public.meal_plan_entries WHERE local_id = 'f08-defaults'$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | nor delete it';
-- and it can still use its OWN household: the denial is not a blanket refusal
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_c', 'local_id', 'f08-c-own', 'meal_date', '2026-09-22',
              'title', 'C own plan', 'category_id', :'cat_meals_c', 'scope', 'household', 'meal_slot', 'dinner')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | the unrelated account can still write plans in its OWN household (the denial is not a blanket refusal)';

RESET ROLE;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.error_of('SELECT count(*) FROM public.meal_plan_entries') LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | anon cannot read plans';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.meal_plan_entries (household_id, local_id, meal_date, title, category_id, scope, producer)
              VALUES (%L, 'f08-anon', '2026-09-22', 'x', %L, 'household', 'user-action')$q$, :'hh_a', :'cat_meals')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | anon cannot insert plans';
RESET ROLE;

-- ---- 6. THE SAME-HOUSEHOLD SECOND ACCOUNT (constructed actor): household visibility, owner-only privacy -----------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT count(*) FILTER (WHERE herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-priv-' || s.scope,
              'meal_date', '2026-09-24', 'title', 'Private ' || s.scope, 'category_id', :'cat_meals', 'scope', s.scope, 'owner_profile_id', :'ua')) IS NULL) AS priv_ok
FROM unnest(ARRAY['personal', 'professional', 'coparent-shared']) AS s(scope) \gset
SELECT CASE WHEN :priv_ok = 3 THEN 'PASS' ELSE 'FAIL' END || ' | the owner can plan in each owner-only scope (personal, professional, coparent-shared)';
SELECT CASE WHEN herkeys_test.ins('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'f08-child', 'meal_date', '2026-09-24',
              'title', 'Child plan', 'category_id', :'cat_meals', 'scope', 'child', 'subject_member_id', :'child_a')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | and a child-scoped plan that names its child';
SELECT revision AS rev_hh FROM public.meal_plan_entries WHERE local_id = 'f08-defaults' \gset

SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id IN ('f08-defaults', 'f08-child')) = 2
            THEN 'PASS' ELSE 'FAIL' END || ' | a same-household member sees the household-scope and child-scope plans';
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id LIKE 'f08-priv-%') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | and none of the owner-only plans (personal, professional, coparent-shared)';
WITH u AS (UPDATE public.meal_plan_entries SET status = 'archived' WHERE local_id = 'f08-priv-personal' RETURNING 1) SELECT count(*) AS b_priv FROM u \gset
SELECT CASE WHEN :b_priv = 0 THEN 'PASS' ELSE 'FAIL' END || ' | the member cannot archive an owner-only plan: it is invisible to them';
UPDATE public.meal_plan_entries SET status = 'archived' WHERE local_id = 'f08-defaults';
SELECT CASE WHEN (SELECT status || '/' || (revision - :rev_hh)::text FROM public.meal_plan_entries WHERE local_id = 'f08-defaults') = 'archived/1'
            THEN 'PASS' ELSE 'FAIL' END || ' | the member CAN archive a household-scope plan (the household shares its plan), and the revision moves by one';

-- the owner keeps the ability to see what the member did, and cannot cross the owner boundary by changing scope
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (SELECT status FROM public.meal_plan_entries WHERE local_id = 'f08-defaults') = 'archived'
            THEN 'PASS' ELSE 'FAIL' END || ' | the owner sees the archive the member made';
SELECT herkeys_test.error_of($q$UPDATE public.meal_plan_entries SET scope = 'personal' WHERE local_id = 'f08-child'$q$) AS flip_err \gset
SELECT CASE WHEN (:'flip_err' LIKE '23514%' OR :'flip_err' LIKE '42501%')
             AND (SELECT scope FROM public.meal_plan_entries WHERE local_id = 'f08-child') = 'child'
            THEN 'PASS' ELSE 'FAIL' END || ' | a scope flip that would need an owner the row does not have is refused and the row keeps its scope (' || left(:'flip_err', 60) || ')';
RESET ROLE;

-- ---- 7. sync_push carries the new columns, and the vocabulary is enforced through it too -------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.error_of(format($q$SELECT public.sync_push('meal_plan_entries', %L::uuid, jsonb_build_object('household_id', %L, 'local_id', 'f08-push', 'meal_date', '2026-09-25',
  'title', 'Pushed breakfast', 'category_id', %L, 'scope', 'household', 'meal_slot', 'breakfast', 'status', 'active', 'producer', 'user-action',
  'origin_created_at', now(), 'origin_updated_at', now()))$q$, gen_random_uuid(), :'hh_a', :'cat_meals')) IS NULL AS push_ok \gset
SELECT CASE WHEN :'push_ok' = 't' AND (SELECT meal_slot || '/' || status FROM public.meal_plan_entries WHERE local_id = 'f08-push') = 'breakfast/active'
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_push creates a plan carrying its slot and status';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('meal_plan_entries', %L::uuid, jsonb_build_object('household_id', %L, 'local_id', 'f08-push-bad', 'meal_date', '2026-09-25',
  'title', 'Pushed dessert', 'category_id', %L, 'scope', 'household', 'meal_slot', 'dessert', 'producer', 'user-action',
  'origin_created_at', now(), 'origin_updated_at', now()))$q$, gen_random_uuid(), :'hh_a', :'cat_meals')) LIKE '23514%meal_plan_entries_meal_slot_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | and an unknown slot pushed through it is refused by the same CHECK, by name';
RESET ROLE;

ROLLBACK;

-- nothing this suite did survives it
SELECT CASE WHEN (SELECT count(*) FROM public.meal_plan_entries WHERE local_id LIKE 'f08-%') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | the suite left no rows behind (it ran inside one rolled-back transaction)';
