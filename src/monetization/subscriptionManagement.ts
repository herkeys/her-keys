import { Linking } from 'react-native';

/**
 * Where she manages or cancels a subscription: the PLATFORM's own subscriptions screen. Her Keys never cancels, refunds or changes a
 * subscription itself, and never shows a price here (a price comes only from the store catalog, inside the purchase interface).
 *
 * `ANDROID_PACKAGE` is the shipping Android application id; `tests/premiumHome/subscriptionManagement.test.mjs` pins it to `app.json`,
 * so a release-identity change cannot leave this pointing at another app.
 */
export const ANDROID_PACKAGE = 'com.heykeys.app';
export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
export const GOOGLE_SUBSCRIPTIONS_URL = `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`;

export interface ManageDeps {
  os: string;
  openURL: (url: string) => Promise<unknown>;
}

/** The store screen for this platform, or null where Her Keys has no store (web, tests). */
export function subscriptionManagementUrl(os: string): string | null {
  if (os === 'ios') return APPLE_SUBSCRIPTIONS_URL;
  if (os === 'android') return GOOGLE_SUBSCRIPTIONS_URL;
  return null;
}

export type ManageOutcome = 'opened' | 'unavailable';

export async function openSubscriptionManagement(deps: ManageDeps): Promise<ManageOutcome> {
  const url = subscriptionManagementUrl(deps.os);
  if (url === null) return 'unavailable';
  try {
    await deps.openURL(url);
    return 'opened';
  } catch {
    return 'unavailable';
  }
}

export const defaultManageDeps = (os: string): ManageDeps => ({ os, openURL: (url) => Linking.openURL(url) });
