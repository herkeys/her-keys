import type { AppState } from '../state';
import { CLOUD_TABLE, mappingKey, type MappedKind, type Mapping, type SyncEntityKind, type SyncNamespace } from './syncTypes';

/**
 * LOCAL ROW <-> CLOUD ROW.
 *
 * The only place that knows both shapes. It translates; it never reinterprets.
 * Nothing here promotes a confidence, turns an inference into a stated fact,
 * re-runs onboarding reasoning or changes a provenance — a pulled row arrives
 * meaning exactly what it meant when it was pushed (B4-INGESTION-LOCK).
 *
 * Server-owned fields are never produced on the way out: `id`, `revision`,
 * `created_at`, `updated_at`, `subject_member_type`, and One Move's
 * `logical_day` and `timezone_at_decision`. The column grants would refuse them,
 * and sending them anyway would be asking to be refused.
 */

export interface ProjectionContext {
  householdId: string;
  profileId: string;
  namespace: SyncNamespace;
}

/** Resolve a local reference to the cloud uuid the server expects (SD4-007). */
function cloudRef(ctx: ProjectionContext, kind: MappedKind, localId: string | null): string | null {
  if (localId === null) return null;
  return ctx.namespace.mappings[mappingKey(kind, localId)]?.cloudId ?? null;
}

/** The child member's cloud uuid. Children arrive through claim, never through sync. */
function childRef(ctx: ProjectionContext, localId: string | null): string | null {
  if (localId === null) return null;
  return ctx.namespace.mappings[mappingKey('member', localId)]?.cloudId ?? null;
}

export class UnresolvedReferenceError extends Error {
  // Written out rather than declared as parameter properties: the test runner
  // strips types without transforming, and a parameter property is a transform.
  kind: SyncEntityKind;
  localId: string;
  missing: string;

  constructor(kind: SyncEntityKind, localId: string, missing: string) {
    super(`${kind} ${localId} needs ${missing}, which has no cloud mapping yet`);
    this.name = 'UnresolvedReferenceError';
    this.kind = kind;
    this.localId = localId;
    this.missing = missing;
  }
}

/**
 * Build the cloud row for one local entity.
 *
 * Throws `UnresolvedReferenceError` when a reference has no mapping yet. That is
 * a scheduling fact, not a failure: the dependency is queued first and this row
 * goes out on the next pass. The push engine turns a reference that can NEVER
 * resolve into durable evidence instead.
 */
