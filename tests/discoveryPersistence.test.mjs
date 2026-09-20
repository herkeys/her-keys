import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { conversationStarters, discoveryTopics } from '../src/data/seed/talkItOutScript.ts';
import { applyDiscoveryConversation, clearDiscovery, replayDiscovery } from '../src/domain/discovery.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import { STORAGE_KEYS, ctx, demoState, harness, launch, onboardedState, stored } from './support/fixtures.mjs';

const record = (turn) => applyDiscoveryConversation(demoState(), ctx(), turn.state).discovery;

describe('Talk It Out persistence', () => {
  test('only the structure is stored — never her words, and never what Her Keys said', () => {
    let turn = advance(createInitialState(), 'Honestly I feel like I am always behind on everything');
    const opening = turn.messages.map((m) => m.text);
    turn = advance(turn.state, 'it usually falls apart after I pick the kids up from school');
    const state = applyDiscoveryConversation(demoState(), ctx(), turn.state);

    assert.deepEqual(state.discovery, {
      id: 'discovery-1',
      topicId: 'overload',
      answers: [{ questionId: 'overload-when', optionId: 'pickup' }],
      // demoState(): everything in a demo household is part of the rehearsal.
      provenance: { producer: 'demo-seed', artifactId: null, confidence: null },
      scope: 'personal',
    });

    const persisted = stored(state);
    for (const text of ['Honestly', 'falls apart', ...opening, ...turn.messages.map((m) => m.text), turn.state.hypothesis.statement, 'possible']) {
      assert.equal(persisted.includes(text), false, `stored: ${text}`);
    }
  });

  test('every conversation path replays to exactly the state the live conversation reached', () => {
    let checked = 0;
    const check = (turn, path) => {
      const replay = replayDiscovery(record(turn));
      assert.deepEqual(replay.conversation, turn.state, path);
      assert.deepEqual(replay.quickReplies, turn.quickReplies, path);
      checked++;
    };

    for (const starter of conversationStarters) {
      const opened = advance(createInitialState(), starter.label, starter.id);
      check(opened, starter.id);
      const topic = discoveryTopics.find((t) => t.id === starter.id);
      for (const first of topic.firstQuestion.options) {
        const refined = advance(opened.state, first.label, first.id);
        check(refined, `${starter.id}/${first.id}`);
        for (const second of refined.state.pendingQuestion.options) {
          check(advance(refined.state, second.label, second.id), `${starter.id}/${first.id}/${second.id}`);
        }
      }
    }

    assert.ok(checked > 41, `${checked} states`);
  });

  test('a rebuilt conversation shows her side as recalled answers, never as typed messages', () => {
    let turn = advance(createInitialState(), 'The house is a mess', 'household');
    const firstOption = turn.quickReplies[0];
    turn = advance(turn.state, firstOption.label, firstOption.id);
    const replay = replayDiscovery(record(turn));

    const hers = replay.messages.filter((m) => m.speaker === 'user');
    assert.deepEqual(hers.map((m) => m.recalled), ['topic', 'answer']);
    assert.equal(hers[1].text, firstOption.label);
    assert.ok(replay.messages.filter((m) => m.speaker === 'herkeys').every((m) => m.recalled === undefined));
  });

  test('messages that change nothing — unmatched, or after the conclusion — store nothing new', () => {
    const state = demoState();
    assert.equal(applyDiscoveryConversation(state, ctx(), advance(createInitialState(), '!!!').state), state);

    let turn = advance(createInitialState(), 'money', 'money');
    turn = advance(turn.state, turn.quickReplies[0].label, turn.quickReplies[0].id);
    turn = advance(turn.state, turn.quickReplies[0].label, turn.quickReplies[0].id);
    const concluded = applyDiscoveryConversation(state, ctx(), turn.state);
    assert.equal(applyDiscoveryConversation(concluded, ctx(), advance(turn.state, 'and another thing').state), concluded);
  });

  test('a record that no longer fits the script is refused rather than guessed at', () => {
    const base = { id: 'discovery-1', topicId: 'overload', answers: [], scope: 'personal' };
    assert.equal(replayDiscovery({ ...base, topicId: 'retired-topic' }), null);
    assert.equal(replayDiscovery({ ...base, answers: [{ questionId: 'overload-pickup-first', optionId: 'activities' }] }), null, 'answer out of order');
    assert.equal(replayDiscovery({ ...base, answers: [{ questionId: 'overload-when', optionId: 'constructor' }] }), null, 'unknown option');
  });

  test('the investigation resumes after a relaunch, and Start over clears it', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(onboardedState()) } });
    let store = await launch(h);
    const opened = advance(createInitialState(), 'Sundays are rough', 'weekend');
    store.dispatch((state, context) => applyDiscoveryConversation(state, context, opened.state));
    await store.flush();

    store = await launch(h);
    const replay = replayDiscovery(store.getSnapshot().state.discovery);
    assert.deepEqual([replay.conversation.topicId, replay.conversation.stage], ['weekend', 'clarifying']);

    store.dispatch((state) => clearDiscovery(state));
    await store.flush();
    store = await launch(h);
    assert.equal(store.getSnapshot().state.discovery, null);
  });
});
