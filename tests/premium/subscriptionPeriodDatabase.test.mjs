import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionDatabase } from '../../supabase/tests/deletion-database.mjs';

// Real PostgreSQL execution in disposable PGlite. No hosted users or fabricated production transactions.
test('period migration preserves CAS, RLS, service-only writes and own-account projection reads', async () => {
  const db = await deletionDatabase();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`insert into auth.users(id) values ('${a}'),('${b}'); alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'; update public.premium_runtime_config set environment='staging',allow_test_fixtures=false;`);
    const fields = { source: 'reconcile', environment: 'SANDBOX', has_entitlement: true, expires_at: '2099-02-28T15:00:00Z', last_reconciled_at: new Date().toISOString(), period_type: 'TRIAL', period_started_at: '2099-01-31T15:00:00Z', trial_ends_at: '2099-02-28T15:00:00Z' };
    const apply = (version, f) => db.query('select public.premium_apply_projection($1,$2,$3) as result', [a,version,JSON.stringify(f)]);
    assert.equal((await apply(0,fields)).rows[0].result.applied,true);
    assert.equal((await apply(0,{...fields,period_type:'NORMAL'})).rows[0].result.applied,false);
    await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${a}"}',false);`);
    const own = (await db.query('select public.premium_my_entitlement() as result')).rows[0].result;
    assert.equal(own.state,'premium_active'); assert.equal(own.periodType,'TRIAL');
    assert.equal(Date.parse(own.trialEndsAt),Date.parse(fields.trial_ends_at));
    await assert.rejects(apply(1,fields),/permission denied/);
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${b}"}',false);`);
    const other = (await db.query('select public.premium_my_entitlement() as result')).rows[0].result;
    assert.equal(other.state,'unknown'); assert.equal(other.trialEndsAt,null);
    await db.exec('reset role;');
    assert.equal((await apply(1,{...fields,period_type:'NORMAL',trial_ends_at:fields.trial_ends_at})).rows[0].result.applied,true);
    const paid = (await db.query('select period_type,trial_ends_at from public.premium_entitlements where account_id=$1',[a])).rows[0];
    assert.equal(paid.period_type,'NORMAL'); assert.equal(paid.trial_ends_at,null);
    assert.equal((await apply(1,fields)).rows[0].result.applied,false,'stale compare-and-swap cannot resurrect trial facts');
  } finally { await db.close(); }
});
