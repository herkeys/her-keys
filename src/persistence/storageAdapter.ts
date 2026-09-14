/**
 * The narrow key-value capability persistence needs from a device. Only the
 * repository talks to it; nothing in features, domain or UI does.
 */
export interface StorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface MemoryStorageOptions {
  failReads?: boolean;
  /** Called with the key and the 1-based write attempt number; return true to make that write fail. */
  failWrite?: (key: string, attempt: number) => boolean;
  /** Milliseconds to wait before a write settles, to exercise overlapping writes. */
  writeDelayMs?: (key: string, attempt: number) => number;
}

export interface MemoryStorage extends StorageAdapter {
  contents(): Record<string, string>;
  /** Every write attempt, in order, including failed ones. */
  readonly writeLog: Array<{ key: string; value: string; ok: boolean }>;
  readonly readCount: () => number;
}

/** In-memory storage for tests, able to fail or slow down on demand. */
export function createMemoryStorage(initial: Record<string, string> = {}, options: MemoryStorageOptions = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  const writeLog: MemoryStorage['writeLog'] = [];
  let reads = 0;

  return {
    async read(key) {
      reads += 1;
      if (options.failReads) throw new Error('Simulated read failure');
      return data.get(key) ?? null;
    },
    async write(key, value) {
      const attempt = writeLog.length + 1;
      const delay = options.writeDelayMs?.(key, attempt) ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const fails = options.failWrite?.(key, attempt) ?? false;
      writeLog.push({ key, value, ok: !fails });
      if (fails) throw new Error('Simulated write failure');
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    contents: () => Object.fromEntries(data),
    writeLog,
    readCount: () => reads,
  };
}
