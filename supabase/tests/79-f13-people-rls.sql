-- HK-FEATURE-13 (People OS) — person_contexts and person_task_links: the RLS attack matrix, integrity by REASON, and inference safety.
--
-- Requires 20260922200000_f13_people_os.sql. Actors (helpers/10-fixtures.sql): USER A owns household A; USER B is a second adult of
-- household A; USER C owns an unrelated household; CHILD A is household A's child; anon is unauthenticated. Rows committed here are
-- named f13-rls-*. Every refusal is asserted by its REASON (SQLSTATE), and the matrix asks of each attack whether it learns CONTENT or
-- EXISTENCE: a probe that returns a different answer for "somebody else's private row" and "nothing" is a leak even when it fails.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'
\set note 'F13-SECRET-NOTE-9e2b'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND member_type = 'child' ORDER BY local_id LIMIT 1 \gset
SELECT id AS member_a FROM public.household_members WHERE household_id = :'hh_a' AND profile_id = :'ua' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'hh_a' AND system_role = 'relationships' \gset

-- ================= CATALOG ====================================================================================================
SELECT CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | catalog: both People tables exist with RLS enabled'
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('person_contexts', 'person_task_links') AND c.relrowsecurity;
SELECT CASE WHEN NOT has_table_privilege('anon', 'public.person_contexts', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             AND NOT has_table_privilege('anon', 'public.person_task_links', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: anon holds no privilege on either table';
SELECT CASE WHEN NOT has_table_privilege('authenticated', 'public.person_contexts', 'DELETE, TRUNCATE')
             AND NOT has_table_privilege('authenticated', 'public.person_task_links', 'DELETE, TRUNCATE')
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: no client can hard-delete a context or a link (archive is the removal)';
SELECT CASE WHEN (SELECT count(*) FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'person_task_links'
                  AND grantee = 'authenticated' AND privilege_type = 'UPDATE') = 0
             AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.person_task_links'::regclass AND p.polcmd = 'w')
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: a follow-up link is immutable (no UPDATE privilege, no UPDATE policy)';
SELECT CASE WHEN (SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges
                  WHERE table_schema = 'public' AND table_name = 'person_contexts' AND grantee = 'authenticated' AND privilege_type = 'UPDATE')
                 = 'context_note,organization_name,origin_updated_at,relationship_name,status'
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: a context can change only its words and status — never whom it is about, its owner or its provenance';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | catalog: no policy on either table reaches anon or PUBLIC'
FROM pg_policy p WHERE p.polrelid IN ('public.person_contexts'::regclass, 'public.person_task_links'::regclass)
  AND (0 = ANY (p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname = 'anon') = ANY (p.polroles));
SELECT CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('person_contexts_one_per_child_uq', 'person_contexts_one_per_person_uq', 'person_task_links_one_link_per_task_uq')
                  AND indexdef LIKE '%profile_id%') = 3
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: every People uniqueness boundary is PER OWNER (no household-wide collision oracle)';

-- ================= OWNER A: the product works ==================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-person',
         'display_name', 'Sample Neighbor', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW her own non-account person';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-ctx-child',
         'child_id', :'child_a', 'relationship_name', 'Daughter', 'context_note', :'note', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW a private context about her CHILD (existing child identity, no duplicate)';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-ctx-person',
         'person_id', (SELECT id FROM public.household_people WHERE local_id = 'f13-rls-person'), 'organization_name', 'Elm Street', 'context_note', :'note', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW a private context about her non-account person';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, due_date)
VALUES (:'hh_a', 'task-fu-f13rlsaaaaaaaaaaaaaaaaaaaaaaaaaaa', :'ua', 'Return the ladder', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', DATE '2026-09-16'),
       (:'hh_a', 'f13-rls-household-task', NULL, 'Shared chore', (SELECT id FROM public.household_categories WHERE household_id = :'hh_a' AND scope = 'household' ORDER BY sort_order LIMIT 1), 15, 'flexible', 'unplanned', 'open', 'household', NULL);
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ptl-f13rls',
         'context_id', (SELECT id FROM public.person_contexts WHERE local_id = 'f13-rls-ctx-person'), 'follow_up_type', 'task',
         'follow_up_task_id', (SELECT id FROM public.tasks WHERE local_id = 'task-fu-f13rlsaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'relation', 'follow_up')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW a follow_up link from her context to her own PRIVATE task';
COMMIT;

RESET ROLE;
SELECT id AS ctx_child FROM public.person_contexts WHERE local_id = 'f13-rls-ctx-child' \gset
SELECT id AS ctx_person FROM public.person_contexts WHERE local_id = 'f13-rls-ctx-person' \gset
SELECT id AS person_a FROM public.household_people WHERE local_id = 'f13-rls-person' \gset
SELECT id AS task_a FROM public.tasks WHERE local_id = 'task-fu-f13rlsaaaaaaaaaaaaaaaaaaaaaaaaaaa' \gset
SELECT id AS task_hh FROM public.tasks WHERE local_id = 'f13-rls-household-task' \gset
SELECT id AS link_a FROM public.person_task_links WHERE local_id = 'ptl-f13rls' \gset
SELECT CASE WHEN child_type = 'child' THEN 'PASS' ELSE 'FAIL' END || ' | owner: the child reference type is DERIVED by the server' FROM public.person_contexts WHERE id = :'ctx_child';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (SELECT count(*) FROM public.person_contexts WHERE household_id = :'hh_a') = 2 AND (SELECT count(*) FROM public.person_task_links WHERE id = :'link_a') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW reading her contexts and her link';
WITH u AS (UPDATE public.person_contexts SET relationship_name = 'Eldest', status = 'archived' WHERE id = :'ctx_child' AND revision = 1 RETURNING revision)
SELECT CASE WHEN (SELECT revision FROM u) = 2 THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW an edit + archive at the expected revision (CAS), and the server bumps it';
WITH u AS (UPDATE public.person_contexts SET relationship_name = 'Stale' WHERE id = :'ctx_child' AND revision = 1 RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | owner: a STALE revision matches no row (a newer edit is never overwritten)' FROM u;
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.person_contexts SET child_id = NULL, person_id = %L WHERE id = %L', :'person_a', :'ctx_child')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: a context can never be re-pointed at somebody else (the target is not updatable)';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-dup',
         'child_id', :'child_a', 'status', 'active')) LIKE '23505%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY a second context for the same child — even while the first is archived (one per owner and person)';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-both',
         'child_id', :'child_a', 'person_id', :'person_a', 'status', 'active')) LIKE '23514%'
             AND herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-none', 'status', 'active')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY a context naming two people or nobody (exactly one identity FK)';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-self',
         'child_id', :'member_a', 'status', 'active')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY a context about HERSELF — the account holder is an adult and the key proves a child';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-ai',
         'person_id', :'person_a', 'status', 'active', 'producer', 'ai-inference', 'confidence', 'possible')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY an inferred context (AI inference is not a relationship fact)';
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.person_contexts SET relationship_name = %L WHERE id = %L', repeat('x', 61), :'ctx_person')) LIKE '23514%'
             AND herkeys_test.error_of(format('UPDATE public.person_contexts SET context_note = %L WHERE id = %L', repeat('n', 501), :'ctx_person')) LIKE '23514%'
             AND herkeys_test.error_of(format('UPDATE public.person_contexts SET relationship_name = %L WHERE id = %L', ' padded', :'ctx_person')) LIKE '23514%'
             AND herkeys_test.error_of(format('UPDATE public.person_contexts SET relationship_name = %L WHERE id = %L', 'two' || chr(10) || 'lines', :'ctx_person')) LIKE '23514%'
             AND herkeys_test.error_of(format('UPDATE public.person_contexts SET context_note = %L WHERE id = %L', 'bell' || chr(7), :'ctx_person')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: the database refuses a 61-character label, a 501-character note, an untrimmed label, a multi-line label and a control character';
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.person_contexts SET context_note = %L WHERE id = %L', 'line one' || chr(10) || 'line two', :'ctx_person')) IS NULL
             AND herkeys_test.error_of(format('UPDATE public.person_contexts SET relationship_name = %L WHERE id = %L', repeat(U&'\+01F9E1', 60), :'ctx_person')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: a note may hold line breaks, and 60 emoji is a 60-character label (code points)';
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ptl-dup',
         'context_id', :'ctx_person', 'follow_up_type', 'task', 'follow_up_task_id', :'task_a', 'relation', 'follow_up')) LIKE '23505%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY linking one task as a follow-up twice';
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ptl-shared',
         'context_id', :'ctx_person', 'follow_up_type', 'task', 'follow_up_task_id', :'task_hh', 'relation', 'follow_up')) LIKE '42501%person_task_links: a follow-up must be one of your own private tasks%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY a private context -> HOUSEHOLD-VISIBLE task link (V1: private context, private task)';
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ptl-rel',
         'context_id', :'ctx_person', 'follow_up_type', 'task', 'follow_up_task_id', :'task_a', 'relation', 'reminder')) LIKE '23%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY any relation but follow_up';
