-- HER KEYS BUILD 4 SD4
-- DESIGN ONLY
-- NOT AUTHORIZED FOR EXECUTION
-- DO NOT MOVE INTO supabase/migrations WITHOUT OWNER APPROVAL
--
-- Companion documents:
--   docs/builds/BUILD4_SD4_CLOUD_SCHEMA.md   (decisions, rationale, RLS scenarios)
--   docs/builds/BUILD4_SD4_DELTA_MATRIX.md   (object-by-object delta from the baseline)
--
-- Baseline this is written against (NEVER altered by SD4):
--   supabase/migrations/20260919230054_build4_baseline.sql
--   gating digest c55d9b80d604211a5841260709b27f47 over 961 catalog facts
--
-- SHAPE OF THIS MIGRATION (SD4-041)
-- This is expressed as DROP-AND-RECREATE of the 14 application tables, not as a
-- sequence of ALTERs. That is only defensible because both Staging and Production
-- currently hold ZERO application rows and ZERO auth users (Phase 1, section 10).
-- Changing 14 text primary keys and 26 foreign keys to uuid in place would be a far
-- larger and less reviewable change than recreating empty tables.
--
-- THIS IS THEREFORE A DESTRUCTIVE MIGRATION. It carries a hard interlock (section 0)
-- that aborts if any application row or auth user exists. If the interlock ever fires,
-- this migration is VOID and an in-place ALTER migration must be designed instead.
--
-- NOT INCLUDED HERE (deliberately, per the SD4 gate):
--   - RLS is designed and expressed, but bootstrap/claim/sync/deletion RPC BODIES are not.
--     Only the signatures and the privilege posture they require are recorded.
--   - No Edge Function, no Auth configuration, no data.
--
-- ============================================================================
-- 0. INTERLOCK — refuse to run against a database that holds real data
-- ============================================================================

DO $interlock$
DECLARE
  t         text;
  n         bigint;
  total     bigint := 0;
  offenders text[] := ARRAY[]::text[];
  protected text[] := ARRAY[
    -- All 16 Build 4 application tables, schema-qualified, enumerated explicitly.
    -- 14 inherited from the Phase 1 baseline:
    'public.profiles',
    'public.households',
    'public.household_members',
    'public.household_categories',
    'public.events',
    'public.tasks',
    'public.household_systems',
    'public.meal_plan_entries',
    'public.onboarding_state',
    'public.one_move_records',
    'public.needs_me_items',
    'public.discovery_records',
    'public.discovery_answers',
    'public.action_records',
    -- 2 introduced by this migration (absent on a first run; guarded by to_regclass):
    'public.change_log',
    'public.account_claims',
    -- and the identity table, which is the one that matters most:
    'auth.users'
  ];
