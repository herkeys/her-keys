-- Premium Stage 1 — HARNESS-ONLY fixtures. Never a migration.
--
-- `herkeys_test.premium_grant` is the ONLY way a fabricated entitlement can exist, and only here: it writes source = 'test_fixture'
-- (SANDBOX only, by CHECK), and the projection honours such a row only while premium_runtime_config.allow_test_fixtures is true, which
-- a CHECK makes impossible in a production-configured database. It is not shipped, not callable by any client role, and has no
-- production counterpart.

\set user_a '11111111-1111-4111-8111-111111111111'
\set user_b '22222222-2222-4222-8222-222222222222'
\set user_c '33333333-3333-4333-8333-333333333333'

INSERT INTO auth.users (id, email) VALUES
  ('44444444-4444-4444-8444-444444444444', 'd@local.test'),
  ('55555555-5555-4555-8555-555555555555', 'e@local.test'),
  ('66666666-6666-4666-8666-666666666666', 'f@local.test')
ON CONFLICT (id) DO NOTHING;

-- A test database stands in for a staging-like environment: fixtures allowed, the three Stage 1 premium features released.
UPDATE public.premium_runtime_config SET environment = 'local', allow_test_fixtures = true;
UPDATE public.premium_feature_config SET enabled = true, released = true, rollout_status = 'staging_only'
 WHERE feature_key IN ('daily_load_premium', 'smart_inbox_extract', 'momentum_report');

CREATE OR REPLACE FUNCTION herkeys_test.premium_grant(p_account uuid, p_kind text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_expires timestamptz; v_grace timestamptz; v_canceled timestamptz; v_revoked timestamptz; v_confirmed timestamptz; v_has boolean := true;
BEGIN
  CASE p_kind
    WHEN 'active'          THEN v_expires := now() + interval '30 days';
    WHEN 'canceled_active' THEN v_expires := now() + interval '10 days'; v_canceled := now() - interval '1 day';
    WHEN 'grace'           THEN v_expires := now() - interval '1 day';   v_grace := now() + interval '3 days';
    WHEN 'expired'         THEN v_expires := now() - interval '2 days';  v_confirmed := now() - interval '1 day';
    WHEN 'expired_unconfirmed' THEN v_expires := now() - interval '2 days';
    WHEN 'revoked'         THEN v_expires := now() + interval '20 days'; v_revoked := now() - interval '1 day';
    WHEN 'free'            THEN v_has := false;
    ELSE RAISE EXCEPTION 'unknown premium_grant kind %', p_kind;
  END CASE;
  INSERT INTO public.premium_entitlements (account_id, source, environment, product_id, store, has_entitlement, expires_at,
      grace_expires_at, canceled_at, revoked_at, expiration_confirmed_at, last_reconciled_at)
    VALUES (p_account, 'test_fixture', 'SANDBOX', 'fixture_monthly', 'TEST_STORE', v_has, v_expires, v_grace, v_canceled, v_revoked, v_confirmed, now())
  ON CONFLICT (account_id) DO UPDATE SET source = 'test_fixture', environment = 'SANDBOX', has_entitlement = EXCLUDED.has_entitlement,
      expires_at = EXCLUDED.expires_at, grace_expires_at = EXCLUDED.grace_expires_at, canceled_at = EXCLUDED.canceled_at,
      revoked_at = EXCLUDED.revoked_at, expiration_confirmed_at = EXCLUDED.expiration_confirmed_at,
      last_reconciled_at = now(), version = public.premium_entitlements.version + 1;
END
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.premium_grant(uuid, text) TO service_role;
