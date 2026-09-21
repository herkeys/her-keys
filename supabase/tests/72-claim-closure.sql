-- ============================================================================
-- 72 — claim dependency closure  (B4-BE02-OR-001, B4-BE02-OR-002)
--
-- The claim carries the MINIMUM TRANSITIVE DEPENDENCY SET that makes her
-- historical One Move rows valid, and nothing else. These checks prove both
-- halves: the closure really is claimed, and everything outside it really is
-- not.
--
-- The standing rule this suite exists to satisfy: FIXTURE KEYWORD PRESENCE IS
-- NOT COVERAGE. Every case here asserts the branch it actually exercised —
-- a historical INSERT is distinguished from a conflict-branch CONTINUE by
-- reading the stored row back, never by assuming.
--
-- Self-contained: it creates its own cast and depends on no other file.
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set ta '7a000000-0000-4000-8000-00000000000a'
\set tb '7b000000-0000-4000-8000-00000000000b'
\set tc '7c000000-0000-4000-8000-00000000000c'
\set td '7d000000-0000-4000-8000-00000000000d'
\set te '7e000000-0000-4000-8000-00000000000e'
\set tf '7f000000-0000-4000-8000-00000000000f'
\set tg '79000000-0000-4000-8000-000000000009'
\set th '78000000-0000-4000-8000-000000000008'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  (:'ta','72a@local.test'), (:'tb','72b@local.test'), (:'tc','72c@local.test'),
  (:'td','72d@local.test'), (:'te','72e@local.test'), (:'tf','72f@local.test'),
  (:'tg','72g@local.test'), (:'th','72h@local.test')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- USER A — the full closure: a child-scoped completed task target.
--
-- One Move -> task -> category (adopted starter) -> child member.
-- Ten tasks and six Needs Me items exist locally; only the ONE the history
-- needs is carried, and the assertions below count rows to prove it.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7a000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.claim_local_household('7a000000-0000-4000-8000-0000000000c1'::uuid,'America/Chicago',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "childMembers":[{"localId":"child-1","producer":"user-action","displayName":"Mia","birthDate":"2016-04-02"}],
      "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
      "tasks":[{"localId":"task-1","producer":"user-action","title":"Return the library books","categoryLocalId":"cat-home",
                "subjectMemberLocalId":"child-1","durationMinutes":15,"commitment":"flexible",
                "dueDate":"2026-09-18","planKind":"day","plannedDate":"2026-09-18","plannedStartsAt":null,
                "notes":null,"status":"completed","completedAt":"2026-09-18T18:00:00Z",
                "originCreatedAt":"2026-09-17T09:00:00Z","originUpdatedAt":"2026-09-18T18:00:00Z","scope":"child"}],
      "needsMeItems":[],
      "oneMoves":[{"localId":"onemove-2026-09-18","producer":"user-action","logicalDay":"2026-09-18","targetType":"task",
                   "targetLocalId":"task-1","status":"completed","decidedAt":"2026-09-18T12:00:00Z",
                   "completedAt":"2026-09-18T18:00:00Z"}]}$p$::jsonb, NULL) ->> 'status') = 'complete'
  THEN 'PASS' ELSE 'FAIL' END || ' | 1. a COMPLETED historical One Move with a task target claims successfully';
COMMIT;

-- 7. The target exists BEFORE the One Move references it — proven by the
-- reference resolving at all, since the FK and the shape CHECK are both
-- NON-DEFERRABLE and would have fired at INSERT time otherwise.
-- 5/6. The stored reference is the CLOUD uuid, not the local id.
SELECT CASE WHEN o.target_task_id = t.id AND o.target_needs_me_id IS NULL
             AND o.target_task_id::text <> 'task-1' AND t.local_id = 'task-1'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 5/6/7. the One Move stores the target CLOUD uuid, resolved from local_id, with the target already present'
FROM public.one_move_records o
JOIN public.household_members m ON m.household_id = o.household_id AND m.profile_id = :'ta' AND m.role = 'owner'
JOIN public.tasks t ON t.id = o.target_task_id;

