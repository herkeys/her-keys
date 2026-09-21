import { loadTierForBuffer } from '../../../domain/loadThresholds';
import { normalizePlace } from './timeFrame';
import type { DayItem, GapEvidence, IntervalEvidence, MissingEvidence, Opening, TimedSpan, UnplacedItem } from './types';

/**
 * Interval geometry for one day. Everything here is a bounded projection over currently known
 * intervals: one sort, one merge sweep, one pass per unplaced item. There is no search over
 * alternative schedules and no backtracking (contract section 65).
 *
 * The one rule that shapes it: UNKNOWN CAN ONLY SHRINK CAPACITY. A missing travel time is never
 * treated as zero to make something fit. Where a fit depends on it, the fit is reported as
 * insufficient information and the missing fact is named.
 */

export type TimedItem = DayItem & { timing: TimedSpan };
export const isTimed = (item: DayItem): item is TimedItem => item.timing.kind === 'timed';

export const evidenceOf = (item: TimedItem): IntervalEvidence => ({ ref: item.ref, startMinute: item.timing.startMinute, endMinute: item.timing.endMinute });

const entered = (value: number | null): number => value ?? 0;

// ----------------------------------------------------------- unknown travel ---

/**
 * Whether the trip TO/FROM a place is a missing fact rather than merely absent. Travel is only
 * implied when the data says the commitment happens somewhere specific: a location she entered
 * and no travel time entered on that side (D-02). A commitment with no location implies nothing,
 * so an un-located day is not turned into a wall of "unknown"; and it is never assumed to be the
 * same place either.
 */
const leavingUnknown = (item: DayItem): boolean => item.ref.kind === 'event' && item.location !== null && item.transition.travelAfter === null;
const arrivingUnknown = (item: DayItem): boolean => item.ref.kind === 'event' && item.location !== null && item.transition.travelBefore === null;

// ------------------------------------------------------------------ blocks ---

interface Union {
  startMinute: number;
  endMinute: number;
  /** The item whose (footprint-expanded) start opens this run of occupied time. */
  startItem: TimedItem;
  /** The item whose (footprint-expanded) end closes it. */
  endItem: TimedItem;
}

/**
 * Occupied time: each timed item plus what she entered for getting ready and getting there.
 * Entered values only — an unentered one adds nothing here and is tracked as an uncertain edge.
 */
