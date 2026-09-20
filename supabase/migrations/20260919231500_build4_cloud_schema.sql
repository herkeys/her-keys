-- HER KEYS BUILD 4 — cloud identity, sync and account foundation
--
-- Authority chain:
--   Phase 1 baseline  20260919230054_build4_baseline.sql
--   SD4 frozen package  95dff1f4ef43f696dc28db196f99e6b1ddeb5ff5
--   SD4 owner authorization  3598ece6bea486d72885b7aa1b5766e617913620
--   B4-INGESTION-LOCK  ce0b703e81dd3f8784a870d61219eddb5ce5192c
--
-- Implements the 31 OWNER-APPROVED and 6 INHERITED-APPROVED SD4 decisions.
-- Ships no mechanism governed solely by the 5 DEFERRED decisions
-- (SD4-013, 021, 028, 030, 034): no retention horizon, no purge_account body,
-- no child-data minimization, no backup/PITR change.
--
-- DESTRUCTIVE. It drops and recreates the 14 baseline tables, which is only
-- defensible because both environments hold zero application rows and zero
-- auth users. Section 0 enforces that and aborts otherwise.
--
-- The Phase 1 baseline migration is never edited.

-- ============================================================================
-- ATOMICITY: this migration opens its OWN transaction.
--
-- Verified locally: the Supabase CLI does NOT wrap a migration file in a
-- transaction. `supabase db reset --local` failed at the LOCK TABLE guard with
-- SQLSTATE 25P01, "LOCK TABLE can only be used in transaction blocks", proving
-- each statement would otherwise run in its own autocommit transaction.
--
-- HR-04 requires the zero-data census and the destructive restructuring to be
-- one atomic unit, so the file supplies that itself rather than depending on
-- runner behaviour it does not control. BEGIN is the first statement and COMMIT
-- the last, which is also safe under a runner that DOES wrap: a nested BEGIN
-- only warns, and committing at the final statement is equivalent either way.
-- ============================================================================

BEGIN;

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

-- ============================================================================
-- 0A. LAYER 1 — GLOBAL DEFAULT PRIVILEGE FOR THE MIGRATION CREATOR ROLE
--
-- Verified locally against PostgreSQL 17.6, creator role `postgres`
-- (current_user = session_user = postgres; migration-created functions are
-- owned by postgres):
--
--   schema-scoped   ALTER DEFAULT PRIVILEGES ... IN SCHEMA public
--                   REVOKE EXECUTE ON ROUTINES FROM PUBLIC
--                   -> records NOTHING in pg_default_acl; a new function still
--                      arrives with the hardwired =X for PUBLIC.
--
--   GLOBAL          ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--                   REVOKE EXECUTE ON ROUTINES FROM PUBLIC
--                   -> pg_default_acl gains role=postgres, nsp=<GLOBAL>,
--                      type=f, acl={postgres=X/postgres}, and a new function in
--                      ANY schema is created without PUBLIC EXECUTE.
--
-- A schema-scoped revoke cannot remove a GLOBAL default; only the global form
-- can. That is why this statement carries no IN SCHEMA clause.
--
-- It runs HERE, before any function exists, so every routine this migration
-- creates is born without PUBLIC EXECUTE rather than being granted it and then
-- corrected. The explicit per-object REVOKEs later are then genuine
-- defense in depth instead of the only control.
--
-- ALTER DEFAULT PRIVILEGES affects FUTURE objects only, so it does not and
-- cannot retroactively fix anything; the per-object grants in section 9 and the
-- assertion in section 9A are what cover objects that already exist.
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

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

-- NHR-05 (owner decision, 2026-09-19). A GUC may NOT be a security boundary.
--
-- Two earlier branches keyed privileged behavior off current_setting('herkeys.*').
-- That rested on an unproven claim -- that a client cannot set a custom GUC -- and the
-- owner has ruled such a dependency out entirely. Both are replaced by this predicate,
-- which tests the EFFECTIVE ROLE rather than a settable value.
--
-- Why current_user: inside a SECURITY DEFINER function owned by postgres, current_user
-- is postgres. Ordinary API traffic arrives as anon or authenticated, and service_role
-- is likewise not postgres. So the privileged branch is reachable only from code that
-- is already running with definer rights -- something a client cannot cause by setting
-- anything on its session.
--
-- This is a PREVENTION property, not a correction property: there is no value a client
-- can send, on any connection it can open, that makes this predicate true.
CREATE FUNCTION private.is_trusted_server_context()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
AS $fn$
  SELECT current_user = 'postgres';
$fn$;

REVOKE ALL ON FUNCTION private.is_trusted_server_context() FROM PUBLIC, anon, authenticated;

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
  IF private.is_trusted_server_context() AND tg_op = 'DELETE' THEN
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
--   CLAIM PATH (the bootstrap/claim RPC, recognised by private.is_trusted_server_context):
--   historical One
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

  -- Which path this is, is decided by the PRIVILEGE system, not by re-deriving
  -- trust here.
  --
  -- logical_day carries no INSERT or UPDATE grant for `authenticated`, so an
  -- ordinary client physically cannot supply one: it always arrives NULL and the
  -- server derives it. A value can only be present when the caller held the
  -- privilege to write it, which is the SECURITY DEFINER claim RPC.
  --
  -- Calling private.is_trusted_server_context() here would be worse than
  -- redundant: this trigger is itself SECURITY DEFINER owned by postgres, so
  -- inside it current_user is ALWAYS postgres and the predicate would always
  -- return true -- silently turning every live client write into a historical
  -- backfill. The column grant is the boundary that actually distinguishes them.
  IF new.logical_day IS NULL THEN
    new.logical_day := v_today;
  ELSIF new.logical_day > v_today THEN
    RAISE EXCEPTION
      'one_move_records: a future logical_day % was supplied (account today is %)',
      new.logical_day, v_today;
  END IF;

  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_one_move_logical_day() FROM PUBLIC, anon, authenticated;

-- NHR-01. subject_member_type exists only to carry the third column of the composite
-- foreign key. It is never client-written (no column grant) and is derived here, so it
-- cannot disagree with subject_member_id. A plain column plus this trigger is used
-- rather than a GENERATED column because generated-column support as a foreign-key
-- referencing column is not something SD4 can verify without executing anything.
CREATE FUNCTION public.set_subject_member_type()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  new.subject_member_type := CASE WHEN new.subject_member_id IS NULL THEN NULL ELSE 'child' END;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_subject_member_type() FROM PUBLIC, anon, authenticated;

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
-- HR-05. display_name stays nullable; the same normalization boundary applies to
-- provider-supplied (Apple/Google) and user-entered names alike. A name that is one
-- character, punctuation-only or emoji-only is stored honestly: the database does not
-- police semantic content, and the UI decides how to render it.
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_check
  CHECK (display_name IS NULL OR (
           display_name = btrim(display_name)
       AND display_name !~ '[[:cntrl:]]'
       AND display_name !~ '  '
       AND char_length(display_name) >= 1
       AND char_length(display_name) <= 80));
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
  display_name      text,
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

