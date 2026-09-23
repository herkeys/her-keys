-- HK-FEATURE-13 (People OS) — PHASE A: the owner-private substrate probes, run against the WAVE3_BASE schema as it stands.
--
-- People OS needs three things the foundation must ALREADY provide before any F13 table exists:
--   M0B  an owner-private row that only its owner can read or write (the table F13 reuses for external people: household_people);
--   M0C  a canonical Task that is owner-private (scope 'personal', owner_profile_id set);
--   M0D  a private parent -> private Task -> private TYPED relationship chain that stays inference-safe through direct reads, counts,
--        the change log, sync_pull and sync_push. `responsibilities` is used as the stand-in typed relationship: it is an existing
--        owner-private row with typed foreign keys to a person (household_people) and to a task — exactly the shape F13's own link has.
--
-- Actors (helpers/10-fixtures.sql): USER A owns household A; USER B is a second adult of household A (same household, NOT the owner of
-- A's private rows); USER C owns an unrelated household; anon is unauthenticated. Every fixture row this file commits is named f13-p0-*.
-- Rows are synthetic and non-sensitive.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'hh_a' AND system_role = 'relationships' \gset
SELECT id AS cat_c FROM public.household_categories WHERE household_id = :'hh_c' AND system_role = 'relationships' \gset

-- What B can see of household A's change log BEFORE A writes anything private (the count-inference baseline).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT count(*) AS b_log_before FROM public.change_log WHERE household_id = :'hh_a' AND owner_profile_id IS NULL \gset
SELECT count(*) AS b_tasks_before FROM public.tasks WHERE household_id = :'hh_a' \gset
COMMIT;

-- ================= A WRITES THE PRIVATE CHAIN (committed, so the change log and sync_pull see it) ==========================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-p0-person',
         'display_name', 'Sample Neighbor', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | M0B owner: ALLOW creating her own owner-private person';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'f13-p0-task', :'ua', 'Return the ladder', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal');
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | M0C owner: ALLOW creating an owner-private canonical task (scope personal, owner set)'
FROM public.tasks WHERE local_id = 'f13-p0-task' AND scope = 'personal' AND owner_profile_id = :'ua';
COMMIT;

RESET ROLE;
SELECT id AS p0_person FROM public.household_people WHERE local_id = 'f13-p0-person' \gset
SELECT id AS p0_task FROM public.tasks WHERE local_id = 'f13-p0-task' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-p0-link',
         'about_type', 'task', 'about_task_id', :'p0_task', 'responsible_kind', 'person', 'responsible_person_id', :'p0_person',
         'state', 'owned', 'still_needs_me', true)) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | M0D owner: ALLOW a private typed relationship between her private person and her private task';
COMMIT;

RESET ROLE;
SELECT id AS p0_link FROM public.responsibilities WHERE local_id = 'f13-p0-link' \gset

-- ================= M0B / M0C / M0D — THE OWNER ===========================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (SELECT count(*) FROM public.household_people WHERE id = :'p0_person') = 1
             AND (SELECT count(*) FROM public.tasks WHERE id = :'p0_task') = 1
             AND (SELECT count(*) FROM public.responsibilities WHERE id = :'p0_link') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW reading all three private rows';
WITH u AS (UPDATE public.household_people SET display_name = 'Sample Neighbor (renamed)' WHERE id = :'p0_person' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | M0B owner: ALLOW updating her private person' FROM u;
WITH u AS (UPDATE public.tasks SET title = 'Return the ladder today' WHERE id = :'p0_task' RETURNING 1)
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | M0C owner: ALLOW updating her private task' FROM u;
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE entity_id IN (:'p0_person', :'p0_task', :'p0_link')) >= 3
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: the change log shows her the three private rows (her own devices can hydrate them)';
-- The pull's snapshot barrier is cluster-wide: another session's open transaction can hold it back, which DEFERS a row to a later pull
-- and never loses it. So the property asserted is exact: each of her private entries is either delivered now or sits at/after the
-- cursor the pull hands back (and so is delivered next time).
WITH p AS (SELECT public.sync_pull('0'::xid8, :'hh_a') AS j),
     got AS (SELECT (r ->> 'entity_id')::uuid AS id FROM p, jsonb_array_elements(p.j -> 'rows') r)
