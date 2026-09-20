import { z } from 'zod';
import {
  ActionExecutionSchema,
  ActionIntentSchema,
  ActionOutcomeSchema,
  AutomationAuthoritySchema,
  IntentDecisionSchema,
} from './foundation/authorization';
import { InterpretationSchema } from './foundation/interpretation';
import { eventFacetFields, mealFacetFields, systemFacetFields, taskFacetFields } from './foundation/commitment';
import { ExternalReferenceSchema } from './foundation/externalReference';
import { BehaviorObservationSchema, MAX_LOCAL_OBSERVATIONS } from './foundation/observation';
import { EvidenceLinkSchema, PatternSchema } from './foundation/pattern';
import { PROVENANCE_SOURCES, ProvenanceSchema } from './foundation/provenance';
import { HouseholdPersonSchema, ResponsibilitySchema, isActiveResponsibility } from './foundation/responsibility';
import { SourceArtifactSchema } from './foundation/sourceArtifact';
import {
  CapacityProfileSchema,
  DependencySchema,
  GoalSchema,
  RecurrenceRuleSchema,
  SystemStepSchema,
  findDependencyCycle,
} from './foundation/structure';
import { refExists } from './foundation/typedRef';
import { isValidTimeZone } from './logicalDay';
import {
  Id,
  InstantSchema,
  LocalDateSchema,
  NonBlank,
  OpenCode,
  Scope,
  SYSTEM_ROLES,
  VISIBILITY_SCOPES,
  type SystemRole,
  type VisibilityScope,
} from './schemaPrimitives';

export { SYSTEM_ROLES, VISIBILITY_SCOPES, type SystemRole, type VisibilityScope };

/**
 * The canonical household state Her Keys remembers between sessions — local
 * schema v4 (see `persistence/envelope.ts`; v3 is frozen in
 * `persistence/legacySchemasV3.ts`).
 *
 * Only facts and accepted actions live here. Anything that can be worked out
 * from them (Daily Load, load tier, life status, a child's age, the Talk It Out
 * hypothesis) is recomputed instead, and nothing here describes presentation:
 * no colors, icons, card types or copy.
 *
 * Since v4 every content row carries STORED provenance (`provenance`), because
 * where a fact came from is a fact about the row, not about the kind of entity.
 *
 * Household organization is data, not an enum. The eight starter categories
 * are where a household begins; it can rename, reorder, archive and add its
 * own. Business logic reads `categoryId`, and `systemRole` only where a
 * specialized behavior genuinely needs to know "this is the money category".
 *
 * Persisted JSON is untrusted until it passes `validateAppState`.
 */

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
  provenance: ProvenanceSchema,
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
    ...eventFacetFields,
    provenance: ProvenanceSchema,
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
    ...taskFacetFields,
    provenance: ProvenanceSchema,
    scope: Scope,
  })
  .superRefine((task, ctx) => {
    if ((task.status === 'completed') !== (task.completedAt !== null)) {
      ctx.addIssue({ code: 'custom', message: 'completedAt must be set exactly when completed', path: ['completedAt'] });
    }
    if (task.earliestStartAt !== null && task.latestFinishAt !== null && Date.parse(task.earliestStartAt) > Date.parse(task.latestFinishAt)) {
      ctx.addIssue({ code: 'custom', message: 'a scheduling window opens before it closes', path: ['latestFinishAt'] });
    }
    if (task.minChunkMinutes !== null && task.splittable !== true) {
      ctx.addIssue({ code: 'custom', message: 'a minimum chunk belongs to a task that can be split', path: ['minChunkMinutes'] });
    }
    if (task.minChunkMinutes !== null && task.minChunkMinutes > task.durationMinutes) {
      ctx.addIssue({ code: 'custom', message: 'a chunk cannot be longer than the whole task', path: ['minChunkMinutes'] });
    }
  });

export const HouseholdSystemSchema = z.strictObject({
  id: Id,
  name: NonBlank(120),
  description: z.string().max(500),
  categoryId: Id,
  ...systemFacetFields,
  provenance: ProvenanceSchema,
  scope: Scope,
});

export const MealPlanEntrySchema = z.strictObject({
  id: Id,
  date: LocalDateSchema,
  title: NonBlank(200),
  categoryId: Id,
  ...mealFacetFields,
  provenance: ProvenanceSchema,
  scope: Scope,
});

export const OnboardingSchema = z.strictObject({
  goalIds: z.array(Id).max(50),
  strengthIds: z.array(Id).max(50),
  struggleIds: z.array(Id).max(50),
  lastStep: z.enum(ONBOARDING_STEPS).nullable(),
  completedAt: InstantSchema.nullable(),
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});

