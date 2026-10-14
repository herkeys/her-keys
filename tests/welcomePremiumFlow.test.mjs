/**
 * Premium BEFORE account choice — the owner-approved new-user path (Build 2A):
 *
 *   Welcome → Get Started → Premium offer → Continue Free | Select Premium → Account choice → Signup → Email confirmation →
 *   Legal and AI consent → Permissions / onboarding → App
 *
 * An existing user selects "I Already Have an Account" and goes straight to sign-in.
 *
 * Premium selection before signup is an INTENT. RevenueCat checkout waits until an account owns the household and the mandatory
 * consent is complete, and nothing is ever bought anonymously. Three layers, each pinned here:
 *   1. the controller's pure state machine (reducer + back rule), including a seeded fuzz over every event;
 *   2. the one component that acts on the intent (`PremiumCheckoutAfterConsent`);
 *   3. whole journeys through the REAL welcome flow and the REAL account runtime, where the paywall presenter is the only spy.
 *
 * What none of this proves: a real purchase, a real RevenueCat offering, a device, or the production consent gate's screens
 * (a stand-in with the same placement models "consent complete"; the real placement is pinned by source below).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import React, { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import './support/welcomeFlow/register.mjs';

import { createAccountRuntime } from '../src/domain/account/accountRuntime.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { createScriptedEmailOtp } from '../src/domain/account/emailOtp.ts';
import { createScriptedEmailPassword } from '../src/domain/account/emailPassword.ts';
import { createProviderRegistry, createScriptedProvider } from '../src/domain/account/provider.ts';
import { SECURE_SESSION_KEY, createMemorySecureStorage, createSecureSessionStore } from '../src/domain/account/secureSession.ts';
import { initialWelcomeFlow, welcomeFlowBackTarget, welcomeFlowReducer } from '../src/features/account/welcomeFlowModel.ts';
import { WELCOME_AUTH_COPY as COPY } from '../src/features/welcome/copy.ts';
import { PremiumCheckoutAfterConsent } from '../src/monetization/PremiumCheckoutAfterConsent.tsx';
import { PremiumIntentProvider, usePremiumIntent } from '../src/store/PremiumIntentContext.tsx';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';

const { render } = await import('./support/render.tsx');
const { Pressable, Text } = await import('react-native');
const { Platform } = await import('./support/rn-stub.tsx');
const { installAccountHost, useAccount } = await import('./support/welcomeFlow/AccountProvider.tsx');
const { offerProviders } = await import('./support/welcomeFlow/accountRuntimeInstance.mjs');
const { WelcomeAuthFlow } = await import('../src/features/account/WelcomeAuthFlow.tsx');

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

test('V2 integration: welcome intent follows the first identity, then is discarded on sign-out or account switch', async () => {
  let intent;
  function IntentProbe() { intent = usePremiumIntent(); return null; }
  const tree = (id) => <PremiumIntentProvider accountId={id}><IntentProbe /></PremiumIntentProvider>;
  const r = await render(tree(null));
  try {
    await TestRenderer.act(async () => intent.setChoice('premium'));
    await TestRenderer.act(async () => r.update(tree(ACCOUNT_A)));
    assert.equal(intent.choice, 'premium', 'new-user choice survives initial binding and consent');
    await TestRenderer.act(async () => r.update(tree(ACCOUNT_B)));
    assert.equal(intent.choice, null, 'B cannot inherit A\'s unfinished checkout');
    await TestRenderer.act(async () => intent.setChoice('premium'));
    await TestRenderer.act(async () => r.update(tree(null)));
    assert.equal(intent.choice, null);
    await TestRenderer.act(async () => r.update(tree(ACCOUNT_A)));
    assert.equal(intent.choice, null, 'same-account reauthentication starts clean');
  } finally { await TestRenderer.act(async () => r.unmount()); }
});
const HOUSEHOLD_A = '33333333-3333-4333-8333-333333333333';
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const EMAIL = 'Rowan.Sentinel@Example.test';
const PASSWORD = 'secret-password-for-tests';

const sessionFor = (accountId, provider) => ({
  accountId,
  accessToken: `access-${accountId}`,
  refreshToken: `refresh-${accountId}`,
  expiresAt: NOW + 3_600_000,
  provider: { provider, subject: null, suggestedDisplayName: null },
});
const success = (accountId, provider) => ({ kind: 'success', session: sessionFor(accountId, provider) });
const boundTo = (accountId) => ({
  binding: { accountId, householdId: HOUSEHOLD_A, boundAt: '2026-10-01T12:00:00.000Z', kind: 'bootstrap', idMap: {} },
  receipt: null,
  quarantine: null,
});
const completeBody = {
  status: 'complete',
  rejected_reason: null,
  claim_id: '55555555-5555-4555-8555-555555555555',
  household_id: HOUSEHOLD_A,
  id_map: { 'household-1': HOUSEHOLD_A, 'user-1': '66666666-6666-4666-8666-666666666666' },
  conflict_evidence: [],
};

/** A device: a real account runtime over scripted leaves, installed as what `useAccount` reads. */
function device({ google = [success(ACCOUNT_A, 'google')], password = [], identity = UNBOUND_IDENTITY, secureInitial = {} } = {}) {
  let staged = identity;
  const secureStorage = createMemorySecureStorage(secureInitial);
  const runtime = createAccountRuntime({
    sessions: createSecureSessionStore(secureStorage),
    providers: createProviderRegistry([createScriptedProvider('apple', { results: [] }), createScriptedProvider('google', { results: google })]),
    emailOtp: createScriptedEmailOtp({}),
    emailPassword: createScriptedEmailPassword(password),
    cloud: { bootstrapAccount: async () => ({ kind: 'ok', body: completeBody }), claimLocalHousehold: async () => ({ kind: 'ok', body: completeBody }) },
    identity: { current: () => staged, set: (next) => { staged = next; }, save: async () => {} },
    localState: () => createEmptyState(TZ),
    timezone: () => TZ,
    now: () => NOW,
    newClaimKey: () => '88888888-8888-4888-8888-888888888888',
  });
  offerProviders(['google']);
  Platform.OS = 'android';
  return { runtime, host: installAccountHost(runtime), secureStorage };
}

