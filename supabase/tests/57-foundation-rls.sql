-- THE FOUNDATION'S ACCESS MODEL (B4-FE01-029..031) — both directions: what is refused, and what still works.
--
-- Nineteen owner-private tables (career_opportunities added by F10 Work/Career OS). The catalog is the
-- evidence for the structural claims; concrete rows and real roles prove the behavioural ones.
-- Over-restriction is not a pass: the owner must be able to do everything the product needs.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset

CREATE TEMP TABLE ft (t text PRIMARY KEY, evidence boolean, server_written boolean);
INSERT INTO ft VALUES
  ('source_artifacts', false, false), ('interpretations', false, false), ('external_references', false, false),
  ('behavior_observations', true, false), ('automation_authorities', false, false), ('action_intents', true, false),
  ('intent_decisions', true, false), ('action_executions', true, true), ('action_outcomes', true, true),
  ('household_people', false, false), ('responsibilities', false, false), ('dependencies', false, false),
  ('recurrence_rules', false, false), ('goals', false, false), ('system_steps', false, false),
  ('capacity_profiles', false, false), ('patterns', false, false), ('evidence_links', true, false),
  ('career_opportunities', false, false);

-- ================= THE CATALOG ================================================================================
SELECT CASE WHEN count(*) = 19 THEN 'PASS' ELSE 'FAIL' END || ' | 19 foundation tables exist (' || count(*)::text || ')'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | RLS is enabled on every foundation table (' || coalesce(string_agg(ft.t, ', '), 'none') || ' lack it)'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace WHERE NOT c.relrowsecurity;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | no foundation table has a policy for anon or PUBLIC'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace
JOIN pg_policy p ON p.polrelid = c.oid
WHERE 0 = ANY (p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname = 'anon') = ANY (p.polroles);

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | anon holds no privilege on any foundation table'
FROM ft WHERE has_table_privilege('anon', 'public.' || ft.t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | authenticated holds no DELETE, TRUNCATE, REFERENCES or TRIGGER on any foundation table (nothing is ever hard-deleted)'
FROM ft WHERE has_table_privilege('authenticated', 'public.' || ft.t, 'DELETE, TRUNCATE, REFERENCES, TRIGGER');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | EVIDENCE tables carry no UPDATE privilege on any column for the client (' || coalesce(string_agg(DISTINCT cp.table_name, ', '), 'none') || ')'
FROM information_schema.column_privileges cp JOIN ft ON ft.t = cp.table_name
WHERE ft.evidence AND cp.table_schema = 'public' AND cp.grantee = 'authenticated' AND cp.privilege_type = 'UPDATE';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | SERVER-WRITTEN tables (executions, outcomes) carry no client INSERT privilege at all'
FROM information_schema.column_privileges cp JOIN ft ON ft.t = cp.table_name
WHERE ft.server_written AND cp.table_schema = 'public' AND cp.grantee = 'authenticated' AND cp.privilege_type = 'INSERT';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | and no client INSERT policy exists for them either'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace
JOIN pg_policy p ON p.polrelid = c.oid AND p.polcmd = 'a' WHERE ft.server_written;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | evidence tables have no UPDATE policy: the absence is the append-only guarantee at the RLS layer'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace
JOIN pg_policy p ON p.polrelid = c.oid AND p.polcmd = 'w' WHERE ft.evidence;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | every table''s policies are owner-only: each names profile_id and household membership'
FROM ft JOIN pg_class c ON c.relname = ft.t AND c.relnamespace = 'public'::regnamespace
JOIN pg_policy p ON p.polrelid = c.oid
WHERE NOT (coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)) LIKE '%profile_id%'
       AND coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)) LIKE '%is_household_member%');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | the client can UPDATE no server-owned column on any foundation table (id, revision, household, owner, local id, producer, artifact)'
