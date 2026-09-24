-- HER KEYS — environment function convergence
-- Source authority: certified F01-F13 integration baseline 6cc0d7754f2f8018681d9a0843b5dbeca84cb059.
-- Non-destructive: CREATE OR REPLACE only. Reconciles function-body drift
-- between Staging and Production without changing tables, data, policies,
-- grants, indexes, or triggers.
BEGIN;

-- private.assert_app_schema_secured
CREATE OR REPLACE FUNCTION private.assert_app_schema_secured()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  offenders text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    IF NOT r.relrowsecurity THEN
      offenders := offenders || format('%s: RLS not enabled', r.relname);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = r.oid) THEN
      offenders := offenders || format('%s: RLS enabled but no policy exists', r.relname);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c2
      WHERE c2.oid = r.oid
        AND has_table_privilege('anon', c2.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    ) THEN
      offenders := offenders || format('%s: anon holds a table privilege', r.relname);
    END IF;
  END LOOP;

  -- Functions have no RLS, so an inherited EXECUTE grant is the sharper hazard.
  -- PostgreSQL will not let the hardwired PUBLIC EXECUTE default be revoked, so
  -- this is where that property is actually enforced: a function that arrives
  -- with PUBLIC or anon EXECUTE aborts the migration that created it.
  FOR r IN
    SELECT n.nspname, p.proname, p.proacl
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
  LOOP
    IF r.proacl IS NULL THEN
      offenders := offenders || format('%s.%s: default ACL leaves EXECUTE to PUBLIC', r.nspname, r.proname);
    ELSIF EXISTS (
      SELECT 1 FROM aclexplode(r.proacl) a
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'))
    ) THEN
      offenders := offenders || format('%s.%s: EXECUTE held by PUBLIC or anon', r.nspname, r.proname);
    END IF;
  END LOOP;

  IF array_length(offenders, 1) > 0 THEN
    RAISE EXCEPTION
      'Her Keys schema assertion FAILED, migration aborted: %',
      array_to_string(offenders, '; ');
  END IF;
END;
$fn$;

