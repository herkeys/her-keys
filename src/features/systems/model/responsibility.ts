import { isUnacknowledged, type Responsibility } from '../../../domain/foundation/responsibility';
import type { AppState } from '../../../domain/state';
import { liveResponsibilityFor } from '../../../domain/responsibility';
import type { AttentionReason, HolderChoice, HolderView, ResponsibilityView } from './types';

/**
 * Who holds a System, and how far the handoff has actually got.
 *
 * mentioned person ≠ responsible person ≠ account identity ≠ requested ≠ accepted. A holder is a
 * record that exists (a person she added, or one of her children) — never a name typed into a
 * field — and a child holding a routine does not make the child an account. `requested` is shown
 * as requested: assigned is not acknowledged, and acknowledged is not accepted.
 */

const holderOf = (state: AppState, responsibility: Responsibility): HolderView => {
  switch (responsibility.responsibleKind) {
    case 'person':
      return { kind: 'person', id: responsibility.responsiblePersonId, name: state.people.find((p) => p.id === responsibility.responsiblePersonId)?.displayName ?? null };
    case 'child':
      return { kind: 'child', id: responsibility.responsibleChildId, name: state.children.find((c) => c.id === responsibility.responsibleChildId)?.displayName ?? null };
    default:
      return { kind: 'self', id: null, name: null };
  }
};

/**
 * The live handoff for a System — or, when there is none, the most recent one that ended
 * (declined, handed back, completed), so "Josie said no" is not silently forgotten.
 */
export function currentResponsibilityFor(state: AppState, systemId: string): { row: Responsibility; live: boolean } | null {
  const live = liveResponsibilityFor(state, { kind: 'system', id: systemId });
  if (live !== null) return { row: live, live: true };
  const ended = state.responsibilities
    .filter((r) => r.about.kind === 'system' && r.about.id === systemId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0];
  return ended ? { row: ended, live: false } : null;
}

export function responsibilityViewFor(state: AppState, systemId: string, nowMs: number): ResponsibilityView | null {
  const current = currentResponsibilityFor(state, systemId);
  if (current === null) return null;
  const { row, live } = current;
  return {
    id: row.id,
    holder: holderOf(state, row),
    state: row.state,
    live,
    unanswered: live && isUnacknowledged(row, nowMs),
    stillNeedsMe: row.stillNeedsMe,
    requestedAt: row.requestedAt,
    ackDueAt: row.ackDueAt,
  };
}

/** Who a System can be handed to: people she has added and her children. Nobody else exists to choose. */
export function holderChoicesFor(state: Pick<AppState, 'people' | 'children'>): HolderChoice[] {
  return [
    ...state.children.map((child): HolderChoice => ({ kind: 'child', id: child.id, name: child.displayName })),
    ...state.people.filter((person) => person.status === 'active').map((person): HolderChoice => ({ kind: 'person', id: person.id, name: person.displayName })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Why a System wants her attention — the SAME derivation the foundation's own attention primitive
 * uses for an unanswered delegation, so Today can already see it without importing anything here.
 */
export function attentionReasonsFor(responsibility: ResponsibilityView | null): AttentionReason[] {
  return responsibility !== null && responsibility.unanswered ? ['delegation_unanswered'] : [];
}
