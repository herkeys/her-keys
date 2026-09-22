-- HK-FEATURE-12 (Life Admin / Documents) — the RLS ATTACK MATRIX for public.life_records and public.life_record_task_links.
--
-- For both owner-private tables: unauthenticated DENIED, owner ALLOWED, same-household member DENIED, unrelated household (with valid
-- foreign ids) DENIED — across SELECT, INSERT, UPDATE and DELETE, crafted subjects, crafted link targets, relationship inference,
-- change-log / sync_pull leakage, sync_push probes and refusal payloads. Plus the stored-shape rules (CHECKs), the privilege
-- posture, and referential cleanup when a Task is purged.
\pset format unaligned
\pset tuples_only on

\set ua '11111111-1111-4111-8111-111111111111'
\set ub '22222222-2222-4222-8222-222222222222'
\set uc '33333333-3333-4333-8333-333333333333'

RESET ROLE;

CREATE OR REPLACE FUNCTION herkeys_test.f12_refusal(p_sql text)
  RETURNS text
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_state text; v_msg text; v_detail text; v_hint text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  RETURN v_state || ' ' || v_msg || ' | ' || coalesce(v_detail, '') || ' | ' || coalesce(v_hint, '');
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_refusal(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION herkeys_test.f12_rowcount(p_sql text)
  RETURNS integer
  LANGUAGE plpgsql
AS $fn$
DECLARE
  v_n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN OTHERS THEN
  RETURN -1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_rowcount(text) TO anon, authenticated;

-- A record row, stated as INSERT SQL. Every test names only what it varies.
CREATE OR REPLACE FUNCTION herkeys_test.f12_record_sql(p_house uuid, p_local text, p_owner uuid, p_over jsonb DEFAULT '{}'::jsonb)
  RETURNS text
  LANGUAGE sql
AS $fn$
  SELECT format(
    'INSERT INTO public.life_records (household_id, local_id, profile_id, title, record_kind, status, archived_at, scope, producer, subject_member_id, reference_number, note, type_name, origin_created_at, origin_updated_at) '
    || 'SELECT %L, %L, %L, r.title, r.record_kind, r.status, r.archived_at, r.scope, r.producer, r.subject_member_id, r.reference_number, r.note, r.type_name, now(), now() '
    || 'FROM jsonb_populate_record(NULL::public.life_records, %L::jsonb) r',
    p_house, p_local, p_owner,
    (jsonb_build_object('title', 'A record', 'record_kind', 'other', 'status', 'active', 'scope', 'personal', 'producer', 'user-action') || p_over)::text);
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_record_sql(uuid, text, uuid, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION herkeys_test.f12_link_sql(p_house uuid, p_local text, p_owner uuid, p_record uuid, p_task uuid)
  RETURNS text
  LANGUAGE sql
AS $fn$
  SELECT format(
    'INSERT INTO public.life_record_task_links (household_id, local_id, profile_id, life_record_id, task_id, relation, producer, scope, origin_created_at) '
    || 'VALUES (%L, %L, %L, %L, %L, %L, %L, %L, now())',
    p_house, p_local, p_owner, p_record, p_task, 'renewal', 'user-action', 'personal');
$fn$;
GRANT EXECUTE ON FUNCTION herkeys_test.f12_link_sql(uuid, text, uuid, uuid, uuid) TO anon, authenticated;

SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \gset
SELECT hm.household_id AS hh_c FROM public.household_members hm WHERE hm.profile_id = :'uc' AND hm.role = 'owner' \gset
SELECT id AS cat_a FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-home' \gset
SELECT id AS cat_c FROM public.household_categories WHERE household_id = :'hh_c' AND local_id = 'cat-home' \gset
SELECT id AS child_a FROM public.household_members WHERE household_id = :'hh_a' AND member_type = 'child' LIMIT 1 \gset
SELECT id AS member_b FROM public.household_members WHERE household_id = :'hh_a' AND profile_id = :'ub' \gset

-- ----------------------------------------------------------------------------------------------------------------------------------
-- Fixtures, written by their owners through the real policies.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.f12_rowcount(herkeys_test.f12_record_sql(:'hh_a', 'f12-rec-a', :'ua',
  jsonb_build_object('title', 'F12 PRIVATE PASSPORT', 'record_kind', 'credential', 'subject_member_id', :'child_a', 'reference_number', 'REFSENTINEL-11223344', 'note', 'NOTESENTINEL', 'type_name', 'Passport'))) AS a_rec \gset
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12-task-a', :'ua', 'Renew passport', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action'),
       (:'hh_a', 'f12-task-a2', :'ua', 'Second private task', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action');
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12-task-hh', NULL, 'Household task', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'household', 'user-action');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT herkeys_test.f12_rowcount(herkeys_test.f12_record_sql(:'hh_a', 'f12-rec-b', :'ub', jsonb_build_object('title', 'B OWN RECORD'))) AS b_rec \gset
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_a', 'f12-task-b', :'ub', 'B private task', :'cat_a', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
INSERT INTO public.tasks (household_id, local_id, owner_profile_id, title, category_id, duration_minutes, commitment, plan_kind, status, scope, producer)
VALUES (:'hh_c', 'f12-task-c', :'uc', 'C private task', :'cat_c', 15, 'flexible', 'unplanned', 'open', 'personal', 'user-action');
COMMIT;

RESET ROLE;
SELECT CASE WHEN :'a_rec' = '1' AND :'b_rec' = '1' THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: each member creates her own record through RLS';
SELECT id AS rec_a FROM public.life_records WHERE household_id = :'hh_a' AND local_id = 'f12-rec-a' \gset
SELECT id AS rec_b FROM public.life_records WHERE household_id = :'hh_a' AND local_id = 'f12-rec-b' \gset
SELECT id AS task_a FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12-task-a' \gset
SELECT id AS task_a2 FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12-task-a2' \gset
SELECT id AS task_hh FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12-task-hh' \gset
SELECT id AS task_b FROM public.tasks WHERE household_id = :'hh_a' AND local_id = 'f12-task-b' \gset
SELECT id AS task_c FROM public.tasks WHERE household_id = :'hh_c' AND local_id = 'f12-task-c' \gset

-- ----------------------------------------------------------------------------------------------------------------------------------
-- OWNER (USER A)
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-link-a', :'ua', :'rec_a', :'task_a')) IS NULL THEN 'PASS' ELSE 'FAIL' END
  || ' | F12 owner: ALLOW a link from her record to her personal Task';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: SELECT her record (subject set as a child by the server)'
  FROM public.life_records WHERE id = :'rec_a' AND subject_member_type = 'child';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: SELECT her link' FROM public.life_record_task_links WHERE life_record_id = :'rec_a';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.life_records SET title = %L, reference_number = NULL, note = NULL WHERE id = %L', 'F12 PRIVATE PASSPORT (renamed)', :'rec_a')) = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: UPDATE renames her record and CLEARS sensitive fields';
