-- HK-F01-F13 integration audit, Phase 8 — THE INTEGRATED PRIVACY ATTACK.
--
-- Each Wave 3/4 feature proved its own tables alone (57 for F10's opportunities, 78 for F11, 78/79 for F12, 79 for F13). This suite
-- runs against the WHOLE chain in one database and attacks what only the integrated product has: every private F09-F13 entity and
-- relationship at once, relationships that cross features, and the shared foundation rules they all stand on.
--
-- Actors (helpers/10-fixtures.sql): USER A owns household A; USER B is a second adult of household A (NOT the owner of A's private
-- rows); USER C owns an unrelated household; anon is unauthenticated; the service role bypasses RLS. Every row this file commits is
-- named int13-*; probes that would leave rows behind run in transactions that are rolled back.
--
-- The matrix asks of every attack whether it learns CONTENT or EXISTENCE: a probe that answers differently for "somebody else's
-- private row" and "nothing" is a leak even when it fails ("relationship inference leak", P2).
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'
\set secret 'INT13-SECRET-7f3a'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND member_type = 'child' ORDER BY local_id LIMIT 1 \gset
SELECT id AS cat_rel FROM public.household_categories WHERE household_id = :'hh_a' AND system_role = 'relationships' \gset
SELECT id AS cat_home FROM public.household_categories WHERE household_id = :'hh_a' AND system_role = 'home' \gset

-- ================= CATALOG ======================================================================================================
SELECT CASE WHEN count(*) = 7 THEN 'PASS' ELSE 'FAIL' END || ' | catalog: all seven Wave 3/4 tables exist with RLS enabled'
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relrowsecurity
  AND c.relname IN ('career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links');
SELECT CASE WHEN bool_and(NOT has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                     AND NOT has_table_privilege('authenticated', 'public.' || t, 'DELETE, TRUNCATE'))
            THEN 'PASS' ELSE 'FAIL' END || ' | catalog: anon holds nothing on any Wave 3/4 table, and no client can hard-delete from one'
FROM unnest(ARRAY['career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links']) AS t;
-- A table whose rows are read by OWNER (its read policy names a profile) and that feeds the change log must log WITH the owner:
-- an entry logged without one is visible to every member, and names the private row's table, id and revision.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | catalog: every owner-read table that feeds the change log logs its owner (no private entry reaches another member): '
       || coalesce(string_agg(c.relname, ', '), 'all do')
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*') AND pg_get_expr(p.polqual, p.polrelid) ~ 'profile_id')
  AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgfoid = 'public.log_row_change'::regproc)
  AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgfoid = 'public.log_row_change'::regproc
                  AND split_part(encode(t.tgargs, 'escape'), '\000', 2) ~ 'profile_id');
-- HK13-D24: a uniqueness rule on an OWNER-PRIVATE relationship table that spans the household tells a member that another member's
-- private row exists (and refuses her own row for it). Every one of them must be per owner.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | catalog: every domain uniqueness rule on an owner-private relationship table is PER OWNER: '
       || coalesce(string_agg(i.indexrelid::regclass::text, ', ' ORDER BY i.indexrelid::regclass::text), 'all are')
FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
WHERE c.relnamespace = 'public'::regnamespace AND i.indisunique AND NOT i.indisprimary
  AND c.relname IN ('responsibilities', 'dependencies', 'recurrence_rules', 'system_steps', 'rebuild_focus_links', 'person_contexts', 'person_task_links')
  AND pg_get_indexdef(i.indexrelid) !~ 'profile_id'
  AND pg_get_indexdef(i.indexrelid) !~ '\(id[,)]';

