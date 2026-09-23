import { demoOneMoves, findOneMove } from '../data/catalog/oneMoves';
import type { OneMoveItem } from '../types';
import { categoryWithRole } from './categories';
import type { TransitionContext } from './context';
import { provenanceFor, systemProvenance } from './foundation/provenance';
import { loadTierForDay } from './loadTier';
import { toInstant, type LocalDate } from './logicalDay';
import { resolveNeedsMeItem } from './needsMe';
import { consequenceRank } from './foundation/authorization';
import { durationKnowledgeOf } from './foundation/duration';
import { appendObservation } from './observations';
import { addEvidence } from './patterns';
import { isOnboardingComplete } from './onboarding';
import { projectStateDay } from './projectDay';
import { autopayPreDueSuppressed } from './reasoning/attention';
import type { AppState, NeedsMeItem, OneMoveRecord, Task } from './state';
import { isBlocked } from './structure';
import { completeTask } from './tasks';

/**
 * Each logical day gets one One Move decision, stored the moment it's made.
 * Once she has seen it, it's a commitment: a restart or a change elsewhere in
 * the day doesn't swap it for a different move, and a day that was too full
 * for one stays that way even if she frees up time later. A move she has done
 * stays done. The next day decides afresh.
 *
 * Demo households read from a hardcoded catalog (there is no real household
 * behind the fiction to read facts from). Real/empty households read from
 * her own open tasks and Needs Me items instead — nothing is fabricated: a
 * task's estimate is its own `durationMinutes` when she gave it (never the
 * planning default), and a Needs Me item, having no reliable size, never
 * claims one.
 */

export type OneMoveView =
  | { status: 'none' }
  | { status: 'withheld' }
  | { status: 'selected'; move: OneMoveItem }
  | { status: 'completed'; move: OneMoveItem | null };

interface OneMoveCandidate {
  targetType: OneMoveRecord['targetType'];
  item: OneMoveItem;
}

/** Where a decision's target stands now: still to do, done (by "I did it" or from her list), or gone (removed, dropped, or no longer offered). */
type TargetStanding = 'open' | 'done' | 'gone';

export function oneMoveCatalogFor(origin: AppState['origin']): readonly OneMoveItem[] {
  return origin === 'demo' ? demoOneMoves : [];
}

export function oneMoveRecordId(date: LocalDate): string {
  return `onemove-${date}`;
}

/**
 * A task's duration is its estimate only when she gave it, or approved Her Keys' reading of it (HA-010). The planning default and a
 * number of unrecorded origin say nothing about the task's size (HK13-D12): they never make a task "small" — small (<=15 min) tasks are
 * the only ones ever offered on an overloaded day — and are never quoted back to her as how long it will take. An unknown size is
 * treated like a Needs Me item's: conservatively, as adding work.
 */
function taskAsOneMoveItem(task: Task): OneMoveItem {
  const knowledge = durationKnowledgeOf(task);
  const known = knowledge === 'user-provided' || knowledge === 'inferred-estimate';
  return {
    id: task.id,
    observation: 'Already on your list.',
    action: task.title,
    effect: known && task.durationMinutes <= 15 ? 'reduces_load' : 'adds_work',
    ...(known ? { estimatedMinutes: task.durationMinutes } : {}),
  };
}

/** No duration claim at all — a Needs Me item's real size is unknown, so it's conservatively treated as adding work rather than guessed to be small. */
function needsMeAsOneMoveItem(item: NeedsMeItem): OneMoveItem {
  return {
    id: item.id,
    observation: 'Captured earlier and still open.',
    action: item.title,
    effect: 'adds_work',
  };
}

type ResolvedTarget = { item: OneMoveItem; standing: TargetStanding };
type TargetAdapter = (state: AppState, id: string) => ResolvedTarget | null;

/**
 * THE ONE MOVE TARGET REGISTRY (B4-FE01-028, ADR-021).
 *
 * A target kind is registered here ONCE: how to find it, how to present it as a
 * One Move, and where it stands now. Selection and persistence read the registry, so a
 * new kind is one adapter — not an edit in each of a column, a foreign key, two CHECK
 * rewrites and three client sites. The stored shape already holds all five kinds; the
 * SELECTION engine still only chooses tasks and Needs Me items, which is a product
 * decision and not a storage limit.
 *
 * Typed, never polymorphic: a kind with no adapter resolves to nothing. It is never
 * quietly read as a different kind — that misreading is what created the legacy catalog
 * One Moves in the first place.
 */
