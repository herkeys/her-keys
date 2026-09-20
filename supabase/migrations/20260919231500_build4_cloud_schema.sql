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
--
-- B4-FOUNDATION-BUILDOUT-01 adds the durable foundation the ultimate product is
-- built on: stored provenance on every synced row, source artifacts and external
-- references, behavioral history, authorization / intent / decision / execution /
-- outcome representation, people and responsibility, dependencies, recurrence,
-- goals, capacity, patterns and evidence, and the commitment facets and exact money
-- the four commitment kinds gained. It also makes the household a request is about
-- EXPLICIT (private.resolve_household_context) and versions the claim payload.
-- The eighteen new tables and the columns added to the nine existing ones are
-- GENERATED from src/domain/sync/foundationSpecs.ts between the marker pairs in
-- sections 8B and 9, and a test fails if the file drifts from the manifest.
-- The migration was still unapplied anywhere, so this is a revision of the same
-- file, not a second migration.

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
    -- All 34 Build 4 application tables, schema-qualified, enumerated explicitly.
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
    -- 18 foundation tables (B4-FOUNDATION-BUILDOUT-01), absent on a first run and guarded by to_regclass:
    'public.source_artifacts',
    'public.interpretations',
    'public.external_references',
    'public.behavior_observations',
    'public.automation_authorities',
    'public.action_intents',
    'public.intent_decisions',
    'public.action_executions',
    'public.action_outcomes',
    'public.household_people',
    'public.responsibilities',
    'public.dependencies',
    'public.recurrence_rules',
    'public.goals',
    'public.system_steps',
    'public.capacity_profiles',
    'public.patterns',
    'public.evidence_links',
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
    'public.discovery_answers','public.action_records','auth.users',
    'public.source_artifacts','public.interpretations','public.external_references','public.behavior_observations','public.automation_authorities','public.action_intents','public.intent_decisions','public.action_executions','public.action_outcomes','public.household_people','public.responsibilities','public.dependencies','public.recurrence_rules','public.goals','public.system_steps','public.capacity_profiles','public.patterns','public.evidence_links'
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

DROP TABLE IF EXISTS public.evidence_links           CASCADE;
DROP TABLE IF EXISTS public.patterns                 CASCADE;
DROP TABLE IF EXISTS public.capacity_profiles        CASCADE;
DROP TABLE IF EXISTS public.system_steps             CASCADE;
DROP TABLE IF EXISTS public.goals                    CASCADE;
DROP TABLE IF EXISTS public.recurrence_rules         CASCADE;
DROP TABLE IF EXISTS public.dependencies             CASCADE;
DROP TABLE IF EXISTS public.responsibilities         CASCADE;
DROP TABLE IF EXISTS public.household_people         CASCADE;
DROP TABLE IF EXISTS public.action_outcomes          CASCADE;
DROP TABLE IF EXISTS public.action_executions        CASCADE;
DROP TABLE IF EXISTS public.intent_decisions         CASCADE;
DROP TABLE IF EXISTS public.action_intents           CASCADE;
DROP TABLE IF EXISTS public.automation_authorities   CASCADE;
DROP TABLE IF EXISTS public.behavior_observations    CASCADE;
DROP TABLE IF EXISTS public.external_references      CASCADE;
DROP TABLE IF EXISTS public.interpretations          CASCADE;
DROP TABLE IF EXISTS public.source_artifacts         CASCADE;
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