-- ================= A WRITES THE PRIVATE WORLD (committed, so the change log and sync_pull see it) =================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'int13-task-private-1', :'ua', :'secret', :'cat_rel', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action'),
       (:'hh_a', 'int13-task-private-2', :'ua', :'secret', :'cat_rel', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action'),
       (:'hh_a', 'int13-task-private-3', :'ua', :'secret', :'cat_rel', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action'),
       (:'hh_a', 'int13-task-hh-1', NULL, 'Shared chore one', :'cat_home', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
       (:'hh_a', 'int13-task-hh-2', NULL, 'Shared chore two', :'cat_home', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
       (:'hh_a', 'int13-task-hh-3', NULL, 'Shared chore three', :'cat_home', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
       (:'hh_a', 'int13-task-hh-4', NULL, 'Shared chore four', :'cat_home', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action');
INSERT INTO public.household_systems (household_id, local_id, name, description, category_id, scope)
VALUES (:'hh_a', 'int13-system-hh', 'Shared routine', '', :'cat_home', 'household');
COMMIT;

RESET ROLE;
SELECT id AS t_p1 FROM public.tasks WHERE local_id = 'int13-task-private-1' \gset
SELECT id AS t_p2 FROM public.tasks WHERE local_id = 'int13-task-private-2' \gset
SELECT id AS t_p3 FROM public.tasks WHERE local_id = 'int13-task-private-3' \gset
SELECT id AS t_h1 FROM public.tasks WHERE local_id = 'int13-task-hh-1' \gset
SELECT id AS t_h2 FROM public.tasks WHERE local_id = 'int13-task-hh-2' \gset
SELECT id AS t_h3 FROM public.tasks WHERE local_id = 'int13-task-hh-3' \gset
SELECT id AS t_h4 FROM public.tasks WHERE local_id = 'int13-task-hh-4' \gset
SELECT id AS s_h FROM public.household_systems WHERE local_id = 'int13-system-hh' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN coalesce(herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-opp',
         'title', :'secret', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now(), 'notes', :'secret')), '') = ''
        AND coalesce(herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-focus',
         'title', :'secret', 'note', :'secret', 'state', 'active')), '') = ''
        AND coalesce(herkeys_test.ins('life_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-record',
         'title', :'secret', 'record_kind', 'credential', 'status', 'active', 'scope', 'personal', 'reference_number', :'secret', 'note', :'secret',
         'subject_member_id', :'child_a')), '') = ''
        AND coalesce(herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-person',
         'display_name', 'Sample Neighbor', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')), '') = ''
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: ALLOW her opportunity, Focus, record and non-account person';
COMMIT;

RESET ROLE;
SELECT id AS opp_a FROM public.career_opportunities WHERE local_id = 'int13-opp' \gset
SELECT id AS focus_a FROM public.rebuild_focuses WHERE local_id = 'int13-focus' \gset
SELECT id AS record_a FROM public.life_records WHERE local_id = 'int13-record' \gset
SELECT id AS person_a FROM public.household_people WHERE local_id = 'int13-person' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN coalesce(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-ctx',
         'person_id', :'person_a', 'relationship_name', 'Neighbor', 'context_note', :'secret', 'status', 'active')), '') = ''
        AND coalesce(herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-focus-link',
         'focus_id', :'focus_a', 'target_type', 'task', 'target_task_id', :'t_p1', 'relation', 'next_action', 'status', 'active')), '') = ''
        AND coalesce(herkeys_test.ins('life_record_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-record-link',
         'life_record_id', :'record_a', 'task_id', :'t_p2', 'relation', 'renewal', 'scope', 'personal')), '') = ''
        AND coalesce(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-dep-opp',
         'relation', 'part_of', 'from_type', 'task', 'from_task_id', :'t_p3', 'to_type', 'opportunity', 'to_opportunity_id', :'opp_a', 'status', 'active')), '') = ''
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: ALLOW her context, a next step on her Focus, a renewal Task on her record, a step of her opportunity';
-- Her PRIVATE relationships about SHARED things: she privately holds, sequences, schedules and steps through household items.
SELECT CASE WHEN coalesce(herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-resp',
         'about_type', 'task', 'about_task_id', :'t_h1', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)), '') = ''
        AND coalesce(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-dep-edge',
         'relation', 'requires', 'from_type', 'task', 'from_task_id', :'t_h1', 'to_type', 'task', 'to_task_id', :'t_h2', 'status', 'active')), '') = ''
        AND coalesce(herkeys_test.ins('recurrence_rules', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-rule',
         'about_type', 'task', 'about_task_id', :'t_h3', 'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[0],
         'anchor_date', DATE '2026-09-13', 'timezone', 'America/Chicago', 'status', 'active')), '') = ''
        AND coalesce(herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-step',
         'system_id', :'s_h', 'position', 0, 'title', :'secret', 'effort_minutes', 5)), '') = ''
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: ALLOW her private handoff, sequence, schedule and step on SHARED household items';
COMMIT;

