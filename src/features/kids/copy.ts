import type { AddChildRefusal } from '../../domain/children';
import type { EditOutcome, EventDraftError, HandoffOutcome, ResponseOutcome, TaskDraftError } from './mutations';
import { clockText, dayPhrase, momentAt, parseClockInput, rangeText, resolveWallTime } from './time';
import type { AttentionEntry, CoverageState, DurationFact, ItemFact, PlanFact, PlanLabel, ResponsibilityFacts } from './types';
import { isLocalDate, type LocalDate } from '../../domain/logicalDay';

/**
 * EVERY WORD KIDS SAYS ABOUT A CHILD'S SITUATION (HK-FEATURE-05).
 *
 * Copy is chosen from the semantic codes of the projection, in one place, so that each claim can be audited against the canonical fact
 * that supports it (`tests/kids/copyTruth.test.mjs`). JSX picks no words of its own about state. Tone: calm, capable, adult, specific,
 * never judging. Nothing here says "you forgot", "you should have" or "stay on top of".
 *
 * The strict words and the only states allowed to use them:
 *   covered / handled / off your list   accepted by an active person AND marked as no longer needing her   (`covered`)
 *   accepted / said yes                 the foundation's `accepted` state
 *   asked / seen                        `requested` / `acknowledged`
 *   PLAN IN PLACE                       the same evidence as `covered`, on a commitment; never on a task that was only created
 *   estimate / not confirmed            a duration that is not `user`
 */

const soft = (phrase: string): string => (phrase === 'Today' || phrase === 'Tomorrow' || phrase === 'Yesterday' ? phrase.toLowerCase() : phrase);

// ---------------------------------------------------------------- when / due ---

export function whenPhrase(item: ItemFact, today: LocalDate): string | null {
  const at = item.schedule;
  if (at === null) return null;
  if (at.kind === 'day') return `Planned ${soft(dayPhrase(at.localDate, today))}`;
  const start = { localDate: at.localDate, minutesOfDay: at.startMinutes };
  const end = at.endMinutes === null || at.endsLocalDate === null ? null : { localDate: at.endsLocalDate, minutesOfDay: at.endMinutes };
  return `${dayPhrase(at.localDate, today)}, ${rangeText(start, end)}`;
}

/** A deadline is not a plan: it says "due", never "scheduled". */
export function duePhrase(date: LocalDate, today: LocalDate): string {
  return `${date < today ? 'Was due' : 'Due'} ${soft(dayPhrase(date, today))}`;
}

export function minutesText(minutes: number): string {
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? '1 hour' : `${hours} hours`;
  return rest === 0 ? h : `${h} ${rest} minutes`;
}

/**
 * Only a length she gave says so plainly. A default, a Her Keys estimate and a length nobody recorded the origin of each say what they are.
 */
export function durationPhrase(duration: DurationFact): string {
  switch (duration.knowledge) {
    case 'user-provided':
      return minutesText(duration.minutes);
    case 'default-estimate':
      return `About ${minutesText(duration.minutes)} (an estimate)`;
    case 'inferred-estimate':
      return `About ${minutesText(duration.minutes)} (Her Keys estimated)`;
    case 'unrecorded':
      return `About ${minutesText(duration.minutes)} (not confirmed)`;
  }
}

// ------------------------------------------------------------ responsibility ---

const nameOf = (r: ResponsibilityFacts): string => r.holder?.displayName.trim() || 'They';

export interface CoverageTag {
  label: string;
  tone: 'neutral' | 'attention' | 'success';
}

/** A short, text-first label. Color is only ever a second signal. */
export function coverageTag(coverage: CoverageState): CoverageTag | null {
  switch (coverage) {
    case 'covered':
      return { label: 'Covered', tone: 'success' };
    case 'accepted_still_yours':
      return { label: 'Accepted · still yours', tone: 'neutral' };
    case 'asked_no_answer':
      return { label: 'Asked · no answer', tone: 'neutral' };
    case 'seen_not_accepted':
      return { label: 'Seen · not accepted', tone: 'neutral' };
    case 'reply_overdue':
      return { label: 'No reply', tone: 'attention' };
    case 'declined':
      return { label: 'Said no', tone: 'attention' };
    case 'handed_back':
      return { label: 'Back with you', tone: 'attention' };
    case 'holder_unavailable':
      return { label: 'Person unavailable', tone: 'attention' };
    case 'held_by_child':
      return { label: 'Held by a child', tone: 'neutral' };
    case 'finished':
      return { label: 'Marked finished', tone: 'neutral' };
    case 'nobody_recorded':
      return null;
  }
}

