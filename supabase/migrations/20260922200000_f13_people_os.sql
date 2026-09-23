-- HER KEYS — HK-FEATURE-13 PEOPLE OS: the owner-private person-context layer and its follow-up links
-- (ADDITIVE; LOCAL VALIDATION ONLY. Owner-gated for any real environment. Never applied to Staging or Production by this build.)
--
-- Follows 20260921190000_f05_add_child_after_binding.sql. No earlier migration is edited and their hashes are unchanged.
--
-- WHAT PEOPLE OS NEEDS THAT THE FOUNDATION DID NOT HAVE. Who a person IS already has a canonical, owner-safe home: a child is a
-- `household_members` row, and anybody who is not an account (the co-parent counterparty, a teacher, a neighbor) is an owner-private
-- `household_people` row. People OS adds NO second identity table. It adds:
--
--   person_contexts     what ONE USER wants Her Keys to remember about ONE canonical person: an optional short label, an optional
--                       organization, an optional private note, active/archived. Owner-private. Exactly one of two REAL foreign keys
--                       names the person — child_id (the existing child-proving composite key, so an adult, and therefore the account
--                       holder, can never be named) or person_id (her own household_people row, proven by the owner-proving key).
--                       One per owner and person, enforced PER OWNER, so another member of the household can never collide with —
--                       and so never learn of — somebody else's context.
--   person_task_links   "this owner-private Task is a follow-up I created from this context". relation = 'follow_up' only.
--                       Immutable. The Task must be one of the caller's OWN private tasks; guard_follow_up_task refuses anything else
--                       BEFORE any key is consulted, with one message whether the task is somebody else's, household-visible or does
--                       not exist — so the link is never an existence probe (the Phase A characterisation, HK_FEATURE_13_PEOPLE.md).
--
-- WHAT IS TOUCHED THAT ALREADY EXISTED, and why each is additive:
--   * change_log_entity_table_check is re-created with the same list PLUS the two new tables (a widening: every existing row still
--     satisfies it).
--   * public.sync_push is re-issued (same signature, so its ACL is preserved) from the F05 body with exactly two differences, marked
--     (F13): the two tables join the owner-private allow-list, and person_task_links joins the no-revision list.
--   * Nothing on tasks, household_people, household_members or any other existing table: no column, constraint, index, grant or policy.
--
-- The table DDL, keys, rules, triggers, policies and grants between the GENERATED markers come from src/domain/sync/foundationSpecs.ts
-- through supabase/tools/gen-foundation-sql.mjs, exactly like the eighteen foundation tables; a test fails on any hand edit.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): drop the two tables, restore change_log_entity_table_check and sync_push from
-- 20260921190000_f05_add_child_after_binding.sql, drop public.guard_follow_up_task. No other row is affected.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the function-body digests in the schema fingerprint are identical on every checkout.

BEGIN;

-- ============================================================================
-- 1. public.guard_follow_up_task — a follow-up is one of the caller's OWN private tasks
-- ============================================================================
--
-- SECURITY INVOKER on purpose: the lookup runs under the caller's own RLS, so somebody else's private task is simply not there, and
-- "not yours", "not private" and "does not exist" are one indistinguishable refusal. A trusted server context (the claim, a purge)
-- runs as postgres and sees every row, so the rule it applies is the same rule.
CREATE FUNCTION public.guard_follow_up_task()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  IF new.follow_up_type IS DISTINCT FROM 'task' OR NOT EXISTS (
       SELECT 1 FROM public.tasks t
        WHERE t.id = new.follow_up_task_id
          AND t.household_id = new.household_id
          AND t.scope = 'personal'
          AND t.owner_profile_id = new.profile_id) THEN
    RAISE EXCEPTION 'person_task_links: a follow-up must be one of your own private tasks' USING errcode = '42501';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_follow_up_task() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The two tables (generated from the manifest)
-- ============================================================================

