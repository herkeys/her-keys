-- HK-V2ACT-CAL-03: Google Calendar consent completes only for the Her Keys account that started it.
--
-- Before: the OAuth callback (opened in a browser, with no Her Keys session) exchanged Google's code and stored the refresh token on the
-- account that STARTED the attempt. Anyone who could get another person to finish Google consent on an authorization URL they started
-- received that person's calendar. After: the callback only records that Google authorized the attempt, under a hash of a fresh,
-- single-use completion handle; the code stays here, encrypted, and is exchanged only when the SAME signed-in account redeems the handle.
--
-- Additive and service-only: four nullable columns on a table that has no client grant or policy. Existing rows (unredeemed attempts)
-- are untouched. Account deletion already removes every calendar_oauth_states row by user_id and guards inserts/updates for accounts
-- pending deletion, so the new columns need no deletion change.
BEGIN;

ALTER TABLE public.calendar_oauth_states
  ADD COLUMN completion_hash text,
  ADD COLUMN authorization_code_ciphertext text,
  ADD COLUMN authorization_code_iv text,
  ADD COLUMN completion_expires_at timestamptz,
  ADD CONSTRAINT calendar_oauth_states_completion_shape CHECK (
    (completion_hash IS NULL AND authorization_code_ciphertext IS NULL AND authorization_code_iv IS NULL AND completion_expires_at IS NULL)
    OR (completion_hash IS NOT NULL AND authorization_code_ciphertext IS NOT NULL AND authorization_code_iv IS NOT NULL AND completion_expires_at IS NOT NULL)
  );

CREATE UNIQUE INDEX calendar_oauth_states_completion_hash_key
  ON public.calendar_oauth_states (completion_hash)
  WHERE completion_hash IS NOT NULL;

DO $$ BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.calendar_oauth_states', 'SELECT'), 'calendar OAuth state must stay service-only (anon)';
  ASSERT NOT has_table_privilege('authenticated', 'public.calendar_oauth_states', 'SELECT'), 'calendar OAuth state must stay service-only (authenticated)';
  ASSERT NOT has_column_privilege('authenticated', 'public.calendar_oauth_states', 'authorization_code_ciphertext', 'SELECT'), 'the pending authorization must never be client-readable';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_oauth_states'), 'no client policy on calendar OAuth state';
END $$;

COMMIT;