SELECT CASE WHEN count(*) >= 3 AND count(*) FILTER (WHERE NOT (c.entity_id IN (SELECT id FROM got)
                                                          OR c.committed_xid >= ((SELECT j ->> 'next_cursor' FROM p))::xid8)) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: sync_pull delivers her three private rows (or defers them behind the barrier to the next pull; none is lost)'
FROM public.change_log c WHERE c.entity_id IN (:'p0_person', :'p0_task', :'p0_link');
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.tasks SET scope = %L, owner_profile_id = NULL WHERE id = %L', 'household', :'p0_task')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0C owner: even the OWNER cannot re-scope a private task to household (the column is not client-updatable)';
ROLLBACK;

-- ================= SAME HOUSEHOLD, NOT THE OWNER (USER B) ===================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
-- In the shared ENV C other suites commit rows B herself owns; "nothing of A's" is the property, so every count excludes B's own rows.
SELECT CASE WHEN (SELECT count(*) FROM public.household_people WHERE household_id = :'hh_a' AND profile_id <> :'ub') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | M0B same-household: DENY — B reads zero of A''s private people (by household)';
SELECT CASE WHEN (SELECT count(*) FROM public.household_people WHERE id = :'p0_person') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | M0B same-household: DENY — B reads zero rows even by the exact id';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks WHERE id = :'p0_task') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | M0C same-household: DENY — B cannot read A''s private task by the exact id';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks WHERE household_id = :'hh_a') = :'b_tasks_before'::bigint
            THEN 'PASS' ELSE 'FAIL' END || ' | M0C same-household: B''s task count is unchanged by A''s private task (no count inference)';
SELECT CASE WHEN (SELECT count(*) FROM public.responsibilities WHERE household_id = :'hh_a' AND profile_id <> :'ub') = 0
             AND (SELECT count(*) FROM public.responsibilities WHERE id = :'p0_link') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | M0D same-household: DENY — B reads zero private relationships (count and exact id)';
