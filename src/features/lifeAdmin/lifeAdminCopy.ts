import type { LifeRecordKind, LifeRecordLinkRelation } from '../../domain/state';

/**
 * Every word Life Admin says. Factual and calm: a date "passed", a record "needs review" — never "expired and unusable",
 * "invalid", "illegal", "overdue", "late", "you forgot", "you're behind" or "you should have". Her Keys says what she recorded
 * and nothing more: it has not checked anything with an issuer and does not hold the document itself.
 * (`tests/lifeAdmin/copyAudit.test.mjs` holds this file, and every rendered surface, to that.)
 */
export const LIFE_ADMIN_COPY = {
  screenTitle: 'Life Admin / Documents',
  hubLabel: 'Life Admin / Documents',

  loading: 'Loading your records…',
  recoveryTitle: 'Your records can’t be shown right now',
  recoveryBody: 'Her Keys couldn’t read what was saved on this device. Nothing was changed.',
  readOnlyNotice: 'Changes can’t be saved on this device right now.',

  emptyTitle: 'Add one record you don’t want to keep track of in your head.',
  emptyBody: 'A title is enough. Dates, numbers and where you keep it can come later, or never.',
  addRecord: 'Add record',
  skip: 'Skip',

  sectionNeedsReview: 'Needs review',
  sectionComingUp: 'Coming up',
  sectionRecords: 'Records',
  sectionArchived: 'Archived',
  seeAll: (total: number) => `See all ${total}`,
  showFewer: 'Show fewer',
  showArchived: (count: number) => `Show archived (${count})`,
  hideArchived: 'Hide archived',

  verdictNothing: 'Nothing needs review.',
  verdictNeedsReview: (count: number) => (count === 1 ? 'One record needs review.' : `${count} records need review.`),
  verdictExpired: (count: number) =>
    count === 1 ? 'One record has passed its recorded expiration date.' : `${count} records have passed their recorded expiration dates.`,
  verdictNext: (title: string, date: string) => `Next: ${title} — ${date}.`,

  hubReview: (count: number) => (count === 1 ? '1 record needs review.' : `${count} records need review.`),
  hubCount: (count: number) => (count === 1 ? '1 record.' : `${count} records.`),
  hubNothing: 'Nothing needs review.',

  renewByToday: 'Renew-by date is today.',
  renewByWas: (date: string) => `Renew-by date was ${date}.`,
  reviewToday: 'Review date is today.',
  reviewWas: (date: string) => `Review date was ${date}.`,
  expiredOn: (date: string) => `Recorded expiration date passed (${date}).`,
  expiresToday: 'Recorded expiration date is today.',
  expiresOn: (date: string) => `Recorded expiration date: ${date}.`,
  renewByOn: (date: string) => `Renew by ${date}.`,
  reviewOn: (date: string) => `Review on ${date}.`,
  issuedOnLine: (date: string) => `Issued ${date}.`,

  openTasks: (count: number) => (count === 1 ? '1 open task' : `${count} open tasks`),
  subjectMissing: 'Child not found on this device',
  archivedOn: (date: string) => `Archived ${date}`,

  // Record detail
  detailTitle: 'Record',
  detailFacts: 'What you recorded. Her Keys hasn’t checked it with anyone, and keeps these details, not the document itself.',
  fieldKind: 'Kind',
  fieldType: 'Type',
  fieldIssuer: 'Issuer',
  fieldReference: 'Reference number',
  fieldIssued: 'Issued',
  fieldExpires: 'Recorded expiration date',
  fieldRenewBy: 'Renew by',
  fieldReviewOn: 'Review on',
  fieldLocation: 'Where it is',
  fieldNote: 'Note',
  fieldAbout: 'About',
  reveal: 'Reveal',
  hide: 'Hide',
  revealHint: 'Shows the full reference number until you leave this record',
  copyUnavailable: 'Copy isn’t available on this device.',
  linkedTasks: 'Tasks from this record',
  noLinkedTasks: 'No tasks yet.',
  taskOpen: 'Open',
  taskOpenDue: (date: string) => `Open · due ${date}`,
  taskDone: 'Done',
  taskArchived: 'Removed',
  taskUnavailable: 'Not on this device',
  addRenewalTask: 'Add renewal task',
  addFollowUp: 'Add follow-up',
  addNextStep: 'Add next step',
  edit: 'Edit',
  archive: 'Archive',
  archiveHint: 'Takes it off your active list. Nothing is deleted, and its tasks stay as they are.',
  restore: 'Restore',
  archivedNotice: 'Archived. It stays here for reference, with its tasks and details.',
  close: 'Close',

  // Record form
  sheetAddTitle: 'Add a record',
  sheetEditTitle: 'Edit record',
  fieldTitle: 'Title',
  fieldTitlePlaceholder: 'Passport, lease, car registration…',
  fieldTypePlaceholder: 'Passport',
  fieldIssuerPlaceholder: 'Who issued it',
  fieldReferencePlaceholder: 'Optional',
  fieldReferenceHelp: 'Shown masked. Don’t store passwords, PINs, card or account numbers, or Social Security numbers here.',
  fieldLocationPlaceholder: 'Blue filing cabinet, school portal…',
  fieldNotePlaceholder: 'A short private note',
  fieldDatePlaceholder: 'YYYY-MM-DD',
  fieldNoChild: 'No one',
  clear: 'Clear',
  optionalDetails: 'More details',
  fewerDetails: 'Fewer details',
  save: 'Save',
  saveChanges: 'Save changes',
  cancel: 'Cancel',

  // Task sheet
  taskSheetTitle: {
    renewal: 'Add a renewal task',
    follow_up: 'Add a follow-up',
    next_step: 'Add a next step',
  } as Record<LifeRecordLinkRelation, string>,
  taskSheetBody: 'This becomes one of your tasks, visible only to you. Nothing is created until you save.',
  taskSuggestedTitle: {
    renewal: (title: string) => `Renew ${title}`,
    follow_up: (title: string) => `Follow up: ${title}`,
    next_step: (title: string) => `Next step: ${title}`,
  } as Record<LifeRecordLinkRelation, (title: string) => string>,
  fieldTaskTitle: 'Task',
  fieldCategory: 'File it under',
  fieldDue: 'Due date (optional)',
  useRenewBy: (date: string) => `Use renew-by date (${date})`,
  fieldMinutes: 'Minutes (optional)',
  addTask: 'Add task',

  // Outcomes
  saved: 'Saved.',
  archivedFlash: 'Archived.',
  restoredFlash: 'Restored.',
  taskAdded: 'Task added.',

  // Refusals: they name the field, never what she typed.
  errSave: 'That didn’t save. Nothing was changed.',
  errStale: 'This record changed somewhere else. Here is the latest version.',
  errGone: 'That record isn’t on this device any more.',
  errFull: 'Her Keys can’t hold more records on this device.',
  errField: {
    title: 'Add a title (up to 200 characters).',
    kind: 'Choose a kind.',
    typeName: 'Type can be up to 60 characters.',
    issuerName: 'Issuer can be up to 120 characters.',
    referenceNumber: 'Reference can be up to 64 characters.',
    issuedOn: 'Use a real date, YYYY-MM-DD.',
    expiresOn: 'Use a real date, YYYY-MM-DD.',
    renewBy: 'Use a real date, YYYY-MM-DD.',
    reviewOn: 'Use a real date, YYYY-MM-DD.',
    locationHint: 'Where it is can be up to 120 characters.',
    note: 'The note can be up to 500 characters.',
    subjectMemberId: 'That child isn’t on this device.',
  } as Record<string, string>,
  errTaskTitle: 'Add a title for the task.',
  errTaskCategory: 'Choose where to file it.',
  errTaskDate: 'Use a real date, YYYY-MM-DD.',
  errTaskMinutes: 'Minutes must be a whole number from 1 to 1440.',
  errTaskArchived: 'Restore this record before adding a task.',
  errTaskFull: 'Her Keys can’t hold more tasks on this device.',
} as const;

export const KIND_CHOICES: readonly LifeRecordKind[] = ['document', 'credential', 'policy', 'registration', 'reference', 'other'];

export const KIND_LABEL: Record<LifeRecordKind, string> = {
  document: 'Document',
  credential: 'Credential',
  policy: 'Policy',
  registration: 'Registration',
  reference: 'Reference',
  other: 'Other',
};
