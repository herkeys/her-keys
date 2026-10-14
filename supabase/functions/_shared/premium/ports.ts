import type {
  AuthorizationDecision,
  DeploymentEnvironment,
  EntitlementState,
  EventStatus,
  NormalizedEvent,
  Projection,
  StoredProjection,
} from './types.ts';

/**
 * Everything the Premium handlers need from the outside world, as ports. The Supabase/RevenueCat adapters implement them for
 * production (supabasePorts.ts, revenueCatApi.ts); the app test suite implements them in memory. Handlers never import either.
 */
export interface PremiumStorePort {
  getRuntime(): Promise<{ environment: DeploymentEnvironment; webhookProcessing: boolean; premiumEnabled: boolean }>;
  recordEvent(event: NormalizedEvent, payload: Record<string, unknown>): Promise<{ id: string; duplicate: boolean; status: EventStatus }>;
  setEventStatus(id: string, status: EventStatus, accountId: string | null, errorCode: string | null): Promise<EventStatus>;
  /** Backlog of events still `received` or `failed` (oldest first). */
  listBacklog(limit: number): Promise<Array<{ id: string; event: NormalizedEvent }>>;
  /** Which of these provider ids are real, account-grade identities (UUID that exists in auth.users)? provider id -> account id. */
  resolveAccounts(ids: string[]): Promise<Map<string, string>>;
  registerIdentity(providerUserId: string, accountId: string | null, kind: 'primary' | 'alias' | 'original' | 'anonymous', source: 'webhook' | 'reconcile'): Promise<'verified' | 'ambiguous' | 'rejected'>;
  getProjection(accountId: string): Promise<StoredProjection | null>;
  /** Compare-and-swap. `expectedVersion` 0 means "no row yet". */
  applyProjection(accountId: string, expectedVersion: number, projection: Projection): Promise<{ applied: boolean; version: number | null }>;
  reconcileClaim(accountId: string): Promise<boolean>;
  reconcileReport(accountId: string, outcome: 'ok' | 'failed' | 'ambiguous'): Promise<void>;
  getState(accountId: string): Promise<EntitlementState>;
  authorize(args: AuthorizeArgs): Promise<AuthorizationDecision>;
  completeUsage(accountId: string, feature: string, idempotencyKey: string): Promise<string>;
  failUsage(accountId: string, feature: string, idempotencyKey: string): Promise<string>;
}

export interface AuthorizeArgs {
  accountId: string;
  feature: string;
  householdId: string | null;
  idempotencyKey: string;
  requestId: string;
  appVersion: string | null;
  units: number;
  completeNow: boolean;
}

export type SubscriberFetch = { ok: true; body: unknown } | { ok: false; status: number | null };

export interface RevenueCatApiPort {
  getSubscriber(appUserId: string): Promise<SubscriberFetch>;
}

/** Operational logging is metadata only: event types, reason codes, counts, durations. Never content, ids of people, e-mail or prices. */
export type LogFn = (record: Record<string, string | number | boolean | null>) => void;