RESET ROLE;
SELECT id AS ctx_a FROM public.person_contexts WHERE local_id = 'int13-ctx' \gset
SELECT id AS resp_a FROM public.responsibilities WHERE local_id = 'int13-resp' \gset
SELECT id AS rule_a FROM public.recurrence_rules WHERE local_id = 'int13-rule' \gset
SELECT id AS step_a FROM public.system_steps WHERE local_id = 'int13-step' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN coalesce(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-ptl',
         'context_id', :'ctx_a', 'follow_up_type', 'task', 'follow_up_task_id', :'t_p3', 'relation', 'follow_up')), '') = ''
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: ALLOW a follow-up link from her context to her own private Task';
COMMIT;

RESET ROLE;
CREATE TEMP TABLE int13_private AS
SELECT 'career_opportunities'::text AS t, id FROM public.career_opportunities WHERE local_id = 'int13-opp'
UNION ALL SELECT 'rebuild_focuses', id FROM public.rebuild_focuses WHERE local_id = 'int13-focus'
UNION ALL SELECT 'rebuild_focus_links', id FROM public.rebuild_focus_links WHERE local_id = 'int13-focus-link'
UNION ALL SELECT 'life_records', id FROM public.life_records WHERE local_id = 'int13-record'
UNION ALL SELECT 'life_record_task_links', id FROM public.life_record_task_links WHERE local_id = 'int13-record-link'
UNION ALL SELECT 'household_people', id FROM public.household_people WHERE local_id = 'int13-person'
UNION ALL SELECT 'person_contexts', id FROM public.person_contexts WHERE local_id = 'int13-ctx'
UNION ALL SELECT 'person_task_links', id FROM public.person_task_links WHERE local_id = 'int13-ptl'
UNION ALL SELECT 'dependencies', id FROM public.dependencies WHERE local_id IN ('int13-dep-opp', 'int13-dep-edge')
UNION ALL SELECT 'responsibilities', id FROM public.responsibilities WHERE local_id = 'int13-resp'
UNION ALL SELECT 'recurrence_rules', id FROM public.recurrence_rules WHERE local_id = 'int13-rule'
UNION ALL SELECT 'system_steps', id FROM public.system_steps WHERE local_id = 'int13-step'
UNION ALL SELECT 'tasks', id FROM public.tasks WHERE local_id IN ('int13-task-private-1', 'int13-task-private-2', 'int13-task-private-3');
GRANT SELECT ON int13_private TO authenticated, anon;
SELECT CASE WHEN count(*) = 16 THEN 'PASS' ELSE 'FAIL' END || ' | setup: A''s sixteen private rows across twelve tables are in place' FROM int13_private;

-- ================= OWNER A: her own devices can see all of it =====================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities WHERE id = :'opp_a') + (SELECT count(*) FROM public.rebuild_focuses WHERE id = :'focus_a')
               + (SELECT count(*) FROM public.life_records WHERE id = :'record_a') + (SELECT count(*) FROM public.person_contexts WHERE id = :'ctx_a')
               + (SELECT count(*) FROM public.responsibilities WHERE id = :'resp_a') + (SELECT count(*) FROM public.system_steps WHERE id = :'step_a') = 6
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: reads her own private rows';
SELECT CASE WHEN (SELECT count(DISTINCT c.entity_id) FROM public.change_log c JOIN int13_private p ON p.id = c.entity_id) = 16
            THEN 'PASS' ELSE 'FAIL' END || ' | owner A: the change log carries every one of her sixteen private rows to her own devices';
ROLLBACK;

