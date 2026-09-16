import type { DailyLoadIssues } from '../../domain/dailyLoadIssues';
import type { DailyLoadAssessment, DailyLoadDecision } from '../../types';

/**
 * The one sentence under the greeting: the overall state of the day, before
 * any detail. It changes as the user acts so the top of Today always reflects
 * where things actually stand — and it reads the same verdict the Daily Load
 * card shows, so the two can never disagree.
 */
export function describeDayState(assessment: DailyLoadAssessment, decision: DailyLoadDecision, issues?: DailyLoadIssues): string {
  if (decision === 'moved') {
    // One move isn't always enough, so only claim room the recalculated day actually has.
    const roomNow = issues ? issues.tier === 'open' : assessment.status === 'balanced';
    return roomNow ? 'One change made. Today has room now.' : 'One change made. Today is still tight.';
  }
  if (decision === 'kept') return 'Today stays as you planned it.';

  if (issues) {
    if (issues.primary?.kind === 'overlap') return 'Two of today’s commitments overlap.';
    if (issues.primary?.kind === 'capacity_pressure') return 'Today has more on it than it can hold.';
    return issues.tier === 'open' ? 'Her Keys looked across today. Nothing needs moving.' : 'Your day works — but one window is too tight.';
  }
  if (assessment.status === 'balanced') return 'Her Keys looked across today. Nothing needs moving.';
  return 'Your day works — but one window is too tight.';
}
