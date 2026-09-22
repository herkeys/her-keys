import type { LocalDate } from '../../domain/logicalDay';

/**
 * CO-PARENT LOGISTICS — view-model types.
 *
 * Everything here is DERIVED from canonical household state by `buildCoParentLogisticsView`; nothing here is stored, nothing is a
 * second copy of a fact, and nothing describes presentation. Identity is always a canonical id (child id, person id, event id,
 * task id, responsibility id) — never a display name.
 */

export interface Clock {
  nowMs: number;
  /** The device's own zone, used ONLY to decide whether to say "times are shown in your household zone". Never used to place a time. */
  deviceTimeZone?: string | null;
}

// ----------------------------------------------------------------------------------------------------------- identity

export type ChildRef =
  | { status: 'known'; childId: string; displayName: string }
  | { status: 'not_recorded' }
  /** The id does not name a current child (`missing`) or names the adult account user (`not_a_child`). Never re-attached, never matched by name. */
  | { status: 'unavailable'; childId: string; cause: 'missing' | 'not_a_child' };

export type PersonStanding = 'active' | 'archived' | 'missing';

export interface CounterpartRef {
  personId: string;
  /** The person's own recorded name. */
  displayName: string;
  /** Unique across the household even when two people share a name (relationship, then add-order, are appended). */
  label: string;
  /** Only what the person's recorded relationship supports ("Co-parent", "Caregiver", "grandparent"); null = show the name alone. */
  relationshipLabel: string | null;
  standing: PersonStanding;
}

// ------------------------------------------------------------------------------------------------------ responsibility

export type ResponsibilityStage =
  | 'none_recorded'
  | 'with_you'
  /** Somebody is recorded as holding it, and NO request is recorded (`owned` with a non-self holder). Assigned is not requested. */
  | 'assigned'
  | 'requested'
  | 'acknowledged'
  | 'accepted'
  | 'declined'
  | 'completed';

/** `covered` only when accepted AND she said it no longer needs her AND the person is still available. Everything else is a different word. */
export type Coverage = 'unknown' | 'not_covered' | 'covered' | 'completed' | 'needs_review';

export interface RequestEvidence {
  /** A real, succeeded execution of a delegation/outbound-message intent about this record. Almost always false today. */
  sent: boolean;
  /** A real `delivered` outcome under such an execution. */
  delivered: boolean;
}

export interface ResponsibilityView {
  responsibilityId: string | null;
  /** Who holds it: nobody recorded, her, a person outside the household, or one of the children. */
  holder: 'none' | 'self' | 'person' | 'child';
  holderChild: ChildRef | null;
  stage: ResponsibilityStage;
  coverage: Coverage;
  counterpart: CounterpartRef | null;
  stillNeedsMe: boolean | null;
  /** The shared `isUnacknowledged`: requested, never answered, and past the time an answer was due. */
  answerOverdue: boolean;
  requestedAt: string | null;
  acknowledgedAt: string | null;
  respondedAt: string | null;
  completedAt: string | null;
  returnedAt: string | null;
  evidence: RequestEvidence;
  /** Every stage above is something SHE recorded. Kept explicit so no presentation can drop it. */
  recordedBy: 'you';
}

// ------------------------------------------------------------------------------------------------------ preparation

export type PrepStanding = 'open' | 'done' | 'removed' | 'missing';

export interface PrepItemView {
  taskId: string;
  title: string;
  child: ChildRef;
  dueDate: LocalDate | null;
  standing: PrepStanding;
  completedAt: string | null;
  /** The handoff this is tied to by an active `requires` edge, or null. Never inferred. */
  linkedTransitionId: string | null;
  linkedTransitionRemoved: boolean;
  dependencyId: string | null;
}

export type PrepReadiness = 'no_prep_recorded' | 'waiting_on_prep' | 'all_marked_done' | 'needs_review';

export interface PreparationSummary {
  linked: number;
  open: number;
  done: number;
  unavailable: number;
  readiness: PrepReadiness;
  items: PrepItemView[];
}

// -------------------------------------------------------------------------------------------------------- transitions

export type ReviewReason =
  | 'child_not_recorded'
  | 'child_unavailable'
  | 'counterpart_unavailable'
  | 'preparation_unavailable'
  | 'handoff_removed';

export type UnknownFact =
  | 'child_not_recorded'
  | 'location_not_recorded'
  | 'counterpart_not_recorded'
  | 'preparation_not_recorded'
  | 'needs_you_not_recorded'
  | 'outcome_not_recorded';

export interface RepeatView {
  ruleId: string;
  status: 'active' | 'paused';
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday: number[] | null;
  byMonthDay: number | null;
  anchorDate: LocalDate;
  timezone: string;
}

export type TimeStatus = 'upcoming' | 'in_progress' | 'past';

