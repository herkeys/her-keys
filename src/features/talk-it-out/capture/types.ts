import type { InterpretationKind } from '../../../domain/foundation/interpretation';
import type { Money, MoneyDirection } from '../../../domain/foundation/money';
import type { Instant, LocalDate } from '../../../domain/logicalDay';
import type { SystemRole } from '../../../domain/state';

/**
 * THE TALK IT OUT INTERPRETER CONTRACT (feature-local, Feature 02).
 *
 * Raw words in, typed proposals out. Nothing here is household truth: a proposal is Her Keys'
 * reading of something she said, held OUTSIDE canonical state until she accepts it.
 *
 * Deliberately absent: `any`, `unknown` as a domain contract, `Record<string, any>`, a "data" bag, a
 * type = 'other' escape hatch. Meaning the durable model cannot hold is reported through
 * `UnsupportedItem`, never squeezed into a generic payload.
 *
 * SHARED-ABSTRACTION CANDIDATE: if Features 01/03/04 grow their own interpretation seams, integration
 * decides whether these ports are promoted to shared infrastructure. Until then this is Feature 02's.
 */

/** The durable kinds a reading can have — exactly the foundation's, never extended here. */
export type ProposalKind = InterpretationKind;

// ------------------------------------------------------------------ context ---

export interface ChildCandidate {
  id: string;
  displayName: string;
}

export interface PersonCandidate {
  id: string;
  displayName: string;
}

/**
 * The MINIMUM context a reading needs (never the household). Logical time, who could be meant, and
 * which areas exist so a hint can only name one that does.
 */
export interface InterpretationContext {
  nowMs: number;
  timeZone: string;
  /** The household's logical day at `nowMs`. */
  today: LocalDate;
  children: readonly ChildCandidate[];
  /** People in her life who are not accounts. Read for name recognition only. */
  people: readonly PersonCandidate[];
  areas: readonly SystemRole[];
}

// ------------------------------------------------------------------- inputs ---

export interface TalkItOutInput {
  /** The source artifact this reading is about (or its idempotency key before the artifact exists). */
  captureId: string;
  text: string;
  context: InterpretationContext;
}

// ------------------------------------------------------------- clarification ---

export type ClarificationOption =
  | { kind: 'child'; memberId: string }
  /** She said it is not about one of her children. An explicit answer, not an absence. */
  | { kind: 'no-child' }
  | { kind: 'date'; date: LocalDate }
  | { kind: 'direction'; direction: MoneyDirection };

/** What Her Keys needs to be told before a reading can be a real row. The code is durable; the options are regenerable. */
export type ClarificationStep =
  | { kind: 'which_child' }
  /** `weekday` is 0 = Sunday … 6 = Saturday when a weekday word was the source of the doubt; null for "today or tomorrow". */
  | { kind: 'which_day'; weekday: number | null }
  | { kind: 'which_money_direction' };

export interface ClarificationRequest {
  /** Ordered: the first step is the question on the table; the rest are asked afterwards, one at a time. */
  steps: readonly [ClarificationStep, ...ClarificationStep[]];
  /** Options for the FIRST step. */
  options: readonly ClarificationOption[];
}

export type ClarificationAnswer = { kind: 'option'; option: ClarificationOption } | { kind: 'text'; text: string };

// ---------------------------------------------------------------- proposals ---

/** Every rule the local reader can apply. Evidence names one; the capability envelope documents each. */
export type RuleId =
  | 'date.weekday'
  | 'date.relative'
  | 'date.calendar'
  | 'date.day-of-month'
  | 'time.clock'
  | 'time.range'
  | 'time.duration'
  | 'money.amount'
  | 'money.direction'
  | 'child.named'
  | 'child.object-pronoun'
  | 'child.noun'
  | 'child.activity'
  | 'area.keyword'
  | 'kind.obligation'
  | 'kind.appointment'
  | 'kind.dated-note'
  | 'kind.note-only';

export type EvidenceField = 'date' | 'time' | 'duration' | 'amount' | 'direction' | 'child' | 'area' | 'kind';

export interface EvidenceRef {
  field: EvidenceField;
  rule: RuleId;
  /** Where in the submitted text the rule fired. Offsets, never a copy of the words. Null when the rule fired on a default. */
  span: { start: number; end: number } | null;
}

/** Things the reader ASSUMED. Each is shown to her as an assumption, never as something she said. */
export type AssumptionCode =
  | 'end-time-assumed'
  | 'meridiem-assumed'
  | 'date-assumed-today'
  | 'date-rolled-forward'
  | 'hedged-language'
  | 'title-shortened'
  | 'multiple-children-no-single-subject'
  | 'amount-direction-unknown';

