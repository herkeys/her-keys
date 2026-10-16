-- HK Premium: do not offer a native subscription solely because feature flags are visible.
-- The same authenticated account must be eligible for the THREE promised features and
-- backend webhook fulfillment must be enabled before checkout is allowed.
-- STAGING has an extra admin-only allowlist. No client-supplied account or entitlement.
CREATE OR REPLACE FUNCTION public.premium_purchase_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_account uuid := auth.uid();
  v_runtime public.premium_runtime_config%ROWTYPE;
  v_count integer;
BEGIN
  IF v_account IS NULL OR public.premium_account_lifecycle(v_account) <> 'active' THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'account_unavailable');
  END IF;

  SELECT * INTO v_runtime FROM public.premium_runtime_config WHERE singleton;
  IF NOT FOUND OR NOT v_runtime.premium_enabled THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'premium_disabled');
  END IF;
  IF NOT v_runtime.webhook_processing THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'fulfillment_unavailable');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.premium_feature_config
  WHERE feature_key IN ('daily_load_premium', 'smart_inbox_extract', 'momentum_report')
    AND tier = 'premium' AND enabled AND released AND NOT kill_switch
    AND (
      (v_runtime.environment = 'production' AND rollout_status = 'general' AND limit_status = 'owner_approved')
      OR (v_runtime.environment = 'staging' AND rollout_status = 'staging_only')
    );
  IF v_count <> 3 THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'benefits_unavailable');
  END IF;

  IF v_runtime.environment = 'staging' AND NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_account
      AND raw_app_meta_data->>'herkeys_premium_tester' = 'true'
  ) THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'tester_not_eligible');
  END IF;

  RETURN jsonb_build_object('ready', true, 'reason', 'ready');
END;
$function$;

REVOKE ALL ON FUNCTION public.premium_purchase_readiness() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.premium_purchase_readiness() FROM anon;
GRANT EXECUTE ON FUNCTION public.premium_purchase_readiness() TO authenticated;
