import { durationKnowledgeOf } from '../../../domain/foundation/duration';
import type { BehaviorObservation } from '../../../domain/foundation/observation';
import { isActiveResponsibility, type Responsibility } from '../../../domain/foundation/responsibility';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import { refKey, type TypedRef } from '../../../domain/foundation/typedRef';
import { addDays, epochMsOf, logicalDateAt, zonedTimeToEpochMs, type LocalDate } from '../../../domain/logicalDay';
import { attentionFor, type AttentionItem, type AttentionUrgency } from '../../../domain/reasoning/attention';
import type { AppState, CalendarEvent, HouseholdSystem, Task } from '../../../domain/state';
import { readinessOf, standingOf } from '../../../domain/structure';
import { lastDoneOf, recurrenceFactOf, responsibilityFactOf, taskTiming, visitWhen, type HolderDirectory } from './facts';
import { homeContextOf, homeLabelOf, isHomeRecord, type HomeContext } from './homeContext';
import type {
  AttentionFact,
  DependencyFact,
  DurationFact,
  HolderFact,
  HomeAction,
  HomeItem,
  HomeSection,
  HomeSectionKey,
  HomeView,
  LastDoneFact,
  PrerequisiteFact,
  RecurrenceFact,
  ResponsibilityFact,
  ResolutionState,
  ScheduledState,
  TimingFact,
  UnknownFact,
} from './types';

/** How far ahead "Coming up" looks for a task's due or planned day. Visits are listed however far off they are. */
export const COMING_UP_DAYS = 14;
/** "Recently done" looks back this many logical days. */
export const RECENTLY_DONE_DAYS = 30;
/** Past visits are listed for this many logical days. Their outcome is not known; the list only says so. */
export const PAST_VISIT_DAYS = 7;

const URGENCY_RANK: Record<AttentionUrgency, number> = { now: 0, today: 1, soon: 2 };

const cmpText = (a: string, b: string): number => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
};

/**
 * THE HOME PROJECTION — `buildHomeView(state, nowMs)`.
 *
 * One bounded, deterministic, read-only reading of canonical household state through the Home context. It composes what the
 * common foundation already knows (tasks, events, Systems, recurrence rules, responsibility, dependency standing, duration
 * knowledge, completion evidence, shared attention) and adds no domain reasoning of its own: no score, no priority, no risk.
 *
 * It never mutates `state`. Its only clock input is `nowMs`, and it uses it for exactly two things: the household's logical day
 * (`today`) and instant-level facts that genuinely change — a visit being under way or over, and a request passing the time an
 * answer was due. Identical canonical state evaluated at 08:00, 15:00 and 21:00 of one logical day therefore differs only in those.
 */
