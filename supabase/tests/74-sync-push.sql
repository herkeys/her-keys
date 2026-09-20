-- ============================================================================
-- 74 — sync_push and the SD4-006 identity-mapping contract  (B4-BE03-OR-001)
--
-- Everything the push engine does is ordinary DML except one thing: creating a
-- row whose local_id is already taken by a DIFFERENT install. SD4-006 says the
-- server mints a fresh cloud identity and never merges, and a plain POST cannot
-- express that. These checks are that contract, executed.
--
-- Branch assertions throughout: each case reads back which status the RPC
-- returned AND what the table actually holds afterwards, because "it did not
-- error" is not evidence that the right branch ran.
--
-- Self-contained: it creates its own cast and depends on no other file.
-- ============================================================================
\pset format unaligned
\pset tuples_only on

\set pa 'a1000000-0000-4000-8000-00000000000a'
\set pb 'a1000000-0000-4000-8000-00000000000b'
\set devA 'd0000000-0000-4000-8000-00000000000a'
\set devB 'd0000000-0000-4000-8000-00000000000b'

RESET ROLE;
INSERT INTO auth.users (id, email) VALUES (:'pa','74a@local.test'), (:'pb','74b@local.test')
ON CONFLICT (id) DO NOTHING;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.bootstrap_account('a1000000-0000-4000-8000-0000000000c1'::uuid,'America/Chicago', :'devA'::uuid) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | 0. household A exists for the push cast';
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000b"}';
SELECT CASE WHEN (public.bootstrap_account('a1000000-0000-4000-8000-0000000000c2'::uuid,'Europe/London', :'devB'::uuid) ->> 'status') = 'complete'
            THEN 'PASS' ELSE 'FAIL' END || ' | 0b. an unrelated household B exists, for the isolation checks';
COMMIT;

-- Convenience: household A's ids, resolved once as the table owner.
RESET ROLE;
CREATE TEMP TABLE t74 AS
SELECT (SELECT household_id FROM public.account_claims WHERE profile_id = 'a1000000-0000-4000-8000-00000000000a') AS ha,
       (SELECT household_id FROM public.account_claims WHERE profile_id = 'a1000000-0000-4000-8000-00000000000b') AS hb,
       (SELECT id FROM public.household_categories
         WHERE local_id = 'cat-home'
           AND household_id = (SELECT household_id FROM public.account_claims WHERE profile_id = 'a1000000-0000-4000-8000-00000000000a')) AS cat_a;
GRANT SELECT ON t74 TO authenticated;

-- ----------------------------------------------------------------------------
-- 1. Ordinary create.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.sync_push('tasks', 'd0000000-0000-4000-8000-00000000000a'::uuid,
         jsonb_build_object('household_id', ha, 'local_id', 'task-1', 'title', 'Rinse the recycling',
           'category_id', cat_a, 'duration_minutes', 10, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) ->> 'status') = 'created'
       THEN 'PASS' ELSE 'FAIL' END || ' | 1. a fresh local_id is CREATED'
FROM t74;
COMMIT;

SELECT CASE WHEN count(*) = 1 AND max(revision) = 1 AND max(origin_device_id::text) = 'd0000000-0000-4000-8000-00000000000a'
            THEN 'PASS' ELSE 'FAIL' END || ' | 1b. one row, revision 1, origin device recorded'
FROM public.tasks t, t74 WHERE t.household_id = t74.ha;

SELECT CASE WHEN id IS NOT NULL AND id::text <> local_id THEN 'PASS' ELSE 'FAIL' END
       || ' | 1c. the cloud identity is a server-generated uuid, not the local id'
FROM public.tasks t, t74 WHERE t.household_id = t74.ha;

-- ----------------------------------------------------------------------------
-- 2. SAME install replays. This is the lost-acknowledgement seam: the server
--    committed and the answer never arrived, so the retry must settle on the
--    existing identity rather than duplicate.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.sync_push('tasks', 'd0000000-0000-4000-8000-00000000000a'::uuid,
         jsonb_build_object('household_id', ha, 'local_id', 'task-1', 'title', 'Rinse the recycling',
           'category_id', cat_a, 'duration_minutes', 10, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) ->> 'status') = 'already_exists'
       THEN 'PASS' ELSE 'FAIL' END || ' | 2. the SAME install replaying gets already_exists, not a second row'
FROM t74;
COMMIT;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 2b. the replay created NO duplicate (' || count(*)::text || ' row)'
FROM public.tasks t, t74 WHERE t.household_id = t74.ha;

