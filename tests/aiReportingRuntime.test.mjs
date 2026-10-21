import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { registerHooks } from 'node:module';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { fixture } from './support/talkItOutBoundary.mjs';
import { supabaseConfig } from '../src/config/supabase.ts';
import { createAiReportClient } from '../src/platform/aiResponseReporting.ts';
import { AUTH_REST_TIMEOUT_MS } from '../src/platform/timeoutFetch.ts';

const stub = new URL('./support/talkItOutBoundary.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/store/TalkItOutContext.tsx') &&
      /(?:AppStateProvider|accountRuntimeInstance|capture\/CaptureContext)$/.test(specifier)) return next(stub, context);
  return next(specifier, context);
} });
const { TalkItOutProvider, useTalkItOut } = await import('../src/store/TalkItOutContext.tsx');
const configBefore = { ...supabaseConfig };
after(() => Object.assign(supabaseConfig, configBefore));
beforeEach(() => {
  supabaseConfig.url = 'https://fhhudicklmpofuzkxeqe.supabase.co';
  supabaseConfig.anonKey = 'sb_publishable_local_test';
});
const receipt = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const input = { messageId: 'msg-1', reason: 'unsafe', dedupeKey: key };
const owner = () => ({ accountId: 'a', signal: new AbortController().signal });
const client = (getSession = async () => ({ data: { session: { user: { id: 'a' }, access_token: 'local-synthetic-token' } }, error: null })) =>
  createAiReportClient({ auth: { getSession } });
const accepted = () => Response.json({ status: 'received', receiptId: receipt });

test('shipping Talk It Out message IDs are accepted and only report metadata is transmitted', async t => {
  fixture.snapshot = { identity: { binding: { accountId: 'a', householdId: 'ha', boundAt: 't1' } }, state: { household: { id: 'ha' }, discovery: null } };
  let conversation;
  function Probe() { conversation = useTalkItOut(); return null; }
  const view = await render(<TalkItOutProvider><Probe /></TalkItOutProvider>);
  t.after(() => TestRenderer.act(() => view.unmount()));
  const message = conversation.messages.find(m => m.speaker === 'herkeys');
  assert.match(message.id, /^msg-\d+$/);
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { payload = JSON.parse(options.body); return accepted(); });
  assert.equal(await client().submit({ ...input, messageId: message.id, responseText: message.text }, owner()), 'received');
  assert.deepEqual(payload, { p_surface: 'talk_it_out', p_message_id: message.id, p_reason: 'unsafe', p_dedupe_key: key });
});

for (const body of [{ status: 'received' }, { status: 'received', receiptId: 'not-a-receipt' }]) {
  test('a success label without a valid durable receipt is never reported as submitted', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    assert.equal(await client().submit(input, owner()), 'unavailable');
  });
}

test('a pending report times out and remains recoverable without an account switch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
  });
  const pending = client().submit(input, owner());
  await new Promise(setImmediate);
  t.mock.timers.tick(AUTH_REST_TIMEOUT_MS + 1);
  assert.equal(signal.aborted, true, 'a hung transport must end without requiring the user to leave');
  assert.equal(await pending, 'unavailable');
});

test('an error and retry keep the same idempotency key and do not include message contents', async t => {
  const payloads = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    if (payloads.length === 1) throw new Error('synthetic offline');
    return accepted();
  });
  const reporter = client();
  assert.equal(await reporter.submit(input, owner()), 'unavailable');
  assert.equal(await reporter.submit(input, owner()), 'received');
  assert.deepEqual(payloads[0], payloads[1]);
});

test('a replacement account cannot submit the original account report', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => accepted());
  assert.equal(await client(async () => ({ data: { session: { user: { id: 'b' }, access_token: 'other-local-token' } }, error: null })).submit(input, owner()), 'unauthorized');
  assert.equal(fetch.mock.callCount(), 0);
});

test('the originating JWT is pinned even if the local session object changes before fetch', async t => {
  const session = { user: { id: 'a' }, access_token: 'local-synthetic-token' };
  let authorization;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    session.access_token = 'replacement-local-token';
    authorization = options.headers.Authorization;
    return accepted();
  });
  assert.equal(await client(async () => ({ data: { session }, error: null })).submit(input, owner()), 'received');
  assert.equal(authorization, 'Bearer local-synthetic-token');
});

test('cancelled ownership cannot send a report', async t => {
  const controller = new AbortController(); controller.abort();
  const fetch = t.mock.method(globalThis, 'fetch', async () => accepted());
  assert.equal(await client().submit(input, { accountId: 'a', signal: controller.signal }), 'unavailable');
  assert.equal(fetch.mock.callCount(), 0);
});

test('the server rate-limit outcome is recoverable and never shown as success', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'report_rate_limited' }, { status: 400 }));
  assert.equal(await client().submit(input, owner()), 'rate_limited');
});