export function toCloudRow(state: AppState, ctx: ProjectionContext, kind: SyncEntityKind, localId: string): Record<string, unknown> {
  const base = { household_id: ctx.householdId, local_id: localId };

  switch (kind) {
    case 'category': {
      const row = require_(state.categories.find((c) => c.id === localId), kind, localId);
      return {
        ...base,
        owner_profile_id: ownerFor(row.scope, ctx.profileId),
        name: row.name,
        system_role: row.systemRole,
        status: row.status,
        sort_order: row.sortOrder,
        scope: row.scope,
      };
    }

    case 'task': {
      const row = require_(state.tasks.find((t) => t.id === localId), kind, localId);
      const category = cloudRef(ctx, 'category', row.categoryId);
      if (category === null) throw new UnresolvedReferenceError(kind, localId, `category ${row.categoryId}`);
      const subject = childRef(ctx, row.subjectMemberId);
      if (row.subjectMemberId !== null && subject === null) {
        throw new UnresolvedReferenceError(kind, localId, `child member ${row.subjectMemberId}`);
      }
      return {
        ...base,
        owner_profile_id: ownerFor(row.scope, ctx.profileId),
        title: row.title,
        category_id: category,
        subject_member_id: subject,
        duration_minutes: row.durationMinutes,
        commitment: row.commitment,
        due_date: row.dueDate,
        plan_kind: row.plan.kind,
        planned_date: row.plan.kind === 'day' ? row.plan.date : null,
        planned_starts_at: row.plan.kind === 'timed' ? row.plan.startsAt : null,
        notes: row.notes,
        status: row.status,
        completed_at: row.completedAt,
        scope: row.scope,
        origin_created_at: row.createdAt,
        origin_updated_at: row.updatedAt,
      };
    }

    case 'event': {
      const row = require_(state.events.find((e) => e.id === localId), kind, localId);
      const category = cloudRef(ctx, 'category', row.categoryId);
      if (category === null) throw new UnresolvedReferenceError(kind, localId, `category ${row.categoryId}`);
      const subject = childRef(ctx, row.subjectMemberId);
      if (row.subjectMemberId !== null && subject === null) {
        throw new UnresolvedReferenceError(kind, localId, `child member ${row.subjectMemberId}`);
      }
      return {
        ...base,
        owner_profile_id: ownerFor(row.scope, ctx.profileId),
        title: row.title,
        category_id: category,
        subject_member_id: subject,
        starts_at: row.startsAt,
        ends_at: row.endsAt,
        location: row.location,
        notes: row.notes,
        commitment: row.commitment,
        status: row.status,
        travel_minutes_before: row.travelMinutesBefore,
        travel_minutes_after: row.travelMinutesAfter,
        preparation_minutes: row.preparationMinutes,
        scope: row.scope,
        origin_created_at: row.createdAt,
        origin_updated_at: row.updatedAt,
      };
    }

    case 'system': {
      const row = require_(state.systems.find((s) => s.id === localId), kind, localId);
      const category = cloudRef(ctx, 'category', row.categoryId);
      if (category === null) throw new UnresolvedReferenceError(kind, localId, `category ${row.categoryId}`);
      return {
        ...base,
        owner_profile_id: ownerFor(row.scope, ctx.profileId),
        name: row.name,
        description: row.description,
        category_id: category,
        scope: row.scope,
      };
    }

    case 'meal': {
      const row = require_(state.meals.find((m) => m.id === localId), kind, localId);
      const category = cloudRef(ctx, 'category', row.categoryId);
      if (category === null) throw new UnresolvedReferenceError(kind, localId, `category ${row.categoryId}`);
      return {
        ...base,
        owner_profile_id: ownerFor(row.scope, ctx.profileId),
        title: row.title,
        meal_date: row.date,
        category_id: category,
        scope: row.scope,
      };
    }

    case 'needsMe': {
      const row = require_(state.needsMe.find((n) => n.id === localId), kind, localId);
      const category = cloudRef(ctx, 'category', row.categoryId);
      if (row.categoryId !== null && category === null) {
        throw new UnresolvedReferenceError(kind, localId, `category ${row.categoryId}`);
      }
      return {
        ...base,
        profile_id: ctx.profileId,
        title: row.title,
        status: row.status,
        due_date: row.dueDate,
        category_id: category,
        scope: row.scope,
        origin_created_at: row.createdAt,
      };
    }

    case 'oneMove': {
      const row = require_(state.oneMoves.find((o) => o.id === localId), kind, localId);
      const targeted = row.status === 'selected' || row.status === 'completed';
      let target: string | null = null;
      if (targeted && row.targetId !== null) {
        target = cloudRef(ctx, row.targetType === 'task' ? 'task' : 'needsMe', row.targetId);
        if (target === null) throw new UnresolvedReferenceError(kind, localId, `${row.targetType} ${row.targetId}`);
      }
      // logical_day and timezone_at_decision are absent on purpose. They are
      // granted on neither INSERT nor UPDATE; the server derives today's value
      // and freezes it. Historical days can only ever enter through claim.
      return {
        ...base,
        profile_id: ctx.profileId,
        target_type: row.targetType === 'needsMe' ? 'needsMe' : 'task',
        target_task_id: row.targetType === 'task' ? target : null,
        target_needs_me_id: row.targetType === 'needsMe' ? target : null,
        status: row.status,
        decided_at: row.decidedAt,
        completed_at: row.completedAt,
      };
    }

    case 'discovery': {
      const row = state.discovery;
      // A cleared discovery is a tombstone, not an absence: a hard delete would
      // be invisible to a second device that is offline at the time (B4-P0-024).
      if (row === null || row.id !== localId) {
        return { ...base, profile_id: ctx.profileId, topic_id: 'unknown', scope: 'personal', deleted_at: nowIso() };
      }
      return { ...base, profile_id: ctx.profileId, topic_id: row.topicId, scope: row.scope, deleted_at: null };
    }

    case 'onboarding': {
      const row = state.onboarding;
      return {
        household_id: ctx.householdId,
        profile_id: ctx.profileId,
        goal_ids: row.goalIds,
        strength_ids: row.strengthIds,
        struggle_ids: row.struggleIds,
        last_step: row.lastStep,
        completed_at: row.completedAt,
        scope: row.scope,
      };
    }

    case 'action': {
      const row = require_(state.actions.find((a) => a.id === localId), kind, localId);
      // Only `protect_item` carries an explicit targetType; every other action
      // type names its target implicitly. The cloud CHECK accepts 'task' or
      // 'event', so the type is derived from the action rather than guessed.
      const targetType = actionTargetType(row);
      const target =
        row.targetId === null ? null : cloudRef(ctx, targetType === 'task' ? 'task' : 'event', row.targetId);
      if (row.targetId !== null && target === null) {
        throw new UnresolvedReferenceError(kind, localId, `${targetType} ${row.targetId}`);
      }
      return {
        ...base,
        actor_profile_id: ctx.profileId,
        action_type: row.type,
        approval: row.approval,
        target_type: row.targetId === null ? null : targetType,
        target_id: target,
        payload_version: 1,
        reason: reasonWithCloudRefs(ctx, localId, row.reason as Record<string, unknown>),
        before_state: 'before' in row ? row.before : null,
        after_state: 'after' in row ? row.after : null,
        source: 'her_keys_recommendation',
        scope: row.scope,
        logical_date: row.logicalDate,
        origin_created_at: row.createdAt,
      };
    }
  }
}