-- ================= SAME HOUSEHOLD, NOT THE OWNER (USER B) =========================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities WHERE profile_id = :'ua') + (SELECT count(*) FROM public.rebuild_focuses WHERE profile_id = :'ua')
               + (SELECT count(*) FROM public.rebuild_focus_links WHERE profile_id = :'ua') + (SELECT count(*) FROM public.life_records WHERE profile_id = :'ua')
               + (SELECT count(*) FROM public.life_record_task_links WHERE profile_id = :'ua') + (SELECT count(*) FROM public.person_contexts WHERE profile_id = :'ua')
               + (SELECT count(*) FROM public.person_task_links WHERE profile_id = :'ua') + (SELECT count(*) FROM public.household_people WHERE profile_id = :'ua')
               + (SELECT count(*) FROM public.dependencies WHERE profile_id = :'ua') + (SELECT count(*) FROM public.responsibilities WHERE profile_id = :'ua')
               + (SELECT count(*) FROM public.recurrence_rules WHERE profile_id = :'ua') + (SELECT count(*) FROM public.system_steps WHERE profile_id = :'ua') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — reads zero of A''s private rows in all twelve private tables';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks t JOIN int13_private p ON p.id = t.id) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — reads none of A''s private Tasks, even by the exact id';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log c JOIN int13_private p ON p.id = c.entity_id) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — no change-log entry of any of A''s private rows (not even the table name or id)';
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM int13_private p WHERE (public.sync_pull('0'::xid8, :'hh_a'::uuid))::text LIKE '%' || p.id::text || '%')
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — sync_pull carries no id of any of A''s private rows';
WITH u AS (UPDATE public.career_opportunities SET title = 'B was here' WHERE id = :'opp_a' RETURNING 1),
     v AS (UPDATE public.rebuild_focuses SET note = 'B was here' WHERE id = :'focus_a' RETURNING 1),
     w AS (UPDATE public.life_records SET note = 'B was here' WHERE id = :'record_a' RETURNING 1),
     x AS (UPDATE public.person_contexts SET context_note = 'B was here' WHERE id = :'ctx_a' RETURNING 1)
SELECT CASE WHEN (SELECT count(*) FROM u) + (SELECT count(*) FROM v) + (SELECT count(*) FROM w) + (SELECT count(*) FROM x) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — her UPDATEs of A''s opportunity, Focus, record and context match no row';
SELECT CASE WHEN herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-b-as-a-opp',
         'title', 'forged', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())) LIKE '42501%'
        AND herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-b-as-a-focus', 'title', 'forged', 'state', 'active')) LIKE '42501%'
        AND herkeys_test.ins('life_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-b-as-a-record',
         'title', 'forged', 'record_kind', 'other', 'status', 'active', 'scope', 'personal')) LIKE '42501%'
        AND herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-b-as-a-ctx',
         'child_id', :'child_a', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — she cannot create an opportunity, Focus, record or context OWNED BY A';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('rebuild_focuses', gen_random_uuid(), jsonb_build_object('household_id', %L::uuid,
         'profile_id', %L::uuid, 'local_id', 'int13-b-push-as-a', 'title', 'forged', 'state', 'active', 'producer', 'user-action',
         'origin_created_at', now(), 'origin_updated_at', now()))$q$, :'hh_a', :'ua')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: DENY — sync_push cannot write a row as A either';
SELECT CASE WHEN herkeys_test.test_denied(format('DELETE FROM public.%I', t)) THEN 'PASS' ELSE 'FAIL' END
       || ' | same-household B: DENY — holds no DELETE on ' || t
FROM unnest(ARRAY['career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links']) AS t;
-- A crafted LOCAL id: B reusing the exact local id of A's private context is a fresh row of HER OWN, not a collision (reveals nothing).
SELECT CASE WHEN (public.sync_push('person_contexts', gen_random_uuid(), jsonb_build_object('household_id', :'hh_a'::uuid, 'profile_id', :'ub'::uuid,
         'local_id', 'int13-ctx', 'child_id', :'child_a'::uuid, 'status', 'active', 'producer', 'user-action',
         'origin_created_at', now(), 'origin_updated_at', now())) ->> 'status') = 'created'
            THEN 'PASS' ELSE 'FAIL' END || ' | same-household B: a crafted local id equal to A''s private context''s is HER OWN new row (no collision oracle)';
