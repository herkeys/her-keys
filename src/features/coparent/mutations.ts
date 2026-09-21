import type { TransitionContext } from '../../domain/context';
import { addEvent, removeEvent, updateEvent } from '../../domain/events';
import { formatAmount, parseMoney } from '../../domain/foundation/money';
import type { HouseholdPerson } from '../../domain/foundation/responsibility';
import type { RecurrenceRule } from '../../domain/foundation/structure';
import { refKey, type TypedRef } from '../../domain/foundation/typedRef';
import { epochMsOf, isLocalDate, logicalDateAt, toInstant, weekdayOf, parseLocalDate } from '../../domain/logicalDay';
import {
  acknowledge,
  accept,
  addPerson,
  completeResponsibility,
  decline,
  delegate,
  liveResponsibilityFor,
  reassign,
  returnToSelf,
} from '../../domain/responsibility';
import { FIELD_LIMITS, type AppState, type CalendarEvent, type Task } from '../../domain/state';
import { addDependency, addRecurrence, removeDependency, setRecurrenceStatus } from '../../domain/structure';
import { addTask, archiveTask, completeTask, updateTask } from '../../domain/tasks';
import type { AppStore } from '../../state/appStore';
import { blockedReasons, coparentCategory } from './identity';
import { instantFromInput, localParts, parseTimeInput, timeInputOf } from './time';

/**
 * MUTATIONS — composition over canonical domain transitions, and nothing else.
 *
 * Every write here is an existing domain function (`addEvent`, `updateEvent`, `addPerson`, `delegate`, `accept`, `addRecurrence`,
 * `addDependency`, `addTask`, …) or a spread over an EXISTING row field that already syncs (`needsMePersonally`, `value`,
 * `stillNeedsMe`). No new entity, column, kind or policy, and no sync code: the store's change observer picks a changed row up like any
 * other. Each function returns a NAMED outcome — a refusal or a stale edit is never reported as success — and on any refusal the
 * ORIGINAL state comes back untouched, so a create is all-or-nothing inside one `store.commit`.
 *
 * Nothing here contacts anyone. "Record that you've asked X" writes what SHE says happened; it sends nothing.
 */

export interface MutationResult<O extends string> {
  state: AppState;
  outcome: O;
  /** The id of the row created or edited, when there is one. */
  id: string | null;
}

const refuse = <O extends string>(state: AppState, outcome: O): MutationResult<O> => ({ state, outcome, id: null });
const done = <O extends string>(state: AppState, outcome: O, id: string | null): MutationResult<O> => ({ state, outcome, id });

export type PersonRelationship = HouseholdPerson['relationship'];

export type CounterpartInput =
  | { kind: 'none' }
  | { kind: 'person'; personId: string }
  | { kind: 'new'; displayName: string; relationship: PersonRelationship };

export type RepeatChoice = 'none' | 'weekly' | 'every_2_weeks' | 'monthly' | 'keep';

export interface HandoffFields {
  childId: string;
  title: string;
  /** YYYY-MM-DD in the HOUSEHOLD zone. */
  date: string;
  /** 24-hour HH:MM in the household zone. */
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  commitment: 'fixed' | 'flexible';
  /** Her explicit answer: true / false / null (not recorded). Never defaulted. */
  needsMe: boolean | null;
  repeat: RepeatChoice;
}

export type HandoffOutcome =
  | 'saved'
  | 'unchanged'
  | 'no_category'
  | 'category_archived'
  | 'invalid_child'
  | 'invalid_title'
  | 'invalid_text'
  | 'invalid_date'
  | 'invalid_time'
  | 'invalid_counterpart'
  | 'missing'
  | 'removed'
  | 'not_a_handoff'
  | 'stale';

export const HANDOFF_OK: readonly HandoffOutcome[] = ['saved'];

// ------------------------------------------------------------------------------------------------------------- shared

const trimmed = (value: string) => value.trim();

/** A short, stable, non-cryptographic digest (FNV-1a, 32-bit) — enough to tell "the content changed", never a security boundary. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The REVISION of a handoff as an editor saw it: `updatedAt` plus a digest of every field the editor owns and of the recorded
 * schedule. A stale check that trusted `updatedAt` alone would miss two edits inside one clock tick (or across a skewed clock) and
 * let an old editor overwrite newer content; the digest decides by WHAT changed. Opaque: compare it, never parse it.
 */
export function handoffRevision(state: Pick<AppState, 'recurrences'>, event: CalendarEvent): string {
  const rule = state.recurrences.find((candidate) => candidate.about.kind === 'event' && candidate.about.id === event.id && candidate.status !== 'ended');
  const content = JSON.stringify([
    event.title, event.categoryId, event.subjectMemberId, event.startsAt, event.endsAt, event.location, event.notes, event.commitment,
    event.needsMePersonally, event.status,
    rule ? [rule.id, rule.status, rule.frequency, rule.interval, rule.byWeekday, rule.byMonthDay, rule.anchorDate, rule.timeOfDayMinutes] : null,
  ]);
  return `${event.updatedAt ?? ''}#${digest(content)}`;
}

