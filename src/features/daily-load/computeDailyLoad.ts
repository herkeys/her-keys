import type { CalendarEventItem, DailyLoadAssessment, DailyLoadRecommendation, DailyLoadStatus, TaskItem } from '../../types';

/**
 * Minimum gap required between two fixed commitments for the transition
 * between them (travel, settling in, etc.) to feel unrushed. This is a
 * deliberately simple, explainable placeholder for a rule the real Daily
 * Load Agent would tune per household over time.
 */
const REQUIRED_TRANSITION_BUFFER_MINUTES = 45;

interface EvaluatedGap {
  before: CalendarEventItem;
  after: CalendarEventItem;
  windowStart: number;
  windowEnd: number;
  rawWindowMinutes: number;
  tasksInWindow: TaskItem[];
  bufferMinutes: number;
}

function evaluateGap(before: CalendarEventItem, after: CalendarEventItem, tasks: TaskItem[]): EvaluatedGap {
  const windowStart = before.endMinutes;
  const windowEnd = after.startMinutes;
  const rawWindowMinutes = windowEnd - windowStart;

  const tasksInWindow = tasks.filter(
    (t) =>
      t.commitment === 'flexible' &&
      t.scheduledStartMinutes != null &&
      t.scheduledStartMinutes >= windowStart &&
      t.scheduledStartMinutes < windowEnd
  );

  const scheduledMinutes = tasksInWindow.reduce((sum, t) => sum + t.durationMinutes, 0);

  return { before, after, windowStart, windowEnd, rawWindowMinutes, tasksInWindow, bufferMinutes: rawWindowMinutes - scheduledMinutes };
}

/**
 * Deterministic Daily Load logic:
 * 1. For every consecutive pair of fixed calendar events today, compute the
 *    EFFECTIVE buffer between them — the raw gap minus whatever flexible
 *    tasks are already scheduled into it. A gap with a lot of raw time can
 *    still be the tightest one once what's actually planned there is
 *    accounted for, so every gap is evaluated this way rather than only the
 *    gap that looks smallest on the calendar alone.
 * 2. The gap with the smallest effective buffer is today's tightest window.
 * 3. If that buffer is under the required threshold, the day is "overloaded".
 * 4. Rank the flexible, not-due-today tasks in that gap by duration (largest
 *    first) as candidate recommendations — moving the biggest one recovers
 *    the most buffer with the fewest changes.
 */
export function computeDailyLoad(events: CalendarEventItem[], tasks: TaskItem[]): DailyLoadAssessment {
  const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes);

  let tightest: EvaluatedGap | null = null;

  for (let i = 0; i < sorted.length - 1; i++) {
    const before = sorted[i];
    const after = sorted[i + 1];
    if (after.startMinutes < before.endMinutes) continue;

    const evaluated = evaluateGap(before, after, tasks);
    if (!tightest || evaluated.bufferMinutes < tightest.bufferMinutes) {
      tightest = evaluated;
    }
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

  const { before: beforeEvent, after: afterEvent, windowStart, windowEnd, rawWindowMinutes, tasksInWindow, bufferMinutes } = tightest;
  const status: DailyLoadStatus = bufferMinutes < REQUIRED_TRANSITION_BUFFER_MINUTES ? 'overloaded' : 'balanced';

  const shortfall = REQUIRED_TRANSITION_BUFFER_MINUTES - bufferMinutes;

  const candidates: DailyLoadRecommendation[] = [...tasksInWindow]
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .map((task) => ({
      task,
      observation: `Scheduled in your only gap before ${afterEvent.title}, ${formatTime(windowStart)}–${formatTime(
        windowEnd
      )}.`,
      reason: `${bufferMinutes} minutes is ${shortfall} short of the ${REQUIRED_TRANSITION_BUFFER_MINUTES} you usually need to get there unrushed.`,
      currentBufferMinutes: bufferMinutes,
      projectedBufferMinutes: bufferMinutes + task.durationMinutes,
      windowAfterTitle: afterEvent.title,
    }));

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
    candidates,
  };
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}
