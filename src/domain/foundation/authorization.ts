import { z } from 'zod';
import { Id, InstantSchema, OpenCode } from '../schemaPrimitives';
import { MoneySchema, isWithinLimit, type Money } from './money';
import { ProvenanceSchema } from './provenance';
import { CONTENT_REF_KINDS, refOf } from './typedRef';

/**
 * ACTION AUTHORIZATION, CONSEQUENCE AND OUTCOME — B4-FE01-007..012 (ADR-007..010).
 *
 * REPRESENTATION ONLY. This wave builds the durable semantics an autonomous
 * assistant needs, and nothing that performs an action: no executor, no worker, no
 * outbound call. The first real autonomous action must be representable without
 * reworking a table; it must not be possible yet.
 *
 * Three ideas, kept apart on purpose:
 *
 *   AUTHORITY   what she has said Her Keys may do without asking — a standing or
 *               one-time permission, keyed on (category, consequence, boundary).
 *               It is a permission store, so it is owner-only and only she can grant.
 *   INTENT      what Her Keys wants to do and why — immutable.
 *   DECISION    her answer to an intent — immutable.
 *
 * Authorization state is DERIVED from these append-only rows plus executions and
 * outcomes; there is no mutable proposal to race two devices over. Two devices
 * approving one intent collide on a uniqueness rule and surface as a domain
 * conflict, exactly as two One Move decisions for one day already do.
 *
 * `ActionRecord` — the immutable ledger of decisions on daily-load
 * recommendations — is untouched. These structures sit beside it.
 */

// ------------------------------------------------------------- the taxonomy --

