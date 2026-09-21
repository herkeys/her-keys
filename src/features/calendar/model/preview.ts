import type { TransitionContext } from '../../../domain/context';
import { approveDailyLoadMove, keepDailyLoadPlan, undoRecommendedMove } from '../../../domain/dailyLoadDecisions';
import { addDays, type LocalDate } from '../../../domain/logicalDay';
import { approveDropTask, approveMoveEvent, approveProtectItem, approveShortenTask, keepCapacityPlan } from '../../../domain/recommendationActions';
import type { AppState } from '../../../domain/state';
import type { Transition } from '../../../state/appStore';
import { projectCalendarDay } from './projectCalendar';
import { revisionOf, sameToken, tokenOf, type RevisionToken } from './revision';
import type { CalendarDayViewModel } from './types';

/**
 * PREVIEW / WHAT-IF (contract sections 30, 31, 31A, 31B).
 *
 * A preview is the SAME pure foundation mutation Accept will run, applied to an in-memory copy of the
 * state and re-projected. It therefore cannot describe a change Accept would not make, and Calendar has
 * no second ranking or planning algorithm. It is presentation state: never written to the store, never
 * persisted, never synced — a restart discards it and canonical state is unchanged.
 *
 * A preview remembers the identity of the canonical slices it was computed from (`basedOn`). If any of
 * them is replaced — a legitimate mutation, a background pull, a day rollover — the preview is either
 * recomputed against the current state or explicitly invalidated. It never keeps describing a stale
 * world, and Accept refuses to apply a proposal against a state it was not validated against.
 */

export type PreviewableIntent =
  | { kind: 'move_event'; id: string }
  | { kind: 'move_task'; id: string }
  | { kind: 'drop_task'; id: string }
  | { kind: 'shorten_task'; id: string }
  | { kind: 'protect'; targetType: 'task' | 'event'; targetId: string };

export type ActionIntent = PreviewableIntent | { kind: 'keep_timing' } | { kind: 'keep_capacity' } | { kind: 'undo_move'; actionId: string };

/** Each intent is exactly one foundation mutation. */
export function applyIntent(state: AppState, ctx: TransitionContext, intent: ActionIntent): AppState {
  switch (intent.kind) {
    case 'move_event': return approveMoveEvent(state, ctx, intent.id);
    case 'move_task': return approveDailyLoadMove(state, ctx, intent.id);
    case 'drop_task': return approveDropTask(state, ctx, intent.id);
    case 'shorten_task': return approveShortenTask(state, ctx, intent.id);
    case 'protect': return approveProtectItem(state, ctx, { targetType: intent.targetType, targetId: intent.targetId });
    case 'keep_timing': return keepDailyLoadPlan(state, ctx, null);
    case 'keep_capacity': return keepCapacityPlan(state, ctx);
    case 'undo_move': return undoRecommendedMove(state, ctx, intent.actionId);
  }
}

/** A throwaway context: ids and the clock only matter to the discarded copy. */
const previewContext = (today: LocalDate, nowMs: number): TransitionContext => ({ nowMs, today, createId: (prefix) => `${prefix}-preview` });

export interface ActionPreview {
  intent: PreviewableIntent;
  /** The canonical slices this was computed from. In memory only. */
  basedOn: RevisionToken;
  basedOnRevision: string;
  date: LocalDate;
  today: LocalDate;
  before: CalendarDayViewModel;
  /** The day as it WOULD be. Marked as a preview; never the store's state. */
  after: CalendarDayViewModel;
  /** For a move: tomorrow, where the item would land, so a collision is visible before it happens. */
  destination: { date: LocalDate; before: CalendarDayViewModel; after: CalendarDayViewModel } | null;
  /** True when this was recomputed after the schedule changed underneath it. */
  updated: boolean;
}

export type PreviewOutcome = { ok: true; preview: ActionPreview } | { ok: false; reason: 'not_offered' };

const moves = (intent: PreviewableIntent): boolean => intent.kind === 'move_event' || intent.kind === 'move_task';

export function computePreview(args: { state: AppState; today: LocalDate; nowMs: number; date: LocalDate; intent: PreviewableIntent; updated?: boolean }): PreviewOutcome {
  const { state, today, nowMs, date, intent } = args;
  const next = applyIntent(state, previewContext(today, nowMs), intent);
  if (next === state) return { ok: false, reason: 'not_offered' };

  const revision = revisionOf(state);
  const marker = { active: true as const, basedOnRevision: revision, validity: 'current' as const };
  const after = { ...projectCalendarDay({ state: next, date, today, nowMs }), preview: marker };
  const destinationDate = addDays(today, 1);

  return {
    ok: true,
    preview: {
      intent,
      basedOn: tokenOf(state, today),
      basedOnRevision: revision,
      date,
      today,
      before: projectCalendarDay({ state, date, today, nowMs }),
      after,
      destination: moves(intent)
        ? {
            date: destinationDate,
            before: projectCalendarDay({ state, date: destinationDate, today, nowMs, includeActions: false }),
            after: { ...projectCalendarDay({ state: next, date: destinationDate, today, nowMs, includeActions: false }), preview: marker },
          }
        : null,
      updated: args.updated === true,
    },
  };
}

export type PreviewValidity = 'current' | 'stale';
export const validityOf = (preview: ActionPreview, state: AppState, today: LocalDate): PreviewValidity =>
  sameToken(preview.basedOn, tokenOf(state, today)) ? 'current' : 'stale';

export type PreviewRefresh = { status: 'current'; preview: ActionPreview } | { status: 'updated'; preview: ActionPreview } | { status: 'invalid' };

/**
 * The canonical state changed underneath a preview. Recompute it against the CURRENT state if the same
 * action is still legitimately offered; otherwise report it invalid so the screen says so. Never both
 * silent and stale.
 */
export function refreshPreview(preview: ActionPreview, args: { state: AppState; today: LocalDate; nowMs: number }): PreviewRefresh {
  if (validityOf(preview, args.state, args.today) === 'current') return { status: 'current', preview };
  const outcome = computePreview({ ...args, date: preview.date, intent: preview.intent, updated: true });
  return outcome.ok ? { status: 'updated', preview: outcome.preview } : { status: 'invalid' };
}

// ------------------------------------------------------------------ commit ---

export type AcceptStatus = 'applied' | 'stale' | 'not_applied' | 'failed';

/**
 * Commit one intent through the store. `commit` reports success for a transition that changed nothing
 * (F03-FG-12), so "applied" is recorded from inside the transition, where the answer is known. If an
 * expected token is given and the current state no longer matches it, nothing is applied. A second
 * accept of the same intent finds the state already changed and cannot corrupt it.
 */
export async function acceptIntent(
  store: { commit: (transition: Transition) => Promise<boolean> },
  intent: ActionIntent,
  expected: RevisionToken | null
): Promise<{ status: AcceptStatus }> {
  let outcome: Exclude<AcceptStatus, 'failed'> = 'not_applied';
  try {
    const saved = await store.commit((current, ctx) => {
      if (expected !== null && !sameToken(expected, tokenOf(current, ctx.today))) {
        outcome = 'stale';
        return current;
      }
      const next = applyIntent(current, ctx, intent);
      outcome = next === current ? 'not_applied' : 'applied';
      return next;
    });
    return { status: saved ? outcome : 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
