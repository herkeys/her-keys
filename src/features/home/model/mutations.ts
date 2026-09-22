import { restoreCategory } from '../../../domain/categories';
import { addEvent, removeEvent, updateEvent } from '../../../domain/events';
import { durationSourceForSave } from '../../../domain/foundation/duration';
import type { ContentRefKind, TypedRef } from '../../../domain/foundation/typedRef';
import { epochMsOf, isLocalDate, toInstant, type LocalDate } from '../../../domain/logicalDay';
import { appendObservation } from '../../../domain/observations';
import { accept, acknowledge, decline, delegate, liveResponsibilityFor, returnToSelf } from '../../../domain/responsibility';
import { FIELD_LIMITS, type AppState, type CalendarEvent, type Task } from '../../../domain/state';
import { addRecurrence, setRecurrenceStatus } from '../../../domain/structure';
import { addTask, archiveTask, completeTask, updateTask } from '../../../domain/tasks';
import type { TransitionContext } from '../../../domain/context';
import { homeContextOf, isHomeRecord } from './homeContext';

/**
 * HOME'S CANONICAL MUTATIONS.
 *
 * Every function is a pure `(state, ctx, input) => { state, refusal }` composed from the domain's own transitions. Home has no
 * store of its own and no second copy of anything: a change is committed through `store.commit`, which validates the whole
 * household, makes it durable, and lets the change observer queue the sync intent — with no Home-specific sync.
 *
 * What every mutation here guarantees:
 *   - it touches ONLY records in the Home context (a task or visit outside it is refused, whatever the caller asked);
 *   - an edit NEVER changes a record's category, so an edit cannot move a record out of Home;
 *   - a duration she did not type is never recorded as hers (DEFAULT != USER-PROVIDED);
 *   - an edit made from a stale copy is refused, not silently applied over what changed;
 *   - handing something to somebody records exactly that, and never coverage or completion.
 */

export type HomeRefusal =
  | 'no_home_context'
  | 'context_archived'
  | 'not_found'
  | 'not_a_home_record'
  | 'invalid_input'
  | 'stale'
  | 'wrong_state'
  | 'already_delegated'
  | 'invalid_holder'
  | 'nothing_to_answer'
  | 'refused';

export interface HomeChange {
  state: AppState;
  refusal: HomeRefusal | null;
}

const refuse = (state: AppState, refusal: HomeRefusal): HomeChange => ({ state, refusal });
const done = (state: AppState): HomeChange => ({ state, refusal: null });

/** A repeat Home may create: a `schedule` rule with a frequency and an interval. No other trigger is offered (none yields a date). */
export interface HomeRepeat {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
}

const validRepeat = (repeat: HomeRepeat): boolean => ['daily', 'weekly', 'monthly', 'yearly'].includes(repeat.frequency) && Number.isInteger(repeat.interval) && repeat.interval >= 1 && repeat.interval <= 366;

// ----------------------------------------------------------------------------------------------------------------- tasks

export interface HomeTaskDraft {
  title: string;
  dueDate: LocalDate | null;
  /** Present only when she typed a number. Absent: the planning default applies and is recorded as `default`, never as hers. */
  durationMinutes?: number;
  notes: string | null;
  commitment: 'fixed' | 'flexible';
  repeat: HomeRepeat | null;
}

const validTitle = (title: string) => title.trim().length > 0 && title.trim().length <= FIELD_LIMITS.titleLength;
const validNotes = (notes: string | null) => notes === null || notes.length <= FIELD_LIMITS.notesLength;
const validDuration = (minutes: number | undefined) => minutes === undefined || (Number.isInteger(minutes) && minutes >= 0 && minutes <= FIELD_LIMITS.durationMinutes);
const validDue = (date: LocalDate | null) => date === null || isLocalDate(date);

