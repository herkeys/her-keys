-- HER KEYS — HK-FEATURE-12 LIFE ADMIN / DOCUMENTS (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260922182000_f11_rebuild_focus.sql (originally 20260921190000_f05_add_child_after_binding.sql; see INTEGRATION NOTE).
-- No earlier migration is edited and their hashes are unchanged.
--
-- WHAT IT ADDS
--   public.life_records             her durable administrative records (a passport, a lease, a policy): OWNER-PRIVATE.
--   public.life_record_task_links   "this canonical Task is work she created from this record": OWNER-PRIVATE, immutable.
--
-- Both follow the foundation's owner-private pattern exactly (goals, dependencies, recurrence_rules): `profile_id NOT NULL`,
-- `scope` pinned to 'personal', RLS `auth.uid() = profile_id AND private.is_household_member(household_id)`, uniqueness
-- `(household_id, profile_id, local_id)`, change pointers stamped with the owner so no other member ever sees one, and
-- column-level INSERT/UPDATE grants. There is no DELETE grant and no DELETE policy: a record is archived, never deleted.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * No shared canonical table changes: tasks, events, goals, systems and household_members gain no column, constraint or index.
--   * No typed-reference kind is added to dependencies / evidence_links / external_references (shared foundation schema).
--   * No file, URL, storage bucket, signed URL or OCR column. `location_hint` is her own words about where a paper is.
--   * No derived state: there is no 'expired' status; whether a date has passed is worked out on the device, every time.
--
-- THE LINK IS PRIVATE ON BOTH ENDS. A link names a record of hers (composite FK on (id, household_id, profile_id)) and a Task that
-- is hers AND owner-private (scope 'personal', owner_profile_id = the link's owner), checked by a BEFORE trigger that runs as the
-- CALLER (SECURITY INVOKER): under the caller's own RLS "that Task is someone else's", "that Task is household-visible" and "no such
-- Task" are the SAME refusal, so a crafted link can never confirm that another member's private Task exists (closes, for this
-- table, the known-id FK probe M0 characterised on the foundation relationship tables: MP-12-02).
--
-- sync_push is replaced (same signature, ACL preserved) with exactly one difference from the F05 version, marked (F12): the two
-- tables join the owner-private list, so their collision probe keys on (household, OWNER, local_id).
--
-- INTEGRATION NOTE (HK-F01-F13 integration, INT13-01). This migration now follows 20260922182000_f11_rebuild_focus.sql. Three feature migrations had claimed
-- the one version 20260922180000, and each additive migration re-declared sync_push and change_log_entity_table_check as "the F05 /
-- Build 4 list plus my own tables", so whichever applied LAST silently removed the others' tables. Both re-declarations here are
-- therefore CUMULATIVE: they also carry HK-FEATURE-10's and HK-FEATURE-11's tables, so applying this file never drops a table an earlier
-- migration made pushable or loggable. Nothing else in this file changed.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): drop the two tables and private.guard_life_record_task_link, restore the F05
-- sync_push body and the Build 4 change_log_entity_table_check list. Records written meanwhile are lost with the tables, so a
-- rollback of a populated environment needs the owner.
--
-- RELEASE ORDER: this migration must reach an environment BEFORE a client that pushes `life_records` does; otherwise those pushes
-- are refused ("not a pushable entity table") and stay on the device as evidence, never lost.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the function-body digests in the schema fingerprint are identical on every checkout.

BEGIN;

-- ============================================================================
-- 1. public.life_records
-- ============================================================================

