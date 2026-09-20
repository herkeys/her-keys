-- STORED PROVENANCE (B4-FE01-001, -005) — the cloud says where every row came from, and refuses to guess.
--
-- The post-apply environment gives `producer` a TEST-ONLY default (helpers/05-test-defaults.sql) so the
-- older suites can insert plain fixtures. This suite drops it FIRST, inside its own transaction, and
-- proves the shipped behaviour: a writer that does not say where a row came from is refused.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset

BEGIN;
ALTER TABLE public.household_categories ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.events               ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.tasks                ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.household_systems    ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.meal_plan_entries    ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.needs_me_items       ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.one_move_records     ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.discovery_records    ALTER COLUMN producer DROP DEFAULT;
ALTER TABLE public.onboarding_state     ALTER COLUMN producer DROP DEFAULT;

-- ---- 1. NO ROW WITHOUT A PRODUCER: all nine tables refuse an insert that does not say -----------------------------
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.household_categories (household_id, local_id, name, status, sort_order, scope) VALUES (%L,'p-cat','x','active',91,'household')$q$, :'hh_a')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | household_categories: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.events (household_id, local_id, title, category_id, starts_at, ends_at, commitment, status, scope) VALUES (%L,'p-evt','x',%L,now(),now()+interval '1 hour','fixed','active','household')$q$, :'hh_a', :'cat_kids')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | events: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope) VALUES (%L,'p-task','x',%L,5,'flexible','unplanned','open','household')$q$, :'hh_a', :'cat_kids')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | tasks: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.household_systems (household_id, local_id, name, description, category_id, scope) VALUES (%L,'p-sys','x','',%L,'household')$q$, :'hh_a', :'cat_kids')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | household_systems: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.meal_plan_entries (household_id, local_id, meal_date, title, category_id, scope) VALUES (%L,'p-meal',CURRENT_DATE,'x',%L,'household')$q$, :'hh_a', :'cat_kids')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | meal_plan_entries: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.needs_me_items (household_id, local_id, profile_id, title, status, origin_created_at) VALUES (%L,'p-nm',%L,'x','open',now())$q$, :'hh_a', :'ua')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | needs_me_items: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, status, decided_at) VALUES (%L,'p-om',%L,'task','withheld',now())$q$, :'hh_a', :'ua')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | one_move_records: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.discovery_records (household_id, local_id, profile_id, topic_id) VALUES (%L,'p-disc',%L,'topic')$q$, :'hh_a', :'ua')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | discovery_records: no producer -> NOT NULL violation';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.onboarding_state (household_id, profile_id) VALUES (%L,%L)$q$, :'hh_a', :'ub')) LIKE '23502%' THEN 'PASS' ELSE 'FAIL' END || ' | onboarding_state: no producer -> NOT NULL violation';

-- ---- 2. THE VOCABULARY IS CLOSED, AND A REHEARSAL NEVER REACHES THE CLOUD ----------------------------------------------
CREATE FUNCTION pg_temp.task_with(p_hh uuid, p_cat uuid, p_local text, p_producer text, p_conf text DEFAULT NULL, p_artifact uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  RETURN herkeys_test.error_of(format($q$INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer, confidence, source_artifact_id)
    VALUES (%L,%L,'x',%L,5,'flexible','unplanned','open','household',%L,%L,%L)$q$, p_hh, p_local, p_cat, p_producer, p_conf, p_artifact));
END $f$;
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-demo', 'demo-seed') LIKE '23514%producer_values_check%' THEN 'PASS' ELSE 'FAIL' END || ' | demo-seed is not an accepted producer: the cloud cannot hold a rehearsal row';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-made-up', 'a-guess') LIKE '23514%producer_values_check%' THEN 'PASS' ELSE 'FAIL' END || ' | an unknown producer is refused';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-ok-user', 'user-action') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | user-action with no confidence is accepted';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-ok-legacy', 'legacy-unknown') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | legacy-unknown (provenance the migration could not prove) is accepted, explicitly';

-- ---- 3. CONFIDENCE EXISTS EXACTLY FOR CLAIMS THAT MAY BE WRONG ---------------------------------------------------------
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-inf-nolevel', 'ai-inference') LIKE '23514%confidence_check%' THEN 'PASS' ELSE 'FAIL' END || ' | an inference must state how sure it is';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-inf', 'ai-inference', 'possible') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | an inference at "possible" is accepted';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-ext', 'import-sync', 'likely') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | an external observation carries a level too';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-user-level', 'user-action', 'likely') LIKE '23514%confidence_check%' THEN 'PASS' ELSE 'FAIL' END || ' | something she stated has no "confidence": it is not a claim';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-legacy-level', 'legacy-unknown', 'possible') LIKE '23514%confidence_check%' THEN 'PASS' ELSE 'FAIL' END || ' | legacy-unknown is refused a level rather than handed a made-up one';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-bad-level', 'ai-inference', 'certain') LIKE '23514%confidence_check%' THEN 'PASS' ELSE 'FAIL' END || ' | the level vocabulary is closed: possible, likely, established';

