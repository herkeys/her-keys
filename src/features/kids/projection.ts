import { durationKnowledgeOf } from '../../domain/foundation/duration';
import { refKey, type TypedRef } from '../../domain/foundation/typedRef';
import { logicalDateAt, type LocalDate } from '../../domain/logicalDay';
import { attentionFor, type AttentionItem } from '../../domain/reasoning/attention';
import type { AppState, CalendarEvent, Task } from '../../domain/state';
import { blockersOf, readinessOf, unavailablePrerequisitesOf } from '../../domain/structure';
import { compareText, labelChildren, type ChildLabel } from './identity';
import { indexResponsibilities, planFromCoverage, responsibilityFactsOf, type ResponsibilityIndex } from './responsibility';
import { momentAt } from './time';
import type {
  AttentionEntry,
  ChildCard,
  ChildDetail,
  DependencyFact,
  ItemAction,
  ItemFact,
  KidsRef,
  KidsView,
  OpenWork,
  PlanFact,
  PlanRow,
  PrerequisiteFact,
  RecurrenceFact,
  ResponsibilityFacts,
  ScheduleFact,
  StepFact,
  UnknownFact,
} from './types';

/**
 * THE KIDS PROJECTION (HK-FEATURE-05).
 *
 *   buildKidsView(state, householdId, clock)            the hub: one card per child
 *   buildChildDetail(state, householdId, childId, clock) one child, in full
 *
 * Deterministic and read-only: the same state and clock give the same answer, and the canonical state is never touched. Kids is a
 * PROJECTION over rows other features and the calendar already own — a practice is still a `CalendarEvent`, a permission form is
 * still a `Task`, a pickup is still a `Responsibility`, and a child is still `state.children[i]`. There is no KidTask, no KidEvent.
 *
 * What it will not do: assign a row to a child by name or position, show a household-level row under a child, count an assigned
 * item as covered, read a removed prerequisite as done, or invent an urgency. Where the shared attention primitive has an answer it
 * is consumed unchanged; where it has none, only the recorded fact is stated.
 */

export interface KidsClock {
  nowMs: number;
}

/** Sorts after every real string: undated things go last. Built from a code point so the source holds no invisible character. */
const LAST = String.fromCharCode(0xffff);

const URGENCY_RANK = { now: 0, today: 1, soon: 2 } as const;

interface Ctx {
  state: AppState;
  nowMs: number;
  today: LocalDate;
  timeZone: string;
  childIds: Set<string>;
  tasksById: Map<string, Task>;
  eventsById: Map<string, CalendarEvent>;
  responsibility: ResponsibilityIndex;
  responsibilityById: Map<string, AppState['responsibilities'][number]>;
  stepsByParent: Map<string, StepFact[]>;
  requiresCount: Map<string, number>;
  rules: Map<string, RecurrenceFact>;
  /** Computed on first use: building one item does not need the whole household's attention. */
  attention: AttentionItem[] | null;
  intentAbout: Map<string, TypedRef | null>;
}

function createCtx(state: AppState, clock: KidsClock): Ctx {
  const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
  const stepsByParent = new Map<string, StepFact[]>();
  const requiresCount = new Map<string, number>();
  for (const edge of state.dependencies) {
    if (edge.status !== 'active') continue;
    if (edge.relation === 'requires') requiresCount.set(refKey(edge.from), (requiresCount.get(refKey(edge.from)) ?? 0) + 1);
    if (edge.relation === 'part_of' && edge.from.kind === 'task') {
      const step = tasksById.get(edge.from.id);
      if (!step) continue;
      const list = stepsByParent.get(refKey(edge.to)) ?? [];
      list.push({ ref: { kind: 'task', id: step.id }, title: step.title, status: step.status });
      stepsByParent.set(refKey(edge.to), list);
    }
  }
  for (const list of stepsByParent.values()) list.sort((a, b) => compareText(a.ref.id, b.ref.id));

  const rules = new Map<string, RecurrenceFact>();
  for (const rule of state.recurrences) {
    if (rule.status === 'active') rules.set(refKey(rule.about), { frequency: rule.frequency, interval: rule.interval, byWeekday: rule.byWeekday });
  }

  return {
    state,
    nowMs: clock.nowMs,
    today: logicalDateAt(clock.nowMs, state.user.timezone),
    timeZone: state.user.timezone,
    childIds: new Set(state.children.map((child) => child.id)),
    tasksById,
    eventsById: new Map(state.events.map((event) => [event.id, event])),
    responsibility: indexResponsibilities(state),
    responsibilityById: new Map(state.responsibilities.map((row) => [row.id, row])),
    stepsByParent,
    requiresCount,
    rules,
    attention: null,
    intentAbout: new Map(state.intents.map((intent) => [intent.id, intent.about])),
  };
}