-- 22. Branch assertion: this really took the historical INSERT path, not the
-- existing-row conflict branch. A conflict-branch CONTINUE would have left no
-- row at all here, because nothing pre-existed.
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 22. exactly one historical One Move row exists, so the INSERT branch ran'
FROM public.one_move_records o
JOIN public.household_members m ON m.household_id = o.household_id AND m.profile_id = :'ta' AND m.role = 'owner';

-- 14/H. Canonical target state is preserved: a completed task arrives completed.
SELECT CASE WHEN t.status = 'completed' AND t.completed_at = '2026-09-18T18:00:00Z'::timestamptz
             AND t.origin_created_at = '2026-09-17T09:00:00Z'::timestamptz
             AND t.duration_minutes = 15 AND t.commitment = 'flexible'
             AND t.plan_kind = 'day' AND t.planned_date = DATE '2026-09-18'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 14. the completed historical task stays COMPLETED with its completion and plan metadata intact'
FROM public.tasks t
JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'ta' AND m.role = 'owner';

-- 4/14. Child-scoped subject integrity, with subject_member_type derived by the
-- server rather than taken from the payload.
SELECT CASE WHEN t.scope = 'child' AND t.subject_member_type = 'child'
             AND c.member_type = 'child' AND c.profile_id IS NULL AND c.scope = 'child'
             AND c.display_name = 'Mia' AND c.birth_date = DATE '2016-04-02'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 4. the child-scoped task resolves to a real child member, typed by the server'
FROM public.tasks t
JOIN public.household_members c ON c.id = t.subject_member_id
JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'ta' AND m.role = 'owner';

-- 17. The required starter category was ADOPTED, not duplicated: still eight.
SELECT CASE WHEN count(*) = 8 THEN 'PASS' ELSE 'FAIL' END
       || ' | 17. the required starter category resolved to the bootstrap row (' || count(*)::text || ' categories, not 9)'
FROM public.household_categories hc
JOIN public.household_members m ON m.household_id = hc.household_id AND m.profile_id = :'ta' AND m.role = 'owner';

SELECT CASE WHEN t.category_id = hc.id AND hc.local_id = 'cat-home' AND hc.system_role = 'home'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 2. the task points at the adopted cat-home row'
FROM public.tasks t JOIN public.household_categories hc ON hc.id = t.category_id
JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'ta' AND m.role = 'owner';

-- 9/10/11/12. Nothing outside the closure was claimed. The local household had
-- ten tasks and six Needs Me items; one task is here and nothing else is.
SELECT CASE WHEN (SELECT count(*) FROM public.tasks t JOIN public.household_members m
                    ON m.household_id=t.household_id AND m.profile_id=:'ta' AND m.role='owner') = 1
             AND (SELECT count(*) FROM public.needs_me_items n JOIN public.household_members m
                    ON m.household_id=n.household_id AND m.profile_id=:'ta' AND m.role='owner') = 0
             AND (SELECT count(*) FROM public.household_members hm JOIN public.household_members m
                    ON m.household_id=hm.household_id AND m.profile_id=:'ta' AND m.role='owner') = 2
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 9/10/11/12. exactly the closure is in the cloud: 1 task, 0 Needs Me, 2 members (owner + the one child)';

-- 5/6/7/8. Every closure member has an authoritative mapping in the returned map.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7a000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (r -> 'id_map') ? 'task-1' AND (r -> 'id_map') ? 'child-1'
             AND (r -> 'id_map') ? 'cat-home' AND (r -> 'id_map') ? 'household-1'
             AND (r -> 'id_map') ? 'user-1'   AND (r -> 'id_map') ? 'onemove-2026-09-18'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | J. the returned id_map covers the WHOLE closure, not just the One Move target'
FROM (SELECT public.claim_local_household('7a000000-0000-4000-8000-0000000000c1'::uuid,'America/Chicago',
        '{"claimPayloadVersion":2,"origin":"empty","oneMoves":[]}'::jsonb, NULL) AS r) s;
COMMIT;

