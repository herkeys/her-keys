import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';

/** The onboarding path through a running store, as the screens drive it. */
export async function finishOnboarding(store) {
  store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
  store.dispatch((state) => toggleOnboardingOption(state, 'strengths', 'cooking'));
  store.dispatch((state) => toggleOnboardingOption(state, 'struggles', 'overcommitting'));
  await store.commit((state, ctx) => resolveOneMoveForToday(completeOnboarding(state, ctx), ctx));
  await store.flush();
}

/**
 * A household this device holds under an account: the only state in which the Life Systems Audit or the app may open.
 * Identity is part of the first-run gate, so a test about onboarding or app access is a test about a held household.
 */
export const HELD_ACCOUNT = Object.freeze({
  kind: 'accountBound',
  session: { accountId: '11111111-1111-4111-8111-111111111111', accessToken: 'a', refreshToken: 'r', expiresAt: 1, provider: null },
  householdId: '33333333-3333-4333-8333-333333333333',
});

/** The route-access input for a running store, with the account restore already answered. */
export function accessFor(store, internalTools = false, account = HELD_ACCOUNT) {
  const { status, state } = store.getSnapshot();
  return { status, onboarding: state?.onboarding ?? null, internalTools, account, accountSettled: true };
}
