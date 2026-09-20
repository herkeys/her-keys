-- NHR-01 / owner decision A2: child-subject structural integrity.
--
-- Rules 2 and 3 are discharged by ONE composite foreign key, not by a trigger
-- and not by RLS. These tests attack both directions: the referencing write,
-- and the mutation of the referenced membership.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'

RESET ROLE;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.role = 'owner' AND hm.household_id <> :'hh_a' LIMIT 1 \gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \gset
SELECT id AS cat_c    FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-kids' \gset
SELECT id AS child_a  FROM public.household_members     WHERE household_id = :'hh_a' AND local_id = 'child-1' \gset
SELECT id AS adult_a  FROM public.household_members     WHERE household_id = :'hh_a' AND local_id = 'user-1' \gset

-- rule 1 — a child-scoped row must say WHICH child, on all five tables.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.events (household_id, local_id, title, category_id, starts_at, ends_at, commitment, status, scope)
  VALUES (%L,'evt-nochild','Nobody',%L, now(), now()+interval '1 hour','fixed','active','child')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 1: events child-scope with NULL subject rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.household_categories (household_id, local_id, name, status, sort_order, scope)
  VALUES (%L,'cat-nochild','Emma stuff','active', 90,'child')
$q$, :'hh_a')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 1: household_categories child-scope with NULL subject rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.household_systems (household_id, local_id, name, description, category_id, scope)
  VALUES (%L,'sys-nochild','Routine','',%L,'child')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 1: household_systems child-scope with NULL subject rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.meal_plan_entries (household_id, local_id, meal_date, title, category_id, scope)
  VALUES (%L,'meal-nochild', CURRENT_DATE,'Packed lunch',%L,'child')
$q$, :'hh_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 1: meal_plan_entries child-scope with NULL subject rejected';

-- rule 2 — any non-null subject must be a CHILD of the SAME household.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, subject_member_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L,'task-adultsubj',%L,'Adult as subject',%L,10,'flexible','unplanned','open','child')
$q$, :'hh_a', :'adult_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 2: subject pointing at an ADULT is rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, subject_member_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L,'task-otherchild',%L,'Another household child',%L,10,'flexible','unplanned','open','child')
$q$, :'hh_c', :'child_a', :'cat_c')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 2: subject from ANOTHER household is rejected';

-- The happy path must still work, or the constraint is merely obstruction.
SELECT CASE WHEN NOT herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, subject_member_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L,'task-validchild',%L,'Valid child row',%L,10,'flexible','unplanned','open','child')
$q$, :'hh_a', :'child_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 2: a real child of the same household is ALLOWED';

-- A household-scope row MAY also name a subject: the rule is one-way.
SELECT CASE WHEN NOT herkeys_test.test_denied(format($q$
  INSERT INTO public.tasks (household_id, local_id, subject_member_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
  VALUES (%L,'task-hh-subj',%L,'Household row about a child',%L,10,'flexible','unplanned','open','household')
$q$, :'hh_a', :'child_a', :'cat_kids')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 1 is one-way: a household-scope row may still name a subject';

-- subject_member_type is server-owned and pinned; a client cannot assert that
-- an adult is a child by writing the carrier column directly.
SELECT CASE WHEN subject_member_type = 'child' THEN 'PASS' ELSE 'FAIL' END || ' | subject_member_type is derived to child, not client-supplied'
FROM public.tasks WHERE local_id = 'task-validchild';

-- Self-contained: this file must not depend on a row another file created.
INSERT INTO public.tasks (household_id, local_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope)
VALUES (:'hh_a', 'task-nosubject', 'No subject at all', :'cat_kids', 10, 'flexible', 'unplanned', 'open', 'household');
SELECT CASE WHEN subject_member_type IS NULL THEN 'PASS' ELSE 'FAIL' END || ' | subject_member_type is NULL when there is no subject'
FROM public.tasks WHERE local_id = 'task-nosubject';

-- rule 3 — the referenced membership cannot be mutated out from under the
-- reference. Attempted as the table OWNER, so this is the foreign key talking,
-- not a policy.
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  UPDATE public.household_members SET member_type = 'adult', birth_date = NULL, scope = 'personal' WHERE id = %L
$q$, :'child_a')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 3: changing member_type away from child is rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  UPDATE public.household_members SET household_id = %L WHERE id = %L
$q$, :'hh_c', :'child_a')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 3: moving the child to another household is rejected';

SELECT CASE WHEN herkeys_test.test_denied(format($q$
  DELETE FROM public.household_members WHERE id = %L
$q$, :'child_a')) THEN 'PASS' ELSE 'FAIL' END || ' | rule 3: deleting a referenced child is rejected (ON DELETE RESTRICT)';

-- No archival state exists: B4-P0-066 stays deferred and nothing shipped.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | no archival/removal column shipped on household_members (B4-P0-066 dormant)'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'household_members'
  AND column_name IN ('status', 'archived_at', 'deleted_at', 'removed_at');
