-- Her Keys Premium, Stage 1 (A1 + A2): server-side entitlement projection, feature manifest, atomic quotas, authorization.
--
-- ADDITIVE. Touches no existing table, policy, grant or function. Authority model:
--   * Every table below is SERVICE-ONLY: RLS enabled and forced, ALL privileges revoked from PUBLIC/anon/authenticated
--     (this project's default privileges grant ALL on new relations and routines to `authenticated`; they are stripped
--     explicitly here). Clients reach Premium state only through the two SECURITY DEFINER read functions at the bottom.
--   * Entitlement GATES COMPUTATION, NEVER STORED DATA. Nothing here is referenced by any customer-data policy.
--   * No fixture/grant path exists in this file. `test_fixture` rows are structurally excluded from production (see
--     premium_runtime_config and its CHECK); the grant helper lives only under supabase/tests and is never a migration.
--
-- Rollback: forward-fix. Before any production row exists the whole feature is removable with the DROPs listed in
-- docs/premium/PREMIUM_STAGE1_OPERATIONS.md. Never delete premium_events to repair a projection defect.

-- ---------------------------------------------------------------------------------------------------------------
-- Runtime configuration (singleton): environment identity, kill switches, structural fixture guard
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_runtime_config (
  singleton            boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  environment          text        NOT NULL DEFAULT 'local' CHECK (environment IN ('local', 'staging', 'production')),
  allow_test_fixtures  boolean     NOT NULL DEFAULT false,
  premium_enabled      boolean     NOT NULL DEFAULT true,
  webhook_processing   boolean     NOT NULL DEFAULT true,
  ai_policy_version    text        NOT NULL DEFAULT 'ai-data-processing-initial-v1',
  reconcile_min_interval_seconds integer NOT NULL DEFAULT 20 CHECK (reconcile_min_interval_seconds BETWEEN 1 AND 3600),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Structural: a production database can never honour fabricated entitlements.
  CONSTRAINT premium_no_fixtures_in_production CHECK (NOT (allow_test_fixtures AND environment = 'production'))
);
INSERT INTO public.premium_runtime_config (singleton) VALUES (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Versioned server feature manifest
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_feature_config (
  feature_key            text    PRIMARY KEY CHECK (feature_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  display_name           text    NOT NULL,
  tier                   text    NOT NULL CHECK (tier IN ('free', 'premium')),
  scope                  text    NOT NULL DEFAULT 'account' CHECK (scope IN ('account', 'household')),
  enabled                boolean NOT NULL DEFAULT false,
  released               boolean NOT NULL DEFAULT false,
  kill_switch            boolean NOT NULL DEFAULT false,
  rollout_status         text    NOT NULL DEFAULT 'not_released'
    CHECK (rollout_status IN ('not_released', 'staging_only', 'limited', 'general')),
  min_app_version        text    CHECK (min_app_version IS NULL OR min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  requires_ai_consent    boolean NOT NULL DEFAULT false,
  quota_period           text    NOT NULL DEFAULT 'none' CHECK (quota_period IN ('none', 'day', 'month')),
  premium_limit          integer CHECK (premium_limit IS NULL OR premium_limit >= 0),
  limit_status           text    NOT NULL DEFAULT 'controlled_test' CHECK (limit_status IN ('controlled_test', 'owner_approved')),
  free_allowance         integer NOT NULL DEFAULT 0 CHECK (free_allowance >= 0),
  free_allowance_status  text    NOT NULL DEFAULT 'none' CHECK (free_allowance_status IN ('none', 'proposed_not_approved', 'approved')),
  cost_weight            integer NOT NULL DEFAULT 1 CHECK (cost_weight BETWEEN 1 AND 1000),
  max_units_per_request  integer NOT NULL DEFAULT 1 CHECK (max_units_per_request BETWEEN 1 AND 100),
  rate_limit_per_minute  integer NOT NULL DEFAULT 12 CHECK (rate_limit_per_minute BETWEEN 1 AND 600),
  global_daily_cost_cap  integer CHECK (global_daily_cost_cap IS NULL OR global_daily_cost_cap >= 0),
  manifest_version       integer NOT NULL DEFAULT 1 CHECK (manifest_version >= 1),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- A metered premium feature needs a limit; a free feature is never metered (Talk It Out stays unmetered).
  CONSTRAINT premium_free_is_unmetered CHECK (tier <> 'free' OR (quota_period = 'none' AND premium_limit IS NULL AND free_allowance = 0)),
  CONSTRAINT premium_metered_needs_limit CHECK (quota_period = 'none' OR tier = 'free' OR premium_limit IS NOT NULL),
  CONSTRAINT premium_free_allowance_needs_period CHECK (free_allowance = 0 OR quota_period <> 'none')
);

-- ---------------------------------------------------------------------------------------------------------------
-- Entitlement projection: ONE row per account. Authority for protected operations.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_entitlements (
  account_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_key         text        NOT NULL DEFAULT 'her_keys_plus' CHECK (entitlement_key = 'her_keys_plus'),
  source                  text        NOT NULL CHECK (source IN ('webhook', 'reconcile', 'test_fixture')),
  environment             text        NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  product_id              text        CHECK (product_id IS NULL OR length(product_id) <= 200),
  store                   text        CHECK (store IS NULL OR length(store) <= 40),
  has_entitlement         boolean     NOT NULL DEFAULT false,
  expires_at              timestamptz,
  grace_expires_at        timestamptz,
  canceled_at             timestamptz,
  billing_issue_at        timestamptz,
  revoked_at              timestamptz,
  expiration_confirmed_at timestamptz,
  -- Per-field event clocks (event_timestamp_ms of the newest event that set each field): an older event never overwrites a newer one.
  clocks                  jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(clocks) = 'object'),
  last_event_ms           bigint,
  last_reconciled_at      timestamptz,
  needs_reconcile         boolean     NOT NULL DEFAULT false,
  version                 bigint      NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_fixture_is_sandbox CHECK (source <> 'test_fixture' OR environment = 'SANDBOX')
);

-- ---------------------------------------------------------------------------------------------------------------
-- Provider event evidence (separate from the projection): durable, idempotent, allow-listed payload.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text        NOT NULL DEFAULT 'revenuecat' CHECK (provider = 'revenuecat'),
  event_id            text        NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  environment         text        NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  event_type          text        NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  event_timestamp_ms  bigint,
  app_user_id         text        CHECK (app_user_id IS NULL OR length(app_user_id) <= 200),
  original_app_user_id text       CHECK (original_app_user_id IS NULL OR length(original_app_user_id) <= 200),
  aliases             jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(aliases) = 'array' AND jsonb_array_length(aliases) <= 50),
  transferred_from    jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transferred_from) = 'array' AND jsonb_array_length(transferred_from) <= 50),
  transferred_to      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transferred_to) = 'array' AND jsonb_array_length(transferred_to) <= 50),
  account_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  payload             jsonb,
  status              text        NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored_test', 'ignored_unknown', 'ignored_environment', 'ambiguous', 'failed', 'dead_letter')),
  attempts            integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error          text        CHECK (last_error IS NULL OR length(last_error) <= 120),
  received_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at        timestamptz,
  CONSTRAINT premium_events_idempotent UNIQUE (environment, event_id)
);
CREATE INDEX premium_events_backlog_idx ON public.premium_events (received_at) WHERE status IN ('received', 'failed');
CREATE INDEX premium_events_account_idx ON public.premium_events (account_id, event_timestamp_ms DESC) WHERE account_id IS NOT NULL;
CREATE INDEX premium_events_status_idx ON public.premium_events (status, received_at DESC);

