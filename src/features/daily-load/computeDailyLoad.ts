import type { CalendarEventItem, DailyLoadAssessment, DailyLoadRecommendation, DailyLoadStatus, TaskItem } from '../../types';

/**
 * Minimum gap required between two fixed commitments for the transition
 * between them (travel, settling in, etc.) to feel unrushed. This is a
 * deliberately simple, explainable placeholder for a rule the real Daily
 * Load Agent would tune per household over time.
 */
export const REQUIRED_TRANSITION_BUFFER_MINUTES = 45;

export interface TransitionGap {
  before: CalendarEventItem;
  after: CalendarEventItem;
  windowStart: number;
  windowEnd: number;
  rawWindowMinutes: number;
  tasksInWindow: TaskItem[];
  /** The raw window minus whatever tasks are already scheduled into it. */
  bufferMinutes: number;
}

function evaluateGap(before: CalendarEventItem, after: CalendarEventItem, tasks: TaskItem[]): TransitionGap {
  const windowStart = before.endMinutes;
  const windowEnd = after.startMinutes;
  const rawWindowMinutes = windowEnd - windowStart;

  // Anything scheduled into the window uses up its time, fixed or flexible,
  // due today or not. Which of those could be moved is a separate question.
  const tasksInWindow = tasks.filter(
    (t) => t.scheduledStartMinutes != null && t.scheduledStartMinutes >= windowStart && t.scheduledStartMinutes < windowEnd
  );

  const scheduledMinutes = tasksInWindow.reduce((sum, t) => sum + t.durationMinutes, 0);

  return { before, after, windowStart, windowEnd, rawWindowMinutes, tasksInWindow, bufferMinutes: rawWindowMinutes - scheduledMinutes };
}

/** Only something safe to move that actually frees time can be recommended. */
export function isMovable(task: TaskItem): boolean {
  return task.commitment === 'flexible' && !task.dueToday && task.durationMinutes > 0;
}

/**
 * Start order, with a fixed tie-break (earlier end, then id) so the same day
 * always reads the same way, whatever order its events were entered in.
 */
function inDayOrder(events: CalendarEventItem[]): CalendarEventItem[] {
  return [...events].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.id.localeCompare(b.id));
}

/**
 * Every transition of the day, in order. A gap only opens once every earlier
 * commitment has ended, so an event nested inside a longer one never creates
 * time that isn't really free.
 */
export function listTransitionGaps(events: CalendarEventItem[], tasks: TaskItem[]): TransitionGap[] {
  const sorted = inDayOrder(events);
  const gaps: TransitionGap[] = [];
  // The commitment that runs latest so far; the next gap starts when it ends.
  let latest = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.startMinutes >= latest.endMinutes) gaps.push(evaluateGap(latest, next, tasks));
    if (next.endMinutes > latest.endMinutes) latest = next;
  }
  return gaps;
}

/**
 * The movable tasks scheduled in a window, largest first — moving the biggest
 * one recovers the most buffer with the fewest changes.
 */
export function rankMoveCandidates(
  gap: TransitionGap,
  bufferMinutes: number,
  reason: string
): DailyLoadRecommendation[] {
  return gap.tasksInWindow
    .filter(isMovable)
    .sort((a, b) => b.durationMinutes - a.durationMinutes || a.id.localeCompare(b.id))
    .map((task) => {
      const projectedBufferMinutes = bufferMinutes + task.durationMinutes;
      return {
        task,
        observation: `Scheduled in your only gap before ${gap.after.title}, ${formatTime(gap.windowStart)}–${formatTime(gap.windowEnd)}.`,
        reason,
        currentBufferMinutes: bufferMinutes,
        projectedBufferMinutes,
        resolvesShortfall: projectedBufferMinutes >= REQUIRED_TRANSITION_BUFFER_MINUTES,
        windowAfterTitle: gap.after.title,
      };
    });
}

export function shortfallReason(bufferMinutes: number): string {
  const shortfall = REQUIRED_TRANSITION_BUFFER_MINUTES - bufferMinutes;
  return `${bufferMinutes} minutes is ${shortfall} short of the ${REQUIRED_TRANSITION_BUFFER_MINUTES} Her Keys allows by default to get there unrushed.`;
}

/**
 * Deterministic Daily Load logic:
 * 1. Walk today's calendar events in start order and compute the EFFECTIVE
 *    buffer in each gap — the raw gap minus whatever tasks are already
 *    scheduled into it. A gap with a lot of raw time can still be the tightest
 *    one once what's actually planned there is accounted for, so every gap is
 *    evaluated this way rather than only the gap that looks smallest on the
 *    calendar alone.
 * 2. The gap with the smallest effective buffer is today's tightest window
 *    (the earliest one, when two are equally tight).
 * 3. If that buffer is under the required threshold, the day is "overloaded".
 * 4. Rank the flexible, not-due-today tasks in that gap by duration (largest
 *    first) as candidate recommendations.
 */
export function computeDailyLoad(events: CalendarEventItem[], tasks: TaskItem[]): DailyLoadAssessment {
  let tightest: TransitionGap | null = null;
  for (const gap of listTransitionGaps(events, tasks)) {
    if (!tightest || gap.bufferMinutes < tightest.bufferMinutes) tightest = gap;
  }

  if (!tightest) {
    return {
      status: 'balanced',
      bufferMinutes: 0,
      requiredBufferMinutes: REQUIRED_TRANSITION_BUFFER_MINUTES,
      gap: null,
      candidates: [],
    };
  }

  const { before: beforeEvent, after: afterEvent, windowStart, windowEnd, rawWindowMinutes, bufferMinutes } = tightest;
  const status: DailyLoadStatus = bufferMinutes < REQUIRED_TRANSITION_BUFFER_MINUTES ? 'overloaded' : 'balanced';

  return {
    status,
    bufferMinutes,
    requiredBufferMinutes: REQUIRED_TRANSITION_BUFFER_MINUTES,
    gap: {
      beforeEventId: beforeEvent.id,
      beforeTitle: beforeEvent.title,
      afterEventId: afterEvent.id,
      afterTitle: afterEvent.title,
      windowStartMinutes: windowStart,
      windowEndMinutes: windowEnd,
      rawWindowMinutes,
    },
    candidates: rankMoveCandidates(tightest, bufferMinutes, shortfallReason(bufferMinutes)),
  };
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}