SELECT CASE WHEN herkeys_test.error_of(format('UPDATE public.person_task_links SET relation = %L WHERE id = %L', 'follow_up', :'link_a')) LIKE '42501%'
             AND herkeys_test.error_of(format('DELETE FROM public.person_task_links WHERE id = %L', :'link_a')) LIKE '42501%'
             AND herkeys_test.error_of(format('DELETE FROM public.person_contexts WHERE id = %L', :'ctx_person')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: a link cannot be edited or deleted, a context cannot be deleted (privilege)';
ROLLBACK;

-- ================= SAME HOUSEHOLD, NOT THE OWNER (USER B) ======================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE id = :'child_a') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: B still sees the shared child (canonical identity rights are unchanged)';
SELECT CASE WHEN (SELECT count(*) FROM public.person_contexts WHERE household_id = :'hh_a') = 0
             AND (SELECT count(*) FROM public.person_contexts WHERE id IN (:'ctx_child', :'ctx_person')) = 0
             AND (SELECT count(*) FROM public.person_contexts WHERE child_id = :'child_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: DENY — B reads none of A''s contexts (by household, by id, by the shared child)';
SELECT CASE WHEN (SELECT count(*) FROM public.person_task_links WHERE household_id = :'hh_a') = 0 AND (SELECT count(*) FROM public.person_task_links WHERE id = :'link_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: DENY — B reads no follow-up link and no link count';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks WHERE id = :'task_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: DENY — B cannot read A''s private follow-up task';
WITH u AS (UPDATE public.person_contexts SET context_note = 'hijack' WHERE id = :'ctx_person' RETURNING 1)
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | same-household: DENY — B''s UPDATE of A''s context matches no row' FROM u;
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'f13-rls-b-as-a',
         'child_id', :'child_a', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: DENY — B cannot write a context as A';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-rls-b-child',
         'child_id', :'child_a', 'relationship_name', 'Stepdaughter', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: B''s OWN context on the same child SUCCEEDS — it never collides with, so never reveals, A''s';
SELECT CASE WHEN split_part(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-rls-b-p1',
                    'person_id', :'person_a', 'status', 'active')), ' ', 1)
               = split_part(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-rls-b-p2',
                    'person_id', gen_random_uuid(), 'status', 'active')), ' ', 1)
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: a crafted context naming A''s PRIVATE person answers exactly as for a uuid that names nothing (no existence probe)';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-rls-b-p3',
                    'person_id', :'person_a', 'status', 'active')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: ...and that answer is a refusal (23503, the owner-proving key)';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'task-fu-f13rlsbbbbbbbbbbbbbbbbbbbbbbbbbbb', :'ub', 'B''s errand', :'cat_a', 5, 'flexible', 'unplanned', 'open', 'personal');
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'ptl-b-1',
                    'context_id', (SELECT id FROM public.person_contexts WHERE local_id = 'f13-rls-b-child'), 'follow_up_type', 'task', 'follow_up_task_id', :'task_a', 'relation', 'follow_up'))
               = herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'ptl-b-2',
                    'context_id', (SELECT id FROM public.person_contexts WHERE local_id = 'f13-rls-b-child'), 'follow_up_type', 'task', 'follow_up_task_id', gen_random_uuid(), 'relation', 'follow_up'))
             AND herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'ptl-b-3',
                    'context_id', (SELECT id FROM public.person_contexts WHERE local_id = 'f13-rls-b-child'), 'follow_up_type', 'task', 'follow_up_task_id', :'task_a', 'relation', 'follow_up')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: a crafted link from B''s context to A''s PRIVATE task gets the SAME refusal, word for word, as a task that does not exist (the guard runs before any key)';