export function coverageLine(r: ResponsibilityFacts): string {
  const who = nameOf(r);
  switch (r.coverage) {
    case 'covered':
      return `${who} said yes, and it's marked as off your list.`;
    case 'accepted_still_yours':
      return `${who} said yes. It's marked as still needing you.`;
    case 'asked_no_answer':
      return `You asked ${who}. Nothing is recorded back yet.`;
    case 'seen_not_accepted':
      return `${who} has seen this but hasn't said yes.`;
    case 'reply_overdue':
      return `You asked ${who} and haven't heard back.`;
    case 'declined':
      return `${who} said no. It's back with you.`;
    case 'handed_back':
      return "It was handed back to you.";
    case 'holder_unavailable':
      return `${who} is no longer on your list of people. This needs someone to take it.`;
    case 'held_by_child':
      return `${who} is listed as responsible.`;
    case 'finished':
      return `${who} marked their part finished.`;
    case 'nobody_recorded':
      return 'Nobody is recorded as handling this.';
  }
}

// ------------------------------------------------------------------ fallback ---

export const PLAN_LABEL: Record<PlanLabel, string> = {
  PLAN_IN_PLACE: 'Plan in place',
  NEEDS_A_PLAN: 'Needs a plan',
  NOT_ENOUGH_KNOWN: 'Not enough known',
};

export const PLAN_TONE: Record<PlanLabel, 'success' | 'attention' | 'neutral'> = {
  PLAN_IN_PLACE: 'success',
  NEEDS_A_PLAN: 'attention',
  NOT_ENOUGH_KNOWN: 'neutral',
};

/** Shown with every fallback surface. Planning only: nothing here says a school, court or doctor recognises anyone. */
export const NOT_AUTHORIZATION =
  "Her Keys helps you plan. It doesn't check what a school, a court or a doctor recognizes.";

export const PLAN_SECTION_TITLE = 'If the plan changes';
export const PLAN_SECTION_INTRO = 'What is arranged around each upcoming item, and what still needs someone.';

export function planReasonLine(plan: PlanFact): string {
  const who = plan.relies?.displayName.trim() || 'They';
  switch (plan.reason) {
    case 'accepted_and_off_your_list':
      return `${who} said yes, and it's marked as off your list. Her Keys doesn't know whether ${who} is free that day.`;
    case 'declined':
      return `${who} said no.`;
    case 'handed_back':
      return 'It was handed back to you.';
    case 'holder_unavailable':
      return `${who} is no longer on your list of people.`;
    case 'reply_overdue':
      return `You asked ${who} and haven't heard back.`;
    case 'awaiting_answer':
      return `You asked ${who}. Nothing is recorded back yet.`;
    case 'seen_not_accepted':
      return `${who} has seen this but hasn't said yes.`;
    case 'accepted_still_yours':
      return `${who} said yes, and it still needs you.`;
    case 'held_by_child':
      return `${who} is listed as responsible.`;
    case 'finished':
      return `${who} marked their part finished.`;
    case 'nothing_recorded':
      return 'Nobody is recorded as handling this.';
  }
}

export const PLAN_STEP_ACTION = 'Add a step to sort this out';
export const planStepTitle = (commitmentTitle: string): string => `Arrange backup for ${commitmentTitle}`.slice(0, 200);
export const openStepLabel = (title: string): string => `Open step: ${title}`;

// ----------------------------------------------------------------- attention ---

export function attentionLine(entry: AttentionEntry, today: LocalDate): string {
  switch (entry.code) {
    case 'deadline':
      return entry.date === null ? 'Has a deadline.' : `${duePhrase(entry.date, today)}.`;
    case 'risk':
      return 'Marked high-stakes, due, and not accepted by anyone.';
    case 'unacknowledged_delegation':
      return "You asked and haven't heard back.";
    case 'external_source_changed':
      return 'Something it is linked to changed.';
    case 'approval_required':
      return 'Waiting on your decision.';
    case 'not_accepted':
      return "Hasn't been accepted yet.";
    case 'handed_back':
      return 'Handed back to you.';
    case 'holder_unavailable':
      return 'The person it was given to is no longer on your list.';
    case 'prerequisite_unavailable':
      return 'Something this needed is no longer available.';
  }
}

