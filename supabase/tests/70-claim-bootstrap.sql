-- Trusted claim / bootstrap contract (SD4-022, NHR-05).
-- ENV C: the migration was applied while empty; these synthetic users exist
-- only because the migration already succeeded.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ud '44444444-4444-4444-8444-444444444444'
\set ue '55555555-5555-4555-8555-555555555555'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES (:'ud','d@local.test'), (:'ue','e@local.test')
ON CONFLICT (id) DO NOTHING;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role='owner' \gset

-- 10/9. identity + ownership validation: no authenticated caller, no bootstrap.
SELECT CASE WHEN herkeys_test.test_denied($q$SELECT public.bootstrap_account('00000000-0000-4000-8000-000000000001'::uuid,'UTC',NULL)$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | bootstrap with no authenticated caller is REJECTED';

-- 1. valid bootstrap
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN (public.bootstrap_account('dddddddd-0000-4000-8000-00000000000d'::uuid,'America/Chicago',NULL) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | valid bootstrap completes';
COMMIT;

SELECT CASE WHEN count(*) = 8 THEN 'PASS' ELSE 'FAIL' END || ' | bootstrap created the 8 starter categories'
FROM public.household_categories c
JOIN public.household_members m ON m.household_id = c.household_id AND m.profile_id = :'ud' AND m.role='owner';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | bootstrap created exactly one owner membership'
FROM public.household_members WHERE profile_id = :'ud' AND role = 'owner';

SELECT CASE WHEN display_name IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | HR-05: no fabricated display_name is persisted'
FROM public.household_members WHERE profile_id = :'ud' AND role = 'owner';

-- 3/4/12. idempotent retry: same claim_key after an uncertain acknowledgement.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN (public.bootstrap_account('dddddddd-0000-4000-8000-00000000000d'::uuid,'America/Chicago',NULL) ->> 'household_id')
                 = (SELECT household_id::text FROM public.household_members WHERE profile_id = :'ud' AND role='owner')
            THEN 'PASS' ELSE 'FAIL' END || ' | retry with the same claim_key returns the SAME household';
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | retry created no duplicate household'
FROM public.household_members WHERE profile_id = :'ud' AND role = 'owner';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | exactly one completed account_claim for that profile'
FROM public.account_claims WHERE profile_id = :'ud' AND status = 'complete';

-- 11. the id map is the crash-recovery payload the design exists for.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN (public.bootstrap_account('dddddddd-0000-4000-8000-00000000000d'::uuid,'America/Chicago',NULL) -> 'id_map') ? 'cat-kids'
            THEN 'PASS' ELSE 'FAIL' END || ' | replay returns the complete local_id -> cloud_id map';
COMMIT;

-- 5. a DIFFERENT claim_key from an account that already owns a household
--    resolves to it rather than creating a second one.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN (public.bootstrap_account('dddddddd-0000-4000-8000-0000000000ff'::uuid,'America/Chicago',NULL) ->> 'rejected_reason')
                 = 'superseded_by_cloud' THEN 'PASS' ELSE 'FAIL' END
       || ' | a second bootstrap for the same account is superseded_by_cloud, not a duplicate';
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | still exactly one household for that account (SD4-023)'
FROM public.household_members WHERE profile_id = :'ud' AND role = 'owner';

-- 2/6. claim of a real local household; and demo is refused fail-closed.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555"}';
SELECT CASE WHEN (public.claim_local_household('eeeeeeee-0000-4000-8000-00000000000e'::uuid,'Europe/London',
                    '{"claimPayloadVersion":1,"origin":"demo","oneMoves":[]}'::jsonb, NULL) ->> 'rejected_reason') = 'refused_demo'
            THEN 'PASS' ELSE 'FAIL' END || ' | a demo payload is refused fail-closed, not filtered (B4-P0-010)';
COMMIT;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | the refused demo claim created no household'
FROM public.household_members WHERE profile_id = :'ue';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555"}';
SELECT CASE WHEN (public.claim_local_household('eeeeeeee-0000-4000-8000-00000000001e'::uuid,'Europe/London',
                    '{"claimPayloadVersion":1,"origin":"empty","oneMoves":[]}'::jsonb, NULL) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | a real (origin=empty) claim completes';
COMMIT;

-- 7. malformed historical input is rejected safely.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555"}';
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('eeeeeeee-0000-4000-8000-00000000002e'::uuid,'Not/A_Zone','{"claimPayloadVersion":1,"origin":"empty"}'::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | a malformed IANA timezone is rejected';
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('eeeeeeee-0000-4000-8000-00000000003e'::uuid,'Europe/London','"not an object"'::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | a non-object payload is rejected';
ROLLBACK;

-- 8. direct unauthorized DML on the privileged tables.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN herkeys_test.test_denied($q$INSERT INTO public.households (local_id) VALUES ('household-sneak')$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | direct client INSERT into households is DENIED';
SELECT CASE WHEN herkeys_test.test_denied($q$INSERT INTO public.account_claims (profile_id, claim_key, kind, status)
              VALUES ('44444444-4444-4444-8444-444444444444','00000000-0000-4000-8000-0000000000aa','claim','complete')$q$)
            THEN 'PASS' ELSE 'FAIL' END || ' | direct client INSERT into account_claims is DENIED';
SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE profile_id <> '44444444-4444-4444-8444-444444444444') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | a client sees only its OWN claim rows (' || count(*)::text || ' visible)'
  FROM public.account_claims;
ROLLBACK;

-- 16. routine grants match intended callers only.
SELECT CASE WHEN NOT has_function_privilege('anon','public.bootstrap_account(uuid,text,uuid)','EXECUTE')
             AND NOT has_function_privilege('anon','public.claim_local_household(uuid,text,jsonb,uuid)','EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END || ' | anon may call neither entry point';

-- 15. safe search_path on every trusted routine.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | every SECURITY DEFINER routine pins search_path ('
       || coalesce(string_agg(n.nspname||'.'||p.proname, ', '), 'none') || ')'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','private') AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');

-- 5 (second form). A NEW claim_key from an account that already owns a
-- household is superseded, never a second household.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555"}';
SELECT CASE WHEN (public.claim_local_household('eeeeeeee-0000-4000-8000-00000000009e'::uuid,'Europe/London',
        '{"claimPayloadVersion":1,"origin":"empty","oneMoves":[]}'::jsonb, NULL) ->> 'rejected_reason') = 'superseded_by_cloud'
       THEN 'PASS' ELSE 'FAIL' END || ' | a new claim_key on an account that already has a household is superseded';
COMMIT;

-- 13/14. One Move logical-day collision on claim RETRY.
--
-- The reachable retry path is the crash case: the server committed rows but the
-- client never recorded success, so the claim is still in_progress and the same
-- claim_key is replayed. That is simulated by resetting the claim row, which is
-- exactly the state a crash would have left behind.
\set uf '66666666-6666-4666-8666-666666666666'
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES (:'uf','f@local.test') ON CONFLICT (id) DO NOTHING;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666"}';
SELECT CASE WHEN (public.claim_local_household('ffffffff-0000-4000-8000-00000000000f'::uuid,'America/Chicago',
        '{"claimPayloadVersion":1,"origin":"empty","oneMoves":[{"localId":"onemove-2026-09-18","logicalDay":"2026-09-18","status":"withheld","targetType":"task","targetLocalId":null,"decidedAt":"2026-09-18T12:00:00Z"}]}'::jsonb, NULL)
      ->> 'status') = 'complete' THEN 'PASS' ELSE 'FAIL' END || ' | historical One Move backfill accepted through the trusted path';
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | exactly one historical One Move row'
FROM public.one_move_records o JOIN public.household_members m ON m.household_id=o.household_id AND m.profile_id=:'uf';

SELECT CASE WHEN logical_day = DATE '2026-09-18' AND timezone_at_decision = 'America/Chicago' THEN 'PASS' ELSE 'FAIL' END
       || ' | the historical day is FROZEN as supplied, with the timezone recorded as evidence'
FROM public.one_move_records o JOIN public.household_members m ON m.household_id=o.household_id AND m.profile_id=:'uf';

-- Simulate the crash: the claim never reached 'complete' on the client.
RESET ROLE;
UPDATE public.account_claims SET status='in_progress' WHERE profile_id=:'uf';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666"}';
SELECT CASE WHEN (public.claim_local_household('ffffffff-0000-4000-8000-00000000000f'::uuid,'America/Chicago',
        '{"claimPayloadVersion":1,"origin":"empty","oneMoves":[{"localId":"onemove-2026-09-18","logicalDay":"2026-09-18","status":"withheld","targetType":"task","targetLocalId":null,"decidedAt":"2026-09-18T12:00:00Z"}]}'::jsonb, NULL)
      ->> 'status') = 'complete' THEN 'PASS' ELSE 'FAIL' END
      || ' | retry with an IDENTICAL historical One Move is an idempotent replay, not a raw unique violation';
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | the idempotent replay created no duplicate One Move'
FROM public.one_move_records o JOIN public.household_members m ON m.household_id=o.household_id AND m.profile_id=:'uf';

RESET ROLE;
UPDATE public.account_claims SET status='in_progress' WHERE profile_id=:'uf';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666"}';
-- The divergent retry carries a REAL target, so it reaches the historical INSERT
-- path and is turned back by the stored row -- not refused earlier for naming no
-- target at all, which is what the pre-correction version of this test did.
SELECT CASE WHEN jsonb_array_length(public.claim_local_household('ffffffff-0000-4000-8000-00000000000f'::uuid,'America/Chicago',
        $p${"claimPayloadVersion":1,"origin":"empty",
            "categories":[{"localId":"cat-home","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
            "tasks":[{"localId":"task-f1","title":"Rinse the recycling","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                      "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                      "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                      "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
            "oneMoves":[{"localId":"onemove-2026-09-18","logicalDay":"2026-09-18","status":"selected","targetType":"task",
                         "targetLocalId":"task-f1","decidedAt":"2026-09-18T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
      -> 'conflict_evidence') = 1 THEN 'PASS' ELSE 'FAIL' END
      || ' | a MATERIALLY different historical One Move preserves conflict evidence instead of overwriting';
COMMIT;

SELECT CASE WHEN status = 'withheld' THEN 'PASS' ELSE 'FAIL' END || ' | the stored historical decision was NOT silently overwritten'
FROM public.one_move_records o JOIN public.household_members m ON m.household_id=o.household_id AND m.profile_id=:'uf';
