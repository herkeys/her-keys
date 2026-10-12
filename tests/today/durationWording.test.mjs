/**
 * TODAY — a duration is worded as firmly as its own provenance allows (HA-010: DEFAULT != USER-PROVIDED).
 *
 * A number of minutes is not evidence that anyone said it. The repaired foundation records where a task's
 * `durationMinutes` came from (`durationSource`); Today's promise follows from it:
 *
 *   - a duration she gave keeps its plain wording ("It should take about 15 minutes.", "ABOUT 15 MINUTES");
 *   - one Her Keys INFERRED is quoted, but as Her Keys' estimate — never as hers;
 *   - a default and an unrecorded number are NOT quoted at all (HK13-D12: the One Move never tells her how long something
 *     will take on the strength of a planning default). The wording functions still know how to word them, as a safe fallback.
 *   - an explicit 15 and a default 15 are the same number and are NOT the same words.
 *
 * Recovered from validate/hk-ir01-f01 (IR7-F01 5e879bf) and RECONCILED with the Build 2A candidate, whose One Move selection
 * (the F01-F13 convergence) is stricter than the validation branch's: that branch worded a default as an estimate; the candidate
 * says nothing. The tests that pinned the older wording now pin the newer silence. What remains of the original repair, and is
 * not otherwise covered, is the inferred case and the wording functions themselves.
 *
 * Every task built through the shared `tk` helper without a stated source is `unrecorded` — that is what the foundation
 * makes of a bare number — so the "she gave it" cases below say so explicitly.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { render } from '../support/render.tsx';
import { demoState, onboardedState } from '../support/fixtures.mjs';
import { durationKnowledgeOf } from '../../src/domain/foundation/duration.ts';
import { oneMoveRecordId } from '../../src/domain/oneMove.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import { durationMeta, durationSentence } from '../../src/features/today/model/phrases.ts';
import { SYSTEM } from '../support/provenance.mjs';
import { DAY, ev, eventNamed, household, mkCtx, nyInstant, nyMs, strings, taskNamed, tk, valid, view, withMove } from './fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { OneMoveCard } = await import('../../src/features/one-move/OneMoveCard.tsx');

const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const last = (list) => list[list.length - 1];

/** A due-today task the One Move machinery chooses on stored evidence, so its reasons include the duration. `extra` states the source. */
const selected = (extra = {}, minutes = 15) =>
  view(withMove(valid(tk(household(), { title: 'File the insurance claim', minutes, due: DAY, plan: { kind: 'unplanned' }, category: 'cat-money', ...extra }))), nyMs(9)).oneMove;

/** What she has been told, everywhere the projection speaks, and on the card. */
const claimsHers = /you (said|told|entered|set|gave|estimated|chose|picked)|your (own )?(estimate|\d+ minutes?)/i;
/** Any quotation of a duration. */
const QUOTES_A_DURATION = /should take about|estimated about|ABOUT \d+ MINUTES/;

describe('the words themselves — one function, one answer per kind of knowledge', () => {
  test('only a duration she gave keeps the plain wording', () => {
    assert.equal(durationSentence(15, 'user-provided'), 'It should take about 15 minutes.');
    assert.equal(durationSentence(15, null), 'It should take about 15 minutes.', 'a number that is not a task’s duration (an event’s own length) is not a stand-in');
    assert.equal(durationMeta(15, 'user-provided'), 'ABOUT 15 MINUTES');
    assert.equal(durationMeta(15, null), 'ABOUT 15 MINUTES');
  });

  test('a default and an unrecorded number are estimates; an inferred one is Her Keys’ estimate', () => {
    assert.equal(durationSentence(15, 'default-estimate'), 'It should take about 15 minutes — that’s an estimate.');
    assert.equal(durationSentence(15, 'unrecorded'), 'It should take about 15 minutes — that’s an estimate.');
    assert.equal(durationSentence(15, 'inferred-estimate'), 'Her Keys estimated about 15 minutes.');
    for (const knowledge of ['default-estimate', 'unrecorded', 'inferred-estimate']) assert.equal(durationMeta(15, knowledge), 'ABOUT 15 MINUTES · ESTIMATE');
  });

  test('the sentence agrees in number, and no wording says the number is hers unless it is', () => {
    assert.equal(durationSentence(1, 'user-provided'), 'It should take about 1 minute.');
    assert.equal(durationSentence(1, 'default-estimate'), 'It should take about 1 minute — that’s an estimate.');
    for (const knowledge of ['default-estimate', 'unrecorded', 'inferred-estimate']) assert.doesNotMatch(durationSentence(15, knowledge), claimsHers);
  });
});