CREATE TABLE public.life_records (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id         uuid        NOT NULL,
  local_id             text        NOT NULL,
  origin_device_id     uuid,
  profile_id           uuid        NOT NULL,
  title                text        NOT NULL,
  record_kind          text        NOT NULL,
  type_name            text,
  issuer_name          text,
  reference_number     text,
  issued_on            date,
  expires_on           date,
  renew_by             date,
  review_on            date,
  location_hint        text,
  note                 text,
  subject_member_id    uuid,
  subject_member_type  text,
  status               text        NOT NULL,
  archived_at          timestamptz,
  producer             text        NOT NULL,
  source_artifact_id   uuid,
  confidence           text,
  scope                text        NOT NULL DEFAULT 'personal',
  origin_created_at    timestamptz NOT NULL,
  origin_updated_at    timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  revision             bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.life_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.life_records ADD CONSTRAINT life_records_pkey PRIMARY KEY (id);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.life_records ADD CONSTRAINT life_records_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
-- NHR-01: a subject is an existing CHILD of the SAME household, proven structurally, exactly as on tasks.
ALTER TABLE public.life_records ADD CONSTRAINT life_records_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
ALTER TABLE public.life_records ADD CONSTRAINT life_records_source_artifact_fkey
  FOREIGN KEY (source_artifact_id, household_id, profile_id)
  REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;

ALTER TABLE public.life_records ADD CONSTRAINT life_records_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_revision_check CHECK (revision > 0);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_title_check
  CHECK (char_length(btrim(title)) >= 1 AND char_length(title) <= 200);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_record_kind_check
  CHECK (record_kind = ANY (ARRAY['document'::text, 'credential'::text, 'policy'::text, 'registration'::text, 'reference'::text, 'other'::text]));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_type_name_check
  CHECK (type_name IS NULL OR (char_length(btrim(type_name)) >= 1 AND char_length(type_name) <= 60));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_issuer_name_check
  CHECK (issuer_name IS NULL OR (char_length(btrim(issuer_name)) >= 1 AND char_length(issuer_name) <= 120));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_reference_number_check
  CHECK (reference_number IS NULL OR (char_length(btrim(reference_number)) >= 1 AND char_length(reference_number) <= 64));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_location_hint_check
  CHECK (location_hint IS NULL OR (char_length(btrim(location_hint)) >= 1 AND char_length(location_hint) <= 120));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_note_check
  CHECK (note IS NULL OR (char_length(btrim(note)) >= 1 AND char_length(note) <= 500));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_archived_at_check
  CHECK ((status = 'archived'::text) = (archived_at IS NOT NULL));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.life_records ADD CONSTRAINT life_records_producer_values_check
  CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_confidence_check
  CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
         AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.life_records ADD CONSTRAINT life_records_source_artifact_check
  CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));

