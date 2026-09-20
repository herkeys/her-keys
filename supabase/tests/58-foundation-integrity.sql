-- THE FOUNDATION'S INTEGRITY RULES (B4-FE01-001..031) — enforced where the data lives, and tested by asserting the REASON
-- a bad row is refused, so a statement that fails for the wrong reason cannot pass as a test of the right one.
--
-- Runs as the table owner inside one transaction that is rolled back, so it leaves nothing behind. RLS and
-- privileges have their own suite (57); this one is about what the database refuses on principle.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
BEGIN;

SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset
SELECT id AS cat_c FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-kids' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset
SELECT id AS adult_b FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'user-2' \gset

CREATE FUNCTION pg_temp.exp(p_label text, p_err text, p_want text) RETURNS text LANGUAGE sql AS $f$
  SELECT CASE WHEN (p_want IS NULL AND p_err IS NULL) OR (p_want IS NOT NULL AND p_err LIKE p_want) THEN 'PASS' ELSE 'FAIL' END
         || ' | ' || p_label || CASE WHEN (p_want IS NULL AND p_err IS NULL) OR (p_want IS NOT NULL AND p_err LIKE p_want) THEN '' ELSE '   [got: ' || COALESCE(left(p_err, 160), 'accepted') || ']' END;
$f$;

-- ---- fixtures ---------------------------------------------------------------------------------------------------------
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer) VALUES
  (:'hh_a', 'i-t1', 'Sign the form', :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
  (:'hh_a', 'i-t2', 'Pay the fee',   :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
  (:'hh_a', 'i-t3', 'Book the bus',  :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
  (:'hh_c', 'i-tc', 'Not hers',      :'cat_c',    10, 'flexible', 'unplanned', 'open', 'household', 'user-action');
INSERT INTO public.household_systems (household_id, local_id, name, description, category_id, scope, producer)
VALUES (:'hh_a', 'i-s1', 'Sunday reset', '', :'cat_kids', 'household', 'user-action');
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, birth_date, scope)
VALUES (:'hh_c', 'child-c', NULL, 'child', 'member', 'Otherhouse child', DATE '2015-05-05', 'child');
SELECT id AS t1 FROM public.tasks WHERE local_id = 'i-t1' \gset
SELECT id AS t2 FROM public.tasks WHERE local_id = 'i-t2' \gset
SELECT id AS t3 FROM public.tasks WHERE local_id = 'i-t3' \gset
SELECT id AS tc FROM public.tasks WHERE local_id = 'i-tc' \gset
SELECT id AS s1 FROM public.household_systems WHERE local_id = 'i-s1' \gset
SELECT id AS child_c FROM public.household_members WHERE local_id = 'child-c' \gset

SELECT herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-p1', 'display_name', 'Grandma June', 'relationship', 'grandparent', 'channel', 'sms', 'status', 'active'));
SELECT herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-p2', 'display_name', 'Neighbour Sam', 'relationship', 'neighbor', 'channel', 'unspecified', 'status', 'active'));
SELECT herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-g1', 'title', 'Clear the garage', 'status', 'active'));
SELECT id AS p1 FROM public.household_people WHERE local_id = 'i-p1' \gset
SELECT id AS p2 FROM public.household_people WHERE local_id = 'i-p2' \gset
SELECT id AS g1 FROM public.goals WHERE local_id = 'i-g1' \gset

-- ============ 1. TYPED REFERENCES: every relation is a real foreign key that proves same household ============================
\echo
CREATE FUNCTION pg_temp.resp(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('responsibilities', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid,
    'local_id', p_local, 'responsible_kind', 'person', 'responsible_person_id', current_setting('t.p1')::uuid, 'state', 'requested', 'requested_at', now(), 'still_needs_me', true) || p_extra);
$f$;
SELECT set_config('t.hh', :'hh_a', false), set_config('t.ua', :'ua', false), set_config('t.p1', :'p1', false);

SELECT pg_temp.exp('typed ref: a responsibility about a task of the same household is accepted', pg_temp.resp('r-ok', jsonb_build_object('about_type', 'task', 'about_task_id', :'t1'::uuid)), NULL);
SELECT pg_temp.exp('typed ref: naming the wrong column for its type is refused (type says task, column says event)', pg_temp.resp('r-mix', jsonb_build_object('about_type', 'task', 'about_event_id', :'t1'::uuid)), '23514%about_ref_check%');
SELECT pg_temp.exp('typed ref: naming TWO kinds at once is refused', pg_temp.resp('r-two', jsonb_build_object('about_type', 'task', 'about_task_id', :'t2'::uuid, 'about_event_id', :'t2'::uuid)), '23514%about_ref_check%');
SELECT pg_temp.exp('typed ref: a kind outside the allowed set is refused', pg_temp.resp('r-kind', jsonb_build_object('about_type', 'widget', 'about_task_id', :'t2'::uuid)), '23514%about_ref_check%');
SELECT pg_temp.exp('typed ref: a required reference cannot be omitted', pg_temp.resp('r-none', '{}'::jsonb), '23502%');
SELECT pg_temp.exp('typed ref: a row from ANOTHER household cannot be referenced', pg_temp.resp('r-x', jsonb_build_object('about_type', 'task', 'about_task_id', :'tc'::uuid)), '23503%');
SELECT pg_temp.exp('typed ref: a reference to nothing at all is refused', pg_temp.resp('r-ghost', jsonb_build_object('about_type', 'task', 'about_task_id', gen_random_uuid())), '23503%');
-- One Move: its targets used to be plain single-column keys, so a row could name a uuid from ANYWHERE (PW-001). They are composite now.
SELECT pg_temp.exp('one move: a task of the same household is accepted as its target', herkeys_test.ins('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-om-1', 'logical_day', DATE '2026-09-01', 'timezone_at_decision', 'America/Chicago', 'target_type', 'task', 'target_task_id', :'t1'::uuid, 'status', 'selected', 'decided_at', now(), 'producer', 'system-derived')), NULL);
SELECT pg_temp.exp('one move: a task from ANOTHER household cannot be its target', herkeys_test.ins('one_move_records', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-om-2', 'logical_day', DATE '2026-09-02', 'timezone_at_decision', 'America/Chicago', 'target_type', 'task', 'target_task_id', :'tc'::uuid, 'status', 'selected', 'decided_at', now(), 'producer', 'system-derived')), '23503%');

-- ============ 2. EXACT MONEY ====================================================================================================
SELECT pg_temp.exp('money: 3500 minor units, USD, outflow is accepted', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 3500, value_currency = ''USD'', value_direction = ''outflow'' WHERE local_id = ''i-t1'''), NULL);
SELECT pg_temp.exp('money: a negative amount is refused (direction says which way; a sign is one typo from the opposite)', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = -1, value_currency = ''USD'', value_direction = ''outflow'' WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: an amount with no currency is refused', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 5, value_currency = NULL, value_direction = ''outflow'' WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: an amount with no direction is refused', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 5, value_currency = ''USD'', value_direction = NULL WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: a lower-case or malformed currency is refused', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 5, value_currency = ''usd'', value_direction = ''outflow'' WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: an unknown direction is refused', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 5, value_currency = ''USD'', value_direction = ''sideways'' WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: an amount beyond the exactly-representable range is refused', herkeys_test.error_of('UPDATE public.tasks SET value_amount_minor = 9007199254740992, value_currency = ''USD'', value_direction = ''outflow'' WHERE local_id = ''i-t2'''), '23514%value_money_check%');
SELECT pg_temp.exp('money: a FRACTION never reaches the column — 35.5 is refused as input, not silently rounded',
  herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-frac', 'category', 'financial_action', 'consequence', 'critical', 'reversibility', 'irreversible',
    'summary_code', 'pay', 'permitted_mode', 'suggest', 'producer', 'ai-inference', 'confidence', 'possible', 'amount_amount_minor', 35.5, 'amount_currency', 'USD', 'amount_direction', 'outflow')), '22P02%');
