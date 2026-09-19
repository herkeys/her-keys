SET check_function_bodies = false;
CREATE SCHEMA private AUTHORIZATION postgres;
CREATE FUNCTION private.is_household_member(p_household_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.profile_id = (select auth.uid())
  );
$function$;
GRANT ALL ON FUNCTION private.is_household_member(text) TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
CREATE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;
CREATE FUNCTION public.set_row_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'revision' then
    new.revision = old.revision + 1;
  end if;
  return new;
end;
$function$;
GRANT ALL ON FUNCTION public.set_row_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_row_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_row_updated_at() TO service_role;
CREATE TABLE public.action_records (id text NOT NULL, household_id text NOT NULL, actor_profile_id uuid NOT NULL, logical_date date NOT NULL, action_type text NOT NULL, approval text NOT NULL, target_type text, target_id text, reason jsonb NOT NULL, before_state jsonb, after_state jsonb, source text DEFAULT 'her_keys_recommendation'::text NOT NULL, scope text DEFAULT 'personal'::text NOT NULL, created_at timestamp with time zone NOT NULL);
ALTER TABLE public.action_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_records ADD CONSTRAINT action_records_action_type_check CHECK (action_type = ANY (ARRAY['daily_load.move_task'::text, 'daily_load.keep_plan'::text, 'daily_load.move_event'::text, 'daily_load.drop_task'::text, 'daily_load.shorten_task'::text, 'daily_load.keep_capacity_plan'::text, 'daily_load.protect_item'::text]));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_after_state_check CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_approval_check CHECK (approval = ANY (ARRAY['approved'::text, 'declined'::text]));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_before_state_check CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_pkey PRIMARY KEY (id);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_reason_check CHECK (jsonb_typeof(reason) = 'object'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_source_check CHECK (source = 'her_keys_recommendation'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_target_type_check CHECK (target_type IS NULL OR (target_type = ANY (ARRAY['task'::text, 'event'::text])));
GRANT ALL ON public.action_records TO authenticated;
GRANT ALL ON public.action_records TO service_role;
CREATE INDEX action_records_household_date_idx ON public.action_records (household_id, logical_date DESC, created_at DESC);
CREATE INDEX action_records_actor_idx ON public.action_records (actor_profile_id, created_at DESC);
CREATE POLICY actions_insert_own ON public.action_records FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = actor_profile_id) AND ( SELECT private.is_household_member(action_records.household_id) AS is_household_member)));
CREATE POLICY actions_select_own ON public.action_records FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = actor_profile_id) AND ( SELECT private.is_household_member(action_records.household_id) AS is_household_member)));
CREATE TABLE public.discovery_answers (discovery_id text NOT NULL, answer_order smallint NOT NULL, question_id text NOT NULL, option_id text NOT NULL);
ALTER TABLE public.discovery_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_answer_order_check CHECK (answer_order >= 1 AND answer_order <= 2);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_discovery_id_question_id_key UNIQUE (discovery_id, question_id);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_option_id_check CHECK (option_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_pkey PRIMARY KEY (discovery_id, answer_order);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_question_id_check CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
GRANT ALL ON public.discovery_answers TO authenticated;
GRANT ALL ON public.discovery_answers TO service_role;
CREATE TABLE public.discovery_records (id text NOT NULL, household_id text NOT NULL, profile_id uuid NOT NULL, topic_id text NOT NULL, scope text DEFAULT 'personal'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
CREATE POLICY discovery_answers_insert_own ON public.discovery_answers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.discovery_records d
  WHERE ((d.id = discovery_answers.discovery_id) AND (d.profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_household_member(d.household_id) AS is_household_member)))));
CREATE POLICY discovery_answers_select_own ON public.discovery_answers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.discovery_records d
  WHERE ((d.id = discovery_answers.discovery_id) AND (d.profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_household_member(d.household_id) AS is_household_member)))));
