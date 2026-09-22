import type { TransitionContext } from '../../../domain/context';
import { emptySystemFacets } from '../../../domain/foundation/commitment';
import { provenanceFor, userProvenance } from '../../../domain/foundation/provenance';
import type { SystemStep } from '../../../domain/foundation/structure';
import { toInstant } from '../../../domain/logicalDay';
import { ID_PATTERN } from '../../../domain/schemaPrimitives';
import type { AppState, HouseholdSystem } from '../../../domain/state';
import { stepsInOrder } from '../../../domain/structure';
import { systemFingerprint } from '../model/fingerprint';
import { validateDraft, type DraftBase, type DraftIssue, type SystemDraft } from './draft';
import { setCalendarSchedule, stopSchedule } from './schedule';
import { layoutPositions } from './stepOrder';

/**
 * PRODUCTION PRODUCER ADDED BY FEATURE 04 — NOT PRESENT AT COMMON FORK (Addendum A).
 *
 * The foundation defines the durable types (`HouseholdSystem`, `SystemStep`, `RecurrenceRule`),
 * their storage and the store's `commit(Transition)`, but nothing that CREATES or EDITS a System.
 * This turns an editor draft into those same rows, and nothing else: no new persisted field, no new
 * kind, no new sync op, no parallel store. It is one pure transition, so the store validates the
 * whole resulting state before anything is shown or written.
 *
 * Guarantees:
 *  - explicit save only — a draft is never canonical until this runs (draft ≠ canonical);
 *  - stale-safe — if the rows the editor opened on changed underneath it, nothing is written;
 *  - idempotent — a create replays as `already_saved`; new steps get ids derived from stable draft
 *    keys, so a retry re-applies to the same rows instead of duplicating them;
 *  - conservative — untouched rows keep their identity and their `updatedAt`; scope, facets
 *    (automation mode, effort, energy) and provenance are preserved verbatim, never rewritten;
 *  - step order never becomes dependency, and no step is ever removed (there is no retire semantic).
 */

export type SaveOutcome =
  | { kind: 'saved'; systemId: string }
  /** A create that already landed (a retry or a double submit). Nothing was written a second time. */
  | { kind: 'already_saved'; systemId: string }
  /** Canonical rows moved underneath the editor. Nothing was written; the editor must reload. */
  | { kind: 'stale' }
  | { kind: 'missing' }
  | { kind: 'invalid'; issues: DraftIssue[] };

export interface SaveResult {
  state: AppState;
  outcome: SaveOutcome;
}

const KEY_PATTERN = /^[A-Za-z0-9]{1,24}$/;

/** The canonical id of a step added in a draft. Deterministic, so replaying the same draft cannot duplicate it. */
export const derivedStepId = (systemId: string, key: string): string => `${systemId}.${key}`;

function identifierIssues(draft: SystemDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!ID_PATTERN.test(draft.systemId)) issues.push({ code: 'identifier_invalid', field: 'system' });
  for (const step of draft.steps) {
    if (step.id === null && (!KEY_PATTERN.test(step.key) || !ID_PATTERN.test(derivedStepId(draft.systemId, step.key)))) {
      issues.push({ code: 'identifier_invalid', field: `step:${step.key}` });
    }
  }
  return issues;
}

function upsertSystem(state: AppState, draft: SystemDraft, existing: HouseholdSystem | null): AppState {
  const name = draft.name.trim();
  const description = draft.purpose.trim();
  if (existing === null) {
    const created: HouseholdSystem = {
      id: draft.systemId,
      name,
      description,
      categoryId: draft.categoryId,
      ...emptySystemFacets(),
      provenance: provenanceFor(state.origin, userProvenance()),
      // A household routine. Never 'child': the cloud requires a subject for that and a System cannot carry one (MP-02).
      scope: 'household',
      subjectMemberId: null,
    };
    return { ...state, systems: [...state.systems, created] };
  }
  if (existing.name === name && existing.description === description && existing.categoryId === draft.categoryId) return state;
  // Only what the editor edits. Scope, facets and provenance stay exactly as they were.
  const updated: HouseholdSystem = { ...existing, name, description, categoryId: draft.categoryId };
  return { ...state, systems: state.systems.map((system) => (system.id === existing.id ? updated : system)) };
}

