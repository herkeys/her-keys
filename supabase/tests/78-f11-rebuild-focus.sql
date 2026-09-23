-- HK-FEATURE-11 (Me / Rebuild) — THE RLS ATTACK MATRIX for rebuild_focuses and rebuild_focus_links.
--
-- Actors (helpers/10-fixtures.sql): USER A owns HOUSEHOLD A; USER B is a second adult member of HOUSEHOLD A; USER C owns an
-- unrelated HOUSEHOLD C; anon is unauthenticated. Every scenario runs inside ONE transaction that is ROLLED BACK, so nothing here
-- is left behind for the suites that follow.
--
-- Not merely "can B read the table": the claims under attack are that a private Focus cannot be read, written, linked to, or even
-- INFERRED — through link rows, crafted foreign keys, error text, or the change log — by anyone but its owner.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-wellbeing' \gset
SELECT id AS cat_home_a FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-home' \gset

-- ================= THE CATALOG =====================================================================================
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | f11: both tables exist with RLS enabled'
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('rebuild_focuses', 'rebuild_focus_links') AND c.relrowsecurity;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11: anon holds no privilege on either table'
FROM (VALUES ('rebuild_focuses'), ('rebuild_focus_links')) t(n) WHERE has_table_privilege('anon', 'public.' || t.n, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11: no DELETE privilege for authenticated on either table (removal is a status)'
FROM (VALUES ('rebuild_focuses'), ('rebuild_focus_links')) t(n) WHERE has_table_privilege('authenticated', 'public.' || t.n, 'DELETE');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11: the client can UPDATE no identity, owner, focus or target column'
FROM information_schema.column_privileges cp
WHERE cp.table_schema = 'public' AND cp.table_name IN ('rebuild_focuses', 'rebuild_focus_links') AND cp.grantee = 'authenticated' AND cp.privilege_type = 'UPDATE'
  AND cp.column_name IN ('id', 'household_id', 'profile_id', 'local_id', 'origin_device_id', 'producer', 'source_artifact_id', 'scope', 'focus_id',
                         'target_type', 'target_task_id', 'target_goal_id', 'target_system_id', 'target_event_id', 'relation', 'revision', 'created_at', 'updated_at');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11: no polymorphic target_id / target_kind column exists (typed foreign keys only)'
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rebuild_focus_links' AND column_name IN ('target_id', 'target_kind', 'entity_id', 'ref_id');

-- ================= ONE HOUSEHOLD, THREE PEOPLE =====================================================================
BEGIN;

-- ---- A, the owner: a private Focus, a private next step, a household task, her own Goal.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-focus-a', 'title', 'Make space for myself again', 'note', 'Saturday mornings used to be mine.', 'state', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW a title-and-note Focus of her own';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-focus-a2', 'title', 'Make space for myself again', 'state', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW a title-only Focus, and a duplicate title (identity is the id)';
SELECT id AS focus_a FROM public.rebuild_focuses WHERE local_id = 'f11-focus-a' \gset
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'f11-task-private', :'ua', 'Book the pottery class', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal'),
       (:'hh_a', 'f11-task-hh', NULL, 'Sort the hall drawer', :'cat_home_a', 15, 'flexible', 'unplanned', 'open', 'household');
SELECT id AS task_private FROM public.tasks WHERE local_id = 'f11-task-private' \gset
SELECT id AS task_hh FROM public.tasks WHERE local_id = 'f11-task-hh' \gset
SELECT CASE WHEN herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-goal-a', 'title', 'Finish the quilt', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: (setup) her own Goal';
SELECT id AS goal_a FROM public.goals WHERE local_id = 'f11-goal-a' \gset

SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-link-next', 'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'task_private', 'relation', 'next_action', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW a next-action link to her private Task';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-link-hh', 'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW linking a household-visible Task to her private Focus';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-link-goal', 'focus_id', :'focus_a', 'target_type', 'goal', 'target_goal_id', :'goal_a', 'relation', 'supports', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW linking her own Goal';

-- The typed-reference invariant is enforced by the database, not by convention.
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-bad-1', 'focus_id', :'focus_a', 'target_type', 'goal', 'target_goal_id', :'goal_a', 'relation', 'next_action', 'status', 'active')) LIKE '23514%next_action_task_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a next action that is not a Task';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-bad-2', 'focus_id', :'focus_a', 'target_type', 'task', 'target_goal_id', :'goal_a', 'relation', 'supports', 'status', 'active')) LIKE '23514%target_ref_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a target type that does not match the one column set';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-bad-3', 'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'task_hh', 'target_goal_id', :'goal_a', 'relation', 'supports', 'status', 'active')) LIKE '23514%target_ref_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY two targets at once (EXACTLY ONE typed foreign key is set)';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-bad-4', 'focus_id', :'focus_a', 'target_type', 'task', 'relation', 'supports', 'status', 'active')) LIKE '23514%target_ref_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a link with no target at all';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-dup', 'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'task_private', 'relation', 'next_action', 'status', 'active')) LIKE '23505%live_link_uq%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY the same live link twice (one relationship, never two)';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-blank', 'title', '   ', 'state', 'active')) LIKE '23514%title_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a blank title';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-long', 'title', 'x', 'note', repeat('n', 501), 'state', 'active')) LIKE '23514%note_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a note over 500 characters (it is not a journal)';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-failed', 'title', 'x', 'state', 'failed')) LIKE '23514%state_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a "failed" state (paused and archived are not judgments; failed does not exist)';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-scope', 'title', 'x', 'state', 'active', 'scope', 'household')) LIKE '23514%scope_check%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11: DENY a household-visible Focus (owner-private is not a default, it is the only scope)';
SELECT CASE WHEN NOT herkeys_test.test_denied($q$UPDATE public.rebuild_focuses SET title = 'Renamed', state = 'paused' WHERE local_id = 'f11-focus-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW rename and pause';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.rebuild_focuses SET profile_id = '22222222-2222-4222-8222-222222222222' WHERE local_id = 'f11-focus-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: DENY handing her Focus to another member';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.rebuild_focus_links SET target_task_id = target_task_id WHERE local_id = 'f11-link-next'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: DENY re-pointing a link (the target is fixed at insert)';
SELECT CASE WHEN herkeys_test.test_denied($q$DELETE FROM public.rebuild_focuses WHERE local_id = 'f11-focus-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: DENY deleting a Focus (archive is a status)';
SELECT CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner: ALLOW reading her own links (3)' FROM public.rebuild_focus_links WHERE local_id LIKE 'f11-%';
SELECT CASE WHEN count(*) = 2 AND bool_and(owner_profile_id = '11111111-1111-4111-8111-111111111111') THEN 'PASS' ELSE 'FAIL' END || ' | f11: every Focus change-log entry carries its owner'
FROM public.change_log WHERE entity_table = 'rebuild_focuses' AND entity_id IN (SELECT id FROM public.rebuild_focuses WHERE local_id IN ('f11-focus-a', 'f11-focus-a2'))
  AND op = 'upsert' AND row_revision = 1;

-- ---- B, a second adult of the SAME household.
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY reading A''s Focuses' FROM public.rebuild_focuses;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY reading A''s links (no link row, no count)' FROM public.rebuild_focus_links;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: no change-log entry for either table is visible to her'
FROM public.change_log WHERE entity_table IN ('rebuild_focuses', 'rebuild_focus_links');
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: still sees the household Task A linked — and nothing on it names a Focus'
FROM public.tasks t WHERE t.local_id = 'f11-task-hh' AND NOT (to_jsonb(t)::text ILIKE '%focus%');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY reading A''s private next-step Task' FROM public.tasks WHERE local_id = 'f11-task-private';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-forged', 'title', 'Forged', 'state', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY writing a Focus as A';
WITH u AS (UPDATE public.rebuild_focuses SET title = 'Changed by B' RETURNING 1) SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY editing A''s Focus (0 rows)' FROM u;
WITH u AS (UPDATE public.rebuild_focus_links SET status = 'removed' RETURNING 1) SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY unlinking A''s link (0 rows)' FROM u;
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-focus-b', 'title', 'B''s own area', 'state', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: ALLOW her own private Focus';
SELECT id AS focus_b FROM public.rebuild_focuses WHERE local_id = 'f11-focus-b' \gset

-- Inference through a crafted foreign key: attaching a link to A's Focus answers EXACTLY as attaching it to no Focus at all.
SELECT herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-craft-1', 'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) AS err_real_focus \gset
SELECT herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-craft-2', 'focus_id', gen_random_uuid(), 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) AS err_no_focus \gset
SELECT CASE WHEN :'err_real_focus' LIKE '23503%' AND :'err_no_focus' LIKE '23503%'
                 AND regexp_replace(:'err_real_focus', '\([^)]*\)=\([^)]*\)', '(...)=(...)', 'g') = regexp_replace(:'err_no_focus', '\([^)]*\)=\([^)]*\)', '(...)=(...)', 'g')
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: a link naming A''s private Focus fails exactly like a link naming a Focus that does not exist (no inference)';
-- Inference through a target: linking her own Focus to A's PRIVATE Task answers EXACTLY as linking it to a Task that does not exist.
SELECT herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-craft-3', 'focus_id', :'focus_b', 'target_type', 'task', 'target_task_id', :'task_private', 'relation', 'next_action', 'status', 'active')) AS err_private_task \gset
SELECT herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-craft-4', 'focus_id', :'focus_b', 'target_type', 'task', 'target_task_id', gen_random_uuid(), 'relation', 'next_action', 'status', 'active')) AS err_no_task \gset
SELECT CASE WHEN :'err_private_task' LIKE '23503%' AND :'err_private_task' = :'err_no_task'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: linking to A''s PRIVATE Task is refused with the very same answer as a Task that does not exist';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-craft-5', 'focus_id', :'focus_b', 'target_type', 'goal', 'target_goal_id', :'goal_a', 'relation', 'supports', 'status', 'active')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: DENY linking A''s private Goal (same-owner key)';
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f11-link-b', 'focus_id', :'focus_b', 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 same-household B: ALLOW linking her own Focus to the household Task they both see';

