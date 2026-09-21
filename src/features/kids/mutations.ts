import type { IdentityRecord } from '../../domain/account/binding';
import { categoriesInOrder, categoryWithRole } from '../../domain/categories';
import { addChild, checkNewChild, type AddChildRefusal, type NewChildInput } from '../../domain/children';
import type { TransitionContext } from '../../domain/context';
import { addEvent, removeEvent, updateEvent, type UpdateEventInput } from '../../domain/events';
import { DEFAULT_TASK_DURATION_MINUTES, durationSourceForSave } from '../../domain/foundation/duration';
import { PERSON_RELATIONSHIPS } from '../../domain/foundation/responsibility';
import { isLocalDate } from '../../domain/logicalDay';
import { accept, acknowledge, addPerson, decline, delegate, liveResponsibilityFor, returnToSelf } from '../../domain/responsibility';
import { FIELD_LIMITS, type AppState, type CalendarEvent, type Task } from '../../domain/state';
import { addDependency } from '../../domain/structure';
import { addTask, archiveTask, completeTask, updateTask, type UpdateTaskInput } from '../../domain/tasks';
import type { AppStore } from '../../state/appStore';
import { clockText, momentAt, parseClockInput, resolveWallTime, type ResolvedWallTime } from './time';
import type { KidsRef } from './types';

/**
 * WHAT KIDS MAY WRITE (HK-FEATURE-05).
 *
 * Every function is a `Transition`-shaped step over the ONE canonical state, composed from the mutations the foundation already
 * defines (`addTask`, `updateTask`, `addEvent`, `delegate`, `accept`, `addDependency`, ...). Kids adds no entity, no collection and no
 * durable field. Each returns an OUTCOME as well as a state, because a transition that changes nothing looks exactly like a success to
 * the store (`commit` resolves true either way): a stale editor, a refused handoff and a no-op must never be mistaken for a save.
 *
 * Nothing here queues sync work or imports a sync mechanism: the store observes the change and the infrastructure sends it.
 */

// ----------------------------------------------------------------- helpers ---

