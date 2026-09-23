-- HER KEYS — HK-FEATURE-05 closeout repair: adding a child AFTER the household is bound to an account
-- (owner checkpoint OC-01, RESOLVED by the owner; additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260921120000_ir01_duration_source_and_claim_v3.sql. Neither earlier migration is edited and their hashes are unchanged.
--
-- THE PROBLEM. A child's cloud identity (a `household_members` row, member_type = 'child') could be created by the claim and by nothing
-- else: the table has no client INSERT grant and no INSERT policy, `sync_push` is SECURITY INVOKER (so it can only write what the
-- caller may write), and a claim runs once per account. A child added after binding therefore had no cloud identity, and every task,
-- event or routine that named that child stayed on the device.
--
-- THE REPAIR, AND WHAT IT DELIBERATELY IS NOT.
--   * NO table change, NO column, NO constraint, NO index, NO grant, NO policy. `household_members` stays SELECT-only to a client;
--     a direct INSERT or UPDATE is still refused (privilege and policy), exactly as before.
--   * ONE new function, private.push_household_child, SECURITY DEFINER with an empty search_path. It is not reachable through
--     PostgREST (the `private` schema is not exposed); its only caller is public.sync_push, below. It admits exactly one thing: the
--     OWNER of a household adds a plain child, stating only what a person states about a child.
--   * public.sync_push is replaced (same signature, so its ACL is preserved) so that `household_members` is a pushable table whose
--     INSERT is delegated to that function. It stays SECURITY INVOKER for every other table, and for this one everything up to the
--     insert (authentication, the household-membership probe, the SD4-006 collision semantics) is unchanged and reused. So a child
--     is created through the SAME entry point as every other synchronized row, and a lost acknowledgement settles as
--     `already_exists` instead of duplicating.
--   * No update path. A child's name and birth date are not editable by a client (there is no rename), so nothing new is granted for one.
--
-- AUTHORITY. Only the household OWNER may add a child (private.is_household_owner, the helper every owner-only rule already uses).
-- A second member of the household reads the child through the existing SELECT policy and cannot create one. Anything else on the row
-- (id, role, profile_id, revision, created_at, updated_at, an adult member_type) is refused with 42501, the way a column outside a
-- client's grant already is: a child is never given an account, a role or a server-owned value by a client.
--
-- BOUND. A household holds at most 20 children. That is the local state's own bound (AppStateSchema.children.max(20)); the server
-- never had one, so a client could otherwise create a household that another device cannot hydrate. Concurrent adds serialise on the
-- household row, so two devices cannot both take the last place.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): dropping private.push_household_child and restoring the shipped sync_push body from
-- 20260919231500_build4_cloud_schema.sql undo it; any child created meanwhile is an ordinary household_members row and stays.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the function-body digest in the schema fingerprint is identical on every checkout.

BEGIN;

-- ============================================================================
-- 1. private.push_household_child — the one writer of a client-stated child
-- ============================================================================

