import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { initialOnboarding, onboardingResumeStep, recordOnboardingStep, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { INITIAL_ACCOUNT_STATE } from '../src/domain/account/authState.ts';
import { canOpenScreen, ROOT_SCREEN_GUARDS } from '../src/domain/routeAccess.ts';
import { ONBOARDING_STEPS } from '../src/domain/state.ts';
import { onboardingOptions } from '../src/data/catalog/onboardingOptions.ts';
import { goBackFromStep, onboardingBackTarget } from '../src/features/onboarding/backNavigation.ts';
import { chooseFirstStep, isBlankHousehold } from '../src/features/onboarding/firstStep.ts';
import { render } from './support/render.tsx';
import { demoState, harness, launch, onboardedState } from './support/fixtures.mjs';
import { HELD_ACCOUNT, accessFor, finishOnboarding } from './support/store.mjs';

await import('./today/support/stub-expo-router.mjs');
const { FirstStepCardView } = await import('../src/features/onboarding/FirstStepCard.tsx');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const blank = { origin: 'empty', eventCount: 0, taskCount: 0, needsMeCount: 0, inboxOpenCount: 0 };
const first = (overrides = {}, struggleIds = []) => chooseFirstStep({ household: { ...blank, ...overrides }, struggleIds });

const SESSION = HELD_ACCOUNT.session;
const WITHOUT_AN_ACCOUNT = {
  unauthenticated: INITIAL_ACCOUNT_STATE,
  authenticating: { kind: 'authenticating' },
  authError: { kind: 'authError', detail: 'x', recoverable: true },
  authenticatedUnbound: { kind: 'authenticatedUnbound', session: SESSION },
  bootstrapping: { kind: 'bootstrapping', session: SESSION },
  claiming: { kind: 'claiming', session: SESSION },
};
const gate = (onboarding, account = HELD_ACCOUNT) => ({ status: 'ready', onboarding, internalTools: false, account, accountSettled: true });
const reachable = (onboarding, account) => Object.keys(ROOT_SCREEN_GUARDS).filter((screen) => canOpenScreen(screen, gate(onboarding, account)));

describe('first step: empty-household next-step selection (pure, deterministic)', () => {
  test('a household with nothing in it and no audit answers gets Talk It Out, with no reason invented', () => {
    const step = first();
    assert.equal(step.kind, 'talk_it_out');
    assert.equal(step.route, '/talk-it-out');
    assert.equal(step.reason, null, 'nothing she chose decided this, so nothing is claimed');
  });

  test('a calendar struggle points at the calendar and quotes her own audit wording as hers', () => {
    for (const id of ['overcommitting', 'unrealistic-calendars']) {
      const step = first({}, [id]);
      assert.equal(step.kind, 'add_event', id);
      assert.equal(step.route, '/event-editor');
      const label = onboardingOptions.struggles.find((o) => o.id === id).label;
      assert.equal(step.reason, `You told us “${label}” is where things tend to break down.`);
    }
  });

  test('every other struggle points at Talk It Out, which needs no structure from her', () => {
    for (const id of ['paperwork-piling-up', 'financial-avoidance', 'last-minute-meals', 'frozen-when-overloaded']) {
      const step = first({}, [id]);
      assert.equal(step.kind, 'talk_it_out', id);
      assert.match(step.reason, /You told us “/);
    }
  });

  test('every struggle the catalog offers is accounted for', () => {
    for (const { id } of onboardingOptions.struggles) assert.notEqual(first({}, [id]).reason, null, `${id} has a first step`);
  });

  test('her own order is the only tie-break: the first struggle she chose that points somewhere decides', () => {
    assert.equal(first({}, ['financial-avoidance', 'overcommitting']).kind, 'talk_it_out');
    assert.equal(first({}, ['overcommitting', 'financial-avoidance']).kind, 'add_event');
  });

  test('deterministic: the same input is the same answer, and the input is never mutated', () => {
    const ids = Object.freeze(['unrealistic-calendars']);
    const input = { household: Object.freeze({ ...blank }), struggleIds: ids };
    assert.deepEqual(chooseFirstStep(input), chooseFirstStep(input));
  });

  test('NO INVENTED PERSONALIZATION: unknown, prototype-named and label-shaped ids decide nothing', () => {
    for (const bogus of ['toString', '__proto__', 'constructor', 'Overcommitting', 'unknown-struggle', '']) {
      const step = first({}, [bogus]);
      assert.equal(step.kind, 'talk_it_out', bogus);
      assert.equal(step.reason, null, bogus);
    }
  });

  test('NO INVENTED PERSONALIZATION: the step never names a goal, a strength, a person, a number or a feeling it was not given', () => {
    for (const ids of [[], ...onboardingOptions.struggles.map((o) => [o.id])]) {
      const step = first({}, ids);
      const said = [step.title, step.body, step.reason ?? '', ...step.alternatives.map((a) => a.label)].join(' ');
      assert.doesNotMatch(said, /\d/, 'no number');
      assert.doesNotMatch(said, /you (are|seem|feel|must|should)|overwhelm|stress|anxious|behind|failing|streak/i, said);
    }
  });

  test('an empty household with an unfinished capture is sent to the inbox, not asked to start over', () => {
    const step = first({ inboxOpenCount: 2 }, ['overcommitting']);
    assert.equal(step.kind, 'review_inbox');
    assert.equal(step.route, '/life/inbox');
    assert.equal(step.reason, null);
  });

  test('an unknown inbox count is treated as none, never as a reason to hold the step back', () => {
    assert.equal(first({ inboxOpenCount: null }).kind, 'talk_it_out');
  });

  test('once the household holds anything of hers — or is a demo household — there is no first step at all', () => {
    for (const held of [{ eventCount: 1 }, { taskCount: 1 }, { needsMeCount: 1 }, { origin: 'demo' }]) {
      assert.equal(first(held, ['overcommitting']), null, JSON.stringify(held));
      assert.equal(isBlankHousehold({ ...blank, ...held }), false);
    }
  });

  test('alternatives are the other real ways in, in a fixed order, and never the step itself', () => {
    assert.deepEqual(first().alternatives.map((a) => a.kind), ['add_task', 'add_event']);
    assert.deepEqual(first({}, ['overcommitting']).alternatives.map((a) => a.kind), ['talk_it_out', 'add_task']);
    assert.deepEqual(first({ inboxOpenCount: 1 }).alternatives.map((a) => a.kind), ['talk_it_out', 'add_task', 'add_event']);
    const routes = new Set(['/talk-it-out', '/event-editor', '/task-editor', '/life/inbox']);
    for (const step of [first(), first({}, ['overcommitting']), first({ inboxOpenCount: 1 })]) {
      assert.ok(routes.has(step.route));
      for (const alt of step.alternatives) assert.ok(routes.has(alt.route));
      assert.ok(!step.alternatives.some((a) => a.kind === step.kind));
    }
  });
});

describe('first step: the card', () => {
  const text = (root) =>
    root.findAllByType('Text').map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? ''))).join(' | ');
  const press = (node) => TestRenderer.act(async () => node.props.onPress());

  test('shows one primary step, its reason as hers, and sends her to the existing screen — saving nothing by itself', async () => {
    const opened = [];
    const step = first({}, ['unrealistic-calendars']);
    const r = await render(React.createElement(FirstStepCardView, { step, onOpen: (route) => opened.push(route) }));
    const said = text(r.root);
    assert.match(said, /Start with one thing on your calendar/);
    assert.match(said, /You told us “Unrealistic calendars” is where things tend to break down\./);
    const buttons = r.root.findAllByType('Pressable');
    assert.deepEqual(buttons.map((b) => b.props.accessibilityLabel), ['Add an event', 'Talk it out', 'Add a task']);
    await press(buttons[0]);
    await press(buttons[2]);
    assert.deepEqual(opened, ['/event-editor', '/task-editor']);
  });

  test('with no audit answer deciding anything, no reason line is rendered', async () => {
    const r = await render(React.createElement(FirstStepCardView, { step: first(), onOpen: () => {} }));
    assert.doesNotMatch(text(r.root), /You told us/);
    assert.match(text(r.root), /Start with what’s on your mind/);
  });
});

