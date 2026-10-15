/**
 * A `fetch` that always ends.
 *
 * supabase-js awaits its network calls with no ceiling of its own. On a device
 * with a half-open socket (captive portal, radio handoff, a backgrounded
 * process) such a call never settles, and everything queued behind it — session
 * activation, household bootstrap, consent — waits forever.
 *
 * Auth and database requests answer in well under a second when the network is
 * healthy, so they get a short ceiling. Edge Functions can legitimately run a
 * model call, so they get a long one. An aborted request rejects with a
 * TypeError-like error, which supabase-js already maps to a retryable failure.
 */

export const AUTH_REST_TIMEOUT_MS = 25_000;
export const FUNCTION_TIMEOUT_MS = 90_000;

type FetchLike = (input: any, init?: any) => Promise<any>;

export function createTimeoutFetch(base: FetchLike, timeouts: { authRest?: number; functions?: number } = {}): FetchLike {
  return (input, init) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    const ms = url.includes('/functions/v1/') ? timeouts.functions ?? FUNCTION_TIMEOUT_MS : timeouts.authRest ?? AUTH_REST_TIMEOUT_MS;

    const controller = new AbortController();
    const caller: AbortSignal | undefined = init?.signal;
    const onCallerAbort = () => controller.abort();
    if (caller) {
      if (caller.aborted) controller.abort();
      else caller.addEventListener('abort', onCallerAbort);
    }
    const timer = setTimeout(() => controller.abort(), ms);

    return base(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onCallerAbort);
    });
  };
}
