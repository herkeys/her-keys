-- Her Keys Premium Stage 1 (A4) — the shared decision ledger: ownership, authorization linkage, state machine, undo evidence,
-- isolation between accounts and households, and the metadata-only operational views.
--
-- Actors: USER A owns household A and has Premium; USER B is a second adult of household A WITHOUT Premium; USER C owns household C.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset

\set digest1 '1111111111111111111111111111111111111111111111111111111111111111'
\set digest2 '2222222222222222222222222222222222222222222222222222222222222222'

-- helper: authorize an operation as the server would, so the ledger has an authorized key to point at
CREATE OR REPLACE FUNCTION herkeys_test.authorize_as(p_account uuid, p_household uuid, p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.premium_authorize(p_account, 'daily_load_premium', p_household, p_key, NULL, NULL, 1, true)
$$;

-- ============ STRUCTURE =============================================================================================================
SELECT CASE WHEN relrowsecurity AND relforcerowsecurity THEN 'PASS' ELSE 'FAIL' END || ' | premium_decisions has RLS enabled and forced' FROM pg_class WHERE oid = 'public.premium_decisions'::regclass;
SELECT CASE WHEN has_table_privilege('authenticated', 'public.premium_decisions', 'SELECT')
              AND NOT has_table_privilege('authenticated', 'public.premium_decisions', 'INSERT, UPDATE, DELETE, TRUNCATE')
              AND NOT has_table_privilege('anon', 'public.premium_decisions', 'SELECT, INSERT, UPDATE, DELETE')
            THEN 'PASS' ELSE 'FAIL' END || ' | a client can only READ its ledger rows: no direct insert, update or delete, and anon holds nothing';
SELECT CASE WHEN (SELECT count(*) FROM pg_policies WHERE tablename = 'premium_decisions') = 1
              AND (SELECT qual FROM pg_policies WHERE tablename = 'premium_decisions') !~* 'entitle|premium_ent|expires'
            THEN 'PASS' ELSE 'FAIL' END || ' | the ledger read policy is ownership only: it never depends on a subscription';

-- ============ AUTHORIZATION LINKAGE ===============================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0001', '{"kind":"task","id":"t1"}', %L)$q$, :'hh_a', :'digest1')) AS e \gset
RESET ROLE;
SELECT CASE WHEN :'e' LIKE '42501%not_authorized%' THEN 'PASS' ELSE 'FAIL' END || ' | recording a decision for an operation the SERVER never authorized is refused (got ' || :'e' || ')';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ub', 'free');
SELECT herkeys_test.authorize_as(:'ub', :'hh_a', 'ledger-key-free-1') ->> 'reason' AS r \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-free-1', '{"kind":"task","id":"t1"}', %L)$q$, :'hh_a', :'digest1')) AS e \gset
RESET ROLE;
SELECT CASE WHEN :'r' = 'requires_premium' AND :'e' LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END || ' | a FREE account that was denied at the gate cannot write a Premium ledger row';
ROLLBACK;

-- One authorized review covers the decisions made UNDER it ("<key>:<suffix>"), but a similar-looking key does not.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-review-0001') ->> 'outcome' AS o \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT coalesce(herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-review-0001:aaaa:1', '{"kind":"task","id":"t1"}', %L)$q$, :'hh_a', :'digest1')), '') AS e_derived \gset
SELECT coalesce(herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-review-0001:bbbb:1', '{"kind":"task","id":"t2"}', %L)$q$, :'hh_a', :'digest2')), '') AS e_derived2 \gset
SELECT coalesce(herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-review-0001-extra', '{"kind":"task","id":"t3"}', %L)$q$, :'hh_a', repeat('3', 64))), '') AS e_prefix \gset
SELECT coalesce(herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-other-0001:aaaa:1', '{"kind":"task","id":"t4"}', %L)$q$, :'hh_a', repeat('4', 64))), '') AS e_other \gset
RESET ROLE;
SELECT CASE WHEN :'e_derived' = '' AND :'e_derived2' = '' THEN 'PASS' ELSE 'FAIL' END || ' | two decisions derived from ONE authorized review are both accepted (got "' || :'e_derived' || '" / "' || :'e_derived2' || '")';
SELECT CASE WHEN :'e_prefix' LIKE '42501%not_authorized%' AND :'e_other' LIKE '42501%not_authorized%' THEN 'PASS' ELSE 'FAIL' END || ' | a key that merely starts with an authorized key, or one authorized nowhere, is refused';
ROLLBACK;

-- ============ OWNERSHIP AND ISOLATION =============================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0002') ->> 'outcome' AS o \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0002', '{"kind":"task","id":"t1"}', %L)$q$, :'hh_c', :'digest1')) AS e \gset
RESET ROLE;
SELECT CASE WHEN :'o' = 'allowed' AND :'e' LIKE '42501%ownership_denied%' THEN 'PASS' ELSE 'FAIL' END || ' | an authorized Premium account cannot file a decision into a household it is not an adult member of';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0003') ->> 'outcome' AS o \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0003', '{"kind":"task","id":"t1"}', :'digest1', '{"kind":"day","id":"2026-10-14"}', '{"plan":{"kind":"unplanned"}}', '{"plan":{"kind":"scheduled"}}', '{"op":"restore_task_plan","targetId":"t1"}')).id AS id \gset
SELECT count(*) AS mine FROM public.premium_decisions \gset
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT count(*) AS theirs FROM public.premium_decisions \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'approved')$q$, :'id')) AS e \gset
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT count(*) AS strangers FROM public.premium_decisions \gset
RESET ROLE;
SELECT CASE WHEN :'mine' = '1' THEN 'PASS' ELSE 'FAIL' END || ' | the deciding account reads its own receipt';
SELECT CASE WHEN :'theirs' = '0' AND :'strangers' = '0' THEN 'PASS' ELSE 'FAIL' END || ' | a co-adult in the SAME household and an unrelated account both see NOTHING of another adult''s decisions';
SELECT CASE WHEN :'e' LIKE 'P0002%not_found%' THEN 'PASS' ELSE 'FAIL' END || ' | another account cannot move someone else''s receipt (indistinguishable from "does not exist")';
ROLLBACK;

