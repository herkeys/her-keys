-- TEMPORARY STAGING ONLY. Drop the RPC after certification. Never Production.
CREATE FUNCTION public.herkeys_deletion_v2_fixture(p_action text,p_args jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a uuid:=(p_args->>'a')::uuid;b uuid:=(p_args->>'b')::uuid;run text:=p_args->>'run';
 h uuid;other_h uuid;request uuid;resource record;counts jsonb:='{}';n bigint;digest text:='';rowtext text;case_row record;
BEGIN
 IF (SELECT project_url FROM private.deletion_scheduler_target WHERE singleton) IS DISTINCT FROM 'https://fhhudicklmpofuzkxeqe.supabase.co' THEN RAISE EXCEPTION 'staging_only'; END IF;
 IF a IS NULL OR b IS NULL OR a=b OR run IS NULL OR length(run)<>36 THEN RAISE EXCEPTION 'fixture_identity_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=b AND raw_app_meta_data->>'deletion_certification_run'=run AND raw_app_meta_data->'deletion_certification_fixture'='true'::jsonb)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=a AND (raw_app_meta_data->>'deletion_certification_run' IS DISTINCT FROM run OR raw_app_meta_data->'deletion_certification_fixture' IS DISTINCT FROM 'true'::jsonb)) THEN RAISE EXCEPTION 'owned_disposable_fixture_required'; END IF;
 IF p_action='seed' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=a) THEN RAISE EXCEPTION 'fixture_missing'; END IF;
  SELECT household_id INTO h FROM public.household_members WHERE profile_id=a AND member_type='adult' LIMIT 1;
  SELECT household_id INTO other_h FROM public.household_members WHERE profile_id=b AND member_type='adult' LIMIT 1;
  IF h IS NULL OR other_h IS NULL OR h=other_h THEN RAISE EXCEPTION 'fixture_bootstrap_required'; END IF;
  IF p_args->>'shared'='true' THEN
   INSERT INTO public.household_members(household_id,local_id,profile_id,member_type,role,scope) VALUES(h,'fixture-second-adult',b,'adult','member','personal');
  END IF;
  FOR resource IN SELECT a actor,h household UNION ALL SELECT b,CASE WHEN p_args->>'shared'='true' THEN h ELSE other_h END LOOP
   INSERT INTO public.goals(household_id,local_id,profile_id,title,status,producer,origin_created_at,origin_updated_at)
    VALUES(resource.household,'fixture-private-goal',resource.actor,'Disposable certification record','active','user-action',now(),now());
   INSERT INTO public.premium_entitlements(account_id,source,environment) VALUES(resource.actor,'reconcile','SANDBOX');
   INSERT INTO public.premium_subscriber_identities(provider_user_id,account_id,kind,status,source) VALUES(resource.actor::text,resource.actor,'primary','verified','reconcile');
   INSERT INTO public.premium_reconcile_state(account_id) VALUES(resource.actor);
   INSERT INTO public.premium_usage(account_id,feature_key,period_start) VALUES(resource.actor,'daily_load_premium',current_date);
   INSERT INTO public.premium_usage_events(account_id,feature_key,idempotency_key,status,units,cost_units,via,period_start)
    VALUES(resource.actor,'daily_load_premium','deletion-fixture','completed',1,1,'premium',current_date);
   INSERT INTO public.premium_authorization_audit(account_id,feature_key,outcome,reason,entitlement_state) VALUES(resource.actor,'daily_load_premium','allowed','fixture','active');
   INSERT INTO public.premium_decisions(account_id,household_id,feature_key,kind,idempotency_key,proposal_ref,proposal_digest)
    VALUES(resource.actor,resource.household,'daily_load_premium','fixture.receipt','deletion-fixture','{}',repeat('a',64));
   INSERT INTO private.ai_response_reports(account_id,surface,message_id,reason,client_dedupe_key,review_history)
    VALUES(resource.actor,'talk_it_out','fixture','other',gen_random_uuid(),jsonb_build_array(jsonb_build_object('reviewerId',a,'from','pending','to','reviewing')));
  END LOOP;
  INSERT INTO public.premium_events(event_id,environment,event_type,app_user_id,original_app_user_id,account_id,aliases)
   VALUES('deletion-fixture-'||run,'SANDBOX','TRANSFER',b::text,a::text,b,jsonb_build_array(a,b));
  RETURN jsonb_build_object('seeded',true,'shared',p_args->>'shared'='true');
 ELSIF p_action='arm' THEN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='herkeys-account-deletion' AND active) THEN RAISE EXCEPTION 'scheduler_must_be_disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_control WHERE enabled AND NOT test_scope_only) THEN RAISE EXCEPTION 'unscoped_processing_refused'; END IF;
  SELECT id INTO request FROM public.account_deletion_requests WHERE account_id=a AND status='deactivated' AND NOT auth_deactivation_pending
   AND grace_period_ends_at=requested_at+interval '30 days';
  IF request IS NULL THEN RAISE EXCEPTION 'verified_fixture_request_required'; END IF;
  INSERT INTO private.deletion_test_scope VALUES(a,now()+interval '30 minutes') ON CONFLICT(account_id) DO UPDATE SET expires_at=excluded.expires_at;
  UPDATE public.account_deletion_requests SET requested_at=now()-interval '31 days',grace_period_ends_at=now()-interval '1 day' WHERE id=request;
  UPDATE public.account_deletion_control SET enabled=true,dry_run=false,test_scope_only=true WHERE singleton;
 ELSIF p_action='retry_now' THEN
  UPDATE public.account_deletion_requests SET retry_at=now() WHERE account_id=a AND status IN ('retry_pending','partial_purge_pending_review');
 ELSIF p_action='reconcile' THEN
  SELECT id INTO request FROM public.account_deletion_requests WHERE account_id=a;
  IF EXISTS(SELECT 1 FROM public.account_deletion_cases WHERE request_id=request AND resolved_at IS NULL AND resource_table NOT IN ('profiles','household_members')) THEN RAISE EXCEPTION 'additional_manual_privacy_review_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.household_members m JOIN auth.users u ON u.id=m.profile_id WHERE m.household_id IN(SELECT household_id FROM public.household_members WHERE profile_id=a) AND u.raw_app_meta_data->>'deletion_certification_run' IS DISTINCT FROM run) THEN RAISE EXCEPTION 'unrelated_household_member'; END IF;
  DELETE FROM public.household_members WHERE profile_id=a;
  DELETE FROM public.profiles WHERE id=a;
  FOR case_row IN SELECT id FROM public.account_deletion_cases WHERE request_id=request AND resolved_at IS NULL LOOP
   PERFORM public.herkeys_resolve_deletion_case(case_row.id,'owned-disposable-fixture-reconciliation');
  END LOOP;
  PERFORM public.herkeys_deletion_command('requeue_reviewed',jsonb_build_object('request_id',request,'resolution_reference','owned-disposable-fixture-reconciliation'));
 ELSIF p_action='stop' THEN
  UPDATE public.account_deletion_control SET enabled=false,dry_run=true,test_scope_only=false WHERE singleton;
  DELETE FROM private.deletion_test_scope WHERE account_id IN(a,b);
 ELSIF p_action<>'inspect' THEN RAISE EXCEPTION 'invalid_fixture_action';
 END IF;
 FOR resource IN SELECT * FROM private.deletion_resource_registry ORDER BY table_name LOOP
  IF to_regclass('public.'||resource.table_name) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',resource.table_name,resource.owner_column) INTO n USING a;
  counts:=counts||jsonb_build_object(resource.table_name,n);
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]'')::text FROM public.%I t WHERE %I=$1',resource.table_name,resource.owner_column) INTO rowtext USING b;
  digest:=digest||resource.table_name||rowtext;
 END LOOP;
 RETURN jsonb_build_object('control',(SELECT to_jsonb(c) FROM public.account_deletion_control c),
  'owned_counts',counts,'auth_present',EXISTS(SELECT 1 FROM auth.users WHERE id=a),
  'request',(SELECT jsonb_build_object('id',id,'status',status,'failure_category',failure_category,'evidence',evidence) FROM public.account_deletion_requests WHERE account_id=a AND status<>'restored'),
  'unresolved_cases',(SELECT count(*) FROM public.account_deletion_cases c JOIN public.account_deletion_requests r ON c.request_id=r.id WHERE r.account_id=a AND c.resolved_at IS NULL),
  'other_profile_present',EXISTS(SELECT 1 FROM public.profiles WHERE id=b),
  'other_digest',encode(sha256(convert_to(digest,'UTF8')),'hex'),
  'other_goal_count',(SELECT count(*) FROM public.goals WHERE profile_id=b));
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_deletion_v2_fixture(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_deletion_v2_fixture(text,jsonb) TO service_role;
