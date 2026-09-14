import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { conversationStarters, discoveryTopics } from '../src/data/seed/talkItOutScript.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';

describe('Talk It Out conversation memory', () => {
  test('each free-text reply is read as an answer to the question on the table', () => {
    let turn = advance(createInitialState(), 'I feel like I’m always behind');
    assert.equal(turn.state.topicId, 'overload');
    assert.equal(turn.state.stage, 'clarifying');

    turn = advance(turn.state, 'usually after I pick the kids up');
    assert.equal(turn.state.stage, 'refining');
    assert.deepEqual(
      turn.state.evidence.map((e) => e.optionId),
      ['pickup']
    );

    turn = advance(turn.state, 'everything at once');
    assert.equal(turn.state.stage, 'resolved');
    assert.deepEqual(
      turn.state.evidence.map((e) => e.optionId),
      ['pickup', 'everything']
    );
    assert.equal(turn.messages[0].stage, 'result');
  });

  test('input with no words to go on does not open a topic', () => {
    for (const text of ['!!!', '?', '😭😭']) {
      const turn = advance(createInitialState(), text);
      assert.equal(turn.state.stage, 'listening', text);
      assert.equal(turn.messages[0].stage, 'unmatched', text);
    }
  });
});

// HK-AUDIT-010
describe('Talk It Out confidence', () => {
  test('a conversation on its own never concludes more than a possible pattern', () => {
    let conclusions = 0;

    for (const starter of conversationStarters) {
      const opened = advance(createInitialState(), starter.label, starter.id);
      assert.equal(opened.state.hypothesis?.confidence, 'possible', starter.id);

      const topic = discoveryTopics.find((t) => t.id === starter.id);
      for (const first of topic.firstQuestion.options) {
        const refined = advance(opened.state, first.label, first.id);
        assert.equal(refined.state.hypothesis?.confidence, 'possible', `${starter.id}/${first.id}`);

        for (const second of refined.state.pendingQuestion.options) {
          const concluded = advance(refined.state, second.label, second.id);
          const path = `${starter.id}/${first.id}/${second.id}`;
          assert.equal(concluded.state.stage, 'resolved', path);
          assert.equal(concluded.state.hypothesis?.confidence, 'possible', path);
          assert.equal(concluded.messages[0].confidenceLabel, 'Possible pattern', path);
          conclusions++;
        }
      }
    }

    assert.equal(conclusions, 41);
  });
});
