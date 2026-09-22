import type { TransitionContext } from '../../../domain/context';
import type { AppState } from '../../../domain/state';
import { acknowledge, accept, decline, delegate, liveResponsibilityFor, reassign, returnToSelf } from '../../../domain/responsibility';

/**
 * Who a System is handed to — through the foundation's responsibility lifecycle, unchanged.
 *
 *  - The holder must already exist (a person she added, or one of her children); the foundation
 *    refuses anything else, so a name is never turned into a phantom person.
 *  - Assigning is a REQUEST. It is not acknowledged and not accepted until she records that they
 *    said so. No deadline is invented: `ackDueAt` stays unknown, so nothing is ever "overdue" that
 *    she did not set a time for.
 *  - Nothing is sent. This is state; a delivery integration is a separate, later thing.
 */

export type HolderChoice = { kind: 'person' | 'child'; id: string };
export type Answer = 'acknowledged' | 'accepted' | 'declined';

const about = (systemId: string) => ({ kind: 'system', id: systemId }) as const;

export const assignResponsibility = (state: AppState, ctx: TransitionContext, systemId: string, holder: HolderChoice): AppState =>
  delegate(state, ctx, { about: about(systemId), to: holder });

export function reassignResponsibility(state: AppState, ctx: TransitionContext, systemId: string, holder: HolderChoice): AppState {
  const live = liveResponsibilityFor(state, about(systemId));
  return live === null || live.responsibleKind === 'self' ? state : reassign(state, ctx, live.id, holder);
}

export function takeBackResponsibility(state: AppState, ctx: TransitionContext, systemId: string): AppState {
  const live = liveResponsibilityFor(state, about(systemId));
  return live === null ? state : returnToSelf(state, ctx, live.id);
}

/** Record what they said. Each is a distinct fact: seen is not yes, and yes is not done. */
export function recordAnswer(state: AppState, ctx: TransitionContext, systemId: string, answer: Answer): AppState {
  const live = liveResponsibilityFor(state, about(systemId));
  if (live === null) return state;
  switch (answer) {
    case 'acknowledged':
      return acknowledge(state, ctx, live.id);
    case 'accepted':
      // Accepting is not, by itself, proof the load left (responsibility.ts): recording that someone said yes to a
      // System must not silently stop it from needing her until she says the load is actually covered.
      return accept(state, ctx, live.id, true);
    case 'declined':
      return decline(state, ctx, live.id);
  }
}
