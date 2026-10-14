import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../monetization/entitlement';
import type { LocalDate } from '../../../domain/logicalDay';
import type { ConfidenceTier, FrictionPattern, InsufficientReason, Period, PeriodCounts } from '../../../domain/premium/momentum/model';
import type { SavedReport } from '../../../domain/premium/momentum/snapshot';
import { weekdayName } from '../../today/formatDay';
import type { ReviewOutcome } from './momentumFlow';

/**
 * Every word the weekly review says, kept out of the component so the words are tested as a table.
 *
 * Rules (pinned by tests/premiumDomain/momentumCopy.test.mjs):
 *  - only counts of recorded things: no hours "recovered", no conflicts "prevented", no score, no streak, no percentage, no praise;
 *  - a change is stated as a difference in a count, neutrally, and only when the week before had enough history;
 *  - a pattern states how many times and on how many different days it was seen, and what tier that earns, in plain words;
 *  - what the review is based on is always said, and so is what it could not see;
 *  - "saved" appears only for a copy that is really saved.
 */
const PREMIUM = HER_KEYS_PREMIUM_DISPLAY_NAME;

export const COPY = {
  featureName: 'Weekly review',
  entry: {
    title: 'Look back at your week',
    body: `${PREMIUM} counts what was actually recorded over the last seven days — what you finished, what you kept moving, what you approved — and shows you what each number is based on. It doesn’t rate you, and it doesn’t guess.`,
    open: 'Open your weekly review',
    opening: 'Reading your week…',
    earlier: 'Earlier reviews',
    earlierBody: 'These are saved copies of reviews you’ve already had.',
    openSaved: 'Open',
  },
  sheet: {
    title: 'Weekly review',
    thisWeekTitle: 'What was recorded',
    changesTitle: 'Compared with the week before',
    patternsTitle: 'What keeps coming up',
    nextStepTitle: 'One thing you could look at',
    basedOnTitle: 'What this is based on',
    close: 'Close',
    savedCopyTitle: 'Saved copy',
  },
  noPatterns: 'Nothing has come up often enough to call a pattern yet.',
  noNextStep: 'Nothing stands out enough to point you at one thing, so Her Keys isn’t suggesting anything.',
  removedItem: 'An item you’ve since removed',
  insufficient: { title: 'Not enough recorded yet' },
  nextStep: {
    approve: 'I’ll look at it',
    approving: 'Noting that…',
    scope: 'Choosing this only records that you decided to look. Nothing is moved, changed or finished for you.',
    approved: 'You chose to look at this.',
  },
  unavailable: {
    receipts: 'Her Keys couldn’t check which changes you’ve approved lately, so it didn’t build a review rather than risk getting it wrong. Try again in a moment.',
    server: 'Her Keys couldn’t reach its server just now. Try again in a moment.',
    nextStep: 'That didn’t go through. Try again in a moment.',
  },
} as const;

const quoted = (title: string) => `“${title}”`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (date: LocalDate) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

/** The ACTUAL period the numbers cover, so a review can never be mistaken for a calendar week it is not. */
export function periodLabel(period: Pick<Period, 'start' | 'end'>): string {
  return `${shortDay(period.start)} to ${shortDay(period.end)}`;
}

export function insufficientBody(reason: InsufficientReason, have: { events: number; activeDays: number }, needs: { events: number; activeDays: number }): string {
  if (reason === 'nothing_recorded') return 'Nothing has been recorded in these seven days, so there is nothing to review. Her Keys won’t make something up.';
  return `So far there ${have.events === 1 ? 'is' : 'are'} ${plural(have.events, 'thing', 'things')} recorded across ${plural(have.activeDays, 'day', 'days')}. A review needs at least ${needs.events} things across at least ${plural(needs.activeDays, 'different day', 'different days')}, so it can say something true.`;
}

/** Only what was recorded, only non-zero. Never a rating. */
export function countLines(c: PeriodCounts): string[] {
  const lines: string[] = [];
  if (c.tasksCompleted > 0) lines.push(`You finished ${plural(c.tasksCompleted, 'task', 'tasks')}.`);
  if (c.itemsCompleted > 0) lines.push(`${plural(c.itemsCompleted, 'item', 'items')} you’d been holding on to ${c.itemsCompleted === 1 ? 'was' : 'were'} marked done.`);
  if (c.oneMovesCompleted > 0) lines.push(`You completed ${plural(c.oneMovesCompleted, 'One Move', 'One Moves')}.`);
  const routine = [c.routinesDone > 0 ? `${c.routinesDone} done` : null, c.routinesSkipped > 0 ? `${c.routinesSkipped} skipped` : null, c.routinesMissed > 0 ? `${c.routinesMissed} missed` : null].filter((x): x is string => x !== null);
  if (routine.length > 0) lines.push(`Routines: ${routine.join(', ')}.`);
  if (c.postponements > 0) {
    lines.push(
      c.postponements === c.postponedTasks
        ? `You moved ${plural(c.postponedTasks, 'task', 'tasks')} to a later day.`
        : `You moved ${plural(c.postponedTasks, 'task', 'tasks')} to a later day, ${plural(c.postponements, 'time', 'times')} in all.`,
    );
  }
  if (c.finishedAfterPostponing > 0) lines.push(`${plural(c.finishedAfterPostponing, 'task', 'tasks')} you finished had been moved at least once before.`);
  if (c.suggestionsApplied > 0) lines.push(`You approved ${plural(c.suggestionsApplied, 'change', 'changes')} suggested by ${PREMIUM}, and ${c.suggestionsApplied === 1 ? 'it is' : 'they are'} still in place.`);
  if (c.suggestionsReverted > 0) lines.push(`You undid ${plural(c.suggestionsReverted, 'suggested change', 'suggested changes')}.`);
  if (c.suggestionsDeclined > 0) lines.push(`You said no to ${plural(c.suggestionsDeclined, 'suggestion', 'suggestions')}.`);
  if (c.delegationsAccepted > 0 || c.delegationsCompleted > 0) {
    const parts = [c.delegationsAccepted > 0 ? `${c.delegationsAccepted} accepted` : null, c.delegationsCompleted > 0 ? `${c.delegationsCompleted} completed` : null].filter((x): x is string => x !== null);
    lines.push(`Things you handed to someone: ${parts.join(', ')}.`);
  }
  return lines;
}

