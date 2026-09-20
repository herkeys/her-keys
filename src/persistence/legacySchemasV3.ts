import { z } from 'zod';
import { isLocalDate, isValidTimeZone } from '../domain/logicalDay';

/**
 * Schema v3, FROZEN exactly as it shipped at the entry head of
 * B4-FOUNDATION-BUILDOUT-01 (32b1601bc7edfa52992a92f1a744167211ee36c1).
 *
 * This file is a mechanical, renamed copy of the schema section of
 * `domain/state.ts` at that commit. It exists for two reasons:
 *
 *   1. v3 -> v4 validates its INPUT against what v3 actually was, not against
 *      whatever the live schema has since become.
 *   2. `legacySchemas.ts` (v1) and `legacySchemasV2.ts` used to reuse member
 *      schemas from the live module. v4 changes nine of them, so those
 *      validators now import their frozen pieces from here instead. Same rule as
 *      before: a legacy validator never tracks the live schema.
 *
 * Never edit this file to make a migration pass. If a migration disagrees with
 * it, the migration is wrong (Addendum 02 B10).
 */

export const SYSTEM_ROLESV3 = ['kids', 'home', 'money', 'meals', 'work', 'wellbeing', 'relationships', 'coparenting'] as const;
export type SystemRoleV3 = (typeof SYSTEM_ROLESV3)[number];

export const VISIBILITY_SCOPESV3 = ['personal', 'household', 'child', 'coparent-shared', 'professional'] as const;
export type VisibilityScopeV3 = (typeof VISIBILITY_SCOPESV3)[number];

export const ONBOARDING_STEPSV3 = ['goals', 'strengths', 'struggles', 'talk-it-out', 'profile', 'plus'] as const;
export type OnboardingStepV3 = (typeof ONBOARDING_STEPSV3)[number];

/**
 * Upper bounds the stored shape enforces. Capture screens read the same
 * numbers so they can refuse an entry up front instead of offering a save the
 * store would reject.
 */
export const FIELD_LIMITSV3 = {
  titleLength: 200,
  locationLength: 200,
  notesLength: 1000,
  durationMinutes: 1440,
  travelMinutes: 240,
} as const;

/** Letters, digits and `._:-`, starting with a letter or digit — never `__proto__` or similar. */
const ID_PATTERNV3 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const IdV3 = z.string().regex(ID_PATTERNV3, { message: 'Invalid id' });

const LocalDateSchemaV3 = z.string().refine(isLocalDate, { message: 'Expected a calendar date (YYYY-MM-DD)' });

/** A UTC moment. The round-trip rejects impossible dates such as 30 February that a pattern alone lets through. */
const InstantSchemaV3 = z.iso.datetime().refine((value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
}, { message: 'Expected a real UTC instant' });

const NonBlankV3 = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, { message: 'Must not be blank' });

const ScopeV3 = z.enum(VISIBILITY_SCOPESV3);

const MinutesV3 = z.number().int().min(-1440).max(1440);

const TravelMinutesV3 = z.number().int().min(0).max(FIELD_LIMITSV3.travelMinutes).nullable();

const NotesV3 = z.string().max(FIELD_LIMITSV3.notesLength).nullable();

const TitleV3 = NonBlankV3(FIELD_LIMITSV3.titleLength);

const DurationMinutesV3 = z.number().int().min(0).max(FIELD_LIMITSV3.durationMinutes);

export const HouseholdSchemaV3 = z.strictObject({
  id: IdV3,
  displayName: z.string().max(80).nullable(),
  scope: z.literal('household'),
});

export const UserSchemaV3 = z.strictObject({
  id: IdV3,
  displayName: z.string().max(80).nullable(),
  timezone: z.string().max(64).refine(isValidTimeZone, { message: 'Unknown IANA timezone' }),
  scope: z.literal('personal'),
});

export const ChildSchemaV3 = z.strictObject({
  id: IdV3,
  displayName: NonBlankV3(80),
  birthDate: LocalDateSchemaV3,
  scope: z.literal('child'),
});