/** What kind of thing Her Keys would be doing. Closed: a rule must be able to name every one. */
export const ACTION_CATEGORIES = [
  'internal_reminder',
  'task_change',
  'schedule_change',
  'delegation_request',
  'outbound_message',
  'external_calendar_write',
  'external_appointment',
  'financial_action',
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/** How much it matters if this is wrong. Ordered. */
export const CONSEQUENCE_LEVELS = ['low', 'moderate', 'high', 'critical'] as const;
export type ConsequenceLevel = (typeof CONSEQUENCE_LEVELS)[number];

/** Whether it can be taken back. */
export const REVERSIBILITY = ['reversible', 'compensable', 'irreversible'] as const;
export type Reversibility = (typeof REVERSIBILITY)[number];

/** How much Her Keys may do on its own. Ordered, least to most autonomy. */
export const AUTONOMY_MODES = ['suggest', 'prepare', 'ask_approval', 'execute_authorized'] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const consequenceRank = (level: ConsequenceLevel): number => CONSEQUENCE_LEVELS.indexOf(level);
export const autonomyRank = (mode: AutonomyMode): number => AUTONOMY_MODES.indexOf(mode);

/**
 * The default profile of each category: what an action of this kind normally costs
 * if it goes wrong, and whether it can be undone. TOTAL by construction — every
 * category has one — so "move an internal reminder" and "initiate a financial
 * action" can never be indistinguishable to a rule again.
 */
export const CATEGORY_PROFILE: Readonly<Record<ActionCategory, { consequence: ConsequenceLevel; reversibility: Reversibility }>> = {
  internal_reminder: { consequence: 'low', reversibility: 'reversible' },
  task_change: { consequence: 'low', reversibility: 'reversible' },
  schedule_change: { consequence: 'moderate', reversibility: 'reversible' },
  delegation_request: { consequence: 'moderate', reversibility: 'compensable' },
  external_calendar_write: { consequence: 'moderate', reversibility: 'compensable' },
  outbound_message: { consequence: 'high', reversibility: 'irreversible' },
  external_appointment: { consequence: 'high', reversibility: 'compensable' },
  financial_action: { consequence: 'critical', reversibility: 'irreversible' },
};

// --------------------------------------------------------------- authority ---

const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const AutomationAuthoritySchema = z
  .strictObject({
    id: Id,
    category: z.enum(ACTION_CATEGORIES),
    mode: z.enum(AUTONOMY_MODES),
    /** The highest consequence this authority reaches. Anything above it still needs her. */
    maxConsequence: z.enum(CONSEQUENCE_LEVELS),
    /** Standing until revoked, or usable for exactly one action. */
    persistent: z.boolean(),
    // ---- the authorization boundary: what it does NOT cover. Null means "no limit on this axis".
    categoryId: Id.nullable(),
    subjectMemberId: Id.nullable(),
    provider: OpenCode.nullable(),
    maxAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    maxAmountCurrency: CurrencyCode.nullable(),
    grantedAt: InstantSchema,
    expiresAt: InstantSchema.nullable(),
    revokedAt: InstantSchema.nullable(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((a, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    // Only she can grant Her Keys permission. A permission an inference wrote for itself is not a permission.
    if (a.provenance.producer !== 'user-action') issue('provenance', 'an authority is granted by her, and only by her');
    if ((a.maxAmountMinor === null) !== (a.maxAmountCurrency === null)) issue('maxAmountMinor', 'an amount limit names its currency');
    // A standing permission to move money without asking must be bounded.
    if (a.category === 'financial_action' && a.mode === 'execute_authorized' && a.maxAmountMinor === null) {
      issue('maxAmountMinor', 'authority to act on money unattended must state how much');
    }
    if (a.expiresAt !== null && Date.parse(a.expiresAt) <= Date.parse(a.grantedAt)) issue('expiresAt', 'an authority expires after it is granted');
    if (a.revokedAt !== null && Date.parse(a.revokedAt) < Date.parse(a.grantedAt)) issue('revokedAt', 'an authority cannot be revoked before it is granted');
  });
export type AutomationAuthority = z.infer<typeof AutomationAuthoritySchema>;

// ------------------------------------------------------------------ intent ---

export const INTENT_ABOUT_KINDS = [...CONTENT_REF_KINDS, 'responsibility'] as const;

export const ActionIntentSchema = z
  .strictObject({
    id: Id,
    category: z.enum(ACTION_CATEGORIES),
    /** The row this would act on, when there is one. */
    about: refOf(INTENT_ABOUT_KINDS).nullable(),
    consequence: z.enum(CONSEQUENCE_LEVELS),
    reversibility: z.enum(REVERSIBILITY),
    /** A short code for what is proposed (`move_event_for_transition_buffer`). The reasons live in evidence links. */
    summaryCode: OpenCode,
    amount: MoneySchema.nullable(),
    provider: OpenCode.nullable(),
    /** The most autonomy the policy allowed WHEN THIS WAS PROPOSED. A record of the moment, not a live verdict. */
    permittedMode: z.enum(AUTONOMY_MODES),
    createdAt: InstantSchema,
    expiresAt: InstantSchema.nullable(),
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((intent, ctx) => {
    if (intent.category === 'financial_action' && intent.amount === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'a financial action states its amount' });
    }
    // An intent is Her Keys' proposal. It is never something she stated.
    if (!['ai-inference', 'automation', 'system-derived'].includes(intent.provenance.producer)) {
      ctx.addIssue({ code: 'custom', path: ['provenance'], message: 'an intent is proposed by Her Keys' });
    }
  });
export type ActionIntent = z.infer<typeof ActionIntentSchema>;

// ---------------------------------------------------------------- decision ---

export const DECISIONS = ['approved', 'declined', 'withdrawn'] as const;
export const DECISION_BASES = ['explicit', 'standing_authority'] as const;

export const IntentDecisionSchema = z
  .strictObject({
    id: Id,
    intentId: Id,
    decision: z.enum(DECISIONS),
    /** Approved by her, this time — or by a standing authority she granted earlier. */
    basis: z.enum(DECISION_BASES),
    authorityId: Id.nullable(),
    decidedAt: InstantSchema,
    createdAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.basis === 'standing_authority') {
      if (d.authorityId === null) issue('authorityId', 'relying on a standing authority names it');
      if (d.decision !== 'approved') issue('decision', 'a standing authority approves; it never declines or withdraws');
      if (d.provenance.producer !== 'automation') issue('provenance', 'a decision made under a standing authority is Her Keys acting on her earlier grant');
    } else {
      if (d.authorityId !== null) issue('authorityId', 'an explicit decision relies on no standing authority');
      if (d.provenance.producer !== 'user-action') issue('provenance', 'an explicit decision is hers');
    }
  });
export type IntentDecision = z.infer<typeof IntentDecisionSchema>;

// ---------------------------------------------------------------- execution ---

export const EXECUTION_RESULTS = ['succeeded', 'failed', 'partial', 'unknown'] as const;
export const ERROR_CLASSES = ['none', 'transient', 'permanent', 'unauthorized', 'rate_limited', 'validation'] as const;

/**
 * An attempt. Written only by the trusted server boundary, and only pulled by a client:
 * automation authority is not client authority, so a device cannot forge one. The
 * cloud additionally refuses an execution that no valid authorization covers.
 */
export const ActionExecutionSchema = z
  .strictObject({
    id: Id,
    intentId: Id,
    /** The approval relied on… */
    decisionId: Id.nullable(),
    /** …or the standing authority. At least one is required. */
    authorityId: Id.nullable(),
    attempt: z.number().int().min(1).max(1000),
    attemptedAt: InstantSchema,
    provider: OpenCode.nullable(),
    /** The provider's own id for what it did, so a later observation can find it. */
    externalActionId: z.string().min(1).max(256).nullable(),
    externalReferenceId: Id.nullable(),
    result: z.enum(EXECUTION_RESULTS),
    errorClass: z.enum(ERROR_CLASSES),
    reversibility: z.enum(REVERSIBILITY),
    /** How this could be undone (`cancel_event`, `refund`). */
    compensationCode: OpenCode.nullable(),
    /** When this execution IS the undo of an earlier one. */
    compensatesExecutionId: Id.nullable(),
    createdAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((e, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (e.decisionId === null && e.authorityId === null) issue('decisionId', 'an execution names the authorization it relied on');
    if ((e.result === 'succeeded') !== (e.errorClass === 'none')) issue('errorClass', 'an error class exists exactly when the attempt did not simply succeed');
    if (e.compensatesExecutionId !== null && e.compensationCode === null) issue('compensationCode', 'an undo says how it undoes');
  });
export type ActionExecution = z.infer<typeof ActionExecutionSchema>;

export const OUTCOME_KINDS = [
  'verified',
  'verification_failed',
  'delivered',
  'acknowledged',
  'accepted',
  'declined',
  'completed',
  'paid',
  'cancelled',
  'followed',
  'expired',
  'no_effect',
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

/** What was observed AFTER an execution. One execution may have many, over time; none edits the one before. */
export const ActionOutcomeSchema = z.strictObject({
  id: Id,
  executionId: Id,
  kind: z.enum(OUTCOME_KINDS),
  observedAt: InstantSchema,
  createdAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

// ------------------------------------------------------------------ policy ---

export interface IntentContext {
  /** The life-area category of the row the intent is about, when known. */
  categoryId: string | null;
  /** The child it concerns, when there is one. */
  subjectMemberId: string | null;
}

type AuthorityView = Pick<
  AutomationAuthority,
  'id' | 'category' | 'mode' | 'maxConsequence' | 'persistent' | 'categoryId' | 'subjectMemberId' | 'provider' | 'maxAmountMinor' | 'maxAmountCurrency' | 'grantedAt' | 'expiresAt' | 'revokedAt'
>;
type IntentView = Pick<ActionIntent, 'category' | 'consequence' | 'provider' | 'amount'>;

export type CoverageRefusal =
  | 'revoked'
  | 'expired'
  | 'not_yet_granted'
  | 'wrong_category'
  | 'consequence_exceeds_authority'
  | 'outside_category_boundary'
  | 'outside_child_boundary'
  | 'outside_provider_boundary'
  | 'exceeds_amount_limit'
  | 'already_used';

/**
 * Does this authority cover this intent, at this moment? Pure, and the single
 * statement of the rule: the cloud's authorization trigger mirrors it, and a test
 * holds the two to the same answers. The result names the FIRST reason it does not,
 * so a refusal is explainable rather than merely a boolean.
 */
export function authorityCoverage(
  authority: AuthorityView,
  intent: IntentView,
  context: IntentContext,
  at: string,
  usedAuthorityIds: ReadonlySet<string> = new Set()
): { covers: true } | { covers: false; refusal: CoverageRefusal } {
  const now = Date.parse(at);
  if (authority.revokedAt !== null && Date.parse(authority.revokedAt) <= now) return { covers: false, refusal: 'revoked' };
  if (Date.parse(authority.grantedAt) > now) return { covers: false, refusal: 'not_yet_granted' };
  if (authority.expiresAt !== null && Date.parse(authority.expiresAt) <= now) return { covers: false, refusal: 'expired' };
  if (authority.category !== intent.category) return { covers: false, refusal: 'wrong_category' };
  if (consequenceRank(intent.consequence) > consequenceRank(authority.maxConsequence)) return { covers: false, refusal: 'consequence_exceeds_authority' };
  if (authority.categoryId !== null && authority.categoryId !== context.categoryId) return { covers: false, refusal: 'outside_category_boundary' };
  if (authority.subjectMemberId !== null && authority.subjectMemberId !== context.subjectMemberId) return { covers: false, refusal: 'outside_child_boundary' };
  if (authority.provider !== null && authority.provider !== intent.provider) return { covers: false, refusal: 'outside_provider_boundary' };
  if (authority.maxAmountMinor !== null && intent.amount !== null) {
    const limit: Pick<Money, 'amountMinor' | 'currency'> = { amountMinor: authority.maxAmountMinor, currency: authority.maxAmountCurrency ?? '' };
    if (!isWithinLimit(intent.amount, limit)) return { covers: false, refusal: 'exceeds_amount_limit' };
  }
  if (!authority.persistent && usedAuthorityIds.has(authority.id)) return { covers: false, refusal: 'already_used' };
  return { covers: true };
}

/**
 * The most autonomy any covering authority allows for this intent. With no covering
 * authority the answer is `suggest`: Her Keys may say what it would do and nothing more.
 */
export function permittedMode(
  authorities: readonly AuthorityView[],
  intent: IntentView,
  context: IntentContext,
  at: string,
  usedAuthorityIds: ReadonlySet<string> = new Set()
): { mode: AutonomyMode; authorityId: string | null } {
  let best: { mode: AutonomyMode; authorityId: string | null } = { mode: 'suggest', authorityId: null };
  for (const authority of authorities) {
    if (!authorityCoverage(authority, intent, context, at, usedAuthorityIds).covers) continue;
    if (autonomyRank(authority.mode) > autonomyRank(best.mode)) best = { mode: authority.mode, authorityId: authority.id };
  }
  return best;
}

/** The default profile for a category, overridable per intent only in the cautious direction. */
export function profileFor(category: ActionCategory): { consequence: ConsequenceLevel; reversibility: Reversibility } {
  return CATEGORY_PROFILE[category];
}

/** The higher of two consequences: an intent may be MORE serious than its category's default, never less. */
export function atLeastAsSerious(requested: ConsequenceLevel | undefined, category: ActionCategory): ConsequenceLevel {
  const floor = CATEGORY_PROFILE[category].consequence;
  if (requested === undefined) return floor;
  return consequenceRank(requested) >= consequenceRank(floor) ? requested : floor;
}
