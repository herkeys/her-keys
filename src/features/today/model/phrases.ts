import type { ActionCategory, OutcomeKind } from '../../../domain/foundation/authorization';

/**
 * Words for the closed vocabularies Today has to speak about. An intent carries a
 * `summaryCode` — a short machine token, not sentence — so Today never renders it. It
 * says what KIND of thing Her Keys is doing (the category, a closed set of eight),
 * plus the row it is about. `Record<ActionCategory, …>` makes each map total: a ninth
 * category will not compile until someone decides how to say it.
 */

/** "Her Keys would like to ___." */
export const ACTION_VERB: Record<ActionCategory, string> = {
  internal_reminder: 'set a reminder',
  task_change: 'change a task',
  schedule_change: 'change your schedule',
  delegation_request: 'ask someone to take something on',
  outbound_message: 'send a message',
  external_calendar_write: 'add something to an outside calendar',
  external_appointment: 'book an appointment',
  financial_action: 'make a payment',
};

/** What was done, as a noun — the outcome word comes from the design system's action-state presentation. */
export const ACTION_NOUN: Record<ActionCategory, string> = {
  internal_reminder: 'Reminder',
  task_change: 'Task change',
  schedule_change: 'Schedule change',
  delegation_request: 'Request',
  outbound_message: 'Message',
  external_calendar_write: 'Calendar entry',
  external_appointment: 'Appointment',
  financial_action: 'Payment',
};

/**
 * The outcome kinds that mean the action worked. Everything else observed after an
 * execution — `verification_failed`, `declined`, `cancelled`, `expired`, `no_effect` — is
 * NOT success, and Today does not say "handled" for it. `Record<OutcomeKind, boolean>` keeps
 * it total.
 */
export const OUTCOME_IS_SUCCESS: Record<OutcomeKind, boolean> = {
  verified: true,
  verification_failed: false,
  delivered: true,
  acknowledged: true,
  accepted: true,
  declined: false,
  completed: true,
  paid: true,
  cancelled: false,
  followed: true,
  expired: false,
  no_effect: false,
};
