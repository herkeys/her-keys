import { consentStatus } from '../../domain/consent';
import type { ConsentReadResult } from '../../platform/consentBackend';

/**
 * What Your Account may say about the account's AI-processing choice.
 *
 * There is exactly ONE source of truth for that choice: the account's append-only consent ledger, read through
 * `createConsentLedger(session).read()` and decided by `consentStatus()` — the same pair ConsentGate uses to open the app. This module
 * only translates one ledger answer into a display state. It stores nothing, caches nothing durable and never writes: it is a read of
 * the server's answer, so it can never disagree with what the AI client and the Edge Function will enforce.
 */
export type AiConsentView =
  /** No account to ask about (signed out, reconnecting, quarantined). */
  | { kind: 'not-applicable' }
  | { kind: 'checking' }
  /** The ledger did not answer (offline, timeout, unreadable). Never turned into a guess either way. */
  | { kind: 'unavailable' }
  | { kind: 'known'; aiDecisionRecorded: boolean; aiPermitted: boolean };

export const AI_CONSENT_READ_TIMEOUT_MS = 15_000;

/** One ledger answer as a display state. Anything but a clean `ok` is `unavailable`: absence never means "granted". */
export function aiConsentViewFromRead(answer: ConsentReadResult): AiConsentView {
  if (answer.kind !== 'ok') return { kind: 'unavailable' };
  const decision = consentStatus(answer.receipts);
  return { kind: 'known', aiDecisionRecorded: decision.aiDecisionRecorded, aiPermitted: decision.aiPermitted };
}

/** A read that never answers is a failed read, so the summary cannot sit on "Checking…" forever. */
export function boundedConsentRead(
  read: () => Promise<ConsentReadResult>,
  ms: number = AI_CONSENT_READ_TIMEOUT_MS,
): Promise<ConsentReadResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'unavailable' }), ms);
    read().then(
      (answer) => {
        clearTimeout(timer);
        resolve(answer);
      },
      () => {
        clearTimeout(timer);
        resolve({ kind: 'unavailable' });
      },
    );
  });
}
