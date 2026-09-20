import { z } from 'zod';
import { Id, InstantSchema, LocalDateSchema, NonBlank } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';
import { ContentRefSchema, refOf, refKey, type TypedRef } from './typedRef';

/**
 * STRUCTURE — dependencies, recurrence, goals, system steps and capacity.
 *
 * The four relations every future feature would otherwise reinvent, each defined
 * exactly once so that scheduling, decomposition, routines and capacity share one
 * vocabulary instead of five near-misses.
 */

// ------------------------------------------------------------- dependency ---
/**
 * B4-FE01-017 (ADR-016). ONE typed edge, three relations:
 *
 *   requires        A cannot be done until B is        (a form before the trip)
 *   part_of         A is a step of B                   (decomposition, packing lists)
 *   alternative_to  A is a lighter way to satisfy B    (the low-energy version)
 *
 * Endpoints are typed references, so a dependency crosses domains — a bill can
 * require a payday — without a free-form polymorphic pointer.
 */
export const DEPENDENCY_RELATIONS = ['requires', 'part_of', 'alternative_to'] as const;
export type DependencyRelation = (typeof DEPENDENCY_RELATIONS)[number];

export const DependencySchema = z
  .strictObject({
    id: Id,
    relation: z.enum(DEPENDENCY_RELATIONS),
    from: ContentRefSchema,
    to: ContentRefSchema,
    status: z.enum(['active', 'removed']),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((d, ctx) => {
    if (d.from.kind === d.to.kind && d.from.id === d.to.id) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'a thing cannot depend on itself' });
    }
  });
export type Dependency = z.infer<typeof DependencySchema>;

/**
 * A cycle among live `requires` and `part_of` edges, as the chain of references that
 * closes it — or null. A cycle is a scheduling deadlock ("A needs B needs A") and a
 * decomposition that contains itself, so state refuses one. `alternative_to` is
 * symmetric in spirit and is not part of the ordering.
 */
