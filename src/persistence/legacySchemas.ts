import { z } from 'zod';
import { isLocalDate } from '../domain/logicalDay';
// Member schemas that did not change between v1 and v2 are reused from the
// FROZEN v3 copy, not the live module: v4 changes every one of them, and a legacy
// validator must keep validating what that version actually was.
import {
  ChildSchemaV3 as ChildSchema,
  DiscoveryRecordSchemaV3 as DiscoveryRecordSchema,
  HouseholdCategorySchemaV3 as HouseholdCategorySchema,
  HouseholdSchemaV3 as HouseholdSchema,
  HouseholdSystemSchemaV3 as HouseholdSystemSchema,
  MealPlanEntrySchemaV3 as MealPlanEntrySchema,
  OnboardingSchemaV3 as OnboardingSchema,
  UserSchemaV3 as UserSchema,
} from './legacySchemasV3';

/**
 * Schema v1, frozen exactly as it shipped through Build 2.5 — used only to
 * validate stored data before the v1 -> v2 migration runs on it.
 *
 * This file must never track `domain/state.ts`. A later schema bump adds a
 * `legacySchemasV2.ts` beside it instead of editing this one, so each
 * version's validator keeps validating what that version actually was. It
 * reuses `Household`/`User`/`Child`/`HouseholdCategory`/`HouseholdSystem`/
 * `MealPlanEntry`/`Onboarding`/`DiscoveryRecord` from the live module because
 * none of those changed between v1 and v2; if a future version changes one of
 * them, freeze that piece here too at that time.
 */

const ID_PATTERN_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IdV1 = z.string().regex(ID_PATTERN_V1, { message: 'Invalid id' });
const LocalDateV1 = z.string().refine(isLocalDate, { message: 'Expected a calendar date (YYYY-MM-DD)' });
const InstantV1 = z.iso.datetime().refine((value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
}, { message: 'Expected a real UTC instant' });
const NonBlankV1 = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, { message: 'Must not be blank' });
const ScopeV1 = z.enum(['personal', 'household', 'child', 'coparent-shared', 'professional']);
const MinutesV1 = z.number().int().min(-1440).max(1440);

const CalendarEventSchemaV1 = z
  .strictObject({
    id: IdV1,
    title: NonBlankV1(200),
    categoryId: IdV1,
    subjectMemberId: IdV1.nullable(),
    startsAt: InstantV1,
    endsAt: InstantV1,
    location: z.string().max(200).nullable(),
    scope: ScopeV1,
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: 'An event must end after it starts',
    path: ['endsAt'],
  });

const TaskPlanSchemaV1 = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unplanned') }),
  z.strictObject({ kind: z.literal('day'), date: LocalDateV1 }),
  z.strictObject({ kind: z.literal('timed'), startsAt: InstantV1 }),
]);

const TaskSchemaV1 = z.strictObject({
  id: IdV1,
  title: NonBlankV1(200),
  categoryId: IdV1,
  subjectMemberId: IdV1.nullable(),
  durationMinutes: z.number().int().min(0).max(1440),
  commitment: z.enum(['fixed', 'flexible']),
  dueDate: LocalDateV1.nullable(),
  plan: TaskPlanSchemaV1,
  scope: ScopeV1,
});

const OneMoveRecordSchemaV1 = z
  .strictObject({
    id: IdV1,
    forDate: LocalDateV1,
    targetId: IdV1.nullable(),
    status: z.enum(['selected', 'completed', 'withheld']),
    decidedAt: InstantV1,
    completedAt: InstantV1.nullable(),
    scope: z.literal('personal'),
  })
  .superRefine((record, ctx) => {
    if ((record.status === 'withheld') !== (record.targetId === null)) {
      ctx.addIssue({ code: 'custom', message: 'Only a withheld One Move has no target', path: ['targetId'] });
    }
    if ((record.status === 'completed') !== (record.completedAt !== null)) {
      ctx.addIssue({ code: 'custom', message: 'completedAt must be set exactly when completed', path: ['completedAt'] });
    }
  });

const actionBaseV1 = {
  id: IdV1,
  logicalDate: LocalDateV1,
  createdAt: InstantV1,
  actor: z.literal('user'),
  source: z.literal('her_keys_recommendation'),
  scope: z.literal('personal'),
};

const TransitionWindowV1 = {
  code: z.literal('transition_buffer_shortfall'),
  windowBeforeEventId: IdV1,
  windowAfterEventId: IdV1,
  bufferMinutes: MinutesV1,
  requiredBufferMinutes: MinutesV1,
};

const MoveTaskActionSchemaV1 = z.strictObject({
  ...actionBaseV1,
  type: z.literal('daily_load.move_task'),
  approval: z.literal('approved'),
  targetId: IdV1,
  reason: z.strictObject({ ...TransitionWindowV1, projectedBufferMinutes: MinutesV1 }),
  before: z.strictObject({ plan: TaskPlanSchemaV1 }),
  after: z.strictObject({ plan: TaskPlanSchemaV1 }),
});

const KeepPlanActionSchemaV1 = z.strictObject({
  ...actionBaseV1,
  type: z.literal('daily_load.keep_plan'),
  approval: z.literal('declined'),
  targetId: IdV1,
  reason: z.strictObject({ ...TransitionWindowV1, recommendedTaskId: IdV1.nullable() }),
});

const ActionRecordSchemaV1 = z.discriminatedUnion('type', [MoveTaskActionSchemaV1, KeepPlanActionSchemaV1]);

const AppStateSchemaV1 = z.strictObject({
  origin: z.enum(['demo', 'empty']),
  household: HouseholdSchema,
  user: UserSchema,
  children: z.array(ChildSchema).max(20),
  categories: z.array(HouseholdCategorySchema).max(200),
  events: z.array(CalendarEventSchemaV1).max(5000),
  tasks: z.array(TaskSchemaV1).max(5000),
  systems: z.array(HouseholdSystemSchema).max(500),
  meals: z.array(MealPlanEntrySchema).max(1000),
  onboarding: OnboardingSchema,
  oneMoves: z.array(OneMoveRecordSchemaV1).max(4000),
  discovery: DiscoveryRecordSchema.nullable(),
  actions: z.array(ActionRecordSchemaV1).max(10_000),
});

export function isValidV1AppState(data: unknown): boolean {
  return AppStateSchemaV1.safeParse(data).success;
}