/** A new Home task. Always filed under the Home context, so it stays visible in Home; creation is withheld while the area is archived. */
export function createHomeTask(state: AppState, ctx: TransitionContext, draft: HomeTaskDraft): HomeChange {
  const context = homeContextOf(state);
  if (context.kind === 'missing') return refuse(state, 'no_home_context');
  if (context.kind === 'archived') return refuse(state, 'context_archived');
  if (!validTitle(draft.title) || !validNotes(draft.notes) || !validDuration(draft.durationMinutes) || !validDue(draft.dueDate)) return refuse(state, 'invalid_input');
  if (draft.repeat !== null && !validRepeat(draft.repeat)) return refuse(state, 'invalid_input');

  const created = addTask(state, ctx, {
    title: draft.title.trim(),
    categoryId: context.category.id,
    scope: 'household',
    commitment: draft.commitment,
    dueDate: draft.dueDate,
    notes: draft.notes === null || draft.notes.trim() === '' ? null : draft.notes.trim(),
    // A typed number is hers. No number: `addTask` records the planning default AS a default.
    ...(draft.durationMinutes === undefined ? {} : { durationMinutes: draft.durationMinutes, durationSource: 'user' as const }),
  });
  const task = created.tasks[created.tasks.length - 1];
  if (draft.repeat === null) return done(created);
  const repeating = addRecurrence(created, ctx, { kind: 'task', id: task.id }, { trigger: 'schedule', frequency: draft.repeat.frequency, interval: draft.repeat.interval, anchorDate: draft.dueDate ?? ctx.today });
  return repeating === created ? refuse(state, 'refused') : done(repeating);
}

const taskFingerprint = (task: Task): string => JSON.stringify([task.title, task.dueDate, task.plan, task.durationMinutes, task.durationSource, task.commitment, task.notes, task.status, task.updatedAt]);
const eventFingerprint = (event: CalendarEvent): string => JSON.stringify([event.title, event.startsAt, event.endsAt, event.location, event.notes, event.commitment, event.status, event.updatedAt]);

/**
 * What an editor saw when it opened. A save is applied only if the record is still exactly that — by CONTENT, not just by
 * timestamp, so a change made in the same instant, or on another device, is still noticed.
 */
export interface Baseline {
  fingerprint: string;
}
export const taskBaselineOf = (task: Task): Baseline => ({ fingerprint: taskFingerprint(task) });
export const visitBaselineOf = (event: CalendarEvent): Baseline => ({ fingerprint: eventFingerprint(event) });

export interface HomeTaskEdit {
  taskId: string;
  basedOn: Baseline;
  title: string;
  dueDate: LocalDate | null;
  notes: string | null;
  commitment: 'fixed' | 'flexible';
  /** Present only if she changed the duration. Absent: the number and how far it can be trusted are left exactly as they were. */
  durationMinutes?: number;
  /** `unchanged` leaves the rule alone; `null` stops repeating; a repeat replaces any current one. */
  repeat: 'unchanged' | null | HomeRepeat;
}

const findTask = (state: AppState, taskId: string) => state.tasks.find((task) => task.id === taskId) ?? null;

export function updateHomeTask(state: AppState, ctx: TransitionContext, edit: HomeTaskEdit): HomeChange {
  const context = homeContextOf(state);
  const task = findTask(state, edit.taskId);
  if (task === null) return refuse(state, 'not_found');
  if (!isHomeRecord(context, task)) return refuse(state, 'not_a_home_record');
  if (taskFingerprint(task) !== edit.basedOn.fingerprint) return refuse(state, 'stale');
  if (!validTitle(edit.title) || !validNotes(edit.notes) || !validDuration(edit.durationMinutes) || !validDue(edit.dueDate)) return refuse(state, 'invalid_input');
  if (edit.repeat !== 'unchanged' && edit.repeat !== null && !validRepeat(edit.repeat)) return refuse(state, 'invalid_input');

  // The patch never carries `categoryId`: an edit cannot move a record out of Home. Duration provenance is written only when she
  // actually changed the number; otherwise both the number and its source stay as they were.
  const durationPatch = edit.durationMinutes === undefined ? {} : { durationMinutes: edit.durationMinutes, durationSource: durationSourceForSave({ touched: true, existing: task }) };
  let next = updateTask(state, ctx, task.id, {
    title: edit.title.trim(),
    dueDate: edit.dueDate,
    notes: edit.notes === null || edit.notes.trim() === '' ? null : edit.notes.trim(),
    commitment: edit.commitment,
    ...durationPatch,
  });

  if (edit.repeat !== 'unchanged') {
    const ref: TypedRef<'task'> = { kind: 'task', id: task.id };
    const active = next.recurrences.find((rule) => rule.status === 'active' && rule.about.kind === 'task' && rule.about.id === task.id) ?? null;
    if (edit.repeat === null) {
      if (active !== null) next = setRecurrenceStatus(next, ctx, active.id, 'ended');
    } else if (active === null || active.frequency !== edit.repeat.frequency || active.interval !== edit.repeat.interval) {
      if (active !== null) next = setRecurrenceStatus(next, ctx, active.id, 'ended');
      const repeating = addRecurrence(next, ctx, ref, { trigger: 'schedule', frequency: edit.repeat.frequency, interval: edit.repeat.interval, anchorDate: edit.dueDate ?? ctx.today });
      if (repeating === next) return refuse(state, 'refused');
      next = repeating;
    }
  }
  return done(next);
}