/** The same for a follow-up task: `updatedAt` plus its editable fields and its amount. */
export function followUpRevision(task: Task): string {
  const content = JSON.stringify([task.title, task.categoryId, task.subjectMemberId, task.dueDate, task.notes, task.status, task.value]);
  return `${task.updatedAt ?? ''}#${digest(content)}`;
}

function requireCategory(state: AppState): { ok: true; categoryId: string } | { ok: false; outcome: 'no_category' | 'category_archived' } {
  const category = coparentCategory(state);
  if (category === null) return { ok: false, outcome: 'no_category' };
  if (category.status !== 'active') return { ok: false, outcome: 'category_archived' };
  return { ok: true, categoryId: category.id };
}

const isHandoff = (state: AppState, event: CalendarEvent): boolean => {
  const category = coparentCategory(state);
  return category !== null && event.categoryId === category.id;
};

/** A task belongs to this feature when it is in the co-parenting category, or an active co-parenting handoff requires it. */
function isCoparentTask(state: AppState, task: Task): boolean {
  const category = coparentCategory(state);
  if (category === null) return false;
  if (task.categoryId === category.id) return true;
  return state.dependencies.some(
    (edge) =>
      edge.status === 'active' &&
      edge.relation === 'requires' &&
      edge.to.kind === 'task' &&
      edge.to.id === task.id &&
      edge.from.kind === 'event' &&
      state.events.some((event) => event.id === edge.from.id && isHandoff(state, event))
  );
}

const isCoparentRef = (state: AppState, about: TypedRef): boolean => {
  if (about.kind === 'event') {
    const event = state.events.find((candidate) => candidate.id === about.id);
    return event !== undefined && isHandoff(state, event);
  }
  if (about.kind === 'task') {
    const task = state.tasks.find((candidate) => candidate.id === about.id);
    return task !== undefined && isCoparentTask(state, task);
  }
  return false;
};

function textIssue(fields: { title: string; location?: string; notes?: string }): 'invalid_title' | 'invalid_text' | null {
  const title = trimmed(fields.title);
  if (title.length === 0 || title.length > FIELD_LIMITS.titleLength) return 'invalid_title';
  if ((fields.location ?? '').trim().length > FIELD_LIMITS.locationLength) return 'invalid_text';
  if ((fields.notes ?? '').trim().length > FIELD_LIMITS.notesLength) return 'invalid_text';
  return null;
}

/** Resolve the person a counterpart choice names, creating one ONLY through the canonical `addPerson`. */
function resolvePerson(state: AppState, ctx: TransitionContext, input: CounterpartInput): { state: AppState; personId: string | null; ok: boolean } {
  if (input.kind === 'none') return { state, personId: null, ok: true };
  if (input.kind === 'person') {
    const person = state.people.find((candidate) => candidate.id === input.personId);
    return person && person.status === 'active' ? { state, personId: person.id, ok: true } : { state, personId: null, ok: false };
  }
  const name = trimmed(input.displayName);
  if (name.length === 0 || name.length > 80) return { state, personId: null, ok: false };
  const before = new Set(state.people.map((person) => person.id));
  const next = addPerson(state, ctx, { displayName: name, relationship: input.relationship, channel: 'unspecified' });
  const created = next.people.find((person) => !before.has(person.id));
  return created ? { state: next, personId: created.id, ok: true } : { state, personId: null, ok: false };
}

const setEventNeedsMe = (state: AppState, ctx: TransitionContext, eventId: string, value: boolean | null): AppState => ({
  ...state,
  events: state.events.map((event) => (event.id === eventId ? { ...event, needsMePersonally: value, updatedAt: toInstant(ctx.nowMs) } : event)),
});

// -------------------------------------------------------------------------------------------------------------- repeat

interface DesiredRule {
  frequency: 'weekly' | 'monthly';
  interval: number;
  byWeekday: number[] | null;
  byMonthDay: number | null;
}

function desiredRule(choice: Exclude<RepeatChoice, 'none' | 'keep'>, date: string): DesiredRule {
  if (choice === 'monthly') return { frequency: 'monthly', interval: 1, byWeekday: null, byMonthDay: parseLocalDate(date).day };
  return { frequency: 'weekly', interval: choice === 'every_2_weeks' ? 2 : 1, byWeekday: [weekdayOf(date)], byMonthDay: null };
}

