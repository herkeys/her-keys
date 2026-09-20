import type { AppState } from '../state';
import type { SyncEntityKind } from './syncTypes';

/**
 * CLOUD ROW -> LOCAL ROW.
 *
 * The inbound half of the projection. It transports state and does not
 * reinterpret it: no confidence is promoted, no inference becomes a stated
 * fact, no onboarding reasoning is re-run and no provenance changes because a
 * row arrived over the network (B4-INGESTION-LOCK). A pulled row means exactly
 * what it meant when it was pushed.
 *
 * Scope and subject travel intact. A child-scoped row keeps its scope and its
 * subject; nothing is stripped to get it past a local check, because a
 * scope-integrity failure is a real problem and hiding it would make it worse.
 */

/** Cloud uuid -> the local id this device uses for it. */
export type LocalIdResolver = (cloudId: string | null | undefined) => string | null;

function upsert<T extends { id: string }>(rows: readonly T[], row: T): T[] {
  const index = rows.findIndex((existing) => existing.id === row.id);
  if (index === -1) return [...rows, row];
  const next = [...rows];
  next[index] = row;
  return next;
}

const str = (value: unknown): string => String(value ?? '');
const strOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : fallback);

/**
 * Apply one cloud row. `resolve` turns a cloud reference into this device's
 * local id — never the raw uuid, because local integrity checking works in
 * local ids and SD4-006 makes them device-relative.
 */
export function applyCloudRow(
  state: AppState,
  kind: SyncEntityKind,
  localId: string,
  row: Record<string, unknown>,
  resolve: LocalIdResolver
): AppState {
  switch (kind) {
    case 'category':
      return {
        ...state,
        categories: upsert(state.categories, {
          id: localId,
          householdId: state.household.id,
          name: str(row.name),
          systemRole: (strOrNull(row.system_role) as never) ?? null,
          status: str(row.status) === 'archived' ? 'archived' : 'active',
          sortOrder: num(row.sort_order),
          scope: str(row.scope) as never,
        }),
      };

    case 'task': {
      const planKind = str(row.plan_kind);
      const plan =
        planKind === 'day'
          ? ({ kind: 'day', date: str(row.planned_date) } as const)
          : planKind === 'timed'
            ? ({ kind: 'timed', startsAt: str(row.planned_starts_at) } as const)
            : ({ kind: 'unplanned' } as const);
      return {
        ...state,
        tasks: upsert(state.tasks, {
          id: localId,
          title: str(row.title),
          categoryId: resolve(row.category_id as string) ?? str(row.category_id),
          subjectMemberId: resolve(row.subject_member_id as string),
          durationMinutes: num(row.duration_minutes),
          commitment: str(row.commitment) as never,
          dueDate: strOrNull(row.due_date),
          plan,
          notes: strOrNull(row.notes),
          status: str(row.status) as never,
          completedAt: strOrNull(row.completed_at),
          createdAt: strOrNull(row.origin_created_at),
          updatedAt: strOrNull(row.origin_updated_at),
          scope: str(row.scope) as never,
        }),
      };
    }

    case 'event':
      return {
        ...state,
        events: upsert(state.events, {
          id: localId,
          title: str(row.title),
          categoryId: resolve(row.category_id as string) ?? str(row.category_id),
          subjectMemberId: resolve(row.subject_member_id as string),
          startsAt: str(row.starts_at),
          endsAt: str(row.ends_at),
          location: strOrNull(row.location),
          notes: strOrNull(row.notes),
          commitment: str(row.commitment) as never,
          status: str(row.status) as never,
          travelMinutesBefore: row.travel_minutes_before === null ? null : num(row.travel_minutes_before),
          travelMinutesAfter: row.travel_minutes_after === null ? null : num(row.travel_minutes_after),
          preparationMinutes: row.preparation_minutes === null ? null : num(row.preparation_minutes),
          source: str(row.source) as never,
          createdAt: strOrNull(row.origin_created_at),
          updatedAt: strOrNull(row.origin_updated_at),
          scope: str(row.scope) as never,
        }),
      };

    case 'system':
      return {
        ...state,
        systems: upsert(state.systems, {
          id: localId,
          name: str(row.name),
          description: str(row.description),
          categoryId: resolve(row.category_id as string) ?? str(row.category_id),
          scope: str(row.scope) as never,
        }),
      };

    case 'meal':
      return {
        ...state,
        meals: upsert(state.meals, {
          id: localId,
          date: str(row.meal_date),
          title: str(row.title),
          categoryId: resolve(row.category_id as string) ?? str(row.category_id),
          scope: str(row.scope) as never,
        }),
      };

    case 'needsMe':
      return {
        ...state,
        needsMe: upsert(state.needsMe, {
          id: localId,
          title: str(row.title),
          status: str(row.status) as never,
          dueDate: strOrNull(row.due_date),
          categoryId: resolve(row.category_id as string),
          createdAt: str(row.origin_created_at),
          scope: 'personal',
        }),
      };

    case 'oneMove': {
      const targetType = str(row.target_type) === 'needsMe' ? ('needsMe' as const) : ('task' as const);
      const targetCloud = targetType === 'task' ? row.target_task_id : row.target_needs_me_id;
      return {
        ...state,
        oneMoves: upsert(state.oneMoves, {
          id: localId,
          // The SERVER owns the logical day. It is read back, never recomputed
          // from a device clock — two devices in two timezones must agree, and
          // the row is the only thing that can make them (HR-03).
          forDate: str(row.logical_day),
          targetId: resolve(targetCloud as string),
          targetType,
          status: str(row.status) as never,
          decidedAt: str(row.decided_at),
          completedAt: strOrNull(row.completed_at),
          scope: 'personal',
        }),
      };
    }

    case 'discovery':
      return {
        ...state,
        discovery: {
          id: localId,
          topicId: str(row.topic_id),
          answers: Array.isArray(row.answers)
            ? (row.answers as Array<Record<string, unknown>>).map((answer) => ({
                questionId: str(answer.question_id),
                optionId: str(answer.option_id),
              }))
            : (state.discovery?.answers ?? []),
          scope: 'personal',
        },
      };

    case 'onboarding':
      return {
        ...state,
        onboarding: {
          goalIds: Array.isArray(row.goal_ids) ? (row.goal_ids as string[]) : [],
          strengthIds: Array.isArray(row.strength_ids) ? (row.strength_ids as string[]) : [],
          struggleIds: Array.isArray(row.struggle_ids) ? (row.struggle_ids as string[]) : [],
          lastStep: (strOrNull(row.last_step) as never) ?? null,
          completedAt: strOrNull(row.completed_at),
          scope: 'personal',
        },
      };

    case 'action':
      // The ledger is immutable history. A pulled action is added if this device
      // has never seen it and is otherwise left exactly alone: it is never
      // regenerated from current state, and its references are never re-pointed
      // because some other row changed.
      return state.actions.some((action) => action.id === localId)
        ? state
        : { ...state, actions: [...state.actions, rebuildAction(localId, row, resolve)] };
  }
}

