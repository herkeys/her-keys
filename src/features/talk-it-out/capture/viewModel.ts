import type { Interpretation } from '../../../domain/foundation/interpretation';
import type { ConfidenceLevel, ProvenanceSource } from '../../../domain/foundation/provenance';
import { epochMsOf, logicalDateAt, type LocalDate } from '../../../domain/logicalDay';
import type { HydrationStatus } from '../../../domain/routeAccess';
import type { AppState, SystemRole } from '../../../domain/state';
import type { RecoveryReason } from '../../../state/appStore';
import { unresolvedCaptureAttention, type CaptureUrgency, type UnresolvedAttentionReason } from './attention';
import { categoryIdForHint, chainRoot, draftOf, type CaptureSession } from './coordinator';
import { copy } from './copy';
import { formatDay, formatDayFull, formatEventWhen, formatMoneyLine, formatReceived, weekdayName } from './format';
import { ENVELOPE_LIMITS } from './local/envelope';
import { requestFromDraft } from './revise';
import type { ClarificationOption, ClarificationStep, ProposalKind } from './types';

/**
 * Durable state (+ what only the running session knows) → exactly what the screen renders.
 *
 * View models decide phase, ordering, which actions exist and what the copy says. They never mutate,
 * never invent truth or confidence, never create a destination type, and never present a provisional
 * value of an open question as a fact.
 */

export interface FieldVM {
  label: string;
  value: string;
}

export interface QuestionVM {
  step: ClarificationStep['kind'];
  prompt: string;
  options: Array<{ key: string; label: string; option: ClarificationOption }>;
  /** Questions still to come after this one. */
  remaining: number;
  remainingLabel: string | null;
  exhausted: boolean;
}

export type ProposalPhase = 'clarifying' | 'ready' | 'accepted' | 'rejected';

export interface ProposalVM {
  readingId: string;
  captureId: string;
  phase: ProposalPhase;
  kind: ProposalKind;
  kindLabel: string;
  title: string;
  /** Typed facts of the reading. Empty while a question is open: a provisional value is not shown as a fact. */
  fields: FieldVM[];
  /** The stored confidence of an open reading. Null once decided. */
  confidence: ConfidenceLevel | null;
  provenance: ProvenanceSource;
  /** What she was not sure of, what was assumed, and that this is a revision — each an honest, typed note. */
  notes: string[];
  question: QuestionVM | null;
  area: { needed: boolean; selectedId: string | null; options: Array<{ id: string; name: string }> } | null;
  /** Evidence lines for "Why this". Only facts: what she wrote (while the session holds it) or where it was read from. */
  evidence: string[];
  outcomeLine: string | null;
  actions: { canAccept: boolean; canReject: boolean; canFix: boolean };
}

export type CapturePhase = 'awaiting-interpretation' | 'needs-clarification' | 'needs-review' | 'resolved';

export interface CaptureVM {
  captureId: string;
  phase: CapturePhase;
  receivedLabel: string;
  source: { kind: 'echo'; text: string; long: boolean; label: string } | { kind: 'unavailable'; message: string };
  proposals: ProposalVM[];
  /** Earlier readings this one replaced. History, not shown as cards. */
  revisions: number;
  progress: { decided: number; total: number };
  /** Session-only notes: what could not be turned into anything, and why. */
  sessionNotes: string[];
  /** The source has no reading and its words are gone — the honest, restart-survivor state. */
  hollow: boolean;
  actions: { canDismiss: boolean; canRetry: boolean };
}

const LONG_SOURCE = 280;
const EXCERPT = 42;

const openState = (r: Interpretation) => r.state === 'pending' || r.state === 'clarifying';

export const areaName = (state: Pick<AppState, 'categories'>, role: SystemRole | null): string | null =>
  role === null ? null : (state.categories.find((c) => c.systemRole === role && c.status === 'active')?.name ?? null);

// ------------------------------------------------------------------ one reading ---

interface ReviewInputs {
  state: AppState;
  nowMs: number;
  text: string | null;
  session: CaptureSession | null;
  areaChoice?: Readonly<Record<string, string>>;
  failures?: Readonly<Record<string, number>>;
}

function optionLabel(option: ClarificationOption, step: ClarificationStep, state: AppState, anchor: LocalDate): string {
  switch (option.kind) {
    case 'child':
      return state.children.find((c) => c.id === option.memberId)?.displayName ?? 'Unknown child';
    case 'no-child':
      return copy.clarify.optionNoChild;
    case 'direction':
      return option.direction === 'outflow' ? copy.clarify.optionPay : copy.clarify.optionOwed;
    case 'date': {
      const label = formatDayFull(option.date);
      if (step.kind === 'which_day' && step.weekday === null) return option.date === anchor ? copy.clarify.optionToday(label) : copy.clarify.optionTomorrow(label);
      return copy.clarify.optionDate(label);
    }
  }
}

