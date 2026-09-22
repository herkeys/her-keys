/**
 * ONE SAVE AT A TIME (scenario AN, double-tap).
 *
 * A second tap that lands before the first save has rendered its "busy" state would otherwise save twice and create two items. The
 * guard is set synchronously, so the second call is refused in the same tick, not after a re-render. Kept out of the components so it
 * can be tested directly.
 */
export function createSingleFlight() {
  let busy = false;
  return {
    /** Runs `work` unless one is already running; resolves `undefined` when it was refused. */
    async run<T>(work: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await work();
      } finally {
        busy = false;
      }
    },
    isBusy: () => busy,
  };
}
