import type { TransitionContext } from '../../../domain/context';
import type { Interpretation } from '../../../domain/foundation/interpretation';
import type { SourceArtifact } from '../../../domain/foundation/sourceArtifact';
import type { ContentRefKind } from '../../../domain/foundation/typedRef';
import {
  acceptInterpretation,
  canAccept,
  interpretationsOf,
  proposeInterpretation,
  recordArtifact,
  rejectInterpretation,
  retractSourceArtifact,
  supersedeInterpretation,
  type ProposeInterpretationInput,
} from '../../../domain/interpretations';
import { logicalDateAt } from '../../../domain/logicalDay';
import type { AppState, SystemRole } from '../../../domain/state';
import type { AppStore } from '../../../state/appStore';
import { ENVELOPE_LIMITS } from './local/envelope';
import { clarificationCodeOf, revise } from './revise';
import type { CaptureTextStore } from './textStore';
import type {
  ClarificationAnswer,
  InterpretationContext,
  InterpretationFailure,
  Proposal,
  ProposalDraft,
  ProposalPatch,
  TalkItOutInterpreterPort,
  UnsupportedItem,
} from './types';

/**
 * THE FEATURE COORDINATOR — the only place a capture becomes household state.
 *
 *   UI → coordinator → typed Proposal → existing domain mutation (via AppStore.commit) → canonical state
 *
 * The UI never creates a canonical record. Every truth-changing step goes through the foundation's own
 * durable state machine (`recordArtifact`, `proposeInterpretation`, `supersedeInterpretation`,
 * `acceptInterpretation`, `rejectInterpretation`, `retractSourceArtifact`) and is saved BEFORE it is
 * shown (`commit`), so what the woman sees is what is on disk.
 *
 * Idempotency is structural, not procedural:
 *   - a source is keyed by its `contentRef` (`capture:<submission key>`), so a retried or doubled submit
 *     finds the artifact it already made;
 *   - a source's readings are only proposed when it has none, so a retry cannot double them;
 *   - a reading can be accepted only while `pending`, so a second accept is a no-op inside the transition.
 *
 * Nothing in this file logs, stringifies or throws with her words.
 */

export interface CaptureSession {
  captureId: string;
  /** What the reader recognised but the durable model cannot hold. Session-only: shown, never stored. */
  unsupported: readonly UnsupportedItem[];
  failure: InterpretationFailure | null;
}

export type SubmitOutcome =
  | { kind: 'refused'; reason: 'empty' }
  | { kind: 'not-saved' }
  | { kind: 'high-stakes' }
  | { kind: 'text-unavailable'; captureId: string }
  | {
      kind: 'captured';
      captureId: string;
      readingIds: readonly string[];
      /** This submission key had already made a source; nothing new was created for it. */
      duplicate: boolean;
      failure: InterpretationFailure | null;
      unsupported: readonly UnsupportedItem[];
    };

export type RevisionOutcome =
  | { kind: 'revised'; readingId: string; supersededId: string; stillClarifying: boolean }
  | { kind: 'not-understood'; attempts: number; exhausted: boolean }
  | { kind: 'not-open' }
  | { kind: 'not-saved' };

export type CorrectionEdit = { kind: 'patch'; patch: ProposalPatch } | { kind: 'text'; text: string };

export type AcceptOutcome =
  | { kind: 'accepted'; readingId: string; ref: { kind: ContentRefKind; id: string } }
  | { kind: 'already-accepted'; readingId: string; ref: { kind: ContentRefKind; id: string } }
  | { kind: 'needs-clarification' }
  | { kind: 'needs-area' }
  | { kind: 'not-open' }
  | { kind: 'not-saved' };

export type RejectOutcome = { kind: 'rejected' } | { kind: 'not-open' } | { kind: 'not-saved' };
export type DismissOutcome = { kind: 'dismissed'; rejected: number; retracted: boolean } | { kind: 'gone' } | { kind: 'not-saved' };

export interface CaptureCoordinatorDeps {
  store: AppStore;
  interpreter: TalkItOutInterpreterPort;
  text: CaptureTextStore;
  /** The same clock the store uses, so "today" means one thing. */
  now: () => number;
}

export interface CaptureCoordinator {
  /** Read words without saving anything — used to route talk between capture and the discovery conversation. */
  preview(text: string): ReturnType<TalkItOutInterpreterPort['interpret']> | null;
  submit(input: { text: string; submissionKey: string }): Promise<SubmitOutcome>;
  /** Finish reading a source that has no readings yet (a retry after a failure or a crash). */
  interpretCapture(captureId: string): Promise<SubmitOutcome>;
  answerClarification(readingId: string, answer: ClarificationAnswer): Promise<RevisionOutcome>;
  correct(readingId: string, edit: CorrectionEdit): Promise<RevisionOutcome>;
  accept(readingId: string, choice?: { categoryId?: string }): Promise<AcceptOutcome>;
  reject(readingId: string): Promise<RejectOutcome>;
  dismissCapture(captureId: string): Promise<DismissOutcome>;
  sessionOf(captureId: string): CaptureSession | null;
  textOf(captureId: string): string | null;
}