-- private.insert_starter_categories
CREATE OR REPLACE FUNCTION private.insert_starter_categories(p_household_id uuid, p_profile_id uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  -- The starter set is structure Her Keys lays down, not something she told it: producer
  -- 'system-derived', the same answer the local pristine state gives.
  INSERT INTO public.household_categories
    (household_id, local_id, owner_profile_id, name, system_role, status, sort_order, scope, producer)
  VALUES
    (p_household_id, 'cat-kids',          NULL,         'Kids',          'kids',          'active', 0, 'household',       'system-derived'),
    (p_household_id, 'cat-home',          NULL,         'Home',          'home',          'active', 1, 'household',       'system-derived'),
    (p_household_id, 'cat-money',         NULL,         'Money',         'money',         'active', 2, 'household',       'system-derived'),
    (p_household_id, 'cat-meals',         NULL,         'Meals',         'meals',         'active', 3, 'household',       'system-derived'),
    (p_household_id, 'cat-work',          p_profile_id, 'Work',          'work',          'active', 4, 'professional',    'system-derived'),
    (p_household_id, 'cat-wellbeing',     p_profile_id, 'Wellbeing',     'wellbeing',     'active', 5, 'personal',        'system-derived'),
    (p_household_id, 'cat-relationships', p_profile_id, 'Relationships', 'relationships', 'active', 6, 'personal',        'system-derived'),
    (p_household_id, 'cat-coparenting',   p_profile_id, 'Co-parenting',  'coparenting',   'active', 7, 'coparent-shared', 'system-derived');
$fn$;

-- private.push_household_child
CREATE OR REPLACE FUNCTION private.push_household_child(
  p_device_id uuid,
  p_row       jsonb,
  OUT o_id       uuid,
  OUT o_revision bigint
)
  RETURNS record
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid      uuid := (SELECT auth.uid());
  v_house    uuid;
  v_key      text;
  v_children integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'push_household_child: no authenticated caller' USING errcode = '28000';
  END IF;

  -- The only columns a person states about a child. `origin_device_id` is accepted because sync_push always stamps it, but its value is
  -- ignored: the device is the p_device_id sync_push was called with. Everything else is server-owned and refused, not stripped.
  FOR v_key IN SELECT jsonb_object_keys(p_row)
  LOOP
    IF v_key <> ALL (ARRAY['household_id', 'local_id', 'origin_device_id', 'member_type', 'display_name', 'birth_date', 'scope']) THEN
      RAISE EXCEPTION 'permission denied for column % of relation household_members', v_key USING errcode = '42501';
    END IF;
  END LOOP;

  -- A child, and nothing else: never an adult (an adult member IS an account), never another scope.
  IF (p_row ->> 'member_type') IS DISTINCT FROM 'child' OR (p_row ->> 'scope') IS DISTINCT FROM 'child' THEN
    RAISE EXCEPTION 'push_household_child: only a child member can be added here' USING errcode = '42501';
  END IF;

  v_house := (p_row ->> 'household_id')::uuid;
  IF v_house IS NULL OR NOT private.is_household_owner(v_house) THEN
    RAISE EXCEPTION 'push_household_child: only the owner of the household may add a child' USING errcode = '42501';
  END IF;

  -- Serialise on the household so the bound below cannot be raced past by two devices.
  PERFORM 1 FROM public.households WHERE id = v_house FOR UPDATE;

  SELECT count(*) INTO v_children
    FROM public.household_members
   WHERE household_id = v_house AND member_type = 'child';
  IF v_children >= 20 THEN
    RAISE EXCEPTION 'push_household_child: a household holds at most 20 children'
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'too_many_children')::text;
  END IF;

  -- The table's own CHECKs decide the rest: a child has a normalised name of 1..80 characters, a birth date, scope 'child' and no
  -- account. `role` is the column default's value stated explicitly, so it can never come from the caller.
  INSERT INTO public.household_members
    (household_id, local_id, origin_device_id, profile_id, member_type, role, display_name, birth_date, scope)
  VALUES
    (v_house, p_row ->> 'local_id', p_device_id, NULL, 'child', 'member',
     p_row ->> 'display_name', (p_row ->> 'birth_date')::date, 'child')
  RETURNING id, revision INTO o_id, o_revision;
END;
$fn$;

