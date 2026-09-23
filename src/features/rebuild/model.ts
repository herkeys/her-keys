import { logicalDateAt, type LocalDate } from '../../domain/logicalDay';
import { liveLinksOf, openNextActions, orderedFocuses } from '../../domain/rebuild/read';
import type { FocusTargetKind, RebuildFocus } from '../../domain/rebuild/schema';
import type { AppState, HouseholdCategory, Task } from '../../domain/state';
import { alternativesTo } from '../../domain/structure';
import { relativeDay } from '../today/formatDay';
import { REBUILD_COPY } from './copy';

/**
 * THE ME / REBUILD PROJECTION. Pure: (state, today, nowMs) -> what the screen shows.
 *
 * What it reads: RebuildFocus rows, their live links, and the canonical rows those links name — each by its OWN existing truth
 * (a Task's status and due date, a Goal's status, an Event's time and status). What it never does: score, rank Focuses by
 * importance, measure activity, look at how long anything has been quiet, read a missed or skipped routine, or invent a step.
 * Paused and archived Focuses contribute no attention (Addendum M). A Focus with no next step is NOT an attention state (Addendum E):
 * it only carries `canAddNextStep`, which the screen renders as a quiet invitation.
 */

export interface StepView {
  taskId: string;
  title: string;
  /** Her own task's date, stated plainly, or null when it has none. */
  dateLabel: string | null;
  /** An EXISTING lighter alternative she already recorded (a Dependency `alternative_to`), never one Her Keys made up. */
  lighterVersion: string | null;
}

export interface FocusCardView {
  id: string;
  title: string;
  state: 'active' | 'paused';
  steps: StepView[];
  canAddNextStep: boolean;
}

export interface AttentionView {
  taskId: string;
  focusId: string;
  title: string;
  label: string;
}

export interface ProgressView {
  key: string;
  title: string;
  label: string;
}

export interface RebuildHomeView {
  hasActive: boolean;
  verdict: string | null;
  current: FocusCardView[];
  needsAttention: AttentionView[];
  recentProgress: ProgressView[];
  paused: FocusCardView[];
}

/** Recent Progress is "the most recent facts", not a time window (Addendum P). */
export const RECENT_PROGRESS_LIMIT = 3;

const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));

function lighterVersionOf(state: AppState, taskId: string, tasks: Map<string, Task>): string | null {
  for (const ref of alternativesTo(state, { kind: 'task', id: taskId })) {
    if (ref.kind !== 'task') continue;
    const alternative = tasks.get(ref.id);
    if (alternative !== undefined && alternative.status === 'open') return alternative.title;
  }
  return null;
}

function stepView(state: AppState, task: Task, today: LocalDate, tasks: Map<string, Task>): StepView {
  const dateLabel =
    task.dueDate === null
      ? null
      : task.dueDate < today
        ? REBUILD_COPY.home.pastDue(relativeDay(task.dueDate, today))
        : REBUILD_COPY.home.dueOn(relativeDay(task.dueDate, today));
  return { taskId: task.id, title: task.title, dateLabel, lighterVersion: lighterVersionOf(state, task.id, tasks) };
}

function cardOf(state: AppState, focus: RebuildFocus, today: LocalDate, tasks: Map<string, Task>): FocusCardView {
  const steps = openNextActions(state, focus.id).map((task) => stepView(state, task, today, tasks));
  return { id: focus.id, title: focus.title, state: focus.state === 'paused' ? 'paused' : 'active', steps, canAddNextStep: steps.length === 0 };
}

