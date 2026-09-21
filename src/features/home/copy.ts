import { parseLocalDate, wallClockMinutesAt, weekdayOf, type LocalDate } from '../../domain/logicalDay';
import type { HomeItem, HomeSectionKey, RecurrenceFact } from './model/types';
import type { HomeRefusal } from './model/mutations';

/**
 * EVERY USER-FACING CLAIM HOME MAKES, in one place.
 *
 * Each fact a row states carries a `code` that names the canonical evidence behind it, so the copy audit can check, mechanically,
 * that a strong word ("covered", "scheduled", "done") appears only where the record proves it. The words that would claim more
 * than Home can know — fixed, repaired, safe, verified, resolved, handled, "all clear" — are allowed ONLY inside an explicit
 * "not known" statement (`NOT_A_CLAIM`), never as an assertion.
 *
 * Nothing here says or implies that an empty Home means an all-clear at the house.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(date: LocalDate): string {
  const { month, day } = parseLocalDate(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)]}, ${MONTHS[month - 1]} ${day}`;
}

export function formatTime(epochMs: number, timeZone: string): string {
  const minutes = wallClockMinutesAt(epochMs, timeZone);
  const hour = Math.floor(minutes / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** "every 3 months", "every week on Tuesday". A description of the RULE only; it says nothing about what has been done. */