-- public.bootstrap_account
CREATE OR REPLACE FUNCTION public.bootstrap_account(
  p_claim_key uuid,
  p_timezone  text,
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
  v_replay    boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bootstrap_account: no authenticated caller' USING errcode = '28000';
  END IF;
  IF NOT private.is_valid_timezone(p_timezone) THEN
    RAISE EXCEPTION 'bootstrap_account: % is not a usable IANA timezone', p_timezone USING errcode = '22023';
  END IF;

  -- Replay of the same request returns the same answer.
  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;
  v_replay := FOUND;

  IF v_replay AND v_claim.status = 'complete' THEN
    RETURN private.claim_result(v_claim.household_id, v_claim.id, 'complete', NULL);
  END IF;

  SELECT hm.household_id INTO v_household
  FROM public.household_members hm
  WHERE hm.profile_id = v_uid AND hm.role = 'owner';

  IF v_household IS NOT NULL THEN
    -- The account already has a household. Which answer is correct depends
    -- entirely on whether this is the SAME request coming back.
    IF v_replay THEN
      -- RESUME. The client crashed before recording success, so the skeleton
      -- exists but the claim never closed. Treating this as a duplicate would
      -- turn ordinary crash recovery into a permanent refusal, which is the
      -- opposite of what the idempotency key is for.
      UPDATE public.account_claims
         SET status = 'complete', household_id = v_household
       WHERE id = v_claim.id;
      RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL);
    END IF;

    -- A genuinely NEW request on an account that already owns a household
    -- resolves to it and never creates a second one (B4-P0-031, SD4-023).
    INSERT INTO public.account_claims (profile_id, claim_key, kind, status, household_id, rejected_reason)
    VALUES (v_uid, p_claim_key, 'bootstrap', 'rejected', v_household, 'superseded_by_cloud')
    ON CONFLICT (profile_id, claim_key) DO NOTHING;
    RETURN private.claim_result(v_household, NULL, 'rejected', 'superseded_by_cloud');
  END IF;

  -- The profile must exist before the claim row, which references it.
  INSERT INTO public.profiles (id, timezone) VALUES (v_uid, p_timezone)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.account_claims (profile_id, claim_key, kind, status)
  VALUES (v_uid, p_claim_key, 'bootstrap', 'in_progress')
  ON CONFLICT (profile_id, claim_key) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_claim;

  INSERT INTO public.households (local_id, origin_device_id)
  VALUES ('household-1', p_device_id)
  RETURNING id INTO v_household;

  INSERT INTO public.household_members
    (household_id, local_id, origin_device_id, profile_id, member_type, role, display_name, scope)
  VALUES (v_household, 'user-1', p_device_id, v_uid, 'adult', 'owner', NULL, 'personal');

  PERFORM private.insert_starter_categories(v_household, v_uid);

  INSERT INTO public.onboarding_state (household_id, profile_id, producer)
  VALUES (v_household, v_uid, 'onboarding');

  UPDATE public.account_claims
     SET status = 'complete', household_id = v_household, row_counts = jsonb_build_object('categories', 8)
   WHERE id = v_claim.id;

  RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL);
END;
$fn$;

-- public.claim_local_household
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

-- public.forbid_dependency_cycle
CREATE OR REPLACE FUNCTION public.forbid_dependency_cycle()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  v_from  text;
  v_to    text;
  v_found boolean;
BEGIN
  IF new.status <> 'active' OR new.relation = 'alternative_to' THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dependencies:' || new.household_id::text, 0));

  v_from := new.from_type || ':' || COALESCE(new.from_task_id, new.from_event_id, new.from_needs_me_id,
                                              new.from_system_id, new.from_meal_id, new.from_goal_id)::text;
  v_to   := new.to_type   || ':' || COALESCE(new.to_task_id, new.to_event_id, new.to_needs_me_id,
                                              new.to_system_id, new.to_meal_id, new.to_goal_id)::text;

  -- A thing that requires itself is refused by the table's own not_self_check, which names it precisely.
  IF v_from = v_to THEN
    RETURN new;
  END IF;

  WITH RECURSIVE walk(node) AS (
    SELECT v_to
    UNION
    SELECT d.to_type || ':' || COALESCE(d.to_task_id, d.to_event_id, d.to_needs_me_id,
                                         d.to_system_id, d.to_meal_id, d.to_goal_id)::text
    FROM walk w
    JOIN public.dependencies d
      ON d.household_id = new.household_id
     AND d.profile_id   = new.profile_id
     AND d.status       = 'active'
     AND d.relation    <> 'alternative_to'
     AND d.id IS DISTINCT FROM new.id
     AND (d.from_type || ':' || COALESCE(d.from_task_id, d.from_event_id, d.from_needs_me_id,
                                          d.from_system_id, d.from_meal_id, d.from_goal_id)::text) = w.node
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE node = v_from) INTO v_found;

  IF v_found THEN
    RAISE EXCEPTION 'dependencies: % requiring % would close a cycle', v_from, v_to
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

-- public.guard_execution_authorization
CREATE OR REPLACE FUNCTION public.guard_execution_authorization()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  i          public.action_intents%ROWTYPE;
  d          public.intent_decisions%ROWTYPE;
  a          public.automation_authorities%ROWTYPE;
  v_standing uuid;
  v_withdrawn boolean;
  v_category uuid;
  v_subject  uuid;
  v_reason   text;
  v_rank     text[] := ARRAY['low', 'moderate', 'high', 'critical'];
