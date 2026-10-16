/**
 * The RevenueCat SDK boundary. This is the only file that imports
 * `react-native-purchases` or `react-native-purchases-ui` — every other
 * monetization or feature module goes through `EntitlementState`,
 * `PaywallOutcome` and `RestoreOutcome` instead of an SDK object shape.
 *
 * In Expo Go, `react-native-purchases` detects the environment and swaps in
 * its own Preview API mock automatically — imports and calls here do not
 * crash, but `getCustomerInfo`/purchases are simulated, not real. Real
 * purchase and entitlement behavior requires a development/native build.
 */
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { Platform } from 'react-native';
import { withDeadline } from '../domain/account/deadline';
import { hasConfiguredApiKey, revenueCatApiKeys } from './config';
import { HER_KEYS_PLUS_ENTITLEMENT, type PaywallOutcome, type RestoreOutcome } from './entitlement';

export type ConfigureReason = 'configured' | 'already_configured' | 'missing_api_key' | 'sdk_error';

export interface ConfigureResult {
  configured: boolean;
  reason: ConfigureReason;
}

/**
 * Non-interactive RevenueCat work has a caller deadline. A timed-out native identity mutation may still finish later,
 * so the purchase lane must remain quarantined until that native work settles. Free auth never depends on this lane.
 * Do not confuse bounded UI responses with cancellation of a native SDK operation.
 */
export const REVENUECAT_DEADLINES = { identifyMs: 15_000, readMs: 15_000, restoreMs: 60_000 } as const;

let configured = false;
let desiredAccountId: string | null = null;
let identifiedAccountId: string | null = null;
// A timed-out native logIn/logOut/getAppUserID can finish after its JS caller has returned.
// Do not start another account mutation, or a purchase, while its result is still uncertain.
let nativeIdentityWorkUnsettled = false;
export interface RevenueCatIdentity { accountId: string | null; epoch: number }
let identity: RevenueCatIdentity = { accountId: null, epoch: 0 };
const identityListeners = new Set<() => void>();
export const getRevenueCatIdentity = () => identity;
export const subscribeRevenueCatIdentity = (listener: () => void) => {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
};
function publishIdentity(next: RevenueCatIdentity) {
  identity = next;
  for (const listener of identityListeners) listener();
}
// Account changes must not interleave with a restore or a paywall's store transaction.
let accountSdkOperation: Promise<void> = Promise.resolve();
function withAccountSdkOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = accountSdkOperation.then(operation);
  accountSdkOperation = result.then(() => {}, () => {});
  return result;
}

async function matchesIdentifiedAccount(expected: string | null): Promise<boolean> {
  if (!configured || expected === null || identifiedAccountId !== expected || nativeIdentityWorkUnsettled) return false;
  const epoch = identity.epoch;
  try {
    const read = await withDeadline(() => Purchases.getAppUserID(), REVENUECAT_DEADLINES.readMs);
    // A timed-out read is unverifiable: never start another native identity mutation
    // solely because a read stalled. A concurrent actor change also invalidates the result.
    if (read.timedOut || nativeIdentityWorkUnsettled || identity.epoch !== epoch ||
        identifiedAccountId !== expected || desiredAccountId !== expected) return false;
    if (read.value === expected) return true;
    // A readable mismatch is definitive SDK drift (for example a late native logIn).
    // Withdraw the claim so the CURRENT actor can safely re-identify on the next readiness check.
    if (typeof read.value === 'string') identifiedAccountId = null;
    return false;
  } catch {
    // A native identity read must fail closed, not pin the serialized purchase/restore queue.
    return false;
  }
}

function currentPlatformApiKey(): string | undefined {
  if (Platform.OS === 'ios') return revenueCatApiKeys.ios;
  if (Platform.OS === 'android') return revenueCatApiKeys.android;
  return undefined;
}

