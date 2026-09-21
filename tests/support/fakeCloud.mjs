import { randomUUID } from 'node:crypto';

/**
 * A small in-memory cloud that behaves like the parts of the real server the sync composition depends on:
 *
 *   - create is idempotent on (household, local_id) for the SAME install, and a different install is a collision;
 *   - update is compare-and-set on `revision`; a stale base answers `stale`;
 *   - every write lands in a change log that a pull reads by cursor;
 *   - `onboarding_state` cannot be created through `sync_push` (the real allow-list refuses it) - it is only ever UPDATED;
 *   - bootstrap creates the account's starter rows, including that onboarding row, exactly as the real RPC does.
 *
 * It is NOT the real database - the real one is exercised by supabase/tests/sync-integration.mjs. It exists so the composition
 * can be attacked deterministically, including edits made while the network is busy (`hooks`), and lost acknowledgements.
 */
export function createFakeCloud() {
  const rows = new Map();
  const log = [];
  const calls = [];
  const state = { seq: 0, offline: false, loseNextAck: 0 };
  const hooks = {};
  const key = (table, id) => `${table}:${id}`;
  const touch = (table, id) => {
    state.seq += 1;
    log.push({ seq: state.seq, table, id });
  };
  const down = () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null });
  const idColumn = (table) => (table === 'onboarding_state' ? 'profile_id' : 'id');
  const byIdentity = (table, row) => [...rows.values()].find((r) => r._table === table && r.household_id === row.household_id && r.local_id === row.local_id);

  const transport = {
    async create(table, deviceId, row) {
      calls.push({ op: 'create', table, localId: row.local_id });
      await hooks.duringCreate?.(table, row);
      if (state.offline) return down();
      // A scripted refusal: the server will say no to this row every time (a content rule, not a network problem).
      const refusal = hooks.refuse?.(table, row);
      if (refusal) return refusal;
      if (table === 'onboarding_state') {
        return { kind: 'failure', failure: 'validation', detail: 'sync_push: onboarding_state is not a pushable entity table', code: '22023' };
      }
      const existing = byIdentity(table, row);
      if (existing) {
        return existing.origin_device_id === deviceId
          ? { kind: 'alreadyExists', cloudId: existing.id, revision: existing.revision, localId: existing.local_id }
          : { kind: 'localIdCollision', cloudId: existing.id, revision: existing.revision, localId: `${existing.local_id}-x` };
      }
      const id = randomUUID();
      const stored = { ...row, id, revision: 1, origin_device_id: deviceId, created_at: new Date(1_700_000_000_000 + state.seq * 1000).toISOString(), _table: table };
      rows.set(key(table, id), stored);
      touch(table, id);
      if (state.loseNextAck > 0) {
        state.loseNextAck -= 1;
        return down();
      }
      return { kind: 'created', cloudId: id, revision: 1, localId: row.local_id };
    },

    async update(table, cloudId, baseRevision, patch, column) {
      calls.push({ op: 'update', table, cloudId, baseRevision, patch });
      await hooks.duringUpdate?.(table, cloudId, patch);
      if (state.offline) return down();
      const found = [...rows.values()].find((r) => r._table === table && String(r[column ?? idColumn(table)]) === cloudId);
      if (!found || found.revision !== baseRevision) return { kind: 'stale', cloudId };
      Object.assign(found, patch, { revision: found.revision + 1 });
      touch(table, found[idColumn(table)]);
      if (state.loseNextAck > 0) {
        state.loseNextAck -= 1;
        return down();
      }
      return { kind: 'updated', cloudId, revision: found.revision };
    },

    async pull(cursor) {
      calls.push({ op: 'pull', cursor });
      await hooks.duringPull?.(cursor);
      if (state.offline) return down();
      const seen = new Set();
      const entries = [];
      for (const entry of log.filter((e) => e.seq > Number(cursor))) {
        const k = key(entry.table, entry.id);
        if (seen.has(k)) continue;
        seen.add(k);
        entries.push({ entityTable: entry.table, entityId: String(entry.id), op: 'upsert', rowRevision: rows.get(k)?.revision ?? null });
      }
      return { kind: 'pulled', rows: entries, nextCursor: String(state.seq) };
    },

    async fetchRows(table, ids, column) {
      calls.push({ op: 'fetchRows', table, count: ids.length });
      await hooks.duringFetch?.(table, ids);
      if (state.offline) return down();
      const wanted = new Set(ids.map(String));
      return { kind: 'rows', rows: [...rows.values()].filter((r) => r._table === table && wanted.has(String(r[column ?? idColumn(table)]))).map((r) => ({ ...r })) };
    },
  };

  return {
    transport,
    rows,
    log,
    calls,
    hooks,
    state,
    /** Rows of one table, as the cloud holds them. */
    table: (name) => [...rows.values()].filter((r) => r._table === name),
    /** A row another device or the server wrote. */
    seedRow(table, row) {
      const id = row.id ?? randomUUID();
      // onboarding_state has no surrogate key: its identity, and the change log's entity id, is the profile.
      const logId = table === 'onboarding_state' ? row.profile_id : id;
      rows.set(key(table, logId), { revision: 1, created_at: new Date(1_700_000_000_000 + state.seq * 1000).toISOString(), ...row, id, _table: table });
      touch(table, logId);
      return logId;
    },
    /** A concurrent edit by ANOTHER device to a row this one also holds. */
    editRow(table, id, patch) {
      const row = rows.get(key(table, id));
      Object.assign(row, patch, { revision: row.revision + 1 });
      touch(table, id);
    },
    /** What the real bootstrap_account does for a new account: the household's starter rows, including onboarding_state. */
    bootstrap({ householdId, accountId, memberId, categories, userLocalId = 'user-1' }) {
      const ids = { household: householdId, member: memberId ?? randomUUID(), categories: {}, onboarding: accountId };
      for (const c of categories) {
        this.seedRow('household_categories', {
          id: c.cloudId, household_id: householdId, local_id: c.localId, name: c.name, scope: c.scope, status: 'active',
          sort_order: c.sortOrder, system_role: c.systemRole, producer: 'system-derived',
        });
        ids.categories[c.localId] = c.cloudId;
      }
      this.seedRow('onboarding_state', {
        household_id: householdId, profile_id: accountId, goal_ids: [], strength_ids: [], struggle_ids: [], last_step: null, completed_at: null, scope: 'personal', producer: 'onboarding',
      });
      void userLocalId;
      return ids;
    },
  };
}
