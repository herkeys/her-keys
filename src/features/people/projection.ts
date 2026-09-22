import type { PersonContext } from '../../domain/foundation/personContext';
import type { LocalDate } from '../../domain/logicalDay';
import { isCoParent } from '../../domain/people';
import type { AppState, Task } from '../../domain/state';
import { formatFollowUpDate, peopleCopy } from './copy';

/**
 * PEOPLE OS — the read side (HK-FEATURE-13). Pure functions of `AppState` and today's date.
 *
 * ONE projection over the canonical identities, never a copy of them:
 *   - every child of the household              (`AppState.children`, Kids' identity — read-only here)
 *   - every ACTIVE non-account person            (`AppState.people`; a co-parent row is a read-only projection of F07's identity)
 * The account holder is never a row. Each row keeps the canonical source it came from (`source`), and is keyed by it.
 *
 * PRIVACY IS STRUCTURAL. Nothing in this file reads `contextNote`: the list, the verdict, the follow-up list, "recently updated" and
 * the Life tile are built from names, labels and Task facts only. The note is reachable through `privateNote.ts` alone, which only the
 * person's own detail screen calls. A static test holds this file to that.
 *
 * NOTHING HERE RANKS A PERSON. Rows are ordered by name (then id), never by how many Tasks, how recent, or how "important". Follow-ups
 * are ordered by the explicit work (overdue, today, dated, undated) — the work is ranked, not the human. And a person with no
 * follow-up never needs anything: there is no "last contacted", no streak, no gap, no nudge.
 */

export type PersonSource = { kind: 'child'; id: string } | { kind: 'person'; id: string };

export const personKey = (source: PersonSource): string => `${source.kind}:${source.id}`;

export function parsePersonKey(key: string): PersonSource | null {
  const match = /^(child|person):(.+)$/.exec(key);
  return match ? ({ kind: match[1] as PersonSource['kind'], id: match[2] }) : null;
}

export interface PersonRow {
  key: string;
  source: PersonSource;
  displayName: string;
  /** The canonical KIND of person, when it is one Her Keys already manages elsewhere: "Child", "Co-parent". */
  kindLabel: string | null;
  /** Her own words, if she saved any: the short label, otherwise the organization. Never the note. */
  secondary: string | null;
  /** Whether this row's identity can be renamed or archived from People (a non-account person who is not the co-parent). */
  identityEditable: boolean;
  contextId: string | null;
}

/**
 * Deterministic order (addendum AA). There is no repository string-sort helper for names, so: the display name, NFC-normalised and
 * lower-cased with the default (locale-independent) `toLowerCase`, compared by UTF-16 code unit; ties broken by the canonical key,
 * also by code unit. No `localeCompare`, so the order is identical on every device, runtime and test.
 */