SELECT pg_temp.exp('money: a financial intent must state its amount', herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-nomoney', 'category', 'financial_action', 'consequence', 'critical', 'reversibility', 'irreversible',
    'summary_code', 'pay', 'permitted_mode', 'suggest', 'producer', 'ai-inference', 'confidence', 'possible')), '23514%financial_amount_check%');

-- ============ 3. A CHILD IS PROVEN A CHILD ======================================================================================
SELECT pg_temp.exp('child: a responsibility held by a real child of the same household is accepted', herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'r-child',
   'about_type', 'task', 'about_task_id', :'t3'::uuid, 'responsible_kind', 'child', 'responsible_child_id', :'child_a'::uuid, 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)), NULL);
SELECT pg_temp.exp('child: the type is DERIVED by the server, so the client cannot assert it', (SELECT CASE WHEN responsible_child_type = 'child' THEN NULL ELSE 'wrong' END FROM public.responsibilities WHERE local_id = 'r-child'), NULL);
SELECT pg_temp.exp('child: an ADULT member cannot be named as a child', herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'r-adult',
   'about_type', 'task', 'about_task_id', :'t2'::uuid, 'responsible_kind', 'child', 'responsible_child_id', :'adult_b'::uuid, 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)), '23503%');
SELECT pg_temp.exp('child: a child of ANOTHER household cannot be named', herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'r-otherchild',
   'about_type', 'task', 'about_task_id', :'t2'::uuid, 'responsible_kind', 'child', 'responsible_child_id', :'child_c'::uuid, 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)), '23503%');
SELECT pg_temp.exp('child: the holder must be exactly what its kind says (a person-kind row cannot also name a child)', herkeys_test.ins('responsibilities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'r-both',
   'about_type', 'task', 'about_task_id', :'t2'::uuid, 'responsible_kind', 'person', 'responsible_person_id', :'p1'::uuid, 'responsible_child_id', :'child_a'::uuid, 'state', 'requested', 'requested_at', now(), 'still_needs_me', true)), '23514%holder_check%');

