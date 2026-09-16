import { assessDailyLoadIssues } from './dailyLoadIssues';
import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { TransitionContext } from './context';
import { addDays, type LocalDate } from './logicalDay';
import { projectStateDay } from './projectDay';
import type { AppState } from './state';

/**
 * A read-only look at tomorrow, built the same way Today is: project
 * tomorrow's facts, run the same Daily Load engine over them. Nothing here
 * writes anything — tomorrow's events and tasks are exactly as they already
 * were. "Tomorrow" is today's logical date plus one day in the household's
 * own timezone (`state.user.timezone`), the same authority every other
 * logical-day calculation in Her Keys uses.
 */

export interface TomorrowPreview {
  date: LocalDate;
  fixedCommitmentCount: number;
  dueTaskCount: number;
  tightTransition: { beforeTitle: string; afterTitle: string; bufferMinutes: number } | null;
  /** Factual, never manufactured — a genuinely light tomorrow says so plainly. */
  headline: string;
}

export function tomorrowPreview(state: AppState, ctx: TransitionContext): TomorrowPreview {
  const date = addDays(ctx.today, 1);
  const day = projectStateDay(state, date);
  const assessment = computeDailyLoad(day.events, day.tasks);
  const issues = assessDailyLoadIssues(day.events, day.tasks, assessment);

  const fixedCommitmentCount = day.events.filter((event) => event.commitment === 'fixed').length;
  const dueTaskCount = day.tasks.filter((task) => task.dueToday).length;

  const tightTransition =
    issues.transitionConflict || issues.tightWindow
      ? {
          beforeTitle: (issues.transitionConflict ?? issues.tightWindow)!.beforeTitle,
          afterTitle: (issues.transitionConflict ?? issues.tightWindow)!.afterTitle,
          bufferMinutes: (issues.transitionConflict ?? issues.tightWindow)!.bufferMinutes,
        }
      : null;

  return { date, fixedCommitmentCount, dueTaskCount, tightTransition, headline: describeTomorrow({ fixedCommitmentCount, dueTaskCount, tightTransition, issues }) };
}

function describeTomorrow(input: {
  fixedCommitmentCount: number;
  dueTaskCount: number;
  tightTransition: TomorrowPreview['tightTransition'];
  issues: ReturnType<typeof assessDailyLoadIssues>;
}): string {
  if (input.issues.overlaps.length > 0) {
    const [overlap] = input.issues.overlaps;
    return `${overlap.eventATitle} and ${overlap.eventBTitle} overlap tomorrow.`;
  }
  if (input.tightTransition) {
    return `${input.tightTransition.afterTitle} leaves ${input.tightTransition.bufferMinutes} minutes after ${input.tightTransition.beforeTitle}.`;
  }
  if (input.fixedCommitmentCount === 0 && input.dueTaskCount === 0) {
    return 'Nothing fixed on the calendar yet.';
  }
  if (input.fixedCommitmentCount === 1) {
    return 'Tomorrow already has 1 fixed commitment.';
  }
  if (input.fixedCommitmentCount > 1) {
    return `Tomorrow already has ${input.fixedCommitmentCount} fixed commitments.`;
  }
  return `${input.dueTaskCount} thing${input.dueTaskCount === 1 ? '' : 's'} due tomorrow.`;
}
