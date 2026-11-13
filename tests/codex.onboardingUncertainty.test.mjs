import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ONBOARDING_UNSURE_ID as unsure, onboardingLabels, onboardingOptions } from '../src/data/catalog/onboardingOptions.ts';
import { completeOnboarding, onboardingStepAccess, recordOnboardingStep, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { buildOperatingProfile } from '../src/features/onboarding/buildOperatingProfile.ts';
import { chooseFirstStep } from '../src/features/onboarding/firstStep.ts';
import { harness, launch, ctx } from './support/fixtures.mjs';

const fields = { goals: 'goalIds', strengths: 'strengthIds', struggles: 'struggleIds' };
test('every audit step offers a real explicit unknown without changing unrelated choice identities', () => {
  for (const group of Object.keys(fields)) assert.equal(onboardingOptions[group].filter(o => o.id === unsure).length, 1);
});

test('unknown and concrete selections are mutually exclusive in both directions', async () => {
  const store = await launch(harness());
  for (const [group, field] of Object.entries(fields)) {
    const id = onboardingOptions[group][0].id;
    let state = toggleOnboardingOption(store.getSnapshot().state, group, id);
    state = toggleOnboardingOption(state, group, unsure);
    assert.deepEqual(state.onboarding[field], [unsure]);
    state = toggleOnboardingOption(state, group, id);
    assert.deepEqual(state.onboarding[field], [id]);
    state = toggleOnboardingOption(state, group, unsure);
    state = toggleOnboardingOption(state, group, unsure);
    assert.deepEqual(state.onboarding[field], []);
  }
});

test('unknown choices survive restart and permit honest completion without opening the app prematurely', async () => {
  const h = harness(); let store = await launch(h);
  for (const group of ['goals', 'strengths', 'struggles']) {
    store.dispatch(state => toggleOnboardingOption(state, group, unsure));
    assert.equal(store.getSnapshot().state.onboarding.completedAt, null);
    await store.flush(); store = await launch(h);
    assert.deepEqual(store.getSnapshot().state.onboarding[fields[group]], [unsure]);
  }
  assert.equal(onboardingStepAccess(store.getSnapshot().state.onboarding).plus, true);
  await store.commit((state, context) => completeOnboarding(recordOnboardingStep(state, 'plus'), context));
  store = await launch(h);
  assert.ok(store.getSnapshot().state.onboarding.completedAt);
});

test('unknown is not turned into a strength, goal, pressure or first-step claim', () => {
  for (const value of [unsure, onboardingLabels('goals', [unsure])[0]]) {
    const profile = buildOperatingProfile({ goals: [value], strengths: [value], struggles: [value] }, [unsure]);
    assert.deepEqual(profile.insights, []);
    assert.match(profile.stillLearning, /Which parts/);
  }
  const first = chooseFirstStep({ household: { origin: 'empty', eventCount: 0, taskCount: 0, needsMeCount: 0, inboxOpenCount: 0 }, struggleIds: [unsure] });
  assert.equal(first.reason, null);
  assert.equal(first.kind, 'talk_it_out');
});
