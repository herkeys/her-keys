-- Her Keys Premium Stage 1 (A1/A2) — entitlement state derivation, the single authorization boundary, consent, quotas, privileges.
--
-- Actors (helpers/10-fixtures.sql, 30-premium-fixtures.sql): USER A owns household A; USER B is a second adult of household A with NO
-- entitlement of their own; USER C owns household C; D, E, F are plain accounts. Every mutating probe runs in a transaction that is
-- rolled back, so each case starts from the same state.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'
\set ud '44444444-4444-4444-8444-444444444444'
\set ue '55555555-5555-4555-8555-555555555555'
\set uf '66666666-6666-4666-8666-666666666666'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset

-- Pending provider reconciliation must block all new paid work.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_entitlements SET needs_reconcile = true WHERE account_id = :'ua';
SELECT CASE WHEN public.premium_entitlement_state(:'ua') = 'unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | needs_reconcile denies a previously active projection';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-reconcile-dirty-01') AS dirty_decision \gset
SELECT CASE WHEN (:'dirty_decision'::jsonb ->> 'reason') = 'entitlement_unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | pending provider reconciliation cannot authorize Daily Load computation';
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-reconcile-dirty-02') AS dirty_ai_decision \gset
SELECT CASE WHEN (:'dirty_ai_decision'::jsonb ->> 'reason') = 'entitlement_unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | pending provider reconciliation cannot authorize Smart Inbox AI spending';
ROLLBACK;

-- Even without an explicit dirty flag, old/never reconciled provider evidence
-- cannot permanently authorize paid work when a webhook was silently missed.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_entitlements SET source='reconcile', last_reconciled_at=clock_timestamp() - interval '25 hours',
  needs_reconcile=false WHERE account_id=:'ua';
SELECT CASE WHEN public.premium_entitlement_state(:'ua') = 'unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | 25-hour-old actual-provider reconciliation is no longer trusted';
SELECT public.premium_authorize(:'ua', 'momentum_report', :'hh_a', 'k-provider-stale-01') AS stale_decision \gset
SELECT CASE WHEN (:'stale_decision'::jsonb ->> 'reason') = 'entitlement_unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | stale provider data cannot authorize a new Momentum review';
UPDATE public.premium_entitlements SET last_reconciled_at=clock_timestamp() WHERE account_id=:'ua';
SELECT CASE WHEN public.premium_entitlement_state(:'ua') = 'premium_active' THEN 'PASS' ELSE 'FAIL' END
  || ' | a fresh reconciled subscriber may authorize again';
UPDATE public.premium_entitlements SET source='webhook', last_reconciled_at=NULL WHERE account_id=:'ua';
SELECT CASE WHEN public.premium_entitlement_state(:'ua') = 'unknown' THEN 'PASS' ELSE 'FAIL' END
  || ' | signed webhook alone does not substitute for actual provider subscriber reconciliation';
ROLLBACK;

-- ============ STATE DERIVATION (the pure function; mirrored by entitlementState.ts) =============================================
SELECT CASE WHEN public.premium_derive_state(false, null, null, null, null, null, null, null, true, now()) = 'unknown' THEN 'PASS' ELSE 'FAIL' END || ' | derive: no projection row is unknown, never free';
SELECT CASE WHEN public.premium_derive_state(true, 'reconcile', false, null, null, null, null, null, false, now()) = 'free' THEN 'PASS' ELSE 'FAIL' END || ' | derive: a reconciled non-subscriber is free';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() + interval '1 day', null, null, null, null, false, now()) = 'premium_active' THEN 'PASS' ELSE 'FAIL' END || ' | derive: unexpired entitlement is premium_active';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, null, null, null, null, null, false, now()) = 'premium_active' THEN 'PASS' ELSE 'FAIL' END || ' | derive: a lifetime entitlement (no expiry) is premium_active';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() + interval '1 day', null, now(), null, null, false, now()) = 'premium_canceled_active' THEN 'PASS' ELSE 'FAIL' END || ' | derive: canceled but still paid is premium_canceled_active (NOT revoked early)';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() - interval '1 hour', now() + interval '2 days', null, null, null, false, now()) = 'premium_billing_grace' THEN 'PASS' ELSE 'FAIL' END || ' | derive: grace follows the PROVIDER grace expiry';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() - interval '1 hour', null, null, null, null, false, now()) = 'unknown' THEN 'PASS' ELSE 'FAIL' END || ' | derive: expired but unconfirmed is unknown (a late renewal webhook must not be mistaken for lapse)';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() - interval '1 hour', null, null, null, now(), false, now()) = 'premium_expired' THEN 'PASS' ELSE 'FAIL' END || ' | derive: expired AND confirmed is premium_expired';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() + interval '5 days', null, null, now(), null, false, now()) = 'premium_revoked' THEN 'PASS' ELSE 'FAIL' END || ' | derive: revocation wins over an unexpired term';
SELECT CASE WHEN public.premium_derive_state(true, 'webhook', true, now() - interval '1 hour', now() - interval '10 minutes', null, null, now(), false, now()) = 'premium_expired' THEN 'PASS' ELSE 'FAIL' END || ' | derive: grace that has itself ended is premium_expired';
SELECT CASE WHEN public.premium_derive_state(true, 'test_fixture', true, now() + interval '1 day', null, null, null, null, false, now()) = 'unknown' THEN 'PASS' ELSE 'FAIL' END || ' | derive: a test_fixture row is IGNORED when fixtures are not allowed';

