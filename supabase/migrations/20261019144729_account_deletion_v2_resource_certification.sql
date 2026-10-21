BEGIN;
-- Classify the integrated V2 schema explicitly. No control, deadline, scheduler,
-- provider key, public legal document or customer data is changed on application.
INSERT INTO private.deletion_resource_registry VALUES
 ('premium_entitlements','account_id',false),
 ('premium_subscriber_identities','account_id',false),
 ('premium_reconcile_state','account_id',false),
 ('premium_usage','account_id',false),
 ('premium_usage_events','account_id',false),
 ('premium_authorization_audit','account_id',false),
 -- The deciding adult exclusively owns this receipt, even in a shared household.
 ('premium_decisions','account_id',false);

-- Controlled Staging tests may enable claims only for an expiring allowlist.
-- The default retains the existing production controls; no scope is activated.
ALTER TABLE public.account_deletion_control ADD COLUMN test_scope_only boolean NOT NULL DEFAULT false;
CREATE TABLE private.deletion_test_scope(account_id uuid PRIMARY KEY,expires_at timestamptz NOT NULL);
ALTER TABLE private.deletion_test_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.deletion_test_scope FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.deletion_resource_exceptions (
 schema_name text NOT NULL, table_name text NOT NULL,
 handling text NOT NULL CHECK(handling IN ('global','lifecycle','custom','cascade')),
 reason text NOT NULL, PRIMARY KEY(schema_name,table_name)
);
ALTER TABLE private.deletion_resource_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.deletion_resource_exceptions FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.deletion_resource_exceptions VALUES
 ('public','premium_runtime_config','global','Environment switches; contains no account identifier'),
 ('public','premium_feature_config','global','Public product manifest; contains no account identifier'),
 ('public','premium_usage_global','global','Feature/day aggregate cost only; no account identifier'),
 ('public','premium_events','custom','Remove exact account/provider identity references; preserve other accounts and event idempotency'),
 ('private','ai_response_reports','custom','Erase owned reports and redact reviewerId in another account report'),
 ('public','profiles','custom','Restricted profile removed after provider material; independently counted'),
 ('public','households','custom','Only exclusive households; shared ownership escalated'),
 ('public','discovery_answers','cascade','Owned through discovery_records; FK ON DELETE CASCADE'),
 ('private','deletion_resource_registry','global','Reviewed resource metadata only'),
 ('private','deletion_resource_exceptions','global','Reviewed schema classifications only'),
 ('private','deletion_test_scope','lifecycle','Expiring synthetic-account processing allowlist; never proof'),
 ('private','deletion_worker_key','global','Service authentication secret; no customer identity'),
 ('private','deletion_scheduler_target','global','Hosted project URL only; optional in local harness'),
 ('public','account_deletion_requests','lifecycle','Nonterminal lifecycle and bounded operational evidence'),
 ('public','account_deletion_receipts','lifecycle','Nonterminal receipt/request associations'),
 ('public','account_deletion_control','global','Worker kill switch'),
 ('public','account_deletion_outbox','lifecycle','Encrypted recipient; completion outbox unlinked and expires within seven days'),
 ('public','account_deletion_runs','global','Aggregate run counters only'),
 ('public','account_deletion_rate_limits','lifecycle','Rate-limit hashes expire after one day'),
 ('public','account_deletion_alerts','lifecycle','Operational alert delivery metadata'),
 ('public','account_deletion_cases','lifecycle','Exact nonterminal shared resource review; erased at terminal completion'),
 ('public','account_deletion_terminal_proofs','lifecycle','Five-field minimal proof expires after 365 days'),
 ('public','account_deletion_retention_control','global','Retention job state only'),
 ('public','account_deletion_retention_runs','global','Aggregate expiry counters only');

