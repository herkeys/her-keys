import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionDatabase as fullChainDatabase } from '../supabase/tests/deletion-database.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';
const key = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('AI report intake and restricted review execute on the complete disposable PostgreSQL chain', async t => {
  const db = await fullChainDatabase(); t.after(() => db.close());
  const q = (sql, args = []) => db.query(sql, args);
  // The shared disposable Auth fixture is deliberately minimal. Supply the
  // official server-owned Auth metadata column locally; no hosted user changes.
  await q("alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb");
  for (const id of [A, B, R]) await q('insert into auth.users(id,email) values($1,$2)', [id, id + '@local.test']);
  const as = async (actor, fn, claims = {}) => {
    await q('set role authenticated');
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ ...claims, sub: actor })]);
    try { return await fn(); } finally { await q('reset role'); }
  };
  const submit = (actor, n, reason = 'unsafe', message = 'msg-' + n) => as(actor, async () =>
    (await q("select public.submit_ai_response_report('talk_it_out',$1,$2,$3) as r", [message, reason, key(n)])).rows[0].r);
  const list = (actor, status = 'pending', limit = 50, at = null, id = null) => as(actor, async () =>
    (await q('select public.list_ai_response_reports($1,$2,$3,$4) as r', [status, limit, at, id])).rows[0].r);
  const review = (id, expected, status) => as(R, async () =>
    (await q('select public.review_ai_response_report($1,$2,$3) as r', [id, expected, status])).rows[0].r);
  const assign = enabled => q("update auth.users set raw_app_meta_data=jsonb_build_object('herkeys_ai_report_reviewer',$1::boolean) where id=$2", [enabled, R]);
  let first;

  await t.test('legitimate owner submission returns a durable receipt', async () => {
    first = await submit(A, 1);
    assert.equal(first.status, 'received');
    assert.equal((await q('select account_id,message_id from private.ai_response_reports where id=$1', [first.receiptId])).rows[0].account_id, A);
  });
  await t.test('duplicate delivery is durable and account separated', async () => {
    assert.deepEqual(await submit(A, 1), first);
    assert.notEqual((await submit(B, 1)).receiptId, first.receiptId);
    assert.equal((await q('select count(*) n from private.ai_response_reports')).rows[0].n, 2);
  });
  await t.test('invalid reasons and unbounded references are refused', async () => {
    await assert.rejects(submit(A, 2, 'invalid'), /invalid_report/);
    await assert.rejects(submit(A, 2, 'unsafe', 'x'.repeat(101)), /invalid_report/);
    await assert.rejects(submit(A, 2, 'unsafe', ''), /invalid_report/);
  });
  await t.test('the rolling limit permits five reports, rejects six and still acknowledges retries', async () => {
    for (let n = 2; n <= 5; n++) await submit(A, n);
    await assert.rejects(submit(A, 6), /report_rate_limited/);
    assert.deepEqual(await submit(A, 1), first);
  });
  await t.test('consumers cannot read or mutate any account report directly', async () => {
    for (const actor of [A, B]) {
      await assert.rejects(as(actor, () => q('select * from private.ai_response_reports')), /permission denied/);
      await assert.rejects(as(actor, () => q("update private.ai_response_reports set review_status='resolved' where id=$1", [first.receiptId])), /permission denied/);
      await assert.rejects(list(actor), /reviewer_required/);
    }
  });
  await t.test('forged reviewer claims do not grant reviewer authority', async () => {
    await assert.rejects(as(A, () => q('select public.list_ai_response_reports()'), { app_metadata: { herkeys_ai_report_reviewer: true }, user_metadata: { herkeys_ai_report_reviewer: true } }), /reviewer_required/);
  });
  await t.test('a server-assigned reviewer can see pending metadata and age without account details', async () => {
    await assign(true);
    const reports = await list(R);
    assert.equal(reports.length, 6);
    for (const report of reports) {
      assert.ok(Number(report.ageSeconds) >= 0);
      assert.equal(report.reviewStatus, 'pending');
      assert.equal(Object.hasOwn(report, 'accountId'), false);
      assert.equal(Object.hasOwn(report, 'text'), false);
    }
  });
  await t.test('queue pagination is bounded and stable', async () => {
    const page = await list(R, 'pending', 2);
    const cursor = page.at(-1);
    const rest = await list(R, 'pending', 100, cursor.createdAt, cursor.receiptId);
    assert.equal(rest.length, 4);
    assert.equal(rest.some(r => page.some(p => p.receiptId === r.receiptId)), false);
    await assert.rejects(list(R, 'pending', 101), /invalid_review_request/);
    await assert.rejects(list(R, 'pending', 50, cursor.createdAt), /invalid_review_request/);
  });
  await t.test('reviewing and resolved transitions record verified actor, status and timestamp', async () => {
    assert.equal((await review(first.receiptId, 'pending', 'reviewing')).replayed, false);
    await assert.rejects(review(first.receiptId, 'pending', 'resolved'), /review_conflict/);
    await review(first.receiptId, 'reviewing', 'resolved');
    const report = (await list(R, 'resolved'))[0];
    assert.deepEqual(report.history.map(h => [h.reviewerId, h.from, h.to]), [[R, 'pending', 'reviewing'], [R, 'reviewing', 'resolved']]);
    assert.ok(report.history.every(h => !Number.isNaN(Date.parse(h.at))));
  });
  await t.test('retries do not duplicate audit entries and resolved reports cannot reopen', async () => {
    assert.equal((await review(first.receiptId, 'reviewing', 'resolved')).replayed, true);
    assert.equal((await list(R, 'resolved'))[0].history.length, 2);
    await assert.rejects(review(first.receiptId, 'resolved', 'reviewing'), /invalid_review_request/);
  });
  await t.test('reviewer access can be revoked without waiting for an existing JWT to expire', async () => {
    await assign(false);
    await assert.rejects(as(R, () => q('select public.list_ai_response_reports()'), { app_metadata: { herkeys_ai_report_reviewer: true } }), /reviewer_required/);
    await assign(true);
  });
  await t.test('expired reports and their audit history are unavailable and expire together', async () => {
    await q("update private.ai_response_reports set expires_at=now()-interval '1 second' where id=$1", [first.receiptId]);
    assert.equal((await list(R, 'resolved')).length, 0);
    await assert.rejects(review(first.receiptId, 'resolved', 'resolved'), /report_unavailable/);
    await q('delete from private.ai_response_reports where expires_at < now()');
    assert.equal((await q('select count(*) n from private.ai_response_reports where id=$1', [first.receiptId])).rows[0].n, 0);
  });
  await t.test('anonymous callers cannot invoke intake or reviewer RPCs', async () => {
    await q('set role anon');
    try {
      await assert.rejects(q('select public.list_ai_response_reports()'), /permission denied/);
      await assert.rejects(q('select public.review_ai_response_report($1,$2,$3)', [first.receiptId, 'pending', 'resolved']), /permission denied/);
      await assert.rejects(q("select public.submit_ai_response_report('talk_it_out','msg-1','unsafe',$1)", [key(99)]), /permission denied/);
    } finally { await q('reset role'); }
  });
  await t.test('RLS stays enabled and forced; reviewer tokens have no direct table grants', async () => {
    const rows = (await q("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.ai_response_reports'::regclass")).rows;
    assert.deepEqual(rows, [{ relrowsecurity: true, relforcerowsecurity: true }]);
    await assert.rejects(as(R, () => q('select * from private.ai_response_reports')), /permission denied/);
  });
});