SELECT CASE WHEN split_part(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'ptl-b-4',
                    'context_id', :'ctx_person', 'follow_up_type', 'task', 'follow_up_task_id', (SELECT id FROM public.tasks WHERE local_id = 'task-fu-f13rlsbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'relation', 'follow_up')), ' ', 1)
               = split_part(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'ptl-b-5',
                    'context_id', gen_random_uuid(), 'follow_up_type', 'task', 'follow_up_task_id', (SELECT id FROM public.tasks WHERE local_id = 'task-fu-f13rlsbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'relation', 'follow_up')), ' ', 1)
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household: a crafted link hanging B''s task on A''s CONTEXT answers exactly as for a context that does not exist';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE entity_table IN ('person_contexts', 'person_task_links') AND owner_profile_id IS DISTINCT FROM :'ub') = 0
             AND (SELECT count(*) FROM public.change_log WHERE entity_id IN (:'ctx_child', :'ctx_person', :'link_a', :'task_a')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | change log (same-household): B sees no entry of A''s contexts, link or follow-up task';
SELECT CASE WHEN (SELECT count(*) FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'hh_a') -> 'rows') r
                  WHERE (r ->> 'entity_id')::uuid IN (:'ctx_child', :'ctx_person', :'link_a', :'task_a', :'person_a')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_pull (same-household): B''s pull carries none of A''s People rows';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('person_contexts', gen_random_uuid(), jsonb_build_object('household_id', %L::uuid, 'profile_id', %L::uuid,
         'local_id', 'f13-rls-b-push', 'child_id', %L::uuid, 'status', 'active', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now()))$q$, :'hh_a', :'ua', :'child_a')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_push (same-household): DENY — B cannot push a context as A';
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (public.sync_push('person_contexts', gen_random_uuid(), jsonb_build_object('household_id', :'hh_a'::uuid, 'profile_id', :'ub'::uuid,
         'local_id', 'f13-rls-ctx-child', 'person_id', NULL, 'child_id', :'child_a'::uuid, 'status', 'active', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now()))
         ->> 'status') IN ('created')
            THEN 'PASS' ELSE 'FAIL' END || ' | sync_push (same-household): B reusing A''s context LOCAL id is keyed on B''s own boundary — no collision oracle';
ROLLBACK;

-- The note never leaves through an error message either: every refusal B could provoke names ids and rules, never A's words.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN coalesce(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'f13-rls-leak',
                 'person_id', :'person_a', 'status', 'active')), '') NOT LIKE '%' || :'note' || '%'
             AND coalesce(herkeys_test.error_of(format('UPDATE public.person_contexts SET status = %L WHERE id = %L', 'bogus', :'ctx_person')), '') NOT LIKE '%' || :'note' || '%'
            THEN 'PASS' ELSE 'FAIL' END || ' | contextNote leakage: no refusal B can provoke carries A''s note';
