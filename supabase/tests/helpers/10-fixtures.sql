-- Deterministic local identity fixtures for ENV C.
--
-- Built to be reused by the account/auth/claim wave and later by sync, so that
-- wave does not reinvent identity setup. Everything is fixed-uuid and
-- idempotent, so a test file can assume these exist without ordering games.
--
-- Cast of actors:
--   USER A      owner of HOUSEHOLD A
--   USER B      second adult member of HOUSEHOLD A (not the owner)
--   USER C      owner of HOUSEHOLD C, entirely unrelated
--   CHILD A     a child member of HOUSEHOLD A, no profile
--
-- USER B exists so the "same household, different member" row of the RLS matrix
-- is reachable. Build 4 products only ever create one adult per household, so
-- this actor is constructed directly rather than through bootstrap.

\set user_a       '11111111-1111-4111-8111-111111111111'
\set user_b       '22222222-2222-4222-8222-222222222222'
\set user_c       '33333333-3333-4333-8333-333333333333'

INSERT INTO auth.users (id, email) VALUES
  (:'user_a', 'a@local.test'),
  (:'user_b', 'b@local.test'),
  (:'user_c', 'c@local.test')
ON CONFLICT (id) DO NOTHING;

-- Households and the owning profiles come from the real bootstrap RPC, so the
-- fixtures exercise the shipping path rather than a parallel hand-built one.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT public.bootstrap_account('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'America/Chicago', NULL);

SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT public.bootstrap_account('cccccccc-0000-4000-8000-00000000000c'::uuid, 'Europe/London', NULL);

RESET ROLE;

-- USER B joins HOUSEHOLD A as an ordinary member, and CHILD A is added.
-- household_members is privileged infrastructure (B4-P0-019): no client policy
-- permits these writes, which is why the fixture performs them as the owner
-- role rather than through an RPC.
INSERT INTO public.profiles (id, timezone) VALUES (:'user_b', 'America/Chicago')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.household_members
  (household_id, local_id, profile_id, member_type, role, display_name, scope)
SELECT h.id, 'user-2', :'user_b', 'adult', 'member', NULL, 'personal'
FROM public.households h
JOIN public.household_members o ON o.household_id = h.id AND o.profile_id = :'user_a'
ON CONFLICT DO NOTHING;

INSERT INTO public.household_members
  (household_id, local_id, profile_id, member_type, role, display_name, birth_date, scope)
SELECT h.id, 'child-1', NULL, 'child', 'member', 'Josie', DATE '2016-04-02', 'child'
FROM public.households h
JOIN public.household_members o ON o.household_id = h.id AND o.profile_id = :'user_a'
ON CONFLICT DO NOTHING;
