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

// ------------------------------------------------------------------------------------------------------------
// Sentences whose honesty depends on a foundation contract, said in ONE place so no screen can say them harder.
// ------------------------------------------------------------------------------------------------------------

/**
 * WHAT A COMMITMENT WAS WAITING ON, WHEN THAT IS GONE (HA-009 — REMOVED != COMPLETED, MISSING != SATISFIED).
 *
 * Said only when a commitment's prerequisites are ALL retired or missing (readiness `needsReview`) and nothing live is
 * left to wait for. It is neutral on purpose: it does not say the prerequisite was finished or handled, it does not say
 * the commitment needs anything, and it does not say the commitment is ready. It says one true thing and leaves the
 * choice with her. An edge Her Keys inferred and she has not confirmed is a possibility, so it is said as one.
 */
export const RETIRED_PREREQUISITE = {
  stated: 'It was waiting on something that’s no longer there.',
  unconfirmed: 'It may have been waiting on something that’s no longer there.',
} as const;

export const retiredPrerequisiteLine = (unconfirmed: boolean): string =>
  unconfirmed ? RETIRED_PREREQUISITE.unconfirmed : RETIRED_PREREQUISITE.stated;
