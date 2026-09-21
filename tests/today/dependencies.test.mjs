/**
 * TODAY — a dependency is a relationship with its own provenance (B4-FE01-017, read through B4-FE01-031).
 *
 * "The trip needs the form first" is a fact when she said so. When Her Keys inferred it and she has not confirmed it,
 * it is a possibility, and Today says "may need" — with the permanent unconfirmed badge, spoken as well as seen.
 * (Truth rule: possible is not established.) The same relation gives the One Move its context: what waits on the
 * target, and what it waits on — kept out of the reasons, because the stored decision did not cite it.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { render } from '../support/render.tsx';
import { demoState, onboardedState } from '../support/fixtures.mjs';
import { oneMoveRecordId } from '../../src/domain/oneMove.ts';
import { addDependency } from '../../src/domain/structure.ts';
import { SYSTEM } from '../support/provenance.mjs';
import { DAY, NEXT_DAY, at, ev, eventNamed, facet, household, mkCtx, nyInstant, nyMs, taskNamed, tk, valid, view } from './fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { TodayList } = await import('../../src/features/today/TodayList.tsx');
const { TodayMatters } = await import('../../src/features/today/TodayMatters.tsx');
const { OneMoveCard } = await import('../../src/features/one-move/OneMoveCard.tsx');

const UNCONFIRMED = Object.freeze({ producer: 'ai-inference', artifactId: null, confidence: 'possible' });
const UNCONFIRMED_SOURCE = { producer: 'ai-inference', confidence: 'possible', uncertain: true, userStated: false };

const T = (s, title) => ({ kind: 'task', id: taskNamed(s, title).id });
const E = (s, title) => ({ kind: 'event', id: eventNamed(s, title).id });

/** `from` requires `to`, as a row with the given provenance (stated by her unless said otherwise). */
function requires(state, from, to, provenance) {
  const result = addDependency(state, mkCtx(), { relation: 'requires', from, to, ...(provenance ? { provenance } : {}) });
  assert.equal(result.refusal, null, 'the fixture edge is accepted');
  return result.state;
}

/** Tomorrow's field trip, and the forms it needs. Nothing about the forms is on today's list, so they cannot crowd the day. */
function fieldTrip(forms) {
  let s = household();
  s = ev(s, { title: 'Field trip', from: [9], to: [12], day: 17 });
  for (const title of forms) s = tk(s, { title, minutes: 10, plan: { kind: 'unplanned' } });
  return s;
}

const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());