/** She marks it done. That is all this records: it is not a claim that the physical condition was verified. */
export function markHomeTaskDone(state: AppState, ctx: TransitionContext, taskId: string): HomeChange {
  const task = findTask(state, taskId);
  if (task === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), task)) return refuse(state, 'not_a_home_record');
  if (task.status !== 'open') return refuse(state, 'wrong_state');
  return done(completeTask(state, ctx, taskId));
}

/**
 * "It's due again": a task she marked done comes back as open work. The earlier completion stays in history (it is an
 * append-only observation); this adds a `reopened` observation and clears the completion stamp. It carries NO due date or plan
 * over — a date from the previous round would read as overdue — and it does not decide the next date: that is the rule's, shown
 * separately as "next expected", or hers to set.
 */
export function makeHomeTaskDueAgain(state: AppState, ctx: TransitionContext, taskId: string): HomeChange {
  const task = findTask(state, taskId);
  if (task === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), task)) return refuse(state, 'not_a_home_record');
  if (task.status !== 'completed') return refuse(state, 'wrong_state');
  const reopened: AppState = {
    ...state,
    tasks: state.tasks.map((row) => (row.id === taskId ? { ...row, status: 'open', completedAt: null, dueDate: null, plan: { kind: 'unplanned' }, updatedAt: toInstant(ctx.nowMs) } : row)),
  };
  return done(appendObservation(reopened, ctx, { about: { kind: 'task', id: taskId }, outcome: 'reopened' }));
}

/** Removed from her list. It is kept (archived), and it is NOT completed. */
export function removeHomeTask(state: AppState, ctx: TransitionContext, taskId: string): HomeChange {
  const task = findTask(state, taskId);
  if (task === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), task)) return refuse(state, 'not_a_home_record');
  if (task.status !== 'open') return refuse(state, 'wrong_state');
  return done(archiveTask(state, ctx, taskId));
}

/** "Stop repeating": the rule ends. Its history and every completion stay. */
export function stopHomeRepeating(state: AppState, ctx: TransitionContext, taskId: string): HomeChange {
  const task = findTask(state, taskId);
  if (task === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), task)) return refuse(state, 'not_a_home_record');
  const active = state.recurrences.find((rule) => rule.status === 'active' && rule.about.kind === 'task' && rule.about.id === taskId);
  if (!active) return refuse(state, 'wrong_state');
  return done(setRecurrenceStatus(state, ctx, active.id, 'ended'));
}

// ---------------------------------------------------------------------------------------------------------------- visits

export interface HomeVisitDraft {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  commitment: 'fixed' | 'flexible';
}

const validVisit = (draft: Pick<HomeVisitDraft, 'title' | 'startsAt' | 'endsAt' | 'location' | 'notes'>): boolean =>
  validTitle(draft.title) &&
  validNotes(draft.notes) &&
  (draft.location === null || draft.location.length <= FIELD_LIMITS.locationLength) &&
  Number.isFinite(Date.parse(draft.startsAt)) &&
  Number.isFinite(Date.parse(draft.endsAt)) &&
  epochMsOf(draft.endsAt) > epochMsOf(draft.startsAt);

const blankToNull = (text: string | null): string | null => (text === null || text.trim() === '' ? null : text.trim());

/**
 * A service visit or appointment: a canonical commitment (an event) in the Home context. Scheduling it says nothing about whether
 * it was booked with anyone, that anyone came, or what they found.
 */
