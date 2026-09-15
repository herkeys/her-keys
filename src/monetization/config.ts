/**
 * RevenueCat public SDK API keys, read from Expo public env vars. Only
 * `EXPO_PUBLIC_...` (client-safe, non-secret) names belong here — RevenueCat
 * secret (`sk_...`) keys must never reach client source. See
 * docs/builds/BUILD25_MONETIZATION_FOUNDATION.md.
 */

export interface RevenueCatApiKeys {
  ios: string | undefined;
  android: string | undefined;
}

export const revenueCatApiKeys: RevenueCatApiKeys = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
};

export function hasConfiguredApiKey(platform: 'ios' | 'android'): boolean {
  return Boolean(revenueCatApiKeys[platform]);
}
