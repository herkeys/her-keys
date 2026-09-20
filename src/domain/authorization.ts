import type { TransitionContext } from './context';
import {
  CATEGORY_PROFILE,
  atLeastAsSerious,
  authorityCoverage,
  permittedMode,
  type ActionCategory,
  type ActionExecution,
  type ActionIntent,
  type ActionOutcome,
  type AutomationAuthority,
  type AutonomyMode,
  type ConsequenceLevel,
  type CoverageRefusal,
  type IntentContext,
  type IntentDecision,
  type Reversibility,
} from './foundation/authorization';
import type { Money } from './foundation/money';
import { automationProvenance, inferenceProvenance, userProvenance, type Provenance } from './foundation/provenance';
import { refExists, type TypedRef } from './foundation/typedRef';
import { toInstant } from './logicalDay';
import type { AppState } from './state';

/**
 * Authorization, decision and lifecycle — REPRESENTATION ONLY (ADR-007..010).
 *
 * Nothing here performs an action, calls a provider or fires a worker. It records what
 * she has authorized, what Her Keys would like to do, and what she decided, and it
 * answers derived questions about them. Executions and outcomes are written by the
 * trusted server boundary and pulled; this module only READS them.
 *
 * A demo household cannot hold authority: automation permission is refused there,
 * fail closed, so a rehearsal can never be mistaken for a real grant.
 */

// -------------------------------------------------------------- authorities ---

export interface GrantInput {
  category: ActionCategory;
  mode: AutonomyMode;
  maxConsequence?: ConsequenceLevel;
  persistent: boolean;
  categoryId?: string | null;
  subjectMemberId?: string | null;
  provider?: string | null;
  maxAmount?: { amountMinor: number; currency: string } | null;
  expiresAtMs?: number | null;
}

/** She grants Her Keys permission. Only she can, and only outside a demo household. */
export function grantAuthority(state: AppState, ctx: TransitionContext, input: GrantInput): AppState {
  if (state.origin === 'demo') return state;
  const now = toInstant(ctx.nowMs);
  const authority: AutomationAuthority = {
    id: ctx.createId('authority'),
    category: input.category,
    mode: input.mode,
    maxConsequence: input.maxConsequence ?? CATEGORY_PROFILE[input.category].consequence,
    persistent: input.persistent,
    categoryId: input.categoryId ?? null,
    subjectMemberId: input.subjectMemberId ?? null,
    provider: input.provider ?? null,
    maxAmountMinor: input.maxAmount?.amountMinor ?? null,
    maxAmountCurrency: input.maxAmount?.currency ?? null,
    grantedAt: now,
    expiresAt: input.expiresAtMs ? toInstant(input.expiresAtMs) : null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    provenance: userProvenance(),
    scope: 'personal',
  };
  return { ...state, authorities: [...state.authorities, authority] };
}

/** Revoking is the only edit an authority takes. What it already authorized stays in the record. */
export function revokeAuthority(state: AppState, ctx: TransitionContext, authorityId: string): AppState {
  const authority = state.authorities.find((a) => a.id === authorityId);
  if (!authority || authority.revokedAt !== null) return state;
  const at = toInstant(ctx.nowMs);
  return { ...state, authorities: state.authorities.map((a) => (a.id === authorityId ? { ...a, revokedAt: at, updatedAt: at } : a)) };
}

// ------------------------------------------------------------------ intents ---

/** The categories and children the row an intent is about sits in — what an authority's boundary is measured against. */
export function intentContext(state: AppState, about: TypedRef | null): IntentContext {
  if (about === null) return { categoryId: null, subjectMemberId: null };
  const collections: Record<string, ReadonlyArray<{ id: string; categoryId?: string | null; subjectMemberId?: string | null }>> = {
    task: state.tasks, event: state.events, needsMe: state.needsMe, system: state.systems, meal: state.meals, goal: state.goals,
  };
  const row = collections[about.kind]?.find((r) => r.id === about.id);
  return { categoryId: row?.categoryId ?? null, subjectMemberId: row?.subjectMemberId ?? null };
}

/** Authorities a non-persistent grant has already been spent on: an execution names it. */
export function usedAuthorityIds(state: Pick<AppState, 'executions'>): Set<string> {
  return new Set(state.executions.flatMap((e) => (e.authorityId === null ? [] : [e.authorityId])));
}

