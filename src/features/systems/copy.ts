import type { ResponsibilityState } from '../../domain/foundation/responsibility';
import type { LocalDate } from '../../domain/logicalDay';
import { parseLocalDate, weekdayOf } from '../../domain/logicalDay';
import type { DraftIssue } from './commands/draft';
import type { SaveOutcome } from './commands/saveDraft';
import { formatClock, formatDay, listWeekdays, minutesText, monthDayName, ordinal, relativeDay } from './format';
import type { ActionEvidenceView, DurationView, HolderView, HubUnavailableReason, NoNextReason, ResponsibilityView, ScheduleView } from './model/types';

/**
 * Every operational sentence Systems shows, in one place.
 *
 * Voice: practical, calm, adult, and about STATE. It describes what is true; it does not judge what
 * she did or did not do. There is no coaching, no score, no streak, no cheer, and no sentence that
 * claims a reminder was sent, a step was done, or Her Keys did something it has no record of doing.
 * A test scans this module's output for that language (`tests/systems/audits.test.mjs`).
 *
 * Wording is deliberately kept out of the model (which carries facts and machine codes) and out of
 * JSX (which arranges).
 */

// ------------------------------------------------------------------ schedule ---

type ScheduleWords = Pick<ScheduleView, 'trigger' | 'frequency' | 'interval' | 'byWeekday' | 'byMonthDay' | 'anchorDate' | 'timeOfDayMinutes'> &
  Partial<Pick<ScheduleView, 'endsOn' | 'occurrenceCount'>>;

/** "Every week on Sunday at 7:30 AM" — what the rule MEANS, from the rule alone. Null when there is no calendar rule to describe. */
export function scheduleSentence(schedule: ScheduleWords): string | null {
  if (schedule.trigger === 'after_completion') return 'Repeats after it’s done';
  if (schedule.trigger === 'manual') return 'No set schedule';
  if (schedule.frequency === null || schedule.interval === null) return null;

  const n = schedule.interval;
  const every = (one: string, many: string) => (n === 1 ? `Every ${one}` : `Every ${n} ${many}`);
  let text: string;
  switch (schedule.frequency) {
    case 'daily':
      text = every('day', 'days');
      break;
    case 'weekly': {
      const days = schedule.byWeekday ?? (schedule.anchorDate === null ? [] : [weekdayOf(schedule.anchorDate)]);
      text = days.length > 0 ? `${every('week', 'weeks')} on ${listWeekdays(days)}` : every('week', 'weeks');
      break;
    }
    case 'monthly': {
      const day = schedule.byMonthDay ?? (schedule.anchorDate === null ? null : parseLocalDate(schedule.anchorDate).day);
      text = day === null ? every('month', 'months') : `${every('month', 'months')} on the ${ordinal(day)}`;
      break;
    }
    case 'yearly':
      text = schedule.anchorDate === null ? every('year', 'years') : `${every('year', 'years')} on ${monthDayName(schedule.anchorDate)}`;
      break;
  }
  const at = schedule.timeOfDayMinutes === null ? text : `${text} at ${formatClock(schedule.timeOfDayMinutes)}`;
  // An end condition the rule already carries is stated neutrally; Systems never authors one.
  if (schedule.endsOn != null) return `${at}, until ${formatDay(schedule.endsOn)}`;
  if (schedule.occurrenceCount != null) return `${at}, ${schedule.occurrenceCount} ${schedule.occurrenceCount === 1 ? 'time' : 'times'}`;
  return at;
}

/** The one short line on a hub card. Describes the schedule's state; never scolds. */
export function scheduleTag(schedule: ScheduleWords & Pick<ScheduleView, 'state' | 'nextExpected'>, today: LocalDate): string {
  switch (schedule.state) {
    case 'none':
      return 'No schedule';
    case 'ended':
      return 'Stopped repeating';
    case 'paused':
      return 'Schedule paused';
    case 'active':
      if (schedule.nextExpected !== null) return `Next: ${relativeDay(schedule.nextExpected, today)}`;
      return schedule.trigger === 'schedule' ? 'Repeats · no upcoming date' : (scheduleSentence(schedule) ?? 'Repeats');
  }
}

const NO_NEXT: Record<NoNextReason, string> = {
  no_schedule: 'This System has no schedule. It’s here when you need it.',
  paused: 'This schedule is paused, so no date is expected until you resume it.',
  stopped: 'This System stopped repeating. Its steps are still here.',
  not_calendar_based: 'It repeats after it’s done, so there’s no calendar date to show.',
  nothing_upcoming: 'There’s no upcoming date on this schedule.',
};

export const noNextText = (reason: NoNextReason): string => NO_NEXT[reason];

export const skippedLine = (dates: readonly LocalDate[]): string | null =>
  dates.length === 0 ? null : `Skipped: ${dates.map(formatDay).join(', ')}`;

// ------------------------------------------------------------------ duration ---