// ----------------------------------------------------------------- helpers ---

export const captureRefOf = (key: string): string => `capture:${key}`;

export function interpretationContextOf(state: AppState, nowMs: number): InterpretationContext {
  const timeZone = state.user.timezone;
  const areas: SystemRole[] = [];
  for (const category of state.categories) if (category.status === 'active' && category.systemRole !== null && !areas.includes(category.systemRole)) areas.push(category.systemRole);
  return {
    nowMs,
    timeZone,
    today: logicalDateAt(nowMs, timeZone),
    children: state.children.map((child) => ({ id: child.id, displayName: child.displayName })),
    people: state.people.filter((person) => person.status === 'active').map((person) => ({ id: person.id, displayName: person.displayName })),
    areas,
  };
}

/** The first reading in a supersession chain: the moment she first said it, which every relative date in the chain is anchored to. */
export function chainRoot(state: Pick<AppState, 'interpretations'>, reading: Interpretation): Interpretation {
  let current = reading;
  for (let hops = 0; hops < ENVELOPE_LIMITS.maxClarificationSteps + 1000 && current.supersedesId !== null; hops += 1) {
    const previous = state.interpretations.find((r) => r.id === current.supersedesId);
    if (!previous) break;
    current = previous;
  }
  return current;
}

export function draftOf(state: Pick<AppState, 'interpretations'>, reading: Interpretation): ProposalDraft {
  return {
    readingId: reading.id,
    version: reading.interpretationVersion,
    kind: reading.proposedKind,
    title: reading.title,
    dueDate: reading.dueDate,
    startsAt: reading.startsAt,
    endsAt: reading.endsAt,
    durationMinutes: reading.durationMinutes,
    value: reading.value,
    subjectMemberId: reading.subjectMemberId,
    categoryHint: reading.categoryHint,
    clarificationCode: reading.clarification,
    createdAtMs: Date.parse(chainRoot(state, reading).createdAt),
  };
}

const inputOf = (p: Proposal): Omit<ProposeInterpretationInput, 'artifactId' | 'supersedesId'> => ({
  proposedKind: p.kind,
  title: p.title,
  dueDate: p.dueDate,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  durationMinutes: p.durationMinutes,
  value: p.value,
  subjectMemberId: p.subjectMemberId,
  categoryHint: p.categoryHint,
  confidence: p.confidence,
  producer: 'ai-inference',
  clarification: clarificationCodeOf(p),
});

const artifactOf = (state: AppState, captureId: string): SourceArtifact | undefined => state.sourceArtifacts.find((a) => a.id === captureId);

/** An area chosen from a hint, only ever an area this household actually has. */
export function categoryIdForHint(state: Pick<AppState, 'categories'>, hint: SystemRole | null): string | null {
  if (hint === null) return null;
  return state.categories.find((c) => c.systemRole === hint && c.status === 'active')?.id ?? null;
}

// -------------------------------------------------------------- coordinator ---