WITH u AS (UPDATE public.household_people SET display_name = 'hijack' WHERE id = :'p0_person' RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | M0B same-household: DENY — B''s UPDATE of A''s person matches no row' FROM u;
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.tasks SET scope = %L, owner_profile_id = NULL WHERE id = %L', 'household', :'p0_task')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0C same-household: DENY — B cannot re-scope A''s private task to household (scope and owner are not client-updatable columns at all)';
WITH u AS (UPDATE public.tasks SET title = 'hijack' WHERE id = :'p0_task' RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | M0C same-household: DENY — B''s UPDATE of A''s private task title matches no row' FROM u;
WITH u AS (UPDATE public.responsibilities SET state = 'owned' WHERE id = :'p0_link' RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | M0D same-household: DENY — B''s UPDATE of A''s relationship matches no row' FROM u;
SELECT CASE WHEN herkeys_test.error_of(format('DELETE FROM public.household_people WHERE id = %L', :'p0_person')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0B same-household: DENY — B holds no DELETE (refused by privilege)';
SELECT CASE WHEN herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-p0-forged',
         'display_name', 'Forged', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0B same-household: DENY — B cannot create a person owned by A';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
         VALUES (%L, 'f13-p0-forged-task', %L, 'Forged', %L, 5, 'flexible', 'unplanned', 'open', 'personal')$q$, :'hh_a', :'ua', :'cat_a')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0C same-household: DENY — B cannot create a private task owned by A';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'f13-p0-b-task', :'ub', 'B''s own errand', :'cat_a', 5, 'flexible', 'unplanned', 'open', 'personal');
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-p0-b-link',
         'about_type', 'task', 'about_task_id', (SELECT id FROM public.tasks WHERE local_id = 'f13-p0-b-task'),
         'responsible_kind', 'person', 'responsible_person_id', :'p0_person', 'state', 'owned', 'still_needs_me', true)) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0D same-household: DENY — B cannot point her own relationship at A''s private PERSON (owner-proving composite key)';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-p0-b-link2',
         'about_type', 'task', 'about_task_id', :'p0_task', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | M0D same-household: DENY — B cannot write a relationship row owned by A';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE entity_id IN (:'p0_person', :'p0_task', :'p0_link')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | change log (same-household): DENY — B sees no entry for any of the three private rows';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a' AND owner_profile_id IS NULL) = :'b_log_before'::bigint
             AND (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a' AND owner_profile_id IS NOT NULL AND owner_profile_id <> :'ub') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | change log (same-household): B''s visible household entry COUNT is unchanged by A''s private writes, and B sees no entry owned by anyone but herself';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a' AND entity_table IN ('household_people', 'responsibilities')
                  AND owner_profile_id IS DISTINCT FROM :'ub') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | change log (same-household): B sees no household_people or responsibilities entry but her own (not even the table name of A''s)';
-- sync_pull is the change log read under B's RLS; the check above is the table-name half, this is the id half.
SELECT CASE WHEN (SELECT count(*) FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'hh_a') -> 'rows') r
                  WHERE (r ->> 'entity_id')::uuid IN (:'p0_person', :'p0_task', :'p0_link')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_pull (same-household): DENY — B''s pull carries no id or revision of A''s private rows';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('responsibilities', gen_random_uuid(),
         jsonb_build_object('household_id', %L::uuid, 'profile_id', %L::uuid, 'local_id', 'f13-p0-push', 'about_type', 'task', 'about_task_id', %L::uuid,
                            'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true, 'producer', 'user-action',
                            'origin_created_at', now(), 'origin_updated_at', now()))$q$, :'hh_a', :'ua', :'p0_task')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_push (same-household): DENY — B cannot push a relationship row as A';
-- The existing collision probe keys owner-private tables on (household, OWNER, local id): B reusing A's local id is not "already exists".
SELECT CASE WHEN (public.sync_push('household_people', gen_random_uuid(),
         jsonb_build_object('household_id', :'hh_a'::uuid, 'profile_id', :'ub'::uuid, 'local_id', 'f13-p0-person', 'display_name', 'B''s own',
                            'relationship', 'other', 'channel', 'unspecified', 'status', 'active', 'producer', 'user-action',
                            'origin_created_at', now(), 'origin_updated_at', now())) ->> 'status') = 'created'
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_push (same-household): B reusing A''s private local id is a fresh row of HER OWN, not a collision (the probe reveals nothing)';
ROLLBACK;

-- Existence oracles, characterised rather than hidden. Keys are checked by the database without RLS, so a same-household caller who
-- ALREADY HOLDS a private task's uuid can learn something by referencing it from her own row: (1) the composite (task, household) key
-- accepts a real uuid and refuses a random one; (2) responsibilities_one_live_owner_uq is HOUSEHOLD-wide, so it even reports that ANOTHER
-- owner holds a live responsibility on that task. No read path above ever hands B that uuid. The lesson F13 takes from it: every F13
-- uniqueness boundary is PER OWNER, and F13's link table refuses a task the caller does not own BEFORE any key is consulted.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT 'NOTE | M0D residual (pre-existing foundation property): B referencing A''s private task uuid from B''s OWN responsibility -> '
       || coalesce(herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-p0-oracle',
            'about_type', 'task', 'about_task_id', :'p0_task', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)), 'accepted')
       || '; a random uuid -> '
       || coalesce(herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-p0-oracle2',
            'about_type', 'task', 'about_task_id', gen_random_uuid(), 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)), 'accepted');
