import { formatClock, formatClockRange, formatDayTitle, formatMinutes, formatWeekdayShort, formatDayNumber } from './format';
import type {
  CalendarDayViewModel,
  Conflict,
  Coverage,
  DayItem,
  MissingEvidence,
  Opening,
  RecurrenceNote,
  ResponsibilityMark,
  UnplacedItem,
  WeekDaySummary,
} from './model/types';
import type { LoadTier } from '../../domain/loadThresholds';

/**
 * ALL significant Calendar and capacity wording lives here (contract section 55).
 *
 * Voice: calm, precise, operational, adult, nonjudgmental. Calendar describes CONSTRAINTS, never
 * character: "two commitments overlap", not anything about how she planned. Uncertainty is stated as
 * uncertainty ("isn’t entered"), never softened into a claim of room.
 *
 * SHARED COPY CANDIDATE (contract 55A): the capacity / conflict / unknown-state wording below is what
 * Today will also need. It is deliberately not imported from Today and not shared yet; the
 * integration wave reconciles the two into one product voice. See the ledger for the state list.
 */

export const COPY = {
  screenTitle: 'Calendar',
  addEvent: 'Add event',
  dayView: 'Day',
  weekView: 'Week',
  today: 'Today',
  previousDay: 'Previous day',
  nextDay: 'Next day',
  previousWeek: 'Previous week',
  nextWeek: 'Next week',
  agendaHeading: 'Schedule',
  notScheduledHeading: 'Not on the schedule yet',
  unknownHeading: 'Not known yet',
  details: 'Details',
  hideDetails: 'Hide details',
  why: 'Why',
  hideWhy: 'Hide why',
  edit: 'Edit',
  loading: 'Reading your calendar…',
  loadingDetail: 'Nothing is shown as empty until your household has loaded.',
  recoveryTitle: 'Your household is being restored',
  recoveryBody: 'Calendar will show your day once your household has been restored. Nothing is assessed from data that has not been recovered.',
  persistenceDegraded: 'Some recent changes may not be saved yet.',
  emptyDayTitle: 'Nothing scheduled',
  emptyDayBody: 'There is nothing on this day.',
  pastDay: 'Earlier day, shown as it was recorded.',
  demoMarker: 'Demo household',
  previewBanner: 'Preview — nothing has changed yet.',
  previewStale: 'The schedule changed while you were looking, so this preview no longer applies.',
} as const;

const FIXED = 'Fixed';
const FLEXIBLE = 'Flexible';

export const flexibilityLabel = (flexibility: 'fixed' | 'flexible'): string => (flexibility === 'fixed' ? FIXED : FLEXIBLE);

/** A category label for a whole day, in the foundation’s three tiers plus “not known”. Never a score. */
export function tierLabel(tier: LoadTier | null): string {
  switch (tier) {
    case 'open': return 'Room';
    case 'tight': return 'Tight';
    case 'overloaded': return 'More than fits';
    case null: return 'Not enough known';
  }
}

export interface CopyContext {
  view: CalendarDayViewModel;
  clock: (elapsedMinute: number) => string;
  range: (startMinute: number, endMinute: number) => string;
  titleOf: (ref: { kind: string; id: string }) => string;
  item: (ref: { kind: string; id: string }) => DayItem | undefined;
}

export function copyContextFor(view: CalendarDayViewModel): CopyContext {
  const at = (minute: number) => view.frameStartMs + minute * 60_000;
  const titles = new Map<string, string>();
  const items = new Map<string, DayItem>();
  for (const item of view.dayItems) {
    titles.set(`${item.ref.kind}:${item.ref.id}`, item.title);
    items.set(`${item.ref.kind}:${item.ref.id}`, item);
    for (const blocker of item.blockedBy) if (blocker.title !== null) titles.set(`${blocker.ref.kind}:${blocker.ref.id}`, blocker.title);
  }
  return {
    view,
    clock: (minute) => formatClock(at(minute), view.timeZone),
    range: (start, end) => formatClockRange(at(start), at(end), view.timeZone),
    titleOf: (ref) => titles.get(`${ref.kind}:${ref.id}`) ?? 'that item',
    item: (ref) => items.get(`${ref.kind}:${ref.id}`),
  };
}

// ---------------------------------------------------------------- responsibility ---

const holderName = (mark: ResponsibilityMark): string => (mark.holder.kind === 'self' ? 'You' : (mark.holder.displayName ?? 'Someone'));

