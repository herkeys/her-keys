BEGIN;
-- Deleted Auth identities must never become active merely because terminal
-- ledger rows have erased their account UUID.
CREATE OR REPLACE FUNCTION private.account_is_active(p_account uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT p_account IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_account)
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE account_id=p_account AND status<>'restored')
$fn$;
CREATE OR REPLACE FUNCTION public.account_access_status() RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT CASE WHEN auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN 'unauthorized'
  WHEN private.account_is_active(auth.uid()) THEN 'active' ELSE 'pending' END
$fn$;
ALTER TABLE public.account_deletion_requests ADD COLUMN account_fingerprint text;
UPDATE public.account_deletion_requests SET account_fingerprint=encode(sha256(convert_to('herkeys-deletion:'||account_id::text,'UTF8')),'hex') WHERE account_id IS NOT NULL;
CREATE FUNCTION private.deletion_bind_fingerprint() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.account_fingerprint:=encode(sha256(convert_to('herkeys-deletion:'||NEW.account_id::text,'UTF8')),'hex');
 ELSIF NEW.account_id IS DISTINCT FROM OLD.account_id AND NEW.account_id IS NOT NULL THEN
  RAISE EXCEPTION 'deletion_identity_is_immutable';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.deletion_bind_fingerprint() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER deletion_bind_fingerprint BEFORE INSERT OR UPDATE OF account_id ON public.account_deletion_requests
 FOR EACH ROW EXECUTE FUNCTION private.deletion_bind_fingerprint();
DO $repair$
DECLARE definition text;original text:=$old$'deadline',r.grace_period_ends_at,'purged_at',r.purged_at,'verified_at',r.verified_at$old$;
BEGIN
 SELECT pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure) INTO definition;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'receipt_status_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,original||$new$,'account_fingerprint',r.account_fingerprint$new$);
END $repair$;
COMMIT;
