import { resolveOnboardingOptionId } from '../../data/catalog/onboardingOptions';
import type { OnboardingAnswers, OperatingProfile } from '../../types';

/**
 * Turns raw onboarding selections into framed hypotheses. Everything starts
 * at 'possible' confidence — nothing here should read as a verdict. A later
 * build would raise these to 'likely' / 'established' as real behavioral
 * evidence accumulates (see HER_KEYS_PRODUCT.md section 15, AI Confidence).
 */
export function buildOperatingProfile(
  answers: OnboardingAnswers,
  struggleIds?: readonly string[]
): OperatingProfile {
  const insights: OperatingProfile['insights'] = [];

  if (answers.goals.length > 0) {
    insights.push({
      label: 'Rebuilding toward',
      confidence: 'possible',
      detail: `${answers.goals.join(' · ')}. This will sharpen as Her Keys sees what you actually spend time on.`,
    });
  }

  if (answers.strengths.length > 0) {
    insights.push({
      label: 'Already working',
      confidence: 'possible',
      detail: `${answers.strengths.join(' · ')}. Her Keys won’t try to fix what isn’t broken here.`,
    });
  }

  if (answers.struggles.length > 0) {
    insights.push({
      label: 'Starting hypothesis',
      confidence: 'possible',
      detail: `${answers.struggles.join(' · ')} may be where things break down. A theory, not a verdict — Her Keys will test it.`,
    });
  }

  return { insights, stillLearning: describeUnknown(answers, struggleIds) };
}

/**
 * Naming the open question is how Her Keys signals it is still forming a view.
 *
 * Keyed on the stable option id, never on display text: the wording of a
 * struggle is presentation and may be rewritten at any time, but which struggle
 * she picked is identity. `struggleIds` is the authoritative input; the
 * `answers` fallback resolves a legacy label-shaped value through the catalog
 * so an older caller still lands on the same id.
 */
function describeUnknown(answers: OnboardingAnswers, struggleIds?: readonly string[]): string {
  const first = struggleIds?.[0] ?? resolveOnboardingOptionId('struggles', answers.struggles[0]);

  switch (first) {
    case 'financial-avoidance':
      return 'Whether money feels heavy because of cash flow, or because of the decisions attached to it.';
    case 'paperwork-piling-up':
      return 'Whether paperwork piles up from lack of time, or from having nowhere to put it.';
    case 'overcommitting':
      return 'Whether your days are genuinely overfull, or just packed too tightly together.';
    case 'frozen-when-overloaded':
      return 'What usually tips a day from full into frozen.';
    case 'last-minute-meals':
      return 'Whether dinner is a planning problem or an energy problem.';
    case 'unrealistic-calendars':
      return 'Whether the calendar is wrong, or the time estimates behind it are.';
    default:
      return 'Which parts of your week actually cost you the most.';
  }
}
