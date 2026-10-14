import { useCallback, useEffect, useRef, useState } from 'react';
import type { RestoreOutcome } from './entitlement';
import { useEntitlement } from './RevenueCatProvider';

/**
 * The words for each way a Restore Purchases attempt can end. Raw SDK messages are never shown: an `error` outcome carries a
 * private detail string that is deliberately dropped here.
 */
export function restoreNoticeFor(outcome: RestoreOutcome): string {
  switch (outcome.kind) {
    case 'restored':
      return 'Your Premium purchase was restored. Her Keys is checking Premium access.';
    case 'no_purchases_found':
      return 'No Premium purchase was found for this store account.';
    case 'unavailable':
      return 'Purchases can’t be restored right now. Reconnect your account and try again.';
    default:
      return 'Purchases couldn’t be restored. Try again.';
  }
}

export interface RestorePurchasesApi {
  /** A restore is in flight. Hosts should hold Sign out / Done / Delete while it is. */
  restoring: boolean;
  /** The outcome words for the CURRENT account only; a result that belongs to another account is never shown. */
  notice: string | null;
  restore: () => Promise<void>;
}

/**
 * Account-level Restore Purchases, over the existing `useEntitlement().restore(expectedAccountId)` boundary.
 *
 * - It acts only for the bound account it was given and hands that UUID to the SDK boundary, which refuses a store restore
 *   whose RevenueCat identity is not exactly that account (anonymous, stale, or another account's).
 * - Single-flight: a second press while one is pending does nothing, even before React re-renders.
 * - If the account changes while a restore is pending, its late result is dropped and never shown to the new account.
 * - After unmount a late result is ignored.
 * - A throwing restore ends as the same recoverable "try again" words as an `error` outcome.
 *
 * It grants nothing itself: a successful restore is reflected through the provider's canonical CustomerInfo refresh.
 */
export function useRestorePurchases(accountId: string | null, blocked = false): RestorePurchasesApi {
  const { restore: restoreEntitlement } = useEntitlement();
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<{ accountId: string; notice: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const restore = useCallback(async () => {
    const owner = currentAccount.current;
    if (owner === null || blocked || inFlight.current) return;
    inFlight.current = true;
    setRestoring(true);
    setResult(null);
    try {
      const outcome = await restoreEntitlement(owner);
      if (!mounted.current || currentAccount.current !== owner) return;
      setResult({ accountId: owner, notice: restoreNoticeFor(outcome) });
    } catch {
      if (mounted.current && currentAccount.current === owner) setResult({ accountId: owner, notice: restoreNoticeFor({ kind: 'error', message: 'restore_threw' }) });
    } finally {
      inFlight.current = false;
      if (mounted.current) setRestoring(false);
    }
  }, [blocked, restoreEntitlement]);

  return { restoring, notice: result !== null && result.accountId === accountId ? result.notice : null, restore };
}