-- ----------------------------------------------------------------------------
-- USER B — a SELECTED One Move with a Needs Me target, and its category.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7b000000-0000-4000-8000-00000000000b"}';
SELECT CASE WHEN (public.claim_local_household('7b000000-0000-4000-8000-0000000000c2'::uuid,'Europe/London',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "categories":[{"localId":"cat-custom-1","producer":"user-action","name":"Garden","systemRole":null,"status":"active","sortOrder":8,"scope":"personal"}],
      "needsMeItems":[{"localId":"needsme-1","producer":"user-action","title":"Call the dentist back","status":"open","dueDate":null,
                       "categoryLocalId":"cat-custom-1","originCreatedAt":"2026-09-15T08:30:00Z","scope":"personal"}],
      "oneMoves":[{"localId":"onemove-2026-09-17","producer":"user-action","logicalDay":"2026-09-17","targetType":"needsMe",
                   "targetLocalId":"needsme-1","status":"selected","decidedAt":"2026-09-17T12:00:00Z",
                   "completedAt":null}]}$p$::jsonb, NULL) ->> 'status') = 'complete'
  THEN 'PASS' ELSE 'FAIL' END || ' | 4. a SELECTED historical One Move with a Needs Me target claims successfully';
COMMIT;

-- 6. target_needs_me_id is populated — the column the first implementation
-- never wrote at all.
SELECT CASE WHEN o.target_needs_me_id = n.id AND o.target_task_id IS NULL
             AND o.status = 'selected' AND o.logical_day = DATE '2026-09-17'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 6. the Needs Me target resolves to its cloud uuid and target_task_id stays null'
FROM public.one_move_records o
JOIN public.needs_me_items n ON n.id = o.target_needs_me_id
JOIN public.household_members m ON m.household_id = o.household_id AND m.profile_id = :'tb' AND m.role = 'owner';

-- 18. A user-created category was inserted (not adopted) and carries her data.
SELECT CASE WHEN hc.name = 'Garden' AND hc.system_role IS NULL AND hc.sort_order = 8
             AND hc.scope = 'personal' AND hc.owner_profile_id = :'tb'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 18. the required user-created category was inserted with her own values'
FROM public.household_categories hc
JOIN public.household_members m ON m.household_id = hc.household_id AND m.profile_id = :'tb' AND m.role = 'owner'
WHERE hc.local_id = 'cat-custom-1';

SELECT CASE WHEN count(*) = 9 THEN 'PASS' ELSE 'FAIL' END
       || ' | 6b. eight starters plus the one required custom category (' || count(*)::text || ')'
FROM public.household_categories hc
JOIN public.household_members m ON m.household_id = hc.household_id AND m.profile_id = :'tb' AND m.role = 'owner';