-- ============ CONFIG STRUCTURE =====================================================================================================
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.premium_runtime_config SET environment = 'production', allow_test_fixtures = true$q$) LIKE '23514%' THEN 'PASS' ELSE 'FAIL' END || ' | a production-configured database cannot allow test fixtures (structural CHECK)';
SELECT CASE WHEN herkeys_test.error_of($q$INSERT INTO public.premium_entitlements (account_id, source, environment) VALUES ('44444444-4444-4444-8444-444444444444', 'test_fixture', 'PRODUCTION')$q$) LIKE '23514%' THEN 'PASS' ELSE 'FAIL' END || ' | a test_fixture entitlement can only be SANDBOX';
SELECT CASE WHEN herkeys_test.error_of($q$UPDATE public.premium_feature_config SET quota_period = 'month', premium_limit = 5 WHERE feature_key = 'talk_it_out'$q$) LIKE '23514%' THEN 'PASS' ELSE 'FAIL' END || ' | Talk It Out cannot be metered (a free feature is structurally unmetered)';
SELECT CASE WHEN (SELECT count(*) FROM public.premium_feature_config WHERE released AND feature_key IN ('village_delegation', 'coparent_plus')) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | future pillars (Village, Co-Parent Plus) ship unreleased and fail closed';
SELECT CASE WHEN (SELECT free_allowance FROM public.premium_feature_config WHERE feature_key = 'smart_inbox_extract') = 0
              AND (SELECT free_allowance_status FROM public.premium_feature_config WHERE feature_key = 'smart_inbox_extract') = 'proposed_not_approved'
            THEN 'PASS' ELSE 'FAIL' END || ' | no final Free Smart Inbox allowance is activated (0, proposed_not_approved)';
SELECT CASE WHEN bool_and(limit_status = 'controlled_test') THEN 'PASS' ELSE 'FAIL' END || ' | every Premium fair-use limit is a controlled test value, not an approved customer-facing number' FROM public.premium_feature_config;