function sameRule(rule: RecurrenceRule, want: DesiredRule, date: string, startMinutes: number, zone: string): boolean {
  return (
    rule.status === 'active' &&
    rule.trigger === 'schedule' &&
    rule.frequency === want.frequency &&
    rule.interval === want.interval &&
    JSON.stringify(rule.byWeekday === null ? null : [...rule.byWeekday].sort()) === JSON.stringify(want.byWeekday) &&
    rule.byMonthDay === want.byMonthDay &&
    rule.anchorDate === date &&
    rule.timeOfDayMinutes === startMinutes &&
    rule.endsOn === null &&
    rule.occurrenceCount === null &&
    rule.timezone === zone
  );
}

/**
 * Make the event's schedule rule match what she chose. A rule is REPLACED (the old one ends, a new one starts), never patched in
 * place, so the history of what she once recorded stays true. `keep` leaves a rule this feature did not write exactly as it is.
 */
function reconcileRepeat(state: AppState, ctx: TransitionContext, eventId: string, choice: RepeatChoice, date: string, startMinutes: number): AppState {
  if (choice === 'keep') return state;
  const about = { kind: 'event', id: eventId } as const;
  const existing = state.recurrences.filter((rule) => refKey(rule.about) === refKey(about) && rule.status !== 'ended');

  if (choice === 'none') {
    return existing.reduce((current, rule) => setRecurrenceStatus(current, ctx, rule.id, 'ended'), state);
  }
  const want = desiredRule(choice, date);
  if (existing.length === 1 && sameRule(existing[0], want, date, startMinutes, state.user.timezone)) return state;

  const cleared = existing.reduce((current, rule) => setRecurrenceStatus(current, ctx, rule.id, 'ended'), state);
  return addRecurrence(cleared, ctx, about, {
    trigger: 'schedule',
    frequency: want.frequency,
    interval: want.interval,
    byWeekday: want.byWeekday,
    byMonthDay: want.byMonthDay,
    anchorDate: date,
    timeOfDayMinutes: startMinutes,
  });
}

/** The choice a rule this feature could have written corresponds to; anything else is `keep` (shown as recorded, never rewritten). */
export function repeatChoiceOf(rule: RecurrenceRule | null | undefined): RepeatChoice {
  if (!rule || rule.status === 'ended') return 'none';
  if (rule.trigger !== 'schedule' || rule.endsOn !== null || rule.occurrenceCount !== null) return 'keep';
  if (rule.frequency === 'weekly' && rule.byWeekday !== null && rule.byWeekday.length === 1) {
    if (rule.interval === 1) return 'weekly';
    if (rule.interval === 2) return 'every_2_weeks';
  }
  if (rule.frequency === 'monthly' && rule.interval === 1 && rule.byMonthDay !== null) return 'monthly';
  return 'keep';
}

// ------------------------------------------------------------------------------------------------------ create a handoff

interface ParsedHandoff {
  startsAt: string;
  endsAt: string;
  startMinutes: number;
  title: string;
  location: string | null;
  notes: string | null;
}

function parseHandoff(state: AppState, fields: HandoffFields): { ok: true; value: ParsedHandoff } | { ok: false; outcome: HandoffOutcome } {
  if (!state.children.some((child) => child.id === fields.childId)) return { ok: false, outcome: 'invalid_child' };
  const text = textIssue(fields);
  if (text !== null) return { ok: false, outcome: text };
  if (!isLocalDate(fields.date)) return { ok: false, outcome: 'invalid_date' };
  const startMinutes = parseTimeInput(fields.startTime);
  const startsAt = instantFromInput(fields.date, fields.startTime, state.user.timezone);
  const endsAt = instantFromInput(fields.date, fields.endTime, state.user.timezone);
  if (startMinutes === null || startsAt === null || endsAt === null || epochMsOf(endsAt) <= epochMsOf(startsAt)) return { ok: false, outcome: 'invalid_time' };
  return {
    ok: true,
    value: { startsAt, endsAt, startMinutes, title: trimmed(fields.title), location: trimmed(fields.location) || null, notes: trimmed(fields.notes) || null },
  };
}

/**
 * Create a real, canonical, child-linked handoff: one `CalendarEvent` in the co-parenting category, owner-only scope, child by id,
 * with an optional counterpart (a recorded request), optional facet, optional recurrence — all or nothing.
 */
