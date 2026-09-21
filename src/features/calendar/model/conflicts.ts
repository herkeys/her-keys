import type { DailyLoadIssues } from '../../../domain/dailyLoadIssues';
import { evidenceOf, type PlacementResult, type TimedItem, type TransitionCalc } from './geometry';
import type { Conflict, ConflictType, DayItem, DayMode, ItemRef } from './types';

/**
 * Conflicts. BUSY IS NOT A CONFLICT: a day of many commitments that all fit produces none.
 * A conflict exists only when a stored fact is violated, and every one carries the typed evidence
 * it was derived from.
 *
 *   FIXED_OVERLAP        two commitments hold the same time (foundation `detectOverlaps`, unchanged)
 *   TRANSITION_CONFLICT  what she stored for getting between two commitments does not fit the gap
 *   PLACEMENT_FAILURE    known duration + valid window + known occupied time + no feasible gap
 *   DEPENDENCY_CONFLICT  a timed item starts before a required predecessor's known finish
 *   RESPONSIBILITY_RISK  handed off, not accepted, and the item is still ahead of her today
 *
 * PROTECTED_TIME_CONFLICT is not emitted: the foundation has no typed protected-time fact
 * (protecting an item just makes it fixed), so there is nothing to derive it from.
 */

const TYPE_ORDER: ConflictType[] = ['FIXED_OVERLAP', 'TRANSITION_CONFLICT', 'DEPENDENCY_CONFLICT', 'PLACEMENT_FAILURE', 'RESPONSIBILITY_RISK', 'PROTECTED_TIME_CONFLICT'];

export interface ConflictInputs {
  items: DayItem[];
  timed: TimedItem[];
  issues: DailyLoadIssues;
  transitions: TransitionCalc[];
  placements: PlacementResult[];
  mode: DayMode;
}

const ref = (item: DayItem): ItemRef => item.ref;

