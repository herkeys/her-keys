import type { Instant, LocalDate } from '../../../domain/logicalDay';
import { addDays, epochMsOf, logicalDateAt } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';

/**
 * UNRESOLVED-CAPTURE ATTENTION PROJECTION (feature-local, typed, derived).
 *
 * The shared attention foundation (`reasoning/attention.ts`) reads tasks, needs-me items, intents,
 * responsibilities and external references — it has NO source for a capture that is still unresolved.
 * "Dentist Friday at 3", left unanswered, is not a confirmed appointment, so Today must not pretend it is
 * — but it must not silently age out either. This projection says, for each unresolved capture, WHY it
 * deserves attention and how soon, from the timing evidence the readings already carry.
 *
 * INTEGRATION REQUIREMENT: Feature 02 unresolved-capture attention should later feed shared attention /
 * Today through canonical projection integration. This file imports nothing from any other feature and no
 * other feature imports it; it is derived, never persisted, and modifies no shared foundation.
 *
 * No numeric priority, urgency percentage or score: ordering is by meaning (below).
 */

export type UnresolvedAttentionReason =
  /** A reading that names a time has not been decided. */
  | 'time_bound_unresolved'
  /** A question is open on a reading that names a time: the answer is what is blocking it. */
  | 'clarification_blocks_time_bound'
  /** Nothing time-bound, but a decision is waiting. */
  | 'review_required'
  /** A source that has no reading at all yet. */
  | 'awaiting_interpretation';

export type CaptureUrgency = 'now' | 'today' | 'soon' | 'none';

export type CaptureTimeRef = { kind: 'event-start'; at: Instant } | { kind: 'due-date'; date: LocalDate };

export interface UnresolvedCaptureAttention {
  captureId: string;
  /** Null for a source with no reading. */
  readingId: string | null;
  reason: UnresolvedAttentionReason;
  urgency: CaptureUrgency;
  timeRef: CaptureTimeRef | null;
  /** The referenced time has already gone by and the capture is still unresolved. */
  passed: boolean;
  blockedBy: 'clarification' | 'review' | null;
}

const URGENCY_RANK: Record<CaptureUrgency, number> = { now: 0, today: 1, soon: 2, none: 3 };
const REASON_RANK: Record<UnresolvedAttentionReason, number> = {
  clarification_blocks_time_bound: 0,
  time_bound_unresolved: 1,
  review_required: 2,
  awaiting_interpretation: 3,
};
const HOUR_MS = 3_600_000;

function urgencyOf(ref: CaptureTimeRef, nowMs: number, today: LocalDate, timeZone: string): { urgency: CaptureUrgency; passed: boolean } {
  if (ref.kind === 'event-start') {
    const at = epochMsOf(ref.at);
    if (at < nowMs) return { urgency: 'now', passed: true };
    if (at - nowMs <= 3 * HOUR_MS) return { urgency: 'now', passed: false };
    const day = logicalDateAt(at, timeZone);
    if (day === today) return { urgency: 'today', passed: false };
    return { urgency: day <= addDays(today, 2) ? 'soon' : 'none', passed: false };
  }
  if (ref.date < today) return { urgency: 'now', passed: true };
  if (ref.date === today) return { urgency: 'today', passed: false };
  return { urgency: ref.date <= addDays(today, 2) ? 'soon' : 'none', passed: false };
}

/**
 * Every unresolved capture, most in need of attention first. A capture is unresolved while a reading of it
 * is `pending` or `clarifying`, or while it has no reading at all. A retracted source is not.
 */
export function unresolvedCaptureAttention(state: AppState, nowMs: number): UnresolvedCaptureAttention[] {
  const timeZone = state.user.timezone;
  const today = logicalDateAt(nowMs, timeZone);
  const items: Array<UnresolvedCaptureAttention & { receivedAtMs: number }> = [];

  for (const artifact of state.sourceArtifacts) {
    if (artifact.retractedAt !== null) continue;
    const readings = state.interpretations.filter((r) => r.artifactId === artifact.id);
    const receivedAtMs = epochMsOf(artifact.receivedAt);

    if (readings.length === 0) {
      items.push({ captureId: artifact.id, readingId: null, reason: 'awaiting_interpretation', urgency: 'none', timeRef: null, passed: false, blockedBy: null, receivedAtMs });
      continue;
    }

    for (const reading of readings) {
      if (reading.state !== 'pending' && reading.state !== 'clarifying') continue;
      const timeRef: CaptureTimeRef | null =
        reading.startsAt !== null ? { kind: 'event-start', at: reading.startsAt } : reading.dueDate !== null ? { kind: 'due-date', date: reading.dueDate } : null;
      const clarifying = reading.state === 'clarifying';
      const { urgency, passed } = timeRef ? urgencyOf(timeRef, nowMs, today, timeZone) : { urgency: 'none' as const, passed: false };
      items.push({
        captureId: artifact.id,
        readingId: reading.id,
        reason: timeRef ? (clarifying ? 'clarification_blocks_time_bound' : 'time_bound_unresolved') : 'review_required',
        urgency,
        timeRef,
        passed,
        blockedBy: clarifying ? 'clarification' : 'review',
        receivedAtMs,
      });
    }
  }

  return items.sort(compareAttention).map(({ receivedAtMs: _drop, ...item }) => item);
}

const timeOf = (item: UnresolvedCaptureAttention): number =>
  item.timeRef === null ? Number.POSITIVE_INFINITY : item.timeRef.kind === 'event-start' ? epochMsOf(item.timeRef.at) : Date.parse(`${item.timeRef.date}T00:00:00Z`);

function compareAttention(
  a: UnresolvedCaptureAttention & { receivedAtMs: number },
  b: UnresolvedCaptureAttention & { receivedAtMs: number }
): number {
  return (
    URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
    // Earlier referenced time first: the one that is nearest, or longest overdue, is the most pressing.
    timeOf(a) - timeOf(b) ||
    // A question blocking a time-bound matter outranks a plain review.
    REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
    // Recency only breaks ties.
    b.receivedAtMs - a.receivedAtMs ||
    a.captureId.localeCompare(b.captureId) ||
    (a.readingId ?? '').localeCompare(b.readingId ?? '')
  );
}
