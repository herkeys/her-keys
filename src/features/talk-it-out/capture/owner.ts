import type { StoreSnapshot } from '../../../state/appStore';

/**
 * WHO a capture belongs to, for the one question the capture feature must get right across an account change:
 * "is the household I am about to write into still the one this work started in?"
 *
 * Two answers, deliberately different:
 *
 *   `boundOwnerOf`  The cloud household this device is bound to, or null while the device is unbound (a local household, or a household
 *                   whose account signed out). Compared with `ownerChanged`, which is only true when BOTH sides name a household and they
 *                   differ. Binding a local household to its first account (null -> account) is the same household being claimed, not a
 *                   switch; signing out (account -> null) keeps the household and leaves it available to the same account. A genuinely
 *                   different account or household is the only thing that trips it. A household that was reset is a third case: the
 *                   work's own source no longer exists, which every coordinator step already treats as "nothing to write into".
 *
 *   `ownerKeyOf`    The strict key the Talk It Out conversation uses to throw away a turn when ANY part of the household's identity moved.
 *                   It is the same triple the conversation fence has always used, kept here so the two cannot drift apart.
 *
 * Neither reads a credential or anything she said.
 */

export function boundOwnerOf(snapshot: Pick<StoreSnapshot, 'identity'>): string | null {
  const binding = snapshot.identity.binding;
  return binding ? `${binding.accountId}|${binding.householdId}` : null;
}

export const ownerChanged = (before: string | null, now: string | null): boolean => before !== null && now !== null && before !== now;

const householdNumbers = new WeakMap<object, number>();
let householdCount = 0;
/** A stable number per household OBJECT: a reset builds a new one with the same id, and the conversation must not outlive it. */
function householdNumber(household: object | undefined): number | null {
  if (!household) return null;
  let known = householdNumbers.get(household);
  if (known === undefined) {
    householdCount += 1;
    known = householdCount;
    householdNumbers.set(household, known);
  }
  return known;
}

export function ownerKeyOf(snapshot: Pick<StoreSnapshot, 'identity' | 'state'>): string {
  const binding = snapshot.identity.binding;
  return [binding?.accountId, binding?.householdId, binding?.boundAt, snapshot.state?.household.id, householdNumber(snapshot.state?.household)].join('|');
}

/**
 * The token a piece of capture work carries from the moment it starts: WHO the household is bound to, and WHICH household object it
 * wrote into. The second half matters because the local household's id is a constant ('household-1'): a reset builds a brand new
 * household with the same id and an unbound identity, so neither the id nor an "unbound" identity can tell "she signed out" from "the
 * household this work belongs to was wiped". The household OBJECT can. No transition rebuilds `state.household` (it is only created
 * by a fresh or hydrated state), so a different object, or none, means a different household.
 */
export interface CaptureEpoch {
  readonly owner: string | null;
  readonly household: object | null;
}

export function epochOf(snapshot: Pick<StoreSnapshot, 'identity' | 'state'>): CaptureEpoch {
  return { owner: boundOwnerOf(snapshot), household: snapshot.state?.household ?? null };
}

/**
 * True when work started at `before` must not write now. Fails closed:
 *   - both sides name a bound household and they differ (another account, another household);
 *   - the household it started in is gone or was replaced (a reset, whether or not the new one is bound yet, and a store that is
 *     mid-hydration).
 * Not a change: first claim (unbound -> bound) and sign-out (bound -> unbound) on the SAME household, which keep every row she made.
 */
export function epochChanged(before: CaptureEpoch, snapshot: Pick<StoreSnapshot, 'identity' | 'state'>): boolean {
  const now = epochOf(snapshot);
  if (ownerChanged(before.owner, now.owner)) return true;
  return before.household !== null && before.household !== now.household;
}
