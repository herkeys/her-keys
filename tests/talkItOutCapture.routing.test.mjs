import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { conversationStarters, discoveryTopics } from '../src/data/seed/talkItOutScript.ts';
import { routeMessage } from '../src/features/talk-it-out/capture/routing.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import { read } from './support/capture.mjs';

/** Exactly what the Talk It Out context does: ask the reader, ask the conversation, apply the rule. */
function route(state, text) {
  const preview = read(text);
  const turn = advance(state, text);
  return routeMessage({
    stage: state.stage,
    hasWords: /[A-Za-z0-9]/.test(text),
    readerAvailable: true,
    recognized: preview.failure?.code !== 'nothing-recognized',
    conversationUnderstood: turn.messages[0]?.stage !== 'unmatched',
  });
}

const opened = () => advance(createInitialState(), 'I feel like I am always behind').state; // clarifying
const refining = () => advance(opened(), 'usually after I pick the kids up').state;
const resolved = () => advance(refining(), 'everything at once').state;

describe('routing rule: a free-typed message is a capture or part of the existing conversation', () => {
  test('the rule as a truth table', () => {
    const cases = [
      // stage, recognized, conversationUnderstood -> route
      ['listening', true, true, 'capture'],
      ['listening', true, false, 'capture'],
      ['listening', false, true, 'discovery'],
      ['listening', false, false, 'capture'], // nothing takes it: kept as an unread source, never dropped
      ['resolved', true, true, 'capture'],
      ['resolved', true, false, 'capture'],
      ['resolved', false, true, 'discovery'],
      ['resolved', false, false, 'discovery'],
      ['clarifying', true, true, 'discovery'], // she is answering the question on the table
      ['clarifying', true, false, 'capture'], // the conversation would say "I didn't catch that"
      ['clarifying', false, false, 'discovery'],
      ['clarifying', false, true, 'discovery'],
      ['refining', true, true, 'discovery'],
      ['refining', true, false, 'capture'],
      ['refining', false, false, 'discovery'],
    ];
    for (const [stage, recognized, conversationUnderstood, expected] of cases) {
      assert.equal(routeMessage({ stage, hasWords: true, readerAvailable: true, recognized, conversationUnderstood }), expected, `${stage} recognized=${recognized} understood=${conversationUnderstood}`);
    }
    for (const stage of ['listening', 'clarifying', 'refining', 'resolved']) {
      assert.equal(routeMessage({ stage, hasWords: true, readerAvailable: false, recognized: true, conversationUnderstood: false }), 'discovery', `${stage}: nothing can be captured before the household has loaded`);
      assert.equal(routeMessage({ stage, hasWords: false, readerAvailable: true, recognized: true, conversationUnderstood: false }), 'discovery', `${stage}: no words to go on is never captured`);
    }
  });

  test('at the start: an errand is captured, feelings that have a topic stay a conversation, and text nothing can take is kept rather than dropped', () => {
    const start = createInitialState();
    assert.equal(route(start, 'Dentist Friday at 3pm'), 'capture');
    assert.equal(route(start, 'I feel like I am always behind'), 'discovery', 'a topic the conversation has');
    assert.equal(route(start, 'The house is a mess'), 'discovery');
    // Neither the reader nor the four scripted topics understand these: they are kept as an unread source with an honest message.
    for (const text of ['I want mornings to feel less chaotic', 'asdf qwerty', 'hello there']) assert.equal(route(start, text), 'capture', text);
    assert.equal(route(start, 'He hit me again and I have to call the school'), 'capture', 'routed to the careful path, which reads nothing and keeps nothing');
  });

  test('existing input semantics: input with no words to go on opens nothing, is never kept as a source, and gets the conversation\'s own reply', () => {
    for (const text of ['!!!', '?', '😭😭', '...', '   !  ']) assert.equal(route(createInitialState(), text), 'discovery', JSON.stringify(text));
  });

  test('mid-conversation: her answer stays an answer; a real errand the conversation cannot take is captured', () => {
    assert.equal(route(opened(), 'usually after I pick the kids up'), 'discovery');
    assert.equal(route(opened(), 'blah blah'), 'discovery', 'unrecognised by both: the existing reply');
    assert.equal(route(opened(), 'Dentist Friday at 3pm'), 'capture');
    assert.equal(route(refining(), 'everything at once'), 'discovery');
    assert.equal(route(refining(), 'Call the school tomorrow'), 'capture');
  });

  test('after a conclusion: something to save is captured instead of answered with a scripted reply', () => {
    assert.equal(route(resolved(), 'Dentist Friday at 3pm'), 'capture');
    assert.equal(route(resolved(), 'thanks'), 'discovery');
  });

  test('the existing scripted conversation is untouched: every starter and every option, typed in her own words, still routes to discovery', () => {
    let checked = 0;
    for (const starter of conversationStarters) {
      assert.equal(route(createInitialState(), starter.label), 'discovery', `starter “${starter.label}”`);
      checked += 1;
      const opening = advance(createInitialState(), starter.label, starter.id).state;
      const topic = discoveryTopics.find((t) => t.id === starter.id);
      for (const first of topic.firstQuestion.options) {
        assert.equal(route(opening, first.label), 'discovery', `${starter.id} / “${first.label}”`);
        checked += 1;
        const second = advance(opening, first.label, first.id).state;
        for (const option of second.pendingQuestion.options) {
          assert.equal(route(second, option.label), 'discovery', `${starter.id} / ${first.id} / “${option.label}”`);
          checked += 1;
        }
      }
    }
    assert.ok(checked > 40, `${checked} scripted inputs checked`);
  });

  test('a message the conversation takes as a topic is never both: routing does not run the conversation and capture together', () => {
    const start = createInitialState();
    for (const text of ['I feel like I am always behind', 'The house is a mess', 'Dentist Friday at 3pm']) {
      const chosen = route(start, text);
      assert.ok(chosen === 'capture' || chosen === 'discovery');
    }
  });
});