-- ============ AUTHORIZATION: ENTITLEMENT STATES ====================================================================================
BEGIN;
SELECT public.premium_authorize(:'ud', 'daily_load_premium', NULL, 'k-state-unknown-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' = 'ownership_denied' THEN 'PASS' ELSE 'FAIL' END || ' | household-scoped feature without a household is ownership_denied (got ' || :'r' || ')';
ROLLBACK;

BEGIN;
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-unknown-2') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'reason') = 'entitlement_unknown' AND (:'d'::jsonb ->> 'nextAction') = 'retry_verification' THEN 'PASS' ELSE 'FAIL' END || ' | no projection: entitlement_unknown + retry_verification (never "requires_premium", never allowed)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'free');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-free-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'reason') = 'requires_premium' AND (:'d'::jsonb ->> 'nextAction') = 'open_paywall' THEN 'PASS' ELSE 'FAIL' END || ' | free JWT calling a Premium feature directly: requires_premium + open_paywall';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-active-1', 'req-1', '1.0.0') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'outcome') = 'allowed' AND (:'d'::jsonb ->> 'entitlementState') = 'premium_active' AND (:'d'::jsonb ->> 'via') = 'premium' THEN 'PASS' ELSE 'FAIL' END || ' | an active entitlement is allowed via premium';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'canceled_active');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-cancel-1') ->> 'outcome' AS o \gset
SELECT CASE WHEN :'o' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | canceled-but-paid is still allowed (not prematurely revoked)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'grace');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-grace-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'outcome') = 'allowed' AND (:'d'::jsonb ->> 'entitlementState') = 'premium_billing_grace' THEN 'PASS' ELSE 'FAIL' END || ' | provider billing grace is allowed';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'expired');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-expired-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'reason') = 'entitlement_expired' AND (:'d'::jsonb ->> 'nextAction') = 'open_paywall' THEN 'PASS' ELSE 'FAIL' END || ' | expired: new Premium compute denied (entitlement_expired)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'expired_unconfirmed');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-unconf-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' = 'entitlement_unknown' THEN 'PASS' ELSE 'FAIL' END || ' | expired but unconfirmed: unknown (reconcile first), not a lapse';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'revoked');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-state-revoked-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' = 'entitlement_expired' THEN 'PASS' ELSE 'FAIL' END || ' | a revoked entitlement is denied even though its original term has not elapsed';
ROLLBACK;

-- ============ AUTHORIZATION: OWNERSHIP, SHARING, LIFECYCLE =========================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_c', 'k-own-wrong-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' = 'ownership_denied' THEN 'PASS' ELSE 'FAIL' END || ' | a Premium account naming ANOTHER household is ownership_denied (client household id never overrides membership)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT public.premium_authorize(:'ub', 'daily_load_premium', :'hh_a', 'k-share-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' <> 'allowed' AND :'r' IN ('entitlement_unknown', 'requires_premium') THEN 'PASS' ELSE 'FAIL' END || ' | a co-member of the SUBSCRIBER''s household does NOT inherit Premium (got ' || :'r' || ')';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ub', 'active');
SELECT public.premium_authorize(:'ub', 'daily_load_premium', :'hh_a', 'k-share-2') ->> 'outcome' AS o \gset
SELECT CASE WHEN :'o' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | an adult member who bought Premium herself is authorized (purchaser-bound, membership is only the ownership check)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
CREATE TABLE public.account_deletion_requests (account_id uuid, status text);
INSERT INTO public.account_deletion_requests VALUES (:'ua', 'deactivated');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-life-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'reason') = 'account_deactivated' AND (:'d'::jsonb ->> 'entitlementState') = 'deletion_pending' THEN 'PASS' ELSE 'FAIL' END || ' | an open deletion request overrides an active subscription (account_deactivated / deletion_pending)';
UPDATE public.account_deletion_requests SET status = 'restored';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-life-2') ->> 'outcome' AS o \gset
SELECT CASE WHEN :'o' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | a restored account is authorized again';
ROLLBACK;

-- ============ AUTHORIZATION: FEATURE STATE =========================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT public.premium_authorize(:'ua', 'village_delegation', :'hh_a', 'k-feat-1') ->> 'reason' AS r1 \gset
SELECT public.premium_authorize(:'ua', 'no_such_feature', :'hh_a', 'k-feat-2') ->> 'reason' AS r2 \gset
SELECT CASE WHEN :'r1' = 'feature_disabled' AND :'r2' = 'feature_disabled' THEN 'PASS' ELSE 'FAIL' END || ' | an unreleased or unknown feature fails closed for a paying customer';
UPDATE public.premium_feature_config SET kill_switch = true WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-feat-3') ->> 'reason' AS r3 \gset
SELECT CASE WHEN :'r3' = 'feature_disabled' THEN 'PASS' ELSE 'FAIL' END || ' | the kill switch stops a released feature immediately';
UPDATE public.premium_feature_config SET kill_switch = false, min_app_version = '2.0.0' WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-feat-4', NULL, '1.9.9') AS d4 \gset
SELECT CASE WHEN (:'d4'::jsonb ->> 'reason') = 'feature_disabled' AND (:'d4'::jsonb ->> 'nextAction') = 'update_app' THEN 'PASS' ELSE 'FAIL' END || ' | an app older than the feature minimum is told to update';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-feat-5', NULL, '2.0.0') ->> 'outcome' AS o5 \gset
SELECT CASE WHEN :'o5' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | the minimum version itself is allowed';
UPDATE public.premium_runtime_config SET premium_enabled = false;
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-feat-6', NULL, '2.0.0') ->> 'reason' AS r6 \gset
SELECT CASE WHEN :'r6' = 'service_unavailable' THEN 'PASS' ELSE 'FAIL' END || ' | the global switch reports service_unavailable (an outage is not an upsell)';
ROLLBACK;

