import { INITIAL_ACCOUNT_STATE } from '../../src/domain/account/authState.ts';
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

export function accessFor(store, internalTools = false, account = INITIAL_ACCOUNT_STATE) {
  const { status, state } = store.getSnapshot();
  return { status, onboarding: state?.onboarding ?? null, internalTools, account };
}