export function durationLine(duration: DurationView): string | null {
  switch (duration.kind) {
    case 'total':
      return `About ${minutesText(duration.minutes)}`;
    case 'stated':
      return `About ${minutesText(duration.minutes)}`;
    case 'partial':
      return `At least ${minutesText(duration.atLeastMinutes)} · ${duration.estimatedSteps} of ${duration.totalSteps} steps have an estimate`;
    case 'unknown':
      return null;
  }
}

export const durationDetailLine = (duration: DurationView): string => durationLine(duration) ?? 'No time estimate yet';

export const stepCountLine = (n: number): string => (n === 0 ? 'No steps yet' : n === 1 ? '1 step' : `${n} steps`);

// ------------------------------------------------------------ responsibility ---

const holderName = (holder: HolderView): string => holder.name ?? 'Someone Her Keys can’t find in your household';

/** What is true about the handoff — asked, seen, agreed — and no more. */
export function responsibilityLine(view: ResponsibilityView): string {
  const who = holderName(view.holder);
  const state: ResponsibilityState = view.state;
  switch (state) {
    case 'owned':
      return 'This one is yours.';
    case 'requested':
      return view.unanswered ? `Asked of ${who}. No answer yet.` : `Asked of ${who}. They haven’t answered yet.`;
    case 'acknowledged':
      return `${who} has seen this. They haven’t said yes yet.`;
    case 'accepted':
      return `${who} said yes.`;
    case 'declined':
      return `${who} said no. This is yours again.`;
    case 'completed':
      return `Marked complete by ${who}.`;
    case 'returned':
      return 'This came back to you.';
  }
}

export const attentionLine = (holder: HolderView): string => `${holderName(holder)} hasn’t answered yet`;

// ----------------------------------------------------------------- evidence ---

export const ACTION_CATEGORY_LABEL: Record<string, string> = {
  internal_reminder: 'a reminder',
  task_change: 'a change to a task',
  schedule_change: 'a change to a schedule',
  delegation_request: 'a request to someone',
  outbound_message: 'a message',
  external_calendar_write: 'a calendar change',
  external_appointment: 'an appointment',
  financial_action: 'a payment or transfer',
};

export const evidenceSummary = (evidence: ActionEvidenceView): string =>
  `Her Keys suggested ${ACTION_CATEGORY_LABEL[evidence.category] ?? 'an action'} about this System.`;

// -------------------------------------------------------------------- shell ---

export const copy = {
  hub: {
    title: 'Systems',
    subtitle: 'The reusable ways your household gets things done, so you don’t have to work them out again each time.',
    loading: 'Loading your Systems…',
    create: 'Add a System',
    cardHint: 'Opens this System',
    emptyTitle: 'No Systems yet',
    emptyBody:
      'A System is a way your household gets something done: the steps, in order, so you don’t have to work it out again. Add one whenever you’re ready.',
    unavailableTitle: 'Systems aren’t available right now',
    startedOverTitle: 'Her Keys started over on this device',
    startedOverBody: 'What was saved here couldn’t be used, so it was set aside. Anything you add now is saved as usual.',
  },
  detail: {
    missingTitle: 'This System isn’t here',
    missingBody: 'It may have been changed since you last opened the list.',
    back: 'Back to Systems',
    edit: 'Edit',
    stepsTitle: 'Steps',
    stepsIntro: 'The steps, in order.',
    stepsEmpty: 'No steps yet. Add them when you know how this goes.',
    scheduleTitle: 'Schedule',
    responsibilityTitle: 'Who’s responsible',
    noResponsibility: 'Nobody has been asked to take this.',
    detailsTitle: 'Details',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    area: 'Area',
    source: 'Where this came from',
    needs: 'Needs',
    neededBy: 'Needed by',
    childNotRecorded: 'This System is marked as being for a child, but Her Keys doesn’t have which child recorded.',
    timeTitle: 'Time',
    pause: 'Pause schedule',
    resume: 'Resume schedule',
    stop: 'Stop repeating',
    skip: (date: string) => `Skip ${date}`,
    assign: 'Ask someone to take this',
    reassign: 'Change who',
    takeBack: 'Take it back',
    seen: 'They’ve seen it',
    saidYes: 'They said yes',
    saidNo: 'They said no',
    chooseHolder: 'Who should take this?',
    holderSheet: 'Choose who to ask',
    answerSheet: 'What did they say?',
    close: 'Close',
    skipTitle: (date: string) => `Skip ${date}?`,
    skipBody:
      'This one is left out of the schedule, and the schedule carries on after it. Skipping is recorded and can’t be undone.',
    skipCancel: 'Keep it',
    skipConfirm: 'Skip it',
    stopTitle: 'Stop repeating?',
    stopBody: 'This System won’t have a schedule anymore. Its steps stay, and you can set a new schedule any time.',
    stopCancel: 'Keep the schedule',
    stopConfirm: 'Stop repeating',
    actionFailed: 'Her Keys couldn’t save that yet. Try again.',
    actionUnchanged: 'That couldn’t be changed. It may already have been updated.',
    proposalWaiting: 'Waiting for your answer.',
    nextExpected: (date: string) => `Next expected: ${date}`,
    setSchedule: 'Set a schedule',
    missingRef: 'Something that’s no longer here',
    holderHint: (kind: 'child' | 'person') => (kind === 'child' ? 'One of your children' : 'Someone you added'),
  },
  editor: {
    newTitle: 'New System',
    editTitle: 'Edit System',
    name: 'Name',
    namePlaceholder: 'School-night reset',
    purpose: 'What it’s for (optional)',
    purposePlaceholder: 'Bags, bottles and uniforms ready before bed',
    area: 'Area',
    stepsTitle: 'Steps',
    stepsHelp: 'In the order they usually happen.',
    step: (n: number) => `Step ${n}`,
    minutes: (n: number) => `Minutes for step ${n} (optional)`,
    moveUp: (n: number) => `Move step ${n} up`,
    moveDown: (n: number) => `Move step ${n} down`,
    removeNew: (n: number) => `Remove step ${n}`,
    up: 'Up',
    down: 'Down',
    remove: 'Remove',
    addStep: 'Add a step',
    stepLimit: 'This System has as many steps as Her Keys can hold.',
    scheduleTitle: 'Schedule',
    noSchedule: 'No schedule',
    repeats: 'Repeats',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    every: 'Repeat every (number)',
    on: 'On',
    monthDay: 'Day of the month',
    time: 'Time (optional, like 7:30 AM)',
    timePlaceholder: '7:30 AM',
    frequencyGroup: 'How often',
    weekdayGroup: 'Days of the week',
    previewTitle: 'The next three expected dates',
    previewNote: 'A preview only. Nothing is scheduled, and no reminder is sent.',
    previewNone: 'No upcoming dates with these settings.',
    pausedNote: 'This schedule is paused. You can resume it from the System screen.',
    keepTitle: 'This System repeats after it’s done.',
    keepBody: 'That kind of schedule can’t be changed here.',
    useCalendar: 'Use a calendar schedule instead',
    stopRepeating: 'Stop repeating',
    save: 'Save System',
    saveChanges: 'Save changes',
    saving: 'Saving…',
    staleTitle: 'This System changed while you were editing',
    staleBody: 'Saving now could overwrite that. Load the latest version to keep going.',
    loadLatest: 'Load latest',
    notSaved: 'Her Keys couldn’t save that yet. Try again.',
    unavailable: 'This session isn’t saving changes, so Systems can’t be added or edited right now.',
    missing: 'This System isn’t here anymore.',
  },
} as const;

