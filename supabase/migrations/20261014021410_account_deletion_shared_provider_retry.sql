BEGIN;
ALTER TABLE public.account_deletion_requests DROP CONSTRAINT account_deletion_requests_status_check;
ALTER TABLE public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_status_check
 CHECK(status IN('deactivated','restoring','restored','processing','retry_pending','partial_purge_pending_review','failed_requires_action','purged'));
DROP INDEX public.deletion_worker_due;
CREATE INDEX deletion_worker_due ON public.account_deletion_requests(grace_period_ends_at,retry_at)
 WHERE status IN('deactivated','processing','retry_pending','partial_purge_pending_review');
DO $repair$
DECLARE definition text;original text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 definition:=replace(definition,$old$status IN ('processing','retry_pending') AND attempts>=$old$,$new$status IN ('processing','retry_pending','partial_purge_pending_review') AND attempts>=$new$);
 definition:=replace(definition,$old$status IN ('deactivated','retry_pending')$old$,$new$status IN ('deactivated','retry_pending','partial_purge_pending_review')$new$);
 original:=$old$THEN 'failed_requires_action' ELSE 'retry_pending' END,$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'shared_retry_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$THEN 'failed_requires_action' WHEN p_args->>'category'='shared_resources_pending_review' THEN 'partial_purge_pending_review' ELSE 'retry_pending' END,$new$);
 definition:=replace(definition,$old$WHEN r.status='failed_requires_action' THEN 'failed'$old$,$new$WHEN r.status IN('failed_requires_action','partial_purge_pending_review') THEN 'failed'$new$);
 definition:=replace(definition,$old$WHERE status='failed_requires_action')$old$,$new$WHERE status IN('failed_requires_action','partial_purge_pending_review'))$new$);
 definition:=replace(definition,$old$AND status='failed_requires_action';$old$,$new$AND status IN('failed_requires_action','partial_purge_pending_review');$new$);
 EXECUTE definition;
END $repair$;
COMMIT;
