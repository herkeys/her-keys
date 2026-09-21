import { formatClock, formatClockRange, formatDayTitle, formatMinutes, formatWeekdayShort, formatDayNumber } from './format';
import { REQUIRED_TRANSITION_BUFFER_MINUTES } from '../daily-load/computeDailyLoad';
import { isEstimatedBasis } from './model/durationBasis';
import type { ActionPreview, PreviewableIntent } from './model/preview';
import type {
  CalendarDayViewModel,
  CapacityCategory,
  Conflict,
  ConflictType,
  Coverage,
  DayItem,
  DurationBasis,
  EstimatedBasis,
  EstimatedDuration,
  MissingEvidence,
  NarrowTransition,
  Opening,
  RecurrenceNote,
  ResponsibilityMark,
  UnplacedItem,
  WeekDaySummary,
} from './model/types';

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
  viewSwitchLabel: 'Calendar view',
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
  previewUpdated: 'The schedule changed, so this preview was updated to match.',
  previewOutOfDate: 'The schedule changed. Preview again before applying this.',
  saveFailed: 'Her Keys couldn’t save that yet. Try again.',
  cancel: 'Cancel',
  previewAgain: 'Preview again',
  protect: 'Protect this',
  undo: 'Undo',
  keepAsPlanned: 'Not today',
  whatWouldChange: 'What would change',
  hintOpenItem: 'Opens this item to edit it',
  hintOpenDay: 'Opens this day',
  hintProtect: 'Shows what this does before anything changes',
  hintAccept: 'Applies this change',
  hintCancelPreview: 'Discards the preview and changes nothing',
} as const;

export const undoLine = (title: string): string => `You moved ${title} to tomorrow. That can still be undone today.`;

export const ACCEPT_LABEL: Record<PreviewableIntent['kind'], string> = {
  move_event: 'Move to tomorrow',
  move_task: 'Move to tomorrow',
  shorten_task: 'Shorten it',
  drop_task: 'Drop it',
  protect: 'Protect it',
};

const FIXED = 'Fixed';
const FLEXIBLE = 'Flexible';

export const flexibilityLabel = (flexibility: 'fixed' | 'flexible'): string => (flexibility === 'fixed' ? FIXED : FLEXIBLE);

// ------------------------------------------------------- duration knowledge ---

/**
 * A number of minutes is a fact only when she gave it (HA-010: DEFAULT != USER-PROVIDED). Every other basis is an estimate and
 * is worded as one, from this section and nowhere else, so a claim can never carry more confidence than its number has.
 * Nothing here says or implies "you said" or "you entered" for a length she did not give, and a length of unknown origin is
 * called unconfirmed, never assumed to be hers and never assumed to be a default.
 */
const ESTIMATE_WORD: Record<EstimatedBasis, string> = { task_default: 'assumed', task_inferred: 'estimated', task_unrecorded: 'not confirmed' };
const LENGTH_KIND: Record<EstimatedBasis, string> = { task_default: 'an assumed length', task_inferred: 'an estimated length', task_unrecorded: 'a length that isn’t confirmed' };

/** " (assumed)", " (estimated)", " (not confirmed)" — or nothing, for a length she gave or an event's own span. */
const lengthQualifier = (basis: DurationBasis): string => (isEstimatedBasis(basis) ? ` (${ESTIMATE_WORD[basis]})` : '');

/** One length, worded by how far it can be trusted: "about 30 min" when hers, "about 15 min (assumed)" when not. */
const aboutLength = (minutes: number, basis: DurationBasis): string => `about ${formatMinutes(minutes)}${lengthQualifier(basis)}`;

/** What a claim counts, when it counts lengths that are not hers. Only a length of unknown origin is called unconfirmed. */
const countedPhrase = (estimated: readonly EstimatedDuration[]): string =>
  estimated.every((entry) => entry.basis === 'task_unrecorded') ? 'task lengths that aren’t confirmed' : 'estimated task lengths';

/** The clause a fit / no-fit / capacity claim carries when it counts a length that is not hers. Empty when it counts none. */
const countingClause = (estimated: readonly EstimatedDuration[]): string => (estimated.length === 0 ? '' : `, counting ${countedPhrase(estimated)}`);