export function describeRepeat(rule: NonNullable<RecurrenceFact['rule']>): string {
  const n = rule.interval;
  const plural = (unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`);
  let every: string;
  switch (rule.frequency) {
    case 'daily':
      every = plural('day');
      break;
    case 'weekly': {
      every = plural('week');
      if (n === 1 && rule.byWeekday !== null && rule.byWeekday.length > 0) every += ` on ${[...rule.byWeekday].sort((a, b) => a - b).map((d) => WEEKDAYS_LONG[d]).join(', ')}`;
      break;
    }
    case 'monthly':
      every = plural('month');
      if (n === 1 && rule.byMonthDay !== null) every += ` on the ${ordinal(rule.byMonthDay)}`;
      break;
    case 'yearly':
      every = plural('year');
      break;
    default:
      every = '';
  }
  if (rule.trigger === 'after_completion') return every === '' ? 'after each time it’s done' : `${every} after it’s done`;
  if (rule.trigger === 'manual') return 'when you start it';
  return every;
}

export const SECTION_TITLE: Record<HomeSectionKey, string> = {
  attention: 'Needs attention',
  waiting: 'Waiting on someone',
  comingUp: 'Coming up',
  unresolved: 'Unresolved',
  repeats: 'Repeats',
  recentlyDone: 'Recently marked done',
  pastVisits: 'Past visits',
};

/** One line under a section title saying what the section is, in the terms of the evidence behind it. */
export const SECTION_NOTE: Record<HomeSectionKey, string> = {
  attention: 'Past due, due today or soon, or a request nobody has answered.',
  waiting: 'Someone else was asked, and it isn’t finished.',
  comingUp: 'Dated in the next two weeks, and visits.',
  unresolved: 'Saved, not marked done, and nothing dated soon.',
  repeats: 'Rules and routines. The rule says what’s expected; it doesn’t say it was done.',
  recentlyDone: 'You marked these done in the last 30 days.',
  pastVisits: 'Her Keys doesn’t know whether these happened.',
};

// ------------------------------------------------------------------------------------------------------- screen states

export const HOME_COPY = {
  /** What the screen is, and the boundary of what it can say. */
  scope: (label: string) => `What’s saved in Her Keys under ${label}. It can’t see the house itself.`,
  loading: { label: 'Loading Home…', detail: 'Home can’t say anything until your saved household has loaded.' },
  empty: {
    // Two different truths: nothing is saved at all, or things are saved but none is open.
    title: (label: string, anySaved: boolean) => (anySaved ? `Nothing open under ${label} right now` : `Nothing is saved under ${label} yet`),
    body: (anySaved: boolean) =>
      `${anySaved ? 'Older completed and removed items aren’t listed here. ' : ''}Her Keys only knows what you’ve added. An empty list doesn’t mean nothing at home needs attention.`,
    action: 'Add something',
  },
  archived: {
    title: 'Your Home area is archived',
    body: 'Everything saved under it is still here. New items can’t be added until it’s restored.',
    action: 'Restore Home area',
  },
  missing: {
    title: 'Home isn’t set up on this device',
    body: 'Her Keys can’t find the Home area here, so it can’t say what belongs to it. That says nothing about the house itself.',
  },
  unrecovered: (reason: string, quarantined: boolean) => {
    const cause =
      reason === 'future_version'
        ? 'This household was saved by a newer version of Her Keys, so it can’t be read here. Update the app to see it.'
        : reason === 'read_failed'
          ? 'Her Keys couldn’t read its saved data on this device.'
          : reason === 'mode_mismatch'
            ? 'The saved data belongs to a different mode of Her Keys, so it isn’t shown here.'
            : 'Her Keys couldn’t read the saved household on this device and started fresh.';
    const kept = quarantined ? ' The earlier data was kept aside, not deleted.' : '';
    return { title: 'Home can’t show what was saved', body: `${cause}${kept} What you see here says nothing about the house itself.` };
  },
  memoryOnly: 'Changes made now may not be saved on this device.',
  addTask: 'Add a task',
  addVisit: 'Add a visit',
  showAll: (count: number) => `Show all ${count}`,
  showLess: 'Show fewer',
  openSystems: 'Open in Systems',
  systemsNote: 'Routines are managed in Systems.',
  saveFailed: 'Her Keys couldn’t save that yet. Try again.',
} as const;

export const REFUSAL_COPY: Record<HomeRefusal | 'not_saved', string> = {
  no_home_context: 'Home isn’t set up on this device, so nothing can be added to it.',
  context_archived: 'Your Home area is archived. Restore it to add new items.',
  not_found: 'That isn’t here any more.',
  not_a_home_record: 'That doesn’t belong to Home, so it can’t be changed here.',
  invalid_input: 'Something in that isn’t valid. Check the title, dates and numbers.',
  stale: 'This changed somewhere else while you were editing. Reload to see the latest, then make your change again.',
  wrong_state: 'That can’t be done from where it stands now.',
  already_delegated: 'Someone already has this. Take it back first to ask somebody else.',
  invalid_holder: 'That person isn’t available to ask.',
  nothing_to_answer: 'There’s nothing waiting on an answer here.',
  refused: 'That couldn’t be done.',
  not_saved: HOME_COPY.saveFailed,
};

export const ACTION_LABEL = {
  edit: 'Edit',
  mark_done: 'Mark done',
  due_again: 'It’s due again',
  remove: 'Remove',
  ask_someone: 'Ask someone',
  record_seen: 'They’ve seen it',
  record_accepted: 'They said yes',
  record_declined: 'They said no',
  take_back: 'Take it back',
  stop_repeating: 'Stop repeating',
  open_systems: HOME_COPY.openSystems,
} as const;

// -------------------------------------------------------------------------------------------------------------- row facts

export type FactTone = 'plain' | 'attention' | 'muted';

/** One stated fact, with the evidence code that justifies its wording. */
export interface Fact {
  code: string;
  text: string;
  tone: FactTone;
}

/**
 * Codes whose text may contain a word Home would otherwise never assert (fixed, repaired, safe, verified, resolved, handled…),
 * because the text is a statement that Home does NOT know that thing.
 */
export const NOT_A_CLAIM: readonly string[] = ['condition_not_verified', 'visit_outcome_unknown', 'provider_not_verified', 'empty_scope', 'section_note'];

export interface RowCopy {
  title: string;
  facts: Fact[];
  accessibilityLabel: string;
}

export interface CopyContext {
  today: LocalDate;
  timeZone: string;
}

const first = <T>(list: readonly T[]): T | undefined => list[0];

function timingFacts(item: HomeItem, context: CopyContext): Fact[] {
  const facts: Fact[] = [];
  for (const timing of item.timing) {
    if (timing.kind === 'due') {
      if (timing.when === 'overdue') facts.push({ code: 'due_overdue', text: `Overdue — was due ${formatDate(timing.date)}`, tone: 'attention' });
      else if (timing.when === 'today') facts.push({ code: 'due_today', text: 'Due today', tone: 'attention' });
      else if (timing.when === 'tomorrow') facts.push({ code: 'due_tomorrow', text: 'Due tomorrow', tone: 'plain' });
      else facts.push({ code: 'due_later', text: `Due ${formatDate(timing.date)}`, tone: 'plain' });
    } else if (timing.kind === 'planned') {
      // DUE != SCHEDULED: a plan is a separate fact from a due date, and is worded as one.
      if (timing.when === 'earlier') facts.push({ code: 'planned_earlier', text: `Was planned for ${formatDate(timing.date)}`, tone: 'plain' });
      else if (timing.when === 'today') facts.push({ code: 'planned_today', text: 'Planned for today', tone: 'plain' });
      else if (timing.when === 'tomorrow') facts.push({ code: 'planned_tomorrow', text: 'Planned for tomorrow', tone: 'plain' });
      else facts.push({ code: 'planned_later', text: `Planned for ${formatDate(timing.date)}`, tone: 'plain' });
    } else {
      const window = `${formatTime(Date.parse(timing.startsAt), context.timeZone)}–${formatTime(Date.parse(timing.endsAt), context.timeZone)}`;
      if (timing.when === 'now') facts.push({ code: 'visit_now', text: `Scheduled now, ${window}`, tone: 'plain' });
      else if (timing.when === 'today') facts.push({ code: 'visit_scheduled', text: `Scheduled today, ${window}`, tone: 'plain' });
      else if (timing.when === 'tomorrow') facts.push({ code: 'visit_scheduled', text: `Scheduled tomorrow, ${window}`, tone: 'plain' });
      else if (timing.when === 'later') facts.push({ code: 'visit_scheduled', text: `Scheduled ${formatDate(timing.date)}, ${window}`, tone: 'plain' });
      else facts.push({ code: 'visit_outcome_unknown', text: `${timing.when === 'earlier_today' ? 'Earlier today' : formatDate(timing.date)}, ${window}. Her Keys doesn’t know whether this happened.`, tone: 'muted' });
    }
  }
  if (item.canonicalKind === 'task' && item.resolutionState === 'unresolved' && item.unknownFacts.includes('no_due_date')) facts.push({ code: 'no_due_date', text: 'No due date', tone: 'muted' });
  return facts;
}

function attentionFacts(item: HomeItem): Fact[] {
  const facts: Fact[] = [];
  for (const attention of item.attentionFacts) {
    if (attention.reason === 'unacknowledged_delegation') {
      const name = item.responsibility.holder?.name ?? 'them';
      facts.push({ code: 'attention_no_answer', text: `No answer yet from ${name}`, tone: 'attention' });
    } else if (attention.reason === 'risk') {
      facts.push({ code: 'attention_high_consequence', text: 'You marked this high-consequence, and it’s due', tone: 'attention' });
    } else if (attention.reason === 'external_source_changed') {
      facts.push({ code: 'attention_source_changed', text: 'The source of this changed after it was last updated', tone: 'attention' });
    }
  }
  return facts;
}

function responsibilityFacts(item: HomeItem): Fact[] {
  const r = item.responsibility;
  const name = r.holder?.name ?? 'Someone';
  switch (r.coverage) {
    case 'asked':
      return [{ code: 'coverage_asked', text: `Asked ${name} — no answer yet`, tone: 'plain' }];
    case 'no_answer':
      return []; // stated once, by the attention fact
    case 'seen':
      return [{ code: 'coverage_seen', text: `${name} has seen this — hasn’t said yes`, tone: 'plain' }];
    case 'accepted_needs_you':
      return [{ code: 'coverage_accepted_needs_you', text: `${name} said yes — it still needs you`, tone: 'plain' }];
    case 'covered':
      return [{ code: 'coverage_covered', text: `${name} said yes, and you’ve marked it as not needing you`, tone: 'plain' }];
    case 'declined':
      return [{ code: 'coverage_declined', text: `${name} said no — it’s yours again`, tone: 'plain' }];
    case 'returned':
      return [{ code: 'coverage_returned', text: 'Taken back — it’s yours again', tone: 'plain' }];
    case 'reported_finished':
      return [{ code: 'coverage_reported_finished', text: `${name} said they finished their part${r.completedAt ? ` (${formatDate(r.completedAt.slice(0, 10))})` : ''}`, tone: 'plain' }];
    default:
      return [];
  }
}

function dependencyFacts(item: HomeItem): Fact[] {
  const d = item.dependency;
  if (d.readiness === 'blocked') {
    const pending = d.prerequisites.filter((p) => p.standing === 'pending');
    const head = first(pending);
    if (head === undefined) return [];
    const more = pending.length > 1 ? ` and ${pending.length - 1} more` : '';
    return [{ code: 'dependency_waiting', text: `Needs “${head.title}”${more} first`, tone: 'plain' }];
  }
  if (d.readiness === 'needsReview') {
    const gone = d.prerequisites.filter((p) => p.standing === 'unavailable');
    const head = first(gone);
    if (head === undefined) return [];
    const why = head.cause === 'retired' ? 'was set aside' : 'is no longer here';
    // REMOVED != COMPLETED: an unavailable prerequisite is never presented as met.
    return [{ code: 'dependency_unavailable', text: `Needs review — “${head.title}” ${why}`, tone: 'attention' }];
  }
  return [];
}

function durationFacts(item: HomeItem): Fact[] {
  if (item.resolutionState !== 'unresolved' || item.duration.kind !== 'task') return [];
  const { minutes, knowledge } = item.duration;
  switch (knowledge) {
    case 'user-provided':
      return [{ code: 'duration_user', text: formatMinutes(minutes), tone: 'plain' }];
    case 'default-estimate':
      return [{ code: 'duration_default', text: `About ${formatMinutes(minutes)} (planning estimate, not from you)`, tone: 'muted' }];
    case 'inferred-estimate':
      return [{ code: 'duration_inferred', text: `About ${formatMinutes(minutes)} (estimated by Her Keys)`, tone: 'muted' }];
    default:
      // UNKNOWN != ZERO: an unrecorded duration is said to be unrecorded, and its stored number is not shown as fact.
      return [{ code: 'duration_unrecorded', text: 'Duration not recorded', tone: 'muted' }];
  }
}

function recurrenceFacts(item: HomeItem): Fact[] {
  const r = item.recurrence;
  if (r.rule === null) return [];
  if (r.state === 'ended') return [];
  const facts: Fact[] = [];
  const paused = r.state === 'paused';
  facts.push({ code: paused ? 'repeat_paused' : 'repeat_rule', text: paused ? `Repeat paused (${describeRepeat(r.rule)})` : `Repeats ${describeRepeat(r.rule)}`, tone: 'plain' });
  if (r.nextExpected !== null) facts.push({ code: 'next_expected', text: `Next expected ${formatDate(r.nextExpected)}`, tone: 'plain' });
  return facts;
}

function lastDoneFacts(item: HomeItem): Fact[] {
  if (!item.lastDoneApplicable) return [];
  if (item.lastDone !== null) return [{ code: 'last_done', text: `Marked done ${formatDate(item.lastDone.date)}`, tone: 'plain' }];
  const repeats = item.recurrence.state === 'active' || item.recurrence.state === 'paused';
  // NO COMPLETION RECORD != NEVER DONE: absence of evidence is said as exactly that.
  if (repeats || item.canonicalKind === 'system') return [{ code: 'no_completion_recorded', text: 'No completion recorded', tone: 'muted' }];
  return [];
}

function conditionFacts(item: HomeItem): Fact[] {
  const facts: Fact[] = [];
  // TASK COMPLETED != CONDITION VERIFIED: said out loud wherever something is marked done.
  if (item.unknownFacts.includes('condition_not_verified')) facts.push({ code: 'condition_not_verified', text: 'Her Keys doesn’t check that the problem is actually fixed', tone: 'muted' });
  if (item.unknownFacts.includes('provider_not_verified')) facts.push({ code: 'provider_not_verified', text: 'Her Keys hasn’t verified who’s qualified for this', tone: 'muted' });
  return facts;
}

/**
 * The stated facts for one row, in the order they matter, and the screen-reader sentence built from the SAME facts — so what a
 * screen reader says can never be stronger than what the screen shows.
 */
export function describeItem(item: HomeItem, context: CopyContext): RowCopy {
  const facts: Fact[] = [
    ...attentionFacts(item),
    ...timingFacts(item, context),
    ...dependencyFacts(item),
    ...responsibilityFacts(item),
    ...recurrenceFacts(item),
    ...lastDoneFacts(item),
    ...durationFacts(item),
    ...conditionFacts(item),
  ];
  if (item.canonicalKind === 'event' && item.location) facts.push({ code: 'visit_location', text: item.location, tone: 'muted' });
  const kind = item.canonicalKind === 'event' ? 'Visit' : item.canonicalKind === 'system' ? 'Routine' : 'Task';
  const sentence = facts.map((fact) => spoken(fact.text)).join('. ');
  return { title: item.title, facts, accessibilityLabel: `${kind}: ${item.title}.${sentence === '' ? '' : ` ${sentence}.`}` };
}

/** How a stated fact reads aloud: a dash used for the eye becomes a comma, so a screen reader never says "Sam , no answer". */
export const spoken = (text: string): string =>
  text
    .replace(/(\d{1,2}:\d{2} [AP]M)–(\d{1,2}:\d{2} [AP]M)/g, '$1 to $2')
    .replace(/\s[—–]\s/g, ', ');

/** Words Home may never ASSERT. They may appear only in a fact whose code is in `NOT_A_CLAIM`. */
export const NEVER_ASSERTED = /\b(fixed|repaired|safe|safely|verified|resolved|handled|all clear|all set|caught up|nothing needs attention|nothing to worry|never done|no problems?|is fine|are fine)\b/i;
