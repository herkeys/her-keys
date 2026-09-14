import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { onboardingLabels } from '../data/catalog/onboardingOptions';
import {
  completeOnboarding,
  onboardingResumeStep,
  onboardingStepAccess,
  recordOnboardingStep,
  toggleOnboardingOption,
} from '../domain/onboarding';
import { resolveOneMoveForToday } from '../domain/oneMove';
import type { OnboardingStep } from '../domain/state';
import type { OnboardingAnswers } from '../types';
import { useAppStore, useHouseholdState } from './AppStateProvider';

interface OnboardingContextValue {
  /** Chosen option ids — stored by id so the wording can change safely. */
  selected: { goalIds: string[]; strengthIds: string[]; struggleIds: string[] };
  /** The same choices as labels, for the operating profile. */
  answers: OnboardingAnswers;
  resumeStep: OnboardingStep | null;
  toggleGoal: (optionId: string) => void;
  toggleStrength: (optionId: string) => void;
  toggleStruggle: (optionId: string) => void;
  recordStep: (step: OnboardingStep) => void;
  /** Saves completion before the app opens up; resolves once it has. */
  complete: () => Promise<void>;
  stepAccess: Record<OnboardingStep, boolean>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const { onboarding } = useHouseholdState().state;

  const value = useMemo<OnboardingContextValue>(
    () => ({
      selected: { goalIds: onboarding.goalIds, strengthIds: onboarding.strengthIds, struggleIds: onboarding.struggleIds },
      answers: {
        goals: onboardingLabels('goals', onboarding.goalIds),
        strengths: onboardingLabels('strengths', onboarding.strengthIds),
        struggles: onboardingLabels('struggles', onboarding.struggleIds),
      },
      resumeStep: onboardingResumeStep(onboarding),
      stepAccess: onboardingStepAccess(onboarding),
      toggleGoal: (id) => store.dispatch((state) => toggleOnboardingOption(state, 'goals', id)),
      toggleStrength: (id) => store.dispatch((state) => toggleOnboardingOption(state, 'strengths', id)),
      toggleStruggle: (id) => store.dispatch((state) => toggleOnboardingOption(state, 'struggles', id)),
      recordStep: (step) => store.dispatch((state) => recordOnboardingStep(state, step)),
      complete: () => store.commit((state, ctx) => resolveOneMoveForToday(completeOnboarding(state, ctx), ctx)),
    }),
    [onboarding, store]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
