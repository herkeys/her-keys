/**
 * One read-only, server-driven commercial launch gate.
 *
 * The app may describe the three Stage 1 tools, but must not invite a paid checkout
 * until the backend confirms that ALL THREE are released in this environment.
 * The client cannot grant or release a feature; each operation still needs its
 * server-side entitlement + household + quota/consent authorization.
 */
import { PREMIUM_CAPABILITY_KEYS, type PremiumCapabilityKey } from './premiumHomeCopy';
import type { ManifestEntry } from './premiumTypes';

export type PremiumLaunchState =
  | { kind: 'checking'; ready: false; available: readonly PremiumCapabilityKey[] }
  | { kind: 'not_released'; ready: false; available: readonly PremiumCapabilityKey[] }
  | { kind: 'ready'; ready: true; available: readonly PremiumCapabilityKey[] };

export function premiumLaunchState(manifest: readonly ManifestEntry[] | null): PremiumLaunchState {
  if (manifest === null) return { kind: 'checking', ready: false, available: [] };
  const available = PREMIUM_CAPABILITY_KEYS.filter(
    (key) => manifest.some((entry) => entry.featureKey === key && entry.tier === 'premium' && entry.available === true)
  );
  if (available.length !== PREMIUM_CAPABILITY_KEYS.length) return { kind: 'not_released', ready: false, available };
  return { kind: 'ready', ready: true, available };
}
