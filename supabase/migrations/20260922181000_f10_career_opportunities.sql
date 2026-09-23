-- HER KEYS — HK-FEATURE-10 (Work / Career OS): career opportunities, and Dependency endpoints that can name one
-- (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260922180000_f09_task_payment_mechanism.sql. No earlier migration is edited and their hashes are unchanged.
--
-- WHERE THIS FILE CAME FROM (HK-F01-F13 integration, INT13-01). Feature 10 generated this schema INTO the already-shipped
-- 20260919231500_build4_cloud_schema.sql and added career_opportunities to sync_push by editing
-- 20260921190000_f05_add_child_after_binding.sql in place. A database that had already applied those two migrations — every
-- WAVE3_BASE-era database, and Staging — would never have received any of it. The integration restored both files byte-for-byte and
-- moved Feature 10's schema here, unchanged in meaning: the same table with the same columns, constraints, keys, triggers, policies
-- and grants (generated from the same manifest entry), and the same widening of public.dependencies, expressed as ALTERs.
--
-- WHAT IT ADDS
--   public.career_opportunities   a professional possibility she is tracking: title, organization, type, stage (exploring ...
--                                 accepted | closed with a stated reason), her own notes and dates. Owner-private: profile_id NOT NULL,
--                                 scope pinned to 'personal'. No next-action text, no interview record and no structured compensation:
--                                 a next action is a Task and an interview is an Event, each joined to the opportunity by a Dependency.
--
-- WHAT IT CHANGES (existing objects, each for the one reason stated)
--   * public.dependencies gains from_opportunity_id / to_opportunity_id, so an edge endpoint can be an opportunity. The two reference
--     checks, the not-self rule and the live-edge unique index are re-issued naming the new endpoint; the new foreign keys are
--     same-household AND same-owner (an opportunity is owner-private) and cascade like every other endpoint. Every existing edge keeps
--     its endpoints; the new columns are NULL on every existing row, which the re-issued checks accept.
--   * change_log_entity_table_check is re-created with career_opportunities added; the list is otherwise the Build 4 list.
--   * public.sync_push is replaced (same signature; ACL restated): career_opportunities joins the owner-private list, so it is pushable
--     and its collision probe keys on (household, OWNER, local_id). Otherwise the F05 body, unchanged.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): drop the dependencies foreign keys, indexes and columns and re-issue the Build 4
-- rules, drop the table, and restore the change_log check and sync_push from 20260921190000_f05_add_child_after_binding.sql.
-- Opportunities written meanwhile, and every edge that names one, are lost with them.
--
-- RELEASE ORDER: this migration must reach an environment BEFORE a client that pushes careerOpportunities rows or an opportunity-ended
-- Dependency. Otherwise those pushes are refused ("not a pushable entity table" / undefined column) and stay on the device as evidence.
--
-- LINE ENDINGS: pinned to LF by .gitattributes (it replaces sync_push, so the fingerprint's function-body digest depends on its bytes).

BEGIN;

-- ============================================================================
-- 1. The table, and the widening of dependencies (generated from the manifest)
-- ============================================================================

-- >>> GENERATED additive-tables — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
-- Phase 1 — the tables.
CREATE TABLE public.career_opportunities (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL,
  local_id             text NOT NULL,
  origin_device_id     uuid,
  profile_id           uuid NOT NULL,
  title                text NOT NULL,
  organization_name    text,
  opportunity_type     text NOT NULL,
  stage                text NOT NULL,
  closed_reason        text,
  source_note          text,
  application_deadline date,
  follow_up_date       date,
  contact_name         text,
  compensation_note    text,
  notes                text,
  stage_changed_at     timestamptz NOT NULL,
  archived_at          timestamptz,
  producer             text NOT NULL,
  source_artifact_id   uuid,
  confidence           text,
  scope                text NOT NULL DEFAULT 'personal',
  origin_created_at    timestamptz NOT NULL,
  origin_updated_at    timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  revision             bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.career_opportunities ENABLE ROW LEVEL SECURITY;

-- Phase 2 — their keys.
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_pkey PRIMARY KEY (id);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);

-- Phase 3 — constraints, indexes, triggers and policies.
-- career_opportunities
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_revision_check CHECK (revision > 0);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(title) <= 200);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_org_check CHECK (organization_name IS NULL OR char_length(organization_name) <= 120);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_type_check CHECK (opportunity_type = ANY (ARRAY['job','freelance','contract','education_program','other']));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_stage_check CHECK (stage = ANY (ARRAY['exploring','interested','applied','interviewing','offer','accepted','closed']));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_closed_reason_check CHECK (closed_reason IS NULL OR closed_reason = ANY (ARRAY['withdrawn','declined_by_organization','offer_rescinded','no_further_response','other']));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_closed_pairing_check CHECK ((stage = 'closed') = (closed_reason IS NOT NULL));
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_source_note_check CHECK (source_note IS NULL OR char_length(source_note) <= 300);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_contact_name_check CHECK (contact_name IS NULL OR char_length(contact_name) <= 120);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_compensation_note_check CHECK (compensation_note IS NULL OR char_length(compensation_note) <= 300);
ALTER TABLE public.career_opportunities ADD CONSTRAINT career_opportunities_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000);
CREATE INDEX career_opportunities_owner_idx ON public.career_opportunities (household_id, profile_id);
CREATE INDEX career_opportunities_source_artifact_id_fk_idx ON public.career_opportunities (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER career_opportunities_force_id BEFORE INSERT OR UPDATE ON public.career_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER career_opportunities_set_updated_at BEFORE UPDATE ON public.career_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER career_opportunities_log_change AFTER INSERT OR UPDATE OR DELETE ON public.career_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY career_opportunities_select_own ON public.career_opportunities
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY career_opportunities_insert_own ON public.career_opportunities
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY career_opportunities_update_own ON public.career_opportunities
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- Phase 4 — the existing tables this migration widens: a typed reference gains a kind (the rows already there keep theirs).
-- dependencies
ALTER TABLE public.dependencies
  ADD COLUMN from_opportunity_id uuid,
  ADD COLUMN to_opportunity_id uuid;
ALTER TABLE public.dependencies DROP CONSTRAINT dependencies_from_ref_check;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_ref_check CHECK ((from_type IS NULL OR from_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'opportunity']))
    AND (COALESCE(from_type = 'task', false) = (from_task_id IS NOT NULL))
    AND (COALESCE(from_type = 'event', false) = (from_event_id IS NOT NULL))
    AND (COALESCE(from_type = 'needsMe', false) = (from_needs_me_id IS NOT NULL))
    AND (COALESCE(from_type = 'system', false) = (from_system_id IS NOT NULL))
    AND (COALESCE(from_type = 'meal', false) = (from_meal_id IS NOT NULL))
    AND (COALESCE(from_type = 'goal', false) = (from_goal_id IS NOT NULL))
    AND (COALESCE(from_type = 'opportunity', false) = (from_opportunity_id IS NOT NULL)));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_opportunity_id_fkey FOREIGN KEY (from_opportunity_id, household_id, profile_id)
    REFERENCES public.career_opportunities(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies DROP CONSTRAINT dependencies_to_ref_check;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_ref_check CHECK ((to_type IS NULL OR to_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'opportunity']))
    AND (COALESCE(to_type = 'task', false) = (to_task_id IS NOT NULL))
    AND (COALESCE(to_type = 'event', false) = (to_event_id IS NOT NULL))
    AND (COALESCE(to_type = 'needsMe', false) = (to_needs_me_id IS NOT NULL))
    AND (COALESCE(to_type = 'system', false) = (to_system_id IS NOT NULL))
    AND (COALESCE(to_type = 'meal', false) = (to_meal_id IS NOT NULL))
    AND (COALESCE(to_type = 'goal', false) = (to_goal_id IS NOT NULL))
    AND (COALESCE(to_type = 'opportunity', false) = (to_opportunity_id IS NOT NULL)));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_opportunity_id_fkey FOREIGN KEY (to_opportunity_id, household_id, profile_id)
    REFERENCES public.career_opportunities(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies DROP CONSTRAINT dependencies_not_self_check;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_not_self_check CHECK (NOT (from_type = to_type AND COALESCE(from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, from_goal_id, from_opportunity_id) = COALESCE(to_task_id, to_event_id, to_needs_me_id, to_system_id, to_meal_id, to_goal_id, to_opportunity_id)));
DROP INDEX public.dependencies_live_edge_uq;
CREATE UNIQUE INDEX dependencies_live_edge_uq
  ON public.dependencies (household_id, relation, from_type, COALESCE(from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, from_goal_id, from_opportunity_id), to_type, COALESCE(to_task_id, to_event_id, to_needs_me_id, to_system_id, to_meal_id, to_goal_id, to_opportunity_id)) WHERE status = 'active';
CREATE INDEX dependencies_from_opportunity_id_fk_idx ON public.dependencies (from_opportunity_id, household_id) WHERE from_opportunity_id IS NOT NULL;
CREATE INDEX dependencies_to_opportunity_id_fk_idx ON public.dependencies (to_opportunity_id, household_id) WHERE to_opportunity_id IS NOT NULL;
-- <<< GENERATED additive-tables

-- Nothing relies on a default (Build 4 section 9, B4-P0-040). The stock default privileges hand every NEW public table to the client
-- roles with every verb; strip them first, keep the trusted server role's full access, and then grant exactly the verbs and columns
-- below — SELECT, INSERT of the stated columns, UPDATE of the editable ones, and never DELETE. (public.dependencies already exists and
-- keeps its Build 4 grants; only its two new columns gain an INSERT grant.)
REVOKE ALL ON TABLE public.career_opportunities FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.career_opportunities TO service_role;

-- >>> GENERATED additive-grants — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
GRANT SELECT ON public.career_opportunities TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, title, organization_name, 
              opportunity_type, stage, closed_reason, source_note, application_deadline, 
              follow_up_date, contact_name, compensation_note, notes, stage_changed_at, archived_at, 
              producer, source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.career_opportunities TO authenticated;
GRANT UPDATE (title, organization_name, opportunity_type, stage, closed_reason, source_note, 
              application_deadline, follow_up_date, contact_name, compensation_note, notes, 
              stage_changed_at, archived_at, confidence, origin_updated_at)
  ON public.career_opportunities TO authenticated;
GRANT INSERT (from_opportunity_id, to_opportunity_id)
  ON public.dependencies TO authenticated;
-- <<< GENERATED additive-grants

-- ============================================================================
-- 2. The change log may carry the new table
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
    -- HK-FEATURE-10 (Work / Career)
    'career_opportunities'::text
  ]));

-- ============================================================================
-- 3. public.sync_push: career_opportunities is pushable, keyed on its OWNER
-- ============================================================================
--
-- Same signature and same body as 20260921190000_f05_add_child_after_binding.sql, with exactly one difference, marked (F10).

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
                        -- (F10) Work / Career OS: owner-private, keyed on (household, owner, local id) like every foundation table.
                        'career_opportunities'
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
-- 4. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
