-- ENV F (HK-F01-F13 integration, Phase 7): what a WAVE3_BASE-era household holds before Features 09-13 arrive.
--
-- Runs AFTER 10-fixtures.sql on a database built with exactly the WAVE3_BASE chain (baseline, shipping, IR01, F08, F05), so it may
-- name only columns that existed then. It writes what Features 01-08 write — household, private, professional, co-parent and child
-- rows; tasks with every duration provenance, money values, plans and completions; events; Systems and their steps; handoffs,
-- sequences and schedules; meals with a slot; One Moves; Needs Me; observations, patterns and evidence; a Talk It Out artifact and
-- its interpretation; capacity; daily-load action records — for two adults of one household and one unrelated household.
--
-- Every row is written AS ITS AUTHOR (SET LOCAL ROLE authenticated + her JWT), exactly as a device's push, so RLS, the column
-- grants and every trigger decide it. Any refusal aborts the seed with the table, the local id and the reason.

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

-- Insert one row as the caller, or stop the seed; returns the row's id.
CREATE OR REPLACE FUNCTION herkeys_test.must(p_table text, p_row jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_err text;
  v_id  uuid;
BEGIN
  v_err := herkeys_test.ins(p_table, p_row);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'ENV F seed: % "%" refused: %', p_table, p_row ->> 'local_id', v_err;
  END IF;
  EXECUTE format('SELECT id FROM public.%I WHERE household_id = $1 AND local_id = $2', p_table)
    INTO STRICT v_id USING (p_row ->> 'household_id')::uuid, p_row ->> 'local_id';
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.must(text, jsonb) TO authenticated;

SELECT household_id AS hh_a FROM public.household_members WHERE profile_id = :'ua' \gset
SELECT household_id AS hh_c FROM public.household_members WHERE profile_id = :'uc' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset
SELECT id AS cat_home FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-home' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset
SELECT id AS cat_money FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-money' \gset
SELECT id AS cat_meals FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-meals' \gset
SELECT id AS cat_work FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-work' \gset
SELECT id AS cat_wellbeing FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-wellbeing' \gset
SELECT id AS cat_coparent FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-coparenting' \gset
SELECT id AS cat_c_home FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-home' \gset
SELECT id AS cat_c_meals FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-meals' \gset

-- ============ USER A (owner of household A) =====================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';

-- Tasks (F01 Today, F03 Calendar, F05 Kids, F06 Home, F07 Co-parent, F09-era money values, F10-era work): every scope, every
-- duration provenance IR01 records, plans of every kind, and one of each status.
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-household', 'title', 'Book the plumber', 'category_id', :'cat_home',
  'duration_minutes', 30, 'duration_source', 'user', 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) AS t_household \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-default', 'title', 'Return the library books', 'category_id', :'cat_home',
  'duration_minutes', 15, 'duration_source', 'default', 'commitment', 'flexible', 'plan_kind', 'day', 'planned_date', DATE '2026-09-24', 'status', 'open', 'scope', 'household')) AS t_default \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-unrecorded', 'title', 'Sort the garage shelf', 'category_id', :'cat_home',
  'duration_minutes', 15, 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) AS t_unrecorded \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-private', 'owner_profile_id', :'ua', 'title', 'Call my sister', 'category_id', :'cat_wellbeing',
  'duration_minutes', 20, 'duration_source', 'user', 'commitment', 'flexible', 'plan_kind', 'timed', 'planned_starts_at', TIMESTAMPTZ '2026-09-25 18:00:00-05',
  'status', 'open', 'scope', 'personal')) AS t_private \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-work', 'owner_profile_id', :'ua', 'title', 'Update my resume', 'category_id', :'cat_work',
  'duration_minutes', 45, 'duration_source', 'inferred', 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'professional')) AS t_work \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-child', 'title', 'Sign the field trip form', 'category_id', :'cat_kids',
  'subject_member_id', :'child_a', 'duration_minutes', 5, 'duration_source', 'user', 'commitment', 'fixed', 'plan_kind', 'unplanned', 'due_date', DATE '2026-09-26', 'status', 'open', 'scope', 'child')) AS t_child \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-coparent', 'owner_profile_id', :'ua', 'title', 'Confirm the weekend handoff', 'category_id', :'cat_coparent',
  'duration_minutes', 10, 'duration_source', 'user', 'commitment', 'fixed', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'coparent-shared')) AS t_coparent \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-bill', 'title', 'Pay the water bill', 'category_id', :'cat_money',
  'duration_minutes', 10, 'duration_source', 'user', 'commitment', 'fixed', 'plan_kind', 'unplanned', 'due_date', DATE '2026-09-28', 'status', 'open', 'scope', 'household',
  'value_amount_minor', 8423, 'value_currency', 'USD', 'value_direction', 'outflow')) AS t_bill \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-paycheck', 'owner_profile_id', :'ua', 'title', 'Paycheck', 'category_id', :'cat_money',
  'duration_minutes', 0, 'duration_source', 'user', 'commitment', 'fixed', 'plan_kind', 'unplanned', 'due_date', DATE '2026-09-30', 'status', 'open', 'scope', 'personal',
  'value_amount_minor', 250000, 'value_currency', 'USD', 'value_direction', 'inflow')) AS t_paycheck \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-done', 'title', 'Renew the car registration', 'category_id', :'cat_home',
  'duration_minutes', 25, 'duration_source', 'user', 'commitment', 'fixed', 'plan_kind', 'unplanned', 'status', 'completed', 'completed_at', TIMESTAMPTZ '2026-09-20 10:00:00-05', 'scope', 'household')) AS t_done \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-task-archived', 'title', 'Old idea', 'category_id', :'cat_home',
  'duration_minutes', 15, 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'archived', 'scope', 'household')) AS t_archived \gset