export function buildRebuildHome(state: AppState, today: LocalDate, nowMs: number): RebuildHomeView {
  const tasks = byId(state.tasks);
  const shown = orderedFocuses(state);
  const active = shown.filter((focus) => focus.state === 'active');
  const paused = shown.filter((focus) => focus.state === 'paused');

  // Needs attention: an open next step of an ACTIVE Focus whose own due date is today or has passed. Nothing else.
  const needsAttention: AttentionView[] = [];
  for (const focus of active) {
    for (const task of openNextActions(state, focus.id)) {
      if (task.dueDate === null || task.dueDate > today) continue;
      const label = task.dueDate < today ? REBUILD_COPY.home.pastDue(relativeDay(task.dueDate, today)) : REBUILD_COPY.home.dueOn('today');
      needsAttention.push({ taskId: task.id, focusId: focus.id, title: task.title, label });
    }
  }

  const verdict = active.length === 0 ? null : verdictFor(state, active, needsAttention.length, today, nowMs);

  return {
    hasActive: active.length > 0,
    verdict,
    current: active.map((focus) => cardOf(state, focus, today, tasks)),
    needsAttention,
    // With no active Focus the screen is the calm empty state and nothing else (Addendum Q), so no section is built for it.
    recentProgress: active.length === 0 ? [] : recentProgressOf(state, shown, today),
    paused: paused.map((focus) => cardOf(state, focus, today, tasks)),
  };
}

/**
 * The plain-language verdict, deterministic and in this order: something personal needs her today; else the next dated thing she
 * connected; else nothing needs attention. It never says a Focus lacks a step, never praises, never warns.
 */
