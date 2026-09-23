-- HK-FEATURE-12 (Life Admin / Documents) — M0 PRIVACY FOUNDATION PREFLIGHT.
--
-- Runtime proof, on EXISTING primitives only, that WAVE3_BASE can carry the shape F12 needs BEFORE any F12 table exists:
--
--   owner-private parent record    a `goals` row (the foundation's owner-private pattern: profile_id + scope 'personal')
--   owner-private canonical Task   a `tasks` row with scope 'personal' (owner_profile_id set, tasks_owner_scope_check)
--   owner-private relationship     a `dependencies` row (the foundation's enforced typed relationship, one FK column per target kind)
--
-- Actors (helpers/10-fixtures.sql): USER A owns HOUSEHOLD A; USER B is a second adult member of HOUSEHOLD A; USER C owns an unrelated
-- household; anon is unauthenticated. Every probe asks: does anyone but A learn the content OR the existence of A's private truth,
-- through a direct read, a write, the change log, sync_pull, sync_push or an error payload?
--
-- Lines that start `NOTE |` characterise pre-existing foundation behaviour; they are evidence for the ledger, not checks.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;

-- Test-only probes (herkeys_test schema, never public). f12_refusal reports SQLSTATE, message, DETAIL and HINT, because a PostgREST
-- error payload carries all four and a leak through DETAIL is still a leak. f12_rowcount reports how many rows a DML statement touched
-- (-1 when it was refused), so "zero rows" and "refused" are both visible as what they are.
CREATE OR REPLACE FUNCTION herkeys_test.f12_refusal(p_sql text)
  RETURNS text
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_state text; v_msg text; v_detail text; v_hint text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  RETURN v_state || ' ' || v_msg || ' | ' || coalesce(v_detail, '') || ' | ' || coalesce(v_hint, '');
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_refusal(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION herkeys_test.f12_rowcount(p_sql text)
  RETURNS integer
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RETURN -1;
END;
$fn$;

-- sync_pull hands out only what committed below the CLUSTER-WIDE snapshot barrier (SD4-012); other sessions' transactions in the same
-- container can hold it back, so a single pull can legitimately return before a just-committed row. This pulls (a new statement, so a
-- new snapshot, each time) until every id in p_want is delivered or p_seconds pass, and returns that delivery. A NEGATIVE check is
-- asserted on a delivery that already contains a positive control the caller may see, so "nothing private" is never vacuous.
CREATE OR REPLACE FUNCTION herkeys_test.f12_pull_until(p_house uuid, p_want text[], p_seconds numeric)
  RETURNS jsonb
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows jsonb;
  v_until timestamptz := clock_timestamp() + make_interval(secs => p_seconds);
BEGIN
  LOOP
    v_rows := public.sync_pull('0'::xid8, p_house) -> 'rows';
    EXIT WHEN (SELECT bool_and(EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) r WHERE r ->> 'entity_id' = w)) FROM unnest(p_want) w)
           OR clock_timestamp() >= v_until;
    PERFORM pg_sleep(0.25);
  END LOOP;
  RETURN v_rows;
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_pull_until(uuid, text[], numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_rowcount(text) TO anon, authenticated;

SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset

-- ----------------------------------------------------------------------------------------------------------------------------------
-- Fixtures, written by the people who own them.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.goals (household_id, local_id, profile_id, title, status, producer, origin_created_at, origin_updated_at)
VALUES (:'hh_a', 'f12m0-parent', :'ua', 'M0 PRIVATE PARENT FIXTURE', 'active', 'user-action', now(), now());
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12m0-task', :'ua', 'M0 PRIVATE TASK FIXTURE', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action');
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12m0-shared-task', NULL, 'M0 HOUSEHOLD TASK FIXTURE', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12m0-task-b', :'ub', 'M0 B OWN TASK', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action');
COMMIT;

RESET ROLE;
SELECT id AS goal_a   FROM public.goals WHERE household_id = :'hh_a' AND local_id = 'f12m0-parent' \gset
SELECT id AS task_a   FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12m0-task' \gset
SELECT id AS task_hh  FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12m0-shared-task' \gset
SELECT id AS task_b   FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12m0-task-b' \gset

-- A relates her private task, and a household-visible task, to her private parent record. Both relationship rows are hers alone.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at)
VALUES (:'hh_a', 'f12m0-link', :'ua', 'part_of', 'task', :'task_a', 'goal', :'goal_a', 'active', 'user-action', now(), now());
INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at)
VALUES (:'hh_a', 'f12m0-link-hh', :'ua', 'part_of', 'task', :'task_hh', 'goal', :'goal_a', 'active', 'user-action', now(), now());
COMMIT;