function questionOf(reading: Interpretation, inputs: ReviewInputs): QuestionVM | null {
  const { state, failures } = inputs;
  const request = requestFromDraft(draftOf(state, reading), { children: state.children, timeZone: state.user.timezone });
  if (!request) return null;
  const step = request.steps[0];
  const anchor = logicalDateAt(epochMsOf(chainRoot(state, reading).createdAt), state.user.timezone);
  const remaining = request.steps.length - 1;
  return {
    step: step.kind,
    prompt: step.kind === 'which_day' ? copy.clarify.which_day(step.weekday === null ? null : weekdayName(step.weekday)) : copy.clarify[step.kind],
    options: request.options.map((option, index) => ({ key: `${step.kind}-${index}`, label: optionLabel(option, step, state, anchor), option })),
    remaining,
    remainingLabel: remaining > 0 ? copy.clarify.remaining(remaining) : null,
    exhausted: (failures?.[reading.id] ?? 0) >= ENVELOPE_LIMITS.maxUnderstoodRetries,
  };
}

function factsOf(reading: Interpretation, inputs: ReviewInputs): FieldVM[] {
  const { state, nowMs } = inputs;
  const tz = state.user.timezone;
  const today = logicalDateAt(nowMs, tz);
  const fields: FieldVM[] = [{ label: copy.review.fieldWhat, value: reading.title }];
  if (reading.proposedKind === 'event' && reading.startsAt && reading.endsAt) fields.push({ label: copy.review.fieldWhen, value: formatEventWhen(reading.startsAt, reading.endsAt, tz, today) });
  else if (reading.dueDate) fields.push({ label: reading.proposedKind === 'needsMe' ? copy.review.fieldDate : copy.review.fieldDue, value: formatDay(reading.dueDate, today) });
  if (reading.value) fields.push({ label: copy.review.fieldAmount, value: formatMoneyLine(reading.value) });
  if (reading.proposedKind !== 'needsMe') {
    const child = reading.subjectMemberId ? state.children.find((c) => c.id === reading.subjectMemberId) : null;
    if (child) fields.push({ label: copy.review.fieldFor, value: child.displayName });
  }
  return fields;
}

function evidenceOf(reading: Interpretation, inputs: ReviewInputs): string[] {
  const { state, nowMs, text, session } = inputs;
  const details = session?.details.get(reading.id);
  const lines: string[] = [];
  if (text !== null && details) {
    for (const ref of details.evidence) {
      if (ref.field === 'kind') continue;
      if (ref.span) {
        const raw = text.slice(ref.span.start, ref.span.end).replace(/\s+/g, ' ').trim();
        if (raw.length > 0) lines.push(copy.review.whyEvidence(raw.length > EXCERPT ? `${raw.slice(0, EXCERPT - 1)}…` : raw, copy.review.whatLabels[ref.field]));
      } else if (ref.field === 'area') {
        const name = areaName(state, reading.categoryHint);
        if (name) lines.push(copy.review.whyArea(name));
      } else if (ref.field === 'direction') {
        lines.push(copy.review.whyDirection);
      }
    }
  }
  if (lines.length === 0) {
    const artifact = state.sourceArtifacts.find((a) => a.id === reading.artifactId);
    if (artifact) lines.push(copy.review.whyDurable(formatReceived(artifact.receivedAt, state.user.timezone, logicalDateAt(nowMs, state.user.timezone)).toLowerCase()));
  }
  return lines;
}

