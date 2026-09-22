import { z } from 'zod';
import { Id } from '../schemaPrimitives';

/**
 * THE TYPED REFERENCE CONVENTION — B4-FE01-027 (ADR-005).
 *
 * Every relation that points at "one of several kinds of thing" uses this shape
 * and no other: a `kind` discriminator plus the local id of a row of that kind.
 * It replaces the unsafe polymorphic reference — a bare `targetId` whose meaning
 * depends on a second field nobody enforces — that produced
 * `MIGRATION_EVIDENCE_REASONS = ['LEGACY_REAL_CATALOG_ONE_MOVE']`.
 *
 * In the cloud the same convention becomes `<prefix>_type` plus ONE nullable typed
 * foreign-key column per kind, so every reference is a real, enforced foreign key
 * and a reference can never cross households. This registry is the single place
 * that lists the kinds, which is what stops "add a kind" costing eight hand edits
 * per table.
 *
 * Deliberately NOT here: a universal object, a generic record, or a metadata bag.
 * A task is still a task. This only says which task.
 */

export const TYPED_REF_KINDS = [
  'task',
  'event',
  'needsMe',
  'system',
  'meal',
  'goal',
  'responsibility',
  'oneMove',
  'observation',
  'pattern',
  'intent',
  'person',
  'interpretation',
  'opportunity',
] as const;
export type TypedRefKind = (typeof TYPED_REF_KINDS)[number];

/** The domain content a commitment, obligation or routine can be about. */
export const CONTENT_REF_KINDS = ['task', 'event', 'needsMe', 'system', 'meal', 'goal'] as const;
export type ContentRefKind = (typeof CONTENT_REF_KINDS)[number];

/** Which `AppState` collection holds each kind. */
export const KIND_COLLECTION: Record<TypedRefKind, string> = {
  task: 'tasks',
  event: 'events',
  needsMe: 'needsMe',
  system: 'systems',
  meal: 'meals',
  goal: 'goals',
  responsibility: 'responsibilities',
  oneMove: 'oneMoves',
  observation: 'observations',
  pattern: 'patterns',
  intent: 'intents',
  person: 'people',
  interpretation: 'interpretations',
  opportunity: 'careerOpportunities',
};

/** The cloud table and typed-FK column suffix for each kind. Mirrored by the migration's helper. */
export const KIND_CLOUD: Record<TypedRefKind, { table: string; column: string }> = {
  task: { table: 'tasks', column: 'task_id' },
  event: { table: 'events', column: 'event_id' },
  needsMe: { table: 'needs_me_items', column: 'needs_me_id' },
  system: { table: 'household_systems', column: 'system_id' },
  meal: { table: 'meal_plan_entries', column: 'meal_id' },
  goal: { table: 'goals', column: 'goal_id' },
  responsibility: { table: 'responsibilities', column: 'responsibility_id' },
  oneMove: { table: 'one_move_records', column: 'one_move_id' },
  observation: { table: 'behavior_observations', column: 'observation_id' },
  pattern: { table: 'patterns', column: 'pattern_id' },
  intent: { table: 'action_intents', column: 'intent_id' },
  person: { table: 'household_people', column: 'person_id' },
  interpretation: { table: 'interpretations', column: 'interpretation_id' },
  opportunity: { table: 'career_opportunities', column: 'opportunity_id' },
};

export interface TypedRef<K extends TypedRefKind = TypedRefKind> {
  kind: K;
  id: string;
}

/** A schema for a reference restricted to the given kinds. */
export function refOf<const K extends readonly [TypedRefKind, ...TypedRefKind[]]>(kinds: K) {
  return z.strictObject({ kind: z.enum(kinds), id: Id });
}

export const ContentRefSchema = refOf(CONTENT_REF_KINDS);

export const refKey = (ref: TypedRef): string => `${ref.kind}:${ref.id}`;

export const sameRef = (a: TypedRef | null, b: TypedRef | null): boolean =>
  a === null || b === null ? a === b : a.kind === b.kind && a.id === b.id;

/** The structural slice of state a reference can be resolved against. */
type RefResolvable = { [collection: string]: unknown };

/** Whether the referenced row exists. A kind whose collection has not been added to state resolves to false. */
export function refExists(state: object, ref: TypedRef): boolean {
  const list = (state as RefResolvable)[KIND_COLLECTION[ref.kind]];
  return Array.isArray(list) && list.some((row) => (row as { id?: unknown }).id === ref.id);
}