-- ----------------------------------------------------------------------------
-- USER C — boundedness. The server REJECTS an overbroad payload rather than
-- ignoring the extras, which is what makes "claim is not sync" executable.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7c000000-0000-4000-8000-00000000000c"}';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d1'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
        "tasks":[{"localId":"task-1","producer":"user-action","title":"Needed","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                  "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                  "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                  "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"},
                 {"localId":"task-9","producer":"user-action","title":"Unrelated","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                  "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                  "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                  "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-16T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 13/9. an UNRELATED task in the payload is REJECTED, not quietly ignored';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d2'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "needsMeItems":[{"localId":"needsme-9","producer":"user-action","title":"Unrelated","status":"open","dueDate":null,
                         "categoryLocalId":null,"originCreatedAt":"2026-09-15T08:30:00Z","scope":"personal"}],
        "oneMoves":[]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 10. an UNRELATED Needs Me item in the payload is REJECTED';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d3'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "categories":[{"localId":"cat-custom-9","producer":"user-action","name":"Unrelated","systemRole":null,"status":"active","sortOrder":9,"scope":"household"}],
        "oneMoves":[]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 11. an UNRELATED user-created category in the payload is REJECTED';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d4'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "childMembers":[{"localId":"child-9","producer":"user-action","displayName":"Unrelated","birthDate":"2018-01-01"}],
        "oneMoves":[]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 12. an UNRELATED child member in the payload is REJECTED';

-- B4-BE02-OR-002 server backstop. catalog is remediated locally during v2 -> v3;
-- if one still arrives, the claim fails closed instead of guessing.
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d5'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "oneMoves":[{"localId":"onemove-2026-09-10","producer":"user-action","logicalDay":"2026-09-10","targetType":"catalog",
                     "targetLocalId":"move-breathe","status":"completed","decidedAt":"2026-09-10T12:00:00Z",
                     "completedAt":"2026-09-10T13:00:00Z"}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 1(OR-002). a catalog targetType reaching the RPC is REFUSED, never converted';

-- 1(census). The frozen cloud target set really is exactly {task, needsMe}.
SELECT CASE WHEN pg_get_constraintdef(oid) = 'CHECK ((target_type = ANY (ARRAY[''task''::text, ''needsMe''::text, ''event''::text, ''system''::text, ''responsibility''::text])))'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 1(census). the cloud One Move target set is exactly {task, needsMe, event, system, responsibility} (widened deliberately by B4-FOUNDATION-BUILDOUT-01; catalog stays refused)'
FROM pg_constraint WHERE conname = 'one_move_records_target_type_check';

-- An unsupported payload version is refused rather than misread.
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d6'::uuid,'Europe/London',
    '{"claimPayloadVersion":4,"origin":"empty","oneMoves":[]}'::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | C. an unknown claimPayloadVersion is refused, not guessed at';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7c000000-0000-4000-8000-0000000000d7'::uuid,'Europe/London',
    '{"origin":"empty","oneMoves":[]}'::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | C. a payload with NO version is refused';
ROLLBACK;

-- 21. Rollback census. Every boundedness refusal above ran in a transaction
-- that rolled back, so USER C must own nothing at all.
SELECT CASE WHEN (SELECT count(*) FROM public.profiles          WHERE id = :'tc') = 0
             AND (SELECT count(*) FROM public.household_members WHERE profile_id = :'tc') = 0
             AND (SELECT count(*) FROM public.account_claims    WHERE profile_id = :'tc') = 0
             AND (SELECT count(*) FROM public.needs_me_items    WHERE profile_id = :'tc') = 0
             AND (SELECT count(*) FROM public.one_move_records  WHERE profile_id = :'tc') = 0
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 21. a refused claim leaves ZERO rows in profiles/members/claims/needs_me/one_moves';

-- ----------------------------------------------------------------------------
-- USER D — missing and malformed dependencies all fail CLOSED and atomically.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7d000000-0000-4000-8000-00000000000d"}';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7d000000-0000-4000-8000-0000000000e1'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-missing","status":"completed","decidedAt":"2026-09-16T12:00:00Z",
                     "completedAt":"2026-09-16T13:00:00Z"}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 11(OR-001). a MISSING task target fails the claim atomically';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7d000000-0000-4000-8000-0000000000e2'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"needsMe",
                     "targetLocalId":"needsme-missing","status":"selected","decidedAt":"2026-09-16T12:00:00Z",
                     "completedAt":null}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 12(OR-001). a MISSING Needs Me target fails the claim atomically';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7d000000-0000-4000-8000-0000000000e3'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "tasks":[{"localId":"task-1","producer":"user-action","title":"Orphan","categoryLocalId":"cat-nonexistent","subjectMemberLocalId":null,
                  "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                  "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                  "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-16T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 20. a required category that was not supplied fails the claim atomically';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7d000000-0000-4000-8000-0000000000e4'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
        "tasks":[{"localId":"task-1","producer":"user-action","title":"Child work","categoryLocalId":"cat-home","subjectMemberLocalId":"child-missing",
                  "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                  "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                  "originCreatedAt":null,"originUpdatedAt":null,"scope":"child"}],
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-16T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 19. a required child member that was not supplied fails the claim atomically';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('7d000000-0000-4000-8000-0000000000e5'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":null,"status":"completed","decidedAt":"2026-09-16T12:00:00Z",
                     "completedAt":"2026-09-16T13:00:00Z"}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 13(OR-001). a completed One Move naming NO target is malformed and fails atomically';
ROLLBACK;

SELECT CASE WHEN (SELECT count(*) FROM public.profiles          WHERE id = :'td') = 0
             AND (SELECT count(*) FROM public.household_members WHERE profile_id = :'td') = 0
             AND (SELECT count(*) FROM public.account_claims    WHERE profile_id = :'td') = 0
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 18(OR-001). every failed claim above left no profile, no membership and no claim row';

-- ----------------------------------------------------------------------------
-- USER E — retry. The whole identity graph must come back unchanged.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7e000000-0000-4000-8000-00000000000e"}';
CREATE TEMP TABLE claim_first AS
SELECT public.claim_local_household('7e000000-0000-4000-8000-0000000000f1'::uuid,'America/Chicago',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "childMembers":[{"localId":"child-1","producer":"user-action","displayName":"Ben","birthDate":"2014-11-20"}],
      "categories":[{"localId":"cat-kids","producer":"user-action","name":"Kids","systemRole":"kids","status":"active","sortOrder":0,"scope":"household"}],
      "tasks":[{"localId":"task-1","producer":"user-action","title":"Sign the permission slip","categoryLocalId":"cat-kids",
                "subjectMemberLocalId":"child-1","durationMinutes":5,"commitment":"fixed",
                "dueDate":"2026-09-15","planKind":"unplanned","plannedDate":null,"plannedStartsAt":null,
                "notes":null,"status":"completed","completedAt":"2026-09-15T17:00:00Z",
                "originCreatedAt":"2026-09-14T09:00:00Z","originUpdatedAt":"2026-09-15T17:00:00Z","scope":"child"}],
      "needsMeItems":[{"localId":"needsme-1","producer":"user-action","title":"Book the eye test","status":"open","dueDate":null,
                       "categoryLocalId":null,"originCreatedAt":"2026-09-14T10:00:00Z","scope":"personal"}],
      "oneMoves":[{"localId":"onemove-2026-09-15","producer":"user-action","logicalDay":"2026-09-15","targetType":"task",
                   "targetLocalId":"task-1","status":"completed","decidedAt":"2026-09-15T12:00:00Z",
                   "completedAt":"2026-09-15T17:00:00Z"},
                  {"localId":"onemove-2026-09-14","producer":"user-action","logicalDay":"2026-09-14","targetType":"needsMe",
                   "targetLocalId":"needsme-1","status":"selected","decidedAt":"2026-09-14T12:00:00Z",
                   "completedAt":null},
                  {"localId":"onemove-2026-09-13","producer":"user-action","logicalDay":"2026-09-13","targetType":"task",
                   "targetLocalId":null,"status":"withheld","decidedAt":"2026-09-13T12:00:00Z",
                   "completedAt":null}]}$p$::jsonb, NULL) AS r;
