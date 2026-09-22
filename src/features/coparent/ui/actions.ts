import type { TransitionContext } from '../../../domain/context';
import type { AppState } from '../../../domain/state';
import { COPY } from '../copy';
import {
  followUpEditorSeed,
  handoffEditorSeed,
  reassignCounterpart,
  recordAnswer,
  recordCounterpart,
  recordStillNeedsMe,
  type CounterpartInput,
  type FollowUpFields,
  type HandoffFields,
  type MutationResult,
  type ResponsibilityOutcome,
} from '../mutations';
import type { ResponsibilityAction } from '../present';
import { buildMoneyFollowUpDetail, buildTransitionDetail } from '../projection';
import type { BlockedReason, CoParentLogisticsView, ResponsibilityView, TransitionView } from '../types';

/**
 * WIRING, WITHOUT A SCREEN.
 *
 * Pure functions the containers use to turn a tap into the one mutation it means, and an outcome into the one sentence for it. Kept
 * out of the components so the mapping is testable against a real household without rendering anything.
 */

/** A person she is asking, or reassigning to. "Not recorded" is not an answer to either question. */
export type CounterpartChoice = Exclude<CounterpartInput, { kind: 'none' }>;

export type ResponsibilityRun = (state: AppState, ctx: TransitionContext) => MutationResult<ResponsibilityOutcome>;

/**
 * The mutation a responsibility button stands for, or null when the tap cannot form one (a person is needed and none was chosen, or
 * the button needs a recorded responsibility and there is none). A null is never turned into a guess.
 */
export function responsibilityRun(
  about: { kind: 'event' | 'task'; id: string },
  view: ResponsibilityView,
  action: ResponsibilityAction,
  counterpart: CounterpartChoice | null
): ResponsibilityRun | null {
  const responsibilityId = view.responsibilityId;
  switch (action) {
    case 'record_asked':
      return counterpart === null ? null : (state, ctx) => recordCounterpart(state, ctx, about, counterpart);
    case 'reassign':
      return responsibilityId === null || counterpart === null ? null : (state, ctx) => reassignCounterpart(state, ctx, responsibilityId, counterpart);
    case 'still_needs_me':
      return responsibilityId === null ? null : (state, ctx) => recordStillNeedsMe(state, ctx, responsibilityId, true);
    case 'no_longer_needs_me':
      return responsibilityId === null ? null : (state, ctx) => recordStillNeedsMe(state, ctx, responsibilityId, false);
    case 'acknowledged':
    case 'accepted_covered':
    case 'accepted_needs_me':
    case 'declined':
    case 'completed':
    case 'returned':
      return responsibilityId === null ? null : (state, ctx) => recordAnswer(state, ctx, responsibilityId, action);
  }
}

/** Every outcome that is not a success has a sentence in `COPY.outcomes`; an outcome without one is reported as not saved. */
export function outcomeMessage(outcome: string): string {
  const known = COPY.outcomes as Readonly<Record<string, string>>;
  return Object.hasOwn(known, outcome) ? known[outcome] : COPY.outcomes.not_saved;
}

/**
 * The values a handoff editor opens with. A handoff whose child was never recorded is exactly the one flagged "needs review", and
 * choosing its child is the fix, so `handoffEditorSeed` opens it with the child UNCHOSEN (`''`) and `editHandoff` refuses to save
 * until she picks one. The revision token a stale edit is judged by is the row's own, so it is exactly what `editHandoff` computes.
 */
export function handoffSeedFor(state: AppState, eventId: string): ReturnType<typeof handoffEditorSeed> {
  return handoffEditorSeed(state, eventId);
}

// ------------------------------------------------------------------------------------------------------------------ editors

/** A new handoff opens EMPTY: no child unless there is exactly one, no date, no time, no length. Nothing is guessed. */
export const BLANK_HANDOFF: HandoffFields = {
  childId: '',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  location: '',
  notes: '',
  commitment: 'fixed',
  needsMe: null,
  repeat: 'none',
};

/** A new follow-up opens with no amount, no currency and no direction — those are her answers to give. */
export const BLANK_FOLLOW_UP: FollowUpFields = { title: '', childId: null, amountText: '', currency: '', direction: null, followUpDate: '', notes: '' };

/**
 * Whether an editor may open, decided ONCE when it opens. `ready` carries the row as it was at that moment (the seed), so a later
 * change to the row is met by a stale refusal at save time instead of by silently re-seeding or discarding what she is typing.
 */
export type EditorGate<Seed> =
  | { kind: 'ready'; seed: Seed }
  /** A new record cannot be made here right now; `codes` say why. */
  | { kind: 'blocked'; codes: BlockedReason[] }
  | { kind: 'not_found' }
  | { kind: 'not_a_record' };

export interface EditorSeed<Fields> {
  fields: Fields;
  baseUpdatedAt: string | null;
}

const creatable = <Fields>(view: CoParentLogisticsView, fields: Fields): EditorGate<EditorSeed<Fields>> =>
  view.capability.canCreate ? { kind: 'ready', seed: { fields, baseUpdatedAt: null } } : { kind: 'blocked', codes: view.capability.blocked };

/** A new handoff (no id), or an existing active handoff. A removed one is not editable: it is gone from her list. */
export function handoffEditorGate(state: AppState, view: CoParentLogisticsView, id: string | undefined): EditorGate<EditorSeed<HandoffFields>> {
  if (id === undefined) return creatable(view, BLANK_HANDOFF);
  const detail = buildTransitionDetail(state, view.householdId, id, { nowMs: view.nowMs });
  if (detail.status === 'not_a_handoff') return { kind: 'not_a_record' };
  if (detail.status !== 'ok' || detail.transition === null || detail.transition.lifecycle === 'removed') return { kind: 'not_found' };
  const seed = handoffSeedFor(state, id);
  return seed === null ? { kind: 'not_found' } : { kind: 'ready', seed };
}

export const preparationEditorGate = (view: CoParentLogisticsView): EditorGate<null> =>
  view.capability.canCreate ? { kind: 'ready', seed: null } : { kind: 'blocked', codes: view.capability.blocked };

/**
 * The handoffs a new preparation item can be tied to: everything coming up, plus the one she arrived from — even if its time has
 * passed, because "Add preparation" on a handoff must link to THAT handoff, not quietly to nothing. A removed one is never offered.
 */
export function linkableTransitions(state: AppState, view: CoParentLogisticsView, arrivedFrom: string | undefined): TransitionView[] {
  const listed = [...view.transitions];
  if (arrivedFrom === undefined || listed.some((transition) => transition.id === arrivedFrom)) return listed;
  const detail = buildTransitionDetail(state, view.householdId, arrivedFrom, { nowMs: view.nowMs });
  const opened = detail.transition;
  return detail.status === 'ok' && opened !== null && opened.lifecycle === 'active' ? [...listed, opened] : listed;
}

/** A new follow-up (no id), or an OPEN existing one. A follow-up already marked done or removed cannot be edited. */
export function followUpEditorGate(state: AppState, view: CoParentLogisticsView, id: string | undefined): EditorGate<EditorSeed<FollowUpFields>> {
  if (id === undefined) return creatable(view, BLANK_FOLLOW_UP);
  const detail = buildMoneyFollowUpDetail(state, view.householdId, id, { nowMs: view.nowMs });
  if (detail.status === 'not_a_follow_up') return { kind: 'not_a_record' };
  if (detail.status !== 'ok' || detail.followUp === null || detail.followUp.standing !== 'open') return { kind: 'not_found' };
  const seed = followUpEditorSeed(state, id);
  return seed === null ? { kind: 'not_found' } : { kind: 'ready', seed };
}
