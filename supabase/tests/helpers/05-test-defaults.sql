-- TEST ENVIRONMENT ONLY. Never part of the shipping migration, and ENV A asserts that the
-- shipped schema carries no such default.
--
-- Every synced content row must state its provenance: `producer` is NOT NULL with no default,
-- so a writer that forgets to say where a row came from is refused rather than defaulted into
-- a plausible lie. The older suites (RLS, scope, child subject, CAS, cursor, One Move) insert
-- ordinary fixture rows to prove properties that have nothing to do with provenance; naming a
-- producer in each of ~30 statements would bury what they are actually asserting.
--
-- So in the post-apply security environment ONLY, the nine columns default to `user-action`
-- (fixture rows are "rows she made"). The provenance suite (56-provenance.sql) drops these
-- defaults inside its own transaction and proves the real, default-free behaviour.

ALTER TABLE public.household_categories ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.events               ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.tasks                ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.household_systems    ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.meal_plan_entries    ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.needs_me_items       ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.one_move_records     ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.discovery_records    ALTER COLUMN producer SET DEFAULT 'user-action';
ALTER TABLE public.onboarding_state     ALTER COLUMN producer SET DEFAULT 'user-action';