export function createHandoff(state: AppState, ctx: TransitionContext, fields: HandoffFields, counterpart: CounterpartInput): MutationResult<HandoffOutcome> {
  const category = requireCategory(state);
  if (!category.ok) return refuse(state, category.outcome);
  const parsed = parseHandoff(state, fields);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;

  const before = new Set(state.events.map((event) => event.id));
  let next = addEvent(state, ctx, {
    title: value.title,
    categoryId: category.categoryId,
    subjectMemberId: fields.childId,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    commitment: fields.commitment,
    location: value.location,
    notes: value.notes,
    // The most private scope there is. It is NOT sharing: `coparent-shared` is enforced owner-only.
    scope: 'coparent-shared',
  });
  const created = next.events.find((event) => !before.has(event.id));
  if (!created) return refuse(state, 'invalid_title');

  if (fields.needsMe !== null) next = setEventNeedsMe(next, ctx, created.id, fields.needsMe);

  const person = resolvePerson(next, ctx, counterpart);
  if (!person.ok) return refuse(state, 'invalid_counterpart');
  next = person.state;
  if (person.personId !== null) {
    const asked = delegate(next, ctx, { about: { kind: 'event', id: created.id }, to: { kind: 'person', id: person.personId }, ackWithinMinutes: null, stillNeedsMe: true });
    if (asked === next) return refuse(state, 'invalid_counterpart');
    next = asked;
  }

  next = reconcileRepeat(next, ctx, created.id, fields.repeat, fields.date, value.startMinutes);
  return done(next, 'saved', created.id);
}

// -------------------------------------------------------------------------------------------------------- edit a handoff

export interface EditHandoffInput {
  eventId: string;
  /**
   * The row's REVISION token when the editor was opened (`handoffEditorSeed(...).baseUpdatedAt`; `updatedAt` + a content digest).
   * If the row has moved since, the edit is refused as stale. Opaque: pass it back exactly as the seed gave it.
   */
  baseUpdatedAt: string | null;
  fields: HandoffFields;
}

/**
 * Edit only what the form owns: title, child (explicitly chosen), time, location, notes, commitment, her "needs me" answer and the
 * recorded schedule. It never touches the counterpart (that is a responsibility action), the scope or the status, and it refuses to
 * overwrite a row that changed after the editor was opened.
 */
export function editHandoff(state: AppState, ctx: TransitionContext, input: EditHandoffInput): MutationResult<HandoffOutcome> {
  const event = state.events.find((candidate) => candidate.id === input.eventId);
  if (!event) return refuse(state, 'missing');
  if (!isHandoff(state, event)) return refuse(state, 'not_a_handoff');
  if (event.status === 'removed') return refuse(state, 'removed');
  if (handoffRevision(state, event) !== input.baseUpdatedAt) return refuse(state, 'stale');

  const parsed = parseHandoff(state, input.fields);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;
  const { fields } = input;

  const patch: Partial<Pick<CalendarEvent, 'title' | 'subjectMemberId' | 'startsAt' | 'endsAt' | 'location' | 'notes' | 'commitment'>> = {};
  if (value.title !== event.title) patch.title = value.title;
  if (fields.childId !== event.subjectMemberId) patch.subjectMemberId = fields.childId;
  if (value.startsAt !== event.startsAt) patch.startsAt = value.startsAt;
  if (value.endsAt !== event.endsAt) patch.endsAt = value.endsAt;
  if (value.location !== event.location) patch.location = value.location;
  if (value.notes !== event.notes) patch.notes = value.notes;
  if (fields.commitment !== event.commitment) patch.commitment = fields.commitment;

  let next = state;
  if (Object.keys(patch).length > 0) next = updateEvent(next, ctx, event.id, patch);
  if (fields.needsMe !== event.needsMePersonally) next = setEventNeedsMe(next, ctx, event.id, fields.needsMe);

  // The recorded schedule is touched ONLY when she changed the repeat choice or moved the handoff itself. Fixing a typo in the title
  // must never re-anchor a pattern she recorded (that would change a recurrence she did not ask to change).
  const rule = state.recurrences.find((candidate) => refKey(candidate.about) === refKey({ kind: 'event', id: event.id }) && candidate.status !== 'ended');
  const scheduleTouched = fields.repeat !== repeatChoiceOf(rule) || value.startsAt !== event.startsAt;
  if (scheduleTouched) next = reconcileRepeat(next, ctx, event.id, fields.repeat, fields.date, value.startMinutes);

  return next === state ? refuse(state, 'unchanged') : done(next, 'saved', event.id);
}

/** Remove a handoff. Removed is not completed and does not say it did not happen. */
export function removeHandoff(state: AppState, ctx: TransitionContext, eventId: string): MutationResult<HandoffOutcome> {
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!event) return refuse(state, 'missing');
  if (!isHandoff(state, event)) return refuse(state, 'not_a_handoff');
  if (event.status === 'removed') return refuse(state, 'removed');
  return done(removeEvent(state, ctx, eventId), 'saved', eventId);
}

/**
 * The values the editor opens with, read back from the row — so an edit starts from the truth, not from a default.
 * A handoff with NO child recorded opens with the child unchosen (`''`): choosing one is exactly how she repairs it, so the editor
 * must open, and `editHandoff` refuses to save until a real child is chosen (`invalid_child`). Nothing is guessed.
 */
