-- Her Keys AI response safety reporting: metadata-only, private, account-bound.
-- Never persist user prompts, response text, conversation history or provider credentials.
-- This migration is additive and leaves checkout, account deletion and feature flags unchanged.
CREATE TABLE IF NOT EXISTS private.ai_response_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface = 'talk_it_out'),
  message_id text NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (reason IN ('unsafe','offensive','inaccurate','privacy','other')),
  client_dedupe_key uuid NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewing','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(account_id, client_dedupe_key)
);
CREATE INDEX IF NOT EXISTS ai_response_reports_review_idx ON private.ai_response_reports (review_status, created_at);
CREATE INDEX IF NOT EXISTS ai_response_reports_expiry_idx ON private.ai_response_reports (expires_at);
ALTER TABLE private.ai_response_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_response_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.ai_response_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.ai_response_reports TO service_role;

-- Exposed RPC owns the only consumer mutation. Identity is always auth.uid().
-- Per-account transactional lock prevents concurrent requests exceeding the 5/day cap.
CREATE OR REPLACE FUNCTION public.submit_ai_response_report(
  p_surface text,
  p_message_id text,
  p_reason text,
  p_dedupe_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_new uuid;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actor) THEN
    RAISE EXCEPTION 'account_unavailable' USING ERRCODE = '28000';
  END IF;
  IF p_surface IS DISTINCT FROM 'talk_it_out'
      OR p_message_id IS NULL OR char_length(p_message_id) NOT BETWEEN 1 AND 100
      OR p_reason IS NULL OR p_reason NOT IN ('unsafe','offensive','inaccurate','privacy','other')
      OR p_dedupe_key IS NULL THEN
    RAISE EXCEPTION 'invalid_report' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text, 4811));

  SELECT id INTO v_existing FROM private.ai_response_reports
    WHERE account_id = v_actor AND client_dedupe_key = p_dedupe_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status','received','receiptId',v_existing);
  END IF;
  IF (SELECT count(*) FROM private.ai_response_reports
      WHERE account_id = v_actor AND created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO private.ai_response_reports(account_id,surface,message_id,reason,client_dedupe_key)
    VALUES (v_actor,p_surface,p_message_id,p_reason,p_dedupe_key)
    RETURNING id INTO v_new;
  RETURN jsonb_build_object('status','received','receiptId',v_new);
END
$$;
REVOKE ALL ON FUNCTION public.submit_ai_response_report(text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ai_response_report(text,text,text,uuid) TO authenticated;

-- Retain only 30 days. This job handles expiration without exposing raw reports to app clients.
DO $
DECLARE v_job_exists boolean;
BEGIN
  -- Hosted Supabase includes pg_cron; disposable PGlite harnesses do not.
  -- Compile/execute cron statements only when the extension relation exists.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = $1)'
      INTO v_job_exists USING 'herkeys_ai_report_expiry';
    IF NOT v_job_exists THEN
      EXECUTE 'SELECT cron.schedule($1,$2,$3)'
        USING 'herkeys_ai_report_expiry','19 3 * * *',
          'DELETE FROM private.ai_response_reports WHERE expires_at < now()';
    END IF;
  END IF;
END
$;