export function buildHomeView(state: AppState, nowMs: number): HomeView {
  const timeZone = state.user.timezone;
  const today = logicalDateAt(nowMs, timeZone);
  const context = homeContextOf(state);
  const label = homeLabelOf(context);

  if (context.kind === 'missing') {
    return { context, label, today, items: [], sections: emptySections(), coverage: { scope: 'saved_under_home_context', recordsConsidered: 0 }, canCreate: false, holders: [] };
  }

  const tasks = state.tasks.filter((task) => isHomeRecord(context, task));
  const events = state.events.filter((event) => isHomeRecord(context, event));
  const systems = state.systems.filter((system) => isHomeRecord(context, system));

  const index = buildIndex(state);
  const directory: HolderDirectory = { people: index.people, children: index.children };

  const attention = attentionByItem(state, nowMs, index, tasks, events);
  const items: HomeItem[] = [];

  const recentlyDoneFrom = addDays(today, -RECENTLY_DONE_DAYS);
  for (const task of tasks) {
    if (task.status === 'archived') continue; // set aside is not completed, and it is not something she still has to carry
    const ref: TypedRef = { kind: 'task', id: task.id };
    const key = refKey(ref);
    const recurrence = recurrenceFactOf(state, index.rules.get(key) ?? [], today);
    const lastDone = lastDoneOf({ kind: 'task', completions: index.completions.get(key) ?? [], taskCompletedAt: task.status === 'completed' ? task.completedAt : null, timeZone });

    // A completed task stays in Home only while it says something: it repeats, or it was marked done recently.
    if (task.status === 'completed') {
      const repeats = recurrence.state === 'active' || recurrence.state === 'paused';
      const recent = lastDone !== null && lastDone.date >= recentlyDoneFrom;
      if (!repeats && !recent) continue;
    }
    items.push(taskItem({ state, context, task, ref, key, today, nowMs, timeZone, index, directory, recurrence, lastDone, attention: attention.get(key) ?? [] }));
  }

  const pastVisitsFrom = zonedTimeToEpochMs(addDays(today, -PAST_VISIT_DAYS), 0, timeZone);
  for (const event of events) {
    if (event.status === 'removed') continue;
    if (epochMsOf(event.endsAt) < pastVisitsFrom) continue;
    const ref: TypedRef = { kind: 'event', id: event.id };
    const key = refKey(ref);
    items.push(eventItem({ state, context, event, ref, key, today, nowMs, timeZone, index, directory, attention: attention.get(key) ?? [] }));
  }

  for (const system of systems) {
    const ref: TypedRef = { kind: 'system', id: system.id };
    const key = refKey(ref);
    items.push(systemItem({ state, context, system, ref, key, today, nowMs, timeZone, index, directory }));
  }

  items.sort((a, b) => (a.homeItemId < b.homeItemId ? -1 : a.homeItemId > b.homeItemId ? 1 : 0));

  return {
    context,
    label,
    today,
    items,
    sections: sectionsOf(items, today),
    coverage: { scope: 'saved_under_home_context', recordsConsidered: tasks.length + events.length + systems.length },
    canCreate: context.kind === 'active',
    holders: holdersOf(state),
  };
}

export const homeItemOf = (view: HomeView, homeItemId: string): HomeItem | null => view.items.find((item) => item.homeItemId === homeItemId) ?? null;

// ---------------------------------------------------------------------------------------------------------------- index

interface Index {
  completions: Map<string, BehaviorObservation[]>;
  rules: Map<string, RecurrenceRule[]>;
  responsibilities: Map<string, Responsibility[]>;
  responsibilityById: Map<string, Responsibility>;
  prerequisites: Map<string, TypedRef[]>;
  people: Map<string, AppState['people'][number]>;
  children: Map<string, AppState['children'][number]>;
  titleOf: (ref: TypedRef) => string;
}

