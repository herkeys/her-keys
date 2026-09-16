import { z } from 'zod';
import { isLocalDate, isValidTimeZone } from './logicalDay';

/**
 * The canonical household state Her Keys remembers between sessions — schema v1.
 *
 * Only facts and accepted actions live here. Anything that can be worked out
 * from them (Daily Load, load tier, life status, a child's age, the Talk It Out
 * hypothesis) is recomputed instead, and nothing here describes presentation:
 * no colors, icons, card types or copy.
 *
 * Household organization is data, not an enum. The eight starter categories
 * are where a household begins; it can rename, reorder, archive and add its
 * own. Business logic reads `categoryId`, and `systemRole` only where a
 * specialized behavior genuinely needs to know "this is the money category".
 *
 * Persisted JSON is untrusted until it passes `validateAppState`.
 */

export const SYSTEM_ROLES = ['kids', 'home', 'money', 'meals', 'work', 'wellbeing', 'relationships', 'coparenting'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const VISIBILITY_SCOPES = ['personal', 'household', 'child', 'coparent-shared', 'professional'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const ONBOARDING_STEPS = ['goals', 'strengths', 'struggles', 'talk-it-out', 'profile', 'plus'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Upper bounds the stored shape enforces. Capture screens read the same
 * numbers so they can refuse an entry up front instead of offering a save the
 * store would reject.
 */
export const FIELD_LIMITS = {
  titleLength: 200,
  locationLength: 200,
  notesLength: 1000,
  durationMinutes: 1440,
  travelMinutes: 240,
} as const;

/** Letters, digits and `._:-`, starting with a letter or digit — never `__proto__` or similar. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const Id = z.string().regex(ID_PATTERN, { message: 'Invalid id' });

const LocalDateSchema = z.string().refine(isLocalDate, { message: 'Expected a calendar date (YYYY-MM-DD)' });

/** A UTC moment. The round-trip rejects impossible dates such as 30 February that a pattern alone lets through. */
const InstantSchema = z.iso.datetime().refine((value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
}, { message: 'Expected a real UTC instant' });

const NonBlank = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, { message: 'Must not be blank' });

const Scope = z.enum(VISIBILITY_SCOPES);

const Minutes = z.number().int().min(-1440).max(1440);

const TravelMinutes = z.number().int().min(0).max(FIELD_LIMITS.travelMinutes).nullable();

const Notes = z.string().max(FIELD_LIMITS.notesLength).nullable();

const Title = NonBlank(FIELD_LIMITS.titleLength);

const DurationMinutes = z.number().int().min(0).max(FIELD_LIMITS.durationMinutes);

export const HouseholdSchema = z.strictObject({
  id: Id,
  displayName: z.string().max(80).nullable(),
  scope: z.literal('household'),
});

export const UserSchema = z.strictObject({
  id: Id,
  displayName: z.string().max(80).nullable(),
  timezone: z.string().max(64).refine(isValidTimeZone, { message: 'Unknown IANA timezone' }),
  scope: z.literal('personal'),
});

export const ChildSchema = z.strictObject({
  id: Id,
  displayName: NonBlank(80),
  birthDate: LocalDateSchema,
  scope: z.literal('child'),
});

export const HouseholdCategorySchema = z.strictObject({
  id: Id,
  householdId: Id,
  name: NonBlank(60),
  systemRole: z.enum(SYSTEM_ROLES).nullable(),
  status: z.enum(['active', 'archived']),
  sortOrder: z.number().int().min(0).max(10_000),
  scope: Scope,
});

export const CalendarEventSchema = z
  .strictObject({
    id: Id,
    title: Title,
    categoryId: Id,
    subjectMemberId: Id.nullable(),
    startsAt: InstantSchema,
    endsAt: InstantSchema,
    location: z.string().max(FIELD_LIMITS.locationLength).nullable(),
    notes: Notes,
    /** FIXED can never be moved by a recommendation; only FLEXIBLE can. */
    commitment: z.enum(['fixed', 'flexible']),
    /** Removed rather than deleted, so a past action record can still name it. */
    status: z.enum(['active', 'removed']),
    travelMinutesBefore: TravelMinutes,
    travelMinutesAfter: TravelMinutes,
    preparationMinutes: TravelMinutes,
    source: z.enum(['user', 'demo']),
    createdAt: InstantSchema.nullable(),
    updatedAt: InstantSchema.nullable(),
    scope: Scope,
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: 'An event must end after it starts',
    path: ['endsAt'],
  });

export const TaskPlanSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unplanned') }),
  z.strictObject({ kind: z.literal('day'), date: LocalDateSchema }),
  z.strictObject({ kind: z.literal('timed'), startsAt: InstantSchema }),
]);