-- ---------------------------------------------------------------------------------------------------------------
-- Provider-identity -> account mapping. Aliases are EVIDENCE, never accounts.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_subscriber_identities (
  provider_user_id  text        PRIMARY KEY CHECK (length(provider_user_id) BETWEEN 1 AND 200),
  account_id        uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  kind              text        NOT NULL CHECK (kind IN ('primary', 'alias', 'original', 'anonymous')),
  status            text        NOT NULL CHECK (status IN ('verified', 'ambiguous', 'rejected')),
  source            text        NOT NULL CHECK (source IN ('webhook', 'reconcile')),
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_identity_account_rule CHECK ((status = 'verified') = (account_id IS NOT NULL AND kind IN ('primary', 'alias', 'original')))
);
CREATE INDEX premium_subscriber_identities_account_idx ON public.premium_subscriber_identities (account_id) WHERE account_id IS NOT NULL;

-- Reconciliation rate limiting (bounded, with backoff on failure).
CREATE TABLE public.premium_reconcile_state (
  account_id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_attempt_at       timestamptz NOT NULL DEFAULT now(),
  consecutive_failures  integer     NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_outcome          text        CHECK (last_outcome IS NULL OR last_outcome IN ('ok', 'failed', 'ambiguous'))
);

-- ---------------------------------------------------------------------------------------------------------------
-- Usage accounting (counters) and idempotent usage events (reservations). No content, ever.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_usage (
  account_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key   text        NOT NULL REFERENCES public.premium_feature_config(feature_key),
  period_start  date        NOT NULL,
  used          integer     NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved      integer     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, feature_key, period_start)
);

