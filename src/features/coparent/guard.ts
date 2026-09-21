/**
 * A double-save guard.
 *
 * A second tap in the same frame would otherwise save twice before any "busy" state renders. The guard is a closure over one flag,
 * so it is the same rule everywhere a form saves — and testable without rendering. It holds no data: only whether a save is running.
 */
export interface SaveGuard {
  /** Run `work` unless one is already running. `ran: false` means the call was ignored (a duplicate), and nothing was started. */
  run<T>(work: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
  readonly busy: boolean;
}

export function createSaveGuard(): SaveGuard {
  const state = { running: false };
  return {
    get busy() {
      return state.running;
    },
    async run(work) {
      if (state.running) return { ran: false };
      state.running = true;
      try {
        return { ran: true, value: await work() };
      } finally {
        // Released even when the work throws, so a failed save can be tried again.
        state.running = false;
      }
    },
  };
}
