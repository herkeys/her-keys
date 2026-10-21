import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { z } from 'zod';

// Execute the shipping Deno handler. Only network/auth/storage are replaced.
// These are deterministic handler tests, never evidence of live provider delivery.
const source = stripTypeScriptTypes(readFileSync('supabase/functions/herkeys-ai/index.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, ''));
const policy = 'ai-data-processing-initial-v1';
const state = () => ({ topicId: null, stage: 'listening', hypothesis: null, evidence: [], pendingQuestion: null, result: null });
const receipt = (granted, version = policy, account = 'account-a', time = 1) =>
  ({ account_id: account, consent_type: 'ai_processing', policy_version: version, granted, recorded_at: time });
const turn = () => ({ messages: [{ speaker: 'herkeys', text: 'Which ordinary task would help today?' }], state: state(), quickReplies: [] });
const response = (value = turn()) => Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] }] });

function harness({ receipts = [receipt(true)], readError = false, thrownRead = false, authorized = true, configured = true, provider = () => response() } = {}) {
  let handler;
  let now = 0;
  let calls = 0;
  const queries = [];
  const logs = [];
  class AuthError extends Error {}
  const sandbox = {
    z, AuthError, Response, Request, DOMException, AbortSignal, crypto,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { now += ms; fn(); },
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response('ok'),
    requireUser: async () => { if (!authorized) throw new AuthError('invalid'); return { id: 'account-a' }; },
    adminClient: () => ({ from: (table) => {
      const filters = [];
      const q = {
        select: () => q,
        eq: (k, v) => { filters.push([k, v]); return q; },
        order: () => q,
        limit: async () => {
          queries.push({ table, filters });
          if (thrownRead) throw new Error('ledger unavailable');
          return { data: readError ? null : receipts.filter(r => filters.every(([k,v]) => r[k] === v))
            .sort((a,b) => b.recorded_at - a.recorded_at).slice(0,1), error: readError ? { code: 'unreadable' } : null };
        },
      };
      return q;
    } }),
    Deno: { env: { get: key => key === 'GEMINI_API_KEY' && configured ? 'synthetic-provider-key' : undefined }, serve: fn => { handler = fn; } },
    fetch: async (url, init) => { calls++; return provider({ url, init, attempt: calls, advance: ms => { now += ms; } }); },
    console: { info: (...args) => logs.push(args.join(' ')) },
  };
  runInNewContext(source, sandbox);
  return {
    queries, logs, calls: () => calls,
    request: async (extra = {}) => {
      const res = await handler(new Request('https://synthetic.invalid/herkeys-ai', {
        method: 'POST', body: JSON.stringify({ state: state(), userText: 'Organize a synthetic shelf.', history: [], ...extra }),
      }));
      return { status: res.status, body: await res.json() };
    },
  };
}

for (const [label, receipts] of [
  ['absent', []],
  ['declined', [receipt(false)]],
  ['withdrawn', [receipt(true), receipt(false, policy, 'account-a', 2)]],
  ['outdated', [receipt(true, 'old-policy')]],
  ['wrong-account', [receipt(true, policy, 'account-b')]],
  ['wrong-type', [{ ...receipt(true), consent_type: 'privacy' }]],
]) test('server consent: ' + label + ' sends zero provider requests', async () => {
  const h = harness({ receipts });
  const result = await h.request();
  assert.equal(result.status, 403);
  assert.equal(result.body.reason, 'ai_processing_consent_required');
  assert.equal(h.calls(), 0);
  assert.match(h.logs.join(' '), /"providerInvoked":false/);
  assert.equal(h.queries[0].table, 'account_consents');
  assert.deepEqual(JSON.parse(JSON.stringify(h.queries[0].filters)), [['account_id','account-a'],['consent_type','ai_processing']]);
});

for (const thrownRead of [false, true]) test('unreadable consent fails closed (' + thrownRead + ')', async () => {
  const h = harness({ readError: true, thrownRead });
  assert.ok([403,500].includes((await h.request()).status));
  assert.equal(h.calls(), 0);
});

test('invalid/expired session fails before querying consent or sending content', async () => {
  const h = harness({ authorized: false });
  assert.equal((await h.request()).status, 401);
  assert.equal(h.queries.length, 0);
  assert.equal(h.calls(), 0);
});

