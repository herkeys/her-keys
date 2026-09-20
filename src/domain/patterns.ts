import type { TransitionContext } from './context';
import type { EvidenceLink, Pattern } from './foundation/pattern';
import { inferenceProvenance, provenanceFor, systemProvenance, type Provenance } from './foundation/provenance';
import { refExists, type TypedRef } from './foundation/typedRef';
import { independentCorroborations, promoteProvenance } from './reasoning/confidence';
import type { LocalDate } from './logicalDay';
import { toInstant } from './logicalDay';
import type { AppState } from './state';

/**
 * Patterns and explainability (B4-FE01-023 / -024, ADR-022).
 *
 * A pattern is something Her Keys has noticed, kept at a confidence, standing on the
 * specific observations that support it. Confidence changes in exactly one place —
 * `reassessPattern`, which recomputes it from those observations through the single
 * promotion boundary — and never because something was saved, re-read or synced.
 */

export interface ProposePatternInput {
  kind: Pattern['kind'];
  about?: TypedRef | null;
  categoryId?: string | null;
  weekday?: number | null;
  timeBucket?: Pattern['timeBucket'];
  /** The observations it stands on. */
  observationIds: readonly string[];
  code?: string;
}

const dateOf = (state: AppState, id: string): LocalDate | null => state.observations.find((o) => o.id === id)?.logicalDate ?? null;

export function proposePattern(state: AppState, ctx: TransitionContext, input: ProposePatternInput): AppState {
  const dates = input.observationIds.map((id) => dateOf(state, id)).filter((d): d is LocalDate => d !== null).sort();
  if (dates.length === 0 || dates.length !== input.observationIds.length) return state;
  if (input.about && !refExists(state, input.about)) return state;

  const at = toInstant(ctx.nowMs);
  const pattern: Pattern = {
    id: ctx.createId('pattern'),
    kind: input.kind,
    about: (input.about ?? null) as Pattern['about'],
    categoryId: input.categoryId ?? null,
    weekday: input.weekday ?? null,
    timeBucket: input.timeBucket ?? null,
    status: 'candidate',
    firstObservedOn: dates[0],
    lastObservedOn: dates[dates.length - 1],
    createdAt: at,
    updatedAt: at,
    provenance: provenanceFor(state.origin, inferenceProvenance('possible')),
    scope: 'personal',
  };
  const links: EvidenceLink[] = input.observationIds.map((observationId) => ({
    id: ctx.createId('evidence'),
    for: { kind: 'pattern', id: pattern.id },
    support: { kind: 'observation', id: observationId },
    code: input.code ?? 'pattern',
    createdAt: at,
    provenance: provenanceFor(state.origin, systemProvenance()),
    scope: 'personal',
  }));
  return reassessPattern({ ...state, patterns: [...state.patterns, pattern], evidenceLinks: [...state.evidenceLinks, ...links] }, ctx, pattern.id);
}

/**
 * Recompute a pattern's confidence from the observations that stand behind it. The
 * ONLY route by which a pattern's stored level rises without her, and it counts
 * INDEPENDENT sightings: five rows from one email are one sighting, and a producer
 * repeating itself on one day is one day.
 */
export function reassessPattern(state: AppState, ctx: TransitionContext, id: string): AppState {
  const pattern = state.patterns.find((p) => p.id === id);
  if (!pattern || pattern.status === 'rejected' || pattern.status === 'retired') return state;

  const supporting = state.evidenceLinks
    .filter((l) => l.for.kind === 'pattern' && l.for.id === id && l.support.kind === 'observation')
    .flatMap((l) => state.observations.filter((o) => o.id === l.support.id));
  const corroborations = independentCorroborations(
    supporting.map((o) => ({ producer: o.provenance.producer, artifactId: o.provenance.artifactId, logicalDate: o.logicalDate }))
  );

  const promoted = promoteProvenance(pattern.provenance, { corroborations, userConfirmed: false });
  const dates = supporting.map((o) => o.logicalDate).sort();
  if (promoted === pattern.provenance && dates.length === 0) return state;
  const at = toInstant(ctx.nowMs);
  return {
    ...state,
    patterns: state.patterns.map((p) =>
      p.id === id
        ? { ...p, provenance: promoted, firstObservedOn: dates[0] ?? p.firstObservedOn, lastObservedOn: dates[dates.length - 1] ?? p.lastObservedOn, updatedAt: promoted === pattern.provenance ? p.updatedAt : at }
        : p
    ),
  };
}

/** Only she can establish a pattern. Doing so is what confirms it. */
export function confirmPattern(state: AppState, ctx: TransitionContext, id: string): AppState {
  const pattern = state.patterns.find((p) => p.id === id);
  if (!pattern || pattern.status !== 'candidate') return state;
  const provenance: Provenance = promoteProvenance(pattern.provenance, { corroborations: 0, userConfirmed: true });
  return { ...state, patterns: state.patterns.map((p) => (p.id === id ? { ...p, status: 'confirmed', provenance, updatedAt: toInstant(ctx.nowMs) } : p)) };
}

export function rejectPattern(state: AppState, ctx: TransitionContext, id: string): AppState {
  const pattern = state.patterns.find((p) => p.id === id);
  if (!pattern || pattern.status === 'rejected') return state;
  return { ...state, patterns: state.patterns.map((p) => (p.id === id ? { ...p, status: 'rejected', updatedAt: toInstant(ctx.nowMs) } : p)) };
}

// ------------------------------------------------------------------ evidence ---

export function addEvidence(
  state: AppState,
  ctx: TransitionContext,
  input: { for: EvidenceLink['for']; support: EvidenceLink['support']; code: string; provenance?: Provenance }
): AppState {
  if (input.for.kind !== 'oneMove' && !refExists(state, input.for)) return state;
  if (!refExists(state, input.support)) return state;
  const link: EvidenceLink = {
    id: ctx.createId('evidence'),
    for: input.for,
    support: input.support,
    code: input.code,
    createdAt: toInstant(ctx.nowMs),
    provenance: provenanceFor(state.origin, input.provenance ?? systemProvenance()),
    scope: 'personal',
  };
  return { ...state, evidenceLinks: [...state.evidenceLinks, link] };
}

/** Why: the structured evidence behind a pattern, a One Move or an intent. Never a chain of thought. */
export function explain(state: Pick<AppState, 'evidenceLinks'>, subject: EvidenceLink['for'], since: string | null = null): EvidenceLink[] {
  return state.evidenceLinks.filter((l) => l.for.kind === subject.kind && l.for.id === subject.id && (since === null || Date.parse(l.createdAt) >= Date.parse(since)));
}
