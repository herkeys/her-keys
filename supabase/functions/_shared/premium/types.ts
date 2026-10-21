// Her Keys Premium — shared server types. ERASABLE TypeScript only (no enums, no parameter properties): these modules are
// imported by Deno Edge Functions AND by Node's native type stripping in the app test suite.

export const ENTITLEMENT_KEY = 'her_keys_plus';

export type PremiumEnvironment = 'SANDBOX' | 'PRODUCTION';
/** Which deployment this code is running in. Staging and local accept SANDBOX events only; production accepts PRODUCTION only. */
export type DeploymentEnvironment = 'local' | 'staging' | 'production';

export type EntitlementState =
  | 'unknown'
  | 'free'
  | 'premium_active'
  | 'premium_canceled_active'
  | 'premium_billing_grace'
  | 'premium_expired'
  | 'premium_revoked'
  | 'deletion_pending';

export type ProjectionSource = 'webhook' | 'reconcile' | 'test_fixture';

/** Per-field event clocks: the newest event_timestamp_ms that set each group of fields. An older event never overwrites a newer one. */
export type ClockKey = 'expiry' | 'cancel' | 'billing' | 'revoke' | 'expired' | 'period';
export type Clocks = Partial<Record<ClockKey, number>>;

/** The projection row, as the RPCs exchange it (snake_case, ISO-8601 instants). Mirrors public.premium_entitlements. */
export interface Projection {
  source: ProjectionSource;
  environment: PremiumEnvironment;
  product_id: string | null;
  store: string | null;
  /** Provider facts for presentation only; never a separate access grant. Optional for rolling deployments. */
  period_type?: 'TRIAL' | 'INTRO' | 'NORMAL' | null;
  period_started_at?: string | null;
  trial_ends_at?: string | null;
  has_entitlement: boolean;
  expires_at: string | null;
  grace_expires_at: string | null;
  canceled_at: string | null;
  billing_issue_at: string | null;
  revoked_at: string | null;
  expiration_confirmed_at: string | null;
  clocks: Clocks;
  last_event_ms: number | null;
  last_reconciled_at: string | null;
  needs_reconcile: boolean;
}

export interface StoredProjection {
  version: number;
  projection: Projection;
}

/** A webhook event reduced to what Her Keys is allowed to keep. Prices, e-mail, country, device and attribute data never get this far. */
export interface NormalizedEvent {
  event_id: string;
  event_type: string;
  environment: PremiumEnvironment;
  event_timestamp_ms: number | null;
  app_user_id: string | null;
  original_app_user_id: string | null;
  aliases: string[];
  transferred_from: string[];
  transferred_to: string[];
  /** `null` = the event named no entitlement (some do); `[]` is normalised to null. */
  entitlement_ids: string[] | null;
  product_id: string | null;
  new_product_id: string | null;
  store: string | null;
  expiration_at_ms: number | null;
  purchased_at_ms: number | null;
  grace_period_expiration_at_ms: number | null;
  cancel_reason: string | null;
  expiration_reason: string | null;
  period_type: string | null;
}

export type EventStatus =
  | 'received'
  | 'processed'
  | 'ignored_test'
  | 'ignored_unknown'
  | 'ignored_environment'
  | 'ambiguous'
  | 'failed'
  | 'dead_letter';

export type AuthorizationReason =
  | 'allowed'
  | 'requires_premium'
  | 'entitlement_unknown'
  | 'entitlement_expired'
  | 'feature_disabled'
  | 'requires_ai_consent'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'ownership_denied'
  | 'account_deactivated'
  | 'service_unavailable'
  | 'invalid_request';

export type NextAction =
  | 'none'
  | 'open_paywall'
  | 'restore_purchases'
  | 'retry_verification'
  | 'grant_ai_consent'
  | 'wait_for_reset'
  | 'retry_later'
  | 'update_app';

export interface QuotaSnapshot {
  period: 'day' | 'month';
  periodStart: string;
  periodEnd: string;
  used: number;
  reserved: number;
  limit: number | null;
  remaining: number | null;
}

export interface AuthorizationDecision {
  outcome: 'allowed' | 'denied';
  reason: AuthorizationReason;
  entitlementState: EntitlementState;
  via: 'premium' | 'free_allowance' | 'free' | null;
  nextAction: NextAction;
  quota: QuotaSnapshot | null;
  decisionId: string;
  replay: boolean;
}
