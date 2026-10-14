-- Her Keys Premium: Staging-only allowlist overlay, source-certified before hosted enablement.
-- NO new public data tables or client-granted privileges. Original Premium authority stays intact.
-- On environments other than 'staging', identical authorization semantics to the foundation.
-- Do NOT apply to Production in this sprint. Operator commands never target Production.
-- The overlay denies a non-tester BEFORE entitlement, quota or AI processing.
--
-- Staging tester marker is auth.users.raw_app_meta_data.herkeys_premium_tester=true,
-- which only Supabase Admin API service role can set. User metadata is never trusted.
CREATE OR REPLACE FUNCTION public.premium_authorize(
  p_account uuid, p_feature text, p_household uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL,
  p_request_id text DEFAULT NULL, p_app_version text DEFAULT NULL, p_units integer DEFAULT 1, p_complete_now boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_now      timestamptz := clock_timestamp();
  cfg        public.premium_feature_config%ROWTYPE;
  rt         public.premium_runtime_config%ROWTYPE;
  ev         public.premium_usage_events%ROWTYPE;
  v_state    text := 'unknown';
  v_reason   text := NULL;
  v_next     text := 'none';
  v_checks   jsonb := '[]'::jsonb;
  v_entitled boolean := false;
  v_via      text := NULL;
  v_limit    integer;
  v_period   date;
  v_end      date;
  v_cost     integer;
  v_claim    uuid := NULL;
  v_reclaimed boolean := false;
  v_replay   boolean := false;
  v_used     integer := 0;
  v_reserved integer := 0;
  v_rows     integer;
  v_recent   integer;
  v_quota    jsonb := NULL;
  v_audit    uuid := gen_random_uuid();
  v_consent  boolean;
BEGIN
  SELECT * INTO rt FROM public.premium_runtime_config WHERE singleton;
  SELECT * INTO cfg FROM public.premium_feature_config WHERE feature_key = p_feature;

  <<decide>>
  BEGIN
    -- 0. request shape
    IF NOT FOUND THEN
      v_reason := 'feature_disabled'; v_checks := v_checks || jsonb_build_object('feature_exists', false); EXIT decide;
    END IF;
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 128
       OR p_units IS NULL OR p_units < 1 OR p_units > cfg.max_units_per_request THEN
      v_reason := 'invalid_request'; EXIT decide;
    END IF;

    -- 2. account lifecycle (identity was verified by the Edge Function; the account id is the JWT subject)
    IF public.premium_account_lifecycle(p_account) <> 'active' THEN
      v_state := CASE WHEN public.premium_account_lifecycle(p_account) = 'deletion_pending' THEN 'deletion_pending' ELSE 'unknown' END;
      v_reason := 'account_deactivated'; v_checks := v_checks || jsonb_build_object('lifecycle', false); EXIT decide;
    END IF;
    v_checks := v_checks || jsonb_build_object('lifecycle', true);
    v_state := public.premium_entitlement_state(p_account, v_now);

    -- 3. ownership: a household id the client supplies never overrides server-verified membership
    IF cfg.scope = 'household' AND p_household IS NULL THEN
      v_reason := 'ownership_denied'; v_checks := v_checks || jsonb_build_object('ownership', false); EXIT decide;
    END IF;
    IF p_household IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.household_id = p_household AND m.profile_id = p_account AND m.member_type = 'adult') THEN
      v_reason := 'ownership_denied'; v_checks := v_checks || jsonb_build_object('ownership', false); EXIT decide;
    END IF;
    v_checks := v_checks || jsonb_build_object('ownership', true);

    -- 4. feature enabled, released, not killed, app version
    IF NOT cfg.enabled OR NOT cfg.released OR cfg.kill_switch THEN
      v_reason := 'feature_disabled'; v_checks := v_checks || jsonb_build_object('feature_enabled', false); EXIT decide;
    END IF;
    IF NOT public.premium_version_gte(p_app_version, cfg.min_app_version) THEN
      v_reason := 'feature_disabled'; v_next := 'update_app'; v_checks := v_checks || jsonb_build_object('app_version', false); EXIT decide;
    END IF;
    v_checks := v_checks || jsonb_build_object('feature_enabled', true);

    -- 5. backend operational readiness
    IF NOT rt.premium_enabled THEN
      v_reason := 'service_unavailable'; v_checks := v_checks || jsonb_build_object('ready', false); EXIT decide;
    END IF;

    -- Staging-only, server-enforced tester membership. Auth app metadata is writable
    -- ONLY via the Supabase Admin API, never the account's raw_user_meta_data.
    -- This is NOT a paid entitlement. A tester still needs a genuine provider
    -- reconciliation for Premium to authorize a paid operation.
    IF rt.environment = 'staging' AND cfg.tier = 'premium' AND cfg.rollout_status = 'staging_only' THEN
      IF NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = p_account
        AND u.raw_app_meta_data->>'herkeys_premium_tester' = 'true'
      ) THEN
        v_reason := 'feature_disabled';
        v_checks := v_checks || jsonb_build_object('staging_allowlist', false);
        EXIT decide;
      END IF;
      v_checks := v_checks || jsonb_build_object('staging_allowlist', true);
    END IF;

    -- 6. entitlement, or an APPROVED free allowance. Premium state is never inferred from anything but the projection.
    v_entitled := v_state IN ('premium_active', 'premium_canceled_active', 'premium_billing_grace');
    IF cfg.tier = 'free' THEN
      v_via := 'free';
    ELSIF v_entitled THEN
      v_via := 'premium';
    ELSIF cfg.free_allowance_status = 'approved' AND cfg.free_allowance > 0 AND v_state IN ('free', 'unknown', 'premium_expired', 'premium_revoked') THEN
      v_via := 'free_allowance';
    ELSE
      v_reason := CASE v_state
        WHEN 'unknown' THEN 'entitlement_unknown'
        WHEN 'premium_expired' THEN 'entitlement_expired'
        WHEN 'premium_revoked' THEN 'entitlement_expired'
        ELSE 'requires_premium' END;
      v_next := CASE v_state WHEN 'unknown' THEN 'retry_verification' ELSE 'open_paywall' END;
      v_checks := v_checks || jsonb_build_object('entitlement', false); EXIT decide;
    END IF;
    v_checks := v_checks || jsonb_build_object('entitlement', true, 'via', v_via);

    -- 7. AI consent (only where an external AI provider would see her content)
    IF cfg.requires_ai_consent THEN
      SELECT (c.policy_version = rt.ai_policy_version AND c.granted) INTO v_consent
        FROM public.account_consents c WHERE c.account_id = p_account AND c.consent_type = 'ai_processing'
        ORDER BY c.recorded_at DESC, c.id DESC LIMIT 1;
      IF v_consent IS NOT TRUE THEN
        v_reason := 'requires_ai_consent'; v_next := 'grant_ai_consent'; v_checks := v_checks || jsonb_build_object('ai_consent', false); EXIT decide;
      END IF;
      v_checks := v_checks || jsonb_build_object('ai_consent', true);
    END IF;

    -- 8. quota and cost budget (atomic reservation)
    v_period := public.premium_period_start(cfg.quota_period, v_now);
    v_end := public.premium_period_end(cfg.quota_period, v_period);
    v_cost := cfg.cost_weight * p_units;
    v_limit := CASE v_via WHEN 'premium' THEN cfg.premium_limit WHEN 'free_allowance' THEN cfg.free_allowance ELSE NULL END;
    IF cfg.quota_period = 'none' THEN v_limit := NULL; END IF;

    PERFORM public.premium_expire_stale(p_account, p_feature);

    -- claim the idempotency key first, so a concurrent duplicate waits on this row instead of double-charging
    INSERT INTO public.premium_usage_events (account_id, feature_key, idempotency_key, status, units, cost_units, via, period_start)
      VALUES (p_account, p_feature, p_idempotency_key, 'pending', p_units, v_cost, v_via, v_period)
      ON CONFLICT (account_id, feature_key, idempotency_key) DO NOTHING
      RETURNING id INTO v_claim;
    IF v_claim IS NULL THEN
      SELECT * INTO ev FROM public.premium_usage_events
        WHERE account_id = p_account AND feature_key = p_feature AND idempotency_key = p_idempotency_key FOR UPDATE;
      IF ev.status IN ('reserved', 'completed') THEN
        v_replay := true; v_period := ev.period_start; v_via := ev.via;
        v_checks := v_checks || jsonb_build_object('idempotent_replay', true);
        EXIT decide;
      END IF;
      -- failed / expired / rejected: the same operation may be retried under the same key
      UPDATE public.premium_usage_events SET status = 'pending', units = p_units, cost_units = v_cost, via = v_via,
        period_start = v_period, created_at = v_now, completed_at = NULL WHERE id = ev.id;
      v_claim := ev.id; v_reclaimed := true;
    END IF;

    -- per-account rate limit
    SELECT count(*) INTO v_recent FROM public.premium_usage_events
      WHERE account_id = p_account AND feature_key = p_feature AND created_at >= v_now - INTERVAL '1 minute' AND id <> v_claim;
    IF v_recent >= cfg.rate_limit_per_minute THEN
      v_reason := 'rate_limited'; v_next := 'retry_later'; v_checks := v_checks || jsonb_build_object('rate', false); EXIT decide;
    END IF;

    -- per-account counter: ONE conditional UPDATE under the row lock is the whole race defence
    IF v_limit IS NOT NULL THEN
      INSERT INTO public.premium_usage (account_id, feature_key, period_start) VALUES (p_account, p_feature, v_period)
        ON CONFLICT (account_id, feature_key, period_start) DO NOTHING;
      IF p_complete_now THEN
        UPDATE public.premium_usage SET used = used + p_units, updated_at = now()
          WHERE account_id = p_account AND feature_key = p_feature AND period_start = v_period AND used + reserved + p_units <= v_limit;
      ELSE
        UPDATE public.premium_usage SET reserved = reserved + p_units, updated_at = now()
          WHERE account_id = p_account AND feature_key = p_feature AND period_start = v_period AND used + reserved + p_units <= v_limit;
      END IF;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        v_reason := 'quota_exhausted'; v_next := CASE v_via WHEN 'free_allowance' THEN 'open_paywall' ELSE 'wait_for_reset' END;
        v_checks := v_checks || jsonb_build_object('quota', false); EXIT decide;
      END IF;
    END IF;

    -- global daily cost cap (compensates the per-account reservation on refusal)
    IF cfg.global_daily_cost_cap IS NOT NULL THEN
      INSERT INTO public.premium_usage_global (feature_key, day) VALUES (p_feature, (v_now AT TIME ZONE 'UTC')::date)
        ON CONFLICT (feature_key, day) DO NOTHING;
      UPDATE public.premium_usage_global SET cost_units = cost_units + v_cost
        WHERE feature_key = p_feature AND day = (v_now AT TIME ZONE 'UTC')::date AND cost_units + v_cost <= cfg.global_daily_cost_cap;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        IF v_limit IS NOT NULL THEN
          IF p_complete_now THEN
            UPDATE public.premium_usage SET used = GREATEST(used - p_units, 0) WHERE account_id = p_account AND feature_key = p_feature AND period_start = v_period;
          ELSE
            UPDATE public.premium_usage SET reserved = GREATEST(reserved - p_units, 0) WHERE account_id = p_account AND feature_key = p_feature AND period_start = v_period;
          END IF;
        END IF;
        v_reason := 'quota_exhausted'; v_next := 'wait_for_reset'; v_checks := v_checks || jsonb_build_object('budget', false); EXIT decide;
      END IF;
    END IF;

    UPDATE public.premium_usage_events SET status = CASE WHEN p_complete_now THEN 'completed' ELSE 'reserved' END,
      completed_at = CASE WHEN p_complete_now THEN clock_timestamp() ELSE NULL END WHERE id = v_claim;
    v_checks := v_checks || jsonb_build_object('quota', true);
  END decide;

  -- Refusal after claiming a key: a fresh claim is removed, a reclaimed one goes back to `rejected`.
  IF v_reason IS NOT NULL AND v_claim IS NOT NULL THEN
    IF v_reclaimed THEN UPDATE public.premium_usage_events SET status = 'rejected', completed_at = clock_timestamp() WHERE id = v_claim;
    ELSE DELETE FROM public.premium_usage_events WHERE id = v_claim AND status = 'pending'; END IF;
  END IF;

  -- quota snapshot for the response (never content)
  IF cfg.feature_key IS NOT NULL AND cfg.quota_period <> 'none' THEN
    SELECT COALESCE(u.used, 0), COALESCE(u.reserved, 0) INTO v_used, v_reserved FROM (SELECT 1) s
      LEFT JOIN public.premium_usage u ON u.account_id = p_account AND u.feature_key = p_feature AND u.period_start = public.premium_period_start(cfg.quota_period, v_now);
    v_limit := CASE WHEN v_via = 'free_allowance' THEN cfg.free_allowance WHEN v_via = 'premium' THEN cfg.premium_limit
                    ELSE COALESCE(CASE WHEN v_entitled THEN cfg.premium_limit END, NULLIF(cfg.free_allowance, 0)) END;
    v_period := public.premium_period_start(cfg.quota_period, v_now);
    v_quota := jsonb_build_object(
      'period', cfg.quota_period, 'periodStart', v_period, 'periodEnd', public.premium_period_end(cfg.quota_period, v_period),
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit,
      'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(v_limit - v_used - v_reserved, 0) END);
  END IF;

  IF p_account IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = p_account) THEN
    INSERT INTO public.premium_authorization_audit (id, account_id, feature_key, outcome, reason, entitlement_state, checks, request_id)
      VALUES (v_audit, p_account, left(COALESCE(p_feature, ''), 64), CASE WHEN v_reason IS NULL THEN 'allowed' ELSE 'denied' END,
              COALESCE(v_reason, 'allowed'), v_state, v_checks, left(p_request_id, 80));
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_reason IS NULL THEN 'allowed' ELSE 'denied' END,
    'reason', COALESCE(v_reason, 'allowed'),
    'entitlementState', v_state,
    'via', v_via,
    'nextAction', CASE WHEN v_reason IS NULL THEN 'none' ELSE v_next END,
    'quota', v_quota,
    'decisionId', v_audit,
    'replay', v_replay);
END
$$;

-- Detect migration presence without exposing any account membership or provider secret.
CREATE FUNCTION public.premium_staging_allowlist_guard_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT (SELECT environment = 'staging' FROM public.premium_runtime_config WHERE singleton)
     AND position('herkeys_premium_tester' IN pg_get_functiondef('public.premium_authorize(uuid,text,uuid,text,text,text,integer,boolean)'::regprocedure)) > 0
$$;

REVOKE ALL ON FUNCTION public.premium_staging_allowlist_guard_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_staging_allowlist_guard_ready() TO service_role;
-- Original service-only privileges for premium_authorize remain inherited under CREATE OR REPLACE.