ROLLBACK;

-- ================= UNRELATED HOUSEHOLD (USER C) ================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.person_contexts WHERE id IN (:'ctx_child', :'ctx_person')) = 0 AND (SELECT count(*) FROM public.person_task_links WHERE id = :'link_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C reads none of A''s People rows by exact id';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'f13-rls-c',
         'child_id', :'child_a', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C cannot write a context inside household A';
SELECT CASE WHEN herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'f13-rls-c2',
         'child_id', :'child_a', 'status', 'active')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — C''s context in HER household cannot name A''s child (household-proving key)';
SELECT CASE WHEN herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'ptl-c',
         'context_id', :'ctx_person', 'follow_up_type', 'task', 'follow_up_task_id', :'task_a', 'relation', 'follow_up')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: DENY — a crafted cross-household link is refused before any key';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household: C sees no change-log entry of household A';
ROLLBACK;

-- ================= UNAUTHENTICATED =============================================================================================
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{}';
SELECT CASE WHEN herkeys_test.error_of('SELECT count(*) FROM public.person_contexts') LIKE '42501%'
             AND herkeys_test.error_of('SELECT count(*) FROM public.person_task_links') LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | unauthenticated: DENY — anon can read neither table';
ROLLBACK;

-- ================= OWNER TRANSPORT: archive propagates through the change log ==================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.person_contexts SET status = 'archived' WHERE id = :'ctx_person';
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (SELECT max(row_revision) FROM public.change_log WHERE entity_id = :'ctx_person') = 2
             AND (SELECT status FROM public.person_contexts WHERE id = :'ctx_person') = 'archived'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: an archive is an ordinary revisioned upsert in HER change log (a fresh device re-reads it as archived, no resurrection)';
WITH p AS (SELECT public.sync_pull('0'::xid8, :'hh_a') AS j),
     got AS (SELECT (r ->> 'entity_id')::uuid AS id FROM p, jsonb_array_elements(p.j -> 'rows') r)
SELECT CASE WHEN count(*) >= 4 AND count(*) FILTER (WHERE NOT (c.entity_id IN (SELECT id FROM got) OR c.committed_xid >= ((SELECT j ->> 'next_cursor' FROM p))::xid8)) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: sync_pull delivers her contexts, link and follow-up task (or defers them behind the barrier; none is lost)'
FROM public.change_log c WHERE c.entity_id IN (:'ctx_child', :'ctx_person', :'link_a', :'task_a');
ROLLBACK;