export function handoffEditorSeed(state: AppState, eventId: string): { fields: HandoffFields; baseUpdatedAt: string | null } | null {
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!event) return null;
  const zone = state.user.timezone;
  const start = localParts(epochMsOf(event.startsAt), zone);
  const end = localParts(epochMsOf(event.endsAt), zone);
  const rule = state.recurrences.find((candidate) => refKey(candidate.about) === refKey({ kind: 'event', id: eventId }) && candidate.status !== 'ended');
  return {
    baseUpdatedAt: handoffRevision(state, event),
    fields: {
      childId: event.subjectMemberId ?? '',
      title: event.title,
      date: start.localDate,
      startTime: timeInputOf(start.minutesOfDay),
      endTime: timeInputOf(end.minutesOfDay),
      location: event.location ?? '',
      notes: event.notes ?? '',
      commitment: event.commitment,
      needsMe: event.needsMePersonally,
      repeat: repeatChoiceOf(rule),
    },
  };
}

// --------------------------------------------------------------------------------------------- counterpart & responsibility

export type ResponsibilityOutcome =
  | 'saved'
  | 'missing'
  | 'not_a_coparent_record'
  | 'already_recorded'
  | 'invalid_counterpart'
  | 'counterpart_unavailable'
  | 'not_allowed';

export type AnswerChoice = 'acknowledged' | 'accepted_covered' | 'accepted_needs_me' | 'declined' | 'completed' | 'returned';

/** "Record that you've asked <person>". Writes a `requested` responsibility — nothing is sent, and the person is not told. */
export function recordCounterpart(
  state: AppState,
  ctx: TransitionContext,
  about: { kind: 'event' | 'task'; id: string },
  counterpart: Exclude<CounterpartInput, { kind: 'none' }>
): MutationResult<ResponsibilityOutcome> {
  const ref: TypedRef = { kind: about.kind, id: about.id };
  if (!isCoparentRef(state, ref)) return refuse(state, 'not_a_coparent_record');
  // One live responsibility per thing. To change who it is with, reassign — never a second owner.
  if (liveResponsibilityFor(state, ref) !== null) return refuse(state, 'already_recorded');
  const person = resolvePerson(state, ctx, counterpart);
  if (!person.ok || person.personId === null) return refuse(state, 'invalid_counterpart');
  const asked = delegate(person.state, ctx, { about: about as TypedRef<'event' | 'task'>, to: { kind: 'person', id: person.personId }, ackWithinMinutes: null, stillNeedsMe: true });
  return asked === person.state ? refuse(state, 'not_allowed') : done(asked, 'saved', person.personId);
}

/** Hand the recorded request to somebody else. The earlier one is closed as returned and named by its successor. */
export function reassignCounterpart(
  state: AppState,
  ctx: TransitionContext,
  responsibilityId: string,
  counterpart: Exclude<CounterpartInput, { kind: 'none' }>
): MutationResult<ResponsibilityOutcome> {
  const r = state.responsibilities.find((candidate) => candidate.id === responsibilityId);
  if (!r) return refuse(state, 'missing');
  if (!isCoparentRef(state, r.about)) return refuse(state, 'not_a_coparent_record');
  const person = resolvePerson(state, ctx, counterpart);
  if (!person.ok || person.personId === null) return refuse(state, 'invalid_counterpart');
  const next = reassign(person.state, ctx, responsibilityId, { kind: 'person', id: person.personId }, null);
  return next === person.state ? refuse(state, 'not_allowed') : done(next, 'saved', person.personId);
}

/**
 * Record what SHE says happened next. A positive answer (acknowledged / accepted) is refused when the person is no longer available:
 * an unavailable person is never given a positive state. Accepting is ALWAYS paired with her explicit answer to "does it still need
 * you?" — `accepted_covered` (no longer needs her) or `accepted_needs_me` (still does).
 */
export function recordAnswer(state: AppState, ctx: TransitionContext, responsibilityId: string, answer: AnswerChoice): MutationResult<ResponsibilityOutcome> {
  const r = state.responsibilities.find((candidate) => candidate.id === responsibilityId);
  if (!r) return refuse(state, 'missing');
  if (!isCoparentRef(state, r.about)) return refuse(state, 'not_a_coparent_record');

  const positive = answer === 'acknowledged' || answer === 'accepted_covered' || answer === 'accepted_needs_me';
  if (positive) {
    const person = r.responsibleKind === 'person' ? state.people.find((candidate) => candidate.id === r.responsiblePersonId) : undefined;
    if (r.responsibleKind !== 'person' || !person || person.status !== 'active') return refuse(state, 'counterpart_unavailable');
  }

  let next: AppState;
  switch (answer) {
    case 'acknowledged':
      next = acknowledge(state, ctx, responsibilityId);
      break;
    case 'accepted_covered':
      next = accept(state, ctx, responsibilityId, false);
      break;
    case 'accepted_needs_me':
      next = accept(state, ctx, responsibilityId, true);
      break;
    case 'declined':
      next = decline(state, ctx, responsibilityId);
      break;
    case 'completed':
      next = completeResponsibility(state, ctx, responsibilityId);
      break;
    case 'returned':
      next = returnToSelf(state, ctx, responsibilityId);
      break;
  }
  return next === state ? refuse(state, 'not_allowed') : done(next, 'saved', responsibilityId);
}