-- ============ 4. ONE LIVE OWNER PER THING, AND A HANDOFF'S LIFECYCLE ============================================================
SELECT pg_temp.exp('owner: a second LIVE handoff of the same task is refused', pg_temp.resp('r-second', jsonb_build_object('about_type', 'task', 'about_task_id', :'t1'::uuid, 'responsible_person_id', :'p2'::uuid)), '23505%one_live_owner_uq%');
SELECT pg_temp.exp('owner: a different task has its own owner', pg_temp.resp('r-other', jsonb_build_object('about_type', 'task', 'about_task_id', :'t2'::uuid, 'responsible_person_id', :'p2'::uuid)), NULL);
SELECT pg_temp.exp('owner: once completed, the task can be handed off again', herkeys_test.error_of('UPDATE public.responsibilities SET state = ''completed'', completed_at = now() WHERE local_id = ''r-ok'''), NULL);
SELECT pg_temp.exp('owner: ...and a new live handoff of it is now accepted', pg_temp.resp('r-again', jsonb_build_object('about_type', 'task', 'about_task_id', :'t1'::uuid, 'responsible_person_id', :'p2'::uuid)), NULL);
SELECT pg_temp.exp('lifecycle: "requested" must say when it was requested', pg_temp.resp('r-lc1', jsonb_build_object('about_type', 'task', 'about_task_id', :'t3'::uuid, 'requested_at', NULL)), '23514%lifecycle_check%');
SELECT pg_temp.exp('lifecycle: "returned" is a handoff coming back to HER, so it must be a return to self', pg_temp.resp('r-lc2', jsonb_build_object('about_type', 'task', 'about_task_id', :'t3'::uuid, 'state', 'returned', 'returned_at', now())), '23514%lifecycle_check%');
SELECT pg_temp.exp('lifecycle: completed_at exists exactly when completed', pg_temp.resp('r-lc3', jsonb_build_object('about_type', 'task', 'about_task_id', :'t3'::uuid, 'completed_at', now())), '23514%completed_only_check%');

-- ============ 5. DEPENDENCIES: one convention, and a cycle is never stored ======================================================
CREATE FUNCTION pg_temp.dep(p_local text, p_rel text, p_from uuid, p_to uuid, p_status text DEFAULT 'active') RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('dependencies', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'relation', p_rel, 'from_type', 'task', 'from_task_id', p_from, 'to_type', 'task', 'to_task_id', p_to, 'status', p_status));
$f$;
SELECT pg_temp.exp('dependency: t1 requires t2 is accepted', pg_temp.dep('d1', 'requires', :'t1'::uuid, :'t2'::uuid), NULL);
SELECT pg_temp.exp('dependency: t2 requires t1 would close a loop, and is REFUSED', pg_temp.dep('d2', 'requires', :'t2'::uuid, :'t1'::uuid), '23514%cycle%');
SELECT pg_temp.exp('dependency: a thing cannot require itself', pg_temp.dep('d3', 'requires', :'t1'::uuid, :'t1'::uuid), '23514%not_self_check%');
SELECT pg_temp.exp('dependency: part_of edges take part in ordering too: t2 part_of t3', pg_temp.dep('d4', 'part_of', :'t2'::uuid, :'t3'::uuid), NULL);
SELECT pg_temp.exp('dependency: ...so t3 requires t1 closes a THREE-step loop and is refused', pg_temp.dep('d5', 'requires', :'t3'::uuid, :'t1'::uuid), '23514%cycle%');
SELECT pg_temp.exp('dependency: alternatives are not an ordering — both directions are allowed', pg_temp.dep('d6', 'alternative_to', :'t1'::uuid, :'t3'::uuid), NULL);
SELECT pg_temp.exp('dependency: ...and the reverse alternative too', pg_temp.dep('d7', 'alternative_to', :'t3'::uuid, :'t1'::uuid), NULL);
SELECT pg_temp.exp('dependency: a REMOVED edge does not count towards a cycle', pg_temp.dep('d8', 'requires', :'t3'::uuid, :'t1'::uuid, 'removed'), NULL);
SELECT pg_temp.exp('dependency: the same live edge twice is refused', pg_temp.dep('d9', 'requires', :'t1'::uuid, :'t2'::uuid), '23505%live_edge_uq%');
SELECT pg_temp.exp('dependency: an unknown relation is refused', pg_temp.dep('d10', 'blocks', :'t1'::uuid, :'t3'::uuid), '23514%relation_check%');
SELECT pg_temp.exp('dependency: an edge into ANOTHER household is refused', pg_temp.dep('d11', 'requires', :'t1'::uuid, :'tc'::uuid), '23503%');
SELECT pg_temp.exp('dependency: a cross-domain edge (task requires goal) is the same convention', herkeys_test.ins('dependencies', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'd12',
   'relation', 'part_of', 'from_type', 'task', 'from_task_id', :'t3'::uuid, 'to_type', 'goal', 'to_goal_id', :'g1'::uuid, 'status', 'active')), NULL);

