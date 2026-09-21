import { loadTierForBuffer } from '../../../domain/loadThresholds';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { actionAvailability } from './actions';
import { assessFoundation, capacityStateOf, dedupeMissing } from './capacity';
import { collectDayItems } from './collect';
import { buildConflicts } from './conflicts';
import { evidenceOf, gapsWithin, isTimed, occupiedUnions, placementFor, transitionsOf, type PlacementResult } from './geometry';
import { revisionOf } from './revision';
import { capacityWindowIn, dayFrameFor, dayModeOf, minuteOf, weekOf } from './timeFrame';
import type { CalendarDayViewModel, CalendarWeekViewModel, ConflictType, MissingEvidence, NarrowTransition, OpenWindow, UnplacedItem, WeekDaySummary } from './types';

export interface ProjectDayInput {
  state: AppState;
  /** The day being looked at. */
  date: LocalDate;
  /** The household's logical today (from the store snapshot), which decides past / today / future. */
  today: LocalDate;
  /** The clock: elapsed items and unacknowledged requests depend on it. */
  nowMs: number;
  /** The week view needs no action list; skipping it avoids seven dry-run passes. */
  includeActions?: boolean;
}

/**
 * ONE LOGICAL DAY, PROJECTED. Pure and deterministic: the same state, day and clock always produce
 * the same view model, and nothing derived is stored.
 *
 *   collect (canonical rows -> items) -> geometry (occupied time, gaps, transitions)
 *   -> foundation classification -> conflicts / placement / unknowns -> actions
 *
 * This is a projection engine, not a scheduler: it reads what is known, reports what does and does
 * not fit, and never rearranges anything.
 */
