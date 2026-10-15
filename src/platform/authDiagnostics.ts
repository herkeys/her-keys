/**
 * Authentication stage diagnostics.
 *
 * The P0 could not be located from outside the device: the server saw the PKCE
 * exchange succeed and then nothing. These events name the stage that last
 * finished and the stage that did not, with elapsed milliseconds.
 *
 * What they carry: a stage name, an outcome code and a duration. What they never
 * carry: tokens, OAuth codes, redirect URLs, email addresses, provider
 * identities or household content. Free-text `detail` from account events is
 * dropped here for exactly that reason; only `ms=` durations pass through.
 *
 * Off by default in release builds (no log output). A diagnostic build turns
 * logging on with EXPO_PUBLIC_HK_AUTH_DIAG=1; the in-memory ring is always kept
 * so a support screen or test can read the last events.
 */

export interface AuthDiagnosticEvent {
  at: number;
  type: string;
  detail?: string;
}

const RING_SIZE = 200;
const ring: AuthDiagnosticEvent[] = [];

declare const __DEV__: boolean | undefined;

function loggingEnabled(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  return process.env.EXPO_PUBLIC_HK_AUTH_DIAG === '1';
}

/** Only durations survive: `ms=123`. Anything else could be free text from a provider. */
function safeDetail(detail: string | undefined): string | undefined {
  return detail !== undefined && /^ms=\d+$/.test(detail) ? detail : undefined;
}

export function recordAuthDiagnostic(event: { type: string; detail?: string }, now: number = Date.now()): void {
  const entry: AuthDiagnosticEvent = { at: now, type: event.type, detail: safeDetail(event.detail) };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  if (loggingEnabled()) console.info(`[hk-auth] ${entry.type}${entry.detail ? ` ${entry.detail}` : ''}`);
}

export function authDiagnosticEvents(): readonly AuthDiagnosticEvent[] {
  return ring.slice();
}

export function clearAuthDiagnostics(): void {
  ring.length = 0;
}
