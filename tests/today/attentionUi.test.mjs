/**
 * TodayAttention / TodayHandled — render and interaction contract.
 *
 * What is provable here: each row says one specific, calm thing; the only actions are ones an existing domain
 * path supports; an approval is always explicit and never promises execution; a handled thing exists only when
 * the view model says so; nothing on these surfaces says "covered", "handled" or "will run" about something
 * that is not.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { addPerson, delegate } from '../../src/domain/responsibility.ts';
import { render } from '../support/render.tsx';
import { richHousehold } from '../support/richHousehold.mjs';
import { DAY, at, dense, ev, eventNamed, household, mkCtx, nyMs, taskNamed, tk, valid, view, withAction } from './fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { router } = await import('./support/expo-router-stub.mjs');
const { TodayAttention } = await import('../../src/features/today/TodayAttention.tsx');
const { TodayHandled } = await import('../../src/features/today/TodayHandled.tsx');

const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const labels = (r) => r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);

const spy = () => {
  const calls = { takeBack: [], decide: [] };
  return {
    calls,
    props: {
      onTakeBack: async (id) => { calls.takeBack.push(id); return true; },
      onDecide: async (id, d) => { calls.decide.push([id, d]); return true; },
      busy: false,
      note: null,
    },
  };
};

const delegated = () => {
  let s = household();
  s = ev(s, { title: 'School pickup', from: [15, 30], to: [16] });
  s = addPerson(s, mkCtx(nyMs(9)), { displayName: 'Grandma June', relationship: 'grandparent' });
  s = delegate(s, mkCtx(nyMs(12)), { about: { kind: 'event', id: eventNamed(s, 'School pickup').id }, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 30 });
  return valid(s);
};

describe('TodayAttention — an unanswered delegation', () => {
  const state = delegated();
  const v = view(state, nyMs(14));

  test('says one specific, calm sentence, names what is unresolved, and does not characterize anyone', async () => {
    const { props } = spy();
    const r = await render(<TodayAttention section={v.attention} {...props} />);
    assert.match(text(r.root), /NEEDS YOU/, 'status is a word, not only a color');
    assert.match(text(r.root), /Grandma June hasn’t answered your request about “School pickup”\. An answer was due by 12:30 PM\./);
    assert.doesNotMatch(text(r.root), /covered|handled|taken care|forgot|ignored|failed|irresponsible/i);
  });

  test('offers exactly two actions: take it back (hers to do) and open the item (to correct it)', async () => {
    const { props, calls } = spy();
    router.reset();
    const r = await render(<TodayAttention section={v.attention} {...props} />);
    assert.deepEqual(labels(r), ['Take it back', 'Open']);
    assert.equal(pressable(r.root, 'Take it back').props.accessibilityHint, 'Marks it as yours again. It doesn’t tell anyone.');
    await press(pressable(r.root, 'Take it back'));
    assert.deepEqual(calls.takeBack, [state.responsibilities[0].id]);
    await press(pressable(r.root, 'Open'));
    assert.equal(router.calls[0][0].pathname, '/event-editor');
  });

  test('while a change is saving, take-back cannot be tapped twice', async () => {
    const { props } = spy();
    const r = await render(<TodayAttention section={v.attention} {...props} busy />);
    assert.equal(pressable(r.root, 'Take it back').props.accessibilityState.disabled, true);
  });

  test('a failure to save says so and leaves everything as it was', async () => {
    const { props } = spy();
    const r = await render(<TodayAttention section={v.attention} {...props} note="Her Keys couldn’t save that yet. Nothing changed — try again." />);
    const alert = r.root.findAllByType('Text').find((t) => t.props.accessibilityRole === 'alert');
    assert.match(String(alert.props.children), /Nothing changed/);
  });
});

describe('TodayAttention — approvals are explicit, and never a promise', () => {
  const build = () => {
    const s = tk(household(), { title: 'Sign the permission form', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
    return withAction(s, { about: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id }, decide: null });
  };
  const state = build();
  const section = () => view(state, nyMs(11)).attention;
  const intentId = state.intents[0].id;

  test('a proposal is shown in the permanent “needs your yes” language, with both paths labelled', async () => {
    const { props } = spy();
    const r = await render(<TodayAttention section={section()} {...props} />);
    assert.match(text(r.root), /NEEDS YOUR YES/);
    assert.match(text(r.root), /Her Keys would like to set a reminder for “Sign the permission form”\./);
    assert.ok(labels(r).includes('Yes, go ahead') && labels(r).includes('No'));
  });

  test('“Yes” does not approve: it opens a confirmation that states the intent’s own consequence and reversibility', async () => {
    const { props, calls } = spy();
    const r = await render(<TodayAttention section={section()} {...props} />);
    await press(pressable(r.root, 'Yes, go ahead'));
    assert.equal(calls.decide.length, 0, 'nothing is decided by the first tap');
    assert.match(text(r.root), /Approve this\?/);
    assert.match(text(r.root), /If it went wrong, the impact would be low\./);
    assert.match(text(r.root), /It can be undone\./);
    assert.match(text(r.root), /Approving records your yes\./);
    assert.doesNotMatch(text(r.root), /will run|will send|will be|is done|scheduled/i, 'no promise that anything will happen');
  });

  test('confirming records her yes, once, through the existing decision path', async () => {
    const { props, calls } = spy();
    const r = await render(<TodayAttention section={section()} {...props} />);
    await press(pressable(r.root, 'Yes, go ahead'));
    await press(pressable(r.root, 'Yes, approve'));
    assert.deepEqual(calls.decide, [[intentId, 'approved']]);
    assert.doesNotMatch(text(r.root), /Approve this\?/, 'the confirmation closes');
  });

  test('“Not now” closes the confirmation and decides nothing', async () => {
    const { props, calls } = spy();
    const r = await render(<TodayAttention section={section()} {...props} />);
    await press(pressable(r.root, 'Yes, go ahead'));
    await press(pressable(r.root, 'Not now'));
    assert.equal(calls.decide.length, 0);
    assert.doesNotMatch(text(r.root), /Approve this\?/);
  });

  test('declining is her plain “No” and needs no confirmation', async () => {
    const { props, calls } = spy();
    const r = await render(<TodayAttention section={section()} {...props} />);
    await press(pressable(r.root, 'No'));
    assert.deepEqual(calls.decide, [[intentId, 'declined']]);
  });

  test('a higher-stakes, irreversible proposal says so — in its urgency and in the confirmation', async () => {
    const s = tk(household(), { title: 'Reply to the school office', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
    const msg = withAction(s, { about: { kind: 'task', id: taskNamed(s, 'Reply to the school office').id }, category: 'outbound_message', decide: null });
    const row = view(msg, nyMs(11)).attention.rows.find((r) => r.approval);
    assert.deepEqual([row.urgency, row.approval.phrase, row.approval.consequence, row.approval.reversibility], ['now', 'send a message', 'high', 'irreversible']);

    const { props } = spy();
    const r = await render(<TodayAttention section={view(msg, nyMs(11)).attention} {...props} />);
    await press(pressable(r.root, 'Yes, go ahead'));
    assert.match(text(r.root), /If it went wrong, the impact would be high\./);
    assert.match(text(r.root), /It can’t be undone\./);
  });
});

describe('TodayAttention — bounded at first glance', () => {
  test('rows beyond three are counted and one disclosure away', async () => {
    const v = view(dense(), nyMs(9));
    const { props } = spy();
    const r = await render(<TodayAttention section={v.attention} {...props} />);
    const more = pressable(r.root, `More that needs you, ${v.attention.moreRows.length}`);
    assert.ok(more, labels(r).join(' / '));
    assert.deepEqual(more.props.accessibilityState, { expanded: false });
    const statements = v.attention.rows.map((row) => row.statement);
    for (const statement of statements) assert.ok(text(r.root).includes(statement));
    assert.equal(text(r.root).includes(v.attention.moreRows[0].statement), false);
    await press(more);
    assert.ok(text(r.root).includes(v.attention.moreRows[0].statement));
  });
});

describe('TodayHandled — only what the household can prove', () => {
  test('a handled row is shown in the permanent action-state language: done, with the observed outcome, and nothing to press', async () => {
    const v = view(richHousehold({ withServerRows: true }).state, nyMs(11));
    const r = await render(<TodayHandled section={v.handled} />);
    assert.match(text(r.root), /HANDLED BY HER KEYS/);
    assert.match(text(r.root), /DONE — DELIVERED/);
    assert.match(text(r.root), /Reminder about “Sign the permission form”/);
    assert.deepEqual(labels(r), []);
  });

  test('the section does not exist for a day with no proof: there is nothing to render', () => {
    const v = view(richHousehold({ withServerRows: false }).state, nyMs(11));
    assert.equal(v.handled, null);
  });
});
