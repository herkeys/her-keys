-- ============================================================================================================================
-- HK-F01-F13 INTEGRATION — per-owner uniqueness on the owner-private relationship tables (HK13-D24, P2 "relationship inference leak").
--
-- Provenance: F01-F13 integration audit, Phase 8 (the integrated privacy attack, supabase/tests/81-int13-privacy.sql). Written by
-- hand, not by the foundation generator: it re-issues four rules the Build 4 shipping migration created; the manifest
-- (src/domain/sync/foundationSpecs.ts) keeps each rule AS CREATED so the shipping migration's generated region never changes.
--
-- What was wrong. Four tables are OWNER-PRIVATE — a member reads and writes only her own rows — yet each carried a uniqueness rule that
-- spanned the whole household:
--   responsibilities_one_live_owner_uq    one live handoff per item, household-wide
--   dependencies_live_edge_uq             one live edge per (relation, from, to), household-wide
--   recurrence_rules_one_active_rule_uq   one active schedule per item, household-wide
--   system_steps_system_position_key      one step per (System, position)
-- Each can hang off a HOUSEHOLD-visible Task, Event, System or meal, whose id every member holds. So a second adult's ordinary action
-- — her own handoff, sequence, schedule or first step on a shared item — was refused EXACTLY WHEN another member privately held one
-- there: she learned that the private row exists, and could not record her own.
--
-- What changes. Each rule is dropped and re-created under the SAME name — the client's DOMAIN_INVARIANTS
-- (src/platform/supabaseSyncTransport.ts) and the pull's clash rules (src/domain/sync/clash.ts) key on the names — with the owner
-- (profile_id) after the household. Every other column, expression and predicate is unchanged, so the product rule still holds for
-- each owner (she cannot hold two live handoffs of one item, two identical live edges, two active schedules, two steps in one slot),
-- which is also every device's view: a device only ever holds its own owner's rows of these tables.
--
-- Data: none touched. A per-owner rule is strictly LOOSER than the household-wide one it replaces, so no existing row can violate it.
-- Rollback assumption: re-create the four household-wide definitions (the "was" lines below) — possible only while no two owners hold a
-- live row for one item; the integration's populated-upgrade proof (run.mjs ENV D) applies this to a populated database.
-- Release order: after 20260922200000_f13_people_os.sql (the last migration before it). LF line endings (.gitattributes).
-- ============================================================================================================================

BEGIN;

-- was: (household_id, COALESCE(about_*)) WHERE state IN ('owned','requested','acknowledged','accepted')
DROP INDEX public.responsibilities_one_live_owner_uq;
CREATE UNIQUE INDEX responsibilities_one_live_owner_uq
  ON public.responsibilities (household_id, profile_id, COALESCE(about_task_id, about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id)) WHERE state IN ('owned','requested','acknowledged','accepted');

-- was: (household_id, relation, from_type, COALESCE(from_*), to_type, COALESCE(to_*)) WHERE status = 'active' (as widened by F10)
DROP INDEX public.dependencies_live_edge_uq;
CREATE UNIQUE INDEX dependencies_live_edge_uq
  ON public.dependencies (household_id, profile_id, relation, from_type, COALESCE(from_task_id, from_event_id, from_needs_me_id, from_system_id, from_meal_id, from_goal_id, from_opportunity_id), to_type, COALESCE(to_task_id, to_event_id, to_needs_me_id, to_system_id, to_meal_id, to_goal_id, to_opportunity_id)) WHERE status = 'active';

-- was: (household_id, COALESCE(about_*)) WHERE status = 'active'
DROP INDEX public.recurrence_rules_one_active_rule_uq;
CREATE UNIQUE INDEX recurrence_rules_one_active_rule_uq
  ON public.recurrence_rules (household_id, profile_id, COALESCE(about_task_id, about_event_id, about_system_id, about_meal_id)) WHERE status = 'active';

-- was: UNIQUE (system_id, position)
ALTER TABLE public.system_steps DROP CONSTRAINT system_steps_system_position_key;
ALTER TABLE public.system_steps ADD CONSTRAINT system_steps_system_position_key UNIQUE (system_id, profile_id, position);

SELECT private.assert_app_schema_secured();

COMMIT;