/** After an acceptance she can change her mind about whether it still needs her. Only a live, person-held record. */
export function recordStillNeedsMe(state: AppState, ctx: TransitionContext, responsibilityId: string, stillNeedsMe: boolean): MutationResult<ResponsibilityOutcome> {
  const r = state.responsibilities.find((candidate) => candidate.id === responsibilityId);
  if (!r) return refuse(state, 'missing');
  if (!isCoparentRef(state, r.about)) return refuse(state, 'not_a_coparent_record');
  if (r.responsibleKind !== 'person' || (r.state !== 'requested' && r.state !== 'acknowledged' && r.state !== 'accepted')) return refuse(state, 'not_allowed');
  const person = state.people.find((candidate) => candidate.id === r.responsiblePersonId);
  if (!person || person.status !== 'active') return refuse(state, 'counterpart_unavailable');
  if (r.stillNeedsMe === stillNeedsMe) return refuse(state, 'not_allowed');
  const at = toInstant(ctx.nowMs);
  return done({ ...state, responsibilities: state.responsibilities.map((x) => (x.id === responsibilityId ? { ...x, stillNeedsMe, updatedAt: at } : x)) }, 'saved', responsibilityId);
}

// -------------------------------------------------------------------------------------------------------------- preparation

export type PreparationOutcome =
  | 'saved'
  | 'no_category'
  | 'category_archived'
  | 'invalid_child'
  | 'invalid_title'
  | 'invalid_text'
  | 'invalid_date'
  | 'invalid_link'
  | 'link_refused'
  | 'missing'
  | 'not_a_coparent_record'
  | 'not_open';

export interface PreparationFields {
  childId: string;
  title: string;
  /** Optional YYYY-MM-DD; empty = none recorded. */
  dueDate: string;
  notes: string;
  /** The handoff this is for, by id, or null. Never inferred. */
  linkEventId: string | null;
}

/** A preparation item is an ordinary canonical task, tied to a handoff only by an explicit `requires` edge she asked for. */
export function createPreparation(state: AppState, ctx: TransitionContext, fields: PreparationFields): MutationResult<PreparationOutcome> {
  const category = requireCategory(state);
  if (!category.ok) return refuse(state, category.outcome);
  if (!state.children.some((child) => child.id === fields.childId)) return refuse(state, 'invalid_child');
  const text = textIssue({ title: fields.title, notes: fields.notes });
  if (text !== null) return refuse(state, text);
  const due = trimmed(fields.dueDate);
  if (due !== '' && !isLocalDate(due)) return refuse(state, 'invalid_date');

  let event: CalendarEvent | undefined;
  if (fields.linkEventId !== null) {
    event = state.events.find((candidate) => candidate.id === fields.linkEventId);
    if (!event || event.status !== 'active' || !isHandoff(state, event)) return refuse(state, 'invalid_link');
  }

  const before = new Set(state.tasks.map((task) => task.id));
  let next = addTask(state, ctx, {
    title: trimmed(fields.title),
    categoryId: category.categoryId,
    subjectMemberId: fields.childId,
    dueDate: due === '' ? null : due,
    notes: trimmed(fields.notes) || null,
    scope: 'coparent-shared',
  });
  const created = next.tasks.find((task) => !before.has(task.id));
  if (!created) return refuse(state, 'invalid_title');

  if (event) {
    const linked = addDependency(next, ctx, { relation: 'requires', from: { kind: 'event', id: event.id }, to: { kind: 'task', id: created.id } });
    if (linked.refusal !== null) return refuse(state, 'link_refused');
    next = linked.state;
  }
  return done(next, 'saved', created.id);
}

