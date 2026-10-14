import type { RevenueCatApiPort } from './ports.ts';

const BASE_URL = 'https://api.revenuecat.com/v1';
const TIMEOUT_MS = 8_000;

/**
 * RevenueCat REST v1 `GET /subscribers/{app_user_id}`, authenticated with the SERVER-SIDE secret API key (never the client-public SDK
 * key). The App User ID is always a Supabase account UUID chosen by the server, URL-encoded as one path segment. Note the documented
 * behaviour that RevenueCat creates an empty subscriber record for an id it has never seen; that is harmless here and is the reason
 * the id is only ever a verified account id.
 */
export function createRevenueCatApi(secretKey: string, fetchImpl: typeof fetch = fetch): RevenueCatApiPort {
  return {
    async getSubscriber(appUserId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchImpl(`${BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) return { ok: false, status: response.status };
        return { ok: true, body: await response.json() };
      } catch {
        return { ok: false, status: null };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
