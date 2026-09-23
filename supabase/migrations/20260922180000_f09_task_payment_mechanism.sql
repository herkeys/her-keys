-- HER KEYS — HK-FEATURE-09-MONEY (additive; LOCAL VALIDATION ONLY, owner-gated for any real environment)
--
-- Follows 20260921190000_f05_add_child_after_binding.sql. No shipped migration is edited, including the
-- generated commitment-facet region of 20260919231500_build4_cloud_schema.sql: this column is deliberately
-- NOT added to EXISTING_FACETS in src/domain/sync/foundationSpecs.ts (see docs/builds/HK_FEATURE_09_MONEY.md,
-- F09-M2a) so gen-foundation-sql.mjs never asks for that already Staging-verified file to be regenerated.
-- Hand-listed exactly like task duration_source and meal slot/status before it.
--
--   public.tasks gains ONE product field the Money OS contract authorizes on the EXISTING Task:
--
--     payment_mechanism   how a money-bearing task would be paid, her own descriptive truth, never bank
--                          verification: 'manual' | 'autopay'. NULLABLE, no default — null means "not known /
--                          not a money task", exactly like value_amount_minor/currency/direction already do.
--                          Every existing row reads as null, which is exactly true: nothing about payment
--                          mechanism was ever stated before this column existed.
--
--   No function is replaced: sync_push, sync_pull and log_row_change are generic, and the claim does not
--   carry tasks specially. No policy, index or trigger changes. SELECT is table-level (existing
--   tasks_select_scoped policy), so the new column is readable by exactly the rows a member can already read;
--   INSERT and UPDATE are column-level, like every other client-writable facet on this table.
--
-- ROLLBACK ASSUMPTIONS (documented, not automated): dropping the column undoes the schema; the mechanism
-- recorded meanwhile cannot be reconstructed, so rolling back discards that knowledge. No down-migration is
-- shipped because nothing here is applied to a populated environment without the owner.
--
-- RELEASE ORDER: this migration must reach an environment BEFORE a client that sends payment_mechanism does.
-- Otherwise those pushes fail with 42703 (undefined column) and stall as validation-failure evidence.
--
-- LINE ENDINGS: pinned to LF by .gitattributes so the migration hash is identical on every checkout.

BEGIN;

-- ============================================================================
-- tasks.payment_mechanism
-- ============================================================================

ALTER TABLE public.tasks ADD COLUMN payment_mechanism text;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_payment_mechanism_check
  CHECK (payment_mechanism IS NULL OR payment_mechanism = ANY (ARRAY['manual'::text, 'autopay'::text]));

-- Column-level, like every other client-writable facet on this table: a client may state a mechanism when it
-- creates a money-bearing task and may correct it, exactly as it may correct the amount or the due date.
GRANT INSERT (payment_mechanism) ON public.tasks TO authenticated;
GRANT UPDATE (payment_mechanism) ON public.tasks TO authenticated;

SELECT private.assert_app_schema_secured();

COMMIT;
