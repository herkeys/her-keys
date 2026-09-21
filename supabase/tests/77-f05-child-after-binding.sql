-- ============================================================================
-- 77 — adding a child AFTER the household is bound to an account  (HK-FEATURE-05, owner checkpoint OC-01)
--
-- A child's cloud identity is a household_members row. Until this migration only the claim could create one, and a claim runs once. The
-- owner decided a bound household MUST be able to add a child, through the existing household-member identity and the existing sync
-- path. The shape (20260921190000_f05_add_child_after_binding.sql): household_members is STILL read-only to every client; one
-- SECURITY DEFINER function, reachable only through public.sync_push, admits exactly one thing - the household OWNER adds a plain child.
--
-- Every case reads back what the table actually holds afterwards: "it did not error" is not evidence the right branch ran.
--
-- Self-contained: it creates its own cast and depends on no other file.
--
--   pa  owner of household A            pb  a second, NON-owner adult member of household A
--   pc  owner of an unrelated household C
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set pa 'f5000000-0000-4000-8000-00000000000a'
\set pb 'f5000000-0000-4000-8000-00000000000b'
\set pc 'f5000000-0000-4000-8000-00000000000c'
\set devA 'f5d00000-0000-4000-8000-00000000000a'
\set devB 'f5d00000-0000-4000-8000-00000000000b'
\set devC 'f5d00000-0000-4000-8000-00000000000c'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES (:'pa','f5a@local.test'), (:'pb','f5b@local.test'), (:'pc','f5c@local.test')
ON CONFLICT (id) DO NOTHING;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.bootstrap_account('f5000000-0000-4000-8000-0000000000c1'::uuid, 'America/Chicago', :'devA'::uuid) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | 0. household A exists (owner pa)';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT CASE WHEN (public.bootstrap_account('f5000000-0000-4000-8000-0000000000c3'::uuid, 'Europe/London', :'devC'::uuid) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | 0b. an unrelated household C exists (owner pc)';
COMMIT;

-- pb joins household A as an ordinary member. Membership is privileged infrastructure, so the fixture writes it as the table owner.
RESET ROLE;
INSERT INTO public.profiles (id, timezone) VALUES (:'pb', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
SELECT household_id AS ha FROM public.account_claims WHERE profile_id = :'pa' \gset
SELECT household_id AS hc FROM public.account_claims WHERE profile_id = :'pc' \gset
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
VALUES (:'ha', 'user-2', :'pb', 'adult', 'member', NULL, 'personal');
-- An existing child in the UNRELATED household: the thing a hijack would go after.
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, birth_date, scope)
VALUES (:'hc', 'child-c-1', NULL, 'child', 'member', 'Cora', DATE '2017-01-01', 'child');
SELECT id AS cora FROM public.household_members WHERE household_id = :'hc' AND local_id = 'child-c-1' \gset
SELECT id AS adult_a FROM public.household_members WHERE household_id = :'ha' AND profile_id = :'pa' \gset
SELECT local_id AS adult_a_local FROM public.household_members WHERE id = :'adult_a' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'ha' AND local_id = 'cat-home' \gset
SELECT id AS cat_c FROM public.household_categories WHERE household_id = :'hc' AND local_id = 'cat-home' \gset

SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 0c. household A starts with NO child (a real household that has not added one yet)';

-- ----------------------------------------------------------------------------
-- 1. The owner adds a child through sync_push.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT public.sync_push('household_members', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-1', 'member_type', 'child',
                            'display_name', 'Ava', 'birth_date', '2019-03-04', 'scope', 'child')) ->> 'status' AS st1 \gset
COMMIT;
RESET ROLE;
SELECT CASE WHEN :'st1' = 'created' THEN 'PASS' ELSE 'FAIL' END || ' | 1. the OWNER of a household adds a child through sync_push (status created)';
SELECT id AS c1 FROM public.household_members WHERE household_id = :'ha' AND local_id = 'child-f5-1' \gset
SELECT CASE WHEN member_type = 'child' AND role = 'member' AND profile_id IS NULL AND scope = 'child'
             AND display_name = 'Ava' AND birth_date = DATE '2019-03-04' AND origin_device_id = :'devA'::uuid AND revision = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | 1b. the row is exactly a child: no account, no role, scope child, the stated name and birth date, the pushing install, revision 1'
FROM public.household_members WHERE id = :'c1';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | 1c. the write reached change_log (so sync_pull reports it to every device)'
FROM public.change_log WHERE entity_table = 'household_members' AND entity_id = :'c1'::uuid AND household_id = :'ha' AND op = 'upsert';

