BEGIN;
ALTER TABLE public.account_deletion_requests ADD COLUMN auth_reconciliation_lease_until timestamptz;
DO $repair$
DECLARE definition text; original text; replacement text;
BEGIN
 SELECT replace(pg_get_functiondef('public.herkeys_deletion_command(text,jsonb)'::regprocedure),E'\r\n',E'\n') INTO definition;
 original:=$old$ ELSIF p_action='deactivation_ack' THEN
  UPDATE public.account_deletion_requests SET auth_deactivation_pending=false,
   evidence=evidence||jsonb_build_object('auth_ban',p_args->'auth_ban','session_revocation',p_args->'session_revocation')
   WHERE id=(p_args->>'request_id')::uuid AND status IN ('deactivated','restoring');
  RETURN '{"ok":true}'::jsonb;$old$;
 replacement:=$new$ ELSIF p_action='claim_deactivation' THEN
  UPDATE public.account_deletion_requests SET auth_reconciliation_lease_until=v_now+interval '5 minutes'
   WHERE id=(p_args->>'request_id')::uuid AND status IN ('deactivated','restoring') AND auth_deactivation_pending
    AND deactivated_at<v_now-interval '5 minutes'
    AND (auth_reconciliation_lease_until IS NULL OR auth_reconciliation_lease_until<v_now)
   RETURNING * INTO r;
  RETURN jsonb_build_object('claimed',FOUND,'account_id',r.account_id);
 ELSIF p_action='deactivation_ack' THEN
  SELECT * INTO r FROM public.account_deletion_requests WHERE id=(p_args->>'request_id')::uuid FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('deactivated','restoring') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  IF p_args->>'auth_ban' IS DISTINCT FROM 'true' THEN
   RETURN '{"ok":false,"reconciliation_pending":true}'::jsonb;
  END IF;
  -- A ban can make the old JWT unusable by GoTrue's sign-out endpoint. Revoke
  -- the exact account's sessions transactionally; refresh tokens cascade from them.
  DELETE FROM auth.sessions WHERE user_id=r.account_id;
  UPDATE public.account_deletion_requests SET auth_deactivation_pending=false,auth_reconciliation_lease_until=NULL,
   evidence=evidence||'{"auth_ban":true,"session_revocation":true}'::jsonb WHERE id=r.id;
  RETURN '{"ok":true}'::jsonb;$new$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'deactivation_contract_mismatch'; END IF;
 EXECUTE replace(definition,original,replacement);
END $repair$;
COMMIT;