SELECT CASE WHEN (r ->> 'status') = 'complete' THEN 'PASS' ELSE 'FAIL' END
       || ' | 15. mixed targeted and withheld historical One Moves claim together' FROM claim_first;
COMMIT;

-- 3. A Needs Me item with NO category pulls no category into the closure.
SELECT CASE WHEN n.category_id IS NULL AND count_all.c = 8 THEN 'PASS' ELSE 'FAIL' END
       || ' | 3. a target with no category adds none: still the eight starter categories'
FROM public.needs_me_items n
JOIN public.household_members m ON m.household_id = n.household_id AND m.profile_id = :'te' AND m.role = 'owner',
LATERAL (SELECT count(*) AS c FROM public.household_categories hc WHERE hc.household_id = n.household_id) count_all;

SELECT CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END
       || ' | 15b. all three historical One Moves landed (' || count(*)::text || ')'
FROM public.one_move_records o
JOIN public.household_members m ON m.household_id = o.household_id AND m.profile_id = :'te' AND m.role = 'owner';

-- Snapshot the identity graph, then simulate the crash and replay.
CREATE TEMP TABLE graph_before AS
SELECT 'household' AS kind, h.id FROM public.households h
  JOIN public.household_members m ON m.household_id = h.id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'member', hm.id FROM public.household_members hm
  JOIN public.household_members m ON m.household_id = hm.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'category', hc.id FROM public.household_categories hc
  JOIN public.household_members m ON m.household_id = hc.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'task', t.id FROM public.tasks t
  JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'needsme', n.id FROM public.needs_me_items n WHERE n.profile_id = '7e000000-0000-4000-8000-00000000000e'
