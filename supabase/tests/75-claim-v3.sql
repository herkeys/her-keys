-- ============================================================================
-- 75 — claim payload version 3  (HK-INTEGRATION-READINESS-01: HA-001 and HA-010)
--
-- Version 3 changes exactly two things and leaves version 2 working, unchanged:
--   a. EVERY child the household holds is claimed, not only those a One Move's closure names. A child's cloud identity can be
--      created by claim and by nothing else, so a child left out could never be referenced by anything sync sends later.
--   b. a claimed task states where its duration came from (durationSource), so a default is never carried as a fact.
--      Absent or null means "never recorded" and is stored as NULL; nothing invents a source.
--
-- Self-contained: its own cast, no dependence on another file.
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set t1 '75a00000-0000-4000-8000-00000000000a'
\set t2 '75b00000-0000-4000-8000-00000000000b'
\set t3 '75c00000-0000-4000-8000-00000000000c'
\set t4 '75d00000-0000-4000-8000-00000000000d'
\set t5 '75e00000-0000-4000-8000-00000000000e'
\set t6 '75f00000-0000-4000-8000-00000000000f'
\set t7 '75900000-0000-4000-8000-000000000009'
\set t8 '75800000-0000-4000-8000-000000000008'
\set t9 '75700000-0000-4000-8000-000000000007'
\set t10 '75600000-0000-4000-8000-000000000006'
\set t11 '75500000-0000-4000-8000-000000000005'
\set t12 '75400000-0000-4000-8000-000000000004'
\set t13 '75300000-0000-4000-8000-000000000003'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  (:'t1','75a@local.test'), (:'t2','75b@local.test'), (:'t3','75c@local.test'), (:'t4','75d@local.test'),
  (:'t5','75e@local.test'), (:'t6','75f@local.test'), (:'t7','75g@local.test'), (:'t8','75h@local.test'),
  (:'t9','75i@local.test'), (:'t10','75j@local.test'), (:'t11','75k@local.test'), (:'t12','75l@local.test'), (:'t13','75m@local.test')
ON CONFLICT (id) DO NOTHING;

-- ---- the payload every case starts from: one completed task claimed through its One Move -----------------------------
CREATE FUNCTION pg_temp.payload(p_extra jsonb DEFAULT '{}'::jsonb, p_task_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'claimPayloadVersion', 3, 'origin', 'empty',
    'childMembers', '[]'::jsonb,
    'categories', jsonb_build_array(jsonb_build_object('localId','cat-money','producer','system-derived','sourceArtifactLocalId',NULL,'confidence',NULL,'name','Money','systemRole','money','status','active','sortOrder',2,'scope','household')),
    'tasks', jsonb_build_array(jsonb_build_object(
        'localId','task-1','producer','user-action','sourceArtifactLocalId',NULL,'confidence',NULL,
        'title','Pay the trip fee','categoryLocalId','cat-money','subjectMemberLocalId',NULL,'durationMinutes',15,'commitment','flexible',
        'dueDate','2026-09-24','planKind','unplanned','plannedDate',NULL,'plannedStartsAt',NULL,'notes',NULL,'status','completed','completedAt','2026-09-18T18:00:00Z',
        'originCreatedAt','2026-09-17T09:00:00Z','originUpdatedAt','2026-09-18T18:00:00Z','scope','household',
        'dueAt',NULL,'earliestStartAt',NULL,'latestFinishAt',NULL,'splittable',NULL,'minChunkMinutes',NULL,'preferredTimeOfDay',NULL,
        'energyDemand',NULL,'consequence',NULL,'needsMePersonally',NULL,'travelMinutesBefore',NULL,'travelMinutesAfter',NULL,'preparationMinutes',NULL,
        'value', NULL) || p_task_extra),
    'needsMeItems', '[]'::jsonb,
    'oneMoves', jsonb_build_array(jsonb_build_object('localId','onemove-2026-09-18','producer','user-action','sourceArtifactLocalId',NULL,'confidence',NULL,
        'logicalDay','2026-09-18','targetType','task','targetLocalId','task-1','status','completed','decidedAt','2026-09-18T12:00:00Z','completedAt','2026-09-18T18:00:00Z')),
    'sourceArtifacts', '[]'::jsonb
  ) || p_extra;
$f$;

CREATE FUNCTION pg_temp.child(p_id text, p_name text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('localId', p_id, 'displayName', p_name, 'birthDate', '2016-04-02');
$f$;

CREATE FUNCTION pg_temp.claim_as(p_user uuid, p_key uuid, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_user)::text, true);
  SET LOCAL ROLE authenticated;
  v := public.claim_local_household(p_key, 'America/Chicago', p_payload, NULL);
  RESET ROLE;
  RETURN v;
