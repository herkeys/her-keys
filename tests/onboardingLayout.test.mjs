import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The Welcome Tree has no tab bar, so a screen there must not inherit the tab-bar clearance, and the primary action must follow
 * its content instead of being pushed to the bottom of a tall viewport. These are contract checks on the layout source; pixel
 * evidence comes from the device run.
 */
describe('onboarding layout contract', () => {
  const scaffold = read('src/features/onboarding/OnboardingScaffold.tsx');
  const screen = read('src/design/components/Screen.tsx');
  // HK-FE-UI-02 moved the three stage views into ConsentViews.tsx (the gate and its insets stay in ConsentFlow.tsx): the
  // contract is about the pair together — the gate computes the insets, every stage view applies them.
  const consent = read('src/features/consent/ConsentFlow.tsx') + read('src/features/consent/ConsentViews.tsx');

  test('Continue follows the content: the content block never grows to fill the viewport', () => {
    const content = scaffold.match(/content:\s*\{[^}]*\}/)?.[0] ?? '';
    assert.ok(content, 'content style present');
    assert.doesNotMatch(content, /flexGrow|flex:/);
    assert.doesNotMatch(scaffold, /position:\s*'absolute'|height:\s*\d+|minHeight/);
  });

  test('the content-to-action gap stays within the 24-32dp design range', () => {
    const margin = scaffold.match(/content:\s*\{[^}]*marginBottom:\s*spacing\.(\w+)/)?.[1];
    assert.ok(['xxl', 'xxxl'].includes(margin), `marginBottom token ${margin}`);
  });

  test('every no-tab-bar onboarding screen opts out of tab-bar clearance', () => {
    for (const path of ['src/features/onboarding/OnboardingScaffold.tsx', 'app/onboarding/plus.tsx', 'app/onboarding/profile.tsx']) {
      assert.match(read(path), /<Screen bottomClearance=\{spacing\.\w+\}>/, path);
    }
  });

  test('Screen keeps tab-bar clearance by default and always adds the system bottom inset', () => {
    // Build 5: the 68pt is the bottom tab bar's chrome, read from the adaptive layout (a sidebar owns no bottom edge). The rendered
    // value for a tab-bar layout is still exactly spacing.xxxl + 68 + inset — proven in tests/build5/adaptiveLayout.test.mjs.
    assert.match(screen, /\(bottomClearance \?\? spacing\.xxxl \+ tabChromeClearance\(layout\.navigation\)\) \+ insets\.bottom/);
    const sizeClass = read('src/design/adaptive/sizeClass.ts');
    assert.match(sizeClass, /export const TAB_BAR_CHROME_HEIGHT = 68;/);
    assert.match(sizeClass, /return navigation === 'tabBar' \? TAB_BAR_CHROME_HEIGHT : 0;/);
  });

  test('consent scrolls and clears the status bar and the navigation bar', () => {
    assert.match(consent, /useSafeAreaInsets/);
    assert.match(consent, /insets\.top \+ spacing\.xxl/);
    assert.match(consent, /insets\.bottom \+ spacing\.xxl/);
    assert.equal((consent.match(/contentContainerStyle=\{\[styles\.(content|recover), inset\]\}/g) ?? []).length, 3);
  });
});
