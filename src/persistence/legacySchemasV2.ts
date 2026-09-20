import { z } from 'zod';
import {
  ActionRecordSchema,
  CalendarEventSchema,
  ChildSchema,
  DiscoveryRecordSchema,
  HouseholdCategorySchema,
  HouseholdSchema,
  HouseholdSystemSchema,
  MealPlanEntrySchema,
  NeedsMeItemSchema,
  OnboardingSchema,
  OneMoveRecordSchema,
  TaskSchema,
  UserSchema,
} from '../domain/state';

/**
 * Schema v2, frozen exactly as it shipped through Build 3 — used only to
 * validate stored data before the v2 -> v3 migration runs on it.
 *
 * Same rule as `legacySchemas.ts`: this file must never track
 * `domain/state.ts`. v3 adds one field to the root (`migrationEvidence`) and
 * changes nothing else, so every member schema is still reused from the live
 * module. If a future version changes one of them, freeze that piece here at
 * that time rather than editing it in place.
 */
const AppStateSchemaV2 = z.strictObject({
  origin: z.enum(['demo', 'empty']),
  household: HouseholdSchema,
  user: UserSchema,
  children: z.array(ChildSchema).max(20),
  categories: z.array(HouseholdCategorySchema).max(200),
  events: z.array(CalendarEventSchema).max(5000),
  tasks: z.array(TaskSchema).max(5000),
  systems: z.array(HouseholdSystemSchema).max(500),
  meals: z.array(MealPlanEntrySchema).max(1000),
  onboarding: OnboardingSchema,
  oneMoves: z.array(OneMoveRecordSchema).max(4000),
  needsMe: z.array(NeedsMeItemSchema).max(1000),
  discovery: DiscoveryRecordSchema.nullable(),
  actions: z.array(ActionRecordSchema).max(10_000),
});

export function isValidV2AppState(data: unknown): boolean {
  return AppStateSchemaV2.safeParse(data).success;
}
