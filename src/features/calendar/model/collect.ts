import { epochMsOf } from '../../../domain/logicalDay';
import { isActiveResponsibility, isUnacknowledged, type Responsibility } from '../../../domain/foundation/responsibility';
import type { Dependency, RecurrenceRule } from '../../../domain/foundation/structure';
import { refKey } from '../../../domain/foundation/typedRef';
import { needsMePersonally } from '../../../domain/responsibility';
import type { AppState, CalendarEvent, Task } from '../../../domain/state';
import { isDone } from '../../../domain/structure';
import { daysBetween, minuteOf, type DayFrame } from './timeFrame';
import type {
  Blocker,
  Coverage,
  DateOnly,
  DayItem,
  DayMode,
  ItemProgress,
  RecurrenceNote,
  ResponsibilityMark,
  Subject,
  TimedSpan,
  WindowFacets,
} from './types';

const MINUTE_MS = 60_000;

export interface CollectInput {
  state: AppState;
  frame: DayFrame;
  nowMs: number;
  mode: DayMode;
}

/** One pass over the collections so every per-item lookup below is a map read, not a scan. */
interface Indexes {
  children: Map<string, string>;
  people: Map<string, string>;
  responsibilities: Map<string, Responsibility[]>;
  requires: Map<string, Dependency[]>;
  recurrences: Map<string, RecurrenceRule[]>;
  events: Map<string, CalendarEvent>;
  tasks: Map<string, Task>;
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildIndexes(state: AppState): Indexes {
  const indexes: Indexes = {
    children: new Map(state.children.map((child) => [child.id, child.displayName])),
    people: new Map(state.people.map((person) => [person.id, person.displayName])),
    responsibilities: new Map(),
    requires: new Map(),
    recurrences: new Map(),
    events: new Map(state.events.map((event) => [event.id, event])),
    tasks: new Map(state.tasks.map((task) => [task.id, task])),
  };
  for (const r of state.responsibilities) pushTo(indexes.responsibilities, refKey(r.about), r);
  for (const d of state.dependencies) if (d.status === 'active' && d.relation === 'requires') pushTo(indexes.requires, refKey(d.from), d);
  for (const rule of state.recurrences) if (rule.status === 'active') pushTo(indexes.recurrences, refKey(rule.about), rule);
  return indexes;
}

function subjectOf(state: AppState, indexes: Indexes, memberId: string | null): Subject {
  if (memberId === null) return { kind: 'unstated' };
  if (memberId === state.user.id) return { kind: 'self' };
  const childName = indexes.children.get(memberId);
  return childName !== undefined ? { kind: 'child', childId: memberId, displayName: childName } : { kind: 'unresolved', memberId };
}

function coverageOf(state: Responsibility['state']): Coverage {
  switch (state) {
    case 'owned': return 'mine';
    case 'requested': return 'awaiting_response';
    case 'acknowledged': return 'acknowledged_not_accepted';
    case 'accepted': return 'accepted';
    case 'declined': return 'declined';
    case 'returned': return 'returned';
    case 'completed': return 'completed';
  }
}

/**
 * The live handoff if there is one, otherwise the most recent closed one (declined, returned,
 * completed). One live responsibility per thing is a foundation invariant.
 */
function responsibilityMark(
  state: AppState,
  indexes: Indexes,
  ref: { kind: 'event' | 'task'; id: string },
  nowMs: number
): ResponsibilityMark | null {
  const rows = indexes.responsibilities.get(refKey(ref));
  if (!rows || rows.length === 0) return null;
  const live = rows.find(isActiveResponsibility);
  const chosen = live ?? [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id.localeCompare(b.id)))[0];

  const coverage = coverageOf(chosen.state);
  const holder: ResponsibilityMark['holder'] =
    chosen.responsibleKind === 'person'
      ? { kind: 'person', id: chosen.responsiblePersonId ?? '', displayName: indexes.people.get(chosen.responsiblePersonId ?? '') ?? null }
      : chosen.responsibleKind === 'child'
        ? { kind: 'child', id: chosen.responsibleChildId ?? '', displayName: indexes.children.get(chosen.responsibleChildId ?? '') ?? null }
        : { kind: 'self' };

  return {
    responsibilityId: chosen.id,
    state: chosen.state,
    coverage,
    covered: coverage === 'accepted' || coverage === 'completed',
    holder,
    unacknowledged: isUnacknowledged(chosen, nowMs),
    stillNeedsMe: needsMePersonally(state, ref, nowMs),
  };
}

/**
 * The direct, unmet `requires` predecessors of an item (one hop, as the foundation offers).
 * A predecessor EVENT is resolved by its own interval rather than by `isDone`, which is true
 * only for a removed event and would block forever once an event has simply elapsed
 * (F03-FG-04). Nothing here is transitive.
 */
