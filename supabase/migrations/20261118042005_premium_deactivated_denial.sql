-- Return the existing authorization denial without attempting an audit
-- insert that the pending-deletion write guard is required to reject.
-- Keep each environment's authorization implementation and grants.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'public.premium_authorize(uuid,text,uuid,text,text,text,integer,boolean)'::regprocedure
  );
  original constant text := E'IF p_account IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = p_account) THEN\n    INSERT INTO public.premium_authorization_audit';
  replacement constant text := E'IF p_account IS NOT NULL AND private.account_is_active(p_account)\n     AND EXISTS (SELECT 1 FROM auth.users WHERE id = p_account) THEN\n    INSERT INTO public.premium_authorization_audit';
BEGIN
  IF length(definition) - length(replace(definition, original, '')) <> length(original) THEN
    RAISE EXCEPTION 'Expected exactly one authorization audit insert guard';
  END IF;

  EXECUTE replace(definition, original, replacement);
END;
$migration$;

SELECT private.assert_app_schema_secured();

COMMIT;