-- ---- Back to A: B's Focus and B's link are just as invisible to her.
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner A: DENY reading B''s Focus (the household owner is not the owner of every row)' FROM public.rebuild_focuses WHERE local_id = 'f11-focus-b';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 owner A: B''s link to the shared Task is invisible to A' FROM public.rebuild_focus_links WHERE local_id = 'f11-link-b';

-- ---- C, an unrelated household, with valid foreign ids in hand.
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: DENY reading any Focus' FROM public.rebuild_focuses;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: DENY reading any link' FROM public.rebuild_focus_links;
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'f11-intruder', 'title', 'x', 'state', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: DENY writing a Focus into household A';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'f11-focus-c', 'title', 'C''s area', 'state', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: ALLOW her own Focus in her own household';
SELECT id AS focus_c FROM public.rebuild_focuses WHERE local_id = 'f11-focus-c' \gset
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'f11-cross', 'focus_id', :'focus_c', 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: DENY a crafted cross-household link to household A''s Task';
-- Refused before the row is even checked against the policy: the Task she names is "not there" for her, which is exactly the answer a
-- Task that does not exist gets. Either refusal (23503 not-available, 42501 policy) is a denial; neither says anything about household A.
SELECT CASE WHEN herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'f11-cross-2', 'focus_id', :'focus_c', 'target_type', 'task', 'target_task_id', :'task_hh', 'relation', 'supports', 'status', 'active')) ~ '^(23503|42501)'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: DENY writing a link into household A';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11 unrelated C: ...and nothing she attempted was written'
FROM public.rebuild_focus_links WHERE local_id IN ('f11-cross', 'f11-cross-2');

