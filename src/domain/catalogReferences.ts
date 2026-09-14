import { replayDiscovery } from './discovery';
import { dropUnknownOnboardingOptions } from './onboarding';
import type { AppState } from './state';

/**
 * Stored state can outlive the app content it points at: an onboarding option
 * or a Talk It Out question can be reworded or removed in a later version.
 * That isn't corruption, so only the affected piece is let go — the rest of
 * the household is kept. Each repair is reported, never hidden.
 *
 * (A One Move whose move left the catalog is handled when today's One Move is resolved.)
 */
export function repairCatalogReferences(state: AppState): { state: AppState; repairs: string[] } {
  const repairs: string[] = [];

  const onboarding = dropUnknownOnboardingOptions(state);
  let next = onboarding.state;
  for (const dropped of onboarding.dropped) repairs.push(`dropped onboarding answer ${dropped} that is no longer offered`);

  if (next.discovery !== null && replayDiscovery(next.discovery) === null) {
    repairs.push(`discarded Talk It Out record ${next.discovery.id} that no longer matches the script`);
    next = { ...next, discovery: null };
  }

  return { state: next, repairs };
}
