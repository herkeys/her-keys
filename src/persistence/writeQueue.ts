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
  enqueue(value: T): void;
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
}

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
  let consecutiveFailedCycles = 0;
  let attempts = 0;
  let degraded = false;

  const status = (): WriteQueueStatus => ({ degraded, consecutiveFailedCycles, committedSeq, lastSeq, attempts });

  async function attempt(job: Job<T>): Promise<boolean> {
    attempts += 1;
    try {
      await write(job.value, job.seq);
      committedSeq = Math.max(committedSeq, job.seq);
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
        if (job.seq <= committedSeq) continue;

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
      if (!enabled) return;
      lastSeq += 1;
      pending = { value, seq: lastSeq };
      running ??= drain();
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