export interface ProposeInput {
  category: ActionCategory;
  about?: TypedRef | null;
  summaryCode: string;
  /** May raise the category's default consequence; never lower it. */
  consequence?: ConsequenceLevel;
  reversibility?: Reversibility;
  amount?: Money | null;
  provider?: string | null;
  expiresAtMs?: number | null;
  provenance?: Provenance;
}

/**
 * Her Keys proposes something. The consequence and reversibility come from the
 * category's own profile — a proposal may be MORE serious than that, never less — and
 * the most autonomy any covering authority allows RIGHT NOW is recorded as
 * `permittedMode`, as a fact about this moment rather than a live verdict.
 */
export function proposeIntent(state: AppState, ctx: TransitionContext, input: ProposeInput): AppState {
  const profile = CATEGORY_PROFILE[input.category];
  const draft = {
    category: input.category,
    consequence: atLeastAsSerious(input.consequence, input.category),
    provider: input.provider ?? null,
    amount: input.amount ?? null,
  };
  const about = input.about ?? null;
  if (about !== null && !refExists(state, about)) return state;

  const at = toInstant(ctx.nowMs);
  const { mode } = permittedMode(state.authorities, draft, intentContext(state, about), at, usedAuthorityIds(state));
  const intent: ActionIntent = {
    id: ctx.createId('intent'),
    category: input.category,
    about: about as ActionIntent['about'],
    consequence: draft.consequence,
    reversibility: input.reversibility ?? profile.reversibility,
    summaryCode: input.summaryCode,
    amount: draft.amount,
    provider: draft.provider,
    permittedMode: mode,
    createdAt: at,
    expiresAt: input.expiresAtMs ? toInstant(input.expiresAtMs) : null,
    provenance: input.provenance ?? inferenceProvenance('possible'),
    scope: 'personal',
  };
  return { ...state, intents: [...state.intents, intent] };
}

// ---------------------------------------------------------------- decisions ---

const decisionFor = (state: Pick<AppState, 'decisions'>, intentId: string) =>
  state.decisions.find((d) => d.intentId === intentId && d.decision !== 'withdrawn') ?? null;

function addDecision(
  state: AppState,
  ctx: TransitionContext,
  intentId: string,
  decision: IntentDecision['decision'],
  basis: IntentDecision['basis'],
  authorityId: string | null,
  provenance: Provenance
): AppState {
  const at = toInstant(ctx.nowMs);
  const row: IntentDecision = {
    id: ctx.createId('decision'),
    intentId,
    decision,
    basis,
    authorityId,
    decidedAt: at,
    createdAt: at,
    provenance,
    scope: 'personal',
  };
  return { ...state, decisions: [...state.decisions, row] };
}

/** Her answer to an intent. One answer per intent: a second, from any device, changes nothing here and collides in the cloud. */
export function decideIntent(state: AppState, ctx: TransitionContext, intentId: string, decision: 'approved' | 'declined'): AppState {
  if (!state.intents.some((i) => i.id === intentId) || decisionFor(state, intentId) !== null) return state;
  return addDecision(state, ctx, intentId, decision, 'explicit', null, userProvenance());
}

/** She changed her mind after approving, before anything ran. New evidence; the approval is not edited. */
export function withdrawApproval(state: AppState, ctx: TransitionContext, intentId: string): AppState {
  const approval = decisionFor(state, intentId);
  const alreadyWithdrawn = state.decisions.some((d) => d.intentId === intentId && d.decision === 'withdrawn');
  if (!approval || approval.decision !== 'approved' || alreadyWithdrawn) return state;
  return addDecision(state, ctx, intentId, 'withdrawn', 'explicit', null, userProvenance());
}

/**
 * A standing authority she granted earlier covers this intent, so no fresh approval is
 * needed. Recorded as Her Keys acting on her earlier grant — never as her deciding now.
 */
export function approveUnderAuthority(state: AppState, ctx: TransitionContext, intentId: string): AppState {
  const intent = state.intents.find((i) => i.id === intentId);
  if (!intent || decisionFor(state, intentId) !== null) return state;
  const at = toInstant(ctx.nowMs);
  const { mode, authorityId } = permittedMode(state.authorities, intent, intentContext(state, intent.about), at, usedAuthorityIds(state));
  if (mode !== 'execute_authorized' || authorityId === null) return state;
  return addDecision(state, ctx, intentId, 'approved', 'standing_authority', authorityId, automationProvenance());
}

