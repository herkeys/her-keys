-- A separate, non-commercial checkout lane. Existing native-store checkout remains OFF.
BEGIN;
ALTER TABLE public.premium_runtime_config
  ADD COLUMN test_store_checkout_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT premium_test_store_staging_only CHECK (NOT test_store_checkout_enabled OR environment = 'staging');

CREATE FUNCTION public.premium_test_store_purchase_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_account uuid := auth.uid(); rt public.premium_runtime_config%ROWTYPE; v_count integer;
BEGIN
  IF v_account IS NULL OR public.premium_account_lifecycle(v_account) <> 'active' THEN
    RETURN jsonb_build_object('ready',false,'reason','account_unavailable');
  END IF;
  SELECT * INTO rt FROM public.premium_runtime_config WHERE singleton;
  IF NOT FOUND OR rt.environment <> 'staging' OR NOT rt.test_store_checkout_enabled THEN
    RETURN jsonb_build_object('ready',false,'reason','checkout_disabled');
  END IF;
  IF NOT rt.premium_enabled OR NOT rt.webhook_processing THEN
    RETURN jsonb_build_object('ready',false,'reason','fulfillment_unavailable');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=v_account AND raw_app_meta_data->>'herkeys_premium_tester'='true') THEN
    RETURN jsonb_build_object('ready',false,'reason','tester_not_eligible');
  END IF;
  SELECT count(*) INTO v_count FROM public.premium_feature_config
  WHERE feature_key IN ('daily_load_premium','smart_inbox_extract','momentum_report')
    AND tier='premium' AND enabled AND released AND NOT kill_switch AND rollout_status='staging_only';
  IF v_count <> 3 THEN RETURN jsonb_build_object('ready',false,'reason','benefits_unavailable'); END IF;
  RETURN jsonb_build_object('ready',true,'reason','ready');
END
$$;
REVOKE ALL ON FUNCTION public.premium_test_store_purchase_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.premium_test_store_purchase_readiness() TO authenticated;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.premium_test_store_purchase_readiness()','EXECUTE'), 'anonymous checkout must remain denied';
  ASSERT NOT EXISTS (SELECT 1 FROM public.premium_runtime_config WHERE test_store_checkout_enabled), 'new Test Store checkout must start disabled';
END $$;
COMMIT;
