-- Her Keys V2 account-scoped, versioned legal and AI Data Processing receipts.
-- Additive security migration. Do not modify any existing household data.
-- One authenticated user can append only their OWN decisions. Anon cannot
-- access the table; no client may forge server-owned receipt ID/time.

CREATE TABLE public.account_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL
    CHECK (consent_type IN ('terms', 'privacy', 'age18', 'ai_processing')),
  policy_version text NOT NULL
    CHECK (length(policy_version) BETWEEN 1 AND 120),
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX account_consents_latest_idx
  ON public.account_consents (account_id, consent_type, recorded_at DESC, id DESC);

ALTER TABLE public.account_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_consents FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_consents TO authenticated;
GRANT INSERT (account_id, consent_type, policy_version, granted)
  ON TABLE public.account_consents TO authenticated;

CREATE POLICY account_consents_select_own
  ON public.account_consents FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));

CREATE POLICY account_consents_insert_own
  ON public.account_consents FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));

COMMENT ON TABLE public.account_consents IS
  'Append-only, account-owned legal and AI processing decisions. IDs and timestamps belong to the server; no update/delete client grants.';