CREATE FUNCTION private.deletion_assert_classified() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE unknowns text;
BEGIN
 SELECT string_agg(format('%I.%I',n.nspname,c.relname),', ' ORDER BY n.nspname,c.relname) INTO unknowns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','m','f')
 AND NOT (n.nspname='public' AND EXISTS(SELECT 1 FROM private.deletion_resource_registry r WHERE r.table_name=c.relname))
 AND NOT EXISTS(SELECT 1 FROM private.deletion_resource_exceptions x WHERE x.schema_name=n.nspname AND x.table_name=c.relname);
 IF unknowns IS NOT NULL THEN
  -- Schema names only. No row, account, credential or user content in diagnostics.
  RAISE EXCEPTION 'unclassified_resource:%',unknowns;
 END IF;
 SELECT string_agg(format('%I.%I',x.schema_name,x.table_name),', ') INTO unknowns
 FROM private.deletion_resource_exceptions x JOIN information_schema.columns c
 ON c.table_schema=x.schema_name AND c.table_name=x.table_name
 WHERE x.handling='global' AND c.column_name IN ('account_id','user_id','profile_id','owner_profile_id','household_id');
 IF unknowns IS NOT NULL THEN RAISE EXCEPTION 'unclassified_relationship:%',unknowns; END IF;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_assert_classified() FROM PUBLIC,anon,authenticated,service_role;