SELECT CASE WHEN (SELECT revision FROM public.life_records WHERE id = :'rec_a') = 2 THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: the server bumped the revision (CAS base)';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.life_records SET status = %L, archived_at = now() WHERE id = %L', 'archived', :'rec_a')) = 1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: UPDATE archives her record';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.life_records SET revision = 99 WHERE id = %L', :'rec_a')) = -1
             AND herkeys_test.f12_rowcount(format('UPDATE public.life_records SET profile_id = %L WHERE id = %L', :'ub', :'rec_a')) = -1
             AND herkeys_test.f12_rowcount(format('UPDATE public.life_records SET household_id = %L WHERE id = %L', :'hh_c', :'rec_a')) = -1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: server-owned and identity columns are not client-writable (revision, owner, household)';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('DELETE FROM public.life_records WHERE id = %L', :'rec_a')) = -1
             AND herkeys_test.f12_rowcount(format('DELETE FROM public.life_record_task_links WHERE life_record_id = %L', :'rec_a')) = -1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: no hard delete of a record or a link (no grant)';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.life_record_task_links SET task_id = %L WHERE life_record_id = %L', :'task_a2', :'rec_a')) = -1
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: a link is immutable (no UPDATE grant)';
ROLLBACK;

-- Stored-shape rules, asserted by REASON (the constraint that refused).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-1', :'ua', '{"title":"   "}')) LIKE '%life_records_title_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: a blank title is refused';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-2', :'ua', '{"record_kind":"passport"}')) LIKE '%life_records_record_kind_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: the kind is the bounded taxonomy (passport is a type name, not a kind)';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-3', :'ua', jsonb_build_object('type_name', repeat('t', 61)))) LIKE '%life_records_type_name_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: type name at most 60';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-4', :'ua', jsonb_build_object('reference_number', repeat('9', 65)))) LIKE '%life_records_reference_number_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: reference at most 64';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-5', :'ua', jsonb_build_object('note', repeat('n', 501)))) LIKE '%life_records_note_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: note at most 500';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-6', :'ua', '{"status":"archived"}')) LIKE '%life_records_archived_at_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: archived exactly when archived_at is set';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-7', :'ua', '{"status":"expired"}')) LIKE '%life_records_status_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: there is no stored "expired" status';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-8', :'ua', '{"scope":"household"}')) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: a record cannot be household-scoped';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-9', :'ua', '{"producer":"demo-seed"}')) LIKE '%life_records_producer_values_check%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: demo-seed provenance never reaches the cloud';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-10', :'ua', jsonb_build_object('subject_member_id', :'member_b'))) LIKE '%life_records_subject_member_fkey%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 subject: an ADULT member is never a record subject';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-bad-11', :'ua', jsonb_build_object('subject_member_id', 'eeeeeeee-0000-4000-8000-00000000000e'))) LIKE '%life_records_subject_member_fkey%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 subject: an id that names no child is refused';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-link-dup-1', :'ua', :'rec_a', :'task_a')) IS NULL
             AND herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-link-dup-2', :'ua', :'rec_a', :'task_a')) LIKE '%life_record_task_links_life_record_id_task_id_key%'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 CHECK: a Task is tied to a record once';