function blockersFor(state: AppState, indexes: Indexes, frame: DayFrame, nowMs: number, ref: { kind: 'event' | 'task'; id: string }): Blocker[] {
  const edges = indexes.requires.get(refKey(ref));
  if (!edges) return [];
  const blockers: Blocker[] = [];
  for (const edge of edges) {
    const target = edge.to;
    if (target.kind === 'event') {
      const event = indexes.events.get(target.id);
      if (!event || event.status !== 'active') continue;
      const finishMs = epochMsOf(event.endsAt);
      if (finishMs <= nowMs) continue;
      blockers.push({ edgeId: edge.id, ref: { kind: 'event', id: target.id }, title: event.title, finishMs, finishMinute: minuteOf(frame, finishMs) });
      continue;
    }
    if (isDone(state, target)) continue;
    if (target.kind === 'task') {
      const task = indexes.tasks.get(target.id);
      const timed = task && task.plan.kind === 'timed' && task.durationMinutes > 0 ? epochMsOf(task.plan.startsAt) + task.durationMinutes * MINUTE_MS : null;
      blockers.push({ edgeId: edge.id, ref: { kind: 'task', id: target.id }, title: task?.title ?? null, finishMs: timed, finishMinute: timed === null ? null : minuteOf(frame, timed) });
      continue;
    }
    blockers.push({ edgeId: edge.id, ref: { kind: target.kind, id: target.id }, title: null, finishMs: null, finishMinute: null });
  }
  return blockers;
}

function recurrenceNote(indexes: Indexes, ref: { kind: 'event' | 'task'; id: string }): RecurrenceNote | null {
  const rule = indexes.recurrences.get(refKey(ref))?.[0];
  return rule
    ? { ruleId: rule.id, frequency: rule.frequency, interval: rule.interval, trigger: rule.trigger, byWeekday: rule.byWeekday }
    : null;
}

function progressOf(mode: DayMode, span: TimedSpan, nowMs: number): ItemProgress {
  if (mode === 'past') return 'elapsed';
  if (mode === 'future') return 'upcoming';
  if (span.endKnown) return span.endMs <= nowMs ? 'elapsed' : span.startMs <= nowMs ? 'in_progress' : 'upcoming';
  return span.startMs > nowMs ? 'upcoming' : 'in_progress';
}

function entered(value: number | null | undefined): number | null {
  return value === undefined ? null : value;
}

const byTimedOrder = (a: DayItem, b: DayItem): number => {
  if (a.timing.kind !== 'timed' || b.timing.kind !== 'timed') return 0;
  return a.timing.startMs - b.timing.startMs || a.timing.endMs - b.timing.endMs || a.ref.id.localeCompare(b.ref.id);
};

const BASIS_ORDER: Record<DateOnly['basis'], number> = { overdue: 0, due: 1, planned: 2 };

const byDateOnlyOrder = (a: DayItem, b: DayItem): number => {
  if (a.timing.kind !== 'date_only' || b.timing.kind !== 'date_only') return 0;
  return (
    BASIS_ORDER[a.timing.basis] - BASIS_ORDER[b.timing.basis] ||
    b.timing.daysOverdue - a.timing.daysOverdue ||
    a.title.localeCompare(b.title) ||
    a.ref.id.localeCompare(b.ref.id)
  );
};

/**
 * Everything that belongs on one logical day, in display order: timed items chronologically
 * (the foundation's tie-break: start, end, id), then dated-but-untimed tasks.
 *
 * Membership of a day (D-07): events that touch it; open tasks timed on it, planned for it, or
 * due on it. Overdue tasks are a today-relative state, so only TODAY lists them (as the
 * foundation's `tomorrowPreview` does for tomorrow); a past day lists events and timed tasks.
 */
