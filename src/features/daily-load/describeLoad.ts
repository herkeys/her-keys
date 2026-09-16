import type { DailyLoadIssues } from '../../domain/dailyLoadIssues';
import { loadTierOf, type LoadTier } from '../../domain/loadTier';
import type { CalendarEventItem, DailyLoadAssessment, LoadEstimate, LoadLevel, TaskItem } from '../../types';

const SEGMENTS = 4;

/** Above this share of the active day being committed, a day stops reading as "open". */
const BUSY_SHARE = 0.25;

/**
 * A deliberately coarse, presentational summary of the same inputs Daily Load
 * already reasons about. It exists to give the recommendation context at a
 * glance — it is NOT a score of the user, and it is not precise enough to
 * deserve a percentage, which is why it renders as four segments.
 */
export function describeLoad(
  events: CalendarEventItem[],
  tasks: TaskItem[],
  assessment: DailyLoadAssessment,
  issues?: DailyLoadIssues
): LoadEstimate {
  const committedShare = shareOfDayCommitted(events, tasks);
  // The same verdict the Daily Load card shows, when it's available.
  const level = pickLevel(issues ? issues.tier : loadTierOf(assessment), committedShare);
  const copy = copyFor(level);
  const reason = issues?.primary?.kind;
  // "Full" names what makes it full; the transition wording only fits a transition.
  const caption =
    level === 'full' && reason === 'overlap'
      ? 'Two commitments overlap.'
      : level === 'full' && reason === 'capacity_pressure'
        ? 'More work than time today.'
        : copy.caption;

  return { level, label: copy.label, caption, filled: filledFor(level), total: SEGMENTS };
}

/** The load tier owns the thresholds; the meter only adds how busy an open day looks. */
function pickLevel(tier: LoadTier, committedShare: number): LoadLevel {
  if (tier === 'overloaded') return 'full';
  if (tier === 'tight') return 'tight';
  if (committedShare >= BUSY_SHARE) return 'steady';
  return 'open';
}

function filledFor(level: LoadLevel): number {
  if (level === 'full') return 4;
  if (level === 'tight') return 3;
  if (level === 'steady') return 2;
  return 1;
}

function copyFor(level: LoadLevel): { label: string; caption: string } {
  switch (level) {
    case 'full':
      return { label: 'Full', caption: 'Several transitions are short on room.' };
    case 'tight':
      return { label: 'Tight', caption: 'One window is short on room. The rest of the day has space.' };
    case 'steady':
      return { label: 'Steady', caption: 'Every transition has room.' };
    default:
      return { label: 'Open', caption: 'Plenty of room between today’s commitments.' };
  }
}

function shareOfDayCommitted(events: CalendarEventItem[], tasks: TaskItem[]): number {
  if (events.length === 0) return 0;

  const starts = events.map((e) => e.startMinutes);
  const ends = events.map((e) => e.endMinutes);
  const windowMinutes = Math.max(...ends) - Math.min(...starts);
  if (windowMinutes <= 0) return 0;

  const eventMinutes = events.reduce((sum, e) => sum + (e.endMinutes - e.startMinutes), 0);
  const taskMinutes = tasks
    .filter((t) => t.scheduledStartMinutes != null)
    .reduce((sum, t) => sum + t.durationMinutes, 0);

  return (eventMinutes + taskMinutes) / windowMinutes;
}