BEGIN;
SELECT public.premium_authorize(:'ua', 'talk_it_out', NULL, 'k-free-tier-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'outcome') = 'allowed' AND (:'d'::jsonb ->> 'via') = 'free' AND (:'d'::jsonb ->> 'quota') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | a free-tier feature (Talk It Out) needs no entitlement and is never metered';
ROLLBACK;

-- Each flag in ISOLATION: a feature that is enabled but NOT released (a staged rollout) must be as closed as a disabled one.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET enabled = true, released = false WHERE feature_key = 'village_delegation';
SELECT public.premium_authorize(:'ua', 'village_delegation', :'hh_a', 'k-flag-0001') ->> 'reason' AS r1 \gset
UPDATE public.premium_feature_config SET enabled = false, released = true WHERE feature_key = 'village_delegation';
SELECT public.premium_authorize(:'ua', 'village_delegation', :'hh_a', 'k-flag-0002') ->> 'reason' AS r2 \gset
SELECT CASE WHEN :'r1' = 'feature_disabled' AND :'r2' = 'feature_disabled' THEN 'PASS' ELSE 'FAIL' END || ' | enabled-but-unreleased AND released-but-disabled are each closed (got ' || :'r1' || ' / ' || :'r2' || ')';
ROLLBACK;

-- ============ AI CONSENT ===========================================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-ai-none-1') AS d \gset
SELECT CASE WHEN (:'d'::jsonb ->> 'reason') = 'requires_ai_consent' AND (:'d'::jsonb ->> 'nextAction') = 'grant_ai_consent' THEN 'PASS' ELSE 'FAIL' END || ' | no AI consent recorded: requires_ai_consent (absence is never implied consent)';
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES (:'ua', 'ai_processing', 'ai-data-processing-initial-v1', false);
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-ai-declined-1') ->> 'reason' AS r \gset
SELECT CASE WHEN :'r' = 'requires_ai_consent' THEN 'PASS' ELSE 'FAIL' END || ' | a DECLINED AI consent is denied';
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES (:'ua', 'ai_processing', 'ai-data-processing-OLD-v0', true);
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-ai-old-1') ->> 'reason' AS r2 \gset
SELECT CASE WHEN :'r2' = 'requires_ai_consent' THEN 'PASS' ELSE 'FAIL' END || ' | a grant against an OLD policy version does not satisfy consent';
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES (:'ua', 'ai_processing', 'ai-data-processing-initial-v1', true);
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-ai-granted-1') ->> 'outcome' AS o3 \gset
SELECT CASE WHEN :'o3' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | the latest grant of the current policy version is allowed';
-- A deterministic feature never needs AI consent: declining it must not cost her Daily Load Premium.
DELETE FROM public.account_consents WHERE account_id = :'ua';
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES (:'ua', 'ai_processing', 'ai-data-processing-initial-v1', false);
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-ai-dl-1') ->> 'outcome' AS o4 \gset
SELECT CASE WHEN :'o4' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | Daily Load Premium (deterministic) works with AI consent declined';
ROLLBACK;

-- ============ QUOTA, IDEMPOTENCY, RATE, BUDGET =====================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET premium_limit = 3, rate_limit_per_minute = 100 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0001') ->> 'outcome' AS o1 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0002') ->> 'outcome' AS o2 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0003') ->> 'outcome' AS o3 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0004') AS d4 \gset
SELECT CASE WHEN :'o1' = 'allowed' AND :'o2' = 'allowed' AND :'o3' = 'allowed' AND (:'d4'::jsonb ->> 'reason') = 'quota_exhausted' THEN 'PASS' ELSE 'FAIL' END || ' | the 4th request against a limit of 3 is quota_exhausted';
SELECT CASE WHEN (:'d4'::jsonb #>> '{quota,remaining}') = '0' AND (:'d4'::jsonb #>> '{quota,limit}') = '3' THEN 'PASS' ELSE 'FAIL' END || ' | the denial reports an honest quota snapshot (limit 3, remaining 0)';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0002') AS dr \gset
SELECT CASE WHEN (:'dr'::jsonb ->> 'outcome') = 'allowed' AND (:'dr'::jsonb ->> 'replay') = 'true' THEN 'PASS' ELSE 'FAIL' END || ' | retrying an already-reserved key is an idempotent replay: allowed, not charged again';
SELECT CASE WHEN (SELECT reserved FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 3 THEN 'PASS' ELSE 'FAIL' END || ' | the replay did not double-charge (reserved stays 3)';
SELECT public.premium_fail_usage(:'ua', 'daily_load_premium', 'k-quota-0003') AS f \gset
SELECT CASE WHEN :'f' = 'failed' AND (SELECT reserved FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 2 THEN 'PASS' ELSE 'FAIL' END || ' | a failed operation releases its reservation';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-quota-0003') ->> 'outcome' AS o5 \gset
SELECT CASE WHEN :'o5' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | the SAME key retried after a failure is charged once, not refused as a duplicate';
SELECT public.premium_complete_usage(:'ua', 'daily_load_premium', 'k-quota-0001') AS c1 \gset
SELECT public.premium_complete_usage(:'ua', 'daily_load_premium', 'k-quota-0001') AS c2 \gset
SELECT CASE WHEN :'c1' = 'completed' AND :'c2' = 'completed' AND (SELECT used FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 1 THEN 'PASS' ELSE 'FAIL' END || ' | completion is idempotent (used 1 after two completes)';
ROLLBACK;

-- THE PRODUCTION PATH: Daily Load settles at authorization (p_complete_now = true). It must be bounded exactly like a reservation.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET premium_limit = 3, rate_limit_per_minute = 100 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0001', NULL, NULL, 1, true) ->> 'outcome' AS o1 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0002', NULL, NULL, 1, true) ->> 'outcome' AS o2 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0003', NULL, NULL, 1, true) ->> 'outcome' AS o3 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0004', NULL, NULL, 1, true) AS d4 \gset
SELECT CASE WHEN :'o1' = 'allowed' AND :'o2' = 'allowed' AND :'o3' = 'allowed' AND (:'d4'::jsonb ->> 'reason') = 'quota_exhausted' THEN 'PASS' ELSE 'FAIL' END || ' | settle-at-authorization: the 4th request against a limit of 3 is quota_exhausted';
SELECT CASE WHEN (SELECT used FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 3
             AND (SELECT reserved FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | settled units are USED, nothing is left reserved';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0002', NULL, NULL, 1, true) ->> 'replay' AS rp \gset
SELECT CASE WHEN :'rp' = 'true' AND (SELECT used FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 3 THEN 'PASS' ELSE 'FAIL' END || ' | a settled key replays without a second charge';
-- A refusal must leave NOTHING behind: no pending claim, no consumed rate-limit slot, no poisoned key.
SELECT CASE WHEN (SELECT count(*) FROM public.premium_usage_events WHERE status = 'pending') = 0
             AND (SELECT count(*) FROM public.premium_usage_events WHERE idempotency_key = 'k-settle-0004') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | a quota refusal leaves no pending claim and no event for its key';
UPDATE public.premium_feature_config SET premium_limit = 10 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-settle-0004', NULL, NULL, 1, true) ->> 'outcome' AS o5 \gset
SELECT CASE WHEN :'o5' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | the refused key succeeds once the limit allows it (the key was not poisoned)';
ROLLBACK;

-- A refusal must not burn rate-limit slots: with a rate of 2/minute, five REFUSED requests do not stop a valid one.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET premium_limit = 0, rate_limit_per_minute = 2 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00001');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00002');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00003');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00004');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00005');
UPDATE public.premium_feature_config SET premium_limit = 50 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-burn-00006') ->> 'outcome' AS o \gset
SELECT CASE WHEN :'o' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | refused requests do not consume rate-limit slots';
ROLLBACK;

-- Settle-at-authorization against the GLOBAL cost cap compensates the already-used unit.
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET premium_limit = 100, rate_limit_per_minute = 100, global_daily_cost_cap = 2, cost_weight = 1 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-gcap-00001', NULL, NULL, 1, true);
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-gcap-00002', NULL, NULL, 1, true);
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-gcap-00003', NULL, NULL, 1, true) ->> 'reason' AS r3 \gset
SELECT CASE WHEN :'r3' = 'quota_exhausted' AND (SELECT used FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 2 THEN 'PASS' ELSE 'FAIL' END || ' | a global-budget refusal on the settled path compensates the per-account unit (used stays 2)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET premium_limit = 2, rate_limit_per_minute = 100 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-stale-0001') ->> 'outcome' AS o1 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-stale-0002') ->> 'outcome' AS o2 \gset
UPDATE public.premium_usage_events SET created_at = now() - interval '2 hours' WHERE idempotency_key = 'k-stale-0001';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-stale-0003') ->> 'outcome' AS o3 \gset
SELECT CASE WHEN :'o1' = 'allowed' AND :'o2' = 'allowed' AND :'o3' = 'allowed' THEN 'PASS' ELSE 'FAIL' END || ' | an abandoned reservation expires and frees its unit (the 3rd request fits)';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
UPDATE public.premium_feature_config SET rate_limit_per_minute = 2, premium_limit = 100 WHERE feature_key = 'daily_load_premium';
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-rate-0001') ->> 'outcome' AS o1 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-rate-0002') ->> 'outcome' AS o2 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-rate-0003') AS d3 \gset
SELECT CASE WHEN :'o1' = 'allowed' AND :'o2' = 'allowed' AND (:'d3'::jsonb ->> 'reason') = 'rate_limited' AND (:'d3'::jsonb ->> 'nextAction') = 'retry_later' THEN 'PASS' ELSE 'FAIL' END || ' | the per-minute rate limit refuses a burst';
SELECT CASE WHEN (SELECT reserved FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'daily_load_premium') = 2 THEN 'PASS' ELSE 'FAIL' END || ' | a rate-limited request consumes no quota';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'active');
SELECT herkeys_test.premium_grant(:'ub', 'active');
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES
  (:'ua', 'ai_processing', 'ai-data-processing-initial-v1', true), (:'ub', 'ai_processing', 'ai-data-processing-initial-v1', true);
