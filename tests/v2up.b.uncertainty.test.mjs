/**
 * V2UP-B - "I don't know yet" is an answer (HER_KEYS_PRODUCT.md section 6).
 *
 * Before: a clarifying question answered with "I don't know" got "I'm not sure I understood that yet. Pick one of these", i.e. she was
 * made to choose, and an opening "I don't know" was kept as an unread Life Inbox capture. Now the answer is honoured: nothing is recorded
 * as evidence, the theory is restated as still only a theory, and the same question stays open.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { conversationStarters, discoveryTopics, notSureOpeningReply, notSureQuestionReply, notSureQuestionReplyNoTheory, resolvedReply, unmatchedReply } from '../src/data/seed/talkItOutScript.ts';
import { advance, createInitialState, saysNotSure } from '../src/features/talk-it-out/engine.ts';
import { routeMessage } from '../src/features/talk-it-out/capture/routing.ts';

const SAYINGS = ["I don't know", 'I don’t know yet', 'I do not know', 'not sure', "I'm not sure", 'no idea', 'I have no idea', 'idk', 'Honestly I dunno', 'hard to say', "I can't really say", 'unsure'];

describe('what counts as "I do not know"', () => {
  test('short ways of saying it are recognised, apostrophes and punctuation included', () => {
    for (const text of SAYINGS) assert.equal(saysNotSure(text), true, text);
  });

  test('anything that says something else is not: answers, narrative and empty input keep their existing handling', () => {
    for (const text of ['After school pickup', 'dinner', '', '   ', '!!!', 'The mornings are rough because of the bus and the lunches and the shoes and the homework, and I do not know why it keeps happening to us']) {
      assert.equal(saysNotSure(text), false, JSON.stringify(text));
    }
  });
});

describe('at the start of the conversation', () => {
  test('"I don\'t know" opens no topic, invents no theory, and is not "unmatched"', () => {
    for (const text of SAYINGS) {
      const turn = advance(createInitialState(), text);
      assert.equal(turn.state.stage, 'listening', text);
      assert.equal(turn.state.topicId, null, text);
      assert.equal(turn.state.hypothesis, null, text);
      assert.deepEqual(turn.state.evidence, [], text);
      assert.equal(turn.messages.length, 1);
      assert.equal(turn.messages[0].stage, 'listen');
      assert.equal(turn.messages[0].text, notSureOpeningReply);
      assert.deepEqual(turn.quickReplies, conversationStarters);
    }
  });

  test('a message that DOES name something still opens its topic, even if it also says she is unsure', () => {
    const turn = advance(createInitialState(), "I don't know what's wrong, I'm just overwhelmed");
    assert.equal(turn.state.topicId, 'overload');
    assert.equal(turn.state.stage, 'clarifying');
  });

  test('routing: it stays in the conversation instead of being kept as an unread capture; before, nothing understood it and it was captured', () => {
    const before = routeMessage({ stage: 'listening', hasWords: true, readerAvailable: true, recognized: false, conversationUnderstood: false });
    assert.equal(before, 'capture', 'the old turn (stage unmatched) is what sent "I do not know" to the Life Inbox');
    const turn = advance(createInitialState(), "I don't know");
    const after = routeMessage({ stage: 'listening', hasWords: true, readerAvailable: true, recognized: false, conversationUnderstood: turn.messages[0]?.stage !== 'unmatched' });
    assert.equal(after, 'discovery');
  });
});

describe('to a question on the table', () => {
  const opened = advance(createInitialState(), 'I feel like I’m always behind');
  const refined = advance(opened.state, 'after school pickup');

  for (const [name, turn] of [['the first question', opened], ['the second question', refined]]) {
    test(`${name}: "I don't know" records nothing, keeps the question open, and states the theory as only a theory`, () => {
      assert.ok(turn.state.pendingQuestion);
      for (const text of SAYINGS) {
        const next = advance(turn.state, text);
        assert.deepEqual(next.state, turn.state, `${text}: the conversation did not move and no evidence was added`);
        assert.deepEqual(next.quickReplies, turn.state.pendingQuestion.options, 'the same choices stay available');
        assert.deepEqual(next.messages.map((m) => m.stage), ['listen', 'hypothesis', 'clarify']);
        assert.equal(next.messages[0].text, notSureQuestionReply);
        assert.equal(next.messages[1].text, turn.state.hypothesis.statement, 'the theory is shown as the theory it is');
        assert.equal(next.messages[1].confidence, 'possible', 'and never as more than possible');
        assert.equal(next.messages[2].text, turn.state.pendingQuestion.text, 'one question, asked again, not replaced');
        assert.ok(!next.messages.some((m) => m.stage === 'unmatched' || m.stage === 'result'));
      }
    });
  }

  test('she can still answer afterwards, and the answer counts as evidence only then', () => {
    const unsure = advance(opened.state, "I don't know");
    assert.equal(unsure.state.evidence.length, 0);
    const answered = advance(unsure.state, 'after school pickup');
    assert.equal(answered.state.stage, 'refining');
    assert.deepEqual(answered.state.evidence.map((e) => e.optionId), ['pickup']);
  });

  test('a real answer beats a hedge in the same message: "pickup, not sure about the rest" is still the pickup answer', () => {
    const next = advance(opened.state, 'after school pickup, not sure about the rest');
    assert.equal(next.state.stage, 'refining');
    assert.deepEqual(next.state.evidence.map((e) => e.optionId), ['pickup']);
  });

  test('a message that is neither an answer nor a hedge keeps the existing "I did not understand" handling', () => {
    const next = advance(opened.state, 'purple elephants');
    assert.equal(next.messages[0].stage, 'unmatched');
    assert.equal(next.messages[0].text, unmatchedReply);
  });

  test('no scripted question, in any topic, can be advanced by "I don\'t know": it never reaches a conclusion on its own', () => {
    let questions = 0;
    for (const topic of discoveryTopics) {
      const start = advance(createInitialState(), topic.keywords[0] ?? topic.id, topic.id);
      assert.equal(start.state.stage, 'clarifying', topic.id);
      const sure = advance(start.state, "I don't know");
      assert.equal(sure.state.stage, 'clarifying', topic.id);
      assert.deepEqual(sure.state.evidence, []);
      questions += 1;
      let second = 0;
      for (const option of topic.firstQuestion.options) {
        const refined = advance(start.state, option.label, option.id);
        if (refined.state.stage !== 'refining') continue;
        const again = advance(refined.state, 'not sure');
        assert.equal(again.state.stage, 'refining', `${topic.id}/${option.id}`);
        assert.equal(again.state.result, null, 'no conclusion is drawn from not knowing');
        assert.equal(again.state.evidence.length, refined.state.evidence.length);
        questions += 1;
        second += 1;
      }
      assert.ok(second > 0, `${topic.id}: its second question was exercised too`);
    }
    assert.ok(questions > discoveryTopics.length, `${questions} questions exercised`);
  });
});

describe('the words', () => {
  const FORBIDDEN = [
    [/!/, 'exclamation mark'],
    [/\p{Extended_Pictographic}/u, 'emoji'],
    [/don['’]t worry|no worries|it['’]s okay to|it['’]s ok to|be gentle|you deserve|take a breath|self-care/i, 'reassurance / therapy language'],
    [/amazing|awesome|oops|sorry|magic|journey/i, 'enthusiasm / cutesy'],
    [/\bAI\b|\bartificial\b|\bmodel\b|\bGemini\b|prototype/i, 'talking about the machinery'],
  ];

  test('the new replies pass the same tone audit as the capture copy, and the finished conversation no longer calls itself a prototype', () => {
    for (const text of [notSureOpeningReply, notSureQuestionReply, notSureQuestionReplyNoTheory, resolvedReply]) {
      for (const [pattern, label] of FORBIDDEN) assert.doesNotMatch(text, pattern, `“${text}” - ${label}`);
      assert.ok(text.length <= 240);
    }
    assert.match(notSureQuestionReply, /won’t guess/);
    assert.match(notSureQuestionReply, /only a theory/);
  });

  test('once the conversation is resolved, the reply points to Start over and a message after it changes nothing', () => {
    let turn = advance(createInitialState(), 'I feel like I’m always behind');
    turn = advance(turn.state, 'after school pickup');
    turn = advance(turn.state, 'everything at once');
    assert.equal(turn.state.stage, 'resolved');
    const after = advance(turn.state, 'hello again');
    assert.equal(after.messages[0].text, resolvedReply);
    assert.deepEqual(after.state, turn.state);
  });
});
