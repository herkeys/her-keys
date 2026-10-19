BEGIN;
-- The welcome-email ledger ships only in Production. Staging absence is a
-- reviewed deployment variant, not permission to skip any other resource.
ALTER TABLE private.deletion_resource_registry ADD COLUMN optional_when_absent boolean NOT NULL DEFAULT false;
UPDATE private.deletion_resource_registry SET optional_when_absent=true WHERE table_name='herkeys_welcome_email_receipts';
DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT replace(pg_get_functiondef('private.deletion_verify_resources(uuid,uuid)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$IF to_regclass('public.'||resource.table_name) IS NULL THEN
   RAISE EXCEPTION 'terminal_verification_failed:missing_resource:%',resource.table_name;
  END IF;$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'optional_inventory_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,$new$IF to_regclass('public.'||resource.table_name) IS NULL THEN
   IF NOT resource.optional_when_absent THEN RAISE EXCEPTION 'terminal_verification_failed:missing_resource:%',resource.table_name; END IF;
   UPDATE public.account_deletion_requests SET evidence=evidence||jsonb_build_object(resource.table_name,jsonb_build_object('remaining',0,'schema_state','not_deployed')) WHERE id=p_request;
   CONTINUE;
  END IF;$new$);
END $repair$;
COMMIT;