export function dependencyLine(item: ItemFact): string | null {
  const dep = item.dependency;
  if (dep === null || dep.readiness === 'ready') return null;
  if (dep.readiness === 'needsReview') return 'Something this needed is no longer available. Worth a look.';
  const first = dep.waitingOn[0]?.title;
  const more = dep.waitingOn.length - 1;
  if (!first) return 'Waiting on something else.';
  return more > 0 ? `Waiting on "${first}" and ${more} more.` : `Waiting on "${first}".`;
}

// ------------------------------------------------------------------- screens ---

export const HUB = {
  intro: "What's going on with each of your children.",
  emptyTitle: 'Your children will show up here',
  emptyBody: 'Add a child and Her Keys can hold their practices, forms and pickups in one place.',
  addChild: 'Add a child',
  // Shown only for a household that belongs to a different account than the one signed in (it is kept, never shown or changed).
  addChildUnavailable: 'This household belongs to another account, so nothing can be added to it here.',
  noRecords: 'Nothing recorded yet.',
  nothingComing: 'Nothing coming up is recorded.',
  unattributed: (n: number) =>
    n === 1 ? "1 item names a child that isn't in your household, so it isn't shown under anyone." : `${n} items name a child that isn't in your household, so they aren't shown under anyone.`,
  mismatch: 'This screen was opened for a different household. Nothing is shown.',
} as const;

export const nextLine = (item: ItemFact, today: LocalDate): string => {
  const when = whenPhrase(item, today);
  return when === null ? `Next: ${item.title}` : `Next: ${item.title} · ${when}`;
};

export function cardTags(card: { needsYouCount: number; waitingOnOthersCount: number; planGapCount: number }): CoverageTag[] {
  const tags: CoverageTag[] = [];
  if (card.needsYouCount > 0) tags.push({ label: `${card.needsYouCount} need you`, tone: 'attention' });
  if (card.waitingOnOthersCount > 0) tags.push({ label: `${card.waitingOnOthersCount} waiting on someone`, tone: 'neutral' });
  if (card.planGapCount > 0) tags.push({ label: `${card.planGapCount} need a plan`, tone: 'attention' });
  return tags;
}

export const DETAIL = {
  next: 'Next',
  needsAttention: 'Needs attention',
  upcoming: 'Coming up',
  openWork: 'Open work',
  needsYou: 'Needs you',
  withSomeoneElse: 'With someone else',
  waiting: 'Waiting on something',
  nobodyRecorded: 'Nobody recorded',
  routines: 'Routines',
  nothingNext: 'Nothing scheduled is recorded.',
  showMore: (n: number) => `Show ${n} more`,
  showLess: 'Show fewer',
  addTask: 'Add a task',
  addEvent: 'Add an event',
  emptyChild: 'Nothing recorded for this child yet. Add a task or an event and it will show up here.',
  where: (place: string) => `At ${place}`,
  notRecorded: (parts: string[]) => `Not recorded: ${parts.join(', ')}.`,
  /** Her own words, shown as she wrote them. Kids adds no meaning to them and draws no conclusion from them. */
  notes: (text: string) => `Notes: ${text}`,
  preparation: (minutes: number) => `${minutesText(minutes)} to get ready`,
  travelBefore: (minutes: number) => `${minutesText(minutes)} to get there`,
  travelAfter: (minutes: number) => `${minutesText(minutes)} to get back`,
  repeats: 'Repeats',
} as const;

/** Unknowns worth naming beside the row. "Who's handling it" is already said by the coverage line, so it is not said twice. */
export const visibleUnknowns = (item: ItemFact): string[] => item.unknownFacts.filter((fact) => fact !== 'who_is_handling').map((fact) => UNKNOWN_LABEL[fact] ?? fact);

