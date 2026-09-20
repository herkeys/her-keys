-- Harness-only helpers. Deliberately NOT part of the auth stub: the
-- fingerprint database loads only the auth stub, so no test artifact can
-- appear in the captured schema.

-- Test-only helper: run a statement and report whether it was refused.
-- SECURITY INVOKER, so it carries whatever role and JWT claims the caller has
-- set — which is how a denial test impersonates anon or authenticated.
--
-- It lives in its own schema, NOT in public: the Build 4 migration revokes all
-- function privileges in public from anon and authenticated, which would strip
-- the harness itself. That revoke is correct, so the harness moves out of range.
CREATE SCHEMA IF NOT EXISTS herkeys_test;
GRANT USAGE ON SCHEMA herkeys_test TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION herkeys_test.test_denied(p_sql text)
  RETURNS boolean
  LANGUAGE plpgsql
AS $fn$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION herkeys_test.test_denied(text) TO anon, authenticated, service_role;
