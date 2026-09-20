import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateResult,
  FailureClass,
  FetchResult,
  PullResult,
  SyncTransport,
  TransportFailure,
  UpdateResult,
} from '../domain/sync/transport';

/**
 * The sync transport over PostgREST.
 *
 * Creates go through `sync_push`, which is the only path carrying SD4-006
 * collision semantics. Updates are ordinary conditional DML — `revision`
 * matching the base is the CAS, and zero rows back IS the stale answer. Pulls
 * use `sync_pull`, whose barrier is `pg_snapshot_xmin(pg_current_snapshot())`.
 *
 * Nothing here decides policy. It classifies what the server said and hands it
 * up, because only this layer can tell "the server refused" from "the server
 * never answered", and everything above depends on that difference.
 */
export function createSupabaseSyncTransport(client: SupabaseClient): SyncTransport {
  return {
    async create(table, deviceId, row) {
      try {
        const { data, error } = await client.rpc('sync_push', {
          p_entity_table: table,
          p_device_id: deviceId,
          p_row: row,
        });
        if (error) return failureFrom(error);

        const result = (data ?? {}) as Record<string, unknown>;
        const cloudId = String(result.cloud_id ?? '');
        const revision = typeof result.revision === 'number' ? result.revision : 1;
        const localId = String(result.local_id ?? '');
        const status = String(result.status ?? '');

        if (status === 'already_exists') return { kind: 'alreadyExists', cloudId, revision, localId };
        if (status === 'local_id_collision') return { kind: 'localIdCollision', cloudId, revision, localId };
        if (status === 'created' && cloudId !== '') return { kind: 'created', cloudId, revision, localId };
        return { kind: 'failure', failure: 'validation', detail: `sync_push answered ${status}`, code: null };
      } catch (thrown) {
        return unreachable(thrown);
      }
    },

    async update(table, cloudId, baseRevision, row, idColumn) {
      try {
        // `row` arrives already narrowed to the columns the UPDATE grant allows,
        // so nothing here can provoke a 42501 that would look like a permanent
        // refusal of an ordinary edit.
        const { data, error } = await client
          .from(table)
          .update(row)
          .eq(idColumn, cloudId)
          .eq('revision', baseRevision)
          .select('*');

        if (error) return failureFrom(error);

        const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          // Either the revision moved or the row is gone. Which one is a
          // question the caller does not need answered here: both mean "this
          // change was not applied", and the pull that follows settles it.
          return { kind: 'stale', cloudId };
        }
        return { kind: 'updated', cloudId, revision: Number(rows[0].revision ?? baseRevision + 1) };
      } catch (thrown) {
        return unreachable(thrown);
      }
    },

    async pull(cursor, limit) {
      try {
        const { data, error } = await client.rpc('sync_pull', { p_cursor: cursor });
        if (error) return failureFrom(error);

        const body = (data ?? {}) as Record<string, unknown>;
        const raw = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
        return {
          kind: 'pulled',
          // One extra row is requested implicitly by slicing above the limit in
          // the engine, which is how "there is more" is known without a count.
          rows: raw.slice(0, limit + 1).map((row) => ({
            entityTable: String(row.entity_table ?? ''),
            entityId: String(row.entity_id ?? ''),
            op: row.op === 'tombstone' ? ('tombstone' as const) : ('upsert' as const),
            rowRevision: typeof row.row_revision === 'number' ? row.row_revision : null,
          })),
          nextCursor: String(body.next_cursor ?? cursor),
        };
      } catch (thrown) {
        return unreachable(thrown);
      }
    },

    async fetchRows(table, cloudIds, idColumn) {
      if (cloudIds.length === 0) return { kind: 'rows', rows: [] };
      try {
        const { data, error } = await client.from(table).select('*').in(idColumn, [...cloudIds]);
        if (error) return failureFrom(error);
        return { kind: 'rows', rows: (data ?? []) as Array<Record<string, unknown>> };
      } catch (thrown) {
        return unreachable(thrown);
      }
    },
  };
}

/**
 * What the database actually said.
 *
 * SQLSTATE alone is not the classifier. `23505` is a uniqueness violation, but
 * whether that is malformed input or a competing valid decision depends on WHICH
 * invariant it was — the One Move day key is a domain conflict between two
 * devices, not a validation error, and treating it as one would hide a real
 * disagreement behind a generic failure.
 */
function failureFrom(error: PostgrestError): TransportFailure {
  const code = error.code ?? null;
  const detail = [error.message, error.details].filter(Boolean).join(' | ').slice(0, 400);

  if (!code) return { kind: 'failure', failure: 'unreachable', detail, code };
  if (code === '42501' || code === 'PGRST301' || code === '28000') {
    return { kind: 'failure', failure: code === '28000' ? 'unauthorized' : 'forbidden', detail, code };
  }
  if (code === '23505') {
    return { kind: 'failure', failure: isDomainInvariant(detail) ? 'domainConflict' : 'validation', detail, code };
  }
  if (code.startsWith('08') || code.startsWith('57') || code.startsWith('53')) {
    return { kind: 'failure', failure: 'serverError', detail, code };
  }
  return { kind: 'failure', failure: 'validation', detail, code };
}

/**
 * Uniqueness constraints that encode a competing product decision rather than
 * malformed data. The One Move day key is the one that matters: two devices can
 * both legitimately decide a move for the same logical day, and exactly one row
 * may survive (HR-03).
 */
const DOMAIN_INVARIANTS = [
  'one_move_records_household_profile_logical_day_key',
  'household_categories_household_id_sort_order_key',
  'household_categories_system_role_uq',
];

function isDomainInvariant(detail: string): boolean {
  return DOMAIN_INVARIANTS.some((name) => detail.includes(name));
}

function unreachable(thrown: unknown): TransportFailure & { kind: 'failure'; failure: FailureClass } {
  return {
    kind: 'failure',
    failure: 'unreachable',
    detail: thrown instanceof Error ? thrown.message : String(thrown),
    code: null,
  };
}

export type { CreateResult, FetchResult, PullResult, UpdateResult };
