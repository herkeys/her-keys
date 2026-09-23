-- ENV F, after the WHOLE chain (HK-F01-F13 integration, Phase 7): the later features work on the OLD rows — a WAVE3_BASE-era bill,
-- professional task, private task, person and child — and none of what the owner adds reaches anyone else.
--
-- Each write is made AS ITS AUTHOR (RLS, column grants and every trigger decide it). A refusal is reported with its reason.

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

SELECT household_id AS hh_a FROM public.household_members WHERE profile_id = :'ua' \gset
SELECT id AS t_bill FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'w3-task-bill' \gset
SELECT id AS t_work FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'w3-task-work' \gset
SELECT id AS t_private FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'w3-task-private' \gset
SELECT id AS p_june FROM public.household_people WHERE household_id = :'hh_a' AND local_id = 'w3-person-june' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset
SELECT revision AS bill_rev FROM public.tasks WHERE id = :'t_bill' \gset
SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)) AS linked_before FROM public.tasks t WHERE t.id IN (:'t_work', :'t_private') \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';

-- F09: she states how an OLD household bill is paid.
UPDATE public.tasks SET payment_mechanism = 'autopay' WHERE id = :'t_bill';
SELECT CASE WHEN (SELECT payment_mechanism = 'autopay' AND revision = :bill_rev + 1 FROM public.tasks WHERE id = :'t_bill')
  THEN 'PASS' ELSE 'FAIL' END || ' | F09: the owner states how a PRE-EXISTING household bill is paid, and the server counts the edit (its revision bumps)';

-- F10: an opportunity, and her OLD professional task becomes its next step through the widened dependencies.
SELECT coalesce(herkeys_test.ins('career_opportunities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-opp',
  'title', 'Program manager role', 'opportunity_type', 'job', 'stage', 'exploring', 'stage_changed_at', now())), '') AS e_opp \gset
SELECT coalesce(herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-dep-opp',
  'relation', 'part_of', 'from_type', 'task', 'from_task_id', :'t_work', 'to_type', 'opportunity',
  'to_opportunity_id', (SELECT id FROM public.career_opportunities WHERE local_id = 'envf-opp'), 'status', 'active')), '') AS e_dep \gset
SELECT CASE WHEN :'e_opp' = '' AND :'e_dep' = '' THEN 'PASS' ELSE 'FAIL' END
  || ' | F10: an opportunity is created and a PRE-EXISTING professional task becomes its next step' || :'e_opp' || :'e_dep';

-- F11: a Focus, and her OLD private task becomes its next step.
SELECT coalesce(herkeys_test.ins('rebuild_focuses', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-focus',
  'title', 'Sleep before midnight', 'state', 'active')), '') AS e_focus \gset
SELECT coalesce(herkeys_test.ins('rebuild_focus_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-focus-link',
  'focus_id', (SELECT id FROM public.rebuild_focuses WHERE local_id = 'envf-focus'), 'target_type', 'task', 'target_task_id', :'t_private',
  'relation', 'next_action', 'status', 'active')), '') AS e_focus_link \gset
SELECT CASE WHEN :'e_focus' = '' AND :'e_focus_link' = '' THEN 'PASS' ELSE 'FAIL' END
  || ' | F11: a Focus is created and a PRE-EXISTING private task becomes its next step' || :'e_focus' || :'e_focus_link';

-- F12: a record, and her OLD private task becomes its renewal step.
SELECT coalesce(herkeys_test.ins('life_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-record',
  'title', 'Passport', 'record_kind', 'credential', 'status', 'active', 'scope', 'personal')), '') AS e_record \gset
SELECT coalesce(herkeys_test.ins('life_record_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-record-link',
  'life_record_id', (SELECT id FROM public.life_records WHERE local_id = 'envf-record'), 'task_id', :'t_private', 'relation', 'renewal',
  'scope', 'personal')), '') AS e_record_link \gset
