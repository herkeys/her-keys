import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConsentReadResult } from '../../platform/consentBackend';
import { aiConsentViewFromRead, boundedConsentRead, type AiConsentView } from './consentSummary';

/**
 * Reads the signed-in account's AI-processing choice for display, once per account (and again when asked). `accountId` is the
 * account the read belongs to: when it changes, the previous account's answer is NEVER shown for the new one — the view starts again
 * from `checking`, like ConsentGate. With no account there is nothing to ask and nothing is read.
 */
export function useAiConsentSummary(
  accountId: string | null,
  read: () => Promise<ConsentReadResult>,
): { view: AiConsentView; recheck: () => void } {
  const [answer, setAnswer] = useState<{ accountId: string; view: AiConsentView } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The caller's `read` closes over the freshest tokens at call time; the effect is keyed by account, never by a token rotation.
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    if (accountId === null) return;
    let live = true;
    void boundedConsentRead(() => readRef.current()).then((result) => {
      if (live) setAnswer({ accountId, view: aiConsentViewFromRead(result) });
    });
    return () => {
      live = false;
    };
  }, [accountId, attempt]);

  const recheck = useCallback(() => {
    setAnswer(null);
    setAttempt((n) => n + 1);
  }, []);

  if (accountId === null) return { view: { kind: 'not-applicable' }, recheck };
  const view: AiConsentView = answer !== null && answer.accountId === accountId ? answer.view : { kind: 'checking' };
  return { view, recheck };
}