export function findDependencyCycle(dependencies: readonly Pick<Dependency, 'relation' | 'from' | 'to' | 'status'>[]): TypedRef[] | null {
  const edges = new Map<string, TypedRef[]>();
  for (const d of dependencies) {
    if (d.status !== 'active' || d.relation === 'alternative_to') continue;
    const list = edges.get(refKey(d.from)) ?? [];
    list.push(d.to);
    edges.set(refKey(d.from), list);
  }

  const done = new Set<string>();
  const onPath: TypedRef[] = [];
  const onPathKeys = new Set<string>();

  const visit = (ref: TypedRef): TypedRef[] | null => {
    const key = refKey(ref);
    if (onPathKeys.has(key)) return [...onPath.slice(onPath.findIndex((r) => refKey(r) === key)), ref];
    if (done.has(key)) return null;
    onPath.push(ref);
    onPathKeys.add(key);
    for (const next of edges.get(key) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    onPath.pop();
    onPathKeys.delete(key);
    done.add(key);
    return null;
  };

  for (const d of dependencies) {
    if (d.status !== 'active' || d.relation === 'alternative_to') continue;
    const cycle = visit(d.from);
    if (cycle) return cycle;
  }
  return null;
}

// ------------------------------------------------------------- recurrence ---
/**
 * B4-FE01-018 (ADR-017). ONE recurrence and trigger convention for tasks, events,
 * routines and meals, so each does not grow its own.
 *
 * What is stored is the RULE. What is derived, never stored, is "the next
 * occurrence": a stored next-run is a second copy of a fact that goes stale. An
 * exception to the rule — this Tuesday skipped — is a `skipped` behavior
 * observation with that day on it, so it is history rather than an edit.
 */
export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
/** `schedule` follows the calendar; `after_completion` restarts the clock when it is done; `manual` runs only when asked. */
export const RECURRENCE_TRIGGERS = ['schedule', 'after_completion', 'manual'] as const;
export const RECURRENCE_SUBJECT_KINDS = ['task', 'event', 'system', 'meal'] as const;

export const RecurrenceRuleSchema = z
  .strictObject({
    id: Id,
    about: refOf(RECURRENCE_SUBJECT_KINDS),
    trigger: z.enum(RECURRENCE_TRIGGERS),
    frequency: z.enum(RECURRENCE_FREQUENCIES).nullable(),
    interval: z.number().int().min(1).max(366),
    /** 0 = Sunday … 6 = Saturday. Weekly only. */
    byWeekday: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
    /** 1–31. Monthly only. */
    byMonthDay: z.number().int().min(1).max(31).nullable(),
    anchorDate: LocalDateSchema,
    timeOfDayMinutes: z.number().int().min(0).max(1439).nullable(),
    timezone: z.string().min(1).max(64),
    endsOn: LocalDateSchema.nullable(),
    occurrenceCount: z.number().int().min(1).max(10_000).nullable(),
    status: z.enum(['active', 'paused', 'ended']),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((rule, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (rule.trigger === 'manual' ? rule.frequency !== null : rule.frequency === null) {
      issue('frequency', 'a manual rule has no frequency; every other rule has one');
    }
    if (rule.byWeekday !== null) {
      if (rule.frequency !== 'weekly') issue('byWeekday', 'weekdays belong to a weekly rule');
      if (new Set(rule.byWeekday).size !== rule.byWeekday.length) issue('byWeekday', 'a weekday appears once');
    }
    if (rule.byMonthDay !== null && rule.frequency !== 'monthly') issue('byMonthDay', 'a day of the month belongs to a monthly rule');
    if (rule.endsOn !== null && rule.occurrenceCount !== null) issue('occurrenceCount', 'a rule ends by date or by count, not both');
    if (rule.endsOn !== null && rule.endsOn < rule.anchorDate) issue('endsOn', 'a rule cannot end before it begins');
  });
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

// ------------------------------------------------------------------- goal ---
/**
 * B4-FE01-021. A goal used to be a catalog string in an array with no progress, no
 * status and no relation to any task. As an entity it can be decomposed into steps
 * (`part_of`), tracked, achieved or let go — and a goal she chose during onboarding
 * can be linked to it through `catalogGoalId`.
 *
 * Progress is derived from the steps, never stored on the goal.
 */
export const GoalSchema = z.strictObject({
  id: Id,
  title: NonBlank(200),
  status: z.enum(['active', 'achieved', 'paused', 'abandoned']),
  targetDate: LocalDateSchema.nullable(),
  categoryId: Id.nullable(),
  /** The onboarding goal option this came from, when it did. */
  catalogGoalId: Id.nullable(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type Goal = z.infer<typeof GoalSchema>;

// ------------------------------------------------------------ system step ---
/**
 * B4-FE01-022. A household system used to be a label with a description. A step is
 * one part of how it runs, in order, with an honest effort where one is known.
 */
export const SystemStepSchema = z.strictObject({
  id: Id,
  systemId: Id,
  position: z.number().int().min(0).max(999),
  title: NonBlank(200),
  effortMinutes: z.number().int().min(0).max(1440).nullable(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type SystemStep = z.infer<typeof SystemStepSchema>;

// --------------------------------------------------------------- capacity ---
/**
 * B4-FE01-016 (ADR-025). Per-household capacity settings. The day window and the
 * transition buffer were module constants, identical for every household; here they
 * are data. Every field is an OVERRIDE — null means "use the product default" — so
 * the constants stay the defaults and nothing has to be invented to fill a row.
 */
export const CapacityProfileSchema = z
  .strictObject({
    dayStartMinutes: z.number().int().min(0).max(1439).nullable(),
    dayEndMinutes: z.number().int().min(1).max(1440).nullable(),
    transitionBufferMinutes: z.number().int().min(0).max(240).nullable(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((c, ctx) => {
    if (c.dayStartMinutes !== null && c.dayEndMinutes !== null && c.dayStartMinutes >= c.dayEndMinutes) {
      ctx.addIssue({ code: 'custom', path: ['dayEndMinutes'], message: 'the day ends after it starts' });
    }
  });
export type CapacityProfile = z.infer<typeof CapacityProfileSchema>;