// ---- reading and driving the rendered tree ----
const textOf = (children) =>
  Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children);
const shown = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
const control = (r, label) => r.root.findAllByType('Pressable').find((n) => n.props.accessibilityLabel === label);
const settle = () =>
  TestRenderer.act(async () => {
    for (let turn = 0; turn < 8; turn++) await new Promise((resolve) => setImmediate(resolve));
  });
const mounted = [];
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await TestRenderer.act(async () => {
      try {
        renderer.unmount();
      } catch {
        // already gone
      }
    });
  }
});
async function press(r, label) {
  const node = control(r, label);
  assert.ok(node, `no control labeled "${label}" — showing: ${shown(r)}`);
  await TestRenderer.act(async () => node.props.onPress());
  await settle();
}
async function fill(r, values) {
  const inputs = r.root.findAllByType('TextInput');
  assert.equal(inputs.length, values.length, `expected ${values.length} fields, found ${inputs.length}`);
  for (const [index, value] of values.entries()) await TestRenderer.act(async () => inputs[index].props.onChangeText(value));
}

/**
 * The app, reduced to what this suite needs, in the REAL order: welcome tree until an account is bound; then the consent gate
 * (a stand-in that shows "Agree and Continue" and mounts its children only after it); then the checkout gate around the app.
 * `consented` models a returning account whose receipts are already current: the real gate passes straight through for it.
 */
function Journey({ present, consented = false }) {
  const intent = usePremiumIntent();
  const account = useAccount();
  const [agreed, setAgreed] = useState(consented);
  const bound = account.state.kind === 'accountBound';
  useEffect(() => {
    if (!bound) setAgreed(consented);
  }, [bound, consented]);
  if (!bound) return <WelcomeAuthFlow mode="first-run" onPremiumChoice={intent.setChoice} />;
  if (!agreed) {
    return (
      <Pressable accessibilityLabel="Agree and Continue" onPress={() => setAgreed(true)}>
        <Text>Before we begin</Text>
      </Pressable>
    );
  }
  return (
    <PremiumCheckoutAfterConsent accountBound choice={intent.choice} present={present} onSettled={intent.clear}>
      <Text>THE APP</Text>
    </PremiumCheckoutAfterConsent>
  );
}

function checkoutSpy({ reject = false } = {}) {
  const calls = [];
  return {
    calls,
    present: async () => {
      calls.push('welcome_premium');
      if (reject) throw new Error('paywall exploded');
      return { kind: 'purchased' };
    },
  };
}