BEGIN
  SELECT * INTO i FROM public.action_intents WHERE id = new.intent_id;

  IF NOT FOUND THEN
    v_reason := 'no_such_intent';

  ELSIF new.decision_id IS NOT NULL THEN
    SELECT * INTO d FROM public.intent_decisions WHERE id = new.decision_id;
    IF NOT FOUND OR d.intent_id <> i.id THEN
      v_reason := 'wrong_intent';
    ELSE
      SELECT x.id INTO v_standing
      FROM public.intent_decisions x
      WHERE x.intent_id = i.id AND x.decision <> 'withdrawn'
      ORDER BY x.created_at, x.id LIMIT 1;
      SELECT EXISTS (SELECT 1 FROM public.intent_decisions x
                     WHERE x.intent_id = i.id AND x.decision = 'withdrawn') INTO v_withdrawn;
      IF NOT (d.decision = 'approved' AND v_standing = d.id AND NOT v_withdrawn) THEN
        v_reason := 'not_approved';
      END IF;
    END IF;

  ELSIF new.authority_id IS NOT NULL THEN
    SELECT * INTO a FROM public.automation_authorities WHERE id = new.authority_id;
    IF NOT FOUND THEN
      v_reason := 'no_authorization';
    ELSIF a.mode <> 'execute_authorized' THEN
      v_reason := 'not_execute_mode';
    ELSE
      -- What an authority's boundary is measured against: the category, and for a
      -- task or an event the child, of the row the intent is about (intentContext()).
      IF i.about_type = 'task' THEN
        SELECT t.category_id, t.subject_member_id INTO v_category, v_subject FROM public.tasks t WHERE t.id = i.about_task_id;
      ELSIF i.about_type = 'event' THEN
        SELECT e.category_id, e.subject_member_id INTO v_category, v_subject FROM public.events e WHERE e.id = i.about_event_id;
      ELSIF i.about_type = 'needsMe' THEN
        SELECT n.category_id INTO v_category FROM public.needs_me_items n WHERE n.id = i.about_needs_me_id;
      ELSIF i.about_type = 'system' THEN
        SELECT s.category_id INTO v_category FROM public.household_systems s WHERE s.id = i.about_system_id;
      ELSIF i.about_type = 'meal' THEN
        SELECT m.category_id INTO v_category FROM public.meal_plan_entries m WHERE m.id = i.about_meal_id;
      ELSIF i.about_type = 'goal' THEN
        SELECT g.category_id INTO v_category FROM public.goals g WHERE g.id = i.about_goal_id;
      END IF;

      v_reason := CASE
        WHEN a.revoked_at IS NOT NULL AND a.revoked_at <= new.attempted_at THEN 'revoked'
        WHEN a.granted_at > new.attempted_at THEN 'not_yet_granted'
        WHEN a.expires_at IS NOT NULL AND a.expires_at <= new.attempted_at THEN 'expired'
        WHEN a.category <> i.category THEN 'wrong_category'
        WHEN array_position(v_rank, i.consequence) > array_position(v_rank, a.max_consequence) THEN 'consequence_exceeds_authority'
        WHEN a.category_id IS NOT NULL AND a.category_id IS DISTINCT FROM v_category THEN 'outside_category_boundary'
        WHEN a.subject_member_id IS NOT NULL AND a.subject_member_id IS DISTINCT FROM v_subject THEN 'outside_child_boundary'
        WHEN a.provider IS NOT NULL AND a.provider IS DISTINCT FROM i.provider THEN 'outside_provider_boundary'
        WHEN a.max_amount_minor IS NOT NULL AND i.amount_amount_minor IS NOT NULL
             AND (i.amount_currency IS DISTINCT FROM a.max_amount_currency
                  OR i.amount_amount_minor > a.max_amount_minor) THEN 'exceeds_amount_limit'
        WHEN NOT a.persistent
             AND EXISTS (SELECT 1 FROM public.action_executions e WHERE e.authority_id = a.id) THEN 'already_used'
        ELSE NULL
      END;
    END IF;

  ELSE
    v_reason := 'no_authorization';
  END IF;

  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'action_executions: not authorized (%)', v_reason
      USING errcode = '42501', detail = v_reason;
  END IF;
  RETURN new;