const TARGET_ADAPTERS: Record<Exclude<OneMoveRecord['targetType'], 'catalog'>, TargetAdapter> = {
  task: (state, id) => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    return { item: taskAsOneMoveItem(task), standing: task.status === 'open' ? 'open' : task.status === 'completed' ? 'done' : 'gone' };
  },
  needsMe: (state, id) => {
    const item = state.needsMe.find((n) => n.id === id);
    if (!item) return null;
    return { item: needsMeAsOneMoveItem(item), standing: item.status === 'open' ? 'open' : 'done' };
  },
  event: (state, id) => {
    const event = state.events.find((e) => e.id === id);
    if (!event) return null;
    const minutes = Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000);
    return {
      item: { id: event.id, observation: 'On your calendar.', action: event.title, effect: 'adds_work', estimatedMinutes: Number.isFinite(minutes) ? minutes : undefined },
      standing: event.status === 'active' ? 'open' : 'gone',
    };
  },
  system: (state, id) => {
    const system = state.systems.find((s) => s.id === id);
    if (!system) return null;
    return { item: { id: system.id, observation: 'One of your routines.', action: system.name, effect: 'adds_work', estimatedMinutes: system.effortMinutes ?? undefined }, standing: 'open' };
  },
  responsibility: (state, id) => {
    const handoff = state.responsibilities.find((r) => r.id === id);
    if (!handoff) return null;
    const live = handoff.state === 'requested' || handoff.state === 'acknowledged' || handoff.state === 'declined' || handoff.state === 'returned';
    return { item: { id: handoff.id, observation: 'You asked someone to take this.', action: 'Check that this is covered', effect: 'reduces_load' }, standing: live ? 'open' : 'done' };
  },
};

function targetOf(state: AppState, targetType: OneMoveRecord['targetType'], targetId: string): ResolvedTarget | null {
  if (targetType === 'catalog') {
    const move = findOneMove(oneMoveCatalogFor(state.origin), targetId);
    return move ? { item: move, standing: 'open' } : null;
  }
  return TARGET_ADAPTERS[targetType]?.(state, targetId) ?? null;
}

/** The structured reasons a real target was chosen, from the same facts the pool selection used. */
function evidenceCodesFor(state: AppState, record: OneMoveRecord, date: LocalDate): string[] {
  if (record.targetId === null) return [];
  if (record.targetType === 'needsMe') return ['oldest_open'];
  if (record.targetType !== 'task') return [];
  const task = state.tasks.find((t) => t.id === record.targetId);
  if (!task) return [];
  const codes = ['todays_radar'];
  if (task.dueDate !== null && task.dueDate <= date) codes.push('deadline');
  if (task.consequence !== null && consequenceRank(task.consequence) >= consequenceRank('high')) codes.push('consequence');
  return codes;
}

/**
 * The real candidate pool for a real/empty household: open tasks already on
 * today's radar (due today, overdue, or planned/timed for today — the same
 * day view Daily Load reads), smallest first, then open Needs Me items,
 * oldest first. A demo household reads the fictional catalog instead.
 */
function candidatePoolFor(state: AppState, date: LocalDate): OneMoveCandidate[] {
  if (state.origin === 'demo') return demoOneMoves.map((item) => ({ targetType: 'catalog', item }));

  const todaysTaskIds = new Set(projectStateDay(state, date).tasks.map((task) => task.id));
  // Money (F09) owns what its items mean (HK13-D19). Expected income is not something she can do — "I did it" would record it
  // RECEIVED — and an autopay bill gets no pre-due nudge, which offering it as the day's one move would be. Both stay on Today's list
  // and on Money Home; neither is ever the One Move.
  const moneyCategoryId = categoryWithRole(state, 'money')?.id ?? null;
  const offerable = (task: Task): boolean => {
    if (task.categoryId !== moneyCategoryId || task.value === null) return true;
    if (task.value.direction === 'inflow') return false;
    return task.dueDate === null || !autopayPreDueSuppressed(task.dueDate, task.paymentMechanism, date);
  };
  // A blocked task cannot honestly be offered as the one thing to do: she cannot do it yet, whatever it's waiting on.
  const taskCandidates: OneMoveCandidate[] = state.tasks
    .filter((task) => task.status === 'open' && todaysTaskIds.has(task.id) && offerable(task) && !isBlocked(state, { kind: 'task', id: task.id }))
    .sort((a, b) => a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id))
    .map((task) => ({ targetType: 'task', item: taskAsOneMoveItem(task) }));

  const needsMeCandidates: OneMoveCandidate[] = state.needsMe
    .filter((item) => item.status === 'open')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((item) => ({ targetType: 'needsMe', item: needsMeAsOneMoveItem(item) }));

  return [...taskCandidates, ...needsMeCandidates];
}

