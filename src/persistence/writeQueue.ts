/**
 * Saves state one write at a time so a slow write can never land after a
 * newer one and roll the user's actions back.
 *
 * - Only the newest value matters: while a write is in flight, later values
 *   replace each other, so a burst of actions costs at most two writes.
 * - Each value gets the next sequence number; anything at or below what's
 *   already committed is skipped.
 * - A failed write is retried once straight away (with the newest value, if
 *   one has arrived). If that fails too, the in-memory state stays
 *   authoritative and the next action writes everything again.
 * - After `degradeAfterFailedCycles` failed cycles in a row the queue reports
 *   itself degraded, until a write succeeds.
 */

export interface WriteQueueStatus {
  degraded: boolean;
  consecutiveFailedCycles: number;
  committedSeq: number;
  lastSeq: number;
  attempts: number;
}

export interface WriteQueue<T> {
  /** The sequence assigned to this value, or null when persistence is disabled. */
  enqueue(value: T): number | null;
  flush(): Promise<void>;
  /** Continue numbering after a sequence already on disk. Call before the first enqueue. */
  startAfter(seq: number): void;
  disable(): void;
  enable(): void;
  isEnabled(): boolean;
  status(): WriteQueueStatus;
}

interface Job<T> {
  value: T;
  seq: number;
  /** Session-local ordering stays monotonic even when the persisted sequence wraps. */
  order: number;
}

/** A bounded, JSON-safe persisted counter. Ordering within a running queue uses `Job.order`. */
export const MAX_WRITE_SEQUENCE = 2_147_483_647;

export function createWriteQueue<T>({
  write,
  onStatusChange,
  degradeAfterFailedCycles = 2,
}: {
  write: (value: T, seq: number) => Promise<void>;
  onStatusChange?: (status: WriteQueueStatus) => void;
  degradeAfterFailedCycles?: number;
}): WriteQueue<T> {
  let pending: Job<T> | null = null;
  let running: Promise<void> | null = null;
  let enabled = true;
  let lastSeq = 0;
  let committedSeq = 0;
  let lastOrder = 0;
  let committedOrder = 0;
  let consecutiveFailedCycles = 0;
  let attempts = 0;
  let degraded = false;

  const status = (): WriteQueueStatus => ({ degraded, consecutiveFailedCycles, committedSeq, lastSeq, attempts });

  async function attempt(job: Job<T>): Promise<boolean> {
    attempts += 1;
    try {
      await write(job.value, job.seq);
      committedSeq = job.seq;
      committedOrder = job.order;
      return true;
    } catch {
      return false;
    }
  }

  async function drain(): Promise<void> {
    try {
      while (pending) {
        const job: Job<T> = pending;
        pending = null;
        if (job.order <= committedOrder) continue;

        let saved = await attempt(job);
        if (!saved) {
          const retry: Job<T> = pending ?? job;
          pending = null;
          saved = await attempt(retry);
        }

        const wasDegraded = degraded;
        consecutiveFailedCycles = saved ? 0 : consecutiveFailedCycles + 1;
        degraded = consecutiveFailedCycles >= degradeAfterFailedCycles;
        if (degraded !== wasDegraded || !saved) onStatusChange?.(status());
      }
    } finally {
      running = null;
    }
  }

  return {
    enqueue(value) {
      if (!enabled) return null;
      lastSeq = lastSeq >= MAX_WRITE_SEQUENCE ? 1 : lastSeq + 1;
      lastOrder += 1;
      pending = { value, seq: lastSeq, order: lastOrder };
      running ??= drain();
      return lastSeq;
    },
    async flush() {
      while (running) await running;
    },
    startAfter(seq) {
      lastSeq = Math.max(lastSeq, seq);
      committedSeq = Math.max(committedSeq, seq);
    },
    disable() {
      enabled = false;
      pending = null;
    },
    enable() {
      enabled = true;
    },
    isEnabled: () => enabled,
    status,
  };
}
