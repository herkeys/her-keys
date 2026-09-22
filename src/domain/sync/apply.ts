import type { AppState } from '../state';
import {
  facetsFromRow,
  instant,
  instantOr,
  num,
  provenanceFromRow,
  str,
  strOrNull,
  upsert,
  type LocalIdResolver,
} from './applySupport';
import { applyFoundationRow, isFoundationKind } from './foundationProjection';
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
 *
 * The nine content kinds read their provenance and commitment facets back from
 * the columns that store them; the eighteen foundation kinds are applied by
 * `foundationProjection.ts`, from the manifest.
 */

export type { LocalIdResolver };

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
  if (isFoundationKind(kind)) return applyFoundationRow(state, kind, localId, row, resolve);

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
          provenance: provenanceFromRow(row, resolve),
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
          // Arrives exactly as it left: a cloud row without a source stays unrecorded, it is not promoted to anything.
          durationSource: (strOrNull(row.duration_source) as never) ?? null,
          commitment: str(row.commitment) as never,
          dueDate: strOrNull(row.due_date),
          plan,
          notes: strOrNull(row.notes),
          status: str(row.status) as never,
          completedAt: instant(row.completed_at),
          createdAt: instant(row.origin_created_at),
          updatedAt: instant(row.origin_updated_at),
          ...facetsFromRow('task', row),
          provenance: provenanceFromRow(row, resolve),
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
          startsAt: instantOr(row.starts_at, str(row.starts_at)),
          endsAt: instantOr(row.ends_at, str(row.ends_at)),
          location: strOrNull(row.location),
          notes: strOrNull(row.notes),
          commitment: str(row.commitment) as never,
          status: str(row.status) as never,
          travelMinutesBefore: row.travel_minutes_before === null ? null : num(row.travel_minutes_before),
          travelMinutesAfter: row.travel_minutes_after === null ? null : num(row.travel_minutes_after),
          preparationMinutes: row.preparation_minutes === null ? null : num(row.preparation_minutes),
          ...facetsFromRow('event', row),
          provenance: provenanceFromRow(row, resolve),
          createdAt: instant(row.origin_created_at),
          updatedAt: instant(row.origin_updated_at),
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
          // A child this device cannot resolve keeps the raw uuid, so the integrity gate names it and the cursor does not advance.
          // It is never dropped to null: that would turn a child's routine into a household one without saying so.
          subjectMemberId: strOrNull(row.subject_member_id) === null ? null : (resolve(row.subject_member_id as string) ?? str(row.subject_member_id)),
          ...facetsFromRow('system', row),
          provenance: provenanceFromRow(row, resolve),
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
          // An absent column reads as the default (a live plan with no stated slot). A value this client does not know is kept
          // as it arrived, never coerced, so the integrity gate refuses the batch by name instead of silently rewriting the plan.
          slot: (strOrNull(row.meal_slot) as never) ?? 'unspecified',
          status: (strOrNull(row.status) as never) ?? 'active',
          ...facetsFromRow('meal', row),
          provenance: provenanceFromRow(row, resolve),
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
          createdAt: instantOr(row.origin_created_at, str(row.origin_created_at)),
          provenance: provenanceFromRow(row, resolve),
          scope: 'personal',
        }),
      };

    case 'oneMove': {
      // One Move is unique per (household, profile, logical day) -- HR-03, and
      // the cloud enforces it. An incoming authoritative row for a day this
      // device decided differently DISPLACES the local one; both cannot exist,
      // and stacking them would make local state invalid. Her displaced intent
      // is not lost: the push that lost the race recorded it as conflict
      // evidence before this ever runs.
      const withoutDay = state.oneMoves.filter(
        (existing) => existing.id === localId || existing.forDate !== str(row.logical_day)
      );
      const targetType = (['task', 'needsMe', 'event', 'system', 'responsibility'] as const).find((t) => t === str(row.target_type)) ?? 'task';
      const targetCloud =
        targetType === 'task' ? row.target_task_id
        : targetType === 'needsMe' ? row.target_needs_me_id
        : targetType === 'event' ? row.target_event_id
        : targetType === 'system' ? row.target_system_id
        : row.target_responsibility_id;
      return {
        ...state,
        oneMoves: upsert(withoutDay, {
          id: localId,
          // The SERVER owns the logical day. It is read back, never recomputed
          // from a device clock — two devices in two timezones must agree, and
          // the row is the only thing that can make them (HR-03).
          forDate: str(row.logical_day),
          targetId: resolve(targetCloud as string),
          targetType,
          status: str(row.status) as never,
          decidedAt: instantOr(row.decided_at, str(row.decided_at)),
          completedAt: instant(row.completed_at),
          provenance: provenanceFromRow(row, resolve),
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
          provenance: provenanceFromRow(row, resolve),
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
          completedAt: instant(row.completed_at),
          provenance: provenanceFromRow(row, resolve),
          scope: 'personal',
        },
      };

    case 'lifeRecord':
      // HK-FEATURE-12. Arrives meaning exactly what it meant when it was pushed. A child this device cannot resolve keeps the raw
      // uuid, so the integrity gate names it and the cursor does not advance; it is never dropped to "about no one".
      return {
        ...state,
        lifeRecords: upsert(state.lifeRecords, {
          id: localId,
          title: str(row.title),
          kind: str(row.record_kind) as never,
          typeName: strOrNull(row.type_name),
          issuerName: strOrNull(row.issuer_name),
          referenceNumber: strOrNull(row.reference_number),
          issuedOn: strOrNull(row.issued_on),
          expiresOn: strOrNull(row.expires_on),
          renewBy: strOrNull(row.renew_by),
          reviewOn: strOrNull(row.review_on),
          locationHint: strOrNull(row.location_hint),
          note: strOrNull(row.note),
          subjectMemberId: strOrNull(row.subject_member_id) === null ? null : (resolve(row.subject_member_id as string) ?? str(row.subject_member_id)),
          status: str(row.status) as never,
          archivedAt: instant(row.archived_at),
          createdAt: instantOr(row.origin_created_at, str(row.origin_created_at)),
          updatedAt: instantOr(row.origin_updated_at, str(row.origin_updated_at)),
          provenance: provenanceFromRow(row, resolve),
          scope: 'personal',
        }),
      };

    case 'lifeRecordLink':
      return {
        ...state,
        lifeRecordLinks: upsert(state.lifeRecordLinks, {
          id: localId,
          lifeRecordId: resolve(row.life_record_id as string) ?? str(row.life_record_id),
          taskId: resolve(row.task_id as string) ?? str(row.task_id),
          relation: str(row.relation) as never,
          createdAt: instantOr(row.origin_created_at, str(row.origin_created_at)),
          provenance: provenanceFromRow(row, resolve),
          scope: 'personal',
        }),
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
  return state;
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

  const type = str(row.action_type);
  const rebuilt: Record<string, unknown> = {
    id: localId,
    type,
    approval: str(row.approval),
    targetId: resolve(row.target_id as string),
    reason: localReason,
    logicalDate: str(row.logical_date),
    createdAt: instantOr(row.origin_created_at, str(row.origin_created_at)),
    actor: 'user',
    source: 'her_keys_recommendation',
    scope: 'personal',
  };

  // Only `protect_item` carries an explicit targetType, and the local schemas
  // are strict: adding the key to any other action type makes the record
  // invalid. The shape is reproduced as it was, not as a union of every shape.
  if (type === 'daily_load.protect_item') rebuilt.targetType = strOrNull(row.target_type);
  if (row.before_state !== null && row.before_state !== undefined) rebuilt.before = row.before_state;
  if (row.after_state !== null && row.after_state !== undefined) rebuilt.after = row.after_state;

  return rebuilt as unknown as AppState['actions'][number];
}