export const HouseholdCategorySchemaV3 = z.strictObject({
  id: IdV3,
  householdId: IdV3,
  name: NonBlankV3(60),
  systemRole: z.enum(SYSTEM_ROLESV3).nullable(),
  status: z.enum(['active', 'archived']),
  sortOrder: z.number().int().min(0).max(10_000),
  scope: ScopeV3,
});

export const CalendarEventSchemaV3 = z
  .strictObject({
    id: IdV3,
    title: TitleV3,
    categoryId: IdV3,
    subjectMemberId: IdV3.nullable(),
    startsAt: InstantSchemaV3,
    endsAt: InstantSchemaV3,
    location: z.string().max(FIELD_LIMITSV3.locationLength).nullable(),
    notes: NotesV3,
    /** FIXED can never be moved by a recommendation; only FLEXIBLE can. */
    commitment: z.enum(['fixed', 'flexible']),
    /** Removed rather than deleted, so a past action record can still name it. */
    status: z.enum(['active', 'removed']),
    travelMinutesBefore: TravelMinutesV3,
    travelMinutesAfter: TravelMinutesV3,
    preparationMinutes: TravelMinutesV3,
    source: z.enum(['user', 'demo']),
    createdAt: InstantSchemaV3.nullable(),
    updatedAt: InstantSchemaV3.nullable(),
    scope: ScopeV3,
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: 'An event must end after it starts',
    path: ['endsAt'],
  });

export const TaskPlanSchemaV3 = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unplanned') }),
  z.strictObject({ kind: z.literal('day'), date: LocalDateSchemaV3 }),
  z.strictObject({ kind: z.literal('timed'), startsAt: InstantSchemaV3 }),
]);

export const TaskSchemaV3 = z
  .strictObject({
    id: IdV3,
    title: TitleV3,
    categoryId: IdV3,
    subjectMemberId: IdV3.nullable(),
    durationMinutes: DurationMinutesV3,
    commitment: z.enum(['fixed', 'flexible']),
    dueDate: LocalDateSchemaV3.nullable(),
    plan: TaskPlanSchemaV3,
    notes: NotesV3,
    status: z.enum(['open', 'completed', 'archived']),
    completedAt: InstantSchemaV3.nullable(),
    createdAt: InstantSchemaV3.nullable(),
    updatedAt: InstantSchemaV3.nullable(),
    scope: ScopeV3,
  })
  .superRefine((task, ctx) => {
    if ((task.status === 'completed') !== (task.completedAt !== null)) {
      ctx.addIssue({ code: 'custom', message: 'completedAt must be set exactly when completed', path: ['completedAt'] });
    }
  });

export const HouseholdSystemSchemaV3 = z.strictObject({
  id: IdV3,
  name: NonBlankV3(120),
  description: z.string().max(500),
  categoryId: IdV3,
  scope: ScopeV3,
});

export const MealPlanEntrySchemaV3 = z.strictObject({
  id: IdV3,
  date: LocalDateSchemaV3,
  title: NonBlankV3(200),
  categoryId: IdV3,
  scope: ScopeV3,
});

export const OnboardingSchemaV3 = z.strictObject({
  goalIds: z.array(IdV3).max(50),
  strengthIds: z.array(IdV3).max(50),
  struggleIds: z.array(IdV3).max(50),
  lastStep: z.enum(ONBOARDING_STEPSV3).nullable(),
  completedAt: InstantSchemaV3.nullable(),
  scope: z.literal('personal'),
});