// ---------------------------------------------------------------- lifecycle ---

export type IntentStage = 'proposed' | 'declined' | 'withdrawn' | 'approved' | 'attempted' | 'succeeded' | 'failed';

export interface IntentLifecycle {
  stage: IntentStage;
  decision: IntentDecision | null;
  executions: ActionExecution[];
  outcomes: ActionOutcome[];
  /** She still needs to answer it. */
  needsApproval: boolean;
}

/**
 * Where an intent stands, DERIVED from the append-only rows around it. There is no
 * stored state to disagree with them, and so no state for two devices to race on.
 */
export function intentLifecycle(state: AppState, intentId: string): IntentLifecycle | null {
  const intent = state.intents.find((i) => i.id === intentId);
  if (!intent) return null;

  const decisions = state.decisions.filter((d) => d.intentId === intentId);
  const answer = decisions.find((d) => d.decision !== 'withdrawn') ?? null;
  const withdrawn = decisions.some((d) => d.decision === 'withdrawn');
  const executions = state.executions.filter((e) => e.intentId === intentId).sort((a, b) => a.attempt - b.attempt);
  const outcomes = state.outcomes.filter((o) => executions.some((e) => e.id === o.executionId));

  let stage: IntentStage = 'proposed';
  if (answer?.decision === 'declined') stage = 'declined';
  else if (answer?.decision === 'approved') stage = withdrawn ? 'withdrawn' : 'approved';
  if (executions.length > 0) {
    const last = executions[executions.length - 1];
    stage = last.result === 'succeeded' ? 'succeeded' : last.result === 'failed' ? 'failed' : 'attempted';
  }
  return { stage, decision: answer, executions, outcomes, needsApproval: answer === null };
}

/** Intents waiting on her — what a briefing calls "needs approval". */
export function pendingApprovals(state: AppState, atMs: number): ActionIntent[] {
  return state.intents.filter((intent) => {
    if (intent.expiresAt !== null && Date.parse(intent.expiresAt) <= atMs) return false;
    return decisionFor(state, intent.id) === null;
  });
}

// ------------------------------------------------------------------ safety ---

export type AuthorizationVerdict = { authorized: true } | { authorized: false; reason: 'no_such_intent' | 'no_authorization' | 'not_approved' | 'wrong_intent' | CoverageRefusal | 'not_execute_mode' };

/**
 * Whether an execution was covered by valid authorization. This is the LOCAL statement
 * of the rule the cloud's authorization trigger enforces, and a test holds the two to
 * the same answers: an execution needs an approval that still stands, or a standing
 * authority that covers the intent, is in execute mode, and is not spent.
 */
export function executionAuthorization(state: AppState, execution: ActionExecution): AuthorizationVerdict {
  const intent = state.intents.find((i) => i.id === execution.intentId);
  if (!intent) return { authorized: false, reason: 'no_such_intent' };

  if (execution.decisionId !== null) {
    const decision = state.decisions.find((d) => d.id === execution.decisionId);
    if (!decision || decision.intentId !== intent.id) return { authorized: false, reason: 'wrong_intent' };
    const standing = decisionFor(state, intent.id);
    const withdrawn = state.decisions.some((d) => d.intentId === intent.id && d.decision === 'withdrawn');
    if (decision.decision === 'approved' && standing?.id === decision.id && !withdrawn) return { authorized: true };
    return { authorized: false, reason: 'not_approved' };
  }

  if (execution.authorityId !== null) {
    const authority = state.authorities.find((a) => a.id === execution.authorityId);
    if (!authority) return { authorized: false, reason: 'no_authorization' };
    if (authority.mode !== 'execute_authorized') return { authorized: false, reason: 'not_execute_mode' };
    // Spent authority is measured BEFORE this execution: another execution using it would have used it up.
    const others = new Set(state.executions.filter((e) => e.id !== execution.id).flatMap((e) => (e.authorityId === null ? [] : [e.authorityId])));
    const coverage = authorityCoverage(authority, intent, intentContext(state, intent.about), execution.attemptedAt, others);
    return coverage.covers ? { authorized: true } : { authorized: false, reason: coverage.refusal };
  }
  return { authorized: false, reason: 'no_authorization' };
}
