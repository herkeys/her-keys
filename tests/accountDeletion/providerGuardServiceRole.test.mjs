/**
 * HK-V2ACT-GUARD-01 — the pending-deletion provider-write guard must work for the role that actually writes provider tables.
 *
 * `calendar_oauth_states`, `external_calendar_connections` and `apple_revocation_credentials` are written ONLY by Edge Functions as
 * `service_role`. Their BEFORE INSERT/UPDATE guard calls `private.account_is_active(...)`. `service_role` has no USAGE on schema
 * `private`, so an invoker-rights guard failed with "permission denied for schema private" on every legitimate write: Google Calendar
 * could not start consent (insert), complete it (update) or store a connection, for ACTIVE accounts.
 *
 * Least privilege: the guard function runs as its owner (SECURITY DEFINER, empty search_path). No schema, table or function grant is
 * added to service_role, and the guard itself is unchanged, so an account pending deletion is still refused.
 *
 * Disposable embedded PostgreSQL with the full migration chain; no hosted project.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { deletionDatabase } from '../../supabase/tests/deletion-database.mjs';

const ACTIVE = '11111111-1111-4111-8111-111111111111';
const PENDING = '22222222-2222-4222-8222-222222222222';
let db;

const asServiceRole = async (sql, params = []) => {
  await db.exec('SET ROLE service_role');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('RESET ROLE');
  }
};
const insertState = (user, hash) => asServiceRole(
  "insert into public.calendar_oauth_states(state_hash,user_id,code_verifier,redirect_uri,expires_at) values($1,$2,'v','https://cb.invalid',now()+interval '10 minutes')",
  [hash, user],
);
const connection = (user) => asServiceRole(
  "insert into public.external_calendar_connections(user_id,provider,scopes,refresh_token_ciphertext,refresh_token_iv) values($1,'google','{}','c','i')",
  [user],
);

describe('provider-write guard under the real writer role (HK-V2ACT-GUARD-01)', () => {
  before(async () => {
    db = await deletionDatabase();
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [ACTIVE, 'active@synthetic.invalid', PENDING, 'pending@synthetic.invalid']);
    // Mark one account as pending deletion (deactivated, inside its grace period) through the table the guard reads.
    await db.query("insert into public.account_deletion_requests(account_id,status,receipt_hash) values($1,'deactivated','synthetic-receipt-hash')", [PENDING]);
  });
  after(async () => { await db?.close(); });

  test('an ACTIVE account: service_role can start, complete and store a Google Calendar connection', async () => {
    await insertState(ACTIVE, 'state-active');
    await asServiceRole(
      "update public.calendar_oauth_states set completion_hash='h',authorization_code_ciphertext='c',authorization_code_iv='i',completion_expires_at=now()+interval '5 minutes' where state_hash='state-active'",
    );
    await connection(ACTIVE);
    const stored = await db.query('select count(*)::int as n from public.external_calendar_connections where user_id=$1', [ACTIVE]);
    assert.equal(stored.rows[0].n, 1);
  });

  test('an account PENDING deletion is still refused on every provider table (protection preserved)', async () => {
    await assert.rejects(insertState(PENDING, 'state-pending'), /account_deactivated/);
    await assert.rejects(connection(PENDING), /account_deactivated/);
  });

  test('least privilege: service_role gains no access to schema private or its functions', async () => {
    const usage = await db.query("select has_schema_privilege('service_role','private','USAGE') as u");
    assert.equal(usage.rows[0].u, false, 'no schema grant was added');
    const guard = await db.query("select prosecdef, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='refuse_pending_provider_write'");
    assert.equal(guard.rows[0].prosecdef, true, 'the guard runs as its owner');
    assert.deepEqual(guard.rows[0].proconfig, ['search_path=""'], 'with an empty search_path');
    for (const role of ['anon', 'authenticated']) {
      const exec = await db.query("select has_function_privilege($1,'private.refuse_pending_provider_write()','EXECUTE') as e", [role]);
      assert.equal(exec.rows[0].e, false, `${role} cannot call the guard directly`);
    }
  });
});