-- ============ IDEMPOTENCY AND DUPLICATE SUBMISSION ================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0004') ->> 'outcome' AS o1 \gset
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0005') ->> 'outcome' AS o2 \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0004', '{"kind":"task","id":"t1"}', :'digest1')).id AS id1 \gset
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0004', '{"kind":"task","id":"t1"}', :'digest1')).id AS id1b \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0004', '{"kind":"task","id":"OTHER"}', %L)$q$, :'hh_a', :'digest2')) AS e_reuse \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0005', '{"kind":"task","id":"t1"}', %L)$q$, :'hh_a', :'digest1')) AS e_dup \gset
RESET ROLE;
SELECT CASE WHEN :'id1' = :'id1b' AND (SELECT count(*) FROM public.premium_decisions) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | retrying the SAME operation returns the same receipt (idempotent)';
SELECT CASE WHEN :'e_reuse' LIKE '23505%idempotency_conflict%' THEN 'PASS' ELSE 'FAIL' END || ' | an idempotency key reused for a DIFFERENT proposal is refused, never merged';
SELECT CASE WHEN :'e_dup' LIKE '23505%' THEN 'PASS' ELSE 'FAIL' END || ' | a second submission of the same LIVE proposal under a new key is refused (it cannot be applied twice)';
ROLLBACK;

