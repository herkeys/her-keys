BEGIN;
DO $repair$
DECLARE definition text;original text:='DELETE FROM public.account_deletion_requests WHERE id=p_request;';
BEGIN
 SELECT pg_get_functiondef('private.finalize_deletion_proof(uuid)'::regprocedure) INTO definition;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'terminal_history_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,$new$
 -- A later purge also erases cancelled/restored requests for this same account.
 -- They are not retained as identifying historical loopholes around terminal policy.
 DELETE FROM public.account_deletion_outbox WHERE request_id IN(SELECT id FROM public.account_deletion_requests WHERE account_id=r.account_id AND status='restored');
 DELETE FROM public.account_deletion_cases WHERE request_id IN(SELECT id FROM public.account_deletion_requests WHERE account_id=r.account_id AND status='restored');
 DELETE FROM public.account_deletion_receipts WHERE request_id IN(SELECT id FROM public.account_deletion_requests WHERE account_id=r.account_id AND status='restored');
 DELETE FROM public.account_deletion_requests WHERE account_id=r.account_id AND status='restored';
 DELETE FROM public.account_deletion_requests WHERE id=p_request;
 $new$);
END $repair$;
COMMIT;