/** DELEGATED is not COVERED: only an accepted or completed handoff reads as handled. */
export function responsibilityLine(mark: ResponsibilityMark): string | null {
  const name = holderName(mark);
  const lines: Record<Coverage, string | null> = {
    mine: null,
    awaiting_response: mark.unacknowledged ? `${name} hasn’t answered the request` : `Waiting for ${name} to accept`,
    acknowledged_not_accepted: `${name} has seen it and hasn’t accepted yet`,
    accepted: mark.stillNeedsMe === true ? `${name} accepted; it still needs you` : `${name} accepted`,
    declined: `${name} declined; it’s back with you`,
    returned: 'Back with you',
    completed: `${name} completed it`,
  };
  return lines[mark.coverage];
}

// ------------------------------------------------------------------- items ---

function recurrenceLine(rule: RecurrenceNote): string | null {
  if (rule.frequency === null) return null;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.frequency];
  return rule.interval === 1 ? `Repeats every ${unit}` : `Repeats every ${rule.interval} ${unit}s`;
}

const estimateLine = (item: DayItem): string => (item.durationMinutes === null ? 'No duration recorded' : `About ${formatMinutes(item.durationMinutes)}`);

/** The second line under an item’s title. Text marks fixed/flexible and state, so nothing depends on color. */
export function itemLine(item: DayItem, ctx: CopyContext): string {
  const parts: string[] = [];
  if (item.timing.kind === 'timed') {
    parts.push(item.timing.endKnown ? ctx.range(item.timing.startMinute, item.timing.endMinute) : `${ctx.clock(item.timing.startMinute)}, end not known`);
    parts.push(flexibilityLabel(item.flexibility));
    if (item.timing.continuesFromPreviousDay) parts.push('Continues from the day before');
    if (item.timing.continuesIntoNextDay) parts.push('Continues into the next day');
    if (item.progress === 'in_progress') parts.push('Happening now');
    if (item.progress === 'elapsed' && ctx.view.dayMode === 'today') parts.push('Earlier today');
  } else {
    const t = item.timing;
    parts.push(t.basis === 'overdue' ? `Overdue by ${t.daysOverdue} ${t.daysOverdue === 1 ? 'day' : 'days'}` : t.basis === 'due' ? 'Due this day' : 'Planned for this day');
    parts.push(flexibilityLabel(item.flexibility));
    parts.push(estimateLine(item));
  }
  return parts.join(' · ');
}

/** What the row says out loud. The same facts as the visible line, in reading order. */
export function itemAccessibilityLabel(item: DayItem, ctx: CopyContext): string {
  const responsibility = item.responsibility === null ? null : responsibilityLine(item.responsibility);
  return [item.title, itemLine(item, ctx), responsibility].filter(Boolean).join('. ');
}

/** Second-level detail: subject, place, what she entered for getting there, dependencies, repetition. */
export function detailLines(item: DayItem): string[] {
  const lines: string[] = [];
  if (item.subject.kind === 'child') lines.push(`Concerns ${item.subject.displayName}`);
  if (item.subject.kind === 'self') lines.push('Concerns you');
  if (item.location !== null) lines.push(`At ${item.location}`);
  const { travelBefore, travelAfter, preparation } = item.transition;
  if (preparation !== null) lines.push(`Preparation you entered: ${formatMinutes(preparation)}`);
  if (travelBefore !== null) lines.push(`Travel before you entered: ${formatMinutes(travelBefore)}`);
  if (travelAfter !== null) lines.push(`Travel after you entered: ${formatMinutes(travelAfter)}`);
  for (const blocker of item.blockedBy) lines.push(`Needs ${blocker.title ?? 'another item'} first`);
  if (item.repeats !== null) {
    const repeat = recurrenceLine(item.repeats);
    if (repeat !== null) lines.push(repeat);
  }
  if (item.responsibility !== null) {
    const line = responsibilityLine(item.responsibility);
    if (line !== null) lines.push(line);
  }
  return lines;
}

// --------------------------------------------------------------- conflicts ---

export interface ConflictCopy {
  label: string;
  sentence: string;
  why: string[];
}