export const TaskSchema = z
  .strictObject({
    id: Id,
    title: Title,
    categoryId: Id,
    subjectMemberId: Id.nullable(),
    durationMinutes: DurationMinutes,
    commitment: z.enum(['fixed', 'flexible']),
    dueDate: LocalDateSchema.nullable(),
    plan: TaskPlanSchema,
    notes: Notes,
    status: z.enum(['open', 'completed', 'archived']),
    completedAt: InstantSchema.nullable(),
    createdAt: InstantSchema.nullable(),
    updatedAt: InstantSchema.nullable(),
    scope: Scope,
  })
  .superRefine((task, ctx) => {
    if ((task.status === 'completed') !== (task.completedAt !== null)) {
      ctx.addIssue({ code: 'custom', message: 'completedAt must be set exactly when completed', path: ['completedAt'] });
    }
  });

export const HouseholdSystemSchema = z.strictObject({
  id: Id,
  name: NonBlank(120),
  description: z.string().max(500),
  categoryId: Id,
  scope: Scope,
});

export const MealPlanEntrySchema = z.strictObject({
  id: Id,
  date: LocalDateSchema,
  title: NonBlank(200),
  categoryId: Id,
  scope: Scope,
});

export const OnboardingSchema = z.strictObject({
  goalIds: z.array(Id).max(50),
  strengthIds: z.array(Id).max(50),
  struggleIds: z.array(Id).max(50),
  lastStep: z.enum(ONBOARDING_STEPS).nullable(),
  completedAt: InstantSchema.nullable(),
  scope: z.literal('personal'),
});

export const OneMoveRecordSchema = z
  .strictObject({
    id: Id,
    forDate: LocalDateSchema,
    /** The catalog move offered; null when nothing was offered because the day was already overloaded. */
    targetId: Id.nullable(),
    /** Which list `targetId` looks up in — the hardcoded demo catalog, or a real task/Needs Me item. */
    targetType: z.enum(['catalog', 'task', 'needsMe']),
    status: z.enum(['selected', 'completed', 'withheld']),
    decidedAt: InstantSchema,
    completedAt: InstantSchema.nullable(),
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
export const NeedsMeItemSchema = z.strictObject({
  id: Id,
  title: Title,
  status: z.enum(['open', 'resolved']),
  dueDate: LocalDateSchema.nullable(),
  categoryId: Id.nullable(),
  createdAt: InstantSchema,
  scope: z.literal('personal'),
});

/** Structured Talk It Out state only: which topic, and which scripted answer to which question. Never her words. */
export const DiscoveryRecordSchema = z.strictObject({
  id: Id,
  topicId: Id,
  answers: z.array(z.strictObject({ questionId: Id, optionId: Id })).max(2),
  scope: z.literal('personal'),
});

const actionBase = {
  id: Id,
  logicalDate: LocalDateSchema,
  createdAt: InstantSchema,
  /** Who carried the action out. A separate approver will be needed once other people or autopilot can act. */
  actor: z.literal('user'),
  /** Where the proposal came from — Her Keys recommended it; she decided. */
  source: z.literal('her_keys_recommendation'),
  scope: z.literal('personal'),
};

const TransitionWindow = {
  code: z.literal('transition_buffer_shortfall'),
  windowBeforeEventId: Id,
  windowAfterEventId: Id,
  bufferMinutes: Minutes,
  requiredBufferMinutes: Minutes,
};

export const MoveTaskActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.move_task'),
  approval: z.literal('approved'),
  targetId: Id,
  reason: z.strictObject({ ...TransitionWindow, projectedBufferMinutes: Minutes }),
  before: z.strictObject({ plan: TaskPlanSchema }),
  after: z.strictObject({ plan: TaskPlanSchema }),
});

export const KeepPlanActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.keep_plan'),
  approval: z.literal('declined'),
  /** The commitment the tight window runs up against. */
  targetId: Id,
  reason: z.strictObject({ ...TransitionWindow, recommendedTaskId: Id.nullable() }),
});

/** Moving a flexible event works like moving a task, but the "before"/"after" are its own start and end. */
export const MoveEventActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.move_event'),
  approval: z.literal('approved'),
  targetId: Id,
  reason: z.strictObject({ ...TransitionWindow }),
  before: z.strictObject({ startsAt: InstantSchema, endsAt: InstantSchema }),
  after: z.strictObject({ startsAt: InstantSchema, endsAt: InstantSchema }),
});

const CapacityReason = {
  code: z.literal('capacity_pressure'),
  totalAvailableMinutes: Minutes,
  totalFlexibleNeededMinutes: Minutes,
  shortfallMinutes: Minutes,
};

export const DropTaskActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.drop_task'),
  approval: z.literal('approved'),
  targetId: Id,
  reason: z.strictObject({ ...CapacityReason }),
  before: z.strictObject({ status: z.literal('open') }),
  after: z.strictObject({ status: z.literal('archived') }),
});