BEGIN
  FOREACH t IN ARRAY protected LOOP
    -- to_regclass returns NULL rather than raising when the relation does not exist,
    -- so a first run (no change_log, no account_claims) is handled without weakening
    -- the guard for a re-run.
    IF to_regclass(t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s', t) INTO n;
    IF n > 0 THEN
      offenders := offenders || format('%s=%s', t, n);
      total := total + n;
    END IF;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      'SD4 migration ABORTED: % row(s) present in protected relations [%]. '
      'This migration is destructive and is only valid against an empty database. '
      'Do NOT truncate, delete, or export-and-restore to satisfy this guard. '
      'Return to the owner for a non-destructive migration design.',
      total, array_to_string(offenders, ', ');
  END IF;
END
$interlock$;

-- ----------------------------------------------------------------------------
-- ATOMICITY INTERLOCK (HR-04)
--
-- The census above proves the database was empty at the moment it ran. It does NOT
-- by itself close the check-then-act window, nor guarantee that a failure midway
-- through the restructuring leaves no partial schema. Both of those need the whole
-- migration to be ONE transaction.
--
-- This statement makes that requirement self-enforcing rather than assumed.
-- PostgreSQL rejects LOCK TABLE outside a transaction block ("LOCK TABLE can only be
-- used in transaction blocks"), because the lock would otherwise be released at the
-- end of the statement. So:
--
--   * If the migration runner wraps this file in a transaction, the locks are taken
--     and held to COMMIT. No session can insert a row between the census and the DDL,
--     and any later failure rolls the whole restructuring back.
--   * If the runner does NOT wrap it, this statement ERRORS OUT HERE — before a single
--     piece of destructive DDL has run.
--
-- Either way the no-partial-restructure property holds. It is not claimed as proven:
-- implementation acceptance Test C exists to demonstrate it on an ephemeral local
-- database before any remote apply.
--
-- change_log and account_claims are omitted: they cannot exist on a first run, and
-- LOCK TABLE has no to_regclass-style tolerance for a missing relation. They are
-- created by this migration, so no other session can hold rows in them.
-- ----------------------------------------------------------------------------

LOCK TABLE
  public.profiles,
  public.households,
  public.household_members,
  public.household_categories,
  public.events,
  public.tasks,
  public.household_systems,
  public.meal_plan_entries,
  public.onboarding_state,
  public.one_move_records,
  public.needs_me_items,
  public.discovery_records,
  public.discovery_answers,
  public.action_records
IN ACCESS EXCLUSIVE MODE;

-- Re-census under the locks. Belt and braces: with ACCESS EXCLUSIVE held, this result
-- cannot change before the DDL below runs.
DO $interlock_locked$
DECLARE
  t         text;
  n         bigint;
  total     bigint := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.profiles','public.households','public.household_members',
    'public.household_categories','public.events','public.tasks',
    'public.household_systems','public.meal_plan_entries','public.onboarding_state',
    'public.one_move_records','public.needs_me_items','public.discovery_records',
    'public.discovery_answers','public.action_records','auth.users'
  ] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %s', t) INTO n;
    total := total + n;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      'SD4 migration ABORTED under lock: % row(s) appeared after the first census.', total;
  END IF;
END
$interlock_locked$;

-- ============================================================================
-- 1. TEARDOWN (empty database only — see interlock)
-- ============================================================================

-- Helper functions and policies below are created before some of the tables they
-- reference, exactly as the Phase 1 baseline does. Without this, PostgreSQL validates
-- a LANGUAGE sql function body at CREATE time and the forward references fail.
SET check_function_bodies = false;

DROP TABLE IF EXISTS public.change_log            CASCADE;
DROP TABLE IF EXISTS public.account_claims        CASCADE;
DROP TABLE IF EXISTS public.action_records        CASCADE;
DROP TABLE IF EXISTS public.discovery_answers     CASCADE;
DROP TABLE IF EXISTS public.discovery_records     CASCADE;
DROP TABLE IF EXISTS public.needs_me_items        CASCADE;
DROP TABLE IF EXISTS public.one_move_records      CASCADE;
DROP TABLE IF EXISTS public.onboarding_state      CASCADE;
DROP TABLE IF EXISTS public.meal_plan_entries     CASCADE;
DROP TABLE IF EXISTS public.household_systems     CASCADE;
DROP TABLE IF EXISTS public.tasks                 CASCADE;
DROP TABLE IF EXISTS public.events                CASCADE;
DROP TABLE IF EXISTS public.household_categories  CASCADE;
DROP TABLE IF EXISTS public.household_members     CASCADE;
DROP TABLE IF EXISTS public.households            CASCADE;
DROP TABLE IF EXISTS public.profiles              CASCADE;

DROP FUNCTION IF EXISTS private.is_household_member(text);

-- ============================================================================
-- 2. PRIVATE HELPERS FOR LATER RLS  (SD4-027)
--
-- Every helper: STABLE, SECURITY DEFINER, search_path pinned to '', EXECUTE revoked
-- from PUBLIC and anon, granted only to authenticated. Nothing relies on the stock
-- ALTER DEFAULT PRIVILEGES grants that the baseline still carries (B4-P0-040).
-- ============================================================================

CREATE FUNCTION private.is_household_member(p_household_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.profile_id = (SELECT auth.uid())
  );
$fn$;

CREATE FUNCTION private.is_household_owner(p_household_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.profile_id = (SELECT auth.uid())
      AND hm.role = 'owner'
  );
$fn$;

-- The scope-aware predicate (B4-P0-038 / OD-1). 'household' and 'child' rows are
-- visible to authorized household members. 'personal', 'professional' and
-- 'coparent-shared' rows are OWNER-ONLY for the whole of Build 4 — coparent-shared
-- is never permission to share with another account.
CREATE FUNCTION private.can_access_scoped_row(
  p_household_id     uuid,
  p_scope            text,
  p_owner_profile_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  SELECT private.is_household_member(p_household_id)
     AND (
          p_scope IN ('household', 'child')
       OR p_owner_profile_id = (SELECT auth.uid())
     );
$fn$;

-- The single household this account owns, or NULL. Used by the pull path so a device
-- never has to be told which household it belongs to.
CREATE FUNCTION private.current_household_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  SELECT hm.household_id
  FROM public.household_members hm
  WHERE hm.profile_id = (SELECT auth.uid())
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION private.is_household_member(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_household_owner(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_scoped_row(uuid, text, uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_household_id()                     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_household_member(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_household_id()                  TO authenticated;

-- ============================================================================
-- 3. SERVER-AUTHORITY TRIGGER FUNCTIONS  (SD4-010, SD4-011, SD4-020)
-- ============================================================================

-- Unchanged from the baseline in behavior; recreated here only because the tables are.
-- Sets server updated_at and increments server revision on every UPDATE. The client
-- NEVER writes revision or updated_at: that is enforced twice over, by this trigger
-- and by the column-level privileges in section 8.
CREATE OR REPLACE FUNCTION public.set_row_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  new.updated_at = now();
  IF tg_op = 'UPDATE' AND to_jsonb(new) ? 'revision' THEN
    new.revision = old.revision + 1;
  END IF;
  RETURN new;
END;
$fn$;

-- Cloud primary identity is server-generated and server-authoritative (B4-P0-004).
-- The DEFAULT alone is not enough: a client can still send an explicit id. This
-- trigger overwrites any client-supplied id on INSERT and pins it on UPDATE, so a
-- client-supplied cloud PK is impossible by construction rather than by convention.
CREATE FUNCTION public.force_server_owned_id()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.id = gen_random_uuid();
  ELSE
    new.id = old.id;
    new.household_id = old.household_id;
  END IF;
  RETURN new;
END;
$fn$;

-- The action ledger is append-only (B4-P0-039). RLS already withholds UPDATE and
-- DELETE from clients; this binds service_role and the table owner too, so a
-- mistaken privileged script cannot rewrite history. The only escape is the
-- account-deletion purge, which must announce itself (SD4-030).
CREATE FUNCTION public.forbid_ledger_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  IF coalesce(current_setting('herkeys.purge', true), '') = 'on' AND tg_op = 'DELETE' THEN
    RETURN old;
  END IF;
  RAISE EXCEPTION 'action_records is an immutable ledger: % is not permitted', tg_op;
END;
$fn$;

-- HR-03. The server, not the device, decides what "today" is.
--
-- logical_day is FROZEN at write time and is never recomputed from the current
-- profiles.timezone afterwards. A historical One Move keeps the day it was decided on
-- even if the account timezone later changes.
--
-- Two paths, because they have genuinely different requirements:
--
--   LIVE PATH (ordinary client insert through RLS): the trigger DERIVES logical_day
--   from now() in the authoritative profiles.timezone and ignores whatever the client
--   sent. A device with a stale cached timezone therefore cannot write a wrong day;
--   it either lands on the correct row or collides with it. There is no stale-timezone
--   race to reconcile because the client value is never trusted in the first place.
--
--   CLAIM PATH (bootstrap/claim RPC, which sets herkeys.claim = on): historical One
--   Move records uploaded from an existing local household keep their own past days.
--   A future day is still refused. Local Build 3 state records no timezone per One
--   Move, so timezone_at_decision for backfilled history is the profile timezone at
--   claim time -- evidence of interpretation, not of the original decision. That
--   limitation is recorded rather than papered over.
--
-- On UPDATE, logical_day and timezone_at_decision are pinned to their existing values,
-- so retargeting or completing a move can never move it to a different day.
CREATE FUNCTION public.set_one_move_logical_day()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_timezone text;
  v_today    date;
BEGIN
  IF tg_op = 'UPDATE' THEN
    new.logical_day          = old.logical_day;
    new.timezone_at_decision = old.timezone_at_decision;
    RETURN new;
  END IF;

  SELECT p.timezone INTO v_timezone
  FROM public.profiles p
  WHERE p.id = new.profile_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'one_move_records: no profile timezone for profile %', new.profile_id;
  END IF;

  v_today := (now() AT TIME ZONE v_timezone)::date;
  new.timezone_at_decision := v_timezone;

  IF coalesce(current_setting('herkeys.claim', true), '') = 'on' THEN
    -- Historical backfill: keep the supplied day, refuse anything in the future.
    IF new.logical_day > v_today THEN
      RAISE EXCEPTION
        'one_move_records: claim supplied a future logical_day % (account today is %)',
        new.logical_day, v_today;
    END IF;
  ELSE
    -- Live path: the server decides. The client value is discarded.
    new.logical_day := v_today;
  END IF;

  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_one_move_logical_day() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_row_updated_at()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.force_server_owned_id()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_ledger_mutation()  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. GLOBAL INCREMENTAL CHANGE CURSOR  (SD4-012, SD4-013)
--
-- This is NOT the per-row revision. Per-row revision answers "is my write stale?".
-- This answers "what has changed since I last looked?". Conflating them loses writes.
--
-- change_log is a POINTER log: it records that an entity changed, never its content.
-- The device re-reads the current row, so re-delivery is harmless and ordering within
-- a pull is irrelevant.
--
-- committed_xid is the cursor axis, NOT seq. See the proof in BUILD4_SD4_CLOUD_SCHEMA.md
-- section 6: a cursor on seq (or on updated_at) silently loses rows written by a
-- transaction that started earlier but committed later.
-- ============================================================================

CREATE TABLE public.change_log (
  seq              bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  household_id     uuid        NOT NULL,
  owner_profile_id uuid,
  entity_table     text        NOT NULL,
  entity_id        uuid        NOT NULL,
  op               text        NOT NULL,
  row_revision     bigint,
  committed_xid    xid8        NOT NULL DEFAULT pg_current_xact_id(),
  logged_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.change_log
  ADD CONSTRAINT change_log_op_check
  CHECK (op = ANY (ARRAY['upsert'::text, 'tombstone'::text]));

ALTER TABLE public.change_log
  ADD CONSTRAINT change_log_entity_table_check
  CHECK (entity_table = ANY (ARRAY[
    'households'::text, 'household_members'::text, 'household_categories'::text,
    'events'::text, 'tasks'::text, 'household_systems'::text, 'meal_plan_entries'::text,
    'onboarding_state'::text, 'one_move_records'::text, 'needs_me_items'::text,
    'discovery_records'::text, 'action_records'::text
  ]));

-- change_log_household_id_fkey is added in section 5, after households exists.

-- The household pull. Covers the cursor predicate and the ordering in one index.
CREATE INDEX change_log_household_cursor_idx
  ON public.change_log (household_id, committed_xid, seq);

-- The owner (personal-scope) pull.
CREATE INDEX change_log_owner_cursor_idx
  ON public.change_log (household_id, owner_profile_id, committed_xid, seq)
  WHERE owner_profile_id IS NOT NULL;

-- Retention pruning (SD4-013).
CREATE INDEX change_log_logged_at_idx ON public.change_log (logged_at);

-- Clients read the log; they can never write it. The writer is the SECURITY DEFINER
-- trigger below, so a client cannot forge or suppress a change entry.
REVOKE ALL ON TABLE public.change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.change_log TO authenticated;
GRANT ALL    ON TABLE public.change_log TO service_role;

CREATE POLICY change_log_select_scoped ON public.change_log
  FOR SELECT TO authenticated
  USING (
    private.is_household_member(household_id)
    AND (owner_profile_id IS NULL OR owner_profile_id = (SELECT auth.uid()))
  );

CREATE FUNCTION public.log_row_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_row     jsonb;
  v_house   uuid;
  v_owner   uuid;
  v_id      uuid;
  v_op      text;
  v_rev     bigint;
BEGIN
  v_row := to_jsonb(coalesce(new, old));

  -- TG_ARGV[0] names the column carrying the household id ('id' for households itself).
  v_house := (v_row ->> TG_ARGV[0])::uuid;

  -- TG_ARGV[1], when present, names the owning-profile column for owner-scoped pulls.
  IF TG_NARGS > 1 AND v_row ? TG_ARGV[1] THEN
    v_owner := (v_row ->> TG_ARGV[1])::uuid;
  END IF;

  IF v_row ? 'id' THEN
    v_id := (v_row ->> 'id')::uuid;
  ELSE
    -- onboarding_state has no surrogate key; its identity is (household, profile).
    v_id := (v_row ->> 'profile_id')::uuid;
  END IF;

  IF v_row ? 'revision' THEN
    v_rev := (v_row ->> 'revision')::bigint;
  END IF;

  v_op := CASE
            WHEN tg_op = 'DELETE' THEN 'tombstone'
            WHEN v_row ? 'deleted_at' AND v_row ->> 'deleted_at' IS NOT NULL THEN 'tombstone'
            ELSE 'upsert'
          END;

  INSERT INTO public.change_log
    (household_id, owner_profile_id, entity_table, entity_id, op, row_revision)
  VALUES
    (v_house, v_owner, tg_table_name, v_id, v_op, v_rev);

  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. IDENTITY AND HOUSEHOLD CORE
--
-- Column conventions used by every client-originated table from here down:
--
--   id                uuid, server-generated (SD4-001). Never client-supplied.
--   local_id          text, the local id of the originating device, kept verbatim
--                     (SD4-004). It is origin evidence and an idempotency key. It is
--                     NOT a stable cross-device handle: see SD4-006.
--   origin_device_id  uuid, which install first created the row. No device registry
--                     exists or is needed (SD4-037).
--   origin_created_at / origin_updated_at
--                     the LOCAL DOMAIN timestamps, nullable because Build 3 genuinely
--                     does not know them for older rows. Never defaulted. Keeping them
--                     separate from created_at/updated_at is what stops the server
--                     fabricating a history the device never had (SD4-011).
--   created_at / updated_at / revision
--                     server-owned row lifecycle. The client cannot write them
--                     (trigger + column privileges).
-- ============================================================================

CREATE TABLE public.profiles (
  id           uuid        NOT NULL,
  display_name text,
  timezone     text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  revision     bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_check
  CHECK (display_name IS NULL OR char_length(display_name) <= 80);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_timezone_check
  CHECK (char_length(timezone) >= 1 AND char_length(timezone) <= 64);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_revision_check CHECK (revision > 0);

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- SD4-003: no client INSERT. A profile exists only because bootstrap created it
-- inside the same transaction as the household, the owner membership and the starter
-- categories. Removing profiles_insert_own closes the "profile with no household"
-- orphan that the baseline permits.
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE TABLE public.households (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  display_name      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ADD CONSTRAINT households_pkey PRIMARY KEY (id);
ALTER TABLE public.households ADD CONSTRAINT households_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.households ADD CONSTRAINT households_display_name_check
  CHECK (display_name IS NULL OR char_length(display_name) <= 80);
ALTER TABLE public.households ADD CONSTRAINT households_revision_check CHECK (revision > 0);

-- NOTE: households.local_id is deliberately NOT unique. Every pristine install names
-- its household "household-1". Uniqueness here is per account, and it is enforced on
-- household_members below (SD4-023), not on this column.

CREATE TRIGGER households_set_updated_at BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER households_log_change AFTER INSERT OR UPDATE OR DELETE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('id');

-- SELECT only, exactly as the baseline. Households are created by the bootstrap/claim
-- RPC and by nothing else (B4-P0-029, B4-P0-039).
CREATE POLICY households_select_member ON public.households
  FOR SELECT TO authenticated USING (private.is_household_member(id));

-- Deferred from section 4: households now exists.
ALTER TABLE public.change_log
  ADD CONSTRAINT change_log_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

CREATE TABLE public.household_members (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  profile_id        uuid,
  member_type       text        NOT NULL,
  role              text        NOT NULL DEFAULT 'member',
  display_name      text        NOT NULL,
  birth_date        date,
  scope             text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_pkey PRIMARY KEY (id);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_id_household_id_key
  UNIQUE (id, household_id);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

-- SD4-029: CASCADE, not SET NULL. The SET NULL in the baseline leaves an adult member
-- row with no profile behind after account deletion, an orphan that no purge step
-- names and no CHECK forbids.
ALTER TABLE public.household_members ADD CONSTRAINT household_members_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.household_members ADD CONSTRAINT household_members_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_member_type_check
  CHECK (member_type = ANY (ARRAY['adult'::text, 'child'::text]));
ALTER TABLE public.household_members ADD CONSTRAINT household_members_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'member'::text]));
ALTER TABLE public.household_members ADD CONSTRAINT household_members_display_name_check
  CHECK (char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 80);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.household_members ADD CONSTRAINT household_members_revision_check
  CHECK (revision > 0);

-- SD4-029: an adult member IS an account; a child member never is. The baseline check
-- constrained only the child half.
ALTER TABLE public.household_members ADD CONSTRAINT household_members_check
  CHECK (
       (member_type = 'child' AND profile_id IS NULL     AND birth_date IS NOT NULL AND scope = 'child')
    OR (member_type = 'adult' AND profile_id IS NOT NULL AND birth_date IS NULL     AND scope = 'personal')
  );

ALTER TABLE public.household_members ADD CONSTRAINT household_members_household_id_local_id_key
  UNIQUE (household_id, local_id);

CREATE UNIQUE INDEX household_members_profile_per_household_uq
  ON public.household_members (household_id, profile_id) WHERE profile_id IS NOT NULL;

-- SD4-023, the two constraints that make a duplicate cloud household impossible:
-- an account owns at most one household, and a household has at most one owner.
CREATE UNIQUE INDEX household_members_one_household_per_owner_uq
  ON public.household_members (profile_id) WHERE role = 'owner' AND profile_id IS NOT NULL;
CREATE UNIQUE INDEX household_members_one_owner_per_household_uq
  ON public.household_members (household_id) WHERE role = 'owner';

CREATE INDEX household_members_profile_idx   ON public.household_members (profile_id);
CREATE INDEX household_members_household_idx ON public.household_members (household_id);

CREATE TRIGGER household_members_set_updated_at BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER household_members_log_change
  AFTER INSERT OR UPDATE OR DELETE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id');

-- SELECT only. Membership is privileged infrastructure: ordinary client sync can
-- never create, change or remove a membership (B4-P0-019).
CREATE POLICY household_members_select_member ON public.household_members
  FOR SELECT TO authenticated USING (private.is_household_member(household_id));

-- ============================================================================
-- 6. SCOPE-BEARING HOUSEHOLD CONTENT
--
-- owner_profile_id placement rule (SD4-009, implementing B4-P0-038 / OD-1):
--   scope IN ('personal','professional','coparent-shared')  ->  owner_profile_id NOT NULL
--   scope IN ('household','child')                          ->  owner_profile_id NULL
-- enforced by a CHECK on every one of these tables, so a private row can never be
-- created with no owner and a shared row can never carry a misleading one.
--
-- coparent-shared is OWNER-ONLY for the whole of Build 4. It is a private category
-- for co-parenting logistics, never a grant of access to another account (B4-P0-038).
-- ============================================================================

CREATE TABLE public.household_categories (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  owner_profile_id  uuid,
  name              text        NOT NULL,
  system_role       text,
  status            text        NOT NULL,
  sort_order        integer     NOT NULL,
  scope             text        NOT NULL,
  origin_created_at timestamptz,
  origin_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.household_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_id_household_id_key
  UNIQUE (id, household_id);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_household_id_local_id_key
  UNIQUE (household_id, local_id);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_name_check
  CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 60);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_sort_order_check
  CHECK (sort_order >= 0 AND sort_order <= 10000);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_system_role_check
  CHECK (system_role IS NULL OR (system_role = ANY (ARRAY['kids'::text, 'home'::text,
    'money'::text, 'meals'::text, 'work'::text, 'wellbeing'::text,
    'relationships'::text, 'coparenting'::text])));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_revision_check
  CHECK (revision > 0);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_owner_scope_check
  CHECK ((scope = ANY (ARRAY['personal'::text, 'professional'::text, 'coparent-shared'::text]))
         = (owner_profile_id IS NOT NULL));

-- B4-P0-057: the sort_order uniqueness stays NON-DEFERRABLE. User-facing category
-- reorder is out of Build 4 scope, so nothing needs to swap two sort orders inside a
-- transaction. Bootstrap and claim insert the eight starter categories in ONE
-- multi-row INSERT with distinct sort orders 0..7, which never transiently collides.
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_household_id_sort_order_key
  UNIQUE (household_id, sort_order);

CREATE INDEX household_categories_household_idx ON public.household_categories (household_id);
CREATE UNIQUE INDEX household_categories_system_role_uq
  ON public.household_categories (household_id, system_role) WHERE system_role IS NOT NULL;
CREATE INDEX household_categories_owner_idx
  ON public.household_categories (household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;

CREATE TRIGGER household_categories_force_id BEFORE INSERT OR UPDATE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER household_categories_log_change
  AFTER INSERT OR UPDATE OR DELETE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'owner_profile_id');

CREATE POLICY categories_select_scoped ON public.household_categories
  FOR SELECT TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY categories_insert_scoped ON public.household_categories
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY categories_update_scoped ON public.household_categories
  FOR UPDATE TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id))
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));

CREATE TABLE public.events (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id          uuid        NOT NULL,
  local_id              text        NOT NULL,
  origin_device_id      uuid,
  owner_profile_id      uuid,
  title                 text        NOT NULL,
  category_id           uuid        NOT NULL,
  subject_member_id     uuid,
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  location              text,
  notes                 text,
  commitment            text        NOT NULL,
  status                text        NOT NULL,
  travel_minutes_before integer,
  travel_minutes_after  integer,
  preparation_minutes   integer,
  source                text        NOT NULL DEFAULT 'user',
  scope                 text        NOT NULL,
  origin_created_at     timestamptz,
  origin_updated_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  revision              bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_category_id_household_id_fkey
  FOREIGN KEY (category_id, household_id)
  REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD CONSTRAINT events_subject_member_id_household_id_fkey
  FOREIGN KEY (subject_member_id, household_id)
  REFERENCES public.household_members(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD CONSTRAINT events_household_id_local_id_key
  UNIQUE (household_id, local_id);
ALTER TABLE public.events ADD CONSTRAINT events_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.events ADD CONSTRAINT events_check CHECK (ends_at > starts_at);
ALTER TABLE public.events ADD CONSTRAINT events_title_check
  CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.events ADD CONSTRAINT events_location_check
  CHECK (location IS NULL OR char_length(location) <= 200);
ALTER TABLE public.events ADD CONSTRAINT events_notes_check
  CHECK (notes IS NULL OR char_length(notes) <= 1000);
ALTER TABLE public.events ADD CONSTRAINT events_commitment_check
  CHECK (commitment = ANY (ARRAY['fixed'::text, 'flexible'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'removed'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_travel_minutes_before_check
  CHECK (travel_minutes_before IS NULL OR (travel_minutes_before >= 0 AND travel_minutes_before <= 240));
ALTER TABLE public.events ADD CONSTRAINT events_travel_minutes_after_check
  CHECK (travel_minutes_after IS NULL OR (travel_minutes_after >= 0 AND travel_minutes_after <= 240));
ALTER TABLE public.events ADD CONSTRAINT events_preparation_minutes_check
  CHECK (preparation_minutes IS NULL OR (preparation_minutes >= 0 AND preparation_minutes <= 240));
ALTER TABLE public.events ADD CONSTRAINT events_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.events ADD CONSTRAINT events_revision_check CHECK (revision > 0);
-- NOTE (NHR-01, HR-01 re-review): the Build 3 local invariant "a child-scoped record
-- must name a real child" has NO cloud counterpart here. A constraint closing it is
-- proposed in the owner-resolution report and is deliberately NOT applied, because
-- this pass is authorized for the four owner decisions only.
ALTER TABLE public.events ADD CONSTRAINT events_owner_scope_check
  CHECK ((scope = ANY (ARRAY['personal'::text, 'professional'::text, 'coparent-shared'::text]))
         = (owner_profile_id IS NOT NULL));

-- SD4-019: the baseline still allows source = 'demo'. Demo households never sync
-- (B4-P0-010), so the cloud must not be able to hold a demo row at all. Narrowing the
-- CHECK makes that fail closed at the database rather than depending on a client
-- filter. The column is kept for shape parity with local state and future sources.
ALTER TABLE public.events ADD CONSTRAINT events_source_check
  CHECK (source = 'user'::text);

CREATE INDEX events_household_time_idx        ON public.events (household_id, starts_at, ends_at);
CREATE INDEX events_category_idx              ON public.events (category_id);
CREATE INDEX events_category_household_fk_idx ON public.events (category_id, household_id);
CREATE INDEX events_subject_member_idx        ON public.events (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX events_subject_household_fk_idx  ON public.events (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX events_owner_idx                 ON public.events (household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;

CREATE TRIGGER events_force_id BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER events_log_change AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'owner_profile_id');

CREATE POLICY events_select_scoped ON public.events
  FOR SELECT TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY events_insert_scoped ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY events_update_scoped ON public.events
  FOR UPDATE TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id))
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));

CREATE TABLE public.tasks (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  owner_profile_id  uuid,
  title             text        NOT NULL,
  category_id       uuid        NOT NULL,
  subject_member_id uuid,
  duration_minutes  integer     NOT NULL,
  commitment        text        NOT NULL,
  due_date          date,
  plan_kind         text        NOT NULL,
  planned_date      date,
  planned_starts_at timestamptz,
  notes             text,
  status            text        NOT NULL,
  completed_at      timestamptz,
  scope             text        NOT NULL,
  origin_created_at timestamptz,
  origin_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_id_household_id_fkey
  FOREIGN KEY (category_id, household_id)
  REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_subject_member_id_household_id_fkey
  FOREIGN KEY (subject_member_id, household_id)
  REFERENCES public.household_members(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_household_id_local_id_key
  UNIQUE (household_id, local_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_title_check
  CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_notes_check
  CHECK (notes IS NULL OR char_length(notes) <= 1000);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_duration_minutes_check
  CHECK (duration_minutes >= 0 AND duration_minutes <= 1440);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_commitment_check
  CHECK (commitment = ANY (ARRAY['fixed'::text, 'flexible'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_plan_kind_check
  CHECK (plan_kind = ANY (ARRAY['unplanned'::text, 'day'::text, 'timed'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_check
  CHECK ((plan_kind = 'unplanned' AND planned_date IS NULL     AND planned_starts_at IS NULL)
      OR (plan_kind = 'day'       AND planned_date IS NOT NULL AND planned_starts_at IS NULL)
      OR (plan_kind = 'timed'     AND planned_date IS NULL     AND planned_starts_at IS NOT NULL));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY['open'::text, 'completed'::text, 'archived'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_check1
  CHECK ((status = 'completed'::text) = (completed_at IS NOT NULL));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_revision_check CHECK (revision > 0);
-- NOTE (NHR-01): see the equivalent note on events. Not applied in this pass.
ALTER TABLE public.tasks ADD CONSTRAINT tasks_owner_scope_check
  CHECK ((scope = ANY (ARRAY['personal'::text, 'professional'::text, 'coparent-shared'::text]))
         = (owner_profile_id IS NOT NULL));

CREATE INDEX tasks_household_status_due_idx     ON public.tasks (household_id, status, due_date);
CREATE INDEX tasks_household_planned_date_idx   ON public.tasks (household_id, planned_date) WHERE planned_date IS NOT NULL;
CREATE INDEX tasks_household_planned_start_idx  ON public.tasks (household_id, planned_starts_at) WHERE planned_starts_at IS NOT NULL;
CREATE INDEX tasks_category_idx                 ON public.tasks (category_id);
CREATE INDEX tasks_category_household_fk_idx    ON public.tasks (category_id, household_id);
CREATE INDEX tasks_subject_member_idx           ON public.tasks (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX tasks_subject_household_fk_idx     ON public.tasks (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX tasks_owner_idx                    ON public.tasks (household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;

CREATE TRIGGER tasks_force_id BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER tasks_log_change AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'owner_profile_id');

CREATE POLICY tasks_select_scoped ON public.tasks
  FOR SELECT TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY tasks_insert_scoped ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY tasks_update_scoped ON public.tasks
  FOR UPDATE TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id))
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));

CREATE TABLE public.household_systems (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  owner_profile_id  uuid,
  name              text        NOT NULL,
  description       text        NOT NULL,
  category_id       uuid        NOT NULL,
  scope             text        NOT NULL,
  origin_created_at timestamptz,
  origin_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.household_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_pkey PRIMARY KEY (id);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_category_id_household_id_fkey
  FOREIGN KEY (category_id, household_id)
  REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_household_id_local_id_key
  UNIQUE (household_id, local_id);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_name_check
  CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 120);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_description_check
  CHECK (char_length(description) <= 500);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_revision_check
  CHECK (revision > 0);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_owner_scope_check
  CHECK ((scope = ANY (ARRAY['personal'::text, 'professional'::text, 'coparent-shared'::text]))
         = (owner_profile_id IS NOT NULL));

CREATE INDEX household_systems_household_idx           ON public.household_systems (household_id);
CREATE INDEX household_systems_category_idx            ON public.household_systems (category_id);
CREATE INDEX household_systems_category_household_fk_idx ON public.household_systems (category_id, household_id);
CREATE INDEX household_systems_owner_idx               ON public.household_systems (household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;

CREATE TRIGGER household_systems_force_id BEFORE INSERT OR UPDATE ON public.household_systems
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER household_systems_set_updated_at BEFORE UPDATE ON public.household_systems
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER household_systems_log_change AFTER INSERT OR UPDATE OR DELETE ON public.household_systems
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'owner_profile_id');

CREATE POLICY systems_select_scoped ON public.household_systems
  FOR SELECT TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY systems_insert_scoped ON public.household_systems
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY systems_update_scoped ON public.household_systems
  FOR UPDATE TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id))
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));

CREATE TABLE public.meal_plan_entries (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  owner_profile_id  uuid,
  meal_date         date        NOT NULL,
  title             text        NOT NULL,
  category_id       uuid        NOT NULL,
  scope             text        NOT NULL,
  origin_created_at timestamptz,
  origin_updated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_owner_profile_id_fkey
  FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_category_id_household_id_fkey
  FOREIGN KEY (category_id, household_id)
  REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_household_id_local_id_key
  UNIQUE (household_id, local_id);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_title_check
  CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_scope_check
  CHECK (scope = ANY (ARRAY['personal'::text, 'household'::text, 'child'::text,
                            'coparent-shared'::text, 'professional'::text]));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_revision_check
  CHECK (revision > 0);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_owner_scope_check
  CHECK ((scope = ANY (ARRAY['personal'::text, 'professional'::text, 'coparent-shared'::text]))
         = (owner_profile_id IS NOT NULL));

CREATE INDEX meal_plan_entries_household_date_idx      ON public.meal_plan_entries (household_id, meal_date);
CREATE INDEX meal_plan_entries_category_idx            ON public.meal_plan_entries (category_id);
CREATE INDEX meal_plan_entries_category_household_fk_idx ON public.meal_plan_entries (category_id, household_id);
CREATE INDEX meal_plan_entries_owner_idx               ON public.meal_plan_entries (household_id, owner_profile_id) WHERE owner_profile_id IS NOT NULL;

CREATE TRIGGER meal_plan_entries_force_id BEFORE INSERT OR UPDATE ON public.meal_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER meal_plan_entries_set_updated_at BEFORE UPDATE ON public.meal_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER meal_plan_entries_log_change AFTER INSERT OR UPDATE OR DELETE ON public.meal_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'owner_profile_id');

CREATE POLICY meals_select_scoped ON public.meal_plan_entries
  FOR SELECT TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY meals_insert_scoped ON public.meal_plan_entries
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));
CREATE POLICY meals_update_scoped ON public.meal_plan_entries
  FOR UPDATE TO authenticated
  USING (private.can_access_scoped_row(household_id, scope, owner_profile_id))
  WITH CHECK (private.can_access_scoped_row(household_id, scope, owner_profile_id));

-- ============================================================================
-- 7. OWNER-PRIVATE TABLES
--
-- These five tables are scope-pinned to 'personal' exactly as in the baseline, and
-- they carry profile_id directly, so owner_profile_id would be a duplicate column.
-- profile_id IS the owner attribution here (SD4-009).
--
-- local_id uniqueness on these tables is (household_id, profile_id, local_id): the
-- uniqueness boundary follows the ownership boundary (SD4-004).
-- ============================================================================

CREATE TABLE public.onboarding_state (
  household_id  uuid        NOT NULL,
  profile_id    uuid        NOT NULL,
  goal_ids      text[]      NOT NULL DEFAULT '{}'::text[],
  strength_ids  text[]      NOT NULL DEFAULT '{}'::text[],
  struggle_ids  text[]      NOT NULL DEFAULT '{}'::text[],
  last_step     text,
  completed_at  timestamptz,
  scope         text        NOT NULL DEFAULT 'personal',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_pkey
  PRIMARY KEY (household_id, profile_id);
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_last_step_check
  CHECK (last_step IS NULL OR (last_step = ANY (ARRAY['goals'::text, 'strengths'::text,
    'struggles'::text, 'talk-it-out'::text, 'profile'::text, 'plus'::text])));
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_scope_check
  CHECK (scope = 'personal'::text);
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_revision_check
  CHECK (revision > 0);

-- Local state caps each list at 50 entries; the cloud must not accept more.
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_list_bounds_check
  CHECK (cardinality(goal_ids) <= 50
     AND cardinality(strength_ids) <= 50
     AND cardinality(struggle_ids) <= 50);

CREATE INDEX onboarding_state_profile_idx ON public.onboarding_state (profile_id);

CREATE TRIGGER onboarding_set_updated_at BEFORE UPDATE ON public.onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER onboarding_state_log_change AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY onboarding_select_own ON public.onboarding_state
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY onboarding_insert_own ON public.onboarding_state
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY onboarding_update_own ON public.onboarding_state
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- ----------------------------------------------------------------------------
-- One Move (SD4-016, SD4-017, SD4-018) — resolves B4-P0-059
--
-- Status machine, and the ONLY legal transitions:
--     (none)    -> selected | withheld
--     selected  -> selected (retarget) | completed | cleared
--     withheld  -> cleared
--     cleared   -> selected
--     completed -> (terminal; a completed move is never replaced)
--
-- 'cleared' is the addition. Build 3 physically REMOVES the local record when an
-- unfinished move loses its target and no replacement candidate exists. A physical
-- delete is invisible to a second device (B4-P0-024), so the cloud models it as a
-- status, not as a row disappearance. No deleted_at column is needed here, because
-- the row is uniquely keyed by (household, profile, logical_day) and is revived in place.
--
-- Targets are TYPED, not polymorphic. target_type = 'catalog' is REJECTED outright:
-- the catalog exists only in demo households, and demo never syncs (B4-P0-010).
-- ----------------------------------------------------------------------------

CREATE TABLE public.one_move_records (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id        uuid        NOT NULL,
  local_id            text        NOT NULL,
  origin_device_id    uuid,
  profile_id          uuid        NOT NULL,
  logical_day         date        NOT NULL,
  timezone_at_decision text       NOT NULL,
  target_type         text        NOT NULL,
  target_task_id      uuid,
  target_needs_me_id  uuid,
  status              text        NOT NULL,
  decided_at          timestamptz NOT NULL,
  completed_at        timestamptz,
  cleared_at          timestamptz,
  scope               text        NOT NULL DEFAULT 'personal',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revision            bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.one_move_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_pkey PRIMARY KEY (id);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- CASCADE, deliberately, not RESTRICT. Both of these tables already cascade from
-- households, and a RESTRICT between two siblings of the same cascade can make a
-- household delete fail depending on the order PostgreSQL picks. A One Move record
-- is meaningless without its target, so cascading is also the correct semantics.
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_task_id_fkey
  FOREIGN KEY (target_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
-- one_move_records_target_needs_me_id_fkey is added after needs_me_items is created,
-- further down in this section.

-- THE One Move uniqueness constraint (HR-03).
-- timezone_at_decision is deliberately NOT part of this key. It is historical
-- evidence only; including it would let the same product logical day acquire a
-- second row merely because the profile timezone string changed.
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_profile_logical_day_key
  UNIQUE (household_id, profile_id, logical_day);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_household_id_profile_id_local_id_key
  UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_scope_check
  CHECK (scope = 'personal'::text);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_revision_check
  CHECK (revision > 0);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_timezone_at_decision_check
  CHECK (char_length(timezone_at_decision) >= 1 AND char_length(timezone_at_decision) <= 64);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_status_check
  CHECK (status = ANY (ARRAY['selected'::text, 'completed'::text,
                             'withheld'::text, 'cleared'::text]));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_type_check
  CHECK (target_type = ANY (ARRAY['task'::text, 'needsMe'::text]));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_shape_check
  CHECK (
    CASE
      WHEN status IN ('withheld', 'cleared')
        THEN target_task_id IS NULL AND target_needs_me_id IS NULL
      WHEN target_type = 'task'
        THEN target_task_id IS NOT NULL AND target_needs_me_id IS NULL
      ELSE target_needs_me_id IS NOT NULL AND target_task_id IS NULL
    END
  );
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_completed_at_check
  CHECK ((status = 'completed'::text) = (completed_at IS NOT NULL));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_cleared_at_check
  CHECK ((status = 'cleared'::text) = (cleared_at IS NOT NULL));

-- The logical-day lookup a second device performs on sign-in.
CREATE INDEX one_move_records_profile_day_idx
  ON public.one_move_records (household_id, profile_id, logical_day DESC);
CREATE INDEX one_move_records_target_task_idx
  ON public.one_move_records (target_task_id) WHERE target_task_id IS NOT NULL;
CREATE INDEX one_move_records_target_needs_me_idx
  ON public.one_move_records (target_needs_me_id) WHERE target_needs_me_id IS NOT NULL;

CREATE TRIGGER one_move_records_set_logical_day BEFORE INSERT OR UPDATE ON public.one_move_records
  FOR EACH ROW EXECUTE FUNCTION public.set_one_move_logical_day();
CREATE TRIGGER one_move_records_force_id BEFORE INSERT OR UPDATE ON public.one_move_records
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER one_move_set_updated_at BEFORE UPDATE ON public.one_move_records
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER one_move_records_log_change AFTER INSERT OR UPDATE OR DELETE ON public.one_move_records
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY one_move_select_own ON public.one_move_records
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY one_move_insert_own ON public.one_move_records
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY one_move_update_own ON public.one_move_records
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

CREATE TABLE public.needs_me_items (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  profile_id        uuid        NOT NULL,
  title             text        NOT NULL,
  status            text        NOT NULL,
  due_date          date,
  category_id       uuid,
  scope             text        NOT NULL DEFAULT 'personal',
  origin_created_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.needs_me_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_pkey PRIMARY KEY (id);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_category_id_household_id_fkey
  FOREIGN KEY (category_id, household_id)
  REFERENCES public.household_categories(id, household_id) ON DELETE RESTRICT;
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_household_id_profile_id_local_id_key
  UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_title_check
  CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_status_check
  CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text]));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_scope_check
  CHECK (scope = 'personal'::text);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_revision_check
  CHECK (revision > 0);

-- Deferred from the One Move block above: needs_me_items now exists.
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_needs_me_id_fkey
  FOREIGN KEY (target_needs_me_id) REFERENCES public.needs_me_items(id) ON DELETE CASCADE;

CREATE INDEX needs_me_items_household_status_idx
  ON public.needs_me_items (household_id, profile_id, status, origin_created_at DESC);
CREATE INDEX needs_me_items_profile_idx ON public.needs_me_items (profile_id);
CREATE INDEX needs_me_items_category_household_fk_idx
  ON public.needs_me_items (category_id, household_id) WHERE category_id IS NOT NULL;

CREATE TRIGGER needs_me_items_force_id BEFORE INSERT OR UPDATE ON public.needs_me_items
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER needs_me_set_updated_at BEFORE UPDATE ON public.needs_me_items
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER needs_me_items_log_change AFTER INSERT OR UPDATE OR DELETE ON public.needs_me_items
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY needs_me_select_own ON public.needs_me_items
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY needs_me_insert_own ON public.needs_me_items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY needs_me_update_own ON public.needs_me_items
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- ----------------------------------------------------------------------------
-- Talk It Out (SD4-014)
--
-- Structured answers ONLY. There is no transcript column and there must never be
-- one: local state has no such field, and B4-P0-030 forbids uploading her words.
--
-- deleted_at is the tombstone. Build 3 clears discovery to null; a hard delete would
-- be invisible to a second device that is offline at the time (B4-P0-024).
-- ----------------------------------------------------------------------------

CREATE TABLE public.discovery_records (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  profile_id        uuid        NOT NULL,
  topic_id          text        NOT NULL,
  scope             text        NOT NULL DEFAULT 'personal',
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint      NOT NULL DEFAULT 1
);

ALTER TABLE public.discovery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_pkey PRIMARY KEY (id);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_household_id_profile_id_key
  UNIQUE (household_id, profile_id);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_topic_id_check
  CHECK (topic_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_scope_check
  CHECK (scope = 'personal'::text);
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_revision_check
  CHECK (revision > 0);

CREATE INDEX discovery_records_profile_idx ON public.discovery_records (profile_id);

CREATE TRIGGER discovery_records_force_id BEFORE INSERT OR UPDATE ON public.discovery_records
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER discovery_set_updated_at BEFORE UPDATE ON public.discovery_records
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER discovery_records_log_change AFTER INSERT OR UPDATE OR DELETE ON public.discovery_records
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');

CREATE POLICY discovery_select_own ON public.discovery_records
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY discovery_insert_own ON public.discovery_records
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY discovery_update_own ON public.discovery_records
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

CREATE TABLE public.discovery_answers (
  discovery_id uuid     NOT NULL,
  answer_order smallint NOT NULL,
  question_id  text     NOT NULL,
  option_id    text     NOT NULL
);

ALTER TABLE public.discovery_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_pkey
  PRIMARY KEY (discovery_id, answer_order);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_discovery_id_fkey
  FOREIGN KEY (discovery_id) REFERENCES public.discovery_records(id) ON DELETE CASCADE;
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_discovery_id_question_id_key
  UNIQUE (discovery_id, question_id);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_answer_order_check
  CHECK (answer_order >= 1 AND answer_order <= 2);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_question_id_check
  CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.discovery_answers ADD CONSTRAINT discovery_answers_option_id_check
  CHECK (option_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);

-- No change_log trigger here, and no revision column: an answer has no independent
-- existence. Answers are always read and written through their parent record, and the
-- parent is what the change cursor reports (SD4-012).

CREATE POLICY discovery_answers_select_own ON public.discovery_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.discovery_records d
                 WHERE d.id = discovery_answers.discovery_id
                   AND d.profile_id = (SELECT auth.uid())
                   AND private.is_household_member(d.household_id)));
CREATE POLICY discovery_answers_insert_own ON public.discovery_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.discovery_records d
                      WHERE d.id = discovery_answers.discovery_id
                        AND d.profile_id = (SELECT auth.uid())
                        AND private.is_household_member(d.household_id)));
CREATE POLICY discovery_answers_update_own ON public.discovery_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.discovery_records d
                 WHERE d.id = discovery_answers.discovery_id
                   AND d.profile_id = (SELECT auth.uid())
                   AND private.is_household_member(d.household_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.discovery_records d
                      WHERE d.id = discovery_answers.discovery_id
                        AND d.profile_id = (SELECT auth.uid())
                        AND private.is_household_member(d.household_id)));
CREATE POLICY discovery_answers_delete_own ON public.discovery_answers
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.discovery_records d
                 WHERE d.id = discovery_answers.discovery_id
                   AND d.profile_id = (SELECT auth.uid())
                   AND private.is_household_member(d.household_id)));

-- ----------------------------------------------------------------------------
-- The action ledger (SD4-007, SD4-008, SD4-020, SD4-021, SD4-025)
--
-- References inside this table are CLOUD uuids, not local ids. The Phase 0 sketch
-- (B4-P0-009) proposed keeping them in the local id namespace; that is unsafe once a
-- second device exists, because a local id is only meaningful on the device that
-- minted it (SD4-006). A ledger row written by device A and read by device B would
-- name ids B cannot resolve, and Build 3 local integrity checking rejects exactly
-- that, refusing the whole state write.
--
-- target_id is a SOFT reference with no foreign key, deliberately: the ledger records
-- what happened, and it must survive its subject being archived or removed. Nothing
-- is ever hard-deleted, so the referent remains readable.
--
-- The four reference paths inside reason are the complete manifest the sync engine
-- translates in both directions:
--     reason.windowBeforeEventId      reason.windowAfterEventId
--     reason.recommendedTaskId        reason.consideredTaskId
-- before_state and after_state contain no references at all (verified against the
-- seven action schemas in src/domain/state.ts).
-- ----------------------------------------------------------------------------

CREATE TABLE public.action_records (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL,
  local_id          text        NOT NULL,
  origin_device_id  uuid,
  actor_profile_id  uuid        NOT NULL,
  logical_date      date        NOT NULL,
  action_type       text        NOT NULL,
  approval          text        NOT NULL,
  target_type       text,
  target_id         uuid,
  payload_version   smallint    NOT NULL DEFAULT 1,
  reason            jsonb       NOT NULL,
  before_state      jsonb,
  after_state       jsonb,
  source            text        NOT NULL DEFAULT 'her_keys_recommendation',
  scope             text        NOT NULL DEFAULT 'personal',
  origin_created_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_records ADD CONSTRAINT action_records_pkey PRIMARY KEY (id);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

-- RESTRICT is intentional: a profile must not vanish out from under the ledger.
-- The account-deletion purge therefore has a mandatory order (SD4-030).
ALTER TABLE public.action_records ADD CONSTRAINT action_records_actor_profile_id_fkey
  FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.action_records ADD CONSTRAINT action_records_household_id_actor_local_id_key
  UNIQUE (household_id, actor_profile_id, local_id);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_local_id_check
  CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_action_type_check
  CHECK (action_type = ANY (ARRAY['daily_load.move_task'::text, 'daily_load.keep_plan'::text,
    'daily_load.move_event'::text, 'daily_load.drop_task'::text, 'daily_load.shorten_task'::text,
    'daily_load.keep_capacity_plan'::text, 'daily_load.protect_item'::text]));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_approval_check
  CHECK (approval = ANY (ARRAY['approved'::text, 'declined'::text]));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_target_type_check
  CHECK (target_type IS NULL OR (target_type = ANY (ARRAY['task'::text, 'event'::text])));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_source_check
  CHECK (source = 'her_keys_recommendation'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_scope_check
  CHECK (scope = 'personal'::text);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_payload_version_check
  CHECK (payload_version = 1);

-- SD4-025. The baseline accepted ANY json object in these three columns. These
-- constraints make the payload a bounded, versioned, self-describing shape instead.
ALTER TABLE public.action_records ADD CONSTRAINT action_records_reason_check
  CHECK (jsonb_typeof(reason) = 'object'::text
     AND jsonb_typeof(reason -> 'code') = 'string'::text
     AND pg_column_size(reason) <= 4096);
ALTER TABLE public.action_records ADD CONSTRAINT action_records_before_state_check
  CHECK (before_state IS NULL
     OR (jsonb_typeof(before_state) = 'object'::text AND pg_column_size(before_state) <= 4096));
ALTER TABLE public.action_records ADD CONSTRAINT action_records_after_state_check
  CHECK (after_state IS NULL
     OR (jsonb_typeof(after_state) = 'object'::text AND pg_column_size(after_state) <= 4096));

-- The action type determines the approval and the reason code. All three are recorded
-- in the same row, so all three must agree or the row is a fabrication.
ALTER TABLE public.action_records ADD CONSTRAINT action_records_type_agreement_check
  CHECK (
    (action_type = 'daily_load.move_task'          AND approval = 'approved' AND reason ->> 'code' = 'transition_buffer_shortfall') OR
    (action_type = 'daily_load.keep_plan'          AND approval = 'declined' AND reason ->> 'code' = 'transition_buffer_shortfall') OR
    (action_type = 'daily_load.move_event'         AND approval = 'approved' AND reason ->> 'code' = 'transition_buffer_shortfall') OR
    (action_type = 'daily_load.drop_task'          AND approval = 'approved' AND reason ->> 'code' = 'capacity_pressure')           OR
    (action_type = 'daily_load.shorten_task'       AND approval = 'approved' AND reason ->> 'code' = 'capacity_pressure')           OR
    (action_type = 'daily_load.keep_capacity_plan' AND approval = 'declined' AND reason ->> 'code' = 'capacity_pressure')           OR
    (action_type = 'daily_load.protect_item'       AND approval = 'approved' AND reason ->> 'code' = 'user_requested_protection')
  );

-- Only the capacity-plan decision has no single subject to point at.
ALTER TABLE public.action_records ADD CONSTRAINT action_records_target_presence_check
  CHECK ((action_type = 'daily_load.keep_capacity_plan') = (target_id IS NULL));

-- Every reference inside the payload must be a cloud uuid, never a leaked local id.
ALTER TABLE public.action_records ADD CONSTRAINT action_records_reason_refs_check
  CHECK (
    (reason ->> 'windowBeforeEventId' IS NULL OR reason ->> 'windowBeforeEventId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') AND
    (reason ->> 'windowAfterEventId'  IS NULL OR reason ->> 'windowAfterEventId'  ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') AND
    (reason ->> 'recommendedTaskId'   IS NULL OR reason ->> 'recommendedTaskId'   ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') AND
    (reason ->> 'consideredTaskId'    IS NULL OR reason ->> 'consideredTaskId'    ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
  );

CREATE INDEX action_records_household_date_idx
  ON public.action_records (household_id, actor_profile_id, logical_date DESC, created_at DESC);
CREATE INDEX action_records_actor_idx ON public.action_records (actor_profile_id, created_at DESC);
CREATE INDEX action_records_target_idx ON public.action_records (target_id) WHERE target_id IS NOT NULL;

CREATE TRIGGER action_records_force_id BEFORE INSERT ON public.action_records
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER action_records_immutable BEFORE UPDATE OR DELETE ON public.action_records
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER action_records_log_change AFTER INSERT ON public.action_records
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'actor_profile_id');

-- INSERT and SELECT only. No UPDATE policy and no DELETE policy: the absence is the
-- append-only guarantee at the RLS layer, and the trigger above is the second layer.
CREATE POLICY actions_select_own ON public.action_records
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = actor_profile_id AND private.is_household_member(household_id));
CREATE POLICY actions_insert_own ON public.action_records
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = actor_profile_id AND private.is_household_member(household_id));

-- ============================================================================
-- 8. BOOTSTRAP / CLAIM IDEMPOTENCY  (SD4-022) — resolves B4-P0-034
--
-- Answer to "is a claim table needed?": YES, and the deciding argument is crash
-- recovery, not bookkeeping. Row-level idempotency alone (the local_id unique keys
-- above) survives a retry, but it cannot rebuild the local id map after a device
-- crashes between the server commit and the local write. With this table the device
-- replays the same claim_key and gets back the same household and the complete id
-- map in one call (B4-P0-006, B4-P0-030, B4-P0-033).
--
-- claim_key is a REQUEST identity supplied by the client. It is never an entity
-- primary key (B4-P0-061).
-- ============================================================================

CREATE TABLE public.account_claims (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL,
  claim_key       uuid        NOT NULL,
  kind            text        NOT NULL,
  status          text        NOT NULL,
  household_id    uuid,
  rejected_reason text,
  row_counts      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_profile_id_claim_key_key
  UNIQUE (profile_id, claim_key);
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_kind_check
  CHECK (kind = ANY (ARRAY['bootstrap'::text, 'claim'::text]));
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_status_check
  CHECK (status = ANY (ARRAY['in_progress'::text, 'complete'::text, 'rejected'::text]));
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_rejected_reason_check
  CHECK ((status = 'rejected') = (rejected_reason IS NOT NULL));
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_rejected_reason_values_check
  CHECK (rejected_reason IS NULL OR (rejected_reason = ANY (ARRAY['refused_demo'::text,
    'nothing_to_claim'::text, 'superseded_by_cloud'::text, 'payload_invalid'::text])));
-- A completed claim must name the household it produced or resolved to.
ALTER TABLE public.account_claims ADD CONSTRAINT account_claims_complete_household_check
  CHECK (status <> 'complete' OR household_id IS NOT NULL);

-- Exactly-once: an account completes bootstrap-or-claim at most once.
CREATE UNIQUE INDEX account_claims_one_complete_per_profile_uq
  ON public.account_claims (profile_id) WHERE status = 'complete';

CREATE INDEX account_claims_profile_idx ON public.account_claims (profile_id, created_at DESC);

CREATE TRIGGER account_claims_set_updated_at BEFORE UPDATE ON public.account_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- The client may READ its own claim record so the UI can show an honest retry state.
-- It may never write one: only the bootstrap/claim RPC does.
CREATE POLICY account_claims_select_own ON public.account_claims
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = profile_id);

-- ============================================================================
-- 9. PRIVILEGES  (SD4-026, SD4-039) — implementing B4-P0-040
--
-- Phase 1 proved that the stock ALTER DEFAULT PRIVILEGES statements retained in the
-- baseline hand anon, authenticated and service_role a full grant on every NEW public
-- table and routine, and that PostgreSQL additionally grants EXECUTE on new functions
-- to PUBLIC. Every object created above inherits that unless this section revokes it.
-- Nothing here relies on a default.
--
-- Two deliberate tightenings beyond restoring the baseline posture:
--
--   1. TRUNCATE, REFERENCES and TRIGGER are revoked from authenticated on every table.
--      The baseline grants them (GRANT ALL). RLS does not govern TRUNCATE, so a table
--      privilege that RLS cannot restrain should not be held by the client role at all.
--   2. DELETE is revoked from authenticated everywhere except discovery_answers, the
--      one table with a legitimate client delete path. Nothing else is ever hard
--      deleted (B4-P0-024).
--
-- The result is that the client role holds only the verbs it actually uses, and
-- UPDATE and INSERT are narrowed further to named columns so that revision,
-- updated_at, created_at, id, household_id and local_id are unwritable by a client
-- even if a policy were later widened by mistake.
-- ============================================================================

-- --- Step 1: strip everything inherited, from every role, on every new object. ---

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- service_role keeps full table access; it is the trusted server identity and never
-- reaches the client bundle (B4-P0-041).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- --- Step 2: grant back exactly what the client role needs. ---

-- Read-only for the client. Written only by the bootstrap/claim RPC.
GRANT SELECT ON public.households        TO authenticated;
GRANT SELECT ON public.household_members TO authenticated;
GRANT SELECT ON public.account_claims    TO authenticated;
GRANT SELECT ON public.change_log        TO authenticated;

-- profiles: no INSERT (SD4-003); UPDATE limited to the two fields a person edits.
GRANT SELECT                         ON public.profiles TO authenticated;
GRANT UPDATE (display_name, timezone) ON public.profiles TO authenticated;

GRANT SELECT ON public.household_categories TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id, name,
              system_role, status, sort_order, scope, origin_created_at, origin_updated_at)
  ON public.household_categories TO authenticated;
GRANT UPDATE (name, system_role, status, sort_order, origin_updated_at)
  ON public.household_categories TO authenticated;

GRANT SELECT ON public.events TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id, title,
              category_id, subject_member_id, starts_at, ends_at, location, notes,
              commitment, status, travel_minutes_before, travel_minutes_after,
              preparation_minutes, source, scope, origin_created_at, origin_updated_at)
  ON public.events TO authenticated;
GRANT UPDATE (title, category_id, subject_member_id, starts_at, ends_at, location,
              notes, commitment, status, travel_minutes_before, travel_minutes_after,
              preparation_minutes, scope, origin_updated_at)
  ON public.events TO authenticated;

GRANT SELECT ON public.tasks TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id, title,
              category_id, subject_member_id, duration_minutes, commitment, due_date,
              plan_kind, planned_date, planned_starts_at, notes, status, completed_at,
              scope, origin_created_at, origin_updated_at)
  ON public.tasks TO authenticated;
GRANT UPDATE (title, category_id, subject_member_id, duration_minutes, commitment,
              due_date, plan_kind, planned_date, planned_starts_at, notes, status,
              completed_at, scope, origin_updated_at)
  ON public.tasks TO authenticated;

GRANT SELECT ON public.household_systems TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id, name,
              description, category_id, scope, origin_created_at, origin_updated_at)
  ON public.household_systems TO authenticated;
GRANT UPDATE (name, description, category_id, scope, origin_updated_at)
  ON public.household_systems TO authenticated;

GRANT SELECT ON public.meal_plan_entries TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id, meal_date,
              title, category_id, scope, origin_created_at, origin_updated_at)
  ON public.meal_plan_entries TO authenticated;
