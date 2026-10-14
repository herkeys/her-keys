-- Additive lifecycle. No scheduler activation and no customer data mutation on apply.
BEGIN;
CREATE TABLE public.account_deletion_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid, requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 deactivated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 grace_period_ends_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 days'),
 status text NOT NULL CHECK(status IN ('deactivated','restoring','restored','processing','retry_pending','failed_requires_action','purged')),
 receipt_hash text NOT NULL UNIQUE, recovery_hash text, recovery_expires_at timestamptz,
 restored_at timestamptz, purged_at timestamptz, verified_at timestamptz,
 lease_until timestamptz, fence bigint NOT NULL DEFAULT 0,
 attempts int NOT NULL DEFAULT 0, retry_at timestamptz, failure_category text,
 evidence jsonb NOT NULL DEFAULT '{}',
 auth_deactivation_pending boolean NOT NULL DEFAULT true,
 CHECK(grace_period_ends_at = requested_at + interval '30 days'),
 CHECK(status <> 'purged' OR (purged_at IS NOT NULL AND verified_at IS NOT NULL AND account_id IS NULL))
);
CREATE UNIQUE INDEX deletion_one_open_account ON public.account_deletion_requests(account_id)
 WHERE status <> 'restored' AND account_id IS NOT NULL;
CREATE INDEX deletion_worker_due ON public.account_deletion_requests(grace_period_ends_at,retry_at)
 WHERE status IN ('deactivated','processing','retry_pending');
