-- THE HOUSEHOLD A REQUEST IS ABOUT IS NAMED, NEVER GUESSED (private.resolve_household_context, sync_pull).
--
-- The function this replaced took LIMIT 1 of an unordered set: a coin flip presented as an answer, which would
-- have returned another household's changes the day an account belonged to two. Every case here is one the old
-- function got wrong or could not tell apart.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;
BEGIN;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset

-- ---- a single-household account -----------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN private.resolve_household_context(:'hh_a') = :'hh_a'::uuid THEN 'PASS' ELSE 'FAIL' END || ' | a named household she belongs to resolves to itself';
SELECT CASE WHEN private.resolve_household_context() = :'hh_a'::uuid THEN 'PASS' ELSE 'FAIL' END || ' | none named, one membership: that one — every device of a single-household account resolves identically';
SELECT CASE WHEN private.resolve_household_context(NULL) = :'hh_a'::uuid THEN 'PASS' ELSE 'FAIL' END || ' | an explicit NULL is the same as none named';
SELECT CASE WHEN herkeys_test.error_of(format('SELECT private.resolve_household_context(%L)', :'hh_c')) LIKE '42501%not a member%' THEN 'PASS' ELSE 'FAIL' END
       || ' | a household that exists but is NOT hers is refused (42501), not answered';
SELECT CASE WHEN herkeys_test.error_of('SELECT private.resolve_household_context(gen_random_uuid())') LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
       || ' | a well-formed uuid that names nothing is refused the same way — it does not leak which households exist';

-- ---- sync_pull carries the same contract ---------------------------------------------------------------------------
SELECT CASE WHEN jsonb_typeof(public.sync_pull('0'::xid8, :'hh_a'::uuid) -> 'rows') = 'array' THEN 'PASS' ELSE 'FAIL' END || ' | sync_pull for her own household answers';
SELECT CASE WHEN public.sync_pull('0'::xid8) = public.sync_pull('0'::xid8, :'hh_a'::uuid) THEN 'PASS' ELSE 'FAIL' END || ' | and omitting the household is the same answer when there is exactly one';
SELECT CASE WHEN herkeys_test.error_of(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_c')) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
       || ' | sync_pull for someone else''s household is REFUSED — not an empty answer she could mistake for "nothing changed"';
SELECT CASE WHEN NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'hh_a'::uuid) -> 'rows') r
         WHERE (SELECT household_id FROM public.change_log c WHERE c.entity_id = (r ->> 'entity_id')::uuid AND c.entity_table = r ->> 'entity_table' LIMIT 1) <> :'hh_a'::uuid)
       THEN 'PASS' ELSE 'FAIL' END || ' | every row it reports belongs to the household she named';

-- ---- a caller who is in TWO households: the ambiguity the old function hid --------------------------------------
RESET ROLE;
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
VALUES (:'hh_c', 'user-guest', :'ua', 'adult', 'member', NULL, 'personal');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.error_of('SELECT private.resolve_household_context()') LIKE '22023%ambiguous%' THEN 'PASS' ELSE 'FAIL' END
       || ' | belonging to two households and naming neither is REFUSED as ambiguous';
SELECT CASE WHEN herkeys_test.error_of('SELECT public.sync_pull(''0''::xid8)') LIKE '22023%ambiguous%' THEN 'PASS' ELSE 'FAIL' END
       || ' | sync_pull inherits that refusal: it will not guess which household she meant';
SELECT CASE WHEN private.resolve_household_context(:'hh_a') = :'hh_a'::uuid AND private.resolve_household_context(:'hh_c') = :'hh_c'::uuid THEN 'PASS' ELSE 'FAIL' END
       || ' | naming either household resolves it';
SELECT CASE WHEN public.sync_pull('0'::xid8, :'hh_c'::uuid) IS NOT NULL AND public.sync_pull('0'::xid8, :'hh_a'::uuid) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | and sync_pull answers for each, separately';
SELECT CASE WHEN NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'hh_c'::uuid) -> 'rows') r
         JOIN public.change_log c ON c.entity_id = (r ->> 'entity_id')::uuid AND c.entity_table = r ->> 'entity_table' WHERE c.household_id = :'hh_a'::uuid)
       THEN 'PASS' ELSE 'FAIL' END || ' | a pull for household C reports nothing from household A, though she belongs to both';
RESET ROLE;

-- ---- a caller who belongs to none, and one who is not signed in ----------------------------------------------------
INSERT INTO auth.users (id, email) VALUES ('44444444-4444-4444-8444-444444444444', 'nobody@local.test') ON CONFLICT (id) DO NOTHING;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
SELECT CASE WHEN private.resolve_household_context() IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | belonging to none: NULL — there is no household to be about';
SELECT CASE WHEN jsonb_array_length(public.sync_pull('0'::xid8) -> 'rows') = 0 THEN 'PASS' ELSE 'FAIL' END || ' | ...and a pull for it is empty, leaking nothing';
SELECT CASE WHEN herkeys_test.error_of(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a')) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
       || ' | ...and naming a household she is not in is refused';
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{}';
SELECT CASE WHEN herkeys_test.error_of('SELECT private.resolve_household_context()') LIKE '28000%' THEN 'PASS' ELSE 'FAIL' END || ' | no authenticated caller: refused (28000)';
RESET ROLE;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT public.sync_pull(''0''::xid8)') AND herkeys_test.test_denied('SELECT private.resolve_household_context()') THEN 'PASS' ELSE 'FAIL' END
       || ' | anon can call neither';
RESET ROLE;

SELECT CASE WHEN to_regprocedure('private.current_household_id()') IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | the LIMIT-1 function no longer exists to be called by mistake';
SELECT CASE WHEN prosrc !~* 'limit\s+1' THEN 'PASS' ELSE 'FAIL' END || ' | resolve_household_context contains no LIMIT 1' FROM pg_proc WHERE proname = 'resolve_household_context';
ROLLBACK;