export function buildProposalVM(reading: Interpretation, inputs: ReviewInputs): ProposalVM {
  const { state, areaChoice } = inputs;
  const phase: ProposalPhase = reading.state === 'clarifying' ? 'clarifying' : reading.state === 'pending' ? 'ready' : reading.state === 'accepted' ? 'accepted' : 'rejected';
  const isOpen = openState(reading);
  const details = inputs.session?.details.get(reading.id);
  const question = reading.state === 'clarifying' ? questionOf(reading, inputs) : null;

  const notes: string[] = [];
  if (reading.state === 'clarifying') {
    // A question is open: the values behind it are provisional and are not shown, so nothing is said about them.
    if (reading.clarification?.startsWith('which_child')) notes.push(copy.review.childOpen);
  } else if (reading.state === 'pending') {
    for (const code of details?.assumptions ?? []) notes.push(copy.review.assumption(code));
    if (reading.interpretationVersion > 1) notes.push(copy.review.revised);
    // Once the session's own record is gone (after a restart) what was assumed is no longer known: say so plainly.
    if (!details) notes.push(copy.review.checkDetails);
  }

  const needsArea = reading.state === 'pending' && reading.proposedKind !== 'needsMe';
  const chosen = areaChoice?.[reading.id] ?? null;
  const hinted = categoryIdForHint(state, reading.categoryHint);
  const area = needsArea
    ? {
        needed: chosen === null && hinted === null,
        selectedId: chosen ?? hinted,
        options: state.categories.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name })),
      }
    : null;

  const areaLine = area?.selectedId ? state.categories.find((c) => c.id === area.selectedId)?.name : null;
  const fields = reading.state === 'clarifying' ? [{ label: copy.review.fieldWhat, value: reading.title }] : factsOf(reading, inputs);
  if (isOpen && reading.state === 'pending' && areaLine) fields.push({ label: copy.review.fieldArea, value: areaLine });

  return {
    readingId: reading.id,
    captureId: reading.artifactId,
    phase,
    kind: reading.proposedKind,
    kindLabel: copy.review.kind(reading.proposedKind, reading.dueDate !== null),
    title: reading.title,
    fields,
    confidence: isOpen ? reading.provenance.confidence : null,
    provenance: reading.provenance.producer,
    notes: notes.filter((n) => n.length > 0),
    question,
    area,
    evidence: isOpen && reading.state === 'pending' ? evidenceOf(reading, inputs) : [],
    outcomeLine: reading.state === 'accepted' ? copy.review.savedAs(reading.proposedKind) : reading.state === 'rejected' ? copy.review.rejected : null,
    actions: {
      canAccept: reading.state === 'pending' && (reading.proposedKind === 'needsMe' || !(area?.needed ?? false)),
      canReject: isOpen,
      canFix: isOpen,
    },
  };
}

// ---------------------------------------------------------------- one capture ---

/** The readings that are current: a superseded reading is history and is never a card of its own. */
export const leafReadings = (state: Pick<AppState, 'interpretations'>, captureId: string): Interpretation[] =>
  state.interpretations.filter((r) => r.artifactId === captureId && r.state !== 'superseded');

export function capturePhaseOf(state: AppState, captureId: string): CapturePhase {
  const leaves = leafReadings(state, captureId);
  if (leaves.length === 0) return 'awaiting-interpretation';
  if (leaves.some((r) => r.state === 'clarifying')) return 'needs-clarification';
  if (leaves.some((r) => r.state === 'pending')) return 'needs-review';
  return 'resolved';
}

export function buildCaptureVM(inputs: ReviewInputs & { captureId: string }): CaptureVM | null {
  const { state, captureId, nowMs, text, session } = inputs;
  const artifact = state.sourceArtifacts.find((a) => a.id === captureId);
  if (!artifact) return null;
  const tz = state.user.timezone;
  const today = logicalDateAt(nowMs, tz);
  const leaves = leafReadings(state, captureId);
  const all = state.interpretations.filter((r) => r.artifactId === captureId);
  const decided = leaves.filter((r) => !openState(r)).length;
  const retracted = artifact.retractedAt !== null;
  const phase = retracted ? 'resolved' : capturePhaseOf(state, captureId);
  const hollow = leaves.length === 0 && text === null && !retracted;

  const sessionNotes: string[] = [];
  if (session?.failure) sessionNotes.push(copy.capture.failure(session.failure.code));
  const seen = new Set<string>();
  for (const item of session?.unsupported ?? []) {
    const key = item.reason === 'responsibility-handoff' ? `handoff:${item.person?.name ?? ''}` : item.reason;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.reason === 'responsibility-handoff' && item.person) sessionNotes.push(item.person.known ? copy.review.handoffKnown(item.person.name) : copy.review.handoff(item.person.name));
    else if (item.reason !== 'responsibility-handoff') sessionNotes.push(copy.review.unsupported(item.reason));
  }

  return {
    captureId,
    phase,
    receivedLabel: formatReceived(artifact.receivedAt, tz, today),
    source:
      text !== null
        ? { kind: 'echo', text, long: text.length > LONG_SOURCE, label: copy.review.sourceLabel }
        : { kind: 'unavailable', message: copy.review.sourceUnavailable },
    proposals: leaves.map((r) => buildProposalVM(r, inputs)),
    revisions: all.length - leaves.length,
    progress: { decided, total: leaves.length },
    sessionNotes,
    hollow,
    actions: { canDismiss: phase !== 'resolved', canRetry: leaves.length === 0 && text !== null && !retracted },
  };
}

// ------------------------------------------------------------------ Life Inbox ---