export function compareRows(a: Pick<PersonRow, 'displayName' | 'key'>, b: Pick<PersonRow, 'displayName' | 'key'>): number {
  const an = a.displayName.normalize('NFC').toLowerCase();
  const bn = b.displayName.normalize('NFC').toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

const contextsOf = (state: AppState): readonly PersonContext[] => state.personContexts ?? [];

function contextForSource(state: AppState, source: PersonSource): PersonContext | null {
  return contextsOf(state).find((c) => (source.kind === 'child' ? c.childId === source.id : c.personId === source.id)) ?? null;
}

/** Only an ACTIVE context speaks on active surfaces. An archived one is kept and says nothing. */
const activeContext = (state: AppState, source: PersonSource): PersonContext | null => {
  const context = contextForSource(state, source);
  return context && context.status === 'active' ? context : null;
};

/** Whether the canonical person a context names is live right now. A missing or archived identity makes its context INERT. */
export function contextTargetActive(state: AppState, context: PersonContext): boolean {
  if (context.childId !== null) return context.childId !== state.user.id && state.children.some((c) => c.id === context.childId);
  const person = state.people.find((p) => p.id === context.personId);
  return person !== undefined && person.status === 'active';
}

function rowOf(state: AppState, source: PersonSource): PersonRow | null {
  const context = activeContext(state, source);
  const secondary = context ? (context.relationshipName ?? context.organizationName) : null;
  if (source.kind === 'child') {
    const child = state.children.find((c) => c.id === source.id);
    if (!child || child.id === state.user.id) return null;
    return { key: personKey(source), source, displayName: child.displayName, kindLabel: peopleCopy.kind.child, secondary, identityEditable: false, contextId: context?.id ?? null };
  }
  const person = state.people.find((p) => p.id === source.id);
  if (!person || person.status !== 'active') return null;
  const coParent = isCoParent(person);
  return {
    key: personKey(source),
    source,
    displayName: person.displayName,
    kindLabel: coParent ? peopleCopy.kind.coParent : null,
    secondary,
    identityEditable: !coParent,
    contextId: context?.id ?? null,
  };
}

/** Every active canonical person, once each, in name order. */
export function peopleRows(state: AppState): PersonRow[] {
  const rows: PersonRow[] = [];
  for (const child of state.children) {
    const row = rowOf(state, { kind: 'child', id: child.id });
    if (row) rows.push(row);
  }
  for (const person of state.people) {
    const row = rowOf(state, { kind: 'person', id: person.id });
    if (row) rows.push(row);
  }
  return rows.sort(compareRows);
}

// ---------------------------------------------------------------- follow-ups ---

export type FollowUpTiming = 'overdue' | 'today' | 'upcoming' | 'undated';

export interface FollowUpItem {
  taskId: string;
  title: string;
  personKey: string;
  displayName: string;
  timing: FollowUpTiming;
  dueDate: LocalDate | null;
  /** "Follow-up due Friday." — a fact about the Task, never about the person. */
  whenText: string;
  createdAt: string | null;
}

const TIMING_ORDER: Record<FollowUpTiming, number> = { overdue: 0, today: 1, upcoming: 2, undated: 3 };

function timingOf(task: Pick<Task, 'dueDate'>, today: LocalDate): FollowUpTiming {
  if (task.dueDate === null) return 'undated';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

/**
 * Addendum W: overdue (earliest due first), due today, future dated (earliest first), undated (created first), then id. The ranking is of
 * the TASKS; the person is only the label on each.
 */
export function compareFollowUps(a: FollowUpItem, b: FollowUpItem): number {
  if (a.timing !== b.timing) return TIMING_ORDER[a.timing] - TIMING_ORDER[b.timing];
  if (a.dueDate !== b.dueDate && a.dueDate !== null && b.dueDate !== null) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.timing === 'undated' && a.createdAt !== b.createdAt) return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1;
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

/**
 * Needs Follow-up derives ONLY from explicit canonical truth: an OPEN Task that she created as a follow-up from an ACTIVE context about
 * a LIVE person. A completed, archived or missing Task is inert (never counted, never resurrected, never re-linked). A person with no
 * such Task never appears here.
 */
export function followUps(state: AppState, today: LocalDate): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const contexts = new Map(contextsOf(state).map((c) => [c.id, c]));
  for (const link of state.personTaskLinks ?? []) {
    const context = contexts.get(link.contextId);
    if (!context || context.status !== 'active' || !contextTargetActive(state, context)) continue;
    const task = tasks.get(link.followUp.id);
    if (!task || task.status !== 'open') continue;
    const source: PersonSource = context.childId !== null ? { kind: 'child', id: context.childId } : { kind: 'person', id: context.personId! };
    const row = rowOf(state, source);
    if (!row) continue;
    const timing = timingOf(task, today);
    const when = task.dueDate === null ? null : formatFollowUpDate(task.dueDate, today);
    items.push({
      taskId: task.id,
      title: task.title,
      personKey: row.key,
      displayName: row.displayName,
      timing,
      dueDate: task.dueDate,
      whenText: when === null ? peopleCopy.followUp.undated : timing === 'overdue' ? peopleCopy.followUp.overdue(when) : peopleCopy.followUp.due(when),
      createdAt: task.createdAt,
    });
  }
  return items.sort(compareFollowUps);
}

/** Addendum X: ONE factual sentence, one category only. It never names a person. */
export function peopleVerdict(items: readonly FollowUpItem[], today: LocalDate): string {
  const attention = items.filter((item) => item.timing === 'overdue' || item.timing === 'today').length;
  if (attention > 0) return peopleCopy.verdict.attention(attention);
  const next = items.find((item) => item.timing === 'upcoming');
  if (next && next.dueDate !== null) return peopleCopy.verdict.next(formatFollowUpDate(next.dueDate, today));
  return peopleCopy.verdict.nothing;
}

// ------------------------------------------------------------ recently updated ---

export interface RecentItem {
  key: string;
  displayName: string;
  relationshipName: string | null;
  updatedAt: string;
}

/** Addendum Y: the latest five ACTIVE contexts about live people, by `updatedAt` then id. Name, her label and the date — no note. */
export function recentlyUpdated(state: AppState, limit = 5): RecentItem[] {
  const items: RecentItem[] = [];
  for (const context of contextsOf(state)) {
    if (context.status !== 'active' || !contextTargetActive(state, context)) continue;
    const source: PersonSource = context.childId !== null ? { kind: 'child', id: context.childId } : { kind: 'person', id: context.personId! };
    const row = rowOf(state, source);
    if (!row) continue;
    items.push({ key: row.key, displayName: row.displayName, relationshipName: context.relationshipName, updatedAt: context.updatedAt });
  }
  items.sort((a, b) => (a.updatedAt !== b.updatedAt ? (a.updatedAt < b.updatedAt ? 1 : -1) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return items.slice(0, limit);
}

// ------------------------------------------------------------------- archived ---

export interface ArchivedItem {
  key: string;
  displayName: string;
  /** What is archived: the person themselves, or only what she saved about them. */
  what: 'person' | 'context';
}

/** What she archived, so it can be restored. Nothing here is deleted. */
export function archivedItems(state: AppState): ArchivedItem[] {
  const items: ArchivedItem[] = [];
  for (const person of state.people) {
    if (person.status === 'archived' && !isCoParent(person)) items.push({ key: personKey({ kind: 'person', id: person.id }), displayName: person.displayName, what: 'person' });
  }
  for (const context of contextsOf(state)) {
    if (context.status !== 'archived' || !contextTargetActive(state, context)) continue;
    const source: PersonSource = context.childId !== null ? { kind: 'child', id: context.childId } : { kind: 'person', id: context.personId! };
    const row = rowOf(state, source);
    if (row) items.push({ key: row.key, displayName: row.displayName, what: 'context' });
  }
  return items.sort(compareRows);
}

// ----------------------------------------------------------------- the home ---

export const NEEDS_FOLLOW_UP_CAP = 3;

export interface PeopleHomeView {
  verdict: string;
  /** At most three; `followUpTotal` says how many exist, for "See all N". */
  followUps: FollowUpItem[];
  /** Every follow-up, in the same order, for "See all N". */
  allFollowUps: FollowUpItem[];
  followUpTotal: number;
  people: PersonRow[];
  recent: RecentItem[];
  archived: ArchivedItem[];
  /** True only when there is no person at all to show — a household with people but no context is NOT empty. */
  empty: boolean;
}

export function buildPeopleHome(state: AppState, today: LocalDate): PeopleHomeView {
  const all = followUps(state, today);
  const people = peopleRows(state);
  return {
    verdict: peopleVerdict(all, today),
    followUps: all.slice(0, NEEDS_FOLLOW_UP_CAP),
    allFollowUps: all,
    followUpTotal: all.length,
    people,
    recent: recentlyUpdated(state),
    archived: archivedItems(state),
    empty: people.length === 0,
  };
}
