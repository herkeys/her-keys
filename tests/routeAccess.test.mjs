import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { initialOnboarding, recordOnboardingStep, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { canOpenScreen, ROOT_SCREEN_GUARDS, rootScreenForPath } from '../src/domain/routeAccess.ts';
import { demoState, onboardedState } from './support/fixtures.mjs';

const PROTECTED_LINKS = ['/today', '/life', '/life/kids', '/calendar', '/systems', '/ai', '/talk-it-out'];
const SCREENS = Object.keys(ROOT_SCREEN_GUARDS);
const unfinished = initialOnboarding();
const finished = onboardedState().onboarding;
const access = (onboarding, status = 'ready', internalTools = false) => ({ status, onboarding, internalTools });
const opens = (path, input) => canOpenScreen(rootScreenForPath(path), input);

describe('Route access', () => {
  test('until state has loaded, nothing opens — protected or not', () => {
    for (const status of ['unhydrated', 'hydrating']) {
      for (const onboarding of [unfinished, finished, null]) {
        for (const screen of SCREENS) assert.equal(canOpenScreen(screen, access(onboarding, status, true)), false, `${status} ${screen}`);
      }
    }
  });

  test('with onboarding unfinished, every protected link is refused and onboarding opens', () => {
    for (const path of PROTECTED_LINKS) assert.equal(opens(path, access(unfinished)), false, path);
    assert.equal(opens('/', access(unfinished)), true);
    assert.equal(opens('/onboarding/goals', access(unfinished)), true);
  });

  test('with onboarding finished, every protected link opens and onboarding does not', () => {
    for (const path of PROTECTED_LINKS) assert.equal(opens(path, access(finished)), true, path);
    for (const screen of SCREENS.filter((s) => s === 'index' || s.startsWith('onboarding/'))) {
      assert.equal(canOpenScreen(screen, access(finished)), false, screen);
    }
  });

  test('recovery routes exactly like ready', () => {
    for (const onboarding of [unfinished, finished]) {
      for (const screen of SCREENS) {
        assert.equal(canOpenScreen(screen, access(onboarding, 'recovery')), canOpenScreen(screen, access(onboarding, 'ready')), screen);
      }
    }
  });

  test('a link cannot skip past an onboarding choice', () => {
    let state = demoState();
    const step = (screen) => canOpenScreen(screen, access(state.onboarding));
    assert.deepEqual(['onboarding/strengths', 'onboarding/struggles', 'onboarding/profile'].map(step), [false, false, false]);

    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    assert.deepEqual(['onboarding/strengths', 'onboarding/struggles'].map(step), [true, false]);

    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
    assert.deepEqual(['onboarding/talk-it-out', 'onboarding/profile'].map(step), [true, true]);
  });

  test('internal tools open only in internal builds, independent of onboarding', () => {
    for (const onboarding of [unfinished, finished]) {
      assert.equal(canOpenScreen('dev-tools', access(onboarding)), false);
      assert.equal(canOpenScreen('dev-tools', access(onboarding, 'ready', true)), true);
    }
  });

  test('links resolve to the root screen whose guard applies', () => {
    const table = {
      '/': 'index',
      '/today': '(app)',
      '/life/kids': '(app)',
      '/ai': '(app)',
      '/talk-it-out': 'talk-it-out',
      '/talk-it-out?from=today': 'talk-it-out',
      '/onboarding/profile': 'onboarding/profile',
      '/onboarding/unknown': null,
      '/dev-tools': 'dev-tools',
      '/somewhere-else': null,
    };
    for (const [path, screen] of Object.entries(table)) assert.equal(rootScreenForPath(path), screen, path);
  });

  test('every root route is in the guard table, and the root layout wraps each one in its own guard', () => {
    const fileRoutes = [
      ...readdirSync('app').filter((name) => name.endsWith('.tsx') && !name.startsWith('_')).map((name) => name.replace(/\.tsx$/, '')),
      ...readdirSync('app').filter((name) => /^\(.+\)$/.test(name)),
      ...readdirSync('app/onboarding').map((name) => `onboarding/${name.replace(/\.tsx$/, '')}`),
    ];
    assert.deepEqual(fileRoutes.sort(), [...SCREENS].sort());

    const layout = readFileSync('app/_layout.tsx', 'utf8');
    const escape = (text) => text.replace(/[()]/g, '\\$&');
    for (const screen of SCREENS) {
      assert.match(layout, new RegExp(`guard=\\{allow\\('${escape(screen)}'\\)\\}>\\s*<Stack\\.Screen name="${escape(screen)}"`), screen);
    }
    assert.equal((layout.match(/<Stack\.Screen /g) ?? []).length, SCREENS.length, 'no unguarded root screens');
  });

  test('the root stack never names a guarded screen as its fixed initial route', () => {
    // A fixed initialRouteName breaks every launch where that screen's guard is closed.
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    assert.doesNotMatch(layout, /initialRouteName="/);
    assert.match(layout, /initialRouteName=\{allow\('index'\) \? 'index' : undefined\}/);
  });
});
