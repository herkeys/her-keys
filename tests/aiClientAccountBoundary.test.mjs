import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/features/talk-it-out/engine.ts';
import { HER_KEYS_CONSENT_VERSIONS } from '../src/domain/consent.ts';
import { createHerKeysAiClient } from '../src/platform/herKeysAiClient.ts';

const oldGate = process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE;
after(() => {
  if (oldGate === undefined) delete process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE;
  else process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE = oldGate;
});
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const accountA = '00000000-0000-4000-8000-00000000000a';
const accountB = '00000000-0000-4000-8000-00000000000b';
const sessionFor = id => ({ user: { id }, access_token: 'synthetic-local-' + id });
const input = { state: createInitialState(), userText: 'Synthetic account A words', history: [] };
const validTurn = {
  messages: [{ speaker: 'herkeys', text: 'What feels most urgent?', stage: 'clarify' }],
  state: createInitialState(), quickReplies: [],
  meta: { provider: 'gemini', model: 'synthetic-local', requestId: 'local-test', latencyMs: 1 },
};

function harness({ gate = true } = {}) {
  process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE = String(gate);
  const controller = new AbortController();
  const consentStarted = deferred();
  const edgeStarted = deferred();
  const h = {
    session: sessionFor(accountA), requests: [], consentStarted, edgeStarted,
    receipt: [{ policy_version: HER_KEYS_CONSENT_VERSIONS.ai_processing, granted: true }],
    beforeSession: async () => {}, beforeConsent: async () => {}, beforeEdge: async () => {},
    afterConsent: false,
  };
  // Exercise the installed SDK's real JWT injection and serialization. Only
  // session storage and the final network transport are synthetic; no hosted
  // account, endpoint, provider or credential is involved.
  const sdk = createClient('https://herkeys-account-boundary.invalid', 'sb_publishable_local_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      init.signal?.throwIfAborted();
      const request = { url: new URL(url), authorization: new Headers(init.headers).get('Authorization'), body: init.body };
      h.requests.push(request);
      if (request.url.pathname === '/rest/v1/account_consents') {
        consentStarted.resolve();
        await h.beforeConsent();
        init.signal?.throwIfAborted();
        h.afterConsent = true;
        return Response.json(h.receipt);
      }
      assert.equal(request.url.pathname, '/functions/v1/herkeys-ai');
      edgeStarted.resolve();
      await h.beforeEdge();
      init.signal?.throwIfAborted();
      return Response.json(validTurn);
    } },
  });
  sdk.auth.getSession = async () => {
    await h.beforeSession();
    return { data: { session: h.session }, error: null };
  };
  return Object.assign(h, {
    owner: { accountId: accountA, signal: controller.signal }, controller,
    ai: createHerKeysAiClient(sdk),
    edgeRequests: () => h.requests.filter(r => r.url.pathname.startsWith('/functions/')),
  });
}

test('an account switch during consent preflight cannot send the old message', async () => {
  const h = harness();
  const release = deferred(); h.beforeConsent = () => release.promise;
  const pending = h.ai.advance(input, h.owner);
  await h.consentStarted.promise;
  h.session = sessionFor(accountB); h.controller.abort(); release.resolve();
  assert.notEqual((await pending).kind, 'ready');
  assert.equal(h.edgeRequests().length, 0);
});

test('the SDK cannot replace an already owned AI request with another account JWT', async () => {
  const h = harness();
  // Deliberately delay the store's abort notification: pinning still prevents
  // the SDK's asynchronous token lookup from sending A's content as B.
  h.beforeSession = async () => { if (h.afterConsent) h.session = sessionFor(accountB); };
  await h.ai.advance(input, h.owner);
  assert.equal(h.edgeRequests().length, 1);
  assert.equal(h.edgeRequests()[0].authorization, 'Bearer ' + sessionFor(accountA).access_token);
  assert.equal(h.requests[0].url.searchParams.get('account_id'), 'eq.' + accountA);
});

test('a mismatched bound account is refused before consent or content leaves the client', async () => {
  const h = harness(); h.session = sessionFor(accountB);
  assert.equal((await h.ai.advance(input, h.owner)).kind, 'unauthorized');
  assert.equal(h.requests.length, 0);
});

test('a session changed while its initial lookup waited is refused', async () => {
  const h = harness(); const started = deferred(); const release = deferred();
  h.beforeSession = async () => { started.resolve(); await release.promise; };
  const pending = h.ai.advance(input, h.owner);
  await started.promise; h.session = sessionFor(accountB); release.resolve();
  assert.equal((await pending).kind, 'unauthorized');
  assert.equal(h.requests.length, 0);
});

test('current ownership and affirmative consent preserve the structured positive path', async () => {
  const h = harness();
  assert.equal((await h.ai.advance(input, h.owner)).kind, 'ready');
  const edge = h.edgeRequests()[0];
  assert.deepEqual(JSON.parse(edge.body), input);
  assert.equal(edge.authorization, 'Bearer ' + sessionFor(accountA).access_token);
  assert.equal(Object.hasOwn(JSON.parse(edge.body), 'accountId'), false);
});

for (const receipt of [[], [{ policy_version: HER_KEYS_CONSENT_VERSIONS.ai_processing, granted: false }]]) {
  test('absent or declined consent sends no message with an active owner', async () => {
    const h = harness(); h.receipt = receipt;
    assert.equal((await h.ai.advance(input, h.owner)).reason, 'ai_processing_consent_required');
    assert.equal(h.edgeRequests().length, 0);
  });
}

test('a cancelled owner sends no request even with the client consent flag disabled', async () => {
  const h = harness({ gate: false }); h.controller.abort();
  assert.notEqual((await h.ai.advance(input, h.owner)).kind, 'ready');
  assert.equal(h.requests.length, 0);
});

test('disabling the optional client preflight never disables account and JWT pinning', async () => {
  const h = harness({ gate: false });
  assert.equal((await h.ai.advance(input, h.owner)).kind, 'ready');
  assert.equal(h.requests.length, 1);
  assert.equal(h.edgeRequests()[0].authorization, 'Bearer ' + sessionFor(accountA).access_token);
});

test('an owner cancelled after dispatch cannot receive a ready completion', async () => {
  const h = harness(); const release = deferred(); h.beforeEdge = () => release.promise;
  const pending = h.ai.advance(input, h.owner);
  await h.edgeStarted.promise; h.controller.abort(); release.resolve();
  assert.notEqual((await pending).kind, 'ready');
});

test('an unsigned local account preserves a local-only fallback without sending content', async () => {
  const h = harness(); h.session = null;
  assert.equal((await h.ai.advance(input, h.owner)).kind, 'unauthorized');
  assert.equal(h.requests.length, 0);
});
