/**
 * Client-side contract for the SERVER's Premium decisions (Stage 1, A3).
 *
 * The server projection (`premium_entitlements`, derived by `premium_derive_state`) is the authority for any protected operation.
 * Everything here is a PRESENTATION of what the server said; nothing here grants anything. `tests/premium/clientContract.test.mjs`
 * pins these unions to the server's own type file, so the two cannot drift apart silently.
 */

/** Server-computed entitlement states (A0 section 4). */
export const SERVER_ENTITLEMENT_STATES = [
  'unknown',
  'free',
  'premium_active',
  'premium_canceled_active',
  'premium_billing_grace',
  'premium_expired',
  'premium_revoked',
  'deletion_pending',
] as const;
export type ServerEntitlementState = (typeof SERVER_ENTITLEMENT_STATES)[number];

/** The states that authorize NEW Premium computation. */
export const ENTITLED_STATES: readonly ServerEntitlementState[] = ['premium_active', 'premium_canceled_active', 'premium_billing_grace'];

export const AUTHORIZATION_REASONS = [
  'allowed',
  'requires_premium',
  'entitlement_unknown',
  'entitlement_expired',
  'feature_disabled',
  'requires_ai_consent',
  'quota_exhausted',
  'rate_limited',
  'ownership_denied',
  'account_deactivated',
  'service_unavailable',
  'invalid_request',
] as const;
export type AuthorizationReason = (typeof AUTHORIZATION_REASONS)[number];

export const NEXT_ACTIONS = ['none', 'open_paywall', 'restore_purchases', 'retry_verification', 'grant_ai_consent', 'wait_for_reset', 'retry_later', 'update_app'] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export interface ServerEntitlement {
  state: ServerEntitlementState;
  /** End of the paid term (or of the provider's grace) — display only. */
  expiresAt: string | null;
  graceExpiresAt: string | null;
  /** Auto-renew is off but the term is still paid. */
  canceled: boolean;
  needsReconcile: boolean;
  checkedAt: string;
}

export interface ManifestEntry {
  featureKey: string;
  displayName: string;
  tier: 'free' | 'premium';
  available: boolean;
  requiresAiConsent: boolean;
  minAppVersion: string | null;
}

export interface QuotaView {
  period: 'day' | 'month';
  periodStart: string;
  periodEnd: string;
  used: number;
  reserved: number;
  limit: number | null;
  remaining: number | null;
}

export interface GateDecision {
  outcome: 'allowed' | 'denied';
  reason: AuthorizationReason;
  entitlementState: ServerEntitlementState;
  via: 'premium' | 'free_allowance' | 'free' | null;
  nextAction: NextAction;
  quota: QuotaView | null;
  decisionId: string | null;
  replay: boolean;
}

export type GateResult = { kind: 'decision'; decision: GateDecision } | { kind: 'unavailable' } | { kind: 'invalid' };

export interface GateRequest {
  feature: string;
  householdId?: string;
  idempotencyKey: string;
  appVersion?: string;
  units?: number;
}

export type VerifyStatus = 'reconciled' | 'rate_limited' | 'provider_unavailable' | 'invalid_response' | 'conflict';

// ---------------------------------------------------------------------------------------------------- Smart Inbox (server extraction)

export const EXTRACT_AMBIGUITIES = ['which_child', 'which_day', 'which_money_direction'] as const;
export type ExtractAmbiguity = (typeof EXTRACT_AMBIGUITIES)[number];
export const EXTRACT_UNSUPPORTED_REASONS = ['change-to-existing-item', 'recurrence', 'responsibility-handoff', 'multiple-dates', 'multiple-times', 'multiple-amounts', 'foreign-currency', 'context-only'] as const;
export type ExtractUnsupportedReason = (typeof EXTRACT_UNSUPPORTED_REASONS)[number];

export interface ExtractRef {
  ref: string;
  name: string;
}

export interface ExtractRequest {
  householdId: string;
  idempotencyKey: string;
  text: string;
  context: { timeZone: string; today: string; children: ExtractRef[]; people: ExtractRef[]; areas: string[] };
  appVersion?: string;
}

/** What the server validated and returned. Still UNTRUSTED to the app: it is checked again before it becomes a proposal. */
export interface ExtractedProposal {
  key: string;
  kind: 'task' | 'event' | 'needsMe';
  title: string;
  quote: string;
  span: { start: number; end: number };
  date: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  durationMinutes: number | null;
  amount: string | null;
  direction: 'outflow' | 'inflow' | null;
  childRef: string | null;
  childAmbiguous: boolean;
  category: string | null;
  hedged: boolean;
  ambiguity: ExtractAmbiguity[];
}

export interface ExtractedUnsupported {
  reason: ExtractUnsupportedReason;
  span: { start: number; end: number };
  person: { name: string; known: boolean } | null;
}

export interface Extraction {
  proposals: ExtractedProposal[];
  unsupported: ExtractedUnsupported[];
  dropped: number;
}

export type ExtractResult =
  | { kind: 'ok'; extraction: Extraction; via: 'premium' | 'free_allowance' }
  | { kind: 'denied'; decision: GateDecision }
  | { kind: 'replayed' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'invalid_output' }
  | { kind: 'invalid_request' };

/** The only way the app reaches the server's Premium state. Implemented over Supabase; scripted in tests. */
export interface PremiumServerClient {
  /** Scope the real transport to the provider's account/household lifetime. Test ports may already be scoped. */
  forAccount?(owner: import('./premiumRequestOwner').PremiumRequestOwner): PremiumServerClient;
  entitlement(): Promise<{ kind: 'ok'; value: ServerEntitlement } | { kind: 'unavailable' }>;
  manifest(): Promise<{ kind: 'ok'; entries: ManifestEntry[] } | { kind: 'unavailable' }>;
  /** Server verifies commercial eligibility for this authenticated actor, rollout, and webhook fulfillment. */
  purchaseReadiness?(): Promise<{ ready: boolean; reason: string }>;
  /** "Verify my subscription": the server reads RevenueCat's authenticated record for THIS account. Rate-limited server-side. */
  verify(): Promise<{ kind: 'ok'; status: VerifyStatus } | { kind: 'unavailable' }>;
  authorize(request: GateRequest): Promise<GateResult>;
  /** Smart Inbox: the SERVER authorizes (entitlement, AI consent, quota), calls the model, and validates. Her words go nowhere else. */
  extract(request: ExtractRequest): Promise<ExtractResult>;
}

export function isEntitledState(state: ServerEntitlementState): boolean {
  return ENTITLED_STATES.includes(state);
}
