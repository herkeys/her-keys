import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  completeOnboarding,
  onboardingResumeStep,
  recordOnboardingStep,
  toggleOnboardingOption,
} from '../src/domain/onboarding.ts';
import { canOpenScreen } from '../src/domain/routeAccess.ts';
import { ctx, demoState, harness, launch, onboardedState } from './support/fixtures.mjs';
import { accessFor, finishOnboarding } from './support/store.mjs';

describe('Onboarding persistence', () => {
  test('choices are stored by catalog id, toggle on and off, and unknown ids are ignored', () => {
    let state = toggleOnboardingOption(demoState(), 'goals', 'calmer-household');
    assert.deepEqual(state.onboarding.goalIds, ['calmer-household']);
    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    assert.deepEqual(state.onboarding.goalIds, []);

    const before = demoState();
    assert.equal(toggleOnboardingOption(before, 'goals', 'A calmer household'), before, 'a label is not an id');
    assert.equal(toggleOnboardingOption(before, 'goals', 'cooking'), before, 'an id from another step');
  });

  test('a partly finished onboarding resumes at the furthest step reached, with its choices', async () => {
    const h = harness();
    let store = await launch(h);
    store.dispatch((state) => recordOnboardingStep(state, 'goals'));
    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    store.dispatch((state) => recordOnboardingStep(state, 'strengths'));
    store.dispatch((state) => toggleOnboardingOption(state, 'strengths', 'cooking'));
    await store.flush();

    store = await launch(h);
    const { onboarding } = store.getSnapshot().state;

    assert.equal(onboardingResumeStep(onboarding), 'strengths');
    assert.deepEqual([onboarding.goalIds, onboarding.strengthIds, onboarding.completedAt], [['calmer-household'], ['cooking'], null]);
    assert.equal(canOpenScreen('onboarding/strengths', accessFor(store)), true);
    assert.equal(canOpenScreen('(app)', accessFor(store)), false);
  });

  test('going back never rewinds the furthest step, so there is nothing to write', () => {
    let state = toggleOnboardingOption(demoState(), 'goals', 'calmer-household');
    state = recordOnboardingStep(state, 'struggles');
    assert.equal(recordOnboardingStep(state, 'goals'), state);
    assert.equal(recordOnboardingStep(state, 'struggles'), state);
  });

  test('resume falls back to the furthest step that can still be opened', () => {
    const state = recordOnboardingStep(toggleOnboardingOption(demoState(), 'goals', 'calmer-household'), 'struggles');
    assert.equal(onboardingResumeStep(state.onboarding), 'strengths', 'no strengths chosen yet');
    assert.equal(onboardingResumeStep(demoState().onboarding), null, 'not started: Welcome');
  });

  test('finished onboarding survives a relaunch and opens the app instead of onboarding', async () => {
    const h = harness();
    let store = await launch(h);
    await finishOnboarding(store);

    store = await launch(h);
    const { state } = store.getSnapshot();
    assert.notEqual(state.onboarding.completedAt, null);
    assert.equal(onboardingResumeStep(state.onboarding), null);
    assert.equal(canOpenScreen('(app)', accessFor(store)), true);
    assert.equal(canOpenScreen('index', accessFor(store)), false);
    assert.equal(canOpenScreen('onboarding/profile', accessFor(store)), false);
  });

  test('onboarding cannot be completed without the choices the audit needs', () => {
    const state = demoState();
    assert.equal(completeOnboarding(state, ctx()), state);
  });

  test('answers are settled once onboarding is complete', () => {
    const state = onboardedState();
    assert.equal(toggleOnboardingOption(state, 'goals', 'building-savings'), state);
    assert.equal(recordOnboardingStep(state, 'goals'), state);
  });
});
