BEGIN;
-- Disabling destructive processing must not hide an overdue deletion backlog.
-- Allow one day after the recovery cutoff for ordinary worker/retry latency.
DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$'failed',(SELECT count(*)$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'overdue_monitor_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,$new$'overdue_requests',(SELECT count(*) FROM public.account_deletion_requests WHERE status NOT IN ('restored','purged') AND grace_period_ends_at<v_now-interval '1 day'),
   'failed',(SELECT count(*)$new$);
END $repair$;
COMMIT;