-- ============ THE STATE MACHINE ====================================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0006') ->> 'outcome' AS o \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0006', '{"kind":"task","id":"t1"}', :'digest1', NULL, '{"plan":{"kind":"unplanned"}}', '{"plan":{"kind":"scheduled","date":"2026-10-15"}}', '{"op":"restore_task_plan"}')).id AS id \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'applied', '{"after_snapshot":{"plan":{}}}')$q$, :'id')) AS e_skip \gset
SELECT (public.premium_decision_transition(:'id', 'approved', '{"corrected": true}')).status AS s1 \gset
SELECT (public.premium_decision_transition(:'id', 'approved')).status AS s1b \gset
SELECT (public.premium_decision_transition(:'id', 'applying')).status AS s2 \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'applied')$q$, :'id')) AS e_noafter \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'applied', '{"after_snapshot":{"plan":{}},"evil":1}')$q$, :'id')) AS e_patch \gset
SELECT (public.premium_decision_transition(:'id', 'applied', '{"after_snapshot":{"plan":{"kind":"scheduled","date":"2026-10-15"}},"result_ref":{"kind":"task","id":"t1"}}')).status AS s3 \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'rejected')$q$, :'id')) AS e_back \gset
SELECT (public.premium_decision_transition(:'id', 'revert_blocked', '{"failure_code":"changed_since"}')).failure_code AS fc \gset
SELECT (public.premium_decision_transition(:'id', 'reverted')).status AS s4 \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_transition(%L, 'applied')$q$, :'id')) AS e_done \gset
RESET ROLE;
SELECT CASE WHEN :'e_skip' LIKE '22023%illegal_transition%' THEN 'PASS' ELSE 'FAIL' END || ' | proposed cannot jump straight to applied';
SELECT CASE WHEN :'s1' = 'approved' AND :'s1b' = 'approved' THEN 'PASS' ELSE 'FAIL' END || ' | a retried transition is a no-op, not an error (flaky networks)';
SELECT CASE WHEN :'s2' = 'applying' THEN 'PASS' ELSE 'FAIL' END || ' | approved -> applying';
SELECT CASE WHEN :'e_noafter' LIKE '23514%' THEN 'PASS' ELSE 'FAIL' END || ' | "applied" without an after-snapshot is refused (a receipt must say what persisted)';
SELECT CASE WHEN :'e_patch' LIKE '22023%patch_key_not_allowed%' THEN 'PASS' ELSE 'FAIL' END || ' | only allow-listed patch keys are accepted';
SELECT CASE WHEN :'s3' = 'applied' AND (SELECT applied_at FROM public.premium_decisions) IS NOT NULL AND (SELECT corrected FROM public.premium_decisions) THEN 'PASS' ELSE 'FAIL' END || ' | applied records when, what persisted, and that she corrected the proposal';
SELECT CASE WHEN :'e_back' LIKE '22023%illegal_transition%' THEN 'PASS' ELSE 'FAIL' END || ' | an applied change cannot be turned into a rejection';
SELECT CASE WHEN :'fc' = 'changed_since' THEN 'PASS' ELSE 'FAIL' END || ' | an undo that was blocked by an intervening edit records exactly why';
SELECT CASE WHEN :'s4' = 'reverted' AND (SELECT reverted_at FROM public.premium_decisions) IS NOT NULL AND (SELECT failure_code FROM public.premium_decisions) IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | a blocked undo can be retried to reverted (and the stale failure code clears)';
SELECT CASE WHEN :'e_done' LIKE '22023%illegal_transition%' THEN 'PASS' ELSE 'FAIL' END || ' | reverted is terminal';
ROLLBACK;

SELECT CASE WHEN (SELECT count(*) FROM (VALUES
    ('proposed','approved'),('proposed','rejected'),('approved','applying'),('applying','applied'),('applied','reverted'),('applied','revert_blocked'),('failed','approved')) t(a, b)
    WHERE public.premium_decision_may_transition(a, b)) = 7
  AND NOT public.premium_decision_may_transition('rejected', 'approved')
  AND NOT public.premium_decision_may_transition('reverted', 'applied')
  AND NOT public.premium_decision_may_transition('abandoned', 'approved')
  AND NOT public.premium_decision_may_transition('proposed', 'applied')
            THEN 'PASS' ELSE 'FAIL' END || ' | the transition table allows exactly the designed edges and no terminal state reopens';

-- ============ RECEIPTS OUTLIVE THE SUBSCRIPTION ===================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0007') ->> 'outcome' AS o \gset
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0007', '{"kind":"task","id":"t7"}', :'digest2', NULL, '{"plan":{"kind":"unplanned"}}', '{"plan":{"kind":"scheduled"}}', '{"op":"restore_task_plan"}')).id AS id \gset
SELECT public.premium_decision_transition(:'id', 'approved');
SELECT public.premium_decision_transition(:'id', 'applied', '{"after_snapshot":{"plan":{"kind":"scheduled"}}}');
RESET ROLE;
-- the subscription is refunded
SELECT herkeys_test.premium_grant(:'ua', 'revoked');
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT count(*) AS visible FROM public.premium_decisions \gset
SELECT (public.premium_decision_transition(:'id', 'reverted')).status AS undone \gset
RESET ROLE;
SELECT CASE WHEN :'visible' = '1' AND :'undone' = 'reverted' THEN 'PASS' ELSE 'FAIL' END || ' | after the subscription is REVOKED the receipt is still readable and the applied change is still undoable';
ROLLBACK;

