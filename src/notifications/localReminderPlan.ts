import type { TransitionContext } from '../domain/context';
import { addDays, logicalDateAt, zonedTimeToEpochMs, type LocalDate } from '../domain/logicalDay';
import type { AppState } from '../domain/state';
import { tomorrowPreview, type TomorrowPreview } from '../domain/tomorrowPreview';

/** One quiet evening check-in, in the household timezone. */
export const EVENING_REMINDER_MINUTES = 19 * 60;

export interface LocalReminderPlan {
  kind: 'tomorrow-brief';
  triggerAtMs: number;
  /** The household day on whose evening this reminder fires. */
  deliveryDay: LocalDate;
  /** The day the copy is describing. */
  targetDate: LocalDate;
  title: 'Tomorrow, at a glance';
  /** Privacy-safe lock-screen copy: counts/risk only, never item titles. */
  body: string;
  url: '/today';
  planKey: string;
}

/**
 * Plans only from canonical local state. No permission, scheduling or device
 * API lives here, which keeps "what is worth a heads-up?" testable.
 *
 * If this evening's 7 PM has already passed, the next candidate is tomorrow
 * evening and describes the following day. We never manufacture an immediate
 * late reminder for something she already missed.
 */
export function buildNextTomorrowReminder(state: AppState, nowMs: number): LocalReminderPlan | null {
  const timeZone = state.user.timezone;
  const today = logicalDateAt(nowMs, timeZone);

  let deliveryDay = today;
  let triggerAtMs = zonedTimeToEpochMs(deliveryDay, EVENING_REMINDER_MINUTES, timeZone);
  if (triggerAtMs <= nowMs) {
    deliveryDay = addDays(deliveryDay, 1);
    triggerAtMs = zonedTimeToEpochMs(deliveryDay, EVENING_REMINDER_MINUTES, timeZone);
  }

  const context: TransitionContext = {
    nowMs,
    today: deliveryDay,
    // Tomorrow Preview is read-only; this is present only because the shared
    // TransitionContext shape carries it.
    createId: (prefix) => `${prefix}-notification-preview`,
  };
  const preview = tomorrowPreview(state, context);
  const body = privacySafeTomorrowBody(preview);
  if (body === null) return null;

  const planKey = [preview.date, preview.overlapCount, preview.tightTransition ? 'tight' : 'clear', preview.fixedCommitmentCount, preview.dueTaskCount].join(':');
  return {
    kind: 'tomorrow-brief',
    triggerAtMs,
    deliveryDay,
    targetDate: preview.date,
    title: 'Tomorrow, at a glance',
    body,
    url: '/today',
    planKey,
  };
}

/**
 * This is deliberately less specific than Tomorrow Preview's in-app headline.
 * The lock screen is not a private Her Keys surface: names, titles, locations
 * and Life Admin details stay inside the app.
 */
export function privacySafeTomorrowBody(preview: TomorrowPreview): string | null {
  if (preview.overlapCount > 0) return 'Tomorrow has a schedule overlap worth a look.';
  if (preview.tightTransition !== null) return 'Tomorrow has a tight transition worth a look.';

  const fixed = preview.fixedCommitmentCount;
  const due = preview.dueTaskCount;
  if (fixed > 0 && due > 0) {
    return `Tomorrow has ${fixed} fixed commitment${fixed === 1 ? '' : 's'} and ${due} thing${due === 1 ? '' : 's'} due.`;
  }
  if (fixed > 0) return `Tomorrow has ${fixed} fixed commitment${fixed === 1 ? '' : 's'}.`;
  if (due > 0) return `Tomorrow has ${due} thing${due === 1 ? '' : 's'} due.`;
  return null;
}