export const OneMoveRecordSchemaV3 = z
  .strictObject({
    id: IdV3,
    forDate: LocalDateSchemaV3,
    /** The catalog move offered; null when nothing was offered because the day was already overloaded. */
    targetId: IdV3.nullable(),
    /** Which list `targetId` looks up in — the hardcoded demo catalog, or a real task/Needs Me item. */
    targetType: z.enum(['catalog', 'task', 'needsMe']),
    status: z.enum(['selected', 'completed', 'withheld']),
    decidedAt: InstantSchemaV3,
    completedAt: InstantSchemaV3.nullable(),
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

/**
 * A low-friction capture for something entering her head that she hasn't
 * organized yet — a title is all it needs. Category and due date are add-ons
 * for later, never required at capture time.
 */
export const NeedsMeItemSchemaV3 = z.strictObject({
  id: IdV3,
  title: TitleV3,
  status: z.enum(['open', 'resolved']),
  dueDate: LocalDateSchemaV3.nullable(),
  categoryId: IdV3.nullable(),
  createdAt: InstantSchemaV3,
  scope: z.literal('personal'),
});

/** Structured Talk It Out state only: which topic, and which scripted answer to which question. Never her words. */
export const DiscoveryRecordSchemaV3 = z.strictObject({
  id: IdV3,
  topicId: IdV3,
  answers: z.array(z.strictObject({ questionId: IdV3, optionId: IdV3 })).max(2),
  scope: z.literal('personal'),
});

const actionBaseV3 = {
  id: IdV3,
  logicalDate: LocalDateSchemaV3,
  createdAt: InstantSchemaV3,
  /** Who carried the action out. A separate approver will be needed once other people or autopilot can act. */
  actor: z.literal('user'),
  /** Where the proposal came from — Her Keys recommended it; she decided. */
  source: z.literal('her_keys_recommendation'),
  scope: z.literal('personal'),
};

const TransitionWindowV3 = {
  code: z.literal('transition_buffer_shortfall'),
  windowBeforeEventId: IdV3,
  windowAfterEventId: IdV3,
  bufferMinutes: MinutesV3,
  requiredBufferMinutes: MinutesV3,
};

export const MoveTaskActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.move_task'),
  approval: z.literal('approved'),
  targetId: IdV3,
  reason: z.strictObject({ ...TransitionWindowV3, projectedBufferMinutes: MinutesV3 }),
  before: z.strictObject({ plan: TaskPlanSchemaV3 }),
  after: z.strictObject({ plan: TaskPlanSchemaV3 }),
});

export const KeepPlanActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.keep_plan'),
  approval: z.literal('declined'),
  /** The commitment the tight window runs up against. */
  targetId: IdV3,
  reason: z.strictObject({ ...TransitionWindowV3, recommendedTaskId: IdV3.nullable() }),
});

/** Moving a flexible event works like moving a task, but the "before"/"after" are its own start and end. */
export const MoveEventActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.move_event'),
  approval: z.literal('approved'),
  targetId: IdV3,
  reason: z.strictObject({ ...TransitionWindowV3 }),
  before: z.strictObject({ startsAt: InstantSchemaV3, endsAt: InstantSchemaV3 }),
  after: z.strictObject({ startsAt: InstantSchemaV3, endsAt: InstantSchemaV3 }),
});

const CapacityReasonV3 = {
  code: z.literal('capacity_pressure'),
  totalAvailableMinutes: MinutesV3,
  totalFlexibleNeededMinutes: MinutesV3,
  shortfallMinutes: MinutesV3,
};

export const DropTaskActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.drop_task'),
  approval: z.literal('approved'),
  targetId: IdV3,
  reason: z.strictObject({ ...CapacityReasonV3 }),
  before: z.strictObject({ status: z.literal('open') }),
  after: z.strictObject({ status: z.literal('archived') }),
});

export const ShortenTaskActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.shorten_task'),
  approval: z.literal('approved'),
  targetId: IdV3,
  reason: z.strictObject({ ...CapacityReasonV3 }),
  before: z.strictObject({ durationMinutes: DurationMinutesV3 }),
  after: z.strictObject({ durationMinutes: DurationMinutesV3 }),
});

export const KeepCapacityPlanActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.keep_capacity_plan'),
  approval: z.literal('declined'),
  /** No single commitment to point at — the pressure is the day's flexible workload as a whole. */
  targetId: z.null(),
  reason: z.strictObject({ ...CapacityReasonV3, consideredTaskId: IdV3.nullable() }),
});

