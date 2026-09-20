import type { TransitionContext } from './context';
import type { Interpretation, InterpretationKind } from './foundation/interpretation';
import type { Money } from './foundation/money';
import type { ConfidenceLevel } from './foundation/provenance';
import { userProvenance } from './foundation/provenance';
import {
  findDuplicateArtifact,
  retractArtifact,
  type SourceArtifact,
  type SourceArtifactKind,
  type SourceArtifactOrigin,
} from './foundation/sourceArtifact';
import type { ContentRefKind } from './foundation/typedRef';
import { toInstant, type LocalDate } from './logicalDay';
import { captureNeedsMeItem } from './needsMe';
import { addEvent } from './events';
import { appendObservation } from './observations';
import { promoteProvenance } from './reasoning/confidence';
import type { AppState, SystemRole, VisibilityScope } from './state';
import { addTask } from './tasks';

/**
 * From "it arrived" to "it is in her household" (B4-FE01-002 / -003, ADR-011 / -012).
 *
 *   artifact -> interpretation(s) -> [clarify | correct | reject | supersede] -> accept -> a real row
 *
 * Nothing here calls a model or reads a provider: it is the durable STATE MACHINE a
 * voice or inbox feature would drive. Every step is pure, and none stores content.
 */

// ---------------------------------------------------------------- artifacts ---

export interface RecordArtifactInput {
  kind: SourceArtifactKind;
  origin: SourceArtifactOrigin;
  provider?: string | null;
  receivedAtMs?: number;
  contentDigest?: string | null;
  contentRef?: string | null;
}

/**
 * Record that something arrived. The same digest is the same artifact, so forwarding
 * one document twice returns the artifact that already exists rather than storing it
 * again — and reports that it did.
 */
export function recordArtifact(
  state: AppState,
  ctx: TransitionContext,
  input: RecordArtifactInput
): { state: AppState; artifact: SourceArtifact; duplicate: boolean } {
  const existing = findDuplicateArtifact(state.sourceArtifacts, input.contentDigest ?? null);
  if (existing) return { state, artifact: existing, duplicate: true };

  const now = toInstant(ctx.nowMs);
  const artifact: SourceArtifact = {
    id: ctx.createId('artifact'),
    kind: input.kind,
    origin: input.origin,
    provider: input.provider ?? null,
    receivedAt: toInstant(input.receivedAtMs ?? ctx.nowMs),
    contentDigest: input.contentDigest ?? null,
    contentRef: input.contentRef ?? null,
    retractedAt: null,
    createdAt: now,
    scope: 'personal',
  };
  return { state: { ...state, sourceArtifacts: [...state.sourceArtifacts, artifact] }, artifact, duplicate: false };
}

/** The source was withdrawn. Rows already derived from it keep their lineage; nothing is deleted. */
export function retractSourceArtifact(state: AppState, ctx: TransitionContext, artifactId: string): AppState {
  const artifact = state.sourceArtifacts.find((a) => a.id === artifactId);
  if (!artifact || artifact.retractedAt !== null) return state;
  const at = toInstant(ctx.nowMs);
  return { ...state, sourceArtifacts: state.sourceArtifacts.map((a) => (a.id === artifactId ? retractArtifact(a, at) : a)) };
}

// ---------------------------------------------------------- interpretations ---

export interface ProposeInterpretationInput {
  artifactId: string;
  proposedKind: InterpretationKind;
  title: string;
  dueDate?: LocalDate | null;
  startsAt?: string | null;
  endsAt?: string | null;
  durationMinutes?: number | null;
  value?: Money | null;
  subjectMemberId?: string | null;
  categoryHint?: SystemRole | null;
  /** How sure the reading is. Inference by default; `import-sync` when an external system stated it. */
  confidence?: ConfidenceLevel;
  producer?: 'ai-inference' | 'import-sync';
  clarification?: string | null;
  supersedesId?: string | null;
  interpretationVersion?: number;
}

export function proposeInterpretation(state: AppState, ctx: TransitionContext, input: ProposeInterpretationInput): AppState {
  if (!state.sourceArtifacts.some((a) => a.id === input.artifactId)) return state;
  const reading: Interpretation = {
    id: ctx.createId('reading'),
    artifactId: input.artifactId,
    proposedKind: input.proposedKind,
    title: input.title,
    dueDate: input.dueDate ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    durationMinutes: input.durationMinutes ?? null,
    value: input.value ?? null,
    subjectMemberId: input.subjectMemberId ?? null,
    categoryHint: input.categoryHint ?? null,
    state: input.clarification ? 'clarifying' : 'pending',
    clarification: input.clarification ?? null,
    acceptedRef: null,
    supersedesId: input.supersedesId ?? null,
    interpretationVersion: input.interpretationVersion ?? 1,
    createdAt: toInstant(ctx.nowMs),
    decidedAt: null,
    provenance: {
      producer: input.producer ?? 'ai-inference',
      artifactId: input.artifactId,
      confidence: input.confidence ?? 'possible',
    },
    scope: 'personal',
  };
  return { ...state, interpretations: [...state.interpretations, reading] };
}

const open = (r: Interpretation) => r.state === 'pending' || r.state === 'clarifying';

const replace = (state: AppState, id: string, next: (r: Interpretation) => Interpretation): AppState => ({
  ...state,
  interpretations: state.interpretations.map((r) => (r.id === id ? next(r) : r)),
});