CREATE FUNCTION private.push_household_child(
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

REVOKE ALL ON FUNCTION private.push_household_child(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.push_household_child(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 2. public.sync_push — household_members becomes a pushable table (children only)
-- ============================================================================
--
-- Same signature and same body as 20260919231500_build4_cloud_schema.sql, with exactly three differences, each marked (F05):
--   (1) `household_members` is on the allow-list;
--   (2) for that table the collision probe looks at CHILD rows only, so the account holder's own member row can never be reported as
--       "the row you already created" and mapped to a child;
--   (3) for that table the INSERT is delegated to private.push_household_child instead of running as the caller.
-- It stays SECURITY INVOKER (B4-P0-025, asserted by 74-sync-push.sql): for every other table the insert still happens as the CALLER.

CREATE OR REPLACE FUNCTION public.sync_push(
  p_entity_table text,
  p_device_id    uuid,
  p_row          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_house      uuid;
  v_local      text;
  v_owner_private boolean;
  v_owner_col  text;
  v_has_revision boolean;
  v_found_id   uuid;
  v_found_rev  bigint;
  v_found_dev  uuid;
  v_id         uuid;
  v_rev        bigint;
  v_local_out  text;
  v_status     text := 'created';
  v_clean      jsonb;
  v_cols       text;
  v_sel        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sync_push: no authenticated caller' USING errcode = '28000';
  END IF;
  IF jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'sync_push: row must be an object' USING errcode = '22023';
  END IF;

  -- An allow-list, not a pattern. A table named by the client must be one this
  -- function was built for, or the dynamic SQL below becomes a way to reach
  -- tables the push path has no business in.
  -- Which column carries the owner half of the uniqueness boundary, when the
  -- table has one. The ledger names it actor_profile_id, because the question
  -- it answers is who ACTED, not who owns.
  --
  -- Foundation tables (B4-FOUNDATION-BUILDOUT-01) are owner-private, so they key on
  -- profile_id. Executions and outcomes are ABSENT: they are written by the trusted
  -- server boundary, never pushed, and a device asking to push one is refused here
  -- as well as by the missing grant and policy.
  v_owner_col := CASE
                   WHEN p_entity_table = 'action_records' THEN 'actor_profile_id'
                   WHEN p_entity_table = ANY (ARRAY[
                        'one_move_records', 'needs_me_items', 'discovery_records',
                        'source_artifacts', 'interpretations', 'external_references',
                        'behavior_observations', 'automation_authorities', 'action_intents',
                        'intent_decisions', 'household_people', 'responsibilities',
                        'dependencies', 'recurrence_rules', 'goals',
                        'system_steps', 'capacity_profiles', 'patterns',
                        'evidence_links', 'career_opportunities'
                        ]) THEN 'profile_id'
                 END;
  v_owner_private := v_owner_col IS NOT NULL;
  -- (F05) 'household_members' is pushable: a child only, and only by the household's owner (private.push_household_child).
  IF NOT v_owner_private
     AND p_entity_table NOT IN ('tasks', 'events', 'household_categories',
                                'household_systems', 'meal_plan_entries', 'household_members') THEN
    RAISE EXCEPTION 'sync_push: % is not a pushable entity table', p_entity_table
      USING errcode = '22023';
  END IF;

  -- The action ledger and the other append-only evidence tables carry no revision
  -- column. Everything else does, and the caller needs it as the base for its next CAS.
  v_has_revision := p_entity_table <> ALL (ARRAY['action_records', 'behavior_observations', 'action_intents',
                                                  'intent_decisions', 'evidence_links']);

  v_house := (p_row ->> 'household_id')::uuid;
  v_local := p_row ->> 'local_id';
  IF v_house IS NULL OR v_local IS NULL THEN
    RAISE EXCEPTION 'sync_push: household_id and local_id are required' USING errcode = '22023';
  END IF;

  -- Not the permission check -- RLS is, and still runs. This is so the collision
  -- branch cannot be used to probe another household's local ids, which the
  -- SELECT policies would otherwise keep hidden.
  IF NOT private.is_household_member(v_house) THEN
    RAISE EXCEPTION 'sync_push: caller is not a member of household %', v_house
      USING errcode = '42501';
  END IF;

  -- Probe on the table's OWN uniqueness boundary (SD4-004): household-scoped
  -- tables key on (household_id, local_id), owner-private ones add profile_id.
  -- Probing the wrong boundary would either miss a real collision or invent one.
  -- (F05) household_members shares (household_id, local_id) between adults and children; only a CHILD row can be "the row this
  -- device already created", so the probe never matches the account holder's own member row.
  EXECUTE format(
    'SELECT id, %s, origin_device_id FROM public.%I WHERE household_id = $1 AND local_id = $2%s',
    CASE WHEN v_has_revision THEN 'revision' ELSE 'NULL::bigint' END,
    p_entity_table,
    CASE WHEN v_owner_private THEN format(' AND %I = $3', v_owner_col)
         WHEN p_entity_table = 'household_members' THEN ' AND member_type = ''child'''
         ELSE '' END)
    INTO v_found_id, v_found_rev, v_found_dev
    USING v_house, v_local, v_uid;

  IF v_found_id IS NOT NULL THEN
    IF v_found_dev IS NOT DISTINCT FROM p_device_id THEN
      -- The SAME install already created this row. That is a lost
      -- acknowledgement, not a collision: the device pushed, the server
      -- committed, and the answer never came back. Hand over the authoritative
      -- identity so the retry settles instead of duplicating.
      RETURN jsonb_build_object(
        'status', 'already_exists',
        'cloud_id', v_found_id,
        'revision', v_found_rev,
        'local_id', v_local);
    END IF;

    -- A DIFFERENT install owns that local id, so these are two distinct
    -- entities that happened to mint the same device-relative id. They are
    -- never merged. The incoming row takes its own cloud identity under a local
    -- id that is free here; the pushing device keeps its own local id and
    -- records the translation in its map (SD4-006).
    v_status := 'local_id_collision';
    v_local_out := left(v_local, 96) || '-x' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  ELSE
    v_local_out := v_local;
  END IF;

  -- Server-owned columns are stripped rather than trusted. The column grants
  -- would refuse them anyway; refusing here as well means the client gets a
  -- clear answer instead of a privilege error, and keeps this function honest
  -- about what it is allowed to write.
  v_clean := (p_row - 'id' - 'revision' - 'created_at' - 'updated_at'
                    - 'subject_member_type' - 'responsible_child_type' - 'logical_day' - 'timezone_at_decision')
             || jsonb_build_object('local_id', v_local_out)
             || jsonb_build_object('origin_device_id', p_device_id);

  -- (F05) A child is written by the one function built to write it; every other table is written as the caller.
  IF p_entity_table = 'household_members' THEN
    SELECT c.o_id, c.o_revision INTO v_id, v_rev
      FROM private.push_household_child(p_device_id, v_clean) c;
  ELSE
    SELECT string_agg(quote_ident(k), ', ' ORDER BY k),
           string_agg('r.' || quote_ident(k), ', ' ORDER BY k)
      INTO v_cols, v_sel
    FROM jsonb_object_keys(v_clean) AS k;

    -- jsonb_populate_record does the type coercion, and naming the columns
    -- explicitly means every column NOT supplied keeps its default -- which is how
    -- id, revision, created_at and updated_at stay server-generated.
    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING id, %s',
      p_entity_table, v_cols, v_sel, p_entity_table,
      CASE WHEN v_has_revision THEN 'revision' ELSE 'NULL::bigint' END)
      USING v_clean
      INTO v_id, v_rev;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'cloud_id', v_id,
    'revision', v_rev,
    'local_id', v_local_out);
END;
$fn$;

-- CREATE OR REPLACE keeps the existing ACL; it is stated again so this file is self-describing and cannot depend on that.
REVOKE ALL ON FUNCTION public.sync_push(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_push(text, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 3. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