/** Converts a flexible task or event to fixed: Her Keys will never again suggest moving, shortening or dropping it. */
export const ProtectItemActionSchemaV3 = z.strictObject({
  ...actionBaseV3,
  type: z.literal('daily_load.protect_item'),
  approval: z.literal('approved'),
  targetType: z.enum(['task', 'event']),
  targetId: IdV3,
  reason: z.strictObject({ code: z.literal('user_requested_protection') }),
  before: z.strictObject({ commitment: z.literal('flexible') }),
  after: z.strictObject({ commitment: z.literal('fixed') }),
});

export const ActionRecordSchemaV3 = z.discriminatedUnion('type', [
  MoveTaskActionSchemaV3,
  KeepPlanActionSchemaV3,
  MoveEventActionSchemaV3,
  DropTaskActionSchemaV3,
  ShortenTaskActionSchemaV3,
  KeepCapacityPlanActionSchemaV3,
  ProtectItemActionSchemaV3,
]);

/**
 * Durable evidence that a local migration had to let go of a record it could no
 * longer represent truthfully (B4-BE02-OR-002).
 *
 * The surviving facts are kept verbatim; the missing target is never
 * fabricated, the outcome is never rewritten, and the record is never silently
 * deleted. This is the local evidence channel — the same one later conflict
 * handling uses — not a second subsystem invented for one case.
 *
 * `targetType`, `status` and `scope` are plain strings here on purpose. This is
 * a record of what WAS stored, and narrowing it to today's enums is exactly the
 * mistake that created the need for it: a value that is no longer legal must
 * still be recordable, or the evidence cannot describe the thing it exists to
 * describe.
 */
export const MIGRATION_EVIDENCE_REASONSV3 = ['LEGACY_REAL_CATALOG_ONE_MOVE'] as const;
export type MigrationEvidenceReasonV3 = (typeof MIGRATION_EVIDENCE_REASONSV3)[number];

export const MigrationEvidenceSchemaV3 = z.strictObject({
  /** Stable and derived from the original record, so re-running a migration cannot duplicate it. */
  id: IdV3,
  kind: z.literal('one-move'),
  reason: z.enum(MIGRATION_EVIDENCE_REASONSV3),
  /** Which stored shape the record came out of. */
  sourceSchemaVersion: z.number().int().min(1).max(1000),
  original: z.strictObject({
    oneMoveId: IdV3,
    forDate: LocalDateSchemaV3,
    targetId: IdV3.nullable(),
    targetType: z.string().max(64),
    status: z.string().max(32),
    decidedAt: InstantSchemaV3,
    completedAt: InstantSchemaV3.nullable(),
    scope: z.string().max(32),
  }),
});
export const AppStateSchemaV3 = z.strictObject({
  /** Whether this state began as the fictional demo household or as a real, empty one. */
  origin: z.enum(['demo', 'empty']),
  household: HouseholdSchemaV3,
  user: UserSchemaV3,
  children: z.array(ChildSchemaV3).max(20),
  categories: z.array(HouseholdCategorySchemaV3).max(200),
  events: z.array(CalendarEventSchemaV3).max(5000),
  tasks: z.array(TaskSchemaV3).max(5000),
  systems: z.array(HouseholdSystemSchemaV3).max(500),
  meals: z.array(MealPlanEntrySchemaV3).max(1000),
  onboarding: OnboardingSchemaV3,
  oneMoves: z.array(OneMoveRecordSchemaV3).max(4000),
  needsMe: z.array(NeedsMeItemSchemaV3).max(1000),
  discovery: DiscoveryRecordSchemaV3.nullable(),
  actions: z.array(ActionRecordSchemaV3).max(10_000),
  /** Records a local migration could not carry forward truthfully. Usually empty. */
  migrationEvidence: z.array(MigrationEvidenceSchemaV3).max(4000),
});

export function isValidV3AppState(data: unknown): boolean {
  return AppStateSchemaV3.safeParse(data).success;
}
