/**
 * Test stand-in for `src/store/AccountProvider.tsx`, for the welcome flow only (see ./register.mjs).
 *
 * `useAccount` returns the same shape the production provider does, read from the host a test installs with
 * `installAccountHost(runtime)`. The host only mirrors the runtime and forwards to it — exactly what the production
 * provider does — so the runtime under it stays the single authority.
 */
import { useSyncExternalStore } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Host {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Any;
  actions: Any;
}

let host: Host | null = null;

export function installAccountHost(runtime: Any, { settled = true, available = true }: { settled?: boolean; available?: boolean } = {}): Host {
  let snapshot = { state: runtime.getState(), busy: false, settled, available, emailAvailable: runtime.emailOtpAvailable(), syncNamespace: null };
  const listeners = new Set<() => void>();
  const set = (patch: Any) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  runtime.subscribe((state: Any) => set({ state }));

  const run = async (work: () => Promise<Any>) => {
    set({ busy: true });
    try {
      const next = await work();
      set({ state: next });
      return next;
    } finally {
      set({ busy: false });
    }
  };

  host = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    actions: {
      signIn: (provider: string) => run(() => runtime.signIn(provider)),
      signOut: () => run(() => runtime.signOut()),
      retryBinding: () => run(() => runtime.resolveBinding()),
      requestEmailOtp: (email: string) => runtime.requestEmailOtp(email),
      verifyEmailOtp: async (email: string, code: string) => {
        set({ busy: true });
        try {
          const verified = await runtime.verifyEmailOtp(email, code);
          set({ state: verified.state });
          return verified;
        } finally {
          set({ busy: false });
        }
      },
    },
  };
  return host;
}

export function useAccount() {
  if (host === null) throw new Error('installAccountHost(runtime) must be called before the welcome flow renders');
  const current = host;
  const snapshot = useSyncExternalStore(current.subscribe, current.getSnapshot);
  return { ...snapshot, ...current.actions };
}
