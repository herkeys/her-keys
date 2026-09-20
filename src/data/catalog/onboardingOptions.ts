/**
 * The choices offered during the Life Systems Audit. Answers are stored by
 * `id`, never by label, so the wording can change without orphaning what
 * someone already chose.
 */

export interface OnboardingOption {
  id: string;
  label: string;
}

export type OnboardingGroup = 'goals' | 'strengths' | 'struggles';

export const onboardingOptions: Record<OnboardingGroup, readonly OnboardingOption[]> = {
  goals: [
    { id: 'financial-stability', label: 'Financial stability' },
    { id: 'calmer-household', label: 'A calmer household' },
    { id: 'more-time-with-kids', label: 'More time with the kids' },
    { id: 'better-routines', label: 'Better routines' },
    { id: 'reduced-stress', label: 'Reduced stress' },
    { id: 'building-savings', label: 'Building savings' },
  ],
  strengths: [
    { id: 'kids-schedules', label: "Kids' schedules" },
    { id: 'cooking', label: 'Cooking' },
    { id: 'work-deadlines', label: 'Work deadlines' },
    { id: 'home-maintenance', label: 'Home maintenance' },
    { id: 'planning-ahead', label: 'Planning ahead' },
    { id: 'communication', label: 'Communication' },
  ],
  struggles: [
    { id: 'overcommitting', label: 'Overcommitting' },
    { id: 'paperwork-piling-up', label: 'Paperwork piling up' },
    { id: 'financial-avoidance', label: 'Financial avoidance' },
    { id: 'last-minute-meals', label: 'Last-minute meals' },
    { id: 'unrealistic-calendars', label: 'Unrealistic calendars' },
    { id: 'frozen-when-overloaded', label: 'Becoming frozen when overloaded' },
  ],
};

export function isOnboardingOptionId(group: OnboardingGroup, id: string): boolean {
  return onboardingOptions[group].some((option) => option.id === id);
}

/** Labels in catalog order, skipping anything the catalog no longer offers. */
export function onboardingLabels(group: OnboardingGroup, ids: readonly string[]): string[] {
  return onboardingOptions[group].filter((option) => ids.includes(option.id)).map((option) => option.label);
}

/**
 * The stable id for a stored answer, accepting either form.
 *
 * Answers are stored by id, so an id is what this normally receives. The label
 * branch exists for one reason: a caller that resolved ids to display text
 * before handing them on. Matching such a value by label keeps that path
 * working, but it is a compatibility shim, not an identity — reasoning keys on
 * the id returned here, so rewording a label can never change a conclusion.
 */
export function resolveOnboardingOptionId(group: OnboardingGroup, value: string | undefined): string | null {
  if (!value) return null;

  const byId = onboardingOptions[group].find((option) => option.id === value);
  if (byId) return byId.id;

  const byLabel = onboardingOptions[group].find((option) => option.label === value);
  return byLabel ? byLabel.id : null;
}
