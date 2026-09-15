import type { AppState } from '../domain/state';
import { toInstant } from '../domain/logicalDay';
import { decodeStoredState, encodeStoredState, migrationPlan, type InvalidReason, type MigrationPlan } from './envelope';
import type { StorageAdapter } from './storageAdapter';

/**
 * The persistence boundary. Features and screens see application operations —
 * load, save, reset — and never storage keys or AsyncStorage calls, so a
 * secure-storage or Supabase implementation can replace this one without
 * touching them.
 */
export interface AppStateRepository {
  loadAppState(): Promise<LoadOutcome>;
  saveAppState(state: AppState, writeSeq: number): Promise<void>;
  resetAppState(): Promise<void>;
}

export type LoadOutcome =
  | { kind: 'empty' }
  | { kind: 'loaded'; state: AppState; writeSeq: number; migratedFrom: number | null }
  | { kind: 'invalid'; reason: InvalidReason; issues: string[]; quarantined: boolean }
  | { kind: 'future_version'; storedVersion: number; preserved: boolean }
  | { kind: 'read_failed' };

export const STORAGE_KEYS = {
  primary: 'herkeys.appState',
  /** Development and internal builds only: the last unreadable state, kept for inspection. */
  corrupt: 'herkeys.appState.corrupt',
  /** Every build: state written by a newer app version, kept so it's never destroyed. */
  future: 'herkeys.appState.future',
} as const;

export type RepositoryPhase = 'read' | 'decode' | 'encode' | 'write';

export interface RepositoryOptions {
  storage: StorageAdapter;
  appVersion: string;
  now: () => number;
  quarantineCorruptState: boolean;
  plan?: MigrationPlan;
  /** How long each step took, for development diagnostics. */
  onTiming?: (phase: RepositoryPhase, ms: number) => void;
}

const preciseNow = () => globalThis.performance?.now() ?? Date.now();

export function createAppStateRepository(options: RepositoryOptions): AppStateRepository {
  const { storage } = options;

  async function preserveFutureState(raw: string, storedVersion: number): Promise<boolean> {
    try {
      const existing = await storage.read(STORAGE_KEYS.future);
      const existingVersion = existing ? readSchemaVersion(existing) : null;
      if (existingVersion !== null && existingVersion >= storedVersion) return true;
      await storage.write(STORAGE_KEYS.future, raw);
      return true;
    } catch {
      return false;
    }
  }

  async function quarantine(raw: string, reason: InvalidReason, issues: string[]): Promise<boolean> {
    if (!options.quarantineCorruptState) return false;
    try {
      await storage.write(
        STORAGE_KEYS.corrupt,
        JSON.stringify({ detectedAt: toInstant(options.now()), reason, issues, raw })
      );
      return true;
    } catch {
      return false;
    }
  }

  return {
    async loadAppState() {
      let raw: string | null;
      const readStarted = preciseNow();
      try {
        raw = await storage.read(STORAGE_KEYS.primary);
      } catch {
        // Not the same as corrupt: the data may be fine, so nothing is discarded or overwritten.
        return { kind: 'read_failed' };
      }
      options.onTiming?.('read', preciseNow() - readStarted);
      if (raw === null) return { kind: 'empty' };

      const decodeStarted = preciseNow();
      const decoded = decodeStoredState(raw, options.plan ?? migrationPlan);
      options.onTiming?.('decode', preciseNow() - decodeStarted);
      switch (decoded.kind) {
        case 'valid':
          return { kind: 'loaded', state: decoded.state, writeSeq: decoded.writeSeq, migratedFrom: decoded.migratedFrom };
        case 'future_version':
          return { kind: 'future_version', storedVersion: decoded.storedVersion, preserved: await preserveFutureState(raw, decoded.storedVersion) };
        case 'invalid':
          return { kind: 'invalid', reason: decoded.reason, issues: decoded.issues, quarantined: await quarantine(raw, decoded.reason, decoded.issues) };
      }
    },

    async saveAppState(state, writeSeq) {
      const encodeStarted = preciseNow();
      const encoded = encodeStoredState(state, { appVersion: options.appVersion, savedAt: toInstant(options.now()), writeSeq });
      options.onTiming?.('encode', preciseNow() - encodeStarted);

      const writeStarted = preciseNow();
      await storage.write(STORAGE_KEYS.primary, encoded);
      options.onTiming?.('write', preciseNow() - writeStarted);
    },

    async resetAppState() {
      await storage.remove(STORAGE_KEYS.primary);
      if (options.quarantineCorruptState) await storage.remove(STORAGE_KEYS.corrupt);
    },
  };
}

function readSchemaVersion(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed) {
      const version = (parsed as { schemaVersion: unknown }).schemaVersion;
      return typeof version === 'number' ? version : null;
    }
    return null;
  } catch {
    return null;
  }
}