export function createHomeVisit(state: AppState, ctx: TransitionContext, draft: HomeVisitDraft): HomeChange {
  const context = homeContextOf(state);
  if (context.kind === 'missing') return refuse(state, 'no_home_context');
  if (context.kind === 'archived') return refuse(state, 'context_archived');
  if (!validVisit(draft)) return refuse(state, 'invalid_input');
  return done(
    addEvent(state, ctx, {
      title: draft.title.trim(),
      categoryId: context.category.id,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      commitment: draft.commitment,
      location: blankToNull(draft.location),
      notes: blankToNull(draft.notes),
      scope: 'household',
    })
  );
}

export interface HomeVisitEdit extends HomeVisitDraft {
  eventId: string;
  basedOn: Baseline;
}

const findEvent = (state: AppState, eventId: string) => state.events.find((event) => event.id === eventId) ?? null;

export function updateHomeVisit(state: AppState, ctx: TransitionContext, edit: HomeVisitEdit): HomeChange {
  const event = findEvent(state, edit.eventId);
  if (event === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), event)) return refuse(state, 'not_a_home_record');
  if (eventFingerprint(event) !== edit.basedOn.fingerprint) return refuse(state, 'stale');
  if (!validVisit(edit)) return refuse(state, 'invalid_input');
  // No `categoryId` in the patch: an edit cannot move a visit out of Home.
  return done(
    updateEvent(state, ctx, event.id, {
      title: edit.title.trim(),
      startsAt: edit.startsAt,
      endsAt: edit.endsAt,
      commitment: edit.commitment,
      location: blankToNull(edit.location),
      notes: blankToNull(edit.notes),
    })
  );
}

export function removeHomeVisit(state: AppState, ctx: TransitionContext, eventId: string): HomeChange {
  const event = findEvent(state, eventId);
  if (event === null) return refuse(state, 'not_found');
  if (!isHomeRecord(homeContextOf(state), event)) return refuse(state, 'not_a_home_record');
  if (event.status !== 'active') return refuse(state, 'wrong_state');
  return done(removeEvent(state, ctx, eventId));
}

// ------------------------------------------------------------------------------------------------------- responsibility

/**
 * The only responsibility transitions Home invokes: ask, record "seen", record "yes", record "no", take it back. It does not
 * invoke `completeResponsibility` (a handoff finishing is not the work verified), `reassign`, or anything about people.
 */
export interface HolderChoice {
  kind: 'person' | 'child';
  id: string;
}

const homeAbout = (state: AppState, about: TypedRef<ContentRefKind>): boolean => {
  const context = homeContextOf(state);
  if (about.kind === 'task') {
    const task = findTask(state, about.id);
    return task !== null && task.status === 'open' && isHomeRecord(context, task);
  }
  if (about.kind === 'event') {
    const event = findEvent(state, about.id);
    return event !== null && event.status === 'active' && isHomeRecord(context, event);
  }
  return false;
};

export function askSomeone(state: AppState, ctx: TransitionContext, input: { about: TypedRef<'task' | 'event'>; holder: HolderChoice; ackWithinMinutes?: number | null }): HomeChange {
  if (!homeAbout(state, input.about)) return refuse(state, 'not_a_home_record');
  if (liveResponsibilityFor(state, input.about) !== null) return refuse(state, 'already_delegated');
  const validHolder = input.holder.kind === 'person' ? state.people.some((person) => person.id === input.holder.id && person.status === 'active') : state.children.some((child) => child.id === input.holder.id);
  if (!validHolder) return refuse(state, 'invalid_holder');
  // `stillNeedsMe: true` — while a request is out it still needs her. Asking is not covering.
  const next = delegate(state, ctx, { about: input.about, to: input.holder, ackWithinMinutes: input.ackWithinMinutes ?? null, stillNeedsMe: true });
  return next === state ? refuse(state, 'refused') : done(next);
}

const responsibilityAbout = (state: AppState, responsibilityId: string) => {
  const responsibility = state.responsibilities.find((row) => row.id === responsibilityId);
  if (!responsibility) return null;
  const about = responsibility.about;
  return (about.kind === 'task' || about.kind === 'event') && homeAbout(state, about as TypedRef<'task' | 'event'>) ? responsibility : null;
};

