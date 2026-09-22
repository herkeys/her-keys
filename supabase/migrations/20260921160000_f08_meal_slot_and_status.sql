-- HER KEYS — HK-FEATURE-08-MEALS (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260921120000_ir01_duration_source_and_claim_v3.sql. Neither that migration nor the shipped ones are edited.
--
--   public.meal_plan_entries gains the two product fields the Meals contract authorizes on the EXISTING MealPlanEntry:
--
--     meal_slot  where in the day the meal is planned:
--                'unspecified' | 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'.
--                'unspecified' is the explicit "not stated" value, never a guess; nothing defaults to dinner.
--     status     'active' | 'archived'. Archived means REMOVED FROM ACTIVE PLANNING: it is not eaten, not skipped, not completed.
--                Removal is an ordinary UPDATE of this column, so it reaches every device through the existing change log.
--                There is still no DELETE grant and no DELETE policy on this table.
--
--   Both columns are NOT NULL with a DEFAULT. Every existing row is a live plan with no stated slot, which is exactly what the
--   defaults say, so nothing is rewritten, discarded or guessed, and raw INSERTs that omit the columns keep working.
--
--   No function is replaced: sync_push, sync_pull and log_row_change are generic, and the claim does not carry meals.
--   No policy, index or trigger changes. SELECT is table-level, so the new columns are readable by exactly the rows a member can
--   already read; INSERT and UPDATE are column-level, like every other client-writable column on this table.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): dropping the two columns undoes the schema; the slots and archive states
-- written meanwhile cannot be reconstructed, so rolling back discards that knowledge. No down-migration is shipped because nothing
-- here is applied to a populated environment without the owner.
--
-- RELEASE ORDER: this migration must reach an environment BEFORE a client that sends meal_slot and status does. Otherwise those
-- pushes fail with 42703 (undefined column) and stall as validation-failure evidence.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the migration hash is identical on every checkout.

BEGIN;

-- ============================================================================
-- meal_plan_entries.meal_slot and meal_plan_entries.status
-- ============================================================================

ALTER TABLE public.meal_plan_entries ADD COLUMN meal_slot text NOT NULL DEFAULT 'unspecified';
ALTER TABLE public.meal_plan_entries ADD COLUMN status text NOT NULL DEFAULT 'active';

ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_meal_slot_check
  CHECK (meal_slot = ANY (ARRAY['unspecified'::text, 'breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'other'::text]));

ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

-- Column-level, like every other client-writable column on this table: a client may state a slot when it creates the row and may
-- correct it, and may move the row between active and archived, exactly as it may correct the title or the date.
GRANT INSERT (meal_slot, status) ON public.meal_plan_entries TO authenticated;
GRANT UPDATE (meal_slot, status) ON public.meal_plan_entries TO authenticated;

SELECT private.assert_app_schema_secured();

COMMIT;
