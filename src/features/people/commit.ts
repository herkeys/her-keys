import type { TransitionContext } from '../../domain/context';
import type { PeopleOutcome, PeopleResult } from '../../domain/people';
import type { AppState } from '../../domain/state';
import type { AppStore } from '../../state/appStore';

export type PeopleTransition = (state: AppState, ctx: TransitionContext) => PeopleResult;

export interface PeopleCommit {
  /** The command's own named outcome, or `not_saved` when the store could not make a successful change durable. */
  outcome: PeopleOutcome | 'not_saved';
  id: string | null;
}

/**
 * Run one People command through `store.commit` — which SAVES BEFORE SHOWING and applies the whole transition or none of it — and report
 * the command's NAMED outcome. A success the store could not make durable is `not_saved`, never `saved`. A refusal never reaches the
 * store (its transition returns the state unchanged).
 */
export async function commitPeople(store: Pick<AppStore, 'commit'>, run: PeopleTransition): Promise<PeopleCommit> {
  const held: { result: PeopleResult | null } = { result: null };
  const committed = await store.commit((state, ctx) => {
    held.result = run(state, ctx);
    return held.result.state;
  });
  const result = held.result;
  if (result === null) return { outcome: 'not_saved', id: null };
  if (result.outcome === 'saved' && !committed) return { outcome: 'not_saved', id: null };
  return { outcome: result.outcome, id: result.id };
}