UNION ALL SELECT 'onemove', o.id FROM public.one_move_records o WHERE o.profile_id = '7e000000-0000-4000-8000-00000000000e';

RESET ROLE;
UPDATE public.account_claims SET status='in_progress' WHERE profile_id = :'te';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7e000000-0000-4000-8000-00000000000e"}';
SELECT CASE WHEN (public.claim_local_household('7e000000-0000-4000-8000-0000000000f1'::uuid,'America/Chicago',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "childMembers":[{"localId":"child-1","producer":"user-action","displayName":"Ben","birthDate":"2014-11-20"}],
      "categories":[{"localId":"cat-kids","producer":"user-action","name":"Kids","systemRole":"kids","status":"active","sortOrder":0,"scope":"household"}],
      "tasks":[{"localId":"task-1","producer":"user-action","title":"Sign the permission slip","categoryLocalId":"cat-kids",
                "subjectMemberLocalId":"child-1","durationMinutes":5,"commitment":"fixed",
                "dueDate":"2026-09-15","planKind":"unplanned","plannedDate":null,"plannedStartsAt":null,
                "notes":null,"status":"completed","completedAt":"2026-09-15T17:00:00Z",
                "originCreatedAt":"2026-09-14T09:00:00Z","originUpdatedAt":"2026-09-15T17:00:00Z","scope":"child"}],
      "needsMeItems":[{"localId":"needsme-1","producer":"user-action","title":"Book the eye test","status":"open","dueDate":null,
                       "categoryLocalId":null,"originCreatedAt":"2026-09-14T10:00:00Z","scope":"personal"}],
      "oneMoves":[{"localId":"onemove-2026-09-15","producer":"user-action","logicalDay":"2026-09-15","targetType":"task",
                   "targetLocalId":"task-1","status":"completed","decidedAt":"2026-09-15T12:00:00Z",
                   "completedAt":"2026-09-15T17:00:00Z"},
                  {"localId":"onemove-2026-09-14","producer":"user-action","logicalDay":"2026-09-14","targetType":"needsMe",
                   "targetLocalId":"needsme-1","status":"selected","decidedAt":"2026-09-14T12:00:00Z",
                   "completedAt":null},
                  {"localId":"onemove-2026-09-13","producer":"user-action","logicalDay":"2026-09-13","targetType":"task",
                   "targetLocalId":null,"status":"withheld","decidedAt":"2026-09-13T12:00:00Z",
                   "completedAt":null}]}$p$::jsonb, NULL) ->> 'status') = 'complete'
  THEN 'PASS' ELSE 'FAIL' END || ' | 17(OR-001). the crash/retry path resolves the existing mapping and completes';
COMMIT;

-- 8/9/15/L. Not one uuid moved, and nothing was duplicated.
CREATE TEMP TABLE graph_after AS
SELECT 'household' AS kind, h.id FROM public.households h
  JOIN public.household_members m ON m.household_id = h.id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'member', hm.id FROM public.household_members hm
  JOIN public.household_members m ON m.household_id = hm.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'category', hc.id FROM public.household_categories hc
  JOIN public.household_members m ON m.household_id = hc.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'task', t.id FROM public.tasks t
  JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = '7e000000-0000-4000-8000-00000000000e' AND m.role = 'owner'
UNION ALL SELECT 'needsme', n.id FROM public.needs_me_items n WHERE n.profile_id = '7e000000-0000-4000-8000-00000000000e'
UNION ALL SELECT 'onemove', o.id FROM public.one_move_records o WHERE o.profile_id = '7e000000-0000-4000-8000-00000000000e';

