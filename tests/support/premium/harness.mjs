// Test harness for the Premium server core: an in-memory PremiumStorePort that is FAITHFUL to the database contract (compare-and-swap
// projection writes, idempotent event receipts, five-strikes dead-lettering, the reconcile claim gate), RevenueCat payload builders,
// and an HMAC signer built on node:crypto — deliberately independent of the code under test.
import { createHmac } from 'node:crypto';
import { deriveEntitlementState } from '../../../supabase/functions/_shared/premium/entitlementState.ts';

export const NOW = Date.UTC(2026, 9, 13, 15, 0, 0); // 2026-10-13T15:00:00Z
export const DAY = 24 * 60 * 60 * 1000;
export const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
export const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
export const ACCOUNT_C = '33333333-3333-4333-8333-333333333333';
export const AUTH_SECRET = 'whsec-authorization-0123456789abcdef';
export const HMAC_SECRET = 'whsec-hmac-signing-0123456789abcdef';

export const iso = (ms) => new Date(ms).toISOString();

let eventCounter = 0;
/** A RevenueCat webhook body as RevenueCat sends it — including the fields Her Keys must NEVER keep (price, email, attributes...). */
export function rcBody(overrides = {}) {
  eventCounter += 1;
  const event = {
    id: `evt-${eventCounter}-${Math.random().toString(16).slice(2, 10)}`,
    type: 'INITIAL_PURCHASE',
    app_user_id: ACCOUNT_A,
    original_app_user_id: ACCOUNT_A,
    aliases: [ACCOUNT_A],
    environment: 'SANDBOX',
    event_timestamp_ms: NOW,
    entitlement_ids: ['her_keys_plus'],
    product_id: 'herkeys_premium_monthly',
    store: 'APP_STORE',
    purchased_at_ms: NOW,
    expiration_at_ms: NOW + 30 * DAY,
    period_type: 'NORMAL',
    price: 9.99,
    price_in_purchased_currency: 9.99,
    currency: 'USD',
    country_code: 'US',
    transaction_id: 'tx-secret-1',
    original_transaction_id: 'otx-secret-1',
    subscriber_attributes: { $email: { value: 'mom@example.com' }, $displayName: { value: 'Mom' } },
    ...overrides,
  };
  return { api_version: '1.0', event };
}

export const bytes = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

export function signature(rawBody, { secret = HMAC_SECRET, t = Math.floor(NOW / 1000) } = {}) {
  const mac = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return `t=${t},v1=${mac}`;
}

export function request(body, { auth = AUTH_SECRET, hmac = HMAC_SECRET, t, method = 'POST', rawOverride } = {}) {
  const rawBody = rawOverride ?? bytes(body);
  const headers = new Map();
  if (auth !== null) headers.set('authorization', auth);
  if (hmac !== null) headers.set('x-revenuecat-webhook-signature', signature(rawBody, { secret: hmac, t }));
  return { method, rawBody, header: (name) => headers.get(name.toLowerCase()) ?? null };
}

/** RevenueCat's authenticated subscriber record, shaped as `GET /v1/subscribers/{id}` returns it. */
export function subscriberRecord({ entitlement = true, expiresMs = NOW + 20 * DAY, unsubscribeMs = null, refundedMs = null, billingIssueMs = null, graceMs = null, sandbox = true, requestMs = NOW, purchaseMs = NOW - 10 * DAY } = {}) {
  const product = 'herkeys_premium_monthly';
  return {
    request_date_ms: requestMs,
    subscriber: {
      entitlements: entitlement
        ? { her_keys_plus: { expires_date: expiresMs === null ? null : iso(expiresMs), grace_period_expires_date: graceMs === null ? null : iso(graceMs), product_identifier: product, purchase_date: iso(purchaseMs) } }
        : {},
      subscriptions: entitlement
        ? { [product]: { is_sandbox: sandbox, store: 'app_store', expires_date: expiresMs === null ? null : iso(expiresMs), unsubscribe_detected_at: unsubscribeMs === null ? null : iso(unsubscribeMs), billing_issues_detected_at: billingIssueMs === null ? null : iso(billingIssueMs), refunded_at: refundedMs === null ? null : iso(refundedMs) } }
        : {},
    },
  };
}

export class FakeStore {
  constructor({ accounts = [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C], environment = 'staging' } = {}) {
    this.accounts = new Set(accounts);
    this.runtime = { environment, webhookProcessing: true, premiumEnabled: true };
    this.events = new Map(); // `${env}|${event_id}` -> row
    this.byId = new Map();
    this.projections = new Map();
    this.identities = new Map();
    this.reconcileState = new Map();
    this.nowMs = NOW;
    this.minReconcileGapMs = 20_000;
    this.faults = { recordEvent: 0, applyProjection: 0, getProjection: 0, authorize: 0, casLose: 0 };
    this.authorizeImpl = null;
    this.authorizeCalls = [];
    this.nextId = 1;
  }

  burn(name) {
    if (this.faults[name] > 0) {
      this.faults[name] -= 1;
      throw new Error(`${name}_injected_failure`);
    }
  }