UPDATE public.premium_feature_config SET global_daily_cost_cap = 10, premium_limit = 100, cost_weight = 5, rate_limit_per_minute = 100 WHERE feature_key = 'smart_inbox_extract';
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-budget-0001') ->> 'outcome' AS o1 \gset
SELECT public.premium_authorize(:'ub', 'smart_inbox_extract', :'hh_a', 'k-budget-0002') ->> 'outcome' AS o2 \gset
SELECT public.premium_authorize(:'ua', 'smart_inbox_extract', :'hh_a', 'k-budget-0003') AS d3 \gset
SELECT CASE WHEN :'o1' = 'allowed' AND :'o2' = 'allowed' AND (:'d3'::jsonb ->> 'reason') = 'quota_exhausted' THEN 'PASS' ELSE 'FAIL' END || ' | the global daily cost cap stops spend across ALL accounts';
SELECT CASE WHEN (SELECT reserved FROM public.premium_usage WHERE account_id = :'ua' AND feature_key = 'smart_inbox_extract') = 1 THEN 'PASS' ELSE 'FAIL' END || ' | a budget refusal compensates the per-account reservation';
ROLLBACK;

BEGIN;
SELECT herkeys_test.premium_grant(:'ud', 'free');
INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES (:'ud', 'ai_processing', 'ai-data-processing-initial-v1', true);
INSERT INTO public.profiles (id, timezone) VALUES (:'ud', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
  SELECT :'hh_a', 'user-d', :'ud', 'adult', 'member', NULL, 'personal';
SELECT public.premium_authorize(:'ud', 'smart_inbox_extract', :'hh_a', 'k-free-0001') ->> 'reason' AS r1 \gset
SELECT CASE WHEN :'r1' = 'requires_premium' THEN 'PASS' ELSE 'FAIL' END || ' | with no allowance at all, a free user gets requires_premium';
-- A NON-ZERO but unapproved number must be exactly as closed: "proposed" is not "approved".
UPDATE public.premium_feature_config SET free_allowance = 5, free_allowance_status = 'proposed_not_approved', rate_limit_per_minute = 100 WHERE feature_key = 'smart_inbox_extract';
SELECT public.premium_authorize(:'ud', 'smart_inbox_extract', :'hh_a', 'k-free-0001b') ->> 'reason' AS r1b \gset
SELECT CASE WHEN :'r1b' = 'requires_premium' THEN 'PASS' ELSE 'FAIL' END || ' | a PROPOSED, non-zero free allowance is NOT honoured until the owner approves it';
UPDATE public.premium_feature_config SET free_allowance = 2, free_allowance_status = 'approved', rate_limit_per_minute = 100 WHERE feature_key = 'smart_inbox_extract';
SELECT public.premium_authorize(:'ud', 'smart_inbox_extract', :'hh_a', 'k-free-0002') AS d2 \gset
SELECT public.premium_authorize(:'ud', 'smart_inbox_extract', :'hh_a', 'k-free-0003') ->> 'outcome' AS o3 \gset
SELECT public.premium_authorize(:'ud', 'smart_inbox_extract', :'hh_a', 'k-free-0004') AS d4 \gset
SELECT CASE WHEN (:'d2'::jsonb ->> 'via') = 'free_allowance' AND :'o3' = 'allowed' AND (:'d4'::jsonb ->> 'reason') = 'quota_exhausted' AND (:'d4'::jsonb ->> 'nextAction') = 'open_paywall' THEN 'PASS' ELSE 'FAIL' END || ' | an APPROVED free allowance works, is bounded, and its exhaustion points to the paywall';
ROLLBACK;

BEGIN;
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'short') ->> 'reason' AS r1 \gset
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-units-0001', NULL, NULL, 99) ->> 'reason' AS r2 \gset
SELECT CASE WHEN :'r1' = 'invalid_request' AND :'r2' = 'invalid_request' THEN 'PASS' ELSE 'FAIL' END || ' | a malformed idempotency key or an oversized unit count is invalid_request';
ROLLBACK;