export const ONE_MOVE_TARGET_TYPES = ['catalog', 'task', 'needsMe', 'event', 'system', 'responsibility'] as const;
export type OneMoveTargetType = (typeof ONE_MOVE_TARGET_TYPES)[number];

export const OneMoveRecordSchema = z
  .strictObject({
    id: Id,
    forDate: LocalDateSchema,
    /** The catalog move offered; null when nothing was offered because the day was already overloaded. */
    targetId: Id.nullable(),
    /**
     * Which list `targetId` looks up in — the hardcoded demo catalog, or a real row. The kinds beyond
     * task and Needs Me are registered through the typed-reference convention (ADR-005/021): the
     * selection engine does not choose them yet, but the stored shape can hold one without a rewrite.
     */
    targetType: z.enum(ONE_MOVE_TARGET_TYPES),
    status: z.enum(['selected', 'completed', 'withheld']),
    decidedAt: InstantSchema,
    completedAt: InstantSchema.nullable(),
    provenance: ProvenanceSchema,
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
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});

/** Structured Talk It Out state only: which topic, and which scripted answer to which question. Never her words. */
export const DiscoveryRecordSchema = z.strictObject({
  id: Id,
  topicId: Id,
  answers: z.array(z.strictObject({ questionId: Id, optionId: Id })).max(2),
  provenance: ProvenanceSchema,
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
export const MIGRATION_EVIDENCE_REASONS = ['LEGACY_REAL_CATALOG_ONE_MOVE'] as const;
export type MigrationEvidenceReason = (typeof MIGRATION_EVIDENCE_REASONS)[number];

export const MigrationEvidenceSchema = z.strictObject({
  /** Stable and derived from the original record, so re-running a migration cannot duplicate it. */
  id: Id,
  kind: z.literal('one-move'),
  reason: z.enum(MIGRATION_EVIDENCE_REASONS),
  /** Which stored shape the record came out of. */
  sourceSchemaVersion: z.number().int().min(1).max(1000),
  original: z.strictObject({
    oneMoveId: Id,
    forDate: LocalDateSchema,
    targetId: Id.nullable(),
    targetType: z.string().max(64),
    status: z.string().max(32),
    decidedAt: InstantSchema,
    completedAt: InstantSchema.nullable(),
    scope: z.string().max(32),
  }),
});

/**
 * Migration LINEAGE (ADR-004): which local migration classified which rows, and
 * by which rule. It is a different fact from a row's semantic producer — a task
 * proven to be hers stays `user-action` however many times it is migrated — so it
 * is recorded here and never on the row. Local-only: never synced, never claimed.
 *
 * Deliberately not `migrationEvidence`, which records what a migration could NOT
 * carry forward truthfully; a provenance backfill carries everything forward.
 */
export const BACKFILL_COLLECTIONS = ['categories', 'events', 'tasks', 'systems', 'meals', 'needsMe', 'oneMoves', 'discovery', 'onboarding'] as const;
export type BackfillCollection = (typeof BACKFILL_COLLECTIONS)[number];

export const MigrationLineageSchema = z.strictObject({
  /** Stable, so re-running a migration cannot add a second entry. */
  id: Id,
  kind: z.literal('provenance-backfill'),
  fromSchemaVersion: z.number().int().min(1).max(1000),
  toSchemaVersion: z.number().int().min(1).max(1000),
  tallies: z
    .array(
      z.strictObject({
        collection: z.enum(BACKFILL_COLLECTIONS),
        producer: z.enum(PROVENANCE_SOURCES),
        /** Why this producer, in a token: `created-at-stamped-by-capture`, `starter-set`, `unproven-legacy`, ... */
        rule: OpenCode,
        count: z.number().int().min(0).max(100_000),
      })
    )
    .max(100),
});

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
  /** Records a local migration could not carry forward truthfully. Usually empty. */
  migrationEvidence: z.array(MigrationEvidenceSchema).max(4000),
  /** Which migrations classified which rows (ADR-004). Local-only. */
  migrationLineage: z.array(MigrationLineageSchema).max(50),
  /** Evidence that something arrived (B4-FE01-002). Metadata and a digest — never its content. */
  sourceArtifacts: z.array(SourceArtifactSchema).max(5000),
  /** The identity of objects in external systems (B4-FE01-004). Never a credential. */
  externalReferences: z.array(ExternalReferenceSchema).max(10_000),
  /** Her Keys' typed readings of source artifacts, awaiting her decision (B4-FE01-003). Outside canonical state on purpose. */
  interpretations: z.array(InterpretationSchema).max(5000),
  /** What she actually does — append-only meaningful outcomes (B4-FE01-006). */
  observations: z.array(BehaviorObservationSchema).max(MAX_LOCAL_OBSERVATIONS),
  /** What she has said Her Keys may do without asking (B4-FE01-007). A permission store: owner-only. */
  authorities: z.array(AutomationAuthoritySchema).max(500),
  /** What Her Keys would like to do, and its decisions, executions and outcomes (B4-FE01-009..012). Append-only. */
  intents: z.array(ActionIntentSchema).max(5000),
  decisions: z.array(IntentDecisionSchema).max(5000),
  /** Written only by the trusted server boundary; a client only ever pulls these. */
  executions: z.array(ActionExecutionSchema).max(5000),
  outcomes: z.array(ActionOutcomeSchema).max(10_000),
  /** People in her life who are not accounts (B4-FE01-013). Not household members. */
  people: z.array(HouseholdPersonSchema).max(200),
  responsibilities: z.array(ResponsibilitySchema).max(5000),
  dependencies: z.array(DependencySchema).max(10_000),
  recurrences: z.array(RecurrenceRuleSchema).max(2000),
  goals: z.array(GoalSchema).max(500),
  systemSteps: z.array(SystemStepSchema).max(5000),
  capacity: CapacityProfileSchema.nullable(),
  patterns: z.array(PatternSchema).max(2000),
  evidenceLinks: z.array(EvidenceLinkSchema).max(20_000),
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
export type MigrationEvidence = z.infer<typeof MigrationEvidenceSchema>;
export type MigrationLineage = z.infer<typeof MigrationLineageSchema>;
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
  requireUnique('source artifact id', state.sourceArtifacts.map((artifact) => artifact.id));
  // The same digest for the same account is the same artifact: duplicate detection is a stored invariant.
  requireUnique('source artifact digest', state.sourceArtifacts.flatMap((artifact) => (artifact.contentDigest === null ? [] : [artifact.contentDigest])));
  requireUnique('external reference id', state.externalReferences.map((ref) => ref.id));
  // Identity is (provider, account, object): this is what makes a returning object recognisable, so two rows may never share it.
  requireUnique(
    'external identity',
    state.externalReferences.map((ref) => `${ref.provider}|${ref.externalAccount}|${ref.externalObjectId}`)
  );
  requireUnique('migration lineage id', state.migrationLineage.map((entry) => entry.id));
  requireUnique('interpretation id', state.interpretations.map((row) => row.id));
  requireUnique('observation id', state.observations.map((row) => row.id));
  requireUnique('authority id', state.authorities.map((row) => row.id));
  requireUnique('intent id', state.intents.map((row) => row.id));
  requireUnique('decision id', state.decisions.map((row) => row.id));
  requireUnique('execution id', state.executions.map((row) => row.id));
  requireUnique('outcome id', state.outcomes.map((row) => row.id));
  requireUnique('person id', state.people.map((row) => row.id));
  requireUnique('responsibility id', state.responsibilities.map((row) => row.id));
  requireUnique('dependency id', state.dependencies.map((row) => row.id));
  requireUnique('recurrence id', state.recurrences.map((row) => row.id));
  requireUnique('goal id', state.goals.map((row) => row.id));
  requireUnique('system step id', state.systemSteps.map((row) => row.id));
  requireUnique('pattern id', state.patterns.map((row) => row.id));
  requireUnique('evidence link id', state.evidenceLinks.map((row) => row.id));

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
    if (record.targetType === 'event' || record.targetType === 'system' || record.targetType === 'responsibility') {
      if (!refExists(state, { kind: record.targetType, id: record.targetId })) {
        problems.push(`One Move ${record.id} references missing ${record.targetType} ${record.targetId}`);
      }
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

  // ---- lineage: every provenance that names a source artifact must name a real one.
  const artifactIds = new Set(state.sourceArtifacts.map((artifact) => artifact.id));
  const checkArtifact = (label: string, row: { id: string; provenance: { artifactId: string | null } }) => {
    if (row.provenance.artifactId !== null && !artifactIds.has(row.provenance.artifactId)) {
      problems.push(`${label} ${row.id} names missing source artifact ${row.provenance.artifactId}`);
    }
  };
  for (const row of state.categories) checkArtifact('category', row);
  for (const row of state.events) checkArtifact('event', row);
  for (const row of state.tasks) checkArtifact('task', row);
  for (const row of state.systems) checkArtifact('system', row);
  for (const row of state.meals) checkArtifact('meal', row);
  for (const row of state.needsMe) checkArtifact('needs-me', row);
  for (const row of state.oneMoves) checkArtifact('One Move', row);
  for (const row of state.externalReferences) checkArtifact('external reference', row);
  if (state.discovery !== null) checkArtifact('discovery', state.discovery);
  checkArtifact('onboarding', { id: 'onboarding', provenance: state.onboarding.provenance });

  for (const row of state.interpretations) checkArtifact('interpretation', row);
  for (const row of state.observations) checkArtifact('observation', row);
  for (const row of state.authorities) checkArtifact('authority', row);
  for (const row of state.intents) checkArtifact('intent', row);
  for (const row of state.decisions) checkArtifact('decision', row);
  for (const row of state.executions) checkArtifact('execution', row);
  for (const row of state.outcomes) checkArtifact('outcome', row);
  for (const row of state.people) checkArtifact('person', row);
  for (const row of state.responsibilities) checkArtifact('responsibility', row);
  for (const row of state.dependencies) checkArtifact('dependency', row);
  for (const row of state.recurrences) checkArtifact('recurrence', row);
  for (const row of state.goals) checkArtifact('goal', row);
  for (const row of state.systemSteps) checkArtifact('system step', row);
  for (const row of state.patterns) checkArtifact('pattern', row);
  for (const row of state.evidenceLinks) checkArtifact('evidence link', row);
  if (state.capacity !== null) checkArtifact('capacity', { id: 'capacity', provenance: state.capacity.provenance });

  const referenceIds = new Set(state.externalReferences.map((ref) => ref.id));

  // ---- typed references resolve, by kind.
  const requireRef = (label: string, id: string, ref: { kind: string; id: string }) => {
    if (!refExists(state, ref as never)) problems.push(`${label} ${id} references missing ${ref.kind} ${ref.id}`);
  };
  const requireIn = (label: string, id: string, what: string, set: Set<string>, value: string | null) => {
    if (value !== null && !set.has(value)) problems.push(`${label} ${id} references missing ${what} ${value}`);
  };

  const interpretationIds = new Set(state.interpretations.map((row) => row.id));
  for (const reading of state.interpretations) {
    requireIn('interpretation', reading.id, 'source artifact', artifactIds, reading.artifactId);
    requireIn('interpretation', reading.id, 'interpretation', interpretationIds, reading.supersedesId);
    if (reading.supersedesId === reading.id) problems.push(`interpretation ${reading.id} supersedes itself`);
    if (reading.acceptedRef !== null) requireRef('interpretation', reading.id, reading.acceptedRef);
    if (reading.subjectMemberId !== null && !childIds.has(reading.subjectMemberId)) {
      problems.push(`interpretation ${reading.id} references missing child ${reading.subjectMemberId}`);
    }
  }

  // A One Move that was CLEARED is physically removed locally, while the cloud keeps it as status `cleared`, so the
  // observation that it happened is allowed to outlive its row. Every other subject must still exist.
  for (const observation of state.observations) {
    if (observation.about.kind !== 'oneMove') requireRef('observation', observation.id, observation.about);
  }

  const authorityIds = new Set(state.authorities.map((row) => row.id));
  for (const authority of state.authorities) {
    requireIn('authority', authority.id, 'category', categoryIds, authority.categoryId);
    if (authority.subjectMemberId !== null && !childIds.has(authority.subjectMemberId)) {
      problems.push(`authority ${authority.id} references missing child ${authority.subjectMemberId}`);
    }
  }

  const intentIds = new Set(state.intents.map((row) => row.id));
  for (const intent of state.intents) if (intent.about !== null) requireRef('intent', intent.id, intent.about);

  const decisionIds = new Set(state.decisions.map((row) => row.id));
  const decidedIntents = new Map<string, { answered: number; withdrawn: number }>();
  for (const decision of state.decisions) {
    requireIn('decision', decision.id, 'intent', intentIds, decision.intentId);
    requireIn('decision', decision.id, 'authority', authorityIds, decision.authorityId);
    const tally = decidedIntents.get(decision.intentId) ?? { answered: 0, withdrawn: 0 };
    if (decision.decision === 'withdrawn') tally.withdrawn += 1;
    else tally.answered += 1;
    decidedIntents.set(decision.intentId, tally);
  }
  // One answer per intent — two devices approving one intent collide here, as they do in the cloud.
  for (const [intentId, tally] of decidedIntents) {
    if (tally.answered > 1) problems.push(`intent ${intentId} has more than one decision`);
    if (tally.withdrawn > 1) problems.push(`intent ${intentId} was withdrawn more than once`);
    if (tally.withdrawn > 0 && !state.decisions.some((d) => d.intentId === intentId && d.decision === 'approved')) {
      problems.push(`intent ${intentId} was withdrawn without ever being approved`);
    }
  }

  const executionIds = new Set(state.executions.map((row) => row.id));
  const attempts = new Set<string>();
  for (const execution of state.executions) {
    requireIn('execution', execution.id, 'intent', intentIds, execution.intentId);
    requireIn('execution', execution.id, 'decision', decisionIds, execution.decisionId);
    requireIn('execution', execution.id, 'authority', authorityIds, execution.authorityId);
    requireIn('execution', execution.id, 'external reference', referenceIds, execution.externalReferenceId);
    requireIn('execution', execution.id, 'execution', executionIds, execution.compensatesExecutionId);
    const key = `${execution.intentId}#${execution.attempt}`;
    if (attempts.has(key)) problems.push(`intent ${execution.intentId} has two attempt ${execution.attempt}`);
    attempts.add(key);
  }
  for (const outcome of state.outcomes) requireIn('outcome', outcome.id, 'execution', executionIds, outcome.executionId);

  const personIds = new Set(state.people.map((row) => row.id));
  const activeAbout = new Set<string>();
  for (const responsibility of state.responsibilities) {
    requireRef('responsibility', responsibility.id, responsibility.about);
    requireIn('responsibility', responsibility.id, 'person', personIds, responsibility.responsiblePersonId);
    if (responsibility.responsibleChildId !== null && !childIds.has(responsibility.responsibleChildId)) {
      problems.push(`responsibility ${responsibility.id} references missing child ${responsibility.responsibleChildId}`);
    }
    requireIn('responsibility', responsibility.id, 'responsibility', new Set(state.responsibilities.map((r) => r.id)), responsibility.previousResponsibilityId);
    if (isActiveResponsibility(responsibility)) {
      const key = `${responsibility.about.kind}:${responsibility.about.id}`;
      if (activeAbout.has(key)) problems.push(`${key} has more than one live responsibility`);
      activeAbout.add(key);
    }
  }

  const liveEdges = new Set<string>();
  for (const dependency of state.dependencies) {
    requireRef('dependency', dependency.id, dependency.from);
    requireRef('dependency', dependency.id, dependency.to);
    if (dependency.status === 'active') {
      const key = `${dependency.relation}|${dependency.from.kind}:${dependency.from.id}|${dependency.to.kind}:${dependency.to.id}`;
      if (liveEdges.has(key)) problems.push(`dependency ${key} is recorded twice`);
      liveEdges.add(key);
    }
  }
  const cycle = findDependencyCycle(state.dependencies);
  if (cycle !== null) problems.push(`dependencies form a cycle: ${cycle.map((ref) => `${ref.kind}:${ref.id}`).join(' -> ')}`);

  const liveRecurrence = new Set<string>();
  for (const rule of state.recurrences) {
    requireRef('recurrence', rule.id, rule.about);
    if (rule.status === 'active') {
      const key = `${rule.about.kind}:${rule.about.id}`;
      if (liveRecurrence.has(key)) problems.push(`${key} has more than one active recurrence rule`);
      liveRecurrence.add(key);
    }
  }

  for (const goal of state.goals) requireIn('goal', goal.id, 'category', categoryIds, goal.categoryId);

  const systemIds = new Set(state.systems.map((system) => system.id));
  const stepPositions = new Set<string>();
  for (const step of state.systemSteps) {
    requireIn('system step', step.id, 'system', systemIds, step.systemId);
    const key = `${step.systemId}#${step.position}`;
    if (stepPositions.has(key)) problems.push(`system ${step.systemId} has two steps at position ${step.position}`);
    stepPositions.add(key);
  }

  for (const pattern of state.patterns) {
    if (pattern.about !== null) requireRef('pattern', pattern.id, pattern.about);
    requireIn('pattern', pattern.id, 'category', categoryIds, pattern.categoryId);
  }

  const patternIds = new Set(state.patterns.map((row) => row.id));
  for (const link of state.evidenceLinks) {
    if (link.for.kind !== 'oneMove') requireRef('evidence link', link.id, link.for);
    requireRef('evidence link', link.id, link.support);
    void patternIds;
  }

  // ---- external identity.
  for (const ref of state.externalReferences) {
    if (ref.linked !== null && !refExists(state, ref.linked)) {
      problems.push(`external reference ${ref.id} is linked to missing ${ref.linked.kind} ${ref.linked.id}`);
    }
  }

  return problems;
}