export function collectDayItems({ state, frame, nowMs, mode }: CollectInput): DayItem[] {
  const indexes = buildIndexes(state);
  const timed: DayItem[] = [];
  const dateOnly: DayItem[] = [];

  for (const event of state.events) {
    if (event.status !== 'active') continue;
    const start = epochMsOf(event.startsAt);
    const end = epochMsOf(event.endsAt);
    if (start >= frame.endMs || end <= frame.startMs) continue;

    const startMs = Math.max(start, frame.startMs);
    const endMs = Math.min(end, frame.endMs);
    const span: TimedSpan = {
      kind: 'timed',
      startMs,
      endMs,
      startMinute: minuteOf(frame, startMs),
      endMinute: minuteOf(frame, endMs),
      endKnown: true,
      continuesFromPreviousDay: start < frame.startMs,
      continuesIntoNextDay: end > frame.endMs,
    };
    const ref = { kind: 'event' as const, id: event.id };
    timed.push({
      ref,
      title: event.title,
      flexibility: event.commitment,
      timing: span,
      progress: progressOf(mode, span, nowMs),
      subject: subjectOf(state, indexes, event.subjectMemberId),
      location: event.location,
      transition: {
        travelBefore: entered(event.travelMinutesBefore),
        travelAfter: entered(event.travelMinutesAfter),
        preparation: entered(event.preparationMinutes),
      },
      durationMinutes: Math.round((end - start) / MINUTE_MS),
      durationBasis: 'event_span',
      window: null,
      responsibility: responsibilityMark(state, indexes, ref, nowMs),
      blockedBy: blockersFor(state, indexes, frame, nowMs, ref),
      repeats: recurrenceNote(indexes, ref),
      source: { categoryId: event.categoryId, subjectMemberId: event.subjectMemberId, rawDurationMinutes: null, dueDate: null },
    });
  }

  for (const task of state.tasks) {
    if (task.status !== 'open') continue;
    const plan = task.plan;
    const plannedStartMs = plan.kind === 'timed' ? epochMsOf(plan.startsAt) : null;
    const timedOnDay = plannedStartMs !== null && plannedStartMs >= frame.startMs && plannedStartMs < frame.endMs;
    if (mode === 'past' && !timedOnDay) continue;
    const plannedOnDay = plan.kind === 'day' && plan.date === frame.date;
    const dueOnDay = task.dueDate === frame.date;
    const overdueToday = mode === 'today' && task.dueDate !== null && task.dueDate < frame.date;
    if (!timedOnDay && !plannedOnDay && !dueOnDay && !overdueToday) continue;

    const usable = task.durationMinutes > 0 ? task.durationMinutes : null;
    const ref = { kind: 'task' as const, id: task.id };
    const window: WindowFacets = {
      earliestStartMs: task.earliestStartAt === null || task.earliestStartAt === undefined ? null : epochMsOf(task.earliestStartAt),
      latestFinishMs: task.latestFinishAt === null || task.latestFinishAt === undefined ? null : epochMsOf(task.latestFinishAt),
      dueAtMs: task.dueAt === null || task.dueAt === undefined ? null : epochMsOf(task.dueAt),
      splittable: task.splittable ?? null,
    };

    let timing: DayItem['timing'];
    let progress: ItemProgress;
    if (timedOnDay && plannedStartMs !== null) {
      const startMs = plannedStartMs;
      const rawEnd = usable === null ? startMs : startMs + usable * MINUTE_MS;
      const endMs = Math.min(rawEnd, frame.endMs);
      const span: TimedSpan = {
        kind: 'timed',
        startMs,
        endMs,
        startMinute: minuteOf(frame, startMs),
        endMinute: minuteOf(frame, endMs),
        endKnown: usable !== null,
        continuesFromPreviousDay: false,
        continuesIntoNextDay: rawEnd > frame.endMs,
      };
      timing = span;
      progress = progressOf(mode, span, nowMs);
    } else {
      const dateOnlyTiming: DateOnly = {
        kind: 'date_only',
        basis: overdueToday ? 'overdue' : dueOnDay ? 'due' : 'planned',
        dueDate: task.dueDate,
        daysOverdue: task.dueDate !== null && task.dueDate < frame.date ? daysBetween(task.dueDate, frame.date) : 0,
        plannedElsewhere:
          plan.kind === 'timed' && plannedStartMs !== null
            ? { kind: 'timed', startMs: plannedStartMs }
            : plan.kind === 'day' && plan.date !== frame.date
              ? { kind: 'day', date: plan.date }
              : null,
      };
      timing = dateOnlyTiming;
      progress = 'untimed';
    }

    const item: DayItem = {
      ref,
      title: task.title,
      flexibility: task.commitment,
      timing,
      progress,
      subject: subjectOf(state, indexes, task.subjectMemberId),
      location: null,
      transition: {
        travelBefore: entered(task.travelMinutesBefore),
        travelAfter: entered(task.travelMinutesAfter),
        preparation: entered(task.preparationMinutes),
      },
      durationMinutes: usable,
      durationBasis: usable === null ? 'none' : 'task_estimate',
      window,
      responsibility: responsibilityMark(state, indexes, ref, nowMs),
      blockedBy: blockersFor(state, indexes, frame, nowMs, ref),
      repeats: recurrenceNote(indexes, ref),
      source: { categoryId: task.categoryId, subjectMemberId: task.subjectMemberId, rawDurationMinutes: task.durationMinutes, dueDate: task.dueDate },
    };
    (timing.kind === 'timed' ? timed : dateOnly).push(item);
  }

  timed.sort(byTimedOrder);
  dateOnly.sort(byDateOnlyOrder);
  return [...timed, ...dateOnly];
}
