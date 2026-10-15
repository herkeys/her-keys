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

-- Controlled-test default only: owner must approve a release TTL. The server
-- requires a recent provider-authenticated subscriber reconciliation for new
-- paid work. The webhook write timestamp is NOT a substitute for the API read:
-- missed webhooks, store refunds and transfers must not yield perpetual Premium.
ALTER TABLE public.premium_runtime_config
  ADD COLUMN IF NOT EXISTS max_reconciled_age_seconds integer NOT NULL DEFAULT 86400
    CHECK (max_reconciled_age_seconds BETWEEN 300 AND 86400);

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

  -- A signed webhook is lifecycle evidence, but does not replace an actual
  -- subscriber read with the server secret key. Treat old, absent or
  -- suspiciously future reconciliation timestamps as UNKNOWN for accounts
  -- that might otherwise receive paid authorization. The generic gate
  -- already performs one bounded reconcile on entitlement_unknown.
  IF v_found AND e.has_entitlement AND e.source <> 'test_fixture' AND (
    e.last_reconciled_at IS NULL
    OR e.last_reconciled_at < p_now - make_interval(secs => rt.max_reconciled_age_seconds)
    OR e.last_reconciled_at > p_now + interval '5 minutes'
  ) THEN
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