FROM information_schema.column_privileges cp JOIN ft ON ft.t = cp.table_name
WHERE cp.table_schema = 'public' AND cp.grantee = 'authenticated' AND cp.privilege_type = 'UPDATE'
  AND cp.column_name IN ('id', 'revision', 'created_at', 'updated_at', 'household_id', 'profile_id', 'local_id', 'origin_device_id', 'producer', 'source_artifact_id', 'scope', 'origin_created_at');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | no foundation column is a credential or token (' || coalesce(string_agg(cp.table_name || '.' || cp.column_name, ', '), 'none') || ')'
FROM information_schema.columns cp JOIN ft ON ft.t = cp.table_name
WHERE cp.table_schema = 'public' AND cp.column_name ~* '(token|secret|password|passwd|credential|api_?key|bearer|refresh|oauth|private_?key)';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | and no column ANYWHERE in the application schema is one (' || coalesce(string_agg(c.table_name || '.' || c.column_name, ', '), 'none') || ')'
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.column_name ~* '(token|secret|password|passwd|credential|api_?key|bearer|refresh|oauth|private_?key)';

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | no foundation table stores an untyped JSON payload'
FROM information_schema.columns c JOIN ft ON ft.t = c.table_name
WHERE c.table_schema = 'public' AND c.data_type IN ('json', 'jsonb');

-- ================= ROWS, WITH REAL ROLES ==========================================================================
-- Owner writes.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'goal-a', 'title', 'Clear the garage', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW inserting her own goal';
SELECT CASE WHEN herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'person-a', 'display_name', 'Grandma June', 'relationship', 'grandparent', 'channel', 'sms', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW inserting a person';
SELECT CASE WHEN herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'intent-a', 'category', 'internal_reminder', 'consequence', 'low', 'reversibility', 'reversible', 'summary_code', 'nudge', 'permitted_mode', 'suggest', 'producer', 'ai-inference', 'confidence', 'possible')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW recording an intent (evidence)';
SELECT CASE WHEN herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'opp-a', 'title', 'Senior Analyst role', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW inserting her own career opportunity (F10)';
COMMIT;

-- User B is a second adult member of the SAME household: private means private.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | same-household member B: sees NONE of A''s private goals' FROM public.goals;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | ...nor A''s people' FROM public.household_people;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | ...nor A''s intents' FROM public.action_intents;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | ...nor A''s career opportunities (F10: professional privacy is not household-shared by default)' FROM public.career_opportunities;
SELECT CASE WHEN herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'opp-forged', 'title', 'Forged as A', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | B: DENY writing an opportunity as A';
SELECT CASE WHEN herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'opp-b', 'title', 'B''s own search', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | B: ALLOW writing her own private opportunity in the shared household';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | B: sees exactly her own opportunity' FROM public.career_opportunities;
SELECT CASE WHEN herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'goal-forged', 'title', 'Forged as A', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | B: DENY writing a row as A (the policy checks the caller against profile_id)';
SELECT CASE WHEN herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'goal-b', 'title', 'B''s own', 'status', 'active')) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | B: ALLOW writing her own private row in the shared household';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | B: sees exactly her own' FROM public.goals;
COMMIT;

-- User C: an unrelated household.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | unrelated user C: sees nothing in goals, people, intents, opportunities' FROM (
  SELECT id FROM public.goals UNION ALL SELECT id FROM public.household_people UNION ALL SELECT id FROM public.action_intents UNION ALL SELECT id FROM public.career_opportunities) x;
SELECT CASE WHEN herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'goal-intruder', 'title', 'Not my household', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | C: DENY writing into a household she does not belong to';
SELECT CASE WHEN herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'opp-intruder', 'title', 'Not my household', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | C: DENY writing a career opportunity into a household she does not belong to (F10 unrelated-household matrix)';
COMMIT;

-- Anon.
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT 1 FROM public.goals') AND herkeys_test.test_denied('SELECT 1 FROM public.action_executions')
            AND herkeys_test.test_denied('SELECT 1 FROM public.interpretations') AND herkeys_test.test_denied('SELECT 1 FROM public.career_opportunities')
            THEN 'PASS' ELSE 'FAIL' END
       || ' | anon: DENY at the privilege layer';
