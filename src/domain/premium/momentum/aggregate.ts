import { addDays, type LocalDate } from '../../logicalDay';
import { THRESHOLDS, type MomentumEvent, type Period, type PeriodCounts } from './model';

/** The reporting period: seven logical days ending today, inclusive, and the equal-length period immediately before it. */
export function periodEndingOn(end: LocalDate, days: number = THRESHOLDS.periodDays): Period {
  return { start: addDays(end, -(days - 1)), end, days };
}
export function priorPeriodOf(period: Period): Period {
  const end = addDays(period.start, -1);
  return { start: addDays(end, -(period.days - 1)), end, days: period.days };
}
export const inPeriod = (date: LocalDate, p: Period): boolean => date >= p.start && date <= p.end;

const EMPTY: PeriodCounts = {
  tasksCompleted: 0,
  itemsCompleted: 0,
  oneMovesCompleted: 0,
  routinesDone: 0,
  routinesSkipped: 0,
  routinesMissed: 0,
  postponements: 0,
  postponedTasks: 0,
  finishedAfterPostponing: 0,
  suggestionsApplied: 0,
  suggestionsReverted: 0,
  suggestionsDeclined: 0,
  delegationsAccepted: 0,
  delegationsCompleted: 0,
  totalEvents: 0,
  activeDays: 0,
};

/**
 * Honest counts for one period.
 *
 *  - Completions are DISTINCT things, and a completed-then-reopened task is not a completion (`netCompleted`): finishing the same task
 *    twice is one thing finished.
 *  - A suggestion is "applied" only if it is still applied: one she undid is reported as undone, not as a win.
 *  - Nothing is rated, scored or called an improvement. A count is a count.
 *
 * `events` must already be deduplicated and attributed (`deriveEvents`); `history` is the wider lookback used only to answer "had she
 * postponed this before?".
 */
export function aggregatePeriod(input: { events: readonly MomentumEvent[]; history: readonly MomentumEvent[]; period: Period; netCompleted: ReadonlySet<string> }): PeriodCounts {
  const { period } = input;
  const mine = input.events.filter((e) => inPeriod(e.logicalDate, period));
  const distinct = (type: MomentumEvent['type'], kind?: string) => new Set(mine.filter((e) => e.type === type && (kind === undefined || e.about.kind === kind)).map((e) => `${e.about.kind}:${e.about.id}`));

  const completedTasks = new Set([...distinct('task_completed')].map((k) => k.slice('task:'.length)).filter((id) => input.netCompleted.has(id)));
  const postponedBefore = new Set(input.history.filter((e) => e.type === 'postponed_by_you').map((e) => e.about.id));
  const revertedDecisions = new Set(input.events.filter((e) => e.type === 'suggestion_reverted').map((e) => e.source.id));
  const appliedStillApplied = mine.filter((e) => e.type === 'suggestion_applied' && !revertedDecisions.has(e.source.id));

  const postponements = mine.filter((e) => e.type === 'postponed_by_you');
  return {
    ...EMPTY,
    tasksCompleted: completedTasks.size,
    itemsCompleted: distinct('item_completed').size,
    oneMovesCompleted: distinct('one_move_completed').size,
    routinesDone: mine.filter((e) => e.type === 'routine_completed').length,
    routinesSkipped: mine.filter((e) => e.type === 'routine_skipped').length,
    routinesMissed: mine.filter((e) => e.type === 'routine_missed').length,
    postponements: postponements.length,
    postponedTasks: new Set(postponements.map((e) => e.about.id)).size,
    finishedAfterPostponing: [...completedTasks].filter((id) => postponedBefore.has(id)).length,
    suggestionsApplied: appliedStillApplied.length,
    suggestionsReverted: mine.filter((e) => e.type === 'suggestion_reverted').length,
    suggestionsDeclined: mine.filter((e) => e.type === 'suggestion_declined').length,
    delegationsAccepted: distinct('delegation_accepted').size,
    delegationsCompleted: distinct('delegation_completed').size,
    totalEvents: mine.length,
    activeDays: new Set(mine.map((e) => e.logicalDate)).size,
  };
}

/** Enough recorded history in this period to say anything about it. Below this a week is mostly noise. */
export const hasEnoughHistory = (c: Pick<PeriodCounts, 'totalEvents' | 'activeDays'>): boolean =>
  c.totalEvents >= THRESHOLDS.minEventsForReport && c.activeDays >= THRESHOLDS.minActiveDaysForReport;

/** Signed differences, this period minus the prior. Counts only. */
export function deltasOf(now: PeriodCounts, prior: PeriodCounts): Partial<Record<keyof PeriodCounts, number>> {
  const keys: Array<keyof PeriodCounts> = ['tasksCompleted', 'itemsCompleted', 'postponements', 'postponedTasks', 'suggestionsApplied', 'delegationsAccepted', 'delegationsCompleted', 'routinesDone', 'routinesMissed'];
  return Object.fromEntries(keys.map((k) => [k, now[k] - prior[k]]));
}