describe('an explicit 15 and a default 15 are the same number and different words', () => {
  test('through the One Move, from the same household: hers is quoted plainly, a default is not quoted at all', () => {
    const explicit = selected({ durationSource: 'user' });
    const defaulted = selected({ durationSource: 'default' });
    assert.equal(explicit.estimatedMinutes, 15);
    assert.equal(defaulted.estimatedMinutes, null, 'a planning default is never quoted back to her as how long it will take (HK13-D12)');
    assert.deepEqual([explicit.durationKnowledge, defaulted.durationKnowledge], ['user-provided', 'default-estimate'], 'the record of where it came from is still carried');
    assert.equal(last(explicit.why.reasons), 'It should take about 15 minutes.');
    assert.doesNotMatch(defaulted.why.reasons.join(' '), QUOTES_A_DURATION);
  });

  test('and a task added with NO duration — the real default path — is never quoted, so it is never worded as hers', () => {
    const s = addTask(household(), mkCtx(), { title: 'File the insurance claim', categoryId: 'cat-money', dueDate: DAY, plan: { kind: 'unplanned' }, scope: 'household' });
    const task = taskNamed(s, 'File the insurance claim');
    assert.deepEqual([task.durationMinutes, task.durationSource], [15, 'default'], 'the fixture is a real default');
    const m = view(withMove(valid(s)), nyMs(9)).oneMove;
    assert.equal(m.durationKnowledge, 'default-estimate');
    assert.equal(m.estimatedMinutes, null);
    assert.doesNotMatch(m.why.reasons.join(' '), QUOTES_A_DURATION);
  });

  test('on the card: hers reads plainly; an inferred one says it is an estimate, in the label and the reason; a default says no number', async () => {
    const shown = async (extra) => {
      const r = await render(<OneMoveCard section={selected(extra)} onComplete={() => {}} />);
      const first = text(r.root);
      await press(pressable(r.root, 'See why'));
      return { first, opened: text(r.root) };
    };
    const explicit = await shown({ durationSource: 'user' });
    assert.match(explicit.first, /ABOUT 15 MINUTES/);
    assert.doesNotMatch(explicit.first, /ESTIMATE/);
    assert.match(explicit.opened, /It should take about 15 minutes\./);
    assert.doesNotMatch(explicit.opened, /estimate/i);

    const inferred = await shown({ durationSource: 'inferred' });
    assert.match(inferred.first, /ABOUT 15 MINUTES · ESTIMATE/, 'the label says it is an estimate');
    assert.match(inferred.opened, /Her Keys estimated about 15 minutes\./, 'and so does the reason');

    const defaulted = await shown({ durationSource: 'default' });
    assert.doesNotMatch(defaulted.first, /ABOUT \d+ MINUTES/);
    assert.doesNotMatch(defaulted.opened, QUOTES_A_DURATION);
  });
});

describe('an unrecorded duration is never worded as hers', () => {
  test('a task saved without a stated source is unrecorded, and its number is not quoted', () => {
    const m = selected({}, 30);
    assert.equal(m.estimatedMinutes, null);
    assert.equal(m.durationKnowledge, 'unrecorded');
    assert.doesNotMatch(m.why.reasons.join(' '), QUOTES_A_DURATION);
  });

  test('a stored task with no source at all (a row from before the contract) reads the same', () => {
    const s = valid(tk(household(), { title: 'File the insurance claim', minutes: 30, due: DAY, plan: { kind: 'unplanned' } }));
    const legacy = { ...s, tasks: s.tasks.map(({ durationSource: _dropped, ...rest }) => rest) };
    assert.equal('durationSource' in legacy.tasks[0], false);
    assert.equal(durationKnowledgeOf(legacy.tasks[0]), 'unrecorded');
    const m = view(withMove(legacy), nyMs(9)).oneMove;
    assert.equal(m.durationKnowledge, 'unrecorded');
    assert.equal(m.estimatedMinutes, null);
    assert.doesNotMatch(m.why.reasons.join(' '), QUOTES_A_DURATION);
  });

  test('nothing the projection says, for any source but hers, claims she said it', async () => {
    for (const durationSource of [undefined, null, 'default', 'inferred']) {
      const m = selected(durationSource === undefined ? {} : { durationSource });
      for (const line of strings(m)) assert.doesNotMatch(line, claimsHers, `${String(durationSource)}: “${line}”`);
      const r = await render(<OneMoveCard section={m} onComplete={() => {}} />);
      await press(pressable(r.root, 'See why'));
      assert.doesNotMatch(text(r.root), claimsHers, `${String(durationSource)}: the card`);
      // Whatever is quoted at all is said to be an estimate; a source that is not hers is never quoted plainly.
      if (/ABOUT \d+ MINUTES|should take about|estimated about/.test(text(r.root))) assert.match(text(r.root), /ESTIMATE|estimate/, `${String(durationSource)}: a quoted number says it is an estimate`);
    }
  });

  test('an inferred duration — one Her Keys read from her words, or shortened on her approval — is Her Keys’ estimate', () => {
    const m = selected({ durationSource: 'inferred' });
    assert.equal(m.durationKnowledge, 'inferred-estimate');
    assert.equal(m.estimatedMinutes, 15, 'an inferred estimate IS quoted, because it is a real reading she approved');
    assert.equal(last(m.why.reasons), 'Her Keys estimated about 15 minutes.');
  });
});