export const UNKNOWN_LABEL: Record<string, string> = {
  location: 'where',
  when: 'when',
  who_is_handling: "who's handling it",
  length_confirmed: 'a confirmed length',
};

// ----------------------------------------------------------------- the forms ---

export const FORM = {
  childTitle: 'Add a child',
  childName: 'Name',
  childBirth: 'Birth date (YYYY-MM-DD)',
  childSave: 'Add child',
  childWhy: 'Her Keys needs a name and a birth date to keep each child apart. Nothing else is asked.',
  taskTitle: 'Add a task',
  editTask: 'Edit task',
  eventTitle: 'Add an event',
  editEvent: 'Edit event',
  child: 'Child',
  title: 'Title',
  due: 'Due date (optional, YYYY-MM-DD)',
  minutes: 'Estimated minutes',
  minutesDefaultNote: "This is an estimate until you change it. It isn't something you told Her Keys.",
  minutesUnrecordedNote: "Nobody recorded where this length came from. Change it to make it yours.",
  minutesInferredNote: 'Her Keys estimated this length. Change it to make it yours.',
  notes: 'Notes (optional)',
  commitment: 'Commitment',
  flexible: 'Flexible',
  fixed: 'Fixed',
  date: 'Date (YYYY-MM-DD)',
  starts: 'Starts (for example 4:30 PM)',
  ends: 'Ends (for example 5:30 PM)',
  where: 'Where (optional)',
  save: 'Save changes',
  addTaskSave: 'Add task',
  addEventSave: 'Add event',
  markDone: 'Mark done',
  remove: 'Remove',
  removeTask: 'Remove task',
  removeEvent: 'Remove event',
  reload: 'Show the newer version',
  planStepFor: (title: string) => `A step toward "${title}". It does not mark the plan as in place.`,
} as const;

export const NOTICE = {
  stale: 'This changed while you were editing, so nothing was saved. The newer version is shown.',
  missing: "This isn't there any more, so nothing was saved.",
  saveFailed: "Her Keys couldn't save that yet. Try again.",
  unchanged: 'Nothing changed.',
  adjustedGap: (clock: string) => `That time doesn't exist that day, because the clocks move forward. It will be ${clock}.`,
  adjustedRepeated: 'That time happens twice that day, because the clocks move back. It will be the first one.',
} as const;

const TASK_ERRORS: Record<TaskDraftError | 'link_refused', string> = {
  no_child: 'Choose which child this is for.',
  unknown_child: "That child isn't in your household.",
  blank_title: 'Give it a title.',
  title_too_long: 'That title is too long.',
  bad_due_date: 'Due date should look like YYYY-MM-DD, or be left blank.',
  bad_duration: 'Estimated minutes should be a whole number from 0 to 1440.',
  notes_too_long: 'Those notes are too long.',
  unknown_person: "That person isn't on your list.",
  unknown_parent: "What this is a step of isn't there any more.",
  no_category: 'Her Keys has no place to put this yet.',
  link_refused: "Her Keys couldn't attach this step, so nothing was added.",
};

const EVENT_ERRORS: Record<EventDraftError, string> = {
  no_child: 'Choose which child this is for.',
  unknown_child: "That child isn't in your household.",
  blank_title: 'Give it a title.',
  title_too_long: 'That title is too long.',
  bad_date: 'Date should look like YYYY-MM-DD.',
  bad_start_time: 'Start should look like 4:30 PM.',
  bad_end_time: 'End should look like 5:30 PM.',
  end_not_after_start: 'It should end after it starts, on the same day.',
  location_too_long: 'That place is too long.',
  notes_too_long: 'Those notes are too long.',
  unknown_person: "That person isn't on your list.",
  no_category: 'Her Keys has no place to put this yet.',
};

const CHILD_ERRORS: Record<AddChildRefusal, string> = {
  blank_name: "Give your child's name.",
  name_too_long: 'That name is too long.',
  bad_birth_date: 'Birth date should look like YYYY-MM-DD.',
  birth_date_in_future: "That date hasn't happened yet.",
  birth_date_too_early: 'That birth date looks too early. Check the year.',
  too_many_children: 'Her Keys holds up to 20 children.',
};

export const taskError = (code: TaskDraftError | 'link_refused'): string => TASK_ERRORS[code];
export const eventError = (code: EventDraftError): string => EVENT_ERRORS[code];
export const childError = (code: AddChildRefusal): string => CHILD_ERRORS[code];

