import { isOnboardingOptionId, type OnboardingGroup } from '../data/catalog/onboardingOptions';
import type { TransitionContext } from './context';
import { onboardingProvenance, type Provenance } from './foundation/provenance';
import { toInstant } from './logicalDay';
import { ONBOARDING_STEPS, type AppState, type Onboarding, type OnboardingStep } from './state';

const GROUP_FIELDS = { goals: 'goalIds', strengths: 'strengthIds', struggles: 'struggleIds' } as const;

/** Blank until she answers, and every answer is hers — so the record is the intake flow's, unless the household is a demo. */
export function initialOnboarding(provenance: Provenance = onboardingProvenance()): Onboarding {
  return { goalIds: [], strengthIds: [], struggleIds: [], lastStep: null, completedAt: null, provenance: { ...provenance }, scope: 'personal' };
}

export function isOnboardingComplete(onboarding: Onboarding): boolean {
  return onboarding.completedAt !== null;
}

export function toggleOnboardingOption(state: AppState, group: OnboardingGroup, optionId: string): AppState {
  const { onboarding } = state;
  if (isOnboardingComplete(onboarding) || !isOnboardingOptionId(group, optionId)) return state;

  const field = GROUP_FIELDS[group];
  const current = onboarding[field];
  const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  return { ...state, onboarding: { ...onboarding, [field]: next } };
}

/**
 * Which steps can be opened, so a link can't skip past a choice the audit
 * needs. The same rule the Continue buttons already enforce.
 */
export function onboardingStepAccess(onboarding: Onboarding): Record<OnboardingStep, boolean> {
  const hasGoals = onboarding.goalIds.length > 0;
  const hasStrengths = hasGoals && onboarding.strengthIds.length > 0;
  const hasStruggles = hasStrengths && onboarding.struggleIds.length > 0;
  return {
    goals: true,
    strengths: hasGoals,
    struggles: hasStrengths,
    'talk-it-out': hasStruggles,
    profile: hasStruggles,
    plus: hasStruggles,
  };
}

/** Remembers the furthest step reached. Going back doesn't rewind it, so there's nothing to write. */
export function recordOnboardingStep(state: AppState, step: OnboardingStep): AppState {
  const { onboarding } = state;
  if (isOnboardingComplete(onboarding)) return state;

  const reached = onboarding.lastStep === null ? -1 : ONBOARDING_STEPS.indexOf(onboarding.lastStep);
  if (ONBOARDING_STEPS.indexOf(step) <= reached) return state;
  return { ...state, onboarding: { ...onboarding, lastStep: step } };
}

/**
 * Completion is a household-side fact only: it records that onboarding
 * finished, never why (a purchase, a restore, or continuing without Plus
 * under the soft paywall policy). Which resolutions may call this at all is
 * decided in `src/monetization/entitlement.ts` (`canResolveOnboardingPlus`),
 * not here — this function has no entitlement parameter to remove.
 */
export function completeOnboarding(state: AppState, ctx: TransitionContext): AppState {
  const { onboarding } = state;
  if (isOnboardingComplete(onboarding) || !onboardingStepAccess(onboarding).plus) return state;
  return { ...state, onboarding: { ...onboarding, lastStep: 'plus', completedAt: toInstant(ctx.nowMs) } };
}

/** Where to pick up on relaunch: the furthest step reached that can still be opened, or null to start at Welcome. */
export function onboardingResumeStep(onboarding: Onboarding): OnboardingStep | null {
  if (isOnboardingComplete(onboarding) || onboarding.lastStep === null) return null;

  const access = onboardingStepAccess(onboarding);
  const reached = ONBOARDING_STEPS.indexOf(onboarding.lastStep);
  for (let index = reached; index >= 0; index--) {
    if (access[ONBOARDING_STEPS[index]]) return ONBOARDING_STEPS[index];
  }
  return 'goals';
}

/** Answers the catalog no longer offers can't be shown or reasoned about, so they're dropped rather than kept as dangling ids. */
export function dropUnknownOnboardingOptions(state: AppState): { state: AppState; dropped: string[] } {
  const dropped: string[] = [];
  const keep = (group: OnboardingGroup, ids: string[]) =>
    ids.filter((id) => {
      const known = isOnboardingOptionId(group, id);
      if (!known) dropped.push(`${group}:${id}`);
      return known;
    });

  const { onboarding } = state;
  const next = {
    ...onboarding,
    goalIds: keep('goals', onboarding.goalIds),
    strengthIds: keep('strengths', onboarding.strengthIds),
    struggleIds: keep('struggles', onboarding.struggleIds),
  };
  return dropped.length === 0 ? { state, dropped } : { state: { ...state, onboarding: next }, dropped };
}