-- NHR-01 rules 2 and 3. Carrying member_type in a unique key lets every referencing
-- table prove STRUCTURALLY, with an ordinary composite foreign key and no trigger,
-- that a subject is a child of the same household -- and it simultaneously blocks the
-- two identity mutations that would invalidate an existing reference: changing
-- member_type away from 'child', or moving the member to another household. Either
-- attempt leaves a referencing row with no matching parent and raises.
ALTER TABLE public.household_members ADD CONSTRAINT household_members_id_household_id_member_type_key
  UNIQUE (id, household_id, member_type);
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
-- HR-05 (owner decision, 2026-09-19). No fabricated placeholder is ever persisted.
-- A real Build 3 user has no display name -- no screen collects one -- so the adult
-- member row must be able to say "unknown" rather than invent a string. A child is
-- always created with a name locally (ChildSchema.displayName is non-blank), so the
-- NOT NULL obligation is kept exactly where the data actually supports it.
ALTER TABLE public.household_members ADD CONSTRAINT household_members_child_display_name_check
  CHECK (member_type <> 'child'::text OR display_name IS NOT NULL);

-- Normalization is enforced at the boundary, not merely requested of callers:
-- already-trimmed, no control characters, no internal whitespace runs, 1..80.
-- NFC normalization cannot be expressed as a CHECK and is the RPC/client obligation
-- recorded in BUILD4_SD4_CLOUD_SCHEMA.md; everything else is refused by the database.
ALTER TABLE public.household_members ADD CONSTRAINT household_members_display_name_check
  CHECK (display_name IS NULL OR (
           display_name = btrim(display_name)
       AND display_name !~ '[[:cntrl:]]'
       AND display_name !~ '  '
       AND char_length(display_name) >= 1
       AND char_length(display_name) <= 80));
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
  subject_member_id uuid,
  subject_member_type text,
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

-- NHR-01 (owner decision A2, 2026-09-19). Three invariants, all structural:
--   rule 1  a child-scoped row must say WHICH child
--   rule 2  any non-null subject is an existing child of the SAME household
--   rule 3  the referenced membership cannot be mutated out from under the reference
-- Rules 2 and 3 are both discharged by the composite foreign key alone. No trigger
-- and no RLS is involved in proving relational integrity.
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_child_scope_subject_check
  CHECK (scope <> 'child'::text OR subject_member_id IS NOT NULL);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