-- ============ 6. INTENTS, DECISIONS: one answer, a withdrawal needs an approval ================================================
SELECT herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-1', 'category', 'internal_reminder', 'consequence', 'low', 'reversibility', 'reversible',
   'summary_code', 'nudge', 'permitted_mode', 'suggest', 'about_type', 'task', 'about_task_id', :'t1'::uuid, 'producer', 'ai-inference', 'confidence', 'possible'));
SELECT herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-2', 'category', 'internal_reminder', 'consequence', 'low', 'reversibility', 'reversible',
   'summary_code', 'nudge', 'permitted_mode', 'suggest', 'producer', 'ai-inference', 'confidence', 'possible'));
SELECT id AS int1 FROM public.action_intents WHERE local_id = 'i-1' \gset
SELECT id AS int2 FROM public.action_intents WHERE local_id = 'i-2' \gset

CREATE FUNCTION pg_temp.dec(p_local text, p_intent uuid, p_decision text) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'intent_id', p_intent, 'decision', p_decision, 'basis', 'explicit', 'decided_at', now()));
$f$;
SELECT pg_temp.exp('intent: an intent proposed by a USER-ACTION producer is refused: an intent is Her Keys'' proposal, never something she stated',
  herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'i-forged', 'category', 'internal_reminder', 'consequence', 'low', 'reversibility', 'reversible', 'summary_code', 'x', 'permitted_mode', 'suggest', 'producer', 'user-action')), '23514%proposed_by_her_keys_check%');
SELECT pg_temp.exp('decision: she approves', pg_temp.dec('dc-1', :'int1'::uuid, 'approved'), NULL);
SELECT pg_temp.exp('decision: a SECOND approval of the same intent is refused (two devices answering collide)', pg_temp.dec('dc-2', :'int1'::uuid, 'approved'), '23505%one_answer_uq%');
SELECT pg_temp.exp('decision: and so is a contradicting decline', pg_temp.dec('dc-3', :'int1'::uuid, 'declined'), '23505%one_answer_uq%');
SELECT pg_temp.exp('decision: she may withdraw the approval — as NEW evidence', pg_temp.dec('dc-4', :'int1'::uuid, 'withdrawn'), NULL);
SELECT pg_temp.exp('decision: ...but only once', pg_temp.dec('dc-5', :'int1'::uuid, 'withdrawn'), '23505%one_withdrawal_uq%');
SELECT pg_temp.exp('decision: a withdrawal with nothing to withdraw is refused', pg_temp.dec('dc-6', :'int2'::uuid, 'withdrawn'), '23514%withdraws an approval%');
SELECT pg_temp.exp('decision: a decision on another household''s intent cannot be written (same-owner key)', herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', :'hh_c', 'profile_id', :'uc', 'local_id', 'dc-x', 'intent_id', :'int2'::uuid, 'decision', 'approved', 'basis', 'explicit', 'decided_at', now())), '23503%');
SELECT pg_temp.exp('decision: relying on a standing authority names it', herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'dc-7', 'intent_id', :'int2'::uuid, 'decision', 'approved', 'basis', 'standing_authority', 'producer', 'automation', 'decided_at', now())), '23514%standing_check%');
SELECT pg_temp.exp('decision: ...and it cannot be a decline made under a standing authority', herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'dc-8', 'intent_id', :'int2'::uuid, 'decision', 'declined', 'basis', 'standing_authority', 'producer', 'automation', 'decided_at', now())), '23514%standing_check%');
SELECT pg_temp.exp('decision: an explicit decision is hers, so an automation producer is refused', herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'dc-9', 'intent_id', :'int2'::uuid, 'decision', 'approved', 'basis', 'explicit', 'producer', 'automation', 'decided_at', now())), '23514%standing_check%');

