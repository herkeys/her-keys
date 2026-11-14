BEGIN;
-- A replacement lives in the existing outbox until delivery is confirmed. The
-- request retains its current recovery proof and original deadline meanwhile.
ALTER TABLE public.account_deletion_outbox ADD COLUMN replacement_recovery_hash text
 CHECK (replacement_recovery_hash IS NULL OR (kind='recovery' AND request_id IS NOT NULL AND length(replacement_recovery_hash)=43));
CREATE UNIQUE INDEX deletion_one_pending_replacement ON public.account_deletion_outbox(request_id)
 WHERE replacement_recovery_hash IS NOT NULL AND status IN ('queued','sending','failed');
CREATE UNIQUE INDEX deletion_pending_recovery_hash ON public.account_deletion_outbox(replacement_recovery_hash)
 WHERE replacement_recovery_hash IS NOT NULL;

DO $migration$
DECLARE definition text; first_at integer; last_at integer; original text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 first_at:=strpos(definition,$key$ ELSIF p_action='resend' THEN$key$);
 last_at:=strpos(definition,$key$ ELSIF p_action='restored' THEN$key$);
 IF first_at=0 OR last_at<=first_at OR strpos(definition,$key$SET recovery_hash=p_args->>'recovery_hash' WHERE id=r.id$key$)=0
 THEN RAISE EXCEPTION 'recovery_rotation_contract_mismatch'; END IF;
 definition:=overlay(definition placing $replacement$ ELSIF p_action='resend' THEN
  SELECT * INTO r FROM public.account_deletion_requests WHERE account_id=(p_args->>'account_id')::uuid
   AND status='deactivated' FOR UPDATE;
  v_now:=clock_timestamp();
  IF NOT FOUND OR r.grace_period_ends_at<=v_now OR r.recovery_expires_at<=v_now THEN RETURN '{}'::jsonb; END IF;
  IF coalesce(length(p_args->>'recovery_hash'),0)<>43 THEN RAISE EXCEPTION 'invalid_proof'; END IF;
  -- Coalesce repeated requests while this replacement has a viable delivery
  -- attempt. Keep the initial message eligible as a fallback until it settles.
  UPDATE public.account_deletion_outbox SET replacement_recovery_hash=NULL, status='expired',
   payload_ciphertext=NULL,payload_iv=NULL,lease_until=NULL
   WHERE request_id=r.id AND replacement_recovery_hash IS NOT NULL
    AND (status='expired' OR (status='failed' AND (attempts>=8 OR first_attempt_at<=v_now-interval '23 hours')));
  INSERT INTO public.account_deletion_outbox(request_id,kind,payload_ciphertext,payload_iv,expires_at,replacement_recovery_hash)
   SELECT r.id,'recovery',p_args->>'ciphertext',p_args->>'iv',r.grace_period_ends_at,p_args->>'recovery_hash'
   WHERE NOT EXISTS(SELECT 1 FROM public.account_deletion_outbox WHERE request_id=r.id AND kind='recovery'
    AND status='accepted' AND created_at>v_now-interval '5 minutes' AND delivery_status NOT IN ('bounced','complained','failed','suppressed'))
   ON CONFLICT (request_id) WHERE replacement_recovery_hash IS NOT NULL AND status IN ('queued','sending','failed') DO NOTHING;
  RETURN '{}'::jsonb;
 ELSIF p_action='record_delivery' THEN
  -- Serialize provider confirmation with resend and explicit restore. A delayed
  -- result must never reactivate a superseded token or a completed request.
  SELECT d.* INTO r FROM public.account_deletion_requests d JOIN public.account_deletion_outbox o ON o.request_id=d.id
   WHERE o.id=(p_args->>'outbox_id')::uuid FOR UPDATE OF d;
  UPDATE public.account_deletion_outbox SET delivery_status=p_args->>'delivery',delivery_checked_at=clock_timestamp()
   WHERE id=(p_args->>'outbox_id')::uuid AND status='accepted' AND delivery_status='unconfirmed'
    AND p_args->>'delivery' IN ('unconfirmed','delivered','bounced','complained','failed','suppressed');
  IF FOUND AND p_args->>'delivery'<>'unconfirmed' THEN
   IF p_args->>'delivery'='delivered' AND r.status='deactivated'
    AND least(r.grace_period_ends_at,r.recovery_expires_at)>clock_timestamp() THEN
    UPDATE public.account_deletion_requests SET recovery_hash=o.replacement_recovery_hash
     FROM public.account_deletion_outbox o WHERE o.id=(p_args->>'outbox_id')::uuid
      AND o.request_id=r.id AND o.replacement_recovery_hash IS NOT NULL AND account_deletion_requests.id=r.id;
    IF FOUND THEN
     UPDATE public.account_deletion_outbox older SET replacement_recovery_hash=NULL,
      status=CASE WHEN older.status IN ('queued','failed','sending') THEN 'expired' ELSE older.status END,
      payload_ciphertext=NULL,payload_iv=NULL,lease_until=NULL
     FROM public.account_deletion_outbox delivered
     WHERE delivered.id=(p_args->>'outbox_id')::uuid AND older.request_id=r.id AND older.kind='recovery'
      AND older.created_at<delivered.created_at;
    END IF;
   END IF;
   UPDATE public.account_deletion_outbox SET replacement_recovery_hash=NULL WHERE id=(p_args->>'outbox_id')::uuid;
  END IF;
  RETURN '{}'::jsonb;
 ELSIF p_action='restore' THEN
  SELECT * INTO r FROM public.account_deletion_requests d WHERE d.recovery_hash=p_args->>'recovery_hash'
   OR d.id=(SELECT o.request_id FROM public.account_deletion_outbox o WHERE o.replacement_recovery_hash=p_args->>'recovery_hash')
   FOR UPDATE OF d;
  v_now:=clock_timestamp();
  IF NOT FOUND OR r.status<>'deactivated' OR r.grace_period_ends_at<=v_now OR r.recovery_expires_at<=v_now THEN
   RETURN jsonb_build_object('status','invalid_or_expired');
  END IF;
  -- A user may receive a replacement before the next provider poll, including
  -- after a send timeout. Possession still requires an explicit restore POST.
  IF r.recovery_hash IS DISTINCT FROM p_args->>'recovery_hash' AND NOT EXISTS(
   SELECT 1 FROM public.account_deletion_outbox o WHERE o.request_id=r.id AND o.replacement_recovery_hash=p_args->>'recovery_hash'
    AND o.status IN ('sending','accepted','failed') AND o.first_attempt_at IS NOT NULL AND o.expires_at>v_now
  ) THEN RETURN jsonb_build_object('status','invalid_or_expired'); END IF;
  UPDATE public.account_deletion_requests SET status='restoring',recovery_hash=NULL,
   evidence=evidence||jsonb_build_object('restoration_started_at',v_now) WHERE id=r.id;
  UPDATE public.account_deletion_outbox SET replacement_recovery_hash=NULL,
   status=CASE WHEN status IN ('queued','failed','sending') THEN 'expired' ELSE status END,
   payload_ciphertext=NULL,payload_iv=NULL,lease_until=NULL
   WHERE request_id=r.id AND kind='recovery';
  RETURN jsonb_build_object('status','restoring','account_id',r.account_id,'request_id',r.id);
 ELSIF p_action='claim_restoration' THEN
  UPDATE public.account_deletion_requests SET auth_reconciliation_lease_until=v_now+interval '2 minutes'
   WHERE id=(p_args->>'request_id')::uuid AND status='restoring' AND NOT auth_deactivation_pending
    AND coalesce(auth_reconciliation_lease_until,v_now)<=v_now RETURNING * INTO r;
  RETURN jsonb_build_object('claimed',FOUND,'account_id',r.account_id);
$replacement$ from first_at for last_at-first_at);
 original:=$old$'failed',(SELECT count(*)$old$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'recovery_health_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$'overdue_auth_reconciliation',(SELECT count(*) FROM public.account_deletion_requests
    WHERE (status='restoring' AND coalesce((evidence->>'restoration_started_at')::timestamptz,deactivated_at)<v_now-interval '15 minutes')
      OR (status='deactivated' AND auth_deactivation_pending AND deactivated_at<v_now-interval '15 minutes')),
   'failed',(SELECT count(*)$new$);
 original:=$old$AND NOT d.auth_deactivation_pending))$old$;
 IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'recovery_email_claim_contract_mismatch'; END IF;
 definition:=replace(definition,original,$new$AND d.status='deactivated' AND NOT d.auth_deactivation_pending))$new$);
 EXECUTE definition;
END $migration$;
COMMIT;
