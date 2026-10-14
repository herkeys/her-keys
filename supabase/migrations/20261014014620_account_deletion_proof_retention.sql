BEGIN;
CREATE TABLE public.account_deletion_terminal_proofs (
 receipt_hash text PRIMARY KEY CHECK(length(receipt_hash)=43),
 purged_at timestamptz NOT NULL,verified_at timestamptz NOT NULL,
 resource_counts jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(expires_at=verified_at+interval '365 days')
);
CREATE INDEX deletion_terminal_expiry ON public.account_deletion_terminal_proofs(expires_at);
CREATE TABLE public.account_deletion_retention_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,
 last_success_at timestamptz,last_failure_at timestamptz,failure_category text
);
INSERT INTO public.account_deletion_retention_control(singleton) VALUES(true);
CREATE TABLE public.account_deletion_retention_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 proofs_deleted int NOT NULL,outbox_deleted int NOT NULL,remaining_expired int NOT NULL
);
ALTER TABLE public.account_deletion_terminal_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_retention_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_terminal_proofs,public.account_deletion_retention_control,public.account_deletion_retention_runs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.account_deletion_terminal_proofs,public.account_deletion_retention_control,public.account_deletion_retention_runs TO service_role;

-- Completion delivery is a separate encrypted operational outbox, never terminal proof.
-- Its recipient and provider delivery metadata expire within seven days.
ALTER TABLE public.account_deletion_outbox ALTER COLUMN request_id DROP NOT NULL;
CREATE FUNCTION private.finalize_deletion_proof(p_request uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.account_deletion_requests;at_time timestamptz;counts jsonb;
BEGIN
 SELECT * INTO r FROM public.account_deletion_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
 at_time:=coalesce(r.verified_at,clock_timestamp());
 counts:=jsonb_build_object('verified_resource_groups',
  (SELECT count(*) FROM jsonb_each(r.evidence) e WHERE e.value->>'remaining'='0'),
  'remaining_owned_records',0,'remaining_owned_blobs',0,'remaining_auth_identities',0);
 INSERT INTO public.account_deletion_terminal_proofs(receipt_hash,purged_at,verified_at,resource_counts,expires_at)
  SELECT receipt_hash,coalesce(r.purged_at,at_time),at_time,counts,at_time+interval '365 days'
  FROM public.account_deletion_receipts WHERE request_id=p_request;
 DELETE FROM public.account_deletion_outbox WHERE request_id=p_request AND kind<>'completed';
 UPDATE public.account_deletion_outbox SET request_id=NULL,expires_at=least(expires_at,at_time+interval '7 days')
  WHERE request_id=p_request AND kind='completed';
 DELETE FROM public.account_deletion_cases WHERE request_id=p_request;
 DELETE FROM public.account_deletion_receipts WHERE request_id=p_request;
 DELETE FROM public.account_deletion_requests WHERE id=p_request;
END $fn$;
REVOKE ALL ON FUNCTION private.finalize_deletion_proof(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.refuse_terminal_receipt_reuse() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.account_deletion_terminal_proofs WHERE receipt_hash=NEW.receipt_hash) THEN RAISE EXCEPTION 'receipt_reuse_forbidden'; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.refuse_terminal_receipt_reuse() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER refuse_terminal_receipt_reuse BEFORE INSERT ON public.account_deletion_receipts
 FOR EACH ROW EXECUTE FUNCTION private.refuse_terminal_receipt_reuse();

DO $contract$
DECLARE definition text;original text;replacement text;r record;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$IF NOT FOUND THEN RETURN jsonb_build_object('status','unknown'); END IF;$old$;
 replacement:=$new$IF NOT FOUND THEN
   RETURN coalesce((SELECT jsonb_build_object('status','purged','purged_at',purged_at,'verified_at',verified_at,'resource_counts',resource_counts,'expires_at',expires_at)
    FROM public.account_deletion_terminal_proofs WHERE receipt_hash=p_args->>'receipt_hash' AND expires_at>v_now),jsonb_build_object('status','unknown'));
  END IF;$new$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'status_contract_mismatch'; END IF;
 definition:=replace(definition,original,replacement);
 original:=$old$UPDATE public.account_deletion_requests SET status='purged',purged_at=v_now,verified_at=v_now,account_id=NULL,
   recovery_hash=NULL,lease_until=NULL,failure_category=NULL WHERE id=v_id;$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'finish_contract_mismatch'; END IF;
 definition:=replace(definition,original,'PERFORM private.finalize_deletion_proof(v_id);');
 definition:=replace(definition,'IF NOT FOUND OR r.status<>''processing''','IF r.id IS NULL OR r.status<>''processing''');
 -- A single claim avoids leasing later requests before an earlier network operation finishes.
 definition:=replace(definition,'LIMIT c.batch_size','LIMIT least(c.batch_size,1)');
 definition:=replace(definition,$old$(kind<>'completed' OR EXISTS$old$,$new$(kind<>'completed' OR request_id IS NULL OR EXISTS$new$);
 definition:=replace(definition,$old$'deadline',d.grace_period_ends_at$old$,$new$'deadline',coalesce(d.grace_period_ends_at,claimed.created_at)$new$);
 definition:=replace(definition,'FROM claimed JOIN public.account_deletion_requests d','FROM claimed LEFT JOIN public.account_deletion_requests d');
 -- Retention failures are monitored independently from the destructive worker switch.
 definition:=replace(definition,$old$'failed',(SELECT count(*)$old$,$new$'retention_stale',(SELECT enabled AND (last_success_at IS NULL OR last_success_at<v_now-interval '26 hours') FROM public.account_deletion_retention_control WHERE singleton),
   'retention_failed',(SELECT last_failure_at IS NOT NULL AND (last_success_at IS NULL OR last_failure_at>last_success_at) FROM public.account_deletion_retention_control WHERE singleton),
   'retention_overdue',(SELECT count(*) FROM public.account_deletion_terminal_proofs WHERE expires_at<v_now-interval '26 hours'),
   'failed',(SELECT count(*)$new$);
 EXECUTE definition;
 -- Upgrade already verified terminal records, discarding their identity-bearing history.
 FOR r IN SELECT id FROM public.account_deletion_requests WHERE status='purged' LOOP
  PERFORM private.finalize_deletion_proof(r.id);
 END LOOP;
END $contract$;
UPDATE public.account_deletion_control SET batch_size=1;

CREATE FUNCTION public.herkeys_expire_deletion_proofs() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE n int;m int;remaining int;run_id uuid;at_time timestamptz:=clock_timestamp();
BEGIN
 WITH due AS (SELECT receipt_hash FROM public.account_deletion_terminal_proofs WHERE expires_at<=at_time ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 10000)
 DELETE FROM public.account_deletion_terminal_proofs p USING due WHERE p.receipt_hash=due.receipt_hash;
 GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM public.account_deletion_outbox WHERE request_id IS NULL AND expires_at<=at_time;
 GET DIAGNOSTICS m=ROW_COUNT;
 SELECT count(*) INTO remaining FROM public.account_deletion_terminal_proofs WHERE expires_at<=at_time;
 INSERT INTO public.account_deletion_retention_runs(proofs_deleted,outbox_deleted,remaining_expired)
  VALUES(n,m,remaining) RETURNING id INTO run_id;
 UPDATE public.account_deletion_retention_control SET last_success_at=at_time,failure_category=NULL WHERE singleton;
 RETURN jsonb_build_object('run_id',run_id,'proofs_deleted',n,'outbox_deleted',m,'remaining_expired',remaining);
END $fn$;
REVOKE ALL ON FUNCTION public.herkeys_expire_deletion_proofs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_expire_deletion_proofs() TO service_role;
COMMIT;
