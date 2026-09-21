-- HER KEYS — HK-INTEGRATION-READINESS-01 (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260919231500_build4_cloud_schema.sql. That migration is NOT edited and its hash is unchanged.
--
--   HA-010  tasks.duration_source — how far tasks.duration_minutes may be trusted as a fact:
--           'user' | 'default' | 'inferred', or NULL = "provenance never recorded".
--           ADDITIVE and NULLABLE with no default: every existing row keeps NULL, i.e. its uncertainty is preserved
--           (a stored 15 is neither declared user-provided nor declared a default). Nothing is rewritten or discarded.
--   HA-001  claim_local_household — claimPayloadVersion 3 (version 2 is still accepted, unchanged):
--           every child of the household is claimed (a child's mapping can only ever be created here), and a claimed task
--           carries its duration_source. This is CREATE OR REPLACE with the same signature, so grants are preserved.
--   HA-011  needs NO schema change: household_systems.subject_member_id, its composite foreign key to a child of the same
--           household, child_scope_subject_check, the derived subject_member_type trigger, RLS and the INSERT/UPDATE grants
--           all already exist. The client was the side that lacked the field.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): the column drop and the restoration of the shipped v2 function body
-- undo the schema; the provenance values written meanwhile cannot be reconstructed, so rolling back discards that knowledge.
-- No down-migration is shipped because nothing here is applied to a populated environment without the owner.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the function-body digest in the schema fingerprint is identical on every checkout.

BEGIN;

-- ============================================================================
-- 1. tasks.duration_source (HA-010)
-- ============================================================================

ALTER TABLE public.tasks ADD COLUMN duration_source text;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_duration_source_check
  CHECK (duration_source IS NULL OR duration_source = ANY (ARRAY['user'::text, 'default'::text, 'inferred'::text]));

-- Column-level, like every other client-writable column on this table: a client may state where a duration came from
-- when it creates the row and may correct it, exactly as it may correct duration_minutes itself.
GRANT INSERT (duration_source) ON public.tasks TO authenticated;
GRANT UPDATE (duration_source) ON public.tasks TO authenticated;

-- ============================================================================
-- 2. claim_local_household — claimPayloadVersion 3 (HA-001, HA-010)
-- ============================================================================

-- Same signature: this replaces the body and keeps SECURITY DEFINER, the empty search_path and the existing ACL.
-- The comment block of the original (B4-BE02-OR-001 closure, demo refusal, retry semantics) still governs.
CREATE OR REPLACE FUNCTION public.claim_local_household(
  p_claim_key uuid,
  p_timezone  text,
  p_payload   jsonb,
  p_device_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_claim     public.account_claims%ROWTYPE;
  v_household uuid;
  v_boot      jsonb;
  v_today     date;
  v_conflicts jsonb := '[]'::jsonb;
  v_digest    text;

  v_move      jsonb;
  v_obj       jsonb;
  v_existing  record;
  v_found     boolean;

  -- The closure, derived from the One Moves and then used to police the payload.
  v_need_tasks    text[] := '{}'::text[];
  v_need_items    text[] := '{}'::text[];
  v_need_cats     text[] := '{}'::text[];
  v_need_children text[] := '{}'::text[];
  v_need_artifacts text[] := '{}'::text[];
  v_extra         text[];

  v_lid       text;
  v_id        uuid;
  v_cat_id    uuid;
  v_child_id  uuid;
  v_target    uuid;
  v_scope     text;
  v_v3        boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_local_household: no authenticated caller' USING errcode = '28000';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'claim_local_household: payload must be an object' USING errcode = '22023';
  END IF;

  -- One explicit payload version, so a later shape change is a refusal rather
  -- than a silent misread of fields that moved.
  --
  -- Version 2 (B4-FOUNDATION-BUILDOUT-01): every claimed row states its PROVENANCE
  -- (producer, source artifact, confidence), a task carries its commitment facets and
  -- exact value, and the source artifacts the claimed rows were derived from travel with
  -- them. A version 1 payload names none of that, so it is REFUSED -- it cannot be
  -- completed without inventing where each row came from.
  IF COALESCE(p_payload ->> 'claimPayloadVersion', '') NOT IN ('2', '3') THEN
    RAISE EXCEPTION 'claim_local_household: unsupported claimPayloadVersion %',
      COALESCE(p_payload ->> 'claimPayloadVersion', '(absent)') USING errcode = '22023';
  END IF;
  v_v3 := (p_payload ->> 'claimPayloadVersion') = '3';

  -- Fail closed on demo. Not a filter: the whole payload is refused.
  --
  -- The rejection is recorded only when a profile already exists to attach it
  -- to. A demo refusal normally arrives before any account was created, and
  -- account_claims.profile_id references profiles -- so writing a claim row
  -- here would fail on the foreign key and turn a clean refusal into an error.
  -- The refusal itself is what matters, not the bookkeeping.
  IF (p_payload ->> 'origin') IS DISTINCT FROM 'empty' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
      INSERT INTO public.account_claims (profile_id, claim_key, kind, status, rejected_reason)
      VALUES (v_uid, p_claim_key, 'claim', 'rejected', 'refused_demo')
      ON CONFLICT (profile_id, claim_key) DO NOTHING;
    END IF;
    RETURN private.claim_result(NULL, NULL, 'rejected', 'refused_demo');
  END IF;

  -- A COMPLETED claim is authoritative and is never reopened as an incremental
  -- sync transaction (B4-BE02-OR-001 addendum K). The original result and its
  -- mappings come back unchanged; anything she has changed locally since stays
  -- local and belongs to B4-BACKEND-03. Retry is not a back door into sync.
  v_digest := md5(p_payload::text);
  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;
  IF FOUND AND v_claim.status = 'complete' THEN
    IF COALESCE(v_claim.row_counts ->> 'payload_digest', '') <> v_digest THEN
      -- Diagnostic only, in the jsonb column that already exists. No schema
      -- expansion for a diagnostic, and the answer does not change either way.
      UPDATE public.account_claims
         SET row_counts = COALESCE(row_counts, '{}'::jsonb)
                          || jsonb_build_object('retry_payload_diverged', true)
       WHERE id = v_claim.id;
    END IF;
    RETURN private.claim_result(v_claim.household_id, v_claim.id, 'complete', NULL);
  END IF;

  -- Reuse bootstrap for the account skeleton; it is already idempotent.
  --
  -- A rejected bootstrap is returned verbatim and the claim stops here. The
  -- superseded_by_cloud case DOES carry a household_id (the one the account
  -- already owns), so testing the id alone would let a rejected result fall
  -- through and then be marked complete -- which both contradicts B4-P0-031 and
  -- violates the rejected_reason CHECK.
  v_boot := public.bootstrap_account(p_claim_key, p_timezone, p_device_id);
  IF (v_boot ->> 'status') = 'rejected' THEN
    RETURN v_boot;
  END IF;

  v_household := (v_boot ->> 'household_id')::uuid;
  IF v_household IS NULL THEN
    RETURN v_boot;
  END IF;

  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;

  SELECT (now() AT TIME ZONE p.timezone)::date INTO v_today
  FROM public.profiles p WHERE p.id = v_uid;

  -- ==========================================================================
  -- 1. CLOSURE. Derived from the One Moves by the SERVER, never taken on trust.
  -- ==========================================================================
  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb))
  LOOP
    IF (v_move ->> 'targetType') NOT IN ('task', 'needsMe') THEN
      RAISE EXCEPTION 'claim_local_household: One Move % carries unsupported targetType %',
        v_move ->> 'localId', COALESCE(v_move ->> 'targetType', '(absent)')
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'unsupported_target_type',
                                          'one_move_local_id', v_move ->> 'localId',
                                          'target_type', v_move ->> 'targetType')::text;
    END IF;

    IF (v_move ->> 'status') IN ('selected', 'completed') THEN
      IF (v_move ->> 'targetLocalId') IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: One Move % is % but names no target',
          v_move ->> 'localId', v_move ->> 'status'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'missing_target_local_id',
                                            'one_move_local_id', v_move ->> 'localId')::text;
      END IF;
      IF (v_move ->> 'targetType') = 'task' THEN
        v_need_tasks := v_need_tasks || (v_move ->> 'targetLocalId');
      ELSE
        v_need_items := v_need_items || (v_move ->> 'targetLocalId');
      END IF;
    END IF;
  END LOOP;

  -- A carried task pulls in its category (NOT NULL in the cloud) and, when it
  -- names a child subject, that child member. Nothing deeper.
  FOR v_obj IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb))
  LOOP
    IF (v_obj ->> 'localId') = ANY (v_need_tasks) THEN
      IF (v_obj ->> 'categoryLocalId') IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: task % carries no categoryLocalId', v_obj ->> 'localId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'task_missing_category',
                                            'task_local_id', v_obj ->> 'localId')::text;
      END IF;
      v_need_cats := v_need_cats || (v_obj ->> 'categoryLocalId');
      IF (v_obj ->> 'subjectMemberLocalId') IS NOT NULL THEN
        v_need_children := v_need_children || (v_obj ->> 'subjectMemberLocalId');
      END IF;
    END IF;
  END LOOP;

  -- A Needs Me item's category is genuinely optional, so none is invented
  -- merely to populate the closure.
  FOR v_obj IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb))
  LOOP
    IF (v_obj ->> 'localId') = ANY (v_need_items) AND (v_obj ->> 'categoryLocalId') IS NOT NULL THEN
      v_need_cats := v_need_cats || (v_obj ->> 'categoryLocalId');
    END IF;
  END LOOP;

  -- The PROVENANCE CLOSURE. Every carried row must say where it came from, and the
  -- artifacts they name join the closure. A rehearsal's provenance is refused outright,
  -- as the demo origin is: a claim never quietly launders a demo row into a real one.
  FOR v_obj IN
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_tasks)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_items)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_cats)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb)) e
  LOOP
    IF COALESCE(v_obj ->> 'producer', '') = '' THEN
      RAISE EXCEPTION 'claim_local_household: row % states no provenance', v_obj ->> 'localId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_provenance', 'local_id', v_obj ->> 'localId')::text;
    END IF;
    IF (v_obj ->> 'producer') = 'demo-seed' THEN
      RAISE EXCEPTION 'claim_local_household: row % is demo data', v_obj ->> 'localId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'demo_provenance', 'local_id', v_obj ->> 'localId')::text;
    END IF;
    IF (v_obj ->> 'sourceArtifactLocalId') IS NOT NULL THEN
      v_need_artifacts := v_need_artifacts || (v_obj ->> 'sourceArtifactLocalId');
    END IF;
  END LOOP;
  -- Several rows may be derived from one artifact; it is carried, and counted, once.
  v_need_artifacts := COALESCE(ARRAY(SELECT DISTINCT a FROM unnest(v_need_artifacts) AS a ORDER BY a), '{}'::text[]);

  -- VERSION 3 (HK-INTEGRATION-READINESS-01, HA-001). A child's mapping can be created by this function and by nothing else:
  -- household_members has no client write grant, so ordinary sync can never make one. A child outside the One Move closure
  -- (one only a later task, event or System names) would otherwise have no cloud identity, and everything about that child
  -- would stay on the device. Version 3 therefore claims EVERY child the household holds. Version 2 keeps its closure-only rule.
  IF v_v3 THEN
    IF jsonb_array_length(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) > 50 THEN
      RAISE EXCEPTION 'claim_local_household: too many child members'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'too_many_children')::text;
    END IF;
    v_need_children := COALESCE(ARRAY(
      SELECT DISTINCT x
        FROM unnest(v_need_children || ARRAY(
               SELECT c.value ->> 'localId'
                 FROM jsonb_array_elements(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) c)) AS x
       ORDER BY x), '{}'::text[]);
  END IF;

  -- ==========================================================================
  -- 2. BOUNDEDNESS. "Claim is not sync" as an executable invariant.
  --    Extras are REJECTED, not ignored -- ignoring them would let a client
  --    drift into general upload and only find out much later.
  -- ==========================================================================
  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_tasks));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % task(s) no claimed One Move requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'tasks',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_items));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % Needs Me item(s) no claimed One Move requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'needsMeItems',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_cats));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % category/categories no claimed dependency requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'categories',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_children));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % child member(s) no claimed dependency requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'childMembers',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'sourceArtifacts', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_artifacts));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % source artifact(s) no claimed row was derived from', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'sourceArtifacts',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  -- ==========================================================================
  -- 2B. SOURCE ARTIFACTS. Before anything that names one. An artifact linked to an
  --     external reference, or one a connector delivered, is REFUSED: nothing may
  --     enter the cloud through claim as though it had been observed elsewhere, and
  --     no connector exists to have produced one honestly.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_artifacts
  LOOP
    PERFORM 1 FROM public.source_artifacts WHERE household_id = v_household AND profile_id = v_uid AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'sourceArtifacts', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: source artifact % is named by a claimed row but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'sourceArtifacts',
                                          'local_id', v_lid)::text;
    END IF;
    IF (v_obj ->> 'externalReferenceLocalId') IS NOT NULL OR (v_obj ->> 'origin') = 'connector' THEN
      RAISE EXCEPTION 'claim_local_household: source artifact % came from an external system and cannot be claimed', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'external_artifact_not_claimable', 'artifact_local_id', v_lid)::text;
    END IF;

    INSERT INTO public.source_artifacts
      (household_id, local_id, origin_device_id, profile_id, kind, origin, provider, received_at,
       content_digest, content_ref, retracted_at, scope, origin_created_at)
    VALUES (v_household, v_lid, p_device_id, v_uid, v_obj ->> 'kind', v_obj ->> 'origin', v_obj ->> 'provider',
            (v_obj ->> 'receivedAt')::timestamptz, v_obj ->> 'contentDigest', v_obj ->> 'contentRef',
            (v_obj ->> 'retractedAt')::timestamptz, 'personal', (v_obj ->> 'originCreatedAt')::timestamptz)
    ON CONFLICT (household_id, profile_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 3. CHILD MEMBERS. First, because a category or a task may name one.
  --
  -- This is historical-state migration through a trusted path, not a new
  -- general-purpose child-create feature: the child exists in her household
  -- already, and refusing it would fail a valid claim over a UI gap.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_children
  LOOP
    SELECT * INTO v_existing FROM public.household_members
    WHERE household_id = v_household AND local_id = v_lid;

    IF FOUND THEN
      -- Adopt. Never overwrite divergent state to make a retry succeed.
      IF v_existing.member_type <> 'child' THEN
        RAISE EXCEPTION 'claim_local_household: member % already exists and is not a child', v_lid
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'incompatible_existing_member',
                                            'member_local_id', v_lid,
                                            'existing_member_type', v_existing.member_type)::text;
      END IF;
      CONTINUE;
    END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: child member % is required but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'childMembers',
                                          'local_id', v_lid)::text;
    END IF;

    INSERT INTO public.household_members
      (household_id, local_id, origin_device_id, profile_id, member_type, role, display_name, birth_date, scope)
    VALUES (v_household, v_lid, p_device_id, NULL, 'child', 'member',
            v_obj ->> 'displayName', (v_obj ->> 'birthDate')::date, 'child')
    ON CONFLICT (household_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 4. CATEGORIES. The eight starter rows were already seeded by bootstrap with
  --    the same local ids the client uses, so a required starter is ADOPTED
  --    rather than inserted twice. A household's own category is inserted.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_cats
  LOOP
    SELECT * INTO v_existing FROM public.household_categories
    WHERE household_id = v_household AND local_id = v_lid;
    -- Captured NOW. FOUND reflects the LAST query, and the payload lookup below
    -- is a query too: reading FOUND after it would report whether the client
    -- sent the category, not whether the cloud already has it.
    v_found := FOUND;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;

    IF v_found THEN
      -- Compatibility, not overwrite. system_role is semantic identity: a
      -- category that means something different is not the same category.
      IF v_obj IS NOT NULL
         AND v_existing.system_role IS DISTINCT FROM NULLIF(v_obj ->> 'systemRole', '') THEN
        RAISE EXCEPTION 'claim_local_household: category % exists with a different system role', v_lid
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'incompatible_existing_category',
                                            'category_local_id', v_lid,
                                            'existing_system_role', v_existing.system_role,
                                            'incoming_system_role', v_obj ->> 'systemRole')::text;
      END IF;
      CONTINUE;
    END IF;

    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: category % is required but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'categories',
                                          'local_id', v_lid)::text;
    END IF;

    v_scope := v_obj ->> 'scope';
    -- A child-scoped cloud category must name its child, and the local category
    -- model has no subject field to name one with. Refusing is honest; inventing
    -- a subject would not be.
    IF v_scope = 'child' THEN
      RAISE EXCEPTION 'claim_local_household: category % is child-scoped and cannot be claimed', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'child_scoped_category_not_claimable',
                                          'category_local_id', v_lid)::text;
    END IF;

    BEGIN
      INSERT INTO public.household_categories
        (household_id, local_id, origin_device_id, owner_profile_id, name, system_role, status, sort_order, scope,
         producer, source_artifact_id, confidence)
      VALUES (v_household, v_lid, p_device_id,
              CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
              v_obj ->> 'name', NULLIF(v_obj ->> 'systemRole', ''), v_obj ->> 'status',
              (v_obj ->> 'sortOrder')::integer, v_scope,
              v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
              v_obj ->> 'confidence')
      ON CONFLICT (household_id, local_id) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      -- sort_order and system_role carry their own NON-DEFERRABLE uniqueness.
      -- A collision is a real conflict in her data, reported rather than nudged
      -- aside by renumbering something she chose.
      RAISE EXCEPTION 'claim_local_household: category % collides with an existing category', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'category_uniqueness_conflict',
                                          'category_local_id', v_lid,
                                          'sort_order', v_obj ->> 'sortOrder',
                                          'system_role', v_obj ->> 'systemRole')::text;
    END;
  END LOOP;

  -- ==========================================================================
  -- 5. TASK TARGETS. Canonical domain state is preserved: a completed task
  --    arrives completed, with its completion time, not reset to open.
  --    Server-owned fields (id, revision, timestamps, subject_member_type) are
  --    never taken from the payload.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_tasks
  LOOP
    PERFORM 1 FROM public.tasks WHERE household_id = v_household AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: task % is a One Move target but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'tasks',
                                          'local_id', v_lid)::text;
    END IF;

    SELECT id INTO v_cat_id FROM public.household_categories
    WHERE household_id = v_household AND local_id = (v_obj ->> 'categoryLocalId');
    IF v_cat_id IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: task % names category % which did not resolve',
        v_lid, v_obj ->> 'categoryLocalId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'unresolved_category', 'task_local_id', v_lid,
                                          'category_local_id', v_obj ->> 'categoryLocalId')::text;
    END IF;

    v_child_id := NULL;
    IF (v_obj ->> 'subjectMemberLocalId') IS NOT NULL THEN
      SELECT id INTO v_child_id FROM public.household_members
      WHERE household_id = v_household AND local_id = (v_obj ->> 'subjectMemberLocalId')
        AND member_type = 'child';
      IF v_child_id IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: task % names child % which did not resolve',
          v_lid, v_obj ->> 'subjectMemberLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_child_member', 'task_local_id', v_lid,
                                            'member_local_id', v_obj ->> 'subjectMemberLocalId')::text;
      END IF;
    END IF;

    v_scope := v_obj ->> 'scope';
    INSERT INTO public.tasks
      (household_id, local_id, origin_device_id, owner_profile_id, title, category_id,
       subject_member_id, duration_minutes, commitment, due_date, plan_kind, planned_date,
       planned_starts_at, notes, status, completed_at, scope, origin_created_at, origin_updated_at,
       producer, source_artifact_id, confidence,
       due_at, earliest_start_at, latest_finish_at, splittable, min_chunk_minutes, preferred_time_of_day,
       energy_demand, consequence, needs_me_personally, travel_minutes_before, travel_minutes_after,
       preparation_minutes, value_amount_minor, value_currency, value_direction,
       duration_source)
    VALUES (v_household, v_lid, p_device_id,
            CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
            v_obj ->> 'title', v_cat_id, v_child_id,
            (v_obj ->> 'durationMinutes')::integer, v_obj ->> 'commitment',
            (v_obj ->> 'dueDate')::date, v_obj ->> 'planKind',
            (v_obj ->> 'plannedDate')::date, (v_obj ->> 'plannedStartsAt')::timestamptz,
            v_obj ->> 'notes', v_obj ->> 'status', (v_obj ->> 'completedAt')::timestamptz,
            v_scope, (v_obj ->> 'originCreatedAt')::timestamptz, (v_obj ->> 'originUpdatedAt')::timestamptz,
            v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
            v_obj ->> 'confidence',
            -- The commitment facets travel with the task. NULL means "not known", and stays NULL.
            (v_obj ->> 'dueAt')::timestamptz, (v_obj ->> 'earliestStartAt')::timestamptz,
            (v_obj ->> 'latestFinishAt')::timestamptz, (v_obj ->> 'splittable')::boolean,
            (v_obj ->> 'minChunkMinutes')::integer, v_obj ->> 'preferredTimeOfDay',
            v_obj ->> 'energyDemand', v_obj ->> 'consequence', (v_obj ->> 'needsMePersonally')::boolean,
            (v_obj ->> 'travelMinutesBefore')::integer, (v_obj ->> 'travelMinutesAfter')::integer,
            (v_obj ->> 'preparationMinutes')::integer,
            (v_obj -> 'value' ->> 'amountMinor')::bigint, v_obj -> 'value' ->> 'currency',
            v_obj -> 'value' ->> 'direction',
            -- NULL means "never recorded". A version 2 payload names no source and none is invented for it.
            CASE WHEN v_v3 THEN NULLIF(v_obj ->> 'durationSource', '') ELSE NULL END)
    ON CONFLICT (household_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 6. NEEDS ME TARGETS.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_items
  LOOP
    PERFORM 1 FROM public.needs_me_items
    WHERE household_id = v_household AND profile_id = v_uid AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: Needs Me item % is a One Move target but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'needsMeItems',
                                          'local_id', v_lid)::text;
    END IF;

    v_cat_id := NULL;
    IF (v_obj ->> 'categoryLocalId') IS NOT NULL THEN
      SELECT id INTO v_cat_id FROM public.household_categories
      WHERE household_id = v_household AND local_id = (v_obj ->> 'categoryLocalId');
      IF v_cat_id IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: Needs Me item % names category % which did not resolve',
          v_lid, v_obj ->> 'categoryLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_category', 'needs_me_local_id', v_lid,
                                            'category_local_id', v_obj ->> 'categoryLocalId')::text;
      END IF;
    END IF;

    INSERT INTO public.needs_me_items
      (household_id, local_id, origin_device_id, profile_id, title, status, due_date,
       category_id, scope, origin_created_at, producer, source_artifact_id, confidence)
    VALUES (v_household, v_lid, p_device_id, v_uid, v_obj ->> 'title', v_obj ->> 'status',
            (v_obj ->> 'dueDate')::date, v_cat_id, COALESCE(v_obj ->> 'scope', 'personal'),
            (v_obj ->> 'originCreatedAt')::timestamptz,
            v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
            v_obj ->> 'confidence')
    ON CONFLICT (household_id, profile_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 7. HISTORICAL ONE MOVE ROWS, now that every target exists.
  --
  -- A retry meets rows it already wrote, so a raw unique violation is not
  -- acceptable: an identical row is an idempotent replay, and a material
  -- mismatch is preserved as conflict evidence rather than overwriting a
  -- decision she already made (B4-P0-021).
  -- ==========================================================================
  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb))
  LOOP
    IF (v_move ->> 'logicalDay')::date > v_today THEN
      RAISE EXCEPTION 'claim_local_household: future logical_day %', v_move ->> 'logicalDay'
        USING errcode = '22007';
    END IF;

    v_target := NULL;
    IF (v_move ->> 'status') IN ('selected', 'completed') THEN
      IF (v_move ->> 'targetType') = 'task' THEN
        SELECT id INTO v_target FROM public.tasks
        WHERE household_id = v_household AND local_id = (v_move ->> 'targetLocalId');
      ELSE
        SELECT id INTO v_target FROM public.needs_me_items
        WHERE household_id = v_household AND profile_id = v_uid AND local_id = (v_move ->> 'targetLocalId');
      END IF;
      IF v_target IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: One Move % target % did not resolve',
          v_move ->> 'localId', v_move ->> 'targetLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_one_move_target',
                                            'one_move_local_id', v_move ->> 'localId',
                                            'target_type', v_move ->> 'targetType',
                                            'target_local_id', v_move ->> 'targetLocalId')::text;
      END IF;
    END IF;

    SELECT * INTO v_existing FROM public.one_move_records
    WHERE household_id = v_household AND profile_id = v_uid
      AND logical_day = (v_move ->> 'logicalDay')::date;

    IF FOUND THEN
      IF v_existing.status IS DISTINCT FROM (v_move ->> 'status')
         OR v_existing.target_task_id IS DISTINCT FROM
              (CASE WHEN (v_move ->> 'targetType') = 'task' THEN v_target ELSE NULL END)
         OR v_existing.target_needs_me_id IS DISTINCT FROM
              (CASE WHEN (v_move ->> 'targetType') = 'needsMe' THEN v_target ELSE NULL END) THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'logical_day', v_move ->> 'logicalDay',
          'stored',      jsonb_build_object('status', v_existing.status,
                                            'target_task_id', v_existing.target_task_id,
                                            'target_needs_me_id', v_existing.target_needs_me_id),
          'incoming',    v_move);
      END IF;
      CONTINUE;  -- identical row: idempotent replay, nothing to do
    END IF;

    INSERT INTO public.one_move_records
      (household_id, local_id, origin_device_id, profile_id, logical_day,
       target_type, target_task_id, target_needs_me_id, status, decided_at, completed_at, cleared_at,
       producer, source_artifact_id, confidence)
    VALUES (
      v_household,
      v_move ->> 'localId',
      p_device_id,
      v_uid,
      (v_move ->> 'logicalDay')::date,
      v_move ->> 'targetType',
      CASE WHEN (v_move ->> 'targetType') = 'task'    THEN v_target ELSE NULL END,
      CASE WHEN (v_move ->> 'targetType') = 'needsMe' THEN v_target ELSE NULL END,
      v_move ->> 'status',
      (v_move ->> 'decidedAt')::timestamptz,
      (v_move ->> 'completedAt')::timestamptz,
      (v_move ->> 'clearedAt')::timestamptz,
      v_move ->> 'producer',
      private.claim_artifact_id(v_household, v_uid, v_move ->> 'sourceArtifactLocalId'),
      v_move ->> 'confidence');
  END LOOP;

  UPDATE public.account_claims
     SET status = 'complete', household_id = v_household,
         row_counts = COALESCE(row_counts, '{}'::jsonb) || jsonb_build_object(
           'conflicts',      jsonb_array_length(v_conflicts),
           'child_members',  COALESCE(array_length(v_need_children, 1), 0),
           'categories',     COALESCE(array_length(v_need_cats, 1), 0),
           'tasks',          COALESCE(array_length(v_need_tasks, 1), 0),
           'needs_me_items', COALESCE(array_length(v_need_items, 1), 0),
           'one_moves',      jsonb_array_length(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb)),
           'source_artifacts', COALESCE(array_length(v_need_artifacts, 1), 0),
           'payload_digest', v_digest,
           'payload_version', (p_payload ->> 'claimPayloadVersion')::integer)
   WHERE id = v_claim.id;

  RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL)
         || jsonb_build_object('conflict_evidence', v_conflicts);
END;
$fn$;

-- The ACL is preserved by CREATE OR REPLACE; stating it again makes the intent explicit and keeps the fail-closed gate honest.
REVOKE ALL ON FUNCTION public.claim_local_household(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_local_household(uuid, text, jsonb, uuid) TO authenticated;

-- Fail closed, as the shipping migration does: a mistake above cannot complete.
SELECT private.assert_app_schema_secured();

COMMIT;
