BEGIN;

-- Review history shares the existing report's expiry and cascade. No content,
-- account-deletion processor, consumer table grant or checkout state changes.
ALTER TABLE private.ai_response_reports
  ADD COLUMN review_history jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(review_history) = 'array' AND jsonb_array_length(review_history) <= 2);

-- Assignment is a protected Auth Admin app_metadata operation, never a claim
-- accepted from user_metadata or supplied in an RPC request. Re-read the
-- server-owned value on EVERY operation so revocation does not await JWT expiry.
CREATE FUNCTION private.require_ai_report_reviewer() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog'
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS u WHERE u.id = v_actor
      AND u.raw_app_meta_data -> 'herkeys_ai_report_reviewer' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'reviewer_required' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END
$$;
REVOKE ALL ON FUNCTION private.require_ai_report_reviewer() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.list_ai_response_reports(
  p_status text DEFAULT 'pending', p_limit integer DEFAULT 50,
  p_after_created_at timestamptz DEFAULT NULL, p_after_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog'
AS $$
DECLARE v_reports jsonb;
BEGIN
  PERFORM private.require_ai_report_reviewer();
  IF p_status IS NULL OR p_status NOT IN ('pending','reviewing','resolved')
      OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
      OR (p_after_created_at IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_review_request' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'receiptId', r.id, 'surface', r.surface, 'messageId', r.message_id,
    'reason', r.reason, 'reviewStatus', r.review_status,
    'createdAt', r.created_at, 'expiresAt', r.expires_at,
    'ageSeconds', greatest(0, floor(extract(epoch FROM (now() - r.created_at)))),
    'history', r.review_history
  ) ORDER BY r.created_at, r.id), '[]'::jsonb) INTO v_reports
  FROM (
    SELECT id, surface, message_id, reason, review_status, created_at, expires_at, review_history
    FROM private.ai_response_reports
    WHERE review_status = p_status AND expires_at > now()
      AND (p_after_created_at IS NULL OR (created_at, id) > (p_after_created_at, p_after_id))
    ORDER BY created_at, id LIMIT p_limit
  ) AS r;
  RETURN v_reports;
END
$$;
REVOKE ALL ON FUNCTION public.list_ai_response_reports(text,integer,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ai_response_reports(text,integer,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.review_ai_response_report(p_report_id uuid, p_expected_status text, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog'
AS $$
DECLARE
  v_actor uuid := private.require_ai_report_reviewer();
  v_report private.ai_response_reports%ROWTYPE;
BEGIN
  IF p_report_id IS NULL OR p_expected_status IS NULL OR p_expected_status NOT IN ('pending','reviewing','resolved')
      OR p_status IS NULL OR p_status NOT IN ('reviewing','resolved') THEN
    RAISE EXCEPTION 'invalid_review_request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_report FROM private.ai_response_reports
    WHERE id = p_report_id AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_unavailable' USING ERRCODE = 'P0002';
  END IF;
  -- Network retries neither duplicate the audit trail nor repeat the mutation.
  IF v_report.review_status = p_status THEN
    RETURN jsonb_build_object('receiptId', p_report_id, 'reviewStatus', p_status, 'replayed', true);
  END IF;
  IF v_report.review_status <> p_expected_status THEN
    RAISE EXCEPTION 'review_conflict' USING ERRCODE = '40001';
  END IF;
  IF v_report.review_status = 'resolved' OR (v_report.review_status = 'reviewing' AND p_status <> 'resolved') THEN
    RAISE EXCEPTION 'invalid_review_request' USING ERRCODE = '22023';
  END IF;
  UPDATE private.ai_response_reports SET
    review_status = p_status,
    review_history = review_history || jsonb_build_array(jsonb_build_object(
      'reviewerId', v_actor, 'from', v_report.review_status, 'to', p_status, 'at', now()
    ))
    WHERE id = p_report_id;
  RETURN jsonb_build_object('receiptId', p_report_id, 'reviewStatus', p_status, 'replayed', false);
END
$$;
REVOKE ALL ON FUNCTION public.review_ai_response_report(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_ai_response_report(uuid,text,text) TO authenticated;

COMMIT;