describe('Coming up — a dependency is said as strongly as its own provenance allows', () => {
  const upcoming = (s) => view(valid(s), nyMs(15)).upcoming;

  test('a requirement she stated is a fact: “needs”, and no badge', () => {
    let s = fieldTrip(['Sign the permission form']);
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    const u = upcoming(s);
    assert.equal(u.statement, '“Field trip” tomorrow at 9:00 AM needs “Sign the permission form” first.');
    assert.equal(u.source, null);
  });

  test('a requirement Her Keys inferred and she has not confirmed is a possibility: “may need”, with the unconfirmed badge', () => {
    let s = fieldTrip(['Sign the permission form']);
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'), UNCONFIRMED);
    const u = upcoming(s);
    assert.equal(u.statement, '“Field trip” tomorrow at 9:00 AM may need “Sign the permission form” first.');
    assert.deepEqual(u.source, UNCONFIRMED_SOURCE);
    assert.deepEqual(u.ref, T(s, 'Sign the permission form'), 'it still points at the thing to do, so she can check it');
    assert.doesNotMatch(u.statement, /\bneeds\b/);
  });

  test('a possibility is never folded into a fact’s count: “needs A and one more” counts only what she stated', () => {
    let s = fieldTrip(['Sign the permission form', 'Pack the lunch', 'Pay the fee']);
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    s = requires(s, E(s, 'Field trip'), T(s, 'Pack the lunch'));
    s = requires(s, E(s, 'Field trip'), T(s, 'Pay the fee'), UNCONFIRMED);
    const u = upcoming(s);
    assert.equal(u.statement, '“Field trip” tomorrow at 9:00 AM needs “Sign the permission form” and 1 more first.');
    assert.equal(u.source, null, 'the sentence rests only on what she stated');
  });

  test('a stated requirement is preferred to a possibility; the possibility is spoken of only when it is all there is', () => {
    let s = fieldTrip(['Pay the fee', 'Sign the permission form']);
    s = requires(s, E(s, 'Field trip'), T(s, 'Pay the fee'), UNCONFIRMED);
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    const u = upcoming(s);
    assert.match(u.statement, /needs “Sign the permission form” first\./);
    assert.equal(u.source, null);
    assert.deepEqual(u.ref, T(s, 'Sign the permission form'));
  });

  test('a task that is due tomorrow is spoken of the same way', () => {
    let s = tk(household(), { title: 'Submit the application', due: NEXT_DAY, plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Get the transcript', plan: { kind: 'unplanned' } });
    s = requires(s, T(s, 'Submit the application'), T(s, 'Get the transcript'), UNCONFIRMED);
    const u = upcoming(s);
    assert.equal(u.statement, '“Submit the application” is due tomorrow and may need “Get the transcript” first.');
    assert.deepEqual(u.source, UNCONFIRMED_SOURCE);
  });
});

describe('One Move — what it waits on and what waits on it, as context and not as a reason', () => {
  /** A selected One Move on the given row, stored exactly as the domain stores one. */
  const moveOn = (state, targetType, targetId) =>
    valid({
      ...state,
      oneMoves: [{ id: oneMoveRecordId(DAY), forDate: DAY, targetId, targetType, status: 'selected', decidedAt: nyInstant(7), completedAt: null, provenance: SYSTEM, scope: 'personal' }],
    });
  const moveView = (state, title) => view(moveOn(state, 'task', taskNamed(state, title).id), nyMs(9)).oneMove;

  test('a live commitment that requires the target is named, and only as context', () => {
    const plain = fieldTrip(['Sign the permission form']);
    const linked = requires(plain, E(plain, 'Field trip'), T(plain, 'Sign the permission form'));
    const m = moveView(linked, 'Sign the permission form');
    assert.deepEqual(m.why.context, ['“Field trip” needs it first.']);
    const without = moveView(plain, 'Sign the permission form');
    assert.deepEqual(without.why.context, []);
    assert.deepEqual([m.why.basis, m.why.reasons], [without.why.basis, without.why.reasons], 'the reasons are exactly what the stored decision supports — the relation adds none');
    assert.deepEqual(m.why.evidence, without.why.evidence);
  });

  test('what the target is itself still waiting on is named — and stops being named once it is done', () => {
    let s = tk(household(), { title: 'Book the venue', due: DAY });
    s = tk(s, { title: 'Get the quote', plan: { kind: 'unplanned' } });
    s = requires(s, T(s, 'Book the venue'), T(s, 'Get the quote'));
    assert.deepEqual(moveView(s, 'Book the venue').why.context, ['It needs “Get the quote” first.']);

    const done = { ...s, tasks: s.tasks.map((t) => (t.title === 'Get the quote' ? { ...t, status: 'completed', completedAt: nyInstant(8) } : t)) };
    assert.deepEqual(moveView(done, 'Book the venue').why.context, []);
  });

  test('a relationship Her Keys inferred is “may need”, in both directions', () => {
    let s = tk(household(), { title: 'Book the venue', due: DAY });
    s = tk(s, { title: 'Get the quote', plan: { kind: 'unplanned' } });
    s = ev(s, { title: 'Open house', from: [18], to: [19], day: 17 });
    s = requires(s, T(s, 'Book the venue'), T(s, 'Get the quote'), UNCONFIRMED);
    s = requires(s, E(s, 'Open house'), T(s, 'Book the venue'), UNCONFIRMED);
    assert.deepEqual(moveView(s, 'Book the venue').why.context, ['It may need “Get the quote” first.', '“Open house” may need it first.']);
  });

  test('several commitments wait on it: the count is of what she stated, and the verb agrees', () => {
    let s = tk(household(), { title: 'Sign the permission form', due: DAY });
    s = ev(s, { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = ev(s, { title: 'Museum visit', from: [13], to: [14], day: 17 });
    s = ev(s, { title: 'Picnic', from: [15], to: [16], day: 17 });
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    s = requires(s, E(s, 'Museum visit'), T(s, 'Sign the permission form'));
    s = requires(s, E(s, 'Picnic'), T(s, 'Sign the permission form'), UNCONFIRMED);
    assert.deepEqual(moveView(s, 'Sign the permission form').why.context, ['“Field trip” and 1 more need it first.']);
  });

  test('a commitment that is finished, dropped or removed is not waiting on anything', () => {
    let s = tk(household(), { title: 'Sign the permission form', due: DAY });
    s = tk(s, { title: 'Pay the fee', plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Pack the lunch', plan: { kind: 'unplanned' } });
    s = ev(s, { title: 'Field trip', from: [9], to: [12], day: 17 });
    s = requires(s, T(s, 'Pay the fee'), T(s, 'Sign the permission form'));
    s = requires(s, T(s, 'Pack the lunch'), T(s, 'Sign the permission form'));
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'));
    assert.deepEqual(moveView(s, 'Sign the permission form').why.context, ['“Pay the fee” and 2 more need it first.'], 'while all three are live, they are all waiting');
    const gone = {
      ...s,
      tasks: s.tasks.map((t) => (t.title === 'Pay the fee' ? { ...t, status: 'archived' } : t.title === 'Pack the lunch' ? { ...t, status: 'completed', completedAt: nyInstant(8) } : t)),
      events: s.events.map((e) => ({ ...e, status: 'removed' })),
    };
    assert.deepEqual(moveView(gone, 'Sign the permission form').why.context, [], 'dropped, finished and removed: none of them is waiting on anything');
  });

  test('a kind with no relation to read says nothing: a demo move invents no context', () => {
    const m = view(onboardedState(demoState()), nyMs(9)).oneMove;
    assert.deepEqual(m.why.context, []);
  });

  test('“Evidence and source” shows the context, in the card, one level down — and not at first glance', async () => {
    const plain = fieldTrip(['Sign the permission form']);
    const linked = requires(plain, E(plain, 'Field trip'), T(plain, 'Sign the permission form'));
    const r = await render(<OneMoveCard section={moveView(linked, 'Sign the permission form')} onComplete={() => {}} />);
    assert.doesNotMatch(text(r.root), /needs it first/);
    await press(pressable(r.root, 'See why'));
    assert.doesNotMatch(text(r.root), /needs it first/, 'it is not one of the reasons');
    await press(pressable(r.root, 'Evidence and source'));
    assert.match(text(r.root), /“Field trip” needs it first\./);

    const alone = await render(<OneMoveCard section={moveView(plain, 'Sign the permission form')} onComplete={() => {}} />);
    await press(pressable(alone.root, 'See why'));
    await press(pressable(alone.root, 'Evidence and source'));
    assert.doesNotMatch(text(alone.root), /first\./, 'no relation, no line');
  });
});

describe('an unconfirmed claim is spoken, not only seen', () => {
  test('“Coming up”: the row carries the badge and its accessible name says what the badge says', async () => {
    let s = fieldTrip(['Sign the permission form']);
    s = requires(s, E(s, 'Field trip'), T(s, 'Sign the permission form'), UNCONFIRMED);
    const u = view(valid(s), nyMs(15)).upcoming;
    const row = { key: 'upcoming', text: u.statement, source: u.source, onPress: () => {}, hint: 'Opens the thing to do first' };
    const r = await render(<TodayList title="Coming up" rows={[row]} />);
    assert.match(text(r.root), /POSSIBLE/);
    assert.equal(r.root.findByType('Pressable').props.accessibilityLabel, `${u.statement} Her Keys inferred this. Confidence: possible.`);
  });

  test('a stated row has no badge and its name is just its words', async () => {
    const r = await render(<TodayList title="Coming up" rows={[{ key: 'a', text: 'Something she said', source: null, onPress: () => {} }]} />);
    assert.doesNotMatch(text(r.root), /POSSIBLE|LIKELY/);
    assert.equal(r.root.findByType('Pressable').props.accessibilityLabel, 'Something she said');
  });

  test('“What matters”: a commitment Her Keys guessed at is a button that says so when read aloud', async () => {
    const s = valid(ev(household(), { title: 'Dentist', from: [17], to: [17, 30], provenance: { producer: 'import-sync', artifactId: null, confidence: 'likely' } }));
    const section = view(s, nyMs(9)).matters;
    const r = await render(<TodayMatters section={section} />);
    const label = r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel).find((l) => /^Dentist/.test(l));
    assert.match(label, /Confidence: likely/, 'a button’s own label would otherwise hide the badge from a screen reader');

    const stated = valid(ev(household(), { title: 'Recital', from: [17], to: [18] }));
    const plain = await render(<TodayMatters section={view(stated, nyMs(9)).matters} />);
    assert.doesNotMatch(plain.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel).join(' / '), /Confidence/);
  });
});
