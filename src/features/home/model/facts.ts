import { isActiveResponsibility, isUnacknowledged, type HouseholdPerson, type Responsibility } from '../../../domain/foundation/responsibility';
import type { BehaviorObservation } from '../../../domain/foundation/observation';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import type { TypedRef } from '../../../domain/foundation/typedRef';
import { addDays, epochMsOf, logicalDateAt, type LocalDate } from '../../../domain/logicalDay';
import { needsMePersonally } from '../../../domain/responsibility';
import { nextOccurrence } from '../../../domain/structure';
import type { AppState, CalendarEvent, Child, Task } from '../../../domain/state';
import type { CoverageState, DueWhen, HolderFact, LastDoneFact, RecurrenceFact, ResponsibilityFact, TimingFact, VisitWhen } from './types';

/**
 * The fact derivations behind a Home item. Each one is a small, pure reading of canonical state that follows a shared semantic —
 * no Home-specific reasoning, no scores, and no judgment beyond what the shared layers already provide.
 */

// -------------------------------------------------------------------------------------------------------------- last done

/**
 * LAST DONE — only from completion evidence for the SAME canonical operation.
 *
 * Evidence, in the order it is trusted equally (the later instant wins; a tie names the observation):
 *   - a `completed` observation about this task or System (append-only, carries the logical day it happened on);
 *   - a task's own `completedAt`, which the schema pairs with `status === 'completed'`.
 *
 * NEVER: updatedAt, createdAt, dueDate, plan or any scheduled/edit time. An edit is not a completion. A later `reopened`
 * observation does not retract an earlier completion: it says the task was reopened, not that it was never done.
 */
