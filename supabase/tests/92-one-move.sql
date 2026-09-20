-- One Move cloud model (SD4-016, SD4-017, SD4-018).
-- The logical day is SERVER-DERIVED on the live path and FROZEN once written.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role='owner' \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id='cat-kids' \gset

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a','task-om-1','One Move target',:'cat_kids',10,'flexible','unplanned','open','household');
COMMIT;
SELECT id AS task_om FROM public.tasks WHERE local_id='task-om-1' \gset

-- The client cannot choose the day: it is derived from profiles.timezone.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, target_task_id, status, decided_at)
VALUES (:'hh_a','onemove-live',:'ua','task',:'task_om','selected', now());
COMMIT;

SELECT CASE WHEN logical_day = (now() AT TIME ZONE 'America/Chicago')::date THEN 'PASS' ELSE 'FAIL' END
       || ' | logical_day is SERVER-DERIVED from profiles.timezone (' || logical_day::text || ')'
FROM public.one_move_records WHERE local_id='onemove-live';

SELECT CASE WHEN timezone_at_decision = 'America/Chicago' THEN 'PASS' ELSE 'FAIL' END
       || ' | timezone_at_decision records the timezone actually used'
FROM public.one_move_records WHERE local_id='onemove-live';

SELECT CASE WHEN household_id = :'hh_a' AND profile_id = :'ua' THEN 'PASS' ELSE 'FAIL' END
       || ' | the record carries household and profile identity'
FROM public.one_move_records WHERE local_id='onemove-live';

SELECT CASE WHEN target_task_id = :'task_om' AND target_needs_me_id IS NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | the target is TYPED, not polymorphic'
FROM public.one_move_records WHERE local_id='onemove-live';

-- A second decision for the same account, household and logical day collides.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, target_task_id, status, decided_at)
  VALUES (%L,'onemove-dupe',%L,'task',%L,'selected', now())
$q$, :'hh_a', :'ua', :'task_om')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a duplicate decision for the same logical day is rejected by the unique key';
ROLLBACK;

-- Retargeting and completion stay on the SAME row and cannot move the day.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.one_move_records SET status='completed', completed_at = now() WHERE local_id='onemove-live';
COMMIT;

SELECT CASE WHEN status='completed' AND completed_at IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | completion is recorded on the same row'
FROM public.one_move_records WHERE local_id='onemove-live';

SELECT CASE WHEN logical_day = (now() AT TIME ZONE 'America/Chicago')::date THEN 'PASS' ELSE 'FAIL' END
       || ' | the day is PINNED on UPDATE, not recomputed'
FROM public.one_move_records WHERE local_id='onemove-live';

-- Changing the account timezone must NOT reinterpret history.
RESET ROLE;
SELECT logical_day AS day_before FROM public.one_move_records WHERE local_id='onemove-live' \gset
UPDATE public.profiles SET timezone='Pacific/Kiritimati' WHERE id = :'ua';

SELECT CASE WHEN logical_day = :'day_before'::date AND timezone_at_decision='America/Chicago' THEN 'PASS' ELSE 'FAIL' END
       || ' | a later timezone change does NOT reinterpret the historical decision'
FROM public.one_move_records WHERE local_id='onemove-live';

UPDATE public.profiles SET timezone='America/Chicago' WHERE id = :'ua';

-- withheld / cleared shape invariants.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, target_task_id, status, decided_at)
  VALUES (%L,'onemove-bad-withheld',%L,'task',%L,'withheld', now())
$q$, :'hh_a', :'ua', :'task_om')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a withheld decision may not carry a target';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, status, decided_at, completed_at)
  VALUES (%L,'onemove-bad-complete',%L,'task','completed', now(), NULL)
$q$, :'hh_a', :'ua')) THEN 'PASS' ELSE 'FAIL' END
      || ' | a completed decision must carry completed_at';

-- The demo-only catalog target type cannot reach the cloud at all.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.one_move_records (household_id, local_id, profile_id, target_type, status, decided_at)
  VALUES (%L,'onemove-catalog',%L,'catalog','withheld', now())
$q$, :'hh_a', :'ua')) THEN 'PASS' ELSE 'FAIL' END
      || ' | target_type=catalog is rejected: demo artifacts cannot be represented (B4-P0-010)';

-- A second device for the same account sees the SAME decision rather than
-- computing its own.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | a second device reads the persisted decision for the day, not a fresh one'
FROM public.one_move_records
WHERE household_id = :'hh_a' AND profile_id = :'ua' AND logical_day = (now() AT TIME ZONE 'America/Chicago')::date;
ROLLBACK;