-- (3) `tasks` is a SCOPED table: its local-id uniqueness is (household, local id) across owners, and sync_push's collision probe runs
-- under RLS, so B pushing a task that reuses the LOCAL id of A's private task hits the unique key. That confirms a GUESSED local id only.
-- F13's consequence: the follow-up tasks it creates carry a high-entropy local id, so there is nothing practical to guess.
SELECT 'NOTE | M0C residual (pre-existing, scoped tables): B pushes a task reusing A''s private task LOCAL id -> '
       || coalesce(split_part(herkeys_test.error_of(format($q$SELECT public.sync_push('tasks', gen_random_uuid(), jsonb_build_object('household_id', %L::uuid,
            'local_id', 'f13-p0-task', 'owner_profile_id', %L::uuid, 'title', 'B', 'category_id', %L::uuid, 'duration_minutes', 5, 'commitment', 'flexible',
            'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal', 'producer', 'user-action'))$q$, :'hh_a', :'ub', :'cat_a')), ' DETAIL', 1), 'accepted')
       || '; a fresh local id -> '
       || coalesce(herkeys_test.error_of(format($q$SELECT public.sync_push('tasks', gen_random_uuid(), jsonb_build_object('household_id', %L::uuid,
            'local_id', 'f13-p0-task-fresh', 'owner_profile_id', %L::uuid, 'title', 'B', 'category_id', %L::uuid, 'duration_minutes', 5, 'commitment', 'flexible',
            'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal', 'producer', 'user-action'))$q$, :'hh_a', :'ub', :'cat_a')), 'accepted');
ROLLBACK;

-- ================= UNRELATED HOUSEHOLD (USER C) =============================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.household_people WHERE id = :'p0_person') = 0
             AND (SELECT count(*) FROM public.tasks WHERE id = :'p0_task') = 0
             AND (SELECT count(*) FROM public.responsibilities WHERE id = :'p0_link') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C reads none of the three private rows by exact id';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: C sees no change-log entry of household A at all';
SELECT CASE WHEN herkeys_test.error_of(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — sync_pull naming household A is refused for C';
SELECT CASE WHEN herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'f13-p0-c',
         'display_name', 'Intruder', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C cannot create a person inside household A';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'f13-p0-c-link',
         'about_type', 'task', 'about_task_id', :'p0_task', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C''s relationship in HER household cannot name A''s task (household-proving key)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_people', gen_random_uuid(),
         jsonb_build_object('household_id', %L::uuid, 'profile_id', %L::uuid, 'local_id', 'f13-p0-c-push', 'display_name', 'x', 'relationship', 'other',
                            'channel', 'unspecified', 'status', 'active', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now()))$q$,
         :'hh_a', :'uc')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — sync_push into household A is refused for C';
WITH u AS (UPDATE public.tasks SET title = 'x' WHERE id = :'p0_task' RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C''s UPDATE of A''s task matches no row' FROM u;
ROLLBACK;

-- ================= UNAUTHENTICATED ==========================================================================================
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
SELECT CASE WHEN herkeys_test.error_of('SELECT count(*) FROM public.household_people') LIKE '42501%'
             AND herkeys_test.error_of('SELECT count(*) FROM public.tasks') LIKE '42501%'
             AND herkeys_test.error_of('SELECT count(*) FROM public.responsibilities') LIKE '42501%'
             AND herkeys_test.error_of('SELECT count(*) FROM public.change_log') LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | unauthenticated: DENY — anon holds no privilege on people, tasks, relationships or the change log';
SELECT CASE WHEN herkeys_test.test_denied(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a'))
            THEN 'PASS' ELSE 'FAIL' END || ' | unauthenticated: DENY — anon cannot pull';
ROLLBACK;

-- The change log is a global POINTER log: `seq` is one identity across every household, so a gap in the entries B can see is not
-- attributable to household A (or to any table), and sync_pull never returns seq at all. Recorded as characterisation.
SELECT 'NOTE | change_log.seq is a single global identity (not per household) and sync_pull returns no seq: a visible gap cannot be attributed to a household, owner or table';