ROLLBACK;

-- ================= RELATIONSHIP PROBES: B's own row naming A's private row answers exactly as naming NOTHING =======================
-- B holds her own Focus, record, person and context; each probe points one of them at A's private row, then at a random uuid, and the
-- refusals must be indistinguishable once the uuids themselves are masked.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
CREATE FUNCTION pg_temp.masked(p text) RETURNS text LANGUAGE sql AS
  $f$ SELECT regexp_replace(coalesce(p, 'accepted'), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<uuid>', 'g') $f$;
SELECT herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-b-focus', 'title', 'B focus', 'state', 'active')) IS NULL AS b_focus_ok \gset
SELECT herkeys_test.ins('life_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-b-record',
         'title', 'B record', 'record_kind', 'other', 'status', 'active', 'scope', 'personal')) IS NULL AS b_record_ok \gset
SELECT herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-b-person',
         'display_name', 'B person', 'relationship', 'other', 'channel', 'unspecified', 'status', 'active')) IS NULL AS b_person_ok \gset
SELECT id AS b_focus FROM public.rebuild_focuses WHERE local_id = 'int13-b-focus' \gset
SELECT id AS b_record FROM public.life_records WHERE local_id = 'int13-b-record' \gset
SELECT id AS b_person FROM public.household_people WHERE local_id = 'int13-b-person' \gset
SELECT herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-b-ctx',
         'person_id', :'b_person', 'status', 'active')) IS NULL AS b_ctx_ok \gset
SELECT id AS b_ctx FROM public.person_contexts WHERE local_id = 'int13-b-ctx' \gset
SELECT CASE WHEN :'b_focus_ok' AND :'b_record_ok' AND :'b_person_ok' AND :'b_ctx_ok' THEN 'PASS' ELSE 'FAIL' END
       || ' | same-household B: ALLOW her own Focus, record, person and context (the probes below use HER rows)';

SELECT CASE WHEN pg_temp.masked(herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p1',
                 'focus_id', :'b_focus', 'target_type', 'task', 'target_task_id', :'t_p1', 'relation', 'next_action', 'status', 'active')))
               = pg_temp.masked(herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p2',
                 'focus_id', :'b_focus', 'target_type', 'task', 'target_task_id', gen_random_uuid(), 'relation', 'next_action', 'status', 'active')))
             AND herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p1b',
                 'focus_id', :'b_focus', 'target_type', 'task', 'target_task_id', :'t_p1', 'relation', 'next_action', 'status', 'active')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | probe F11: B''s Focus -> A''s private Task is refused exactly like -> a Task that does not exist';
SELECT CASE WHEN pg_temp.masked(herkeys_test.ins('life_record_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p3',
                 'life_record_id', :'b_record', 'task_id', :'t_p2', 'relation', 'renewal', 'scope', 'personal')))
               = pg_temp.masked(herkeys_test.ins('life_record_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p4',
                 'life_record_id', :'b_record', 'task_id', gen_random_uuid(), 'relation', 'renewal', 'scope', 'personal')))
             AND herkeys_test.ins('life_record_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p3b',
                 'life_record_id', :'b_record', 'task_id', :'t_p2', 'relation', 'renewal', 'scope', 'personal')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | probe F12: B''s record -> A''s private Task is refused exactly like -> a Task that does not exist';
SELECT CASE WHEN pg_temp.masked(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p5',
                 'context_id', :'b_ctx', 'follow_up_type', 'task', 'follow_up_task_id', :'t_p3', 'relation', 'follow_up')))
               = pg_temp.masked(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p6',
                 'context_id', :'b_ctx', 'follow_up_type', 'task', 'follow_up_task_id', gen_random_uuid(), 'relation', 'follow_up')))
             AND herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p5b',
                 'context_id', :'b_ctx', 'follow_up_type', 'task', 'follow_up_task_id', :'t_p3', 'relation', 'follow_up')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | probe F13: B''s context -> A''s private Task is refused exactly like -> a Task that does not exist';