-- ---- 4. LINEAGE: an artifact must exist, in THIS household, and belong to THIS owner -------------------------------------
INSERT INTO public.source_artifacts (household_id, local_id, profile_id, kind, origin, received_at, origin_created_at)
VALUES (:'hh_a', 'art-a', :'ua', 'email', 'user-submitted', now(), now());
INSERT INTO public.source_artifacts (household_id, local_id, profile_id, kind, origin, received_at, origin_created_at)
VALUES (:'hh_c', 'art-c', :'uc', 'email', 'user-submitted', now(), now());
SELECT id AS art_a FROM public.source_artifacts WHERE local_id = 'art-a' \gset
SELECT id AS art_c FROM public.source_artifacts WHERE local_id = 'art-c' \gset

SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-lineage', 'ai-inference', 'possible', :'art_a') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | a row derived from an artifact names it';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-lineage-x', 'ai-inference', 'possible', :'art_c') LIKE '23503%' THEN 'PASS' ELSE 'FAIL' END || ' | an artifact from ANOTHER household cannot be named';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-lineage-ghost', 'ai-inference', 'possible', gen_random_uuid()) LIKE '23503%' THEN 'PASS' ELSE 'FAIL' END || ' | an artifact that does not exist cannot be named';
SELECT CASE WHEN pg_temp.task_with(:'hh_a', :'cat_kids', 'p-lineage-legacy', 'legacy-unknown', NULL, :'art_a') LIKE '23514%source_artifact_check%' THEN 'PASS' ELSE 'FAIL' END || ' | legacy-unknown cannot name a source: there is nothing it is provably derived from';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.needs_me_items (household_id, local_id, profile_id, title, status, origin_created_at, producer, confidence, source_artifact_id)
                    VALUES (%L,'p-nm-x',%L,'x','open',now(),'ai-inference','possible',%L)$q$, :'hh_a', :'ua', :'art_c')) LIKE '23503%' THEN 'PASS' ELSE 'FAIL' END
       || ' | the same lineage rule holds on an owner-private table (needs_me_items)';

-- ---- 5. WHAT A CLIENT MAY DO AFTER THE FACT: raise its confidence, and nothing about where it came from ------------
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer, confidence)
VALUES (:'hh_a', 'p-mine', 'Provenance target', :'cat_kids', 5, 'flexible', 'unplanned', 'open', 'household', 'ai-inference', 'possible');

SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.tasks SET producer = 'user-action', confidence = NULL WHERE local_id = 'p-mine'$q$) THEN 'PASS' ELSE 'FAIL' END
       || ' | a client cannot rewrite WHO produced a row (no UPDATE privilege on producer): an inference cannot become a stated fact';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.tasks SET source_artifact_id = NULL WHERE local_id = 'p-mine'$q$) THEN 'PASS' ELSE 'FAIL' END
       || ' | nor detach it from its source artifact';
SELECT CASE WHEN NOT herkeys_test.test_denied($q$UPDATE public.tasks SET confidence = 'likely' WHERE local_id = 'p-mine'$q$) THEN 'PASS' ELSE 'FAIL' END
       || ' | it CAN move its confidence (the promotion boundary decides when)';
SELECT CASE WHEN confidence = 'likely' AND producer = 'ai-inference' THEN 'PASS' ELSE 'FAIL' END
       || ' | and the producer is exactly as it was' FROM public.tasks WHERE local_id = 'p-mine';
ROLLBACK;

-- ---- 6. THE STARTERS THE SERVER LAID DOWN SAY SO ------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN count(*) = 8 THEN 'PASS' ELSE 'FAIL' END
       || ' | bootstrap states its own provenance: all eight starter categories are system-derived (' || count(*)::text || ')'
FROM public.household_categories WHERE household_id = :'hh_a' AND producer = 'system-derived';
SELECT CASE WHEN producer = 'onboarding' THEN 'PASS' ELSE 'FAIL' END || ' | and the onboarding row is stated as onboarding'
FROM public.onboarding_state WHERE household_id = :'hh_a' AND profile_id = :'ua';

-- ---- 7. events.source is retired: where an event came from is its producer ---------------------------------------------
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | events.source no longer exists'
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'source';
