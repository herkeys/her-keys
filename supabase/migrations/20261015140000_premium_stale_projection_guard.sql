-- Premium Stage 1: a reconciliation-required entitlement cannot authorize new work.
-- Safe additive correction: changes no tables, no RLS policies, no privileges and
-- no subscription product/price/configuration. Both paid environments stay behind
-- their existing runtime kill switches. This MUST be installed before activating
-- paid Staging features (Production remains OFF until release certification).
--
-- The original derivation is unchanged for trustworthy rows; this is an overlay
-- only for a projection explicitly flagged as needing provider reconciliation.
-- Reading previously saved Premium records does not call this helper and remains
-- available to the record owner regardless of subscription state.

CREATE OR REPLACE FUNCTION public.premium_entitlement_state(
  p_account uuid, p_now timestamptz DEFAULT clock_timestamp()
) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  e public.premium_entitlements%ROWTYPE;
  rt public.premium_runtime_config%ROWTYPE;
  v_found boolean;
BEGIN
  IF public.premium_account_lifecycle(p_account) = 'deletion_pending' THEN
    RETURN 'deletion_pending';
  END IF;

  SELECT * INTO rt FROM public.premium_runtime_config WHERE singleton;
  SELECT * INTO e FROM public.premium_entitlements WHERE account_id = p_account;
  v_found := FOUND;

  -- Previously this flag did not participate in the Premium state. When a
  -- transfer, webhook failure, or conflicting event requires reconciliation,
  -- the last active state MUST NOT continue to grant expensive operations.
  -- The existing premium-gate can attempt bounded provider reconciliation
  -- after receiving entitlement_unknown; a failed provider lookup stays denied.
  IF v_found AND e.needs_reconcile THEN
    RETURN 'unknown';
  END IF;

  RETURN public.premium_derive_state(
    v_found, e.source, e.has_entitlement, e.expires_at, e.grace_expires_at,
    e.canceled_at, e.revoked_at, e.expiration_confirmed_at,
    rt.allow_test_fixtures, p_now
  );
END
$$;

COMMENT ON FUNCTION public.premium_entitlement_state(uuid, timestamptz)
IS 'Server-only paid entitlement derivation; needs_reconcile fails closed to unknown before the existing provider lifecycle rules.';
