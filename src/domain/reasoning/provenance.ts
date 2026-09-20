import type { AppState, CalendarEvent, HouseholdCategory, NeedsMeItem, Task } from '../state';

/**
 * Where a durable fact came from.
 *
 * Reasoning has to be able to tell a thing she told us from a thing we worked
 * out, and a demo fixture from a real household. Nothing downstream may treat
 * those as interchangeable.
 *
 * `ai-inference` and `import-sync` are declared but not yet produced by any
 * code path: Build 3 has no model calls and no cloud sync. They exist so the
 * later agents and the Build 4 sync engine have a name to write, rather than
 * forcing a widening of this union at the moment they land.
 */
export type ProvenanceSource =
  | 'onboarding'
  | 'user-action'
  | 'talk-it-out'
  | 'system-derived'
  | 'import-sync'
  | 'ai-inference'
  | 'demo-seed';

/**
 * Provenance is DERIVED, never stored.
 *
 * Every origin this product can currently produce is already recoverable from
 * state we keep: `origin` separates demo from real, `event.source` separates
 * seeded events from captured ones, a category's `systemRole` separates the
 * eight starters from a household's own, and the remaining entities have
 * exactly one producer each.
 *
 * That matters for two reasons. Adding a `source` column to every entity would
 * be a stored-shape change, and the local schema is pinned at version 2 until
 * the deferred v3 migration (B4-P0-060/061) — so it is not available to us.
 * And a derived answer cannot drift out of step with the row it describes.
 */
export function provenanceOfEvent(state: AppState, event: CalendarEvent): ProvenanceSource {
  if (event.source === 'demo') return 'demo-seed';
  return state.origin === 'demo' ? 'demo-seed' : 'user-action';
}

export function provenanceOfTask(state: AppState, _task: Task): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'user-action';
}

export function provenanceOfNeedsMeItem(state: AppState, _item: NeedsMeItem): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'user-action';
}

/** The eight starters arrive with the household; anything else she added herself. */
export function provenanceOfCategory(state: AppState, category: HouseholdCategory): ProvenanceSource {
  if (state.origin === 'demo') return 'demo-seed';
  return category.systemRole === null ? 'user-action' : 'system-derived';
}

/** One Move records are always chosen by the recommendation engine, never captured. */
export function provenanceOfOneMove(state: AppState): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'system-derived';
}

/** The discovery record only ever comes out of a Talk It Out conversation. */
export function provenanceOfDiscovery(state: AppState): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'talk-it-out';
}

/** Onboarding selections are hers, made during intake. */
export function provenanceOfOnboarding(state: AppState): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'onboarding';
}

/**
 * An action record is a decision she approved or declined on a Her Keys
 * proposal. The proposal was system-derived; the decision is hers, and that is
 * what the ledger stores.
 */
export function provenanceOfAction(state: AppState): ProvenanceSource {
  return state.origin === 'demo' ? 'demo-seed' : 'user-action';
}

/**
 * Whether a provenance may be treated as something she actually told us.
 * Anything worked out on her behalf is excluded, which is the rule that stops
 * an inference being read back later as a stated fact.
 */
export function isUserStated(source: ProvenanceSource): boolean {
  return source === 'onboarding' || source === 'user-action' || source === 'talk-it-out';
}

/** Demo fixtures must never reach an account-bound path (B4-P0-010). */
export function isSyncable(source: ProvenanceSource): boolean {
  return source !== 'demo-seed';
}
