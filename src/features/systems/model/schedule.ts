import { userProvenance } from '../../../domain/foundation/provenance';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import { addDays, toInstant, type LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { nextOccurrence } from '../../../domain/structure';
import type { NoNextReason, ScheduleView } from './types';

/**
 * A System's schedule, read from the foundation's ONE recurrence primitive.
 *
 * What is stored is the rule. "Next expected" is DERIVED (`nextOccurrence`, which honors the
 * exceptions she recorded) and never stored: nothing here materializes an occurrence, writes a
 * calendar row, or claims a reminder exists. A rule is not a notification.
 */

/** How many expected dates a preview shows. Bounded on purpose: it is evidence the rule means what she expects, not a calendar. */
export const PREVIEW_COUNT = 3;

const isAbout = (rule: RecurrenceRule, systemId: string) => rule.about.kind === 'system' && rule.about.id === systemId;

/** Every rule about the System, oldest first. There may be several over time; at most one is active. */
export const rulesForSystem = (state: Pick<AppState, 'recurrences'>, systemId: string): RecurrenceRule[] =>
  state.recurrences.filter((rule) => isAbout(rule, systemId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

const newest = (rules: RecurrenceRule[]): RecurrenceRule | null =>
  [...rules].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0] ?? null;

/** The rule that currently applies: the active one, else a paused one. Ended rules do not apply. */
export function liveRuleFor(state: Pick<AppState, 'recurrences'>, systemId: string): RecurrenceRule | null {
  const rules = rulesForSystem(state, systemId);
  return rules.find((rule) => rule.status === 'active') ?? newest(rules.filter((rule) => rule.status === 'paused'));
}

/** The live rule, or — when the schedule was stopped — the rule that stopped, so it can be described truthfully. */
export function currentRuleFor(state: Pick<AppState, 'recurrences'>, systemId: string): RecurrenceRule | null {
  return liveRuleFor(state, systemId) ?? newest(rulesForSystem(state, systemId).filter((rule) => rule.status === 'ended'));
}

/** Occurrences she chose to skip, most recent first. History — presented neutrally, never as a failure. */
export function skippedDatesFor(state: Pick<AppState, 'observations'>, systemId: string, limit = 5): LocalDate[] {
  const dates = new Set<LocalDate>();
  for (const observation of state.observations) {
    if (observation.about.kind === 'system' && observation.about.id === systemId && observation.outcome === 'skipped') {
      dates.add(observation.plannedDate ?? observation.logicalDate);
    }
  }
  return [...dates].sort().reverse().slice(0, limit);
}

export function scheduleViewFor(state: AppState, systemId: string, today: LocalDate): ScheduleView {
  const rule = currentRuleFor(state, systemId);
  const skipped = skippedDatesFor(state, systemId);
  if (rule === null) {
    return {
      ruleId: null, state: 'none', trigger: null, frequency: null, interval: null, byWeekday: null, byMonthDay: null,
      timeOfDayMinutes: null, endsOn: null, occurrenceCount: null, timezone: null, nextExpected: null, noNextReason: 'no_schedule', skipped,
    };
  }

  const nextExpected = rule.status === 'active' ? nextOccurrence(state, rule, today) : null;
  let noNextReason: NoNextReason | null = null;
  if (nextExpected === null) {
    if (rule.status === 'paused') noNextReason = 'paused';
    else if (rule.status === 'ended') noNextReason = 'stopped';
    else noNextReason = rule.trigger === 'schedule' ? 'nothing_upcoming' : 'not_calendar_based';
  }

  return {
    ruleId: rule.id,
    state: rule.status,
    trigger: rule.trigger,
    frequency: rule.frequency,
    interval: rule.interval,
    byWeekday: rule.byWeekday === null ? null : [...rule.byWeekday].sort((a, b) => a - b),
    byMonthDay: rule.byMonthDay,
    timeOfDayMinutes: rule.timeOfDayMinutes,
    endsOn: rule.endsOn,
    occurrenceCount: rule.occurrenceCount,
    timezone: rule.timezone,
    nextExpected,
    noNextReason,
    skipped,
  };
}

/** The fields of a rule a preview needs. Everything else about a rule is irrelevant to which days it falls on. */
export type PreviewRule = Pick<RecurrenceRule, 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate' | 'endsOn' | 'occurrenceCount'>;

/**
 * The next few expected dates for a rule that may not be saved yet.
 *
 * PRESENTATION ONLY: the rule is a throw-away object that is never stored, and the dates are never
 * persisted or materialized. It calls the foundation's own `nextOccurrence`, so the exceptions she
 * has recorded for this System are honored by the same code that decides the real answer — a
 * hand-rolled expansion could quietly disagree with it.
 */
export function previewOccurrences(
  state: AppState,
  rule: PreviewRule,
  systemId: string,
  today: LocalDate,
  count: number = PREVIEW_COUNT
): LocalDate[] {
  const draft: RecurrenceRule = {
    id: 'preview',
    about: { kind: 'system', id: systemId },
    ...rule,
    timeOfDayMinutes: null,
    timezone: state.user.timezone,
    status: 'active',
    createdAt: toInstant(0),
    updatedAt: toInstant(0),
    provenance: userProvenance(),
    scope: 'personal',
  };
  const dates: LocalDate[] = [];
  let from = today;
  while (dates.length < Math.min(count, PREVIEW_COUNT)) {
    const next = nextOccurrence(state, draft, from);
    if (next === null) break;
    dates.push(next);
    from = addDays(next, 1);
  }
  return dates;
}
