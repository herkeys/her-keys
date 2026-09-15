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
    // Anonymous App User ID for Build 2.5 — Her Keys has no production
    // authentication yet. See docs/builds/BUILD25_MONETIZATION_FOUNDATION.md
    // for the future Purchases.logIn migration once accounts exist.
    Purchases.configure({ apiKey });
    configured = true;
    return { configured: true, reason: 'configured' };
  } catch {
    return { configured: false, reason: 'sdk_error' };
  }
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

function activeEntitlementIds(info: CustomerInfo): string[] {
  return Object.keys(info.entitlements.active);
}

/** `null` means the check could not be resolved (not configured, offline, SDK error) — callers must fail open. */
export async function fetchActiveEntitlementIds(): Promise<string[] | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return activeEntitlementIds(info);
  } catch {
    return null;
  }
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
  if (!configured) return { kind: 'unavailable' };
  if (!offering) return { kind: 'no_offering' };

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      offering,
      requiredEntitlementIdentifier: HER_KEYS_PLUS_ENTITLEMENT,
    });
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
}

export async function restoreRevenueCatPurchases(): Promise<RestoreOutcome> {
  if (!configured) return { kind: 'unavailable' };
  try {
    const info = await Purchases.restorePurchases();
    const active = activeEntitlementIds(info);
    return active.includes(HER_KEYS_PLUS_ENTITLEMENT) ? { kind: 'restored' } : { kind: 'no_purchases_found' };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'unknown_error' };
  }
}