END;
$fn$;

-- public.log_row_change
CREATE OR REPLACE FUNCTION public.log_row_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_row     jsonb;
  v_house   uuid;
  v_owner   uuid;
  v_id      uuid;
  v_op      text;
  v_rev     bigint;
BEGIN
  v_row := to_jsonb(coalesce(new, old));

  -- TG_ARGV[0] names the column carrying the household id ('id' for households itself).
  v_house := (v_row ->> TG_ARGV[0])::uuid;

  -- TG_ARGV[1], when present, names the owning-profile column for owner-scoped pulls.
  IF TG_NARGS > 1 AND v_row ? TG_ARGV[1] THEN
    v_owner := (v_row ->> TG_ARGV[1])::uuid;
  END IF;

  IF v_row ? 'id' THEN
    v_id := (v_row ->> 'id')::uuid;
  ELSE
    -- onboarding_state has no surrogate key; its identity is (household, profile).
    v_id := (v_row ->> 'profile_id')::uuid;
  END IF;

  IF v_row ? 'revision' THEN
    v_rev := (v_row ->> 'revision')::bigint;
  END IF;

  v_op := CASE
            WHEN tg_op = 'DELETE' THEN 'tombstone'
            WHEN v_row ? 'deleted_at' AND v_row ->> 'deleted_at' IS NOT NULL THEN 'tombstone'
            ELSE 'upsert'
          END;

  INSERT INTO public.change_log
    (household_id, owner_profile_id, entity_table, entity_id, op, row_revision)
  VALUES
    (v_house, v_owner, tg_table_name, v_id, v_op, v_rev);

  RETURN NULL;
END;
$fn$;

-- public.set_one_move_logical_day
CREATE OR REPLACE FUNCTION public.set_one_move_logical_day()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_timezone text;
  v_today    date;
BEGIN
  IF tg_op = 'UPDATE' THEN
    new.logical_day          = old.logical_day;
    new.timezone_at_decision = old.timezone_at_decision;
    RETURN new;
  END IF;

  SELECT p.timezone INTO v_timezone
  FROM public.profiles p
  WHERE p.id = new.profile_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'one_move_records: no profile timezone for profile %', new.profile_id;
  END IF;

  v_today := (now() AT TIME ZONE v_timezone)::date;
  new.timezone_at_decision := v_timezone;

  -- Which path this is, is decided by the PRIVILEGE system, not by re-deriving
  -- trust here.
  --
  -- logical_day carries no INSERT or UPDATE grant for `authenticated`, so an
  -- ordinary client physically cannot supply one: it always arrives NULL and the
  -- server derives it. A value can only be present when the caller held the
  -- privilege to write it, which is the SECURITY DEFINER claim RPC.
  --
  -- Calling private.is_trusted_server_context() here would be worse than
  -- redundant: this trigger is itself SECURITY DEFINER owned by postgres, so
  -- inside it current_user is ALWAYS postgres and the predicate would always
  -- return true -- silently turning every live client write into a historical
  -- backfill. The column grant is the boundary that actually distinguishes them.
  IF new.logical_day IS NULL THEN
    new.logical_day := v_today;
  ELSIF new.logical_day > v_today THEN
    RAISE EXCEPTION
      'one_move_records: a future logical_day % was supplied (account today is %)',
      new.logical_day, v_today;
  END IF;

  RETURN new;
END;
$fn$;

COMMIT;