-- The household a request is ABOUT, resolved from what the caller said and never guessed.
--
--   * A named household must be one the caller belongs to. A stranger's household id, or
--     a well-formed uuid that names nothing, is refused rather than answered with silence.
--   * Nothing named, and the caller belongs to exactly one household: that one. Every
--     device of a single-household account therefore resolves identically.
--   * Nothing named, and the caller belongs to several: REFUSED as ambiguous. The function
--     this replaces took LIMIT 1 of an unordered set — a coin flip presented as an answer,
--     which would have returned another household's changes the day a second membership
--     existed.
--   * The caller belongs to none: NULL, and a pull for it is empty.
CREATE FUNCTION private.resolve_household_context(p_household_id uuid DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_households uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'household context: no authenticated caller' USING errcode = '28000';
  END IF;

  SELECT COALESCE(array_agg(hm.household_id ORDER BY hm.household_id), '{}'::uuid[])
    INTO v_households
  FROM public.household_members hm
  WHERE hm.profile_id = v_uid;

  IF p_household_id IS NOT NULL THEN
    IF NOT (p_household_id = ANY (v_households)) THEN
      RAISE EXCEPTION 'household context: the caller is not a member of household %', p_household_id
        USING errcode = '42501';
    END IF;
    RETURN p_household_id;
  END IF;

  IF cardinality(v_households) > 1 THEN
    RAISE EXCEPTION 'household context is ambiguous: the caller belongs to % households and none was named',
      cardinality(v_households) USING errcode = '22023';
  END IF;

  RETURN v_households[1];
END;
$fn$;

REVOKE ALL ON FUNCTION private.is_household_member(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_household_owner(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_scoped_row(uuid, text, uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.resolve_household_context(uuid)             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_household_member(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_household_context(uuid)          TO authenticated;

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
  RAISE EXCEPTION '% is an immutable ledger: % is not permitted', tg_table_name, tg_op;
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

-- ----------------------------------------------------------------------------
-- FOUNDATION SAFETY LOGIC (B4-FOUNDATION-BUILDOUT-01)
--
-- Written out by hand and NOT generated: these are the rules a reviewer must be
-- able to read. Each one is the cloud's statement of a rule the local domain also
-- states, and tests hold the two to the same answers.
-- ----------------------------------------------------------------------------

-- A reference to a child is proven structurally (NHR-01): the type column carries
-- the third column of a composite foreign key onto household_members. It is
-- derived here and never client-written, so a client cannot assert that an adult
-- is a child. TG_ARGV[0] is the member-id column, TG_ARGV[1] the type column.
CREATE FUNCTION public.set_child_member_type()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  new := jsonb_populate_record(
           new,
           jsonb_build_object(TG_ARGV[1], CASE WHEN (to_jsonb(new) ->> TG_ARGV[0]) IS NULL THEN NULL ELSE 'child' END));
  RETURN new;
END;
$fn$;

-- "Set once" rows: a source artifact is retracted, an authority is revoked, and
-- that is the ONLY edit either ever takes. TG_ARGV[0] is the column that moves;
-- any further arguments are companion columns allowed to move with it (the local
-- updated-at stamp). Everything else is fixed the moment the row is written, and
-- the one column is set exactly once and never cleared or changed.
CREATE FUNCTION public.enforce_single_column_transition()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  v_old jsonb := to_jsonb(old) - 'updated_at' - 'revision';
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'revision';
  i     integer;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    v_old := v_old - TG_ARGV[i];
    v_new := v_new - TG_ARGV[i];
  END LOOP;

  IF v_old IS DISTINCT FROM v_new THEN
    RAISE EXCEPTION '%: only % may change once a row is written', tg_table_name, TG_ARGV[0]
      USING errcode = '23514';
  END IF;
  IF (to_jsonb(old) ->> TG_ARGV[0]) IS NOT NULL
     AND (to_jsonb(new) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(old) ->> TG_ARGV[0]) THEN
    RAISE EXCEPTION '%: % is set once and is never changed or cleared', tg_table_name, TG_ARGV[0]
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

-- A decided interpretation is history. Accepted, rejected and superseded are
-- terminal: a better reading is a NEW interpretation that names the one it replaces.
CREATE FUNCTION public.freeze_decided_interpretation()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  IF old.state = ANY (ARRAY['accepted', 'rejected', 'superseded']) THEN
    RAISE EXCEPTION 'interpretations: a % interpretation is history and is never edited', old.state
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

-- A withdrawal withdraws an APPROVAL. It cannot precede one, and it cannot stand
-- alone: "she changed her mind" only means something after she said yes.
CREATE FUNCTION public.guard_withdrawal()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
BEGIN
  IF new.decision = 'withdrawn'
     AND NOT EXISTS (SELECT 1 FROM public.intent_decisions d
                     WHERE d.intent_id = new.intent_id AND d.decision = 'approved') THEN
    RAISE EXCEPTION 'intent_decisions: a withdrawal withdraws an approval, and intent % has none', new.intent_id
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

-- Requirements cannot chain into a loop: A requires B requires A can never be
-- satisfied, and a decomposition that contains itself has no leaves. The graph is
-- `requires` and `part_of` together (`alternative_to` is not an ordering), over
-- ACTIVE edges only, per household and owner. Two devices each adding half of a
-- cycle would both pass a check of their own snapshot, so writers are serialised
-- per household for the length of the check.
CREATE FUNCTION public.forbid_dependency_cycle()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  v_from  text;
  v_to    text;
  v_found boolean;
BEGIN
  IF new.status <> 'active' OR new.relation = 'alternative_to' THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dependencies:' || new.household_id::text, 0));

  v_from := new.from_type || ':' || COALESCE(new.from_task_id, new.from_event_id, new.from_needs_me_id,
                                              new.from_system_id, new.from_meal_id, new.from_goal_id)::text;
  v_to   := new.to_type   || ':' || COALESCE(new.to_task_id, new.to_event_id, new.to_needs_me_id,
                                              new.to_system_id, new.to_meal_id, new.to_goal_id)::text;

  WITH RECURSIVE walk(node) AS (
    SELECT v_to
    UNION
    SELECT d.to_type || ':' || COALESCE(d.to_task_id, d.to_event_id, d.to_needs_me_id,
                                         d.to_system_id, d.to_meal_id, d.to_goal_id)::text
    FROM walk w
    JOIN public.dependencies d
      ON d.household_id = new.household_id
     AND d.profile_id   = new.profile_id
     AND d.status       = 'active'
     AND d.relation    <> 'alternative_to'
     AND d.id IS DISTINCT FROM new.id
     AND (d.from_type || ':' || COALESCE(d.from_task_id, d.from_event_id, d.from_needs_me_id,
                                          d.from_system_id, d.from_meal_id, d.from_goal_id)::text) = w.node
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE node = v_from) INTO v_found;

  IF v_found THEN
    RAISE EXCEPTION 'dependencies: % requiring % would close a cycle', v_from, v_to
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$fn$;

-- THE AUTHORIZATION BOUNDARY (representation only — there is no executor).
--
-- An execution is Her Keys having acted, and it is refused unless valid
-- authorization covers it. This is the cloud's statement of
-- executionAuthorization() and authorityCoverage() in src/domain/foundation/
-- authorization.ts; tests/supabase hold the two to the same verdict for the same
-- inputs, and the refusal names its reason the same way.
--
--   * relying on an APPROVAL: it must be for this intent, be an approval, be the one
--     standing answer, and not have been withdrawn;
--   * relying on a STANDING AUTHORITY: it must be in execute mode, not revoked, not
--     expired, granted before the attempt, of this category, at least as consequential
--     as the intent, inside its category / child / provider / amount boundary, and —
--     when it is a one-time grant — not already spent by another execution;
--   * relying on neither: refused.
--
-- Runs BEFORE INSERT for every writer, the table owner included. Only the trusted
-- server boundary can write an execution at all (no client grant, no client policy),
-- so this is defence in depth against a mistaken server script rather than the only
-- control.
CREATE FUNCTION public.guard_execution_authorization()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $fn$
DECLARE
  i          public.action_intents%ROWTYPE;
  d          public.intent_decisions%ROWTYPE;
  a          public.automation_authorities%ROWTYPE;
  v_standing uuid;
  v_withdrawn boolean;
  v_category uuid;
  v_subject  uuid;
  v_reason   text;
  v_rank     text[] := ARRAY['low', 'moderate', 'high', 'critical'];
BEGIN
  SELECT * INTO i FROM public.action_intents WHERE id = new.intent_id;

  IF NOT FOUND THEN
    v_reason := 'no_such_intent';

  ELSIF new.decision_id IS NOT NULL THEN
    SELECT * INTO d FROM public.intent_decisions WHERE id = new.decision_id;
    IF NOT FOUND OR d.intent_id <> i.id THEN
      v_reason := 'wrong_intent';
    ELSE
      SELECT x.id INTO v_standing
      FROM public.intent_decisions x
      WHERE x.intent_id = i.id AND x.decision <> 'withdrawn'
      ORDER BY x.created_at, x.id LIMIT 1;
      SELECT EXISTS (SELECT 1 FROM public.intent_decisions x
                     WHERE x.intent_id = i.id AND x.decision = 'withdrawn') INTO v_withdrawn;
      IF NOT (d.decision = 'approved' AND v_standing = d.id AND NOT v_withdrawn) THEN
        v_reason := 'not_approved';
      END IF;
    END IF;

  ELSIF new.authority_id IS NOT NULL THEN
    SELECT * INTO a FROM public.automation_authorities WHERE id = new.authority_id;
    IF NOT FOUND THEN
      v_reason := 'no_authorization';
    ELSIF a.mode <> 'execute_authorized' THEN
      v_reason := 'not_execute_mode';
    ELSE
      -- What an authority's boundary is measured against: the category, and for a
      -- task or an event the child, of the row the intent is about (intentContext()).
      IF i.about_type = 'task' THEN
        SELECT t.category_id, t.subject_member_id INTO v_category, v_subject FROM public.tasks t WHERE t.id = i.about_task_id;
      ELSIF i.about_type = 'event' THEN
        SELECT e.category_id, e.subject_member_id INTO v_category, v_subject FROM public.events e WHERE e.id = i.about_event_id;
      ELSIF i.about_type = 'needsMe' THEN
        SELECT n.category_id INTO v_category FROM public.needs_me_items n WHERE n.id = i.about_needs_me_id;
      ELSIF i.about_type = 'system' THEN
        SELECT s.category_id INTO v_category FROM public.household_systems s WHERE s.id = i.about_system_id;
      ELSIF i.about_type = 'meal' THEN
        SELECT m.category_id INTO v_category FROM public.meal_plan_entries m WHERE m.id = i.about_meal_id;
      ELSIF i.about_type = 'goal' THEN
        SELECT g.category_id INTO v_category FROM public.goals g WHERE g.id = i.about_goal_id;
      END IF;

      v_reason := CASE
        WHEN a.revoked_at IS NOT NULL AND a.revoked_at <= new.attempted_at THEN 'revoked'
        WHEN a.granted_at > new.attempted_at THEN 'not_yet_granted'
        WHEN a.expires_at IS NOT NULL AND a.expires_at <= new.attempted_at THEN 'expired'
        WHEN a.category <> i.category THEN 'wrong_category'
        WHEN array_position(v_rank, i.consequence) > array_position(v_rank, a.max_consequence) THEN 'consequence_exceeds_authority'
        WHEN a.category_id IS NOT NULL AND a.category_id IS DISTINCT FROM v_category THEN 'outside_category_boundary'
        WHEN a.subject_member_id IS NOT NULL AND a.subject_member_id IS DISTINCT FROM v_subject THEN 'outside_child_boundary'
        WHEN a.provider IS NOT NULL AND a.provider IS DISTINCT FROM i.provider THEN 'outside_provider_boundary'
        WHEN a.max_amount_minor IS NOT NULL AND i.amount_amount_minor IS NOT NULL
             AND (i.amount_currency IS DISTINCT FROM a.max_amount_currency
                  OR i.amount_amount_minor > a.max_amount_minor) THEN 'exceeds_amount_limit'
        WHEN NOT a.persistent
             AND EXISTS (SELECT 1 FROM public.action_executions e WHERE e.authority_id = a.id) THEN 'already_used'
        ELSE NULL
      END;
    END IF;

  ELSE
    v_reason := 'no_authorization';
  END IF;

  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'action_executions: not authorized (%)', v_reason
      USING errcode = '42501', detail = v_reason;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_child_member_type()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_single_column_transition()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.freeze_decided_interpretation()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_withdrawal()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_dependency_cycle()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_execution_authorization()     FROM PUBLIC, anon, authenticated;

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
    'discovery_records'::text, 'action_records'::text,
    -- foundation tables (B4-FOUNDATION-BUILDOUT-01)
    'source_artifacts'::text, 'interpretations'::text, 'external_references'::text,
    'behavior_observations'::text, 'automation_authorities'::text, 'action_intents'::text,
    'intent_decisions'::text, 'action_executions'::text, 'action_outcomes'::text,
    'household_people'::text, 'responsibilities'::text, 'dependencies'::text,
    'recurrence_rules'::text, 'goals'::text, 'system_steps'::text,
    'capacity_profiles'::text, 'patterns'::text, 'evidence_links'::text
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

-- SD4-019 / B4-FOUNDATION-BUILDOUT-01: events.source is RETIRED. It could say only
-- 'user' or 'demo', which is a two-value answer to a question the product now asks of
-- every row. Where a row came from is the `producer` column added to all nine synced
-- content tables in section 8B, and 'demo-seed' is not an accepted producer, so the
-- cloud still cannot hold a demo row at all (B4-P0-010) -- for events as for the rest.

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
  target_event_id     uuid,
  target_system_id    uuid,
  target_responsibility_id uuid,
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

-- The five target foreign keys are added in section 8C, after the composite keys they
-- reference exist. They are CASCADE, deliberately, not RESTRICT: both tables already
-- cascade from households, and a RESTRICT between two siblings of the same cascade can
-- make a household delete fail depending on the order PostgreSQL picks. A One Move record
-- is meaningless without its target, so cascading is also the correct semantics.

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
-- B4-FOUNDATION-BUILDOUT-01: a One Move can name a task, a Needs Me item, an event, a
-- system or a responsibility, each through its OWN typed foreign key (ADR-005/021). 'catalog'
-- stays refused: the catalog exists only in a demo household, and demo never syncs.
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_type_check
  CHECK (target_type = ANY (ARRAY['task'::text, 'needsMe'::text, 'event'::text, 'system'::text, 'responsibility'::text]));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_shape_check
  CHECK (
    CASE
      WHEN status IN ('withheld', 'cleared')
        THEN target_task_id IS NULL AND target_needs_me_id IS NULL AND target_event_id IS NULL
         AND target_system_id IS NULL AND target_responsibility_id IS NULL
      ELSE (target_type = 'task')           = (target_task_id IS NOT NULL)
       AND (target_type = 'needsMe')        = (target_needs_me_id IS NOT NULL)
       AND (target_type = 'event')          = (target_event_id IS NOT NULL)
       AND (target_type = 'system')         = (target_system_id IS NOT NULL)
       AND (target_type = 'responsibility') = (target_responsibility_id IS NOT NULL)
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
CREATE INDEX one_move_records_target_event_idx
  ON public.one_move_records (target_event_id) WHERE target_event_id IS NOT NULL;
CREATE INDEX one_move_records_target_system_idx
  ON public.one_move_records (target_system_id) WHERE target_system_id IS NOT NULL;
CREATE INDEX one_move_records_target_responsibility_idx
  ON public.one_move_records (target_responsibility_id) WHERE target_responsibility_id IS NOT NULL;

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

-- (The One Move -> needs_me_items foreign key is added in section 8C.)

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
-- 8B. FOUNDATION TABLES  (B4-FOUNDATION-BUILDOUT-01) — GENERATED
--
-- Eighteen owner-private tables, and the provenance and commitment-facet columns the
-- nine existing content tables gained. Every one follows the pattern already used by
-- one_move_records and needs_me_items: server-generated id, local_id unique per
-- (household, owner), owner-only RLS, revision + CAS where the row is edited, the pointer
-- change log, and named-column grants.
--
-- Three things distinguish them, all stated in the manifest rather than assumed:
--   * EVIDENCE tables (observations, intents, decisions, executions, outcomes, evidence
--     links) are append-only: no UPDATE policy, no UPDATE grant, and the ledger trigger
--     refuses UPDATE and DELETE for every writer.
--   * SERVER-WRITTEN tables (executions, outcomes) carry no client INSERT grant and no
--     client INSERT policy. A device pulls them; it cannot forge one. Automation authority
--     is not client authority.
--   * Every reference between rows is a real foreign key that also proves same household
--     and same owner. There is no polymorphic id column anywhere: a reference to "one of
--     several kinds" is a type column plus one typed foreign key per kind (ADR-005).
-- ============================================================================

-- >>> GENERATED foundation-tables — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
-- Phase 1 — the tables. Columns only, in one pass, because the references between them are cyclic:
-- an external reference is written by an execution, and an execution may name an external reference.
CREATE TABLE public.source_artifacts (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL,
  local_id          text NOT NULL,
  origin_device_id  uuid,
  profile_id        uuid NOT NULL,
  kind              text NOT NULL,
  origin            text NOT NULL,
  provider          text,
  received_at       timestamptz NOT NULL,
  content_digest    text,
  content_ref       text,
  retracted_at      timestamptz,
  scope             text NOT NULL DEFAULT 'personal',
  origin_created_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  revision          bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.source_artifacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.interpretations (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL,
  local_id               text NOT NULL,
  origin_device_id       uuid,
  profile_id             uuid NOT NULL,
  artifact_id            uuid NOT NULL,
  proposed_kind          text NOT NULL,
  title                  text NOT NULL,
  due_date               date,
  starts_at              timestamptz,
  ends_at                timestamptz,
  duration_minutes       integer,
  value_amount_minor     bigint,
  value_currency         text,
  value_direction        text,
  subject_member_id      uuid,
  subject_member_type    text,
  category_hint          text,
  state                  text NOT NULL,
  clarification          text,
  accepted_type          text,
  accepted_task_id       uuid,
  accepted_event_id      uuid,
  accepted_needs_me_id   uuid,
  supersedes_id          uuid,
  interpretation_version integer NOT NULL,
  decided_at             timestamptz,
  producer               text NOT NULL,
  source_artifact_id     uuid,
  confidence             text,
  scope                  text NOT NULL DEFAULT 'personal',
  origin_created_at      timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  revision               bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.interpretations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.external_references (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL,
  local_id             text NOT NULL,
  origin_device_id     uuid,
  profile_id           uuid NOT NULL,
  provider             text NOT NULL,
  external_account     text NOT NULL,
  external_object_id   text NOT NULL,
  external_version     text,
  origin               text NOT NULL,
  direction            text NOT NULL,
  authority            text NOT NULL,
  last_observed_at     timestamptz,
  last_observed_digest text,
  linked_type          text,
  linked_task_id       uuid,
  linked_event_id      uuid,
  linked_needs_me_id   uuid,
  linked_system_id     uuid,
  linked_meal_id       uuid,
  linked_goal_id       uuid,
  written_at           timestamptz,
  status               text NOT NULL,
  producer             text NOT NULL,
  source_artifact_id   uuid,
  confidence           text,
  scope                text NOT NULL DEFAULT 'personal',
  origin_created_at    timestamptz NOT NULL,
  origin_updated_at    timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  revision             bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.external_references ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.behavior_observations (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL,
  local_id                text NOT NULL,
  origin_device_id        uuid,
  profile_id              uuid NOT NULL,
  about_type              text NOT NULL,
  about_task_id           uuid,
  about_event_id          uuid,
  about_needs_me_id       uuid,
  about_system_id         uuid,
  about_meal_id           uuid,
  about_goal_id           uuid,
  about_responsibility_id uuid,
  about_one_move_id       uuid,
  about_interpretation_id uuid,
  outcome                 text NOT NULL,
  occurred_at             timestamptz NOT NULL,
  logical_date            date NOT NULL,
  planned_date            date,
  to_date                 date,
  producer                text NOT NULL,
  source_artifact_id      uuid,
  confidence              text,
  scope                   text NOT NULL DEFAULT 'personal',
  origin_created_at       timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.behavior_observations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.automation_authorities (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL,
  local_id            text NOT NULL,
  origin_device_id    uuid,
  profile_id          uuid NOT NULL,
  category            text NOT NULL,
  mode                text NOT NULL,
  max_consequence     text NOT NULL,
  persistent          boolean NOT NULL,
  category_id         uuid,
  subject_member_id   uuid,
  subject_member_type text,
  provider            text,
  max_amount_minor    bigint,
  max_amount_currency text,
  granted_at          timestamptz NOT NULL,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  producer            text NOT NULL,
  source_artifact_id  uuid,
  confidence          text,
  scope               text NOT NULL DEFAULT 'personal',
  origin_created_at   timestamptz NOT NULL,
  origin_updated_at   timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revision            bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.automation_authorities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.action_intents (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL,
  local_id                text NOT NULL,
  origin_device_id        uuid,
  profile_id              uuid NOT NULL,
  category                text NOT NULL,
  about_type              text,
  about_task_id           uuid,
  about_event_id          uuid,
  about_needs_me_id       uuid,
  about_system_id         uuid,
  about_meal_id           uuid,
  about_goal_id           uuid,
  about_responsibility_id uuid,
  consequence             text NOT NULL,
  reversibility           text NOT NULL,
  summary_code            text NOT NULL,
  amount_amount_minor     bigint,
  amount_currency         text,
  amount_direction        text,
  provider                text,
  permitted_mode          text NOT NULL,
  expires_at              timestamptz,
  producer                text NOT NULL,
  source_artifact_id      uuid,
  confidence              text,
  scope                   text NOT NULL DEFAULT 'personal',
  origin_created_at       timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_intents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.intent_decisions (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  intent_id          uuid NOT NULL,
  decision           text NOT NULL,
  basis              text NOT NULL,
  authority_id       uuid,
  decided_at         timestamptz NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intent_decisions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.action_executions (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id             uuid NOT NULL,
  local_id                 text NOT NULL,
  origin_device_id         uuid,
  profile_id               uuid NOT NULL,
  intent_id                uuid NOT NULL,
  decision_id              uuid,
  authority_id             uuid,
  attempt                  integer NOT NULL,
  attempted_at             timestamptz NOT NULL,
  provider                 text,
  external_action_id       text,
  external_reference_id    uuid,
  result                   text NOT NULL,
  error_class              text NOT NULL,
  reversibility            text NOT NULL,
  compensation_code        text,
  compensates_execution_id uuid,
  producer                 text NOT NULL,
  source_artifact_id       uuid,
  confidence               text,
  scope                    text NOT NULL DEFAULT 'personal',
  origin_created_at        timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_executions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.action_outcomes (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  execution_id       uuid NOT NULL,
  kind               text NOT NULL,
  observed_at        timestamptz NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.household_people (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  display_name       text NOT NULL,
  relationship       text NOT NULL,
  channel            text NOT NULL,
  status             text NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.household_people ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.responsibilities (
  id                         uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id               uuid NOT NULL,
  local_id                   text NOT NULL,
  origin_device_id           uuid,
  profile_id                 uuid NOT NULL,
  about_type                 text NOT NULL,
  about_task_id              uuid,
  about_event_id             uuid,
  about_needs_me_id          uuid,
  about_system_id            uuid,
  about_meal_id              uuid,
  about_goal_id              uuid,
  responsible_kind           text NOT NULL,
  responsible_person_id      uuid,
  responsible_child_id       uuid,
  responsible_child_type     text,
  state                      text NOT NULL,
  requested_at               timestamptz,
  acknowledged_at            timestamptz,
  responded_at               timestamptz,
  completed_at               timestamptz,
  returned_at                timestamptz,
  ack_due_at                 timestamptz,
  still_needs_me             boolean NOT NULL,
  previous_responsibility_id uuid,
  producer                   text NOT NULL,
  source_artifact_id         uuid,
  confidence                 text,
  scope                      text NOT NULL DEFAULT 'personal',
  origin_created_at          timestamptz NOT NULL,
  origin_updated_at          timestamptz NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  revision                   bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.responsibilities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.dependencies (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  relation           text NOT NULL,
  from_type          text NOT NULL,
  from_task_id       uuid,
  from_event_id      uuid,
  from_needs_me_id   uuid,
  from_system_id     uuid,
  from_meal_id       uuid,
  from_goal_id       uuid,
  to_type            text NOT NULL,
  to_task_id         uuid,
  to_event_id        uuid,
  to_needs_me_id     uuid,
  to_system_id       uuid,
  to_meal_id         uuid,
  to_goal_id         uuid,
  status             text NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.dependencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recurrence_rules (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL,
  local_id            text NOT NULL,
  origin_device_id    uuid,
  profile_id          uuid NOT NULL,
  about_type          text NOT NULL,
  about_task_id       uuid,
  about_event_id      uuid,
  about_system_id     uuid,
  about_meal_id       uuid,
  trigger_kind        text NOT NULL,
  frequency           text,
  interval_count      integer NOT NULL,
  by_weekday          smallint[],
  by_month_day        integer,
  anchor_date         date NOT NULL,
  time_of_day_minutes integer,
  timezone            text NOT NULL,
  ends_on             date,
  occurrence_count    integer,
  status              text NOT NULL,
  producer            text NOT NULL,
  source_artifact_id  uuid,
  confidence          text,
  scope               text NOT NULL DEFAULT 'personal',
  origin_created_at   timestamptz NOT NULL,
  origin_updated_at   timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revision            bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.recurrence_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.goals (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  title              text NOT NULL,
  status             text NOT NULL,
  target_date        date,
  category_id        uuid,
  catalog_goal_id    text,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_steps (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  system_id          uuid NOT NULL,
  position           integer NOT NULL,
  title              text NOT NULL,
  effort_minutes     integer,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.system_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.capacity_profiles (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id              uuid NOT NULL,
  local_id                  text NOT NULL,
  origin_device_id          uuid,
  profile_id                uuid NOT NULL,
  day_start_minutes         integer,
  day_end_minutes           integer,
  transition_buffer_minutes integer,
  producer                  text NOT NULL,
  source_artifact_id        uuid,
  confidence                text,
  scope                     text NOT NULL DEFAULT 'personal',
  origin_created_at         timestamptz NOT NULL,
  origin_updated_at         timestamptz NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  revision                  bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.capacity_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.patterns (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL,
  local_id           text NOT NULL,
  origin_device_id   uuid,
  profile_id         uuid NOT NULL,
  kind               text NOT NULL,
  about_type         text,
  about_task_id      uuid,
  about_event_id     uuid,
  about_needs_me_id  uuid,
  about_system_id    uuid,
  about_meal_id      uuid,
  about_goal_id      uuid,
  category_id        uuid,
  weekday            integer,
  time_bucket        text,
  status             text NOT NULL,
  first_observed_on  date NOT NULL,
  last_observed_on   date NOT NULL,
  producer           text NOT NULL,
  source_artifact_id uuid,
  confidence         text,
  scope              text NOT NULL DEFAULT 'personal',
  origin_created_at  timestamptz NOT NULL,
  origin_updated_at  timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  revision           bigint NOT NULL DEFAULT 1
);

ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.evidence_links (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  household_id              uuid NOT NULL,
  local_id                  text NOT NULL,
  origin_device_id          uuid,
  profile_id                uuid NOT NULL,
  for_type                  text NOT NULL,
  for_pattern_id            uuid,
  for_one_move_id           uuid,
  for_intent_id             uuid,
  support_type              text NOT NULL,
  support_task_id           uuid,
  support_event_id          uuid,
  support_needs_me_id       uuid,
  support_system_id         uuid,
  support_meal_id           uuid,
  support_goal_id           uuid,
  support_responsibility_id uuid,
  support_observation_id    uuid,
  code                      text NOT NULL,
  producer                  text NOT NULL,
  source_artifact_id        uuid,
  confidence                text,
  scope                     text NOT NULL DEFAULT 'personal',
  origin_created_at         timestamptz NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;

-- Phase 2 — the keys every reference depends on: on the new tables, and the composite keys on the tables that already existed.
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_pkey PRIMARY KEY (id);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_pkey PRIMARY KEY (id);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_pkey PRIMARY KEY (id);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_pkey PRIMARY KEY (id);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_pkey PRIMARY KEY (id);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_pkey PRIMARY KEY (id);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_pkey PRIMARY KEY (id);
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_pkey PRIMARY KEY (id);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_pkey PRIMARY KEY (id);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_pkey PRIMARY KEY (id);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.goals ADD CONSTRAINT goals_pkey PRIMARY KEY (id);
ALTER TABLE public.goals ADD CONSTRAINT goals_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.goals ADD CONSTRAINT goals_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_pkey PRIMARY KEY (id);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_household_id_profile_id_local_id_key UNIQUE (household_id, profile_id, local_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.events ADD CONSTRAINT events_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_id_household_id_key UNIQUE (id, household_id);
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_id_household_id_profile_id_key UNIQUE (id, household_id, profile_id);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_id_household_id_key UNIQUE (id, household_id);

-- Phase 3 — provenance and the commitment facets on the nine tables that already existed. NULL means "not known".
ALTER TABLE public.household_categories
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text;
ALTER TABLE public.events
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text,
  ADD COLUMN energy_demand text,
  ADD COLUMN consequence text,
  ADD COLUMN needs_me_personally boolean,
  ADD COLUMN value_amount_minor bigint,
  ADD COLUMN value_currency text,
  ADD COLUMN value_direction text;
ALTER TABLE public.tasks
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text,
  ADD COLUMN due_at timestamptz,
  ADD COLUMN earliest_start_at timestamptz,
  ADD COLUMN latest_finish_at timestamptz,
  ADD COLUMN splittable boolean,
  ADD COLUMN min_chunk_minutes integer,
  ADD COLUMN preferred_time_of_day text,
  ADD COLUMN energy_demand text,
  ADD COLUMN consequence text,
  ADD COLUMN needs_me_personally boolean,
  ADD COLUMN travel_minutes_before integer,
  ADD COLUMN travel_minutes_after integer,
  ADD COLUMN preparation_minutes integer,
  ADD COLUMN value_amount_minor bigint,
  ADD COLUMN value_currency text,
  ADD COLUMN value_direction text;
ALTER TABLE public.household_systems
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text,
  ADD COLUMN automation_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN effort_minutes integer,
  ADD COLUMN energy_demand text;
ALTER TABLE public.meal_plan_entries
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text,
  ADD COLUMN prep_minutes integer,
  ADD COLUMN energy_demand text;
ALTER TABLE public.needs_me_items
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text;
ALTER TABLE public.one_move_records
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text;
ALTER TABLE public.discovery_records
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text;
ALTER TABLE public.onboarding_state
  ADD COLUMN producer           text NOT NULL,
  ADD COLUMN source_artifact_id uuid,
  ADD COLUMN confidence         text;

-- Phase 4 — every foundation table's constraints, indexes, triggers and policies.
-- source_artifacts
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_revision_check CHECK (revision > 0);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_kind_check CHECK (kind = ANY (ARRAY['voice-utterance','email','calendar-item','document','screenshot','school-notice','receipt','bill','message','connected-object']));
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_origin_check CHECK (origin = ANY (ARRAY['user-submitted','voice','connector']));
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_voice_pairing_check CHECK ((origin = 'voice') = (kind = 'voice-utterance'));
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_connector_provider_check CHECK (origin <> 'connector' OR provider IS NOT NULL);
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_provider_check CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_digest_check CHECK (content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$');
ALTER TABLE public.source_artifacts ADD CONSTRAINT source_artifacts_content_ref_check CHECK (content_ref IS NULL OR content_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$');
CREATE INDEX source_artifacts_owner_idx ON public.source_artifacts (household_id, profile_id);
CREATE UNIQUE INDEX source_artifacts_digest_uq
  ON public.source_artifacts (household_id, profile_id, content_digest) WHERE content_digest IS NOT NULL;
CREATE TRIGGER source_artifacts_force_id BEFORE INSERT OR UPDATE ON public.source_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER source_artifacts_set_updated_at BEFORE UPDATE ON public.source_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER source_artifacts_retract_once BEFORE UPDATE ON public.source_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_column_transition('retracted_at');
CREATE TRIGGER source_artifacts_log_change AFTER INSERT OR UPDATE OR DELETE ON public.source_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY source_artifacts_select_own ON public.source_artifacts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY source_artifacts_insert_own ON public.source_artifacts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY source_artifacts_update_own ON public.source_artifacts
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- interpretations
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_revision_check CHECK (revision > 0);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_artifact_id_fkey FOREIGN KEY (artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_value_money_check CHECK (((value_amount_minor IS NULL) = (value_currency IS NULL))
    AND ((value_amount_minor IS NULL) = (value_direction IS NULL))
    AND (value_amount_minor IS NULL OR (value_amount_minor >= 0 AND value_amount_minor <= 9007199254740991))
    AND (value_currency IS NULL OR value_currency ~ '^[A-Z]{3}$')
    AND (value_direction IS NULL OR value_direction = ANY (ARRAY['outflow','inflow'])));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_subject_member_type_pairing_check CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_subject_member_type_child_check CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_subject_member_id_fkey FOREIGN KEY (subject_member_id, household_id, subject_member_type)
    REFERENCES public.household_members(id, household_id, member_type) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_ref_check CHECK ((accepted_type IS NULL OR accepted_type = ANY (ARRAY['task', 'event', 'needsMe']))
    AND (COALESCE(accepted_type = 'task', false) = (accepted_task_id IS NOT NULL))
    AND (COALESCE(accepted_type = 'event', false) = (accepted_event_id IS NOT NULL))
    AND (COALESCE(accepted_type = 'needsMe', false) = (accepted_needs_me_id IS NOT NULL)));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_task_id_fkey FOREIGN KEY (accepted_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_event_id_fkey FOREIGN KEY (accepted_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_needs_me_id_fkey FOREIGN KEY (accepted_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_supersedes_id_fkey FOREIGN KEY (supersedes_id, household_id, profile_id)
    REFERENCES public.interpretations(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_kind_check CHECK (proposed_kind = ANY (ARRAY['task','event','needsMe']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_state_check CHECK (state = ANY (ARRAY['pending','clarifying','accepted','rejected','superseded']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_duration_check CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_hint_check CHECK (category_hint IS NULL OR category_hint = ANY (ARRAY['kids','home','money','meals','work','wellbeing','relationships','coparenting']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_clarification_check CHECK ((state = 'clarifying') = (clarification IS NOT NULL) AND (clarification IS NULL OR clarification ~ '^[a-z][a-z0-9_.-]{0,63}$'));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_check CHECK ((state = 'accepted') = (accepted_type IS NOT NULL));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_accepted_kind_check CHECK (accepted_type IS NULL OR accepted_type = proposed_kind);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_decided_check CHECK ((state IN ('accepted','rejected','superseded')) = (decided_at IS NOT NULL));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_event_times_check CHECK (CASE WHEN proposed_kind = 'event' THEN starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at ELSE starts_at IS NULL AND ends_at IS NULL END);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_producer_check CHECK (producer = ANY (ARRAY['ai-inference','import-sync']));
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_artifact_provenance_check CHECK (source_artifact_id = artifact_id);
ALTER TABLE public.interpretations ADD CONSTRAINT interpretations_version_check CHECK (interpretation_version >= 1 AND interpretation_version <= 1000);
CREATE INDEX interpretations_owner_idx ON public.interpretations (household_id, profile_id);
CREATE INDEX interpretations_artifact_id_fk_idx ON public.interpretations (artifact_id, household_id) WHERE artifact_id IS NOT NULL;
CREATE INDEX interpretations_subject_member_id_fk_idx ON public.interpretations (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX interpretations_accepted_task_id_fk_idx ON public.interpretations (accepted_task_id, household_id) WHERE accepted_task_id IS NOT NULL;
CREATE INDEX interpretations_accepted_event_id_fk_idx ON public.interpretations (accepted_event_id, household_id) WHERE accepted_event_id IS NOT NULL;
CREATE INDEX interpretations_accepted_needs_me_id_fk_idx ON public.interpretations (accepted_needs_me_id, household_id) WHERE accepted_needs_me_id IS NOT NULL;
CREATE INDEX interpretations_supersedes_id_fk_idx ON public.interpretations (supersedes_id, household_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX interpretations_source_artifact_id_fk_idx ON public.interpretations (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER interpretations_force_id BEFORE INSERT OR UPDATE ON public.interpretations
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER interpretations_set_updated_at BEFORE UPDATE ON public.interpretations
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER interpretations_set_subject_member_type BEFORE INSERT OR UPDATE ON public.interpretations
  FOR EACH ROW EXECUTE FUNCTION public.set_child_member_type('subject_member_id', 'subject_member_type');
CREATE TRIGGER interpretations_freeze_decided BEFORE UPDATE ON public.interpretations
  FOR EACH ROW EXECUTE FUNCTION public.freeze_decided_interpretation();
CREATE TRIGGER interpretations_log_change AFTER INSERT OR UPDATE OR DELETE ON public.interpretations
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY interpretations_select_own ON public.interpretations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY interpretations_insert_own ON public.interpretations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY interpretations_update_own ON public.interpretations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- external_references
ALTER TABLE public.external_references ADD CONSTRAINT external_references_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_revision_check CHECK (revision > 0);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_ref_check CHECK ((linked_type IS NULL OR linked_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal']))
    AND (COALESCE(linked_type = 'task', false) = (linked_task_id IS NOT NULL))
    AND (COALESCE(linked_type = 'event', false) = (linked_event_id IS NOT NULL))
    AND (COALESCE(linked_type = 'needsMe', false) = (linked_needs_me_id IS NOT NULL))
    AND (COALESCE(linked_type = 'system', false) = (linked_system_id IS NOT NULL))
    AND (COALESCE(linked_type = 'meal', false) = (linked_meal_id IS NOT NULL))
    AND (COALESCE(linked_type = 'goal', false) = (linked_goal_id IS NOT NULL)));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_task_id_fkey FOREIGN KEY (linked_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_event_id_fkey FOREIGN KEY (linked_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_needs_me_id_fkey FOREIGN KEY (linked_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_system_id_fkey FOREIGN KEY (linked_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_meal_id_fkey FOREIGN KEY (linked_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_linked_goal_id_fkey FOREIGN KEY (linked_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.external_references ADD CONSTRAINT external_references_provider_check CHECK (provider ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.external_references ADD CONSTRAINT external_references_account_check CHECK (char_length(external_account) >= 1 AND char_length(external_account) <= 128);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_object_check CHECK (char_length(external_object_id) >= 1 AND char_length(external_object_id) <= 256);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_version_check CHECK (external_version IS NULL OR char_length(external_version) <= 128);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_origin_check CHECK (origin = ANY (ARRAY['external','her-keys']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_direction_check CHECK (direction = ANY (ARRAY['inbound','outbound','bidirectional']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_authority_check CHECK (authority = ANY (ARRAY['external','her-keys']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_status_check CHECK (status = ANY (ARRAY['active','unlinked','gone']));
ALTER TABLE public.external_references ADD CONSTRAINT external_references_digest_check CHECK (last_observed_digest IS NULL OR last_observed_digest ~ '^[0-9a-f]{64}$');
ALTER TABLE public.external_references ADD CONSTRAINT external_references_her_keys_written_check CHECK (origin <> 'her-keys' OR written_at IS NOT NULL);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_external_not_written_check CHECK (origin <> 'external' OR written_at IS NULL);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_her_keys_linked_check CHECK (NOT (origin = 'her-keys' AND status = 'active') OR linked_type IS NOT NULL);
ALTER TABLE public.external_references ADD CONSTRAINT external_references_identity_key UNIQUE (household_id, profile_id, provider, external_account, external_object_id);
CREATE INDEX external_references_owner_idx ON public.external_references (household_id, profile_id);
CREATE INDEX external_references_linked_task_id_fk_idx ON public.external_references (linked_task_id, household_id) WHERE linked_task_id IS NOT NULL;
CREATE INDEX external_references_linked_event_id_fk_idx ON public.external_references (linked_event_id, household_id) WHERE linked_event_id IS NOT NULL;
CREATE INDEX external_references_linked_needs_me_id_fk_idx ON public.external_references (linked_needs_me_id, household_id) WHERE linked_needs_me_id IS NOT NULL;
CREATE INDEX external_references_linked_system_id_fk_idx ON public.external_references (linked_system_id, household_id) WHERE linked_system_id IS NOT NULL;
CREATE INDEX external_references_linked_meal_id_fk_idx ON public.external_references (linked_meal_id, household_id) WHERE linked_meal_id IS NOT NULL;
CREATE INDEX external_references_linked_goal_id_fk_idx ON public.external_references (linked_goal_id, household_id) WHERE linked_goal_id IS NOT NULL;
CREATE INDEX external_references_source_artifact_id_fk_idx ON public.external_references (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER external_references_force_id BEFORE INSERT OR UPDATE ON public.external_references
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER external_references_set_updated_at BEFORE UPDATE ON public.external_references
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER external_references_log_change AFTER INSERT OR UPDATE OR DELETE ON public.external_references
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY external_references_select_own ON public.external_references
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY external_references_insert_own ON public.external_references
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY external_references_update_own ON public.external_references
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- behavior_observations
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_ref_check CHECK ((about_type IS NULL OR about_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility', 'oneMove', 'interpretation']))
    AND (COALESCE(about_type = 'task', false) = (about_task_id IS NOT NULL))
    AND (COALESCE(about_type = 'event', false) = (about_event_id IS NOT NULL))
    AND (COALESCE(about_type = 'needsMe', false) = (about_needs_me_id IS NOT NULL))
    AND (COALESCE(about_type = 'system', false) = (about_system_id IS NOT NULL))
    AND (COALESCE(about_type = 'meal', false) = (about_meal_id IS NOT NULL))
    AND (COALESCE(about_type = 'goal', false) = (about_goal_id IS NOT NULL))
    AND (COALESCE(about_type = 'responsibility', false) = (about_responsibility_id IS NOT NULL))
    AND (COALESCE(about_type = 'oneMove', false) = (about_one_move_id IS NOT NULL))
    AND (COALESCE(about_type = 'interpretation', false) = (about_interpretation_id IS NOT NULL)));
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_task_id_fkey FOREIGN KEY (about_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_event_id_fkey FOREIGN KEY (about_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_needs_me_id_fkey FOREIGN KEY (about_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_system_id_fkey FOREIGN KEY (about_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_meal_id_fkey FOREIGN KEY (about_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_goal_id_fkey FOREIGN KEY (about_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_responsibility_id_fkey FOREIGN KEY (about_responsibility_id, household_id, profile_id)
    REFERENCES public.responsibilities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_one_move_id_fkey FOREIGN KEY (about_one_move_id, household_id, profile_id)
    REFERENCES public.one_move_records(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_about_interpretation_id_fkey FOREIGN KEY (about_interpretation_id, household_id, profile_id)
    REFERENCES public.interpretations(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_outcome_check CHECK (outcome = ANY (ARRAY['completed','reopened','deferred','skipped','missed','cancelled','rescheduled','selected','withheld','cleared','delegated','acknowledged','accepted','declined','returned','reassigned','unacknowledged']));
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_outcome_validity_check CHECK (CASE about_type
        WHEN 'task'           THEN outcome IN ('completed','reopened','deferred','skipped','cancelled','missed')
        WHEN 'event'          THEN outcome IN ('cancelled','rescheduled')
        WHEN 'needsMe'        THEN outcome IN ('completed','reopened')
        WHEN 'system'         THEN outcome IN ('completed','skipped','missed')
        WHEN 'meal'           THEN outcome IN ('completed','skipped')
        WHEN 'goal'           THEN outcome IN ('completed','cancelled')
        WHEN 'responsibility' THEN outcome IN ('delegated','acknowledged','accepted','declined','completed','returned','reassigned','unacknowledged')
        WHEN 'oneMove'        THEN outcome IN ('selected','completed','withheld','cleared')
        WHEN 'interpretation' THEN outcome IN ('accepted','declined')
        ELSE false END);
ALTER TABLE public.behavior_observations ADD CONSTRAINT behavior_observations_to_date_check CHECK (to_date IS NULL OR outcome IN ('deferred','rescheduled'));
CREATE INDEX behavior_observations_owner_idx ON public.behavior_observations (household_id, profile_id);
CREATE INDEX behavior_observations_about_task_id_fk_idx ON public.behavior_observations (about_task_id, household_id) WHERE about_task_id IS NOT NULL;
CREATE INDEX behavior_observations_about_event_id_fk_idx ON public.behavior_observations (about_event_id, household_id) WHERE about_event_id IS NOT NULL;
CREATE INDEX behavior_observations_about_needs_me_id_fk_idx ON public.behavior_observations (about_needs_me_id, household_id) WHERE about_needs_me_id IS NOT NULL;
CREATE INDEX behavior_observations_about_system_id_fk_idx ON public.behavior_observations (about_system_id, household_id) WHERE about_system_id IS NOT NULL;
CREATE INDEX behavior_observations_about_meal_id_fk_idx ON public.behavior_observations (about_meal_id, household_id) WHERE about_meal_id IS NOT NULL;
CREATE INDEX behavior_observations_about_goal_id_fk_idx ON public.behavior_observations (about_goal_id, household_id) WHERE about_goal_id IS NOT NULL;
CREATE INDEX behavior_observations_about_responsibility_id_fk_idx ON public.behavior_observations (about_responsibility_id, household_id) WHERE about_responsibility_id IS NOT NULL;
CREATE INDEX behavior_observations_about_one_move_id_fk_idx ON public.behavior_observations (about_one_move_id, household_id) WHERE about_one_move_id IS NOT NULL;
CREATE INDEX behavior_observations_about_interpretation_id_fk_idx ON public.behavior_observations (about_interpretation_id, household_id) WHERE about_interpretation_id IS NOT NULL;
CREATE INDEX behavior_observations_source_artifact_id_fk_idx ON public.behavior_observations (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE INDEX behavior_observations_about_time_idx
  ON public.behavior_observations (household_id, profile_id, logical_date DESC);
CREATE TRIGGER behavior_observations_force_id BEFORE INSERT ON public.behavior_observations
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER behavior_observations_immutable BEFORE UPDATE OR DELETE ON public.behavior_observations
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER behavior_observations_log_change AFTER INSERT ON public.behavior_observations
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY behavior_observations_select_own ON public.behavior_observations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY behavior_observations_insert_own ON public.behavior_observations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- automation_authorities
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_revision_check CHECK (revision > 0);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_category_id_fkey FOREIGN KEY (category_id, household_id)
    REFERENCES public.household_categories(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_subject_member_type_pairing_check CHECK ((subject_member_id IS NULL) = (subject_member_type IS NULL));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_subject_member_type_child_check CHECK (subject_member_type IS NULL OR subject_member_type = 'child'::text);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_subject_member_id_fkey FOREIGN KEY (subject_member_id, household_id, subject_member_type)
    REFERENCES public.household_members(id, household_id, member_type) ON DELETE NO ACTION;
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_category_check CHECK (category = ANY (ARRAY['internal_reminder','task_change','schedule_change','delegation_request','outbound_message','external_calendar_write','external_appointment','financial_action']));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_mode_check CHECK (mode = ANY (ARRAY['suggest','prepare','ask_approval','execute_authorized']));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_consequence_check CHECK (max_consequence = ANY (ARRAY['low','moderate','high','critical']));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_provider_check CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_amount_pair_check CHECK ((max_amount_minor IS NULL) = (max_amount_currency IS NULL));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_amount_range_check CHECK (max_amount_minor IS NULL OR (max_amount_minor >= 0 AND max_amount_minor <= 9007199254740991));
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_currency_check CHECK (max_amount_currency IS NULL OR max_amount_currency ~ '^[A-Z]{3}$');
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_financial_limit_check CHECK (NOT (category = 'financial_action' AND mode = 'execute_authorized') OR max_amount_minor IS NOT NULL);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_expiry_check CHECK (expires_at IS NULL OR expires_at > granted_at);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_revoked_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at);
ALTER TABLE public.automation_authorities ADD CONSTRAINT automation_authorities_granted_by_user_check CHECK (producer = 'user-action');
CREATE INDEX automation_authorities_owner_idx ON public.automation_authorities (household_id, profile_id);
CREATE INDEX automation_authorities_category_id_fk_idx ON public.automation_authorities (category_id, household_id) WHERE category_id IS NOT NULL;
CREATE INDEX automation_authorities_subject_member_id_fk_idx ON public.automation_authorities (subject_member_id, household_id) WHERE subject_member_id IS NOT NULL;
CREATE INDEX automation_authorities_source_artifact_id_fk_idx ON public.automation_authorities (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER automation_authorities_force_id BEFORE INSERT OR UPDATE ON public.automation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER automation_authorities_set_updated_at BEFORE UPDATE ON public.automation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER automation_authorities_set_subject_member_type BEFORE INSERT OR UPDATE ON public.automation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.set_child_member_type('subject_member_id', 'subject_member_type');
CREATE TRIGGER automation_authorities_revoke_only BEFORE UPDATE ON public.automation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_column_transition('revoked_at');
CREATE TRIGGER automation_authorities_log_change AFTER INSERT OR UPDATE OR DELETE ON public.automation_authorities
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY automation_authorities_select_own ON public.automation_authorities
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY automation_authorities_insert_own ON public.automation_authorities
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY automation_authorities_update_own ON public.automation_authorities
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- action_intents
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_ref_check CHECK ((about_type IS NULL OR about_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility']))
    AND (COALESCE(about_type = 'task', false) = (about_task_id IS NOT NULL))
    AND (COALESCE(about_type = 'event', false) = (about_event_id IS NOT NULL))
    AND (COALESCE(about_type = 'needsMe', false) = (about_needs_me_id IS NOT NULL))
    AND (COALESCE(about_type = 'system', false) = (about_system_id IS NOT NULL))
    AND (COALESCE(about_type = 'meal', false) = (about_meal_id IS NOT NULL))
    AND (COALESCE(about_type = 'goal', false) = (about_goal_id IS NOT NULL))
    AND (COALESCE(about_type = 'responsibility', false) = (about_responsibility_id IS NOT NULL)));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_task_id_fkey FOREIGN KEY (about_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_event_id_fkey FOREIGN KEY (about_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_needs_me_id_fkey FOREIGN KEY (about_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_system_id_fkey FOREIGN KEY (about_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_meal_id_fkey FOREIGN KEY (about_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_goal_id_fkey FOREIGN KEY (about_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_about_responsibility_id_fkey FOREIGN KEY (about_responsibility_id, household_id, profile_id)
    REFERENCES public.responsibilities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_amount_money_check CHECK (((amount_amount_minor IS NULL) = (amount_currency IS NULL))
    AND ((amount_amount_minor IS NULL) = (amount_direction IS NULL))
    AND (amount_amount_minor IS NULL OR (amount_amount_minor >= 0 AND amount_amount_minor <= 9007199254740991))
    AND (amount_currency IS NULL OR amount_currency ~ '^[A-Z]{3}$')
    AND (amount_direction IS NULL OR amount_direction = ANY (ARRAY['outflow','inflow'])));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_category_check CHECK (category = ANY (ARRAY['internal_reminder','task_change','schedule_change','delegation_request','outbound_message','external_calendar_write','external_appointment','financial_action']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_consequence_check CHECK (consequence = ANY (ARRAY['low','moderate','high','critical']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_reversibility_check CHECK (reversibility = ANY (ARRAY['reversible','compensable','irreversible']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_mode_check CHECK (permitted_mode = ANY (ARRAY['suggest','prepare','ask_approval','execute_authorized']));
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_summary_check CHECK (summary_code ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_provider_check CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_financial_amount_check CHECK (category <> 'financial_action' OR amount_amount_minor IS NOT NULL);
ALTER TABLE public.action_intents ADD CONSTRAINT action_intents_proposed_by_her_keys_check CHECK (producer = ANY (ARRAY['ai-inference','automation','system-derived']));
CREATE INDEX action_intents_owner_idx ON public.action_intents (household_id, profile_id);
CREATE INDEX action_intents_about_task_id_fk_idx ON public.action_intents (about_task_id, household_id) WHERE about_task_id IS NOT NULL;
CREATE INDEX action_intents_about_event_id_fk_idx ON public.action_intents (about_event_id, household_id) WHERE about_event_id IS NOT NULL;
CREATE INDEX action_intents_about_needs_me_id_fk_idx ON public.action_intents (about_needs_me_id, household_id) WHERE about_needs_me_id IS NOT NULL;
CREATE INDEX action_intents_about_system_id_fk_idx ON public.action_intents (about_system_id, household_id) WHERE about_system_id IS NOT NULL;
CREATE INDEX action_intents_about_meal_id_fk_idx ON public.action_intents (about_meal_id, household_id) WHERE about_meal_id IS NOT NULL;
CREATE INDEX action_intents_about_goal_id_fk_idx ON public.action_intents (about_goal_id, household_id) WHERE about_goal_id IS NOT NULL;
CREATE INDEX action_intents_about_responsibility_id_fk_idx ON public.action_intents (about_responsibility_id, household_id) WHERE about_responsibility_id IS NOT NULL;
CREATE INDEX action_intents_source_artifact_id_fk_idx ON public.action_intents (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER action_intents_force_id BEFORE INSERT ON public.action_intents
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER action_intents_immutable BEFORE UPDATE OR DELETE ON public.action_intents
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER action_intents_log_change AFTER INSERT ON public.action_intents
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY action_intents_select_own ON public.action_intents
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY action_intents_insert_own ON public.action_intents
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- intent_decisions
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_intent_id_fkey FOREIGN KEY (intent_id, household_id, profile_id)
    REFERENCES public.action_intents(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_authority_id_fkey FOREIGN KEY (authority_id, household_id, profile_id)
    REFERENCES public.automation_authorities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_decision_check CHECK (decision = ANY (ARRAY['approved','declined','withdrawn']));
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_basis_check CHECK (basis = ANY (ARRAY['explicit','standing_authority']));
ALTER TABLE public.intent_decisions ADD CONSTRAINT intent_decisions_standing_check CHECK (CASE WHEN basis = 'standing_authority' THEN authority_id IS NOT NULL AND decision = 'approved' AND producer = 'automation' ELSE authority_id IS NULL AND producer = 'user-action' END);
CREATE INDEX intent_decisions_owner_idx ON public.intent_decisions (household_id, profile_id);
CREATE INDEX intent_decisions_intent_id_fk_idx ON public.intent_decisions (intent_id, household_id) WHERE intent_id IS NOT NULL;
CREATE INDEX intent_decisions_authority_id_fk_idx ON public.intent_decisions (authority_id, household_id) WHERE authority_id IS NOT NULL;
CREATE INDEX intent_decisions_source_artifact_id_fk_idx ON public.intent_decisions (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX intent_decisions_one_answer_uq
  ON public.intent_decisions (intent_id) WHERE decision IN ('approved','declined');
CREATE UNIQUE INDEX intent_decisions_one_withdrawal_uq
  ON public.intent_decisions (intent_id) WHERE decision = 'withdrawn';
CREATE TRIGGER intent_decisions_force_id BEFORE INSERT ON public.intent_decisions
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER intent_decisions_immutable BEFORE UPDATE OR DELETE ON public.intent_decisions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER intent_decisions_withdrawal_needs_approval BEFORE INSERT ON public.intent_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal();
CREATE TRIGGER intent_decisions_log_change AFTER INSERT ON public.intent_decisions
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY intent_decisions_select_own ON public.intent_decisions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY intent_decisions_insert_own ON public.intent_decisions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- action_executions
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_intent_id_fkey FOREIGN KEY (intent_id, household_id, profile_id)
    REFERENCES public.action_intents(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_decision_id_fkey FOREIGN KEY (decision_id, household_id, profile_id)
    REFERENCES public.intent_decisions(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_authority_id_fkey FOREIGN KEY (authority_id, household_id, profile_id)
    REFERENCES public.automation_authorities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_external_reference_id_fkey FOREIGN KEY (external_reference_id, household_id, profile_id)
    REFERENCES public.external_references(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_compensates_execution_id_fkey FOREIGN KEY (compensates_execution_id, household_id, profile_id)
    REFERENCES public.action_executions(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_attempt_check CHECK (attempt >= 1 AND attempt <= 1000);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_result_check CHECK (result = ANY (ARRAY['succeeded','failed','partial','unknown']));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_error_class_check CHECK (error_class = ANY (ARRAY['none','transient','permanent','unauthorized','rate_limited','validation']));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_reversibility_check CHECK (reversibility = ANY (ARRAY['reversible','compensable','irreversible']));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_provider_check CHECK (provider IS NULL OR provider ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_compensation_check CHECK (compensation_code IS NULL OR compensation_code ~ '^[a-z][a-z0-9_.-]{0,63}$');
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_undo_says_how_check CHECK (compensates_execution_id IS NULL OR compensation_code IS NOT NULL);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_authorization_named_check CHECK (decision_id IS NOT NULL OR authority_id IS NOT NULL);
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_result_error_check CHECK ((result = 'succeeded') = (error_class = 'none'));
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_automation_only_check CHECK (producer = 'automation');
ALTER TABLE public.action_executions ADD CONSTRAINT action_executions_intent_attempt_key UNIQUE (intent_id, attempt);
CREATE INDEX action_executions_owner_idx ON public.action_executions (household_id, profile_id);
CREATE INDEX action_executions_intent_id_fk_idx ON public.action_executions (intent_id, household_id) WHERE intent_id IS NOT NULL;
CREATE INDEX action_executions_decision_id_fk_idx ON public.action_executions (decision_id, household_id) WHERE decision_id IS NOT NULL;
CREATE INDEX action_executions_authority_id_fk_idx ON public.action_executions (authority_id, household_id) WHERE authority_id IS NOT NULL;
CREATE INDEX action_executions_external_reference_id_fk_idx ON public.action_executions (external_reference_id, household_id) WHERE external_reference_id IS NOT NULL;
CREATE INDEX action_executions_compensates_execution_id_fk_idx ON public.action_executions (compensates_execution_id, household_id) WHERE compensates_execution_id IS NOT NULL;
CREATE INDEX action_executions_source_artifact_id_fk_idx ON public.action_executions (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER action_executions_force_id BEFORE INSERT ON public.action_executions
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER action_executions_immutable BEFORE UPDATE OR DELETE ON public.action_executions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER action_executions_guard_authorization BEFORE INSERT ON public.action_executions
  FOR EACH ROW EXECUTE FUNCTION public.guard_execution_authorization();
CREATE TRIGGER action_executions_log_change AFTER INSERT ON public.action_executions
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY action_executions_select_own ON public.action_executions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- action_outcomes
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_execution_id_fkey FOREIGN KEY (execution_id, household_id, profile_id)
    REFERENCES public.action_executions(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.action_outcomes ADD CONSTRAINT action_outcomes_kind_check CHECK (kind = ANY (ARRAY['verified','verification_failed','delivered','acknowledged','accepted','declined','completed','paid','cancelled','followed','expired','no_effect']));
CREATE INDEX action_outcomes_owner_idx ON public.action_outcomes (household_id, profile_id);
CREATE INDEX action_outcomes_execution_id_fk_idx ON public.action_outcomes (execution_id, household_id) WHERE execution_id IS NOT NULL;
CREATE INDEX action_outcomes_source_artifact_id_fk_idx ON public.action_outcomes (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER action_outcomes_force_id BEFORE INSERT ON public.action_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER action_outcomes_immutable BEFORE UPDATE OR DELETE ON public.action_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER action_outcomes_log_change AFTER INSERT ON public.action_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY action_outcomes_select_own ON public.action_outcomes
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- household_people
ALTER TABLE public.household_people ADD CONSTRAINT household_people_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.household_people ADD CONSTRAINT household_people_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.household_people ADD CONSTRAINT household_people_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_revision_check CHECK (revision > 0);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.household_people ADD CONSTRAINT household_people_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.household_people ADD CONSTRAINT household_people_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.household_people ADD CONSTRAINT household_people_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.household_people ADD CONSTRAINT household_people_name_check CHECK (char_length(btrim(display_name)) >= 1 AND char_length(display_name) <= 80);
ALTER TABLE public.household_people ADD CONSTRAINT household_people_relationship_check CHECK (relationship = ANY (ARRAY['co-parent','partner','grandparent','caregiver','neighbor','contractor','friend','other']));
ALTER TABLE public.household_people ADD CONSTRAINT household_people_channel_check CHECK (channel = ANY (ARRAY['unspecified','sms','email','whatsapp','in-app']));
ALTER TABLE public.household_people ADD CONSTRAINT household_people_status_check CHECK (status = ANY (ARRAY['active','archived']));
CREATE INDEX household_people_owner_idx ON public.household_people (household_id, profile_id);
CREATE INDEX household_people_source_artifact_id_fk_idx ON public.household_people (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER household_people_force_id BEFORE INSERT OR UPDATE ON public.household_people
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER household_people_set_updated_at BEFORE UPDATE ON public.household_people
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER household_people_log_change AFTER INSERT OR UPDATE OR DELETE ON public.household_people
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY household_people_select_own ON public.household_people
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY household_people_insert_own ON public.household_people
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY household_people_update_own ON public.household_people
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- responsibilities
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_revision_check CHECK (revision > 0);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_ref_check CHECK ((about_type IS NULL OR about_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal']))
    AND (COALESCE(about_type = 'task', false) = (about_task_id IS NOT NULL))
    AND (COALESCE(about_type = 'event', false) = (about_event_id IS NOT NULL))
    AND (COALESCE(about_type = 'needsMe', false) = (about_needs_me_id IS NOT NULL))
    AND (COALESCE(about_type = 'system', false) = (about_system_id IS NOT NULL))
    AND (COALESCE(about_type = 'meal', false) = (about_meal_id IS NOT NULL))
    AND (COALESCE(about_type = 'goal', false) = (about_goal_id IS NOT NULL)));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_task_id_fkey FOREIGN KEY (about_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_event_id_fkey FOREIGN KEY (about_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_needs_me_id_fkey FOREIGN KEY (about_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_system_id_fkey FOREIGN KEY (about_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_meal_id_fkey FOREIGN KEY (about_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_about_goal_id_fkey FOREIGN KEY (about_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_responsible_person_id_fkey FOREIGN KEY (responsible_person_id, household_id, profile_id)
    REFERENCES public.household_people(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_responsible_child_type_pairing_check CHECK ((responsible_child_id IS NULL) = (responsible_child_type IS NULL));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_responsible_child_type_child_check CHECK (responsible_child_type IS NULL OR responsible_child_type = 'child'::text);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_responsible_child_id_fkey FOREIGN KEY (responsible_child_id, household_id, responsible_child_type)
    REFERENCES public.household_members(id, household_id, member_type) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_previous_responsibility_id_fkey FOREIGN KEY (previous_responsibility_id, household_id, profile_id)
    REFERENCES public.responsibilities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_kind_check CHECK (responsible_kind = ANY (ARRAY['self','person','child']));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_state_check CHECK (state = ANY (ARRAY['owned','requested','acknowledged','accepted','declined','completed','returned']));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_holder_check CHECK (CASE responsible_kind
        WHEN 'self'   THEN responsible_person_id IS NULL AND responsible_child_id IS NULL
        WHEN 'person' THEN responsible_person_id IS NOT NULL AND responsible_child_id IS NULL
        ELSE               responsible_person_id IS NULL AND responsible_child_id IS NOT NULL END);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_lifecycle_check CHECK (CASE state
        WHEN 'owned'        THEN true
        WHEN 'requested'    THEN requested_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'acknowledged' THEN requested_at IS NOT NULL AND acknowledged_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'accepted'     THEN requested_at IS NOT NULL AND responded_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'declined'     THEN requested_at IS NOT NULL AND responded_at IS NOT NULL
        WHEN 'completed'    THEN completed_at IS NOT NULL
        ELSE                     returned_at IS NOT NULL AND responsible_kind = 'self' END);
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_completed_only_check CHECK ((state = 'completed') = (completed_at IS NOT NULL));
ALTER TABLE public.responsibilities ADD CONSTRAINT responsibilities_returned_only_check CHECK ((state = 'returned') = (returned_at IS NOT NULL));
CREATE INDEX responsibilities_owner_idx ON public.responsibilities (household_id, profile_id);
CREATE INDEX responsibilities_about_task_id_fk_idx ON public.responsibilities (about_task_id, household_id) WHERE about_task_id IS NOT NULL;
CREATE INDEX responsibilities_about_event_id_fk_idx ON public.responsibilities (about_event_id, household_id) WHERE about_event_id IS NOT NULL;
CREATE INDEX responsibilities_about_needs_me_id_fk_idx ON public.responsibilities (about_needs_me_id, household_id) WHERE about_needs_me_id IS NOT NULL;
CREATE INDEX responsibilities_about_system_id_fk_idx ON public.responsibilities (about_system_id, household_id) WHERE about_system_id IS NOT NULL;
CREATE INDEX responsibilities_about_meal_id_fk_idx ON public.responsibilities (about_meal_id, household_id) WHERE about_meal_id IS NOT NULL;
CREATE INDEX responsibilities_about_goal_id_fk_idx ON public.responsibilities (about_goal_id, household_id) WHERE about_goal_id IS NOT NULL;
CREATE INDEX responsibilities_responsible_person_id_fk_idx ON public.responsibilities (responsible_person_id, household_id) WHERE responsible_person_id IS NOT NULL;
CREATE INDEX responsibilities_responsible_child_id_fk_idx ON public.responsibilities (responsible_child_id, household_id) WHERE responsible_child_id IS NOT NULL;
CREATE INDEX responsibilities_previous_responsibility_id_fk_idx ON public.responsibilities (previous_responsibility_id, household_id) WHERE previous_responsibility_id IS NOT NULL;
CREATE INDEX responsibilities_source_artifact_id_fk_idx ON public.responsibilities (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX responsibilities_one_live_owner_uq
  ON public.responsibilities (household_id, COALESCE(about_task_id, about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id)) WHERE state IN ('owned','requested','acknowledged','accepted');
CREATE TRIGGER responsibilities_force_id BEFORE INSERT OR UPDATE ON public.responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER responsibilities_set_updated_at BEFORE UPDATE ON public.responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER responsibilities_set_responsible_child_type BEFORE INSERT OR UPDATE ON public.responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.set_child_member_type('responsible_child_id', 'responsible_child_type');
CREATE TRIGGER responsibilities_log_change AFTER INSERT OR UPDATE OR DELETE ON public.responsibilities
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY responsibilities_select_own ON public.responsibilities
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY responsibilities_insert_own ON public.responsibilities
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY responsibilities_update_own ON public.responsibilities
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- dependencies
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_revision_check CHECK (revision > 0);
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_ref_check CHECK ((from_type IS NULL OR from_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal']))
    AND (COALESCE(from_type = 'task', false) = (from_task_id IS NOT NULL))
    AND (COALESCE(from_type = 'event', false) = (from_event_id IS NOT NULL))
    AND (COALESCE(from_type = 'needsMe', false) = (from_needs_me_id IS NOT NULL))
    AND (COALESCE(from_type = 'system', false) = (from_system_id IS NOT NULL))
    AND (COALESCE(from_type = 'meal', false) = (from_meal_id IS NOT NULL))
    AND (COALESCE(from_type = 'goal', false) = (from_goal_id IS NOT NULL)));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_task_id_fkey FOREIGN KEY (from_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_event_id_fkey FOREIGN KEY (from_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_needs_me_id_fkey FOREIGN KEY (from_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_system_id_fkey FOREIGN KEY (from_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_meal_id_fkey FOREIGN KEY (from_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_from_goal_id_fkey FOREIGN KEY (from_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_ref_check CHECK ((to_type IS NULL OR to_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal']))
    AND (COALESCE(to_type = 'task', false) = (to_task_id IS NOT NULL))
    AND (COALESCE(to_type = 'event', false) = (to_event_id IS NOT NULL))
    AND (COALESCE(to_type = 'needsMe', false) = (to_needs_me_id IS NOT NULL))
    AND (COALESCE(to_type = 'system', false) = (to_system_id IS NOT NULL))
    AND (COALESCE(to_type = 'meal', false) = (to_meal_id IS NOT NULL))
    AND (COALESCE(to_type = 'goal', false) = (to_goal_id IS NOT NULL)));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_task_id_fkey FOREIGN KEY (to_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_event_id_fkey FOREIGN KEY (to_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_needs_me_id_fkey FOREIGN KEY (to_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_system_id_fkey FOREIGN KEY (to_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_meal_id_fkey FOREIGN KEY (to_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_to_goal_id_fkey FOREIGN KEY (to_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_relation_check CHECK (relation = ANY (ARRAY['requires','part_of','alternative_to']));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_status_check CHECK (status = ANY (ARRAY['active','removed']));
ALTER TABLE public.dependencies ADD CONSTRAINT dependencies_not_self_check CHECK (NOT (from_type = to_type AND COALESCE(from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, from_goal_id) = COALESCE(to_task_id, to_event_id, to_needs_me_id, to_system_id, to_meal_id, to_goal_id)));
CREATE INDEX dependencies_owner_idx ON public.dependencies (household_id, profile_id);
CREATE INDEX dependencies_from_task_id_fk_idx ON public.dependencies (from_task_id, household_id) WHERE from_task_id IS NOT NULL;
CREATE INDEX dependencies_from_event_id_fk_idx ON public.dependencies (from_event_id, household_id) WHERE from_event_id IS NOT NULL;
CREATE INDEX dependencies_from_needs_me_id_fk_idx ON public.dependencies (from_needs_me_id, household_id) WHERE from_needs_me_id IS NOT NULL;
CREATE INDEX dependencies_from_system_id_fk_idx ON public.dependencies (from_system_id, household_id) WHERE from_system_id IS NOT NULL;
CREATE INDEX dependencies_from_meal_id_fk_idx ON public.dependencies (from_meal_id, household_id) WHERE from_meal_id IS NOT NULL;
CREATE INDEX dependencies_from_goal_id_fk_idx ON public.dependencies (from_goal_id, household_id) WHERE from_goal_id IS NOT NULL;
CREATE INDEX dependencies_to_task_id_fk_idx ON public.dependencies (to_task_id, household_id) WHERE to_task_id IS NOT NULL;
CREATE INDEX dependencies_to_event_id_fk_idx ON public.dependencies (to_event_id, household_id) WHERE to_event_id IS NOT NULL;
CREATE INDEX dependencies_to_needs_me_id_fk_idx ON public.dependencies (to_needs_me_id, household_id) WHERE to_needs_me_id IS NOT NULL;
CREATE INDEX dependencies_to_system_id_fk_idx ON public.dependencies (to_system_id, household_id) WHERE to_system_id IS NOT NULL;
CREATE INDEX dependencies_to_meal_id_fk_idx ON public.dependencies (to_meal_id, household_id) WHERE to_meal_id IS NOT NULL;
CREATE INDEX dependencies_to_goal_id_fk_idx ON public.dependencies (to_goal_id, household_id) WHERE to_goal_id IS NOT NULL;
CREATE INDEX dependencies_source_artifact_id_fk_idx ON public.dependencies (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX dependencies_live_edge_uq
  ON public.dependencies (household_id, relation, from_type, COALESCE(from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, from_goal_id), to_type, COALESCE(to_task_id, to_event_id, to_needs_me_id, to_system_id, to_meal_id, to_goal_id)) WHERE status = 'active';
CREATE TRIGGER dependencies_force_id BEFORE INSERT OR UPDATE ON public.dependencies
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER dependencies_set_updated_at BEFORE UPDATE ON public.dependencies
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER dependencies_forbid_cycle BEFORE INSERT OR UPDATE ON public.dependencies
  FOR EACH ROW EXECUTE FUNCTION public.forbid_dependency_cycle();
CREATE TRIGGER dependencies_log_change AFTER INSERT OR UPDATE OR DELETE ON public.dependencies
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY dependencies_select_own ON public.dependencies
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY dependencies_insert_own ON public.dependencies
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY dependencies_update_own ON public.dependencies
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- recurrence_rules
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_revision_check CHECK (revision > 0);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_about_ref_check CHECK ((about_type IS NULL OR about_type = ANY (ARRAY['task', 'event', 'system', 'meal']))
    AND (COALESCE(about_type = 'task', false) = (about_task_id IS NOT NULL))
    AND (COALESCE(about_type = 'event', false) = (about_event_id IS NOT NULL))
    AND (COALESCE(about_type = 'system', false) = (about_system_id IS NOT NULL))
    AND (COALESCE(about_type = 'meal', false) = (about_meal_id IS NOT NULL)));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_about_task_id_fkey FOREIGN KEY (about_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_about_event_id_fkey FOREIGN KEY (about_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_about_system_id_fkey FOREIGN KEY (about_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_about_meal_id_fkey FOREIGN KEY (about_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_trigger_check CHECK (trigger_kind = ANY (ARRAY['schedule','after_completion','manual']));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_frequency_check CHECK (frequency IS NULL OR frequency = ANY (ARRAY['daily','weekly','monthly','yearly']));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_manual_check CHECK ((trigger_kind = 'manual') = (frequency IS NULL));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_interval_check CHECK (interval_count >= 1 AND interval_count <= 366);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_weekday_check CHECK (by_weekday IS NULL OR (frequency = 'weekly' AND cardinality(by_weekday) <= 7 AND by_weekday <@ ARRAY[0,1,2,3,4,5,6]::smallint[]));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_month_day_check CHECK (by_month_day IS NULL OR (frequency = 'monthly' AND by_month_day >= 1 AND by_month_day <= 31));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_time_check CHECK (time_of_day_minutes IS NULL OR (time_of_day_minutes >= 0 AND time_of_day_minutes <= 1439));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_timezone_check CHECK (char_length(timezone) >= 1 AND char_length(timezone) <= 64);
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_end_check CHECK (NOT (ends_on IS NOT NULL AND occurrence_count IS NOT NULL) AND (ends_on IS NULL OR ends_on >= anchor_date));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_count_check CHECK (occurrence_count IS NULL OR (occurrence_count >= 1 AND occurrence_count <= 10000));
ALTER TABLE public.recurrence_rules ADD CONSTRAINT recurrence_rules_status_check CHECK (status = ANY (ARRAY['active','paused','ended']));
CREATE INDEX recurrence_rules_owner_idx ON public.recurrence_rules (household_id, profile_id);
CREATE INDEX recurrence_rules_about_task_id_fk_idx ON public.recurrence_rules (about_task_id, household_id) WHERE about_task_id IS NOT NULL;
CREATE INDEX recurrence_rules_about_event_id_fk_idx ON public.recurrence_rules (about_event_id, household_id) WHERE about_event_id IS NOT NULL;
CREATE INDEX recurrence_rules_about_system_id_fk_idx ON public.recurrence_rules (about_system_id, household_id) WHERE about_system_id IS NOT NULL;
CREATE INDEX recurrence_rules_about_meal_id_fk_idx ON public.recurrence_rules (about_meal_id, household_id) WHERE about_meal_id IS NOT NULL;
CREATE INDEX recurrence_rules_source_artifact_id_fk_idx ON public.recurrence_rules (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE UNIQUE INDEX recurrence_rules_one_active_rule_uq
  ON public.recurrence_rules (household_id, COALESCE(about_task_id, about_event_id, about_system_id, about_meal_id)) WHERE status = 'active';
CREATE TRIGGER recurrence_rules_force_id BEFORE INSERT OR UPDATE ON public.recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER recurrence_rules_set_updated_at BEFORE UPDATE ON public.recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER recurrence_rules_log_change AFTER INSERT OR UPDATE OR DELETE ON public.recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY recurrence_rules_select_own ON public.recurrence_rules
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY recurrence_rules_insert_own ON public.recurrence_rules
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY recurrence_rules_update_own ON public.recurrence_rules
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- goals
ALTER TABLE public.goals ADD CONSTRAINT goals_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.goals ADD CONSTRAINT goals_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.goals ADD CONSTRAINT goals_revision_check CHECK (revision > 0);
ALTER TABLE public.goals ADD CONSTRAINT goals_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.goals ADD CONSTRAINT goals_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.goals ADD CONSTRAINT goals_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.goals ADD CONSTRAINT goals_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.goals ADD CONSTRAINT goals_category_id_fkey FOREIGN KEY (category_id, household_id)
    REFERENCES public.household_categories(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.goals ADD CONSTRAINT goals_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check CHECK (status = ANY (ARRAY['active','achieved','paused','abandoned']));
ALTER TABLE public.goals ADD CONSTRAINT goals_catalog_goal_check CHECK (catalog_goal_id IS NULL OR catalog_goal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
CREATE INDEX goals_owner_idx ON public.goals (household_id, profile_id);
CREATE INDEX goals_category_id_fk_idx ON public.goals (category_id, household_id) WHERE category_id IS NOT NULL;
CREATE INDEX goals_source_artifact_id_fk_idx ON public.goals (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER goals_force_id BEFORE INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER goals_log_change AFTER INSERT OR UPDATE OR DELETE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY goals_select_own ON public.goals
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY goals_insert_own ON public.goals
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY goals_update_own ON public.goals
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- system_steps
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_revision_check CHECK (revision > 0);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_system_id_fkey FOREIGN KEY (system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_position_check CHECK (position >= 0 AND position <= 999);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_title_check CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200);
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_effort_check CHECK (effort_minutes IS NULL OR (effort_minutes >= 0 AND effort_minutes <= 1440));
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_system_position_key UNIQUE (system_id, position);
CREATE INDEX system_steps_owner_idx ON public.system_steps (household_id, profile_id);
CREATE INDEX system_steps_system_id_fk_idx ON public.system_steps (system_id, household_id) WHERE system_id IS NOT NULL;
CREATE INDEX system_steps_source_artifact_id_fk_idx ON public.system_steps (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER system_steps_force_id BEFORE INSERT OR UPDATE ON public.system_steps
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER system_steps_set_updated_at BEFORE UPDATE ON public.system_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER system_steps_log_change AFTER INSERT OR UPDATE OR DELETE ON public.system_steps
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY system_steps_select_own ON public.system_steps
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY system_steps_insert_own ON public.system_steps
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY system_steps_update_own ON public.system_steps
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- capacity_profiles
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_revision_check CHECK (revision > 0);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_start_check CHECK (day_start_minutes IS NULL OR (day_start_minutes >= 0 AND day_start_minutes <= 1439));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_end_check CHECK (day_end_minutes IS NULL OR (day_end_minutes >= 1 AND day_end_minutes <= 1440));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_buffer_check CHECK (transition_buffer_minutes IS NULL OR (transition_buffer_minutes >= 0 AND transition_buffer_minutes <= 240));
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_window_check CHECK (day_start_minutes IS NULL OR day_end_minutes IS NULL OR day_start_minutes < day_end_minutes);
ALTER TABLE public.capacity_profiles ADD CONSTRAINT capacity_profiles_owner_key UNIQUE (household_id, profile_id);
CREATE INDEX capacity_profiles_owner_idx ON public.capacity_profiles (household_id, profile_id);
CREATE INDEX capacity_profiles_source_artifact_id_fk_idx ON public.capacity_profiles (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER capacity_profiles_force_id BEFORE INSERT OR UPDATE ON public.capacity_profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER capacity_profiles_set_updated_at BEFORE UPDATE ON public.capacity_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER capacity_profiles_log_change AFTER INSERT OR UPDATE OR DELETE ON public.capacity_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY capacity_profiles_select_own ON public.capacity_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY capacity_profiles_insert_own ON public.capacity_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY capacity_profiles_update_own ON public.capacity_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- patterns
ALTER TABLE public.patterns ADD CONSTRAINT patterns_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_revision_check CHECK (revision > 0);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_ref_check CHECK ((about_type IS NULL OR about_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal']))
    AND (COALESCE(about_type = 'task', false) = (about_task_id IS NOT NULL))
    AND (COALESCE(about_type = 'event', false) = (about_event_id IS NOT NULL))
    AND (COALESCE(about_type = 'needsMe', false) = (about_needs_me_id IS NOT NULL))
    AND (COALESCE(about_type = 'system', false) = (about_system_id IS NOT NULL))
    AND (COALESCE(about_type = 'meal', false) = (about_meal_id IS NOT NULL))
    AND (COALESCE(about_type = 'goal', false) = (about_goal_id IS NOT NULL)));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_task_id_fkey FOREIGN KEY (about_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_event_id_fkey FOREIGN KEY (about_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_needs_me_id_fkey FOREIGN KEY (about_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_system_id_fkey FOREIGN KEY (about_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_meal_id_fkey FOREIGN KEY (about_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_about_goal_id_fkey FOREIGN KEY (about_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_category_id_fkey FOREIGN KEY (category_id, household_id)
    REFERENCES public.household_categories(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.patterns ADD CONSTRAINT patterns_kind_check CHECK (kind = ANY (ARRAY['routine','deferral','energy','preference','reliability','timing']));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_weekday_check CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_bucket_check CHECK (time_bucket IS NULL OR time_bucket = ANY (ARRAY['morning','afternoon','evening']));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_status_check CHECK (status = ANY (ARRAY['candidate','confirmed','rejected','retired']));
ALTER TABLE public.patterns ADD CONSTRAINT patterns_observed_order_check CHECK (last_observed_on >= first_observed_on);
ALTER TABLE public.patterns ADD CONSTRAINT patterns_inference_check CHECK (producer = 'ai-inference');
ALTER TABLE public.patterns ADD CONSTRAINT patterns_confirmed_check CHECK (status <> 'confirmed' OR confidence = 'established');
ALTER TABLE public.patterns ADD CONSTRAINT patterns_established_check CHECK (confidence <> 'established' OR status IN ('confirmed','retired'));
CREATE INDEX patterns_owner_idx ON public.patterns (household_id, profile_id);
CREATE INDEX patterns_about_task_id_fk_idx ON public.patterns (about_task_id, household_id) WHERE about_task_id IS NOT NULL;
CREATE INDEX patterns_about_event_id_fk_idx ON public.patterns (about_event_id, household_id) WHERE about_event_id IS NOT NULL;
CREATE INDEX patterns_about_needs_me_id_fk_idx ON public.patterns (about_needs_me_id, household_id) WHERE about_needs_me_id IS NOT NULL;
CREATE INDEX patterns_about_system_id_fk_idx ON public.patterns (about_system_id, household_id) WHERE about_system_id IS NOT NULL;
CREATE INDEX patterns_about_meal_id_fk_idx ON public.patterns (about_meal_id, household_id) WHERE about_meal_id IS NOT NULL;
CREATE INDEX patterns_about_goal_id_fk_idx ON public.patterns (about_goal_id, household_id) WHERE about_goal_id IS NOT NULL;
CREATE INDEX patterns_category_id_fk_idx ON public.patterns (category_id, household_id) WHERE category_id IS NOT NULL;
CREATE INDEX patterns_source_artifact_id_fk_idx ON public.patterns (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER patterns_force_id BEFORE INSERT OR UPDATE ON public.patterns
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER patterns_set_updated_at BEFORE UPDATE ON public.patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER patterns_log_change AFTER INSERT OR UPDATE OR DELETE ON public.patterns
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY patterns_select_own ON public.patterns
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY patterns_insert_own ON public.patterns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY patterns_update_own ON public.patterns
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
-- evidence_links
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_local_id_check CHECK (local_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'::text);
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_scope_check CHECK (scope = 'personal'::text);
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_for_ref_check CHECK ((for_type IS NULL OR for_type = ANY (ARRAY['pattern', 'oneMove', 'intent']))
    AND (COALESCE(for_type = 'pattern', false) = (for_pattern_id IS NOT NULL))
    AND (COALESCE(for_type = 'oneMove', false) = (for_one_move_id IS NOT NULL))
    AND (COALESCE(for_type = 'intent', false) = (for_intent_id IS NOT NULL)));
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_for_pattern_id_fkey FOREIGN KEY (for_pattern_id, household_id, profile_id)
    REFERENCES public.patterns(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_for_one_move_id_fkey FOREIGN KEY (for_one_move_id, household_id, profile_id)
    REFERENCES public.one_move_records(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_for_intent_id_fkey FOREIGN KEY (for_intent_id, household_id, profile_id)
    REFERENCES public.action_intents(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_ref_check CHECK ((support_type IS NULL OR support_type = ANY (ARRAY['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility', 'observation']))
    AND (COALESCE(support_type = 'task', false) = (support_task_id IS NOT NULL))
    AND (COALESCE(support_type = 'event', false) = (support_event_id IS NOT NULL))
    AND (COALESCE(support_type = 'needsMe', false) = (support_needs_me_id IS NOT NULL))
    AND (COALESCE(support_type = 'system', false) = (support_system_id IS NOT NULL))
    AND (COALESCE(support_type = 'meal', false) = (support_meal_id IS NOT NULL))
    AND (COALESCE(support_type = 'goal', false) = (support_goal_id IS NOT NULL))
    AND (COALESCE(support_type = 'responsibility', false) = (support_responsibility_id IS NOT NULL))
    AND (COALESCE(support_type = 'observation', false) = (support_observation_id IS NOT NULL)));
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_task_id_fkey FOREIGN KEY (support_task_id, household_id)
    REFERENCES public.tasks(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_event_id_fkey FOREIGN KEY (support_event_id, household_id)
    REFERENCES public.events(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_needs_me_id_fkey FOREIGN KEY (support_needs_me_id, household_id, profile_id)
    REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_system_id_fkey FOREIGN KEY (support_system_id, household_id)
    REFERENCES public.household_systems(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_meal_id_fkey FOREIGN KEY (support_meal_id, household_id)
    REFERENCES public.meal_plan_entries(id, household_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_goal_id_fkey FOREIGN KEY (support_goal_id, household_id, profile_id)
    REFERENCES public.goals(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_responsibility_id_fkey FOREIGN KEY (support_responsibility_id, household_id, profile_id)
    REFERENCES public.responsibilities(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_support_observation_id_fkey FOREIGN KEY (support_observation_id, household_id, profile_id)
    REFERENCES public.behavior_observations(id, household_id, profile_id) ON DELETE NO ACTION;
ALTER TABLE public.evidence_links ADD CONSTRAINT evidence_links_code_check CHECK (code ~ '^[a-z][a-z0-9_.-]{0,63}$');
CREATE INDEX evidence_links_owner_idx ON public.evidence_links (household_id, profile_id);
CREATE INDEX evidence_links_for_pattern_id_fk_idx ON public.evidence_links (for_pattern_id, household_id) WHERE for_pattern_id IS NOT NULL;
CREATE INDEX evidence_links_for_one_move_id_fk_idx ON public.evidence_links (for_one_move_id, household_id) WHERE for_one_move_id IS NOT NULL;
CREATE INDEX evidence_links_for_intent_id_fk_idx ON public.evidence_links (for_intent_id, household_id) WHERE for_intent_id IS NOT NULL;
CREATE INDEX evidence_links_support_task_id_fk_idx ON public.evidence_links (support_task_id, household_id) WHERE support_task_id IS NOT NULL;
CREATE INDEX evidence_links_support_event_id_fk_idx ON public.evidence_links (support_event_id, household_id) WHERE support_event_id IS NOT NULL;
CREATE INDEX evidence_links_support_needs_me_id_fk_idx ON public.evidence_links (support_needs_me_id, household_id) WHERE support_needs_me_id IS NOT NULL;
CREATE INDEX evidence_links_support_system_id_fk_idx ON public.evidence_links (support_system_id, household_id) WHERE support_system_id IS NOT NULL;
CREATE INDEX evidence_links_support_meal_id_fk_idx ON public.evidence_links (support_meal_id, household_id) WHERE support_meal_id IS NOT NULL;
CREATE INDEX evidence_links_support_goal_id_fk_idx ON public.evidence_links (support_goal_id, household_id) WHERE support_goal_id IS NOT NULL;
CREATE INDEX evidence_links_support_responsibility_id_fk_idx ON public.evidence_links (support_responsibility_id, household_id) WHERE support_responsibility_id IS NOT NULL;
CREATE INDEX evidence_links_support_observation_id_fk_idx ON public.evidence_links (support_observation_id, household_id) WHERE support_observation_id IS NOT NULL;
CREATE INDEX evidence_links_source_artifact_id_fk_idx ON public.evidence_links (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
CREATE TRIGGER evidence_links_force_id BEFORE INSERT ON public.evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.force_server_owned_id();
CREATE TRIGGER evidence_links_immutable BEFORE UPDATE OR DELETE ON public.evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER evidence_links_log_change AFTER INSERT ON public.evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change('household_id', 'profile_id');
CREATE POLICY evidence_links_select_own ON public.evidence_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));
CREATE POLICY evidence_links_insert_own ON public.evidence_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id));

-- Phase 5 — constraints on the nine existing tables' new columns.
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.household_categories ADD CONSTRAINT household_categories_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id)
    REFERENCES public.source_artifacts(id, household_id) ON DELETE NO ACTION;
CREATE INDEX household_categories_source_artifact_fk_idx ON public.household_categories (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.events ADD CONSTRAINT events_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.events ADD CONSTRAINT events_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.events ADD CONSTRAINT events_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.events ADD CONSTRAINT events_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id)
    REFERENCES public.source_artifacts(id, household_id) ON DELETE NO ACTION;
CREATE INDEX events_source_artifact_fk_idx ON public.events (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.events ADD CONSTRAINT events_energy_demand_check CHECK (energy_demand IS NULL OR energy_demand = ANY (ARRAY['low','moderate','high']));
ALTER TABLE public.events ADD CONSTRAINT events_consequence_check CHECK (consequence IS NULL OR consequence = ANY (ARRAY['low','moderate','high','critical']));
ALTER TABLE public.events ADD CONSTRAINT events_value_money_check CHECK (((value_amount_minor IS NULL) = (value_currency IS NULL))
    AND ((value_amount_minor IS NULL) = (value_direction IS NULL))
    AND (value_amount_minor IS NULL OR (value_amount_minor >= 0 AND value_amount_minor <= 9007199254740991))
    AND (value_currency IS NULL OR value_currency ~ '^[A-Z]{3}$')
    AND (value_direction IS NULL OR value_direction = ANY (ARRAY['outflow','inflow'])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id)
    REFERENCES public.source_artifacts(id, household_id) ON DELETE NO ACTION;
CREATE INDEX tasks_source_artifact_fk_idx ON public.tasks (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_min_chunk_minutes_check CHECK (min_chunk_minutes IS NULL OR (min_chunk_minutes >= 5 AND min_chunk_minutes <= 1440));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_preferred_time_of_day_check CHECK (preferred_time_of_day IS NULL OR preferred_time_of_day = ANY (ARRAY['morning','afternoon','evening']));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_energy_demand_check CHECK (energy_demand IS NULL OR energy_demand = ANY (ARRAY['low','moderate','high']));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_consequence_check CHECK (consequence IS NULL OR consequence = ANY (ARRAY['low','moderate','high','critical']));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_travel_minutes_before_check CHECK (travel_minutes_before IS NULL OR (travel_minutes_before >= 0 AND travel_minutes_before <= 240));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_travel_minutes_after_check CHECK (travel_minutes_after IS NULL OR (travel_minutes_after >= 0 AND travel_minutes_after <= 240));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_preparation_minutes_check CHECK (preparation_minutes IS NULL OR (preparation_minutes >= 0 AND preparation_minutes <= 240));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_value_money_check CHECK (((value_amount_minor IS NULL) = (value_currency IS NULL))
    AND ((value_amount_minor IS NULL) = (value_direction IS NULL))
    AND (value_amount_minor IS NULL OR (value_amount_minor >= 0 AND value_amount_minor <= 9007199254740991))
    AND (value_currency IS NULL OR value_currency ~ '^[A-Z]{3}$')
    AND (value_direction IS NULL OR value_direction = ANY (ARRAY['outflow','inflow'])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_window_check CHECK (earliest_start_at IS NULL OR latest_finish_at IS NULL OR earliest_start_at <= latest_finish_at);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_chunk_split_check CHECK (min_chunk_minutes IS NULL OR splittable IS TRUE);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_chunk_length_check CHECK (min_chunk_minutes IS NULL OR min_chunk_minutes <= duration_minutes);
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id)
    REFERENCES public.source_artifacts(id, household_id) ON DELETE NO ACTION;
CREATE INDEX household_systems_source_artifact_fk_idx ON public.household_systems (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_automation_mode_check CHECK (automation_mode = ANY (ARRAY['manual','suggest','prepare','ask_approval','execute_authorized']));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_effort_minutes_check CHECK (effort_minutes IS NULL OR (effort_minutes >= 0 AND effort_minutes <= 1440));
ALTER TABLE public.household_systems ADD CONSTRAINT household_systems_energy_demand_check CHECK (energy_demand IS NULL OR energy_demand = ANY (ARRAY['low','moderate','high']));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id)
    REFERENCES public.source_artifacts(id, household_id) ON DELETE NO ACTION;
CREATE INDEX meal_plan_entries_source_artifact_fk_idx ON public.meal_plan_entries (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_prep_minutes_check CHECK (prep_minutes IS NULL OR (prep_minutes >= 0 AND prep_minutes <= 240));
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_energy_demand_check CHECK (energy_demand IS NULL OR energy_demand = ANY (ARRAY['low','moderate','high']));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.needs_me_items ADD CONSTRAINT needs_me_items_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
CREATE INDEX needs_me_items_source_artifact_fk_idx ON public.needs_me_items (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
CREATE INDEX one_move_records_source_artifact_fk_idx ON public.one_move_records (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.discovery_records ADD CONSTRAINT discovery_records_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
CREATE INDEX discovery_records_source_artifact_fk_idx ON public.discovery_records (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_producer_values_check CHECK (producer = ANY (ARRAY['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown']));
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_confidence_check CHECK (((confidence IS NOT NULL) = (producer = ANY (ARRAY['ai-inference','import-sync'])))
    AND (confidence IS NULL OR confidence = ANY (ARRAY['possible','likely','established'])));
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_source_artifact_check CHECK (source_artifact_id IS NULL OR producer <> ALL (ARRAY['legacy-unknown','onboarding']));
ALTER TABLE public.onboarding_state ADD CONSTRAINT onboarding_state_source_artifact_fkey FOREIGN KEY (source_artifact_id, household_id, profile_id)
    REFERENCES public.source_artifacts(id, household_id, profile_id) ON DELETE NO ACTION;
CREATE INDEX onboarding_state_source_artifact_fk_idx ON public.onboarding_state (source_artifact_id, household_id) WHERE source_artifact_id IS NOT NULL;
-- <<< GENERATED foundation-tables

-- ============================================================================
-- 8C. REFERENCES THAT CANNOT BE GENERATED
--
-- One Move's five typed targets. They live here rather than beside the table because the
-- composite keys they reference are created by the generated block above, and they are
-- COMPOSITE (target, household[, owner]) so that a One Move can never point at another
-- household's row. The two that existed before -- task and Needs Me -- were plain
-- single-column keys, which let a row name a uuid from anywhere; that is closed here.
-- ============================================================================

ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_task_id_fkey
  FOREIGN KEY (target_task_id, household_id) REFERENCES public.tasks(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_needs_me_id_fkey
  FOREIGN KEY (target_needs_me_id, household_id, profile_id)
  REFERENCES public.needs_me_items(id, household_id, profile_id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_event_id_fkey
  FOREIGN KEY (target_event_id, household_id) REFERENCES public.events(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_system_id_fkey
  FOREIGN KEY (target_system_id, household_id) REFERENCES public.household_systems(id, household_id) ON DELETE CASCADE;
ALTER TABLE public.one_move_records ADD CONSTRAINT one_move_records_target_responsibility_id_fkey
  FOREIGN KEY (target_responsibility_id, household_id, profile_id)
  REFERENCES public.responsibilities(id, household_id, profile_id) ON DELETE CASCADE;

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
              preparation_minutes, scope, origin_created_at, origin_updated_at)
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
              target_type, target_task_id, target_needs_me_id, target_event_id,
              target_system_id, target_responsibility_id,
              status, decided_at, completed_at, cleared_at, scope)
  ON public.one_move_records TO authenticated;
GRANT UPDATE (target_type, target_task_id, target_needs_me_id, target_event_id,
              target_system_id, target_responsibility_id,
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

-- B4-FOUNDATION-BUILDOUT-01 — GENERATED from the same manifest as the tables they grant on.
-- >>> GENERATED foundation-grants — supabase/tools/gen-foundation-sql.mjs from src/domain/sync/foundationSpecs.ts.
-- >>> Do not edit by hand: edit the manifest and regenerate. A test fails on any difference.
-- Foundation tables. Server-written kinds have SELECT only: the client pulls what the server records.
GRANT SELECT ON public.source_artifacts TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, kind, origin, provider, 
              received_at, content_digest, content_ref, retracted_at, scope, origin_created_at)
  ON public.source_artifacts TO authenticated;
GRANT UPDATE (retracted_at)
  ON public.source_artifacts TO authenticated;
GRANT SELECT ON public.interpretations TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, artifact_id, proposed_kind, 
              title, due_date, starts_at, ends_at, duration_minutes, value_amount_minor, 
              value_currency, value_direction, subject_member_id, category_hint, state, 
              clarification, accepted_type, accepted_task_id, accepted_event_id, 
              accepted_needs_me_id, supersedes_id, interpretation_version, decided_at, producer, 
              source_artifact_id, confidence, scope, origin_created_at)
  ON public.interpretations TO authenticated;
GRANT UPDATE (title, due_date, starts_at, ends_at, duration_minutes, value_amount_minor, 
              value_currency, value_direction, subject_member_id, category_hint, state, 
              clarification, accepted_type, accepted_task_id, accepted_event_id, 
              accepted_needs_me_id, decided_at, confidence)
  ON public.interpretations TO authenticated;
GRANT SELECT ON public.external_references TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, provider, external_account, 
              external_object_id, external_version, origin, direction, authority, last_observed_at, 
              last_observed_digest, linked_type, linked_task_id, linked_event_id, linked_needs_me_id, 
              linked_system_id, linked_meal_id, linked_goal_id, written_at, status, producer, 
              source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.external_references TO authenticated;
GRANT UPDATE (external_version, last_observed_at, last_observed_digest, linked_type, linked_task_id, 
              linked_event_id, linked_needs_me_id, linked_system_id, linked_meal_id, linked_goal_id, 
              status, confidence, origin_updated_at)
  ON public.external_references TO authenticated;
GRANT SELECT ON public.behavior_observations TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, about_type, about_task_id, 
              about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id, 
              about_responsibility_id, about_one_move_id, about_interpretation_id, outcome, 
              occurred_at, logical_date, planned_date, to_date, producer, source_artifact_id, 
              confidence, scope, origin_created_at)
  ON public.behavior_observations TO authenticated;
GRANT SELECT ON public.automation_authorities TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, category, mode, max_consequence, 
              persistent, category_id, subject_member_id, provider, max_amount_minor, 
              max_amount_currency, granted_at, expires_at, revoked_at, producer, source_artifact_id, 
              confidence, scope, origin_created_at, origin_updated_at)
  ON public.automation_authorities TO authenticated;
GRANT UPDATE (revoked_at, origin_updated_at)
  ON public.automation_authorities TO authenticated;
GRANT SELECT ON public.action_intents TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, category, about_type, 
              about_task_id, about_event_id, about_needs_me_id, about_system_id, about_meal_id, 
              about_goal_id, about_responsibility_id, consequence, reversibility, summary_code, 
              amount_amount_minor, amount_currency, amount_direction, provider, permitted_mode, 
              expires_at, producer, source_artifact_id, confidence, scope, origin_created_at)
  ON public.action_intents TO authenticated;
GRANT SELECT ON public.intent_decisions TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, intent_id, decision, basis, 
              authority_id, decided_at, producer, source_artifact_id, confidence, scope, 
              origin_created_at)
  ON public.intent_decisions TO authenticated;
GRANT SELECT ON public.action_executions TO authenticated;
GRANT SELECT ON public.action_outcomes TO authenticated;
GRANT SELECT ON public.household_people TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, display_name, relationship, 
              channel, status, producer, source_artifact_id, confidence, scope, origin_created_at, 
              origin_updated_at)
  ON public.household_people TO authenticated;
GRANT UPDATE (display_name, relationship, channel, status, confidence, origin_updated_at)
  ON public.household_people TO authenticated;
GRANT SELECT ON public.responsibilities TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, about_type, about_task_id, 
              about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id, 
              responsible_kind, responsible_person_id, responsible_child_id, state, requested_at, 
              acknowledged_at, responded_at, completed_at, returned_at, ack_due_at, still_needs_me, 
              previous_responsibility_id, producer, source_artifact_id, confidence, scope, 
              origin_created_at, origin_updated_at)
  ON public.responsibilities TO authenticated;
GRANT UPDATE (responsible_kind, responsible_person_id, responsible_child_id, state, requested_at, 
              acknowledged_at, responded_at, completed_at, returned_at, ack_due_at, still_needs_me, 
              confidence, origin_updated_at)
  ON public.responsibilities TO authenticated;
GRANT SELECT ON public.dependencies TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, relation, from_type, 
              from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, 
              from_goal_id, to_type, to_task_id, to_event_id, to_needs_me_id, to_system_id, 
              to_meal_id, to_goal_id, status, producer, source_artifact_id, confidence, scope, 
              origin_created_at, origin_updated_at)
  ON public.dependencies TO authenticated;
GRANT UPDATE (status, confidence, origin_updated_at)
  ON public.dependencies TO authenticated;
GRANT SELECT ON public.recurrence_rules TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, about_type, about_task_id, 
              about_event_id, about_system_id, about_meal_id, trigger_kind, frequency, 
              interval_count, by_weekday, by_month_day, anchor_date, time_of_day_minutes, timezone, 
              ends_on, occurrence_count, status, producer, source_artifact_id, confidence, scope, 
              origin_created_at, origin_updated_at)
  ON public.recurrence_rules TO authenticated;
GRANT UPDATE (trigger_kind, frequency, interval_count, by_weekday, by_month_day, anchor_date, 
              time_of_day_minutes, timezone, ends_on, occurrence_count, status, confidence, 
              origin_updated_at)
  ON public.recurrence_rules TO authenticated;
GRANT SELECT ON public.goals TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, title, status, target_date, 
              category_id, catalog_goal_id, producer, source_artifact_id, confidence, scope, 
              origin_created_at, origin_updated_at)
  ON public.goals TO authenticated;
GRANT UPDATE (title, status, target_date, category_id, catalog_goal_id, confidence, 
              origin_updated_at)
  ON public.goals TO authenticated;
GRANT SELECT ON public.system_steps TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, system_id, position, title, 
              effort_minutes, producer, source_artifact_id, confidence, scope, origin_created_at, 
              origin_updated_at)
  ON public.system_steps TO authenticated;
GRANT UPDATE (position, title, effort_minutes, confidence, origin_updated_at)
  ON public.system_steps TO authenticated;
GRANT SELECT ON public.capacity_profiles TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, day_start_minutes, 
              day_end_minutes, transition_buffer_minutes, producer, source_artifact_id, confidence, 
              scope, origin_created_at, origin_updated_at)
  ON public.capacity_profiles TO authenticated;
GRANT UPDATE (day_start_minutes, day_end_minutes, transition_buffer_minutes, confidence, 
              origin_updated_at)
  ON public.capacity_profiles TO authenticated;
GRANT SELECT ON public.patterns TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, kind, about_type, about_task_id, 
              about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id, 
              category_id, weekday, time_bucket, status, first_observed_on, last_observed_on, 
              producer, source_artifact_id, confidence, scope, origin_created_at, origin_updated_at)
  ON public.patterns TO authenticated;
GRANT UPDATE (weekday, time_bucket, status, last_observed_on, confidence, origin_updated_at)
  ON public.patterns TO authenticated;
GRANT SELECT ON public.evidence_links TO authenticated;
GRANT INSERT (household_id, local_id, origin_device_id, profile_id, for_type, for_pattern_id, 
              for_one_move_id, for_intent_id, support_type, support_task_id, support_event_id, 
              support_needs_me_id, support_system_id, support_meal_id, support_goal_id, 
              support_responsibility_id, support_observation_id, code, producer, source_artifact_id, 
              confidence, scope, origin_created_at)
  ON public.evidence_links TO authenticated;

-- Provenance and facets on the tables that already existed. A client states where a row came from when it creates it,
-- and may afterwards move only its confidence. `producer` and `source_artifact_id` are fixed at insert.
GRANT INSERT (producer, source_artifact_id, confidence)
  ON public.household_categories TO authenticated;
GRANT UPDATE (confidence)
  ON public.household_categories TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence, energy_demand, consequence, needs_me_personally, value_amount_minor, value_currency, value_direction)
  ON public.events TO authenticated;
GRANT UPDATE (confidence, energy_demand, consequence, needs_me_personally, value_amount_minor, value_currency, value_direction)
  ON public.events TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence, due_at, earliest_start_at, latest_finish_at, splittable, min_chunk_minutes, preferred_time_of_day, energy_demand, consequence, needs_me_personally, travel_minutes_before, travel_minutes_after, preparation_minutes, value_amount_minor, value_currency, value_direction)
  ON public.tasks TO authenticated;
GRANT UPDATE (confidence, due_at, earliest_start_at, latest_finish_at, splittable, min_chunk_minutes, preferred_time_of_day, energy_demand, consequence, needs_me_personally, travel_minutes_before, travel_minutes_after, preparation_minutes, value_amount_minor, value_currency, value_direction)
  ON public.tasks TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence, automation_mode, effort_minutes, energy_demand)
  ON public.household_systems TO authenticated;
GRANT UPDATE (confidence, automation_mode, effort_minutes, energy_demand)
  ON public.household_systems TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence, prep_minutes, energy_demand)
  ON public.meal_plan_entries TO authenticated;
GRANT UPDATE (confidence, prep_minutes, energy_demand)
  ON public.meal_plan_entries TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence)
  ON public.needs_me_items TO authenticated;
GRANT UPDATE (confidence)
  ON public.needs_me_items TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence)
  ON public.one_move_records TO authenticated;
GRANT UPDATE (confidence)
  ON public.one_move_records TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence)
  ON public.discovery_records TO authenticated;
GRANT UPDATE (confidence)
  ON public.discovery_records TO authenticated;
GRANT INSERT (producer, source_artifact_id, confidence)
  ON public.onboarding_state TO authenticated;
GRANT UPDATE (confidence)
  ON public.onboarding_state TO authenticated;
-- <<< GENERATED foundation-grants

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
--   GRANT EXECUTE ON FUNCTION private.resolve_household_context(uuid) ... (Section 2)
--
-- These are re-asserted here, after the blanket revokes above, precisely so that the
-- ordering cannot strand them. A blanket REVOKE that runs later than a GRANT is the
-- classic way a hardening pass takes an application down.
GRANT USAGE   ON SCHEMA   private                                          TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_member(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_household_owner(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_scoped_row(uuid, text, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_household_context(uuid)           TO authenticated;

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
  -- The starter set is structure Her Keys lays down, not something she told it: producer
  -- 'system-derived', the same answer the local pristine state gives.
  INSERT INTO public.household_categories
    (household_id, local_id, owner_profile_id, name, system_role, status, sort_order, scope, producer)
  VALUES
    (p_household_id, 'cat-kids',          NULL,         'Kids',          'kids',          'active', 0, 'household',       'system-derived'),
    (p_household_id, 'cat-home',          NULL,         'Home',          'home',          'active', 1, 'household',       'system-derived'),
    (p_household_id, 'cat-money',         NULL,         'Money',         'money',         'active', 2, 'household',       'system-derived'),
    (p_household_id, 'cat-meals',         NULL,         'Meals',         'meals',         'active', 3, 'household',       'system-derived'),
    (p_household_id, 'cat-work',          p_profile_id, 'Work',          'work',          'active', 4, 'professional',    'system-derived'),
    (p_household_id, 'cat-wellbeing',     p_profile_id, 'Wellbeing',     'wellbeing',     'active', 5, 'personal',        'system-derived'),
    (p_household_id, 'cat-relationships', p_profile_id, 'Relationships', 'relationships', 'active', 6, 'personal',        'system-derived'),
    (p_household_id, 'cat-coparenting',   p_profile_id, 'Co-parenting',  'coparenting',   'active', 7, 'coparent-shared', 'system-derived');
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

  INSERT INTO public.onboarding_state (household_id, profile_id, producer)
  VALUES (v_household, v_uid, 'onboarding');

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
          UNION ALL
          SELECT local_id, id             FROM public.source_artifacts     WHERE household_id = p_household_id
        ) m
      ), '{}'::jsonb)
  );
$fn$;

REVOKE ALL ON FUNCTION private.claim_result(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- The cloud id of a source artifact a claimed row was derived from, or NULL when it names
-- none. An artifact the claim did not carry is a broken lineage pointer, and the claim is
-- refused rather than completed with a row whose provenance dangles.
CREATE FUNCTION private.claim_artifact_id(p_household_id uuid, p_profile_id uuid, p_local_id text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_local_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.id INTO v_id
  FROM public.source_artifacts a
  WHERE a.household_id = p_household_id AND a.profile_id = p_profile_id AND a.local_id = p_local_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'claim_local_household: source artifact % did not resolve', p_local_id
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'unresolved_source_artifact', 'artifact_local_id', p_local_id)::text;
  END IF;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.claim_artifact_id(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

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
  v_need_artifacts text[] := '{}'::text[];
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
  --
  -- Version 2 (B4-FOUNDATION-BUILDOUT-01): every claimed row states its PROVENANCE
  -- (producer, source artifact, confidence), a task carries its commitment facets and
  -- exact value, and the source artifacts the claimed rows were derived from travel with
  -- them. A version 1 payload names none of that, so it is REFUSED -- it cannot be
  -- completed without inventing where each row came from.
  IF (p_payload ->> 'claimPayloadVersion') IS DISTINCT FROM '2' THEN
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

  -- The PROVENANCE CLOSURE. Every carried row must say where it came from, and the
  -- artifacts they name join the closure. A rehearsal's provenance is refused outright,
  -- as the demo origin is: a claim never quietly launders a demo row into a real one.
  FOR v_obj IN
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'tasks', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_tasks)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'needsMeItems', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_items)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'categories', '[]'::jsonb)) e
     WHERE (e.value ->> 'localId') = ANY (v_need_cats)
    UNION ALL
    SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'oneMoves', '[]'::jsonb)) e
  LOOP
    IF COALESCE(v_obj ->> 'producer', '') = '' THEN
      RAISE EXCEPTION 'claim_local_household: row % states no provenance', v_obj ->> 'localId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_provenance', 'local_id', v_obj ->> 'localId')::text;
    END IF;
    IF (v_obj ->> 'producer') = 'demo-seed' THEN
      RAISE EXCEPTION 'claim_local_household: row % is demo data', v_obj ->> 'localId'
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'demo_provenance', 'local_id', v_obj ->> 'localId')::text;
    END IF;
    IF (v_obj ->> 'sourceArtifactLocalId') IS NOT NULL THEN
      v_need_artifacts := v_need_artifacts || (v_obj ->> 'sourceArtifactLocalId');
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

  SELECT COALESCE(array_agg(t ->> 'localId'), '{}'::text[]) INTO v_extra
  FROM jsonb_array_elements(COALESCE(p_payload -> 'sourceArtifacts', '[]'::jsonb)) t
  WHERE NOT ((t ->> 'localId') = ANY (v_need_artifacts));
  IF array_length(v_extra, 1) > 0 THEN
    RAISE EXCEPTION 'claim_local_household: payload carries % source artifact(s) no claimed row was derived from', array_length(v_extra, 1)
      USING errcode = '22023',
            detail = jsonb_build_object('reason', 'overbroad_payload', 'collection', 'sourceArtifacts',
                                        'unrequired_local_ids', to_jsonb(v_extra))::text;
  END IF;

  -- ==========================================================================
  -- 2B. SOURCE ARTIFACTS. Before anything that names one. An artifact linked to an
  --     external reference, or one a connector delivered, is REFUSED: nothing may
  --     enter the cloud through claim as though it had been observed elsewhere, and
  --     no connector exists to have produced one honestly.
  -- ==========================================================================
  FOREACH v_lid IN ARRAY v_need_artifacts
  LOOP
    PERFORM 1 FROM public.source_artifacts WHERE household_id = v_household AND profile_id = v_uid AND local_id = v_lid;
    IF FOUND THEN CONTINUE; END IF;

    SELECT t INTO v_obj FROM jsonb_array_elements(COALESCE(p_payload -> 'sourceArtifacts', '[]'::jsonb)) t
    WHERE t ->> 'localId' = v_lid;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'claim_local_household: source artifact % is named by a claimed row but was not supplied', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'missing_dependency', 'collection', 'sourceArtifacts',
                                          'local_id', v_lid)::text;
    END IF;
    IF (v_obj ->> 'externalReferenceLocalId') IS NOT NULL OR (v_obj ->> 'origin') = 'connector' THEN
      RAISE EXCEPTION 'claim_local_household: source artifact % came from an external system and cannot be claimed', v_lid
        USING errcode = '22023',
              detail = jsonb_build_object('reason', 'external_artifact_not_claimable', 'artifact_local_id', v_lid)::text;
    END IF;

    INSERT INTO public.source_artifacts
      (household_id, local_id, origin_device_id, profile_id, kind, origin, provider, received_at,
       content_digest, content_ref, retracted_at, scope, origin_created_at)
    VALUES (v_household, v_lid, p_device_id, v_uid, v_obj ->> 'kind', v_obj ->> 'origin', v_obj ->> 'provider',
            (v_obj ->> 'receivedAt')::timestamptz, v_obj ->> 'contentDigest', v_obj ->> 'contentRef',
            (v_obj ->> 'retractedAt')::timestamptz, 'personal', (v_obj ->> 'originCreatedAt')::timestamptz)
    ON CONFLICT (household_id, profile_id, local_id) DO NOTHING;
  END LOOP;

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
        (household_id, local_id, origin_device_id, owner_profile_id, name, system_role, status, sort_order, scope,
         producer, source_artifact_id, confidence)
      VALUES (v_household, v_lid, p_device_id,
              CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
              v_obj ->> 'name', NULLIF(v_obj ->> 'systemRole', ''), v_obj ->> 'status',
              (v_obj ->> 'sortOrder')::integer, v_scope,
              v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
              v_obj ->> 'confidence')
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
       planned_starts_at, notes, status, completed_at, scope, origin_created_at, origin_updated_at,
       producer, source_artifact_id, confidence,
       due_at, earliest_start_at, latest_finish_at, splittable, min_chunk_minutes, preferred_time_of_day,
       energy_demand, consequence, needs_me_personally, travel_minutes_before, travel_minutes_after,
       preparation_minutes, value_amount_minor, value_currency, value_direction)
    VALUES (v_household, v_lid, p_device_id,
            CASE WHEN v_scope IN ('personal', 'professional', 'coparent-shared') THEN v_uid ELSE NULL END,
            v_obj ->> 'title', v_cat_id, v_child_id,
            (v_obj ->> 'durationMinutes')::integer, v_obj ->> 'commitment',
            (v_obj ->> 'dueDate')::date, v_obj ->> 'planKind',
            (v_obj ->> 'plannedDate')::date, (v_obj ->> 'plannedStartsAt')::timestamptz,
            v_obj ->> 'notes', v_obj ->> 'status', (v_obj ->> 'completedAt')::timestamptz,
            v_scope, (v_obj ->> 'originCreatedAt')::timestamptz, (v_obj ->> 'originUpdatedAt')::timestamptz,
            v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
            v_obj ->> 'confidence',
            -- The commitment facets travel with the task. NULL means "not known", and stays NULL.
            (v_obj ->> 'dueAt')::timestamptz, (v_obj ->> 'earliestStartAt')::timestamptz,
            (v_obj ->> 'latestFinishAt')::timestamptz, (v_obj ->> 'splittable')::boolean,
            (v_obj ->> 'minChunkMinutes')::integer, v_obj ->> 'preferredTimeOfDay',
            v_obj ->> 'energyDemand', v_obj ->> 'consequence', (v_obj ->> 'needsMePersonally')::boolean,
            (v_obj ->> 'travelMinutesBefore')::integer, (v_obj ->> 'travelMinutesAfter')::integer,
            (v_obj ->> 'preparationMinutes')::integer,
            (v_obj -> 'value' ->> 'amountMinor')::bigint, v_obj -> 'value' ->> 'currency',
            v_obj -> 'value' ->> 'direction')
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
       category_id, scope, origin_created_at, producer, source_artifact_id, confidence)
    VALUES (v_household, v_lid, p_device_id, v_uid, v_obj ->> 'title', v_obj ->> 'status',
            (v_obj ->> 'dueDate')::date, v_cat_id, COALESCE(v_obj ->> 'scope', 'personal'),
            (v_obj ->> 'originCreatedAt')::timestamptz,
            v_obj ->> 'producer', private.claim_artifact_id(v_household, v_uid, v_obj ->> 'sourceArtifactLocalId'),
            v_obj ->> 'confidence')
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
       target_type, target_task_id, target_needs_me_id, status, decided_at, completed_at, cleared_at,
       producer, source_artifact_id, confidence)
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
      (v_move ->> 'clearedAt')::timestamptz,
      v_move ->> 'producer',
      private.claim_artifact_id(v_household, v_uid, v_move ->> 'sourceArtifactLocalId'),
      v_move ->> 'confidence');
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
           'source_artifacts', COALESCE(array_length(v_need_artifacts, 1), 0),
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
--
-- The household is EXPLICIT. A device says which household it is pulling for
-- (p_household_id) and private.resolve_household_context refuses one the caller does
-- not belong to. Omitting it is honoured only when the caller belongs to exactly one
-- household; with several it is refused as ambiguous rather than answered with
-- whichever the planner returned first.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.sync_pull(p_cursor xid8 DEFAULT '0'::xid8, p_household_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO ''
AS $fn$
DECLARE
  v_barrier xid8 := pg_snapshot_xmin(pg_current_snapshot());
  v_house   uuid := private.resolve_household_context(p_household_id);
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
   WHERE c.household_id = v_house
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
  --
  -- Foundation tables (B4-FOUNDATION-BUILDOUT-01) are owner-private, so they key on
  -- profile_id. Executions and outcomes are ABSENT: they are written by the trusted
  -- server boundary, never pushed, and a device asking to push one is refused here
  -- as well as by the missing grant and policy.
  v_owner_col := CASE
                   WHEN p_entity_table = 'action_records' THEN 'actor_profile_id'
                   WHEN p_entity_table = ANY (ARRAY[
                        'one_move_records', 'needs_me_items', 'discovery_records',
                        'source_artifacts', 'interpretations', 'external_references',
                        'behavior_observations', 'automation_authorities', 'action_intents',
                        'intent_decisions', 'household_people', 'responsibilities',
                        'dependencies', 'recurrence_rules', 'goals',
                        'system_steps', 'capacity_profiles', 'patterns',
                        'evidence_links'
                        ]) THEN 'profile_id'
                 END;
  v_owner_private := v_owner_col IS NOT NULL;
  IF NOT v_owner_private
     AND p_entity_table NOT IN ('tasks', 'events', 'household_categories',
                                'household_systems', 'meal_plan_entries') THEN
    RAISE EXCEPTION 'sync_push: % is not a pushable entity table', p_entity_table
      USING errcode = '22023';
  END IF;

  -- The action ledger and the other append-only evidence tables carry no revision
  -- column. Everything else does, and the caller needs it as the base for its next CAS.
  v_has_revision := p_entity_table <> ALL (ARRAY['action_records', 'behavior_observations', 'action_intents',
                                                  'intent_decisions', 'evidence_links']);

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
                    - 'subject_member_type' - 'responsible_child_type' - 'logical_day' - 'timezone_at_decision')
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
REVOKE ALL ON FUNCTION public.sync_pull(xid8, uuid)                                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_account(uuid, text, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_local_household(uuid, text, jsonb, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull(xid8, uuid)                             TO authenticated;

-- ============================================================================
-- 11. FAIL-CLOSED ASSERTION — run last, so a mistake above cannot complete.
-- ============================================================================

SELECT private.assert_app_schema_secured();

COMMIT;