SELECT CASE WHEN pg_temp.masked(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p7',
                 'person_id', :'person_a', 'status', 'active')))
               = pg_temp.masked(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p8',
                 'person_id', gen_random_uuid(), 'status', 'active')))
             AND herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p7b',
                 'person_id', :'person_a', 'status', 'active')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | probe F13: B''s context about A''s private person is refused exactly like one about nobody';
SELECT CASE WHEN pg_temp.masked(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p9',
                 'relation', 'part_of', 'from_type', 'task', 'from_task_id', :'t_h4', 'to_type', 'opportunity', 'to_opportunity_id', :'opp_a', 'status', 'active')))
               = pg_temp.masked(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-p10',
                 'relation', 'part_of', 'from_type', 'task', 'from_task_id', :'t_h4', 'to_type', 'opportunity', 'to_opportunity_id', gen_random_uuid(), 'status', 'active')))
            THEN 'PASS' ELSE 'FAIL' END || ' | probe F10: a shared Task "part of" A''s private opportunity is refused exactly like "part of" nothing';
ROLLBACK;

-- ================= UNIQUENESS PROBES (HK13-D24): B's OWN private row about a SHARED item never collides with A's ==================
-- B can see the household's shared Tasks and System, so she holds their ids. A household-wide uniqueness rule on an owner-private
-- relationship table answered her own ordinary action with a refusal exactly when A had a private handoff, sequence, schedule or
-- step on the same shared item — telling B it exists — and left B unable to record her own. Each probe is asked about an item A
-- DID touch and one she did not; the answers must be the same, and both must be "accepted".
-- (Each probe writes in one statement and is judged in the next: a statement's own subqueries read the snapshot it started with, so
-- they cannot see rows the functions it calls have just inserted.)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT coalesce(herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u1',
         'about_type', 'task', 'about_task_id', :'t_h1', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)), 'accepted') AS r_touched,
       coalesce(herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u2',
         'about_type', 'task', 'about_task_id', :'t_h4', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)), 'accepted') AS r_fresh \gset
SELECT CASE WHEN :'r_touched' = :'r_fresh' AND :'r_touched' = 'accepted'
             AND (SELECT count(*) FROM public.responsibilities WHERE local_id IN ('int13-u1', 'int13-u2')) = 2
            THEN 'PASS' ELSE 'FAIL' END || ' | uniqueness: B''s own handoff of a shared Task A privately holds is accepted, exactly like one A never touched';
SELECT coalesce(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u3',
         'relation', 'requires', 'from_type', 'task', 'from_task_id', :'t_h1', 'to_type', 'task', 'to_task_id', :'t_h2', 'status', 'active')), 'accepted') AS d_touched,
       coalesce(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u4',
         'relation', 'requires', 'from_type', 'task', 'from_task_id', :'t_h3', 'to_type', 'task', 'to_task_id', :'t_h4', 'status', 'active')), 'accepted') AS d_fresh \gset
SELECT CASE WHEN :'d_touched' = :'d_fresh' AND :'d_touched' = 'accepted'
             AND (SELECT count(*) FROM public.dependencies WHERE local_id IN ('int13-u3', 'int13-u4')) = 2
            THEN 'PASS' ELSE 'FAIL' END || ' | uniqueness: B''s own "requires" between shared Tasks A privately sequenced is accepted, exactly like a fresh pair';
SELECT coalesce(herkeys_test.ins('recurrence_rules', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u5',
         'about_type', 'task', 'about_task_id', :'t_h3', 'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[2],
         'anchor_date', DATE '2026-09-15', 'timezone', 'America/Chicago', 'status', 'active')), 'accepted') AS s_touched,
       coalesce(herkeys_test.ins('recurrence_rules', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u6',
         'about_type', 'task', 'about_task_id', :'t_h4', 'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[2],
         'anchor_date', DATE '2026-09-15', 'timezone', 'America/Chicago', 'status', 'active')), 'accepted') AS s_fresh \gset
SELECT CASE WHEN :'s_touched' = :'s_fresh' AND :'s_touched' = 'accepted'
             AND (SELECT count(*) FROM public.recurrence_rules WHERE local_id IN ('int13-u5', 'int13-u6')) = 2
            THEN 'PASS' ELSE 'FAIL' END || ' | uniqueness: B''s own schedule for a shared Task A privately scheduled is accepted, exactly like one A never touched';
