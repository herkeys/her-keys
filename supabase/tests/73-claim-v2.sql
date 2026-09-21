-- ============================================================================
-- 73 — claim payload version 2  (B4-FOUNDATION-BUILDOUT-01)
--
-- Version 2 differs from version 1 in exactly three ways: every claimed row states its PROVENANCE, a task
-- carries its commitment FACETS and exact value, and the SOURCE ARTIFACTS the claimed rows were derived from
-- travel with them as part of the closure. Version 1 names none of that, so it is REFUSED — it cannot be
-- completed without inventing where each row came from.
--
-- Self-contained: its own cast, no dependence on another file.
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set t1 '73a00000-0000-4000-8000-00000000000a'
\set t2 '73b00000-0000-4000-8000-00000000000b'
\set t3 '73c00000-0000-4000-8000-00000000000c'
\set t4 '73d00000-0000-4000-8000-00000000000d'
\set t5 '73e00000-0000-4000-8000-00000000000e'
\set t6 '73f00000-0000-4000-8000-00000000000f'
\set t7 '73900000-0000-4000-8000-000000000009'
\set t8 '73800000-0000-4000-8000-000000000008'
\set t9 '73700000-0000-4000-8000-000000000007'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  (:'t1','73a@local.test'), (:'t2','73b@local.test'), (:'t3','73c@local.test'), (:'t4','73d@local.test'),
  (:'t5','73e@local.test'), (:'t6','73f@local.test'), (:'t7','73g@local.test'), (:'t8','73h@local.test'), (:'t9','73i@local.test')
ON CONFLICT (id) DO NOTHING;

-- ---- the payload every case starts from: an accepted inference, derived from a forwarded email --------------------
CREATE FUNCTION pg_temp.payload(p_extra jsonb DEFAULT '{}'::jsonb, p_task_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'claimPayloadVersion', 2, 'origin', 'empty',
    'childMembers', '[]'::jsonb,
    'categories', jsonb_build_array(jsonb_build_object('localId','cat-money','producer','system-derived','sourceArtifactLocalId',NULL,'confidence',NULL,'name','Money','systemRole','money','status','active','sortOrder',2,'scope','household')),
    'tasks', jsonb_build_array(jsonb_build_object(
        'localId','task-1','producer','ai-inference','sourceArtifactLocalId','artifact-1','confidence','established',
        'title','Pay the $35 trip fee','categoryLocalId','cat-money','subjectMemberLocalId',NULL,'durationMinutes',15,'commitment','flexible',
        'dueDate','2026-09-24','planKind','unplanned','plannedDate',NULL,'plannedStartsAt',NULL,'notes',NULL,'status','completed','completedAt','2026-09-18T18:00:00Z',
        'originCreatedAt','2026-09-17T09:00:00Z','originUpdatedAt','2026-09-18T18:00:00Z','scope','household',
        'dueAt','2026-09-24T20:00:00Z','earliestStartAt',NULL,'latestFinishAt',NULL,'splittable',true,'minChunkMinutes',5,'preferredTimeOfDay','evening',
        'energyDemand','low','consequence','high','needsMePersonally',true,'travelMinutesBefore',NULL,'travelMinutesAfter',NULL,'preparationMinutes',10,
        'value', jsonb_build_object('amountMinor',3500,'currency','USD','direction','outflow')) || p_task_extra),
    'needsMeItems', '[]'::jsonb,
    'oneMoves', jsonb_build_array(jsonb_build_object('localId','onemove-2026-09-18','producer','user-action','sourceArtifactLocalId',NULL,'confidence',NULL,
        'logicalDay','2026-09-18','targetType','task','targetLocalId','task-1','status','completed','decidedAt','2026-09-18T12:00:00Z','completedAt','2026-09-18T18:00:00Z')),
    'sourceArtifacts', jsonb_build_array(jsonb_build_object('localId','artifact-1','kind','email','origin','user-submitted','provider','forward','receivedAt','2026-09-16T13:00:00Z',
        'contentDigest', repeat('b', 64), 'contentRef','blob:email-1','externalReferenceLocalId',NULL,'retractedAt',NULL,'originCreatedAt','2026-09-16T13:00:00Z'))
  ) || p_extra;
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