function verdictFor(state: AppState, active: readonly RebuildFocus[], attentionCount: number, today: LocalDate, nowMs: number): string {
  if (attentionCount > 0) return REBUILD_COPY.verdict.attention(attentionCount);

  const zone = state.user.timezone;
  const events = byId(state.events);
  const upcoming: { date: LocalDate; sortKey: string; title: string }[] = [];
  for (const focus of active) {
    for (const task of openNextActions(state, focus.id)) {
      if (task.dueDate !== null && task.dueDate > today) upcoming.push({ date: task.dueDate, sortKey: `${task.dueDate}|${task.id}`, title: task.title });
    }
    for (const link of liveLinksOf(state, focus.id)) {
      if (link.target.kind !== 'event') continue;
      const event = events.get(link.target.id);
      if (event === undefined || event.status === 'removed' || Date.parse(event.startsAt) < nowMs) continue;
      upcoming.push({ date: logicalDateAt(Date.parse(event.startsAt), zone), sortKey: `${event.startsAt}|${event.id}`, title: event.title });
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  const next = upcoming[0];
  return next === undefined ? REBUILD_COPY.verdict.nothing : REBUILD_COPY.verdict.next(next.title, relativeDay(next.date, today));
}

/**
 * The latest factual completions among what her shown Focuses are connected to: a linked Task actually completed, a linked Goal
 * actually reached. Newest first, at most three. System runs are not a canonical fact yet (MP-11-03), so they are not a source.
 */
function recentProgressOf(state: AppState, shown: readonly RebuildFocus[], today: LocalDate): ProgressView[] {
  const zone = state.user.timezone;
  const tasks = byId(state.tasks);
  const goals = byId(state.goals);
  const seen = new Set<string>();
  const facts: { at: string; key: string; title: string; label: string }[] = [];
  for (const focus of shown) {
    for (const link of liveLinksOf(state, focus.id)) {
      const key = `${link.target.kind}:${link.target.id}`;
      if (seen.has(key)) continue;
      if (link.target.kind === 'task') {
        const task = tasks.get(link.target.id);
        if (task === undefined || task.status !== 'completed' || task.completedAt === null) continue;
        seen.add(key);
        facts.push({ at: task.completedAt, key, title: task.title, label: REBUILD_COPY.home.doneOn(relativeDay(logicalDateAt(Date.parse(task.completedAt), zone), today)) });
      } else if (link.target.kind === 'goal') {
        const goal = goals.get(link.target.id);
        if (goal === undefined || goal.status !== 'achieved') continue;
        // The append-only fact that it was reached, when recorded; otherwise the moment its status last changed.
        const reachedAt =
          state.observations
            .filter((o) => o.about.kind === 'goal' && o.about.id === goal.id && o.outcome === 'completed')
            .map((o) => o.occurredAt)
            .sort()
            .pop() ?? goal.updatedAt;
        seen.add(key);
        facts.push({ at: reachedAt, key, title: goal.title, label: REBUILD_COPY.home.reached(relativeDay(logicalDateAt(Date.parse(reachedAt), zone), today)) });
      }
    }
  }
  facts.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return facts.slice(0, RECENT_PROGRESS_LIMIT).map(({ key, title, label }) => ({ key, title, label }));
}

// ------------------------------------------------------------------ detail ---

export interface ConnectionView {
  linkId: string;
  kind: Exclude<FocusTargetKind, 'task'> | 'task';
  kindLabel: string;
  title: string;
  detail: string | null;
}

export interface ConnectCandidate {
  kind: 'system' | 'event';
  id: string;
  title: string;
  detail: string | null;
}

export interface FocusDetailView {
  id: string;
  title: string;
  /** Shown ONLY here, on her own Focus. */
  note: string | null;
  state: RebuildFocus['state'];
  steps: StepView[];
  canAddNextStep: boolean;
  connections: ConnectionView[];
  categories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  connectRoutines: ConnectCandidate[];
  connectUpcoming: ConnectCandidate[];
}

/** How many upcoming calendar items the connect list offers. A list length, not a product time window. */
export const CONNECT_UPCOMING_LIMIT = 20;

/**
 * The category a new step is filed under unless she picks another: the first active category whose scope is owner-private, by the
 * household's own order. A scope, never a name or a role guessed from words.
 */
export function defaultStepCategory(categories: readonly HouseholdCategory[]): string | null {
  const active = categories.filter((category) => category.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder);
  return (active.find((category) => category.scope === 'personal') ?? active[0])?.id ?? null;
}

export function buildFocusDetail(state: AppState, focusId: string, today: LocalDate, nowMs: number): FocusDetailView | null {
  const focus = state.rebuildFocuses.find((row) => row.id === focusId);
  if (focus === undefined) return null;
  const zone = state.user.timezone;
  const tasks = byId(state.tasks);
  const goals = byId(state.goals);
  const systems = byId(state.systems);
  const events = byId(state.events);
  const steps = openNextActions(state, focus.id).map((task) => stepView(state, task, today, tasks));
  const links = liveLinksOf(state, focus.id);

  const connections: ConnectionView[] = [];
  for (const link of links) {
    if (link.relation === 'next_action') continue;
    const { kind, id } = link.target;
    const kindLabel = REBUILD_COPY.detail.kindLabel[kind];
    if (kind === 'goal') {
      const goal = goals.get(id);
      if (goal) connections.push({ linkId: link.id, kind, kindLabel, title: goal.title, detail: null });
    } else if (kind === 'system') {
      const system = systems.get(id);
      if (system) connections.push({ linkId: link.id, kind, kindLabel, title: system.name, detail: null });
    } else if (kind === 'event') {
      const event = events.get(id);
      if (event) {
        const detail = event.status === 'removed' ? REBUILD_COPY.detail.removedEvent : relativeDay(logicalDateAt(Date.parse(event.startsAt), zone), today);
        connections.push({ linkId: link.id, kind, kindLabel, title: event.title, detail });
      }
    } else {
      const task = tasks.get(id);
      if (task) connections.push({ linkId: link.id, kind, kindLabel, title: task.title, detail: null });
    }
  }

  const linked = new Set(links.map((link) => `${link.target.kind}:${link.target.id}`));
  const connectRoutines: ConnectCandidate[] = state.systems
    .filter((system) => !linked.has(`system:${system.id}`))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
    .map((system) => ({ kind: 'system', id: system.id, title: system.name, detail: null }));
  const connectUpcoming: ConnectCandidate[] = state.events
    .filter((event) => event.status !== 'removed' && Date.parse(event.startsAt) >= nowMs && !linked.has(`event:${event.id}`))
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.id < b.id ? -1 : 1))
    .slice(0, CONNECT_UPCOMING_LIMIT)
    .map((event) => ({ kind: 'event', id: event.id, title: event.title, detail: relativeDay(logicalDateAt(Date.parse(event.startsAt), zone), today) }));

  const categories = state.categories
    .filter((category) => category.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({ id: category.id, name: category.name }));

  return {
    id: focus.id,
    title: focus.title,
    note: focus.note,
    state: focus.state,
    steps,
    canAddNextStep: focus.state !== 'archived',
    connections,
    categories,
    defaultCategoryId: defaultStepCategory(state.categories),
    connectRoutines: focus.state === 'archived' ? [] : connectRoutines,
    connectUpcoming: focus.state === 'archived' ? [] : connectUpcoming,
  };
}