const push = <V>(map: Map<string, V[]>, key: string, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** One pass over each collection, so the projection stays linear in the household however many Home records there are. */
function buildIndex(state: AppState): Index {
  const completions = new Map<string, BehaviorObservation[]>();
  for (const observation of state.observations) {
    if (observation.outcome === 'completed' && (observation.about.kind === 'task' || observation.about.kind === 'system')) push(completions, refKey(observation.about), observation);
  }
  const rules = new Map<string, RecurrenceRule[]>();
  for (const rule of state.recurrences) push(rules, refKey(rule.about), rule);
  const responsibilities = new Map<string, Responsibility[]>();
  const responsibilityById = new Map<string, Responsibility>();
  for (const responsibility of state.responsibilities) {
    push(responsibilities, refKey(responsibility.about), responsibility);
    responsibilityById.set(responsibility.id, responsibility);
  }
  const prerequisites = new Map<string, TypedRef[]>();
  for (const dependency of state.dependencies) {
    if (dependency.status === 'active' && dependency.relation === 'requires') push(prerequisites, refKey(dependency.from), dependency.to);
  }

  let titles: Map<string, string> | null = null;
  const titleOf = (ref: TypedRef): string => {
    if (titles === null) {
      titles = new Map();
      for (const t of state.tasks) titles.set(`task:${t.id}`, t.title);
      for (const e of state.events) titles.set(`event:${e.id}`, e.title);
      for (const n of state.needsMe) titles.set(`needsMe:${n.id}`, n.title);
      for (const g of state.goals) titles.set(`goal:${g.id}`, g.title);
      for (const s of state.systems) titles.set(`system:${s.id}`, s.name);
      for (const m of state.meals) titles.set(`meal:${m.id}`, m.title);
    }
    return titles.get(refKey(ref)) ?? 'Something that is no longer here';
  };

  return {
    completions,
    rules,
    responsibilities,
    responsibilityById,
    prerequisites,
    people: new Map(state.people.map((person) => [person.id, person])),
    children: new Map(state.children.map((child) => [child.id, child])),
    titleOf,
  };
}

/** People she can hand something to: active people and her children. Sorted, so the order never depends on insertion. */
function holdersOf(state: AppState): HolderFact[] {
  const holders: HolderFact[] = [
    ...state.people.filter((person) => person.status === 'active').map((person): HolderFact => ({ kind: 'person', id: person.id, name: person.displayName, relationship: person.relationship })),
    ...state.children.map((child): HolderFact => ({ kind: 'child', id: child.id, name: child.displayName, relationship: null })),
  ];
  return holders.sort((a, b) => cmpText(a.name, b.name) || cmpText(a.kind, b.kind) || cmpText(a.id ?? '', b.id ?? ''));
}

// -------------------------------------------------------------------------------------------------------------- attention

/**
 * The shared attention derivation, kept only where it is about a Home record. `attentionFor` is asked once for the whole
 * household; Home does not re-derive urgency, and it does not invent any.
 */
function attentionByItem(state: AppState, nowMs: number, index: Index, tasks: Task[], events: CalendarEvent[]): Map<string, AttentionFact[]> {
  const home = new Set<string>([...tasks.map((t) => `task:${t.id}`), ...events.map((e) => `event:${e.id}`)]);
  const byItem = new Map<string, AttentionFact[]>();
  for (const item of attentionFor(state, nowMs)) {
    const key = itemKeyOf(item, index);
    if (key === null || !home.has(key)) continue;
    push(byItem, key, { reason: item.reason, urgency: item.urgency });
  }
  return byItem;
}

function itemKeyOf(item: AttentionItem, index: Index): string | null {
  if (item.about === null) return null;
  if (item.about.kind === 'responsibility') {
    const responsibility = index.responsibilityById.get(item.about.id);
    return responsibility === undefined ? null : refKey(responsibility.about);
  }
  // Only what Home shows: an approval, a capture or a household-wide condition is not a Home item's attention.
  return item.about.kind === 'task' || item.about.kind === 'event' ? refKey(item.about) : null;
}

// ----------------------------------------------------------------------------------------------------------------- items

interface Common {
  state: AppState;
  context: Exclude<HomeContext, { kind: 'missing' }>;
  key: string;
  today: LocalDate;
  nowMs: number;
  timeZone: string;
  index: Index;
  directory: HolderDirectory;
}

function dependencyFactOf(state: AppState, ref: TypedRef, key: string, index: Index): DependencyFact {
  const required = index.prerequisites.get(key) ?? [];
  if (required.length === 0) return { readiness: 'none', prerequisites: [] };
  const prerequisites: PrerequisiteFact[] = required.map((to) => {
    const standing = standingOf(state, to);
    return { ref: { kind: to.kind, id: to.id }, title: index.titleOf(to), standing: standing.standing, cause: standing.standing === 'unavailable' ? standing.cause : null };
  });
  return { readiness: readinessOf(state, ref), prerequisites };
}

function taskItem(input: Common & { task: Task; ref: TypedRef; recurrence: RecurrenceFact; lastDone: LastDoneFact | null; attention: AttentionFact[] }): HomeItem {
  const { state, context, task, ref, key, today, nowMs, timeZone, index, directory, recurrence, lastDone } = input;
  const resolution: ResolutionState = task.status === 'open' ? 'unresolved' : 'marked_done';
  const open = task.status === 'open';
  const timing: TimingFact[] = open ? taskTiming(task, today, timeZone) : [];
  const responsibility = responsibilityFactOf(state, ref, index.responsibilities.get(key) ?? [], nowMs, directory);
  const dependency = dependencyFactOf(state, ref, key, index);
  const knowledge = durationKnowledgeOf(task);
  const duration: DurationFact = { kind: 'task', minutes: task.durationMinutes, knowledge };

  const unknownFacts: UnknownFact[] = [];
  if (open) {
    if (knowledge === 'unrecorded') unknownFacts.push('duration_unrecorded');
    else if (knowledge === 'default-estimate') unknownFacts.push('duration_default_estimate');
    else if (knowledge === 'inferred-estimate') unknownFacts.push('duration_inferred_estimate');
    if (task.dueDate === null && task.plan.kind === 'unplanned') unknownFacts.push('no_due_date');
  }
  const repeats = recurrence.state === 'active' || recurrence.state === 'paused';
  if (repeats && lastDone === null) unknownFacts.push('no_completion_recorded');
  if (recurrence.nextExpectedBasis === 'not_derivable') unknownFacts.push('next_date_not_derivable');
  if (!open) unknownFacts.push('condition_not_verified');
  if (responsibility.holder?.relationship === 'contractor') unknownFacts.push('provider_not_verified');

  const scheduledState: ScheduledState = !open ? 'not_scheduled' : task.plan.kind === 'day' ? 'planned_day' : task.plan.kind === 'timed' ? 'planned_time' : 'not_scheduled';

  return {
    homeItemId: key,
    canonicalKind: 'task',
    entityId: task.id,
    title: task.title,
    homeContextId: context.category.id,
    homeSystemRole: 'home',
    resolutionState: resolution,
    scheduledState,
    timing,
    attentionFacts: open ? input.attention : [],
    responsibility,
    dependency,
    duration,
    recurrence,
    lastDoneApplicable: true,
    lastDone,
    unknownFacts,
    availableActions: taskActions(task, responsibility, recurrence, state.people.length + state.children.length > 0),
    notes: task.notes,
    location: null,
  };
}

function eventItem(input: Common & { event: CalendarEvent; ref: TypedRef; attention: AttentionFact[] }): HomeItem {
  const { state, context, event, ref, key, today, nowMs, timeZone, index, directory } = input;
  const visit = visitWhen(event, nowMs, today, timeZone);
  const over = visit.when === 'past' || visit.when === 'earlier_today';
  const responsibility = responsibilityFactOf(state, ref, index.responsibilities.get(key) ?? [], nowMs, directory);
  const dependency = dependencyFactOf(state, ref, key, index);
  const minutes = Math.round((epochMsOf(event.endsAt) - epochMsOf(event.startsAt)) / 60_000);

  const unknownFacts: UnknownFact[] = [];
  // SERVICE SCHEDULED != SERVICE COMPLETED: the calendar does not know whether a visit happened, and Home does not guess.
  if (over) unknownFacts.push('visit_outcome_unknown');
  if (responsibility.holder?.relationship === 'contractor') unknownFacts.push('provider_not_verified');

  return {
    homeItemId: key,
    canonicalKind: 'event',
    entityId: event.id,
    title: event.title,
    homeContextId: context.category.id,
    homeSystemRole: 'home',
    resolutionState: over ? 'past_visit' : 'scheduled',
    scheduledState: over ? 'past_visit' : 'scheduled_visit',
    timing: [{ kind: 'visit', when: visit.when, date: visit.date, startsAt: event.startsAt, endsAt: event.endsAt }],
    attentionFacts: over ? [] : input.attention,
    responsibility,
    dependency,
    duration: { kind: 'visit_window', minutes },
    recurrence: recurrenceFactOf(state, index.rules.get(key) ?? [], today),
    // A visit has no completion concept: there is no "last done", and equally no "never done".
    lastDoneApplicable: false,
    lastDone: null,
    unknownFacts,
    availableActions: eventActions(responsibility, state.people.length + state.children.length > 0, over),
    notes: event.notes,
    location: event.location,
  };
}

function systemItem(input: Common & { system: HouseholdSystem; ref: TypedRef }): HomeItem {
  const { state, context, system, ref, key, today, nowMs, timeZone, index, directory } = input;
  const recurrence = recurrenceFactOf(state, index.rules.get(key) ?? [], today);
  const lastDone = lastDoneOf({ kind: 'system', completions: index.completions.get(key) ?? [], taskCompletedAt: null, timeZone });
  const responsibility = responsibilityFactOf(state, ref, index.responsibilities.get(key) ?? [], nowMs, directory);
  const unknownFacts: UnknownFact[] = [];
  if (lastDone === null) unknownFacts.push('no_completion_recorded');
  if (recurrence.nextExpectedBasis === 'not_derivable') unknownFacts.push('next_date_not_derivable');
  return {
    homeItemId: key,
    canonicalKind: 'system',
    entityId: system.id,
    title: system.name,
    homeContextId: context.category.id,
    homeSystemRole: 'home',
    resolutionState: 'not_applicable',
    scheduledState: 'not_scheduled',
    timing: [],
    attentionFacts: [],
    responsibility,
    dependency: dependencyFactOf(state, ref, key, index),
    duration: { kind: 'none' },
    recurrence,
    lastDoneApplicable: true,
    lastDone,
    unknownFacts,
    // A System is read here, never run, edited or completed. The only approved surface for that is Systems.
    availableActions: ['open_systems'],
    notes: system.description === '' ? null : system.description,
    location: null,
  };
}

// --------------------------------------------------------------------------------------------------------------- actions

function responsibilityActions(responsibility: ResponsibilityFact, hasHolders: boolean): HomeAction[] {
  const actions: HomeAction[] = [];
  const live = responsibility.state !== 'none' && isActiveResponsibility({ state: responsibility.state }) && responsibility.holder !== null && responsibility.holder.kind !== 'self';
  if (live) {
    if (responsibility.state === 'requested') actions.push('record_seen', 'record_accepted', 'record_declined');
    else if (responsibility.state === 'acknowledged') actions.push('record_accepted', 'record_declined');
    actions.push('take_back');
  } else if (hasHolders) {
    actions.push('ask_someone');
  }
  return actions;
}

function taskActions(task: Task, responsibility: ResponsibilityFact, recurrence: RecurrenceFact, hasHolders: boolean): HomeAction[] {
  if (task.status === 'completed') return ['due_again', 'edit'];
  const actions: HomeAction[] = ['edit', 'mark_done', ...responsibilityActions(responsibility, hasHolders)];
  if (recurrence.state === 'active') actions.push('stop_repeating');
  actions.push('remove');
  return actions;
}

function eventActions(responsibility: ResponsibilityFact, hasHolders: boolean, over: boolean): HomeAction[] {
  return over ? ['edit', 'remove'] : ['edit', ...responsibilityActions(responsibility, hasHolders), 'remove'];
}

// -------------------------------------------------------------------------------------------------------------- sections

const emptySections = (): HomeSection[] => (['attention', 'waiting', 'comingUp', 'unresolved', 'repeats', 'recentlyDone', 'pastVisits'] as HomeSectionKey[]).map((key) => ({ key, itemIds: [] }));

const dateOf = (item: HomeItem): LocalDate | null => {
  const dates = item.timing.map((fact) => fact.date).sort();
  return dates.length === 0 ? null : dates[0];
};

/** A time with no clock in it sorts at the start of its day, so ordering never depends on when the projection is read. */
const instantOf = (item: HomeItem): number => {
  const visit = item.timing.find((fact) => fact.kind === 'visit');
  if (visit && visit.kind === 'visit') return epochMsOf(visit.startsAt);
  const timed = item.timing.find((fact) => fact.kind === 'planned' && fact.startsAt !== null);
  if (timed && timed.kind === 'planned' && timed.startsAt !== null) return epochMsOf(timed.startsAt);
  const date = dateOf(item);
  return date === null ? Number.POSITIVE_INFINITY : Date.parse(`${date}T00:00:00Z`);
};

const byWhen = (a: HomeItem, b: HomeItem): number => {
  const left = instantOf(a);
  const right = instantOf(b);
  if (left !== right) return left < right ? -1 : 1;
  return cmpText(a.title, b.title) || cmpText(a.homeItemId, b.homeItemId);
};

const bestUrgency = (item: HomeItem): number => Math.min(...item.attentionFacts.map((fact) => URGENCY_RANK[fact.urgency]));

const isWorkItem = (item: HomeItem): boolean => item.resolutionState === 'unresolved' || item.resolutionState === 'scheduled' || (item.resolutionState === 'past_visit' && item.timing.some((fact) => fact.kind === 'visit' && fact.when === 'earlier_today'));

function sectionsOf(items: HomeItem[], today: LocalDate): HomeSection[] {
  const horizon = addDays(today, COMING_UP_DAYS);
  const attention: HomeItem[] = [];
  const waiting: HomeItem[] = [];
  const comingUp: HomeItem[] = [];
  const unresolved: HomeItem[] = [];

  for (const item of items) {
    if (item.canonicalKind === 'system' || !isWorkItem(item)) continue;
    const heldByOthers = item.responsibility.holder !== null && item.responsibility.holder.kind !== 'self' && ['asked', 'no_answer', 'seen', 'accepted_needs_you', 'covered'].includes(item.responsibility.coverage);
    if (item.attentionFacts.length > 0) attention.push(item);
    else if (item.canonicalKind === 'event') comingUp.push(item);
    else if (heldByOthers) waiting.push(item);
    else {
      const date = dateOf(item);
      // Anything dated inside the window is coming up; a date already past that has no attention behind it is simply unresolved.
      const soon = item.timing.some((fact) => fact.kind !== 'visit' && fact.date >= today && fact.date <= horizon);
      if (date !== null && soon) comingUp.push(item);
      else unresolved.push(item);
    }
  }

  const repeats = items.filter((item) => item.canonicalKind === 'system' || item.recurrence.state === 'active' || item.recurrence.state === 'paused');
  const recentlyDone = items.filter((item) => item.canonicalKind === 'task' && item.resolutionState === 'marked_done' && item.lastDone !== null && item.lastDone.date >= addDays(today, -RECENTLY_DONE_DAYS));
  // A visit that ended TODAY stays in "Coming up" until the day turns (it is still today's business), so it never moves between
  // sections as the hours pass. Only a visit that ended on an earlier logical day is listed here.
  const pastVisits = items.filter((item) => item.canonicalKind === 'event' && item.timing.some((fact) => fact.kind === 'visit' && fact.when === 'past'));

  const attentionOrder = (a: HomeItem, b: HomeItem) => bestUrgency(a) - bestUrgency(b) || byWhen(a, b);
  const ids = (list: HomeItem[]) => list.map((item) => item.homeItemId);
  const doneOrder = (a: HomeItem, b: HomeItem) => (b.lastDone?.at ?? '').localeCompare(a.lastDone?.at ?? '') || cmpText(a.title, b.title) || cmpText(a.homeItemId, b.homeItemId);

  return [
    { key: 'attention', itemIds: ids(attention.sort(attentionOrder)) },
    { key: 'waiting', itemIds: ids(waiting.sort(byWhen)) },
    { key: 'comingUp', itemIds: ids(comingUp.sort(byWhen)) },
    { key: 'unresolved', itemIds: ids(unresolved.sort((a, b) => cmpText(a.title, b.title) || cmpText(a.homeItemId, b.homeItemId))) },
    { key: 'repeats', itemIds: ids(repeats.sort((a, b) => cmpText(a.title, b.title) || cmpText(a.homeItemId, b.homeItemId))) },
    { key: 'recentlyDone', itemIds: ids(recentlyDone.sort(doneOrder)) },
    { key: 'pastVisits', itemIds: ids(pastVisits.sort((a, b) => byWhen(b, a))) },
  ];
}