-- >>> GENERATED additive-tables — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
-- Phase 1 — the tables.
CREATE TABLE public.person_contexts (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  child_id           uuid,
  child_type         text,
  person_id          uuid,
  relationship_name  text,
  organization_name  text,
  context_note       text,
  status             text NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.person_contexts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.person_task_links (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  context_id         uuid NOT NULL,
  follow_up_type     text NOT NULL,
  follow_up_task_id  uuid,
  relation           text NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.person_task_links ENABLE ROW LEVEL SECURITY;

-- Phase 2 — their keys.
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_pkey PRIMARY KEY (id);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_pkey PRIMARY KEY (id);
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);

-- Phase 3 — constraints, indexes, triggers and policies.
-- person_contexts
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_revision_check CHECK (revision > 0);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_child_type_pairing_check CHECK ((child_id IS NULL) = (child_type IS NULL));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_child_type_child_check CHECK (child_type IS NULL OR child_type = 'child'::text);
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_child_id_fkey FOREIGN KEY (child_id, household_id, child_type)
    REFERENCES public.household_members(id, household_id, member_type) ON DELETE NO ACTION;
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_person_id_fkey FOREIGN KEY (person_id, household_id, profile_id)
    REFERENCES public.household_people(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_one_person_check CHECK ((child_id IS NULL) <> (person_id IS NULL));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_relationship_name_check CHECK (relationship_name IS NULL OR (relationship_name = btrim(relationship_name) AND char_length(relationship_name) >= 1 AND char_length(relationship_name) <= 60 AND relationship_name !~ '[[:cntrl:]]'));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_organization_name_check CHECK (organization_name IS NULL OR (organization_name = btrim(organization_name) AND char_length(organization_name) >= 1 AND char_length(organization_name) <= 80 AND organization_name !~ '[[:cntrl:]]'));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_context_note_check CHECK (context_note IS NULL OR (context_note = btrim(context_note) AND char_length(context_note) >= 1 AND char_length(context_note) <= 500 AND replace(replace(replace(context_note, chr(10), ''), chr(13), ''), chr(9), '') !~ '[[:cntrl:]]'));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_status_check CHECK (status = ANY (ARRAY['active','archived']));
ALTER TABLE public.person_contexts ADD CONSTRAINT person_contexts_stated_by_her_check CHECK (producer = 'user-action');
CREATE INDEX person_contexts_owner_idx ON public.person_contexts (household_id, profile_id);
CREATE INDEX person_contexts_child_id_fk_idx ON public.person_contexts (child_id, household_id) WHERE child_id IS NOT NULL;
CREATE INDEX person_contexts_person_id_fk_idx ON public.person_contexts (person_id, household_id) WHERE person_id IS NOT NULL;
CREATE INDEX person_contexts_source_artifact_id_fk_idx ON public.person_contexts (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX person_contexts_one_per_child_uq
  ON public.person_contexts (household_id, profile_id, child_id) WHERE child_id IS NOT NULL;
CREATE UNIQUE INDEX person_contexts_one_per_person_uq
  ON public.person_contexts (household_id, profile_id, person_id) WHERE person_id IS NOT NULL;
CREATE TRIGGER person_contexts_force_id BEFORE INSERT OR UPDATE ON public.person_contexts
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER person_contexts_set_updated_at BEFORE UPDATE ON public.person_contexts
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER person_contexts_set_child_type BEFORE INSERT OR UPDATE ON public.person_contexts
  FOR EACH ROW EXECUTE FUNCTION public.set_child_member_type('child_id', 'child_type');
CREATE TRIGGER person_contexts_log_change AFTER INSERT OR UPDATE OR DELETE ON public.person_contexts
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY person_contexts_select_own ON public.person_contexts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY person_contexts_insert_own ON public.person_contexts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY person_contexts_update_own ON public.person_contexts
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- person_task_links
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_context_id_fkey FOREIGN KEY (context_id, household_id, profile_id)
    REFERENCES public.person_contexts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_follow_up_ref_check CHECK ((follow_up_type IS NULL OR follow_up_type = ANY (ARRAY['task']))
    AND (COALESCE(follow_up_type = 'task', false) = (follow_up_task_id IS NOT NULL)));
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_follow_up_task_id_fkey FOREIGN KEY (follow_up_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_relation_check CHECK (relation = 'follow_up');
ALTER TABLE public.person_task_links ADD CONSTRAINT person_task_links_stated_by_her_check CHECK (producer = 'user-action');
CREATE INDEX person_task_links_owner_idx ON public.person_task_links (household_id, profile_id);
CREATE INDEX person_task_links_context_id_fk_idx ON public.person_task_links (context_id, household_id) WHERE context_id IS NOT NULL;
CREATE INDEX person_task_links_follow_up_task_id_fk_idx ON public.person_task_links (follow_up_task_id, household_id) WHERE follow_up_task_id IS NOT NULL;
CREATE INDEX person_task_links_source_artifact_id_fk_idx ON public.person_task_links (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX person_task_links_one_link_per_task_uq
  ON public.person_task_links (household_id, profile_id, follow_up_task_id);
CREATE TRIGGER person_task_links_force_id BEFORE INSERT ON public.person_task_links
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER person_task_links_immutable BEFORE UPDATE OR DELETE ON public.person_task_links
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER person_task_links_follow_up_task_guard BEFORE INSERT ON public.person_task_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_follow_up_task();
CREATE TRIGGER person_task_links_log_change AFTER INSERT ON public.person_task_links
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY person_task_links_select_own ON public.person_task_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY person_task_links_insert_own ON public.person_task_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- <<< GENERATED additive-tables

-- ============================================================================
-- 3. The change log can carry the two new tables
-- ============================================================================
--
-- Same list as 20260919231500_build4_cloud_schema.sql §4, plus two. The log stays a POINTER log, and both new tables log with
-- owner_profile_id = profile_id, so change_log_select_scoped shows an entry to its owner alone.
ALTER TABLE public.change_log DROP CONSTRAINT change_log_entity_table_check;
ALTER TABLE public.change_log
  ADD CONSTRAINT change_log_entity_table_check
  CHECK (entity_table = ANY (ARRAY[
    'households'::text, 'household_members'::text, 'household_categories'::text,
    'events'::text, 'tasks'::text, 'household_systems'::text, 'meal_plan_entries'::text,
    'onboarding_state'::text, 'one_move_records'::text, 'needs_me_items'::text,
    'discovery_records'::text, 'action_records'::text,
    -- foundation tables (B4-FOUNDATION-BUILDOUT-01)
    'source_artifacts'::text, 'interpretations'::text, 'external_references'::text,
    'behavior_observations'::text, 'automation_authorities'::text, 'action_intents'::text,
    'intent_decisions'::text, 'action_executions'::text, 'action_outcomes'::text,
    'household_people'::text, 'responsibilities'::text, 'dependencies'::text,
    'recurrence_rules'::text, 'goals'::text, 'system_steps'::text,
    'capacity_profiles'::text, 'patterns'::text, 'evidence_links'::text,
    -- People OS (HK-FEATURE-13)
    'person_contexts'::text, 'person_task_links'::text
  ]));

-- ============================================================================
-- 4. public.sync_push — the two tables become pushable (owner-private)
-- ============================================================================
--
-- Same signature and the F05 body verbatim, with exactly two differences, each marked (F13). It stays SECURITY INVOKER: the insert
-- still happens as the CALLER, so RLS, the column grants and guard_follow_up_task all still decide what may be written.
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
                        'evidence_links',
                        -- (F13) People OS: both owner-private, keyed on (household, owner, local id) like every foundation table.
                        'person_contexts', 'person_task_links'
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
  -- (F13) a person task link is created once and never edited, so it has no revision either.
  v_has_revision := p_entity_table <> ALL (ARRAY['action_records', 'behavior_observations', 'action_intents',
                                                  'intent_decisions', 'evidence_links', 'person_task_links']);

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
-- 5. Privileges: strip what the new tables inherited, then grant named columns
-- ============================================================================
--
-- The baseline's stock ALTER DEFAULT PRIVILEGES hand anon, authenticated and service_role a FULL grant on every new public table
-- (20260919231500_build4_cloud_schema.sql §9 explains and strips it for the tables that existed then). A table created by a later
-- migration inherits it again, so it is stripped here for exactly the two new tables, the same way: nothing is relied on from a
-- default, service_role keeps full access, and the client role gets only the named columns generated below — no DELETE, TRUNCATE,
-- REFERENCES or TRIGGER, and no UPDATE at all on the immutable links.
REVOKE ALL ON TABLE public.person_contexts   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.person_task_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.person_contexts   TO service_role;
GRANT ALL ON TABLE public.person_task_links TO service_role;

-- >>> GENERATED additive-grants — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
GRANT SELECT ON public.person_contexts TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, child_id, person_id, 
              relationship_name, organization_name, context_note, status, producer, 
              source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.person_contexts TO authenticated;
GRANT UPDATE (relationship_name, organization_name, context_note, status, origin_updated_at)
  ON public.person_contexts TO authenticated;
GRANT SELECT ON public.person_task_links TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, context_id, follow_up_type, 
              follow_up_task_id, relation, producer, source_artifact_id, confidence, scope, 
              origin_created_at)
  ON public.person_task_links TO authenticated;
-- <<< GENERATED additive-grants

-- ============================================================================
-- 6. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