ROLLBACK;

-- Crafted link targets by the OWNER: only her own personal Task qualifies, and every other target gets the SAME refusal.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-x-none', :'ua', :'rec_a', 'eeeeeeee-0000-4000-8000-00000000000e')), ' | ', 1) AS refusal_none \gset
SELECT CASE WHEN :'refusal_none' LIKE '42501 life_record_task_links: that task cannot be linked%' THEN 'PASS' ELSE 'FAIL' END || ' | F12 link: a Task id that names nothing is refused by the guard';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-x-hh', :'ua', :'rec_a', :'task_hh')), ' | ', 1) = :'refusal_none'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 link: a HOUSEHOLD-visible Task is refused identically (private record -> private Task only)';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-x-b', :'ua', :'rec_a', :'task_b')), ' | ', 1) = :'refusal_none'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 link: another member''s personal Task is refused identically';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-x-c', :'ua', :'rec_a', :'task_c')), ' | ', 1) = :'refusal_none'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 link: another household''s Task is refused identically';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-x-recb', :'ua', :'rec_b', :'task_a')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 link: she cannot tie her Task to another member''s record';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- A creates the link for real, so the member and stranger probes below have something to fail to see.
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT herkeys_test.f12_rowcount(herkeys_test.f12_link_sql(:'hh_a', 'f12-link-a', :'ua', :'rec_a', :'task_a')) AS made_link \gset
COMMIT;
RESET ROLE;
SELECT id AS link_a FROM public.life_record_task_links WHERE household_id = :'hh_a' AND local_id = 'f12-link-a' \gset
SELECT CASE WHEN :'made_link' = '1' THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: the real link is committed';