RESET ROLE;
SELECT id AS link_a  FROM public.dependencies WHERE household_id = :'hh_a' AND local_id = 'f12m0-link' \gset
SELECT id AS link_hh FROM public.dependencies WHERE household_id = :'hh_a' AND local_id = 'f12m0-link-hh' \gset

-- ----------------------------------------------------------------------------------------------------------------------------------
-- OWNER: sees all of her own truth, and her own change pointers.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: ALLOW her private parent record' FROM public.goals WHERE id = :'goal_a';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: ALLOW her personal-scope canonical Task' FROM public.tasks WHERE id = :'task_a';
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: ALLOW both of her private relationship rows' FROM public.dependencies WHERE id IN (:'link_a', :'link_hh');
SELECT CASE WHEN count(DISTINCT entity_id) = 4 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: her change log carries a pointer for the record, the Task and both links'
  FROM public.change_log WHERE entity_id IN (:'goal_a', :'task_a', :'link_a', :'link_hh');
SELECT CASE WHEN count(DISTINCT r ->> 'entity_id') = 4 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: sync_pull from cursor 0 (hydration) delivers the record, the Task and both links'
  FROM jsonb_array_elements(herkeys_test.f12_pull_until(:'hh_a', ARRAY[:'goal_a', :'task_a', :'link_a', :'link_hh'], 30)) r
 WHERE r ->> 'entity_id' IN (:'goal_a', :'task_a', :'link_a', :'link_hh');
SELECT CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: every change pointer for her private rows is stamped with HER profile (the key the log policy filters on)'
  FROM public.change_log WHERE entity_id IN (:'goal_a', :'task_a', :'link_a', :'link_hh') AND owner_profile_id = :'ua';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- SAME-HOUSEHOLD MEMBER (USER B): neither content nor existence.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY the private parent record by id' FROM public.goals WHERE id = :'goal_a';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY every private record in her household that is not hers (no count to infer from)'
  FROM public.goals WHERE profile_id IS DISTINCT FROM :'ub';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY the personal-scope Task by id' FROM public.tasks WHERE id = :'task_a';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY the personal-scope Task by its local id' FROM public.tasks WHERE local_id = 'f12m0-task';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: ALLOW the household-visible Task (its own scope permits it)' FROM public.tasks WHERE id = :'task_hh';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY both relationship rows, including the one that targets a Task she CAN see' FROM public.dependencies WHERE id IN (:'link_a', :'link_hh');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DENY any relationship row that names the household Task (no inference from the Task side)'
  FROM public.dependencies WHERE from_task_id = :'task_hh' OR to_task_id = :'task_hh';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: change_log shows NO pointer for the private record, Task or links'
  FROM public.change_log WHERE entity_id IN (:'goal_a', :'task_a', :'link_a', :'link_hh');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: change_log shows NO pointer of the private kinds that is not her own (no per-table count)'
  FROM public.change_log WHERE entity_table IN ('goals', 'dependencies') AND owner_profile_id IS DISTINCT FROM :'ub';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: sync_pull (hydration from 0) delivers NO pointer for the private record, Task or links, nor any private-kind pointer that is not hers'
  FROM jsonb_array_elements(herkeys_test.f12_pull_until(:'hh_a', ARRAY[:'task_hh'], 30)) r
 WHERE r ->> 'entity_id' IN (:'goal_a', :'task_a', :'link_a', :'link_hh')
    OR (r ->> 'entity_table' = 'goals' AND NOT EXISTS (SELECT 1 FROM public.goals g WHERE g.id = (r ->> 'entity_id')::uuid AND g.profile_id = :'ub'))
    OR (r ->> 'entity_table' = 'dependencies' AND NOT EXISTS (SELECT 1 FROM public.dependencies d WHERE d.id = (r ->> 'entity_id')::uuid AND d.profile_id = :'ub'));
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: sync_pull still delivers the household Task (the filter is scope, not a blanket refusal)'
  FROM jsonb_array_elements(herkeys_test.f12_pull_until(:'hh_a', ARRAY[:'task_hh'], 30)) r
 WHERE r ->> 'entity_id' = :'task_hh';
-- Writes. Zero rows touched is the same answer an absent id gets.
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.goals SET title = %L WHERE id = %L', 'B WAS HERE', :'goal_a')) IN (0, -1) THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 member: UPDATE of the private record touches nothing';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.tasks SET title = %L WHERE id = %L', 'B WAS HERE', :'task_a')) IN (0, -1) THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 member: UPDATE of the personal-scope Task touches nothing';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.dependencies SET status = %L WHERE id = %L', 'removed', :'link_hh')) IN (0, -1) THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 member: UPDATE of a private relationship touches nothing';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('DELETE FROM public.dependencies WHERE id = %L', :'link_a')) IN (0, -1)
             AND herkeys_test.f12_rowcount(format('DELETE FROM public.goals WHERE id = %L', :'goal_a')) IN (0, -1)
             AND herkeys_test.f12_rowcount(format('DELETE FROM public.tasks WHERE id = %L', :'task_a')) IN (0, -1)
            THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: DELETE of the private record, Task or link touches nothing';