END $f$;

CREATE FUNCTION pg_temp.refusal(p_user uuid, p_key uuid, p_payload jsonb) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_detail text;
BEGIN
  PERFORM pg_temp.claim_as(p_user, p_key, p_payload);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RESET ROLE;
  RETURN SQLSTATE || ' ' || SQLERRM || ' | ' || COALESCE(v_detail, '');
END $f$;

CREATE FUNCTION pg_temp.say(p_label text, p_ok boolean) RETURNS text LANGUAGE sql AS $f$ SELECT CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || p_label; $f$;

CREATE FUNCTION pg_temp.household_of(p_user uuid) RETURNS uuid LANGUAGE sql AS $f$
  SELECT household_id FROM public.household_members WHERE profile_id = p_user AND role = 'owner';
$f$;

-- ================= 1. A CHILD OUTSIDE THE CLOSURE IS CLAIMED (HA-001) =================================================
SELECT pg_temp.say('1. version 3 accepts a child no One Move names, and the claim completes',
  pg_temp.claim_as(:'t1', '75a00000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('childMembers', jsonb_build_array(pg_temp.child('child-x', 'Mia'))))) ->> 'status' = 'complete');
SELECT pg_temp.say('2. ...it exists as a CHILD member with no profile, scoped to the child',
  EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = pg_temp.household_of(:'t1') AND m.local_id = 'child-x'
            AND m.member_type = 'child' AND m.profile_id IS NULL AND m.scope = 'child' AND m.display_name = 'Mia'));
SELECT pg_temp.say('3. ...and its cloud id is in the id map the device adopts (the mapping only claim can create)',
  (pg_temp.claim_as(:'t1', '75a00000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('childMembers', jsonb_build_array(pg_temp.child('child-x', 'Mia'))))) -> 'id_map' ->> 'child-x')::uuid
    = (SELECT id FROM public.household_members WHERE household_id = pg_temp.household_of(:'t1') AND local_id = 'child-x'));

SELECT pg_temp.say('4. the SAME payload as version 2 is still refused as overbroad: version 2 is unchanged',
  pg_temp.refusal(:'t2', '75b00000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('claimPayloadVersion', 2, 'childMembers', jsonb_build_array(pg_temp.child('child-x', 'Mia'))))) LIKE '22023%overbroad_payload%childMembers%');
SELECT pg_temp.say('5. ...and the refusal left no household behind',
  NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t2'::uuid));

-- NOTE: a claim and the rows it wrote are checked in SEPARATE statements. A sub-select in the same statement as a volatile
-- function call runs on the statement's snapshot and cannot see what the function wrote, which would make an "IS NULL" check
-- pass vacuously. Every NULL expectation below therefore also asserts that the row EXISTS.
SELECT pg_temp.say('6. two children, one named by the closure task: the claim completes',
  pg_temp.claim_as(:'t3', '75c00000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('childMembers', jsonb_build_array(pg_temp.child('child-1', 'Mia'), pg_temp.child('child-2', 'Theo'))),
                    jsonb_build_object('subjectMemberLocalId', 'child-1', 'scope', 'child'))) ->> 'status' = 'complete');
SELECT pg_temp.say('6b. ...BOTH children exist (the one no task names as well)',
  (SELECT count(*) FROM public.household_members WHERE household_id = pg_temp.household_of(:'t3') AND member_type = 'child') = 2);
SELECT pg_temp.say('6c. ...and the task resolves its subject to the child it names, typed by the server',
  EXISTS (SELECT 1 FROM public.tasks t JOIN public.household_members m ON m.id = t.subject_member_id
           WHERE t.household_id = pg_temp.household_of(:'t3') AND t.local_id = 'task-1' AND m.local_id = 'child-1' AND t.subject_member_type = 'child'));

-- ================= 2. DURATION PROVENANCE IS CARRIED, NEVER INVENTED (HA-010) =========================================
SELECT pg_temp.say('7. a claimed task stating durationSource user: the claim completes',
  pg_temp.claim_as(:'t4', '75d00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('durationSource', 'user'))) ->> 'status' = 'complete');
SELECT pg_temp.say('7b. ...and it is stored user',
  (SELECT count(*) FROM public.tasks WHERE household_id = pg_temp.household_of(:'t4') AND local_id = 'task-1' AND duration_source = 'user') = 1);

SELECT pg_temp.say('8. a stated default: the claim completes',
  pg_temp.claim_as(:'t5', '75e00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('durationSource', 'default'))) ->> 'status' = 'complete');
SELECT pg_temp.say('8b. ...a default stays a default (15 is 15, whoever supplied it)',
  (SELECT count(*) FROM public.tasks WHERE household_id = pg_temp.household_of(:'t5') AND local_id = 'task-1' AND duration_source = 'default' AND duration_minutes = 15) = 1);

SELECT pg_temp.say('9. an inferred duration: the claim completes',
  pg_temp.claim_as(:'t6', '75f00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('durationSource', 'inferred'))) ->> 'status' = 'complete');
SELECT pg_temp.say('9b. ...and it stays inferred',
  (SELECT count(*) FROM public.tasks WHERE household_id = pg_temp.household_of(:'t6') AND local_id = 'task-1' AND duration_source = 'inferred') = 1);

SELECT pg_temp.say('10. a task that states NO source (null): the claim completes',
  pg_temp.claim_as(:'t7', '75900000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('durationSource', NULL))) ->> 'status' = 'complete');
SELECT pg_temp.say('10b. ...it is stored NULL: never recorded, not user-provided and not a known default (and the row really exists)',
  (SELECT count(*) FROM public.tasks WHERE household_id = pg_temp.household_of(:'t7') AND local_id = 'task-1' AND duration_source IS NULL AND duration_minutes = 15) = 1);

SELECT pg_temp.say('11. a version 2 claim (which names no source, even if the payload tries to): the claim completes',
  pg_temp.claim_as(:'t8', '75800000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('claimPayloadVersion', 2), jsonb_build_object('durationSource', 'user'))) ->> 'status' = 'complete');
SELECT pg_temp.say('11b. ...it stores NULL: no source is invented for a payload version that has none (and the row really exists)',
  (SELECT count(*) FROM public.tasks WHERE household_id = pg_temp.household_of(:'t8') AND local_id = 'task-1' AND duration_source IS NULL) = 1);

SELECT pg_temp.say('12. a source the schema does not know is refused (check violation), not trusted',
  pg_temp.refusal(:'t9', '75700000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('durationSource', 'you-said-so'))) LIKE '23514%tasks_duration_source_check%');
SELECT pg_temp.say('13. ...and the whole claim rolled back: all-or-nothing',
  NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t9'::uuid) AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE local_id = 'task-1' AND owner_profile_id = :'t9'::uuid));

-- ================= 3. EDGES OF THE CONTRACT =========================================================================
SELECT pg_temp.say('14. a retry with the same key is an idempotent replay: same household, no duplicate child',
  (pg_temp.claim_as(:'t1', '75a00000-0000-4000-8000-0000000000c1',
     pg_temp.payload(jsonb_build_object('childMembers', jsonb_build_array(pg_temp.child('child-x', 'Mia'))))) ->> 'household_id')::uuid = pg_temp.household_of(:'t1')
  AND (SELECT count(*) FROM public.household_members WHERE household_id = pg_temp.household_of(:'t1') AND member_type = 'child') = 1);

SELECT pg_temp.say('15. more than fifty children is refused',
  pg_temp.refusal(:'t10', '75600000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('childMembers', (SELECT jsonb_agg(pg_temp.child('child-' || g, 'Kid ' || g)) FROM generate_series(1, 51) g)))) LIKE '22023%too_many_children%');

SELECT pg_temp.say('16. a child the closure requires but the payload does not carry is a missing dependency',
  pg_temp.refusal(:'t11', '75500000-0000-4000-8000-0000000000c1',
    pg_temp.payload('{}'::jsonb, jsonb_build_object('subjectMemberLocalId', 'child-ghost', 'scope', 'child'))) LIKE '22023%missing_dependency%childMembers%');

SELECT pg_temp.say('17. an unknown payload version is refused (version 4)',
  pg_temp.refusal(:'t12', '75400000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('claimPayloadVersion', 4))) LIKE '22023%unsupported claimPayloadVersion 4%');

SELECT pg_temp.say('18. a child name the database refuses (a double space) fails the claim closed: the client normalises, the server still verifies',
  pg_temp.refusal(:'t13', '75300000-0000-4000-8000-0000000000c1',
    pg_temp.payload(jsonb_build_object('childMembers', jsonb_build_array(pg_temp.child('child-x', 'Mia  Smith'))))) LIKE '23514%household_members_display_name_check%');

SELECT pg_temp.say('19. the claim records which payload version it accepted',
  (SELECT (row_counts ->> 'payload_version')::int FROM public.account_claims WHERE profile_id = :'t3'::uuid AND status = 'complete') = 3);

SELECT pg_temp.say('20. a demo-origin version 3 payload is still refused outright',
  pg_temp.claim_as(:'t5', '75e00000-0000-4000-8000-0000000000c9', pg_temp.payload(jsonb_build_object('origin', 'demo'))) ->> 'rejected_reason' = 'refused_demo');