export function buildConflicts({ items, timed, issues, transitions, placements, mode }: ConflictInputs): Conflict[] {
  const conflicts: Conflict[] = [];
  const timedById = new Map(timed.map((item) => [`${item.ref.kind}:${item.ref.id}`, item]));
  const startOf = new Map<string, number>();

  // FIXED_OVERLAP — the foundation's detector, so Calendar and Today can never disagree about an overlap.
  for (const overlap of issues.overlaps) {
    const a = timedById.get(`event:${overlap.eventAId}`);
    const b = timedById.get(`event:${overlap.eventBId}`);
    if (!a || !b) continue;
    const id = `FIXED_OVERLAP:${a.ref.id}:${b.ref.id}`;
    startOf.set(id, Math.min(a.timing.startMinute, b.timing.startMinute));
    conflicts.push({
      id,
      type: 'FIXED_OVERLAP',
      itemRefs: [ref(a), ref(b)],
      evidence: {
        kind: 'overlap',
        a: evidenceOf(a),
        b: evidenceOf(b),
        overlapMinutes: overlap.overlapMinutes,
        flexibilityA: overlap.eventACommitment,
        flexibilityB: overlap.eventBCommitment,
        movable: overlap.movableEventId === null ? null : { kind: 'event', id: overlap.movableEventId },
      },
      evidenceRefs: [{ kind: 'event', id: a.ref.id }, { kind: 'event', id: b.ref.id }],
    });
  }

  // TRANSITION_CONFLICT — slack below zero is arithmetic on stored values, not a threshold.
  for (const transition of transitions) {
    if (transition.slackMinutes >= 0) continue;
    const id = `TRANSITION_CONFLICT:${transition.before.ref.id}:${transition.after.ref.id}`;
    startOf.set(id, transition.before.timing.endMinute);
    conflicts.push({
      id,
      type: 'TRANSITION_CONFLICT',
      itemRefs: [ref(transition.before), ref(transition.after)],
      evidence: {
        kind: 'transition',
        before: evidenceOf(transition.before),
        after: evidenceOf(transition.after),
        gapMinutes: transition.gapMinutes,
        scheduledMinutes: transition.scheduledMinutes,
        entered: transition.entered,
        storedTransitionMinutes: transition.storedMinutes,
        slackMinutes: transition.slackMinutes,
      },
      evidenceRefs: [{ kind: 'event', id: transition.before.ref.id }, { kind: 'event', id: transition.after.ref.id }],
    });
  }

  // DEPENDENCY_CONFLICT — only where a predecessor's finish is KNOWN and the item starts before it.
  for (const item of timed) {
    for (const blocker of item.blockedBy) {
      if (blocker.finishMinute === null || item.timing.startMinute >= blocker.finishMinute) continue;
      const id = `DEPENDENCY_CONFLICT:${item.ref.id}:${blocker.ref.id}`;
      startOf.set(id, item.timing.startMinute);
      conflicts.push({
        id,
        type: 'DEPENDENCY_CONFLICT',
        itemRefs: [ref(item), { kind: blocker.ref.kind === 'event' ? 'event' : 'task', id: blocker.ref.id }],
        evidence: { kind: 'dependency', item: ref(item), predecessor: blocker.ref, itemStartMinute: item.timing.startMinute, predecessorFinishMinute: blocker.finishMinute },
        evidenceRefs: [{ kind: item.ref.kind, id: item.ref.id }, blocker.ref, { kind: 'dependency', id: blocker.edgeId }],
      });
    }
  }

  // PLACEMENT_FAILURE — a definite failure only; an opening that depends on missing facts is not one.
  for (const placement of placements) {
    if (placement.failure === null) continue;
    const { failure, unplaced } = placement;
    const id = `PLACEMENT_FAILURE:${unplaced.itemRef.id}`;
    startOf.set(id, failure.windowStartMinute);
    conflicts.push({
      id,
      type: 'PLACEMENT_FAILURE',
      itemRefs: [unplaced.itemRef],
      evidence: {
        kind: 'placement',
        item: unplaced.itemRef,
        durationMinutes: failure.durationMinutes,
        windowStartMinute: failure.windowStartMinute,
        windowEndMinute: failure.windowEndMinute,
        occupied: failure.occupied,
        gaps: failure.gaps,
      },
      evidenceRefs: [{ kind: unplaced.itemRef.kind, id: unplaced.itemRef.id }, ...failure.occupied.map((entry) => ({ kind: entry.ref.kind, id: entry.ref.id }))],
    });
  }

  // RESPONSIBILITY_RISK — DELEGATED is not COVERED. Time pressure is only "it is today and still ahead".
  for (const item of items) {
    const mark = item.responsibility;
    if (mark === null || mark.covered || item.progress === 'elapsed') continue;
    const notAccepted = mark.coverage === 'awaiting_response' || mark.coverage === 'acknowledged_not_accepted';
    const risky = mark.coverage === 'declined' || mark.unacknowledged || (mode === 'today' && notAccepted);
    if (!risky) continue;
    const id = `RESPONSIBILITY_RISK:${item.ref.id}`;
    startOf.set(id, item.timing.kind === 'timed' ? item.timing.startMinute : Number.MAX_SAFE_INTEGER);
    conflicts.push({
      id,
      type: 'RESPONSIBILITY_RISK',
      itemRefs: [ref(item)],
      evidence: { kind: 'responsibility', item: ref(item), responsibilityId: mark.responsibilityId, state: mark.state, coverage: mark.coverage, unacknowledged: mark.unacknowledged },
      evidenceRefs: [{ kind: item.ref.kind, id: item.ref.id }, { kind: 'responsibility', id: mark.responsibilityId }],
    });
  }

  return conflicts.sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      (startOf.get(a.id) ?? 0) - (startOf.get(b.id) ?? 0) ||
      a.id.localeCompare(b.id)
  );
}
