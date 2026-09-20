-- The action ledger: immutable, and its references are CLOUD UUIDs.
-- SD4-007 (references), SD4-008 (closed manifest), SD4-020 (immutability),
-- SD4-025 (bounded, versioned payload).
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role='owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.role='owner' AND hm.household_id <> :'hh_a' LIMIT 1 \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id='cat-kids' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.events (household_id, local_id, title, category_id, starts_at, ends_at, commitment, status, scope) VALUES
  (:'hh_a','evt-ar-1','Window before',:'cat_kids', now(), now()+interval '30 min','fixed','active','household'),
  (:'hh_a','evt-ar-2','Window after', :'cat_kids', now()+interval '1 hour', now()+interval '90 min','fixed','active','household');
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-ar-1','Moved task',:'cat_kids',10,'flexible','unplanned','open','household');
COMMIT;

SELECT id AS ev1  FROM public.events WHERE local_id='evt-ar-1' \gset
SELECT id AS ev2  FROM public.events WHERE local_id='evt-ar-2' \gset
SELECT id AS tsk1 FROM public.tasks  WHERE local_id='task-ar-1' \gset

-- A valid record with cloud-uuid references in the manifest paths.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.action_records
  (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, before_state, after_state, origin_created_at)
VALUES (:'hh_a','act-1',:'ua', CURRENT_DATE,'daily_load.move_task','approved','task',:'tsk1',
        jsonb_build_object('code','transition_buffer_shortfall','windowBeforeEventId',:'ev1','windowAfterEventId',:'ev2',
                           'bufferMinutes',5,'requiredBufferMinutes',20,'projectedBufferMinutes',25),
        '{"plan":{"kind":"unplanned"}}'::jsonb, '{"plan":{"kind":"day","date":"2026-09-20"}}'::jsonb, now());
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | a valid action record with cloud-uuid references is accepted'
FROM public.action_records WHERE local_id='act-1';

SELECT CASE WHEN (reason ->> 'windowBeforeEventId')::uuid = :'ev1' THEN 'PASS' ELSE 'FAIL' END
       || ' | manifest references are stored as CLOUD UUIDs, not local ids'
FROM public.action_records WHERE local_id='act-1';

-- A local id in a manifest path is refused by the uuid-shape CHECK.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.action_records
    (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, origin_created_at)
  VALUES (%L,'act-localid',%L, CURRENT_DATE,'daily_load.move_task','approved','task',%L,
          jsonb_build_object('code','transition_buffer_shortfall','windowBeforeEventId','evt-1','windowAfterEventId',%L), now())
$q$, :'hh_a', :'ua', :'tsk1', :'ev2')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a LOCAL id inside a manifest path is rejected (no local ids as durable cloud references)';

-- The payload contract: type, approval and reason.code must agree.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.action_records
    (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, origin_created_at)
  VALUES (%L,'act-mismatch',%L, CURRENT_DATE,'daily_load.move_task','declined','task',%L,
          jsonb_build_object('code','capacity_pressure'), now())
$q$, :'hh_a', :'ua', :'tsk1')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a record whose action_type, approval and reason.code disagree is rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.action_records
    (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, origin_created_at)
  VALUES (%L,'act-nocode',%L, CURRENT_DATE,'daily_load.drop_task','approved','task',%L,
          '{"no":"code"}'::jsonb, now())
$q$, :'hh_a', :'ua', :'tsk1')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a payload with no reason.code is rejected (arbitrary JSON is not storable)';

-- Wrong-household reference: the record must belong to the caller's household.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.action_records
    (household_id, local_id, actor_profile_id, logical_date, action_type, approval, target_type, target_id, reason, origin_created_at)
  VALUES (%L,'act-wronghh',%L, CURRENT_DATE,'daily_load.drop_task','approved','task',%L,
          jsonb_build_object('code','capacity_pressure'), now())
$q$, :'hh_c', :'ua', :'tsk1')) THEN 'PASS' ELSE 'FAIL' END
      || ' | writing a ledger row into ANOTHER household is denied';
ROLLBACK;

-- Immutability: three layers, attacked as the client AND as the table owner.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.action_records SET approval='declined' WHERE local_id='act-1'$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | client UPDATE of a ledger row is DENIED';
SELECT CASE WHEN herkeys_test.test_denied($q$DELETE FROM public.action_records WHERE local_id='act-1'$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | client DELETE of a ledger row is DENIED';
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.action_records SET reason = '{"code":"capacity_pressure"}'::jsonb WHERE local_id='act-1'$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | client mutation of the durable reference payload is DENIED';
ROLLBACK;

RESET ROLE;
SELECT CASE WHEN herkeys_test.test_denied($q$UPDATE public.action_records SET approval='declined' WHERE local_id='act-1'$q$)
            THEN 'PASS' ELSE 'FAIL' END
       || ' | even the TABLE OWNER cannot update the ledger (the trigger binds privileged callers too)';

SELECT CASE WHEN approval = 'approved' THEN 'PASS' ELSE 'FAIL' END || ' | the ledger row is unchanged after every attempt'
FROM public.action_records WHERE local_id='act-1';

-- No UPDATE or DELETE policy exists at all: the absence IS the guarantee.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | action_records has no UPDATE or DELETE policy'
FROM pg_policies WHERE schemaname='public' AND tablename='action_records' AND cmd IN ('UPDATE','DELETE');

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | authenticated holds no UPDATE or DELETE privilege on the ledger'
FROM information_schema.role_table_grants
WHERE grantee='authenticated' AND table_schema='public' AND table_name='action_records'
  AND privilege_type IN ('UPDATE','DELETE');