CREATE INDEX household_categories_subject_member_idx
  ON public.household_categories (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER household_categories_set_subject_member_type BEFORE INSERT OR UPDATE ON public.household_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();

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
  subject_member_type      text,
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
ALTER TABLE public.events ADD CONSTRAINT events_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
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

-- NHR-01 (owner decision A2, 2026-09-19). Three invariants, all structural:
--   rule 1  a child-scoped row must say WHICH child
--   rule 2  any non-null subject is an existing child of the SAME household
--   rule 3  the referenced membership cannot be mutated out from under the reference
-- Rules 2 and 3 are both discharged by the composite foreign key alone. No trigger
-- and no RLS is involved in proving relational integrity.
ALTER TABLE public.events ADD CONSTRAINT events_child_scope_subject_check
  CHECK (scope <> 'child'::text OR subject_member_id IS NOT NULL);
ALTER TABLE public.events ADD CONSTRAINT events_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.events ADD CONSTRAINT events_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
-- composite FK already declared above for this table.
CREATE INDEX events_subject_member_idx
  ON public.events (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER events_set_subject_member_type BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();

CREATE INDEX events_household_time_idx        ON public.events (household_id, starts_at, ends_at);
CREATE INDEX events_category_idx              ON public.events (category_id);
CREATE INDEX events_category_household_fk_idx ON public.events (category_id, household_id);
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
  subject_member_type  text,
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
ALTER TABLE public.tasks ADD CONSTRAINT tasks_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
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

-- NHR-01 (owner decision A2, 2026-09-19). Three invariants, all structural:
--   rule 1  a child-scoped row must say WHICH child
--   rule 2  any non-null subject is an existing child of the SAME household
--   rule 3  the referenced membership cannot be mutated out from under the reference
-- Rules 2 and 3 are both discharged by the composite foreign key alone. No trigger
-- and no RLS is involved in proving relational integrity.
ALTER TABLE public.tasks ADD CONSTRAINT tasks_child_scope_subject_check
  CHECK (scope <> 'child'::text OR subject_member_id IS NOT NULL);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
-- composite FK already declared above for this table.
CREATE INDEX tasks_subject_member_idx
  ON public.tasks (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER tasks_set_subject_member_type BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();

CREATE INDEX tasks_household_status_due_idx     ON public.tasks (household_id, status, due_date);
CREATE INDEX tasks_household_planned_date_idx   ON public.tasks (household_id, planned_date) WHERE planned_date IS NOT NULL;
CREATE INDEX tasks_household_planned_start_idx  ON public.tasks (household_id, planned_starts_at) WHERE planned_starts_at IS NOT NULL;
CREATE INDEX tasks_category_idx                 ON public.tasks (category_id);
CREATE INDEX tasks_category_household_fk_idx    ON public.tasks (category_id, household_id);
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
  subject_member_id uuid,
  subject_member_type text,
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

-- NHR-01 (owner decision A2, 2026-09-19). Three invariants, all structural:
--   rule 1  a child-scoped row must say WHICH child
--   rule 2  any non-null subject is an existing child of the SAME household
--   rule 3  the referenced membership cannot be mutated out from under the reference
-- Rules 2 and 3 are both discharged by the composite foreign key alone. No trigger
-- and no RLS is involved in proving relational integrity.
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_child_scope_subject_check
  CHECK (scope <> 'child'::text OR subject_member_id IS NOT NULL);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
CREATE INDEX household_systems_subject_member_idx
  ON public.household_systems (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER household_systems_set_subject_member_type BEFORE INSERT OR UPDATE ON public.household_systems
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();

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
  subject_member_id uuid,
  subject_member_type text,
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

-- NHR-01 (owner decision A2, 2026-09-19). Three invariants, all structural:
--   rule 1  a child-scoped row must say WHICH child
--   rule 2  any non-null subject is an existing child of the SAME household
--   rule 3  the referenced membership cannot be mutated out from under the reference
-- Rules 2 and 3 are both discharged by the composite foreign key alone. No trigger
-- and no RLS is involved in proving relational integrity.
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_child_scope_subject_check
  CHECK (scope <> 'child'::text OR subject_member_id IS NOT NULL);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_subject_pairing_check
  CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_subject_member_type_check
  CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_subject_member_fkey
  FOREIGN KEY (subject_member_id, household_id, subject_member_type)
  REFERENCES public.household_members(id, household_id, member_type) ON DELETE RESTRICT;
CREATE INDEX meal_plan_entries_subject_member_idx
  ON public.meal_plan_entries (subject_member_id) WHERE subject_member_id IS NOT NULL;
CREATE TRIGGER meal_plan_entries_set_subject_member_type BEFORE INSERT OR UPDATE ON public.meal_plan_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_member_type();

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
-- `reason ? 'code'` is required explicitly: without it a missing key makes
-- jsonb_typeof(reason -> 'code') NULL, the comparison NULL, and a CHECK whose
-- result is NULL is treated as satisfied -- so a payload with no code would pass.
ALTER TABLE public.action_records ADD CONSTRAINT action_records_reason_check
  CHECK (jsonb_typeof(reason) = 'object'::text
     AND reason ? 'code'
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
--
-- NHR-01 note: subject_member_id IS client-writable (the client chooses which child a
-- row concerns). subject_member_type is NEVER granted on any table -- it is derived by
-- public.set_subject_member_type() and exists only to carry the third column of the
-- composite foreign key. A client therefore cannot assert that an adult is a child.

-- Read-only for the client. Written only by the bootstrap/claim RPC.
GRANT SELECT ON public.households        TO authenticated;
GRANT SELECT ON public.household_members TO authenticated;
GRANT SELECT ON public.account_claims    TO authenticated;
GRANT SELECT ON public.change_log        TO authenticated;

-- profiles: no INSERT (SD4-003); UPDATE limited to the two fields a person edits.
GRANT SELECT                         ON public.profiles TO authenticated;
GRANT UPDATE (display_name, timezone) ON public.profiles TO authenticated;

GRANT SELECT ON public.household_categories TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id,
              subject_member_id, name,
              system_role, status, sort_order, scope, origin_created_at, origin_updated_at)
  ON public.household_categories TO authenticated;
GRANT UPDATE (subject_member_id, name, system_role, status, sort_order, origin_updated_at)
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
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id,
              subject_member_id, name,
              description, category_id, scope, origin_created_at, origin_updated_at)
  ON public.household_systems TO authenticated;
GRANT UPDATE (subject_member_id, name, description, category_id, scope, origin_updated_at)
  ON public.household_systems TO authenticated;

GRANT SELECT ON public.meal_plan_entries TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, owner_profile_id,
              subject_member_id, meal_date,
              title, category_id, scope, origin_created_at, origin_updated_at)
  ON public.meal_plan_entries TO authenticated;
GRANT UPDATE (subject_member_id, meal_date, title, category_id, scope, origin_updated_at)
  ON public.meal_plan_entries TO authenticated;

GRANT SELECT ON public.onboarding_state TO authenticated;
GRANT INSERT (household_id, profile_id, goal_ids, strength_ids, struggle_ids,
              last_step, completed_at, scope)
  ON public.onboarding_state TO authenticated;
GRANT UPDATE (goal_ids, strength_ids, struggle_ids, last_step, completed_at)
  ON public.onboarding_state TO authenticated;

GRANT SELECT ON public.one_move_records TO authenticated;
-- NHR-05: logical_day and timezone_at_decision are granted on NEITHER insert nor
-- update. The live path does not need logical_day (the trigger derives it) and the
-- claim path is a SECURITY DEFINER RPC running as postgres, which bypasses column
-- grants altogether. Withholding the privilege is prevention; relying on the trigger
-- to overwrite a client value would only be correction.
GRANT INSERT (household_id, local_id, origin_device_id, profile_id,
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
-- The PUBLIC EXECUTE default is handled by the GLOBAL statement in section 0A,
-- not here. A schema-scoped revoke cannot remove a GLOBAL default: it can only
-- remove a schema-scoped grant, which is exactly what the two anon/authenticated
-- lines above do. See the note at section 0A for the verified distinction.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL     ON ROUTINES  FROM anon, authenticated;
-- (PUBLIC EXECUTE for this schema is covered by the same GLOBAL statement)

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
-- 9A. HER KEYS FAIL-CLOSED ASSERTION LAYER  (NHR-02, owner-approved)
--
-- PLATFORM CLASSIFICATION FIRST, as the owner required.
--
-- public.rls_auto_enable() and the ensure_rls event trigger are
-- PLATFORM-MANAGED / INFORMATIONAL, on repo-owned Phase 1 evidence:
--   * supabase/tools/baselines/phase1-staging-fingerprint.json scores
--     info.event_triggers with "class": "PLATFORM-MANAGED/INFO"
--   * supabase/tools/baselines/phase1-baseline-review.md lists the other two
--     functions as "app-owned" and rls_auto_enable as "event-trigger handler",
--     under the heading "Platform/informational machinery"
--
-- Therefore Her Keys does NOT rewrite, replace or depend on it. It is left exactly as
-- the baseline has it. Her Keys security guarantees must not rest on changing
-- platform-owned DDL behaviour -- and in any case rls_auto_enable swallows its own
-- exceptions (EXCEPTION WHEN OTHERS THEN RAISE LOG), so it can fail silently.
--
-- WHY NOT A SECOND EVENT TRIGGER. An application-owned event trigger on the same DDL
-- events cannot be justified as portable or safe from the existing repo evidence: it
-- would sit alongside platform machinery on ddl_command_end, it would have to exclude
-- auth, storage, extensions, temp and every other platform object by predicate, and
-- nothing in SD4 can validate that without executing it. Inventing one would be
-- claiming ownership of a platform concern. The owner-sanctioned alternative is used
-- instead: a same-migration post-DDL assertion.
--
-- SCOPE. This function inspects schema public and nothing else. It cannot fail auth,
-- storage, extensions, temporary or any other platform DDL, because it never looks at
-- them and only runs when an application migration explicitly calls it.
--
-- FAILURE PATH. It RAISES, which aborts the calling migration transaction.
--
-- RESIDUAL, stated plainly: this layer only fires when a migration calls it. A
-- migration that forgets the call is not caught here -- it is caught by Layer 1
-- (secure defaults deny anon and PUBLIC regardless) and by Layer 3 (the deterministic
-- fingerprint privilege dimensions). Three independent layers, none load-bearing alone.
-- ============================================================================

CREATE FUNCTION private.assert_app_schema_secured()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  offenders text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    IF NOT r.relrowsecurity THEN
      offenders := offenders || format('%s: RLS not enabled', r.relname);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = r.oid) THEN
      offenders := offenders || format('%s: RLS enabled but no policy exists', r.relname);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c2
      WHERE c2.oid = r.oid
        AND has_table_privilege('anon', c2.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    ) THEN
      offenders := offenders || format('%s: anon holds a table privilege', r.relname);
    END IF;
  END LOOP;

  -- Functions have no RLS, so an inherited EXECUTE grant is the sharper hazard.
  -- PostgreSQL will not let the hardwired PUBLIC EXECUTE default be revoked, so
  -- this is where that property is actually enforced: a function that arrives
  -- with PUBLIC or anon EXECUTE aborts the migration that created it.
  FOR r IN
    SELECT n.nspname, p.proname, p.proacl
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
  LOOP
    IF r.proacl IS NULL THEN
      offenders := offenders || format('%s.%s: default ACL leaves EXECUTE to PUBLIC', r.nspname, r.proname);
    ELSIF EXISTS (
      SELECT 1 FROM aclexplode(r.proacl) a
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'))
    ) THEN
      offenders := offenders || format('%s.%s: EXECUTE held by PUBLIC or anon', r.nspname, r.proname);
    END IF;
  END LOOP;

  IF array_length(offenders, 1) > 0 THEN
    RAISE EXCEPTION
      'Her Keys schema assertion FAILED, migration aborted: %',
      array_to_string(offenders, '; ');
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.assert_app_schema_secured() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assert_app_schema_secured() TO service_role;

-- Called at the end of this migration, in section 11.

-- ============================================================================
-- 10. TRUSTED SERVER BOUNDARY — bootstrap, claim, and the incremental pull
--
-- Database side only. No auth UI exists yet; these are the SQL contracts the
-- account/auth/claim wave will call.
--
-- sync_push is deliberately NOT implemented here. The approved concurrency
-- contract is base-revision CAS (SD4-010, SD4-035), and a client performs that
-- directly: UPDATE ... WHERE id = $1 AND revision = $2, guarded by RLS and by
-- the column grants in section 9. An RPC would only add batching on top of a
-- mechanism that already works and is tested. It belongs to the sync wave.
-- ============================================================================

-- The eight starter categories, exactly as a pristine device creates them
-- (src/domain/categories.ts). Bootstrap and claim both emit these, with the
-- same fixed local ids, so the starter set needs no id reconciliation at all.
CREATE FUNCTION private.insert_starter_categories(p_household_id uuid, p_profile_id uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  INSERT INTO public.household_categories
    (household_id, local_id, owner_profile_id, name, system_role, status, sort_order, scope)
  VALUES
    (p_household_id, 'cat-kids',          NULL,         'Kids',          'kids',          'active', 0, 'household'),
    (p_household_id, 'cat-home',          NULL,         'Home',          'home',          'active', 1, 'household'),
    (p_household_id, 'cat-money',         NULL,         'Money',         'money',         'active', 2, 'household'),
    (p_household_id, 'cat-meals',         NULL,         'Meals',         'meals',         'active', 3, 'household'),
    (p_household_id, 'cat-work',          p_profile_id, 'Work',          'work',          'active', 4, 'professional'),
    (p_household_id, 'cat-wellbeing',     p_profile_id, 'Wellbeing',     'wellbeing',     'active', 5, 'personal'),
    (p_household_id, 'cat-relationships', p_profile_id, 'Relationships', 'relationships', 'active', 6, 'personal'),
    (p_household_id, 'cat-coparenting',   p_profile_id, 'Co-parenting',  'coparenting',   'active', 7, 'coparent-shared');
$fn$;

REVOKE ALL ON FUNCTION private.insert_starter_categories(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- A real IANA identifier, tested rather than pattern-matched. profiles.timezone
-- is NOT NULL with no default, so both write paths must supply a usable value
-- and a bad one must fail loudly here rather than at the first logical-day
-- computation (HR-03).
CREATE FUNCTION private.is_valid_timezone(p_timezone text)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
AS $fn$
DECLARE
  probe timestamptz;
BEGIN
  IF p_timezone IS NULL OR char_length(p_timezone) < 1 OR char_length(p_timezone) > 64 THEN
    RETURN false;
  END IF;
  BEGIN
    probe := now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION private.is_valid_timezone(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- bootstrap_account — a new account with a pristine device.
--
-- Creates profile, household, owner membership and the eight starter
-- categories in ONE transaction (B4-P0-029). Never a client-side chain of
-- inserts. Idempotent on (auth.uid(), p_claim_key): a replay returns the same
-- household and the same id map.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.bootstrap_account(
  p_claim_key uuid,
  p_timezone  text,
  p_device_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_claim     public.account_claims%ROWTYPE;
  v_household uuid;
  v_replay    boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bootstrap_account: no authenticated caller' USING errcode = '28000';
  END IF;
  IF NOT private.is_valid_timezone(p_timezone) THEN
    RAISE EXCEPTION 'bootstrap_account: % is not a usable IANA timezone', p_timezone USING errcode = '22023';
  END IF;

  -- Replay of the same request returns the same answer.
  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;
  v_replay := FOUND;

  IF v_replay AND v_claim.status = 'complete' THEN
    RETURN private.claim_result(v_claim.household_id, v_claim.id, 'complete', NULL);
  END IF;

  SELECT hm.household_id INTO v_household
  FROM public.household_members hm
  WHERE hm.profile_id = v_uid AND hm.role = 'owner';

  IF v_household IS NOT NULL THEN
    -- The account already has a household. Which answer is correct depends
    -- entirely on whether this is the SAME request coming back.
    IF v_replay THEN
      -- RESUME. The client crashed before recording success, so the skeleton
      -- exists but the claim never closed. Treating this as a duplicate would
      -- turn ordinary crash recovery into a permanent refusal, which is the
      -- opposite of what the idempotency key is for.
      UPDATE public.account_claims
         SET status = 'complete', household_id = v_household
       WHERE id = v_claim.id;
      RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL);
    END IF;

    -- A genuinely NEW request on an account that already owns a household
    -- resolves to it and never creates a second one (B4-P0-031, SD4-023).
    INSERT INTO public.account_claims (profile_id, claim_key, kind, status, household_id, rejected_reason)
    VALUES (v_uid, p_claim_key, 'bootstrap', 'rejected', v_household, 'superseded_by_cloud')
    ON CONFLICT (profile_id, claim_key) DO NOTHING;
    RETURN private.claim_result(v_household, NULL, 'rejected', 'superseded_by_cloud');
  END IF;

  -- The profile must exist before the claim row, which references it.
  INSERT INTO public.profiles (id, timezone) VALUES (v_uid, p_timezone)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.account_claims (profile_id, claim_key, kind, status)
  VALUES (v_uid, p_claim_key, 'bootstrap', 'in_progress')
  ON CONFLICT (profile_id, claim_key) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_claim;

  INSERT INTO public.households (local_id, origin_device_id)
  VALUES ('household-1', p_device_id)
  RETURNING id INTO v_household;

  INSERT INTO public.household_members
    (household_id, local_id, origin_device_id, profile_id, member_type, role, display_name, scope)
  VALUES (v_household, 'user-1', p_device_id, v_uid, 'adult', 'owner', NULL, 'personal');

  PERFORM private.insert_starter_categories(v_household, v_uid);

  INSERT INTO public.onboarding_state (household_id, profile_id)
  VALUES (v_household, v_uid);

  UPDATE public.account_claims
     SET status = 'complete', household_id = v_household, row_counts = jsonb_build_object('categories', 8)
   WHERE id = v_claim.id;

  RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL);
END;
$fn$;

-- The shared result shape: the household, the claim, and the local_id -> cloud_id
-- map the device needs to rebuild its mapping after a crash (SD4-022).
CREATE FUNCTION private.claim_result(
  p_household_id uuid,
  p_claim_id     uuid,
  p_status       text,
  p_reason       text
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
  SELECT jsonb_build_object(
    'status',          p_status,
    'rejected_reason', p_reason,
    'claim_id',        p_claim_id,
    'household_id',    p_household_id,
    'id_map',
      COALESCE((
        SELECT jsonb_object_agg(m.local_id, m.cloud_id)
        FROM (
          SELECT local_id, id AS cloud_id FROM public.households          WHERE id           = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.household_members   WHERE household_id = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.household_categories WHERE household_id = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.events               WHERE household_id = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.tasks                WHERE household_id = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.needs_me_items       WHERE household_id = p_household_id
          UNION ALL
          SELECT local_id, id             FROM public.one_move_records     WHERE household_id = p_household_id
        ) m
      ), '{}'::jsonb)
  );
$fn$;

REVOKE ALL ON FUNCTION private.claim_result(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- claim_local_household — an existing real local household comes to the cloud.
--
-- Same transaction as bootstrap with local content attached (B4-P0-030).
-- Refuses a demo payload outright rather than filtering it: fail closed,
-- never filter (B4-P0-010).
--
-- Because this function is SECURITY DEFINER owned by postgres, it satisfies
-- private.is_trusted_server_context(), which is what permits the historical
-- logical_day branch of set_one_move_logical_day(). No GUC is involved.
--
-- B4-BE02-OR-001 — CLAIM DEPENDENCY CLOSURE.
--
-- The first implementation carried One Move rows and nothing else. Its target
-- lookup searched public.tasks for rows the claim never inserted, so every
-- historical One Move with a typed target died on
-- one_move_records_target_shape_check and the whole claim rolled back. Any real
-- household that had ever used One Move on a real task was unclaimable. The
-- workaround of pushing those rows later does not exist: logical_day and
-- timezone_at_decision are granted to authenticated on neither INSERT nor
-- UPDATE, so a later push would stamp today's date and collide with today's
-- real move. Historical One Moves can only ever enter through this RPC.
--
-- So the claim now carries the MINIMUM TRANSITIVE DEPENDENCY SET that makes the
-- historical One Move rows valid, and nothing else:
--
--   One Move (selected|completed)
--     -> task     -> category (tasks.category_id is NOT NULL)
--                 -> child member, when the task names a child subject
--     -> needsMe  -> category, only when the item actually has one
--
-- Claim is NOT the sync engine, and that is enforced here rather than merely
-- asked of the client: the server recomputes the closure from the One Moves and
-- REJECTS a payload carrying anything outside it. An overbroad payload is an
-- error, not something to quietly ignore. Everything else — events, systems,
-- meals, Discovery, unrelated tasks — remains B4-BACKEND-03.
--
-- B4-BE02-OR-002 — target_type 'catalog' is refused here as a backstop. Real
-- households can hold catalog One Moves, because the v1 -> v2 local migration
-- stamped that value onto every v1 record regardless of origin. They are
-- remediated into migration evidence during the local v2 -> v3 migration, BEFORE
-- claim. If one still arrives, something upstream failed and the claim fails
-- closed rather than guessing what she meant.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.claim_local_household(
  p_claim_key uuid,
  p_timezone  text,
  p_payload   jsonb,
  p_device_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_claim     public.account_claims%ROWTYPE;
  v_household uuid;
  v_boot      jsonb;
  v_today     date;
  v_conflicts jsonb := '[]'::jsonb;
  v_digest    text;

  v_move      jsonb;
  v_obj       jsonb;
  v_existing  record;
  v_found     boolean;

  -- The closure, derived from the One Moves and then used to police the payload.
  v_need_tasks    text[] := '{}'::text[];
  v_need_items    text[] := '{}'::text[];
  v_need_cats     text[] := '{}'::text[];
  v_need_children text[] := '{}'::text[];
  v_extra         text[];

  v_lid       text;
  v_id        uuid;
  v_cat_id    uuid;
  v_child_id  uuid;
  v_target    uuid;
  v_scope     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_local_household: no authenticated caller' USING errcode = '28000';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'claim_local_household: payload must be an object' USING errcode = '22023';
  END IF;

  -- One explicit payload version, so a later shape change is a refusal rather
  -- than a silent misread of fields that moved.
  IF (p_payload ->> 'claimPayloadVersion') IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'claim_local_household: unsupported claimPayloadVersion %',
      COALESCE(p_payload ->> 'claimPayloadVersion', '(absent)') USING errcode = '22023';
  END IF;

  -- Fail closed on demo. Not a filter: the whole payload is refused.
  --
  -- The rejection is recorded only when a profile already exists to attach it
  -- to. A demo refusal normally arrives before any account was created, and
  -- account_claims.profile_id references profiles -- so writing a claim row
  -- here would fail on the foreign key and turn a clean refusal into an error.
  -- The refusal itself is what matters, not the bookkeeping.
  IF (p_payload ->> 'origin') IS DISTINCT FROM 'empty' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
      INSERT INTO public.account_claims (profile_id, claim_key, kind, status, rejected_reason)
      VALUES (v_uid, p_claim_key, 'claim', 'rejected', 'refused_demo')
      ON CONFLICT (profile_id, claim_key) DO NOTHING;
    END IF;
    RETURN private.claim_result(NULL, NULL, 'rejected', 'refused_demo');
  END IF;

  -- A COMPLETED claim is authoritative and is never reopened as an incremental
  -- sync transaction (B4-BE02-OR-001 addendum K). The original result and its
  -- mappings come back unchanged; anything she has changed locally since stays
  -- local and belongs to B4-BACKEND-03. Retry is not a back door into sync.
  v_digest := md5(p_payload::text);
  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;
  IF FOUND AND v_claim.status = 'complete' THEN
    IF COALESCE(v_claim.row_counts ->> 'payload_digest', '') <> v_digest THEN
      -- Diagnostic only, in the jsonb column that already exists. No schema
      -- expansion for a diagnostic, and the answer does not change either way.
      UPDATE public.account_claims
         SET row_counts = COALESCE(row_counts, '{}'::jsonb)
                          || jsonb_build_object('retry_payload_diverged', true)
       WHERE id = v_claim.id;
    END IF;
    RETURN private.claim_result(v_claim.household_id, v_claim.id, 'complete', NULL);
  END IF;

  -- Reuse bootstrap for the account skeleton; it is already idempotent.
  --
  -- A rejected bootstrap is returned verbatim and the claim stops here. The
  -- superseded_by_cloud case DOES carry a household_id (the one the account
  -- already owns), so testing the id alone would let a rejected result fall
  -- through and then be marked complete -- which both contradicts B4-P0-031 and
  -- violates the rejected_reason CHECK.
  v_boot := public.bootstrap_account(p_claim_key, p_timezone, p_device_id);
  IF (v_boot ->> 'status') = 'rejected' THEN
    RETURN v_boot;
  END IF;

  v_household := (v_boot ->> 'household_id')::uuid;
  IF v_household IS NULL THEN
    RETURN v_boot;
  END IF;

  SELECT * INTO v_claim FROM public.account_claims
  WHERE profile_id = v_uid AND claim_key = p_claim_key;

  SELECT (now() AT TIME ZONE p.timezone)::date INTO v_today
  FROM public.profiles p WHERE p.id = v_uid;

  -- ==========================================================================
  -- 1. CLOSURE. Derived from the One Moves by the SERVER, never taken on trust.
  -- ==========================================================================
  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb))
  LOOP
    IF (v_move ->> 'targetType') NOT IN ('task', 'needsMe') THEN
      RAISE EXCEPTION 'claim_local_household: One Move % carries unsupported targetType %',
        v_move ->> 'localId', COALESCE(v_move ->> 'targetType', '(absent)')
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'unsupported_target_type',
                                          'one_move_local_id', v_move ->> 'localId',
                                          'target_type', v_move ->> 'targetType')::text;
    END IF;

    IF (v_move ->> 'status') IN ('selected', 'completed') THEN
      IF (v_move ->> 'targetLocalId') IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: One Move % is % but names no target',
          v_move ->> 'localId', v_move ->> 'status'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'missing_target_local_id',
                                            'one_move_local_id', v_move ->> 'localId')::text;
      END IF;
      IF (v_move ->> 'targetType') = 'task' THEN
        v_need_tasks := v_need_tasks || (v_move ->> 'targetLocalId');
      ELSE
        v_need_items := v_need_items || (v_move ->> 'targetLocalId');
      END IF;
    END IF;
  END LOOP;

  -- A carried task pulls in its category (NOT NULL in the cloud) and, when it
  -- names a child subject, that child member. Nothing deeper.
  FOR v_obj IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb))
  LOOP
    IF (v_obj ->> 'localId') = ANY (v_need_tasks) THEN
      IF (v_obj ->> 'categoryLocalId') IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: task % carries no categoryLocalId', v_obj ->> 'localId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'task_missing_category',
                                            'task_local_id', v_obj ->> 'localId')::text;
      END IF;
      v_need_cats := v_need_cats || (v_obj ->> 'categoryLocalId');
      IF (v_obj ->> 'subjectMemberLocalId') IS NOT NULL THEN
        v_need_children := v_need_children || (v_obj ->> 'subjectMemberLocalId');
      END IF;
    END IF;
  END LOOP;

  -- A Needs Me item's category is genuinely optional, so none is invented
  -- merely to populate the closure.
  FOR v_obj IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb))
  LOOP
    IF (v_obj ->> 'localId') = ANY (v_need_items) AND (v_obj ->> 'categoryLocalId') IS NOT NULL THEN
      v_need_cats := v_need_cats || (v_obj ->> 'categoryLocalId');
    END IF;
  END LOOP;

  -- ==========================================================================
  -- 2. BOUNDEDNESS. "Claim is not sync" as an executable invariant.
  --    Extras are REJECTED, not ignored -- ignoring them would let a client
  --    drift into general upload and only find out much later.
  -- ==========================================================================
  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_tasks));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % task(s) no claimed One Move requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'tasks',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_items));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % Needs Me item(s) no claimed One Move requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'needsMeItems',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_cats));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % category/categories no claimed dependency requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'categories',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_children));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % child member(s) no claimed dependency requires', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'childMembers',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  -- ==========================================================================
  -- 3. CHILD MEMBERS. First, because a category or a task may name one.
  --
  -- This is historical-state migration through a trusted path, not a new
  -- general-purpose child-create feature: the child exists in her household
  -- already, and refusing it would fail a valid claim over a UI gap.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_children
  LOOP
    SELECT * INTO v_existing FROM public.household_members
    WHERE household_id = v_household AND local_id = v_lid;

    IF FOUND THEN
      -- Adopt. Never overwrite divergent state to make a retry succeed.
      IF v_existing.member_type <> 'child' THEN
        RAISE EXCEPTION 'claim_local_household: member % already exists and is not a child', v_lid
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'incompatible_existing_member',
                                            'member_local_id', v_lid,
                                            'existing_member_type', v_existing.member_type)::text;
      END IF;
      CONTINUE;
    END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'childMembers', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: child member % is required but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'childMembers',
                                          'local_id', v_lid)::text;
    END IF;

    INSERT INTO public.household_members
      (household_id, local_id, origin_device_id, profile_id, member_type, role, display_name, birth_date, scope)
    VALUES (v_household, v_lid, p_device_id, NULL, 'child', 'member',
            v_obj ->> 'displayName', (v_obj ->> 'birthDate')::date, 'child')
    ON CONFLICT (household_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 4. CATEGORIES. The eight starter rows were already seeded by bootstrap with
  --    the same local ids the client uses, so a required starter is ADOPTED
  --    rather than inserted twice. A household's own category is inserted.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_cats
  LOOP
    SELECT * INTO v_existing FROM public.household_categories
    WHERE household_id = v_household AND local_id = v_lid;
    -- Captured NOW. FOUND reflects the LAST query, and the payload lookup below
    -- is a query too: reading FOUND after it would report whether the client
    -- sent the category, not whether the cloud already has it.
    v_found := FOUND;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;

    IF v_found THEN
      -- Compatibility, not overwrite. system_role is semantic identity: a
      -- category that means something different is not the same category.
      IF v_obj IS NOT NULL
         AND v_existing.system_role IS DISTINCT FROM NULLIF(v_obj ->> 'systemRole', '') THEN
        RAISE EXCEPTION 'claim_local_household: category % exists with a different system role', v_lid
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'incompatible_existing_category',
                                            'category_local_id', v_lid,
                                            'existing_system_role', v_existing.system_role,
                                            'incoming_system_role', v_obj ->> 'systemRole')::text;
      END IF;
      CONTINUE;
    END IF;

    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: category % is required but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'categories',
                                          'local_id', v_lid)::text;
    END IF;

    v_scope := v_obj ->> 'scope';
    -- A child-scoped cloud category must name its child, and the local category
    -- model has no subject field to name one with. Refusing is honest; inventing
    -- a subject would not be.
    IF v_scope = 'child' THEN
      RAISE EXCEPTION 'claim_local_household: category % is child-scoped and cannot be claimed', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'child_scoped_category_not_claimable',
                                          'category_local_id', v_lid)::text;
    END IF;

    BEGIN
      INSERT INTO public.household_categories
        (household_id, local_id, origin_device_id, owner_profile_id, name, system_role, status, sort_order, scope)
      VALUES (v_household, v_lid, p_device_id,
              CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
              v_obj ->> 'name', NULLIF(v_obj ->> 'systemRole', ''), v_obj ->> 'status',
              (v_obj ->> 'sortOrder')::integer, v_scope)
      ON CONFLICT (household_id, local_id) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      -- sort_order and system_role carry their own NON-DEFERRABLE uniqueness.
      -- A collision is a real conflict in her data, reported rather than nudged
      -- aside by renumbering something she chose.
      RAISE EXCEPTION 'claim_local_household: category % collides with an existing category', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'category_uniqueness_conflict',
                                          'category_local_id', v_lid,
                                          'sort_order', v_obj ->> 'sortOrder',
                                          'system_role', v_obj ->> 'systemRole')::text;
    END;
  END LOOP;

  -- ==========================================================================
  -- 5. TASK TARGETS. Canonical domain state is preserved: a completed task
  --    arrives completed, with its completion time, not reset to open.
  --    Server-owned fields (id, revision, timestamps, subject_member_type) are
  --    never taken from the payload.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_tasks
  LOOP
    PERFORM 1 FROM public.tasks WHERE household_id = v_household AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: task % is a One Move target but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'tasks',
                                          'local_id', v_lid)::text;
    END IF;

    SELECT id INTO v_cat_id FROM public.household_categories
    WHERE household_id = v_household AND local_id = (v_obj ->> 'categoryLocalId');
    IF v_cat_id IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: task % names category % which did not resolve',
        v_lid, v_obj ->> 'categoryLocalId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'unresolved_category', 'task_local_id', v_lid,
                                          'category_local_id', v_obj ->> 'categoryLocalId')::text;
    END IF;

    v_child_id := NULL;
    IF (v_obj ->> 'subjectMemberLocalId') IS NOT NULL THEN
      SELECT id INTO v_child_id FROM public.household_members
      WHERE household_id = v_household AND local_id = (v_obj ->> 'subjectMemberLocalId')
        AND member_type = 'child';
      IF v_child_id IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: task % names child % which did not resolve',
          v_lid, v_obj ->> 'subjectMemberLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_child_member', 'task_local_id', v_lid,
                                            'member_local_id', v_obj ->> 'subjectMemberLocalId')::text;
      END IF;
    END IF;

    v_scope := v_obj ->> 'scope';
    INSERT INTO public.tasks
      (household_id, local_id, origin_device_id, owner_profile_id, title, category_id,
       subject_member_id, duration_minutes, commitment, due_date, plan_kind, planned_date,
       planned_starts_at, notes, status, completed_at, scope, origin_created_at, origin_updated_at)
    VALUES (v_household, v_lid, p_device_id,
            CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
            v_obj ->> 'title', v_cat_id, v_child_id,
            (v_obj ->> 'durationMinutes')::integer, v_obj ->> 'commitment',
            (v_obj ->> 'dueDate')::date, v_obj ->> 'planKind',
            (v_obj ->> 'plannedDate')::date, (v_obj ->> 'plannedStartsAt')::timestamptz,
            v_obj ->> 'notes', v_obj ->> 'status', (v_obj ->> 'completedAt')::timestamptz,
            v_scope, (v_obj ->> 'originCreatedAt')::timestamptz, (v_obj ->> 'originUpdatedAt')::timestamptz)
    ON CONFLICT (household_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 6. NEEDS ME TARGETS.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_items
  LOOP
    PERFORM 1 FROM public.needs_me_items
    WHERE household_id = v_household AND profile_id = v_uid AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: Needs Me item % is a One Move target but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'needsMeItems',
                                          'local_id', v_lid)::text;
    END IF;

    v_cat_id := NULL;
    IF (v_obj ->> 'categoryLocalId') IS NOT NULL THEN
      SELECT id INTO v_cat_id FROM public.household_categories
      WHERE household_id = v_household AND local_id = (v_obj ->> 'categoryLocalId');
      IF v_cat_id IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: Needs Me item % names category % which did not resolve',
          v_lid, v_obj ->> 'categoryLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_category', 'needs_me_local_id', v_lid,
                                            'category_local_id', v_obj ->> 'categoryLocalId')::text;
      END IF;
    END IF;

    INSERT INTO public.needs_me_items
      (household_id, local_id, origin_device_id, profile_id, title, status, due_date,
       category_id, scope, origin_created_at)
    VALUES (v_household, v_lid, p_device_id, v_uid, v_obj ->> 'title', v_obj ->> 'status',
            (v_obj ->> 'dueDate')::date, v_cat_id, COALESCE(v_obj ->> 'scope', 'personal'),
            (v_obj ->> 'originCreatedAt')::timestamptz)
    ON CONFLICT (household_id, profile_id, local_id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 7. HISTORICAL ONE MOVE ROWS, now that every target exists.
  --
  -- A retry meets rows it already wrote, so a raw unique violation is not
  -- acceptable: an identical row is an idempotent replay, and a material
  -- mismatch is preserved as conflict evidence rather than overwriting a
  -- decision she already made (B4-P0-021).
  -- ==========================================================================
  FOR v_move IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb))
  LOOP
    IF (v_move ->> 'logicalDay')::date > v_today THEN
      RAISE EXCEPTION 'claim_local_household: future logical_day %', v_move ->> 'logicalDay'
        USING errcode = '22007';
    END IF;

    v_target := NULL;
    IF (v_move ->> 'status') IN ('selected', 'completed') THEN
      IF (v_move ->> 'targetType') = 'task' THEN
        SELECT id INTO v_target FROM public.tasks
        WHERE household_id = v_household AND local_id = (v_move ->> 'targetLocalId');
      ELSE
        SELECT id INTO v_target FROM public.needs_me_items
        WHERE household_id = v_household AND profile_id = v_uid AND local_id = (v_move ->> 'targetLocalId');
      END IF;
      IF v_target IS NULL THEN
        RAISE EXCEPTION 'claim_local_household: One Move % target % did not resolve',
          v_move ->> 'localId', v_move ->> 'targetLocalId'
          USING errcode = '22023',
                detail = jsonb_build_object('reason', 'unresolved_one_move_target',
                                            'one_move_local_id', v_move ->> 'localId',
                                            'target_type', v_move ->> 'targetType',
                                            'target_local_id', v_move ->> 'targetLocalId')::text;
      END IF;
    END IF;

    SELECT * INTO v_existing FROM public.one_move_records
    WHERE household_id = v_household AND profile_id = v_uid
      AND logical_day = (v_move ->> 'logicalDay')::date;

    IF FOUND THEN
      IF v_existing.status IS DISTINCT FROM (v_move ->> 'status')
         OR v_existing.target_task_id IS DISTINCT FROM
              (CASE WHEN (v_move ->> 'targetType') = 'task' THEN v_target ELSE NULL END)
         OR v_existing.target_needs_me_id IS DISTINCT FROM
              (CASE WHEN (v_move ->> 'targetType') = 'needsMe' THEN v_target ELSE NULL END) THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'logical_day', v_move ->> 'logicalDay',
          'stored',      jsonb_build_object('status', v_existing.status,
                                            'target_task_id', v_existing.target_task_id,
                                            'target_needs_me_id', v_existing.target_needs_me_id),
          'incoming',    v_move);
      END IF;
      CONTINUE;  -- identical row: idempotent replay, nothing to do
    END IF;

    INSERT INTO public.one_move_records
      (household_id, local_id, origin_device_id, profile_id, logical_day,
       target_type, target_task_id, target_needs_me_id, status, decided_at, completed_at, cleared_at)
    VALUES (
      v_household,
      v_move ->> 'localId',
      p_device_id,
      v_uid,
      (v_move ->> 'logicalDay')::date,
      v_move ->> 'targetType',
      CASE WHEN (v_move ->> 'targetType') = 'task'    THEN v_target ELSE NULL END,
      CASE WHEN (v_move ->> 'targetType') = 'needsMe' THEN v_target ELSE NULL END,
      v_move ->> 'status',
      (v_move ->> 'decidedAt')::timestamptz,
      (v_move ->> 'completedAt')::timestamptz,
      (v_move ->> 'clearedAt')::timestamptz);
  END LOOP;

  UPDATE public.account_claims
     SET status = 'complete', household_id = v_household,
         row_counts = COALESCE(row_counts, '{}'::jsonb) || jsonb_build_object(
           'conflicts',      jsonb_array_length(v_conflicts),
           'child_members',  COALESCE(array_length(v_need_children, 1), 0),
           'categories',     COALESCE(array_length(v_need_cats, 1), 0),
           'tasks',          COALESCE(array_length(v_need_tasks, 1), 0),
           'needs_me_items', COALESCE(array_length(v_need_items, 1), 0),
           'one_moves',      jsonb_array_length(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb)),
           'payload_digest', v_digest)
   WHERE id = v_claim.id;

  RETURN private.claim_result(v_household, v_claim.id, 'complete', NULL)
         || jsonb_build_object('conflict_evidence', v_conflicts);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- sync_pull — the incremental change cursor (SD4-012).
