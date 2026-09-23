/**
 * HK13-D16 (P3) — closed is not archived, and neither is gone (HK-F01-F13 integration audit).
 *
 * Career Next listed only open, unarchived opportunities, so a CLOSED opportunity vanished from the app exactly as an archived one did,
 * and "Restore from archive" — a button on the opportunity itself — could never be reached again. These hold every recorded
 * opportunity in exactly one list, each one tap from its editor, and the restore round trip through the real form.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { addOpportunity, archiveOpportunity, setOpportunityStage } from '../../src/domain/opportunities.ts';
import { careerListsOf } from '../../src/features/work/careerLists.ts';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

await import('../today/support/stub-expo-router.mjs');
await import('../today/support/stub-appstate.mjs');
const { router } = await import('../today/support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { OpportunityForm } = await import('../../src/features/work/OpportunityForm.tsx');
const { CareerNext } = await import('../../src/features/work/CareerNext.tsx');
router.back ??= (...args) => router.calls.push(['back', ...args]);

const byLabel = (root, label) => {
  const found = root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
  assert.ok(found, `a control labelled "${label}" is on screen`);
  return found;
};
const labels = (root) => root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
const press = async (node) => TestRenderer.act(async () => node.props.onPress());

/** Four opportunities: one in play, one closed, one archived while open, one archived after closing. */
function household() {
  let s = real();
  const add = (title) => {
    s = addOpportunity(s, at(), { title, opportunityType: 'job' });
    return s.careerOpportunities.at(-1).id;
  };
  const inPlay = add('Senior analyst');
  const closed = add('Data lead');
  s = setOpportunityStage(s, at(), closed, 'closed', 'no_further_response').state;
  const archivedOpen = add('Contract role');
  s = archiveOpportunity(s, at(), archivedOpen);
  const archivedClosed = add('Old application');
  s = setOpportunityStage(s, at(), archivedClosed, 'closed', 'withdrawn').state;
  s = archiveOpportunity(s, at(), archivedClosed);
  return { state: s, ids: { inPlay, closed, archivedOpen, archivedClosed } };
}

describe('every recorded opportunity is in exactly one list', () => {
  test('open, closed and archived partition them all; closed stays in view until she archives it', () => {
    const { state, ids } = household();
    const lists = careerListsOf(state.careerOpportunities);
    assert.deepEqual(lists.open.map((o) => o.id), [ids.inPlay]);
    assert.deepEqual(lists.closed.map((o) => o.id), [ids.closed], 'closed is not archived');
    assert.deepEqual(new Set(lists.archived.map((o) => o.id)), new Set([ids.archivedOpen, ids.archivedClosed]));
    const all = [...lists.open, ...lists.closed, ...lists.archived].map((o) => o.id);
    assert.equal(all.length, state.careerOpportunities.length);
    assert.equal(new Set(all).size, all.length);
  });
});

describe('Career Next, rendered', () => {
  test('the closed one is listed with her reason; the archived ones are one tap away; every row opens its opportunity', async () => {
    const { state, ids } = household();
    const opened = [];
    const r = await render(
      <CareerNext lists={careerListsOf(state.careerOpportunities)} hasNextAction={() => true} onOpen={(id) => opened.push(id)} onAdd={() => {}} />
    );
    const text = r.root.findAllByType('Text').map((t) => [].concat(t.props.children).join(''));
    assert.ok(text.includes('CLOSED'), 'a Closed section (overlines render in capitals)');
    // A list row is labelled "title: value".
    assert.ok(labels(r.root).includes('Data lead: No further response'), 'the closed opportunity is listed, with her reason');
    assert.equal(labels(r.root).some((l) => l.startsWith('Contract role:')), false, 'archived ones are out of view…');
    await press(byLabel(r.root, 'Show archived (2)'));
    assert.ok(labels(r.root).includes('Contract role: Archived · Exploring'), '…one tap away, with the stage she recorded');
    assert.ok(labels(r.root).includes('Old application: Archived · Closed'));
    const row = (title) => r.root.findAllByType('Pressable').find((p) => String(p.props.accessibilityLabel).startsWith(`${title}:`));
    for (const title of ['Senior analyst', 'Data lead', 'Contract role', 'Old application']) await press(row(title));
    assert.deepEqual(opened, [ids.inPlay, ids.closed, ids.archivedOpen, ids.archivedClosed]);
  });

  test('with only closed or archived ones, Career Next says nothing is in play — never that nothing was recorded', async () => {
    const { state } = household();
    const onlyPast = careerListsOf(state.careerOpportunities.filter((o) => o.stage === 'closed' || o.archivedAt !== null));
    const r = await render(<CareerNext lists={onlyPast} hasNextAction={() => true} onOpen={() => {}} onAdd={() => {}} />);
    const text = r.root.findAllByType('Text').map((t) => [].concat(t.props.children).join(''));
    assert.ok(text.includes('Nothing in play right now.'));
    assert.equal(text.includes('No career opportunities recorded yet.'), false);
  });
});

describe('restoring an archived opportunity, through the real form', () => {
  test('opened from the archived list, "Restore from archive" brings it back to Career Next with its stage untouched', async () => {
    const store = await launch(harness({ mode: 'empty', initial: {} }));
    await store.commit(() => household().state);
    await store.flush();
    const archived = store.getSnapshot().state.careerOpportunities.find((o) => o.title === 'Contract role');
    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        <AppStateProvider store={store}>
          <OpportunityForm opportunityId={archived.id} />
        </AppStateProvider>
      );
    });
    try {
      await press(byLabel(renderer.root, 'Restore from archive'));
      await store.flush();
      const restored = store.getSnapshot().state.careerOpportunities.find((o) => o.id === archived.id);
      assert.equal(restored.archivedAt, null);
      assert.equal(restored.stage, archived.stage, 'restoring never rewrites the recorded stage');
      assert.ok(careerListsOf(store.getSnapshot().state.careerOpportunities).open.some((o) => o.id === archived.id));
    } finally {
      await store.flush();
      await TestRenderer.act(async () => renderer.unmount());
    }
  });
});
