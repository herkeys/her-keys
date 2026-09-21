import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MAX_POSITION,
  MAX_STEPS_PER_SYSTEM,
  POSITION_STRIDE,
  initialPositions,
  layoutPositions,
} from '../../src/features/systems/commands/stepOrder.ts';

const slots = (...positions) => positions.map((position) => ({ position }));

/** Deterministic PRNG so a failure is reproducible from its seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const strictlyIncreasing = (values) => values.every((value, i) => i === 0 || value > values[i - 1]);
const inRange = (values) => values.every((p) => Number.isInteger(p) && p >= 0 && p <= MAX_POSITION);

/** The safety property the whole module exists for: every row that changes lands on a slot nobody held. */
function assertMoversLandOnFreeSlots(input, result, context) {
  const held = new Set(input.flatMap((slot) => (slot.position === null ? [] : [slot.position])));
  for (const index of result.changed) {
    assert.ok(!held.has(result.positions[index]), `${context}: row ${index} moved onto held slot ${result.positions[index]}`);
  }
}

describe('step positions — a reorder moves as few rows as it can, onto slots nobody holds', () => {
  test('a new system gets evenly spaced positions with room to move things later', () => {
    assert.deepEqual(initialPositions(4), [0, 10, 20, 30]);
    assert.deepEqual(initialPositions(0), []);
    assert.deepEqual(layoutPositions([]), { positions: [], changed: [] });
  });

  test('nothing changed: every row keeps its position', () => {
    assert.deepEqual(layoutPositions(slots(0, 10, 20)), { positions: [0, 10, 20], changed: [] });
  });

  test('moving the last step to the top changes exactly one row when there is room above the first', () => {
    const input = slots(30, 10, 20); // wanted order: C(30), A(10), B(20)
    const result = layoutPositions(input);
    assert.deepEqual(result.changed, [0]);
    assert.deepEqual(result.positions.slice(1), [10, 20]);
    assert.ok(strictlyIncreasing(result.positions) && result.positions[0] < 10);
    assertMoversLandOnFreeSlots(input, result, 'top-with-room');
  });

  test('a step that wants to go above the row at position 0 has no free integer — more rows move, none collide', () => {
    const input = slots(30, 0, 10);
    const result = layoutPositions(input);
    assert.ok(strictlyIncreasing(result.positions) && inRange(result.positions));
    assert.equal(result.changed.length, 2, 'the smallest feasible set of moves');
    assertMoversLandOnFreeSlots(input, result, 'top-without-room');
  });

  test('swapping two neighbours moves ONE row, into a slot the system does not already hold', () => {
    const input = slots(10, 0, 20); // B, A, C
    const result = layoutPositions(input);
    assert.deepEqual(result.changed, [1]);
    assert.ok(strictlyIncreasing(result.positions));
    assert.ok(result.positions[1] > 10 && result.positions[1] < 20);
    assertMoversLandOnFreeSlots(input, result, 'swap');
  });

  test('gap-free (dense) positions still never collide: rows move onto free slots, nothing is renumbered in place', () => {
    const input = slots(1, 0, 2); // dense, adjacent swap: the case a renumber would collide on
    const result = layoutPositions(input);
    assert.ok(strictlyIncreasing(result.positions) && inRange(result.positions));
    assertMoversLandOnFreeSlots(input, result, 'dense-swap');
    assert.ok(result.changed.length < 3, 'not everything has to move');
  });

  test('appending a step lands one stride after the last', () => {
    assert.deepEqual(layoutPositions([{ position: 0 }, { position: 10 }, { position: null }]), { positions: [0, 10, 20], changed: [2] });
  });

  test('appending near the ceiling stays in range', () => {
    const near = layoutPositions([{ position: 990 }, { position: null }]);
    assert.deepEqual(near.changed, [1]);
    assert.ok(near.positions[1] > 990 && near.positions[1] <= MAX_POSITION);

    const full = [{ position: 999 }, { position: null }];
    const packed = layoutPositions(full);
    assert.ok(strictlyIncreasing(packed.positions) && inRange(packed.positions), 'no slot after 999 exists, so the layout adapts');
    assertMoversLandOnFreeSlots(full, packed, 'ceiling');
  });

  test('a new step inserted between two rows goes between them and nothing else moves', () => {
    const result = layoutPositions([{ position: 0 }, { position: null }, { position: 10 }]);
    assert.deepEqual(result.changed, [1]);
    assert.ok(result.positions[1] > 0 && result.positions[1] < 10);
  });

  test('prepending a new step goes before the first row without moving it', () => {
    const result = layoutPositions([{ position: null }, { position: 20 }, { position: 30 }]);
    assert.deepEqual(result.changed, [0]);
    assert.deepEqual(result.positions.slice(1), [20, 30]);
    assert.ok(result.positions[0] >= 0 && result.positions[0] < 20);
  });

  test('the size cap is enforced, not silently exceeded', () => {
    assert.throws(() => layoutPositions(initialPositions(MAX_STEPS_PER_SYSTEM + 1).map((position) => ({ position }))), RangeError);
    const atCap = layoutPositions(initialPositions(MAX_STEPS_PER_SYSTEM).map((position) => ({ position })));
    assert.deepEqual(atCap.changed, []);
    assert.ok((MAX_STEPS_PER_SYSTEM - 1) * POSITION_STRIDE <= MAX_POSITION);
  });

  test('PROPERTY (seeded, 800 trials): valid layout; every mover lands on a free slot; an unchanged order changes nothing', () => {
    for (let seed = 1; seed <= 800; seed += 1) {
      const rand = mulberry32(seed);
      const existingCount = Math.floor(rand() * 40);
      const pool = new Set();
      // a mix of dense and sparse layouts, including ones that hug 0 and 999
      const dense = rand() < 0.4;
      while (pool.size < existingCount) pool.add(dense ? Math.floor(rand() * 60) : Math.floor(rand() * (MAX_POSITION + 1)));
      if (rand() < 0.15 && existingCount > 0) pool.add(0);
      if (rand() < 0.15 && existingCount > 0) pool.add(MAX_POSITION);
      const held = [...pool].sort((a, b) => a - b).slice(0, MAX_STEPS_PER_SYSTEM);

      const identity = held.map((position) => ({ position }));
      const unchanged = layoutPositions(identity);
      assert.deepEqual(unchanged.changed, [], `seed ${seed}: an unchanged order must change nothing`);

      const desired = held.map((position) => ({ position }));
      const swaps = Math.floor(rand() * 5);
      for (let s = 0; s < swaps && desired.length > 1; s += 1) {
        const i = Math.floor(rand() * desired.length);
        const j = Math.floor(rand() * desired.length);
        [desired[i], desired[j]] = [desired[j], desired[i]];
      }
      const newCount = Math.floor(rand() * 5);
      for (let n = 0; n < newCount && desired.length < MAX_STEPS_PER_SYSTEM; n += 1) {
        desired.splice(Math.floor(rand() * (desired.length + 1)), 0, { position: null });
      }

      const context = `seed ${seed}`;
      const result = layoutPositions(desired);
      assert.equal(result.positions.length, desired.length, context);
      assert.ok(strictlyIncreasing(result.positions), `${context}: not strictly increasing ${result.positions}`);
      assert.ok(inRange(result.positions), `${context}: out of range`);
      assertMoversLandOnFreeSlots(desired, result, context);
      desired.forEach((slot, i) => {
        if (!result.changed.includes(i)) assert.equal(result.positions[i], slot.position, `${context}: an unchanged row moved`);
      });
    }
  });
});