GRANT UPDATE (meal_date, title, category_id, scope, origin_updated_at)
  ON public.meal_plan_entries TO authenticated;

GRANT SELECT ON public.onboarding_state TO authenticated;
GRANT INSERT (household_id, profile_id, goal_ids, strength_ids, struggle_ids,
              last_step, completed_at, scope)
  ON public.onboarding_state TO authenticated;
GRANT UPDATE (goal_ids, strength_ids, struggle_ids, last_step, completed_at)
  ON public.onboarding_state TO authenticated;

GRANT SELECT ON public.one_move_records TO authenticated;
-- logical_day and timezone_at_decision are NOT granted on UPDATE: they are frozen at
-- insert. logical_day is granted on INSERT only so the claim path can supply history;
-- on the live path the trigger overwrites whatever arrives.
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, logical_day,
              target_type, target_task_id, target_needs_me_id,
              status, decided_at, completed_at, cleared_at, scope)
  ON public.one_move_records TO authenticated;
GRANT UPDATE (target_type, target_task_id, target_needs_me_id,
              status, decided_at, completed_at, cleared_at)
  ON public.one_move_records TO authenticated;

GRANT SELECT ON public.needs_me_items TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, title, status,
              due_date, category_id, scope, origin_created_at)
  ON public.needs_me_items TO authenticated;