export function editNotice(outcome: EditOutcome): string | null {
  if (outcome === 'stale') return NOTICE.stale;
  if (outcome === 'missing') return NOTICE.missing;
  if (outcome === 'unchanged') return NOTICE.unchanged;
  return null;
}

// -------------------------------------------------------------- responsibility ---

export const HANDOFF = {
  section: "Who's handling this",
  ask: 'Ask someone to take this',
  askNote: 'This records that you asked. Her Keys does not send anything.',
  choose: 'Choose someone',
  addSomeone: 'Someone new',
  name: 'Name',
  relationship: 'Who are they to you?',
  noPeople: 'No one is on your list yet. Add someone below.',
  askAction: (name: string) => `Ask ${name}`,
  askNewAction: 'Add them and ask',
  seen: (name: string) => `${name} has seen it`,
  saidYes: (name: string) => `${name} said yes`,
  saidNo: (name: string) => `${name} said no`,
  takeBack: 'Take it back',
  acceptQuestion: 'Does this still need you?',
  stillNeedsMe: 'Still needs me',
  offMyList: 'Off my list',
  acceptSave: 'Save',
  acceptCancel: 'Not now',
  acceptNote: "Choose one. Her Keys won't call it covered unless you say it's off your list.",
} as const;

export const RELATIONSHIP_LABEL: Record<string, string> = {
  'co-parent': 'Co-parent',
  partner: 'Partner',
  grandparent: 'Grandparent',
  caregiver: 'Caregiver',
  neighbor: 'Neighbor',
  contractor: 'Contractor',
  friend: 'Friend',
  other: 'Someone else',
};

export function handoffMessage(outcome: HandoffOutcome | ResponseOutcome): string | null {
  switch (outcome) {
    case 'requested':
    case 'recorded':
      return null;
    case 'already_held':
      return 'Somebody is already recorded as holding this.';
    case 'unknown_person':
      return "That person isn't on your list.";
    case 'blank_name':
      return "Give the person's name.";
    case 'name_too_long':
      return 'That name is too long.';
    case 'bad_relationship':
      return 'Choose who they are to you.';
    case 'not_applicable':
      return 'That has already been recorded, so nothing changed.';
    case 'not_a_child_item':
    case 'missing':
      return "This isn't there any more.";
  }
}

// ----------------------------------------------------------- accessibility ---

/** One composed label per row, so a screen reader reads identity, state and unknowns in a sensible linear order. */
export function itemAccessibilityLabel(item: ItemFact, childName: string, today: LocalDate, expanded = false): string {
  const parts = [`${item.ref.kind === 'event' ? 'Event' : 'Task'} for ${childName}`, item.title];
  const when = whenPhrase(item, today);
  if (when) parts.push(when);
  if (item.due) parts.push(duePhrase(item.due.date, today));
  if (item.duration) parts.push(durationPhrase(item.duration));
  if (item.where) parts.push(DETAIL.where(item.where));
  parts.push(coverageLine(item.responsibility));
  // The coverage line already gives the reason; the plan label is its short form.
  if (item.plan) parts.push(PLAN_LABEL[item.plan.label]);
  const dep = dependencyLine(item);
  if (dep) parts.push(dep);
  const unknown = visibleUnknowns(item);
  if (expanded && unknown.length > 0) parts.push(DETAIL.notRecorded(unknown));
  if (expanded && item.notes) parts.push(DETAIL.notes(item.notes));
  return parts.join('. ').replace(/\.\./g, '.');
}

/** What to tell her, as she types, when a wall-clock time falls in a daylight-saving change in the household's zone. */
export function timeHint(date: string, text: string, timeZone: string): string | null {
  const minutes = parseClockInput(text);
  if (minutes === null || !isLocalDate(date.trim())) return null;
  const resolved = resolveWallTime(date.trim(), minutes, timeZone);
  if (resolved.adjusted === 'gap') return NOTICE.adjustedGap(clockText(momentAt(resolved.epochMs, timeZone).minutesOfDay));
  if (resolved.adjusted === 'repeated') return NOTICE.adjustedRepeated;
  return null;
}
