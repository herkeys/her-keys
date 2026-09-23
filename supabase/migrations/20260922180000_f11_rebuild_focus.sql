-- HER KEYS — HK-FEATURE-11 (Me / Rebuild OS): RebuildFocus and its links
-- (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260921190000_f05_add_child_after_binding.sql. No earlier migration is edited and their hashes are unchanged.
--
-- WHAT IT ADDS
--   public.rebuild_focuses       an area of her own life she chose to keep visible: title, optional note (<= 500), state
--                                active | paused | archived. Owner-private: profile_id NOT NULL, scope pinned to 'personal'.
--   public.rebuild_focus_links   a Focus's connection to ONE canonical task / goal / household system / event, by the typed-reference
--                                convention (ADR-005): target_type plus one real typed foreign key per kind, and a CHECK that exactly
--                                the column the type names is set. relation next_action (a task) | supports. status active | removed.
--   private.rebuild_focus_link_target_visible()   refuses a link to a target its writer cannot see.
--
-- Both tables are GENERATED from src/domain/sync/foundationSpecs.ts by supabase/tools/gen-foundation-sql.mjs, into this file's own
-- marker regions (the Build 4 shipping migration's generated regions are byte-for-byte unchanged). They therefore carry exactly the
-- foundation's conventions: server-owned id / revision / updated_at, owner-only SELECT / INSERT / UPDATE policies naming profile_id and
-- household membership, NO DELETE policy and NO DELETE grant, column-level INSERT and UPDATE grants, the owner-tagged change-log
-- trigger, and composite foreign keys.
--
-- PRIVACY, BY CONSTRUCTION
--   * A link's Focus is referenced by (focus_id, household_id, profile_id): a link can only belong to its Focus's own owner, so a link
--     row is exactly as private as its Focus. A crafted row naming another member's Focus fails with the SAME 23503 as a row naming a
--     Focus that does not exist.
--   * Change-log entries for both tables carry owner_profile_id, which change_log_select_scoped shows to that owner only.
--   * A task / event / system target is referenced by (id, household_id) and deletes CASCADE to the link, so a server-side deletion of
--     a shared row removes the owner's link instead of failing with an error that would reveal it. A goal target is owner-private
--     (same-owner key), exactly as every foundation reference to a goal.
--   * A link may only be written to a target its writer can SEE: the trigger looks the target up AS THE CALLER, under the caller's own
--     RLS, and a row that is not there and a row that is someone else's private row get the same answer.
--   * No column is added to tasks, goals, household_systems, events or any other existing table.
--
-- WHAT IT CHANGES (the only two existing objects it touches, each for the one reason stated)
--   * change_log_entity_table_check is re-created with the two new tables added; the list is otherwise identical.
--   * public.sync_push is replaced (same signature, so its ACL is preserved) so the two new owner-private tables are pushable and key
--     their collision probe on profile_id. Its body is the F05 body with only those two table names added.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): drop the two tables and the function, restore the change_log check without them,
-- and restore sync_push from 20260921190000_f05_add_child_after_binding.sql. Focuses written meanwhile are lost with the tables.
--
-- RELEASE ORDER: this migration must reach an environment BEFORE a client that pushes rebuildFocus / rebuildFocusLink rows. Otherwise
-- those pushes are refused (not a pushable table) and stall as validation-failure evidence.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the function-body digest in the schema fingerprint is identical on every checkout.

BEGIN;

-- ============================================================================
-- 1. The link-target visibility rule
-- ============================================================================

-- Runs as the CALLER (not SECURITY DEFINER), so the lookup below is filtered by the caller's own row-level security: a target that does
-- not exist and a target that is another member's private row are indistinguishable, and both are refused with 23503 — the same code
-- the foreign key itself uses. A goal needs no lookup: its reference is same-owner by key.
CREATE FUNCTION private.rebuild_focus_link_target_visible()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  v_seen boolean;
BEGIN
  -- Only a target that is actually named is looked up. A row whose typed columns do not match its type is left to the table's own
  -- target_ref_check, which names the real problem precisely.
  IF new.target_type = 'task' AND new.target_task_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = new.target_task_id AND t.household_id = new.household_id) INTO v_seen;
  ELSIF new.target_type = 'event' AND new.target_event_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = new.target_event_id AND e.household_id = new.household_id) INTO v_seen;
  ELSIF new.target_type = 'system' AND new.target_system_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.household_systems s WHERE s.id = new.target_system_id AND s.household_id = new.household_id) INTO v_seen;
  ELSE
    RETURN new;
  END IF;

  IF NOT v_seen THEN
    RAISE EXCEPTION 'rebuild_focus_links: the linked % is not available', new.target_type
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION private.rebuild_focus_link_target_visible() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The two tables (generated from the manifest)
-- ============================================================================