-- Events (F03 Calendar, F05 Kids, F07 Co-parent).
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-event-household', 'title', 'Dentist', 'category_id', :'cat_home',
  'starts_at', TIMESTAMPTZ '2026-09-24 09:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-24 10:00:00-05', 'commitment', 'fixed', 'status', 'active', 'scope', 'household', 'travel_minutes_before', 15)) AS e_household \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-event-private', 'owner_profile_id', :'ua', 'title', 'Therapy', 'category_id', :'cat_wellbeing',
  'starts_at', TIMESTAMPTZ '2026-09-25 12:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-25 13:00:00-05', 'commitment', 'fixed', 'status', 'active', 'scope', 'personal')) AS e_private \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-event-child', 'title', 'Josie soccer', 'category_id', :'cat_kids', 'subject_member_id', :'child_a',
  'starts_at', TIMESTAMPTZ '2026-09-26 16:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-26 17:30:00-05', 'commitment', 'fixed', 'status', 'active', 'scope', 'child')) AS e_child \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-event-handoff', 'owner_profile_id', :'ua', 'title', 'Handoff at school', 'category_id', :'cat_coparent',
  'starts_at', TIMESTAMPTZ '2026-09-27 15:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-27 15:30:00-05', 'commitment', 'fixed', 'status', 'active', 'scope', 'coparent-shared')) AS e_handoff \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-event-removed', 'title', 'Cancelled lunch', 'category_id', :'cat_home',
  'starts_at', TIMESTAMPTZ '2026-09-23 12:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-23 13:00:00-05', 'commitment', 'flexible', 'status', 'removed', 'scope', 'household')) AS e_removed \gset

-- Systems and their steps (F04), a private System too.
SELECT herkeys_test.must('household_systems', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-system', 'name', 'Sunday reset', 'description', 'Laundry, groceries, the week ahead',
  'category_id', :'cat_home', 'scope', 'household', 'effort_minutes', 90)) AS s_household \gset
SELECT herkeys_test.must('household_systems', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-system-private', 'owner_profile_id', :'ua', 'name', 'Morning pages', 'description', 'Ten minutes',
  'category_id', :'cat_wellbeing', 'scope', 'personal')) AS s_private \gset