function titleOfRef(state: AppState, ref: TypedRef): string | null {
  switch (ref.kind) {
    case 'task':
      return state.tasks.find((row) => row.id === ref.id)?.title ?? null;
    case 'event':
      return state.events.find((row) => row.id === ref.id)?.title ?? null;
    case 'needsMe':
      return state.needsMe.find((row) => row.id === ref.id)?.title ?? null;
    case 'goal':
      return state.goals.find((row) => row.id === ref.id)?.title ?? null;
    case 'system':
      return state.systems.find((row) => row.id === ref.id)?.name ?? null;
    case 'meal':
      return state.meals.find((row) => row.id === ref.id)?.title ?? null;
    default:
      return null;
  }
}

function dependencyFactOf(c: Ctx, ref: TypedRef): DependencyFact | null {
  if ((c.requiresCount.get(refKey(ref)) ?? 0) === 0) return null;
  const waitingOn: PrerequisiteFact[] = blockersOf(c.state, ref).map((to) => ({ ref: to, title: titleOfRef(c.state, to), cause: 'pending' }));
  const unavailable: PrerequisiteFact[] = unavailablePrerequisitesOf(c.state, ref).map((entry) => ({
    ref: entry.ref,
    title: titleOfRef(c.state, entry.ref),
    cause: entry.cause,
  }));
  return { readiness: readinessOf(c.state, ref), waitingOn, unavailable };
}

function actionsOf(kind: KidsRef['kind'], responsibility: ResponsibilityFacts, plan: PlanFact | null): ItemAction[] {
  const out: ItemAction[] = ['edit'];
  if (kind === 'task') out.push('mark_done');
  out.push('remove');
  if (!responsibility.live) {
    out.push('request_handoff');
  } else if (responsibility.holder !== null) {
    if (responsibility.lifecycle === 'requested') out.push('record_acknowledged', 'record_accepted', 'record_declined', 'take_back');
    else if (responsibility.lifecycle === 'acknowledged') out.push('record_accepted', 'record_declined', 'take_back');
    else if (responsibility.lifecycle === 'accepted') out.push('take_back');
  }
  if (plan !== null && plan.label !== 'PLAN_IN_PLACE') out.push('add_plan_step');
  return out;
}

function planOf(c: Ctx, ref: KidsRef, responsibility: ResponsibilityFacts, steps: StepFact[]): PlanFact | null {
  // An upcoming event is always a plan subject: what is (or is not) arranged around it is exactly the question.
  // A task is one only once somebody has been asked, has answered or has handed it back.
  if (ref.kind === 'task' && responsibility.coverage === 'nobody_recorded') return null;
  const { label, reason } = planFromCoverage(responsibility.coverage);
  return { label, reason, relies: responsibility.holder, openSteps: steps.filter((step) => step.status === 'open') };
}