-- ============ 7. AUTHORITY: only she grants it, a financial one is bounded, and it is only ever REVOKED ========================
CREATE FUNCTION pg_temp.auth(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('automation_authorities', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'category', 'internal_reminder', 'mode', 'execute_authorized', 'max_consequence', 'low', 'persistent', true, 'granted_at', now() - interval '1 day') || p_extra);
$f$;
SELECT pg_temp.exp('authority: she grants a standing permission', pg_temp.auth('au-1', '{}'::jsonb), NULL);
SELECT pg_temp.exp('authority: a permission an INFERENCE wrote for itself is not a permission', pg_temp.auth('au-2', jsonb_build_object('producer', 'ai-inference', 'confidence', 'possible')), '23514%granted_by_user_check%');
SELECT pg_temp.exp('authority: nor one automation wrote', pg_temp.auth('au-3', jsonb_build_object('producer', 'automation')), '23514%granted_by_user_check%');
SELECT pg_temp.exp('authority: unattended action on money must state how much', pg_temp.auth('au-4', jsonb_build_object('category', 'financial_action', 'max_consequence', 'critical')), '23514%financial_limit_check%');
SELECT pg_temp.exp('authority: ...and with a limit it is accepted', pg_temp.auth('au-5', jsonb_build_object('category', 'financial_action', 'max_consequence', 'critical', 'max_amount_minor', 5000, 'max_amount_currency', 'USD')), NULL);
SELECT pg_temp.exp('authority: a limit names its currency', pg_temp.auth('au-6', jsonb_build_object('max_amount_minor', 5000)), '23514%amount_pair_check%');
SELECT pg_temp.exp('authority: it expires AFTER it is granted', pg_temp.auth('au-7', jsonb_build_object('expires_at', now() - interval '2 days')), '23514%expiry_check%');
SELECT pg_temp.exp('authority: the category vocabulary is closed', pg_temp.auth('au-8', jsonb_build_object('category', 'do_anything')), '23514%category_check%');
SELECT pg_temp.exp('authority: revoking is the one edit it takes', herkeys_test.error_of('UPDATE public.automation_authorities SET revoked_at = now() WHERE local_id = ''au-1'''), NULL);
SELECT pg_temp.exp('authority: a revocation is set once — it cannot be moved', herkeys_test.error_of('UPDATE public.automation_authorities SET revoked_at = now() + interval ''1 hour'' WHERE local_id = ''au-1'''), '23514%set once%');
SELECT pg_temp.exp('authority: ...nor undone', herkeys_test.error_of('UPDATE public.automation_authorities SET revoked_at = NULL WHERE local_id = ''au-1'''), '23514%set once%');
SELECT pg_temp.exp('authority: nothing else about it is editable, even by the table owner', herkeys_test.error_of('UPDATE public.automation_authorities SET mode = ''suggest'' WHERE local_id = ''au-5'''), '23514%only revoked_at may change%');

-- ============ 8. SOURCE ARTIFACTS: digest, provenance of arrival, retraction ====================================================
CREATE FUNCTION pg_temp.art(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('source_artifacts', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'kind', 'email', 'origin', 'user-submitted', 'received_at', now()) || p_extra);
$f$;
SELECT pg_temp.exp('artifact: an email she forwarded is accepted', pg_temp.art('ar-1', jsonb_build_object('content_digest', repeat('a', 64), 'content_ref', 'blob:one')), NULL);
SELECT pg_temp.exp('artifact: the SAME document twice is refused by digest (dedupe)', pg_temp.art('ar-2', jsonb_build_object('content_digest', repeat('a', 64))), '23505%digest_uq%');
SELECT pg_temp.exp('artifact: a digest must be SHA-256 hex', pg_temp.art('ar-3', jsonb_build_object('content_digest', 'not-a-digest')), '23514%digest_check%');
SELECT pg_temp.exp('artifact: a voice artifact is a voice utterance', pg_temp.art('ar-4', jsonb_build_object('origin', 'voice')), '23514%voice_pairing_check%');
SELECT pg_temp.exp('artifact: a connector-delivered artifact names its provider', pg_temp.art('ar-5', jsonb_build_object('origin', 'connector')), '23514%connector_provider_check%');
SELECT pg_temp.exp('artifact: content is an opaque reference, never her words (no spaces, no free text)', pg_temp.art('ar-6', jsonb_build_object('content_ref', 'Dear parents, please sign the form')), '23514%content_ref_check%');
SELECT pg_temp.exp('artifact: the kind vocabulary is closed', pg_temp.art('ar-7', jsonb_build_object('kind', 'secret-file')), '23514%kind_check%');
SELECT pg_temp.exp('artifact: it can be retracted', herkeys_test.error_of('UPDATE public.source_artifacts SET retracted_at = now() WHERE local_id = ''ar-1'''), NULL);
SELECT pg_temp.exp('artifact: once, and never edited afterwards', herkeys_test.error_of('UPDATE public.source_artifacts SET retracted_at = now() + interval ''1 hour'' WHERE local_id = ''ar-1'''), '23514%set once%');
SELECT pg_temp.exp('artifact: no other column changes, even for the table owner', herkeys_test.error_of('UPDATE public.source_artifacts SET kind = ''bill'' WHERE local_id = ''ar-1'''), '23514%only retracted_at may change%');
SELECT id AS ar1 FROM public.source_artifacts WHERE local_id = 'ar-1' \gset

-- ============ 9. INTERPRETATIONS: structured candidates, decided once ==========================================================
CREATE FUNCTION pg_temp.interp(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('interpretations', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'artifact_id', current_setting('t.ar1')::uuid, 'source_artifact_id', current_setting('t.ar1')::uuid, 'proposed_kind', 'task', 'title', 'Pay the fee', 'state', 'pending',
    'interpretation_version', 1, 'producer', 'ai-inference', 'confidence', 'possible') || p_extra);