export type AttentionSection = 'needs_review' | 'needs_me' | 'waiting' | 'none';

export type NeedsMeReason = 'marked_needs_you' | 'back_with_you' | 'answer_overdue' | 'accepted_still_needs_you';

export interface TransitionView {
  /** The canonical event id. The ONE identity of a handoff; every section refers to it by this id. */
  id: string;
  title: string;
  child: ChildRef;
  startsAtMs: number;
  endsAtMs: number;
  /** `recorded`: the event's own row. `repeat_pattern`: a date derived from the recorded rule — it has no row of its own. */
  occurrence: 'recorded' | 'repeat_pattern';
  recordedStartsAt: string;
  recordedLocalDate: LocalDate;
  localDate: LocalDate;
  minutesOfDay: number;
  hasLocation: boolean;
  timeStatus: TimeStatus;
  /** `removed` = she removed the handoff. Removed is not completed and not "did not happen". */
  lifecycle: 'active' | 'removed';
  needsMe: boolean | null;
  needsMeReasons: NeedsMeReason[];
  responsibility: ResponsibilityView;
  preparation: PreparationSummary;
  repeat: RepeatView | null;
  review: ReviewReason[];
  unknowns: UnknownFact[];
  /** Which single section this handoff belongs to. It is still ONE object; sections hold ids. */
  section: AttentionSection;
  /** True when the row's scope is owner-only (personal, professional, coparent-shared). False = say nothing about visibility. */
  ownerOnly: boolean;
}

// ----------------------------------------------------------------------------------------------------------- money

export interface MoneyAmountView {
  amountMinor: number;
  currency: string;
  /** Exact decimal string ("80.00"), never a float. */
  decimal: string;
  direction: 'inflow' | 'outflow';
}

export type FollowUpStanding = 'open' | 'done' | 'removed';

export interface MoneyFollowUpView {
  taskId: string;
  title: string;
  child: ChildRef;
  amount: MoneyAmountView;
  followUpDate: LocalDate | null;
  standing: FollowUpStanding;
  completedAt: string | null;
  responsibility: ResponsibilityView;
  /** `service_reported_paid` ONLY when a real `paid` outcome sits under an execution of an intent about this task. */
  paymentEvidence: 'none' | 'service_reported_paid';
  review: ReviewReason[];
}

// ---------------------------------------------------------------------------------------------------------- sections

export interface CompletedEntry {
  kind: 'task' | 'responsibility';
  id: string;
  title: string;
  child: ChildRef;
  completedAt: string;
  /** For a task: whether it was an amount-bearing follow-up. */
  followUp: boolean;
  counterpart: CounterpartRef | null;
}

export interface PrepGroup {
  child: ChildRef;
  items: PrepItemView[];
}

export type BlockedReason = 'no_child' | 'no_category' | 'category_archived';

export interface ChildOption {
  childId: string;
  displayName: string;
}

export interface PersonOption {
  personId: string;
  label: string;
  relationshipLabel: string | null;
}

/** One handoff, opened. The exact location and the notes live ONLY here (never on the hub). */
export interface TransitionDetailView {
  status: 'ok' | 'household_mismatch' | 'not_found' | 'not_a_handoff';
  transition: TransitionView | null;
  /** The location text she recorded, or null if none. Shown behind an explicit reveal. */
  location: string | null;
  notes: string | null;
  commitment: 'fixed' | 'flexible' | null;
  zone: { household: string; device: string | null; differs: boolean };
  people: PersonOption[];
  children: ChildOption[];
}

export interface MoneyFollowUpDetailView {
  status: 'ok' | 'household_mismatch' | 'not_found' | 'not_a_follow_up';
  followUp: MoneyFollowUpView | null;
  notes: string | null;
  people: PersonOption[];
  children: ChildOption[];
}

export interface CoParentLogisticsView {
  householdId: string;
  status: 'ok' | 'household_mismatch';
  nowMs: number;
  zone: { household: string; device: string | null; differs: boolean };
  capability: { canCreate: boolean; blocked: BlockedReason[]; categoryId: string | null };
  children: ChildOption[];
  people: PersonOption[];
  /** Every upcoming or in-progress handoff, in time order. */
  transitions: TransitionView[];
  nextTransitionId: string | null;
  needsReviewIds: string[];
  needsMeIds: string[];
  waitingIds: string[];
  preparation: PrepGroup[];
  moneyFollowUps: MoneyFollowUpView[];
  needsReviewTasks: Array<{ taskId: string; title: string; child: ChildRef; reasons: ReviewReason[] }>;
  recentlyCompleted: CompletedEntry[];
  /** True only when NOTHING is represented. It says nothing about the world outside Her Keys. */
  isEmpty: boolean;
}
