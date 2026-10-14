// An in-memory Premium ledger that is FAITHFUL to the database contract (supabase/migrations/20261015130000_premium_decision_ledger.sql):
// the same transition table, the same derived-key authorization rule, idempotency by (key), the live-proposal uniqueness, the
// "applied needs an after-snapshot" rule, and the typed refusal codes the real adapter maps. Failure injection is by operation.

const TRANSITIONS = new Set([
  'proposed>approved', 'proposed>rejected', 'proposed>abandoned',
  'approved>applying', 'approved>applied', 'approved>failed', 'approved>abandoned',
  'applying>applied', 'applying>failed', 'applying>abandoned',
  'applied>reverted', 'applied>revert_blocked',
  'revert_blocked>reverted', 'revert_blocked>applied',
  'failed>approved', 'failed>abandoned',
]);
const LIVE = new Set(['proposed', 'approved', 'applying', 'applied']);

export class FakeLedger {
  constructor() {
    this.rows = [];
    this.authorizedKeys = new Set();
    this.calls = [];
    /** operation name -> remaining failures (`unavailable`). e.g. { 'transition:applied': 1 } */
    this.fail = {};
    this.counter = 0;
  }

  authorize(key) {
    this.authorizedKeys.add(key);
  }

  #burn(op) {
    this.calls.push(op);
    if (this.fail[op] > 0) {
      this.fail[op] -= 1;
      return true;
    }
    return false;
  }

  #authorized(key) {
    for (const authorized of this.authorizedKeys) if (key === authorized || key.startsWith(`${authorized}:`)) return true;
    return false;
  }

  async record(input) {
    if (this.#burn('record')) return { kind: 'unavailable' };
    if (!this.#authorized(input.idempotencyKey)) return { kind: 'refused', code: 'not_authorized' };
    const existing = this.rows.find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.proposalDigest === input.proposalDigest ? { kind: 'ok', value: structuredClone(existing) } : { kind: 'refused', code: 'idempotency_conflict' };
    if (this.rows.some((r) => r.proposalDigest === input.proposalDigest && LIVE.has(r.status))) return { kind: 'refused', code: 'duplicate' };
    const now = new Date(Date.UTC(2026, 8, 16, 14, 0, this.counter)).toISOString();
    const row = {
      id: `ledger-${++this.counter}`, householdId: input.householdId, featureKey: input.featureKey, kind: input.kind, status: 'proposed', idempotencyKey: input.idempotencyKey,
      proposalRef: input.proposalRef, sourceRef: input.sourceRef ?? null, proposalDigest: input.proposalDigest, corrected: false,
      beforeSnapshot: input.before ?? null, plannedSnapshot: input.planned ?? null, afterSnapshot: null, failureCode: null,
      proposedAt: now, appliedAt: null, revertedAt: null, updatedAt: now,
    };
    this.rows.push(row);
    return { kind: 'ok', value: structuredClone(row) };
  }

  async transition(id, to, patch = {}) {
    if (this.#burn(`transition:${to}`)) return { kind: 'unavailable' };
    const row = this.rows.find((r) => r.id === id);
    if (!row) return { kind: 'refused', code: 'not_found' };
    if (row.status === to) return { kind: 'ok', value: structuredClone(row) };
    if (!TRANSITIONS.has(`${row.status}>${to}`)) return { kind: 'refused', code: 'illegal_transition' };
    if ((to === 'applied' || to === 'reverted' || to === 'revert_blocked') && !(patch.after_snapshot ?? row.afterSnapshot)) return { kind: 'refused', code: 'rejected' };
    row.status = to;
    if (patch.after_snapshot) row.afterSnapshot = patch.after_snapshot;
    row.failureCode = ['failed', 'revert_blocked', 'abandoned'].includes(to) ? (patch.failure_code ?? null) : null;
    if (to === 'applied') row.appliedAt = row.appliedAt ?? 'applied-at';
    if (to === 'reverted') row.revertedAt = 'reverted-at';
    row.updatedAt = `u-${++this.counter}`;
    return { kind: 'ok', value: structuredClone(row) };
  }

  // The real query is `.eq('feature_key').eq('household_id')` under an owner-only RLS policy: a household's receipts are never another's.
  async list(featureKey, householdId, limit) {
    if (this.#burn('list')) return { kind: 'unavailable' };
    return { kind: 'ok', value: structuredClone(this.rows.filter((r) => r.featureKey === featureKey && r.householdId === householdId).slice().reverse().slice(0, limit)) };
  }

  statusOf(id) {
    return this.rows.find((r) => r.id === id)?.status;
  }
}