CREATE INDEX life_records_owner_idx ON public.life_records (household_id, profile_id);
CREATE INDEX life_records_subject_household_fk_idx
  ON public.life_records (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX life_records_source_artifact_id_fk_idx
  ON public.life_records (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;

CREATE TRIGGER life_records_force_id BEFORE INSERT OR UPDATE ON public.life_records
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER life_records_set_subject_member_type BEFORE INSERT OR UPDATE ON public.life_records
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();
CREATE TRIGGER life_records_set_updated_at BEFORE UPDATE ON public.life_records
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER life_records_log_change AFTER INSERT OR UPDATE OR DELETE ON public.life_records
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY life_records_select_own ON public.life_records
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY life_records_insert_own ON public.life_records
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY life_records_update_own ON public.life_records
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- ============================================================================
-- 2. public.life_record_task_links
-- ============================================================================

CREATE TABLE public.life_record_task_links (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id        uuid        NOT NULL,
  local_id            text        NOT NULL,
  origin_device_id    uuid,
  profile_id          uuid        NOT NULL,
  life_record_id      uuid        NOT NULL,
  task_id             uuid        NOT NULL,
  relation            text        NOT NULL,
  producer            text        NOT NULL,
  source_artifact_id  uuid,
  confidence          text,
  scope               text        NOT NULL DEFAULT 'personal',
  origin_created_at   timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revision            bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.life_record_task_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_pkey PRIMARY KEY (id);
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_household_id_profile_id_local_id_key
  UNIQUE (household_id, profile_id, local_id);
-- One Task is tied to one record once.
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_life_record_id_task_id_key UNIQUE (life_record_id, task_id);
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
-- The record end is owner-keyed: a link can only ever name a record of the SAME owner in the SAME household.
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_life_record_fkey
  FOREIGN KEY (life_record_id, household_id, profile_id)
  REFERENCES public.life_records(id, household_id, profile_id) ON DELETE CASCADE;
-- The Task end: same household structurally; same owner and personal scope by the guard below. A purged Task takes its links with
-- it (referential cleanup), so a link can never outlive what it names in the cloud.
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_task_fkey
  FOREIGN KEY (task_id, household_id) REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_source_artifact_fkey
  FOREIGN KEY (source_artifact_id, household_id, profile_id)
  REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;

ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_revision_check CHECK (revision > 0);
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_relation_check
  CHECK (relation = ANY (ARRAY['renewal'::text, 'follow_up'::text, 'next_step'::text]));
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_producer_values_check
  CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_confidence_check
  CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
         AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.life_record_task_links ADD CONSTRAINT life_record_task_links_source_artifact_check
  CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));

CREATE INDEX life_record_task_links_owner_idx ON public.life_record_task_links (household_id, profile_id);
CREATE INDEX life_record_task_links_life_record_fk_idx ON public.life_record_task_links (life_record_id, household_id, profile_id);
CREATE INDEX life_record_task_links_task_fk_idx ON public.life_record_task_links (task_id, household_id);
CREATE INDEX life_record_task_links_source_artifact_id_fk_idx
  ON public.life_record_task_links (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;

-- The guard. SECURITY INVOKER on purpose: it sees Tasks exactly as the caller's RLS lets the caller see them, so every way a link
-- can be wrong about its Task answers with the same words. With no authenticated caller (a trusted server context) it still
-- requires the Task to be the link owner's personal Task.
CREATE FUNCTION private.guard_life_record_task_link()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF (v_uid IS NOT NULL AND new.profile_id IS DISTINCT FROM v_uid)
     OR NOT EXISTS (
       SELECT 1 FROM public.tasks t
        WHERE t.id = new.task_id
          AND t.household_id = new.household_id
          AND t.scope = 'personal'
          AND t.owner_profile_id = new.profile_id
     ) THEN
    RAISE EXCEPTION 'life_record_task_links: that task cannot be linked to this record' USING errcode = '42501';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION private.guard_life_record_task_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER life_record_task_links_guard BEFORE INSERT OR UPDATE ON public.life_record_task_links
  FOR EACH ROW EXECUTE FUNCTION private.guard_life_record_task_link();
CREATE TRIGGER life_record_task_links_force_id BEFORE INSERT OR UPDATE ON public.life_record_task_links
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER life_record_task_links_log_change AFTER INSERT OR UPDATE OR DELETE ON public.life_record_task_links
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY life_record_task_links_select_own ON public.life_record_task_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY life_record_task_links_insert_own ON public.life_record_task_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- ============================================================================
-- 3. Privileges — the Build 4 posture: strip what the baseline's default privileges handed out, grant back named verbs/columns.
-- ============================================================================

REVOKE ALL ON public.life_records, public.life_record_task_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.life_records, public.life_record_task_links TO service_role;

GRANT SELECT ON public.life_records TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, title, record_kind, type_name, issuer_name, reference_number,
              issued_on, expires_on, renew_by, review_on, location_hint, note, subject_member_id, status, archived_at, producer,
              source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.life_records TO authenticated;
GRANT UPDATE (title, record_kind, type_name, issuer_name, reference_number, issued_on, expires_on, renew_by, review_on,
              location_hint, note, subject_member_id, status, archived_at, confidence, origin_updated_at)
  ON public.life_records TO authenticated;

GRANT SELECT ON public.life_record_task_links TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, life_record_id, task_id, relation, producer, source_artifact_id,
              confidence, scope, origin_created_at)
  ON public.life_record_task_links TO authenticated;

-- ============================================================================
-- 4. The change log accepts pointers for the two tables (the list is otherwise the Build 4 list, unchanged).
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
    -- HK-FEATURE-10 (Work / Career) and HK-FEATURE-11 (Me / Rebuild), from the earlier additive migrations
    'career_opportunities'::text, 'rebuild_focuses'::text, 'rebuild_focus_links'::text,
    -- HK-FEATURE-12 Life Admin (owner-private)
    'life_records'::text, 'life_record_task_links'::text
  ]));

-- ============================================================================
-- 5. public.sync_push — the two tables are pushable, keyed on their OWNER
-- ============================================================================
--
-- Same signature and same body as 20260921190000_f05_add_child_after_binding.sql, with exactly one difference, marked (F12).

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
  -- (F12) life_records and life_record_task_links are owner-private too, so they key on profile_id.
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
                        -- (F10, F11) from the earlier additive migrations: a replacement must keep every table an earlier one made pushable.
                        'career_opportunities', 'rebuild_focuses', 'rebuild_focus_links',
                        'life_records', 'life_record_task_links'
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
-- 6. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