describe('back navigation inside the audit', () => {
  const fake = (canGoBack) => {
    const calls = [];
    return { calls, canGoBack: () => canGoBack, back: () => calls.push(['back']), replace: (href) => calls.push(['replace', href]) };
  };

  test('every step has exactly one earlier step, and the first has none', () => {
    assert.equal(onboardingBackTarget('goals'), null);
    ONBOARDING_STEPS.slice(1).forEach((step, i) => assert.equal(onboardingBackTarget(step), ONBOARDING_STEPS[i]));
  });

  test('with screens beneath it, Back pops; the first step offers no Back at all', () => {
    const nav = fake(true);
    assert.equal(goBackFromStep('struggles', nav), 'popped');
    assert.equal(goBackFromStep('goals', nav), 'none');
    assert.deepEqual(nav.calls, [['back']]);
  });

  test('APP KILLED MID-AUDIT: resumed with nothing beneath it, Back replaces with the previous step instead of doing nothing', () => {
    const nav = fake(false);
    assert.equal(goBackFromStep('struggles', nav), 'replaced');
    assert.equal(goBackFromStep('plus', nav), 'replaced');
    assert.deepEqual(nav.calls, [['replace', '/onboarding/strengths'], ['replace', '/onboarding/profile']]);
  });

  test('every Back target is open for the household that reached the step (going back never needs an access check)', () => {
    let state = demoState();
    state = toggleOnboardingOption(state, 'goals', 'calmer-household');
    state = toggleOnboardingOption(state, 'strengths', 'cooking');
    state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
    state = recordOnboardingStep(state, 'plus');
    for (const step of ONBOARDING_STEPS.slice(1)) {
      assert.equal(canOpenScreen(`onboarding/${onboardingBackTarget(step)}`, gate(state.onboarding)), true, step);
    }
  });

  test('going back does not rewind the furthest step, so a relaunch still resumes where she had got to', () => {
    let state = toggleOnboardingOption(demoState(), 'goals', 'calmer-household');
    state = toggleOnboardingOption(recordOnboardingStep(state, 'strengths'), 'strengths', 'cooking');
    state = toggleOnboardingOption(recordOnboardingStep(state, 'struggles'), 'struggles', 'overcommitting');
    state = recordOnboardingStep(state, 'talk-it-out');
    assert.equal(recordOnboardingStep(state, 'goals'), state);
    assert.equal(onboardingResumeStep(state.onboarding), 'talk-it-out');
  });

  test('every audit screen after the first offers Back, wired through the one helper', () => {
    for (const f of ['strengths', 'struggles', 'talk-it-out']) {
      const source = strip(read(`app/onboarding/${f}.tsx`));
      assert.match(source, new RegExp(`goBackFromStep\\('${f}', router\\)`), f);
    }
    for (const f of ['profile', 'plus']) assert.match(strip(read(`app/onboarding/${f}.tsx`)), new RegExp(`goBackFromStep\\('${f}', router\\)`), f);
    assert.doesNotMatch(strip(read('app/onboarding/goals.tsx')), /goBackFromStep|onBack/, 'the first step has nowhere to go back to');
  });
});