  async getRuntime() {
    return { ...this.runtime };
  }

  async recordEvent(event, payload) {
    this.burn('recordEvent');
    const key = `${event.environment}|${event.event_id}`;
    const existing = this.events.get(key);
    if (existing) return { id: existing.id, duplicate: true, status: existing.status };
    const row = { id: `row-${this.nextId++}`, event, payload, status: 'received', attempts: 0, accountId: null, error: null };
    this.events.set(key, row);
    this.byId.set(row.id, row);
    return { id: row.id, duplicate: false, status: 'received' };
  }

  async setEventStatus(id, status, accountId, errorCode) {
    const row = this.byId.get(id);
    if (!row) return 'missing';
    let final = status;
    if (status === 'failed') {
      row.attempts += 1;
      if (row.attempts >= 5) final = 'dead_letter';
    }
    row.status = final;
    row.accountId = accountId ?? row.accountId;
    row.error = errorCode;
    if (final === 'dead_letter' && accountId && this.projections.has(accountId)) this.projections.get(accountId).projection.needs_reconcile = true;
    return final;
  }

  async listBacklog(limit) {
    return [...this.byId.values()].filter((r) => r.status === 'received' || r.status === 'failed').slice(0, limit).map((r) => ({ id: r.id, event: r.event }));
  }

  async resolveAccounts(ids) {
    const out = new Map();
    for (const id of ids) if (this.accounts.has(id.toLowerCase())) out.set(id, id.toLowerCase());
    return out;
  }

  async registerIdentity(providerUserId, accountId, kind) {
    if (kind === 'anonymous' || accountId === null) {
      this.identities.set(providerUserId, { accountId: null, status: 'rejected' });
      return 'rejected';
    }
    const current = this.identities.get(providerUserId);
    if (current && current.accountId !== null && current.accountId !== accountId) {
      this.identities.set(providerUserId, { accountId: null, status: 'ambiguous' });
      return 'ambiguous';
    }
    this.identities.set(providerUserId, { accountId, status: 'verified' });
    return 'verified';
  }

  async getProjection(accountId) {
    this.burn('getProjection');
    const stored = this.projections.get(accountId);
    return stored ? { version: stored.version, projection: structuredClone(stored.projection) } : null;
  }

  async applyProjection(accountId, expectedVersion, projection) {
    this.burn('applyProjection');
    if (this.faults.casLose > 0) {
      // Another writer got in first: bump the version underneath the caller.
      this.faults.casLose -= 1;
      const stored = this.projections.get(accountId);
      if (stored) stored.version += 1;
      return { applied: false, version: null };
    }
    const stored = this.projections.get(accountId);
    if (expectedVersion === 0) {
      if (stored) return { applied: false, version: null };
      this.projections.set(accountId, { version: 1, projection: structuredClone(projection) });
      return { applied: true, version: 1 };
    }
    if (!stored || stored.version !== expectedVersion) return { applied: false, version: null };
    stored.version += 1;
    stored.projection = structuredClone(projection);
    return { applied: true, version: stored.version };
  }

  async reconcileClaim(accountId) {
    const state = this.reconcileState.get(accountId);
    if (!state) {
      this.reconcileState.set(accountId, { lastAttempt: this.nowMs, failures: 0 });
      return true;
    }
    const wait = Math.min(this.minReconcileGapMs * 2 ** Math.min(state.failures, 6), 3_600_000);
    if (this.nowMs < state.lastAttempt + wait) return false;
    state.lastAttempt = this.nowMs;
    return true;
  }

  async reconcileReport(accountId, outcome) {
    const state = this.reconcileState.get(accountId);
    if (state) state.failures = outcome === 'failed' ? state.failures + 1 : 0;
  }

  async getState(accountId) {
    const stored = this.projections.get(accountId);
    return deriveEntitlementState(stored?.projection ?? null, this.nowMs, false);
  }

  async authorize(args) {
    this.authorizeCalls.push(args);
    this.burn('authorize');
    if (!this.authorizeImpl) throw new Error('no authorizeImpl');
    return this.authorizeImpl(args, this);
  }
}

export class FakeApi {
  constructor() {
    this.responses = new Map(); // account -> record | {status}
    this.calls = [];
  }
  set(accountId, record) {
    this.responses.set(accountId, record);
  }
  async getSubscriber(appUserId) {
    this.calls.push(appUserId);
    const record = this.responses.get(appUserId);
    if (record === undefined) return { ok: false, status: 404 };
    if (record && record.__status) return { ok: false, status: record.__status };
    return { ok: true, body: record };
  }
}

export const silentLog = () => {};

export function webhookDeps(store, api, overrides = {}) {
  return {
    store,
    api,
    auth: { authorizationSecret: AUTH_SECRET, hmacSecret: HMAC_SECRET, requireHmac: false, toleranceSeconds: 300 },
    deployment: 'staging',
    nowMs: () => store.nowMs,
    log: silentLog,
    ...overrides,
  };
}