-- ================= 1. VERSION 1 IS REFUSED ==========================================================================
SELECT pg_temp.say('1. a version 1 payload is REFUSED: it cannot be completed without inventing provenance',
  pg_temp.refusal(:'t1', '73a00000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('claimPayloadVersion', 1))) LIKE '22023%unsupported claimPayloadVersion 1%');
SELECT pg_temp.say('2. ...and it left no household behind', NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t1'::uuid));

-- ================= 2. EVERY CLAIMED ROW MUST STATE WHERE IT CAME FROM ============================================
SELECT pg_temp.say('3. a task that states no producer is refused',
  pg_temp.refusal(:'t2', '73b00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('producer', NULL))) LIKE '22023%states no provenance%missing_provenance%');
SELECT pg_temp.say('4. a One Move that states no producer is refused',
  pg_temp.refusal(:'t2', '73b00000-0000-4000-8000-0000000000c2',
    jsonb_set(pg_temp.payload(), '{oneMoves,0,producer}', 'null'::jsonb)) LIKE '22023%states no provenance%');
SELECT pg_temp.say('5. demo provenance is refused outright — a claim never launders a rehearsal into a real household',
  pg_temp.refusal(:'t2', '73b00000-0000-4000-8000-0000000000c3', pg_temp.payload('{}'::jsonb, jsonb_build_object('producer', 'demo-seed', 'sourceArtifactLocalId', NULL, 'confidence', NULL))) LIKE '22023%is demo data%demo_provenance%');
SELECT pg_temp.say('6. ...and a refused claim left no household, no artifact and no task',
  NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t2'::uuid) AND NOT EXISTS (SELECT 1 FROM public.source_artifacts WHERE profile_id = :'t2'::uuid));

-- ================= 3. THE ARTIFACT CLOSURE ==========================================================================
SELECT pg_temp.say('7. a task naming an artifact the claim does not carry is refused as a missing dependency',
  pg_temp.refusal(:'t3', '73c00000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('sourceArtifacts', '[]'::jsonb))) LIKE '22023%missing_dependency%sourceArtifacts%');
SELECT pg_temp.say('8. an artifact NO claimed row was derived from is refused — claim is not a general upload',
  pg_temp.refusal(:'t3', '73c00000-0000-4000-8000-0000000000c2', pg_temp.payload(jsonb_build_object('sourceArtifacts', (pg_temp.payload() -> 'sourceArtifacts') ||
    jsonb_build_array(jsonb_build_object('localId','artifact-extra','kind','email','origin','user-submitted','receivedAt','2026-09-16T13:00:00Z','contentDigest',repeat('c',64),'originCreatedAt','2026-09-16T13:00:00Z'))))) LIKE '22023%overbroad_payload%sourceArtifacts%');
SELECT pg_temp.say('9. an artifact linked to an external reference is REFUSED: nothing enters through claim as though observed elsewhere',
  pg_temp.refusal(:'t3', '73c00000-0000-4000-8000-0000000000c3', pg_temp.payload(jsonb_build_object('sourceArtifacts',
    jsonb_build_array(jsonb_build_object('localId','artifact-1','kind','email','origin','user-submitted','provider','forward','receivedAt','2026-09-16T13:00:00Z','contentDigest',repeat('b',64),'externalReferenceLocalId','xref-1','originCreatedAt','2026-09-16T13:00:00Z'))))) LIKE '22023%external_artifact_not_claimable%');
SELECT pg_temp.say('10. an artifact a connector delivered is refused too — no connector exists to have produced one honestly',
  pg_temp.refusal(:'t3', '73c00000-0000-4000-8000-0000000000c4', pg_temp.payload(jsonb_build_object('sourceArtifacts',
    jsonb_build_array(jsonb_build_object('localId','artifact-1','kind','connected-object','origin','connector','provider','gmail','receivedAt','2026-09-16T13:00:00Z','contentDigest',repeat('b',64),'originCreatedAt','2026-09-16T13:00:00Z'))))) LIKE '22023%external_artifact_not_claimable%');
SELECT pg_temp.say('11. none of those refusals left anything behind', NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t3'::uuid));

-- ================= 4. A REAL CLAIM: provenance, artifact, facets, exact money ====================================
SELECT pg_temp.claim_as(:'t4', '73d00000-0000-4000-8000-0000000000c1', pg_temp.payload()) AS result \gset
SELECT pg_temp.say('12. a version 2 claim with an accepted inference and its source artifact completes', (:'result'::jsonb ->> 'status') = 'complete');

SELECT pg_temp.say('13. the artifact arrived, owner-private, with its digest and an opaque content reference — never the content',
  a.kind = 'email' AND a.origin = 'user-submitted' AND a.content_digest = repeat('b', 64) AND a.content_ref = 'blob:email-1' AND a.scope = 'personal' AND a.profile_id = :'t4'::uuid)
FROM public.source_artifacts a WHERE a.local_id = 'artifact-1' AND a.profile_id = :'t4'::uuid;
SELECT pg_temp.say('14. the task keeps its producer, its ESTABLISHED level and its source artifact — the inference was not laundered into a stated fact',
  t.producer = 'ai-inference' AND t.confidence = 'established' AND t.source_artifact_id = a.id)
FROM public.tasks t JOIN public.source_artifacts a ON a.local_id = 'artifact-1' AND a.profile_id = :'t4'::uuid
WHERE t.local_id = 'task-1' AND t.household_id = a.household_id;
SELECT pg_temp.say('15. the task carries its commitment facets: window, chunking, energy, consequence, preparation',
  t.due_at = '2026-09-24T20:00:00Z'::timestamptz AND t.splittable IS TRUE AND t.min_chunk_minutes = 5 AND t.preferred_time_of_day = 'evening'
  AND t.energy_demand = 'low' AND t.consequence = 'high' AND t.needs_me_personally IS TRUE AND t.preparation_minutes = 10)
FROM public.tasks t JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE t.local_id = 'task-1';
SELECT pg_temp.say('16. its value is EXACT: 3500 minor units, USD, outflow — no float on the way',
  t.value_amount_minor = 3500 AND t.value_currency = 'USD' AND t.value_direction = 'outflow')
FROM public.tasks t JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE t.local_id = 'task-1';
SELECT pg_temp.say('17. a facet nobody answered is NULL, not a plausible default',
  t.earliest_start_at IS NULL AND t.latest_finish_at IS NULL AND t.travel_minutes_before IS NULL AND t.travel_minutes_after IS NULL)
FROM public.tasks t JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE t.local_id = 'task-1';
SELECT pg_temp.say('18. the starter category the client also named was ADOPTED, not overwritten: it is still what the server laid down',
  c.producer = 'system-derived')
FROM public.household_categories c JOIN public.household_members m ON m.household_id = c.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE c.local_id = 'cat-money';
SELECT pg_temp.say('19. the id map carries the artifact, so a crashed device can rebuild its mapping',
  (:'result'::jsonb -> 'id_map' ->> 'artifact-1')::uuid = (SELECT id FROM public.source_artifacts WHERE local_id = 'artifact-1' AND profile_id = :'t4'::uuid));
SELECT pg_temp.say('20. the claim records how many artifacts it carried', (row_counts ->> 'source_artifacts') = '1')
FROM public.account_claims WHERE profile_id = :'t4'::uuid;

-- ================= 5. RETRY, REPLAY, DIVERGENCE ======================================================================
SELECT pg_temp.claim_as(:'t4', '73d00000-0000-4000-8000-0000000000c1', pg_temp.payload()) AS retry \gset
SELECT pg_temp.say('21. a retry with the same key returns the same household and the same id map',
  (:'retry'::jsonb ->> 'household_id') = (:'result'::jsonb ->> 'household_id') AND (:'retry'::jsonb -> 'id_map') = (:'result'::jsonb -> 'id_map'));
SELECT pg_temp.say('22. ...and created no second artifact, task or claim',
  (SELECT count(*) FROM public.source_artifacts WHERE profile_id = :'t4'::uuid) = 1
  AND (SELECT count(*) FROM public.tasks t JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE t.local_id = 'task-1') = 1
  AND (SELECT count(*) FROM public.account_claims WHERE profile_id = :'t4'::uuid AND status = 'complete') = 1);
SELECT pg_temp.claim_as(:'t4', '73d00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('title', 'A DIFFERENT title on replay'))) AS diverged \gset
SELECT pg_temp.say('23. a replay whose payload DIFFERS returns the original answer and flags the divergence, never re-applying it',
  (:'diverged'::jsonb ->> 'household_id') = (:'result'::jsonb ->> 'household_id')
  AND (SELECT (row_counts ->> 'retry_payload_diverged')::boolean FROM public.account_claims WHERE profile_id = :'t4'::uuid) IS TRUE
  AND (SELECT t.title FROM public.tasks t JOIN public.household_members m ON m.household_id = t.household_id AND m.profile_id = :'t4'::uuid AND m.role = 'owner' WHERE t.local_id = 'task-1') = 'Pay the $35 trip fee');

-- ================= 6. ALL OR NOTHING ================================================================================
SELECT pg_temp.say('24. a claim that fails PARTWAY rolls back completely — the artifact and the household included',
  pg_temp.refusal(:'t5', '73e00000-0000-4000-8000-0000000000c1', pg_temp.payload('{}'::jsonb, jsonb_build_object('commitment', 'maybe'))) LIKE '23514%');
SELECT pg_temp.say('25. ...nothing of it survives: no household, no artifact, no task, no claim record',
  NOT EXISTS (SELECT 1 FROM public.household_members WHERE profile_id = :'t5'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.source_artifacts WHERE profile_id = :'t5'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.account_claims WHERE profile_id = :'t5'::uuid));

-- ================= 7. A NEEDS ME ITEM AND A ONE MOVE STATE THEIR PROVENANCE TOO =======================================
SELECT pg_temp.claim_as(:'t6', '73f00000-0000-4000-8000-0000000000c1', jsonb_build_object(
  'claimPayloadVersion', 2, 'origin', 'empty', 'childMembers', '[]'::jsonb, 'categories', '[]'::jsonb, 'tasks', '[]'::jsonb,
  'needsMeItems', jsonb_build_array(jsonb_build_object('localId','needsme-1','producer','talk-it-out','sourceArtifactLocalId',NULL,'confidence',NULL,'title','Call the dentist back','status','open','dueDate',NULL,'categoryLocalId',NULL,'originCreatedAt','2026-09-15T08:30:00Z','scope','personal')),
  'oneMoves', jsonb_build_array(jsonb_build_object('localId','onemove-2026-09-17','producer','system-derived','sourceArtifactLocalId',NULL,'confidence',NULL,'logicalDay','2026-09-17','targetType','needsMe','targetLocalId','needsme-1','status','selected','decidedAt','2026-09-17T12:00:00Z','completedAt',NULL)),
  'sourceArtifacts', '[]'::jsonb)) AS r6 \gset
SELECT pg_temp.say('26. a Needs Me item and the One Move that chose it each keep their own producer',
  (SELECT producer FROM public.needs_me_items WHERE profile_id = :'t6'::uuid AND local_id = 'needsme-1') = 'talk-it-out'
  AND (SELECT producer FROM public.one_move_records WHERE profile_id = :'t6'::uuid AND local_id = 'onemove-2026-09-17') = 'system-derived');

-- ================= 8. THE NEW VERSION IS THE ONLY ONE ================================================================
SELECT pg_temp.say('27. an unknown FUTURE version is still refused, not guessed at',
  pg_temp.refusal(:'t7', '73900000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('claimPayloadVersion', 4))) LIKE '22023%unsupported claimPayloadVersion 4%');
SELECT pg_temp.say('28. a demo origin is still refused as a whole, whatever else it states',
  (pg_temp.claim_as(:'t8', '73800000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object('origin', 'demo'))) ->> 'rejected_reason') = 'refused_demo');

-- ================= 9. SEVERAL ROWS DERIVED FROM ONE ARTIFACT =========================================================
-- Regression for PD-005: the closure counted an artifact once per row that named it, so the claim record over-reported
-- what it carried. A document is carried once, however many rows were read out of it.
SELECT pg_temp.claim_as(:'t9', '73700000-0000-4000-8000-0000000000c1', pg_temp.payload(jsonb_build_object(
  'needsMeItems', jsonb_build_array(jsonb_build_object('localId','needsme-1','producer','ai-inference','sourceArtifactLocalId','artifact-1','confidence','established','title','Call the school back','status','open','dueDate',NULL,'categoryLocalId',NULL,'originCreatedAt','2026-09-15T08:30:00Z','scope','personal')),
  'oneMoves', jsonb_build_array(pg_temp.payload() -> 'oneMoves' -> 0,
    jsonb_build_object('localId','onemove-2026-09-17','producer','system-derived','sourceArtifactLocalId',NULL,'confidence',NULL,'logicalDay','2026-09-17','targetType','needsMe','targetLocalId','needsme-1','status','selected','decidedAt','2026-09-17T12:00:00Z','completedAt',NULL)))))  AS r9 \gset
SELECT pg_temp.say('29. a task and a Needs Me item read from ONE artifact carry it, and count it, once',
  (SELECT count(*) FROM public.source_artifacts WHERE profile_id = :'t9'::uuid) = 1
  AND (SELECT count(*) FROM public.tasks WHERE source_artifact_id IS NOT NULL AND household_id IN (SELECT household_id FROM public.household_members WHERE profile_id = :'t9'::uuid)) = 1
  AND (SELECT count(*) FROM public.needs_me_items WHERE source_artifact_id IS NOT NULL AND household_id IN (SELECT household_id FROM public.household_members WHERE profile_id = :'t9'::uuid)) = 1
  AND (SELECT (row_counts ->> 'source_artifacts')::int FROM public.account_claims WHERE profile_id = :'t9'::uuid) = 1);
