import type { PaymentMechanism } from '../../domain/foundation/commitment';

/**
 * Every word the Money screen says. Kept in one place, mirroring meals/mealCopy.ts, so the
 * copy-truth audit can read it mechanically.
 *
 * The rules this copy keeps: due is never worded as paid; expected is never worded as received;
 * an autopay obligation is never told "failed" or "cleared" — only "confirm cleared", since Her
 * Keys has no evidence either way; Money is never a grade, a score or a streak.
 */

export const MECHANISM_LABEL: Record<Exclude<PaymentMechanism, null>, string> = {
  manual: 'Manual',
  autopay: 'Autopay',
};

export const MONEY_COPY = {
  // top-level verdict lives in projection.ts (buildMoneyHomeView) — deterministic, not hand-authored copy

  // sections
  sectionNeedsAttention: 'Needs attention',
  sectionComingUp: 'Coming up',
  sectionExpectedIn: 'Expected in',
  sectionLater: 'Later',
  sectionOutstandingReimbursements: 'Outstanding reimbursements',
  sectionRecentlyResolved: 'Recently resolved',
  sectionOtherOpenTasks: 'Other open tasks',
  showMore: (count: number) => `Show ${count} more`,

  // actions
  addObligation: 'Add a bill',
  addIncome: 'Add expected income',
  addObligationHint: 'Records something the household owes.',
  addIncomeHint: 'Records money you expect to receive.',

  // empty states — calm, factual, never gamified
  noAttentionEmpty: 'Nothing needs attention.',
  noComingUp: 'Nothing due in the next two weeks.',
  noExpectedIn: 'Nothing expected in the next two weeks.',
  noOutstandingReimbursements: 'No outstanding reimbursements.',
  noRecentlyResolved: 'Nothing resolved recently.',

  // sheet
  sheetAddObligationTitle: 'Add a bill',
  sheetEditObligationTitle: 'Edit this bill',
  sheetAddIncomeTitle: 'Add expected income',
  sheetEditIncomeTitle: 'Edit this expected income',
  fieldTitle: 'What is it',
  fieldTitlePlaceholder: 'Car insurance',
  fieldAmount: 'Amount',
  fieldAmountPlaceholder: '0.00',
  fieldDueDateObligation: 'Due date',
  fieldDueDateIncome: 'Expected date',
  fieldMechanism: 'How this is paid',
  fieldChild: 'About a child (optional)',
  fieldNotes: 'Notes (optional)',
  cancel: 'Cancel',
  save: 'Save',
  saveChanges: 'Save changes',

  // resolution
  markPaid: 'Mark paid',
  markReceived: 'Mark received',
  cancelObligation: 'Cancel this bill',
  cancelIncome: 'No longer expected',
  duplicateForward: 'Add the next one',

  // status lines
  statusOpenObligation: (dueDate: string, pastDue: boolean) => (pastDue ? `Overdue since ${dueDate}` : `Due ${dueDate}`),
  statusOpenIncome: (dueDate: string, pastDue: boolean) => (pastDue ? `Expected since ${dueDate}, not yet received` : `Expected ${dueDate}`),
  statusResolvedObligation: 'Paid',
  statusResolvedIncome: 'Received',
  statusCancelledObligation: 'Cancelled',
  statusCancelledIncome: 'No longer expected',
  autopayConfirmCleared: 'Her Keys has no record showing whether this cleared.',

  // reimbursements — the F07 mapping, worded exactly per doctrine (see HK_FEATURE_09_MONEY.md)
  reimbursementNotFollowedUp: 'Not yet followed up',
  reimbursementRequested: 'Requested',
  reimbursementAcknowledged: 'Acknowledged',
  reimbursementAccepted: 'Accepted — not yet paid',
  reimbursementDeclined: 'Declined',
  reimbursementMarkedDone: "Marked done. Her Keys has no record of a payment.",
  reimbursementPaid: 'Paid',

  // validation
  errTitle: 'Give it a short description.',
  errAmount: 'Enter an amount greater than zero.',
  errDate: 'Enter a valid date.',
  errChild: 'That child could not be found.',
  errStale: 'This changed somewhere else. Here is the latest version.',
  errSave: "That couldn't be saved. Nothing changed.",
  errGone: 'This is no longer here.',

  // gate
  loading: 'Getting your money picture ready…',
  recoveryTitle: "Money can't show your picture right now.",
  recoveryBody: "Her Keys couldn't use what was saved on this device, so it started fresh. Nothing shown here is a record of your money.",
  readOnlyNotice: "Changes can't be saved right now.",
} as const;
