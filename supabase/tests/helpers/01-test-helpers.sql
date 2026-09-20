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

-- Run a statement and return WHY it was refused: the error text (SQLSTATE first), or NULL when it
-- succeeded. The foundation suites assert on the reason, not merely on the refusal, so a statement that
-- fails for the wrong reason cannot pass as a test of the right one.
CREATE OR REPLACE FUNCTION herkeys_test.error_of(p_sql text)
  RETURNS text
  LANGUAGE plpgsql
AS $fn$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$fn$;

GRANT EXECUTE ON FUNCTION herkeys_test.error_of(text) TO anon, authenticated, service_role;

-- Insert one row from a JSON description and return WHY it was refused (NULL when it went in).
--
-- Only keys that name real columns are used, and the three stamps every foundation row states
-- (producer, origin_created_at, origin_updated_at) default to a plausible "she did this now" so a
-- test names only what it is actually testing. SECURITY INVOKER: it runs as whatever role and claims
-- the caller has set, so the same call proves a privilege boundary, an RLS boundary and a constraint.
CREATE OR REPLACE FUNCTION herkeys_test.ins(p_table text, p_row jsonb)
  RETURNS text
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_row  jsonb := jsonb_build_object('producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now()) || p_row;
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(k), ', ' ORDER BY k) INTO v_cols
  FROM jsonb_object_keys(v_row) AS k
  WHERE EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = ('public.' || quote_ident(p_table))::regclass
                  AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped);
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r',
                 p_table, v_cols,
                 (SELECT string_agg('r.' || quote_ident(k), ', ' ORDER BY k)
                    FROM jsonb_object_keys(v_row) AS k
                   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                                 WHERE a.attrelid = ('public.' || quote_ident(p_table))::regclass
                                   AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped)),
                 p_table)
    USING v_row;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$fn$;

GRANT EXECUTE ON FUNCTION herkeys_test.ins(text, jsonb) TO anon, authenticated, service_role;
