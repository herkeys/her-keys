import { durationKnowledgeOf } from '../../../domain/foundation/duration';
import type { RecurrenceRule } from '../../../domain/foundation/structure';
import { epochMsOf, isLocalDate, logicalDateAt, toInstant, wallClockMinutesAt, zonedTimeToEpochMs, type LocalDate } from '../../../domain/logicalDay';
import { FIELD_LIMITS, type CalendarEvent, type Task } from '../../../domain/state';
import type { Baseline, HomeRepeat, HomeTaskDraft, HomeTaskEdit, HomeVisitDraft, HomeVisitEdit } from './mutations';
import { taskBaselineOf, visitBaselineOf } from './mutations';

/**
 * FORM RULES — the text she types, turned into a Home draft or a message, with no React in it.
 *
 * The rules that matter here are about TRUTH, not layout:
 *   - a duration she did not touch is never sent as hers (a blank or untouched field means "leave it / use the default");
 *   - an edit only sends what she changed, so it cannot upgrade provenance or overwrite a rule Home cannot represent;
 *   - a repeat Home cannot express (after-completion, manual — created elsewhere) is LOCKED, shown as it is, never overwritten.
 */

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ------------------------------------------------------------------------------------------------------------------ task

export type RepeatChoice = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface TaskFormValues {
  title: string;
  dueText: string;
  durationText: string;
  /** She edited the duration field. A prefilled number she never touched is not something she said. */
  durationTouched: boolean;
  notes: string;
  commitment: 'fixed' | 'flexible';
  repeat: RepeatChoice;
  intervalText: string;
  repeatTouched: boolean;
  /** The task repeats in a way Home cannot express; the control is not offered and the rule is left exactly as it is. */
  repeatLocked: boolean;
}

export function taskFormInitial(existing: Task | null, rule: RecurrenceRule | null): TaskFormValues {
  const base: TaskFormValues = { title: '', dueText: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', repeat: 'none', intervalText: '1', repeatTouched: false, repeatLocked: false };
  const repeatable = rule !== null && rule.status === 'active';
  const expressible = repeatable && rule.trigger === 'schedule' && rule.frequency !== null;
  const repeat: Pick<TaskFormValues, 'repeat' | 'intervalText' | 'repeatLocked'> = !repeatable
    ? { repeat: 'none', intervalText: '1', repeatLocked: false }
    : expressible
      ? { repeat: rule.frequency as RepeatChoice, intervalText: String(rule.interval), repeatLocked: false }
      : { repeat: 'none', intervalText: '1', repeatLocked: true };
  if (existing === null) return base;
  return {
    ...base,
    title: existing.title,
    dueText: existing.dueDate ?? '',
    durationText: String(existing.durationMinutes),
    notes: existing.notes ?? '',
    commitment: existing.commitment,
    ...repeat,
  };
}

/** What may be said about the number in the duration box. It never claims more than the record does. */
export function durationHint(existing: Task | null): string {
  if (existing === null) return 'Optional. Leave it blank and Her Keys plans with 15 minutes and marks that as an estimate.';
  switch (durationKnowledgeOf(existing)) {
    case 'user-provided':
      return 'You entered this.';
    case 'default-estimate':
      return 'A planning estimate, not from you. Change it to make it yours.';
    case 'inferred-estimate':
      return 'Estimated by Her Keys. Change it to make it yours.';
    default:
      return 'How this number got here isn’t recorded. Change it to make it yours.';
  }
}

const WHOLE = /^\d+$/;

export function parseTaskForm(values: TaskFormValues, mode: { kind: 'create' } | { kind: 'edit'; taskId: string; basedOn: Baseline }): FormResult<HomeTaskDraft | HomeTaskEdit> {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, error: 'Give it a title.' };
  if (title.length > FIELD_LIMITS.titleLength) return { ok: false, error: `The title can be up to ${FIELD_LIMITS.titleLength} characters.` };
  const due = values.dueText.trim();
  if (due !== '' && !isLocalDate(due)) return { ok: false, error: 'Due date should look like YYYY-MM-DD, or be left blank.' };
  if (values.notes.length > FIELD_LIMITS.notesLength) return { ok: false, error: `Notes can be up to ${FIELD_LIMITS.notesLength} characters.` };

  // Only a number she typed is sent, and only if she touched the field. Blank or untouched: nothing is sent, so nothing is claimed.
  let durationMinutes: number | undefined;
  const typed = values.durationText.trim();
  if (values.durationTouched && typed !== '') {
    const minutes = Number(typed);
    if (!WHOLE.test(typed) || !Number.isInteger(minutes) || minutes > FIELD_LIMITS.durationMinutes) return { ok: false, error: `Minutes should be a whole number from 0 to ${FIELD_LIMITS.durationMinutes}.` };
    durationMinutes = minutes;
  }

  let repeat: HomeRepeat | null = null;
  if (values.repeat !== 'none' && !values.repeatLocked) {
    const interval = Number(values.intervalText.trim());
    if (!WHOLE.test(values.intervalText.trim()) || interval < 1 || interval > 366) return { ok: false, error: 'How often should be a whole number from 1 to 366.' };
    repeat = { frequency: values.repeat, interval };
  }

  const shared = { title, dueDate: (due === '' ? null : due) as LocalDate | null, notes: values.notes.trim() === '' ? null : values.notes.trim(), commitment: values.commitment, ...(durationMinutes === undefined ? {} : { durationMinutes }) };
  if (mode.kind === 'create') return { ok: true, value: { ...shared, repeat } };
  const edit: HomeTaskEdit = { ...shared, taskId: mode.taskId, basedOn: mode.basedOn, repeat: values.repeatLocked || !values.repeatTouched ? 'unchanged' : repeat };
  return { ok: true, value: edit };
}

