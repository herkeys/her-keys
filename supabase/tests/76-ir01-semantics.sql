-- ============================================================================
-- 76 — HK-INTEGRATION-READINESS-01 backend semantics (HA-010 and HA-011), attacked as real roles.
--
--   HA-010  tasks.duration_source: a closed vocabulary or NULL ("never recorded"); writable only by the household that owns
--           the row, at column level; a stranger and anon can neither read nor change it.
--   HA-011  household_systems.subject_member_id: the child rules (child scope needs a subject; a subject is a CHILD of the SAME
--           household) held for tasks only. They are proven here for Systems, together with the cross-household, WITH CHECK
--           and server-owned-column attacks.
--
-- Uses the shared identity fixtures (USER A owns household A with CHILD A; USER C owns an unrelated household), like 30.
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set uc '33333333-3333-4333-8333-333333333333'
\set dev '76000000-0000-4000-8000-000000000001'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_a   FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset
SELECT id AS cat_c   FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-kids' \gset
SELECT id AS child_a FROM public.household_members     WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset
SELECT id AS adult_a FROM public.household_members     WHERE household_id = :'hh_a' AND local_id = 'user-1' \gset

CREATE FUNCTION pg_temp.say(p_label text, p_ok boolean) RETURNS text LANGUAGE sql AS $f$ SELECT CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || p_label; $f$;