/** Idempotent: safe to call from every provider mount without double-configuring the SDK. */
export function configureRevenueCat(): ConfigureResult {
  if (configured) return { configured: true, reason: 'already_configured' };

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  if (!hasConfiguredApiKey(platform)) return { configured: false, reason: 'missing_api_key' };

  const apiKey = currentPlatformApiKey();
  if (!apiKey) return { configured: false, reason: 'missing_api_key' };

  try {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.INFO);
    // Still anonymous at configure time. Identity arrives separately through
    // `identifyRevenueCatAccount`, because the account is not known until she
    // has signed in and the app may run entirely locally before then.
    Purchases.configure({ apiKey });
    configured = true;
    return { configured: true, reason: 'configured' };
  } catch {
    return { configured: false, reason: 'sdk_error' };
  }
}

export type IdentifyResult = 'identified' | 'signed_out' | 'not_configured' | 'sdk_error';

/**
 * Bind RevenueCat's App User ID to the Supabase account uuid (B4-P0-036).
 *
 * The uuid is the ONLY identity RevenueCat is given. No email, no provider
 * subject, no household id — an entitlement system does not need to know who
 * she is, only which account is asking.
 *
 * The upfront Premium offer records an intent only; checkout waits for account
 * binding and consent. Store operations require the successfully identified UUID.
 * Passing `null` logs out, which
 * returns RevenueCat to an anonymous id rather than leaving the previous
 * account's entitlements visible to the next person to sign in on this device.
 *
 * Every failure is REPORTED, never thrown. Entitlement is not identity: a
 * RevenueCat outage must not be able to undo a claim the server has already
 * committed, so the caller logs this and carries on.
 */
export async function identifyRevenueCatAccount(accountId: string | null): Promise<IdentifyResult> {
  // Invalidate display and pending results immediately, before the serialized native operation can start.
  desiredAccountId = accountId;
  const epoch = identity.epoch + 1;
  publishIdentity({ accountId: null, epoch });
  return withAccountSdkOperation(async () => {
    if (identity.epoch !== epoch || nativeIdentityWorkUnsettled) return 'sdk_error';
    identifiedAccountId = null;
    if (!configured) return 'not_configured';

    // A caller timeout cannot cancel a native identity mutation. Keep paid operations fenced until it
    // ACTUALLY settles, and never allow its late completion to publish a stale account identity.
    let active = true;
    nativeIdentityWorkUnsettled = true;
    const work = (async (): Promise<IdentifyResult> => {
      const previousId = await Purchases.getAppUserID();
      if (!active || identity.epoch !== epoch) return 'sdk_error';
      if (accountId === null) {
        if (!previousId.startsWith('$RCAnonymousID:')) await Purchases.logOut();
        return active && identity.epoch === epoch ? 'signed_out' : 'sdk_error';
      }
      if (previousId !== accountId && !previousId.startsWith('$RCAnonymousID:')) {
        await Purchases.logOut();
        if (!active || identity.epoch !== epoch) return 'sdk_error';
      }
      await Purchases.logIn(accountId);
      if (!active || identity.epoch !== epoch) return 'sdk_error';
      const confirmedId = await Purchases.getAppUserID();
      if (!active || identity.epoch !== epoch || confirmedId !== accountId) return 'sdk_error';
      identifiedAccountId = accountId;
      publishIdentity({ accountId, epoch });
      return 'identified';
    })();
    // Both fulfillment and rejection release quarantine only when the native work has genuinely finished.
    // Keep a rejection handler even when the caller's deadline already expired.
    void work.then(
      () => { nativeIdentityWorkUnsettled = false; },
      () => { nativeIdentityWorkUnsettled = false; },
    );
    try {
      const done = await withDeadline(work, REVENUECAT_DEADLINES.identifyMs);
      if (done.timedOut) {
        active = false;
        return 'sdk_error';
      }
      return done.value;
    } catch {
      active = false;
      return 'sdk_error';
    }
  });
}

/**
 * Purchase readiness, identity half. Sign-in never waits on RevenueCat, so an identify that failed or timed out at bind time is
 * simply retried here, at the moment a purchase is actually about to be offered. Resolves true only when the SDK is bound to the
 * account that is signed in NOW; anything else (signed out, SDK not configured, still failing) is false and the caller shows
 * "unavailable" rather than letting a purchase run under an anonymous or previous identity.
 */
