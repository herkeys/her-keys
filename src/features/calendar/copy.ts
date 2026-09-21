import { formatClock, formatClockRange, formatDayTitle, formatMinutes, formatWeekdayShort, formatDayNumber } from './format';
import { REQUIRED_TRANSITION_BUFFER_MINUTES } from '../daily-load/computeDailyLoad';
import type { ActionPreview, PreviewableIntent } from './model/preview';
import type {
  CalendarDayViewModel,
  CapacityCategory,
  Conflict,
  ConflictType,
  Coverage,
  DayItem,
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
  why.push(`That leaves ${formatMinutes(narrow.slackMinutes)}. Her Keys looks for ${formatMinutes(REQUIRED_TRANSITION_BUFFER_MINUTES)} between commitments.`);
  return {
    label: 'Fits narrowly',
    sentence: `${a} to ${b} fits, with ${formatMinutes(narrow.slackMinutes)} to spare.`,
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

export function headlineFor(view: CalendarDayViewModel, ctx: CopyContext): Headline {
  if (view.dayMode === 'past') return { kind: 'past', text: COPY.pastDay, more: 0 };
  const state = view.capacityState;
  const listed = view.conflicts;

  // The headline says WHAT KIND of problem there is; the cards below say which commitments. It never repeats a card’s sentence.
  if (listed.length === 1) return { kind: 'problem', text: HEADLINE_BY_TYPE[listed[0].type], more: 0 };
  if (listed.length > 1) return { kind: 'problem', text: `${listed.length} things need a look.`, more: 0 };

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
          : `Moving ${title} to tomorrow would free about ${item === undefined || item.durationMinutes === null ? 'its time' : formatMinutes(item.durationMinutes)} today.`,
      primary: { label: 'Preview the move', intent: ref.kind === 'event' ? { kind: 'move_event', id: ref.id } : { kind: 'move_task', id: ref.id } },
      alternative: null,
      keep: 'timing',
      why: timingWhy,
    });
  }

  const shorten = offered('SHORTEN')[0];
  const drop = offered('DROP')[0];
  const pressure = view.capacityState?.pressure ?? null;
  const named = shorten ?? drop;
  if (named !== undefined && named.itemRef !== null && pressure !== null) {
    const ref = named.itemRef;
    const title = ctx.titleOf(ref);
    offers.push({
      key: `capacity:${ref.id}`,
      body: shorten !== undefined ? `Shortening ${title} would bring today back within what fits.` : `Dropping ${title} would bring today back within what fits.`,
      primary: shorten !== undefined ? { label: 'Preview shortening it', intent: { kind: 'shorten_task', id: ref.id } } : { label: 'Preview dropping it', intent: { kind: 'drop_task', id: ref.id } },
      alternative: shorten !== undefined && drop !== undefined ? { intent: { kind: 'drop_task', id: ref.id } } : null,
      keep: 'capacity',
      why: [`${formatMinutes(pressure.neededMinutes)} is planned.`, `${formatMinutes(pressure.availableMinutes)} is available in the household day.`, `That is ${formatMinutes(pressure.pressureMinutes)} more than fits.`],
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
    const before = preview.before.dayItems.find((item) => item.ref.id === id)?.durationMinutes;
    const after = preview.after.dayItems.find((item) => item.ref.id === id)?.durationMinutes;
    lines.push(before != null && after != null ? `${title} would go from about ${formatMinutes(before)} to about ${formatMinutes(after)}.` : `${title} would be shortened.`);
  } else if (intent.kind === 'drop_task') {
    lines.push(`${title} would be removed from your task list. It can’t be restored here.`);
  } else {
    lines.push(`${title} would become fixed. Her Keys would stop suggesting to move, shorten or drop it. You can change it back by editing it.`);
  }

  const before = preview.before.capacityState;
  const after = preview.after.capacityState;
  if (before !== null && after !== null) {
    lines.push(before.category === after.category ? `Today would stay ${CATEGORY_WORD(after.category)}.` : `Today would go from ${CATEGORY_WORD(before.category)} to ${CATEGORY_WORD(after.category)}.`);
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
  if (lines.length === 0 && summary.itemCount === 0) lines.push('Nothing scheduled');
  return { word: categoryLabel(summary.category), lines };
}

export const dayTitle = formatDayTitle;