export function projectCalendarDay({ state, date, today, nowMs, includeActions = true }: ProjectDayInput): CalendarDayViewModel {
  const frame = dayFrameFor(date, state.user.timezone);
  const mode = dayModeOf(date, today);
  const items = collectDayItems({ state, frame, nowMs, mode });
  const timed = items.filter(isTimed);

  const base = {
    selectedDate: date,
    dayMode: mode,
    timeZone: frame.timeZone,
    asOfMs: nowMs,
    householdOrigin: state.origin === 'demo' ? ('demo' as const) : ('real' as const),
    dayItems: items,
    preview: { active: false as const },
    revision: revisionOf(state),
  };
  const availableActions = includeActions ? actionAvailability({ state, today, nowMs, mode, items }) : [];

  // A past day is history. The foundation has no as-of view (completed rows vanish), so no capacity claim is made for it.
  if (mode === 'past') {
    return { ...base, conflicts: [], narrowTransitions: [], unplacedItems: [], openWindows: [], capacityState: null, unknownStates: [], availableActions };
  }

  const window = capacityWindowIn(frame);
  const nowMinute = mode === 'today' ? minuteOf(frame, nowMs) : null;
  const unions = occupiedUnions(timed);
  const transitions = transitionsOf(timed);

  const placements: PlacementResult[] = items
    .filter((item) => item.timing.kind === 'date_only')
    .map((item) =>
      placementFor(item, {
        unions,
        windowStartMinute: window.startMinute,
        windowEndMinute: window.endMinute,
        nowMinute,
        timed,
        minuteOfMs: (ms) => minuteOf(frame, ms),
      })
    );
  const unplacedItems: UnplacedItem[] = placements.map((placement) => placement.unplaced);

  const issues = assessFoundation(items, date);
  const conflicts = buildConflicts({ items, timed, issues, transitions, placements, mode });

  // What was NOT known. Durations of tasks that take part in the day's capacity (overdue ones do not), unknown travel
  // between consecutive events, and whatever an item's own placement could not establish.
  const durationMissing = (onlyCapacity: boolean): MissingEvidence[] =>
    items
      .filter((item) => item.ref.kind === 'task' && item.durationBasis === 'none' && (!onlyCapacity || item.timing.kind !== 'date_only' || item.timing.daysOverdue === 0))
      .map((item) => ({ field: 'durationMinutes' as const, itemRef: item.ref, betweenWith: null, reason: 'no_usable_duration' as const }));
  const travelMissing: MissingEvidence[] = transitions
    .filter((transition) => transition.travelUnknown)
    .flatMap((transition) => [
      { field: 'travelMinutesAfter' as const, itemRef: transition.before.ref, betweenWith: transition.after.ref, reason: 'location_entered_travel_not_entered' as const },
      { field: 'travelMinutesBefore' as const, itemRef: transition.after.ref, betweenWith: transition.before.ref, reason: 'location_entered_travel_not_entered' as const },
    ]);
  const placementMissing = unplacedItems.flatMap((unplaced) => unplaced.missing);

  const capacityMissing = dedupeMissing([...durationMissing(true), ...travelMissing, ...placementMissing]);
  const unknownStates = dedupeMissing([...durationMissing(false), ...travelMissing, ...placementMissing]);

  // Trustworthy open time: certain (no missing travel/duration at either edge) and open by the foundation's own tiering.
  const openWindows: OpenWindow[] = gapsWithin(unions, Math.max(window.startMinute, nowMinute ?? window.startMinute), window.endMinute)
    .filter((gap) => !gap.uncertain && loadTierForBuffer(gap.lengthMinutes) === 'open')
    .map((gap) => ({ startMinute: gap.startMinute, endMinute: gap.endMinute, lengthMinutes: gap.lengthMinutes }));

  const narrowTransitions: NarrowTransition[] = transitions
    .filter((transition) => transition.slackMinutes >= 0 && loadTierForBuffer(transition.slackMinutes) !== 'open')
    .map((transition) => ({
      before: evidenceOf(transition.before),
      after: evidenceOf(transition.after),
      gapMinutes: transition.gapMinutes,
      scheduledMinutes: transition.scheduledMinutes,
      storedTransitionMinutes: transition.storedMinutes,
      slackMinutes: transition.slackMinutes,
      tier: loadTierForBuffer(transition.slackMinutes),
    }));

  return {
    ...base,
    conflicts,
    narrowTransitions,
    unplacedItems,
    openWindows,
    capacityState: capacityStateOf(issues, capacityMissing),
    unknownStates,
    availableActions,
  };
}

/** One day of the week as a CATEGORICAL summary. Nothing is scored, ranked or averaged. */
export function summarizeDay(view: CalendarDayViewModel, isSelected: boolean): WeekDaySummary {
  const conflictTypes = Array.from(new Set<ConflictType>(view.conflicts.map((conflict) => conflict.type))).sort();
  return {
    date: view.selectedDate,
    dayMode: view.dayMode,
    isSelected,
    itemCount: view.dayItems.length,
    tier: view.capacityState === null ? null : view.capacityState.tier,
    evidenceStatus: view.capacityState === null ? 'not_applicable' : view.capacityState.evidence.status,
    conflictTypes,
    conflictCount: view.conflicts.length,
    unplacedCount: view.unplacedItems.filter((unplaced) => unplaced.state !== 'fixed_without_time').length,
  };
}

export interface ProjectWeekInput {
  state: AppState;
  selectedDate: LocalDate;
  today: LocalDate;
  nowMs: number;
}

/**
 * THE WEEK, COMPARED CATEGORICALLY. Each day carries the same foundation capacity category the day
 * view uses, its conflict types, how much flexible work is still unplaced, and whether the evidence
 * was sufficient. There is no composite, no ranking and no "best/worst day".
 */
export function projectCalendarWeek({ state, selectedDate, today, nowMs }: ProjectWeekInput): CalendarWeekViewModel {
  return {
    selectedDate,
    days: weekOf(selectedDate).map((date) => summarizeDay(projectCalendarDay({ state, date, today, nowMs, includeActions: false }), date === selectedDate)),
  };
}
