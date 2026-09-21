/**
 * THE ONE SYNC LINE, AS WORDS.
 *
 * `needsSyncAttention` is true for unresolved evidence OR for a backlog (the queue or the evidence store is full, and work
 * stops before intent is lost). The number it counts is unresolved evidence, so a backlog with none counted has no honest
 * number to state: it must not say "0 changes need your attention". Before the composed runtime queued her changes for
 * real (HA-001) that state could not occur in production; now it can.
 */
export function syncNoticeLine(count: number): string {
  if (count <= 0) return 'Some changes need your attention.';
  return count === 1 ? 'One change needs your attention.' : `${count} changes need your attention.`;
}
