import { daysBetween, parseLocalDate, weekdayOf, type LocalDate } from '../../domain/logicalDay';

/**
 * PEOPLE OS — every user-facing word (HK-FEATURE-13), in one place so the copy-safety test can read all of it.
 *
 * Paper and ink: plain facts about explicit work. Nothing here moralises a relationship, ranks a person, counts contact, or tells her
 * to reach out. A verdict speaks only of follow-ups SHE created.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "One", "Two" … "Ten", then digits. Sentence-initial. */
export const countWord = (n: number): string => (n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));

/** A calendar date relative to today, in words: "today", "tomorrow", "Friday" (this week), otherwise "Sep 26". */
export function formatFollowUpDate(date: LocalDate, today: LocalDate): string {
  const delta = daysBetween(today, date);
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta === -1) return 'yesterday';
  if (delta > 1 && delta < 7) return WEEKDAYS[weekdayOf(date)];
  const { month, day } = parseLocalDate(date);
  return `${MONTHS[month - 1]} ${day}`;
}

export const peopleCopy = {
  title: 'People',
  subtitle: 'The people in your life, and what you want Her Keys to remember about them.',
  empty: 'Add someone you want Her Keys to remember.',
  addPerson: 'Add someone',

  sections: {
    needsFollowUp: 'Needs follow-up',
    people: 'People',
    recentlyUpdated: 'Recently updated',
    archived: 'Archived',
  },

  verdict: {
    attention: (n: number) => (n === 1 ? 'One follow-up needs attention.' : `${countWord(n)} follow-ups need attention.`),
    next: (when: string) => `Next follow-up: ${when}.`,
    nothing: 'Nothing needs attention.',
  },

  tile: {
    label: 'People',
    people: (n: number) => (n === 1 ? '1 person' : `${n} people`),
    none: 'Nothing needs attention',
  },

  seeAll: (n: number) => `See all ${n}`,

  followUp: {
    due: (when: string) => `Follow-up due ${when}.`,
    overdue: (when: string) => `Follow-up was due ${when}.`,
    undated: 'No date set.',
    completed: 'Done.',
    add: 'Add a follow-up',
    titleLabel: 'What do you want to do?',
    titleHint: 'For example: call, send the forms, ask about Saturday.',
    dueLabel: 'Date (optional)',
    save: 'Save follow-up',
    cancel: 'Cancel',
    privateNote: 'Private to you. Nobody else in your household sees this follow-up.',
  },

  kind: {
    child: 'Child',
    coParent: 'Co-parent',
  },

  detail: {
    relationshipLabel: 'Short label',
    relationshipHint: 'For example: Mom, Coach, Attorney, Neighbor.',
    organizationLabel: 'Organization (optional)',
    contextNote: 'Private note',
    contextNoteHint: 'Only you see this, and only here.',
    name: 'Name',
    save: 'Save',
    rememberSomething: 'Remember something about them',
    archiveContext: 'Archive what you saved',
    restoreContext: 'Restore',
    archivedContext: 'You archived what you saved about this person. It is kept, and nothing else changed.',
    archivePerson: 'Archive this person',
    restorePerson: 'Restore this person',
    archivedPerson: 'This person is archived. What you saved is kept as it was.',
    readOnlyCoParent: 'Their details are managed in Co-Parent.',
    readOnlyChild: 'Their details are managed in Kids.',
    noFollowUps: 'No follow-ups.',
  },

  add: {
    title: 'Add someone',
    nameLabel: 'Name',
    save: 'Add',
  },

  refusal: {
    invalid_name: 'A name needs 1 to 80 characters on one line.',
    invalid_label: 'A short label is up to 60 characters (an organization up to 80), on one line.',
    invalid_note: 'A private note is up to 500 characters.',
    invalid_title: 'Say what the follow-up is, in up to 200 characters.',
    invalid_date: 'That date could not be read.',
    invalid_draft: 'This follow-up could not be saved. Please try again.',
    no_category: 'Your Relationships area is archived or missing, so a follow-up has nowhere to go.',
    context_archived: 'Restore what you saved about this person first.',
    person_unavailable: 'This person is archived.',
    read_only_identity: 'Their details are managed in Co-Parent.',
    not_found: 'This person is no longer in Her Keys.',
    not_saved: 'That could not be saved on this device. Nothing was changed.',
  },
} as const;
