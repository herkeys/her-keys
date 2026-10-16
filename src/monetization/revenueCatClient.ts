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
 * Every SDK call that is not a customer's own interaction ends. A native call that never answers would otherwise hold the
 * serialized account queue below forever, so the next sign-in, restore or paywall would wait behind it. A timeout does not cancel
 * the native work; each caller treats a late answer as stale via the identity checks already in this file.
 */
export const REVENUECAT_DEADLINES = { identifyMs: 15_000, readMs: 15_000, restoreMs: 60_000 } as const;

let configured = false;
let desiredAccountId: string | null = null;
let identifiedAccountId: string | null = null;
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

/** The SDK's current App User ID, or null when it could not be read in time. A read that never answers must not hold the queue. */
async function readAppUserId(): Promise<string | null> {
  try {
    const read = await withDeadline(() => Purchases.getAppUserID(), REVENUECAT_DEADLINES.readMs);
    return read.timedOut ? null : read.value;
  } catch {
    return null;
  }
}

/**
 * True only when we identified `expected` AND the SDK still reports it. An unreadable id is "not verified" (false). A readable id
 * that differs means a stale native logIn/logOut landed after us; the claim is withdrawn so the next purchase re-identifies.
 */
async function matchesIdentifiedAccount(expected: string | null): Promise<boolean> {
  if (!configured || expected === null || identifiedAccountId !== expected) return false;
  const sdkId = await readAppUserId();
  if (sdkId === expected) return true;
  if (sdkId !== null && identifiedAccountId === expected) identifiedAccountId = null;
  return false;
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
    if (identity.epoch !== epoch) return 'sdk_error';
    identifiedAccountId = null;
    if (!configured) return 'not_configured';
    // A timeout cannot cancel the native work, so this operation is marked dead the moment it is abandoned (or superseded) and every
    // later step re-checks before it issues another native call or touches identity. A stale logIn/logOut therefore cannot start
    // late, and a stale result cannot claim or publish an account.
    let abandoned = false;
    const current = () => !abandoned && identity.epoch === epoch;
    try {
      const done = await withDeadline(async (): Promise<IdentifyResult> => {
        if (accountId === null) {
          const before = await Purchases.getAppUserID();
          if (!current()) return 'sdk_error';
          if (!before.startsWith('$RCAnonymousID:')) await Purchases.logOut();
          return current() ? 'signed_out' : 'sdk_error';
        }
        const previousId = await Purchases.getAppUserID();
        if (!current()) return 'sdk_error';
        if (previousId !== accountId && !previousId.startsWith('$RCAnonymousID:')) {
          await Purchases.logOut();
          if (!current()) return 'sdk_error';
        }
        await Purchases.logIn(accountId);
        if (!current() || await Purchases.getAppUserID() !== accountId || !current()) return 'sdk_error';
        identifiedAccountId = accountId;
        publishIdentity({ accountId, epoch });
        return 'identified';
      }, REVENUECAT_DEADLINES.identifyMs);
      if (done.timedOut) {
        abandoned = true;
        return 'sdk_error';
      }
      return done.value;
    } catch {
      abandoned = true;
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
    // Trust, but verify against the SDK (bounded): a stale native call may have changed it since we identified.
    if (await withAccountSdkOperation(() => matchesIdentifiedAccount(wanted))) return desiredAccountId === wanted && identity.accountId === wanted;
  }
  const result = await identifyRevenueCatAccount(wanted);
  return result === 'identified' && desiredAccountId === wanted && identity.accountId === wanted;
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