-- ============ A REJECTED PROPOSAL MAY BE PROPOSED AGAIN; A LIVE ONE MAY NOT =======================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0008');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0009');
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT (public.premium_decision_record(:'hh_a', 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0008', '{"kind":"task","id":"t8"}', :'digest1')).id AS id \gset
SELECT public.premium_decision_transition(:'id', 'rejected');
SELECT coalesce(herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0009', '{"kind":"task","id":"t8"}', %L)$q$, :'hh_a', :'digest1')), '') AS e \gset
RESET ROLE;
SELECT CASE WHEN :'e' = '' THEN 'PASS' ELSE 'FAIL' END || ' | after a rejection the same proposal can be offered again (got "' || :'e' || '")';
ROLLBACK;

-- ============ SIZE AND CONTENT DISCIPLINE =========================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.authorize_as(:'ua', :'hh_a', 'ledger-key-0010');
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0010', %L, %L)$q$, :'hh_a', jsonb_build_object('kind', 'task', 'note', repeat('x', 5000))::text, :'digest1')) AS e_big \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'BAD KIND', 'ledger-key-0010', '{"kind":"task","id":"t"}', %L)$q$, :'hh_a', :'digest1')) AS e_kind \gset
SELECT herkeys_test.error_of(format($q$SELECT public.premium_decision_record(%L, 'daily_load_premium', 'daily_load.reschedule_task', 'ledger-key-0010', '{"kind":"task","id":"t"}', 'not-a-digest')$q$, :'hh_a')) AS e_digest \gset
RESET ROLE;
SELECT CASE WHEN :'e_big' LIKE '23514%' AND :'e_kind' LIKE '23514%' AND :'e_digest' LIKE '23514%' THEN 'PASS' ELSE 'FAIL' END || ' | the ledger refuses oversized payloads, malformed kinds and malformed digests (it cannot become a content dump)';
ROLLBACK;

-- ============ DIRECT WRITES ARE IMPOSSIBLE ========================================================================================
SELECT CASE WHEN herkeys_test.error_of($q$SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}'; INSERT INTO public.premium_decisions (account_id, household_id, feature_key, kind, idempotency_key, proposal_ref, proposal_digest, status) SELECT '11111111-1111-4111-8111-111111111111', household_id, 'daily_load_premium', 'daily_load.x', 'forged-key-0001', '{}', repeat('a', 64), 'applied' FROM public.household_members WHERE profile_id = '11111111-1111-4111-8111-111111111111' LIMIT 1$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot forge an "applied" receipt by inserting directly';
RESET ROLE;
SELECT CASE WHEN NOT has_function_privilege('anon', 'public.premium_decision_record(uuid,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
              AND NOT has_function_privilege('anon', 'public.premium_decision_transition(uuid,text,jsonb)', 'EXECUTE')
              AND has_function_privilege('authenticated', 'public.premium_decision_record(uuid,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END || ' | only signed-in users can call the ledger functions; anon cannot';
SELECT herkeys_test.error_of($q$SET LOCAL ROLE anon; SELECT public.premium_decision_transition(gen_random_uuid(), 'approved')$q$) AS e \gset
RESET ROLE;
SELECT CASE WHEN :'e' LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END || ' | anon calling the ledger is denied outright';

-- ============ OPERATIONAL VIEWS: SERVICE-ONLY, METADATA-ONLY =======================================================================
SELECT CASE WHEN bool_and(NOT has_table_privilege('authenticated', 'public.' || v, 'SELECT') AND NOT has_table_privilege('anon', 'public.' || v, 'SELECT') AND has_table_privilege('service_role', 'public.' || v, 'SELECT'))
            THEN 'PASS' ELSE 'FAIL' END || ' | every operational view is service-role only'
FROM unnest(ARRAY['premium_metrics_denials', 'premium_metrics_webhook', 'premium_metrics_backlog', 'premium_metrics_projection', 'premium_metrics_usage', 'premium_metrics_decisions']) AS v;
SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'premium\_metrics\_%'
      AND column_name IN ('payload', 'proposal_ref', 'source_ref', 'before_snapshot', 'after_snapshot', 'planned_snapshot', 'result_ref', 'email', 'app_user_id', 'account_id', 'household_id', 'idempotency_key'))
            THEN 'PASS' ELSE 'FAIL' END || ' | no operational view exposes content, identifiers, keys or snapshots (aggregates only)';
SELECT CASE WHEN herkeys_test.error_of($q$SET LOCAL ROLE authenticated; SELECT public.premium_health()$q$) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot call premium_health';
RESET ROLE;

BEGIN;
SELECT public.premium_health() AS h0 \gset
SELECT CASE WHEN (:'h0'::jsonb ->> 'ok') = 'true' THEN 'PASS' ELSE 'FAIL' END || ' | a clean database is healthy (no alerts)';
INSERT INTO public.premium_events (event_id, environment, event_type, status, attempts) VALUES ('health-dead-1', 'SANDBOX', 'RENEWAL', 'dead_letter', 5);
INSERT INTO public.premium_events (event_id, environment, event_type, status, received_at) VALUES ('health-old-1', 'SANDBOX', 'RENEWAL', 'received', clock_timestamp() - interval '30 minutes');
UPDATE public.premium_runtime_config SET webhook_processing = false;
SELECT public.premium_health() AS h1 \gset
SELECT CASE WHEN (:'h1'::jsonb ->> 'ok') = 'false'
             AND (:'h1'::jsonb -> 'alerts') @> '[{"rule":"dead_letter_events"}]'::jsonb
             AND (:'h1'::jsonb -> 'alerts') @> '[{"rule":"webhook_backlog_age_seconds"}]'::jsonb
             AND (:'h1'::jsonb -> 'alerts') @> '[{"rule":"webhook_processing_halted"}]'::jsonb
            THEN 'PASS' ELSE 'FAIL' END || ' | a dead letter, an old backlog and a halted processor each raise their alert';
ROLLBACK;

BEGIN;
INSERT INTO auth.users (id, email) VALUES ('77777777-7777-4777-8777-777777777777', 'g@local.test') ON CONFLICT DO NOTHING;
SELECT herkeys_test.premium_grant('77777777-7777-4777-8777-777777777777', 'active');
UPDATE public.premium_runtime_config SET environment = 'staging', allow_test_fixtures = false;
UPDATE public.premium_runtime_config SET environment = 'production';
SELECT public.premium_health() AS h2 \gset
SELECT CASE WHEN (:'h2'::jsonb -> 'alerts') @> '[{"rule":"test_fixture_entitlement_in_production","severity":"page"}]'::jsonb THEN 'PASS' ELSE 'FAIL' END || ' | a fabricated entitlement found in a PRODUCTION database pages immediately';
ROLLBACK;

-- ============ ACCOUNT / HOUSEHOLD DELETION CLEARS THE LEDGER =====================================================================
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('88888888-8888-4888-8888-888888888888', 'h@local.test') ON CONFLICT DO NOTHING;
SELECT herkeys_test.premium_grant('88888888-8888-4888-8888-888888888888', 'active');
INSERT INTO public.premium_usage_events (account_id, feature_key, idempotency_key, status, units, cost_units, via, period_start)
  VALUES ('88888888-8888-4888-8888-888888888888', 'daily_load_premium', 'ledger-del-0001', 'completed', 1, 1, 'premium', current_date);
INSERT INTO public.premium_decisions (account_id, household_id, feature_key, kind, idempotency_key, proposal_ref, proposal_digest)
  VALUES ('88888888-8888-4888-8888-888888888888', :'hh_a', 'daily_load_premium', 'daily_load.x', 'ledger-del-0001', '{"kind":"task","id":"x"}', :'digest1');
DELETE FROM auth.users WHERE id = '88888888-8888-4888-8888-888888888888';
SELECT CASE WHEN (SELECT count(*) FROM public.premium_decisions WHERE account_id = '88888888-8888-4888-8888-888888888888') = 0
             AND (SELECT count(*) FROM public.premium_entitlements WHERE account_id = '88888888-8888-4888-8888-888888888888') = 0
             AND (SELECT count(*) FROM public.premium_usage_events WHERE account_id = '88888888-8888-4888-8888-888888888888') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | deleting an account removes its entitlement, usage and ledger rows (cascade); nothing orphaned';
ROLLBACK;
