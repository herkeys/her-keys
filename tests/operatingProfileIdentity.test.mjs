import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { onboardingOptions, resolveOnboardingOptionId } from '../src/data/catalog/onboardingOptions.ts';
import { buildOperatingProfile } from '../src/features/onboarding/buildOperatingProfile.ts';

const FROZEN = 'What usually tips a day from full into frozen.';
const MONEY = 'Whether money feels heavy because of cash flow, or because of the decisions attached to it.';
const DEFAULT = 'Which parts of your week actually cost you the most.';

const answers = (struggles) => ({ goals: [], strengths: [], struggles });

describe('Operating Profile option identity', () => {
  // 1. stable ID resolves correctly
  test('a stable option id drives the reasoning', () => {
    const profile = buildOperatingProfile(answers([]), ['frozen-when-overloaded']);
    assert.equal(profile.stillLearning, FROZEN);
  });

  // 2. historical label resolves correctly
  test('a historical display-label value still resolves to the same conclusion', () => {
    const profile = buildOperatingProfile(answers(['Becoming frozen when overloaded']));
    assert.equal(profile.stillLearning, FROZEN, 'an older label-shaped caller must not silently fall through');
  });

  test('both forms agree for every struggle in the catalog', () => {
    for (const option of onboardingOptions.struggles) {
      const byId = buildOperatingProfile(answers([]), [option.id]).stillLearning;
      const byLabel = buildOperatingProfile(answers([option.label])).stillLearning;
      assert.equal(byLabel, byId, `${option.id} must resolve identically from either form`);
      assert.notEqual(byId, DEFAULT, `${option.id} must have its own open question`);
    }
  });

  // 3. changing display text does not change stable-ID reasoning
  test('rewording a label cannot change a stable-id conclusion', () => {
    const reworded = buildOperatingProfile(
      { goals: [], strengths: [], struggles: ['Some completely different wording'] },
      ['financial-avoidance']
    );
    assert.equal(reworded.stillLearning, MONEY, 'the id is authoritative, the label is presentation');
  });

  // 4. unknown ID fails safely
  test('an unknown id or label falls back to the neutral question', () => {
    assert.equal(buildOperatingProfile(answers([]), ['not-a-real-struggle']).stillLearning, DEFAULT);
    assert.equal(buildOperatingProfile(answers(['Not a real label'])).stillLearning, DEFAULT);
    assert.equal(buildOperatingProfile(answers([])).stillLearning, DEFAULT);
  });

  test('the resolver accepts either form and refuses anything else', () => {
    assert.equal(resolveOnboardingOptionId('struggles', 'overcommitting'), 'overcommitting');
    assert.equal(resolveOnboardingOptionId('struggles', 'Overcommitting'), 'overcommitting');
    assert.equal(resolveOnboardingOptionId('struggles', 'Overcommitting '), null, 'no fuzzy matching');
    assert.equal(resolveOnboardingOptionId('struggles', undefined), null);
    assert.equal(resolveOnboardingOptionId('goals', 'overcommitting'), null, 'groups do not leak into each other');
  });

  // 5. existing Build 3 behaviour remains unchanged
  test('the insight list is unchanged by the identity hardening', () => {
    const profile = buildOperatingProfile(
      { goals: ['A calmer household'], strengths: ['Cooking'], struggles: ['Overcommitting'] },
      ['overcommitting']
    );
    assert.deepEqual(
      profile.insights.map((i) => [i.label, i.confidence]),
      [
        ['Rebuilding toward', 'possible'],
        ['Already working', 'possible'],
        ['Starting hypothesis', 'possible'],
      ]
    );
    assert.ok(profile.insights[0].detail.startsWith('A calmer household'), 'display text still uses labels');
  });
});