SELECT CASE WHEN herkeys_test.f12_refusal(format(
         'INSERT INTO public.goals (household_id, local_id, profile_id, title, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_a', 'f12m0-forged', :'ua', 'FORGED', 'active', 'user-action')) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 member: INSERT of a record in the owner''s name is refused by RLS';
-- Crafted relationship target: B links her OWN Task to A's private parent record, and to an id that names nothing. The two refusals
-- must be the same kind (same SQLSTATE, same constraint), so the answer cannot tell B whether A's record exists.
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(format(
         'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_a', 'f12m0-crafted-1', :'ub', 'part_of', 'task', :'task_b', 'goal', :'goal_a', 'active', 'user-action')), ' | ', 1)
          = replace(split_part(herkeys_test.f12_refusal(format(
         'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_a', 'f12m0-crafted-2', :'ub', 'part_of', 'task', :'task_b', 'goal', 'eeeeeeee-0000-4000-8000-00000000000e', 'active', 'user-action')), ' | ', 1), 'x', 'x')
        AND herkeys_test.f12_refusal(format(
         'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_a', 'f12m0-crafted-1', :'ub', 'part_of', 'task', :'task_b', 'goal', :'goal_a', 'active', 'user-action')) IS NOT NULL
      THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 member: a link to the owner''s private record is refused exactly like a link to an id that names nothing (owner-keyed composite FK)';
SELECT CASE WHEN position('M0 PRIVATE' IN coalesce(herkeys_test.f12_refusal(format(
         'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_goal_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_a', 'f12m0-crafted-1', :'ub', 'part_of', 'task', :'task_b', 'goal', :'goal_a', 'active', 'user-action')), '')) = 0
      THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: the refusal payload (message, DETAIL, HINT) carries no private title';