test('client-supplied affirmative boolean cannot override a denial', async () => {
  const h = harness({ receipts: [receipt(false)] });
  assert.equal((await h.request({ consent: true, accountId: 'account-b' })).status, 403);
  assert.equal(h.calls(), 0);
});

test('current affirmative consent reaches the provider and validates the structured turn', async () => {
  const h = harness({ provider: ({ init }) => {
    const sent = JSON.parse(init.body);
    assert.equal(sent.store, false);
    assert.equal(sent.tools, undefined);
    return response();
  } });
  const result = await h.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.meta.provider, 'gemini');
  assert.equal(h.calls(), 1);
  const log = h.logs.join(' ');
  assert.doesNotMatch(log, /synthetic shelf|synthetic-provider-key|system_instruction/);
  assert.match(log, /"schemaValidation":"pass"/);
});

test('provider generation constraints agree with the mandatory confidence safety contract', async () => {
  const h = harness({ provider: ({ init }) => {
    const sent = JSON.parse(init.body);
    const schema = sent.response_format.schema;
    const message = schema.properties.messages.items.properties;
    const state = schema.properties.state.properties;
    assert.deepEqual(message.confidence.enum, ['possible']);
    assert.deepEqual(message.confidenceLabel.enum, ['Possible pattern']);
    assert.deepEqual(state.hypothesis.properties.confidence.enum, ['possible']);
    assert.deepEqual(state.result.properties.confidenceLabel.enum, ['Possible pattern']);
    assert.match(sent.system_instruction, /confidenceLabel.*Possible pattern/);
    return response();
  } });
  assert.equal((await h.request()).status, 200);
});

test('invalid confidence labels remain rejected and diagnostic logs contain only booleans', async () => {
  const h = harness({ provider: () => response({ ...turn(), messages: [{ speaker: 'herkeys', text: 'Synthetic private response', confidenceLabel: 'Low confidence' }] }) });
  assert.equal((await h.request()).status, 502);
  const log = h.logs.join(' ');
  assert.match(log, /"messageConfidence":false/);
  assert.doesNotMatch(log, /Synthetic private response|Low confidence|synthetic-provider-key|userText|system_instruction/);
});

test('provider outage retries once and returns an honest unavailable result', async () => {
  const h = harness({ provider: () => new Response('', { status: 503 }) });
  const result = await h.request();
  assert.equal(result.status, 502);
  assert.equal(result.body.reason, 'ai_service_unavailable');
  assert.equal(h.calls(), 2);
});

test('transient provider failure recovers in one bounded retry', async () => {
  const h = harness({ provider: ({ attempt }) => attempt === 1 ? new Response('', { status: 429 }) : response() });
  assert.equal((await h.request()).status, 200);
  assert.equal(h.calls(), 2);
});

test('provider timeouts exhaust the shared deadline and fail without a fabricated turn', async () => {
  const h = harness({ provider: ({ advance }) => { advance(8000); throw new DOMException('synthetic timeout', 'TimeoutError'); } });
  const result = await h.request();
  assert.equal(result.status, 504);
  assert.equal(result.body.reason, 'ai_service_timeout');
  assert.equal(result.body.messages, undefined);
  assert.equal(h.calls(), 2);
});

for (const [label, make] of [
  ['URL', () => ({ ...turn(), quickReplies: [{ id: 'a', label: 'https://unsafe.invalid', keywords: [] }] })],
  ['false action claim', () => ({ ...turn(), messages: [{ speaker: 'herkeys', text: 'I saved your task' }] })],
  ['unearned confidence', () => ({ ...turn(), messages: [{ speaker: 'herkeys', text: 'A guess', confidence: 'established' }] })],
  ['invented evidence', () => ({ ...turn(), state: { ...state(), topicId: 'new', evidence: [{ questionId: 'q', optionId: 'a', label: 'invented' }] } })],
]) test('untrusted provider output rejects ' + label, async () => {
  const h = harness({ provider: () => response(make()) });
  const result = await h.request();
  assert.equal(result.status, 502);
  assert.equal(result.body.reason, 'ai_response_invalid');
  assert.equal(result.body.messages, undefined);
});