export async function ensureRevenueCatIdentity(): Promise<boolean> {
  if (!configured || desiredAccountId === null) return false;
  const wanted = desiredAccountId;
  if (identity.accountId === wanted && identifiedAccountId === wanted) {
    // Serialize the bounded read against native store operations. A concurrent
    // account switch must never make an old caller report readiness.
    const verified = await withAccountSdkOperation(() => matchesIdentifiedAccount(wanted));
    if (verified) return desiredAccountId === wanted && identity.accountId === wanted && !nativeIdentityWorkUnsettled;
    // Unknown/timeout is NOT permission to start a new native mutation. Only a
    // definitive, readable SDK mismatch withdraws identifiedAccountId above.
    if (identifiedAccountId === wanted || desiredAccountId !== wanted ||
        identity.accountId !== wanted || nativeIdentityWorkUnsettled) return false;
  }
  if (desiredAccountId !== wanted || nativeIdentityWorkUnsettled) return false;
  const result = await identifyRevenueCatAccount(wanted);
  return result === 'identified' && desiredAccountId === wanted &&
    identity.accountId === wanted && !nativeIdentityWorkUnsettled;
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

function activeEntitlementIds(info: CustomerInfo): string[] {
  return Object.keys(info.entitlements.active);
}

/** `null` means the check could not be resolved (not configured, offline, SDK error) — callers must fail open. */
export async function fetchActiveEntitlementIds(): Promise<string[] | null> {
  const scope = identity;
  return withAccountSdkOperation(async () => {
    const owner = scope.accountId;
    try {
      if (identity !== scope || !await matchesIdentifiedAccount(owner)) return null;
      const read = await withDeadline(() => Purchases.getCustomerInfo(), REVENUECAT_DEADLINES.readMs);
      if (read.timedOut) return null;
      return identity === scope && await matchesIdentifiedAccount(owner) ? activeEntitlementIds(read.value) : null;
    } catch {
      return null;
    }
  });
}

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const read = await withDeadline(() => Purchases.getOfferings(), REVENUECAT_DEADLINES.readMs);
    return read.timedOut ? null : (read.value.current ?? null);
  } catch {
    return null;
  }
}

/**
 * Presents RevenueCat's own paywall UI for the given Offering.
 * `presentPaywallIfNeeded` lets RevenueCat itself skip presentation when the
 * customer's freshest CustomerInfo already carries `her_keys_plus`, so an
 * already-entitled customer never sees the paywall flash before Her Keys
 * notices.
 */
export async function presentRevenueCatPaywall(offering: PurchasesOffering | null, expectedAccountId?: string): Promise<PaywallOutcome> {
  const scope = identity;
  return withAccountSdkOperation(async () => {
    if (!configured) return { kind: 'unavailable' };
    if (!offering) return { kind: 'no_offering' };

    try {
      const owner = expectedAccountId ?? scope.accountId;
      if (identity !== scope || !await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        offering,
        requiredEntitlementIdentifier: HER_KEYS_PLUS_ENTITLEMENT,
      });
      if (identity !== scope || !await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
          return { kind: 'purchased' };
        case PAYWALL_RESULT.RESTORED:
          return { kind: 'restored' };
        case PAYWALL_RESULT.NOT_PRESENTED:
          return { kind: 'already_entitled' };
        case PAYWALL_RESULT.CANCELLED:
          return { kind: 'cancelled' };
        case PAYWALL_RESULT.ERROR:
        default:
          return { kind: 'error', message: 'paywall_error' };
      }
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : 'unknown_error' };
    }
  });
}

export async function restoreRevenueCatPurchases(expectedAccountId?: string): Promise<RestoreOutcome> {
  const scope = identity;
  const owner = expectedAccountId ?? scope.accountId;
  return withAccountSdkOperation(async () => {
    if (!configured) return { kind: 'unavailable' };
    try {
      if (identity !== scope || !await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const restored = await withDeadline(() => Purchases.restorePurchases(), REVENUECAT_DEADLINES.restoreMs);
      if (restored.timedOut) return { kind: 'unavailable' };
      if (identity !== scope || !await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const active = activeEntitlementIds(restored.value);
      return active.includes(HER_KEYS_PLUS_ENTITLEMENT) ? { kind: 'restored' } : { kind: 'no_purchases_found' };
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : 'unknown_error' };
    }
  });
}