/** Her Keys needs one more thing to be told before this can be a real row. */
export function askClarification(state: AppState, id: string, code: string): AppState {
  const reading = state.interpretations.find((r) => r.id === id);
  if (!reading || !open(reading)) return state;
  return replace(state, id, (r) => ({ ...r, state: 'clarifying', clarification: code }));
}

/** Her correction. It edits the reading, answers any open question, and leaves what Her Keys inferred and how sure it was untouched. */
export type InterpretationCorrection = Partial<
  Pick<Interpretation, 'title' | 'dueDate' | 'startsAt' | 'endsAt' | 'durationMinutes' | 'value' | 'subjectMemberId' | 'categoryHint'>
>;

export function correctInterpretation(state: AppState, id: string, patch: InterpretationCorrection): AppState {
  const reading = state.interpretations.find((r) => r.id === id);
  if (!reading || !open(reading)) return state;
  return replace(state, id, (r) => ({ ...r, ...patch, state: 'pending', clarification: null }));
}

export function rejectInterpretation(state: AppState, ctx: TransitionContext, id: string): AppState {
  const reading = state.interpretations.find((r) => r.id === id);
  if (!reading || !open(reading)) return state;
  const next = replace(state, id, (r) => ({ ...r, state: 'rejected', clarification: null, decidedAt: toInstant(ctx.nowMs) }));
  return appendObservation(next, ctx, { about: { kind: 'interpretation', id }, outcome: 'declined' });
}

/** Reprocessing: a better reading replaces an earlier one. The earlier is kept, marked superseded, and named by its successor. */
export function supersedeInterpretation(
  state: AppState,
  ctx: TransitionContext,
  id: string,
  replacement: Omit<ProposeInterpretationInput, 'supersedesId' | 'artifactId'>
): AppState {
  const reading = state.interpretations.find((r) => r.id === id);
  if (!reading || !open(reading)) return state;
  const marked = replace(state, id, (r) => ({ ...r, state: 'superseded', clarification: null, decidedAt: toInstant(ctx.nowMs) }));
  return proposeInterpretation(marked, ctx, {
    ...replacement,
    artifactId: reading.artifactId,
    supersedesId: id,
    interpretationVersion: (replacement.interpretationVersion ?? reading.interpretationVersion + 1),
  });
}

export interface AcceptInput {
  /** She classifies at acceptance: every task and event needs a category, so capture could not supply one. */
  categoryId?: string;
  scope?: VisibilityScope;
  commitment?: 'fixed' | 'flexible';
}

export type AcceptRefusal = 'not_open' | 'needs_category' | 'unknown';

/** Whether an interpretation can become a real row given what she has supplied. */
export function canAccept(reading: Interpretation | undefined, input: AcceptInput): { ok: true } | { ok: false; reason: AcceptRefusal } {
  if (!reading) return { ok: false, reason: 'unknown' };
  if (reading.state !== 'pending') return { ok: false, reason: 'not_open' };
  if (reading.proposedKind !== 'needsMe' && !input.categoryId) return { ok: false, reason: 'needs_category' };
  return { ok: true };
}

/**
 * She approves Her Keys' reading. The real row is created with the reading's own
 * producer — an inference, or an external observation — and a confidence of
 * `established`, because a person confirmed it. It is deliberately NOT `user-action`:
 * she did not state it, she approved it, and that difference is exactly what the
 * confidence boundary exists to keep.
 */
export function acceptInterpretation(state: AppState, ctx: TransitionContext, id: string, input: AcceptInput = {}): AppState {
  const reading = state.interpretations.find((r) => r.id === id);
  if (!canAccept(reading, input).ok || !reading) return state;

  const confirmed = promoteProvenance(reading.provenance, { corroborations: 0, userConfirmed: true });
  const scope = input.scope ?? (reading.subjectMemberId ? 'child' : 'household');

  let next: AppState;
  let created: { kind: ContentRefKind; id: string };

  if (reading.proposedKind === 'needsMe') {
    next = captureNeedsMeItem(state, ctx, { title: reading.title, dueDate: reading.dueDate, provenance: confirmed });
    created = { kind: 'needsMe', id: next.needsMe[next.needsMe.length - 1].id };
  } else if (reading.proposedKind === 'event') {
    next = addEvent(state, ctx, {
      title: reading.title,
      categoryId: input.categoryId as string,
      subjectMemberId: reading.subjectMemberId,
      startsAt: reading.startsAt as string,
      endsAt: reading.endsAt as string,
      commitment: input.commitment ?? 'fixed',
      scope,
      provenance: confirmed,
      value: reading.value,
    });
    created = { kind: 'event', id: next.events[next.events.length - 1].id };
  } else {
    next = addTask(state, ctx, {
      title: reading.title,
      categoryId: input.categoryId as string,
      subjectMemberId: reading.subjectMemberId,
      durationMinutes: reading.durationMinutes ?? undefined,
      dueDate: reading.dueDate,
      commitment: input.commitment,
      scope,
      provenance: confirmed,
      value: reading.value,
    });
    created = { kind: 'task', id: next.tasks[next.tasks.length - 1].id };
  }

  next = replace(next, id, (r) => ({ ...r, state: 'accepted', acceptedRef: created, clarification: null, decidedAt: toInstant(ctx.nowMs) }));
  return appendObservation(next, ctx, { about: { kind: 'interpretation', id }, outcome: 'accepted', provenance: userProvenance() });
}

/** Every reading of one artifact, oldest first — how one email or one utterance yields several candidates that all name it. */
export function interpretationsOf(state: Pick<AppState, 'interpretations'>, artifactId: string): Interpretation[] {
  return state.interpretations.filter((r) => r.artifactId === artifactId);
}

