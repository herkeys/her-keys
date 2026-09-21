/**
 * THE SYNC TRANSPORT BOUNDARY.
 *
 * Four operations, named in the schema's own terms. Everything above this line
 * is domain; everything below it is PostgREST. Injecting it is what lets the
 * scheduler be unit-tested with a fake and the seams that actually matter — CAS,
 * RLS, the barrier, the change log — be proven against a real local Postgres.
 *
 * A failure is CLASSIFIED here, because only the transport can tell "the server
 * said no" from "the server never answered", and everything upstream depends on
 * that difference: one is evidence, the other is a retry.
 */

export type FailureClass =
  /** Never reached the server, or the answer was lost. Retry with the same intent. */
  | 'unreachable'
  /** The session is gone or refused. Pause; do not burn attempts. */
  | 'unauthorized'
  /** RLS or a grant. Permanent until something else changes. */
  | 'forbidden'
  /** The server refused the content. Retrying sends the same content. */
  | 'validation'
  /** A uniqueness invariant that represents a competing decision, not malformed input. */
  | 'domainConflict'
  /** The server was reachable but broke. Retriable. */
  | 'serverError';

export interface TransportFailure {
  kind: 'failure';
  failure: FailureClass;
  detail: string;
  /** The SQLSTATE, where the database gave one. Diagnostic, never the sole classifier. */
  code: string | null;
}

export type CreateResult =
  | { kind: 'created'; cloudId: string; revision: number; localId: string }
  /** The SAME install already created it. A lost acknowledgement, not a duplicate. */
  | { kind: 'alreadyExists'; cloudId: string; revision: number; localId: string }
  /** A DIFFERENT install owns that local id. Two entities; the server minted a new identity. */
  | { kind: 'localIdCollision'; cloudId: string; revision: number; localId: string }
  | TransportFailure;

export type UpdateResult =
  | { kind: 'updated'; cloudId: string; revision: number }
  /** The base revision no longer matches. Her intent is intact and unapplied. */
  | { kind: 'stale'; cloudId: string }
  /** The row is gone from under us — only reachable for a kind with a tombstone. */
  | { kind: 'missing'; cloudId: string }
  | TransportFailure;

export interface ChangeRow {
  entityTable: string;
  entityId: string;
  op: 'upsert' | 'tombstone';
  rowRevision: number | null;
}

/**
 * `rows` is COMPLETE for the range `[cursor, nextCursor)`: the server has no limit and no page. It cannot be given one that
 * works, because the cursor is a transaction id and a claim writes a whole household in ONE transaction, so no row-count cut can
 * land between two of its rows. A caller that keeps only the first N of `rows` and stays at `cursor` reads the same N forever.
 */
export type PullResult =
  | { kind: 'pulled'; rows: ChangeRow[]; nextCursor: string }
  | TransportFailure;

export type FetchResult =
  | { kind: 'rows'; rows: Array<Record<string, unknown>> }
  | TransportFailure;

export interface SyncTransport {
  /** Create through `sync_push`, which is the only path that carries SD4-006 collision semantics. */
  create(table: string, deviceId: string, row: Record<string, unknown>): Promise<CreateResult>;
  /** CAS. `revision=eq.<base>` matching zero rows IS the stale answer. */
  update(
    table: string,
    cloudId: string,
    baseRevision: number,
    row: Record<string, unknown>,
    idColumn: string
  ): Promise<UpdateResult>;
  /**
   * The household is NAMED, never guessed: the server refuses one the caller does not belong to and
   * refuses an unnamed request when the caller belongs to several (private.resolve_household_context).
   */
  pull(cursor: string, householdId: string): Promise<PullResult>;
  fetchRows(table: string, cloudIds: readonly string[], idColumn: string): Promise<FetchResult>;
}

export function isFailure(result: { kind: string }): result is TransportFailure {
  return result.kind === 'failure';
}

/**
 * Whether the same work should be tried again unchanged.
 *
 * `unauthorized` is deliberately absent: it pauses the cycle rather than
 * consuming an attempt, because the work is fine and only the session is not.
 */
export function isRetriable(failure: FailureClass): boolean {
  return failure === 'unreachable' || failure === 'serverError';
}
