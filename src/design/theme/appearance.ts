import type { Scheme } from './palettes';

/**
 * HK-FE-UI-02-DM — the appearance PREFERENCE (what she chose) and its resolution to a SCHEME (what is drawn).
 *
 *   preference: 'light' | 'dark' | 'system'     — device-local, never an account or household value
 *   scheme:     'light' | 'dark'                 — what the theme provider resolves it to
 *
 * Pure functions only; persistence is an injected port so it can fail without ever trapping startup.
 */

export type AppearancePreference = 'light' | 'dark' | 'system';

export const APPEARANCE_PREFERENCES: readonly AppearancePreference[] = ['light', 'dark', 'system'];

/** The default for anyone with no saved (or no readable) preference. */
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = 'system';

/** One device-local key. NOT part of the household AppState envelope, the sync payload or any account profile. */
export const APPEARANCE_STORAGE_KEY = 'herkeys.appearance.preference.v1';

/** Reading the preference may never hold the app up for longer than this: past it, startup continues on System. */
export const APPEARANCE_HYDRATION_TIMEOUT_MS = 1200;

export const isAppearancePreference = (value: unknown): value is AppearancePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/** Accepts only the exact stored shape. Anything else — corrupt JSON, an unknown value, a wrong version — is System. */
export function parseStoredPreference(raw: unknown): AppearancePreference {
  if (typeof raw !== 'string') return DEFAULT_APPEARANCE_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && (parsed as { v?: unknown }).v === 1) {
      const preference = (parsed as { preference?: unknown }).preference;
      if (isAppearancePreference(preference)) return preference;
    }
  } catch {
    // fall through: unreadable is System
  }
  return DEFAULT_APPEARANCE_PREFERENCE;
}

export const serializePreference = (preference: AppearancePreference): string => JSON.stringify({ v: 1, preference });

/** A manual choice overrides the device; System follows it (and is Light if the platform cannot say). */
export function resolveScheme(preference: AppearancePreference, system: Scheme | null | undefined): Scheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return system === 'dark' ? 'dark' : 'light';
}

export interface AppearanceStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

/**
 * Reads the stored preference with a hard bound. It NEVER rejects: a missing value, a corrupt value, a storage error and a read
 * that does not answer in time all resolve to System, so appearance can never be the reason the app does not start.
 */
export async function loadPreference(storage: AppearanceStorage | null, timeoutMs: number = APPEARANCE_HYDRATION_TIMEOUT_MS): Promise<AppearancePreference> {
  if (storage === null) return DEFAULT_APPEARANCE_PREFERENCE;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const raw = await Promise.race([storage.read(), timeout]);
    return parseStoredPreference(raw);
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCE;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Writes are best-effort: a failed write leaves this session on the choice she made and never throws into the UI. */
export async function savePreference(storage: AppearanceStorage | null, preference: AppearancePreference): Promise<boolean> {
  if (storage === null) return false;
  try {
    await storage.write(serializePreference(preference));
    return true;
  } catch {
    return false;
  }
}