-- sync_push. An owner-private table keys its uniqueness on (household, OWNER, local_id), so B reusing A's local id is simply a new row
-- of B's: no already_exists, no collision, nothing learned.
SELECT CASE WHEN (public.sync_push('goals', 'dddddddd-0000-4000-8000-0000000000b0'::uuid, jsonb_build_object(
         'household_id', :'hh_a', 'local_id', 'f12m0-parent', 'profile_id', :'ub', 'title', 'B OWN RECORD', 'status', 'active',
         'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())) ->> 'status') = 'created'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: sync_push of an owner-private row reusing the owner''s local id is a fresh row of hers (status created, no collision oracle)';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'dependencies', 'dddddddd-0000-4000-8000-0000000000b0',
         jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12m0-forged-link', 'profile_id', :'ua', 'relation', 'part_of',
           'from_type', 'task', 'from_task_id', :'task_a', 'to_type', 'goal', 'to_goal_id', :'goal_a', 'status', 'active',
           'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())::text)) LIKE '42501%'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: sync_push of a relationship in the owner''s name is refused by RLS';
ROLLBACK;

-- Characterisation of two pre-existing foundation properties (evidence for the ledger; F12's own tables are designed to close both).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT 'NOTE | F12-M0 known-id FK probe: B links her own Task -> A''s PRIVATE Task uuid: '
  || coalesce(split_part(herkeys_test.f12_refusal(format(
       'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_task_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
       :'hh_a', 'f12m0-probe-1', :'ub', 'requires', 'task', :'task_b', 'task', :'task_a', 'active', 'user-action')), ' | ', 1), 'ACCEPTED')
  || ' ; -> an id that names nothing: '
  || coalesce(split_part(herkeys_test.f12_refusal(format(
       'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_task_id, to_type, to_task_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
       :'hh_a', 'f12m0-probe-2', :'ub', 'requires', 'task', :'task_b', 'task', 'eeeeeeee-0000-4000-8000-00000000000e', 'active', 'user-action')), ' | ', 1), 'ACCEPTED');
SELECT 'NOTE | F12-M0 scoped-table local-id probe: B pushes a Task reusing A''s PRIVATE Task local id: '
  || coalesce(split_part(herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'tasks', 'dddddddd-0000-4000-8000-0000000000b0',
       jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12m0-task', 'owner_profile_id', :'ub', 'title', 'B TASK', 'category_id', :'cat_a',
         'duration_minutes', 5, 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal', 'producer', 'user-action')::text)), ' | ', 1), 'ACCEPTED')
  || ' ; with a fresh local id: '
  || coalesce(split_part(herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'tasks', 'dddddddd-0000-4000-8000-0000000000b0',
       jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12m0-task-fresh', 'owner_profile_id', :'ub', 'title', 'B TASK', 'category_id', :'cat_a',
         'duration_minutes', 5, 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal', 'producer', 'user-action')::text)), ' | ', 1), 'ACCEPTED');
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- UNRELATED HOUSEHOLD (USER C), including crafted foreign ids.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.goals WHERE id = :'goal_a') + (SELECT count(*) FROM public.tasks WHERE id IN (:'task_a', :'task_hh'))
                 + (SELECT count(*) FROM public.dependencies WHERE id IN (:'link_a', :'link_hh')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 stranger: DENY the record, both Tasks and both links by crafted id';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 stranger: change_log shows nothing of the other household' FROM public.change_log WHERE household_id = :'hh_a';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a')) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 stranger: sync_pull naming the other household is refused';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'goals', 'dddddddd-0000-4000-8000-0000000000c0',
         jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12m0-parent', 'profile_id', :'uc', 'title', 'C', 'status', 'active',
           'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())::text)) LIKE '42501%'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 stranger: sync_push into the other household is refused before any probe';
SELECT CASE WHEN herkeys_test.f12_refusal(format(
         'INSERT INTO public.dependencies (household_id, local_id, profile_id, relation, from_type, from_goal_id, to_type, to_task_id, status, producer, origin_created_at, origin_updated_at) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, now(), now())',
         :'hh_c', 'f12m0-crafted-c', :'uc', 'requires', 'goal', 'eeeeeeee-0000-4000-8000-00000000000e', 'task', :'task_a', 'active', 'user-action')) IS NOT NULL
      THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 stranger: a link in her own household to the other household''s private Task is refused (household-keyed FK)';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- UNAUTHENTICATED.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT count(*) FROM public.goals')
             AND herkeys_test.test_denied('SELECT count(*) FROM public.tasks')
             AND herkeys_test.test_denied('SELECT count(*) FROM public.dependencies')
             AND herkeys_test.test_denied('SELECT count(*) FROM public.change_log')
            THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 anon: record, Task, relationship and change log are all refused';
SELECT CASE WHEN herkeys_test.test_denied(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a')) THEN 'PASS' ELSE 'FAIL' END
  || ' | F12-M0 anon: sync_pull is refused';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- Lifecycle pointers stay private too: an owner edit, an owner "remove" (status change) and a server-side purge (the tombstone a
-- cascade writes) are each logged under the owner's profile, so B never learns that anything happened.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.goals SET title = 'M0 PRIVATE PARENT FIXTURE (renamed)' WHERE id = :'goal_a';
UPDATE public.dependencies SET status = 'removed' WHERE id = :'link_hh';
COMMIT;
RESET ROLE;
DELETE FROM public.dependencies WHERE id = :'link_a';
-- A control committed AFTER the lifecycle changes, visible to the member: once her pull holds it, the barrier has passed them too.
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12m0-control', NULL, 'M0 CONTROL', :'cat_a', 5, 'flexible', 'unplanned', 'open', 'household', 'user-action');
SELECT id AS task_ctl FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12m0-control' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 owner: the purge of her link reaches her as a tombstone pointer'
  FROM public.change_log WHERE entity_id = :'link_a' AND op = 'tombstone';
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: no pointer for the rename, the removal or the purge tombstone'
  FROM public.change_log WHERE entity_id IN (:'goal_a', :'link_a', :'link_hh');
SELECT CASE WHEN count(*) FILTER (WHERE r ->> 'entity_id' IN (:'goal_a', :'task_a', :'link_a', :'link_hh')) = 0
             AND count(*) FILTER (WHERE r ->> 'entity_id' = :'task_ctl') >= 1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12-M0 member: sync_pull after the lifecycle changes (delivered past a later control) still carries nothing private'
  FROM jsonb_array_elements(herkeys_test.f12_pull_until(:'hh_a', ARRAY[:'task_ctl'], 30)) r;
ROLLBACK;

-- Cleanup of this file's own rows, so the file stays self-contained when the whole ENV C suite runs.
RESET ROLE;
DELETE FROM public.dependencies WHERE household_id = :'hh_a' AND local_id LIKE 'f12m0-%';
DELETE FROM public.goals        WHERE household_id = :'hh_a' AND local_id LIKE 'f12m0-%';
DELETE FROM public.tasks        WHERE household_id = :'hh_a' AND local_id LIKE 'f12m0-%';
