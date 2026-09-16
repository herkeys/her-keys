import { demoOneMoves, findOneMove } from '../data/catalog/oneMoves';
import type { OneMoveItem } from '../types';
import type { TransitionContext } from './context';
import { loadTierForDay } from './loadTier';
import { toInstant, type LocalDate } from './logicalDay';
import { isOnboardingComplete } from './onboarding';
import type { AppState, DataOrigin, OneMoveRecord } from './state';

/**
 * Each logical day gets one One Move decision, stored the moment it's made.
 * Once she has seen it, it's a commitment: a restart or a change elsewhere in
 * the day doesn't swap it for a different move, and a day that was too full
 * for one stays that way even if she frees up time later. The next day
 * decides afresh.
 */

export type OneMoveView =
  | { status: 'none' }
  | { status: 'withheld' }
  | { status: 'selected' | 'completed'; move: OneMoveItem };

export function oneMoveCatalogFor(origin: DataOrigin): readonly OneMoveItem[] {
  return origin === 'demo' ? demoOneMoves : [];
}

export function oneMoveRecordId(date: LocalDate): string {
  return `onemove-${date}`;
}

export function oneMoveForDay(state: AppState, date: LocalDate): OneMoveView {
  const record = state.oneMoves.find((r) => r.forDate === date);
  if (!record) return { status: 'none' };
  if (record.status === 'withheld' || record.targetId === null) return { status: 'withheld' };

  const move = findOneMove(oneMoveCatalogFor(state.origin), record.targetId);
  return move ? { status: record.status, move } : { status: 'none' };
}

/**
 * Makes today's decision if there isn't one yet. The only thing that replaces
 * an existing decision is its move disappearing from the catalog.
 *
 * On an OVERLOADED day a move that adds work is withheld — "nothing extra
 * today" is the intervention. A move that takes load away could still be offered.
 */
export function resolveOneMoveForToday(state: AppState, ctx: TransitionContext): AppState {
  if (!isOnboardingComplete(state.onboarding)) return state;

  const catalog = oneMoveCatalogFor(state.origin);
  const existing = state.oneMoves.find((r) => r.forDate === ctx.today);
  if (existing && (existing.targetId === null || findOneMove(catalog, existing.targetId))) return state;

  const history = state.oneMoves.filter((r) => r !== existing);
  const alreadyDone = new Set(history.flatMap((r) => (r.status === 'completed' && r.targetId !== null ? [r.targetId] : [])));
  const candidate = catalog.find((move) => !alreadyDone.has(move.id));

  if (!candidate) return existing ? { ...state, oneMoves: history } : state;

  const withheld = candidate.effect === 'adds_work' && loadTierForDay(state, ctx.today) === 'overloaded';
  const record: OneMoveRecord = {
    id: oneMoveRecordId(ctx.today),
    forDate: ctx.today,
    targetId: withheld ? null : candidate.id,
    targetType: 'catalog',
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