CREATE POLICY discovery_answers_update_own ON public.discovery_answers FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.discovery_records d
  WHERE ((d.id = discovery_answers.discovery_id) AND (d.profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_household_member(d.household_id) AS is_household_member))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.discovery_records d
  WHERE ((d.id = discovery_answers.discovery_id) AND (d.profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_household_member(d.household_id) AS is_household_member)))));
ALTER TABLE public.discovery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_household_id_profile_id_key UNIQUE (household_id, profile_id);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_pkey PRIMARY KEY (id);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_discovery_id_fkey FOREIGN KEY (discovery_id) REFERENCES public.discovery_records(id) ON DELETE CASCADE;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_revision_check CHECK (revision > 0);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_topic_id_check CHECK (topic_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
GRANT ALL ON public.discovery_records TO authenticated;
GRANT ALL ON public.discovery_records TO service_role;
CREATE INDEX discovery_records_profile_idx ON public.discovery_records (profile_id);
CREATE TRIGGER discovery_set_updated_at BEFORE UPDATE ON public.discovery_records FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY discovery_insert_own ON public.discovery_records FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(discovery_records.household_id) AS is_household_member)));
CREATE POLICY discovery_select_own ON public.discovery_records FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(discovery_records.household_id) AS is_household_member)));
CREATE POLICY discovery_update_own ON public.discovery_records FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(discovery_records.household_id) AS is_household_member))) WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(discovery_records.household_id) AS is_household_member)));
CREATE TABLE public.events (id text NOT NULL, household_id text NOT NULL, title text NOT NULL, category_id text NOT NULL, subject_member_id text, starts_at timestamp with time zone NOT NULL, ends_at timestamp with time zone NOT NULL, location text, notes text, commitment text NOT NULL, status text NOT NULL, travel_minutes_before integer, travel_minutes_after integer, preparation_minutes integer, source text NOT NULL, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ADD CONSTRAINT events_check CHECK (ends_at > starts_at);
ALTER TABLE public.events ADD CONSTRAINT events_commitment_check CHECK (commitment = ANY (ARRAY['fixed'::text, 'flexible'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.events ADD CONSTRAINT events_location_check CHECK (location IS NULL OR char_length(location) <= 200);
ALTER TABLE public.events ADD CONSTRAINT events_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_preparation_minutes_check CHECK (preparation_minutes IS NULL OR preparation_minutes >= 0 AND preparation_minutes <= 240);
ALTER TABLE public.events ADD CONSTRAINT events_revision_check CHECK (revision > 0);
ALTER TABLE public.events ADD CONSTRAINT events_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_source_check CHECK (source = ANY (ARRAY['user'::text, 'demo'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_status_check CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.events ADD CONSTRAINT events_travel_minutes_after_check CHECK (travel_minutes_after IS NULL OR travel_minutes_after >= 0 AND travel_minutes_after <= 240);
ALTER TABLE public.events ADD CONSTRAINT events_travel_minutes_before_check CHECK (travel_minutes_before IS NULL OR travel_minutes_before >= 0 AND travel_minutes_before <= 240);
GRANT ALL ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
CREATE INDEX events_subject_household_fk_idx ON public.events (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX events_subject_member_idx ON public.events (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX events_category_idx ON public.events (category_id);
CREATE INDEX events_household_time_idx ON public.events (household_id, starts_at, ends_at);
CREATE INDEX events_category_household_fk_idx ON public.events (category_id, household_id);
CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY events_insert_member ON public.events FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_household_member(events.household_id) AS is_household_member));
CREATE POLICY events_select_member ON public.events FOR SELECT TO authenticated USING (( SELECT private.is_household_member(events.household_id) AS is_household_member));
CREATE POLICY events_update_member ON public.events FOR UPDATE TO authenticated USING (( SELECT private.is_household_member(events.household_id) AS is_household_member)) WITH CHECK (( SELECT private.is_household_member(events.household_id) AS is_household_member));
CREATE TABLE public.household_categories (id text NOT NULL, household_id text NOT NULL, name text NOT NULL, system_role text, status text NOT NULL, sort_order integer NOT NULL, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.household_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_household_id_sort_order_key UNIQUE (household_id, sort_order);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.events ADD CONSTRAINT events_category_id_household_id_fkey FOREIGN KEY (category_id, household_id) REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 60);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_revision_check CHECK (revision > 0);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_sort_order_check CHECK (sort_order >= 0 AND sort_order <= 10000);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_status_check CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_system_role_check CHECK (system_role IS NULL OR (system_role = ANY (ARRAY['kids'::text, 'home'::text, 'money'::text, 'meals'::text, 'work'::text, 'wellbeing'::text, 'relationships'::text, 'coparenting'::text])));
GRANT ALL ON public.household_categories TO authenticated;
GRANT ALL ON public.household_categories TO service_role;
CREATE INDEX household_categories_household_idx ON public.household_categories (household_id);
CREATE UNIQUE INDEX household_categories_system_role_uq ON public.household_categories (household_id, system_role) WHERE system_role IS NOT NULL;
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.household_categories FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY categories_insert_member ON public.household_categories FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_household_member(household_categories.household_id) AS is_household_member));
CREATE POLICY categories_select_member ON public.household_categories FOR SELECT TO authenticated USING (( SELECT private.is_household_member(household_categories.household_id) AS is_household_member));
CREATE POLICY categories_update_member ON public.household_categories FOR UPDATE TO authenticated USING (( SELECT private.is_household_member(household_categories.household_id) AS is_household_member)) WITH CHECK (( SELECT private.is_household_member(household_categories.household_id) AS is_household_member));
CREATE TABLE public.household_members (id text NOT NULL, household_id text NOT NULL, profile_id uuid, member_type text NOT NULL, role text DEFAULT 'member'::text NOT NULL, display_name text NOT NULL, birth_date date, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_check CHECK (member_type = 'child'::text AND profile_id IS NULL AND birth_date IS NOT NULL AND scope = 'child'::text OR member_type = 'adult'::text AND birth_date IS NULL);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_display_name_check CHECK (char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 80);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.events ADD CONSTRAINT events_subject_member_id_household_id_fkey FOREIGN KEY (subject_member_id, household_id) REFERENCES public.household_members(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_member_type_check CHECK (member_type = ANY (ARRAY['adult'::text, 'child'::text]));
ALTER TABLE public.household_members ADD CONSTRAINT household_members_pkey PRIMARY KEY (id);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_revision_check CHECK (revision > 0);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'member'::text]));
ALTER TABLE public.household_members ADD CONSTRAINT household_members_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
GRANT ALL ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;
CREATE UNIQUE INDEX household_members_profile_per_household_uq ON public.household_members (household_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX household_members_profile_idx ON public.household_members (profile_id);
CREATE INDEX household_members_household_idx ON public.household_members (household_id);
CREATE TRIGGER household_members_set_updated_at BEFORE UPDATE ON public.household_members FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY household_members_select_member ON public.household_members FOR SELECT TO authenticated USING (( SELECT private.is_household_member(household_members.household_id) AS is_household_member));
CREATE TABLE public.household_systems (id text NOT NULL, household_id text NOT NULL, name text NOT NULL, description text NOT NULL, category_id text NOT NULL, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.household_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_category_id_household_id_fkey FOREIGN KEY (category_id, household_id) REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_description_check CHECK (char_length(description) <= 500);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 120);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_pkey PRIMARY KEY (id);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_revision_check CHECK (revision > 0);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
GRANT ALL ON public.household_systems TO authenticated;
GRANT ALL ON public.household_systems TO service_role;
CREATE INDEX household_systems_household_idx ON public.household_systems (household_id);
CREATE INDEX household_systems_category_idx ON public.household_systems (category_id);
CREATE INDEX household_systems_category_household_fk_idx ON public.household_systems (category_id, household_id);
CREATE TRIGGER household_systems_set_updated_at BEFORE UPDATE ON public.household_systems FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY systems_insert_member ON public.household_systems FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_household_member(household_systems.household_id) AS is_household_member));
CREATE POLICY systems_select_member ON public.household_systems FOR SELECT TO authenticated USING (( SELECT private.is_household_member(household_systems.household_id) AS is_household_member));
CREATE POLICY systems_update_member ON public.household_systems FOR UPDATE TO authenticated USING (( SELECT private.is_household_member(household_systems.household_id) AS is_household_member)) WITH CHECK (( SELECT private.is_household_member(household_systems.household_id) AS is_household_member));
CREATE TABLE public.households (id text NOT NULL, display_name text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ADD CONSTRAINT households_display_name_check CHECK (display_name IS NULL OR char_length(display_name) <= 80);
ALTER TABLE public.households ADD CONSTRAINT households_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.households ADD CONSTRAINT households_pkey PRIMARY KEY (id);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.households ADD CONSTRAINT households_revision_check CHECK (revision > 0);
GRANT ALL ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
CREATE TRIGGER households_set_updated_at BEFORE UPDATE ON public.households FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY households_select_member ON public.households FOR SELECT TO authenticated USING (( SELECT private.is_household_member(households.id) AS is_household_member));
CREATE TABLE public.meal_plan_entries (id text NOT NULL, household_id text NOT NULL, meal_date date NOT NULL, title text NOT NULL, category_id text NOT NULL, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_category_id_household_id_fkey FOREIGN KEY (category_id, household_id) REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_revision_check CHECK (revision > 0);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
GRANT ALL ON public.meal_plan_entries TO authenticated;
GRANT ALL ON public.meal_plan_entries TO service_role;
CREATE INDEX meal_plan_entries_category_household_fk_idx ON public.meal_plan_entries (category_id, household_id);
CREATE INDEX meal_plan_entries_category_idx ON public.meal_plan_entries (category_id);
CREATE INDEX meal_plan_entries_household_date_idx ON public.meal_plan_entries (household_id, meal_date);
CREATE TRIGGER meal_plan_entries_set_updated_at BEFORE UPDATE ON public.meal_plan_entries FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY meals_insert_member ON public.meal_plan_entries FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_household_member(meal_plan_entries.household_id) AS is_household_member));
CREATE POLICY meals_select_member ON public.meal_plan_entries FOR SELECT TO authenticated USING (( SELECT private.is_household_member(meal_plan_entries.household_id) AS is_household_member));
CREATE POLICY meals_update_member ON public.meal_plan_entries FOR UPDATE TO authenticated USING (( SELECT private.is_household_member(meal_plan_entries.household_id) AS is_household_member)) WITH CHECK (( SELECT private.is_household_member(meal_plan_entries.household_id) AS is_household_member));
CREATE TABLE public.needs_me_items (id text NOT NULL, household_id text NOT NULL, profile_id uuid NOT NULL, title text NOT NULL, status text NOT NULL, due_date date, category_id text, scope text DEFAULT 'personal'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.needs_me_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_category_id_household_id_fkey FOREIGN KEY (category_id, household_id) REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_pkey PRIMARY KEY (id);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_revision_check CHECK (revision > 0);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_status_check CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text]));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
GRANT ALL ON public.needs_me_items TO authenticated;
GRANT ALL ON public.needs_me_items TO service_role;
CREATE INDEX needs_me_items_household_status_idx ON public.needs_me_items (household_id, status, created_at DESC);
CREATE INDEX needs_me_items_profile_idx ON public.needs_me_items (profile_id);
CREATE INDEX needs_me_items_category_household_fk_idx ON public.needs_me_items (category_id, household_id) WHERE category_id IS NOT NULL;
CREATE TRIGGER needs_me_set_updated_at BEFORE UPDATE ON public.needs_me_items FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY needs_me_insert_own ON public.needs_me_items FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(needs_me_items.household_id) AS is_household_member)));
CREATE POLICY needs_me_select_own ON public.needs_me_items FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(needs_me_items.household_id) AS is_household_member)));
CREATE POLICY needs_me_update_own ON public.needs_me_items FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(needs_me_items.household_id) AS is_household_member))) WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(needs_me_items.household_id) AS is_household_member)));
CREATE TABLE public.onboarding_state (household_id text NOT NULL, profile_id uuid NOT NULL, goal_ids text[] DEFAULT '{}'::text[] NOT NULL, strength_ids text[] DEFAULT '{}'::text[] NOT NULL, struggle_ids text[] DEFAULT '{}'::text[] NOT NULL, last_step text, completed_at timestamp with time zone, scope text DEFAULT 'personal'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_last_step_check CHECK (last_step IS NULL OR (last_step = ANY (ARRAY['goals'::text, 'strengths'::text, 'struggles'::text, 'talk-it-out'::text, 'profile'::text, 'plus'::text])));
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_pkey PRIMARY KEY (household_id, profile_id);
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_revision_check CHECK (revision > 0);
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_scope_check CHECK (scope = 'personal'::text);
GRANT ALL ON public.onboarding_state TO authenticated;
GRANT ALL ON public.onboarding_state TO service_role;
CREATE INDEX onboarding_state_profile_idx ON public.onboarding_state (profile_id);
CREATE TRIGGER onboarding_set_updated_at BEFORE UPDATE ON public.onboarding_state FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY onboarding_insert_own ON public.onboarding_state FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(onboarding_state.household_id) AS is_household_member)));
CREATE POLICY onboarding_select_own ON public.onboarding_state FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(onboarding_state.household_id) AS is_household_member)));
CREATE POLICY onboarding_update_own ON public.onboarding_state FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(onboarding_state.household_id) AS is_household_member))) WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(onboarding_state.household_id) AS is_household_member)));
CREATE TABLE public.one_move_records (id text NOT NULL, household_id text NOT NULL, profile_id uuid NOT NULL, for_date date NOT NULL, target_id text, target_type text NOT NULL, status text NOT NULL, decided_at timestamp with time zone NOT NULL, completed_at timestamp with time zone, scope text DEFAULT 'personal'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.one_move_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_check CHECK ((status = 'withheld'::text) = (target_id IS NULL));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_check1 CHECK ((status = 'completed'::text) = (completed_at IS NOT NULL));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_id_profile_id_for_date_key UNIQUE (household_id, profile_id, for_date);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_pkey PRIMARY KEY (id);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_revision_check CHECK (revision > 0);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_status_check CHECK (status = ANY (ARRAY['selected'::text, 'completed'::text, 'withheld'::text]));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_type_check CHECK (target_type = ANY (ARRAY['catalog'::text, 'task'::text, 'needsMe'::text]));
GRANT ALL ON public.one_move_records TO authenticated;
GRANT ALL ON public.one_move_records TO service_role;
CREATE INDEX one_move_records_profile_date_idx ON public.one_move_records (profile_id, for_date DESC);
CREATE TRIGGER one_move_set_updated_at BEFORE UPDATE ON public.one_move_records FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY one_move_insert_own ON public.one_move_records FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(one_move_records.household_id) AS is_household_member)));
CREATE POLICY one_move_select_own ON public.one_move_records FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(one_move_records.household_id) AS is_household_member)));
CREATE POLICY one_move_update_own ON public.one_move_records FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(one_move_records.household_id) AS is_household_member))) WITH CHECK (((( SELECT auth.uid() AS uid) = profile_id) AND ( SELECT private.is_household_member(one_move_records.household_id) AS is_household_member)));
CREATE TABLE public.profiles (id uuid NOT NULL, display_name text, timezone text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_check CHECK (display_name IS NULL OR char_length(display_name) <= 80);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_revision_check CHECK (revision > 0);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_timezone_check CHECK (char_length(timezone) >= 1 AND char_length(timezone) <= 64);
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE TABLE public.tasks (id text NOT NULL, household_id text NOT NULL, title text NOT NULL, category_id text NOT NULL, subject_member_id text, duration_minutes integer NOT NULL, commitment text NOT NULL, due_date date, plan_kind text NOT NULL, planned_date date, planned_starts_at timestamp with time zone, notes text, status text NOT NULL, completed_at timestamp with time zone, scope text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, revision bigint DEFAULT 1 NOT NULL);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_id_household_id_fkey FOREIGN KEY (category_id, household_id) REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_check CHECK (plan_kind = 'unplanned'::text AND planned_date IS NULL AND planned_starts_at IS NULL OR plan_kind = 'day'::text AND planned_date IS NOT NULL AND planned_starts_at IS NULL OR plan_kind = 'timed'::text AND planned_date IS NULL AND planned_starts_at IS NOT NULL);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_check1 CHECK ((status = 'completed'::text) = (completed_at IS NOT NULL));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_commitment_check CHECK (commitment = ANY (ARRAY['fixed'::text, 'flexible'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_duration_minutes_check CHECK (duration_minutes >= 0 AND duration_minutes <= 1440);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_id_check CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_plan_kind_check CHECK (plan_kind = ANY (ARRAY['unplanned'::text, 'day'::text, 'timed'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_revision_check CHECK (revision > 0);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_scope_check CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text, 'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['open'::text, 'completed'::text, 'archived'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_subject_member_id_household_id_fkey FOREIGN KEY (subject_member_id, household_id) REFERENCES public.household_members(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
GRANT ALL ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
CREATE INDEX tasks_household_status_due_idx ON public.tasks (household_id, status, due_date);
CREATE INDEX tasks_subject_household_fk_idx ON public.tasks (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX tasks_category_household_fk_idx ON public.tasks (category_id, household_id);
CREATE INDEX tasks_household_planned_date_idx ON public.tasks (household_id, planned_date) WHERE planned_date IS NOT NULL;
CREATE INDEX tasks_household_planned_start_idx ON public.tasks (household_id, planned_starts_at) WHERE planned_starts_at IS NOT NULL;
CREATE INDEX tasks_category_idx ON public.tasks (category_id);
CREATE INDEX tasks_subject_member_idx ON public.tasks (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE POLICY tasks_insert_member ON public.tasks FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_household_member(tasks.household_id) AS is_household_member));
CREATE POLICY tasks_select_member ON public.tasks FOR SELECT TO authenticated USING (( SELECT private.is_household_member(tasks.household_id) AS is_household_member));
CREATE POLICY tasks_update_member ON public.tasks FOR UPDATE TO authenticated USING (( SELECT private.is_household_member(tasks.household_id) AS is_household_member)) WITH CHECK (( SELECT private.is_household_member(tasks.household_id) AS is_household_member));
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();

-- Baseline replay normalization (owner-authorized, Phase 1).
-- Purpose: reproduce the privileges that hosted Her Keys Staging objects already have.
-- These REVOKEs remove only privileges that a fresh replay inherits from the stock
-- ALTER DEFAULT PRIVILEGES above and from PostgreSQL default function EXECUTE to PUBLIC,
-- and that hosted Staging does not grant. They do not tighten Staging.
REVOKE ALL ON TABLE public.action_records FROM anon;
REVOKE ALL ON TABLE public.discovery_answers FROM anon;
REVOKE ALL ON TABLE public.discovery_records FROM anon;
REVOKE ALL ON TABLE public.events FROM anon;
REVOKE ALL ON TABLE public.household_categories FROM anon;
REVOKE ALL ON TABLE public.household_members FROM anon;
REVOKE ALL ON TABLE public.household_systems FROM anon;
REVOKE ALL ON TABLE public.households FROM anon;
REVOKE ALL ON TABLE public.meal_plan_entries FROM anon;
REVOKE ALL ON TABLE public.needs_me_items FROM anon;
REVOKE ALL ON TABLE public.onboarding_state FROM anon;
REVOKE ALL ON TABLE public.one_move_records FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.tasks FROM anon;
REVOKE ALL ON FUNCTION private.is_household_member(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_row_updated_at() FROM PUBLIC;
