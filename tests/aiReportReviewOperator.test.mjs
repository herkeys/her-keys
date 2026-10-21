import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewerClient, run } from '../scripts-dev/ai-report-review.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const config = { environment: 'staging', accessToken: 'synthetic-local-token', publishableKey: 'sb_publishable_local_test' };

test('review CLI uses explicit environment, authenticated RPC and bounded metadata', async () => {
  let call;
  const client = createReviewerClient({ ...config, fetch: async (url, options) => { call = { url, options }; return Response.json([]); } });
  assert.equal((await client.list()).ok, true);
  assert.equal(call.url, 'https://fhhudicklmpofuzkxeqe.supabase.co/rest/v1/rpc/list_ai_response_reports');
  assert.equal(call.options.headers.Authorization, 'Bearer synthetic-local-token');
  assert.deepEqual(JSON.parse(call.options.body), { p_status: 'pending', p_limit: 50, p_after_created_at: null, p_after_id: null });
  assert.ok(call.options.signal);
});
test('the CLI submits compare-and-set disposition with no supplied reviewer identity', async () => {
  let body;
  const client = createReviewerClient({ ...config, fetch: async (_url, options) => { body = JSON.parse(options.body); return Response.json({ reviewStatus: 'resolved' }); } });
  await client.setStatus({ reportId: id, expectedStatus: 'reviewing', status: 'resolved' });
  assert.deepEqual(body, { p_report_id: id, p_expected_status: 'reviewing', p_status: 'resolved' });
});
test('unknown environment, missing credentials and invalid operations fail before transport', async () => {
  assert.throws(() => createReviewerClient({ ...config, environment: 'other' }), /configuration_required/);
  assert.throws(() => createReviewerClient({ ...config, accessToken: '' }), /configuration_required/);
  let calls = 0;
  const client = createReviewerClient({ ...config, fetch: async () => { calls++; return Response.json([]); } });
  assert.equal((await client.list({ limit: 101 })).ok, false);
  assert.equal((await client.setStatus({ reportId: id, expectedStatus: 'pending', status: 'delete' })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await run(['list', '--env', 'staging'], {})).error, 'review_configuration_required');
});
test('unexpected server errors cannot echo credentials or internals to the operator', async () => {
  const client = createReviewerClient({ ...config, fetch: async () => Response.json({ message: 'unexpected private diagnostic' }, { status: 500 }) });
  assert.deepEqual(await client.list(), { ok: false, error: 'review_unavailable' });
});
test('revocation and conflict outcomes stay explicit and never claim success', async () => {
  for (const message of ['reviewer_required', 'review_conflict']) {
    const client = createReviewerClient({ ...config, fetch: async () => Response.json({ message }, { status: 403 }) });
    assert.deepEqual(await client.list(), { ok: false, error: message });
  }
});