export interface InboxItemVM {
  captureId: string;
  phase: Exclude<CapturePhase, 'resolved'>;
  headline: string;
  phaseLabel: string;
  progressLabel: string | null;
  /** When the referenced time is, and whether it has passed — set only when a reading names a time. */
  whenLabel: string | null;
  passed: boolean;
  urgency: CaptureUrgency;
  reason: UnresolvedAttentionReason;
  receivedLabel: string;
  hollow: boolean;
  openCount: number;
}

export type LifeInboxVM =
  | { phase: 'loading'; message: string }
  | { phase: 'recovery'; message: string; items: InboxItemVM[] }
  | { phase: 'empty'; message: string }
  | { phase: 'items'; items: InboxItemVM[]; count: number };

export function buildInboxItems(
  state: AppState,
  nowMs: number,
  textAvailable: (captureId: string) => boolean,
  sessionOf: (captureId: string) => CaptureSession | null = () => null
): InboxItemVM[] {
  const tz = state.user.timezone;
  const today = logicalDateAt(nowMs, tz);
  const attention = unresolvedCaptureAttention(state, nowMs);
  const items: InboxItemVM[] = [];
  const seen = new Set<string>();

  for (const entry of attention) {
    if (seen.has(entry.captureId)) continue;
    seen.add(entry.captureId);
    const artifact = state.sourceArtifacts.find((a) => a.id === entry.captureId);
    if (!artifact) continue;
    const leaves = leafReadings(state, entry.captureId);
    const phase = capturePhaseOf(state, entry.captureId);
    if (phase === 'resolved') continue;
    const top = entry.readingId ? leaves.find((r) => r.id === entry.readingId) : undefined;
    const hollow = leaves.length === 0 && !textAvailable(entry.captureId);
    const decided = leaves.filter((r) => !openState(r)).length;
    const whenLabel = top
      ? top.startsAt && top.endsAt
        ? formatEventWhen(top.startsAt, top.endsAt, tz, today)
        : top.dueDate
          ? `${top.proposedKind === 'task' ? copy.review.fieldDue : copy.review.fieldDate} ${formatDay(top.dueDate, today).toLowerCase()}`
          : null
      : null;
    items.push({
      captureId: entry.captureId,
      phase,
      headline: top?.title ?? copy.inbox.hollowTitle,
      phaseLabel:
        phase === 'needs-clarification'
          ? copy.inbox.phaseClarify
          : phase === 'needs-review'
            ? copy.inbox.phaseReview
            : sessionOf(entry.captureId)?.failure
              ? copy.inbox.phaseFailed
              : copy.inbox.phaseAwaiting,
      progressLabel: leaves.length > 1 || decided > 0 ? copy.inbox.progress(decided, leaves.length) : null,
      whenLabel,
      passed: entry.passed,
      urgency: entry.urgency,
      reason: entry.reason,
      receivedLabel: formatReceived(artifact.receivedAt, tz, today),
      hollow,
      openCount: leaves.filter(openState).length,
    });
  }
  return items;
}

/**
 * LOADING ≠ EMPTY, and RECOVERY ≠ NOTHING NEEDS ATTENTION. An empty inbox is only ever reported for a
 * household that has actually loaded and was not recovered from unreadable stored state.
 */
export function buildLifeInbox(input: {
  status: HydrationStatus;
  recovery: { reason: RecoveryReason; quarantined: boolean } | null;
  state: AppState | null;
  nowMs: number;
  textAvailable: (captureId: string) => boolean;
  sessionOf?: (captureId: string) => CaptureSession | null;
}): LifeInboxVM {
  const { status, recovery, state, nowMs, textAvailable, sessionOf } = input;
  if (state === null || status === 'unhydrated' || status === 'hydrating') return { phase: 'loading', message: copy.inbox.loading };
  const items = buildInboxItems(state, nowMs, textAvailable, sessionOf);
  if (recovery !== null || status === 'recovery') return { phase: 'recovery', message: copy.inbox.recovery, items };
  if (items.length === 0) return { phase: 'empty', message: copy.inbox.empty };
  return { phase: 'items', items, count: items.length };
}

/** The one line the Life hub shows for the Inbox. Never says "nothing" while loading or recovering. */
export function inboxRowValue(vm: LifeInboxVM): string {
  switch (vm.phase) {
    case 'loading':
      return copy.inbox.loading;
    case 'recovery':
      return vm.items.length > 0 ? copy.inbox.rowCount(vm.items.length) : copy.inbox.recovery;
    case 'empty':
      return copy.inbox.rowEmpty;
    case 'items':
      return copy.inbox.rowCount(vm.count);
  }
}