/** `owner_profile_id` is NOT NULL exactly for the three owner-private scopes (SD4-009). */
function ownerFor(scope: string, profileId: string): string | null {
  return scope === 'personal' || scope === 'professional' || scope === 'coparent-shared' ? profileId : null;
}

/**
 * The action ledger's reason manifest carries references, and SD4-007 says a
 * durable cloud reference is a cloud uuid — never a local id, which is
 * device-relative and ambiguous the moment a second device exists.
 */
/**
 * Which kind of row an action points at.
 *
 * `protect_item` states it; the others are fixed by their own semantics, and
 * naming them here is more honest than inferring from whichever collection
 * happens to hold the id today.
 */
function actionTargetType(action: { type: string; targetType?: 'task' | 'event' }): 'task' | 'event' {
  if (action.targetType) return action.targetType;
  return action.type === 'daily_load.move_event' || action.type === 'daily_load.keep_plan' ? 'event' : 'task';
}

/**
 * The action ledger's reason manifest carries references, and SD4-007 says a
 * durable cloud reference is a cloud uuid — never a local id, which is
 * device-relative and ambiguous the moment a second device exists.
 */
function reasonWithCloudRefs(
  ctx: ProjectionContext,
  localId: string,
  reason: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...reason };
  const remap: Array<[string, SyncEntityKind]> = [
    ['windowBeforeEventId', 'event'],
    ['windowAfterEventId', 'event'],
    ['recommendedTaskId', 'task'],
    ['consideredTaskId', 'task'],
  ];
  for (const [field, kind] of remap) {
    const value = out[field];
    if (typeof value !== 'string') continue;
    const mapped = cloudRef(ctx, kind, value);
    if (mapped === null) throw new UnresolvedReferenceError('action', localId, `${kind} ${value}`);
    out[field] = mapped;
  }
  return out;
}

function require_<T>(value: T | undefined, kind: SyncEntityKind, localId: string): T {
  if (value === undefined) {
    throw new UnresolvedReferenceError(kind, localId, `the local ${kind} itself, which is no longer in state`);
  }
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function tableFor(kind: SyncEntityKind): string {
  return CLOUD_TABLE[kind];
}

export function mappingFor(namespace: SyncNamespace, kind: MappedKind, localId: string): Mapping | null {
  return namespace.mappings[mappingKey(kind, localId)] ?? null;
}