$f$;
SELECT set_config('t.ar1', :'ar1', false);
SELECT pg_temp.exp('interpretation: a pending reading of the email is accepted', pg_temp.interp('in-1', '{}'::jsonb), NULL);
SELECT pg_temp.exp('interpretation: a reading is an INFERENCE (or an external observation), never her own statement', pg_temp.interp('in-2', jsonb_build_object('producer', 'user-action', 'confidence', NULL)), '23514%producer_check%');
SELECT pg_temp.exp('interpretation: it names the artifact it was read from as its provenance too', pg_temp.interp('in-3', jsonb_build_object('source_artifact_id', NULL)), '23514%artifact_provenance_check%');
SELECT pg_temp.exp('interpretation: an event reading has a start and an end', pg_temp.interp('in-4', jsonb_build_object('proposed_kind', 'event')), '23514%event_times_check%');
SELECT pg_temp.exp('interpretation: a task reading has no start or end', pg_temp.interp('in-5', jsonb_build_object('starts_at', now(), 'ends_at', now() + interval '1 hour')), '23514%event_times_check%');
SELECT pg_temp.exp('interpretation: it cannot be accepted without naming what it became', pg_temp.interp('in-6', jsonb_build_object('state', 'accepted', 'decided_at', now())), '23514%accepted_check%');
SELECT pg_temp.exp('interpretation: a clarification exists exactly while the question is open', pg_temp.interp('in-7', jsonb_build_object('clarification', 'which_day')), '23514%clarification_check%');
SELECT pg_temp.exp('interpretation: a decided reading records when', pg_temp.interp('in-8', jsonb_build_object('state', 'rejected')), '23514%decided_check%');
SELECT pg_temp.exp('interpretation: accepting it links the row it became', herkeys_test.error_of(format('UPDATE public.interpretations SET state = ''accepted'', accepted_type = ''task'', accepted_task_id = %L, decided_at = now(), confidence = ''established'' WHERE local_id = ''in-1''', :'t1')), NULL);
SELECT pg_temp.exp('interpretation: an ACCEPTED reading is history and is never edited (even by the table owner)', herkeys_test.error_of('UPDATE public.interpretations SET title = ''changed'' WHERE local_id = ''in-1'''), '23514%is history%');

-- ============ 10. PATTERNS: inferences that only she can establish =============================================================
CREATE FUNCTION pg_temp.pat(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('patterns', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'kind', 'deferral', 'status', 'candidate', 'first_observed_on', DATE '2026-09-08', 'last_observed_on', DATE '2026-09-22', 'producer', 'ai-inference', 'confidence', 'possible') || p_extra);
$f$;
SELECT pg_temp.exp('pattern: a candidate at "possible" is accepted', pg_temp.pat('pa-1', '{}'::jsonb), NULL);
SELECT pg_temp.exp('pattern: a pattern is an inference, always', pg_temp.pat('pa-2', jsonb_build_object('producer', 'user-action', 'confidence', NULL)), '23514%inference_check%');
SELECT pg_temp.exp('pattern: "confirmed" means she established it', pg_temp.pat('pa-3', jsonb_build_object('status', 'confirmed')), '23514%confirmed_check%');
SELECT pg_temp.exp('pattern: evidence alone never establishes one', pg_temp.pat('pa-4', jsonb_build_object('confidence', 'established')), '23514%established_check%');
SELECT pg_temp.exp('pattern: confirmed AND established together is accepted', pg_temp.pat('pa-5', jsonb_build_object('status', 'confirmed', 'confidence', 'established')), NULL);
SELECT pg_temp.exp('pattern: it cannot be last seen before it is first seen', pg_temp.pat('pa-6', jsonb_build_object('last_observed_on', DATE '2026-09-01')), '23514%observed_order_check%');
SELECT pg_temp.exp('pattern: a weekday is 0..6', pg_temp.pat('pa-7', jsonb_build_object('weekday', 7)), '23514%weekday_check%');

-- ============ 11. RECURRENCE: one convention ====================================================================================
CREATE FUNCTION pg_temp.rec(p_local text, p_subject uuid, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('recurrence_rules', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'about_type', 'system', 'about_system_id', p_subject, 'trigger_kind', 'schedule', 'frequency', 'weekly', 'interval_count', 1, 'by_weekday', ARRAY[0], 'anchor_date', DATE '2026-09-13',
    'timezone', 'America/Chicago', 'status', 'active') || p_extra);
