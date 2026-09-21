/**
 * Step positions — the only place Feature 04 decides what number a step sits at.
 *
 * Why this is not "renumber 0..n-1 on every change" (MP-04): the cloud holds
 * `UNIQUE (system_id, position)` and the push engine sends ONE coalesced row at a time. Any swap or
 * rotation of two rows therefore collides on whichever row is pushed first, and the change is
 * filed as domain-conflict evidence instead of reaching the cloud. So a reorder must move as FEW
 * rows as possible, and every row that does move must land on a slot NOBODY currently holds —
 * then no push order can collide.
 *
 * Given the order she wants and the positions rows hold now:
 *   1. Choose the LARGEST set of existing rows that can stay exactly where they are, subject to
 *      one constraint: every row that has to move must still have a free integer to land on
 *      between its kept neighbours. (Rows already reading in ascending order are candidates.)
 *   2. Every other row (moved, or new) gets a position strictly between its kept neighbours,
 *      chosen from integers no current row holds.
 *
 * There is deliberately NO "renumber everything" path: with at most `MAX_STEPS_PER_SYSTEM` rows
 * and 1000 positions, a layout in which every row moves onto a free slot always exists, and it is
 * collision-safe where a renumber is not. Positions are 0..999 in state, in the integrity check
 * and in the cloud; nothing reads them except `stepsInOrder`, which sorts. They are never shown.
 */

export const POSITION_STRIDE = 10;
export const MIN_POSITION = 0;
export const MAX_POSITION = 999;
/** With stride 10 a fresh layout stays inside 0..999 (89 * 10 = 890) and leaves room to move things. */
export const MAX_STEPS_PER_SYSTEM = 90;

export interface OrderedSlot {
  /** The position the row holds now, or null for a step that does not exist yet. */
  position: number | null;
}

export interface LayoutResult {
  /** The final position for each input slot, in input order. Strictly increasing, unique, 0..999. */
  positions: number[];
  /** Indices whose position differs from what the slot held (a new step always counts). */
  changed: number[];
}

/** Positions for a brand-new system's steps: evenly spaced, with room to move things later. */
export const initialPositions = (count: number): number[] => Array.from({ length: count }, (_, index) => index * POSITION_STRIDE);

/** `count` values spread evenly across `free` (ascending). Caller guarantees `free.length >= count`. */
function spread(free: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_, i) => free[Math.floor(((i + 1) * free.length) / (count + 1))] ?? free[i]);
}

export function layoutPositions(slots: readonly OrderedSlot[]): LayoutResult {
  const n = slots.length;
  if (n > MAX_STEPS_PER_SYSTEM) throw new RangeError(`a system holds at most ${MAX_STEPS_PER_SYSTEM} steps`);
  if (n === 0) return { positions: [], changed: [] };

  const occupied = new Set(slots.flatMap((slot) => (slot.position === null ? [] : [slot.position])));

  // freeBefore[p] = how many unheld integers lie in [0, p), so any gap is counted in O(1).
  const freeBefore = new Array<number>(MAX_POSITION + 2).fill(0);
  for (let p = 0; p <= MAX_POSITION; p += 1) freeBefore[p + 1] = freeBefore[p] + (occupied.has(p) ? 0 : 1);
  /** Unheld integers strictly between a and b, clamped to 0..999. */
  const freeBetween = (a: number, b: number): number => {
    const from = Math.max(a + 1, MIN_POSITION);
    const to = Math.min(b, MAX_POSITION + 1); // exclusive
    return to > from ? freeBefore[to] - freeBefore[from] : 0;
  };

  // Index -1 is "before everything" (position -1); index n is "after everything" (position 1000).
  const at = (index: number): number => (index < 0 ? -1 : index >= n ? MAX_POSITION + 1 : (slots[index].position as number));
  const keepable = (index: number): boolean => index >= 0 && index < n && slots[index].position !== null;

  // dp[j + 1] = the most rows that can stay put among 0..j with j kept, every gap before j feasible.
  const best = new Array<number>(n + 2).fill(-1);
  const parent = new Array<number>(n + 2).fill(-2);
  best[0] = 0; // the start sentinel
  for (let j = 0; j <= n; j += 1) {
    if (j < n && !keepable(j)) continue;
    for (let i = -1; i < j; i += 1) {
      if (best[i + 1] < 0) continue;
      if (i >= 0 && !keepable(i)) continue;
      if (at(i) >= at(j)) continue; // kept rows must already read in ascending order
      if (j - i - 1 > freeBetween(at(i), at(j))) continue; // every mover between them needs a free slot
      const keptCount = best[i + 1] + (j < n ? 1 : 0);
      if (keptCount > best[j + 1]) {
        best[j + 1] = keptCount;
        parent[j + 1] = i;
      }
    }
  }
  // Someone always fits: with the end sentinel reachable from the start, all rows move onto free slots.
  const kept = new Set<number>();
  for (let cursor = parent[n + 1]; cursor >= 0; cursor = parent[cursor + 1]) kept.add(cursor);

  const positions = slots.map((slot, index) => (kept.has(index) ? (slot.position as number) : Number.NaN));

  let index = 0;
  while (index < n) {
    if (kept.has(index)) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < n && !kept.has(index)) index += 1;
    const count = index - start;
    const lo = start === 0 ? -1 : positions[start - 1];
    const hi = index === n ? MAX_POSITION + 1 : positions[index];

    const lower = Math.max(lo + 1, MIN_POSITION);
    const upper = Math.min(hi - 1, MAX_POSITION);
    const free: number[] = [];
    for (let p = lower; p <= upper; p += 1) if (!occupied.has(p)) free.push(p);

    let chosen: number[] | undefined;
    if (hi === MAX_POSITION + 1) {
      // Appending: stay close to the end, one stride apart.
      const wanted = Array.from({ length: count }, (_, i) => (lo < 0 ? 0 : lo) + POSITION_STRIDE * (i + (lo < 0 ? 0 : 1)));
      if (wanted.every((p) => p >= lower && p <= upper && !occupied.has(p))) chosen = wanted;
    } else if (lo < 0) {
      // Prepending: stay close to the first kept row.
      const wanted = Array.from({ length: count }, (_, i) => hi - POSITION_STRIDE * (count - i));
      if (wanted.every((p) => p >= lower && p <= upper && !occupied.has(p))) chosen = wanted;
    }
    chosen ??= spread(free, count);

    chosen.forEach((position, offset) => {
      positions[start + offset] = position;
      occupied.add(position);
    });
  }

  // The contract, checked rather than assumed: strictly increasing, unique, in range.
  for (let i = 0; i < n; i += 1) {
    const ok = Number.isInteger(positions[i]) && positions[i] >= MIN_POSITION && positions[i] <= MAX_POSITION && (i === 0 || positions[i] > positions[i - 1]);
    if (!ok) throw new Error(`step layout produced an invalid position at ${i}: ${positions.join(',')}`);
  }
  return { positions, changed: positions.flatMap((p, i) => (p === slots[i].position ? [] : [i])) };
}