-- ----------------------------------------------------------------------------
-- 2. Reads stay household-scoped, and a second device learns of the child through the ordinary pull.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000b"}';
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE id = :'c1') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | 2. a second member of the household reads the new child (existing SELECT policy)';
SELECT CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'ha'::uuid) -> 'rows') r
                          WHERE r ->> 'entity_table' = 'household_members' AND r ->> 'entity_id' = :'c1')
            THEN 'PASS' ELSE 'FAIL' END || ' | 2b. sync_pull for the household reports the new child';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE household_id = :'ha') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 2c. an UNRELATED account sees no member of household A, the new child included';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_pull('0'::xid8, %L::uuid)$q$, :'ha')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 2d. ...and cannot pull household A at all';
COMMIT;

-- ----------------------------------------------------------------------------
-- 3. Identity: a lost acknowledgement settles, a colliding install is a distinct entity, same names are distinct children.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT public.sync_push('household_members', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-1', 'member_type', 'child',
                            'display_name', 'Ava', 'birth_date', '2019-03-04', 'scope', 'child')) ->> 'status' AS st_retry,
       public.sync_push('household_members', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-1', 'member_type', 'child',
                            'display_name', 'Ava', 'birth_date', '2019-03-04', 'scope', 'child')) ->> 'cloud_id' AS id_retry \gset
SELECT public.sync_push('household_members', :'devB'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-1', 'member_type', 'child',
                            'display_name', 'Ava', 'birth_date', '2019-03-04', 'scope', 'child')) ->> 'status' AS st_collide \gset
COMMIT;
RESET ROLE;
SELECT CASE WHEN :'st_retry' = 'already_exists' AND :'id_retry' = :'c1'
            THEN 'PASS' ELSE 'FAIL' END || ' | 3. the same install pushing again (a lost acknowledgement) is already_exists with the SAME cloud id';
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND local_id = 'child-f5-1') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | 3b. ...and it did not create a second row';
SELECT CASE WHEN :'st_collide' = 'local_id_collision' THEN 'PASS' ELSE 'FAIL' END || ' | 3c. a DIFFERENT install using the same local id is a local_id_collision (SD4-006), never a merge';
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child' AND display_name = 'Ava') = 2
             AND (SELECT count(DISTINCT id) FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child' AND display_name = 'Ava') = 2
             AND (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND local_id LIKE 'child-f5-1-x%') = 1
             AND (SELECT display_name || '/' || revision FROM public.household_members WHERE id = :'c1') = 'Ava/1'
            THEN 'PASS' ELSE 'FAIL' END || ' | 3d. two children called Ava are two distinct identities, the first is untouched, and nothing was matched by name';

-- two same-named children with DIFFERENT local ids are simply two children
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT public.sync_push('household_members', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-2', 'member_type', 'child',
                            'display_name', 'Ava', 'birth_date', '2021-07-09', 'scope', 'child')) ->> 'status' AS st_twin \gset
COMMIT;
RESET ROLE;
SELECT CASE WHEN :'st_twin' = 'created'
             AND (SELECT count(DISTINCT id) FROM public.household_members WHERE household_id = :'ha' AND display_name = 'Ava' AND member_type = 'child') = 3
            THEN 'PASS' ELSE 'FAIL' END || ' | 3e. a second child with the SAME name and a different birth date is created as its own row (identity is the id, never the name)';

-- ----------------------------------------------------------------------------
-- 4. Authority: only the owner.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000b"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-b', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devB', :'ha'))
            LIKE '42501%only the owner%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4. a second MEMBER of the household (not the owner) is refused with 42501';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-c', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devC', :'ha'))
            LIKE '42501%not a member of household%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4b. an UNRELATED account cannot add a child to household A (42501)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-c', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devC', gen_random_uuid()::text))
            LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4c. a household id that names nothing is refused the same way, not answered with silence';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-x', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'hc'))
            LIKE '42501%not a member of household%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4d. the owner of household A cannot add a child to a FOREIGN household id';
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-anon', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha'))
            LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4e. an UNAUTHENTICATED caller (anon) cannot call sync_push at all';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-nosub', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha'))
            LIKE '28000%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4f. a request with no authenticated subject is refused (28000)';
COMMIT;

RESET ROLE;
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE local_id IN ('child-f5-b', 'child-f5-c', 'child-f5-x', 'child-f5-anon', 'child-f5-nosub')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 4g. none of the refused attempts wrote anything';

-- The function enforces its OWN authority; it is not safe merely because sync_push happens to call it first.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000b"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT private.push_household_child(%L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-direct', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devB', :'ha'))
            LIKE '42501%only the owner%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4h. called DIRECTLY, private.push_household_child still refuses a non-owner';
COMMIT;
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT private.push_household_child(%L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-direct', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devB', :'ha'))
            LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4i. ...and anon cannot execute it at all';
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT private.push_household_child(%L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-direct-c', 'member_type', 'child', 'display_name', 'Nope', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devC', :'ha'))
            LIKE '42501%only the owner%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 4j. ...and an UNRELATED authenticated account calling it directly for household A is refused too (the function carries its own authority)';