export const taskEditorBaseline = (existing: Task | null): Baseline | null => (existing === null ? null : taskBaselineOf(existing));

// ----------------------------------------------------------------------------------------------------------------- visit

export interface VisitFormValues {
  title: string;
  dateText: string;
  startText: string;
  endText: string;
  location: string;
  notes: string;
  commitment: 'fixed' | 'flexible';
}

/** "09:30" -> minutes after midnight, or null when it is not a clock time. */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function clockOf(instant: string, timeZone: string): string {
  const minutes = wallClockMinutesAt(epochMsOf(instant), timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function visitFormInitial(existing: CalendarEvent | null, timeZone: string, today: LocalDate): VisitFormValues {
  if (existing === null) return { title: '', dateText: today, startText: '09:00', endText: '10:00', location: '', notes: '', commitment: 'fixed' };
  return {
    title: existing.title,
    dateText: logicalDateAt(epochMsOf(existing.startsAt), timeZone),
    startText: clockOf(existing.startsAt, timeZone),
    endText: clockOf(existing.endsAt, timeZone),
    location: existing.location ?? '',
    notes: existing.notes ?? '',
    commitment: existing.commitment,
  };
}

export function parseVisitForm(values: VisitFormValues, timeZone: string, mode: { kind: 'create' } | { kind: 'edit'; eventId: string; basedOn: Baseline }): FormResult<HomeVisitDraft | HomeVisitEdit> {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, error: 'Give the visit a title.' };
  if (title.length > FIELD_LIMITS.titleLength) return { ok: false, error: `The title can be up to ${FIELD_LIMITS.titleLength} characters.` };
  const date = values.dateText.trim();
  if (!isLocalDate(date)) return { ok: false, error: 'Date should look like YYYY-MM-DD.' };
  const start = parseClock(values.startText);
  const end = parseClock(values.endText);
  if (start === null || end === null) return { ok: false, error: 'Times should look like 09:30.' };
  if (end <= start) return { ok: false, error: 'The visit needs to end after it starts.' };
  if (values.location.length > FIELD_LIMITS.locationLength) return { ok: false, error: `Location can be up to ${FIELD_LIMITS.locationLength} characters.` };
  if (values.notes.length > FIELD_LIMITS.notesLength) return { ok: false, error: `Notes can be up to ${FIELD_LIMITS.notesLength} characters.` };

  const draft: HomeVisitDraft = {
    title,
    startsAt: toInstant(zonedTimeToEpochMs(date, start, timeZone)),
    endsAt: toInstant(zonedTimeToEpochMs(date, end, timeZone)),
    location: values.location.trim() === '' ? null : values.location.trim(),
    notes: values.notes.trim() === '' ? null : values.notes.trim(),
    commitment: values.commitment,
  };
  return { ok: true, value: mode.kind === 'create' ? draft : { ...draft, eventId: mode.eventId, basedOn: mode.basedOn } };
}

export const visitEditorBaseline = (existing: CalendarEvent | null): Baseline | null => (existing === null ? null : visitBaselineOf(existing));