export const ShortenTaskActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.shorten_task'),
  approval: z.literal('approved'),
  targetId: Id,
  reason: z.strictObject({ ...CapacityReason }),
  before: z.strictObject({ durationMinutes: DurationMinutes }),
  after: z.strictObject({ durationMinutes: DurationMinutes }),
});

export const KeepCapacityPlanActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.keep_capacity_plan'),
  approval: z.literal('declined'),
  /** No single commitment to point at — the pressure is the day's flexible workload as a whole. */
  targetId: z.null(),
  reason: z.strictObject({ ...CapacityReason, consideredTaskId: Id.nullable() }),
});

/** Converts a flexible task or event to fixed: Her Keys will never again suggest moving, shortening or dropping it. */
export const ProtectItemActionSchema = z.strictObject({
  ...actionBase,
  type: z.literal('daily_load.protect_item'),
  approval: z.literal('approved'),
  targetType: z.enum(['task', 'event']),
  targetId: Id,
  reason: z.strictObject({ code: z.literal('user_requested_protection') }),
  before: z.strictObject({ commitment: z.literal('flexible') }),
  after: z.strictObject({ commitment: z.literal('fixed') }),
});

export const ActionRecordSchema = z.discriminatedUnion('type', [
  MoveTaskActionSchema,
  KeepPlanActionSchema,
  MoveEventActionSchema,
  DropTaskActionSchema,
  ShortenTaskActionSchema,
  KeepCapacityPlanActionSchema,
  ProtectItemActionSchema,
]);