CREATE TABLE public.account_deletion_receipts (
 receipt_hash text PRIMARY KEY CHECK(length(receipt_hash)=43),
 request_id uuid NOT NULL REFERENCES public.account_deletion_requests(id)
);
CREATE TABLE public.account_deletion_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false, dry_run boolean NOT NULL DEFAULT true,
 batch_size int NOT NULL DEFAULT 5 CHECK(batch_size BETWEEN 1 AND 20),
 max_attempts int NOT NULL DEFAULT 8 CHECK(max_attempts BETWEEN 1 AND 20),
 last_run_at timestamptz
);
INSERT INTO public.account_deletion_control(singleton) VALUES(true);
CREATE TABLE public.account_deletion_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.account_deletion_requests(id),
 kind text NOT NULL, payload_ciphertext text, payload_iv text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','failed','expired')),
 attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 delivery_status text NOT NULL DEFAULT 'unconfirmed', delivery_checked_at timestamptz,
 first_attempt_at timestamptz,
 failure_category text,
 UNIQUE(request_id,kind,created_at)
);
CREATE TABLE public.account_deletion_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, dry_run boolean NOT NULL, claimed int NOT NULL DEFAULT 0,
 failure_category text
);
CREATE TABLE public.account_deletion_rate_limits (
 key_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), hits int NOT NULL DEFAULT 1
);
CREATE TABLE public.account_deletion_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,lease_until timestamptz NOT NULL DEFAULT(now()+interval '2 minutes'),
 status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','accepted','failed')),
 provider_message_id text
);
CREATE TABLE public.account_deletion_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES public.account_deletion_requests(id),
 resource_table text NOT NULL,resource_id text NOT NULL,reason text NOT NULL,
 restrict_access boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 target_resolution_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
 resolved_at timestamptz,resolution_reference text,
 UNIQUE(request_id,resource_table,resource_id),
 CHECK((resolved_at IS NULL)=(resolution_reference IS NULL))
);
CREATE TABLE public.apple_revocation_credentials (
 account_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 token_ciphertext text NOT NULL, token_iv text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.deletion_resource_registry(table_name text PRIMARY KEY, owner_column text NOT NULL, household_scoped boolean NOT NULL);
INSERT INTO private.deletion_resource_registry VALUES
 ('tasks','owner_profile_id',true),
 ('responsibilities','profile_id',true),
 ('household_systems','owner_profile_id',true),
 ('needs_me_items','profile_id',true),
 ('capacity_profiles','profile_id',true),
 ('patterns','profile_id',true),
 ('meal_plan_entries','owner_profile_id',true),
 ('evidence_links','profile_id',true),
 ('account_claims','profile_id',true),
 ('household_members','profile_id',true),
 ('dependencies','profile_id',true),
 ('behavior_observations','profile_id',true),
 ('career_opportunities','profile_id',true),
 ('rebuild_focuses','profile_id',true),
 ('action_outcomes','profile_id',true),
 ('rebuild_focus_links','profile_id',true),
 ('discovery_records','profile_id',true),
 ('life_records','profile_id',true),
 ('recurrence_rules','profile_id',true),
 ('life_record_task_links','profile_id',true),
 ('change_log','owner_profile_id',true),
 ('person_contexts','profile_id',true),
 ('person_task_links','profile_id',true),
 ('calendar_oauth_states','user_id',false),
 ('account_consents','account_id',false),
 ('external_calendar_connections','user_id',false),
 ('system_steps','profile_id',true),
 ('onboarding_state','profile_id',true),
 ('household_categories','owner_profile_id',true),
 ('source_artifacts','profile_id',true),
 ('interpretations','profile_id',true),
 ('events','owner_profile_id',true),
 ('external_references','profile_id',true),
 ('one_move_records','profile_id',true),
 ('automation_authorities','profile_id',true),
 ('goals','profile_id',true),
 ('action_records','actor_profile_id',true),
 ('action_intents','profile_id',true),
 ('intent_decisions','profile_id',true),
 ('action_executions','profile_id',true),
 ('household_people','profile_id',true),
 ('herkeys_welcome_email_receipts','user_id',false),
 ('apple_revocation_credentials','account_id',false);

DO $ddl$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['account_deletion_requests','account_deletion_control','account_deletion_outbox',
 'account_deletion_runs','account_deletion_rate_limits','account_deletion_receipts','account_deletion_alerts','account_deletion_cases','apple_revocation_credentials'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $ddl$;
REVOKE ALL ON private.deletion_resource_registry FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.account_is_active(p_account uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT p_account IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM public.account_deletion_requests WHERE account_id=p_account AND status <> 'restored')
$fn$;
REVOKE ALL ON FUNCTION private.account_is_active(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.account_is_active(uuid) TO authenticated,service_role;
CREATE FUNCTION public.account_access_status() RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT CASE WHEN auth.uid() IS NULL THEN 'unauthorized'
 WHEN private.account_is_active(auth.uid()) THEN 'active' ELSE 'pending' END
$fn$;
REVOKE ALL ON FUNCTION public.account_access_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_access_status() TO authenticated,service_role;

-- Restrictive policies AND with every existing permissive policy. They cannot grant new access.
DO $ddl$
DECLARE t record;
BEGIN
 FOR t IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public'
 AND 'authenticated'=ANY(roles) LOOP
 EXECUTE format('CREATE POLICY deletion_active_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.account_is_active((SELECT auth.uid()))) WITH CHECK (private.account_is_active((SELECT auth.uid())))',t.tablename);
 END LOOP;
END $ddl$;

-- Existing privileged RPCs bypass RLS: add the same check to their bodies, preserving signatures/defaults/grants.
DO $ddl$
DECLARE f record; definition text; body text;
BEGIN
 FOR f IN SELECT p.oid,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('bootstrap_account','claim_local_household','sync_push','sync_pull','add_household_child') LOOP
 IF position('BEGIN' IN f.prosrc)=0 THEN RAISE EXCEPTION 'Expected plpgsql RPC body'; END IF;
 body := overlay(f.prosrc PLACING E'BEGIN\n IF NOT private.account_is_active(auth.uid()) THEN RAISE EXCEPTION ''account_deactivated'' USING ERRCODE=''42501''; END IF;' FROM position('BEGIN' IN f.prosrc) FOR 5);
 definition:=replace(pg_get_functiondef(f.oid),f.prosrc,body);
 EXECUTE definition;
 END LOOP;
END $ddl$;

-- Whole-household cascades must not generate orphan tombstones. Existing log semantics remain for surviving households.
DO $ddl$
DECLARE v_oid oid := 'public.log_row_change()'::regprocedure; v_body text;
BEGIN
 SELECT prosrc INTO v_body FROM pg_proc WHERE oid=v_oid;
 EXECUTE replace(pg_get_functiondef(v_oid),v_body,replace(v_body,
  'v_house := (v_row ->> TG_ARGV[0])::uuid;',
  'v_house := (v_row ->> TG_ARGV[0])::uuid; IF tg_op = ''DELETE'' AND NOT EXISTS(SELECT 1 FROM public.households WHERE id=v_house) THEN RETURN NULL; END IF;'));
END $ddl$;
CREATE FUNCTION public.herkeys_deletion_command(p_action text,p_args jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.account_deletion_requests; c public.account_deletion_control;
 v_account uuid; v_id uuid; v_fence bigint; v_count bigint; v_resource record; v_house uuid;
 v_rows jsonb; v_now timestamptz := clock_timestamp(); v_hash text;
BEGIN
 -- Only service_role has EXECUTE. No settable GUC supplies worker authority.
 IF p_action='request' THEN
  v_account:=(p_args->>'account_id')::uuid;
  IF v_account IS NULL THEN RAISE EXCEPTION 'missing_identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_account::text,0));
  SELECT * INTO r FROM public.account_deletion_requests WHERE account_id=v_account AND status<>'restored' FOR UPDATE;
  IF FOUND THEN
   INSERT INTO public.account_deletion_receipts(receipt_hash,request_id) VALUES(p_args->>'receipt_hash',r.id) ON CONFLICT DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM public.account_deletion_receipts WHERE receipt_hash=p_args->>'receipt_hash' AND request_id=r.id) THEN RAISE EXCEPTION 'receipt_collision'; END IF;
   RETURN jsonb_build_object('request_id',r.id,'status','pending','deadline',r.grace_period_ends_at,'duplicate',true);
  END IF;
  -- The Edge verifies the bearer. The session was freshly authenticated, not merely refreshed.
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(p_args->>'session_id')::uuid
    AND user_id=v_account AND created_at > v_now-interval '10 minutes') THEN
   RAISE EXCEPTION 'recent_auth_required' USING ERRCODE='42501';
  END IF;
  IF length(p_args->>'receipt_hash')<>43 OR length(p_args->>'recovery_hash')<>43 THEN RAISE EXCEPTION 'invalid_proof'; END IF;
  INSERT INTO public.account_deletion_requests(account_id,requested_at,deactivated_at,grace_period_ends_at,status,receipt_hash,recovery_hash,recovery_expires_at)
   VALUES(v_account,v_now,v_now,v_now+interval '30 days','deactivated',p_args->>'receipt_hash',p_args->>'recovery_hash',v_now+interval '30 days') RETURNING * INTO r;
  INSERT INTO public.account_deletion_receipts(receipt_hash,request_id) VALUES(p_args->>'receipt_hash',r.id);
  INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at)
   VALUES(r.id,'recovery',p_args->>'ciphertext',p_args->>'iv',r.grace_period_ends_at);
  RETURN jsonb_build_object('request_id',r.id,'status','pending','deadline',r.grace_period_ends_at,'duplicate',false);
 ELSIF p_action='deactivation_ack' THEN
  UPDATE public.account_deletion_requests SET auth_deactivation_pending=false,
   evidence=evidence||jsonb_build_object('auth_ban',p_args->'auth_ban','session_revocation',p_args->'session_revocation')
   WHERE id=(p_args->>'request_id')::uuid AND status IN ('deactivated','restoring');
  RETURN '{"ok":true}'::jsonb;
 ELSIF p_action='lookup_pending' THEN
  SELECT d.* INTO r FROM public.account_deletion_requests d JOIN auth.users u ON u.id=d.account_id
   WHERE lower(u.email)=lower(p_args->>'email') AND d.status='deactivated' AND d.grace_period_ends_at>v_now;
  RETURN jsonb_build_object('account_id',r.account_id);
 ELSIF p_action='health' THEN
  SELECT * INTO c FROM public.account_deletion_control WHERE singleton;
  RETURN jsonb_build_object('enabled',c.enabled,'last_run_at',c.last_run_at,
   'scheduler_stale',c.enabled AND (c.last_run_at IS NULL OR c.last_run_at<v_now-interval '15 minutes'),
   'failed',(SELECT count(*) FROM public.account_deletion_requests WHERE status='failed_requires_action'),
   'overdue_cases',(SELECT count(*) FROM public.account_deletion_cases WHERE resolved_at IS NULL AND target_resolution_at<v_now),
   'stale_leases',(SELECT count(*) FROM public.account_deletion_requests WHERE status='processing' AND lease_until<v_now-interval '5 minutes'),
   'email_problems',(SELECT count(*) FROM public.account_deletion_outbox WHERE
    status='failed' OR failure_category IS NOT NULL OR delivery_status IN ('bounced','complained','failed','suppressed')
    OR (status='accepted' AND delivery_status='unconfirmed' AND created_at<v_now-interval '30 minutes')));
 ELSIF p_action='claim_email' THEN
  UPDATE public.account_deletion_outbox SET status='expired',payload_ciphertext=NULL,payload_iv=NULL,failure_category='retry_horizon_elapsed'
   WHERE status IN ('queued','sending','failed') AND (expires_at<=v_now OR first_attempt_at<v_now-interval '23 hours');
  WITH due AS (SELECT id FROM public.account_deletion_outbox WHERE status IN ('queued','failed','sending')
   AND next_attempt_at<=v_now AND coalesce(lease_until,v_now)<=v_now AND attempts<8
   AND (kind<>'recovery' OR EXISTS(SELECT 1 FROM public.account_deletion_requests d WHERE d.id=request_id AND NOT d.auth_deactivation_pending))
   AND (kind<>'completed' OR EXISTS(SELECT 1 FROM public.account_deletion_requests d WHERE d.id=request_id AND d.status='purged'))
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10), claimed AS (
   UPDATE public.account_deletion_outbox o SET status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,v_now),lease_until=v_now+interval '2 minutes'
   FROM due WHERE o.id=due.id RETURNING o.*)
  SELECT coalesce(jsonb_agg(to_jsonb(claimed)||jsonb_build_object('deadline',d.grace_period_ends_at)),'[]') INTO v_rows
   FROM claimed JOIN public.account_deletion_requests d ON d.id=claimed.request_id;
  RETURN v_rows;
 ELSIF p_action='status' THEN
  SELECT d.* INTO r FROM public.account_deletion_requests d JOIN public.account_deletion_receipts p ON p.request_id=d.id WHERE p.receipt_hash=p_args->>'receipt_hash';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unknown'); END IF;
  RETURN jsonb_build_object('status',CASE WHEN r.status='purged' THEN 'purged' WHEN r.status='restored' THEN 'restored'
    WHEN r.status='failed_requires_action' THEN 'failed' ELSE 'pending' END,
    'deadline',r.grace_period_ends_at,'purged_at',r.purged_at,'verified_at',r.verified_at);
 ELSIF p_action='rate_limit' THEN
  INSERT INTO public.account_deletion_rate_limits(key_hash) VALUES(p_args->>'key_hash')
  ON CONFLICT(key_hash) DO UPDATE SET
   hits=CASE WHEN account_deletion_rate_limits.window_start < v_now-interval '1 hour' THEN 1 ELSE account_deletion_rate_limits.hits+1 END,
   window_start=CASE WHEN account_deletion_rate_limits.window_start < v_now-interval '1 hour' THEN v_now ELSE account_deletion_rate_limits.window_start END
  RETURNING hits INTO v_count;
  RETURN jsonb_build_object('allowed',v_count<=5);
 ELSIF p_action='resend' THEN
  SELECT * INTO r FROM public.account_deletion_requests WHERE account_id=(p_args->>'account_id')::uuid
   AND status='deactivated' AND grace_period_ends_at>v_now FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  UPDATE public.account_deletion_requests SET recovery_hash=p_args->>'recovery_hash' WHERE id=r.id;
  UPDATE public.account_deletion_outbox SET status='expired',payload_ciphertext=NULL,payload_iv=NULL
   WHERE request_id=r.id AND kind='recovery' AND status IN ('queued','failed');
  INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at)
   VALUES(r.id,'recovery',p_args->>'ciphertext',p_args->>'iv',r.grace_period_ends_at);
  RETURN '{}'::jsonb;
 ELSIF p_action='restore' THEN
  SELECT * INTO r FROM public.account_deletion_requests WHERE recovery_hash=p_args->>'recovery_hash' FOR UPDATE;
  v_now:=clock_timestamp();
  IF NOT FOUND OR r.status<>'deactivated' OR r.grace_period_ends_at<=v_now OR r.recovery_expires_at<=v_now THEN
   RETURN jsonb_build_object('status','invalid_or_expired');
  END IF;
  UPDATE public.account_deletion_requests SET status='restoring',recovery_hash=NULL WHERE id=r.id;
  UPDATE public.account_deletion_outbox SET status='expired',payload_ciphertext=NULL,payload_iv=NULL
   WHERE request_id=r.id AND kind='recovery' AND status IN ('queued','failed');
  RETURN jsonb_build_object('status','restoring','account_id',r.account_id,'request_id',r.id);
 ELSIF p_action='restored' THEN
  UPDATE public.account_deletion_requests SET status='restored',restored_at=v_now,recovery_hash=NULL
   WHERE id=(p_args->>'request_id')::uuid AND status='restoring' AND NOT auth_deactivation_pending RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at)
   VALUES(r.id,'restored',p_args->>'ciphertext',p_args->>'iv',v_now+interval '23 hours');
  RETURN jsonb_build_object('status','restored');
 ELSIF p_action='complete_run' THEN
  UPDATE public.account_deletion_runs SET finished_at=v_now WHERE id=(p_args->>'run_id')::uuid;
  RETURN '{"ok":true}'::jsonb;
 ELSIF p_action='requeue_reviewed' THEN
  IF length(p_args->>'resolution_reference') NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'resolution_reference_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_cases WHERE request_id=(p_args->>'request_id')::uuid AND resolved_at IS NULL) THEN RAISE EXCEPTION 'unresolved_cases'; END IF;
  UPDATE public.account_deletion_requests SET status='retry_pending',attempts=0,retry_at=v_now,lease_until=NULL
   WHERE id=(p_args->>'request_id')::uuid AND status='failed_requires_action';
  RETURN '{"ok":true}'::jsonb;
 ELSIF p_action='claim' THEN
  SELECT * INTO c FROM public.account_deletion_control WHERE singleton;
  UPDATE public.account_deletion_control SET last_run_at=v_now WHERE singleton;
  INSERT INTO public.account_deletion_runs(dry_run) VALUES(c.dry_run) RETURNING id INTO v_id;
  IF NOT c.enabled OR c.dry_run THEN
   UPDATE public.account_deletion_runs SET finished_at=v_now WHERE id=v_id;
   RETURN jsonb_build_object('run_id',v_id,'requests','[]'::jsonb,'dry_run',c.dry_run,'enabled',c.enabled);
  END IF;
  -- Failed expired leases at the attempt ceiling are made visible instead of silently stuck.
  UPDATE public.account_deletion_requests SET status='failed_requires_action',failure_category='attempts_exhausted'
   WHERE status IN ('processing','retry_pending') AND attempts>=c.max_attempts AND coalesce(lease_until,v_now)<=v_now;
  WITH due AS (
   SELECT id FROM public.account_deletion_requests WHERE
    (status IN ('deactivated','retry_pending') OR (status='processing' AND lease_until<=v_now))
    AND grace_period_ends_at<=v_now AND coalesce(retry_at,v_now)<=v_now AND attempts<c.max_attempts
   ORDER BY grace_period_ends_at FOR UPDATE SKIP LOCKED LIMIT c.batch_size
  ), claimed AS (
   UPDATE public.account_deletion_requests d SET status='processing',attempts=attempts+1,fence=fence+1,
    lease_until=v_now+interval '5 minutes',retry_at=NULL
   FROM due WHERE d.id=due.id RETURNING d.id,d.account_id,d.fence,d.evidence,d.attempts
  ) SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]') INTO v_rows FROM claimed;
  UPDATE public.account_deletion_runs SET claimed=jsonb_array_length(v_rows) WHERE id=v_id;
  RETURN jsonb_build_object('run_id',v_id,'requests',v_rows,'dry_run',false,'enabled',true,'max_attempts',c.max_attempts);
 END IF;

 v_id:=(p_args->>'request_id')::uuid; v_fence:=(p_args->>'fence')::bigint;
 SELECT * INTO r FROM public.account_deletion_requests WHERE id=v_id FOR UPDATE;
 v_now:=clock_timestamp();
 SELECT * INTO c FROM public.account_deletion_control WHERE singleton;
 IF NOT FOUND OR r.status<>'processing' OR r.fence IS DISTINCT FROM v_fence OR r.lease_until<=v_now
  OR NOT c.enabled OR c.dry_run THEN RAISE EXCEPTION 'lease_or_control_refused' USING ERRCODE='42501'; END IF;
 IF p_action='check' THEN
  RETURN jsonb_build_object('account_id',r.account_id,'evidence',r.evidence);
 ELSIF p_action='storage_inventory' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]') INTO v_rows FROM
   (SELECT bucket_id,name FROM storage.objects WHERE owner_id=r.account_id::text ORDER BY id LIMIT 100) o;
  RETURN v_rows;
 ELSIF p_action='prepare_completion' THEN
  IF NOT EXISTS(SELECT 1 FROM public.account_deletion_outbox WHERE request_id=v_id AND kind='completed') THEN
   INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at)
    VALUES(v_id,'completed',p_args->>'ciphertext',p_args->>'iv',v_now+interval '7 days');
  ELSE
   UPDATE public.account_deletion_outbox SET payload_ciphertext=p_args->>'ciphertext',payload_iv=p_args->>'iv',
    status='queued',expires_at=v_now+interval '7 days',first_attempt_at=NULL,attempts=0,failure_category=NULL
    WHERE request_id=v_id AND kind='completed' AND provider_message_id IS NULL;
  END IF;
 ELSIF p_action='evidence' THEN
  UPDATE public.account_deletion_requests SET evidence=evidence || jsonb_build_object(p_args->>'resource',p_args->'result') WHERE id=v_id;
 ELSIF p_action='retry' THEN
  IF p_args->>'category'='shared_resources_pending_review' AND NOT EXISTS(SELECT 1 FROM public.account_deletion_outbox WHERE request_id=v_id AND kind='problem') THEN
   INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at)
    SELECT v_id,'problem',payload_ciphertext,payload_iv,v_now+interval '23 hours'
    FROM public.account_deletion_outbox WHERE request_id=v_id AND kind='completed' AND payload_ciphertext IS NOT NULL LIMIT 1;
  END IF;
  UPDATE public.account_deletion_requests SET status=CASE WHEN attempts>=c.max_attempts OR p_args->>'permanent'='true'
   THEN 'failed_requires_action' ELSE 'retry_pending' END,
   retry_at=v_now+make_interval(secs=>least(86400,60*power(2,attempts)::int)),
   lease_until=NULL,failure_category=left(p_args->>'category',80) WHERE id=v_id;
 ELSIF p_action='cleanup_safe' THEN
  DELETE FROM public.account_consents WHERE account_id=r.account_id;
  DELETE FROM public.calendar_oauth_states WHERE user_id=r.account_id;
  IF to_regclass('public.herkeys_welcome_email_receipts') IS NOT NULL THEN
   EXECUTE 'DELETE FROM public.herkeys_welcome_email_receipts WHERE user_id=$1' USING r.account_id;
  END IF;
  UPDATE public.account_deletion_requests SET evidence=evidence||'{"safe_account_cleanup":true}'::jsonb WHERE id=v_id;
 ELSIF p_action='database_cleanup' THEN
  -- Block schema drift: every current application table must be classified.
  IF EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
    AND t.table_name NOT LIKE 'account_deletion_%' AND t.table_name NOT IN ('households','profiles','discovery_answers')
    AND NOT EXISTS(SELECT 1 FROM private.deletion_resource_registry x WHERE x.table_name=t.table_name)) THEN
   RAISE EXCEPTION 'unclassified_resource';
  END IF;
  -- Shared-household ownership is not silently transferred or destroyed.
  IF EXISTS(SELECT 1 FROM public.household_members a JOIN public.household_members b USING(household_id)
    WHERE a.profile_id=r.account_id AND b.profile_id<>r.account_id) THEN
   RETURN private.deletion_cleanup_shared(r.account_id,r.id);
  END IF;
  -- Source-aware tombstones must not recreate household rows during whole-household erasure.
  DELETE FROM public.account_claims WHERE profile_id=r.account_id;
  FOR v_house IN SELECT household_id FROM public.household_members WHERE profile_id=r.account_id LOOP
   DELETE FROM public.households WHERE id=v_house;
  END LOOP;
  FOR v_resource IN SELECT * FROM private.deletion_resource_registry LOOP
   IF to_regclass('public.'||v_resource.table_name) IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',v_resource.table_name,v_resource.owner_column) INTO v_count USING r.account_id;
    -- Cascades have removed household resources. Account-scoped leftovers are deleted explicitly.
    IF NOT v_resource.household_scoped AND v_resource.table_name NOT IN ('external_calendar_connections','apple_revocation_credentials') THEN
     EXECUTE format('DELETE FROM public.%I WHERE %I=$1',v_resource.table_name,v_resource.owner_column) USING r.account_id;
     EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',v_resource.table_name,v_resource.owner_column) INTO v_count USING r.account_id;
    END IF;
    IF v_count<>0 AND v_resource.table_name NOT IN ('external_calendar_connections','apple_revocation_credentials') THEN RAISE EXCEPTION 'resource_remaining:%',v_resource.table_name; END IF;
    UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object(v_resource.table_name,jsonb_build_object('remaining',v_count)) WHERE id=v_id;
   END IF;
  END LOOP;
  -- Provider credentials reference the profile. Keep it restricted until revocation succeeds.
  IF NOT EXISTS(SELECT 1 FROM public.external_calendar_connections WHERE user_id=r.account_id)
   AND NOT EXISTS(SELECT 1 FROM public.apple_revocation_credentials WHERE account_id=r.account_id) THEN
   DELETE FROM public.profiles WHERE id=r.account_id;
  END IF;
  UPDATE public.account_deletion_requests SET evidence=evidence||'{"database":true}'::jsonb WHERE id=v_id;
 ELSIF p_action='finish' THEN
  IF EXISTS(SELECT 1 FROM public.account_deletion_cases WHERE request_id=v_id AND resolved_at IS NULL)
   OR EXISTS(SELECT 1 FROM auth.users WHERE id=r.account_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=r.account_id)
   OR NOT (r.evidence @> '{"database":true,"auth":true,"storage":true,"providers":true}'::jsonb) THEN RAISE EXCEPTION 'terminal_verification_failed'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE owner_id=r.account_id::text) THEN RAISE EXCEPTION 'storage_remaining'; END IF;
  UPDATE public.account_deletion_requests SET status='purged',purged_at=v_now,verified_at=v_now,account_id=NULL,
   recovery_hash=NULL,lease_until=NULL,failure_category=NULL WHERE id=v_id;
 ELSE RAISE EXCEPTION 'unknown_command'; END IF;
 RETURN '{"ok":true}'::jsonb;
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_deletion_command(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_deletion_command(text,jsonb) TO service_role;

-- Scheduler credentials never enter pg_net headers. Only a short-lived HMAC is sent.
CREATE TABLE private.deletion_worker_key(singleton boolean PRIMARY KEY CHECK(singleton),secret text NOT NULL);
INSERT INTO private.deletion_worker_key VALUES(true,gen_random_uuid()::text||gen_random_uuid()::text);
REVOKE ALL ON private.deletion_worker_key FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.herkeys_verify_deletion_worker(p_timestamp text,p_signature text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE expected text; supplied_at timestamptz;
BEGIN
 IF p_timestamp !~ '^[0-9]{10}$' OR p_signature !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 supplied_at:=to_timestamp(p_timestamp::bigint);
 IF abs(extract(epoch FROM clock_timestamp()-supplied_at))>60 THEN RETURN false; END IF;
 SELECT encode(extensions.hmac(convert_to('herkeys-deletion:'||p_timestamp,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex')
 INTO expected FROM private.deletion_worker_key WHERE singleton;
 RETURN expected=p_signature;
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_verify_deletion_worker(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_verify_deletion_worker(text,text) TO service_role;

-- Service-only provider-write guard closes the OAuth callback check/write race.
CREATE FUNCTION private.refuse_pending_provider_write() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF NOT private.account_is_active((to_jsonb(new)->>TG_ARGV[0])::uuid) THEN
  RAISE EXCEPTION 'account_deactivated' USING ERRCODE='42501';
 END IF;
 RETURN new;
END $fn$;
REVOKE ALL ON FUNCTION private.refuse_pending_provider_write() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.refuse_pending_provider_write() TO service_role;
CREATE TRIGGER deletion_calendar_guard BEFORE INSERT OR UPDATE ON public.external_calendar_connections
 FOR EACH ROW EXECUTE FUNCTION private.refuse_pending_provider_write('user_id');
CREATE TRIGGER deletion_calendar_state_guard BEFORE INSERT OR UPDATE ON public.calendar_oauth_states
 FOR EACH ROW EXECUTE FUNCTION private.refuse_pending_provider_write('user_id');
CREATE TRIGGER deletion_apple_guard BEFORE INSERT OR UPDATE ON public.apple_revocation_credentials
 FOR EACH ROW EXECUTE FUNCTION private.refuse_pending_provider_write('account_id');
-- Approved policy: DELETE_ACCOUNT_OWNED_ESCALATE_SHARED. Never cascade through another person's row.
CREATE FUNCTION private.deletion_has_incoming(p_table text,p_row jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE fk record;pair record;predicate text;missing boolean;found boolean;
BEGIN
 FOR fk IN SELECT oid,conrelid,confrelid,conkey,confkey FROM pg_constraint
  WHERE contype='f' AND confrelid=to_regclass('public.'||p_table) LOOP
  predicate:='';missing:=false;
  FOR pair IN SELECT ca.attname AS child,pa.attname AS parent FROM
   unnest(fk.conkey,fk.confkey) AS keys(childnum,parentnum)
   JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=keys.childnum
   JOIN pg_attribute pa ON pa.attrelid=fk.confrelid AND pa.attnum=keys.parentnum LOOP
   IF p_row->>pair.parent IS NULL THEN missing:=true;EXIT;END IF;
   predicate:=predicate||CASE WHEN predicate='' THEN '' ELSE ' AND ' END||format('%I::text=%L',pair.child,p_row->>pair.parent);
  END LOOP;
  IF missing THEN CONTINUE; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %s)',fk.conrelid::regclass,predicate) INTO found;
  IF found THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_has_incoming(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.deletion_resource_visible(p_table text,p_id text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_cases WHERE resource_table=p_table
  AND resource_id=p_id AND restrict_access AND resolved_at IS NULL)
$fn$;
REVOKE ALL ON FUNCTION private.deletion_resource_visible(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.deletion_resource_visible(text,text) TO authenticated;
DO $ddl$
DECLARE t record;
BEGIN
 FOR t IN SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN pg_tables p ON p.schemaname=c.table_schema AND p.tablename=c.table_name
  WHERE c.table_schema='public' AND c.column_name='id' AND c.table_name NOT LIKE 'account_deletion_%'
  AND c.table_name IN (SELECT table_name FROM private.deletion_resource_registry UNION SELECT 'profiles') LOOP
  EXECUTE format('CREATE POLICY deletion_quarantine ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.deletion_resource_visible(%L,id::text)) WITH CHECK (private.deletion_resource_visible(%L,id::text))',t.table_name,t.table_name,t.table_name);
 END LOOP;
END $ddl$;
CREATE POLICY deletion_quarantine_change_log ON public.change_log AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.deletion_resource_visible(entity_table,entity_id::text))
 WITH CHECK(private.deletion_resource_visible(entity_table,entity_id::text));

CREATE FUNCTION private.deletion_cleanup_shared(p_account uuid,p_request uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE resource record;rowdata jsonb;id_column text;predicate text;progress int;rounds int:=0;n int;cases int;
BEGIN
 -- Inherited ownership is exact, and the child answer rows have no other parent.
 DELETE FROM public.discovery_answers WHERE discovery_id IN(SELECT id FROM public.discovery_records WHERE profile_id=p_account);
 DELETE FROM public.onboarding_state WHERE profile_id=p_account;
 LOOP
  progress:=0;rounds:=rounds+1;
  FOR resource IN SELECT * FROM private.deletion_resource_registry WHERE household_scoped
   AND table_name NOT IN ('household_members','change_log','onboarding_state') LOOP
   predicate:=format('%I=$1',resource.owner_column);
   IF resource.owner_column='owner_profile_id' THEN predicate:=predicate||' AND scope NOT IN (''household'',''child'')';END IF;
   FOR rowdata IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s AND NOT private.deletion_has_incoming(%L,to_jsonb(t)) LIMIT 50',resource.table_name,predicate,resource.table_name) USING p_account LOOP
    IF NOT private.deletion_has_incoming(resource.table_name,rowdata) THEN
     EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND %I=$2',resource.table_name,resource.owner_column) USING (rowdata->>'id')::uuid,p_account;
     GET DIAGNOSTICS n=ROW_COUNT;progress:=progress+n;
    END IF;
   END LOOP;
  END LOOP;
  EXIT WHEN progress=0 OR rounds>=20;
 END LOOP;
 DELETE FROM public.change_log WHERE owner_profile_id=p_account;
 -- Exact unresolved rows become restricted cases. No payload content enters the audit ledger.
 FOR resource IN SELECT * FROM private.deletion_resource_registry WHERE household_scoped
  AND table_name NOT IN ('change_log','onboarding_state') LOOP
  FOR rowdata IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %I=$1',resource.table_name,resource.owner_column) USING p_account LOOP
   INSERT INTO public.account_deletion_cases(request_id,resource_table,resource_id,reason)
    VALUES(p_request,resource.table_name,rowdata->>'id','shared_or_referenced_resource_requires_resolution')
    ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 INSERT INTO public.account_deletion_cases(request_id,resource_table,resource_id,reason)
  SELECT p_request,'household_members',child.id::text,'child_ownership_not_inferred_from_membership'
  FROM public.household_members child WHERE child.member_type='child' AND child.household_id IN
   (SELECT household_id FROM public.household_members WHERE profile_id=p_account) ON CONFLICT DO NOTHING;
 INSERT INTO public.account_deletion_cases(request_id,resource_table,resource_id,reason)
  VALUES(p_request,'profiles',p_account::text,'profile_references_require_shared_resolution') ON CONFLICT DO NOTHING;
 SELECT count(*) INTO cases FROM public.account_deletion_cases WHERE request_id=p_request AND resolved_at IS NULL;
 UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object('shared_policy','DELETE_ACCOUNT_OWNED_ESCALATE_SHARED',
  'unresolved_resources',cases,'private_cleanup_rounds',rounds) WHERE id=p_request;
 RETURN jsonb_build_object('partial',true,'unresolved',cases,'more_work',progress>0 AND rounds>=20);
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_cleanup_shared(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.herkeys_resolve_deletion_case(p_case uuid,p_resolution_reference text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c public.account_deletion_cases;remaining boolean;
BEGIN
 IF length(p_resolution_reference) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'resolution_reference_required'; END IF;
 SELECT * INTO c FROM public.account_deletion_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND OR c.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'case_not_open'; END IF;
 IF c.resource_table NOT IN (SELECT table_name FROM private.deletion_resource_registry UNION SELECT 'profiles') THEN RAISE EXCEPTION 'unclassified_resource'; END IF;
 -- Closing a case cannot itself make retained personal data visible. Reviewed redaction/reconciliation must happen first.
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id::text=$1)',c.resource_table) INTO remaining USING c.resource_id;
 IF remaining THEN RAISE EXCEPTION 'resource_still_exists_requires_reviewed_reconciliation'; END IF;
 UPDATE public.account_deletion_cases SET resolved_at=clock_timestamp(),resolution_reference=p_resolution_reference WHERE id=p_case;
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_resolve_deletion_case(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_resolve_deletion_case(uuid,text) TO service_role;
COMMIT;