export function conflictCopy(conflict: Conflict, ctx: CopyContext): ConflictCopy {
  const e = conflict.evidence;
  switch (e.kind) {
    case 'overlap': {
      const a = ctx.titleOf(e.a.ref);
      const b = ctx.titleOf(e.b.ref);
      const stance =
        e.flexibilityA === 'fixed' && e.flexibilityB === 'fixed'
          ? 'Both are fixed, so Her Keys won’t move either one.'
          : e.flexibilityA === 'flexible' && e.flexibilityB === 'flexible'
            ? 'Both are flexible; Her Keys doesn’t choose between them.'
            : `${e.flexibilityA === 'flexible' ? a : b} is flexible; ${e.flexibilityA === 'fixed' ? a : b} is fixed.`;
      return {
        label: 'Overlap',
        sentence: `${a} and ${b} overlap by ${formatMinutes(e.overlapMinutes)}.`,
        why: [`${a} runs ${ctx.range(e.a.startMinute, e.a.endMinute)}.`, `${b} runs ${ctx.range(e.b.startMinute, e.b.endMinute)}.`, stance],
      };
    }
    case 'transition': {
      const a = ctx.titleOf(e.before.ref);
      const b = ctx.titleOf(e.after.ref);
      const why = [`${a} ends at ${ctx.clock(e.before.endMinute)}; ${b} starts at ${ctx.clock(e.after.startMinute)}. That is ${formatMinutes(e.gapMinutes)}.`];
      if (e.entered.travelAfter !== null) why.push(`You entered ${formatMinutes(e.entered.travelAfter)} of travel after ${a}.`);
      if (e.entered.travelBefore !== null) why.push(`You entered ${formatMinutes(e.entered.travelBefore)} of travel before ${b}.`);
      if (e.entered.preparation !== null) why.push(`You entered ${formatMinutes(e.entered.preparation)} of preparation for ${b}.`);
      if (e.scheduledMinutes > 0) why.push(`${formatMinutes(e.scheduledMinutes)} of tasks are already scheduled in that time.`);
      why.push(`That is ${formatMinutes(-e.slackMinutes)} more than the time between them.`);
      return {
        label: 'Not enough time',
        sentence: `The ${formatMinutes(e.gapMinutes)} between ${a} and ${b} is shorter than what you entered for getting there.`,
        why,
      };
    }
    case 'dependency': {
      const item = ctx.titleOf(e.item);
      const predecessor = ctx.titleOf(e.predecessor);
      return {
        label: 'Out of order',
        sentence: `${item} is scheduled before ${predecessor} is done, and it needs ${predecessor} first.`,
        why: [`${item} starts at ${ctx.clock(e.itemStartMinute)}.`, `${predecessor} finishes at ${ctx.clock(e.predecessorFinishMinute)}.`],
      };
    }
    case 'placement': {
      const item = ctx.titleOf(e.item);
      const longest = e.gaps.reduce((max, gap) => Math.max(max, gap.lengthMinutes), 0);
      const why = [`${item} needs about ${formatMinutes(e.durationMinutes)}.`];
      why.push(e.windowEndMinute > e.windowStartMinute ? `The time it can use runs ${ctx.range(e.windowStartMinute, e.windowEndMinute)}.` : 'No time is left inside the window it can use.');
      why.push(longest > 0 ? `The longest open stretch in that time is ${formatMinutes(longest)}.` : 'Everything in that time is already taken.');
      return { label: 'Needs a place', sentence: `${item} needs about ${formatMinutes(e.durationMinutes)}, and no open stretch is long enough.`, why };
    }
    case 'responsibility': {
      const item = ctx.titleOf(e.item);
      const mark = ctx.item(e.item)?.responsibility ?? null;
      const line = mark === null ? null : responsibilityLine(mark);
      return {
        label: e.coverage === 'declined' ? 'Handed back' : 'Not confirmed',
        sentence: `${item}: ${line ?? 'the handoff is not confirmed'}.`,
        why: [line === null ? 'The handoff has not been accepted.' : `${line}.`, 'A request is not the same as someone having it covered.'],
      };
    }
  }
}

// ------------------------------------------------------------------ unplaced ---

export interface UnplacedCopy {
  label: string | null;
  sentence: string;
  why: string[];
}

function openingText(opening: Opening, ctx: CopyContext): string {
  return ctx.range(opening.startMinute, opening.endMinute);
}