export function occupiedUnions(items: TimedItem[]): Union[] {
  const blocks = items
    .map((item) => ({
      item,
      start: item.timing.startMinute - entered(item.transition.preparation) - entered(item.transition.travelBefore),
      end: item.timing.endMinute + entered(item.transition.travelAfter),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.item.ref.id.localeCompare(b.item.ref.id));

  const unions: Union[] = [];
  let current: Union | null = null;
  for (const block of blocks) {
    if (current !== null && block.start <= current.endMinute) {
      if (block.end > current.endMinute) {
        current.endMinute = block.end;
        current.endItem = block.item;
      }
      continue;
    }
    current = { startMinute: block.start, endMinute: block.end, startItem: block.item, endItem: block.item };
    unions.push(current);
  }
  return unions;
}

// -------------------------------------------------------------------- gaps ---

export interface Gap {
  startMinute: number;
  endMinute: number;
  lengthMinutes: number;
  before: TimedItem | null;
  after: TimedItem | null;
  uncertain: boolean;
  uncertainty: MissingEvidence[];
}

const missingTravel = (item: DayItem, side: 'travelMinutesBefore' | 'travelMinutesAfter', betweenWith: DayItem | null): MissingEvidence => ({
  field: side,
  itemRef: item.ref,
  betweenWith: betweenWith === null ? null : betweenWith.ref,
  reason: 'location_entered_travel_not_entered',
});

/** The free stretches inside [lo, hi]. A gap is uncertain when either commitment bounding it implies travel that was not entered. */
export function gapsWithin(unions: Union[], lo: number, hi: number): Gap[] {
  const gaps: Gap[] = [];
  let cursor = lo;
  let previous: Union | null = null;

  const push = (start: number, end: number, before: TimedItem | null, after: TimedItem | null) => {
    if (end <= start) return;
    const uncertainty: MissingEvidence[] = [];
    if (before !== null && leavingUnknown(before)) uncertainty.push(missingTravel(before, 'travelMinutesAfter', after));
    if (after !== null && arrivingUnknown(after)) uncertainty.push(missingTravel(after, 'travelMinutesBefore', before));
    // A timed task with no usable duration has no known end, so the time after it is not known to be free.
    if (before !== null && !before.timing.endKnown) uncertainty.push({ field: 'durationMinutes', itemRef: before.ref, betweenWith: null, reason: 'no_usable_duration' });
    gaps.push({ startMinute: start, endMinute: end, lengthMinutes: end - start, before, after, uncertain: uncertainty.length > 0, uncertainty });
  };

  for (const union of unions) {
    if (union.endMinute <= lo) {
      previous = union;
      continue;
    }
    if (union.startMinute >= hi) break;
    const before = previous !== null && previous.endMinute === cursor ? previous.endItem : null;
    const gapEnd = Math.min(union.startMinute, hi);
    push(cursor, gapEnd, before, union.startMinute <= hi ? union.startItem : null);
    cursor = Math.max(cursor, union.endMinute);
    previous = union;
  }
  if (cursor < hi) push(cursor, hi, previous !== null && previous.endMinute === cursor ? previous.endItem : null, null);
  return gaps;
}

// ------------------------------------------------------------- transitions ---

export interface TransitionCalc {
  before: TimedItem;
  after: TimedItem;
  gapMinutes: number;
  /** Task minutes already scheduled inside the gap (the foundation subtracts these too). */
  scheduledMinutes: number;
  entered: { travelAfter: number | null; travelBefore: number | null; preparation: number | null };
  storedMinutes: number;
  /** gap - scheduled - stored. Negative means the transition does not fit. */
  slackMinutes: number;
  /** Travel is implied (a location was entered) but no travel time was, and the two are not the same known place. */
  travelUnknown: boolean;
}

/**
 * Every transition between consecutive EVENTS, in order — the foundation's own definition: a gap
 * opens only once every earlier commitment has ended, so an event nested inside a longer one never
 * creates time that is not really free.
 */
export function transitionsOf(items: TimedItem[]): TransitionCalc[] {
  const events = items.filter((item) => item.ref.kind === 'event');
  const tasks = items.filter((item) => item.ref.kind === 'task');
  const result: TransitionCalc[] = [];
  let latest = events[0];

  for (let index = 1; index < events.length; index++) {
    const next = events[index];
    if (next.timing.startMinute >= latest.timing.endMinute) {
      const from = latest.timing.endMinute;
      const to = next.timing.startMinute;
      const scheduledMinutes = tasks
        .filter((task) => task.timing.startMinute >= from && task.timing.startMinute < to)
        .reduce((sum, task) => sum + (task.source.rawDurationMinutes ?? 0), 0);
      const parts = { travelAfter: latest.transition.travelAfter, travelBefore: next.transition.travelBefore, preparation: next.transition.preparation };
      const storedMinutes = entered(parts.travelAfter) + entered(parts.travelBefore) + entered(parts.preparation);
      const sameKnownPlace = normalizePlace(latest.location) !== null && normalizePlace(latest.location) === normalizePlace(next.location);
      const anyLocation = latest.location !== null || next.location !== null;
      const travelEntered = parts.travelAfter !== null || parts.travelBefore !== null;
      result.push({
        before: latest,
        after: next,
        gapMinutes: to - from,
        scheduledMinutes,
        entered: parts,
        storedMinutes,
        slackMinutes: to - from - scheduledMinutes - storedMinutes,
        travelUnknown: anyLocation && !travelEntered && !sameKnownPlace,
      });
    }
    if (next.timing.endMinute > latest.timing.endMinute) latest = next;
  }
  return result;
}

// --------------------------------------------------------------- placement ---

export interface PlacementContext {
  unions: Union[];
  windowStartMinute: number;
  windowEndMinute: number;
  /** Minutes elapsed today, or null when the day is not today: nothing can be placed in the past. */
  nowMinute: number | null;
  timed: TimedItem[];
  minuteOfMs: (ms: number) => number;
}

export interface PlacementResult {
  unplaced: UnplacedItem;
  /** Present only for a definite failure, so the conflict can carry its evidence. */
  failure: { windowStartMinute: number; windowEndMinute: number; occupied: IntervalEvidence[]; gaps: GapEvidence[]; durationMinutes: number } | null;
}

const noOpenings: Opening[] = [];

function unplaced(item: DayItem, state: UnplacedItem['state'], reason: UnplacedItem['reason'], extra: Partial<UnplacedItem> = {}): UnplacedItem {
  return { itemRef: item.ref, state, reason, durationKnown: item.durationMinutes !== null, openings: noOpenings, missing: [], ...extra };
}

/**
 * Where, if anywhere, an unscheduled flexible task could go — against currently known
 * intervals only. DUE BY 5 PM is an upper bound on the window, never a scheduled time, and
 * nothing here writes anything.
 */
export function placementFor(item: DayItem, context: PlacementContext): PlacementResult {
  if (item.flexibility === 'fixed') return { unplaced: unplaced(item, 'fixed_without_time', 'fixed_commitment_no_time'), failure: null };
  if (item.window?.splittable === true) return { unplaced: unplaced(item, 'not_evaluated', 'splittable_not_evaluated'), failure: null };
  if (item.durationMinutes === null) {
    const missing: MissingEvidence = { field: 'durationMinutes', itemRef: item.ref, betweenWith: null, reason: 'no_usable_duration' };
    return { unplaced: unplaced(item, 'insufficient_information', 'no_usable_duration', { missing: [missing] }), failure: null };
  }
  if (item.blockedBy.some((blocker) => blocker.finishMinute === null)) {
    return { unplaced: unplaced(item, 'waiting_on_predecessor', 'predecessor_unscheduled'), failure: null };
  }

  const bounds: number[] = [context.windowStartMinute];
  if (context.nowMinute !== null) bounds.push(context.nowMinute);
  if (item.window?.earliestStartMs != null) bounds.push(context.minuteOfMs(item.window.earliestStartMs));
  for (const blocker of item.blockedBy) if (blocker.finishMinute !== null) bounds.push(blocker.finishMinute);
  const ceilings: number[] = [context.windowEndMinute];
  if (item.window?.latestFinishMs != null) ceilings.push(context.minuteOfMs(item.window.latestFinishMs));
  if (item.window?.dueAtMs != null) ceilings.push(context.minuteOfMs(item.window.dueAtMs));
  const lo = Math.max(...bounds);
  const hi = Math.min(...ceilings);

  const need = item.durationMinutes + entered(item.transition.preparation) + entered(item.transition.travelBefore) + entered(item.transition.travelAfter);
  const gaps = gapsWithin(context.unions, lo, hi);
  const optimistic = gaps.filter((gap) => gap.lengthMinutes >= need);
  const certain = optimistic.filter((gap) => !gap.uncertain);

  if (certain.length > 0) {
    const openings: Opening[] = certain.map((gap) => {
      const leaves = gap.lengthMinutes - need;
      return {
        startMinute: gap.startMinute,
        endMinute: gap.endMinute,
        lengthMinutes: gap.lengthMinutes,
        before: gap.before === null ? null : gap.before.ref,
        after: gap.after === null ? null : gap.after.ref,
        leavesMinutes: leaves,
        leavesTier: gap.before !== null && gap.after !== null ? loadTierForBuffer(leaves) : null,
      };
    });
    return { unplaced: unplaced(item, 'has_opening', 'certain_opening_exists', { openings }), failure: null };
  }

  if (optimistic.length > 0) {
    const seen = new Set<string>();
    const missing: MissingEvidence[] = [];
    for (const gap of optimistic) {
      for (const entry of gap.uncertainty) {
        const key = `${entry.field}:${entry.itemRef.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          missing.push(entry);
        }
      }
    }
    return { unplaced: unplaced(item, 'insufficient_information', 'opening_depends_on_missing_facts', { missing }), failure: null };
  }

  return {
    unplaced: unplaced(item, 'needs_a_place', 'no_feasible_window'),
    failure: {
      windowStartMinute: lo,
      windowEndMinute: hi,
      durationMinutes: need,
      occupied: context.timed.filter((timedItem) => timedItem.timing.endMinute > lo && timedItem.timing.startMinute < hi).map(evidenceOf),
      gaps: gaps.map((gap) => ({ startMinute: gap.startMinute, endMinute: gap.endMinute, lengthMinutes: gap.lengthMinutes, uncertain: gap.uncertain })),
    },
  };
}