function unknownsOf(kind: KidsRef['kind'], where: string | null, schedule: ScheduleFact | null, due: unknown, responsibility: ResponsibilityFacts, lengthConfirmed: boolean | null): UnknownFact[] {
  const out: UnknownFact[] = [];
  if (kind === 'event' && where === null) out.push('location');
  if (kind === 'task' && schedule === null && due === null) out.push('when');
  if (responsibility.coverage === 'nobody_recorded') out.push('who_is_handling');
  if (kind === 'task' && lengthConfirmed === false) out.push('length_confirmed');
  return out;
}

function eventItem(c: Ctx, event: CalendarEvent, childId: string): ItemFact {
  const ref: KidsRef = { kind: 'event', id: event.id };
  const start = momentAt(Date.parse(event.startsAt), c.timeZone);
  const end = momentAt(Date.parse(event.endsAt), c.timeZone);
  const schedule: ScheduleFact = {
    kind: 'timed',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    localDate: start.localDate,
    startMinutes: start.minutesOfDay,
    endMinutes: end.minutesOfDay,
    endsLocalDate: end.localDate,
  };
  const responsibility = responsibilityFactsOf(c.state, ref, c.nowMs, c.responsibility);
  const steps = c.stepsByParent.get(refKey(ref)) ?? [];
  const plan = planOf(c, ref, responsibility, steps);
  const hasTransition = event.preparationMinutes !== null || event.travelMinutesBefore !== null || event.travelMinutesAfter !== null;
  return {
    ref,
    childId,
    title: event.title,
    flexibility: event.commitment,
    schedule,
    due: null,
    where: event.location,
    notes: event.notes,
    duration: null,
    preparation: hasTransition
      ? { preparationMinutes: event.preparationMinutes, travelBefore: event.travelMinutesBefore, travelAfter: event.travelMinutesAfter }
      : null,
    responsibility,
    dependency: dependencyFactOf(c, ref),
    steps,
    repeats: c.rules.get(refKey(ref)) ?? null,
    plan,
    unknownFacts: unknownsOf('event', event.location, schedule, null, responsibility, null),
    actions: actionsOf('event', responsibility, plan),
  };
}

function taskItem(c: Ctx, task: Task, childId: string): ItemFact {
  const ref: KidsRef = { kind: 'task', id: task.id };
  let schedule: ScheduleFact | null = null;
  if (task.plan.kind === 'timed') {
    const at = momentAt(Date.parse(task.plan.startsAt), c.timeZone);
    schedule = { kind: 'timed', startsAt: task.plan.startsAt, endsAt: null, localDate: at.localDate, startMinutes: at.minutesOfDay, endMinutes: null, endsLocalDate: null };
  } else if (task.plan.kind === 'day') {
    schedule = { kind: 'day', localDate: task.plan.date };
  }
  const due = task.dueDate === null ? null : { date: task.dueDate, at: task.dueAt };
  const knowledge = durationKnowledgeOf(task);
  const responsibility = responsibilityFactsOf(c.state, ref, c.nowMs, c.responsibility);
  const steps = c.stepsByParent.get(refKey(ref)) ?? [];
  const plan = planOf(c, ref, responsibility, steps);
  const hasTransition = task.preparationMinutes !== null || task.travelMinutesBefore !== null || task.travelMinutesAfter !== null;
  return {
    ref,
    childId,
    title: task.title,
    flexibility: task.commitment,
    schedule,
    due,
    where: null,
    notes: task.notes,
    duration: { minutes: task.durationMinutes, knowledge },
    preparation: hasTransition
      ? { preparationMinutes: task.preparationMinutes, travelBefore: task.travelMinutesBefore, travelAfter: task.travelMinutesAfter }
      : null,
    responsibility,
    dependency: dependencyFactOf(c, ref),
    steps,
    repeats: c.rules.get(refKey(ref)) ?? null,
    plan,
    unknownFacts: unknownsOf('task', null, schedule, due, responsibility, knowledge === 'user-provided'),
    actions: actionsOf('task', responsibility, plan),
  };
}

// ---------------------------------------------------------------- ordering ---