COMMIT;
RESET ROLE;
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE local_id IN ('child-f5-direct', 'child-f5-direct-c')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 4k. neither direct call wrote anything';

-- ----------------------------------------------------------------------------
-- 5. A child is a plain child: nothing server-owned, no account, no role can be stated by a client.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-acct', 'member_type', 'child', 'display_name', 'Eve', 'birth_date', '2019-03-04', 'scope', 'child', 'profile_id', %L))$q$, :'devA', :'ha', :'pa'))
            LIKE '42501%profile_id%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5. a child cannot be handed an ACCOUNT (profile_id is refused, 42501)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-role', 'member_type', 'child', 'display_name', 'Eve', 'birth_date', '2019-03-04', 'scope', 'child', 'role', 'owner'))$q$, :'devA', :'ha'))
            LIKE '42501%role%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5b. a child cannot be handed a ROLE (a second owner is impossible)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-adult', 'member_type', 'adult', 'display_name', 'Eve', 'scope', 'personal'))$q$, :'devA', :'ha'))
            LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5c. an ADULT member cannot be added this way (an adult IS an account)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-scope', 'member_type', 'child', 'display_name', 'Eve', 'birth_date', '2019-03-04', 'scope', 'personal'))$q$, :'devA', :'ha'))
            LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5d. a child cannot be given another scope';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-col', 'member_type', 'child', 'display_name', 'Eve', 'birth_date', '2019-03-04', 'scope', 'child', 'is_admin', true))$q$, :'devA', :'ha'))
            LIKE '42501%is_admin%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5e. an unknown column is refused, not silently dropped';
COMMIT;

-- Hijack attempt: state the id (and a revision) of ANOTHER household's child. Both are server-owned and stripped; a NEW row is created.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT public.sync_push('household_members', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-hijack', 'member_type', 'child', 'display_name', 'Mallory',
                            'birth_date', '2019-03-04', 'scope', 'child', 'id', :'cora', 'revision', 99)) ->> 'cloud_id' AS hijack_id \gset
COMMIT;
RESET ROLE;
SELECT CASE WHEN :'hijack_id' <> :'cora'
             AND (SELECT display_name || '/' || revision || '/' || household_id::text FROM public.household_members WHERE id = :'cora'::uuid) = 'Cora/1/' || :'hc'
             AND (SELECT household_id::text || '/' || revision FROM public.household_members WHERE id = :'hijack_id'::uuid) = :'ha' || '/1'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5f. stating ANOTHER household''s child id (and a forged revision) creates a NEW row in the caller''s own household and leaves the foreign child untouched';

-- The account holder's own member row can never be mistaken for a child.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', %L, 'member_type', 'child', 'display_name', 'Shadow', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha', :'adult_a_local'))
            LIKE '23505%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5g. a child using the ACCOUNT HOLDER''S local id is refused (unique violation), never reported as "already created" and mapped to the adult';
COMMIT;
RESET ROLE;
SELECT CASE WHEN (SELECT member_type || '/' || role || '/' || coalesce(display_name, '-') FROM public.household_members WHERE id = :'adult_a') = 'adult/owner/-'
            THEN 'PASS' ELSE 'FAIL' END || ' | 5h. the account holder''s own member row is unchanged';

-- The table's own CHECKs decide the content.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-blank', 'member_type', 'child', 'display_name', '', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 6. a blank name is refused by the table''s CHECK';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-long', 'member_type', 'child', 'display_name', %L, 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha', repeat('a', 81))) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 6b. an 81-character name is refused';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-space', 'member_type', 'child', 'display_name', 'Ava  Rose', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 6c. an un-normalised name (a double space) is refused';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-nobirth', 'member_type', 'child', 'display_name', 'Ava', 'scope', 'child'))$q$, :'devA', :'ha')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 6d. a child with no birth date is refused (there is no "unknown" child)';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child f5 bad id', 'member_type', 'child', 'display_name', 'Ava', 'birth_date', '2019-03-04', 'scope', 'child'))$q$, :'devA', :'ha')) LIKE '23514%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 6e. a malformed local id is refused';
COMMIT;

-- ----------------------------------------------------------------------------
-- 7. household_members is STILL read-only to a client: the function is the only way in.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$INSERT INTO public.household_members (household_id, local_id, member_type, display_name, birth_date, scope)
         VALUES (%L, 'child-f5-direct-insert', 'child', 'Eve', DATE '2019-03-04', 'child')$q$, :'ha')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 7. the OWNER still cannot INSERT into household_members directly (no grant, no policy)';
