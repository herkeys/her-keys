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
import { hasConfiguredApiKey, revenueCatApiKeys } from './config';
import { HER_KEYS_PLUS_ENTITLEMENT, type PaywallOutcome, type RestoreOutcome } from './entitlement';

export type ConfigureReason = 'configured' | 'already_configured' | 'missing_api_key' | 'sdk_error';

export interface ConfigureResult {
  configured: boolean;
  reason: ConfigureReason;
}

let configured = false;
let identifiedAccountId: string | null = null;
// Changed synchronously on every auth transition. An in-flight SDK call for
// the previous account must immediately lose permission to read or purchase.
let requestedAccountId: string | null = null;
// Account changes must not interleave with a restore or a paywall's store transaction.
let accountSdkOperation: Promise<void> = Promise.resolve();
function withAccountSdkOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = accountSdkOperation.then(operation);
  accountSdkOperation = result.then(() => {}, () => {});
  return result;
}

async function matchesIdentifiedAccount(expected: string | null): Promise<boolean> {
  return configured && expected !== null && requestedAccountId === expected && identifiedAccountId === expected && await Purchases.getAppUserID() === expected && requestedAccountId === expected;
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
export function identifyRevenueCatAccount(accountId: string | null): Promise<IdentifyResult> {
  // Invalidate the previous actor BEFORE queueing any native operation. This
  // also works if an earlier SDK call never settles: billing remains denied,
  // while Supabase login/logout is independently allowed to finish.
  requestedAccountId = accountId;
  identifiedAccountId = null;
  return withAccountSdkOperation(async () => {
    if (!configured) return 'not_configured';
    try {
      if (accountId === null) {
        await Purchases.logOut();
        return 'signed_out';
      }
      // Superseded queued logins must never re-identify an earlier account.
      if (requestedAccountId !== accountId) return 'sdk_error';
      await Purchases.logIn(accountId);
      if (requestedAccountId !== accountId) return 'sdk_error';
      if (await Purchases.getAppUserID() !== accountId || requestedAccountId !== accountId) return 'sdk_error';
      identifiedAccountId = accountId;
      return 'identified';
    } catch {
      return 'sdk_error';
    }
  });
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

function activeEntitlementIds(info: CustomerInfo): string[] {
  return Object.keys(info.entitlements.active);
}

/** `null` means the check could not be resolved (not configured, offline, SDK error) — callers must fail open. */
export async function fetchActiveEntitlementIds(): Promise<string[] | null> {
  return withAccountSdkOperation(async () => {
    const owner = identifiedAccountId;
    try {
      if (!await matchesIdentifiedAccount(owner)) return null;
      const info = await Purchases.getCustomerInfo();
      return await matchesIdentifiedAccount(owner) ? activeEntitlementIds(info) : null;
    } catch {
      return null;
    }
  });
}

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
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
export async function presentRevenueCatPaywall(offering: PurchasesOffering | null): Promise<PaywallOutcome> {
  return withAccountSdkOperation(async () => {
    if (!configured) return { kind: 'unavailable' };
    if (!offering) return { kind: 'no_offering' };

    try {
      const owner = identifiedAccountId;
      if (!await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        offering,
        requiredEntitlementIdentifier: HER_KEYS_PLUS_ENTITLEMENT,
      });
      if (!await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
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
  const owner = expectedAccountId ?? identifiedAccountId;
  return withAccountSdkOperation(async () => {
    if (!configured) return { kind: 'unavailable' };
    try {
      if (!await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const info = await Purchases.restorePurchases();
      if (!await matchesIdentifiedAccount(owner)) return { kind: 'unavailable' };
      const active = activeEntitlementIds(info);
      return active.includes(HER_KEYS_PLUS_ENTITLEMENT) ? { kind: 'restored' } : { kind: 'no_purchases_found' };
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : 'unknown_error' };
    }
  });
}