GRANT UPDATE (title, status, due_date, category_id)
  ON public.needs_me_items TO authenticated;

GRANT SELECT ON public.discovery_records TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, topic_id, scope)
  ON public.discovery_records TO authenticated;
GRANT UPDATE (local_id, topic_id, deleted_at)
  ON public.discovery_records TO authenticated;

-- The one table with a legitimate client DELETE: answers are replaced wholesale when
-- she changes topic or clears Talk It Out, and they are always reached through the
-- parent record, which carries the tombstone the other devices read.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_answers TO authenticated;

-- Insert-only ledger.
GRANT SELECT ON public.action_records TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, actor_profile_id, logical_date,
              action_type, approval, target_type, target_id, payload_version, reason,
              before_state, after_state, source, scope, origin_created_at)
  ON public.action_records TO authenticated;

-- --- Step 3: anon and PUBLIC hold nothing, anywhere, and it is stated explicitly. ---

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL ROUTINES  IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- change_log identity sequence must not be reachable by the client.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
GRANT ALL  ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- --- Step 4: LAYER 1 — SECURE DEFAULT PRIVILEGES (HR-02, owner-approved) ---
--
-- OWNING ROLE. Supabase CLI migrations connect and create objects as `postgres`.
-- Every ALTER DEFAULT PRIVILEGES below is therefore scoped FOR ROLE postgres, which is
-- the same role the Phase 1 baseline capture recorded its own default-privilege
-- statements against. A default-privilege rule attached to any other role would not
-- apply to objects a migration creates.
--
-- CURRENT HOSTED BEHAVIOR, inferred from the Phase 1 capture (the 9 ALTER DEFAULT
-- PRIVILEGES statements retained in the baseline, plus PostgreSQL built-ins):
--
--   public TABLES    -> anon, authenticated, service_role each get SELECT/INSERT/UPDATE/DELETE
--   public SEQUENCES -> anon, authenticated, service_role each get SELECT, USAGE
--   public ROUTINES  -> anon, authenticated, service_role each get ALL
--   any new FUNCTION -> PUBLIC gets EXECUTE (PostgreSQL built-in, not Supabase)
--
-- That is what made a fresh local replay 112 relation-privileges and 5 function-
-- privileges MORE permissive than hosted Staging until Phase 1 added compensating
-- REVOKEs. Those REVOKEs fixed the baseline objects. They did nothing about the NEXT
-- object anyone creates.
--
-- INTENDED BUILD 4 BEHAVIOR. A newly created application object must arrive with no
-- anonymous and no PUBLIC access, whether or not the migration that creates it
-- remembers to say so:
--
--   * anon loses its default on tables, sequences and routines, in public AND private.
--     Nothing in Her Keys is anonymously readable; every policy in this design is
--     TO authenticated. An anon default therefore grants access no feature wants.
--   * PUBLIC loses the built-in default EXECUTE on routines. This is the sharper half:
--     a table created without a policy is still covered by RLS (the ensure_rls event
--     trigger enables it automatically), but a FUNCTION has no RLS at all. A future
--     SECURITY DEFINER helper inheriting PUBLIC EXECUTE is a real privilege escalation.
--   * authenticated loses its default on ROUTINES for the same reason. Function
--     EXECUTE must be a deliberate act, per function.
--   * authenticated KEEPS its default on TABLES, and service_role keeps its defaults.
--     Removing the table default would add no security (RLS governs, and Layer 2
--     narrows every table to named columns anyway) while making every future migration
--     fail in a confusing way. Defense in depth, not defense by obstruction.
--
-- This changes only the DEFAULT for objects created from here on. It does not alter
-- any existing object, and it does not touch the historical Phase 1 baseline file.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON ROUTINES  FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE ALL     ON ROUTINES  FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE EXECUTE ON ROUTINES  FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON ROUTINES  FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE EXECUTE ON ROUTINES  FROM PUBLIC;