const trimOrNull = (text: string): string | null => {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/** The category a child's item lives in: the household's own `kids`-role category, else its first active one. Never chosen by name. */
export function kidsCategoryId(state: Pick<AppState, 'categories'>): string | null {
  return categoryWithRole(state, 'kids')?.id ?? categoriesInOrder(state)[0]?.id ?? null;
}

const isChildOf = (state: AppState, subject: string | null): subject is string => subject !== null && state.children.some((child) => child.id === subject);

/** A row Kids may act on: an open task or an active event whose subject is one of this household's children. */
function childLinkedRow(state: AppState, ref: KidsRef): Task | CalendarEvent | null {
  if (ref.kind === 'task') {
    const task = state.tasks.find((row) => row.id === ref.id);
    return task && task.status === 'open' && isChildOf(state, task.subjectMemberId) ? task : null;
  }
  const event = state.events.find((row) => row.id === ref.id);
  return event && event.status === 'active' && isChildOf(state, event.subjectMemberId) ? event : null;
}

/** Changes whenever anything an editor could have shown changes, including changes that stamp no timestamp. */
export const taskFingerprint = (task: Task): string =>
  JSON.stringify([task.id, task.title, task.categoryId, task.subjectMemberId, task.durationMinutes, task.durationSource, task.commitment, task.dueDate, task.dueAt, task.plan, task.notes, task.status, task.updatedAt]);

export const eventFingerprint = (event: CalendarEvent): string =>
  JSON.stringify([event.id, event.title, event.categoryId, event.subjectMemberId, event.startsAt, event.endsAt, event.location, event.notes, event.commitment, event.status, event.updatedAt]);

/** Runs a Kids step as one commit and hands back what happened. The outcome, not `committed`, says whether anything changed. */
export async function commitKids<R extends { state: AppState }>(
  store: Pick<AppStore, 'commit'>,
  run: (state: AppState, ctx: TransitionContext) => R
): Promise<{ committed: boolean; result: Omit<R, 'state'> | null }> {
  const held: { result: R | null } = { result: null };
  const committed = await store.commit((state, ctx) => {
    held.result = run(state, ctx);
    return held.result.state;
  });
  if (held.result === null) return { committed, result: null };
  const { state: _state, ...rest } = held.result;
  return { committed, result: rest };
}

// ------------------------------------------------------------------- child ---

/**
 * Whether a child may be added to this household from here (owner checkpoint OC-01, RESOLVED by the owner: a household bound to an
 * account MUST be able to add a child).
 *
 * A child is added the same way whether the household is bound or not: it is one canonical `Child`, identified by its id. Before
 * binding it reaches the cloud through the claim; after binding the household's owner creates it through the ordinary sync path.
 * Kids knows nothing of either. The only household that cannot take a child is one that belongs to a DIFFERENT account than the one
 * signed in: it is kept, and never rendered, uploaded or merged (B4-P0-035), so nothing is added to it.
 *
 * WHO may create a child is the server's decision (only the household's owner), not this screen's: a refusal is kept as sync evidence
 * and surfaced through the existing "needs attention" signal, never hidden and never retried forever.
 */
export const canAddChild = (identity: IdentityRecord): boolean => identity.quarantine === null;

export function addChildToHousehold(state: AppState, ctx: TransitionContext, input: NewChildInput): { state: AppState; outcome: 'added' | AddChildRefusal; childId: string | null } {
  const refusal = checkNewChild(state, input, ctx.today);
  if (refusal !== null) return { state, outcome: refusal, childId: null };
  const next = addChild(state, ctx, input);
  return { state: next, outcome: 'added', childId: next.children[next.children.length - 1]?.id ?? null };
}

// -------------------------------------------------------------------- task ---

export type TaskDraftError =
  | 'no_child'
  | 'unknown_child'
  | 'blank_title'
  | 'title_too_long'
  | 'bad_due_date'
  | 'bad_duration'
  | 'notes_too_long'
  | 'unknown_person'
  | 'unknown_parent'
  | 'no_category';

export interface TaskDraft {
  childId: string | null;
  title: string;
  /** '' for none, otherwise YYYY-MM-DD. */
  dueDate: string;
  durationText: string;
  /** False when the length shown is the planning default she was never asked about. Only touching the field makes it hers. */
  durationTouched: boolean;
  notes: string;
  commitment: 'fixed' | 'flexible';
  /** Ask somebody to take it, at the same moment. Optional. */
  handoffToPersonId: string | null;
  /** The commitment or task this is a step of (how a plan gap becomes work). Optional. */
  partOf: KidsRef | null;
}

function checkTaskFields(draft: Pick<TaskDraft, 'title' | 'dueDate' | 'durationText' | 'durationTouched' | 'notes'>): TaskDraftError | null {
  const title = draft.title.trim();
  if (title.length === 0) return 'blank_title';
  if (title.length > FIELD_LIMITS.titleLength) return 'title_too_long';
  if (draft.dueDate.trim() !== '' && !isLocalDate(draft.dueDate.trim())) return 'bad_due_date';
  if (draft.durationTouched) {
    const text = draft.durationText.trim();
    if (!/^\d+$/.test(text) || Number(text) > FIELD_LIMITS.durationMinutes) return 'bad_duration';
  }
  if (draft.notes.trim().length > FIELD_LIMITS.notesLength) return 'notes_too_long';
  return null;
}

export function createChildTask(state: AppState, ctx: TransitionContext, draft: TaskDraft): { state: AppState; outcome: 'created' | 'link_refused' | TaskDraftError; taskId: string | null } {
  const refuse = (outcome: TaskDraftError | 'link_refused') => ({ state, outcome, taskId: null });
  if (draft.childId === null) return refuse('no_child');
  if (!isChildOf(state, draft.childId)) return refuse('unknown_child');
  const fieldError = checkTaskFields(draft);
  if (fieldError !== null) return refuse(fieldError);
  const categoryId = kidsCategoryId(state);
  if (categoryId === null) return refuse('no_category');
  if (draft.partOf !== null) {
    const parent = childLinkedRow(state, draft.partOf);
    if (parent === null || parent.subjectMemberId !== draft.childId) return refuse('unknown_parent');
  }

  const minutes = draft.durationTouched ? Number(draft.durationText.trim()) : DEFAULT_TASK_DURATION_MINUTES;
  // A prefilled number she never touched is the default she was shown, not something she said.
  const durationSource = durationSourceForSave({ touched: draft.durationTouched, existing: null });
  let next = addTask(state, ctx, {
    title: draft.title.trim(),
    categoryId,
    subjectMemberId: draft.childId,
    durationMinutes: minutes,
    durationSource,
    commitment: draft.commitment,
    dueDate: trimOrNull(draft.dueDate),
    notes: trimOrNull(draft.notes),
    scope: 'child',
  });
  const task = next.tasks[next.tasks.length - 1];

  if (draft.partOf !== null) {
    const linked = addDependency(next, ctx, { relation: 'part_of', from: { kind: 'task', id: task.id }, to: { kind: draft.partOf.kind, id: draft.partOf.id } });
    // All or nothing: a step that is not attached to what it is a step of would look like unrelated work.
    if (linked.refusal !== null) return refuse('link_refused');
    next = linked.state;
  }
  if (draft.handoffToPersonId !== null) {
    const asked = delegate(next, ctx, { about: { kind: 'task', id: task.id }, to: { kind: 'person', id: draft.handoffToPersonId } });
    if (asked === next) return refuse('unknown_person');
    next = asked;
  }
  return { state: next, outcome: 'created', taskId: task.id };
}

export interface TaskEditDraft {
  taskId: string;
  /** `taskFingerprint` of the row when the editor opened. */
  baseline: string;
  title: string;
  dueDate: string;
  durationText: string;
  durationTouched: boolean;
  notes: string;
  commitment: 'fixed' | 'flexible';
  childId: string;
}

export type EditOutcome = 'saved' | 'unchanged' | 'stale' | 'missing';

export function editChildTask(state: AppState, ctx: TransitionContext, draft: TaskEditDraft): { state: AppState; outcome: EditOutcome | TaskDraftError } {
  const current = state.tasks.find((row) => row.id === draft.taskId);
  if (!current || current.status !== 'open' || !isChildOf(state, current.subjectMemberId)) return { state, outcome: 'missing' };
  // An editor that opened on an older version must not silently overwrite a newer one.
  if (taskFingerprint(current) !== draft.baseline) return { state, outcome: 'stale' };
  if (!isChildOf(state, draft.childId)) return { state, outcome: 'unknown_child' };
  const fieldError = checkTaskFields(draft);
  if (fieldError !== null) return { state, outcome: fieldError };

  const patch: UpdateTaskInput = {};
  if (draft.title.trim() !== current.title) patch.title = draft.title.trim();
  if (trimOrNull(draft.dueDate) !== current.dueDate) patch.dueDate = trimOrNull(draft.dueDate);
  if (trimOrNull(draft.notes) !== current.notes) patch.notes = trimOrNull(draft.notes);
  if (draft.commitment !== current.commitment) patch.commitment = draft.commitment;
  if (draft.childId !== current.subjectMemberId) patch.subjectMemberId = draft.childId;
  if (draft.durationTouched) {
    // Touching the field is what makes the number hers, even when she confirms the number that was already there.
    const source = durationSourceForSave({ touched: true, existing: current });
    const minutes = Number(draft.durationText.trim());
    if (minutes !== current.durationMinutes || source !== current.durationSource) {
      patch.durationMinutes = minutes;
      patch.durationSource = source;
    }
  }
  if (Object.keys(patch).length === 0) return { state, outcome: 'unchanged' };
  return { state: updateTask(state, ctx, current.id, patch), outcome: 'saved' };
}

export function completeChildTask(state: AppState, ctx: TransitionContext, taskId: string): { state: AppState; outcome: 'completed' | 'missing' } {
  if (childLinkedRow(state, { kind: 'task', id: taskId }) === null) return { state, outcome: 'missing' };
  const next = completeTask(state, ctx, taskId);
  return { state: next, outcome: next === state ? 'missing' : 'completed' };
}

// ------------------------------------------------------------------- event ---

export type EventDraftError =
  | 'no_child'
  | 'unknown_child'
  | 'blank_title'
  | 'title_too_long'
  | 'bad_date'
  | 'bad_start_time'
  | 'bad_end_time'
  | 'end_not_after_start'
  | 'location_too_long'
  | 'notes_too_long'
  | 'unknown_person'
  | 'no_category';

export interface EventDraft {
  childId: string | null;
  title: string;
  /** YYYY-MM-DD, in the household's zone. */
  date: string;
  /** "4:30 PM" or "16:30". */
  startText: string;
  endText: string;
  location: string;
  notes: string;
  commitment: 'fixed' | 'flexible';
  handoffToPersonId: string | null;
}

export interface WallTimeNotes {
  start: ResolvedWallTime['adjusted'];
  end: ResolvedWallTime['adjusted'];
}

interface ResolvedEventTimes {
  startsAt: string;
  endsAt: string;
  notes: WallTimeNotes;
}

function resolveEventTimes(draft: Pick<EventDraft, 'date' | 'startText' | 'endText'>, timeZone: string): ResolvedEventTimes | EventDraftError {
  if (!isLocalDate(draft.date.trim())) return 'bad_date';
  const start = parseClockInput(draft.startText);
  if (start === null) return 'bad_start_time';
  const end = parseClockInput(draft.endText);
  if (end === null) return 'bad_end_time';
  const from = resolveWallTime(draft.date.trim(), start, timeZone);
  const to = resolveWallTime(draft.date.trim(), end, timeZone);
  if (to.epochMs <= from.epochMs) return 'end_not_after_start';
  return { startsAt: new Date(from.epochMs).toISOString(), endsAt: new Date(to.epochMs).toISOString(), notes: { start: from.adjusted, end: to.adjusted } };
}

function checkEventText(draft: Pick<EventDraft, 'title' | 'location' | 'notes'>): EventDraftError | null {
  const title = draft.title.trim();
  if (title.length === 0) return 'blank_title';
  if (title.length > FIELD_LIMITS.titleLength) return 'title_too_long';
  if (draft.location.trim().length > FIELD_LIMITS.locationLength) return 'location_too_long';
  if (draft.notes.trim().length > FIELD_LIMITS.notesLength) return 'notes_too_long';
  return null;
}

export function createChildEvent(
  state: AppState,
  ctx: TransitionContext,
  draft: EventDraft
): { state: AppState; outcome: 'created' | EventDraftError; eventId: string | null; timeNotes: WallTimeNotes | null } {
  const refuse = (outcome: EventDraftError) => ({ state, outcome, eventId: null, timeNotes: null });
  if (draft.childId === null) return refuse('no_child');
  if (!isChildOf(state, draft.childId)) return refuse('unknown_child');
  const textError = checkEventText(draft);
  if (textError !== null) return refuse(textError);
  const times = resolveEventTimes(draft, state.user.timezone);
  if (typeof times === 'string') return refuse(times);
  const categoryId = kidsCategoryId(state);
  if (categoryId === null) return refuse('no_category');

  let next = addEvent(state, ctx, {
    title: draft.title.trim(),
    categoryId,
    subjectMemberId: draft.childId,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    commitment: draft.commitment,
    location: trimOrNull(draft.location),
    notes: trimOrNull(draft.notes),
    scope: 'child',
  });
  const event = next.events[next.events.length - 1];
  if (draft.handoffToPersonId !== null) {
    const asked = delegate(next, ctx, { about: { kind: 'event', id: event.id }, to: { kind: 'person', id: draft.handoffToPersonId } });
    if (asked === next) return refuse('unknown_person');
    next = asked;
  }
  return { state: next, outcome: 'created', eventId: event.id, timeNotes: times.notes };
}

/** What an editor shows for an event, in the household's zone. Round-trips through `editChildEvent` without rewriting untouched times. */
export function eventFormValues(event: CalendarEvent, timeZone: string): { date: string; startText: string; endText: string } {
  const start = momentAt(Date.parse(event.startsAt), timeZone);
  const end = momentAt(Date.parse(event.endsAt), timeZone);
  return { date: start.localDate, startText: clockText(start.minutesOfDay), endText: clockText(end.minutesOfDay) };
}

export interface EventEditDraft extends Omit<EventDraft, 'handoffToPersonId' | 'childId'> {
  eventId: string;
  baseline: string;
  childId: string;
}

export function editChildEvent(
  state: AppState,
  ctx: TransitionContext,
  draft: EventEditDraft
): { state: AppState; outcome: EditOutcome | EventDraftError; timeNotes: WallTimeNotes | null } {
  const current = state.events.find((row) => row.id === draft.eventId);
  if (!current || current.status !== 'active' || !isChildOf(state, current.subjectMemberId)) return { state, outcome: 'missing', timeNotes: null };
  if (eventFingerprint(current) !== draft.baseline) return { state, outcome: 'stale', timeNotes: null };
  if (!isChildOf(state, draft.childId)) return { state, outcome: 'unknown_child', timeNotes: null };
  const textError = checkEventText(draft);
  if (textError !== null) return { state, outcome: textError, timeNotes: null };

  const shown = eventFormValues(current, state.user.timezone);
  const timeChanged = draft.date.trim() !== shown.date || draft.startText.trim() !== shown.startText || draft.endText.trim() !== shown.endText;
  const patch: UpdateEventInput = {};
  let timeNotes: WallTimeNotes | null = null;
  if (timeChanged) {
    // Only rewrite the instants when she changed what she was shown: an untouched time keeps its exact stored moment.
    const times = resolveEventTimes(draft, state.user.timezone);
    if (typeof times === 'string') return { state, outcome: times, timeNotes: null };
    patch.startsAt = times.startsAt;
    patch.endsAt = times.endsAt;
    timeNotes = times.notes;
  }
  if (draft.title.trim() !== current.title) patch.title = draft.title.trim();
  if (trimOrNull(draft.location) !== current.location) patch.location = trimOrNull(draft.location);
  if (trimOrNull(draft.notes) !== current.notes) patch.notes = trimOrNull(draft.notes);
  if (draft.commitment !== current.commitment) patch.commitment = draft.commitment;
  if (draft.childId !== current.subjectMemberId) patch.subjectMemberId = draft.childId;
  if (Object.keys(patch).length === 0) return { state, outcome: 'unchanged', timeNotes: null };
  return { state: updateEvent(state, ctx, current.id, patch), outcome: 'saved', timeNotes };
}

/** Removal keeps the row and its history (`archived` / `removed`); it is not completion. */
export function removeChildItem(state: AppState, ctx: TransitionContext, ref: KidsRef): { state: AppState; outcome: 'removed' | 'missing' } {
  if (childLinkedRow(state, ref) === null) return { state, outcome: 'missing' };
  const next = ref.kind === 'task' ? archiveTask(state, ctx, ref.id) : removeEvent(state, ctx, ref.id);
  return { state: next, outcome: next === state ? 'missing' : 'removed' };
}

// ---------------------------------------------------------- responsibility ---

export type HandoffOutcome = 'requested' | 'not_a_child_item' | 'unknown_person' | 'already_held' | 'blank_name' | 'name_too_long' | 'bad_relationship';

/** "Ask <person> to take this." She has asked; nothing has been answered, acknowledged or accepted. */
export function requestHandoff(state: AppState, ctx: TransitionContext, input: { ref: KidsRef; personId: string }): { state: AppState; outcome: HandoffOutcome } {
  if (childLinkedRow(state, input.ref) === null) return { state, outcome: 'not_a_child_item' };
  if (liveResponsibilityFor(state, input.ref) !== null) return { state, outcome: 'already_held' };
  const asked = delegate(state, ctx, { about: { kind: input.ref.kind, id: input.ref.id }, to: { kind: 'person', id: input.personId } });
  return asked === state ? { state, outcome: 'unknown_person' } : { state: asked, outcome: 'requested' };
}

/** Somebody to hand to has to exist. Name and relationship only: no contact details, no list, no edit (People OS owns the network). */
export function requestHandoffToNewPerson(
  state: AppState,
  ctx: TransitionContext,
  input: { ref: KidsRef; name: string; relationship: string }
): { state: AppState; outcome: HandoffOutcome; personId: string | null } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return { state, outcome: 'blank_name', personId: null };
  if (name.length > 80) return { state, outcome: 'name_too_long', personId: null };
  const relationship = PERSON_RELATIONSHIPS.find((option) => option === input.relationship);
  if (relationship === undefined) return { state, outcome: 'bad_relationship', personId: null };
  if (childLinkedRow(state, input.ref) === null) return { state, outcome: 'not_a_child_item', personId: null };
  if (liveResponsibilityFor(state, input.ref) !== null) return { state, outcome: 'already_held', personId: null };

  const withPerson = addPerson(state, ctx, { displayName: name, relationship });
  const person = withPerson.people[withPerson.people.length - 1];
  const asked = delegate(withPerson, ctx, { about: { kind: input.ref.kind, id: input.ref.id }, to: { kind: 'person', id: person.id } });
  // All or nothing: never leave a person behind that the handoff did not use.
  return asked === withPerson ? { state, outcome: 'unknown_person', personId: null } : { state: asked, outcome: 'requested', personId: person.id };
}