$f$;
SELECT pg_temp.exp('recurrence: a weekly rule on Sundays is accepted', pg_temp.rec('rc-1', :'s1'::uuid, '{}'::jsonb), NULL);
SELECT pg_temp.exp('recurrence: a second ACTIVE rule for the same thing is refused', pg_temp.rec('rc-2', :'s1'::uuid, jsonb_build_object('frequency', 'daily', 'by_weekday', NULL)), '23505%one_active_rule_uq%');
SELECT pg_temp.exp('recurrence: a manual rule has no frequency', pg_temp.rec('rc-3', :'s1'::uuid, jsonb_build_object('status', 'paused', 'trigger_kind', 'manual')), '23514%manual_check%');
SELECT pg_temp.exp('recurrence: a rule cannot end by date AND by count', pg_temp.rec('rc-4', :'s1'::uuid, jsonb_build_object('status', 'paused', 'ends_on', DATE '2026-12-31', 'occurrence_count', 3)), '23514%end_check%');
SELECT pg_temp.exp('recurrence: weekdays belong to a weekly rule', pg_temp.rec('rc-5', :'s1'::uuid, jsonb_build_object('status', 'paused', 'frequency', 'daily')), '23514%weekday_check%');
SELECT pg_temp.exp('recurrence: a MANUAL rule cannot carry weekdays (a CHECK that evaluates to NULL PASSES, so the rule is stated with COALESCE)', pg_temp.rec('rc-7', :'s1'::uuid, jsonb_build_object('status', 'paused', 'trigger_kind', 'manual', 'frequency', NULL)), '23514%weekday_check%');
SELECT pg_temp.exp('recurrence: an interval of zero is refused', pg_temp.rec('rc-6', :'s1'::uuid, jsonb_build_object('status', 'paused', 'interval_count', 0)), '23514%interval_check%');

-- ============ 12. OBSERVATIONS: a closed vocabulary that means something for each kind =======================================
CREATE FUNCTION pg_temp.obs(p_local text, p_type text, p_ref_col text, p_ref uuid, p_outcome text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('behavior_observations', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'about_type', p_type, p_ref_col, p_ref, 'outcome', p_outcome, 'occurred_at', now(), 'logical_date', CURRENT_DATE) || p_extra);
$f$;
SELECT pg_temp.exp('observation: a task was completed', pg_temp.obs('ob-1', 'task', 'about_task_id', :'t1'::uuid, 'completed'), NULL);
SELECT pg_temp.exp('observation: "completed" means nothing for an EVENT, and is refused', pg_temp.obs('ob-2', 'event', 'about_event_id', gen_random_uuid(), 'completed'), '23514%outcome_validity_check%');
SELECT pg_temp.exp('observation: a One Move can be "selected" but a task cannot', pg_temp.obs('ob-3', 'task', 'about_task_id', :'t1'::uuid, 'selected'), '23514%outcome_validity_check%');
SELECT pg_temp.exp('observation: an outcome outside the vocabulary is refused', pg_temp.obs('ob-4', 'task', 'about_task_id', :'t1'::uuid, 'vanished'), '23514%outcome_check%');
SELECT pg_temp.exp('observation: a destination date belongs to a deferral', pg_temp.obs('ob-5', 'task', 'about_task_id', :'t1'::uuid, 'completed', jsonb_build_object('to_date', CURRENT_DATE)), '23514%to_date_check%');
SELECT pg_temp.exp('observation: a deferral carries where it went', pg_temp.obs('ob-6', 'task', 'about_task_id', :'t1'::uuid, 'deferred', jsonb_build_object('to_date', CURRENT_DATE + 1)), NULL);
SELECT pg_temp.exp('observation: about a row that is not there is refused', pg_temp.obs('ob-7', 'task', 'about_task_id', gen_random_uuid(), 'completed'), '23503%');

-- ============ 13. EXTERNAL REFERENCES: identity, and who wrote it ================================================================
CREATE FUNCTION pg_temp.xref(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('external_references', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local,
    'provider', 'gmail', 'external_account', 'acct-1', 'external_object_id', 'msg-1', 'origin', 'external', 'direction', 'inbound', 'authority', 'external', 'status', 'active',
    'producer', 'import-sync', 'confidence', 'likely') || p_extra);
$f$;
SELECT pg_temp.exp('external: an observed object is accepted', pg_temp.xref('x-1', '{}'::jsonb), NULL);
SELECT pg_temp.exp('external: the same object by identity twice is refused (the identity is the key)', pg_temp.xref('x-2', '{}'::jsonb), '23505%identity_key%');
SELECT pg_temp.exp('external: a different object is fine', pg_temp.xref('x-3', jsonb_build_object('external_object_id', 'msg-2')), NULL);
SELECT pg_temp.exp('external: an object Her Keys wrote records WHEN — the loop-prevention fact', pg_temp.xref('x-4', jsonb_build_object('external_object_id', 'msg-3', 'origin', 'her-keys', 'producer', 'automation', 'confidence', NULL, 'linked_type', 'task', 'linked_task_id', :'t1'::uuid)), '23514%her_keys_written_check%');
SELECT pg_temp.exp('external: ...and with the time it is accepted', pg_temp.xref('x-5', jsonb_build_object('external_object_id', 'msg-3', 'origin', 'her-keys', 'producer', 'automation', 'confidence', NULL, 'written_at', now(), 'linked_type', 'task', 'linked_task_id', :'t1'::uuid)), NULL);
SELECT pg_temp.exp('external: an object somebody ELSE made was not written by Her Keys', pg_temp.xref('x-6', jsonb_build_object('external_object_id', 'msg-4', 'written_at', now())), '23514%external_not_written_check%');
SELECT pg_temp.exp('external: identity metadata is a digest, never content', pg_temp.xref('x-7', jsonb_build_object('external_object_id', 'msg-5', 'last_observed_digest', 'the whole email body')), '23514%digest_check%');
SELECT pg_temp.exp('external: a provider is an open, format-checked token', pg_temp.xref('x-8', jsonb_build_object('external_object_id', 'msg-6', 'provider', 'Gmail API!')), '23514%provider_check%');