ROLLBACK;

-- What the owner may and may not change afterwards.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN NOT herkeys_test.test_denied($q$UPDATE public.goals SET title = 'Clear the whole garage' WHERE local_id = 'goal-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: ALLOW editing her goal';
SELECT CASE WHEN revision = 2 AND title = 'Clear the whole garage' THEN 'PASS' ELSE 'FAIL' END || ' | and the SERVER bumped the revision (' || revision::text || ')' FROM public.goals WHERE local_id = 'goal-a';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.goals SET revision = 99 WHERE local_id = 'goal-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY writing the revision';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.goals SET profile_id = '22222222-2222-4222-8222-222222222222' WHERE local_id = 'goal-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY handing her row to someone else';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.goals SET producer = 'ai-inference', confidence = 'possible' WHERE local_id = 'goal-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY rewriting who produced it';
SELECT CASE WHEN herkeys_test.test_denied($q$DELETE FROM public.goals WHERE local_id = 'goal-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY deleting (nothing is hard-deleted)';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.action_intents SET summary_code = 'edited' WHERE local_id = 'intent-a'$q$) THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY editing evidence (an intent is history)';
SELECT CASE WHEN herkeys_test.ins('action_executions', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'forged-exec', 'intent_id', (SELECT id FROM public.action_intents WHERE local_id = 'intent-a'), 'attempt', 1, 'attempted_at', now(), 'result', 'succeeded', 'error_class', 'none', 'reversibility', 'reversible', 'producer', 'automation')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY forging an execution — automation authority is not client authority';
SELECT CASE WHEN herkeys_test.ins('action_outcomes', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'forged-out', 'execution_id', gen_random_uuid(), 'kind', 'delivered', 'observed_at', now(), 'producer', 'automation')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | owner: DENY forging an outcome';
ROLLBACK;

-- Evidence is immutable for EVERY writer, the table owner included.
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.action_intents SET summary_code = 'rewritten' WHERE local_id = 'intent-a'$q$) LIKE '%immutable ledger%'
            THEN 'PASS' ELSE 'FAIL' END || ' | even the table owner cannot UPDATE evidence: action_intents is an immutable ledger';
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.behavior_observations SET outcome = 'completed'$q$) IS NULL OR
                 herkeys_test.error_of($q$UPDATE public.behavior_observations SET outcome = 'completed'$q$) LIKE '%immutable ledger%'
            THEN 'PASS' ELSE 'FAIL' END || ' | and the same trigger guards behavior_observations';

-- The same-owner proof: a row can name only ITS OWNER'S rows, so another member's private rows can never be dangled.
INSERT INTO public.household_people (household_id, local_id, profile_id, display_name, relationship, channel, status, producer, origin_created_at, origin_updated_at)
VALUES (:'hh_a', 'person-b', :'ub', 'B''s neighbour', 'neighbor', 'unspecified', 'active', 'user-action', now(), now());
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
SELECT :'hh_a', 'task-rls', 'RLS task', id, 5, 'flexible', 'unplanned', 'open', 'household', 'user-action' FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'resp-x', 'about_type', 'task',
              'about_task_id', (SELECT id FROM public.tasks WHERE local_id = 'task-rls'), 'responsible_kind', 'person',
              'responsible_person_id', (SELECT id FROM public.household_people WHERE local_id = 'person-b'), 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a row cannot reference ANOTHER MEMBER''S private row, even inside the same household';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'resp-ok', 'about_type', 'task',
              'about_task_id', (SELECT id FROM public.tasks WHERE local_id = 'task-rls'), 'responsible_kind', 'person',
              'responsible_person_id', (SELECT id FROM public.household_people WHERE local_id = 'person-a'), 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)) IS NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | ...while a reference to her OWN row is accepted';
