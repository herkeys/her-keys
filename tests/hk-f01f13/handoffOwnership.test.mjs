/**
 * HK13-D35 (P3) — a co-parenting handoff is Co-Parent's row, and only Co-Parent edits it.
 *
 * Found in Phase 12: Kids' item editor and the Calendar's generic event form both edited ANY event, handoffs included. Moving a weekly
 * handoff there moved the event and left its recorded repeat behind, so Co-Parent then showed "Repeats every week on Tuesday. This is
 * the pattern you recorded." beside a handoff that now sat on Wednesday — while the very same move in Co-Parent re-anchors the
 * pattern (F07 `editHandoff`). F07's contract (HK-INT-COPARENT-KIDS-01) is that other features LINK into `life/coparent`.
 *
 * The repair: Calendar, Today and Kids open a handoff in Co-Parent; the two generic editors, reached any other way, show that the
 * handoff is kept there and hand over to Co-Parent's editor instead of editing it.
 */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import { isCoparentingHandoff } from '../../src/domain/handoffs.ts';
import { createHandoff, editHandoff, handoffRevision } from '../../src/features/coparent/mutations.ts';
import { addChildToHousehold, createChildEvent, editChildEvent, eventFingerprint } from '../../src/features/kids/mutations.ts';
import { describeRef, eventRouteFor } from '../../src/features/today/model/refs.ts';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { logicalDateAt } = await import('../../src/domain/logicalDay.ts');
await import('../today/support/stub-appstate.mjs');
await import('./support/stub-external-adapters.mjs'); // after stub-appstate: it builds on that react-native variant
const { router } = await import('./support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { EventForm } = await import('../../src/features/calendar/EventForm.tsx');
const { ChildDetailScreen, ItemEditorScreen } = await import('../../src/features/kids/containers.tsx');
const { CalendarScreen } = await import('../../src/features/calendar/CalendarScreen.tsx');

/** A household with a child, a WEEKLY co-parenting handoff (F07) and an ordinary child event (Kids). */
function household({ handoffDate = '2026-09-17', plainDate = '2026-09-18' } = {}) {
  let s = real();
  const kid = addChildToHousehold(s, at(), { displayName: 'Mia', birthDate: '2016-04-02' });
  s = kid.state;
  const handoff = createHandoff(s, at(), { childId: kid.childId, title: 'School pickup', date: handoffDate, startTime: '15:00', endTime: '15:30',
    location: 'School', notes: '', commitment: 'fixed', needsMe: true, repeat: 'weekly' }, { kind: 'new', displayName: 'Sam', relationship: 'co-parent' });
  assert.equal(handoff.outcome, 'saved');
  s = handoff.state;
  const practice = createChildEvent(s, at(), { childId: kid.childId, title: 'Soccer practice', date: plainDate, startText: '16:00', endText: '17:00',
    location: '', notes: '', commitment: 'fixed', handoffToPersonId: null });
  assert.equal(practice.outcome, 'created', `the ordinary child event saved: ${practice.outcome}`);
  s = practice.state;
  const plain = s.events.find((e) => e.title === 'Soccer practice');
  return { state: s, childId: kid.childId, handoffId: handoff.id, plainId: plain.id };
}

describe('[HK13-D35] a co-parenting handoff is edited in Co-Parent only', () => {
  after(() => router.reset());

  test('the rule it guards: the same move re-anchors the repeat in Co-Parent and would strand it in Kids', () => {
    const { state, childId, handoffId } = household();
    const event = state.events.find((e) => e.id === handoffId);
    const moved = { date: '2026-09-18', startTime: '16:00', endTime: '16:30' };
    const viaCoparent = editHandoff(state, at(), { eventId: handoffId, baseUpdatedAt: handoffRevision(state, event), fields: { childId, title: event.title, ...moved,
      location: 'School', notes: '', commitment: 'fixed', needsMe: true, repeat: 'weekly' } });
    const rule = (s) => s.recurrences.find((r) => r.about.id === handoffId && r.status !== 'ended');
    assert.deepEqual([rule(viaCoparent.state).byWeekday, rule(viaCoparent.state).anchorDate], [[5], '2026-09-18'], 'Co-Parent moves the pattern with the handoff');
    const viaKids = editChildEvent(state, at(), { eventId: handoffId, baseline: eventFingerprint(event), title: event.title, date: moved.date, startText: moved.startTime,
      endText: moved.endTime, location: 'School', notes: '', commitment: 'fixed', childId });
    assert.deepEqual([rule(viaKids.state).byWeekday, rule(viaKids.state).anchorDate], [[4], '2026-09-17'], 'a generic edit would leave the pattern on the old day');
  });

  test('which events are handoffs: only an event in the co-parenting category', () => {
    const { state, handoffId, plainId } = household();
    assert.equal(isCoparentingHandoff(state, handoffId), true);
    assert.equal(isCoparentingHandoff(state, plainId), false, 'a child\'s ordinary event is not');
    assert.equal(isCoparentingHandoff(state, 'evt-unknown'), false);
    assert.equal(isCoparentingHandoff({ ...state, categories: state.categories.filter((c) => c.systemRole !== 'coparenting') }, handoffId), false,
      'with no co-parenting category there is no handoff');
  });

  test('Today opens a handoff in Co-Parent and any other event in its editor', () => {
    const { state, handoffId, plainId } = household();
    assert.deepEqual(eventRouteFor(state, handoffId), { pathname: '/life/coparent', params: { mode: 'handoff', id: handoffId } });
    assert.deepEqual(eventRouteFor(state, plainId), { pathname: '/event-editor', params: { eventId: plainId } });
    assert.deepEqual(describeRef(state, { kind: 'event', id: handoffId }).route, { pathname: '/life/coparent', params: { mode: 'handoff', id: handoffId } });
  });

  async function mounted(element, state) {
    const store = await launch(harness({ mode: 'empty', initial: {} }));
    await store.commit(() => state);
    await store.flush();
    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<AppStateProvider store={store}>{element}</AppStateProvider>);
    });
    return {
      root: renderer.root,
      done: async () => { await store.flush(); await TestRenderer.act(async () => renderer.unmount()); },
    };
  }
  const labels = (root) => root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
  const inputs = (root) => root.findAllByType('TextInput').length;
  const texts = (root) => root.findAll((node) => typeof node.props?.children === 'string').map((node) => node.props.children);

  test('the Calendar\'s event form, opened for a handoff, edits nothing and hands over to Co-Parent\'s editor', async () => {
    const { state, handoffId, plainId } = household();
    router.reset();
    const view = await mounted(<EventForm eventId={handoffId} />, state);
    try {
      assert.ok(texts(view.root).includes('This handoff is kept in Co-parent logistics'));
      assert.equal(inputs(view.root), 0, 'no form: not one field to edit');
      assert.equal(labels(view.root).includes('Save changes'), false, 'and nothing to save');
      const open = view.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === 'Open in Co-parent logistics');
      await TestRenderer.act(async () => open.props.onPress());
      assert.deepEqual(router.calls.at(-1), ['replace', { pathname: '/life/coparent', params: { mode: 'edit-handoff', id: handoffId } }]);
    } finally {
      await view.done();
    }
    const other = await mounted(<EventForm eventId={plainId} />, state);
    try {
      assert.ok(labels(other.root).includes('Save changes') && inputs(other.root) > 0, 'any other event opens the ordinary form');
    } finally {
      await other.done();
    }
  });

  test('Kids\' item editor, opened for a handoff, edits nothing and hands over to Co-Parent', async () => {
    const { state, handoffId, plainId } = household();
    router.reset();
    router.params = { kind: 'event', id: handoffId };
    const view = await mounted(<ItemEditorScreen />, state);
    try {
      assert.ok(texts(view.root).includes('This handoff is kept in Co-parent logistics'));
      assert.equal(inputs(view.root), 0, 'no form: not one field to edit');
    } finally {
      await view.done();
    }
    router.params = { kind: 'event', id: plainId };
    const other = await mounted(<ItemEditorScreen />, state);
    try {
      assert.ok(inputs(other.root) > 0, 'a child\'s ordinary event opens the Kids editor');
    } finally {
      await other.done();
      router.reset();
    }
  });

  test('tapping the handoff on the Calendar opens it in Co-Parent; tapping another event opens the event form', async () => {
    // The Calendar opens on the store's day (the fixture's morning, 2026-09-16): both events are that day.
    const { state, handoffId, plainId } = household({ handoffDate: '2026-09-16', plainDate: '2026-09-16' });
    router.reset();
    const view = await mounted(<CalendarScreen />, state);
    try {
      // The row itself is labelled with its title first ("School pickup. 3:00–3:30 PM · …"); other controls only mention it.
      const row = (title) => view.root.findAllByType('Pressable').find((p) => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.startsWith(`${title}.`));
      assert.ok(row('School pickup') && row('Soccer practice'), `both events are on the day: ${labels(view.root).join(' | ')}`);
      await TestRenderer.act(async () => row('School pickup').props.onPress());
      assert.deepEqual(router.calls.at(-1), ['push', { pathname: '/life/coparent', params: { mode: 'handoff', id: handoffId } }]);
      await TestRenderer.act(async () => row('Soccer practice').props.onPress());
      assert.deepEqual(router.calls.at(-1), ['push', { pathname: '/event-editor', params: { eventId: plainId } }]);
    } finally {
      await view.done();
      router.reset();
    }
  });

  test('tapping the handoff in a child\'s Kids view opens it in Co-Parent; another event opens the Kids editor', async () => {
    // Kids lists only what is still ahead of the real clock: both events are a few days out.
    const soon = logicalDateAt(Date.now() + 3 * 86_400_000, 'America/New_York');
    const { state, childId, handoffId, plainId } = household({ handoffDate: soon, plainDate: soon });
    router.reset();
    router.params = { childId };
    const view = await mounted(<ChildDetailScreen />, state);
    try {
      const row = (title) => view.root.findAllByType('Pressable').find((p) => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.includes(title));
      assert.ok(row('School pickup') && row('Soccer practice'), `both events are listed: ${labels(view.root).join(' | ')}`);
      await TestRenderer.act(async () => row('School pickup').props.onPress());
      assert.deepEqual(router.calls.at(-1), ['push', { pathname: '/life/coparent', params: { mode: 'handoff', id: handoffId } }]);
      await TestRenderer.act(async () => row('Soccer practice').props.onPress());
      assert.deepEqual(router.calls.at(-1), ['push', { pathname: '/life/child-item', params: { childId, kind: 'event', id: plainId } }]);
    } finally {
      await view.done();
      router.reset();
    }
  });
});
