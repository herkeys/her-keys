import { ONBOARDING_STEPS, type OnboardingStep } from '../../domain/state';

/**
 * Back, inside the Life Systems Audit.
 *
 * The audit is a linear stack, so swipe-back and the Android key already step back while the screens that were pushed are still
 * on it. They cannot after a relaunch: a household resumed part-way is handed straight to the step it had reached
 * (`app/index.tsx`), with nothing under it. A visible Back that does the right thing in both cases is what this decides.
 *
 * Going back never rewinds the furthest step reached (`recordOnboardingStep`), so every earlier step is always open and the
 * target needs no access check.
 */
export function onboardingBackTarget(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index <= 0 ? null : ONBOARDING_STEPS[index - 1];
}

export interface BackNavigator {
  canGoBack(): boolean;
  back(): void;
  replace(href: `/onboarding/${OnboardingStep}`): void;
}

export type BackOutcome = 'popped' | 'replaced' | 'none';

/** Pops when there is a screen to pop to; otherwise replaces this step with the one before it. The first step has no Back. */
export function goBackFromStep(step: OnboardingStep, nav: BackNavigator): BackOutcome {
  const target = onboardingBackTarget(step);
  if (target === null) return 'none';
  if (nav.canGoBack()) {
    nav.back();
    return 'popped';
  }
  nav.replace(`/onboarding/${target}`);
  return 'replaced';
}