describe('the wording follows the task’s own record, not the number', () => {
  const base = () => {
    const s = valid(tk(household(), { title: 'File the insurance claim', minutes: 15, due: DAY, plan: { kind: 'unplanned' }, durationSource: 'user' }));
    return { s, id: taskNamed(s, 'File the insurance claim').id };
  };
  const oneMoveOf = (s) => view(withMove(valid(s)), nyMs(9)).oneMove;
  const reasonFor = (s) => last(oneMoveOf(s).why.reasons);

  test('a number she gave, then changed without saying where it came from, is no longer quoted as hers', () => {
    const { s, id } = base();
    assert.equal(reasonFor(s), 'It should take about 15 minutes.');
    const changed = oneMoveOf(updateTask(s, mkCtx(), id, { durationMinutes: 25 }));
    assert.equal(changed.estimatedMinutes, null, 'the new number has no recorded origin, so it is not quoted');
    assert.doesNotMatch(changed.why.reasons.join(' '), QUOTES_A_DURATION);
  });

  test('a default she confirmed is hers again, and only because it was recorded as confirmed', () => {
    const { id, s } = base();
    const defaulted = updateTask(s, mkCtx(), id, { durationMinutes: 15, durationSource: 'default' });
    assert.equal(oneMoveOf(defaulted).estimatedMinutes, null);
    assert.equal(reasonFor(updateTask(defaulted, mkCtx(), id, { durationMinutes: 15, durationSource: 'user' })), 'It should take about 15 minutes.');
  });
});

describe('a number that is not a task’s duration keeps its plain wording', () => {
  const eventMove = () => {
    const s = ev(household(), { title: 'Parent conference', from: [16], to: [17] });
    return view(
      valid({ ...s, oneMoves: [{ id: oneMoveRecordId(DAY), forDate: DAY, targetId: eventNamed(s, 'Parent conference').id, targetType: 'event', status: 'selected', decidedAt: nyInstant(7), completedAt: null, provenance: SYSTEM, scope: 'personal' }] }),
      nyMs(9)
    ).oneMove;
  };

  test('an event’s own length is read from its start and end, which she gave', async () => {
    const m = eventMove();
    assert.equal(m.estimatedMinutes, 60);
    assert.equal(m.durationKnowledge, null);
    const r = await render(<OneMoveCard section={m} onComplete={() => {}} />);
    assert.match(text(r.root), /ABOUT 60 MINUTES/);
    assert.doesNotMatch(text(r.root), /ESTIMATE/);
  });

  test('a demo move is unchanged: its catalog minutes read plainly (a Needs Me item claims no minutes at all — see scenarios2)', async () => {
    const demo = view(onboardedState(demoState()), nyMs(9)).oneMove;
    assert.equal(demo.durationKnowledge, null);
    const r = await render(<OneMoveCard section={demo} onComplete={() => {}} />);
    assert.match(text(r.root), /ABOUT \d+ MINUTES/);
    assert.doesNotMatch(text(r.root), /ESTIMATE/);
  });
});

describe('the wording is said in one place', () => {
  const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('the duration sentence and the card’s label are built only in the feature’s phrases module', () => {
    const files = [
      ...readdirSync('src/features/today').filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/today/${f}`),
      ...readdirSync('src/features/today/model').filter((f) => f.endsWith('.ts')).map((f) => `src/features/today/model/${f}`),
      'src/features/one-move/OneMoveCard.tsx',
    ];
    const holders = files.filter((f) => /should take about|ABOUT \$\{|ABOUT \d/.test(strip(readFileSync(f, 'utf8'))));
    assert.deepEqual(holders, ['src/features/today/model/phrases.ts']);
  });
});