export function lastDoneOf(input: {
  kind: 'task' | 'system';
  /** Only the `completed` observations about this exact reference. */
  completions: readonly BehaviorObservation[];
  /** The task's own completion stamp, and only while the task is completed. */
  taskCompletedAt: string | null;
  timeZone: string;
}): LastDoneFact | null {
  let best: LastDoneFact | null = null;
  let bestMs = -Infinity;
  for (const observation of input.completions) {
    if (observation.outcome !== 'completed') continue;
    const ms = epochMsOf(observation.occurredAt);
    if (ms > bestMs) {
      bestMs = ms;
      best = { date: observation.logicalDate, at: observation.occurredAt, evidence: input.kind === 'task' ? 'completion_observation' : 'system_completion_observation' };
    }
  }
  if (input.kind === 'task' && input.taskCompletedAt !== null) {
    const ms = epochMsOf(input.taskCompletedAt);
    if (ms > bestMs) best = { date: logicalDateAt(ms, input.timeZone), at: input.taskCompletedAt, evidence: 'task_completed_at' };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------- timing

export function dueWhen(date: LocalDate, today: LocalDate): DueWhen {
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return date === addDays(today, 1) ? 'tomorrow' : 'later';
}

/** Facts about WHEN, never a judgment about how much it matters. DUE != SCHEDULED: a due date and a plan are separate facts. */
export function taskTiming(task: Pick<Task, 'dueDate' | 'plan'>, today: LocalDate, timeZone: string): TimingFact[] {
  const facts: TimingFact[] = [];
  if (task.dueDate !== null) facts.push({ kind: 'due', when: dueWhen(task.dueDate, today), date: task.dueDate });
  if (task.plan.kind === 'day') {
    const when = task.plan.date < today ? 'earlier' : dueWhen(task.plan.date, today);
    facts.push({ kind: 'planned', when, date: task.plan.date, startsAt: null });
  } else if (task.plan.kind === 'timed') {
    const date = logicalDateAt(epochMsOf(task.plan.startsAt), timeZone);
    const when = date < today ? 'earlier' : dueWhen(date, today);
    facts.push({ kind: 'planned', when, date, startsAt: task.plan.startsAt });
  }
  return facts;
}

export function visitWhen(event: Pick<CalendarEvent, 'startsAt' | 'endsAt'>, nowMs: number, today: LocalDate, timeZone: string): { when: VisitWhen; date: LocalDate } {
  const startMs = epochMsOf(event.startsAt);
  const endMs = epochMsOf(event.endsAt);
  const date = logicalDateAt(startMs, timeZone);
  if (nowMs >= endMs) return { when: logicalDateAt(endMs, timeZone) === today ? 'earlier_today' : 'past', date };
  if (nowMs >= startMs) return { when: 'now', date };
  if (date === today) return { when: 'today', date };
  return { when: date === addDays(today, 1) ? 'tomorrow' : 'later', date };
}

// -------------------------------------------------------------------------------------------------------- responsibility

export interface HolderDirectory {
  people: ReadonlyMap<string, HouseholdPerson>;
  children: ReadonlyMap<string, Child>;
}

const SELF: HolderFact = { kind: 'self', id: null, name: 'You', relationship: null };

function holderOf(responsibility: Responsibility, directory: HolderDirectory): HolderFact {
  if (responsibility.responsibleKind === 'person' && responsibility.responsiblePersonId !== null) {
    const person = directory.people.get(responsibility.responsiblePersonId);
    return { kind: 'person', id: responsibility.responsiblePersonId, name: person?.displayName ?? 'Someone', relationship: person?.relationship ?? null };
  }
  if (responsibility.responsibleKind === 'child' && responsibility.responsibleChildId !== null) {
    const child = directory.children.get(responsibility.responsibleChildId);
    return { kind: 'child', id: responsibility.responsibleChildId, name: child?.displayName ?? 'Your child', relationship: null };
  }
  return SELF;
}

const NONE: ResponsibilityFact = {
  responsibilityId: null,
  state: 'none',
  coverage: 'not_delegated',
  holder: null,
  stillNeedsMe: null,
  requestedAt: null,
  ackDueAt: null,
  completedAt: null,
};

/**
 * ASSIGNED != ACKNOWLEDGED != ACCEPTED != COVERED.
 *
 * `covered` is reached in exactly one way: the live handoff is held by someone else, they ACCEPTED it, and the shared
 * `needsMePersonally` says it no longer needs her — i.e. she said so. Being asked, having been seen, or having said yes is each
 * a different, weaker state, and none of them is completion.
 */
export function responsibilityFactOf(state: AppState, about: TypedRef, related: readonly Responsibility[], nowMs: number, directory: HolderDirectory): ResponsibilityFact {
  if (related.length === 0) return { ...NONE, stillNeedsMe: needsMePersonally(state, about, nowMs) };

  const live = related.find(isActiveResponsibility) ?? null;
  const shared = needsMePersonally(state, about, nowMs);

  if (live !== null) {
    const holder = holderOf(live, directory);
    let coverage: CoverageState = 'not_delegated';
    if (live.responsibleKind !== 'self') {
      if (live.state === 'requested') coverage = isUnacknowledged(live, nowMs) ? 'no_answer' : 'asked';
      else if (live.state === 'acknowledged') coverage = 'seen';
      else if (live.state === 'accepted') coverage = shared === false ? 'covered' : 'accepted_needs_you';
    }
    return {
      responsibilityId: live.id,
      state: live.state,
      coverage,
      holder,
      stillNeedsMe: shared,
      requestedAt: live.requestedAt,
      ackDueAt: live.ackDueAt,
      completedAt: null,
    };
  }

  // Nothing is live: what happened last is history, not a current owner.
  const latest = related.reduce((a, b) => (b.updatedAt > a.updatedAt || (b.updatedAt === a.updatedAt && b.id > a.id) ? b : a));
  const coverage: CoverageState = latest.state === 'declined' ? 'declined' : latest.state === 'returned' ? 'returned' : latest.state === 'completed' ? 'reported_finished' : 'not_delegated';
  return {
    responsibilityId: latest.id,
    state: latest.state,
    coverage,
    holder: coverage === 'returned' ? SELF : holderOf(latest, directory),
    stillNeedsMe: shared,
    requestedAt: latest.requestedAt,
    ackDueAt: latest.ackDueAt,
    completedAt: latest.completedAt,
  };
}

// ------------------------------------------------------------------------------------------------------------ recurrence

/**
 * Recurrence FACTS from the shared rule. What is stored is the rule; the next occurrence is derived by the shared
 * `nextOccurrence` (only for an active `schedule` rule). A rule never becomes a completion, and a rule that cannot yield a date
 * (`after_completion`, `manual`) yields no date — none is invented.
 */
export function recurrenceFactOf(state: AppState, rules: readonly RecurrenceRule[], today: LocalDate): RecurrenceFact {
  // One active rule per subject is a stored invariant; otherwise the most recently updated rule describes the item.
  const active = rules.find((rule) => rule.status === 'active');
  const rule = active ?? rules.reduce<RecurrenceRule | null>((a, b) => (a === null || b.updatedAt > a.updatedAt ? b : a), null);
  if (rule === null) return { state: 'none', ruleId: null, rule: null, nextExpected: null, nextExpectedBasis: null };

  const description = { trigger: rule.trigger, frequency: rule.frequency, interval: rule.interval, byWeekday: rule.byWeekday, byMonthDay: rule.byMonthDay, anchorDate: rule.anchorDate };
  if (rule.status !== 'active') return { state: rule.status, ruleId: rule.id, rule: description, nextExpected: null, nextExpectedBasis: 'not_active' };
  if (rule.trigger !== 'schedule') return { state: 'active', ruleId: rule.id, rule: description, nextExpected: null, nextExpectedBasis: 'not_derivable' };
  return { state: 'active', ruleId: rule.id, rule: description, nextExpected: nextOccurrence(state, rule, today), nextExpectedBasis: 'schedule_rule' };
}