async function openJourney(options = {}) {
  const spy = checkoutSpy(options);
  const r = await render(
    <PremiumIntentProvider>
      <Journey present={spy.present} consented={options.consented} />
    </PremiumIntentProvider>,
  );
  mounted.push(r);
  await settle();
  return { r, spy };
}

// ============================================================================================================== 1. state machine

const at = (step, extra = {}) => ({ ...initialWelcomeFlow('first-run'), step, ...extra });
const run = (state, ...events) => events.reduce((current, event) => welcomeFlowReducer(current, event), state);

describe('the controller: Premium offer state machine', () => {
  test('Get Started opens the Premium offer; Select Premium and Continue Free each record an intent and go on to the account choice', () => {
    const offer = run(initialWelcomeFlow('first-run'), { type: 'begin' });
    assert.deepEqual([offer.step, offer.entry, offer.premiumChoice, offer.passwordMode], ['premium', 'new', null, 'signUp']);

    const premium = run(offer, { type: 'premiumSelected' });
    assert.deepEqual([premium.step, premium.premiumChoice], ['account-choice', 'premium']);
    const free = run(offer, { type: 'premiumContinueFree' });
    assert.deepEqual([free.step, free.premiumChoice], ['account-choice', 'free']);
  });

  test('the free continuation is never gated: it works from the offer with nothing else done', () => {
    assert.equal(run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumContinueFree' }).step, 'account-choice');
  });

  test('Premium events do nothing anywhere but the offer, so a stray event cannot invent an intent', () => {
    for (const step of ['welcome', 'account-choice', 'email', 'otp', 'password', 'recovery']) {
      const state = at(step);
      assert.deepEqual(welcomeFlowReducer(state, { type: 'premiumSelected' }), state, `premiumSelected at ${step}`);
      assert.deepEqual(welcomeFlowReducer(state, { type: 'premiumContinueFree' }), state, `premiumContinueFree at ${step}`);
    }
  });

  test('an existing user skips the offer and carries no intent, even after backing out of a Premium selection', () => {
    const direct = run(initialWelcomeFlow('first-run'), { type: 'existingAccount' });
    assert.deepEqual([direct.step, direct.entry, direct.premiumChoice, direct.passwordMode], ['account-choice', 'existing', null, 'signIn']);

    const changedMind = run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumSelected' }, { type: 'back' }, { type: 'back' }, { type: 'existingAccount' });
    assert.deepEqual([changedMind.step, changedMind.entry, changedMind.premiumChoice], ['account-choice', 'existing', null]);
  });

  test('a reconnect has no Welcome, no offer and no intent', () => {
    const reconnect = initialWelcomeFlow('reconnect');
    assert.deepEqual([reconnect.step, reconnect.entry, reconnect.premiumChoice], ['account-choice', null, null]);
    assert.equal(welcomeFlowBackTarget(reconnect), null);
    assert.deepEqual(run(reconnect, { type: 'begin' }, { type: 'premiumSelected' }), reconnect);
  });

  test('BACK NAVIGATION: new users return through the offer, existing users straight to Welcome, and going back withdraws the intent', () => {
    const chosen = run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumSelected' });
    assert.equal(welcomeFlowBackTarget(chosen), 'premium');
    const backAtOffer = run(chosen, { type: 'back' });
    assert.deepEqual([backAtOffer.step, backAtOffer.premiumChoice, backAtOffer.entry], ['premium', null, 'new'], 'back at the offer: she must decide again');
    const backAtWelcome = run(backAtOffer, { type: 'back' });
    assert.deepEqual([backAtWelcome.step, backAtWelcome.premiumChoice, backAtWelcome.entry], ['welcome', null, null]);
    assert.equal(welcomeFlowBackTarget(backAtWelcome), null, 'Welcome is the root');

    const existing = run(initialWelcomeFlow('first-run'), { type: 'existingAccount' });
    assert.equal(welcomeFlowBackTarget(existing), 'welcome');
    assert.equal(run(existing, { type: 'back' }).step, 'welcome');
  });

  test('stepping forward and back inside signup keeps the intent; only leaving the offer\'s far side withdraws it', () => {
    const chosen = run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumSelected' });
    const password = run(chosen, { type: 'choosePassword' });
    assert.equal(password.premiumChoice, 'premium');
    const recovery = run(password, { type: 'passwordModeChanged', mode: 'signIn' }, { type: 'forgotPassword', email: 'a@b.cc' });
    assert.deepEqual([recovery.step, recovery.premiumChoice], ['recovery', 'premium']);
    const backToPassword = run(recovery, { type: 'back' });
    assert.deepEqual([backToPassword.step, backToPassword.premiumChoice], ['password', 'premium']);
    assert.deepEqual([run(backToPassword, { type: 'back' }).step, run(backToPassword, { type: 'back' }).premiumChoice], ['account-choice', 'premium']);
  });

  test('INTERRUPTED SIGNUP: confirmation-required, a failed attempt and a mode switch all keep the intent; none binds anything', () => {
    let state = run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumSelected' }, { type: 'choosePassword' });
    state = run(state, { type: 'passwordStarted' }, { type: 'passwordSettled', outcome: { kind: 'confirmationRequired' }, account: 'unauthenticated' });
    assert.deepEqual([state.step, state.passwordNotice, state.premiumChoice, state.inFlight], ['password', 'confirmationRequired', 'premium', null]);

    state = run(state, { type: 'passwordModeChanged', mode: 'signIn' });
    assert.deepEqual([state.passwordMode, state.passwordNotice, state.premiumChoice], ['signIn', null, 'premium']);

    state = run(state, { type: 'passwordStarted' }, { type: 'passwordSettled', outcome: { kind: 'rejected' }, account: 'unauthenticated' });
    assert.deepEqual([state.passwordNotice, state.premiumChoice], ['rejected', 'premium']);

    let provider = run(initialWelcomeFlow('first-run'), { type: 'begin' }, { type: 'premiumContinueFree' }, { type: 'providerStarted', method: 'google' }, { type: 'providerSettled', account: 'authError' });
    assert.deepEqual([provider.step, provider.attemptFailed, provider.premiumChoice], ['account-choice', true, 'free']);
  });

  test('SESSION RECOVERY: a killed process restarts the tree at Welcome with no intent (nothing here is persisted)', () => {
    const restarted = initialWelcomeFlow('first-run');
    assert.deepEqual([restarted.step, restarted.entry, restarted.premiumChoice], ['welcome', null, null]);
    assert.doesNotMatch(readFileSync('src/store/PremiumIntentContext.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /AsyncStorage|SecureStore|localStorage|persist/i);
  });

  test('FUZZ: over every event, in any order, the Premium invariants hold (seeded, 3000 sequences)', () => {
    const events = [
      { type: 'begin' }, { type: 'existingAccount' }, { type: 'premiumSelected' }, { type: 'premiumContinueFree' }, { type: 'back' },
      { type: 'chooseEmail' }, { type: 'choosePassword' }, { type: 'changeEmail' },
      { type: 'passwordModeChanged', mode: 'signIn' }, { type: 'passwordModeChanged', mode: 'signUp' },
      { type: 'forgotPassword', email: 'a@b.cc' }, { type: 'passwordStarted' },
      { type: 'passwordSettled', outcome: { kind: 'confirmationRequired' }, account: 'unauthenticated' },
      { type: 'passwordSettled', outcome: { kind: 'authenticated' }, account: 'authError' },
      { type: 'passwordSettled', outcome: { kind: 'rejected' }, account: 'unauthenticated' },
      { type: 'providerStarted', method: 'google' }, { type: 'providerSettled', account: 'authError' }, { type: 'providerSettled', account: 'unauthenticated' },
      { type: 'emailSubmitted', email: 'a@b.cc' }, { type: 'emailRequestSettled', result: { kind: 'sent' }, now: 0 },
      { type: 'resendStarted' }, { type: 'resendSettled', result: { kind: 'sent' }, now: 0 },
      { type: 'codeSubmitted' }, { type: 'codeSettled', outcome: { kind: 'codeRejected' }, account: 'unauthenticated' },
      { type: 'codeSettled', outcome: { kind: 'verified' }, account: 'authenticatedUnbound' },
    ];
    let seed = 20261012;
    const next = (n) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    // Causality, as in the controller: the UI exposes a start only on its own screen, and an answer ("settled") can only follow
    // its own start, so it is offered only while that request is in flight. Without this the fuzz would feed the reducer
    // actions no screen can produce and answers to questions nobody asked.
    const answerable = (event, state) => {
      switch (event.type) {
        case 'providerStarted': return state.step === 'account-choice';
        case 'emailSubmitted': return state.step === 'email';
        case 'resendStarted':
        case 'codeSubmitted': return state.step === 'otp';
        case 'passwordSettled': return state.inFlight === 'password';
        case 'providerSettled': return state.inFlight === 'google' || state.inFlight === 'apple';
        case 'emailRequestSettled':
        case 'resendSettled':
        case 'codeSettled': return state.inFlight === 'email';
        default: return true;
      }
    };
    const reached = new Set();
    for (let sequence = 0; sequence < 3000; sequence++) {
      let state = initialWelcomeFlow(sequence % 7 === 0 ? 'reconnect' : 'first-run');
      for (let step = 0; step < 25; step++) {
        const event = events[next(events.length)];
        if (!answerable(event, state)) continue;
        state = welcomeFlowReducer(state, event);
        assert.ok(state, `reducer returned nothing for ${event.type}`);
        reached.add(state.step);
        const where = `${state.mode} ${state.step} entry=${state.entry} choice=${state.premiumChoice} after ${event.type}`;
        if (state.premiumChoice !== null) assert.ok(state.entry === 'new' && state.step !== 'welcome' && state.step !== 'premium', `an intent exists only past the offer on the new path: ${where}`);
        if (state.entry === 'new' && state.step !== 'welcome' && state.step !== 'premium') assert.notEqual(state.premiumChoice, null, `every new-path step past the offer holds a decision: ${where}`);
        if (state.entry === 'existing') assert.equal(state.premiumChoice, null, `an existing-account path never holds an intent: ${where}`);
        if (state.step === 'welcome') assert.deepEqual([state.entry, state.premiumChoice], [null, null], where);
        if (state.step === 'premium') assert.deepEqual([state.entry, state.premiumChoice], ['new', null], where);
        if (state.mode === 'reconnect') assert.deepEqual([state.entry, state.premiumChoice], [null, null], where);
      }
    }
    for (const step of ['welcome', 'premium', 'account-choice', 'password', 'email', 'otp', 'recovery']) assert.ok(reached.has(step), `the fuzz reached ${step}`);
  });
});

// ============================================================================================================== 2. the checkout gate

describe('the one place Premium intent is acted on', () => {
  async function mount(props) {
    const calls = { present: 0, settled: 0 };
    const make = (p) => (
      <PremiumCheckoutAfterConsent
        accountBound={p.accountBound}
        choice={p.choice}
        present={p.present ?? (async () => { calls.present += 1; return { kind: 'purchased' }; })}
        onSettled={() => { calls.settled += 1; }}
      >
        <Text>CHILD</Text>
      </PremiumCheckoutAfterConsent>
    );
    const r = await render(make(props));
    mounted.push(r);
    await settle();
    const update = async (p) => {
      await TestRenderer.act(async () => r.update(make(p)));
      await settle();
    };
    return { r, calls, update };
  }

  test('premium + bound account: one checkout, then the intent is consumed; the app is visible throughout', async () => {
    const { r, calls, update } = await mount({ accountBound: true, choice: 'premium' });
    assert.deepEqual(calls, { present: 1, settled: 1 });
    assert.match(shown(r), /CHILD/);
    await update({ accountBound: true, choice: 'premium' });
    assert.equal(calls.present, 1, 're-rendering with the same props never checks out twice');
  });

  test('premium but NOT bound: nothing happens until an account is bound — then exactly once', async () => {
    const { calls, update } = await mount({ accountBound: false, choice: 'premium' });
    assert.deepEqual(calls, { present: 0, settled: 0 }, 'no checkout without account ownership');
    await update({ accountBound: true, choice: 'premium' });
    assert.deepEqual(calls, { present: 1, settled: 1 });
  });

  test('a free intent offers nothing and is cleared; no intent does nothing at all', async () => {
    const free = await mount({ accountBound: true, choice: 'free' });
    assert.deepEqual(free.calls, { present: 0, settled: 1 });
    const none = await mount({ accountBound: true, choice: null });
    assert.deepEqual(none.calls, { present: 0, settled: 0 });
  });

  test('a checkout that throws never blocks the app, and the intent is still consumed', async () => {
    let settled = 0;
    const r = await render(
      <PremiumCheckoutAfterConsent accountBound choice="premium" present={async () => { throw new Error('boom'); }} onSettled={() => { settled += 1; }}>
        <Text>CHILD</Text>
      </PremiumCheckoutAfterConsent>,
    );
    mounted.push(r);
    await settle();
    assert.equal(settled, 1);
    assert.match(shown(r), /CHILD/);
  });

  test('a NEW intent after the old one was cleared is acted on again (the guard resets with the intent)', async () => {
    const { calls, update } = await mount({ accountBound: true, choice: 'premium' });
    await update({ accountBound: true, choice: null });
    await update({ accountBound: true, choice: 'premium' });
    assert.equal(calls.present, 2);
  });

  test('PLACEMENT, by source: checkout is inside the consent gate, around the navigator, for the welcome_premium placement, from the entitlement layer only', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8').replace(/\r\n/g, '\n');
    assert.match(layout, /<ConsentGate session=\{account\.state\.session\}>\{afterConsent\}<\/ConsentGate>/, 'consent wraps the checkout gate');
    assert.match(layout, /<PremiumCheckoutAfterConsent[\s\S]*?accountBound=\{account\.state\.kind === 'accountBound'\}[\s\S]*?\{guardedNavigator\}[\s\S]*?<\/PremiumCheckoutAfterConsent>/, 'the gate needs a bound account and wraps the navigator');
    assert.match(layout, /presentPaywall\('welcome_premium'\)/, 'the placement is welcome_premium');
    const entry = readFileSync('app/index.tsx', 'utf8');
    assert.match(entry, /onPremiumChoice=\{premiumIntent\.setChoice\}/);
    assert.doesNotMatch(entry, /presentPaywall|useEntitlement/, 'the entry route never presents a paywall');
    const gate = readFileSync('src/monetization/PremiumCheckoutAfterConsent.tsx', 'utf8');
    assert.doesNotMatch(gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /react-native-purchases|Purchases\.|revenueCatClient/, 'the gate holds no SDK of its own');
  });

  test('the stable entitlement id and the display name are untouched', async () => {
    const { HER_KEYS_PLUS_ENTITLEMENT, HER_KEYS_PREMIUM_DISPLAY_NAME } = await import('../src/monetization/entitlement.ts');
    assert.equal(HER_KEYS_PLUS_ENTITLEMENT, 'her_keys_plus');
    assert.equal(HER_KEYS_PREMIUM_DISPLAY_NAME, 'Her Keys Premium');
  });
});

// ============================================================================================================== 3. whole journeys

describe('journeys through the real welcome flow and the real account runtime', () => {
  test('NEW USER, SELECT PREMIUM: no checkout while signing up, none before consent, exactly one after it', async () => {
    const d = device();
    const { r, spy } = await openJourney();
    await press(r, COPY.welcome.begin);
    assert.ok(control(r, COPY.premium.select) && control(r, COPY.premium.free), 'the offer comes first');
    await press(r, COPY.premium.select);
    assert.deepEqual(spy.calls, [], 'selecting Premium buys nothing');
    assert.ok(shown(r).includes(COPY.accountChoice.signUpTitle), 'the account choice follows');

    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.match(shown(r), /Before we begin/, 'the consent gate stands between the bound account and the app');
    assert.deepEqual(spy.calls, [], 'a bound account is not enough: consent is not complete, so there is still no checkout');

    await press(r, 'Agree and Continue');
    assert.match(shown(r), /THE APP/);
    assert.deepEqual(spy.calls, ['welcome_premium'], 'exactly one checkout, only now');
  });

  test('NEW USER, CONTINUE FREE: the app opens after consent and checkout is never offered', async () => {
    const d = device();
    const { r, spy } = await openJourney();
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.free);
    await press(r, 'Continue with Google');
    await press(r, 'Agree and Continue');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.match(shown(r), /THE APP/);
    assert.deepEqual(spy.calls, []);
  });

  test('EXISTING USER: straight to sign-in, never shown the offer, never checked out', async () => {
    device();
    const { r, spy } = await openJourney({ consented: true });
    await press(r, COPY.welcome.existingAccount);
    assert.ok(shown(r).includes(COPY.accountChoice.signInTitle));
    assert.equal(control(r, COPY.premium.select), undefined);
    await press(r, 'Continue with Google');
    assert.match(shown(r), /THE APP/, 'current consent is respected: the gate does not ask again');
    assert.deepEqual(spy.calls, []);
  });

  test('INTERRUPTED SIGNUP: the intent survives the confirmation round trip and is acted on once, after sign-in and consent', async () => {
    const d = device({ password: [{ kind: 'confirmationRequired' }, success(ACCOUNT_A, 'email')] });
    const { r, spy } = await openJourney();
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.select);
    await press(r, 'Continue with email');
    await fill(r, [EMAIL, PASSWORD, PASSWORD]);
    await press(r, COPY.password.create);
    assert.match(shown(r), /Check your email for an account confirmation link/);
    assert.equal(d.runtime.getState().kind, 'unauthenticated', 'confirmation required binds nothing');
    assert.deepEqual(spy.calls, []);

    // She confirms by email, comes back, and signs in with the confirmed account — from this same screen, without backing out
    // to Welcome (which would drop the Premium decision).
    await press(r, COPY.password.confirmedSignIn);
    assert.equal(control(r, COPY.password.confirmedSignIn), undefined, 'the contextual action is gone once she is in sign-in mode');
    await fill(r, [EMAIL, PASSWORD]);
    await press(r, COPY.password.signIn);
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.deepEqual(spy.calls, [], 'still no checkout before consent');
    await press(r, 'Agree and Continue');
    assert.deepEqual(spy.calls, ['welcome_premium']);
  });

  test('BACK NAVIGATION withdraws the intent: Premium → choice → back → back → I Already Have an Account never checks out', async () => {
    device();
    const { r, spy } = await openJourney({ consented: true });
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.select);
    await press(r, COPY.back);
    assert.ok(control(r, COPY.premium.select), 'back from the account choice returns to the offer');
    await press(r, COPY.back);
    assert.match(shown(r), /Rebuild your life/);
    await press(r, COPY.welcome.existingAccount);
    await press(r, 'Continue with Google');
    assert.match(shown(r), /THE APP/);
    assert.deepEqual(spy.calls, []);
  });

  test('SESSION RECOVERY: a restored account goes straight to the app — no Welcome, no offer, no checkout', async () => {
    const d = device({ identity: boundTo(ACCOUNT_A), secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A, 'email')) } });
    await TestRenderer.act(async () => {
      await d.runtime.restore();
    });
    assert.equal(d.runtime.getState().kind, 'accountBound');
    const { r, spy } = await openJourney({ consented: true });
    assert.match(shown(r), /THE APP/);
    assert.doesNotMatch(shown(r), /Rebuild your life|Select Premium/);
    assert.deepEqual(spy.calls, []);
  });

  test('ONE CHECKOUT PER INTENT: after sign-out, the same account signing back in is not offered a second checkout', async () => {
    const d = device({ google: [success(ACCOUNT_A, 'google'), success(ACCOUNT_A, 'google')] });
    const { r, spy } = await openJourney();
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.select);
    await press(r, 'Continue with Google');
    await press(r, 'Agree and Continue');
    assert.deepEqual(spy.calls, ['welcome_premium']);

    await TestRenderer.act(async () => {
      await d.runtime.signOut();
    });
    await settle();
    assert.match(shown(r), /Rebuild your life/, 'signing out returns to Welcome');
    await press(r, COPY.welcome.existingAccount);
    await press(r, 'Continue with Google');
    await press(r, 'Agree and Continue');
    assert.match(shown(r), /THE APP/);
    assert.deepEqual(spy.calls, ['welcome_premium'], 'the intent was consumed once and is not re-offered');
  });

  test('NO LEAK BETWEEN ACCOUNTS: a different account on a device bound to the first is quarantined and is never offered a checkout', async () => {
    const d = device({ google: [success(ACCOUNT_A, 'google'), success(ACCOUNT_B, 'google')] });
    const { r, spy } = await openJourney();
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.select);
    await press(r, 'Continue with Google');
    await press(r, 'Agree and Continue');
    assert.deepEqual(spy.calls, ['welcome_premium']);

    await TestRenderer.act(async () => {
      await d.runtime.signOut();
    });
    await settle();
    await press(r, COPY.welcome.existingAccount);
    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'boundOther', 'B is quarantined by the existing doctrine');
    assert.doesNotMatch(shown(r), /THE APP|Before we begin/);
    assert.deepEqual(spy.calls, ['welcome_premium'], 'B was never offered a checkout');
  });

  test('A CHECKOUT FAILURE never blocks the app', async () => {
    device();
    const { r, spy } = await openJourney({ reject: true });
    await press(r, COPY.welcome.begin);
    await press(r, COPY.premium.select);
    await press(r, 'Continue with Google');
    await press(r, 'Agree and Continue');
    assert.deepEqual(spy.calls, ['welcome_premium']);
    assert.match(shown(r), /THE APP/);
  });
});
