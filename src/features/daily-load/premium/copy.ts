import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../monetization/entitlement';
import type { LoadTier } from '../../../domain/loadThresholds';
import type { LocalDate } from '../../../domain/logicalDay';
import type {
  AssumptionCode,
  ConsideredRecord,
  EvidenceGapCode,
  IneligibleReason,
  Pressure,
  RescheduleProposal,
} from '../../../domain/premium/dailyLoadReview';
import type { ApproveOutcome, UndoFlowOutcome } from './dailyLoadFlow';
import { fullDayLabel, weekdayName } from '../../today/formatDay';

/**
 * Every word the Premium Daily Load panel says. Kept out of the component on purpose: the words are the product, they are tested as
 * a table, and a screen cannot quietly compose a claim the review does not support.
 *
 * Rules (pinned by tests/premiumDomain/dailyLoadCopy.test.mjs):
 *  - nothing is stated that the recomputed review does not support: no "saves X hours", no promise about how the day will feel;
 *  - an estimate is called an estimate, an assumption is called an assumption, and what the review could not see is said plainly;
 *  - "saved" appears only for a change that is durably saved; a receipt that is still catching up is described as exactly that;
 *  - nothing here is a price, a limit or a count of anything Premium meters.
 */
const PREMIUM = HER_KEYS_PREMIUM_DISPLAY_NAME;

export const COPY = {
  featureName: 'Daily Load review',
  entry: {
    title: 'See what you could change about this day',
    body: `${PREMIUM} looks at what is making the day heavy, checks the other days, and shows you exactly what one move would change. You approve it, or you don’t.`,
    open: 'Review this day',
    opening: 'Reviewing…',
    close: 'Close',
  },
  sheet: {
    title: 'Daily Load review',
    pressuresTitle: 'What’s making the day heavy',
    movesTitle: 'What you could change',
    consideredTitle: 'What Her Keys looked at',
    gapsTitle: 'What this review can’t see',
    recentTitle: 'Recent changes',
    showConsidered: 'Show what was considered',
    hideConsidered: 'Hide what was considered',
    approve: 'Approve this change',
    approving: 'Moving it…',
    reject: 'Not this one',
    undo: 'Undo',
    undoing: 'Undoing…',
    checkAgain: 'Check this day again',
    movableTag: 'Could move',
    contextTag: 'Stays put',
  },
  clear: {
    title: 'Nothing here needs moving',
    body: 'This day isn’t overloaded, so Her Keys has nothing to suggest. It won’t invent something to do.',
  },
  noMove: {
    title: 'Nothing here is safe to move',
    body: 'The day is heavy, but none of what’s on it is something Her Keys may move for you. You can still choose what to change yourself.',
  },
  confirm: {
    title: 'Make this change?',
    cancel: 'Not now',
    confirm: 'Yes, make this change',
    scope: 'This changes only this one task, only this one time. Nothing else changes, and Her Keys won’t do anything like it again unless you ask.',
  },
} as const;

const tierWord: Record<LoadTier, string> = { open: 'open', tight: 'tight', overloaded: 'overloaded' };
const quoted = (title: string) => `“${title}”`;
const minutes = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

export function dayTitle(date: LocalDate): string {
  return `${weekdayName(date)}’s Daily Load`;
}

export function pressureSentence(pressure: Pressure): string {
  const ev = pressure.responsible.filter((r) => r.kind === 'event');
  const a = ev[0] !== undefined ? quoted(ev[0].title) : 'one commitment';
  const b = ev[1] !== undefined ? quoted(ev[1].title) : 'the next';
  const estimate = pressure.estimated ? ' Some of the task lengths behind this are estimates.' : '';
  switch (pressure.kind) {
    case 'overlap':
      return `${a} and ${b} overlap by ${minutes(pressure.magnitude)}.`;
    case 'transition_conflict':
      return `${a} to ${b} is ${minutes(pressure.magnitude)} short of the time Her Keys likes to leave between commitments.${estimate}`;
    case 'tight_window':
      return `${a} to ${b} is a tight window: ${minutes(pressure.magnitude)} less than Her Keys likes to leave.${estimate}`;
    case 'capacity_pressure':
      return `The day has about ${minutes(pressure.magnitude)} more tasks than free time.${estimate}`;
    case 'overdue':
      return `${quoted(pressure.responsible[0]?.title ?? 'A task')} is ${pressure.magnitude} ${pressure.magnitude === 1 ? 'day' : 'days'} overdue.`;
  }
}