describe('journeys through the frozen gate', () => {
  test('NEW USER: Welcome only until an account holds the household; then the audit; then the app', async () => {
    const unfinished = initialOnboarding();
    for (const [kind, account] of Object.entries(WITHOUT_AN_ACCOUNT)) {
      assert.deepEqual(reachable(unfinished, account), ['index'], `${kind}: the welcome tree and nothing else`);
    }
    // Held, audit unfinished: the entry hands her on; the app stays shut.
    assert.equal(canOpenScreen('(app)', gate(unfinished)), false);
    assert.equal(canOpenScreen('onboarding/goals', gate(unfinished)), true);
    assert.equal(canOpenScreen('onboarding/strengths', gate(unfinished)), false, 'a step cannot be skipped');

    const h = harness();
    const store = await launch(h);
    await finishOnboarding(store);
    assert.equal(canOpenScreen('(app)', accessFor(store)), true);
    assert.equal(canOpenScreen('talk-it-out', accessFor(store)), true);
    assert.equal(canOpenScreen('onboarding/goals', accessFor(store)), false);
    assert.equal(canOpenScreen('index', accessFor(store)), false);
  });

  test('RETURNING USER: a held, finished household opens the app, and neither Welcome nor the audit', async () => {
    const h = harness();
    let store = await launch(h);
    await finishOnboarding(store);
    store = await launch(h);
    const open = reachable(store.getSnapshot().state.onboarding);
    assert.ok(open.includes('(app)'));
    assert.ok(!open.includes('index'));
    assert.ok(!open.some((s) => s.startsWith('onboarding/')));
  });

  test('SIGNUP RECOVERY: a failed or unfinished sign-up leaves nothing open but Welcome, and the next attempt starts clean', () => {
    const answered = onboardedState().onboarding;
    for (const account of [WITHOUT_AN_ACCOUNT.authError, WITHOUT_AN_ACCOUNT.authenticatedUnbound, WITHOUT_AN_ACCOUNT.claiming]) {
      for (const onboarding of [initialOnboarding(), answered]) {
        assert.deepEqual(reachable(onboarding, account), ['index'], `${account.kind}`);
      }
    }
    // The failed attempt did not weaken the gate: once she is bound, the same household opens normally.
    assert.equal(canOpenScreen('onboarding/goals', gate(initialOnboarding(), HELD_ACCOUNT)), true);
  });

  test('APP KILLED MID-AUDIT: what she chose is kept and she resumes at the furthest step — but only under an account', async () => {
    const h = harness();
    let store = await launch(h);
    store.dispatch((state) => recordOnboardingStep(state, 'goals'));
    store.dispatch((state) => toggleOnboardingOption(state, 'goals', 'calmer-household'));
    store.dispatch((state) => recordOnboardingStep(state, 'strengths'));
    store.dispatch((state) => toggleOnboardingOption(state, 'strengths', 'cooking'));
    store.dispatch((state) => recordOnboardingStep(state, 'struggles'));
    await store.flush();

    store = await launch(h);
    const { onboarding } = store.getSnapshot().state;
    assert.equal(onboardingResumeStep(onboarding), 'struggles');
    assert.deepEqual([onboarding.goalIds, onboarding.strengthIds], [['calmer-household'], ['cooking']]);
    assert.equal(canOpenScreen('onboarding/struggles', accessFor(store)), true);
    assert.equal(canOpenScreen('(app)', accessFor(store)), false);
    assert.deepEqual(reachable(onboarding, WITHOUT_AN_ACCOUNT.unauthenticated), ['index'], 'signed out, the half-finished audit is not reachable');
  });
});

