-- For an environment with the original disabled scheduler already installed.
-- Installation is disabled; activation remains a separate environment action.
BEGIN;
DO $upgrade$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('private.invoke_deletion_worker(text)'::regprocedure) INTO definition;
 IF position('expire-account-deletion-proofs' IN definition)=0 THEN
  IF position('''process-account-deletions'',''monitor-account-deletions''' IN definition)=0 THEN RAISE EXCEPTION 'scheduler_contract_mismatch'; END IF;
  EXECUTE replace(definition,'''process-account-deletions'',''monitor-account-deletions''','''process-account-deletions'',''monitor-account-deletions'',''expire-account-deletion-proofs''');
 END IF;
END $upgrade$;
SELECT cron.schedule('herkeys-account-deletion-proof-expiry','17 3 * * *',$$SELECT private.invoke_deletion_worker('expire-account-deletion-proofs');$$);
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion-proof-expiry'),active:=false);
COMMIT;
