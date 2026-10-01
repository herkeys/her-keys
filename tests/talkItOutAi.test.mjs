import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { createInitialState, advance } from '../src/features/talk-it-out/engine.ts';
import { parseHerKeysAiTurn } from '../src/features/talk-it-out/providerContract.ts';
import { isReplayableDiscoveryConversation } from '../src/domain/discovery.ts';
import { createHerKeysAiClient } from '../src/platform/herKeysAiClient.ts';

const read = (path) => readFileSync(path, 'utf8');

const validTurn = () => ({
  messages: [{ speaker: 'herkeys', text: 'What feels most urgent right now?', stage: 'clarify' }],
  state: {
    topicId: null,
    stage: 'listening',
    hypothesis: null,
    evidence: [],
    pendingQuestion: null,
    result: null,
  },
  quickReplies: [],
  meta: {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    requestId: 'request-1',
    latencyMs: 420,
  },
});

describe('Build 2 provider contract', () => {
  test('accepts only the normalized Talk It Out shape', () => {
    assert.ok(parseHerKeysAiTurn(validTurn()));

    const wrongStage = validTurn();
    wrongStage.state.stage = 'thinking';
    assert.equal(parseHerKeysAiTurn(wrongStage), null);

    const extra = validTurn();
    extra.toolCall = { name: 'save_task' };
    assert.equal(parseHerKeysAiTurn(extra), null);

    const tooLong = validTurn();
    tooLong.messages[0].text = 'x'.repeat(1201);
    assert.equal(parseHerKeysAiTurn(tooLong), null);
  });

  test('scripted discovery remains replayable while dynamic provider-only topics stay in memory', () => {
    let scripted = advance(createInitialState(), 'I am always behind');
    assert.equal(isReplayableDiscoveryConversation(scripted.state), true);

    scripted = advance(scripted.state, 'After school pickup');
    assert.equal(isReplayableDiscoveryConversation(scripted.state), true);

    const dynamic = {
      ...createInitialState(),
      topicId: 'work-boundaries',
      stage: 'clarifying',
      pendingQuestion: {
        id: 'work-1',
        text: 'Where does work spill over most?',
        options: [{ id: 'evening', label: 'Evening', keywords: ['evening'] }],
      },
    };
    assert.equal(isReplayableDiscoveryConversation(dynamic), false);
  });
});

describe('authenticated client boundary', () => {
  test('invokes only the Her Keys Edge Function and validates its response', async () => {
    globalThis.__DEV__ = false;
    let call;
    const client = createHerKeysAiClient({
      functions: {
        invoke: async (name, options) => {
          call = { name, options };
          return { data: validTurn(), error: null };
        },
      },
    });

    const input = {
      state: createInitialState(),
      userText: 'I do not know where to start.',
      history: [],
    };
    const result = await client.advance(input);

    assert.equal(call.name, 'herkeys-ai');
    assert.deepEqual(call.options.body, input);
    assert.equal(result.kind, 'ready');
    assert.equal(result.value.meta.provider, 'gemini');
  });

  test('maps auth, transport and malformed responses to safe client outcomes', async () => {
    globalThis.__DEV__ = false;

    const unauthorized = createHerKeysAiClient({
      functions: {
        invoke: async () => ({ data: null, error: { message: 'no', context: { status: 401 } } }),
      },
    });
    assert.deepEqual(await unauthorized.advance({ state: createInitialState(), userText: 'x', history: [] }), {
      kind: 'unauthorized',
    });

    const unavailable = createHerKeysAiClient({
      functions: {
        invoke: async () => {
          throw new Error('offline');
        },
      },
    });
    assert.equal((await unavailable.advance({ state: createInitialState(), userText: 'x', history: [] })).kind, 'unavailable');

    const malformed = createHerKeysAiClient({
      functions: {
        invoke: async () => ({ data: { messages: 'not-an-array' }, error: null }),
      },
    });
    assert.equal((await malformed.advance({ state: createInitialState(), userText: 'x', history: [] })).kind, 'invalid');
  });
});