describe('auth, consent and routing invariants are unchanged', () => {
  test('the root guard table is exactly the frozen one', () => {
    assert.deepEqual(ROOT_SCREEN_GUARDS, {
      index: 'entry',
      'onboarding/goals': { onboardingStep: 'goals' },
      'onboarding/strengths': { onboardingStep: 'strengths' },
      'onboarding/struggles': { onboardingStep: 'struggles' },
      'onboarding/talk-it-out': { onboardingStep: 'talk-it-out' },
      'onboarding/profile': { onboardingStep: 'profile' },
      'onboarding/plus': { onboardingStep: 'plus' },
      '(app)': 'app',
      'talk-it-out': 'app',
      'event-editor': 'app',
      'task-editor': 'app',
      'opportunity-editor': 'app',
      'dev-tools': 'internal',
      gallery: 'internal',
      'sign-in': 'account',
      'account-conflict': 'quarantined',
    });
  });

  test('the audit steps stay required and in order: a choice is still needed before the next step opens', () => {
    const state = demoState();
    for (const step of ['strengths', 'struggles', 'talk-it-out', 'profile', 'plus']) {
      assert.equal(canOpenScreen(`onboarding/${step}`, gate(state.onboarding)), false, step);
    }
    assert.deepEqual([...ONBOARDING_STEPS], ['goals', 'strengths', 'struggles', 'talk-it-out', 'profile', 'plus']);
  });

  test('the new modules touch no account, consent, entitlement, storage or network code', () => {
    for (const file of ['src/features/onboarding/firstStep.ts', 'src/features/onboarding/backNavigation.ts', 'src/features/onboarding/FirstStepCard.tsx']) {
      const source = strip(read(file));
      assert.doesNotMatch(source, /useAccount|AccountProvider|authState|consent|entitlement|RevenueCat|supabase|fetch\(|AsyncStorage|SecureStore|dispatch\(|commit\(/i, file);
    }
  });

  test('the frozen welcome, entry and consent surfaces were not edited by this workstream', () => {
    const entry = strip(read('app/index.tsx'));
    assert.match(entry, /<WelcomeAuthFlow mode="first-run" onPremiumChoice=\{premiumIntent\.setChoice\} \/>/);
    assert.match(entry, /canRenderAccountData\(account\.state\)/);
    assert.doesNotMatch(entry, /backNavigation|firstStep/);
    for (const file of ['src/features/account/WelcomeAuthFlow.tsx', 'src/features/account/welcomeFlowModel.ts', 'app/sign-in.tsx', 'app/account-conflict.tsx', 'app/_layout.tsx']) {
      assert.doesNotMatch(read(file), /features\/onboarding\/(firstStep|backNavigation|FirstStepCard)/, file);
    }
  });

  test('the Today empty state keeps its own notice as the fallback, and every other sparse state is unchanged', () => {
    const briefing = strip(read('src/features/today/TodayBriefing.tsx'));
    assert.match(briefing, /<FirstStepCard>\s*<TodayStateNotice kind=\{view\.sparse\.kind\} entry=\{view\.sparse\.entry\} \/>\s*<\/FirstStepCard>/);
    assert.match(briefing, /view\.sparse\.kind === 'never_entered'/);
    assert.match(briefing, /<TalkItOutEntry \/>/);
  });
});