/** The clause for a claim that rests on ONE task's length. */
const goingBy = (basis: DurationBasis): string => (isEstimatedBasis(basis) ? `, going by ${LENGTH_KIND[basis]}` : '');

/** Why one length is an estimate, as a sentence. `null` when the length is hers or there is none. */
function basisExplanation(basis: DurationBasis): string | null {
  switch (basis) {
    case 'task_default': return 'No length was entered for it, so its length is a planning assumption.';
    case 'task_inferred': return 'Her Keys estimated its length.';
    case 'task_unrecorded': return 'Where its length came from isn’t recorded, so it isn’t confirmed.';
    default: return null;
  }
}

/** Which tasks a claim counts with an estimated length, and how each one is estimated. */
const estimatedNote = (estimated: readonly EstimatedDuration[], ctx: { titleOf: (ref: { kind: string; id: string }) => string }): string =>
  `Some task lengths are estimates: ${estimated.map((entry) => `${ctx.titleOf(entry.itemRef)} (${ESTIMATE_WORD[entry.basis]})`).join(', ')}.`;

/**
 * A word for a whole day: the foundation’s tiers, worded by the physical facts (see `CapacityCategory`), plus “not
 * known”. Never a score, never a percentage.
 */
export function categoryLabel(category: CapacityCategory | null): string {
  switch (category) {
    case 'room': return 'Room';
    case 'tight': return 'Tight';
    case 'more_than_fits': return 'More than fits';
    case 'not_known':
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
  const hour = view.repeatedHour;
  const repeated = (ms: number) => hour !== null && ms >= hour.startMs && ms < hour.endMs;
  const titles = new Map<string, string>();
  const items = new Map<string, DayItem>();
  for (const item of view.dayItems) {
    titles.set(`${item.ref.kind}:${item.ref.id}`, item.title);
    items.set(`${item.ref.kind}:${item.ref.id}`, item);
    for (const blocker of item.blockedBy) if (blocker.title !== null) titles.set(`${blocker.ref.kind}:${blocker.ref.id}`, blocker.title);
  }
  return {
    view,
    clock: (minute) => formatClock(at(minute), view.timeZone, { ambiguous: repeated(at(minute)) }),
    range: (start, end) => formatClockRange(at(start), at(end), view.timeZone, { startAmbiguous: repeated(at(start)), endAmbiguous: repeated(at(end)) }),
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

const estimateLine = (item: DayItem): string =>
  item.durationMinutes === null ? 'No duration recorded' : `About ${formatMinutes(item.durationMinutes)}${lengthQualifier(item.durationBasis)}`;

/** A timed task's end is its start plus its length, so an end that rests on a length that is not hers is said to. */
const endNote = (item: DayItem): string | null =>
  item.timing.kind === 'timed' && item.timing.endKnown && isEstimatedBasis(item.durationBasis) ? `Length ${ESTIMATE_WORD[item.durationBasis]}` : null;

/** The second line under an item’s title. Text marks fixed/flexible and state, so nothing depends on color. */
export function itemLine(item: DayItem, ctx: CopyContext): string {
  const parts: string[] = [];
  if (item.timing.kind === 'timed') {
    parts.push(item.timing.endKnown ? ctx.range(item.timing.startMinute, item.timing.endMinute) : `${ctx.clock(item.timing.startMinute)}, end not known`);
    parts.push(flexibilityLabel(item.flexibility));
    const note = endNote(item);
    if (note !== null) parts.push(note);
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
  const lengthWhy = basisExplanation(item.durationBasis);
  if (lengthWhy !== null) lines.push(lengthWhy);
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
      if (e.estimatedTasks.length > 0) why.push(estimatedNote(e.estimatedTasks, ctx));
      why.push(`That is ${formatMinutes(-e.slackMinutes)} more than the time between them.`);
      return {
        label: 'Not enough time',
        // Tasks scheduled in the gap count against it by their length, so a length that is not hers makes this a "may be".
        sentence:
          e.estimatedTasks.length === 0
            ? `The ${formatMinutes(e.gapMinutes)} between ${a} and ${b} is shorter than what you entered for getting there.`
            : `The ${formatMinutes(e.gapMinutes)} between ${a} and ${b} may be shorter than what you entered for getting there${countingClause(e.estimatedTasks)}.`,
        why,
      };
    }
    case 'dependency': {
      const item = ctx.titleOf(e.item);
      const predecessor = ctx.titleOf(e.predecessor);
      // A task's finish is its start plus its length: exactly as certain as that length. An event's end is a fact.
      const estimated = isEstimatedBasis(e.predecessorFinishBasis);
      const lengthWhy = basisExplanation(e.predecessorFinishBasis);
      return {
        label: 'Out of order',
        sentence: estimated
          ? `${item} may be scheduled before ${predecessor} is done, and it needs ${predecessor} first.`
          : `${item} is scheduled before ${predecessor} is done, and it needs ${predecessor} first.`,
        why: [
          `${item} starts at ${ctx.clock(e.itemStartMinute)}.`,
          estimated ? `${predecessor} is expected to finish at ${ctx.clock(e.predecessorFinishMinute)}.` : `${predecessor} finishes at ${ctx.clock(e.predecessorFinishMinute)}.`,
          ...(lengthWhy === null ? [] : [lengthWhy]),
        ],
      };
    }
    case 'placement': {
      const item = ctx.titleOf(e.item);
      const longest = e.gaps.reduce((max, gap) => Math.max(max, gap.lengthMinutes), 0);
      // "Needs about 15 min (assumed)": the number is worded by what it rests on, so the no-fit is as certain as the number is.
      const needs = aboutLength(e.durationMinutes, e.durationBasis);
      const why = [`${item} needs ${needs}.`];
      why.push(e.windowEndMinute > e.windowStartMinute ? `The time it can use runs ${ctx.range(e.windowStartMinute, e.windowEndMinute)}.` : 'No time is left inside the window it can use.');
      why.push(longest > 0 ? `The longest open stretch in that time is ${formatMinutes(longest)}.` : 'Everything in that time is already taken.');
      const lengthWhy = basisExplanation(e.durationBasis);
      if (lengthWhy !== null) why.push(lengthWhy);
      return { label: 'Needs a place', sentence: `${item} needs ${needs}, and no open stretch is long enough.`, why };
    }
    case 'responsibility': {
      const item = ctx.titleOf(e.item);
      const mark = ctx.item(e.item)?.responsibility ?? null;
      const line = mark === null ? null : responsibilityLine(mark);
      const acceptedButStillHers = e.coverage === 'accepted' && mark?.stillNeedsMe === true;
      return {
        label: e.coverage === 'declined' ? 'Handed back' : acceptedButStillHers ? 'Still needs you' : 'Not confirmed',
        sentence: `${item}: ${line ?? 'the handoff is not confirmed'}.`,
        why: [
          line === null ? 'The handoff has not been accepted.' : `${line}.`,
          acceptedButStillHers ? 'Acceptance does not prove the load left you.' : 'A request is not the same as someone having it covered.',
        ],
      };
    }
  }
}

// ------------------------------------------------------------- narrow fits ---

/**
 * A transition that FITS but leaves little room. Worded as a fit — the foundation’s own buffer is named as the
 * reference, and the difference between “fits narrowly” and “does not fit” is stated, never blurred.
 */
export function narrowCopy(narrow: NarrowTransition, ctx: CopyContext): ConflictCopy {
  const a = ctx.titleOf(narrow.before.ref);
  const b = ctx.titleOf(narrow.after.ref);
  const why = [`${a} ends at ${ctx.clock(narrow.before.endMinute)}; ${b} starts at ${ctx.clock(narrow.after.startMinute)}. That is ${formatMinutes(narrow.gapMinutes)}.`];
  if (narrow.storedTransitionMinutes > 0) why.push(`You entered ${formatMinutes(narrow.storedTransitionMinutes)} for getting there.`);
  if (narrow.scheduledMinutes > 0) why.push(`${formatMinutes(narrow.scheduledMinutes)} of tasks are already scheduled in that time.`);
  if (narrow.estimatedTasks.length > 0) why.push(estimatedNote(narrow.estimatedTasks, ctx));
  why.push(`That leaves ${formatMinutes(narrow.slackMinutes)}. Her Keys looks for ${formatMinutes(REQUIRED_TRANSITION_BUFFER_MINUTES)} between commitments.`);
  return {
    label: 'Fits narrowly',
    // "It fits" counts the scheduled tasks by their length: when a length is not hers, the fit is said to count it.
    sentence: `${a} to ${b} fits, with ${formatMinutes(narrow.slackMinutes)} to spare${countingClause(narrow.estimatedTasks)}.`,
    why,
  };
}

/**
 * READABILITY, not capacity: up to this many tight windows get a card each; beyond it they become ONE grouped card, so a
 * dense day is never a wall of equal-priority cards ahead of the schedule. (Not a threshold on the day’s load.)
 */
export const MAX_INDIVIDUAL_NARROW_CARDS = 2;

/** Many windows that each fit, told once: how many, that each fits, and every window one press away, in day order. */
export function narrowGroupCopy(narrow: NarrowTransition[], ctx: CopyContext): ConflictCopy {
  const why = narrow.map((entry) => {
    const a = ctx.titleOf(entry.before.ref);
    const b = ctx.titleOf(entry.after.ref);
    return `${a} to ${b}: ${formatMinutes(entry.gapMinutes)} between them, ${formatMinutes(entry.slackMinutes)} to spare.`;
  });
  const estimated = narrow.flatMap((entry) => entry.estimatedTasks);
  if (estimated.length > 0) why.push(estimatedNote(estimated, ctx));
  why.push(`Her Keys looks for ${formatMinutes(REQUIRED_TRANSITION_BUFFER_MINUTES)} between commitments.`);
  return {
    label: 'Fits narrowly',
    sentence: `${narrow.length} windows between commitments are tight. Each one fits${countingClause(estimated)}.`,
    why,
  };
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
  // Whether it fits, or has nowhere to go, is decided by ITS length: a length that is not hers makes the answer an assumption.
  const lengthWhy = basisExplanation(unplaced.durationBasis);
  switch (unplaced.state) {
    case 'has_opening': {
      const first = unplaced.openings[0];
      const more = unplaced.openings.length - 1;
      return {
        label: null,
        sentence: `There’s room from ${openingText(first, ctx)}${more > 0 ? `, and ${more} more ${more === 1 ? 'window' : 'windows'}` : ''}${goingBy(unplaced.durationBasis)}. Nothing is scheduled for it.`,
        why: [...unplaced.openings.slice(0, 3).map((o) => `${openingText(o, ctx)} is free for about ${formatMinutes(o.lengthMinutes)}.`), ...(lengthWhy === null ? [] : [lengthWhy])],
      };
    }
    case 'needs_a_place':
      return { label: 'Needs a place', sentence: `No open stretch today is long enough for it${goingBy(unplaced.durationBasis)}.`, why: lengthWhy === null ? [] : [lengthWhy] };
    case 'insufficient_information':
      return {
        label: 'Not confirmed',
        sentence:
          unplaced.reason === 'no_usable_duration'
            ? 'No duration is recorded, so Her Keys can’t say whether it fits.'
            : `It might fit${goingBy(unplaced.durationBasis)}, but travel time isn’t entered, so that isn’t confirmed.`,
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

const FIELD_RANK: Record<MissingEvidence['field'], number> = { durationMinutes: 0, travelMinutesBefore: 1, travelMinutesAfter: 2 };

/** In the order the day reads: by item as it appears on the day, then the duration, then travel to, then travel after. */
export function missingLines(missing: MissingEvidence[], ctx: CopyContext): string[] {
  const position = new Map(ctx.view.dayItems.map((item, index) => [`${item.ref.kind}:${item.ref.id}`, index]));
  const at = (entry: MissingEvidence) => position.get(`${entry.itemRef.kind}:${entry.itemRef.id}`) ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...missing].sort((a, b) => at(a) - at(b) || FIELD_RANK[a.field] - FIELD_RANK[b.field]);
  return ordered.map((entry) => {
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

const HEADLINE_BY_TYPE: Record<ConflictType, string> = {
  FIXED_OVERLAP: 'Two commitments overlap.',
  TRANSITION_CONFLICT: 'There isn’t enough time to get between two commitments.',
  DEPENDENCY_CONFLICT: 'Something is scheduled before what it needs.',
  PLACEMENT_FAILURE: 'Something doesn’t have a place today.',
  RESPONSIBILITY_RISK: 'A handoff isn’t confirmed.',
  PROTECTED_TIME_CONFLICT: 'A protected time conflicts with something.',
};

/** The same kinds of problem, for a conflict whose proof counts a length that is not hers: a "may", not a "does". */
const HEADLINE_BY_TYPE_ESTIMATED: Partial<Record<ConflictType, string>> = {
  TRANSITION_CONFLICT: 'There may not be enough time to get between two commitments.',
  DEPENDENCY_CONFLICT: 'Something may be scheduled before what it needs.',
  PLACEMENT_FAILURE: 'Something may not have a place today.',
};

/** Whether the proof of a conflict counts a task length that is not something she gave. */
function restsOnEstimate(conflict: Conflict): boolean {
  const e = conflict.evidence;
  switch (e.kind) {
    case 'placement': return isEstimatedBasis(e.durationBasis);
    case 'transition': return e.estimatedTasks.length > 0;
    case 'dependency': return isEstimatedBasis(e.predecessorFinishBasis);
    default: return false;
  }
}

export function headlineFor(view: CalendarDayViewModel, ctx: CopyContext): Headline {
  if (view.dayMode === 'past') return { kind: 'past', text: COPY.pastDay, more: 0 };
  const state = view.capacityState;
  const listed = view.conflicts;
  // What the day's capacity verdict was computed with that is not a fact she gave (HA-010).
  const estimated = state === null ? [] : state.evidence.estimated;

  // The headline says WHAT KIND of problem there is; the cards below say which commitments. It never repeats a card’s sentence.
  if (listed.length === 1) {
    const only = listed[0];
    return { kind: 'problem', text: (restsOnEstimate(only) ? HEADLINE_BY_TYPE_ESTIMATED[only.type] : undefined) ?? HEADLINE_BY_TYPE[only.type], more: 0 };
  }
  if (listed.length > 1) return { kind: 'problem', text: `${listed.length} things need a look.`, more: 0 };

  if (state !== null && state.verdict === 'capacity_pressure' && state.pressure !== null) {
    const base = `More is planned than the day has room for: ${formatMinutes(state.pressure.neededMinutes)} planned, ${formatMinutes(state.pressure.availableMinutes)} available.`;
    return { kind: 'problem', text: estimated.length === 0 ? base : `${base} That counts ${countedPhrase(estimated)}.`, more: 0 };
  }
  if (view.narrowTransitions.length > 0) {
    // Names the kind of thing, never a card’s own sentence.
    const count = view.narrowTransitions.length;
    const counted = view.narrowTransitions.flatMap((entry) => entry.estimatedTasks);
    const base = count === 1 ? 'One window between commitments is tight.' : `${count} windows between commitments are tight.`;
    return { kind: 'tight', text: counted.length === 0 ? base : `${base} That counts ${countedPhrase(counted)}.`, more: 0 };
  }
  if (state !== null && state.tier === null) {
    return { kind: 'unknown', text: 'Not enough is entered to say whether this day fits.', more: 0 };
  }
  if (view.dayItems.length === 0) return { kind: 'empty', text: COPY.emptyDayTitle, more: 0 };
  return { kind: 'clear', text: `Everything scheduled fits${countingClause(estimated)}.`, more: 0 };
}

// ---------------------------------------------------------- recommendations ---

/**
 * What the foundation is offering, in words. Calendar does not rank or invent these: every offer is a legitimate
 * mutation the foundation says is available right now (the action map), presented so she can preview it first.
 */
export interface Offer {
  key: string;
  body: string;
  primary: { label: string; intent: PreviewableIntent };
  alternative: { intent: PreviewableIntent } | null;
  keep: 'timing' | 'capacity';
  why: string[];
}

export function offersFor(view: CalendarDayViewModel, ctx: CopyContext): Offer[] {
  if (view.dayMode !== 'today') return [];
  const offered = (action: string) => view.availableActions.filter((a) => a.action === action && a.available && a.itemRef !== null);
  const offers: Offer[] = [];

  const timingWhy = (() => {
    const first = view.conflicts.find((c) => c.type === 'FIXED_OVERLAP' || c.type === 'TRANSITION_CONFLICT');
    if (first) return conflictCopy(first, ctx).why;
    return view.narrowTransitions.length > 0 ? narrowCopy(view.narrowTransitions[0], ctx).why : [];
  })();

  for (const action of offered('MOVE')) {
    const ref = action.itemRef!;
    const item = ctx.item(ref);
    const title = ctx.titleOf(ref);
    offers.push({
      key: `move:${ref.id}`,
      body:
        ref.kind === 'event'
          ? `Moving ${title} to tomorrow, at the same time, would open up the time around it today.`
          : `Moving ${title} to tomorrow would free ${item === undefined || item.durationMinutes === null ? 'about its time' : aboutLength(item.durationMinutes, item.durationBasis)} today.`,
      primary: { label: 'Preview the move', intent: ref.kind === 'event' ? { kind: 'move_event', id: ref.id } : { kind: 'move_task', id: ref.id } },
      alternative: null,
      keep: 'timing',
      why: timingWhy,
    });
  }

  const shorten = offered('SHORTEN')[0];
  const drop = offered('DROP')[0];
  const pressure = view.capacityState?.pressure ?? null;
  // "Within what fits" is a verdict over every counted task length, so it carries the ones that are not hers (HA-010).
  const counted = view.capacityState?.evidence.estimated ?? [];
  const named = shorten ?? drop;
  if (named !== undefined && named.itemRef !== null && pressure !== null) {
    const ref = named.itemRef;
    const title = ctx.titleOf(ref);
    offers.push({
      key: `capacity:${ref.id}`,
      body:
        shorten !== undefined
          ? `Shortening ${title} would bring today back within what fits${countingClause(counted)}.`
          : `Dropping ${title} would bring today back within what fits${countingClause(counted)}.`,
      primary: shorten !== undefined ? { label: 'Preview shortening it', intent: { kind: 'shorten_task', id: ref.id } } : { label: 'Preview dropping it', intent: { kind: 'drop_task', id: ref.id } },
      alternative: shorten !== undefined && drop !== undefined ? { intent: { kind: 'drop_task', id: ref.id } } : null,
      keep: 'capacity',
      why: [
        `${formatMinutes(pressure.neededMinutes)} is planned.`,
        `${formatMinutes(pressure.availableMinutes)} is available in the household day.`,
        `That is ${formatMinutes(pressure.pressureMinutes)} more than fits.`,
        ...(counted.length === 0 ? [] : [estimatedNote(counted, ctx)]),
      ],
    });
  }
  return offers;
}

// ------------------------------------------------------------------ preview ---

const CATEGORY_WORD = (category: CapacityCategory | null): string => categoryLabel(category).toLowerCase();

/** The plain-language effect of a previewed action. It describes a hypothesis, never a done thing. */
export function previewLines(preview: ActionPreview, ctx: CopyContext): string[] {
  const intent = preview.intent;
  const id = intent.kind === 'protect' ? intent.targetId : intent.id;
  const kind = intent.kind === 'protect' ? intent.targetType : intent.kind === 'move_event' ? 'event' : 'task';
  const known = ctx.titleOf({ kind, id });
  const title = known === 'that item' ? 'This item' : known;
  const lines: string[] = [];

  if (intent.kind === 'move_event' || intent.kind === 'move_task') {
    const landed = preview.destination?.after.dayItems.find((item) => item.ref.id === id);
    const at =
      landed !== undefined && landed.timing.kind === 'timed' && preview.destination !== null
        ? ` at ${formatClock(preview.destination.after.frameStartMs + landed.timing.startMinute * 60_000, preview.destination.after.timeZone)}`
        : '';
    lines.push(`${title} would move to tomorrow${at}.`);
  } else if (intent.kind === 'shorten_task') {
    // The shortened length is one Her Keys sets (approving it records it as an estimate, never as hers), so it is worded as one.
    const before = preview.before.dayItems.find((item) => item.ref.id === id);
    const after = preview.after.dayItems.find((item) => item.ref.id === id);
    lines.push(
      before?.durationMinutes != null && after?.durationMinutes != null
        ? `${title} would go from ${aboutLength(before.durationMinutes, before.durationBasis)} to ${aboutLength(after.durationMinutes, after.durationBasis)}.`
        : `${title} would be shortened.`
    );
  } else if (intent.kind === 'drop_task') {
    lines.push(`${title} would be removed from your task list. It can’t be restored here.`);
  } else {
    lines.push(`${title} would become fixed. Her Keys would stop suggesting to move, shorten or drop it. You can change it back by editing it.`);
  }

  const before = preview.before.capacityState;
  const after = preview.after.capacityState;
  if (before !== null && after !== null) {
    // The "after" day is the day as it would be, so it counts whatever lengths it would then hold (a shortened one is an estimate).
    const counting = countingClause(after.evidence.estimated);
    lines.push(
      before.category === after.category
        ? `Today would stay ${CATEGORY_WORD(after.category)}${counting}.`
        : `Today would go from ${CATEGORY_WORD(before.category)} to ${CATEGORY_WORD(after.category)}${counting}.`
    );
  }
  if (preview.destination !== null) {
    const existing = new Set(preview.destination.before.conflicts.map((c) => c.id));
    const added = preview.destination.after.conflicts.filter((c) => !existing.has(c.id));
    if (added.length === 0) lines.push('Nothing new would conflict tomorrow.');
    else {
      const destinationCtx = copyContextFor(preview.destination.after);
      for (const conflict of added) lines.push(`Tomorrow: ${conflictCopy(conflict, destinationCtx).sentence}`);
    }
  }
  return lines;
}

// -------------------------------------------------------------------- week ---

export function weekDayLabel(summary: WeekDaySummary): string {
  const name = `${formatWeekdayShort(summary.date)} ${formatDayNumber(summary.date)}`;
  if (summary.dayMode === 'past') return `${name}: earlier, ${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`;
  const parts = [categoryLabel(summary.category)];
  if (summary.conflictCount > 0) parts.push(`${summary.conflictCount} ${summary.conflictCount === 1 ? 'conflict' : 'conflicts'}`);
  if (summary.unplacedCount > 0) parts.push(`${summary.unplacedCount} not on the schedule yet`);
  if (summary.evidenceStatus === 'insufficient' && summary.tier !== null) parts.push('some facts missing');
  if (summary.estimatedDurations && summary.tier !== null) parts.push('some task lengths estimated');
  return `${name}: ${parts.join(', ')}`;
}

const CONFLICT_LABELS: Record<ConflictType, string> = {
  FIXED_OVERLAP: 'Overlap',
  TRANSITION_CONFLICT: 'Not enough time',
  DEPENDENCY_CONFLICT: 'Out of order',
  PLACEMENT_FAILURE: 'Needs a place',
  RESPONSIBILITY_RISK: 'Not confirmed',
  PROTECTED_TIME_CONFLICT: 'Protected time',
};

/**
 * The words under one day of the week. Categorical and equal in weight: a capacity word, the kinds of
 * conflict present, how much flexible work has no time yet, and whether facts were missing. Days are never
 * ordered, scored or compared by quality.
 */
export function weekDayLines(summary: WeekDaySummary): { word: string; lines: string[] } {
  if (summary.dayMode === 'past') {
    return { word: 'Earlier', lines: [`${summary.itemCount} ${summary.itemCount === 1 ? 'item' : 'items'}`] };
  }
  const lines: string[] = [];
  if (summary.conflictTypes.length > 0) lines.push(summary.conflictTypes.map((type) => CONFLICT_LABELS[type]).join(' · '));
  if (summary.unplacedCount > 0) lines.push(`${summary.unplacedCount} not on the schedule yet`);
  if (summary.evidenceStatus === 'insufficient' && summary.tier !== null) lines.push('Some facts missing');
  // The capacity word for the day counts task lengths; where one is not hers the word is not more certain than it.
  if (summary.estimatedDurations && summary.tier !== null) lines.push('Some task lengths estimated');
  if (lines.length === 0 && summary.itemCount === 0) lines.push('Nothing scheduled');
  return { word: categoryLabel(summary.category), lines };
}

export const dayTitle = formatDayTitle;