export const AppStateSchema = z.strictObject({
  /** Whether this state began as the fictional demo household or as a real, empty one. */
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

export type Household = z.infer<typeof HouseholdSchema>;
export type User = z.infer<typeof UserSchema>;
export type Child = z.infer<typeof ChildSchema>;
export type HouseholdCategory = z.infer<typeof HouseholdCategorySchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type HouseholdSystem = z.infer<typeof HouseholdSystemSchema>;
export type MealPlanEntry = z.infer<typeof MealPlanEntrySchema>;
export type Onboarding = z.infer<typeof OnboardingSchema>;
export type OneMoveRecord = z.infer<typeof OneMoveRecordSchema>;
export type NeedsMeItem = z.infer<typeof NeedsMeItemSchema>;
export type DiscoveryRecord = z.infer<typeof DiscoveryRecordSchema>;
export type MoveTaskAction = z.infer<typeof MoveTaskActionSchema>;
export type KeepPlanAction = z.infer<typeof KeepPlanActionSchema>;
export type MoveEventAction = z.infer<typeof MoveEventActionSchema>;
export type DropTaskAction = z.infer<typeof DropTaskActionSchema>;
export type ShortenTaskAction = z.infer<typeof ShortenTaskActionSchema>;
export type KeepCapacityPlanAction = z.infer<typeof KeepCapacityPlanActionSchema>;
export type ProtectItemAction = z.infer<typeof ProtectItemActionSchema>;
export type ActionRecord = z.infer<typeof ActionRecordSchema>;
export type AppState = z.infer<typeof AppStateSchema>;
export type DataOrigin = AppState['origin'];

export type StateValidation =
  | { ok: true; state: AppState }
  | { ok: false; reason: 'invalid_state' | 'integrity_violation'; issues: string[] };

/**
 * Shape first, then the relationships a shape can't express. Issues name
 * paths and ids only — never stored values — so they are safe to log.
 */
export function validateAppState(value: unknown): StateValidation {
  const parsed = AppStateSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid_state',
      issues: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }

  const problems = findIntegrityProblems(parsed.data);
  if (problems.length > 0) return { ok: false, reason: 'integrity_violation', issues: problems.slice(0, 20) };

  return { ok: true, state: parsed.data };
}

export function findIntegrityProblems(state: AppState): string[] {
  const problems: string[] = [];

  const requireUnique = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) problems.push(`duplicate ${label} ${value}`);
      seen.add(value);
    }
  };

  const childIds = new Set(state.children.map((child) => child.id));
  const memberIds = new Set([state.user.id, ...childIds]);
  const categoryIds = new Set(state.categories.map((category) => category.id));
  const taskIds = new Set(state.tasks.map((task) => task.id));
  const eventIds = new Set(state.events.map((event) => event.id));
  const needsMeIds = new Set(state.needsMe.map((item) => item.id));

  requireUnique('member id', [state.user.id, ...state.children.map((child) => child.id)]);
  requireUnique('category id', state.categories.map((category) => category.id));
  requireUnique('category sortOrder', state.categories.map((category) => String(category.sortOrder)));
  // Specialized behavior looks a role up, so a role can belong to one category at most.
  requireUnique('category systemRole', state.categories.flatMap((category) => (category.systemRole ? [category.systemRole] : [])));
  requireUnique('event id', state.events.map((event) => event.id));
  requireUnique('task id', state.tasks.map((task) => task.id));
  requireUnique('system id', state.systems.map((system) => system.id));
  requireUnique('meal id', state.meals.map((meal) => meal.id));
  requireUnique('One Move date', state.oneMoves.map((record) => record.forDate));
  requireUnique('One Move id', state.oneMoves.map((record) => record.id));
  requireUnique('needs-me id', state.needsMe.map((item) => item.id));
  requireUnique('action id', state.actions.map((action) => action.id));
  requireUnique('goal', state.onboarding.goalIds);
  requireUnique('strength', state.onboarding.strengthIds);
  requireUnique('struggle', state.onboarding.struggleIds);
  requireUnique('discovery answer', state.discovery?.answers.map((answer) => answer.questionId) ?? []);

  for (const category of state.categories) {
    if (category.householdId !== state.household.id) {
      problems.push(`category ${category.id} belongs to another household`);
    }
  }

  const checkCategory = (label: string, record: { id: string; categoryId: string }) => {
    if (!categoryIds.has(record.categoryId)) problems.push(`${label} ${record.id} references missing category ${record.categoryId}`);
  };

  const checkSubject = (label: string, record: { id: string; subjectMemberId: string | null; scope: VisibilityScope }) => {
    if (record.subjectMemberId !== null && !memberIds.has(record.subjectMemberId)) {
      problems.push(`${label} ${record.id} references missing member ${record.subjectMemberId}`);
    }
    if (record.scope === 'child' && (record.subjectMemberId === null || !childIds.has(record.subjectMemberId))) {
      problems.push(`${label} ${record.id} is child-scoped but does not name a child`);
    }
  };

  for (const event of state.events) {
    checkCategory('event', event);
    checkSubject('event', event);
  }
  for (const task of state.tasks) {
    checkCategory('task', task);
    checkSubject('task', task);
  }
  for (const system of state.systems) checkCategory('system', system);
  for (const meal of state.meals) checkCategory('meal', meal);

  for (const item of state.needsMe) {
    if (item.categoryId !== null && !categoryIds.has(item.categoryId)) {
      problems.push(`needs-me ${item.id} references missing category ${item.categoryId}`);
    }
  }

  for (const record of state.oneMoves) {
    if (record.targetId === null) continue;
    if (record.targetType === 'task' && !taskIds.has(record.targetId)) {
      problems.push(`One Move ${record.id} references missing task ${record.targetId}`);
    }
    if (record.targetType === 'needsMe' && !needsMeIds.has(record.targetId)) {
      problems.push(`One Move ${record.id} references missing needs-me item ${record.targetId}`);
    }
  }

  for (const action of state.actions) {
    if (action.type === 'daily_load.move_task' || action.type === 'daily_load.keep_plan' || action.type === 'daily_load.move_event') {
      if (!eventIds.has(action.reason.windowBeforeEventId) || !eventIds.has(action.reason.windowAfterEventId)) {
        problems.push(`action ${action.id} references a missing event`);
      }
    }
    if (action.type === 'daily_load.move_task' && !taskIds.has(action.targetId)) {
      problems.push(`action ${action.id} references missing task ${action.targetId}`);
    }
    if (action.type === 'daily_load.keep_plan') {
      if (!eventIds.has(action.targetId)) problems.push(`action ${action.id} references missing event ${action.targetId}`);
      if (action.reason.recommendedTaskId !== null && !taskIds.has(action.reason.recommendedTaskId)) {
        problems.push(`action ${action.id} references missing task ${action.reason.recommendedTaskId}`);
      }
    }
    if (action.type === 'daily_load.move_event' && !eventIds.has(action.targetId)) {
      problems.push(`action ${action.id} references missing event ${action.targetId}`);
    }
    if (action.type === 'daily_load.drop_task' && !taskIds.has(action.targetId)) {
      problems.push(`action ${action.id} references missing task ${action.targetId}`);
    }
    if (action.type === 'daily_load.shorten_task' && !taskIds.has(action.targetId)) {
      problems.push(`action ${action.id} references missing task ${action.targetId}`);
    }
    if (action.type === 'daily_load.keep_capacity_plan' && action.reason.consideredTaskId !== null && !taskIds.has(action.reason.consideredTaskId)) {
      problems.push(`action ${action.id} references missing task ${action.reason.consideredTaskId}`);
    }
    if (action.type === 'daily_load.protect_item') {
      const exists = action.targetType === 'task' ? taskIds.has(action.targetId) : eventIds.has(action.targetId);
      if (!exists) problems.push(`action ${action.id} references missing ${action.targetType} ${action.targetId}`);
    }
  }

  return problems;
}