export const UNAVAILABLE_BODY: Record<HubUnavailableReason, string> = {
  newer_version: 'This device has information saved by a newer version of Her Keys, so this session isn’t showing or saving your Systems. Update Her Keys to see them.',
  unreadable: 'Her Keys couldn’t read what’s saved on this device, so it isn’t showing your Systems right now.',
  memory_only: 'This session isn’t saving changes, so your Systems aren’t shown here.',
};

// ------------------------------------------------------------------- issues ---

/** A draft problem in words she can act on. Names the thing, never blames. */
export function issueMessage(issue: DraftIssue, stepNumber?: (key: string) => number | null): string {
  const stepLabel = () => {
    const key = issue.field.startsWith('step:') ? issue.field.slice(5) : null;
    const n = key === null ? null : stepNumber?.(key) ?? null;
    return n === null ? 'A step' : `Step ${n}`;
  };
  switch (issue.code) {
    case 'name_blank':
      return 'Give this System a name.';
    case 'name_too_long':
      return 'That name is too long. Keep it to 120 characters.';
    case 'purpose_too_long':
      return 'That’s too long for what it’s for. Keep it to 500 characters.';
    case 'area_missing':
      return 'Choose an area.';
    case 'area_unavailable':
      return 'That area isn’t available. Choose another.';
    case 'too_many_steps':
      return 'That’s more steps than Her Keys can hold.';
    case 'step_title_blank':
      return `${stepLabel()} needs some words.`;
    case 'step_title_too_long':
      return `${stepLabel()} is too long. Keep it to 200 characters.`;
    case 'step_minutes_invalid':
      return `${stepLabel()}: minutes should be a whole number from 0 to 1440, or left blank.`;
    case 'system_limit_reached':
      return 'Her Keys can’t hold more Systems than this.';
    case 'interval_invalid':
      return 'Repeat every should be a whole number from 1 to 366.';
    case 'weekday_invalid':
      return 'Choose at least one day of the week.';
    case 'month_day_invalid':
      return 'The day of the month should be from 1 to 31.';
    case 'time_invalid':
      return 'That doesn’t look like a time. Try something like 7:30 AM.';
    case 'schedule_missing':
      return 'Choose how it repeats.';
    case 'schedule_ends_before_start':
      return 'This schedule was set to end before the new one would begin. Stop repeating, then set a new schedule.';
    case 'identifier_invalid':
      return 'Something about this System couldn’t be saved. Close it and try again.';
    case 'step_removal_unsupported':
      return 'Existing steps can be changed but not removed.';
  }
}

export function saveFailureMessage(outcome: SaveOutcome | { kind: 'not_saved' }): string | null {
  switch (outcome.kind) {
    case 'not_saved':
      return copy.editor.notSaved;
    case 'missing':
      return copy.editor.missing;
    default:
      return null;
  }
}

