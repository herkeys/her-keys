import type { AppState } from '../domain/state';
import { STORAGE_KEYS } from './appStateRepository';
import { CURRENT_SCHEMA_VERSION } from './envelope';
import type { StorageAdapter } from './storageAdapter';

/**
 * Hostile stored states for internal testing of recovery. These bypass the
 * repository on purpose — the repository refuses to write anything invalid.
 */
export type SimulatedDamage =
  | 'cleared'
  | 'malformed_json'
  | 'missing_schema_version'
  | 'invalid_state'
  | 'dangling_category'
  | 'future_version';

export async function simulateStoredStateDamage(storage: StorageAdapter, kind: SimulatedDamage, current: AppState | null): Promise<void> {
  if (kind === 'cleared') {
    await storage.remove(STORAGE_KEYS.primary);
    return;
  }
  await storage.write(STORAGE_KEYS.primary, damagedText(kind, current));
}

export function damagedText(kind: Exclude<SimulatedDamage, 'cleared'>, current: AppState | null): string {
  const envelope = (schemaVersion: number, data: unknown) =>
    JSON.stringify({ schemaVersion, appVersion: 'simulated', savedAt: new Date().toISOString(), writeSeq: 1, data });

  switch (kind) {
    case 'malformed_json':
      return '{"schemaVersion":1,"data":{"household":';
    case 'missing_schema_version':
      return JSON.stringify({ data: current });
    case 'invalid_state':
      return envelope(CURRENT_SCHEMA_VERSION, { ...current, tasks: 'not a list' });
    case 'dangling_category':
      return envelope(CURRENT_SCHEMA_VERSION, current ? { ...current, tasks: current.tasks.map((task, index) => (index === 0 ? { ...task, categoryId: 'cat-missing' } : task)) } : null);
    case 'future_version':
      return envelope(CURRENT_SCHEMA_VERSION + 1, { writtenBy: 'a newer Her Keys' });
  }
}