export type ResponseOutcome = 'recorded' | 'not_applicable' | 'not_a_child_item' | 'missing';

function respond(state: AppState, responsibilityId: string, step: (current: AppState) => AppState): { state: AppState; outcome: ResponseOutcome } {
  const row = state.responsibilities.find((entry) => entry.id === responsibilityId);
  if (!row) return { state, outcome: 'missing' };
  if ((row.about.kind !== 'task' && row.about.kind !== 'event') || childLinkedRow(state, { kind: row.about.kind, id: row.about.id }) === null) {
    return { state, outcome: 'not_a_child_item' };
  }
  const next = step(state);
  // The foundation returns the same object when a step does not apply (already answered, wrong state): that is not a record.
  return next === state ? { state, outcome: 'not_applicable' } : { state: next, outcome: 'recorded' };
}

/** "They have seen it." Seen is not yes. */
export const recordAcknowledged = (state: AppState, ctx: TransitionContext, id: string) => respond(state, id, (s) => acknowledge(s, ctx, id));

/** "They said yes." She states whether it still needs her; there is no default, so acceptance can never quietly become coverage. */
export const recordAccepted = (state: AppState, ctx: TransitionContext, id: string, stillNeedsMe: boolean) =>
  // The foundation's own default for this argument is `false` (off her list). A caller that forgot to ask would silently make it
  // covered, so anything that is not an explicit boolean is refused before it reaches the foundation.
  typeof stillNeedsMe === 'boolean' ? respond(state, id, (s) => accept(s, ctx, id, stillNeedsMe)) : { state, outcome: 'not_applicable' as ResponseOutcome };

/** "They said no." It is hers again. */
export const recordDeclined = (state: AppState, ctx: TransitionContext, id: string) => respond(state, id, (s) => decline(s, ctx, id));

/** "Take it back." */
export const takeBack = (state: AppState, ctx: TransitionContext, id: string) => respond(state, id, (s) => returnToSelf(s, ctx, id));