function upsertSteps(state: AppState, ctx: TransitionContext, draft: SystemDraft): AppState {
  const at = toInstant(ctx.nowMs);
  const current = new Map(stepsInOrder(state, draft.systemId).map((step) => [step.id, step]));
  const idOf = (step: SystemDraft['steps'][number]) => step.id ?? derivedStepId(draft.systemId, step.key);

  const { positions } = layoutPositions(draft.steps.map((step) => ({ position: current.get(idOf(step))?.position ?? null })));

  const revised = new Map<string, SystemStep>();
  const added: SystemStep[] = [];
  draft.steps.forEach((step, index) => {
    const id = idOf(step);
    const title = step.title.trim();
    const row = current.get(id);
    if (row) {
      if (row.title === title && row.effortMinutes === step.effortMinutes && row.position === positions[index]) return; // untouched: keep its identity
      revised.set(id, { ...row, title, effortMinutes: step.effortMinutes, position: positions[index], updatedAt: at });
    } else {
      added.push({
        id,
        systemId: draft.systemId,
        position: positions[index],
        title,
        effortMinutes: step.effortMinutes,
        createdAt: at,
        updatedAt: at,
        provenance: provenanceFor(state.origin, userProvenance()),
        scope: 'personal',
      });
    }
  });
  if (revised.size === 0 && added.length === 0) return state;
  return { ...state, systemSteps: [...state.systemSteps.map((row) => revised.get(row.id) ?? row), ...added] };
}

/**
 * Turn a draft into canonical rows. Pure: the caller (the store's `commit`) validates the result.
 * On anything other than `saved`, the returned state is the input state — nothing was written.
 */
export function applySystemDraft(state: AppState, ctx: TransitionContext, draft: SystemDraft, base: DraftBase): SaveResult {
  const refuse = (outcome: SaveOutcome): SaveResult => ({ state, outcome });

  const malformed = identifierIssues(draft);
  if (malformed.length > 0) return refuse({ kind: 'invalid', issues: malformed });

  // Existence and staleness come BEFORE validation that reads canonical rows: if the rows moved under
  // the editor, "reload" is the truthful answer, not a validation complaint about a draft that was fine
  // when it was opened.
  const existing = state.systems.find((system) => system.id === draft.systemId) ?? null;
  if (draft.isNew) {
    if (existing !== null) return refuse({ kind: 'already_saved', systemId: draft.systemId });
  } else {
    if (existing === null) return refuse({ kind: 'missing' });
    // The check runs on the very state this commit will write, inside the store's serialized turn, so it cannot race.
    if (base.fingerprint !== systemFingerprint(state, draft.systemId)) return refuse({ kind: 'stale' });
  }

  const issues = validateDraft(state, draft);
  if (issues.length > 0) return refuse({ kind: 'invalid', issues });

  let next = upsertSystem(state, draft, existing);
  next = upsertSteps(next, ctx, draft);

  if (draft.scheduleMode === 'calendar' && draft.schedule !== null) {
    const scheduled = setCalendarSchedule(next, ctx, draft.systemId, draft.schedule);
    if (scheduled.refusal !== null) return refuse({ kind: 'invalid', issues: [{ code: 'schedule_ends_before_start', field: 'schedule' }] });
    next = scheduled.state;
  } else if (draft.scheduleMode === 'none') {
    next = stopSchedule(next, ctx, draft.systemId);
  }
  // scheduleMode 'keep': a rule this editor cannot author is left exactly as it is.

  return { state: next, outcome: { kind: 'saved', systemId: draft.systemId } };
}