describe('server-side Gemini architecture', () => {
  const edge = read('supabase/functions/herkeys-ai/index.ts');
  const client = read('src/platform/herKeysAiClient.ts');
  const context = read('src/store/TalkItOutContext.tsx');
  const config = read('supabase/config.toml');
  const app = read('app.json');

  test('the model credential and provider call exist only on the server path', () => {
    assert.match(edge, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
    assert.match(edge, /Deno\.env\.get\('GEMINI_MODEL'\)/);
    assert.match(edge, /generativelanguage\.googleapis\.com\/v1\/interactions/);
    for (const source of [client, context, app]) {
      assert.doesNotMatch(source, /GEMINI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com/);
    }
  });

  test('the Edge Function is authenticated at the gateway and in code', () => {
    assert.match(config, /\[functions\.herkeys-ai\][\s\S]*?verify_jwt\s*=\s*true/);
    assert.match(edge, /await requireUser\(req\)/);
  });

  test('Interactions API is stateless, structured and tool-free', () => {
    assert.match(edge, /response_format:\s*\{/);
    assert.match(edge, /mime_type:\s*'application\/json'/);
    assert.match(edge, /store:\s*false/);
    assert.doesNotMatch(edge, /previous_interaction_id\s*:/);
    assert.doesNotMatch(edge, /\btools\s*:/);
  });

  test('timeouts and transient retry are bounded', () => {
    assert.match(edge, /PROVIDER_DEADLINE_MS\s*=\s*12_000/);
    assert.match(edge, /for \(let attempt = 0; attempt < 2;/);
    assert.match(edge, /AbortSignal\.timeout/);
    for (const status of ['408', '429', '500', '502', '503', '504']) assert.match(edge, new RegExp(`\\b${status}\\b`));
  });

  test('provider output is treated as untrusted after HTTP success', () => {
    assert.match(edge, /ProviderTurnSchema\.safeParse/);
    assert.match(edge, /validTurn\(/);
    assert.match(edge, /ACTION_CLAIM_PATTERN/);
    assert.match(edge, /URL_PATTERN/);
    assert.match(edge, /function_call/);
    assert.match(edge, /schemaValidation:\s*'fail'/);
  });

  test('raw Talk It Out text is not logged by client context or server operations', () => {
    assert.doesNotMatch(context, /\bconsole\./);
    assert.doesNotMatch(edge, /console\.(?:info|log|warn|error)\([^\n]*(?:userText|history|rawText|providerInput|body)/);
    assert.match(edge, /logOperational/);
  });

  test('the deterministic engine is the explicit degraded path and duplicate submits are locked out', () => {
    assert.match(context, /const fallbackTurn = advance\(/);
    assert.match(context, /turn = fallbackTurn/);
    assert.match(context, /applyDiscoveryConversation\(state, ctx, turn\.state\)/);
    assert.match(context, /activeSubmissionRef\.current !== null/);
    assert.match(context, /quickReplies:\s*\[\]/);
  });
});

describe('Build 2 behavioral fixture coverage', () => {
  const fixture = JSON.parse(read('tests/fixtures/talkItOutAi.behavior.json'));
  const ids = fixture.cases.map((item) => item.id);

  test('covers every required behavior and failure family from the Build 2 brief', () => {
    assert.equal(fixture.cases.length, 20);
    for (const required of [
      'vague-opening',
      'household-overload',
      'kids-logistics',
      'money-concern',
      'work-concern',
      'home-management',
      'subject-change',
      'answer-mismatch',
      'little-context',
      'long-messy',
      'dont-know',
      'timeout',
      'rate-limit',
      'malformed-output',
      'provider-unavailable',
      'reopen-ai',
      'double-submit',
      'network-loss',
      'false-action-claim',
      'schema-violation',
    ]) {
      assert.ok(ids.includes(required), required);
    }
  });
});