const COMPARED: Array<[keyof PeriodCounts, string, string]> = [
  ['tasksCompleted', 'task finished', 'tasks finished'],
  ['postponedTasks', 'task moved to a later day', 'tasks moved to a later day'],
  ['suggestionsApplied', 'suggested change approved', 'suggested changes approved'],
  ['delegationsAccepted', 'handoff accepted', 'handoffs accepted'],
];

/** A difference in a count, neutrally. No direction is called good or bad. */
export function comparisonLines(deltas: Partial<Record<keyof PeriodCounts, number>>): string[] {
  const lines: string[] = [];
  for (const [key, one, many] of COMPARED) {
    const delta = deltas[key];
    if (delta === undefined) continue;
    const n = Math.abs(delta);
    lines.push(delta === 0 ? `The same number of ${many} as the week before.` : `${n} ${delta > 0 ? 'more' : 'fewer'} ${n === 1 ? one : many} than the week before.`);
  }
  return lines;
}
export const comparisonUnavailableLine = 'There’s no comparison with the week before: not enough was recorded then to compare fairly.';

export const tierLabel: Record<ConfidenceTier, string> = { possible: 'Possible', likely: 'Likely', established: 'Confirmed by you' };

export function tierExplanation(pattern: Pick<FrictionPattern, 'tier' | 'sightings'>): string {
  switch (pattern.tier) {
    case 'possible':
      return `Seen ${pattern.sightings} times. That’s not yet enough to call it a pattern.`;
    case 'likely':
      return `Seen ${pattern.sightings} times on different days.`;
    case 'established':
      return 'You confirmed this one yourself.';
  }
}

export function patternLine(pattern: Pick<FrictionPattern, 'kind' | 'about' | 'weekday' | 'sightings'>, titleOf: (ref: { kind: string; id: string }) => string | null): string {
  if (pattern.kind === 'repeated_postponement') {
    const title = pattern.about ? titleOf(pattern.about) : null;
    const subject = title === null ? COPY.removedItem : quoted(title);
    return `${subject} has been moved to a later day ${plural(pattern.sightings, 'time', 'times')}, on different days.`;
  }
  const day = pattern.weekday === null ? 'one weekday' : `${weekdayName(weekdayDate(pattern.weekday))}s`;
  return `Things planned for ${day} keep getting moved: ${plural(pattern.sightings, 'different date', 'different dates')} in the last four weeks.`;
}

// 2026-09-13 is a Sunday; adding the weekday index gives a date with that weekday. Only the NAME is used.
const weekdayDate = (weekday: number): LocalDate => `2026-09-${String(13 + weekday).padStart(2, '0')}`;

export function basedOnLine(evidence: { observationIds: readonly string[]; decisionIds: readonly string[]; truncated: boolean }): string {
  const n = evidence.observationIds.length + evidence.decisionIds.length;
  return `Based on ${plural(n, 'recorded thing', 'recorded things')} from these seven days${evidence.truncated ? ' (the full list is longer than this shows)' : ''}. Her Keys can’t see anything you didn’t record in it, including events that live only in an outside calendar.`;
}

export function nextStepHeadline(title: string | null): string {
  return `Look at ${title === null ? 'an item you’ve since removed' : quoted(title)}`;
}
export const nextStepBody = 'It’s the item you’ve moved to a later day most often, and the evidence for that is “likely” or stronger.';

export function savedLine(saved: 'recorded' | 'already_saved' | 'pending'): string {
  switch (saved) {
    case 'recorded':
      return 'A copy of this review is saved.';
    case 'already_saved':
      return 'A copy of this review from earlier today is saved.';
    case 'pending':
      return 'A copy hasn’t been saved yet. This review is still correct; Her Keys will try again the next time you open it.';
  }
}

export function unavailableLine(outcome: Extract<ReviewOutcome, { kind: 'unavailable' }>): string {
  return COPY.unavailable[outcome.reason];
}

export function savedReviewLine(report: Pick<SavedReport, 'period' | 'counts'>): string {
  const finished = report.counts.tasksCompleted;
  return `${periodLabel(report.period)} · ${plural(finished, 'task', 'tasks')} finished`;
}