-- Recursive exact-value redaction handles provider arrays and reviewer history.
-- It never guesses ownership from prefixes, a household, email or a name.
CREATE FUNCTION private.deletion_redact_ids(value jsonb,ids text[]) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 CASE jsonb_typeof(value)
 WHEN 'string' THEN RETURN CASE WHEN (value #>> '{}')=ANY(ids) THEN 'null'::jsonb ELSE value END;
 WHEN 'array' THEN
  SELECT coalesce(jsonb_agg(v ORDER BY ordinal),'[]') INTO result
  FROM (SELECT private.deletion_redact_ids(e,ids) v,ordinal FROM jsonb_array_elements(value) WITH ORDINALITY a(e,ordinal)) s
  WHERE v<>'null'::jsonb;
  RETURN result;
 WHEN 'object' THEN
  SELECT coalesce(jsonb_object_agg(k,v),'{}') INTO result
  FROM (SELECT k,private.deletion_redact_ids(e,ids) v FROM jsonb_each(value) a(k,e)) s;
  RETURN result;
 ELSE RETURN value;
 END CASE;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_redact_ids(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;

-- Delayed processor events must not recreate account identifiers after cleanup.
-- Unknown/deleted UUIDs have no authority to name a Her Keys customer. Keep the
-- event's idempotency and the identities of other active adults intact.
CREATE FUNCTION private.deletion_redact_inactive_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ids text[];
BEGIN
 SELECT ARRAY(SELECT DISTINCT id FROM jsonb_array_elements_text(
  jsonb_build_array(NEW.app_user_id,NEW.original_app_user_id)||NEW.aliases||NEW.transferred_from||NEW.transferred_to) v(id)
  WHERE CASE WHEN id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN NOT private.account_is_active(id::uuid)
   ELSE EXISTS(SELECT 1 FROM public.premium_subscriber_identities i WHERE i.provider_user_id=id AND i.account_id IS NOT NULL AND NOT private.account_is_active(i.account_id)) END) INTO ids;
 IF NEW.account_id IS NOT NULL AND NOT private.account_is_active(NEW.account_id) THEN NEW.account_id:=NULL; END IF;
 IF NEW.app_user_id=ANY(ids) THEN NEW.app_user_id:=NULL; END IF;
 IF NEW.original_app_user_id=ANY(ids) THEN NEW.original_app_user_id:=NULL; END IF;
 NEW.aliases:=private.deletion_redact_ids(NEW.aliases,ids);
 NEW.transferred_from:=private.deletion_redact_ids(NEW.transferred_from,ids);
 NEW.transferred_to:=private.deletion_redact_ids(NEW.transferred_to,ids);
 NEW.payload:=private.deletion_redact_ids(NEW.payload,ids);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_redact_inactive_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deletion_event_guard BEFORE INSERT OR UPDATE ON public.premium_events
 FOR EACH ROW EXECUTE FUNCTION private.deletion_redact_inactive_event();

CREATE FUNCTION private.deletion_cleanup_v2(p_account uuid,p_request uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ids text[];resource record;
BEGIN
 PERFORM private.deletion_assert_classified();
 -- Preserve the alias inventory only in the nonterminal request, before deleting
 -- its mapping. Final proof drops all identity-bearing evidence.
 SELECT ARRAY(SELECT DISTINCT id FROM (
  SELECT p_account::text id
  UNION ALL SELECT provider_user_id FROM public.premium_subscriber_identities WHERE account_id=p_account
  UNION ALL SELECT jsonb_array_elements_text(coalesce(evidence->'premium_identity_ids','[]'))
   FROM public.account_deletion_requests WHERE id=p_request
 ) s) INTO ids;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_account AND id::text=ANY(ids)) THEN
  RAISE EXCEPTION 'provider_identity_ownership_ambiguous';
 END IF;
 UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object('premium_identity_ids',to_jsonb(ids)) WHERE id=p_request;
 -- Row-level idempotency is preserved. No other adult's references, entitlement
 -- or transaction evidence is deleted when a transfer event mentions both.
 UPDATE public.premium_events e SET
  account_id=CASE WHEN account_id=p_account THEN NULL ELSE account_id END,
  app_user_id=CASE WHEN app_user_id=ANY(ids) THEN NULL ELSE app_user_id END,
  original_app_user_id=CASE WHEN original_app_user_id=ANY(ids) THEN NULL ELSE original_app_user_id END,
  aliases=private.deletion_redact_ids(aliases,ids),
  transferred_from=private.deletion_redact_ids(transferred_from,ids),
  transferred_to=private.deletion_redact_ids(transferred_to,ids),
  payload=private.deletion_redact_ids(payload,ids)
 WHERE account_id=p_account OR private.deletion_redact_ids(to_jsonb(e),ids) IS DISTINCT FROM to_jsonb(e);
 DELETE FROM private.ai_response_reports WHERE account_id=p_account;
 UPDATE private.ai_response_reports SET review_history=private.deletion_redact_ids(review_history,ARRAY[p_account::text])
 WHERE review_history IS DISTINCT FROM private.deletion_redact_ids(review_history,ARRAY[p_account::text]);
 -- Independent account leaves, including receipts in shared/former households.
 FOR resource IN SELECT * FROM private.deletion_resource_registry
  WHERE table_name IN ('premium_entitlements','premium_subscriber_identities','premium_reconcile_state',
   'premium_usage','premium_usage_events','premium_authorization_audit','premium_decisions') LOOP
  EXECUTE format('DELETE FROM public.%I WHERE %I=$1',resource.table_name,resource.owner_column) USING p_account;
 END LOOP;
 UPDATE public.account_deletion_requests SET evidence=evidence||
  '{"private.ai_response_reports":{"remaining":0},"public.premium_events":{"remaining":0}}'::jsonb WHERE id=p_request;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_cleanup_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.deletion_verify_resources(p_account uuid,p_request uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE resource record;n bigint;ids text[];
BEGIN
 PERFORM private.deletion_assert_classified();
 FOR resource IN SELECT * FROM private.deletion_resource_registry LOOP
  IF to_regclass('public.'||resource.table_name) IS NULL THEN
   RAISE EXCEPTION 'terminal_verification_failed:missing_resource:%',resource.table_name;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',resource.table_name,resource.owner_column) INTO n USING p_account;
  IF n<>0 THEN RAISE EXCEPTION 'terminal_verification_failed:resource_remaining:%',resource.table_name; END IF;
  UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object(resource.table_name,jsonb_build_object('remaining',n)) WHERE id=p_request;
 END LOOP;
 SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(evidence->'premium_identity_ids',jsonb_build_array(p_account::text))))
 INTO ids FROM public.account_deletion_requests WHERE id=p_request;
 IF EXISTS(SELECT 1 FROM public.premium_events e WHERE account_id=p_account
   OR app_user_id=ANY(ids) OR original_app_user_id=ANY(ids)
   OR aliases IS DISTINCT FROM private.deletion_redact_ids(aliases,ids)
   OR transferred_from IS DISTINCT FROM private.deletion_redact_ids(transferred_from,ids)
   OR transferred_to IS DISTINCT FROM private.deletion_redact_ids(transferred_to,ids)
   OR payload IS DISTINCT FROM private.deletion_redact_ids(payload,ids))
  OR EXISTS(SELECT 1 FROM private.ai_response_reports WHERE account_id=p_account
   OR review_history IS DISTINCT FROM private.deletion_redact_ids(review_history,ARRAY[p_account::text])) THEN
  RAISE EXCEPTION 'terminal_verification_failed:custom_resource_remaining';
 END IF;
 -- Storage API cleanup must also account for legacy owner UUIDs, archived
 -- versions and unfinished multipart uploads. Never delete Storage metadata.
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.owner_id=p_account::text OR to_jsonb(o)->>'owner'=p_account::text) THEN
  RAISE EXCEPTION 'terminal_verification_failed:storage_remaining';
 END IF;
 IF to_regclass('storage.s3_multipart_uploads') IS NOT NULL THEN
  EXECUTE 'SELECT count(*) FROM storage.s3_multipart_uploads WHERE owner_id=$1' INTO n USING p_account::text;
  IF n<>0 THEN RAISE EXCEPTION 'terminal_verification_failed:storage_multipart_remaining'; END IF;
 END IF;
 -- Auth absence is independently checked by finish; confirm subordinate
 -- identities/sessions too where available (the local Auth model is minimal).
 FOR resource IN SELECT c.table_name,c.column_name FROM information_schema.columns c
  WHERE c.table_schema='auth' AND c.column_name='user_id' LOOP
  EXECUTE format('SELECT count(*) FROM auth.%I WHERE user_id::text=$1',resource.table_name) INTO n USING p_account::text;
  IF n<>0 THEN RAISE EXCEPTION 'terminal_verification_failed:auth_resource_remaining:%',resource.table_name; END IF;
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_verify_resources(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- V2 tables were added after the original lifecycle guard installation. Apply
-- the same active-account boundary to service writes and definer mutations.
DO $guards$
DECLARE t text;sig text;definition text;body text;
BEGIN
 FOREACH t IN ARRAY ARRAY['premium_entitlements','premium_subscriber_identities','premium_reconcile_state',
  'premium_usage','premium_usage_events','premium_authorization_audit','premium_decisions'] LOOP
  EXECUTE format('CREATE TRIGGER deletion_v2_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.refuse_pending_provider_write(''account_id'')',t);
 END LOOP;
 CREATE POLICY deletion_active_account ON public.premium_decisions AS RESTRICTIVE FOR ALL TO authenticated
  USING(private.account_is_active(auth.uid())) WITH CHECK(private.account_is_active(auth.uid()));
 FOREACH sig IN ARRAY ARRAY[
  'public.premium_decision_record(uuid,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb)',
  'public.premium_decision_transition(uuid,text,jsonb)',
  'public.submit_ai_response_report(text,text,text,uuid)',
  'private.require_ai_report_reviewer()'] LOOP
  SELECT pg_get_functiondef(sig::regprocedure),prosrc INTO definition,body FROM pg_proc WHERE oid=sig::regprocedure;
  IF position('BEGIN' IN body)=0 THEN RAISE EXCEPTION 'v2_active_guard_contract_mismatch'; END IF;
  EXECUTE replace(definition,body,overlay(body PLACING E'BEGIN\n IF auth.uid() IS NOT NULL AND NOT private.account_is_active(auth.uid()) THEN RAISE EXCEPTION ''account_deactivated'' USING ERRCODE=''42501''; END IF;' FROM position('BEGIN' IN body) FOR 5));
 END LOOP;
END $guards$;

DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$IF EXISTS(SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
    AND t.table_name NOT LIKE 'account_deletion_%' AND t.table_name NOT IN ('households','profiles','discovery_answers')
    AND NOT EXISTS(SELECT 1 FROM private.deletion_resource_registry x WHERE x.table_name=t.table_name)) THEN
   RAISE EXCEPTION 'unclassified_resource';
  END IF;$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'classification_contract_mismatch'; END IF;
 definition:=replace(definition,original,'PERFORM private.deletion_cleanup_v2(r.account_id,r.id);');
 definition:=replace(definition,$old$ELSIF p_action='cleanup_safe' THEN$old$,
  $new$ELSIF p_action='cleanup_safe' THEN
  PERFORM private.deletion_cleanup_v2(r.account_id,r.id);$new$);
 original:=$old$AND grace_period_ends_at<=v_now AND coalesce(retry_at,v_now)<=v_now$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'scoped_claim_contract_mismatch'; END IF;
 definition:=replace(definition,original,original||$new$ AND (NOT c.test_scope_only OR EXISTS(
  SELECT 1 FROM private.deletion_test_scope s WHERE s.account_id=account_deletion_requests.account_id AND s.expires_at>v_now))$new$);
 original:=$old$OR NOT c.enabled OR c.dry_run THEN$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'scoped_fence_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$OR NOT c.enabled OR c.dry_run OR (c.test_scope_only AND NOT EXISTS(
  SELECT 1 FROM private.deletion_test_scope s WHERE s.account_id=r.account_id AND s.expires_at>v_now)) THEN$new$);
 original:=$old$BEGIN
 -- Only service_role has EXECUTE.$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'scope_metadata_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$BEGIN
 IF p_action='processing_scope' THEN
  RETURN jsonb_build_object('scoped',(SELECT test_scope_only FROM public.account_deletion_control WHERE singleton),
   'accounts',(SELECT coalesce(jsonb_agg(account_id),'[]') FROM private.deletion_test_scope WHERE expires_at>v_now));
 END IF;
 -- Email delivery is independently tested. Scoped destructive certification
 -- cannot drain unrelated users' outboxes or disclose test recovery material.
 IF p_action='claim_email' AND (SELECT test_scope_only FROM public.account_deletion_control WHERE singleton) THEN RETURN '[]'::jsonb; END IF;
 -- Only service_role has EXECUTE.$new$);
 definition:=replace(definition,'AND coalesce(lease_until,v_now)<=v_now;',
  'AND coalesce(lease_until,v_now)<=v_now AND (NOT c.test_scope_only OR EXISTS(SELECT 1 FROM private.deletion_test_scope s WHERE s.account_id=account_deletion_requests.account_id AND s.expires_at>v_now));');
 -- Record only provider names from the verified Auth user at initiation. A
 -- missing Auth lookup later cannot establish that Apple was never linked.
 original:=$old$INSERT INTO public.account_deletion_receipts(receipt_hash,request_id) VALUES(p_args->>'receipt_hash',r.id);$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'provider_snapshot_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$IF jsonb_typeof(p_args->'identity_providers')='array' THEN
   UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object('identity_providers',p_args->'identity_providers') WHERE id=r.id;
  END IF;
  $new$||original);
 definition:=replace(definition,'WHERE owner_id=r.account_id::text ORDER BY id LIMIT 100',
  'WHERE owner_id=r.account_id::text OR to_jsonb(objects)->>''owner''=r.account_id::text ORDER BY id LIMIT 100');
 original:=$old$ELSIF p_action='finish' THEN$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'terminal_contract_mismatch'; END IF;
 definition:=replace(definition,original,original||E'\n  PERFORM private.deletion_verify_resources(r.account_id,r.id);');
 EXECUTE definition;
END $repair$;
COMMIT;
