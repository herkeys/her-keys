-- Apply only to the explicitly approved project. This installs a DISABLED job.
-- Staging and Production activation are separate from installation.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE FUNCTION private.invoke_deletion_worker(p_function text DEFAULT 'process-account-deletions') RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ts text:=floor(extract(epoch FROM clock_timestamp()))::bigint::text; signature text; target text;
BEGIN
 IF p_function NOT IN ('process-account-deletions','monitor-account-deletions','expire-account-deletion-proofs') THEN RAISE EXCEPTION 'invalid_internal_endpoint'; END IF;
 SELECT project_url INTO target FROM private.deletion_scheduler_target WHERE singleton;
 IF target IS NULL THEN RAISE EXCEPTION 'scheduler_target_unconfigured'; END IF;
 SELECT encode(extensions.hmac(convert_to('herkeys-deletion:'||ts,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex')
 INTO signature FROM private.deletion_worker_key WHERE singleton;
 RETURN net.http_post(url:=target||'/functions/v1/'||p_function,
  headers:=jsonb_build_object('Content-Type','application/json','x-deletion-timestamp',ts,'x-deletion-signature',signature),
  body:='{}'::jsonb,timeout_milliseconds:=120000);
END $fn$;
REVOKE ALL ON FUNCTION private.invoke_deletion_worker(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.deletion_scheduler_target(singleton boolean PRIMARY KEY CHECK(singleton),
 project_url text NOT NULL CHECK(project_url IN ('https://fhhudicklmpofuzkxeqe.supabase.co','https://npykvnxnehlsdlbumzwk.supabase.co')));
REVOKE ALL ON private.deletion_scheduler_target FROM PUBLIC,anon,authenticated,service_role;
-- Insert exactly ONE independently verified environment URL before activation.
SELECT cron.schedule('herkeys-account-deletion','*/5 * * * *','SELECT private.invoke_deletion_worker();');
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'),active:=false);
SELECT cron.schedule('herkeys-account-deletion-monitor','2-59/5 * * * *',$$SELECT private.invoke_deletion_worker('monitor-account-deletions');$$);
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion-monitor'),active:=false);
SELECT cron.schedule('herkeys-account-deletion-proof-expiry','17 3 * * *',$$SELECT private.invoke_deletion_worker('expire-account-deletion-proofs');$$);
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion-proof-expiry'),active:=false);
-- Emergency controls:
-- UPDATE public.account_deletion_control SET enabled=false WHERE singleton;
-- SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'),active:=false);
-- In-flight operations stop at the next fenced resource boundary; bounded HTTP requests may complete.