-- ============ AUDIT: METADATA ONLY =================================================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'free');
SELECT public.premium_authorize(:'ua', 'daily_load_premium', :'hh_a', 'k-audit-0001', 'req-audit-1');
SELECT CASE WHEN (SELECT count(*) FROM public.premium_authorization_audit WHERE account_id = :'ua' AND request_id = 'req-audit-1' AND outcome = 'denied' AND reason = 'requires_premium') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | every decision (including a denial) is audited with its reason code';
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.premium_authorization_audit a, jsonb_array_elements(a.checks) c
                              WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('lifecycle', 'ownership', 'feature_enabled', 'app_version', 'ready', 'entitlement', 'via', 'ai_consent', 'quota', 'budget', 'rate', 'idempotent_replay', 'feature_exists')))
            THEN 'PASS' ELSE 'FAIL' END || ' | audit checks carry only the fixed check names (no household content can enter the audit)';
ROLLBACK;

-- ============ PRIVILEGES: SERVICE-ONLY SURFACE =====================================================================================
SELECT CASE WHEN bool_and(NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
                      AND NOT has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'))
            THEN 'PASS' ELSE 'FAIL' END || ' | no client role holds ANY privilege on any Premium table'
FROM unnest(ARRAY['premium_runtime_config', 'premium_feature_config', 'premium_entitlements', 'premium_events', 'premium_subscriber_identities',
                  'premium_reconcile_state', 'premium_usage', 'premium_usage_events', 'premium_usage_global', 'premium_authorization_audit']) AS t;
-- Eleven Premium tables once the decision ledger (A4) is in the chain: the ten above plus premium_decisions (owner-readable receipts; its
-- client privileges are pinned in suite 83). The count is exact on purpose: an unprotected twelfth table must fail here.
SELECT CASE WHEN count(*) = 11 AND count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) = 11 THEN 'PASS' ELSE 'FAIL' END
       || ' | there are exactly eleven Premium tables and RLS is enabled AND forced on every one (ten foundation + the decision ledger)'
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'premium\_%' AND relkind = 'r';
SELECT CASE WHEN bool_and(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
            THEN 'PASS' ELSE 'FAIL' END || ' | no client role can execute a service-only Premium function (incl. premium_authorize)'
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'premium\_%'
  AND p.proname NOT IN ('premium_my_entitlement', 'premium_feature_manifest', 'premium_decision_record', 'premium_decision_transition');
-- The client-callable Premium surface is EXACTLY these four (the two entitlement reads here, the two ledger state-machine functions in suite 83).
SELECT CASE WHEN (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'premium\_%'
                    AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                 = ARRAY['premium_decision_record', 'premium_decision_transition', 'premium_feature_manifest', 'premium_my_entitlement']
            THEN 'PASS' ELSE 'FAIL' END || ' | the client-callable Premium functions are exactly the two entitlement reads and the two ledger functions';
SELECT CASE WHEN has_function_privilege('authenticated', 'public.premium_my_entitlement()', 'EXECUTE')
              AND NOT has_function_privilege('anon', 'public.premium_my_entitlement()', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END || ' | only authenticated can read its own entitlement state';
SELECT CASE WHEN herkeys_test.error_of($q$SET LOCAL ROLE authenticated; SELECT public.premium_authorize('11111111-1111-4111-8111-111111111111', 'daily_load_premium', NULL, 'k-direct-0001')$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | an authenticated client calling premium_authorize directly is refused (permission denied)';
RESET ROLE;
SELECT CASE WHEN herkeys_test.error_of($q$SET LOCAL ROLE authenticated; INSERT INTO public.premium_entitlements (account_id, source, environment, has_entitlement) VALUES ('44444444-4444-4444-8444-444444444444', 'webhook', 'PRODUCTION', true)$q$) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | a client cannot write its own entitlement (forged Premium)';
RESET ROLE;

-- ============ CLIENT READ: OWN STATE ONLY, DERIVED ONLY ============================================================================
BEGIN;
SELECT herkeys_test.premium_grant(:'ua', 'canceled_active');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT public.premium_my_entitlement() AS mine \gset
SELECT CASE WHEN (:'mine'::jsonb ->> 'state') = 'premium_canceled_active' AND (:'mine'::jsonb ->> 'canceled') = 'true' THEN 'PASS' ELSE 'FAIL' END || ' | premium_my_entitlement reports the caller''s own derived state';
SELECT CASE WHEN NOT (:'mine'::jsonb ? 'account_id') AND NOT (:'mine'::jsonb ? 'productId') AND NOT (:'mine'::jsonb ? 'environment') THEN 'PASS' ELSE 'FAIL' END || ' | it exposes no account id, product or environment';
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT public.premium_my_entitlement() ->> 'state' AS other \gset
SELECT CASE WHEN :'other' = 'unknown' THEN 'PASS' ELSE 'FAIL' END || ' | another account sees ITS OWN state, never the first account''s Premium';
RESET ROLE;
ROLLBACK;
SELECT public.premium_feature_manifest() AS man \gset
SELECT CASE WHEN jsonb_array_length(:'man'::jsonb) = 6 AND NOT (:'man'::jsonb -> 0 ? 'premiumLimit') AND NOT (:'man'::jsonb -> 0 ? 'costWeight') THEN 'PASS' ELSE 'FAIL' END || ' | the client manifest is the display subset (no limits, no cost weights, no allowance numbers)';

-- ============ ENTITLEMENT GATES COMPUTATION, NEVER STORED DATA =====================================================================
SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename NOT LIKE 'premium\_%'
      AND (coalesce(qual, '') ILIKE '%premium%' OR coalesce(with_check, '') ILIKE '%premium%' OR coalesce(qual, '') ILIKE '%entitlement%' OR coalesce(with_check, '') ILIKE '%entitlement%'))
            THEN 'PASS' ELSE 'FAIL' END || ' | NO customer-data RLS policy references Premium or entitlement (stored data never depends on a subscription)';
SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname NOT LIKE 'premium\_%'
      AND pg_get_functiondef(p.oid) ILIKE '%premium\_entitlements%')
            THEN 'PASS' ELSE 'FAIL' END || ' | no pre-existing function (sync_pull, sync_push, claim...) reads the entitlement projection';