export function oneMoveForDay(state: AppState, date: LocalDate): OneMoveView {
  const record = state.oneMoves.find((r) => r.forDate === date);
  if (!record) return { status: 'none' };
  if (record.status === 'withheld' || record.targetId === null) return { status: 'withheld' };

  const target = targetOf(state, record.targetType, record.targetId);
  if (record.status === 'completed') return { status: 'completed', move: target?.item ?? null };
  if (!target || target.standing === 'gone') return { status: 'none' };
  // Finishing the task (or resolving the item) from her own list is doing the move.
  return target.standing === 'done' ? { status: 'completed', move: target.item } : { status: 'selected', move: target.item };
}

/** A decision stands unless it was an unfinished move whose target has since gone away. */
function decisionStands(state: AppState, record: OneMoveRecord): boolean {
  if (record.targetId === null || record.status !== 'selected') return true;
  const target = targetOf(state, record.targetType, record.targetId);
  return target !== null && target.standing !== 'gone';
}

/**
 * Makes today's decision if there isn't one yet. The only thing that replaces
 * an existing decision is an unfinished move disappearing from the pool it
 * came from; a completed move is history and is never replaced.
 *
 * On an OVERLOADED day — as Daily Load judges the whole day — a move that adds
 * work is withheld: "nothing extra today" is the intervention. A move that
 * takes load away could still be offered.
 */
export function resolveOneMoveForToday(state: AppState, ctx: TransitionContext): AppState {
  if (!isOnboardingComplete(state.onboarding)) return state;

  const existing = state.oneMoves.find((r) => r.forDate === ctx.today);
  if (existing && decisionStands(state, existing)) return state;

  // An unfinished move that lost its target is CLEARED. Build 3 removes the local record, so the fact that it
  // happened is kept as an observation, which is allowed to outlive its row (the cloud keeps it as `cleared`).
  const cleared = (next: AppState): AppState =>
    existing && existing.status === 'selected'
      ? appendObservation(next, ctx, { about: { kind: 'oneMove', id: existing.id }, outcome: 'cleared', provenance: systemProvenance() })
      : next;

  const pool = candidatePoolFor(state, ctx.today);
  const history = state.oneMoves.filter((r) => r !== existing);
  const alreadyDone = new Set(
    history.flatMap((r) => (r.status === 'completed' && r.targetId !== null ? [`${r.targetType}:${r.targetId}`] : []))
  );
  const candidate = pool.find((c) => !alreadyDone.has(`${c.targetType}:${c.item.id}`));

  if (!candidate) return existing ? cleared({ ...state, oneMoves: history }) : state;

  const withheld = candidate.item.effect === 'adds_work' && loadTierForDay(state, ctx.today) === 'overloaded';
  const record: OneMoveRecord = {
    id: oneMoveRecordId(ctx.today),
    forDate: ctx.today,
    targetId: withheld ? null : candidate.item.id,
    targetType: candidate.targetType,
    status: withheld ? 'withheld' : 'selected',
    decidedAt: toInstant(ctx.nowMs),
    completedAt: null,
    // Chosen by the recommendation engine, never captured by her.
    provenance: provenanceFor(state.origin, systemProvenance()),
    scope: 'personal',
  };

  const decided = appendObservation(cleared({ ...state, oneMoves: [...history, record] }), ctx, {
    about: { kind: 'oneMove', id: record.id },
    outcome: withheld ? 'withheld' : 'selected',
    provenance: systemProvenance(),
  });
  // "Why this One Move?" gets a structured answer: each code names the row that supports it.
  return record.targetType === 'task' || record.targetType === 'needsMe'
    ? evidenceCodesFor(decided, record, ctx.today).reduce(
        (next, code) =>
          addEvidence(next, ctx, { for: { kind: 'oneMove', id: record.id }, support: { kind: record.targetType as 'task' | 'needsMe', id: record.targetId as string }, code }),
        decided
      )
    : decided;
}

/**
 * "I did it." When the move is one of her own tasks or Needs Me items, doing
 * it is doing that item, so it is completed (or resolved) in the same change —
 * it won't linger on her list or turn up tomorrow as overdue.
 */
export function completeOneMove(state: AppState, ctx: TransitionContext): AppState {
  const record = state.oneMoves.find((r) => r.forDate === ctx.today);
  if (!record || record.status !== 'selected' || record.targetId === null) return state;

  const target = targetOf(state, record.targetType, record.targetId);
  if (!target || target.standing === 'gone') return state;

  let next: AppState = {
    ...state,
    oneMoves: state.oneMoves.map((r) => (r === record ? { ...r, status: 'completed', completedAt: toInstant(ctx.nowMs) } : r)),
  };
  if (target.standing === 'open' && record.targetType === 'task') next = completeTask(next, ctx, record.targetId);
  if (target.standing === 'open' && record.targetType === 'needsMe') next = resolveNeedsMeItem(next, record.targetId, ctx);
  return appendObservation(next, ctx, { about: { kind: 'oneMove', id: record.id }, outcome: 'completed' });
}