--
-- SECURITY INVOKER on purpose, so RLS still guards every row it reports.
-- The cursor axis is committed_xid, never seq: see the proof in
-- BUILD4_SD4_CLOUD_SCHEMA.md section 6.3. Rows are re-read by the device, so
-- at-least-once delivery at the boundary is safe and loss is not.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.sync_pull(p_cursor xid8 DEFAULT '0'::xid8)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
AS $fn$
DECLARE
  v_barrier xid8 := pg_snapshot_xmin(pg_current_snapshot());
  v_rows    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'entity_table', c.entity_table,
           'entity_id',    c.entity_id,
           'op',           c.op,
           'row_revision', c.row_revision
         ) ORDER BY c.committed_xid, c.seq), '[]'::jsonb)
    INTO v_rows
    FROM public.change_log c
   WHERE c.household_id = private.current_household_id()
     AND c.committed_xid >= p_cursor
     AND c.committed_xid <  v_barrier;

  RETURN jsonb_build_object('rows', v_rows, 'next_cursor', v_barrier::text);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- sync_push — create a row under SD4-006 collision semantics.
--
-- B4-BE03-OR-001, a forward implementation fix. Everything else the push engine
-- does is ordinary DML: an UPDATE carries `revision=eq.<base>` and CAS falls out
-- of the column grants, because `revision` is SELECT-only and
-- set_row_updated_at() bumps it. Exactly ONE thing has no client-callable
-- expression, and this is it.
--
-- SD4-006 (OWNER-APPROVED, T1): "If a row already exists with that
-- (household_id, local_id) and a DIFFERENT origin_device_id, the server treats
-- it as a distinct entity: it inserts a new row with a fresh cloud uuid and
-- returns local_id_collision alongside the new cloud id. It never merges."
--
-- A plain POST cannot do that. The local-id uniqueness constraint rejects it
-- with 23505, and the pushing device may not rename its own row -- B4-P0-005
-- keeps existing local ids stable, so a device only ever chooses an id for a row
-- it has never seen. The minting has to happen here.
--
-- SECURITY INVOKER, deliberately and load-bearingly (B4-P0-025). The insert
-- happens as the CALLER, so the caller's RLS policies and column grants still
-- decide what may be written. A DEFINER function would hand a client the
-- postgres role's reach and quietly undo the privilege design; it would also
-- satisfy private.is_trusted_server_context(), which is the historical-backfill
-- key and has no business in an ordinary push.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.sync_push(
  p_entity_table text,
  p_device_id    uuid,
  p_row          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_house      uuid;
  v_local      text;
  v_owner_private boolean;
  v_owner_col  text;
  v_has_revision boolean;
  v_found_id   uuid;
  v_found_rev  bigint;
  v_found_dev  uuid;
  v_id         uuid;
  v_rev        bigint;
  v_local_out  text;
  v_status     text := 'created';
  v_clean      jsonb;
  v_cols       text;
  v_sel        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sync_push: no authenticated caller' USING errcode = '28000';
  END IF;
  IF jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'sync_push: row must be an object' USING errcode = '22023';
  END IF;

  -- An allow-list, not a pattern. A table named by the client must be one this
  -- function was built for, or the dynamic SQL below becomes a way to reach
  -- tables the push path has no business in.
  -- Which column carries the owner half of the uniqueness boundary, when the
  -- table has one. The ledger names it actor_profile_id, because the question
  -- it answers is who ACTED, not who owns.
  v_owner_col := CASE p_entity_table
                   WHEN 'one_move_records' THEN 'profile_id'
                   WHEN 'needs_me_items'   THEN 'profile_id'
                   WHEN 'discovery_records' THEN 'profile_id'
                   WHEN 'action_records'   THEN 'actor_profile_id'
                 END;
  v_owner_private := v_owner_col IS NOT NULL;
  IF NOT v_owner_private
     AND p_entity_table NOT IN ('tasks', 'events', 'household_categories',
                                'household_systems', 'meal_plan_entries') THEN
    RAISE EXCEPTION 'sync_push: % is not a pushable entity table', p_entity_table
      USING errcode = '22023';
  END IF;

  -- The action ledger is immutable and carries no revision column. Everything
  -- else does, and the caller needs it as the base for its next CAS.
  v_has_revision := p_entity_table <> 'action_records';

  v_house := (p_row ->> 'household_id')::uuid;
  v_local := p_row ->> 'local_id';
  IF v_house IS NULL OR v_local IS NULL THEN
    RAISE EXCEPTION 'sync_push: household_id and local_id are required' USING errcode = '22023';
  END IF;

  -- Not the permission check -- RLS is, and still runs. This is so the collision
  -- branch cannot be used to probe another household's local ids, which the
  -- SELECT policies would otherwise keep hidden.
  IF NOT private.is_household_member(v_house) THEN
    RAISE EXCEPTION 'sync_push: caller is not a member of household %', v_house
      USING errcode = '42501';
  END IF;

  -- Probe on the table's OWN uniqueness boundary (SD4-004): household-scoped
  -- tables key on (household_id, local_id), owner-private ones add profile_id.
  -- Probing the wrong boundary would either miss a real collision or invent one.
  EXECUTE format(
    'SELECT id, %s, origin_device_id FROM public.%I WHERE household_id = $1 AND local_id = $2%s',
    CASE WHEN v_has_revision THEN 'revision' ELSE 'NULL::bigint' END,
    p_entity_table,
    CASE WHEN v_owner_private THEN format(' AND %I = $3', v_owner_col) ELSE '' END)
    INTO v_found_id, v_found_rev, v_found_dev
    USING v_house, v_local, v_uid;

  IF v_found_id IS NOT NULL THEN
    IF v_found_dev IS NOT DISTINCT FROM p_device_id THEN
      -- The SAME install already created this row. That is a lost
      -- acknowledgement, not a collision: the device pushed, the server
      -- committed, and the answer never came back. Hand over the authoritative
      -- identity so the retry settles instead of duplicating.
      RETURN jsonb_build_object(
        'status', 'already_exists',
        'cloud_id', v_found_id,
        'revision', v_found_rev,
        'local_id', v_local);
    END IF;

    -- A DIFFERENT install owns that local id, so these are two distinct
    -- entities that happened to mint the same device-relative id. They are
    -- never merged. The incoming row takes its own cloud identity under a local
    -- id that is free here; the pushing device keeps its own local id and
    -- records the translation in its map (SD4-006).
    v_status := 'local_id_collision';
    v_local_out := left(v_local, 96) || '-x' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  ELSE
    v_local_out := v_local;
  END IF;

  -- Server-owned columns are stripped rather than trusted. The column grants
  -- would refuse them anyway; refusing here as well means the client gets a
  -- clear answer instead of a privilege error, and keeps this function honest
  -- about what it is allowed to write.
  v_clean := (p_row - 'id' - 'revision' - 'created_at' - 'updated_at'
                    - 'subject_member_type' - 'logical_day' - 'timezone_at_decision')
             || jsonb_build_object('local_id', v_local_out)
             || jsonb_build_object('origin_device_id', p_device_id);

  SELECT string_agg(quote_ident(k), ', ' ORDER BY k),
         string_agg('r.' || quote_ident(k), ', ' ORDER BY k)
    INTO v_cols, v_sel
  FROM jsonb_object_keys(v_clean) AS k;

  -- jsonb_populate_record does the type coercion, and naming the columns
  -- explicitly means every column NOT supplied keeps its default -- which is how
  -- id, revision, created_at and updated_at stay server-generated.
  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING id, %s',
    p_entity_table, v_cols, v_sel, p_entity_table,
    CASE WHEN v_has_revision THEN 'revision' ELSE 'NULL::bigint' END)
    USING v_clean
    INTO v_id, v_rev;

  RETURN jsonb_build_object(
    'status', v_status,
    'cloud_id', v_id,
    'revision', v_rev,
    'local_id', v_local_out);
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_push(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_push(text, uuid, jsonb) TO authenticated;

-- Explicit grants. Layer 1 revoked the authenticated ROUTINES default, so
-- without these the entry points are simply uncallable (NHR-03, by design).
REVOKE ALL ON FUNCTION public.bootstrap_account(uuid, text, uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_local_household(uuid, text, jsonb, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_pull(xid8)                                     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_account(uuid, text, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_household(uuid, text, jsonb, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull(xid8)                                  TO authenticated;

-- ============================================================================
-- 11. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