export function recordSeen(state: AppState, ctx: TransitionContext, responsibilityId: string): HomeChange {
  const responsibility = responsibilityAbout(state, responsibilityId);
  if (responsibility === null) return refuse(state, 'not_a_home_record');
  if (responsibility.state !== 'requested') return refuse(state, 'nothing_to_answer');
  return done(acknowledge(state, ctx, responsibilityId));
}

/**
 * They said yes. `stillNeedsMe` is REQUIRED: the domain's own default (`false`) would read as "it no longer needs her" without
 * her having said so. Only her explicit `false` lets the shared semantics call it covered.
 */
export function recordAccepted(state: AppState, ctx: TransitionContext, input: { responsibilityId: string; stillNeedsMe: boolean }): HomeChange {
  const responsibility = responsibilityAbout(state, input.responsibilityId);
  if (responsibility === null) return refuse(state, 'not_a_home_record');
  if (responsibility.state !== 'requested' && responsibility.state !== 'acknowledged') return refuse(state, 'nothing_to_answer');
  return done(accept(state, ctx, input.responsibilityId, input.stillNeedsMe));
}

export function recordDeclined(state: AppState, ctx: TransitionContext, responsibilityId: string): HomeChange {
  const responsibility = responsibilityAbout(state, responsibilityId);
  if (responsibility === null) return refuse(state, 'not_a_home_record');
  if (responsibility.state !== 'requested' && responsibility.state !== 'acknowledged') return refuse(state, 'nothing_to_answer');
  return done(decline(state, ctx, responsibilityId));
}

export function takeBack(state: AppState, ctx: TransitionContext, responsibilityId: string): HomeChange {
  const responsibility = responsibilityAbout(state, responsibilityId);
  if (responsibility === null) return refuse(state, 'not_a_home_record');
  const next = returnToSelf(state, ctx, responsibilityId);
  return next === state ? refuse(state, 'nothing_to_answer') : done(next);
}

// -------------------------------------------------------------------------------------------------------------- the area

/** Restore an archived Home area. The one shared category action Home offers, and only for the Home context itself. */
export function restoreHomeArea(state: AppState): HomeChange {
  const context = homeContextOf(state);
  if (context.kind === 'missing') return refuse(state, 'no_home_context');
  if (context.kind === 'active') return refuse(state, 'wrong_state');
  return done(restoreCategory(state, context.category.id));
}

// ----------------------------------------------------------------------------------------------------------------- commit

export type HomeSaveResult = { ok: true } | { ok: false; reason: HomeRefusal | 'not_saved' };

/** The slice of the household store a save needs. */
export interface CommitTarget {
  commit(transition: (state: AppState, ctx: TransitionContext) => AppState): Promise<boolean>;
}

/**
 * Commit a Home change through the production store. `store.commit` resolves true when a transition leaves state unchanged, so a
 * REFUSAL (a stale edit, a record outside Home) is reported here by the change itself — it must never be shown as "saved".
 */
export async function commitHomeChange(store: CommitTarget, work: (state: AppState, ctx: TransitionContext) => HomeChange): Promise<HomeSaveResult> {
  let refusal: HomeRefusal | null = null;
  const saved = await store.commit((state, ctx) => {
    const change = work(state, ctx);
    refusal = change.refusal;
    return change.state;
  });
  if (refusal !== null) return { ok: false, reason: refusal };
  return saved ? { ok: true } : { ok: false, reason: 'not_saved' };
}

/**
 * Double-save protection. Whatever the first call returns is what every later call returns until it has finished; once a save has
 * succeeded, further calls return that success without running again — so a second tap can never create a second task.
 * A failed save releases the guard so she can try again.
 */
export function createSubmitGuard() {
  let running: Promise<HomeSaveResult> | null = null;
  let saved: HomeSaveResult | null = null;
  return {
    run(save: () => Promise<HomeSaveResult>): Promise<HomeSaveResult> {
      if (saved !== null) return Promise.resolve(saved);
      if (running !== null) return running;
      running = save()
        .then((result) => {
          if (result.ok) saved = result;
          return result;
        })
        .finally(() => {
          running = null;
        });
      return running;
    },
  };
}