export function completePreparation(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<PreparationOutcome> {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return refuse(state, 'missing');
  if (!isCoparentTask(state, task)) return refuse(state, 'not_a_coparent_record');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(completeTask(state, ctx, taskId), 'saved', taskId);
}

/** Take an item off the list. That is removal — never "packed" and never "done". */
export function removePreparation(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<PreparationOutcome> {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return refuse(state, 'missing');
  if (!isCoparentTask(state, task)) return refuse(state, 'not_a_coparent_record');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(archiveTask(state, ctx, taskId), 'saved', taskId);
}

export function linkPreparation(state: AppState, ctx: TransitionContext, taskId: string, eventId: string): MutationResult<PreparationOutcome> {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!task) return refuse(state, 'missing');
  if (!event || event.status !== 'active' || !isHandoff(state, event)) return refuse(state, 'invalid_link');
  if (!isCoparentTask(state, task)) return refuse(state, 'not_a_coparent_record');
  const linked = addDependency(state, ctx, { relation: 'requires', from: { kind: 'event', id: eventId }, to: { kind: 'task', id: taskId } });
  return linked.refusal !== null ? refuse(state, 'link_refused') : done(linked.state, 'saved', taskId);
}

/** Retire the edge (the shared correction path). The task itself is untouched. */
export function unlinkPreparation(state: AppState, ctx: TransitionContext, dependencyId: string): MutationResult<PreparationOutcome> {
  const edge = state.dependencies.find((candidate) => candidate.id === dependencyId && candidate.status === 'active' && candidate.relation === 'requires');
  if (!edge || edge.from.kind !== 'event' || edge.to.kind !== 'task') return refuse(state, 'missing');
  if (!isCoparentRef(state, edge.from)) return refuse(state, 'not_a_coparent_record');
  return done(removeDependency(state, ctx, dependencyId), 'saved', dependencyId);
}

// ------------------------------------------------------------------------------------------------------------------ money

export type FollowUpOutcome =
  | 'saved'
  | 'unchanged'
  | 'no_category'
  | 'category_archived'
  | 'invalid_child'
  | 'invalid_title'
  | 'invalid_text'
  | 'invalid_date'
  | 'invalid_currency'
  | 'invalid_direction'
  | 'invalid_amount'
  | 'invalid_counterpart'
  | 'missing'
  | 'not_a_follow_up'
  | 'not_open'
  | 'stale';

export interface FollowUpFields {
  title: string;
  /** Optional: a follow-up may be about a child, or not. Empty string / null = no child recorded. */
  childId: string | null;
  /** A plain decimal string as typed ("80", "80.50"). Parsed exactly, never through a float. */
  amountText: string;
  /** ISO 4217, chosen explicitly. There is no default currency. */
  currency: string;
  /** Which way the money would move if it happens. Her explicit choice — never defaulted. */
  direction: 'inflow' | 'outflow' | null;
  /** Optional follow-up date. */
  followUpDate: string;
  notes: string;
}

function parseFollowUp(state: AppState, fields: FollowUpFields):
  | { ok: true; value: { title: string; due: string | null; notes: string | null; money: NonNullable<Task['value']> } }
  | { ok: false; outcome: FollowUpOutcome } {
  if (fields.childId !== null && !state.children.some((child) => child.id === fields.childId)) return { ok: false, outcome: 'invalid_child' };
  const text = textIssue({ title: fields.title, notes: fields.notes });
  if (text !== null) return { ok: false, outcome: text };
  const due = trimmed(fields.followUpDate);
  if (due !== '' && !isLocalDate(due)) return { ok: false, outcome: 'invalid_date' };
  const currency = trimmed(fields.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, outcome: 'invalid_currency' };
  if (fields.direction === null) return { ok: false, outcome: 'invalid_direction' };
  const money = parseMoney(fields.amountText, currency, fields.direction);
  // No amount is not $0, and a $0 follow-up is not a follow-up about money.
  if (money === null || money.amountMinor <= 0) return { ok: false, outcome: 'invalid_amount' };
  return { ok: true, value: { title: trimmed(fields.title), due: due === '' ? null : due, notes: trimmed(fields.notes) || null, money } };
}

/**
 * The reimbursement TASK BRIDGE: an amount-bearing, child-linked, co-parenting follow-up task with a follow-up date and an optional
 * recorded counterpart. It is work she intends to do — not a debt, not a request that was sent.
 */
export function createMoneyFollowUp(state: AppState, ctx: TransitionContext, fields: FollowUpFields, counterpart: CounterpartInput): MutationResult<FollowUpOutcome> {
  const category = requireCategory(state);
  if (!category.ok) return refuse(state, category.outcome);
  const parsed = parseFollowUp(state, fields);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;

  const before = new Set(state.tasks.map((task) => task.id));
  let next = addTask(state, ctx, {
    title: value.title,
    categoryId: category.categoryId,
    subjectMemberId: fields.childId,
    dueDate: value.due,
    notes: value.notes,
    scope: 'coparent-shared',
    value: value.money,
  });
  const created = next.tasks.find((task) => !before.has(task.id));
  if (!created) return refuse(state, 'invalid_title');

  const person = resolvePerson(next, ctx, counterpart);
  if (!person.ok) return refuse(state, 'invalid_counterpart');
  next = person.state;
  if (person.personId !== null) {
    const asked = delegate(next, ctx, { about: { kind: 'task', id: created.id }, to: { kind: 'person', id: person.personId }, ackWithinMinutes: null, stillNeedsMe: true });
    if (asked === next) return refuse(state, 'invalid_counterpart');
    next = asked;
  }
  return done(next, 'saved', created.id);
}

export interface EditFollowUpInput {
  taskId: string;
  /** The follow-up's REVISION token when the editor was opened (`followUpEditorSeed(...).baseUpdatedAt`). Opaque. */
  baseUpdatedAt: string | null;
  fields: FollowUpFields;
}

/** Edit a follow-up. The amount lives in the existing `value` facet; entering a new amount never becomes an agreed one. */
export function editMoneyFollowUp(state: AppState, ctx: TransitionContext, input: EditFollowUpInput): MutationResult<FollowUpOutcome> {
  const category = coparentCategory(state);
  const task = state.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) return refuse(state, 'missing');
  if (category === null || task.categoryId !== category.id || task.value === null) return refuse(state, 'not_a_follow_up');
  if (task.status !== 'open') return refuse(state, 'not_open');
  if (followUpRevision(task) !== input.baseUpdatedAt) return refuse(state, 'stale');

  const parsed = parseFollowUp(state, input.fields);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;

  const patch: Parameters<typeof updateTask>[3] = {};
  if (value.title !== task.title) patch.title = value.title;
  if (input.fields.childId !== task.subjectMemberId) patch.subjectMemberId = input.fields.childId;
  if (value.due !== task.dueDate) patch.dueDate = value.due;
  if (value.notes !== task.notes) patch.notes = value.notes;

  let next = state;
  if (Object.keys(patch).length > 0) next = updateTask(next, ctx, task.id, patch);
  const sameMoney = task.value.amountMinor === value.money.amountMinor && task.value.currency === value.money.currency && task.value.direction === value.money.direction;
  if (!sameMoney) {
    next = { ...next, tasks: next.tasks.map((candidate) => (candidate.id === task.id ? { ...candidate, value: value.money, updatedAt: toInstant(ctx.nowMs) } : candidate)) };
  }
  return next === state ? refuse(state, 'unchanged') : done(next, 'saved', task.id);
}

