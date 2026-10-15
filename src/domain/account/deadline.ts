/**
 * BOUNDED ASYNCHRONOUS WORK.
 *
 * A native SDK or a network socket can leave a promise pending forever. Nothing
 * in the account path may wait on such a promise without an end: a spinner that
 * is only HIDDEN while the state machine stays `authenticating` locks every
 * retry. A deadline here turns "never answers" into an explicit outcome the
 * runtime can map onto a real, retryable state.
 *
 * Honesty about cancellation: a timeout does not stop the underlying work. The
 * work may still finish later, so callers must treat any late answer as stale
 * (see `latest` in the runtime) and never let it mutate identity or navigation.
 */

export type Timed<T> = { timedOut: false; value: T } | { timedOut: true };

export function withDeadline<T>(work: Promise<T> | (() => Promise<T>), ms: number): Promise<Timed<T>> {
  return new Promise<Timed<T>>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    let promise: Promise<T>;
    try {
      promise = typeof work === 'function' ? work() : work;
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        clearTimeout(timer);
        // After a timeout this settles an already-resolved promise: a no-op, so
        // a late rejection is swallowed rather than surfacing as unhandled.
        reject(error);
      }
    );
  });
}

/** How long each account operation may stay unanswered before it becomes a retryable failure. */
export interface AccountDeadlines {
  /** Supabase `setSession` on the transport client (may refresh an expired pair over the network). */
  activateMs: number;
  /** One SecureStore read or write. */
  secureStoreMs: number;
  /** One `bootstrap_account` / `claim_local_household` request. */
  bindingRpcMs: number;
  /** An email/password or email-code request. */
  emailRequestMs: number;
  /** The whole provider sheet, including the time she spends in it. */
  providerSheetMs: number;
}

export const DEFAULT_ACCOUNT_DEADLINES: AccountDeadlines = {
  activateMs: 20_000,
  secureStoreMs: 10_000,
  bindingRpcMs: 30_000,
  emailRequestMs: 30_000,
  providerSheetMs: 5 * 60_000,
};
