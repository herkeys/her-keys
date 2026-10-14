import { isEntitledState, type ManifestEntry, type PremiumServerClient, type ServerEntitlement, type VerifyStatus } from './premiumTypes';

/**
 * The account-keyed Premium state machine (no React). It holds ONLY presentation data about what the server said, for ONE account,
 * and it is thrown away the moment the account changes:
 *
 *  - every async completion is checked against the account it started for, so a late answer for account A can never be shown to, or
 *    applied as a grant for, account B (a purchase begun under A is never B's);
 *  - after a purchase or a restore it asks the SERVER to verify, on a bounded schedule, and stops the moment the server says entitled;
 *  - it never persists anything: there is no cached "she is Premium" that could outlive a sign-out or an expiry.
 */
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultScheduler: Scheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Delay before each verification attempt after a purchase: immediately, then backing off. ~29 s in all, then it stops and asks her. */
export const VERIFY_DELAYS_MS: readonly number[] = [0, 2_000, 4_000, 8_000, 15_000];

export type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable';
export type VerificationState = 'idle' | 'checking' | 'pending' | 'gave_up';

export interface PremiumSnapshot {
  accountId: string | null;
  load: LoadState;
  server: ServerEntitlement | null;
  manifest: ManifestEntry[] | null;
  verification: VerificationState;
  /** What the server said about the last verification, or `unreachable` if it could not be asked. */
  lastVerify: VerifyStatus | 'unreachable' | null;
}

const EMPTY: PremiumSnapshot = { accountId: null, load: 'idle', server: null, manifest: null, verification: 'idle', lastVerify: null };

export class PremiumController {
  private snapshot: PremiumSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private refreshing: Promise<void> | null = null;
  private verifying: Promise<void> | null = null;
  private timer: unknown = null;
  private autoVerifiedForEpoch = -1;

  private readonly client: PremiumServerClient;
  private readonly scheduler: Scheduler;
  private readonly delays: readonly number[];

  constructor(client: PremiumServerClient, scheduler: Scheduler = defaultScheduler, delays: readonly number[] = VERIFY_DELAYS_MS) {
    this.client = client;
    this.scheduler = scheduler;
    this.delays = delays;
  }

  getSnapshot = (): PremiumSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PremiumSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  /** The bound account changed (or signed out). Everything held for the previous account is discarded, in-flight work is orphaned. */
  setAccount(accountId: string | null): void {
    if (accountId === this.snapshot.accountId) return;
    this.epoch += 1;
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
    this.refreshing = null;
    this.verifying = null;
    this.snapshot = { ...EMPTY, accountId };
    for (const listener of [...this.listeners]) listener();
    if (accountId !== null) void this.refresh();
  }

  dispose(): void {
    this.epoch += 1;
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  /** Re-reads the caller's own server state and the display manifest. Single-flight; a result for a departed account is dropped. */
  refresh(): Promise<void> {
    if (this.snapshot.accountId === null) return Promise.resolve();
    if (this.refreshing !== null) return this.refreshing;
    const epoch = this.epoch;
    this.set({ load: this.snapshot.server === null ? 'loading' : this.snapshot.load });
    const run = (async () => {
      const [entitlement, manifest] = await Promise.all([this.client.entitlement(), this.client.manifest()]);
      if (epoch !== this.epoch) return;
      if (entitlement.kind === 'ok') {
        this.set({ load: 'ready', server: entitlement.value, manifest: manifest.kind === 'ok' ? manifest.entries : this.snapshot.manifest });
      } else {
        // Unreachable: keep what we last KNEW for display, but report the outage. A cached state never authorizes anything.
        this.set({ load: 'unavailable', manifest: manifest.kind === 'ok' ? manifest.entries : this.snapshot.manifest });
      }
    })().finally(() => {
      if (epoch === this.epoch) this.refreshing = null;
    });
    this.refreshing = run;
    return run;
  }

  /**
   * After a purchase or a restore: ask the SERVER to confirm, backing off, until it reports entitled or the schedule is spent.
   * Single-flight. Safe to call again ("Check again") once it has given up; the server's own rate limit bounds the cost.
   */
  startVerification(): Promise<void> {
    if (this.snapshot.accountId === null) return Promise.resolve();
    if (this.verifying !== null) return this.verifying;
    const epoch = this.epoch;
    this.set({ verification: 'checking', lastVerify: null });
    const run = (async () => {
      for (let attempt = 0; attempt < this.delays.length; attempt += 1) {
        const delay = this.delays[attempt];
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            this.timer = this.scheduler.setTimeout(() => {
              this.timer = null;
              resolve();
            }, delay);
          });
        }
        if (epoch !== this.epoch) return;
        const verified = await this.client.verify();
        if (epoch !== this.epoch) return;
        this.set({ lastVerify: verified.kind === 'ok' ? verified.status : 'unreachable' });
        this.refreshing = null;
        await this.refresh();
        if (epoch !== this.epoch) return;
        if (this.snapshot.server !== null && isEntitledState(this.snapshot.server.state)) {
          this.set({ verification: 'idle' });
          return;
        }
        this.set({ verification: 'pending' });
      }
      if (epoch === this.epoch) this.set({ verification: 'gave_up' });
    })().finally(() => {
      if (epoch === this.epoch) this.verifying = null;
    });
    this.verifying = run;
    return run;
  }

  /**
   * The store (RevenueCat's SDK) reports an active entitlement. That is a HINT, never authority: if the server does not agree yet,
   * verify — once per account session automatically (a user-triggered retry is always allowed).
   */
  noteStoreEntitled(): void {
    const { accountId, server, load, verification } = this.snapshot;
    if (accountId === null || load === 'idle' || load === 'loading') return;
    if (server !== null && isEntitledState(server.state)) return;
    if (verification === 'checking' || this.autoVerifiedForEpoch === this.epoch) return;
    this.autoVerifiedForEpoch = this.epoch;
    void this.startVerification();
  }
}