SELECT coalesce(herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'int13-u7',
         'system_id', :'s_h', 'position', 0, 'title', 'B step', 'effort_minutes', 5)), 'accepted') AS step_result \gset
SELECT CASE WHEN :'step_result' = 'accepted' AND (SELECT count(*) FROM public.system_steps WHERE local_id = 'int13-u7') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | uniqueness: B''s own first step on the shared System is accepted, although A privately holds a first step there';
ROLLBACK;

-- ...and each rule still holds PER OWNER: A cannot hold two live handoffs, two live identical edges, two active schedules or two steps
-- at one position of her own (the product rule the index exists for).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-v1',
                 'about_type', 'task', 'about_task_id', :'t_h1', 'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)) LIKE '23505%one_live_owner_uq%'
             AND herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-v2',
                 'relation', 'requires', 'from_type', 'task', 'from_task_id', :'t_h1', 'to_type', 'task', 'to_task_id', :'t_h2', 'status', 'active')) LIKE '23505%live_edge_uq%'
             AND herkeys_test.ins('recurrence_rules', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-v3',
                 'about_type', 'task', 'about_task_id', :'t_h3', 'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[3],
                 'anchor_date', DATE '2026-09-16', 'timezone', 'America/Chicago', 'status', 'active')) LIKE '23505%one_active_rule_uq%'
             AND herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'int13-v4',
                 'system_id', :'s_h', 'position', 0, 'title', 'Second', 'effort_minutes', 5)) LIKE '23505%system_position_key%'
            THEN 'PASS' ELSE 'FAIL' END || ' | uniqueness: each rule still holds for ONE owner (A cannot duplicate her own handoff, edge, schedule or step slot)';
ROLLBACK;

-- ================= UNRELATED HOUSEHOLD (USER C) ===================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities WHERE household_id = :'hh_a') + (SELECT count(*) FROM public.rebuild_focuses WHERE household_id = :'hh_a')
               + (SELECT count(*) FROM public.life_records WHERE household_id = :'hh_a') + (SELECT count(*) FROM public.person_contexts WHERE household_id = :'hh_a')
               + (SELECT count(*) FROM public.person_task_links WHERE household_id = :'hh_a') + (SELECT count(*) FROM public.rebuild_focus_links WHERE household_id = :'hh_a')
               + (SELECT count(*) FROM public.life_record_task_links WHERE household_id = :'hh_a') + (SELECT count(*) FROM public.tasks t JOIN int13_private p ON p.id = t.id) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household C: DENY — reads nothing of household A''s private world';
SELECT CASE WHEN (SELECT count(*) FROM public.change_log WHERE household_id = :'hh_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household C: sees no change-log entry of household A at all';
SELECT CASE WHEN herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'int13-c-focus', 'title', 'intrusion', 'state', 'active')) LIKE '42501%'
             AND herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'uc', 'local_id', 'int13-c-ctx', 'child_id', :'child_a', 'status', 'active')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | foreign household C: DENY — cannot write a private row into household A, even as herself';
ROLLBACK;

-- ================= ANON AND THE SERVICE ROLE =======================================================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied(format('SELECT 1 FROM public.%I', t)) THEN 'PASS' ELSE 'FAIL' END || ' | anon: DENY — cannot read ' || t
FROM unnest(ARRAY['career_opportunities', 'rebuild_focuses', 'rebuild_focus_links', 'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links']) AS t;
ROLLBACK;
BEGIN;
SET LOCAL ROLE service_role;
SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities WHERE id = :'opp_a') = 1 AND (SELECT count(*) FROM public.person_contexts WHERE id = :'ctx_a') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | service role: the server context still sees every row (the boundary is RLS, not missing data)';
ROLLBACK;

-- ================= CONTENT: no secret leaves its owner ============================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks WHERE title = :'secret') = 0
             AND position(:'secret' IN (public.sync_pull('0'::xid8, :'hh_a'::uuid))::text) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | content: nothing B can read — not a Task title, not the pull — carries A''s private words';
ROLLBACK;
