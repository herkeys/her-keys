import type { Interpretation } from '../../../domain/foundation/interpretation';
import { parseMoney, type MoneyDirection } from '../../../domain/foundation/money';
import { addDays, epochMsOf, logicalDateAt, wallClockMinutesAt, type LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { formatDay } from './format';
import { findTimeExpressions } from './local/temporal';
import type { ProposalKind, ProposalPatch } from './types';

/**
 * The "Fix it" sheet as a pure function of two shapes: what the reading says now, and what she typed.
 * A structured edit produces a `ProposalPatch` — the SAME shape a clarification answer and a
 * natural-language correction produce — so there is one operation, "user corrected this proposal", and this
 * file is only one of the ways she can express it.
 */

export interface FixForm {
  title: string;
  kind: ProposalKind;
  date: LocalDate | null;
  timeText: string;
  amountText: string;
  direction: MoneyDirection | null;
  /** 'child:<id>', 'none' or null (untouched). */
  subject: string | null;
}

export function formatClockInput(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes % 60).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

export function initialForm(reading: Interpretation, state: Pick<AppState, 'user'>): FixForm {
  const tz = state.user.timezone;
  const startMs = reading.startsAt !== null ? epochMsOf(reading.startsAt) : null;
  return {
    title: reading.title,
    kind: reading.proposedKind,
    date: startMs !== null ? logicalDateAt(startMs, tz) : reading.dueDate,
    timeText: startMs !== null ? formatClockInput(wallClockMinutesAt(startMs, tz)) : '',
    amountText: reading.value ? `${Math.floor(reading.value.amountMinor / 100)}.${String(reading.value.amountMinor % 100).padStart(2, '0')}` : '',
    direction: reading.value?.direction ?? null,
    subject: reading.subjectMemberId ? `child:${reading.subjectMemberId}` : null,
  };
}

/** "3:30 pm", "3pm", "15:00", "noon"; a bare "3" is read as "at 3". */
export function parseClockInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const found = findTimeExpressions(trimmed)[0] ?? findTimeExpressions(`at ${trimmed}`)[0];
  return found ? found.startMinutes : null;
}

export type FormResult = { kind: 'patch'; patch: ProposalPatch } | { kind: 'unchanged' } | { kind: 'error'; field: 'time' | 'amount' | 'kind' };

/** Only what she changed becomes part of the patch: leaving a field alone never rewrites it. */
export function patchFromForm(form: FixForm, initial: FixForm): FormResult {
  const patch: ProposalPatch = {};

  if (form.title.trim() !== initial.title) patch.title = form.title;
  if (form.kind !== initial.kind) patch.kind = form.kind;
  if (form.date !== initial.date) patch.date = form.date;

  if (form.timeText.trim() !== initial.timeText.trim()) {
    const minutes = parseClockInput(form.timeText);
    if (minutes === null) return { kind: 'error', field: 'time' };
    patch.timeMinutes = minutes;
  }

  const amountChanged = form.amountText.trim() !== initial.amountText.trim() || form.direction !== initial.direction;
  if (amountChanged) {
    if (form.amountText.trim() === '') patch.amount = null;
    else {
      if (form.direction === null) return { kind: 'error', field: 'amount' };
      const money = parseMoney(form.amountText.replace(/[$,\s]/g, ''), 'USD', form.direction);
      if (money === null) return { kind: 'error', field: 'amount' };
      patch.amount = money;
    }
  }

  if (form.subject !== initial.subject && form.subject !== null) {
    patch.subject = form.subject === 'none' ? { kind: 'none' } : { kind: 'child', memberId: form.subject.slice('child:'.length) };
  }

  // Turning a note or to-do into an appointment needs a day and a time from her; nothing is invented to fill the gap.
  if (form.kind === 'event' && initial.kind !== 'event' && (form.date === null || parseClockInput(form.timeText) === null)) return { kind: 'error', field: 'kind' };

  return Object.keys(patch).length === 0 ? { kind: 'unchanged' } : { kind: 'patch', patch };
}

/** The days offered as choices: today, tomorrow, then the next few, each labelled the way the rest of the screen labels them. */
export function dayChoices(today: LocalDate, count = 8): Array<{ date: LocalDate; label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    return { date, label: formatDay(date, today) };
  });
}
