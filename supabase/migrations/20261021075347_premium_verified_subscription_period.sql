-- Provider-verified period metadata only. Access remains premium_entitlement_state's decision.
-- Deploy this additive migration BEFORE the updated projection adapter. No transaction or user is rewritten.
BEGIN;

ALTER TABLE public.premium_entitlements
  ADD COLUMN period_type text CHECK (period_type IS NULL OR period_type IN ('TRIAL', 'INTRO', 'NORMAL')),
  ADD COLUMN period_started_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.premium_apply_projection(p_account uuid, p_expected_version bigint, p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_rows integer; v_version bigint;
BEGIN
  IF p_expected_version = 0 THEN
    INSERT INTO public.premium_entitlements (
      account_id, source, environment, product_id, store, has_entitlement, expires_at, grace_expires_at, canceled_at,
      billing_issue_at, revoked_at, expiration_confirmed_at, clocks, last_event_ms, last_reconciled_at, needs_reconcile,
      period_type, period_started_at, trial_ends_at)
    VALUES (
      p_account, p_fields->>'source', p_fields->>'environment', p_fields->>'product_id', p_fields->>'store',
      COALESCE((p_fields->>'has_entitlement')::boolean, false),
      (p_fields->>'expires_at')::timestamptz, (p_fields->>'grace_expires_at')::timestamptz, (p_fields->>'canceled_at')::timestamptz,
      (p_fields->>'billing_issue_at')::timestamptz, (p_fields->>'revoked_at')::timestamptz,
      (p_fields->>'expiration_confirmed_at')::timestamptz, COALESCE(p_fields->'clocks', '{}'::jsonb),
      (p_fields->>'last_event_ms')::bigint, (p_fields->>'last_reconciled_at')::timestamptz,
      COALESCE((p_fields->>'needs_reconcile')::boolean, false),
      p_fields->>'period_type', (p_fields->>'period_started_at')::timestamptz,
      CASE WHEN p_fields->>'period_type' = 'TRIAL' THEN (p_fields->>'trial_ends_at')::timestamptz END)
    ON CONFLICT (account_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('applied', v_rows = 1, 'version', CASE WHEN v_rows = 1 THEN 1 ELSE NULL END);
  END IF;
  UPDATE public.premium_entitlements SET
    source = p_fields->>'source', environment = p_fields->>'environment', product_id = p_fields->>'product_id',
    store = p_fields->>'store', has_entitlement = COALESCE((p_fields->>'has_entitlement')::boolean, false),
    expires_at = (p_fields->>'expires_at')::timestamptz, grace_expires_at = (p_fields->>'grace_expires_at')::timestamptz,
    canceled_at = (p_fields->>'canceled_at')::timestamptz, billing_issue_at = (p_fields->>'billing_issue_at')::timestamptz,
    revoked_at = (p_fields->>'revoked_at')::timestamptz, expiration_confirmed_at = (p_fields->>'expiration_confirmed_at')::timestamptz,
    clocks = COALESCE(p_fields->'clocks', '{}'::jsonb), last_event_ms = (p_fields->>'last_event_ms')::bigint,
    last_reconciled_at = (p_fields->>'last_reconciled_at')::timestamptz,
    needs_reconcile = COALESCE((p_fields->>'needs_reconcile')::boolean, false),
    period_type = p_fields->>'period_type', period_started_at = (p_fields->>'period_started_at')::timestamptz,
    trial_ends_at = CASE WHEN p_fields->>'period_type' = 'TRIAL' THEN (p_fields->>'trial_ends_at')::timestamptz END,
    version = version + 1, updated_at = now()
  WHERE account_id = p_account AND version = p_expected_version
  RETURNING version INTO v_version;
  RETURN jsonb_build_object('applied', v_version IS NOT NULL, 'version', v_version);
END
$$;
-- Preserve the service-only writer boundary; the client never supplies projection facts.
REVOKE ALL ON FUNCTION public.premium_apply_projection(uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_apply_projection(uuid,bigint,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.premium_my_entitlement()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_account uuid := auth.uid(); e public.premium_entitlements%ROWTYPE; v_state text;
BEGIN
  IF v_account IS NULL THEN RETURN jsonb_build_object('state', 'unknown'); END IF;
  v_state := public.premium_entitlement_state(v_account);
  SELECT * INTO e FROM public.premium_entitlements WHERE account_id = v_account;
  RETURN jsonb_build_object(
    'state', v_state,
    'expiresAt', CASE WHEN v_state LIKE 'premium_%' THEN e.expires_at END,
    'graceExpiresAt', CASE WHEN v_state = 'premium_billing_grace' THEN e.grace_expires_at END,
    'canceled', COALESCE(e.canceled_at IS NOT NULL, false) AND v_state IN ('premium_canceled_active'),
    'needsReconcile', COALESCE(e.needs_reconcile, true),
    'periodType', CASE WHEN v_state IN ('premium_active', 'premium_canceled_active') THEN e.period_type END,
    'periodStartedAt', CASE WHEN v_state IN ('premium_active', 'premium_canceled_active') THEN e.period_started_at END,
    'trialEndsAt', CASE WHEN v_state IN ('premium_active', 'premium_canceled_active') AND e.period_type = 'TRIAL' THEN e.trial_ends_at END,
    'checkedAt', clock_timestamp());
END
$$;
REVOKE ALL ON FUNCTION public.premium_my_entitlement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.premium_my_entitlement() TO authenticated, service_role;

DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.premium_entitlements'::regclass), 'entitlement RLS must remain enabled';
  ASSERT NOT has_function_privilege('authenticated', 'public.premium_apply_projection(uuid,bigint,jsonb)', 'EXECUTE'), 'projection writer must remain service-only';
  ASSERT NOT has_function_privilege('anon', 'public.premium_my_entitlement()', 'EXECUTE'), 'anonymous entitlement reads must remain denied';
END
$$;
COMMIT;