-- ----------------------------------------------------------------------------------------------------------------------------------
-- SAME-HOUSEHOLD MEMBER (USER B)
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: DENY the owner''s record by id' FROM public.life_records WHERE id = :'rec_a';
SELECT CASE WHEN count(*) = 1 AND bool_and(profile_id = :'ub') THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: sees exactly her own record, no count of anyone else''s' FROM public.life_records;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: DENY every link (none are hers)' FROM public.life_record_task_links;
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: DENY the owner''s linked personal Task' FROM public.tasks WHERE id = :'task_a';
SELECT CASE WHEN herkeys_test.f12_rowcount(format('UPDATE public.life_records SET title = %L WHERE id = %L', 'B WAS HERE', :'rec_a')) IN (0, -1)
             AND herkeys_test.f12_rowcount(format('DELETE FROM public.life_records WHERE id = %L', :'rec_a')) IN (0, -1)
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: UPDATE / DELETE of the owner''s record touch nothing';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-forged', :'ua', '{"title":"FORGED"}')) LIKE '42501%' THEN 'PASS' ELSE 'FAIL' END
  || ' | F12 member: INSERT of a record in the owner''s name is refused (RLS)';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-1', :'ub', :'rec_a', :'task_b')), ' | ', 1)
               = split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-2', :'ub', 'eeeeeeee-0000-4000-8000-00000000000e', :'task_b')), ' | ', 1)
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: a link to the owner''s record is refused exactly like a link to a record that does not exist';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-3', :'ub', :'rec_b', :'task_a')), ' | ', 1)
               = split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-4', :'ub', :'rec_b', 'eeeeeeee-0000-4000-8000-00000000000e')), ' | ', 1)
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: a link to the owner''s PRIVATE Task is refused exactly like a Task that does not exist (known-id probe closed)';
SELECT CASE WHEN split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-5', :'ua', :'rec_a', :'task_a')), ' | ', 1)
               = split_part(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-6', :'ua', :'rec_a', 'eeeeeeee-0000-4000-8000-00000000000e')), ' | ', 1)
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: forging a link in the owner''s name answers the same whether her Task exists or not';
SELECT CASE WHEN position('SENTINEL' IN coalesce(herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_a', 'f12-b-7', :'ub', :'rec_a', :'task_a')), '')
                                         || coalesce(herkeys_test.f12_refusal(format('UPDATE public.life_records SET title = NULL WHERE id = %L', :'rec_a')), '')) = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: refusal payloads (message, DETAIL, HINT) carry no private value';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: change_log shows no pointer for the owner''s record or link'
  FROM public.change_log WHERE entity_id IN (:'rec_a', :'link_a', :'task_a');
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: change_log shows Life Admin pointers for her OWN record only (no count of the owner''s)'
  FROM public.change_log WHERE entity_table IN ('life_records', 'life_record_task_links');
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: sync_pull from 0 (hydration) delivers nothing of the owner''s record, link or Task'
  FROM jsonb_array_elements(public.sync_pull('0'::xid8, :'hh_a') -> 'rows') r WHERE r ->> 'entity_id' IN (:'rec_a', :'link_a', :'task_a');
SELECT CASE WHEN (public.sync_push('life_records', 'dddddddd-0000-4000-8000-0000000000b0'::uuid, jsonb_build_object(
         'household_id', :'hh_a', 'local_id', 'f12-rec-a', 'profile_id', :'ub', 'title', 'B second record', 'record_kind', 'other', 'status', 'active',
         'scope', 'personal', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())) ->> 'status') = 'created'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: sync_push reusing the owner''s local id is simply a new record of hers (no collision oracle)';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'life_records', 'dddddddd-0000-4000-8000-0000000000b0',
         jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12-forged-push', 'profile_id', :'ua', 'title', 'FORGED', 'record_kind', 'other', 'status', 'active',
           'scope', 'personal', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())::text)) LIKE '42501%'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: sync_push of a record in the owner''s name is refused';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'life_record_task_links', 'dddddddd-0000-4000-8000-0000000000b0',
         jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12-forged-link', 'profile_id', :'ub', 'life_record_id', :'rec_b', 'task_id', :'task_a', 'relation', 'renewal',
           'scope', 'personal', 'producer', 'user-action', 'origin_created_at', now())::text)) LIKE '42501 life_record_task_links: that task cannot be linked%'
      THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: sync_push of a link onto the owner''s private Task is refused by the guard';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- UNRELATED HOUSEHOLD (USER C), with valid foreign ids
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
SELECT CASE WHEN (SELECT count(*) FROM public.life_records WHERE id IN (:'rec_a', :'rec_b')) + (SELECT count(*) FROM public.life_record_task_links WHERE id = :'link_a') = 0
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: DENY the other household''s records and link by crafted id';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_c', 'f12-c-1', :'uc', jsonb_build_object('subject_member_id', :'child_a'))) LIKE '%life_records_subject_member_fkey%'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: a record in her household naming the other household''s child is refused (household-keyed subject FK)';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_record_sql(:'hh_a', 'f12-c-2', :'uc')) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: a record inside the other household is refused';
SELECT CASE WHEN herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_c', 'f12-c-3', :'uc', :'rec_a', :'task_c')) IS NOT NULL
             AND herkeys_test.f12_refusal(herkeys_test.f12_link_sql(:'hh_c', 'f12-c-4', :'uc', :'rec_a', :'task_a')) IS NOT NULL
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: links to the other household''s record or Task are refused';
SELECT CASE WHEN herkeys_test.f12_refusal(format('SELECT public.sync_pull(%L::xid8, %L::uuid)', '0', :'hh_a')) LIKE '42501%'
             AND herkeys_test.f12_refusal(format('SELECT public.sync_push(%L, %L::uuid, %L::jsonb)', 'life_records', 'dddddddd-0000-4000-8000-0000000000c0',
                   jsonb_build_object('household_id', :'hh_a', 'local_id', 'f12-rec-a', 'profile_id', :'uc', 'title', 'C', 'record_kind', 'other', 'status', 'active',
                     'scope', 'personal', 'producer', 'user-action', 'origin_created_at', now(), 'origin_updated_at', now())::text)) LIKE '42501%'
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: sync_pull and sync_push naming the other household are refused';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 stranger: change_log shows nothing of the other household' FROM public.change_log WHERE household_id = :'hh_a';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- UNAUTHENTICATED
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE anon;
SELECT CASE WHEN herkeys_test.test_denied('SELECT count(*) FROM public.life_records')
             AND herkeys_test.test_denied('SELECT count(*) FROM public.life_record_task_links')
             AND herkeys_test.test_denied(herkeys_test.f12_record_sql('aaaaaaaa-0000-4000-8000-00000000000a', 'f12-anon', '11111111-1111-4111-8111-111111111111'))
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 anon: SELECT and INSERT on both tables are refused';
ROLLBACK;

