import { demoOneMoves, findOneMove } from '../data/catalog/oneMoves';
import type { OneMoveItem } from '../types';
import type { TransitionContext } from './context';
import { loadTierForDay } from './loadTier';
import { toInstant, type LocalDate } from './logicalDay';
import { isOnboardingComplete } from './onboarding';
import { projectStateDay } from './projectDay';
import type { AppState, NeedsMeItem, OneMoveRecord, Task } from './state';

/**
 * Each logical day gets one One Move decision, stored the moment it's made.
 * Once she has seen it, it's a commitment: a restart or a change elsewhere in
 * the day doesn't swap it for a different move, and a day that was too full
 * for one stays that way even if she frees up time later. The next day
 * decides afresh.
 *
 * Demo households read from a hardcoded catalog (there is no real household
 * behind the fiction to read facts from). Real/empty households read from
 * her own open tasks and Needs Me items instead — nothing is fabricated: a
 * task's estimate is its own `durationMinutes`, and a Needs Me item, having
 * no reliable size, never claims one.
 */

export type OneMoveView =
  | { status: 'none' }
  | { status: 'withheld' }
  | { status: 'selected' | 'completed'; move: OneMoveItem };

interface OneMoveCandidate {
  targetType: OneMoveRecord['targetType'];
  item: OneMoveItem;
}

export function oneMoveCatalogFor(origin: AppState['origin']): readonly OneMoveItem[] {
  return origin === 'demo' ? demoOneMoves : [];
}

export function oneMoveRecordId(date: LocalDate): string {
  return `onemove-${date}`;
}

/** A task's own duration is its estimate; nothing here guesses at one. Small (<=15 min) tasks are the only ones ever offered on an overloaded day. */
function taskAsOneMoveItem(task: Task): OneMoveItem {
  return {
    id: task.id,
    observation: 'Already on your list.',
    action: task.title,
    effect: task.durationMinutes <= 15 ? 'reduces_load' : 'adds_work',
    estimatedMinutes: task.durationMinutes,
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

function findOneMoveView(state: AppState, targetType: OneMoveRecord['targetType'], targetId: string): OneMoveItem | null {
  if (targetType === 'catalog') return findOneMove(oneMoveCatalogFor(state.origin), targetId);
  if (targetType === 'task') {
    const task = state.tasks.find((t) => t.id === targetId && t.status === 'open');
    return task ? taskAsOneMoveItem(task) : null;
  }
  const item = state.needsMe.find((n) => n.id === targetId && n.status === 'open');
  return item ? needsMeAsOneMoveItem(item) : null;
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
  const taskCandidates: OneMoveCandidate[] = state.tasks
    .filter((task) => task.status === 'open' && todaysTaskIds.has(task.id))
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

  const move = findOneMoveView(state, record.targetType, record.targetId);
  return move ? { status: record.status, move } : { status: 'none' };
}

/**
 * Makes today's decision if there isn't one yet. The only thing that replaces
 * an existing decision is its move disappearing from the pool it came from.
 *
 * On an OVERLOADED day a move that adds work is withheld — "nothing extra
 * today" is the intervention. A move that takes load away could still be offered.
 */
export function resolveOneMoveForToday(state: AppState, ctx: TransitionContext): AppState {
  if (!isOnboardingComplete(state.onboarding)) return state;

  const existing = state.oneMoves.find((r) => r.forDate === ctx.today);
  if (existing && (existing.targetId === null || findOneMoveView(state, existing.targetType, existing.targetId))) return state;

  const pool = candidatePoolFor(state, ctx.today);
  const history = state.oneMoves.filter((r) => r !== existing);
  const alreadyDone = new Set(
    history.flatMap((r) => (r.status === 'completed' && r.targetId !== null ? [`${r.targetType}:${r.targetId}`] : []))
  );
  const candidate = pool.find((c) => !alreadyDone.has(`${c.targetType}:${c.item.id}`));

  if (!candidate) return existing ? { ...state, oneMoves: history } : state;

  const withheld = candidate.item.effect === 'adds_work' && loadTierForDay(state, ctx.today) === 'overloaded';
  const record: OneMoveRecord = {
    id: oneMoveRecordId(ctx.today),
    forDate: ctx.today,
    targetId: withheld ? null : candidate.item.id,
    targetType: candidate.targetType,
    status: withheld ? 'withheld' : 'selected',
    decidedAt: toInstant(ctx.nowMs),
    completedAt: null,
    scope: 'personal',
  };

  return { ...state, oneMoves: [...history, record] };
}

export function completeOneMove(state: AppState, ctx: TransitionContext): AppState {
  const record = state.oneMoves.find((r) => r.forDate === ctx.today);
  if (!record || record.status !== 'selected') return state;

  return {
    ...state,
    oneMoves: state.oneMoves.map((r) => (r === record ? { ...r, status: 'completed', completedAt: toInstant(ctx.nowMs) } : r)),
  };
}