/** Remove what a tombstone removes. Only `discovery` ever produces one. */
export function applyCloudTombstone(state: AppState, kind: SyncEntityKind, localId: string): AppState {
  if (kind === 'discovery') {
    return state.discovery?.id === localId ? { ...state, discovery: null } : state;
  }
  // Nothing else has a delete path, in the cloud or here. A tombstone for a kind
  // whose removal semantics are still deferred is not permission to invent them.
  return state;
}

/**
 * An action row, back in local shape.
 *
 * The manifest's references come home as local ids, mirroring the outbound
 * translation. A reference that cannot be resolved on this device is left as
 * the cloud uuid rather than guessed at — local integrity will notice, which is
 * the point.
 */
function rebuildAction(localId: string, row: Record<string, unknown>, resolve: LocalIdResolver): AppState['actions'][number] {
  const reason = (row.reason ?? {}) as Record<string, unknown>;
  const localReason: Record<string, unknown> = { ...reason };
  for (const field of ['windowBeforeEventId', 'windowAfterEventId', 'recommendedTaskId', 'consideredTaskId']) {
    const value = localReason[field];
    if (typeof value === 'string') localReason[field] = resolve(value) ?? value;
  }

  return {
    id: localId,
    type: str(row.action_type),
    approval: str(row.approval),
    targetId: resolve(row.target_id as string),
    targetType: strOrNull(row.target_type),
    reason: localReason,
    before: row.before_state ?? null,
    after: row.after_state ?? null,
    logicalDate: str(row.logical_date),
    createdAt: str(row.origin_created_at),
    actor: 'user',
    source: 'her_keys_recommendation',
    scope: 'personal',
  } as unknown as AppState['actions'][number];
}
