-- Her Keys Premium, Stage 1 (A4): the SHARED DECISION LEDGER and metadata-only operational views.
--
-- ADDITIVE. One auditable record of "Her Keys proposed X -> she approved / corrected / rejected -> this is what was actually persisted
-- -> here is how to undo it", shared by every Premium pillar (Daily Load, Smart Inbox, Momentum, and later the Village and Co-Parent
-- Plus). It is a RECEIPT SYSTEM, not a content store: it holds typed REFERENCES and the minimal typed snapshots needed to undo, never
-- titles, notes, amounts or message text. Private content stays in its own authorized domain store.
--
-- Authority model
--   * Rows are owned by the DECIDING ACCOUNT (account_id) inside one HOUSEHOLD (household_id). A co-adult in the same household can
--     NOT read them: another adult's decisions are not shared by sharing a household.
--   * The client may READ its own rows (RLS: account_id = auth.uid()) and may never INSERT/UPDATE/DELETE directly. All writes go through
--     two SECURITY DEFINER functions that take the account from auth.uid(), verify household membership, require a matching
--     AUTHORIZED Premium operation (a usage event for the same idempotency key), and enforce a state machine.
--   * Stored data is never gated by entitlement: the select policy references the account only. After a subscription ends every receipt
--     stays readable and an applied change stays undoable.
--   * The `applied` state is CLIENT-ATTESTED (the change itself lives in local-first household state); the ledger proves what was
--     proposed, decided and claimed applied, not the content of the household.
-- Retention: rows live with the account and household (ON DELETE CASCADE). Nothing here is exported to analytics.

CREATE TABLE public.premium_decisions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id     uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  feature_key      text        NOT NULL REFERENCES public.premium_feature_config(feature_key),
  kind             text        NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND length(kind) <= 80),
  idempotency_key  text        NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  -- typed references only (kind + id), never content
  proposal_ref     jsonb       NOT NULL CHECK (jsonb_typeof(proposal_ref) = 'object' AND octet_length(proposal_ref::text) <= 2000),
  source_ref       jsonb       CHECK (source_ref IS NULL OR (jsonb_typeof(source_ref) = 'object' AND octet_length(source_ref::text) <= 2000)),
  proposal_digest  text        NOT NULL CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
  status           text        NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'applying', 'applied', 'failed', 'reverted', 'revert_blocked', 'abandoned')),
  corrected        boolean     NOT NULL DEFAULT false,
  -- minimal typed snapshots: what the record was, what the proposal would make it, what actually persisted
  before_snapshot  jsonb       CHECK (before_snapshot IS NULL OR (jsonb_typeof(before_snapshot) = 'object' AND octet_length(before_snapshot::text) <= 4000)),
  planned_snapshot jsonb       CHECK (planned_snapshot IS NULL OR (jsonb_typeof(planned_snapshot) = 'object' AND octet_length(planned_snapshot::text) <= 4000)),
  after_snapshot   jsonb       CHECK (after_snapshot IS NULL OR (jsonb_typeof(after_snapshot) = 'object' AND octet_length(after_snapshot::text) <= 4000)),
  inverse          jsonb       CHECK (inverse IS NULL OR (jsonb_typeof(inverse) = 'object' AND octet_length(inverse::text) <= 4000)),
  result_ref       jsonb       CHECK (result_ref IS NULL OR (jsonb_typeof(result_ref) IN ('object', 'array') AND octet_length(result_ref::text) <= 4000)),
  failure_code     text        CHECK (failure_code IS NULL OR failure_code ~ '^[a-z][a-z0-9_]{0,59}$'),
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at       timestamptz,
  applied_at       timestamptz,
  reverted_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT premium_decisions_idempotent UNIQUE (account_id, feature_key, idempotency_key),
  -- an applied change must say what it did and how to undo it; a revert must say when
  CONSTRAINT premium_decisions_applied_complete CHECK (status NOT IN ('applied', 'reverted', 'revert_blocked') OR (after_snapshot IS NOT NULL AND applied_at IS NOT NULL)),
  CONSTRAINT premium_decisions_reverted_when CHECK (status <> 'reverted' OR reverted_at IS NOT NULL)
);