-- ----------------------------------------------------------------------------------------------------------------------------------
-- PRIVILEGE POSTURE (the fail-closed assertion already ran inside the migration; these name the specifics)
-- ----------------------------------------------------------------------------------------------------------------------------------
RESET ROLE;
SELECT CASE WHEN NOT has_table_privilege('anon', 'public.life_records', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             AND NOT has_table_privilege('anon', 'public.life_record_task_links', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 privileges: anon holds nothing on either table';
SELECT CASE WHEN NOT has_table_privilege('authenticated', 'public.life_records', 'DELETE, TRUNCATE, REFERENCES, TRIGGER')
             AND NOT has_table_privilege('authenticated', 'public.life_record_task_links', 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             AND NOT has_column_privilege('authenticated', 'public.life_records', 'revision', 'UPDATE')
             AND NOT has_column_privilege('authenticated', 'public.life_records', 'profile_id', 'UPDATE')
             AND NOT has_column_privilege('authenticated', 'public.life_records', 'subject_member_type', 'INSERT')
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 privileges: the client holds only the verbs and columns it uses';
SELECT CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.life_records'::regclass)
             AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.life_record_task_links'::regclass)
             AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_records') = 3
             AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'life_record_task_links') = 2
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('life_records', 'life_record_task_links') AND cmd = 'DELETE')
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 RLS: enabled on both tables; select/insert/update on records, select/insert on links, no delete policy';
SELECT CASE WHEN (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'guard_life_record_task_link')
             AND NOT has_function_privilege('anon', 'private.guard_life_record_task_link()', 'EXECUTE')
             AND (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'sync_push')
            THEN 'PASS' ELSE 'FAIL' END || ' | F12 functions: the link guard and sync_push run as the CALLER; anon cannot execute the guard';

-- ----------------------------------------------------------------------------------------------------------------------------------
-- LIFECYCLE: archive and purge stay private; a purged Task takes its link with it (no dangling link in the cloud).
-- ----------------------------------------------------------------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
UPDATE public.life_records SET status = 'archived', archived_at = now() WHERE id = :'rec_a';
COMMIT;
RESET ROLE;
DELETE FROM public.tasks WHERE id = :'task_a';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 purge: deleting a Task removes its link (referential cleanup, never a dangling row)'
  FROM public.life_record_task_links WHERE id = :'link_a';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12 purge: the record itself survives the Task''s purge (archived, intact)'
  FROM public.life_records WHERE id = :'rec_a' AND status = 'archived';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' | F12 owner: the link''s removal reaches her as a tombstone pointer'
  FROM public.change_log WHERE entity_id = :'link_a' AND op = 'tombstone';
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' | F12 member: no pointer for the archive or the link tombstone'
  FROM public.change_log WHERE entity_id IN (:'rec_a', :'link_a');
ROLLBACK;

-- Cleanup of this file's own rows, so the file stays self-contained when the whole ENV C suite runs.
RESET ROLE;
DELETE FROM public.life_record_task_links WHERE household_id IN (:'hh_a', :'hh_c');
DELETE FROM public.life_records WHERE household_id IN (:'hh_a', :'hh_c');
DELETE FROM public.tasks WHERE local_id LIKE 'f12-task-%';