CREATE TABLE public.premium_usage_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key      text        NOT NULL REFERENCES public.premium_feature_config(feature_key),
  idempotency_key  text        NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  status           text        NOT NULL CHECK (status IN ('pending', 'reserved', 'completed', 'failed', 'expired', 'rejected')),
  units            integer     NOT NULL CHECK (units >= 1),
  cost_units       integer     NOT NULL CHECK (cost_units >= 0),
  via              text        NOT NULL CHECK (via IN ('premium', 'free_allowance', 'free')),
  period_start     date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at     timestamptz,
  CONSTRAINT premium_usage_events_idempotent UNIQUE (account_id, feature_key, idempotency_key)
);
CREATE INDEX premium_usage_events_rate_idx ON public.premium_usage_events (account_id, feature_key, created_at DESC);
CREATE INDEX premium_usage_events_stale_idx ON public.premium_usage_events (created_at) WHERE status = 'reserved';

CREATE TABLE public.premium_usage_global (
  feature_key  text    NOT NULL REFERENCES public.premium_feature_config(feature_key),
  day          date    NOT NULL,
  cost_units   integer NOT NULL DEFAULT 0 CHECK (cost_units >= 0),
  PRIMARY KEY (feature_key, day)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Authorization audit: reason codes and check results only. NEVER content.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.premium_authorization_audit (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key        text        NOT NULL CHECK (length(feature_key) <= 64),
  outcome            text        NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  reason             text        NOT NULL CHECK (length(reason) <= 40),
  entitlement_state  text        NOT NULL CHECK (length(entitlement_state) <= 40),
  checks             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  request_id         text        CHECK (request_id IS NULL OR length(request_id) <= 80),
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX premium_authorization_audit_account_idx ON public.premium_authorization_audit (account_id, decided_at DESC);
CREATE INDEX premium_authorization_audit_reason_idx ON public.premium_authorization_audit (reason, decided_at DESC);

-- ---------------------------------------------------------------------------------------------------------------
-- Lock every table down: service-only. (Default privileges would otherwise grant ALL to `authenticated`.)
-- ---------------------------------------------------------------------------------------------------------------
DO $lock$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'premium_runtime_config', 'premium_feature_config', 'premium_entitlements', 'premium_events',
    'premium_subscriber_identities', 'premium_reconcile_state', 'premium_usage', 'premium_usage_events',
    'premium_usage_global', 'premium_authorization_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$lock$;

COMMENT ON TABLE public.premium_entitlements IS
  'Server authorization projection derived from verified RevenueCat facts. Service-only. Gates new Premium computation, never stored data.';
COMMENT ON TABLE public.premium_events IS
  'Durable, idempotent provider event evidence with an allow-listed payload (no price, e-mail or device identifiers).';

-- ---------------------------------------------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_period_start(p_period text, p_now timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_period
    WHEN 'day'   THEN (p_now AT TIME ZONE 'UTC')::date
    WHEN 'month' THEN date_trunc('month', p_now AT TIME ZONE 'UTC')::date
    ELSE DATE '1970-01-01' END
$$;

CREATE FUNCTION public.premium_period_end(p_period text, p_start date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_period WHEN 'day' THEN p_start + 1 WHEN 'month' THEN (p_start + INTERVAL '1 month')::date ELSE NULL END
$$;

CREATE FUNCTION public.premium_version_gte(p_version text, p_minimum text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE a int[]; b int[];
BEGIN
  IF p_minimum IS NULL THEN RETURN true; END IF;
  IF p_version IS NULL OR p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN RETURN false; END IF;
  a := string_to_array(p_version, '.')::int[];
  b := string_to_array(p_minimum, '.')::int[];
  RETURN a >= b;
END
$$;

-- The state machine's one derivation (mirrored line-for-line by supabase/functions/_shared/premium/entitlementState.ts).
-- States are derived at READ time from stored facts and `now`, so expiry needs no cron and cannot be missed.
CREATE FUNCTION public.premium_derive_state(
  p_exists boolean, p_source text, p_has_entitlement boolean, p_expires_at timestamptz, p_grace_expires_at timestamptz,
  p_canceled_at timestamptz, p_revoked_at timestamptz, p_expiration_confirmed_at timestamptz,
  p_fixtures_allowed boolean, p_now timestamptz
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN NOT p_exists THEN 'unknown'
    WHEN p_source = 'test_fixture' AND NOT p_fixtures_allowed THEN 'unknown'
    WHEN p_revoked_at IS NOT NULL THEN 'premium_revoked'
    WHEN NOT p_has_entitlement THEN 'free'
    WHEN p_expires_at IS NULL OR p_now <= p_expires_at THEN
      CASE WHEN p_canceled_at IS NOT NULL THEN 'premium_canceled_active' ELSE 'premium_active' END
    WHEN p_grace_expires_at IS NOT NULL AND p_now <= p_grace_expires_at THEN 'premium_billing_grace'
    WHEN p_expiration_confirmed_at IS NOT NULL THEN 'premium_expired'
    ELSE 'unknown'
  END
$$;

-- Account lifecycle seam. The deletion workstream (account_deletion_requests) owns the vocabulary; this reads it only if it exists,
-- so this migration is valid on lineages with and without that table. Any open (non-restored, non-purged) request restricts the account.
CREATE FUNCTION public.premium_account_lifecycle(p_account uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_found boolean; v_open boolean := false;
BEGIN
  SELECT true INTO v_found FROM auth.users WHERE id = p_account;
  IF v_found IS NOT TRUE THEN RETURN 'missing'; END IF;
  IF to_regclass('public.account_deletion_requests') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE account_id = $1 AND status NOT IN (''restored'', ''purged''))'
      INTO v_open USING p_account;
  END IF;
  IF v_open THEN RETURN 'deletion_pending'; END IF;
  RETURN 'active';
END
$$;

-- The state for an account at an instant, from its stored projection plus the lifecycle overlay.
CREATE FUNCTION public.premium_entitlement_state(p_account uuid, p_now timestamptz DEFAULT clock_timestamp())
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE e public.premium_entitlements%ROWTYPE; rt public.premium_runtime_config%ROWTYPE; v_found boolean;
BEGIN
  IF public.premium_account_lifecycle(p_account) = 'deletion_pending' THEN RETURN 'deletion_pending'; END IF;
  SELECT * INTO rt FROM public.premium_runtime_config WHERE singleton;
  SELECT * INTO e FROM public.premium_entitlements WHERE account_id = p_account;
  v_found := FOUND;
  RETURN public.premium_derive_state(
    v_found, e.source, e.has_entitlement, e.expires_at, e.grace_expires_at, e.canceled_at, e.revoked_at,
    e.expiration_confirmed_at, rt.allow_test_fixtures, p_now);
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Webhook ingestion support (service role only)
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_record_event(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  INSERT INTO public.premium_events (
    event_id, environment, event_type, event_timestamp_ms, app_user_id, original_app_user_id,
    aliases, transferred_from, transferred_to, payload)
  VALUES (
    p_event->>'event_id', p_event->>'environment', p_event->>'event_type', (p_event->>'event_timestamp_ms')::bigint,
    p_event->>'app_user_id', p_event->>'original_app_user_id',
    COALESCE(p_event->'aliases', '[]'::jsonb), COALESCE(p_event->'transferred_from', '[]'::jsonb),
    COALESCE(p_event->'transferred_to', '[]'::jsonb), p_event->'payload')
  ON CONFLICT (environment, event_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id, status INTO v_id, v_status FROM public.premium_events WHERE environment = p_event->>'environment' AND event_id = p_event->>'event_id';
    RETURN jsonb_build_object('id', v_id, 'duplicate', true, 'status', v_status);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'duplicate', false, 'status', 'received');
END
$$;

-- Status transition. A failure is counted; the fifth failed attempt becomes a dead letter and flags the account for reconcile.
CREATE FUNCTION public.premium_event_set_status(p_id uuid, p_status text, p_account uuid DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_attempts integer; v_final text := p_status;
BEGIN
  UPDATE public.premium_events SET attempts = attempts + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END
    WHERE id = p_id RETURNING attempts INTO v_attempts;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF p_status = 'failed' AND v_attempts >= 5 THEN v_final := 'dead_letter'; END IF;
  UPDATE public.premium_events SET status = v_final, account_id = COALESCE(p_account, account_id),
    last_error = left(p_error, 120),
    processed_at = CASE WHEN v_final IN ('failed') THEN processed_at ELSE clock_timestamp() END
    WHERE id = p_id;
  IF v_final = 'dead_letter' AND p_account IS NOT NULL THEN
    UPDATE public.premium_entitlements SET needs_reconcile = true, updated_at = now() WHERE account_id = p_account;
  END IF;
  RETURN v_final;
END
$$;

-- Which of these provider ids are real, account-grade identities? (UUID-shaped AND present in auth.users.)
CREATE FUNCTION public.premium_resolve_accounts(p_ids text[])
RETURNS TABLE (provider_user_id text, account_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i, u.id FROM unnest(p_ids) AS i
  JOIN auth.users u ON i ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND u.id = i::uuid
$$;

CREATE FUNCTION public.premium_register_identity(p_provider_user_id text, p_account uuid, p_kind text, p_source text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE cur public.premium_subscriber_identities%ROWTYPE;
BEGIN
  IF p_account IS NULL OR p_kind = 'anonymous' THEN
    INSERT INTO public.premium_subscriber_identities (provider_user_id, account_id, kind, status, source)
      VALUES (p_provider_user_id, NULL, 'anonymous', 'rejected', p_source)
      ON CONFLICT (provider_user_id) DO UPDATE SET last_seen_at = now();
    RETURN 'rejected';
  END IF;
  SELECT * INTO cur FROM public.premium_subscriber_identities WHERE provider_user_id = p_provider_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.premium_subscriber_identities (provider_user_id, account_id, kind, status, source)
      VALUES (p_provider_user_id, p_account, p_kind, 'verified', p_source);
    RETURN 'verified';
  END IF;
  IF cur.account_id IS DISTINCT FROM p_account THEN
    UPDATE public.premium_subscriber_identities SET status = 'ambiguous', account_id = NULL, last_seen_at = now()
      WHERE provider_user_id = p_provider_user_id;
    RETURN 'ambiguous';
  END IF;
  UPDATE public.premium_subscriber_identities SET last_seen_at = now() WHERE provider_user_id = p_provider_user_id;
  RETURN cur.status;
END
$$;

-- Compare-and-swap write of the projection. Expected version 0 means "no row yet". Returns {applied, version}.
CREATE FUNCTION public.premium_apply_projection(p_account uuid, p_expected_version bigint, p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_rows integer; v_version bigint;
BEGIN
  IF p_expected_version = 0 THEN
    INSERT INTO public.premium_entitlements (
      account_id, source, environment, product_id, store, has_entitlement, expires_at, grace_expires_at, canceled_at,
      billing_issue_at, revoked_at, expiration_confirmed_at, clocks, last_event_ms, last_reconciled_at, needs_reconcile)
    VALUES (
      p_account, p_fields->>'source', p_fields->>'environment', p_fields->>'product_id', p_fields->>'store',
      COALESCE((p_fields->>'has_entitlement')::boolean, false),
      (p_fields->>'expires_at')::timestamptz, (p_fields->>'grace_expires_at')::timestamptz, (p_fields->>'canceled_at')::timestamptz,
      (p_fields->>'billing_issue_at')::timestamptz, (p_fields->>'revoked_at')::timestamptz,
      (p_fields->>'expiration_confirmed_at')::timestamptz, COALESCE(p_fields->'clocks', '{}'::jsonb),
      (p_fields->>'last_event_ms')::bigint, (p_fields->>'last_reconciled_at')::timestamptz,
      COALESCE((p_fields->>'needs_reconcile')::boolean, false))
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
    version = version + 1, updated_at = now()
  WHERE account_id = p_account AND version = p_expected_version
  RETURNING version INTO v_version;
  RETURN jsonb_build_object('applied', v_version IS NOT NULL, 'version', v_version);
END
$$;

-- Bounded reconcile gate: true only if the minimum interval (with exponential backoff on failures) has elapsed. Recorded atomically.
CREATE FUNCTION public.premium_reconcile_claim(p_account uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s public.premium_reconcile_state%ROWTYPE; rt public.premium_runtime_config%ROWTYPE; v_wait integer;
BEGIN
  SELECT * INTO rt FROM public.premium_runtime_config WHERE singleton;
  SELECT * INTO s FROM public.premium_reconcile_state WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.premium_reconcile_state (account_id) VALUES (p_account)
      ON CONFLICT (account_id) DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;
    RETURN true;
  END IF;
  v_wait := LEAST(rt.reconcile_min_interval_seconds * (2 ^ LEAST(s.consecutive_failures, 6))::int, 3600);
  IF clock_timestamp() < s.last_attempt_at + make_interval(secs => v_wait) THEN RETURN false; END IF;
  UPDATE public.premium_reconcile_state SET last_attempt_at = clock_timestamp() WHERE account_id = p_account;
  RETURN true;
END
$$;

CREATE FUNCTION public.premium_reconcile_report(p_account uuid, p_outcome text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.premium_reconcile_state SET last_outcome = p_outcome,
    consecutive_failures = CASE WHEN p_outcome = 'failed' THEN consecutive_failures + 1 ELSE 0 END
  WHERE account_id = p_account
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Quota: stale reservation sweeper, completion and failure (all idempotent)
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_expire_stale(p_account uuid, p_feature text, p_minutes integer DEFAULT 15)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id, units, cost_units, period_start, created_at FROM public.premium_usage_events
    WHERE account_id = p_account AND feature_key = p_feature AND status = 'reserved'
      AND created_at < clock_timestamp() - make_interval(mins => p_minutes)
    FOR UPDATE
  LOOP
    UPDATE public.premium_usage_events SET status = 'expired', completed_at = clock_timestamp() WHERE id = r.id;
    UPDATE public.premium_usage SET reserved = GREATEST(reserved - r.units, 0), updated_at = now()
      WHERE account_id = p_account AND feature_key = p_feature AND period_start = r.period_start;
    UPDATE public.premium_usage_global SET cost_units = GREATEST(cost_units - r.cost_units, 0)
      WHERE feature_key = p_feature AND day = (r.created_at AT TIME ZONE 'UTC')::date;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$$;

CREATE FUNCTION public.premium_complete_usage(p_account uuid, p_feature text, p_idempotency_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ev public.premium_usage_events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM public.premium_usage_events
    WHERE account_id = p_account AND feature_key = p_feature AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF ev.status = 'completed' THEN RETURN 'completed'; END IF;
  IF ev.status <> 'reserved' THEN RETURN ev.status; END IF;
  UPDATE public.premium_usage_events SET status = 'completed', completed_at = clock_timestamp() WHERE id = ev.id;
  UPDATE public.premium_usage SET used = used + ev.units, reserved = GREATEST(reserved - ev.units, 0), updated_at = now()
    WHERE account_id = p_account AND feature_key = p_feature AND period_start = ev.period_start;
  RETURN 'completed';
END
$$;

CREATE FUNCTION public.premium_fail_usage(p_account uuid, p_feature text, p_idempotency_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE ev public.premium_usage_events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM public.premium_usage_events
    WHERE account_id = p_account AND feature_key = p_feature AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF ev.status = 'failed' THEN RETURN 'failed'; END IF;
  IF ev.status <> 'reserved' THEN RETURN ev.status; END IF;
  UPDATE public.premium_usage_events SET status = 'failed', completed_at = clock_timestamp() WHERE id = ev.id;
  UPDATE public.premium_usage SET reserved = GREATEST(reserved - ev.units, 0), updated_at = now()
    WHERE account_id = p_account AND feature_key = p_feature AND period_start = ev.period_start;
  UPDATE public.premium_usage_global SET cost_units = GREATEST(cost_units - ev.cost_units, 0)
    WHERE feature_key = p_feature AND day = (ev.created_at AT TIME ZONE 'UTC')::date;
  RETURN 'failed';
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- THE authorization boundary. One function; no feature-specific bypass. See PREMIUM_STAGE1_A0_ARCHITECTURE.md section 5.
-- The account comes from the verified JWT in the Edge Function, never from a request body.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_authorize(
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

-- ---------------------------------------------------------------------------------------------------------------
-- Seed manifest. Everything starts UNRELEASED: a fresh deployment fails closed. Staging enablement is a documented
-- operator step (docs/premium/PREMIUM_STAGE1_STAGING_PLAN.md), never an implicit migration side effect.
-- limit_status = 'controlled_test': no customer-facing number is approved by Stage 1.
-- ---------------------------------------------------------------------------------------------------------------
INSERT INTO public.premium_feature_config
  (feature_key, display_name, tier, scope, quota_period, premium_limit, free_allowance, free_allowance_status, requires_ai_consent,
   cost_weight, max_units_per_request, rate_limit_per_minute, global_daily_cost_cap)
VALUES
  ('talk_it_out',         'Talk It Out',                  'free',    'account',   'none',  NULL, 0, 'none', false, 1, 1, 60, NULL),
  ('daily_load_premium',  'Daily Load — overload review', 'premium', 'household', 'day',   60,   0, 'none', false, 1, 1, 20, NULL),
  ('smart_inbox_extract', 'Smart Inbox',                  'premium', 'household', 'month', 150,  0, 'proposed_not_approved', true, 5, 1, 10, 5000),
  ('momentum_report',     'Momentum weekly review',       'premium', 'household', 'month', 31,   0, 'none', false, 2, 1, 6, NULL),
  ('village_delegation',  'The Village',                  'premium', 'household', 'month', 0,    0, 'none', false, 1, 1, 6, NULL),
  ('coparent_plus',       'Co-Parent Plus',               'premium', 'household', 'month', 0,    0, 'none', false, 1, 1, 6, NULL);

-- Existing Free functionality is simply on: it is documented in the manifest, never metered, and never needs an entitlement.
UPDATE public.premium_feature_config SET enabled = true, released = true, rollout_status = 'general' WHERE feature_key = 'talk_it_out';

-- ---------------------------------------------------------------------------------------------------------------
-- Function privileges: service-only except the two read functions at the bottom. (Default privileges grant EXECUTE to authenticated.)
-- ---------------------------------------------------------------------------------------------------------------
DO $fn$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'premium_period_start(text,timestamptz)', 'premium_period_end(text,date)', 'premium_version_gte(text,text)',
    'premium_derive_state(boolean,text,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,boolean,timestamptz)',
    'premium_account_lifecycle(uuid)', 'premium_entitlement_state(uuid,timestamptz)', 'premium_record_event(jsonb)',
    'premium_event_set_status(uuid,text,uuid,text)', 'premium_resolve_accounts(text[])',
    'premium_register_identity(text,uuid,text,text)', 'premium_apply_projection(uuid,bigint,jsonb)',
    'premium_reconcile_claim(uuid)', 'premium_reconcile_report(uuid,text)', 'premium_expire_stale(uuid,text,integer)',
    'premium_complete_usage(uuid,text,text)', 'premium_fail_usage(uuid,text,text)',
    'premium_authorize(uuid,text,uuid,text,text,text,integer,boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END
$fn$;

-- ---------------------------------------------------------------------------------------------------------------
-- Client-readable, own-account only, derived state only (no ids, no provider facts beyond what the UI states).
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_my_entitlement()
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
    'checkedAt', clock_timestamp());
END
$$;

CREATE FUNCTION public.premium_feature_manifest()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'featureKey', feature_key, 'displayName', display_name, 'tier', tier,
    'available', enabled AND released AND NOT kill_switch,
    'requiresAiConsent', requires_ai_consent, 'minAppVersion', min_app_version,
    'manifestVersion', manifest_version) ORDER BY feature_key), '[]'::jsonb)
  FROM public.premium_feature_config
$$;

REVOKE ALL ON FUNCTION public.premium_my_entitlement() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.premium_feature_manifest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.premium_my_entitlement() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.premium_feature_manifest() TO authenticated, service_role;