const startMs = (item: ItemFact): number => (item.schedule?.kind === 'timed' ? Date.parse(item.schedule.startsAt) : Number.POSITIVE_INFINITY);

const compareUpcoming = (a: ItemFact, b: ItemFact): number => startMs(a) - startMs(b) || compareText(a.ref.kind, b.ref.kind) || compareText(a.ref.id, b.ref.id);

/** Due date, then when it was captured, then id. Undated last. No hidden score. */
function compareWork(c: Ctx) {
  return (a: ItemFact, b: ItemFact): number => {
    const dueA = a.due?.date ?? LAST;
    const dueB = b.due?.date ?? LAST;
    const createdA = c.tasksById.get(a.ref.id)?.createdAt ?? LAST;
    const createdB = c.tasksById.get(b.ref.id)?.createdAt ?? LAST;
    return compareText(dueA, dueB) || compareText(createdA, createdB) || compareText(a.ref.id, b.ref.id);
  };
}

const entryRank = (entry: AttentionEntry): number => (entry.source === 'shared' && entry.urgency !== null ? URGENCY_RANK[entry.urgency] : 3);

function compareEntries(a: AttentionEntry, b: AttentionEntry): number {
  return (
    entryRank(a) - entryRank(b) ||
    compareText(a.date ?? LAST, b.date ?? LAST) ||
    compareText(a.ref.kind, b.ref.kind) ||
    compareText(a.ref.id, b.ref.id) ||
    compareText(a.code, b.code)
  );
}

// -------------------------------------------------------------- attention ---

function resolveAbout(c: Ctx, about: TypedRef): { ref: KidsRef; childId: string } | null {
  if (about.kind === 'task') {
    const task = c.tasksById.get(about.id);
    return task && task.status === 'open' && task.subjectMemberId !== null && c.childIds.has(task.subjectMemberId)
      ? { ref: { kind: 'task', id: task.id }, childId: task.subjectMemberId }
      : null;
  }
  if (about.kind === 'event') {
    const event = c.eventsById.get(about.id);
    return event && event.status === 'active' && event.subjectMemberId !== null && c.childIds.has(event.subjectMemberId)
      ? { ref: { kind: 'event', id: event.id }, childId: event.subjectMemberId }
      : null;
  }
  if (about.kind === 'responsibility') {
    const row = c.responsibilityById.get(about.id);
    return row ? resolveAbout(c, row.about) : null;
  }
  if (about.kind === 'intent') {
    const target = c.intentAbout.get(about.id);
    return target ? resolveAbout(c, target) : null;
  }
  return null;
}

function dateOfRef(c: Ctx, ref: KidsRef): LocalDate | null {
  if (ref.kind === 'task') return c.tasksById.get(ref.id)?.dueDate ?? null;
  const event = c.eventsById.get(ref.id);
  return event ? momentAt(Date.parse(event.startsAt), c.timeZone).localDate : null;
}

const SHARED_CODES = new Set(['deadline', 'risk', 'unacknowledged_delegation', 'external_source_changed', 'approval_required']);