-- --- Step 5: LAYER 2 verification note ---
--
-- Layer 2 is the per-object treatment in Steps 1-3 above: every table and function
-- this migration creates or materially alters names its own privileges explicitly and
-- inherits nothing. Layer 1 exists so that a FUTURE migration which forgets Step 1-3
-- still cannot expose an object to anon or PUBLIC.
--
-- Layer 3 is the deterministic fingerprint in supabase/tools/, which makes any
-- accidental widening or narrowing visible as a dimension digest change. The intended
-- Build 4 privilege delta is enumerated in BUILD4_SD4_DELTA_MATRIX.md section 10; any
-- dimension change outside that enumeration is drift, not design.

-- --- Step 6: LOAD-BEARING GRANTS — do not let a security pass revoke these ---
--
-- An RLS policy expression is evaluated as the QUERYING role, so `authenticated` must
-- be able to reach every helper a policy calls. Two privileges are load-bearing and
-- their removal breaks every scoped query in the product:
--
--   GRANT USAGE ON SCHEMA private TO authenticated;                     (Step 3 above)
--   GRANT EXECUTE ON FUNCTION private.is_household_member(uuid) ...     (Section 2)
--   GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(...) ...    (Section 2)
--   GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid) ...      (Section 2)
--   GRANT EXECUTE ON FUNCTION private.current_household_id() ...        (Section 2)
--
-- These are re-asserted here, after the blanket revokes above, precisely so that the
-- ordering cannot strand them. A blanket REVOKE that runs later than a GRANT is the
-- classic way a hardening pass takes an application down.
GRANT USAGE   ON SCHEMA   private                                          TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_member(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(uuid, text, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_household_id()                   TO authenticated;

-- Trigger functions are deliberately NOT granted to anyone. PostgreSQL checks EXECUTE
-- on a trigger function when the trigger is CREATED, not each time it fires, so the
-- triggers above keep working with zero EXECUTE holders. This is the one privilege
-- claim in this file that rests on engine behavior rather than on a policy we wrote,
-- so implementation acceptance Test D exists to demonstrate it on an ephemeral local
-- database before any remote apply.

-- ============================================================================
-- 10. SERVER BOUNDARY — SIGNATURES ONLY
--
-- Bodies are NOT designed here and are NOT authorized. SD4 records only the shape
-- each later phase must implement, and the privilege posture each one requires.
-- Every one of these is SECURITY DEFINER with search_path pinned, EXECUTE revoked
-- from PUBLIC and anon, and granted only to authenticated (B4-P0-040).
--
--   public.bootstrap_account(
--     p_claim_key uuid, p_timezone text, p_device_id uuid
--   ) RETURNS jsonb
--     Creates profile + household + owner membership + 8 starter categories +
--     onboarding_state in ONE transaction (B4-P0-029). Idempotent on
--     (auth.uid(), p_claim_key). Returns the id map.
--     Starter local ids are deterministic and need no reconciliation: a pristine
--     install always has household-1, user-1 and cat-kids..cat-coparenting.
--
--   public.claim_local_household(
--     p_claim_key uuid, p_timezone text, p_device_id uuid, p_payload jsonb
--   ) RETURNS jsonb
--     The same transaction with local content attached (B4-P0-030). REFUSES a payload
--     that declares origin demo or carries any demo-sourced row: fail closed, never
--     filter (B4-P0-010). Returns the complete local_id -> cloud_id map.
--     If the account already owns a household, returns that household and the reason
--     superseded_by_cloud; it never creates a second one (B4-P0-031, SD4-023).
--
--   public.sync_push(p_device_id uuid, p_ops jsonb) RETURNS jsonb
--     SECURITY INVOKER, so RLS still guards every row (B4-P0-025). Each op carries a
--     base revision; a mismatch returns
--     { status: stale, cloud_id, current_revision, current_row } and the device keeps
--     the losing intent as conflict evidence (B4-P0-020, SD4-015). Never merges
--     fields, never resolves by timestamp (B4-P0-021).
--
--   public.sync_pull(p_cursor xid8) RETURNS jsonb
--     SECURITY INVOKER. Implements the barrier protocol in section 4 and in
--     BUILD4_SD4_CLOUD_SCHEMA.md section 6. Returns { rows, next_cursor } or
--     { status: cursor_expired } when p_cursor predates the change_log retention
--     horizon, which the device answers with a full resync (SD4-013).
--
--   private.purge_account(p_profile_id uuid) RETURNS jsonb
--     service_role only, never reachable by authenticated. Sets herkeys.purge = on and
--     deletes in the mandatory order recorded in SD4-030. EXECUTE granted to
--     service_role only.
--
--   private.prune_change_log(p_older_than interval) RETURNS bigint
--     service_role only. Retention maintenance for SD4-013.

-- ============================================================================
-- 11. VERIFICATION STATUS AND MANDATORY IMPLEMENTATION ACCEPTANCE TESTS
--
-- SYNTAX AND RUNTIME CORRECTNESS OF THIS FILE ARE **UNVERIFIED**.
--
-- Nothing in this file has been parsed, applied, or executed anywhere. SD4 is
-- design-only and contacted no database. There is no shadow database, no local stack
-- run, no remote validation. Treat every statement as unproven until it has been
-- applied to an ephemeral local reproduction.
--
-- The NEXT implementation phase MUST begin with ephemeral local parse/apply validation
-- BEFORE any remote migration is considered. First-apply SQL churn is expected and
-- acceptable there. Remote-first debugging is not acceptable.
--
-- MANDATORY ACCEPTANCE TESTS, to be the FIRST migration-safety tests written:
--
--   TEST A — populated reproduction (HR-04)
--     Given an ephemeral local database carrying this schema, insert ONE row into any
--     protected relation (for example public.households, or an auth.users row).
--     Apply this migration.
--     EXPECT: the migration ABORTS in section 0 with the descriptive RAISE EXCEPTION,
--     naming the offending relation and its row count. EXPECT: no destructive DDL ran
--     and the pre-existing schema is intact.
--
--   TEST B — empty reproduction (HR-04)
--     Given an empty ephemeral local database at the Phase 1 baseline.
--     Apply this migration.
--     EXPECT: clean completion, and a deterministic fingerprint matching the intended
--     Build 4 delta recorded in BUILD4_SD4_DELTA_MATRIX.md section 10.
--
--   TEST C — transaction boundary (HR-04 atomicity)
--     Prove the migration runner executes this file as ONE transaction. Apply it with
--     a deliberately failing statement injected near the end.
--     EXPECT: complete rollback, with none of the 16 tables left dropped or partially
--     rebuilt. Separately, confirm that running the file OUTSIDE a transaction fails at
--     the LOCK TABLE statement in section 0, before any destructive DDL.
--
--   TEST D — privilege reachability (HR-02 over-revoke)
--     As a real `authenticated` JWT on the local stack, run one SELECT against every
--     table carrying a scope-aware policy.
--     EXPECT: policies evaluate without a permission error. In particular, no
--     "permission denied for schema private" and no "permission denied for function
--     is_household_member". Confirm the triggers still fire with zero EXECUTE holders
--     on the trigger functions.
--
--   TEST E — One Move logical day (HR-03)
--     Set profiles.timezone = America/Chicago. Insert a One Move with a deliberately
--     wrong client-supplied logical_day.
--     EXPECT: the stored logical_day is the server-derived Chicago day, not the client
--     value. Then change profiles.timezone to Europe/London and re-read the historical
--     row. EXPECT: its logical_day and timezone_at_decision are unchanged.
--
-- ============================================================================
-- END OF SD4 DESIGN DRAFT — NOT AUTHORIZED FOR EXECUTION
-- ============================================================================