SELECT herkeys_test.must('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-step-1', 'system_id', :'s_household', 'position', 1, 'title', 'Start the laundry', 'effort_minutes', 5)) AS step_1 \gset
SELECT herkeys_test.must('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-step-2', 'system_id', :'s_household', 'position', 2, 'title', 'Order groceries', 'effort_minutes', 15)) AS step_2 \gset

-- People, a goal, handoffs (F05, F06, F07), a sequence and a goal link (F04), a schedule (F04, F06).
SELECT herkeys_test.must('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-person-june', 'display_name', 'Grandma June',
  'relationship', 'grandparent', 'channel', 'sms', 'status', 'active')) AS p_june \gset
SELECT herkeys_test.must('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-goal', 'title', 'A calmer house', 'status', 'active')) AS g_calm \gset
SELECT herkeys_test.must('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-resp-june', 'about_type', 'task', 'about_task_id', :'t_household',
  'responsible_kind', 'person', 'responsible_person_id', :'p_june', 'state', 'requested', 'requested_at', TIMESTAMPTZ '2026-09-21 08:00:00-05', 'still_needs_me', true)) AS r_june \gset
SELECT herkeys_test.must('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-resp-josie', 'about_type', 'task', 'about_task_id', :'t_child',
  'responsible_kind', 'child', 'responsible_child_id', :'child_a', 'state', 'requested', 'requested_at', TIMESTAMPTZ '2026-09-21 08:05:00-05', 'still_needs_me', true)) AS r_josie \gset
SELECT herkeys_test.must('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-dep-requires', 'relation', 'requires',
  'from_type', 'task', 'from_task_id', :'t_household', 'to_type', 'task', 'to_task_id', :'t_default', 'status', 'active')) AS d_requires \gset
SELECT herkeys_test.must('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-dep-goal', 'relation', 'part_of',
  'from_type', 'task', 'from_task_id', :'t_unrecorded', 'to_type', 'goal', 'to_goal_id', :'g_calm', 'status', 'active')) AS d_goal \gset
SELECT herkeys_test.must('recurrence_rules', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-rule-sunday', 'about_type', 'system', 'about_system_id', :'s_household',
  'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[0], 'anchor_date', DATE '2026-09-13', 'timezone', 'America/Chicago', 'status', 'active')) AS rule_sunday \gset

-- Meals (F08: a slot and a status already exist at WAVE3_BASE).
SELECT herkeys_test.must('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-meal-dinner', 'meal_date', DATE '2026-09-24', 'title', 'Tacos', 'category_id', :'cat_meals',
  'scope', 'household', 'meal_slot', 'dinner', 'status', 'active')) AS m_dinner \gset
SELECT herkeys_test.must('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-meal-private', 'owner_profile_id', :'ua', 'meal_date', DATE '2026-09-25', 'title', 'Lunch out', 'category_id', :'cat_meals',
  'scope', 'personal', 'meal_slot', 'lunch', 'status', 'archived')) AS m_private \gset

-- Needs Me, One Moves (F01), an observation, a pattern and its evidence, capacity (F01), Talk It Out (F02).
SELECT herkeys_test.must('needs_me_items', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-needs-me', 'title', 'Decide on the school trip', 'status', 'open',
  'due_date', DATE '2026-09-27', 'category_id', :'cat_kids')) AS n_trip \gset
-- Today's One Move, on the live path: the server stamps the logical day (HR-03), so a client names none.
SELECT herkeys_test.must('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-move-selected', 'target_type', 'task', 'target_task_id', :'t_household', 'status', 'selected', 'decided_at', now(), 'producer', 'system-derived')) AS om_selected \gset
SELECT herkeys_test.must('behavior_observations', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-obs-deferred', 'about_type', 'task', 'about_task_id', :'t_unrecorded',
  'outcome', 'deferred', 'occurred_at', TIMESTAMPTZ '2026-09-21 20:00:00-05', 'logical_date', DATE '2026-09-21')) AS o_deferred \gset