function sharedEntries(c: Ctx, childId: string): AttentionEntry[] {
  const out: AttentionEntry[] = [];
  const seen = new Set<string>();
  c.attention ??= attentionFor(c.state, c.nowMs);
  for (const item of c.attention) {
    // Whole-day judgments (conflict, capacity) and captured Needs Me items name no child: not shown here.
    if (item.about === null || !SHARED_CODES.has(item.reason)) continue;
    const resolved = resolveAbout(c, item.about);
    if (resolved === null || resolved.childId !== childId) continue;
    const key = `${refKey(resolved.ref)}|${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ref: resolved.ref,
      childId,
      source: 'shared',
      code: item.reason as AttentionEntry['code'],
      urgency: item.urgency,
      date: dateOfRef(c, resolved.ref),
    });
  }
  return out;
}

function factEntries(c: Ctx, items: readonly ItemFact[]): AttentionEntry[] {
  const out: AttentionEntry[] = [];
  for (const item of items) {
    const push = (code: AttentionEntry['code']) =>
      out.push({ ref: item.ref, childId: item.childId, source: 'fact', code, urgency: null, date: dateOfRef(c, item.ref) });
    switch (item.responsibility.coverage) {
      case 'asked_no_answer':
      case 'seen_not_accepted':
        push('not_accepted');
        break;
      case 'declined':
      case 'handed_back':
        push('handed_back');
        break;
      case 'holder_unavailable':
        push('holder_unavailable');
        break;
      default:
        break;
    }
    if (item.dependency?.readiness === 'needsReview') push('prerequisite_unavailable');
  }
  return out;
}

// --------------------------------------------------------------- per child ---

interface Bucket {
  tasks: Task[];
  events: CalendarEvent[];
  anyRecords: boolean;
}

function bucketByChild(c: Ctx): { buckets: Map<string, Bucket>; unattributed: number } {
  const buckets = new Map<string, Bucket>();
  let unattributed = 0;
  const bucketFor = (childId: string) => {
    let bucket = buckets.get(childId);
    if (!bucket) {
      bucket = { tasks: [], events: [], anyRecords: false };
      buckets.set(childId, bucket);
    }
    return bucket;
  };
  const isOrphan = (subject: string | null) => subject !== null && subject !== c.state.user.id && !c.childIds.has(subject);

  for (const task of c.state.tasks) {
    if (task.subjectMemberId !== null && c.childIds.has(task.subjectMemberId)) {
      const bucket = bucketFor(task.subjectMemberId);
      bucket.anyRecords = true;
      if (task.status === 'open') bucket.tasks.push(task);
    } else if (task.status === 'open' && isOrphan(task.subjectMemberId)) {
      unattributed += 1;
    }
  }
  for (const event of c.state.events) {
    if (event.subjectMemberId !== null && c.childIds.has(event.subjectMemberId)) {
      const bucket = bucketFor(event.subjectMemberId);
      bucket.anyRecords = true;
      if (event.status === 'active') bucket.events.push(event);
    } else if (event.status === 'active' && isOrphan(event.subjectMemberId)) {
      unattributed += 1;
    }
  }
  return { buckets, unattributed };
}

function detailFor(c: Ctx, label: ChildLabel, bucket: Bucket | undefined): ChildDetail {
  const childId = label.childId;
  const events = (bucket?.events ?? []).filter((event) => Date.parse(event.endsAt) > c.nowMs).map((event) => eventItem(c, event, childId));
  const tasks = (bucket?.tasks ?? []).map((task) => taskItem(c, task, childId));

  const timedTasks = tasks.filter((item) => item.schedule?.kind === 'timed' && Date.parse(item.schedule.startsAt) >= c.nowMs);
  const upcoming = [...events, ...timedTasks].sort(compareUpcoming);

  const openWork: OpenWork = { needsYou: [], withSomeoneElse: [], waiting: [], nobodyRecorded: [] };
  for (const item of tasks) {
    const r = item.responsibility;
    // `needsMePersonally` never looks at whether the holder is still a person on her list, so an accepted, off-her-list handoff to
    // somebody since archived still reads "does not need her". The record is left exactly as the foundation answered (`requiresYou`);
    // Kids just refuses to file such an item under "someone else has it" (foundation observation MP-K-16).
    if (r.requiresYou === true || r.coverage === 'holder_unavailable') openWork.needsYou.push(item);
    else if (r.live && r.holder !== null) openWork.withSomeoneElse.push(item);
    else if (item.dependency?.readiness === 'blocked') openWork.waiting.push(item);
    else openWork.nobodyRecorded.push(item);
  }
  const byWork = compareWork(c);
  for (const list of Object.values(openWork)) list.sort(byWork);

  const everyItem = [...events, ...tasks];
  // A reason is only ever shown next to an item the projection also returns (an event that already ended has no row to open).
  const known = new Set(everyItem.map((item) => refKey(item.ref)));
  const shared = sharedEntries(c, childId).filter((entry) => known.has(refKey(entry.ref)));
  const facts = factEntries(c, everyItem);
  const needsAttention = [...shared, ...facts].sort(compareEntries);

  const plans: PlanRow[] = everyItem
    .filter((item): item is ItemFact & { plan: PlanFact } => item.plan !== null)
    .sort(compareUpcoming)
    .map((item) => ({ item, plan: item.plan }));

  const routines = c.state.systems
    .filter((system) => system.subjectMemberId === childId)
    .map((system) => ({ id: system.id, name: system.name }))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));

  return { childId, today: c.today, label, upcoming, needsAttention, openWork, routines, plans };
}

function cardOf(detail: ChildDetail, hasAnyRecords: boolean): ChildCard {
  const seen = new Set<string>();
  let waitingOnOthers = 0;
  for (const row of [...detail.upcoming, ...Object.values(detail.openWork).flat()]) {
    const key = refKey(row.ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const coverage = row.responsibility.coverage;
    if (coverage === 'asked_no_answer' || coverage === 'seen_not_accepted' || coverage === 'reply_overdue' || coverage === 'accepted_still_yours') waitingOnOthers += 1;
  }
  return {
    childId: detail.childId,
    label: detail.label,
    next: detail.upcoming[0] ?? null,
    needsYouCount: detail.openWork.needsYou.length,
    waitingOnOthersCount: waitingOnOthers,
    planGapCount: detail.plans.filter((row) => row.plan.label === 'NEEDS_A_PLAN').length,
    attentionCount: new Set(detail.needsAttention.map((entry) => refKey(entry.ref))).size,
    hasAnyRecords,
  };
}

// ------------------------------------------------------------------ public ---

/** The hub. A request for a household other than the one the state holds returns nothing of it. */
export function buildKidsView(state: AppState, householdId: string, clock: KidsClock): KidsView {
  const today = logicalDateAt(clock.nowMs, state.user.timezone);
  if (state.household.id !== householdId) return { householdId, status: 'household_mismatch', today, children: [], unattributed: 0 };

  const c = createCtx(state, clock);
  const { buckets, unattributed } = bucketByChild(c);
  const labels = labelChildren(state.children, c.today);
  const children = labels.map((label) => {
    const bucket = buckets.get(label.childId);
    return cardOf(detailFor(c, label, bucket), bucket?.anyRecords ?? false);
  });
  return { householdId, status: 'ok', today: c.today, children, unattributed };
}

/** One child in full, or null when the household differs or no such child exists. */
export function buildChildDetail(state: AppState, householdId: string, childId: string, clock: KidsClock): ChildDetail | null {
  if (state.household.id !== householdId) return null;
  const c = createCtx(state, clock);
  const label = labelChildren(state.children, c.today).find((entry) => entry.childId === childId);
  if (!label) return null;
  const { buckets } = bucketByChild(c);
  return detailFor(c, label, buckets.get(childId));
}

/** One child-linked item's facts, or null when it is gone, finished, not a child's, or the household differs. */
export function buildItemFact(state: AppState, householdId: string, ref: KidsRef, clock: KidsClock): ItemFact | null {
  if (state.household.id !== householdId) return null;
  const c = createCtx(state, clock);
  if (ref.kind === 'task') {
    const task = c.tasksById.get(ref.id);
    return task && task.status === 'open' && task.subjectMemberId !== null && c.childIds.has(task.subjectMemberId) ? taskItem(c, task, task.subjectMemberId) : null;
  }
  const event = c.eventsById.get(ref.id);
  return event && event.status === 'active' && event.subjectMemberId !== null && c.childIds.has(event.subjectMemberId) ? eventItem(c, event, event.subjectMemberId) : null;
}
