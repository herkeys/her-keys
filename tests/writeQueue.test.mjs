import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createWriteQueue } from '../src/persistence/writeQueue.ts';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Write queue', () => {
  test('writes one at a time, skipping straight to the newest waiting value', async () => {
    const written = [];
    let active = 0;
    let mostAtOnce = 0;
    const queue = createWriteQueue({
      write: async (value, seq) => {
        active += 1;
        mostAtOnce = Math.max(mostAtOnce, active);
        await pause(5);
        written.push([value, seq]);
        active -= 1;
      },
    });

    for (let i = 1; i <= 20; i++) queue.enqueue(i);
    await queue.flush();

    assert.equal(mostAtOnce, 1);
    assert.deepEqual(written, [[1, 1], [20, 20]]);
  });

  test('a slow older write can never land after a newer one', async () => {
    const disk = [];
    const queue = createWriteQueue({
      write: async (value) => {
        await pause(value === 'older' ? 30 : 1);
        disk.push(value);
      },
    });

    queue.enqueue('older');
    await pause(1);
    queue.enqueue('newer');
    await queue.flush();

    assert.deepEqual(disk, ['older', 'newer']);
    assert.equal(queue.status().committedSeq, 2);
  });

  test('numbering continues after the sequence already stored', async () => {
    const seqs = [];
    const queue = createWriteQueue({ write: async (_value, seq) => void seqs.push(seq) });
    queue.startAfter(41);
    queue.enqueue('next');
    await queue.flush();
    assert.deepEqual(seqs, [42]);
  });

  test('a failed write is retried once straight away', async () => {
    let attempt = 0;
    const written = [];
    const queue = createWriteQueue({
      write: async (value) => {
        attempt += 1;
        if (attempt === 1) throw new Error('transient');
        written.push(value);
      },
    });

    queue.enqueue('state');
    await queue.flush();

    assert.deepEqual(written, ['state']);
    assert.deepEqual({ degraded: queue.status().degraded, failed: queue.status().consecutiveFailedCycles, attempts: queue.status().attempts }, { degraded: false, failed: 0, attempts: 2 });
  });

  test('the retry carries the newest state if one arrived during the failed write', async () => {
    let attempt = 0;
    const written = [];
    const queue = createWriteQueue({
      write: async (value, seq) => {
        attempt += 1;
        if (attempt === 1) {
          await pause(10);
          throw new Error('transient');
        }
        written.push([value, seq]);
      },
    });

    queue.enqueue('first');
    await pause(1);
    queue.enqueue('second');
    await queue.flush();

    assert.deepEqual(written, [['second', 2]]);
  });

  test('repeated failures mark the queue degraded until a write succeeds', async () => {
    let failing = true;
    const statuses = [];
    const queue = createWriteQueue({
      write: async () => {
        if (failing) throw new Error('disk full');
      },
      onStatusChange: (status) => statuses.push(status.degraded),
    });

    queue.enqueue('a');
    await queue.flush();
    assert.equal(queue.status().degraded, false, 'one failed cycle is not yet degraded');

    queue.enqueue('b');
    await queue.flush();
    assert.equal(queue.status().degraded, true);

    failing = false;
    queue.enqueue('c');
    await queue.flush();
    assert.equal(queue.status().degraded, false);
    assert.equal(queue.status().committedSeq, 3);
    assert.deepEqual(statuses, [false, true, false]);
  });

  test('a disabled queue writes nothing', async () => {
    const written = [];
    const queue = createWriteQueue({ write: async (value) => void written.push(value) });
    queue.disable();
    queue.enqueue('ignored');
    await queue.flush();
    assert.deepEqual(written, []);
  });
});