SELECT herkeys_test.must('patterns', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-pattern', 'kind', 'deferral', 'status', 'candidate',
  'first_observed_on', DATE '2026-09-08', 'last_observed_on', DATE '2026-09-21', 'producer', 'ai-inference', 'confidence', 'possible')) AS pat \gset
SELECT herkeys_test.must('evidence_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-evidence', 'for_type', 'pattern', 'for_pattern_id', :'pat',
  'support_type', 'observation', 'support_observation_id', :'o_deferred', 'code', 'repeated_deferral')) AS ev \gset
SELECT herkeys_test.must('capacity_profiles', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-capacity', 'day_end_minutes', 1260, 'transition_buffer_minutes', 15)) AS cap \gset
SELECT herkeys_test.must('source_artifacts', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-artifact', 'kind', 'email', 'origin', 'user-submitted',
  'received_at', TIMESTAMPTZ '2026-09-21 07:00:00-05')) AS art \gset
SELECT herkeys_test.must('interpretations', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-interpretation', 'artifact_id', :'art', 'source_artifact_id', :'art',
  'proposed_kind', 'task', 'title', 'Pay the field trip fee', 'state', 'pending', 'interpretation_version', 1, 'producer', 'ai-inference', 'confidence', 'possible')) AS interp \gset
COMMIT;

-- One Moves decided on EARLIER days. A client can only ever write today's (the server stamps the day, HR-03); past days reach the
-- cloud through the trusted claim path, which alone may state a logical day. Written here as the table owner, as that path does.
SELECT herkeys_test.must('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-move-completed', 'logical_day', DATE '2026-09-20',
  'target_type', 'task', 'target_task_id', :'t_done', 'status', 'completed', 'decided_at', TIMESTAMPTZ '2026-09-20 08:00:00-05', 'completed_at', TIMESTAMPTZ '2026-09-20 10:00:00-05', 'producer', 'system-derived')) AS om_completed \gset
SELECT herkeys_test.must('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'w3-move-withheld', 'logical_day', DATE '2026-09-21',
  'target_type', 'task', 'status', 'withheld', 'decided_at', TIMESTAMPTZ '2026-09-21 08:00:00-05', 'producer', 'system-derived')) AS om_withheld \gset

-- Daily-load decisions (F01) are ledger rows with their own shape (not through herkeys_test.ins): an approved move.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.action_records
  (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, before_state, after_state, origin_created_at)
VALUES (:'hh_a', 'w3-action-move', :'ua', DATE '2026-09-22', 'daily_load.move_task', 'approved', 'task', :'t_default',
        jsonb_build_object('code', 'transition_buffer_shortfall', 'windowBeforeEventId', :'e_household', 'windowAfterEventId', :'e_private',
                           'bufferMinutes', 5, 'requiredBufferMinutes', 20, 'projectedBufferMinutes', 25),
        '{"plan":{"kind":"unplanned"}}'::jsonb, '{"plan":{"kind":"day","date":"2026-09-24"}}'::jsonb, TIMESTAMPTZ '2026-09-22 08:10:00-05');
COMMIT;

-- Edits, so the population holds rows at revision > 1 with moved timestamps: an upgrade that reset a revision, a status or a stamp
-- would show. A renames and re-plans a household task, completes a child task, and resolves a Needs Me item.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.tasks SET title = 'Book the plumber (kitchen sink)', origin_updated_at = TIMESTAMPTZ '2026-09-22 09:00:00-05' WHERE id = :'t_household';
UPDATE public.tasks SET status = 'completed', completed_at = TIMESTAMPTZ '2026-09-22 19:00:00-05', origin_updated_at = TIMESTAMPTZ '2026-09-22 19:00:00-05' WHERE id = :'t_child';
UPDATE public.needs_me_items SET status = 'resolved' WHERE id = :'n_trip';
COMMIT;

