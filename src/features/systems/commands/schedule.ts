import type { TransitionContext } from '../../../domain/context';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import { toInstant, type LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { addRecurrence, nextOccurrence, setRecurrenceStatus, skipOccurrence } from '../../../domain/structure';
import { liveRuleFor } from '../model/schedule';
import type { DraftSchedule } from './draft';

/**
 * A System's schedule, changed only through the foundation's ONE recurrence primitive.
 *
 * Nothing here invents recurrence semantics, materializes an occurrence, or schedules a reminder.
 * A rule is edited IN PLACE (the cloud grants UPDATE on every rule field, and history lives in
 * observations keyed by System + planned date, so an edit rewrites no history). "Stop repeating"
 * marks the rule `ended`; no rule is ever deleted.
 */

const sameDays = (a: number[] | null, b: number[] | null): boolean => {
  if (a === null || b === null) return a === b;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((day, index) => day === right[index]);
};

/**
 * The date a saved schedule counts from.
 *
 * A NEW schedule counts from today. An existing one keeps its own anchor while what it means is
 * unchanged (so "every other Sunday" does not change phase because she edited its time), and
 * re-anchors to today the moment its meaning changes (so "every 2 weeks" starts counting from now,
 * not from a date months ago she never chose). The preview calls this same function, so the dates
 * she sees are the dates the saved rule will derive.
 */
export function resolveAnchor(live: RecurrenceRule | null, next: DraftSchedule, today: LocalDate): LocalDate {
  if (live === null || live.trigger !== 'schedule' || live.frequency === null) return today;
  const unchanged =
    live.frequency === next.frequency && live.interval === next.interval && sameDays(live.byWeekday, next.byWeekday) && live.byMonthDay === next.byMonthDay;
  return unchanged ? live.anchorDate : today;
}

export type ScheduleRefusal = 'ends_before_start';

export function setCalendarSchedule(
  state: AppState,
  ctx: TransitionContext,
  systemId: string,
  schedule: DraftSchedule
): { state: AppState; refusal: ScheduleRefusal | null } {
  const about = { kind: 'system', id: systemId } as const;
  const live = liveRuleFor(state, systemId);

  if (live === null) {
    const created = addRecurrence(state, ctx, about, {
      trigger: 'schedule',
      frequency: schedule.frequency,
      interval: schedule.interval,
      byWeekday: schedule.byWeekday,
      byMonthDay: schedule.byMonthDay,
      timeOfDayMinutes: schedule.timeOfDayMinutes,
      anchorDate: ctx.today,
    });
    return { state: created, refusal: null };
  }

  const anchorDate = resolveAnchor(live, schedule, ctx.today);
  if (live.endsOn !== null && live.endsOn < anchorDate) return { state, refusal: 'ends_before_start' };

  const meaning = {
    trigger: 'schedule' as const,
    frequency: schedule.frequency,
    interval: schedule.interval,
    byWeekday: schedule.byWeekday,
    byMonthDay: schedule.byMonthDay,
    timeOfDayMinutes: schedule.timeOfDayMinutes,
    anchorDate,
    timezone: state.user.timezone,
  };
  const unchanged =
    live.trigger === meaning.trigger &&
    live.frequency === meaning.frequency &&
    live.interval === meaning.interval &&
    sameDays(live.byWeekday, meaning.byWeekday) &&
    live.byMonthDay === meaning.byMonthDay &&
    live.timeOfDayMinutes === meaning.timeOfDayMinutes &&
    live.anchorDate === meaning.anchorDate &&
    live.timezone === meaning.timezone;
  if (unchanged) return { state, refusal: null };

  const updated: RecurrenceRule = { ...live, ...meaning, updatedAt: toInstant(ctx.nowMs) };
  return { state: { ...state, recurrences: state.recurrences.map((rule) => (rule.id === live.id ? updated : rule)) }, refusal: null };
}

/** "Stop repeating": the live rule becomes `ended`. It is kept, never deleted. */
export function stopSchedule(state: AppState, ctx: TransitionContext, systemId: string): AppState {
  const live = liveRuleFor(state, systemId);
  return live === null ? state : setRecurrenceStatus(state, ctx, live.id, 'ended');
}

export function pauseSchedule(state: AppState, ctx: TransitionContext, systemId: string): AppState {
  const live = liveRuleFor(state, systemId);
  return live !== null && live.status === 'active' ? setRecurrenceStatus(state, ctx, live.id, 'paused') : state;
}

/** Only a paused rule resumes, and only while no other rule about the System is active (one live answer to "when?"). */
export function resumeSchedule(state: AppState, ctx: TransitionContext, systemId: string): AppState {
  const live = liveRuleFor(state, systemId);
  if (live === null || live.status !== 'paused') return state;
  if (state.recurrences.some((rule) => rule.status === 'active' && rule.about.kind === 'system' && rule.about.id === systemId)) return state;
  return setRecurrenceStatus(state, ctx, live.id, 'active');
}

export type SkipOutcome = 'skipped' | 'no_live_schedule' | 'nothing_upcoming' | 'changed';

/**
 * Skip the next expected occurrence — the date SHE SAW. If the next date is no longer that one
 * (something changed, or a double-tap already skipped it), nothing is skipped: two taps must never
 * skip two occurrences. A skip is history (an observation), not an edit to the rule, and not a
 * disabled System.
 */
export function skipNextOccurrence(state: AppState, ctx: TransitionContext, systemId: string, expected: LocalDate): { state: AppState; outcome: SkipOutcome } {
  const live = liveRuleFor(state, systemId);
  if (live === null || live.status !== 'active') return { state, outcome: 'no_live_schedule' };
  const next = nextOccurrence(state, live, ctx.today);
  if (next === null) return { state, outcome: 'nothing_upcoming' };
  if (next !== expected) return { state, outcome: 'changed' };
  return { state: skipOccurrence(state, ctx, { kind: 'system', id: systemId }, next), outcome: 'skipped' };
}