export function pressureResponsibleLine(pressure: Pressure): string | null {
  const tasks = pressure.responsible.filter((r) => r.kind === 'task');
  if (tasks.length === 0) return null;
  const list = tasks.map((t) => `${quoted(t.title)}${t.minutes === null ? '' : ` (${minutes(t.minutes)}${t.estimated ? ', estimated' : ''})`}`).join(', ');
  return `On it: ${list}.`;
}

export function proposalHeadline(proposal: RescheduleProposal): string {
  const where = fullDayLabel(proposal.toDate);
  return `Move ${quoted(proposal.taskTitle)} to ${where}${proposal.timeKept ? ' at the same time' : ''}`;
}

/** What the move changes, as recomputed. Each line is a measured difference, never a forecast. */
export function proposalImpactLines(proposal: RescheduleProposal): string[] {
  const { improvement: i, destination } = proposal;
  const sourceDay = weekdayName(proposal.sourceDate);
  const destDay = weekdayName(proposal.toDate);
  const lines: string[] = [];
  if (i.tierBefore !== i.tierAfter) lines.push(`${sourceDay} goes from ${tierWord[i.tierBefore]} to ${tierWord[i.tierAfter]}.`);
  if (i.bufferBefore !== null && i.bufferAfter !== null && i.bufferAfter > i.bufferBefore) {
    lines.push(`The tightest gap on ${sourceDay} goes from ${minutes(Math.max(0, i.bufferBefore))} to ${minutes(i.bufferAfter)}.`);
  }
  if (i.capacityPressureAfter < i.capacityPressureBefore) {
    lines.push(
      i.capacityPressureAfter === 0
        ? `${sourceDay} no longer has more tasks than free time (it was ${minutes(i.capacityPressureBefore)} over).`
        : `${sourceDay} goes from ${minutes(i.capacityPressureBefore)} over its free time to ${minutes(i.capacityPressureAfter)} over.`,
    );
  }
  lines.push(
    destination.before.tier === destination.after.tier
      ? `${destDay} stays ${tierWord[destination.after.tier]}.`
      : `${destDay} goes from ${tierWord[destination.before.tier]} to ${tierWord[destination.after.tier]}.`,
  );
  return lines;
}

export function assumptionLine(code: AssumptionCode, proposal: RescheduleProposal): string {
  switch (code) {
    case 'flexible_by_default':
      return 'Her Keys treats this as movable because it isn’t marked fixed. If it can’t move, mark it fixed and Her Keys will leave it alone.';
    case 'duration_estimated':
      return `The ${minutes(proposal.durationMinutes)} is an estimate, not a length you entered.`;
    case 'time_not_kept':
      return `That time isn’t free on ${weekdayName(proposal.toDate)}, so it keeps the day but not a set time.`;
    case 'destination_gets_tighter':
      return `${weekdayName(proposal.toDate)} will be a little tighter, though not overloaded.`;
  }
}

export function evidenceGapLine(code: EvidenceGapCode): string {
  switch (code) {
    case 'travel_not_entered':
      return 'Some events have a place but no travel time, so the real gaps may be smaller than shown.';
    case 'external_calendar_not_included':
      return 'Events from a connected Google Calendar aren’t part of this review.';
    case 'durations_estimated':
      return 'Some task lengths are Her Keys’ planning defaults, not lengths you entered.';
  }
}