-- ---- anon.
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
SELECT CASE WHEN herkeys_test.test_denied('SELECT count(*) FROM public.rebuild_focuses') AND herkeys_test.test_denied('SELECT count(*) FROM public.rebuild_focus_links')
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unauthenticated: DENY reading either table';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-anon', 'title', 'x', 'state', 'active')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 unauthenticated: DENY writing a Focus';

-- ---- The server removes a shared Task A had linked: the link goes with it, silently; A's Focus is untouched; nothing errors.
RESET ROLE;
SELECT title AS focus_title_before, state AS focus_state_before FROM public.rebuild_focuses WHERE local_id = 'f11-focus-a' \gset
DELETE FROM public.tasks WHERE local_id = 'f11-task-hh';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | f11: a hard-deleted shared Task removes the links to it (no dangling reference, no error)'
FROM public.rebuild_focus_links WHERE local_id IN ('f11-link-hh', 'f11-link-b');
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | f11: ...and A''s Focus is intact, exactly as it was'
FROM public.rebuild_focuses WHERE local_id = 'f11-focus-a' AND title = :'focus_title_before' AND state = :'focus_state_before';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | f11: ...and the next-action link to the private Task is untouched'
FROM public.rebuild_focus_links WHERE local_id = 'f11-link-next' AND status = 'active';

ROLLBACK;

-- ================= THE PUSH PATH ===================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (public.sync_push('rebuild_focuses', 'f1100000-0000-4000-8000-0000000000f1'::uuid,
          jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f11-pushed', 'title', 'Pushed', 'state', 'active', 'producer', 'user-action',
                             'origin_created_at', now(), 'origin_updated_at', now())) ->> 'status') = 'created'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 push: the owner pushes a Focus through the ordinary sync_push';
SELECT CASE WHEN herkeys_test.error_of($q$SELECT public.sync_push('rebuild_focuses', 'f1100000-0000-4000-8000-0000000000f2'::uuid,
          jsonb_build_object('household_id', (SELECT household_id FROM public.household_members WHERE profile_id = '11111111-1111-4111-8111-111111111111' AND role = 'owner'),
                             'profile_id', '22222222-2222-4222-8222-222222222222', 'local_id', 'f11-pushed-as-b', 'title', 'x', 'state', 'active', 'producer', 'user-action',
                             'origin_created_at', now(), 'origin_updated_at', now()))$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | f11 push: DENY pushing a Focus that names another member as its owner';
ROLLBACK;
