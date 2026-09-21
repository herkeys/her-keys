import { consequenceRank } from '../../../domain/foundation/authorization';
import { commitmentFacetsOf } from '../../../domain/foundation/commitment';
import { addDays, epochMsOf, zonedTimeToEpochMs, type LocalDate } from '../../../domain/logicalDay';
import { projectStateDay } from '../../../domain/projectDay';
import { assessDailyLoadIssues } from '../../../domain/dailyLoadIssues';
import type { AppState } from '../../../domain/state';
import { tomorrowPreview } from '../../../domain/tomorrowPreview';
import { computeDailyLoad } from '../../daily-load/computeDailyLoad';
import { taskRoute, timeLabelAt } from './refs';
import { requirementsOf, speakable, type Requirement } from './requirements';
import type { UpcomingSection } from './types';

/**
 * THE NEXT CONSTRAINT THAT CHANGES WHAT SHE SHOULD DO NOW.
 *
 * One line, and only when it earns one. This is not tomorrow's plan and not a week
 * view: it is the single upcoming fact that bears on today's choices. In order of
 * strength:
 *
 *   1. unmet dependency — a commitment starting between now and the end of tomorrow (or a
 *      task due then) that REQUIRES something still not done ("the trip needs the form
 *      first"). It points at the thing to do, not at the commitment.
 *   2. tomorrow's timing — tomorrow has an overlap or an overloaded transition. The wording is
 *      `tomorrowPreview()`'s own headline, used verbatim; nothing is re-worded or re-judged.
 *   3. a consequential deadline — a task due tomorrow whose stated consequence is high or worse.
 *
 * Nothing about a merely "early" start or a merely busy tomorrow is said: that would need a
 * threshold Feature 01 does not own. `null` when none of the three is true.
 *
 * A dependency is a stored relationship with its own provenance. One she stated is said flatly ("needs");
 * one Her Keys inferred and she has not confirmed is a possibility and is said as one ("may need", with the
 * permanent unconfirmed badge) — and only when there is no stated requirement to speak of instead.
 */
export function upcomingSection(state: AppState, nowMs: number, today: LocalDate): UpcomingSection | null {
  const tz = state.user.timezone;
  const tomorrow = addDays(today, 1);
  const horizonMs = zonedTimeToEpochMs(addDays(tomorrow, 1), 0, tz);

  // 1 — unmet dependency
  type Pending = { at: number; requirements: Requirement[]; statement: (verb: string, blockerTitle: string, more: number) => string };
  const pending: Pending[] = [];
  const more = (n: number) => (n > 0 ? ` and ${n} more` : '');

  for (const event of state.events) {
    if (event.status !== 'active') continue;
    const start = epochMsOf(event.startsAt);
    if (start < nowMs || start >= horizonMs) continue;
    const requirements = requirementsOf(state, { kind: 'event', id: event.id });
    if (requirements.length === 0) continue;
    const startsToday = zonedTimeToEpochMs(tomorrow, 0, tz) > start;
    const when = `${startsToday ? 'today' : 'tomorrow'} at ${timeLabelAt(event.startsAt, tz)}`;
    pending.push({
      at: start,
      requirements,
      statement: (verb, blocker, rest) => `“${event.title}” ${when} ${verb} “${blocker}”${more(rest)} first.`,
    });
  }
  for (const task of state.tasks) {
    if (task.status !== 'open' || task.dueDate === null || task.dueDate < today || task.dueDate > tomorrow) continue;
    const requirements = requirementsOf(state, { kind: 'task', id: task.id });
    if (requirements.length === 0) continue;
    pending.push({
      at: zonedTimeToEpochMs(addDays(task.dueDate, 1), 0, tz) - 1,
      requirements,
      statement: (verb, blocker, rest) => `“${task.title}” is due ${task.dueDate === today ? 'today' : 'tomorrow'} and ${verb} “${blocker}”${more(rest)} first.`,
    });
  }
  pending.sort((a, b) => a.at - b.at);
  for (const candidate of pending) {
    const spoken = speakable(candidate.requirements);
    if (spoken === null) continue;
    const [first] = spoken.items;
    return {
      kind: 'unmet_dependency',
      statement: candidate.statement(spoken.unconfirmed ? 'may need' : 'needs', first.title, spoken.items.length - 1),
      ref: first.ref,
      route: first.route,
      source: spoken.unconfirmed ? first.source : null,
    };
  }

  // 2 — tomorrow's timing, in the preview's own words
  const day = projectStateDay(state, tomorrow);
  const issues = assessDailyLoadIssues(day.events, day.tasks, computeDailyLoad(day.events, day.tasks));
  if (issues.overlaps.length > 0 || issues.transitionConflict !== null) {
    return { kind: 'tomorrow_timing', statement: tomorrowPreview(state, { nowMs, today, createId: () => '' }).headline, ref: null, route: null, source: null };
  }

  // 3 — a consequential deadline tomorrow
  for (const task of [...state.tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    if (task.status !== 'open' || task.dueDate !== tomorrow) continue;
    const consequence = commitmentFacetsOf({ kind: 'task', row: task }).consequence;
    if (consequence === null || consequenceRank(consequence) < consequenceRank('high')) continue;
    return { kind: 'consequential_due', statement: `“${task.title}” is due tomorrow. If it slips, the cost is ${consequence}.`, ref: { kind: 'task', id: task.id }, route: taskRoute(task.id), source: null };
  }

  return null;
}
