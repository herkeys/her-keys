import type { AppStore, Transition } from '../../../state/appStore';
import { applySystemDraft, type SaveOutcome } from '../commands/saveDraft';
import type { DraftBase, SystemDraft } from '../commands/draft';

/**
 * Use cases: the only place Systems commands meet the store.
 *
 * The store's `commit` resolves `true` for a transition that changed nothing, so its boolean alone
 * cannot say "saved" from "the domain refused". These wrappers read what the transition itself
 * decided (it runs synchronously inside the store's serialized turn, on the very state it will
 * write) and report all three facts honestly:
 *
 *   saved      the change landed and is durable
 *   unchanged  the domain refused or there was nothing to change; nothing was written
 *   not_saved  the write did not land (storage failed, the result would not be valid state, or this
 *              session cannot save at all)
 *
 * A session whose persistence is disabled (newer-version data, unreadable storage, real data under
 * a demo build) keeps a memory-only stand-in state and the store would still "succeed" in memory.
 * Claiming a save there would be false, so these refuse before reaching the store.
 */

export type CommitResult = 'saved' | 'unchanged' | 'not_saved';

type Committer = Pick<AppStore, 'commit' | 'getSnapshot'>;

const canSave = (store: Committer): boolean => store.getSnapshot().persistence === 'enabled';

export async function commitChange(store: Committer, transition: Transition): Promise<CommitResult> {
  if (!canSave(store)) return 'not_saved';
  let changed = false;
  const ok = await store.commit((state, ctx) => {
    const next = transition(state, ctx);
    changed = next !== state;
    return next;
  });
  if (!ok) return 'not_saved';
  return changed ? 'saved' : 'unchanged';
}

export type SaveSystemResult = SaveOutcome | { kind: 'not_saved' };

/** Save a System draft. Explicit, idempotent, stale-safe. Never called while the user is merely typing. */
export async function saveSystemDraft(store: Committer, draft: SystemDraft, base: DraftBase): Promise<SaveSystemResult> {
  if (!canSave(store)) return { kind: 'not_saved' };
  let outcome = { kind: 'invalid', issues: [] } as SaveOutcome; // assigned inside the commit closure
  const ok = await store.commit((state, ctx) => {
    const result = applySystemDraft(state, ctx, draft, base);
    outcome = result.outcome;
    return result.state;
  });
  if (outcome.kind === 'saved' || outcome.kind === 'already_saved') return ok ? outcome : { kind: 'not_saved' };
  return outcome;
}