-- ============ 14. CAPACITY, STEPS, GOALS, PEOPLE, EVIDENCE LINKS ===============================================================
CREATE FUNCTION pg_temp.cap(p_local text, p_extra jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT herkeys_test.ins('capacity_profiles', jsonb_build_object('household_id', current_setting('t.hh')::uuid, 'profile_id', current_setting('t.ua')::uuid, 'local_id', p_local) || p_extra);
$f$;
SELECT pg_temp.exp('capacity: her day window is accepted', pg_temp.cap('capacity', jsonb_build_object('day_end_minutes', 1200, 'transition_buffer_minutes', 15)), NULL);
SELECT pg_temp.exp('capacity: one profile per person', pg_temp.cap('capacity-2', '{}'::jsonb), '23505%owner_key%');
SELECT pg_temp.exp('capacity: a day cannot end before it starts', herkeys_test.error_of('UPDATE public.capacity_profiles SET day_start_minutes = 900, day_end_minutes = 600 WHERE local_id = ''capacity'''), '23514%window_check%');
SELECT pg_temp.exp('capacity: a transition buffer is bounded', herkeys_test.error_of('UPDATE public.capacity_profiles SET transition_buffer_minutes = 999 WHERE local_id = ''capacity'''), '23514%buffer_check%');

SELECT pg_temp.exp('system step: the first step of a routine is accepted', herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'st-1', 'system_id', :'s1'::uuid, 'position', 0, 'title', 'Gather', 'effort_minutes', 5)), NULL);
SELECT pg_temp.exp('system step: two steps cannot share a position', herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'st-2', 'system_id', :'s1'::uuid, 'position', 0, 'title', 'Sort')), '23505%system_position_key%');
SELECT pg_temp.exp('system step: a step needs a real routine', herkeys_test.ins('system_steps', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'st-3', 'system_id', gen_random_uuid(), 'position', 1, 'title', 'Sort')), '23503%');

SELECT pg_temp.exp('goal: the status vocabulary is closed', herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'go-2', 'title', 'x', 'status', 'done-ish')), '23514%status_check%');
SELECT pg_temp.exp('goal: a title is required, and not blank', herkeys_test.ins('goals', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'go-3', 'title', '   ', 'status', 'active')), '23514%title_check%');
SELECT pg_temp.exp('person: a relationship outside the vocabulary is refused', herkeys_test.ins('household_people', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'pe-3', 'display_name', 'X', 'relationship', 'frenemy', 'channel', 'sms', 'status', 'active')), '23514%relationship_check%');
SELECT pg_temp.exp('person: a person carries no contact details — there is no column that could hold one', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE 'has contact column' END FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'household_people' AND column_name ~* '(phone|email|address|contact|number)'), NULL);

SELECT herkeys_test.ins('patterns', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'pa-e', 'kind', 'deferral', 'status', 'candidate', 'first_observed_on', DATE '2026-09-08', 'last_observed_on', DATE '2026-09-22', 'producer', 'ai-inference', 'confidence', 'possible'));
SELECT id AS pae FROM public.patterns WHERE local_id = 'pa-e' \gset
SELECT pg_temp.exp('evidence: a pattern stands on a real observation', herkeys_test.ins('evidence_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ev-1', 'for_type', 'pattern', 'for_pattern_id', :'pae'::uuid,
   'support_type', 'observation', 'support_observation_id', (SELECT id FROM public.behavior_observations WHERE local_id = 'ob-1'), 'code', 'repeated_deferral')), NULL);
SELECT pg_temp.exp('evidence: only patterns, One Moves and intents are explained', herkeys_test.ins('evidence_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ev-2', 'for_type', 'task', 'for_task_id', :'t1'::uuid, 'support_type', 'task', 'support_task_id', :'t2'::uuid, 'code', 'x')), '23514%for_ref_check%');
SELECT pg_temp.exp('evidence: a reason is an open token, format-checked (no prose, no chain of thought)', herkeys_test.ins('evidence_links', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', 'ev-3', 'for_type', 'pattern', 'for_pattern_id', :'pae'::uuid,
   'support_type', 'task', 'support_task_id', :'t1'::uuid, 'code', 'Because she always forgets on Tuesdays')), '23514%code_check%');

ROLLBACK;