export interface Proposal {
  /** Stable within one result (`p1`, `p2`, …). Durable identity is the interpretation id it becomes. */
  key: string;
  kind: ProposalKind;
  title: string;
  dueDate: LocalDate | null;
  startsAt: Instant | null;
  endsAt: Instant | null;
  durationMinutes: number | null;
  value: Money | null;
  subjectMemberId: string | null;
  categoryHint: SystemRole | null;
  /** A local reader corroborates nothing, so it never claims more than `possible`. Only her acceptance reaches `established`. */
  confidence: 'possible';
  clarification: ClarificationRequest | null;
  assumptions: readonly AssumptionCode[];
  evidence: readonly EvidenceRef[];
  /** The reader judged this about one of her children. A child-scoped proposal never materialises without a subject. */
  childScoped: boolean;
  requiresExplicitReview: true;
  /** The clause of the submitted text this came from. */
  span: { start: number; end: number };
}

// ------------------------------------------------- unsupported and failures ---

/**
 * Meaning the reader recognised but the durable model cannot represent (or that is not a household
 * record). Explicit, never silently dropped, never coerced into a generic bucket.
 */
export type UnsupportedReason =
  | 'change-to-existing-item'
  | 'recurrence'
  | 'responsibility-handoff'
  | 'multiple-dates'
  | 'multiple-times'
  | 'multiple-amounts'
  | 'foreign-currency'
  | 'clause-limit'
  | 'context-only';

export interface UnsupportedItem {
  reason: UnsupportedReason;
  span: { start: number; end: number };
  /** For `responsibility-handoff`: the name that was mentioned, and whether it is somebody already in her household. */
  person: { name: string; known: boolean } | null;
}

export type InterpretationFailureCode =
  | 'nothing-recognized'
  | 'over-processing-limit'
  | 'high-stakes'
  | 'empty'
  | 'answer-not-understood';

export interface InterpretationFailure {
  code: InterpretationFailureCode;
}

export interface InterpretationResult {
  captureId: string;
  proposals: readonly Proposal[];
  unsupported: readonly UnsupportedItem[];
  failure: InterpretationFailure | null;
  /** Characters actually read. Equal to the text length, or 0 when the text was over the window and nothing was read. */
  processedCharacters: number;
}

// -------------------------------------------------- revising a reading (all routes) ---

/**
 * What a revision can change. A clarification answer, a structured edit and a natural-language
 * correction ALL reduce to this one shape and are applied by the same function, so there is exactly
 * one code path that changes what a proposal says.
 */
export interface ProposalPatch {
  title?: string;
  kind?: ProposalKind;
  /** The calendar day: an event's day, or a task / note's due date. */
  date?: LocalDate | null;
  /** Event start, minutes after midnight in the household's zone. */
  timeMinutes?: number;
  durationMinutes?: number;
  /** A typed amount with its direction. `null` removes it. */
  amount?: Money | null;
  /** Direction for the amount already named in the title. */
  direction?: MoneyDirection;
  subject?: { kind: 'child'; memberId: string } | { kind: 'none' };
  categoryHint?: SystemRole | null;
}

/** The typed fields of a durable reading — everything `clarify` and `revise` may look at. No source text. */
export interface ProposalDraft {
  readingId: string;
  version: number;
  kind: ProposalKind;
  title: string;
  dueDate: LocalDate | null;
  startsAt: Instant | null;
  endsAt: Instant | null;
  durationMinutes: number | null;
  value: Money | null;
  subjectMemberId: string | null;
  categoryHint: SystemRole | null;
  /** The durable open code, or null when the reading is not clarifying. */
  clarificationCode: string | null;
  /** When the reading was made — the clock every relative date in it is anchored to. */
  createdAtMs: number;
}

export interface ClarificationInput {
  captureId: string;
  proposal: ProposalDraft;
  answer: ClarificationAnswer;
  context: InterpretationContext;
}

export interface CorrectionTextInput {
  proposal: ProposalDraft;
  text: string;
  context: InterpretationContext;
}

/** What reading a correction produced: a patch to apply, a new question, or "I did not follow that". */
export type CorrectionReading =
  | { kind: 'patch'; patch: ProposalPatch }
  | { kind: 'question'; request: ClarificationRequest }
  | { kind: 'not-understood' };

// --------------------------------------------------------------------- port ---

/**
 * The seam a real interpreter will one day sit behind (the future LLM path is
 * SOURCE → minimum context → THIS interface → typed proposals → review → canonical mutation).
 * The local implementation is deterministic and bounded; it is not a stand-in for a language model.
 */
export interface TalkItOutInterpreterPort {
  interpret(input: TalkItOutInput): InterpretationResult;
  clarify(input: ClarificationInput): InterpretationResult;
  readCorrection(input: CorrectionTextInput): CorrectionReading;
}