/** "Marked done". It records that the follow-up WORK was done — it does not record that any payment arrived. */
export function completeFollowUp(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<FollowUpOutcome> {
  const category = coparentCategory(state);
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return refuse(state, 'missing');
  if (category === null || task.categoryId !== category.id || task.value === null) return refuse(state, 'not_a_follow_up');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(completeTask(state, ctx, taskId), 'saved', taskId);
}

export function removeFollowUp(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<FollowUpOutcome> {
  const category = coparentCategory(state);
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return refuse(state, 'missing');
  if (category === null || task.categoryId !== category.id || task.value === null) return refuse(state, 'not_a_follow_up');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(archiveTask(state, ctx, taskId), 'saved', taskId);
}

export function followUpEditorSeed(state: AppState, taskId: string): { fields: FollowUpFields; baseUpdatedAt: string | null } | null {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.value === null) return null;
  return {
    baseUpdatedAt: followUpRevision(task),
    fields: {
      title: task.title,
      childId: task.subjectMemberId,
      amountText: formatAmount(task.value),
      currency: task.value.currency,
      direction: task.value.direction,
      followUpDate: task.dueDate ?? '',
      notes: task.notes ?? '',
    },
  };
}

/** The currency of the amount she most recently recorded anywhere in her own household, or null. Offered visibly, never applied silently. */
export function suggestedCurrency(state: AppState): string | null {
  for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
    const value = state.tasks[i].value;
    if (value !== null) return value.currency;
  }
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    const value = state.events[i].value;
    if (value !== null) return value.currency;
  }
  return null;
}

/** Whether a new co-parenting record can be made right now (and if not, why). */
export const creationBlockers = (state: AppState) => blockedReasons(state);

// ------------------------------------------------------------------------------------------------------- store bridge

/**
 * Run one mutation through `store.commit` and report its NAMED outcome. `store.commit` resolves true for a transition that changed
 * nothing, so a stale edit or a refusal is carried by the transition's own outcome, never by that boolean.
 */
export async function commitMutation<O extends string>(
  store: Pick<AppStore, 'commit'>,
  run: (state: AppState, ctx: TransitionContext) => MutationResult<O>,
  successful: readonly O[]
): Promise<{ outcome: O | 'not_saved'; id: string | null }> {
  const held: { result: MutationResult<O> | null } = { result: null };
  const committed = await store.commit((state, ctx) => {
    held.result = run(state, ctx);
    return held.result.state;
  });
  const result = held.result;
  if (result === null) return { outcome: 'not_saved', id: null };
  if (successful.includes(result.outcome) && !committed) return { outcome: 'not_saved', id: null };
  return { outcome: result.outcome, id: result.id };
}

/** Today's household-local date, for editors that need a starting point. */
export const householdToday = (state: AppState, nowMs: number): string => logicalDateAt(nowMs, state.user.timezone);
