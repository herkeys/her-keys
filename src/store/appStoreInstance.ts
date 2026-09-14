import Constants from 'expo-constants';
import { diagnosticsEnabled, internalToolsEnabled, resolveDataMode } from '../config/dataMode';
import type { AppState } from '../domain/state';
import { asyncStorageAdapter } from '../persistence/asyncStorageAdapter';
import { createAppStateRepository } from '../persistence/appStateRepository';
import { simulateStoredStateDamage, type SimulatedDamage } from '../persistence/damageSimulation';
import { createAppStore, type StoreDiagnostic } from '../state/appStore';

// Read by their full names so Expo inlines them into the bundle at build time.
const configuredMode = process.env.EXPO_PUBLIC_HERKEYS_DATA_MODE;
const configuredTools = process.env.EXPO_PUBLIC_HERKEYS_INTERNAL_TOOLS;

export const dataMode = resolveDataMode(configuredMode, __DEV__);
export const internalTools = internalToolsEnabled(dataMode, __DEV__, configuredTools);

export const appStore = createAppStore({
  repository: createAppStateRepository({
    storage: asyncStorageAdapter,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    now: Date.now,
    quarantineCorruptState: diagnosticsEnabled(__DEV__, configuredTools),
  }),
  mode: dataMode,
  report: __DEV__ ? reportDiagnostic : undefined,
});

/** Codes, counts, timings and ids only — never household content. */
function reportDiagnostic(event: StoreDiagnostic) {
  console.info(`[herkeys] ${JSON.stringify(event)}`);
}

/** Internal tools only: overwrite stored state and stop this session writing, so the next launch loads the damage. */
export async function simulateDamage(kind: SimulatedDamage, current: AppState | null): Promise<void> {
  if (!internalTools) return;
  appStore.suspendPersistence();
  await appStore.flush();
  await simulateStoredStateDamage(asyncStorageAdapter, kind, current);
}