export function unplacedCopy(unplaced: UnplacedItem, ctx: CopyContext): UnplacedCopy {
  const title = ctx.titleOf(unplaced.itemRef);
  switch (unplaced.state) {
    case 'has_opening': {
      const first = unplaced.openings[0];
      const more = unplaced.openings.length - 1;
      return {
        label: null,
        sentence: `There’s room from ${openingText(first, ctx)}${more > 0 ? `, and ${more} more ${more === 1 ? 'window' : 'windows'}` : ''}. Nothing is scheduled for it.`,
        why: unplaced.openings.slice(0, 3).map((o) => `${openingText(o, ctx)} is free for about ${formatMinutes(o.lengthMinutes)}.`),
      };
    }
    case 'needs_a_place':
      return { label: 'Needs a place', sentence: 'No open stretch today is long enough for it.', why: [] };
    case 'insufficient_information':
      return {
        label: 'Not confirmed',
        sentence:
          unplaced.reason === 'no_usable_duration'
            ? 'No duration is recorded, so Her Keys can’t say whether it fits.'
            : 'It might fit, but travel time isn’t entered, so that isn’t confirmed.',
        why: missingLines(unplaced.missing, ctx),
      };
    case 'waiting_on_predecessor':
      return { label: 'Waiting', sentence: 'It needs something else to be done first, and that has no time yet.', why: [] };
    case 'not_evaluated':
      return { label: null, sentence: 'It can be done in pieces. Her Keys doesn’t plan pieces yet, so it isn’t judged here.', why: [] };
    case 'fixed_without_time':
      return { label: null, sentence: `${title} is fixed and has no time set.`, why: [] };
  }
}

// ----------------------------------------------------------------- unknowns ---

export function missingLines(missing: MissingEvidence[], ctx: CopyContext): string[] {
  return missing.map((entry) => {
    const title = ctx.titleOf(entry.itemRef);
    if (entry.field === 'durationMinutes') return `${title}: no duration is recorded.`;
    return entry.field === 'travelMinutesBefore' ? `Travel time to ${title} isn’t entered.` : `Travel time after ${title} isn’t entered.`;
  });
}

// ---------------------------------------------------------------- headline ---

export type HeadlineKind = 'past' | 'problem' | 'tight' | 'unknown' | 'clear' | 'empty';
export interface Headline {
  kind: HeadlineKind;
  text: string;
  /** How many further constraints are listed below the headline one. */
  more: number;
}

export function headlineFor(view: CalendarDayViewModel, ctx: CopyContext): Headline {
  if (view.dayMode === 'past') return { kind: 'past', text: COPY.pastDay, more: 0 };
  const state = view.capacityState;
  const listed = view.conflicts;

  if (listed.length > 0) return { kind: 'problem', text: conflictCopy(listed[0], ctx).sentence, more: listed.length - 1 };

  if (state !== null && state.verdict === 'capacity_pressure' && state.pressure !== null) {
    return { kind: 'problem', text: `More is planned than the day has room for: ${formatMinutes(state.pressure.neededMinutes)} planned, ${formatMinutes(state.pressure.availableMinutes)} available.`, more: 0 };
  }
  if (view.narrowTransitions.length > 0) {
    const narrow = view.narrowTransitions[0];
    return { kind: 'tight', text: `${ctx.titleOf(narrow.before.ref)} to ${ctx.titleOf(narrow.after.ref)} fits, with ${formatMinutes(narrow.slackMinutes)} to spare.`, more: view.narrowTransitions.length - 1 };
  }
  if (state !== null && state.tier === null) {
    return { kind: 'unknown', text: 'Not enough is entered to say whether this day fits.', more: 0 };
  }
  if (view.dayItems.length === 0) return { kind: 'empty', text: COPY.emptyDayTitle, more: 0 };
  return { kind: 'clear', text: 'Everything scheduled fits.', more: 0 };
}

// -------------------------------------------------------------------- week ---

export function weekDayLabel(summary: WeekDaySummary): string {
  const name = `${formatWeekdayShort(summary.date)} ${formatDayNumber(summary.date)}`;
  if (summary.dayMode === 'past') return `${name}: earlier, ${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`;
  const parts = [tierLabel(summary.tier)];
  if (summary.conflictCount > 0) parts.push(`${summary.conflictCount} ${summary.conflictCount === 1 ? 'conflict' : 'conflicts'}`);
  if (summary.unplacedCount > 0) parts.push(`${summary.unplacedCount} not on the schedule yet`);
  if (summary.evidenceStatus === 'insufficient' && summary.tier !== null) parts.push('some facts missing');
  return `${name}: ${parts.join(', ')}`;
}

export const dayTitle = formatDayTitle;
