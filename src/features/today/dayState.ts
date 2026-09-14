import type { DailyLoadAssessment, DailyLoadDecision } from '../../types';

/**
 * The one sentence under the greeting: the overall state of the day, before
 * any detail. It changes as the user acts so the top of Today always reflects
 * where things actually stand.
 */
export function describeDayState(assessment: DailyLoadAssessment, decision: DailyLoadDecision): string {
  if (decision === 'moved') {
    // One move isn't always enough, so only claim room the recalculated day actually has.
    return assessment.status === 'balanced' ? 'One change made. Today has room now.' : 'One change made. Today is still tight.';
  }
  if (decision === 'kept') return 'Today stays as you planned it.';
  if (assessment.status === 'balanced') return 'Her Keys looked across today. Nothing needs moving.';
  return 'Your day works — but one window is too tight.';
}