-- ============ USER B (second adult of household A) =============================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-b-household', 'title', 'Fix the gate latch', 'category_id', :'cat_home',
  'duration_minutes', 20, 'duration_source', 'user', 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) AS tb_household \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-b-private', 'owner_profile_id', :'ub', 'title', 'B private errand', 'category_id', :'cat_wellbeing',
  'duration_minutes', 15, 'duration_source', 'default', 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal')) AS tb_private \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-b-event', 'owner_profile_id', :'ub', 'title', 'B private appointment', 'category_id', :'cat_wellbeing',
  'starts_at', TIMESTAMPTZ '2026-09-24 14:00:00-05', 'ends_at', TIMESTAMPTZ '2026-09-24 15:00:00-05', 'commitment', 'fixed', 'status', 'active', 'scope', 'personal')) AS eb_private \gset
SELECT herkeys_test.must('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'w3-b-goal', 'title', 'Run a 5k', 'status', 'active')) AS gb \gset
SELECT herkeys_test.must('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'w3-b-person', 'display_name', 'Coach Ray',
  'relationship', 'other', 'channel', 'sms', 'status', 'active')) AS pb \gset
-- B's own handoff of HER household task (the per-owner rule is about each owner's own rows).
SELECT herkeys_test.must('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'w3-b-resp', 'about_type', 'task', 'about_task_id', :'tb_household',
  'responsible_kind', 'person', 'responsible_person_id', :'pb', 'state', 'requested', 'requested_at', TIMESTAMPTZ '2026-09-21 09:00:00-05', 'still_needs_me', true)) AS rb \gset
SELECT herkeys_test.must('needs_me_items', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'w3-b-needs-me', 'title', 'B decision', 'status', 'open')) AS nb \gset
SELECT herkeys_test.must('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ub', 'local_id', 'w3-b-move', 'target_type', 'task', 'target_task_id', :'tb_private', 'status', 'selected', 'decided_at', now(), 'producer', 'system-derived')) AS omb \gset
SELECT herkeys_test.must('meal_plan_entries', jsonb_build_object('household_id', :'hh_a', 'local_id', 'w3-b-meal', 'meal_date', DATE '2026-09-26', 'title', 'Pizza night', 'category_id', :'cat_meals',
  'scope', 'household', 'meal_slot', 'dinner', 'status', 'active')) AS mb \gset
COMMIT;

-- ============ USER C (an unrelated household) ==================================================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_c', 'local_id', 'w3-c-household', 'title', 'C household chore', 'category_id', :'cat_c_home',
  'duration_minutes', 30, 'duration_source', 'user', 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) AS tc_household \gset
SELECT herkeys_test.must('tasks', jsonb_build_object('household_id', :'hh_c', 'local_id', 'w3-c-private', 'owner_profile_id', :'uc', 'title', 'C private task', 'category_id', :'cat_c_home',
  'duration_minutes', 15, 'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'personal')) AS tc_private \gset
SELECT herkeys_test.must('events', jsonb_build_object('household_id', :'hh_c', 'local_id', 'w3-c-event', 'title', 'C event', 'category_id', :'cat_c_home',
  'starts_at', TIMESTAMPTZ '2026-09-24 09:00:00+01', 'ends_at', TIMESTAMPTZ '2026-09-24 10:00:00+01', 'commitment', 'fixed', 'status', 'active', 'scope', 'household')) AS ec \gset
SELECT herkeys_test.must('meal_plan_entries', jsonb_build_object('household_id', :'hh_c', 'local_id', 'w3-c-meal', 'meal_date', DATE '2026-09-24', 'title', 'C supper', 'category_id', :'cat_c_meals',
  'scope', 'household', 'meal_slot', 'dinner', 'status', 'active')) AS mc \gset
SELECT herkeys_test.must('responsibilities', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'w3-c-resp', 'about_type', 'task', 'about_task_id', :'tc_household',
  'responsible_kind', 'self', 'state', 'owned', 'still_needs_me', true)) AS rc \gset
COMMIT;