CREATE FUNCTION pg_temp.task(p_hh uuid, p_cat uuid, p_local text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('household_id', p_hh, 'local_id', p_local, 'title', 'A task', 'category_id', p_cat, 'duration_minutes', 15,
                            'commitment', 'flexible', 'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household') || p_extra;
$f$;

CREATE FUNCTION pg_temp.system(p_hh uuid, p_cat uuid, p_local text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('household_id', p_hh, 'local_id', p_local, 'name', 'A routine', 'description', '', 'category_id', p_cat, 'scope', 'household') || p_extra;
$f$;

-- How many rows a statement touched, as whoever calls it (SECURITY INVOKER, so RLS applies to the caller).
CREATE FUNCTION pg_temp.changed(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;

CREATE FUNCTION pg_temp.as_user(p_sub text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_sub)::text, false);
  SET ROLE authenticated;
END $f$;

-- The schema revokes default routine privileges, so the roles this file impersonates must be allowed to call ITS helpers.
GRANT EXECUTE ON FUNCTION pg_temp.say(text, boolean), pg_temp.task(uuid, uuid, text, jsonb), pg_temp.system(uuid, uuid, text, jsonb), pg_temp.changed(text) TO authenticated, anon;

-- ================= HA-010 — tasks.duration_source ====================================================================
SELECT pg_temp.say('1. the column exists, is nullable and has NO default: an unstated source is unknown, never a guessed value',
  (SELECT is_nullable = 'YES' AND column_default IS NULL FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'duration_source'));

SELECT pg_temp.say('2. user, default and inferred are accepted, and so is no source at all',
  herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-user',     jsonb_build_object('duration_source', 'user')))     IS NULL
  AND herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-default',  jsonb_build_object('duration_source', 'default')))  IS NULL
  AND herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-inferred', jsonb_build_object('duration_source', 'inferred'))) IS NULL
  AND herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-none')) IS NULL);

SELECT pg_temp.say('3. a row with no stated source is stored NULL, and a 15 with a NULL source is not a "user" 15',
  (SELECT duration_source IS NULL AND duration_minutes = 15 FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'ir01-src-none'));

SELECT pg_temp.say('4. a value outside the vocabulary is refused by the CHECK, by reason',
  herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-bad', jsonb_build_object('duration_source', 'you-said-so'))) LIKE '23514%tasks_duration_source_check%');

-- as the household's owner
SELECT pg_temp.as_user(:'ua');
SELECT pg_temp.say('5. the owner can state a source when creating a task (column-level INSERT grant)',
  herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-as-a', jsonb_build_object('duration_source', 'default'))) IS NULL);
SELECT pg_temp.say('6. ...reads it back unchanged',
  (SELECT duration_source FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'ir01-src-as-a') = 'default');
SELECT pg_temp.say('7. ...and can correct it (column-level UPDATE grant): default -> user is how "she confirmed it" is recorded',
  pg_temp.changed(format($q$UPDATE public.tasks SET duration_source = 'user' WHERE household_id = %L AND local_id = 'ir01-src-as-a'$q$, :'hh_a')) = 1);
SELECT pg_temp.say('8. an owner cannot write an unknown value either',
  herkeys_test.error_of(format($q$UPDATE public.tasks SET duration_source = 'guess' WHERE household_id = %L AND local_id = 'ir01-src-as-a'$q$, :'hh_a')) LIKE '23514%');
-- (an action and the row it wrote are checked in SEPARATE statements: a sub-select in the same statement cannot see them)
SELECT pg_temp.say('9. sync_push (the create path the app uses) accepts a row that states its source',
  (public.sync_push('tasks', :'dev'::uuid, pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-push', jsonb_build_object('duration_source', 'inferred', 'producer', 'user-action'))) ->> 'status') = 'created');
SELECT pg_temp.say('9b. ...and carries the source through',
  (SELECT count(*) FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'ir01-src-push' AND duration_source = 'inferred') = 1);
RESET ROLE;

-- as an unrelated household's owner
SELECT pg_temp.as_user(:'uc');
SELECT pg_temp.say('10. a stranger cannot SEE the row that states a source',
  (SELECT count(*) FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'ir01-src-as-a') = 0);
SELECT pg_temp.say('11. ...and cannot change it: the UPDATE matches no row',
  pg_temp.changed(format($q$UPDATE public.tasks SET duration_source = 'default' WHERE household_id = %L AND local_id = 'ir01-src-as-a'$q$, :'hh_a')) = 0);
SELECT pg_temp.say('12. ...and cannot create a task in someone else''s household stating anything',
  herkeys_test.ins('tasks', pg_temp.task(:'hh_a', :'cat_a', 'ir01-src-cross', jsonb_build_object('duration_source', 'user'))) LIKE '42501%');
RESET ROLE;

SELECT pg_temp.say('13. the stranger''s attempt changed nothing',
  (SELECT duration_source FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'ir01-src-as-a') = 'user');

SET ROLE anon;
SELECT pg_temp.say('14. anon can neither read nor write the column',
  herkeys_test.error_of(format($q$UPDATE public.tasks SET duration_source = 'user' WHERE household_id = %L$q$, :'hh_a')) LIKE '42501%'
  AND herkeys_test.error_of('SELECT duration_source FROM public.tasks LIMIT 1') LIKE '42501%');
RESET ROLE;

-- ================= HA-011 — household_systems.subject_member_id ======================================================
SELECT pg_temp.say('15. rule 1: a child-scoped System with no subject is refused by reason',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-nochild', jsonb_build_object('scope', 'child'))) LIKE '23514%child_scope_subject_check%');

SELECT pg_temp.say('16. rule 2: a real child of the same household is ALLOWED',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-child', jsonb_build_object('scope', 'child', 'subject_member_id', :'child_a'))) IS NULL);
SELECT pg_temp.say('16b. ...the subject is kept and the type is derived by the server',
  (SELECT count(*) FROM public.household_systems WHERE household_id = :'hh_a' AND local_id = 'ir01-sys-child' AND subject_member_type = 'child' AND subject_member_id = :'child_a'::uuid) = 1);

SELECT pg_temp.say('17. rule 2: the ACCOUNT USER (an adult member) is not a valid subject',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-adult', jsonb_build_object('subject_member_id', :'adult_a'))) LIKE '23503%');

SELECT pg_temp.say('18. rule 2: a child of ANOTHER household cannot be attached to this household''s System',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_c', :'cat_c', 'ir01-sys-other', jsonb_build_object('scope', 'child', 'subject_member_id', :'child_a'))) LIKE '23503%');

SELECT pg_temp.say('19. rule 1 is one-way: a household-scope routine may still be ABOUT a child',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-hh-child', jsonb_build_object('subject_member_id', :'child_a'))) IS NULL);

SELECT pg_temp.say('20. a household-level System can be created with no subject',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-plain')) IS NULL);
SELECT pg_temp.say('20b. ...it has no subject (NULL) and its derived type is NULL (and the row really exists)',
  (SELECT count(*) FROM public.household_systems WHERE household_id = :'hh_a' AND local_id = 'ir01-sys-plain' AND subject_member_id IS NULL AND subject_member_type IS NULL) = 1);

SELECT pg_temp.as_user(:'ua');
SELECT pg_temp.say('21. the owner can create a child-scoped System through the client grants (INSERT covers subject_member_id)',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-as-a', jsonb_build_object('scope', 'child', 'subject_member_id', :'child_a', 'producer', 'user-action'))) IS NULL);
SELECT pg_temp.say('22. WITH CHECK on UPDATE: removing the subject from a child-scoped System is refused',
  herkeys_test.error_of(format($q$UPDATE public.household_systems SET subject_member_id = NULL WHERE household_id = %L AND local_id = 'ir01-sys-as-a'$q$, :'hh_a')) LIKE '23514%');
SELECT pg_temp.say('23. ...re-pointing it at the adult account user is refused',
  herkeys_test.error_of(format($q$UPDATE public.household_systems SET subject_member_id = %L WHERE household_id = %L AND local_id = 'ir01-sys-as-a'$q$, :'adult_a', :'hh_a')) LIKE '23503%');
SELECT pg_temp.say('24. ownership cannot be reassigned: household_id is not a column a client may UPDATE',
  herkeys_test.error_of(format($q$UPDATE public.household_systems SET household_id = %L WHERE household_id = %L AND local_id = 'ir01-sys-as-a'$q$, :'hh_c', :'hh_a')) LIKE '42501%');
SELECT pg_temp.say('25. the derived type is server-owned: a client cannot assert it',
  herkeys_test.error_of(format($q$UPDATE public.household_systems SET subject_member_type = 'adult' WHERE household_id = %L AND local_id = 'ir01-sys-as-a'$q$, :'hh_a')) LIKE '42501%');
SELECT pg_temp.say('26. foreign-key substitution: a category from another household is refused',
  herkeys_test.error_of(format($q$UPDATE public.household_systems SET category_id = %L WHERE household_id = %L AND local_id = 'ir01-sys-as-a'$q$, :'cat_c', :'hh_a')) LIKE '23503%');
RESET ROLE;

SELECT pg_temp.as_user(:'uc');
SELECT pg_temp.say('27. a stranger cannot see a child-scoped System',
  (SELECT count(*) FROM public.household_systems WHERE household_id = :'hh_a') = 0);
SELECT pg_temp.say('28. ...cannot create one in another household, even naming that household''s real child',
  herkeys_test.ins('household_systems', pg_temp.system(:'hh_a', :'cat_a', 'ir01-sys-cross', jsonb_build_object('scope', 'child', 'subject_member_id', :'child_a', 'producer', 'user-action'))) LIKE '42501%');
SELECT pg_temp.say('29. ...and cannot re-point one at its own child',
  pg_temp.changed(format($q$UPDATE public.household_systems SET subject_member_id = NULL WHERE household_id = %L$q$, :'hh_a')) = 0);
RESET ROLE;

SELECT pg_temp.say('30. after all of that the owner''s child-scoped System still names its child',
  (SELECT subject_member_id = :'child_a'::uuid AND subject_member_type = 'child' FROM public.household_systems WHERE household_id = :'hh_a' AND local_id = 'ir01-sys-as-a'));