SELECT CASE WHEN (SELECT count(*) FROM graph_before) = (SELECT count(*) FROM graph_after)
             AND NOT EXISTS (SELECT 1 FROM graph_after a
                             WHERE NOT EXISTS (SELECT 1 FROM graph_before b WHERE b.kind = a.kind AND b.id = a.id))
             AND NOT EXISTS (SELECT 1 FROM graph_before b
                             WHERE NOT EXISTS (SELECT 1 FROM graph_after a WHERE a.kind = b.kind AND a.id = b.id))
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 8/9/15(L). retry reuses EVERY closure uuid: no duplicate target, One Move, member, category or household';

-- ----------------------------------------------------------------------------
-- USER F — a completed claim replayed with a DIVERGENT payload is not a sync.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7f000000-0000-4000-8000-00000000000f"}';
SELECT CASE WHEN (public.claim_local_household('7f000000-0000-4000-8000-0000000000a1'::uuid,'Europe/London',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
      "tasks":[{"localId":"task-1","producer":"user-action","title":"Water the plants","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                "durationMinutes":5,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
      "oneMoves":[{"localId":"onemove-2026-09-12","producer":"user-action","logicalDay":"2026-09-12","targetType":"task",
                   "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-12T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
      ->> 'status') = 'complete' THEN 'PASS' ELSE 'FAIL' END || ' | 16a. the first claim completes';
COMMIT;

-- She keeps using the app before the retry: a second task and a second One Move
-- now exist locally that the completed claim never saw.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"7f000000-0000-4000-8000-00000000000f"}';
SELECT CASE WHEN (public.claim_local_household('7f000000-0000-4000-8000-0000000000a1'::uuid,'Europe/London',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
      "tasks":[{"localId":"task-1","producer":"user-action","title":"Water the plants","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                "durationMinutes":5,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"},
               {"localId":"task-2","producer":"user-action","title":"Added after the claim","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                "durationMinutes":5,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
      "oneMoves":[{"localId":"onemove-2026-09-12","producer":"user-action","logicalDay":"2026-09-12","targetType":"task",
                   "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-12T12:00:00Z","completedAt":null},
                  {"localId":"onemove-2026-09-11","producer":"user-action","logicalDay":"2026-09-11","targetType":"task",
                   "targetLocalId":"task-2","status":"completed","decidedAt":"2026-09-11T12:00:00Z",
                   "completedAt":"2026-09-11T13:00:00Z"}]}$p$::jsonb, NULL)
      ->> 'status') = 'complete' THEN 'PASS' ELSE 'FAIL' END
      || ' | 16b. replaying a COMPLETED claim returns the authoritative result';
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 16c. the divergent retry was NOT merged: still one task, not two (' || count(*)::text || ')'
FROM public.tasks t
JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'tf' AND m.role = 'owner';

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 16d. the later local One Move stays local for B4-BACKEND-03 (' || count(*)::text || ' cloud row)'
FROM public.one_move_records o WHERE o.profile_id = :'tf';

-- 16f (B4-BACKEND-03 addendum A.9). The divergent replay created no second
-- household and no second claim topology: the account still owns exactly one
-- household, through exactly one owner membership, under one claim row.
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE profile_id = :'tf' AND role='owner') = 1
             AND (SELECT count(DISTINCT household_id) FROM public.household_members WHERE profile_id = :'tf') = 1
             AND (SELECT count(*) FROM public.account_claims WHERE profile_id = :'tf') = 1
             AND (SELECT count(*) FROM public.account_claims WHERE profile_id = :'tf' AND status='complete') = 1
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 16f. the divergent replay created no second household and no second claim topology';

-- 16g. And no claim lockout: the account is not left refused or in_progress.
SELECT CASE WHEN status = 'complete' AND rejected_reason IS NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | 16g. the replayed claim is settled complete, with no lockout'
FROM public.account_claims WHERE profile_id = :'tf';

SELECT CASE WHEN (row_counts ->> 'retry_payload_diverged') = 'true' THEN 'PASS' ELSE 'FAIL' END
       || ' | 16e. the divergence is recorded as evidence in the existing claim row, with no schema expansion'
FROM public.account_claims WHERE profile_id = :'tf';

-- ----------------------------------------------------------------------------
-- USER G — adoption compatibility. An existing row is never overwritten to
-- make a retry succeed.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"79000000-0000-4000-8000-000000000009"}';
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('79000000-0000-4000-8000-0000000000b1'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"money","status":"active","sortOrder":1,"scope":"household"}],
        "tasks":[{"localId":"task-1","producer":"user-action","title":"Work","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                  "durationMinutes":10,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                  "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                  "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-1","status":"selected","decidedAt":"2026-09-16T12:00:00Z","completedAt":null}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END
  || ' | I. adopting a category whose system role disagrees is REFUSED, not overwritten';
ROLLBACK;

-- ----------------------------------------------------------------------------
-- USER H — cross-household isolation and repeated targets.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"78000000-0000-4000-8000-000000000008"}';

-- 10(OR-001). USER A's household really does hold a row called task-1. Naming
-- it from another account resolves to nothing, because every lookup is scoped
-- to the caller's own household -- so the claim fails rather than adopting a
-- stranger's task.
SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.claim_local_household('78000000-0000-4000-8000-0000000000b8'::uuid,'Europe/London',
    $p${"claimPayloadVersion":2,"origin":"empty",
        "oneMoves":[{"localId":"onemove-2026-09-16","producer":"user-action","logicalDay":"2026-09-16","targetType":"task",
                     "targetLocalId":"task-1","status":"completed","decidedAt":"2026-09-16T12:00:00Z",
                     "completedAt":"2026-09-16T13:00:00Z"}]}$p$::jsonb, NULL)
$q$) THEN 'PASS' ELSE 'FAIL' END
  || ' | 10(OR-001). a target local_id that exists only in ANOTHER household does not resolve; the claim fails';
ROLLBACK;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 10b. the other account still owns exactly one task-1 and nothing was taken from it'
FROM public.tasks t
JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'ta' AND m.role = 'owner'
WHERE t.local_id = 'task-1';

-- 16(OR-001). Two historical One Moves on different days may name the SAME
-- target. The target is created once and both rows point at it.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"78000000-0000-4000-8000-000000000008"}';
SELECT CASE WHEN (public.claim_local_household('78000000-0000-4000-8000-0000000000c8'::uuid,'Europe/London',
  $p${"claimPayloadVersion":2,"origin":"empty",
      "categories":[{"localId":"cat-home","producer":"user-action","name":"Home","systemRole":"home","status":"active","sortOrder":1,"scope":"household"}],
      "tasks":[{"localId":"task-shared","producer":"user-action","title":"Put the bins out","categoryLocalId":"cat-home","subjectMemberLocalId":null,
                "durationMinutes":5,"commitment":"flexible","dueDate":null,"planKind":"unplanned","plannedDate":null,
                "plannedStartsAt":null,"notes":null,"status":"open","completedAt":null,
                "originCreatedAt":null,"originUpdatedAt":null,"scope":"household"}],
      "oneMoves":[{"localId":"onemove-2026-09-09","producer":"user-action","logicalDay":"2026-09-09","targetType":"task",
                   "targetLocalId":"task-shared","status":"completed","decidedAt":"2026-09-09T12:00:00Z",
                   "completedAt":"2026-09-09T13:00:00Z"},
                  {"localId":"onemove-2026-09-08","producer":"user-action","logicalDay":"2026-09-08","targetType":"task",
                   "targetLocalId":"task-shared","status":"selected","decidedAt":"2026-09-08T12:00:00Z",
                   "completedAt":null}]}$p$::jsonb, NULL) ->> 'status') = 'complete'
  THEN 'PASS' ELSE 'FAIL' END || ' | 16(OR-001). two One Moves naming the same target claim together';
COMMIT;

SELECT CASE WHEN (SELECT count(*) FROM public.tasks t
                    JOIN public.household_members m ON m.household_id=t.household_id
                     AND m.profile_id=:'th' AND m.role='owner') = 1
             AND (SELECT count(DISTINCT o.target_task_id) FROM public.one_move_records o
                    WHERE o.profile_id = :'th') = 1
             AND (SELECT count(*) FROM public.one_move_records o WHERE o.profile_id = :'th') = 2
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 16b. the shared target was created ONCE and both One Moves point at that same uuid';