SELECT CASE WHEN :'e_record' = '' AND :'e_record_link' = '' THEN 'PASS' ELSE 'FAIL' END
  || ' | F12: a record is kept and a PRE-EXISTING private task becomes its renewal step' || :'e_record' || :'e_record_link';

-- F13: private contexts about an OLD person and the OLD child, and a follow-up on her OLD private task.
SELECT coalesce(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-ctx',
  'person_id', :'p_june', 'relationship_name', 'Grandma', 'status', 'active')), '') AS e_ctx \gset
SELECT coalesce(herkeys_test.ins('person_contexts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-ctx-child',
  'child_id', :'child_a', 'relationship_name', 'Daughter', 'status', 'active')), '') AS e_ctx_child \gset
SELECT coalesce(herkeys_test.ins('person_task_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'envf-ptl',
  'context_id', (SELECT id FROM public.person_contexts WHERE local_id = 'envf-ctx'), 'follow_up_type', 'task', 'follow_up_task_id', :'t_private',
  'relation', 'follow_up')), '') AS e_ptl \gset
SELECT CASE WHEN :'e_ctx' = '' AND :'e_ctx_child' = '' AND :'e_ptl' = '' THEN 'PASS' ELSE 'FAIL' END
  || ' | F13: private contexts about a PRE-EXISTING person and the PRE-EXISTING child, and a follow-up on a PRE-EXISTING private task'
  || :'e_ctx' || :'e_ctx_child' || :'e_ptl';

SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities) = 1 AND (SELECT count(*) FROM public.rebuild_focuses) = 1
            AND (SELECT count(*) FROM public.rebuild_focus_links) = 1 AND (SELECT count(*) FROM public.life_records) = 1
            AND (SELECT count(*) FROM public.life_record_task_links) = 1 AND (SELECT count(*) FROM public.person_contexts) = 2
            AND (SELECT count(*) FROM public.person_task_links) = 1
  THEN 'PASS' ELSE 'FAIL' END || ' | A reads back every row she added over the old data';
COMMIT;

SELECT CASE WHEN md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)) = :'linked_before' THEN 'PASS' ELSE 'FAIL' END
  || ' | linking rows TO the old tasks changed nothing ON them (the professional and private tasks are byte-identical)'
FROM public.tasks t WHERE t.id IN (:'t_work', :'t_private');

-- The rest of the household, and a stranger: what the owner added over the old data reaches no one else.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN (SELECT count(*) FROM public.career_opportunities) + (SELECT count(*) FROM public.rebuild_focuses)
               + (SELECT count(*) FROM public.rebuild_focus_links) + (SELECT count(*) FROM public.life_records)
               + (SELECT count(*) FROM public.life_record_task_links) + (SELECT count(*) FROM public.person_contexts)
               + (SELECT count(*) FROM public.person_task_links) = 0
          AND (SELECT count(*) FROM public.dependencies WHERE local_id = 'envf-dep-opp') = 0
          AND (SELECT count(*) FROM public.change_log WHERE entity_table IN ('career_opportunities', 'rebuild_focuses', 'rebuild_focus_links',
               'life_records', 'life_record_task_links', 'person_contexts', 'person_task_links')) = 0
  THEN 'PASS' ELSE 'FAIL' END || ' | B (same household) sees none of it: not a row, not the opportunity edge, not a change-log entry';
SELECT CASE WHEN (SELECT payment_mechanism FROM public.tasks WHERE local_id = 'w3-task-bill') = 'autopay'
  THEN 'PASS' ELSE 'FAIL' END || ' | B does see the household bill''s payment mechanism (a household task stays household-visible after F09)';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.tasks WHERE household_id = :'hh_a') + (SELECT count(*) FROM public.career_opportunities)
               + (SELECT count(*) FROM public.person_contexts) + (SELECT count(*) FROM public.life_records) = 0
  THEN 'PASS' ELSE 'FAIL' END || ' | C (another household) sees nothing of household A, old or new';
COMMIT;