-- ----------------------------------------------------------------------------
-- 3. SD4-006. A DIFFERENT install holding the same device-relative local id is
--    a distinct entity, never a merge.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
CREATE TEMP TABLE collide AS
SELECT public.sync_push('tasks', 'd0000000-0000-4000-8000-00000000000b'::uuid,
         jsonb_build_object('household_id', ha, 'local_id', 'task-1', 'title', 'Book the dentist',
           'category_id', cat_a, 'duration_minutes', 15, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household')) AS r
FROM t74;
SELECT CASE WHEN (r ->> 'status') = 'local_id_collision' THEN 'PASS' ELSE 'FAIL' END
       || ' | 3. a DIFFERENT install with the same local_id is reported as local_id_collision' FROM collide;
SELECT CASE WHEN (r ->> 'local_id') <> 'task-1' AND (r ->> 'local_id') LIKE 'task-1-x%' THEN 'PASS' ELSE 'FAIL' END
       || ' | 3b. the incoming row receives a freshly minted local_id' FROM collide;
COMMIT;

SELECT CASE WHEN count(*) = 2 AND count(DISTINCT id) = 2 AND count(DISTINCT title) = 2
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 3c. two DISTINCT rows survive: the collision never merged them (' || count(*)::text || ' rows)'
FROM public.tasks t, t74 WHERE t.household_id = t74.ha;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END
       || ' | 3d. the ORIGINAL row kept its local_id and its title, untouched'
FROM public.tasks t, t74
WHERE t.household_id = t74.ha AND t.local_id = 'task-1' AND t.title = 'Rinse the recycling';

-- ----------------------------------------------------------------------------
-- 4. Server-owned columns are never taken from the payload.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
CREATE TEMP TABLE owned AS
SELECT public.sync_push('tasks', 'd0000000-0000-4000-8000-00000000000a'::uuid,
         jsonb_build_object('household_id', ha, 'local_id', 'task-2', 'title', 'Water the plants',
           'category_id', cat_a, 'duration_minutes', 5, 'commitment', 'flexible',
           'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household',
           'id', '00000000-0000-4000-8000-000000000999',
           'revision', 42,
           'subject_member_type', 'child')) AS r
FROM t74;
SELECT CASE WHEN (r ->> 'cloud_id') <> '00000000-0000-4000-8000-000000000999'
             AND (r ->> 'revision') = '1'
            THEN 'PASS' ELSE 'FAIL' END
       || ' | 4. a client-supplied id and revision are ignored; the server owns both' FROM owned;
COMMIT;

SELECT CASE WHEN subject_member_type IS NULL THEN 'PASS' ELSE 'FAIL' END
       || ' | 4b. a client-supplied subject_member_type is stripped, and the trigger derives it'
FROM public.tasks t, t74 WHERE t.household_id = t74.ha AND t.local_id = 'task-2';

-- ----------------------------------------------------------------------------
-- 5. RLS is still the boundary. SECURITY INVOKER means the caller's policies
--    apply -- pushing into someone else's household is refused.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN herkeys_test.test_denied(format($q$
  SELECT public.sync_push('tasks', 'd0000000-0000-4000-8000-00000000000a'::uuid,
    jsonb_build_object('household_id', %L, 'local_id', 'task-sneak', 'title', 'Not mine',
      'category_id', %L, 'duration_minutes', 5, 'commitment', 'flexible',
      'plan_kind', 'unplanned', 'status', 'open', 'scope', 'household'))
$q$, hb, cat_a)) THEN 'PASS' ELSE 'FAIL' END
       || ' | 5. pushing into ANOTHER household is denied'
FROM t74;

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.sync_push('account_claims', 'd0000000-0000-4000-8000-00000000000a'::uuid, '{"household_id":"x"}'::jsonb)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 5b. a table outside the push allow-list is refused';

SELECT CASE WHEN herkeys_test.test_denied($q$
  SELECT public.sync_push('pg_class', 'd0000000-0000-4000-8000-00000000000a'::uuid, '{"household_id":"x"}'::jsonb)
$q$) THEN 'PASS' ELSE 'FAIL' END || ' | 5c. an arbitrary relation name is refused, not interpolated';
ROLLBACK;

SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
       || ' | 5d. household B gained nothing from any of it'
FROM public.tasks t, t74 WHERE t.household_id = t74.hb;

-- ----------------------------------------------------------------------------
-- 6. anon holds no push.
-- ----------------------------------------------------------------------------
SELECT CASE WHEN NOT has_function_privilege('anon', 'public.sync_push(text,uuid,jsonb)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.sync_push(text,uuid,jsonb)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END || ' | 6. sync_push is granted to authenticated and to nobody else';

SELECT CASE WHEN NOT prosecdef THEN 'PASS' ELSE 'FAIL' END
       || ' | 6b. sync_push is SECURITY INVOKER, so RLS still guards every row it writes'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'sync_push';

-- ----------------------------------------------------------------------------
-- 7. An owner-private table probes on ITS boundary, which includes profile_id.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-00000000000a"}';
SELECT CASE WHEN (public.sync_push('needs_me_items', 'd0000000-0000-4000-8000-00000000000a'::uuid,
         jsonb_build_object('household_id', ha, 'local_id', 'needsme-1', 'profile_id', 'a1000000-0000-4000-8000-00000000000a',
           'title', 'Call the dentist back', 'status', 'open', 'scope', 'personal',
           'origin_created_at', '2026-09-15T08:30:00Z')) ->> 'status') = 'created'
       THEN 'PASS' ELSE 'FAIL' END || ' | 7. an owner-private entity pushes on its own uniqueness boundary'
FROM t74;
COMMIT;

SELECT CASE WHEN count(*) = 1 AND max(profile_id::text) = 'a1000000-0000-4000-8000-00000000000a'
            THEN 'PASS' ELSE 'FAIL' END || ' | 7b. it landed under the caller''s own profile'
FROM public.needs_me_items n, t74 WHERE n.household_id = t74.ha;

-- ----------------------------------------------------------------------------
-- 8. Every push is visible to the pull cursor, because the change_log trigger
--    fires on an ordinary INSERT regardless of who performed it.
-- ----------------------------------------------------------------------------
SELECT CASE WHEN count(*) >= 3 THEN 'PASS' ELSE 'FAIL' END
       || ' | 8. pushed rows appear in change_log for the pull cursor (' || count(*)::text || ' entries)'
FROM public.change_log c, t74
WHERE c.household_id = t74.ha AND c.entity_table IN ('tasks', 'needs_me_items') AND c.op = 'upsert';
