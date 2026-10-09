-- HER KEYS V2 CONSENT LEDGER: REVIEW-ONLY BLUEPRINT, NOT APPLIED.
-- Staging permissions currently prevent live inspection or migration.
-- Do not apply blindly: first reconcile this proposed table and grants against
-- the REAL Staging migration ledger and public schema; run hostile RLS tests.
-- Never automatically promote to Production.
CREATE TABLE public.account_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consent_type text NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'age18', 'ai_processing')),
    policy_version text NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 120),
    granted boolean NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_consents_latest_idx
  ON public.account_consents(account_id, consent_type, recorded_at DESC, id DESC);
ALTER TABLE public.account_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.account_consents TO authenticated;
CREATE POLICY account_consents_select_own
  ON public.account_consents FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY account_consents_insert_own
  ON public.account_consents FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
-- No UPDATE, DELETE or broad read grants. Decisions are an append-only audit.
-- Acceptance is not inferred from authentication.
-- Required hostile tests: account A cannot read/insert B; anon cannot read/write;
-- client cannot forge recorded_at (stronger enforcement requires a restricted
-- server RPC/default-only grants); declines remain addressable as latest events;
-- duplicate acceptance, concurrent devices and policy revisions are evaluated.
-- BEFORE APPLYING: lock recorded_at against client writes with a column-specific
-- INSERT grant or SECURITY DEFINER RPC to guarantee server-authoritative time.
