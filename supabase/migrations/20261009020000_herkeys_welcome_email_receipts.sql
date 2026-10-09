-- V2 transactional welcome email delivery. APPLY TO HER KEYS PRODUCTION
-- ONLY AFTER REVIEWING THE LIVE MIGRATION LEDGER, RLS AND EMAIL SENDER.
-- Never apply to the K Scan AI projects.
-- An authenticated mobile app can request its own welcome message, but only
-- the server-side Edge Function/service role can claim or update this ledger.

CREATE TABLE IF NOT EXISTS public.herkeys_welcome_email_receipts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sending', 'retryable', 'sent')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT herkeys_welcome_email_sent_consistency
    CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);

ALTER TABLE public.herkeys_welcome_email_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.herkeys_welcome_email_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.herkeys_welcome_email_receipts TO service_role;

-- An atomic, short-lived claim: only one invocation may send at a time.
-- Stale pending sends may be retried within Resend's 24-hour idempotency
-- window. Older unresolved claims stop for human reconciliation instead of
-- risking a late duplicate.
CREATE OR REPLACE FUNCTION public.herkeys_claim_welcome_email(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  claimed uuid;
BEGIN
  INSERT INTO public.herkeys_welcome_email_receipts AS receipt
    (user_id, status, attempts, locked_at)
  VALUES (p_user_id, 'sending', 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'sending',
        attempts = receipt.attempts + 1,
        locked_at = now()
  WHERE receipt.attempts < 5
    AND (
      (receipt.status = 'retryable' AND receipt.locked_at > now() - interval '23 hours')
      OR (receipt.status = 'sending'
          AND receipt.locked_at < now() - interval '10 minutes'
          AND receipt.locked_at > now() - interval '23 hours')
    )
  RETURNING user_id INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.herkeys_claim_welcome_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.herkeys_claim_welcome_email(uuid) TO service_role;

COMMENT ON TABLE public.herkeys_welcome_email_receipts IS
  'One welcome email per authenticated account, sent only by Her Keys production backend.';