SELECT CASE WHEN herkeys_test.error_of(format($q$UPDATE public.household_members SET display_name = 'Renamed' WHERE id = %L$q$, :'c1')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 7b. ...cannot UPDATE a child (there is no rename)';
SELECT CASE WHEN herkeys_test.error_of(format($q$DELETE FROM public.household_members WHERE id = %L$q$, :'c1')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 7c. ...and cannot DELETE one';
COMMIT;
RESET ROLE;
SELECT CASE WHEN (SELECT display_name FROM public.household_members WHERE id = :'c1') = 'Ava'
             AND (SELECT count(*) FROM public.household_members WHERE local_id = 'child-f5-direct-insert') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 7d. nothing changed';

-- ----------------------------------------------------------------------------
-- 8. A new child is a real child: work can name it, and only within its own household.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT public.sync_push('tasks', :'devA'::uuid,
         jsonb_build_object('household_id', :'ha', 'local_id', 'task-f5-1', 'title', 'Book the dentist for Ava',
           'category_id', :'cat_a', 'subject_member_id', :'c1', 'duration_minutes', 10, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'child')) ->> 'status' AS st_task \gset
COMMIT;
SELECT CASE WHEN :'st_task' = 'created' THEN 'PASS' ELSE 'FAIL' END || ' | 8. a task naming the NEW child (through the ordinary sync path) is accepted';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('tasks', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'task-f5-x', 'title', 'Not mine',
           'category_id', %L, 'subject_member_id', %L, 'duration_minutes', 10, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'child'))$q$, :'devC', :'hc', :'cat_c', :'c1')) LIKE '23503%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 8b. another household cannot name household A''s new child as a subject (composite foreign key)';
COMMIT;

-- ----------------------------------------------------------------------------
-- 9. The bound. A household holds at most 20 children; the count is per household.
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT (20 - count(*))::int AS room FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child' \gset
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT count(*) AS filled
  FROM generate_series(1, :room) g,
       LATERAL (SELECT public.sync_push('household_members', :'devA'::uuid,
                  jsonb_build_object('household_id', :'ha', 'local_id', 'child-f5-fill-' || g, 'member_type', 'child',
                                     'display_name', 'Fill ' || g, 'birth_date', '2018-01-01', 'scope', 'child')) AS r) x
 WHERE x.r ->> 'status' = 'created' \gset
COMMIT;
RESET ROLE;
SELECT CASE WHEN :filled = :room AND (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child') = 20
            THEN 'PASS' ELSE 'FAIL' END || ' | 9. household A can be filled to exactly 20 children';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('household_members', %L::uuid,
         jsonb_build_object('household_id', %L, 'local_id', 'child-f5-21', 'member_type', 'child', 'display_name', 'Twenty-one', 'birth_date', '2018-01-01', 'scope', 'child'))$q$, :'devA', :'ha'))
            LIKE '22023%at most 20 children%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 9b. the 21st child is refused (22023), the state AppStateSchema already caps at 20';
COMMIT;
RESET ROLE;
SELECT CASE WHEN (SELECT count(*) FROM public.household_members WHERE household_id = :'ha' AND member_type = 'child') = 20
             AND (SELECT count(*) FROM public.household_members WHERE local_id = 'child-f5-21') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | 9c. ...and nothing was written';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000c"}';
SELECT public.sync_push('household_members', :'devC'::uuid,
         jsonb_build_object('household_id', :'hc', 'local_id', 'child-f5-c2', 'member_type', 'child',
                            'display_name', 'Cleo', 'birth_date', '2020-02-02', 'scope', 'child')) ->> 'status' AS st_c2 \gset
COMMIT;
SELECT CASE WHEN :'st_c2' = 'created' THEN 'PASS' ELSE 'FAIL' END || ' | 9d. the bound is per household: an unrelated household is unaffected';

-- ----------------------------------------------------------------------------
-- 10. Nothing else changed about sync_push.
-- ----------------------------------------------------------------------------
SELECT CASE WHEN (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'sync_push')
            THEN 'PASS' ELSE 'FAIL' END || ' | 10. public.sync_push is still SECURITY INVOKER: every other table is still written as the caller';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.error_of(format($q$SELECT public.sync_push('households', %L::uuid, jsonb_build_object('household_id', %L, 'local_id', 'x'))$q$, :'devA', :'ha'))
              LIKE '22023%not a pushable entity table%'
            THEN 'PASS' ELSE 'FAIL' END || ' | 10b. households is still not a pushable table';
COMMIT;
SELECT CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'household_members') = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | 10c. household_members still has exactly one policy (SELECT); no write policy was added';
SELECT CASE WHEN NOT has_function_privilege('anon', 'private.push_household_child(uuid, jsonb)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'private.push_household_child(uuid, jsonb)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END || ' | 10d. the new function is executable by authenticated and NOT by anon';