export function createCaptureCoordinator(deps: CaptureCoordinatorDeps): CaptureCoordinator {
  const { store, interpreter, text, now } = deps;
  const sessions = new Map<string, CaptureSession>();
  const understoodFailures = new Map<string, number>();
  const inflight = new Map<string, Promise<SubmitOutcome>>();

  const snapshotState = (): AppState | null => store.getSnapshot().state;
  const contextNow = (state: AppState) => interpretationContextOf(state, now());

  async function proposeReadings(captureId: string, proposals: readonly Proposal[]): Promise<boolean> {
    return store.commit((state, ctx) => {
      // A source that already has readings is never read into again: a retry, a double call and a restore all land here.
      if (interpretationsOf(state, captureId).length > 0 || !artifactOf(state, captureId)) return state;
      let next = state;
      for (const proposal of proposals) next = proposeInterpretation(next, ctx, { artifactId: captureId, ...inputOf(proposal) });
      return next;
    });
  }

  async function readAndPropose(captureId: string, duplicate: boolean, precomputed?: ReturnType<TalkItOutInterpreterPort['interpret']>): Promise<SubmitOutcome> {
    const state = snapshotState();
    const artifact = state ? artifactOf(state, captureId) : undefined;
    if (!state || !artifact || artifact.retractedAt !== null) return { kind: 'not-saved' };

    const existing = interpretationsOf(state, captureId);
    if (existing.length > 0) {
      return { kind: 'captured', captureId, readingIds: existing.map((r) => r.id), duplicate: true, failure: null, unsupported: sessions.get(captureId)?.unsupported ?? [] };
    }

    const words = artifact.contentRef === null ? null : text.get(artifact.contentRef);
    if (words === null) return { kind: 'text-unavailable', captureId };

    const result = precomputed ?? interpreter.interpret({ captureId, text: words, context: contextNow(state) });
    sessions.set(captureId, { captureId, unsupported: result.unsupported, failure: result.failure });
    if (result.proposals.length === 0) return { kind: 'captured', captureId, readingIds: [], duplicate, failure: result.failure, unsupported: result.unsupported };

    if (!(await proposeReadings(captureId, result.proposals))) return { kind: 'not-saved' };
    const after = snapshotState();
    const readings = after ? interpretationsOf(after, captureId) : [];
    return { kind: 'captured', captureId, readingIds: readings.map((r) => r.id), duplicate, failure: null, unsupported: result.unsupported };
  }

  async function submitNow(input: { text: string; submissionKey: string }): Promise<SubmitOutcome> {
    const words = input.text.trim();
    // Input that normalises to nothing creates nothing: no source, no reading, no inbox item.
    if (words.length === 0) return { kind: 'refused', reason: 'empty' };
    const state = snapshotState();
    if (!state) return { kind: 'not-saved' };

    const contentRef = captureRefOf(input.submissionKey);
    const already = state.sourceArtifacts.find((a) => a.contentRef === contentRef);
    if (already) {
      // Same submission key: the source exists. Finish reading it if it was never read; never make a second source.
      if (!text.has(contentRef)) text.put(contentRef, words);
      return readAndPropose(already.id, true);
    }

    const preview = interpreter.interpret({ captureId: input.submissionKey, text: words, context: contextNow(state) });
    // High-stakes text is neither saved nor read: no source, no reading, nothing durable, nothing sent (OD-2).
    if (preview.failure?.code === 'high-stakes') return { kind: 'high-stakes' };

    // Her words are held first, so a source can never exist without them for as long as the session lasts.
    text.put(contentRef, words);
    const saved = await store.commit((s, ctx) => {
      if (s.sourceArtifacts.some((a) => a.contentRef === contentRef)) return s;
      return recordArtifact(s, ctx, { kind: 'message', origin: 'user-submitted', contentRef, contentDigest: null }).state;
    });
    const after = snapshotState();
    const artifact = after?.sourceArtifacts.find((a) => a.contentRef === contentRef);
    if (!saved || !artifact) {
      text.delete(contentRef);
      return { kind: 'not-saved' };
    }
    return readAndPropose(artifact.id, false, { ...preview, captureId: artifact.id });
  }

  return {
    preview(words) {
      const state = snapshotState();
      if (!state || words.trim().length === 0) return null;
      return interpreter.interpret({ captureId: 'preview', text: words.trim(), context: contextNow(state) });
    },

    submit(input) {
      // The same submission key in flight twice is one submission.
      const running = inflight.get(input.submissionKey);
      if (running) return running;
      const promise = submitNow(input).finally(() => inflight.delete(input.submissionKey));
      inflight.set(input.submissionKey, promise);
      return promise;
    },

    interpretCapture(captureId) {
      return readAndPropose(captureId, true);
    },

    async answerClarification(readingId, answer) {
      const state = snapshotState();
      const reading = state?.interpretations.find((r) => r.id === readingId);
      if (!state || !reading || reading.state !== 'clarifying') return { kind: 'not-open' };

      const result = interpreter.clarify({ captureId: reading.artifactId, proposal: draftOf(state, reading), answer, context: contextNow(state) });
      const revised = result.proposals[0];
      if (result.failure || !revised) {
        const attempts = (understoodFailures.get(readingId) ?? 0) + 1;
        understoodFailures.set(readingId, attempts);
        return { kind: 'not-understood', attempts, exhausted: attempts >= ENVELOPE_LIMITS.maxUnderstoodRetries };
      }
      return applyRevision(readingId, revised);
    },

    async correct(readingId, edit) {
      const state = snapshotState();
      const reading = state?.interpretations.find((r) => r.id === readingId);
      if (!state || !reading || (reading.state !== 'pending' && reading.state !== 'clarifying')) return { kind: 'not-open' };
      const context = contextNow(state);
      const draft = draftOf(state, reading);

      let revised: Proposal | null = null;
      if (edit.kind === 'patch') {
        revised = revise(draft, edit.patch, context);
      } else {
        const read = interpreter.readCorrection({ proposal: draft, text: edit.text, context });
        if (read.kind === 'patch') revised = revise(draft, read.patch, context);
        else if (read.kind === 'question') revised = revise(draft, {}, context, { extraSteps: read.request.steps });
      }
      if (!revised) {
        const attempts = (understoodFailures.get(readingId) ?? 0) + 1;
        understoodFailures.set(readingId, attempts);
        return { kind: 'not-understood', attempts, exhausted: attempts >= ENVELOPE_LIMITS.maxUnderstoodRetries };
      }
      return applyRevision(readingId, revised);
    },

    async accept(readingId, choice) {
      const state = snapshotState();
      const reading = state?.interpretations.find((r) => r.id === readingId);
      if (!state || !reading) return { kind: 'not-open' };
      if (reading.state === 'accepted' && reading.acceptedRef) return { kind: 'already-accepted', readingId, ref: reading.acceptedRef };
      if (reading.state === 'clarifying') return { kind: 'needs-clarification' };
      if (reading.state !== 'pending') return { kind: 'not-open' };

      let categoryId: string | undefined;
      if (reading.proposedKind !== 'needsMe') {
        const chosen = choice?.categoryId;
        const valid = chosen !== undefined && state.categories.some((c) => c.id === chosen && c.status === 'active');
        categoryId = (valid ? chosen : undefined) ?? categoryIdForHint(state, reading.categoryHint) ?? undefined;
        if (categoryId === undefined) return { kind: 'needs-area' };
      }
      if (!canAccept(reading, { categoryId }).ok) return { kind: 'not-open' };

      const saved = await store.commit((s, ctx) => acceptInterpretation(s, ctx, readingId, { categoryId }));
      const after = snapshotState()?.interpretations.find((r) => r.id === readingId);
      if (!saved || !after) return { kind: 'not-saved' };
      if (after.state === 'accepted' && after.acceptedRef) {
        // Two accepts of one reading race to the same state: whichever ran second changed nothing.
        return { kind: 'accepted', readingId, ref: after.acceptedRef };
      }
      return { kind: 'not-open' };
    },

    async reject(readingId) {
      const reading = snapshotState()?.interpretations.find((r) => r.id === readingId);
      if (!reading || (reading.state !== 'pending' && reading.state !== 'clarifying')) return { kind: 'not-open' };
      const saved = await store.commit((s, ctx) => rejectInterpretation(s, ctx, readingId));
      return saved ? { kind: 'rejected' } : { kind: 'not-saved' };
    },

    async dismissCapture(captureId) {
      const state = snapshotState();
      const artifact = state ? artifactOf(state, captureId) : undefined;
      if (!state || !artifact || artifact.retractedAt !== null) return { kind: 'gone' };
      const open = interpretationsOf(state, captureId).filter((r) => r.state === 'pending' || r.state === 'clarifying');
      const hasReadings = interpretationsOf(state, captureId).length > 0;
      const saved = await store.commit((s, ctx) => {
        let next = s;
        for (const reading of open) next = rejectInterpretation(next, ctx, reading.id);
        // A source with no readings can only leave the inbox by being withdrawn; one that was read is resolved by its readings.
        return hasReadings ? next : retractSourceArtifact(next, ctx, captureId);
      });
      if (!saved) return { kind: 'not-saved' };
      if (artifact.contentRef !== null && !hasReadings) text.delete(artifact.contentRef);
      return { kind: 'dismissed', rejected: open.length, retracted: !hasReadings };
    },

    sessionOf: (captureId) => sessions.get(captureId) ?? null,

    textOf(captureId) {
      const state = snapshotState();
      const artifact = state ? artifactOf(state, captureId) : undefined;
      return artifact?.contentRef ? text.get(artifact.contentRef) : null;
    },
  };

  /** Superseding, never patching in place: the reading she was shown stays as history, and the new one names it. */
  async function applyRevision(readingId: string, revised: Proposal): Promise<RevisionOutcome> {
    const saved = await store.commit((state, ctx: TransitionContext) => {
      const reading = state.interpretations.find((r) => r.id === readingId);
      if (!reading || (reading.state !== 'pending' && reading.state !== 'clarifying')) return state;
      return supersedeInterpretation(state, ctx, readingId, inputOf(revised));
    });
    if (!saved) return { kind: 'not-saved' };
    const after = snapshotState();
    const successor = after?.interpretations.find((r) => r.supersedesId === readingId);
    if (!successor) return { kind: 'not-open' };
    understoodFailures.delete(readingId);
    return { kind: 'revised', readingId: successor.id, supersededId: readingId, stillClarifying: successor.state === 'clarifying' };
  }
}

/** For a clarifying reading: whether her free-text answers have failed enough times that the UI should stop asking and offer manual correction. */
export function isClarificationExhausted(failures: number): boolean {
  return failures >= ENVELOPE_LIMITS.maxUnderstoodRetries;
}
