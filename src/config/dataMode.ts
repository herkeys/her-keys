/**
 * Demo mode loads the fictional Ellis household and allows internal tools
 * (reset, corruption simulation). Empty mode is what a real person gets: no
 * fictional household presented as theirs.
 *
 * Configured with EXPO_PUBLIC_HERKEYS_DATA_MODE ("demo" | "empty") and
 * EXPO_PUBLIC_HERKEYS_INTERNAL_TOOLS ("1"). These are configuration, not
 * secrets. Without them, development builds are demo and every other build is
 * empty — a production build can never fall into the demo household by accident.
 */

export type DataMode = 'demo' | 'empty';

export function resolveDataMode(configured: string | undefined, isDevelopment: boolean): DataMode {
  if (configured === 'demo' || configured === 'empty') return configured;
  return isDevelopment ? 'demo' : 'empty';
}

/** Destructive tools only exist where the data is fictional and the build is internal. */
export function internalToolsEnabled(mode: DataMode, isDevelopment: boolean, configured: string | undefined): boolean {
  return mode === 'demo' && (isDevelopment || configured === '1');
}

/** Whether unreadable stored state is kept aside for inspection instead of being discarded. */
export function diagnosticsEnabled(isDevelopment: boolean, configuredTools: string | undefined): boolean {
  return isDevelopment || configuredTools === '1';
}
