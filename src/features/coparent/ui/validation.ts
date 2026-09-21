import type { FollowUpFields, HandoffFields, PreparationFields } from '../mutations';

/**
 * PRESENCE ONLY.
 *
 * The forms check that a required answer was given at all, and name the same outcome the mutation would (so the same sentence is
 * shown either way). Whether a date is real, a time is valid, an amount parses or a person is still available is decided by the
 * mutation and comes back as a named outcome — this file never second-guesses it.
 */

export type HandoffPresence = 'invalid_child' | 'invalid_title' | 'invalid_date' | 'invalid_time';
export type PreparationPresence = 'invalid_child' | 'invalid_title';
export type FollowUpPresence = 'invalid_title' | 'invalid_currency' | 'invalid_direction' | 'invalid_amount';

const blank = (text: string) => text.trim() === '';

export function handoffPresenceIssue(fields: HandoffFields): HandoffPresence | null {
  if (fields.childId === '') return 'invalid_child';
  if (blank(fields.title)) return 'invalid_title';
  if (blank(fields.date)) return 'invalid_date';
  if (blank(fields.startTime) || blank(fields.endTime)) return 'invalid_time';
  return null;
}

export function preparationPresenceIssue(fields: PreparationFields): PreparationPresence | null {
  if (fields.childId === '') return 'invalid_child';
  if (blank(fields.title)) return 'invalid_title';
  return null;
}

export function followUpPresenceIssue(fields: FollowUpFields): FollowUpPresence | null {
  if (blank(fields.title)) return 'invalid_title';
  if (blank(fields.currency)) return 'invalid_currency';
  if (fields.direction === null) return 'invalid_direction';
  if (blank(fields.amountText)) return 'invalid_amount';
  return null;
}
