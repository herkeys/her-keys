import type { OnboardingAnswers, OperatingProfile } from '../../types';

/**
 * Turns raw onboarding selections into framed hypotheses. Everything starts
 * at 'possible' confidence — nothing here should read as a verdict. A later
 * build would raise these to 'likely' / 'established' as real behavioral
 * evidence accumulates (see HER_KEYS_PRODUCT.md section 15, AI Confidence).
 */
export function buildOperatingProfile(answers: OnboardingAnswers): OperatingProfile {
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

  return { insights, stillLearning: describeUnknown(answers) };
}

/** Naming the open question is how Her Keys signals it is still forming a view. */
function describeUnknown(answers: OnboardingAnswers): string {
  const first = answers.struggles[0];

  switch (first) {
    case 'Financial avoidance':
      return 'Whether money feels heavy because of cash flow, or because of the decisions attached to it.';
    case 'Paperwork piling up':
      return 'Whether paperwork piles up from lack of time, or from having nowhere to put it.';
    case 'Overcommitting':
      return 'Whether your days are genuinely overfull, or just packed too tightly together.';
    case 'Becoming frozen when overloaded':
      return 'What usually tips a day from full into frozen.';
    case 'Last-minute meals':
      return 'Whether dinner is a planning problem or an energy problem.';
    case 'Unrealistic calendars':
      return 'Whether the calendar is wrong, or the time estimates behind it are.';
    default:
      return 'Which parts of your week actually cost you the most.';
  }
}
