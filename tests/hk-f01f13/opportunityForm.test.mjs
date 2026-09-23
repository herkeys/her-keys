/**
 * HK13-D15 (P3) — the opportunity form's stage change, rendered against a real store (HK-F01-F13 integration audit).
 *
 * The domain command `setOpportunityStage` refuses a closed reason on any stage but `closed`. The form kept the reason it had
 * loaded (or she had picked) in its own state when she moved the stage away from Closed, passed it along, ignored the refusal, and
 * closed the screen as if it had saved: her correction silently never happened. These drive the real form under the real provider.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { addOpportunity, setOpportunityStage } from '../../src/domain/opportunities.ts';
import { at, real } from '../support/acceptance.mjs';
import { harness, launch } from '../support/fixtures.mjs';

// The recording router and the AppState stub, before any component is imported (each test file is its own process).
await import('../today/support/stub-expo-router.mjs');
await import('../today/support/stub-appstate.mjs');
const { router } = await import('../today/support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { OpportunityForm } = await import('../../src/features/work/OpportunityForm.tsx');
// Today's recording router only records `push`; the form also goes back after a save.
router.back ??= (...args) => router.calls.push(['back', ...args]);

const pressables = (root) => root.findAllByType('Pressable');
const byLabel = (root, label) => {
  const found = pressables(root).find((p) => p.props.accessibilityLabel === label);
  assert.ok(found, `a control labelled "${label}" is on screen`);
  return found;
};
const press = async (node) => TestRenderer.act(async () => node.props.onPress());

/** The real form under the real provider. `existing`: open the opportunity the setup created, as the Work screen would. */
async function mount(setup, { existing }) {
  const store = await launch(harness({ mode: 'empty', initial: {} }));
  await store.commit(() => setup(real()));
  await store.flush();
  const opportunityId = existing ? store.getSnapshot().state.careerOpportunities.at(-1).id : undefined;
  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      <AppStateProvider store={store}>
        <OpportunityForm opportunityId={opportunityId} />
      </AppStateProvider>
    );
  });
  let unmounted = false;
  const done = async () => {
    if (unmounted) return;
    unmounted = true;
    await store.flush();
    await TestRenderer.act(async () => renderer.unmount());
  };
  return { store, root: renderer.root, done, state: () => store.getSnapshot().state };
}

/** Always unmounts — even when an assertion fails — so the provider's minute timer never keeps the test process alive. */
async function withForm(setup, options, body) {
  const live = await mount(setup, options);
  try {
    await body(live);
  } finally {
    await live.done();
  }
}

const closedOpportunity = (s) => {
  const withOpportunity = addOpportunity(s, at(), { title: 'Senior analyst', opportunityType: 'job' });
  const id = withOpportunity.careerOpportunities.at(-1).id;
  return setOpportunityStage(withOpportunity, at(), id, 'closed', 'no_further_response').state;
};

describe('HK13-D15 — moving an opportunity\'s stage in the form', () => {
  test('a CLOSED opportunity corrected to Applied is saved as Applied, and its closed reason is cleared', async () => {
    await withForm(closedOpportunity, { existing: true }, async (live) => {
      assert.equal(live.state().careerOpportunities[0].stage, 'closed');
      await press(byLabel(live.root, 'Applied'));
      await press(byLabel(live.root, 'Save changes'));
      await live.store.flush();
      const [saved] = live.state().careerOpportunities;
      assert.equal(saved.stage, 'applied', 'her correction was saved');
      assert.equal(saved.closedReason, null, 'a stage that is not Closed carries no closed reason');
    });
  });

  test('a NEW opportunity she marked Closed with a reason, then moved to Interviewing, is created at Interviewing', async () => {
    await withForm((s) => s, { existing: false }, async (live) => {
      const title = live.root.findAllByType('TextInput')[0];
      await TestRenderer.act(async () => title.props.onChangeText('Product lead'));
      await press(byLabel(live.root, 'Closed'));
      await press(byLabel(live.root, 'I withdrew'));
      await press(byLabel(live.root, 'Interviewing'));
      await press(byLabel(live.root, 'Add opportunity'));
      await live.store.flush();
      const [created] = live.state().careerOpportunities;
      assert.equal(created.stage, 'interviewing', 'not silently left at Exploring');
      assert.equal(created.closedReason, null);
    });
  });

  test('moving back to Closed after a correction still requires, and keeps, a reason', async () => {
    await withForm(closedOpportunity, { existing: true }, async (live) => {
      await press(byLabel(live.root, 'Applied'));
      await press(byLabel(live.root, 'Closed'));
      await press(byLabel(live.root, 'They declined'));
      await press(byLabel(live.root, 'Save changes'));
      await live.store.flush();
      const [saved] = live.state().careerOpportunities;
      assert.deepEqual([saved.stage, saved.closedReason], ['closed', 'declined_by_organization']);
    });
  });
});