-- >>> GENERATED additive-tables — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
-- Phase 1 — the tables.
CREATE TABLE public.rebuild_focuses (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  title              text NOT NULL,
  note               text,
  state              text NOT NULL,
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

ALTER TABLE public.rebuild_focuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rebuild_focus_links (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  focus_id           uuid NOT NULL,
  target_type        text NOT NULL,
  target_task_id     uuid,
  target_goal_id     uuid,
  target_system_id   uuid,
  target_event_id    uuid,
  relation           text NOT NULL,
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

ALTER TABLE public.rebuild_focus_links ENABLE ROW LEVEL SECURITY;

-- Phase 2 — their keys.
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_pkey PRIMARY KEY (id);
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_pkey PRIMARY KEY (id);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);

-- Phase 3 — constraints, indexes, triggers and policies.
-- rebuild_focuses
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_revision_check CHECK (revision > 0);
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200 AND title = btrim(title));
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_note_check CHECK (note IS NULL OR (char_length(note) >= 1 AND char_length(note) <= 500 AND note = btrim(note)));
ALTER TABLE public.rebuild_focuses ADD CONSTRAINT rebuild_focuses_state_check CHECK (state = ANY (ARRAY['active','paused','archived']));
CREATE INDEX rebuild_focuses_owner_idx ON public.rebuild_focuses (household_id, profile_id);
CREATE INDEX rebuild_focuses_source_artifact_id_fk_idx ON public.rebuild_focuses (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER rebuild_focuses_force_id BEFORE INSERT OR UPDATE ON public.rebuild_focuses
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER rebuild_focuses_set_updated_at BEFORE UPDATE ON public.rebuild_focuses
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER rebuild_focuses_log_change AFTER INSERT OR UPDATE OR DELETE ON public.rebuild_focuses
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY rebuild_focuses_select_own ON public.rebuild_focuses
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY rebuild_focuses_insert_own ON public.rebuild_focuses
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY rebuild_focuses_update_own ON public.rebuild_focuses
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- rebuild_focus_links
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_revision_check CHECK (revision > 0);
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_focus_id_fkey FOREIGN KEY (focus_id, household_id, profile_id)
    REFERENCES public.rebuild_focuses(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_target_ref_check CHECK ((target_type IS NULL OR target_type = ANY (ARRAY['task', 'goal', 'system', 'event']))
    AND (COALESCE(target_type = 'task', false) = (target_task_id IS NOT NULL))
    AND (COALESCE(target_type = 'goal', false) = (target_goal_id IS NOT NULL))
    AND (COALESCE(target_type = 'system', false) = (target_system_id IS NOT NULL))
    AND (COALESCE(target_type = 'event', false) = (target_event_id IS NOT NULL)));
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_target_task_id_fkey FOREIGN KEY (target_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_target_goal_id_fkey FOREIGN KEY (target_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_target_system_id_fkey FOREIGN KEY (target_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_target_event_id_fkey FOREIGN KEY (target_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_relation_check CHECK (relation = ANY (ARRAY['next_action','supports']));
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_next_action_task_check CHECK (relation <> 'next_action' OR target_type = 'task');
ALTER TABLE public.rebuild_focus_links ADD CONSTRAINT rebuild_focus_links_status_check CHECK (status = ANY (ARRAY['active','removed']));
CREATE INDEX rebuild_focus_links_owner_idx ON public.rebuild_focus_links (household_id, profile_id);
CREATE INDEX rebuild_focus_links_focus_id_fk_idx ON public.rebuild_focus_links (focus_id, household_id) WHERE focus_id IS NOT NULL;
CREATE INDEX rebuild_focus_links_target_task_id_fk_idx ON public.rebuild_focus_links (target_task_id, household_id) WHERE target_task_id IS NOT NULL;
CREATE INDEX rebuild_focus_links_target_goal_id_fk_idx ON public.rebuild_focus_links (target_goal_id, household_id) WHERE target_goal_id IS NOT NULL;
CREATE INDEX rebuild_focus_links_target_system_id_fk_idx ON public.rebuild_focus_links (target_system_id, household_id) WHERE target_system_id IS NOT NULL;
CREATE INDEX rebuild_focus_links_target_event_id_fk_idx ON public.rebuild_focus_links (target_event_id, household_id) WHERE target_event_id IS NOT NULL;
CREATE INDEX rebuild_focus_links_source_artifact_id_fk_idx ON public.rebuild_focus_links (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX rebuild_focus_links_live_link_uq
  ON public.rebuild_focus_links (household_id, profile_id, focus_id, target_type, COALESCE(target_task_id, target_goal_id, target_system_id, target_event_id)) WHERE status = 'active';
CREATE TRIGGER rebuild_focus_links_force_id BEFORE INSERT OR UPDATE ON public.rebuild_focus_links
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER rebuild_focus_links_set_updated_at BEFORE UPDATE ON public.rebuild_focus_links
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER rebuild_focus_links_target_visible BEFORE INSERT ON public.rebuild_focus_links
  FOR EACH ROW EXECUTE FUNCTION private.rebuild_focus_link_target_visible();
CREATE TRIGGER rebuild_focus_links_log_change AFTER INSERT OR UPDATE OR DELETE ON public.rebuild_focus_links
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY rebuild_focus_links_select_own ON public.rebuild_focus_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY rebuild_focus_links_insert_own ON public.rebuild_focus_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY rebuild_focus_links_update_own ON public.rebuild_focus_links
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- <<< GENERATED additive-tables

-- Nothing relies on a default (Build 4 section 9, B4-P0-040). The stock default privileges hand every NEW public table to the client
-- roles with every verb; strip them from both tables first, keep the trusted server role's full access, and then grant exactly the
-- verbs and columns below — SELECT, INSERT of the stated columns, UPDATE of the editable ones, and never DELETE.
REVOKE ALL ON TABLE public.rebuild_focuses, public.rebuild_focus_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rebuild_focuses, public.rebuild_focus_links TO service_role;

-- >>> GENERATED additive-grants — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
GRANT SELECT ON public.rebuild_focuses TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, title, note, state, producer, 
              source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.rebuild_focuses TO authenticated;
GRANT UPDATE (title, note, state, confidence, origin_updated_at)
  ON public.rebuild_focuses TO authenticated;
GRANT SELECT ON public.rebuild_focus_links TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, focus_id, target_type, 
              target_task_id, target_goal_id, target_system_id, target_event_id, relation, status, 
              producer, source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.rebuild_focus_links TO authenticated;
GRANT UPDATE (status, confidence, origin_updated_at)
  ON public.rebuild_focus_links TO authenticated;
-- <<< GENERATED additive-grants

-- ============================================================================
-- 3. The change log may carry the two new tables
-- ============================================================================

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
    -- HK-FEATURE-11 (Me / Rebuild)
    'rebuild_focuses'::text, 'rebuild_focus_links'::text
  ]));

-- ============================================================================
-- 4. sync_push: the two new owner-private tables are pushable
-- ============================================================================

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
  -- (F11) rebuild_focuses and rebuild_focus_links are owner-private in exactly the same way.
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
                        'rebuild_focuses', 'rebuild_focus_links'
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
-- 5. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