const NOT_OFFERED: Record<IneligibleReason, string> = {
  fixed: 'It’s fixed.',
  not_open: 'It’s already done or removed.',
  due_today_or_overdue: 'It’s due today or overdue, so it can’t wait.',
  imported: 'It came from another calendar, which Her Keys doesn’t change.',
  automation_generated: 'A routine made it, and Her Keys doesn’t reschedule those.',
  high_consequence: 'It matters too much to move without you deciding it yourself.',
  child_obligation: 'It’s about one of your children, so it stays where you put it.',
  coparenting: 'It’s part of co-parenting, so it stays where you put it.',
  financial: 'It’s about money, so it stays where you put it.',
  event_not_offered: 'Events stay where you put them in this version.',
};

export function consideredLine(record: ConsideredRecord): string {
  const kind = record.kind === 'event' ? 'Event' : 'Task';
  return `${kind}: ${quoted(record.title)} — ${record.notOfferedBecause === null ? 'could move' : NOT_OFFERED[record.notOfferedBecause]}`;
}

export function approveOutcomeMessage(outcome: ApproveOutcome, proposal: RescheduleProposal): { tone: 'success' | 'attention' | 'info'; message: string } {
  switch (outcome.kind) {
    case 'applied':
      return {
        tone: outcome.receipt === 'recorded' ? 'success' : 'info',
        message:
          outcome.receipt === 'recorded'
            ? `Done. ${quoted(proposal.taskTitle)} is now on ${fullDayLabel(proposal.toDate)}. You can undo it below.`
            : `Done. ${quoted(proposal.taskTitle)} is now on ${fullDayLabel(proposal.toDate)}. Her Keys is still finishing the record of it and will catch up. You can undo it below.`,
      };
    case 'refused':
      return { tone: 'info', message: 'Something changed since this was shown, so Her Keys checked again and this no longer fits. Nothing was changed.' };
    case 'duplicate':
      return { tone: 'info', message: 'This change was already made or is being made. Nothing more was changed.' };
    case 'not_saved':
      return { tone: 'attention', message: 'Her Keys couldn’t save that on this phone. Nothing was changed. Try again.' };
    case 'receipt_unavailable':
      return { tone: 'attention', message: 'Her Keys couldn’t keep a record of this change, so it didn’t make it. Nothing was changed. Try again in a moment.' };
    case 'not_allowed':
      return { tone: 'attention', message: `${PREMIUM} couldn’t confirm this change right now. Nothing was changed.` };
  }
}

export function undoOutcomeMessage(outcome: UndoFlowOutcome): { tone: 'success' | 'attention' | 'info'; message: string } {
  switch (outcome.kind) {
    case 'reverted':
      return { tone: 'success', message: 'Undone. The task is back where it was.' };
    case 'blocked':
      return {
        tone: 'info',
        message:
          outcome.reason === 'plan_changed'
            ? 'You’ve moved this since, so Her Keys left your newer plan alone. Nothing was changed.'
            : 'This task has been finished or removed since, so there’s nothing to undo.',
      };
    case 'not_saved':
      return { tone: 'attention', message: 'Her Keys couldn’t save that on this phone. Nothing was changed. Try again.' };
    case 'unknown_receipt':
      return { tone: 'attention', message: 'Her Keys can’t undo this one.' };
  }
}

/** One line for a receipt row. References only: the title is looked up from the household, never stored in the ledger. */
export function receiptLine(row: { status: string }, taskTitle: string | null, toDate: LocalDate | null): string {
  const name = taskTitle === null ? 'A task' : quoted(taskTitle);
  const where = toDate === null ? '' : ` to ${fullDayLabel(toDate)}`;
  switch (row.status) {
    case 'applied':
      return `${name} moved${where}.`;
    case 'reverted':
      return `${name} moved back.`;
    case 'revert_blocked':
      return `${name} moved${where}. Undo is no longer possible because you changed it since.`;
    case 'rejected':
      return `You chose not to move ${name}.`;
    case 'failed':
    case 'abandoned':
      return `A change to ${name} wasn’t made.`;
    default:
      return `${name} — in progress.`;
  }
}
