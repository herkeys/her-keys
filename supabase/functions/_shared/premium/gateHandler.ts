import type { LogFn, PremiumStorePort, RevenueCatApiPort } from './ports.ts';
import { reconcileAccount } from './reconcileService.ts';
import type { AuthorizationDecision, DeploymentEnvironment } from './types.ts';

export interface GateDeps {
  store: PremiumStorePort;
  api: RevenueCatApiPort;
  deployment: DeploymentEnvironment;
  nowMs: () => number;
  log: LogFn;
  newRequestId: () => string;
}

export interface GateResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Features whose Premium work is performed on the server inside their own function (which reserves, runs, then completes or fails the
 * usage unit). They are NOT callable through the generic gate: a preflight here would reserve a unit nothing would ever settle.
 */
export const SERVER_EXECUTED_FEATURES: readonly string[] = ['smart_inbox_extract'];
/** Deterministic, no-external-cost features: the unit is settled at authorization (there is nothing to fail afterwards). */
export const SETTLE_ON_AUTHORIZE: readonly string[] = ['daily_load_premium', 'momentum_report'];

const FEATURE_KEY = /^[a-z][a-z0-9_]{2,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ALLOWED_KEYS = new Set(['feature', 'householdId', 'idempotencyKey', 'appVersion', 'units']);

const invalid = (): GateResponse => ({ status: 400, body: { outcome: 'denied', reason: 'invalid_request', nextAction: 'none' } });

/**
 * The generic Premium gate for a signed-in caller. `userId` is the JWT subject verified by the Edge Function; NOTHING in the body can
 * name, override or claim an account, an entitlement or a Premium flag: the schema is strict, so an unknown key (a forged
 * `isPremium`, `userId`, `tier`...) is rejected rather than ignored.
 *
 * If the projection is not trustworthy (`entitlement_unknown`), ONE bounded reconcile is attempted and the decision re-evaluated, so a
 * customer whose purchase webhook is late is not told to upgrade again. Any failure ends in a fail-closed `service_unavailable`.
 */
export async function handleGate(deps: GateDeps, userId: string, body: unknown): Promise<GateResponse> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalid();
  const input = body as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!ALLOWED_KEYS.has(key)) return invalid();

  const { feature, householdId, idempotencyKey, appVersion, units } = input;
  if (typeof feature !== 'string' || !FEATURE_KEY.test(feature)) return invalid();
  if (SERVER_EXECUTED_FEATURES.includes(feature)) return invalid();
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) return invalid();
  if (householdId !== undefined && (typeof householdId !== 'string' || !UUID.test(householdId))) return invalid();
  if (appVersion !== undefined && (typeof appVersion !== 'string' || !SEMVER.test(appVersion))) return invalid();
  if (units !== undefined && (typeof units !== 'number' || !Number.isInteger(units) || units < 1 || units > 100)) return invalid();

  const requestId = deps.newRequestId();
  const args = {
    accountId: userId,
    feature,
    householdId: typeof householdId === 'string' ? householdId : null,
    idempotencyKey,
    requestId,
    appVersion: typeof appVersion === 'string' ? appVersion : null,
    units: typeof units === 'number' ? units : 1,
    completeNow: SETTLE_ON_AUTHORIZE.includes(feature),
  };

  try {
    let decision: AuthorizationDecision = await deps.store.authorize(args);
    if (decision.reason === 'entitlement_unknown') {
      const status = await reconcileAccount(deps, userId, { force: false });
      if (status === 'reconciled') decision = await deps.store.authorize(args);
    }
    deps.log({ op: 'gate', feature, outcome: decision.outcome, reason: decision.reason, state: decision.entitlementState });
    return { status: 200, body: { ...decision, requestId } };
  } catch {
    deps.log({ op: 'gate', feature, outcome: 'denied', reason: 'service_unavailable' });
    return { status: 503, body: { outcome: 'denied', reason: 'service_unavailable', nextAction: 'retry_later', requestId } };
  }
}