-- A duplicate submission of the SAME live proposal can never be applied twice. (A reverted or rejected one may be proposed again.)
CREATE UNIQUE INDEX premium_decisions_one_live_proposal
  ON public.premium_decisions (account_id, household_id, feature_key, proposal_digest)
  WHERE status IN ('proposed', 'approved', 'applying', 'applied');
CREATE INDEX premium_decisions_recent_idx ON public.premium_decisions (account_id, household_id, feature_key, updated_at DESC);
CREATE INDEX premium_decisions_in_flight_idx ON public.premium_decisions (account_id, updated_at) WHERE status IN ('approved', 'applying');

ALTER TABLE public.premium_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.premium_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.premium_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.premium_decisions TO service_role;

-- Owner-only, and deliberately NOT a function of entitlement: a receipt outlives the subscription.
CREATE POLICY premium_decisions_select_own ON public.premium_decisions FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));

COMMENT ON TABLE public.premium_decisions IS
  'Shared Premium decision/receipt ledger: typed references and minimal undo snapshots only. Written only through premium_decision_* functions; readable by the deciding account regardless of entitlement.';

-- ---------------------------------------------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.premium_decision_may_transition(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT (p_from, p_to) IN (
    ('proposed', 'approved'), ('proposed', 'rejected'), ('proposed', 'abandoned'),
    ('approved', 'applying'), ('approved', 'applied'), ('approved', 'failed'), ('approved', 'abandoned'),
    ('applying', 'applied'), ('applying', 'failed'), ('applying', 'abandoned'),
    ('applied', 'reverted'), ('applied', 'revert_blocked'),
    ('revert_blocked', 'reverted'), ('revert_blocked', 'applied'),
    ('failed', 'approved'), ('failed', 'abandoned'))
$$;

-- Record a proposal. Idempotent by (account, feature, idempotency key). The caller must name a household they are an ADULT member of
-- and a Premium operation the SERVER authorized for this very key (premium_usage_events) — a free caller cannot write ledger rows.
CREATE FUNCTION public.premium_decision_record(
  p_household uuid, p_feature text, p_kind text, p_idempotency_key text, p_proposal_ref jsonb, p_proposal_digest text,
  p_source_ref jsonb DEFAULT NULL, p_before jsonb DEFAULT NULL, p_planned jsonb DEFAULT NULL, p_inverse jsonb DEFAULT NULL
) RETURNS public.premium_decisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_account uuid := auth.uid(); v_row public.premium_decisions;
BEGIN
  IF v_account IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = p_household AND m.profile_id = v_account AND m.member_type = 'adult') THEN
    RAISE EXCEPTION 'ownership_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.premium_usage_events e
                  WHERE e.account_id = v_account AND e.feature_key = p_feature AND e.idempotency_key = p_idempotency_key
                    AND e.status IN ('reserved', 'completed')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.premium_decisions (account_id, household_id, feature_key, kind, idempotency_key, proposal_ref, source_ref,
                                        proposal_digest, before_snapshot, planned_snapshot, inverse)
  VALUES (v_account, p_household, p_feature, p_kind, p_idempotency_key, p_proposal_ref, p_source_ref, p_proposal_digest, p_before, p_planned, p_inverse)
  ON CONFLICT (account_id, feature_key, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.premium_decisions WHERE account_id = v_account AND feature_key = p_feature AND idempotency_key = p_idempotency_key;
    -- a replay of the SAME operation returns the same receipt; a key reused for a different proposal is refused, never merged
    IF v_row.proposal_digest <> p_proposal_digest OR v_row.household_id <> p_household THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505'; END IF;
  END IF;
  RETURN v_row;
END
$$;

-- Move a receipt along the state machine. Only the deciding account; only legal edges; only an allow-listed patch.
CREATE FUNCTION public.premium_decision_transition(p_id uuid, p_to text, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS public.premium_decisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_account uuid := auth.uid(); v_row public.premium_decisions; v_key text; v_now timestamptz := clock_timestamp();
BEGIN
  IF v_account IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_row FROM public.premium_decisions WHERE id = p_id AND account_id = v_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_key NOT IN ('after_snapshot', 'planned_snapshot', 'result_ref', 'failure_code', 'corrected') THEN RAISE EXCEPTION 'patch_key_not_allowed' USING ERRCODE = '22023'; END IF;
  END LOOP;
  -- the same transition retried is a no-op (a flaky network must not turn a success into an error)
  IF v_row.status = p_to THEN RETURN v_row; END IF;
  IF NOT public.premium_decision_may_transition(v_row.status, p_to) THEN RAISE EXCEPTION 'illegal_transition:%->%', v_row.status, p_to USING ERRCODE = '22023'; END IF;

  UPDATE public.premium_decisions SET
    status = p_to,
    corrected = COALESCE((p_patch->>'corrected')::boolean, corrected),
    planned_snapshot = COALESCE(p_patch->'planned_snapshot', planned_snapshot),
    after_snapshot = COALESCE(p_patch->'after_snapshot', after_snapshot),
    result_ref = COALESCE(p_patch->'result_ref', result_ref),
    failure_code = CASE WHEN p_to IN ('failed', 'revert_blocked', 'abandoned') THEN p_patch->>'failure_code' ELSE NULL END,
    decided_at = CASE WHEN p_to IN ('approved', 'rejected') THEN v_now ELSE decided_at END,
    applied_at = CASE WHEN p_to = 'applied' THEN COALESCE(applied_at, v_now) ELSE applied_at END,
    reverted_at = CASE WHEN p_to = 'reverted' THEN v_now ELSE reverted_at END,
    updated_at = v_now
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.premium_decision_may_transition(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.premium_decision_record(uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.premium_decision_transition(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.premium_decision_may_transition(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.premium_decision_record(uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.premium_decision_transition(uuid, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Operational views (A4 observability): SERVICE-ONLY, metadata only. No content, no e-mail, no household text.
-- Each is a query definition for the runbook; an external dashboard/alert export needs a privacy and retention review (OD-P1-05).
-- ---------------------------------------------------------------------------------------------------------------
CREATE VIEW public.premium_metrics_denials AS
  SELECT date_trunc('day', decided_at AT TIME ZONE 'UTC')::date AS day, feature_key, reason, outcome, count(*) AS decisions
  FROM public.premium_authorization_audit GROUP BY 1, 2, 3, 4;

CREATE VIEW public.premium_metrics_webhook AS
  SELECT date_trunc('hour', received_at) AS hour, status, count(*) AS events,
         round(avg(EXTRACT(EPOCH FROM (processed_at - received_at)))::numeric, 3) AS avg_processing_seconds,
         round(max(EXTRACT(EPOCH FROM (received_at - to_timestamp(event_timestamp_ms / 1000.0))))::numeric, 1) AS max_provider_delay_seconds
  FROM public.premium_events GROUP BY 1, 2;

CREATE VIEW public.premium_metrics_backlog AS
  SELECT status, count(*) AS events,
         round(EXTRACT(EPOCH FROM (clock_timestamp() - min(received_at)))::numeric, 0) AS oldest_age_seconds
  FROM public.premium_events WHERE status IN ('received', 'failed', 'dead_letter') GROUP BY status;

CREATE VIEW public.premium_metrics_projection AS
  SELECT count(*) FILTER (WHERE needs_reconcile) AS accounts_needing_reconcile,
         count(*) FILTER (WHERE last_reconciled_at IS NULL) AS never_reconciled,
         count(*) FILTER (WHERE last_reconciled_at < clock_timestamp() - INTERVAL '30 days' AND expires_at > clock_timestamp()) AS paid_but_stale_30d,
         count(*) AS projections
  FROM public.premium_entitlements;

CREATE VIEW public.premium_metrics_usage AS
  SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day, feature_key, via, status,
         count(*) AS operations, sum(units) AS units, sum(cost_units) AS cost_units
  FROM public.premium_usage_events GROUP BY 1, 2, 3, 4;

CREATE VIEW public.premium_metrics_decisions AS
  SELECT date_trunc('day', updated_at AT TIME ZONE 'UTC')::date AS day, feature_key, kind, status, count(*) AS decisions
  FROM public.premium_decisions GROUP BY 1, 2, 3, 4;

DO $v$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['premium_metrics_denials', 'premium_metrics_webhook', 'premium_metrics_backlog', 'premium_metrics_projection', 'premium_metrics_usage', 'premium_metrics_decisions'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
  END LOOP;
END
$v$;

-- One health read for operators and alerting: every alert rule in one place, with its threshold, metadata only.
CREATE FUNCTION public.premium_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_dead integer; v_backlog_age numeric; v_backlog integer; v_reconcile integer; v_stale integer; v_failed_24h integer; v_fix integer;
  v_rt public.premium_runtime_config%ROWTYPE; v_alerts jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_rt FROM public.premium_runtime_config WHERE singleton;
  SELECT count(*) INTO v_dead FROM public.premium_events WHERE status = 'dead_letter';
  SELECT count(*), COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - min(received_at))), 0) INTO v_backlog, v_backlog_age FROM public.premium_events WHERE status IN ('received', 'failed');
  SELECT count(*) INTO v_reconcile FROM public.premium_entitlements WHERE needs_reconcile;
  SELECT count(*) INTO v_stale FROM public.premium_entitlements WHERE last_reconciled_at < clock_timestamp() - INTERVAL '30 days' AND expires_at > clock_timestamp();
  SELECT count(*) INTO v_failed_24h FROM public.premium_decisions WHERE status IN ('failed', 'revert_blocked') AND updated_at > clock_timestamp() - INTERVAL '24 hours';
  SELECT count(*) INTO v_fix FROM public.premium_entitlements WHERE source = 'test_fixture';

  IF v_dead > 0 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'dead_letter_events', 'severity', 'page', 'value', v_dead, 'threshold', 0); END IF;
  IF v_backlog_age > 600 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'webhook_backlog_age_seconds', 'severity', 'page', 'value', round(v_backlog_age), 'threshold', 600); END IF;
  IF v_reconcile > 25 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'accounts_needing_reconcile', 'severity', 'warn', 'value', v_reconcile, 'threshold', 25); END IF;
  IF v_stale > 0 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'paid_projection_not_reconciled_30d', 'severity', 'warn', 'value', v_stale, 'threshold', 0); END IF;
  IF v_failed_24h > 10 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'failed_or_blocked_decisions_24h', 'severity', 'warn', 'value', v_failed_24h, 'threshold', 10); END IF;
  IF NOT v_rt.webhook_processing THEN v_alerts := v_alerts || jsonb_build_object('rule', 'webhook_processing_halted', 'severity', 'warn', 'value', 1, 'threshold', 0); END IF;
  IF NOT v_rt.premium_enabled THEN v_alerts := v_alerts || jsonb_build_object('rule', 'premium_globally_disabled', 'severity', 'warn', 'value', 1, 'threshold', 0); END IF;
  -- structural safety: a production database must never hold a fabricated entitlement
  IF v_rt.environment = 'production' AND v_fix > 0 THEN v_alerts := v_alerts || jsonb_build_object('rule', 'test_fixture_entitlement_in_production', 'severity', 'page', 'value', v_fix, 'threshold', 0); END IF;

  RETURN jsonb_build_object(
    'environment', v_rt.environment, 'checkedAt', clock_timestamp(), 'ok', jsonb_array_length(v_alerts) = 0, 'alerts', v_alerts,
    'counts', jsonb_build_object('deadLetter', v_dead, 'backlog', v_backlog, 'backlogAgeSeconds', round(v_backlog_age), 'needsReconcile', v_reconcile, 'staleProjections', v_stale, 'failedDecisions24h', v_failed_24h));
END
$$;
REVOKE ALL ON FUNCTION public.premium_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.premium_health() TO service_role;
