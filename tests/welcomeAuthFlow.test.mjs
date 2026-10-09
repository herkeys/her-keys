/**
 * The welcome tree, wired — integration tests.
 *
 * Kimi's shell is rendered for real (`WelcomeAuthShell` and every view under it), driven by the real controller
 * (`WelcomeAuthFlow` + `welcomeFlowModel`), against a real `createAccountRuntime`. Only the leaves are scripted: the Apple
 * and Google adapters, the email port, the cloud RPCs and the keychain. So a test here presses the buttons she presses,
 * types into the fields she types into, and asserts what the ACCOUNT RUNTIME then did.
 *
 * The two store modules the flow imports are redirected to stand-ins for this one importer (tests/support/welcomeFlow);
 * the last suite pins the production provider's wiring by source so the stand-in cannot drift from it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import './support/welcomeFlow/register.mjs';

import { createAccountRuntime } from '../src/domain/account/accountRuntime.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { createScriptedEmailOtp } from '../src/domain/account/emailOtp.ts';
import { createScriptedEmailPassword } from '../src/domain/account/emailPassword.ts';
import { createProviderRegistry, createScriptedProvider } from '../src/domain/account/provider.ts';
import { SECURE_SESSION_KEY, createMemorySecureStorage, createSecureSessionStore } from '../src/domain/account/secureSession.ts';
import { CROSS_PLATFORM_NOTE } from '../src/features/account/accountModel.ts';
import { initialWelcomeFlow, welcomeFlowBackTarget, welcomeFlowReducer, welcomeFlowView } from '../src/features/account/welcomeFlowModel.ts';
import { WELCOME_AUTH_COPY as COPY } from '../src/features/welcome/copy.ts';
import { RESEND_COOLDOWN_SECONDS } from '../src/features/welcome/model.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { TZ } from './support/fixtures.mjs';

const { render } = await import('./support/render.tsx');
const { BackHandler, Platform } = await import('./support/rn-stub.tsx');
const { installAccountHost } = await import('./support/welcomeFlow/AccountProvider.tsx');
const { offerProviders } = await import('./support/welcomeFlow/accountRuntimeInstance.mjs');
const { WelcomeAuthFlow, WelcomeAuthSettling } = await import('../src/features/account/WelcomeAuthFlow.tsx');
const { WelcomeAuthShell } = await import('../src/features/welcome/WelcomeAuthShell.tsx');

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const HOUSEHOLD_A = '33333333-3333-4333-8333-333333333333';
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const EMAIL = 'Rowan.Sentinel@Example.test';
const CODE = '918273';

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
function device({ google = [success(ACCOUNT_A, 'google')], apple = [success(ACCOUNT_A, 'apple')], email = {}, password = [], identity = UNBOUND_IDENTITY, cloudAnswers, secureInitial = {}, sessionClient, offered = ['google'] } = {}) {
  const cloudCalls = [];
  let staged = identity;
  let answered = 0;
  const secureStorage = createMemorySecureStorage(secureInitial);
  const port = createScriptedEmailOtp(email);
  const requested = [];
  const emailOtp = {
    isAvailable: () => port.isAvailable(),
    request: (address) => {
      requested.push(address);
      return port.request(address);
    },
    verify: (address, code) => port.verify(address, code),
  };
  const answer = (fn) => {
    cloudCalls.push(fn);
    const next = cloudAnswers?.[Math.min(answered, cloudAnswers.length - 1)] ?? { kind: 'ok', body: completeBody };
    answered += 1;
    return next;
  };
  const runtime = createAccountRuntime({
    sessions: createSecureSessionStore(secureStorage),
    sessionClient,
    providers: createProviderRegistry([createScriptedProvider('apple', { results: apple }), createScriptedProvider('google', { results: google })]),
    emailOtp,
    emailPassword: createScriptedEmailPassword(password),
    cloud: { bootstrapAccount: async () => answer('bootstrap'), claimLocalHousehold: async () => answer('claim') },
    identity: { current: () => staged, set: (next) => { staged = next; }, save: async () => {} },
    localState: () => createEmptyState(TZ),
    timezone: () => TZ,
    now: () => NOW,
    newClaimKey: () => '88888888-8888-4888-8888-888888888888',
  });
  offerProviders(offered);
  // Simulate the actual OS, not provider-discovery timing. Apple choice on iOS is mandatory.
  Platform.OS = offered.includes('apple') ? 'ios' : 'android';
  const host = installAccountHost(runtime);
  return { runtime, host, port, requested, cloudCalls, secureStorage, identity: () => staged };
}

// ---- reading and driving the rendered tree, exactly as tests/welcomeAuthShell.test.mjs does ----
const textOf = (children) =>
  Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children);
const shown = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children)).join(' | ');
const control = (r, label) => r.root.findAllByType('Pressable').find((n) => n.props.accessibilityLabel === label);
const disabled = (r, label) => control(r, label)?.props.accessibilityState?.disabled === true;
const field = (r) => r.root.findByType('TextInput');

/** Let the runtime's promise chains and React's effects run to quiescence. */
const settle = () =>
  TestRenderer.act(async () => {
    for (let turn = 0; turn < 8; turn++) await new Promise((resolve) => setImmediate(resolve));
  });

/** Every tree a test mounts is unmounted after it, as a screen is when she leaves it — so no listener outlives its test. */
const mounted = [];
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await TestRenderer.act(async () => {
      try {
        renderer.unmount();
      } catch {
        // Already unmounted by the test itself.
      }
    });
  }
});

async function open(mode = 'first-run') {
  const r = await render(<WelcomeAuthFlow mode={mode} />);
  mounted.push(r);
  await settle();
  return r;
}

/** Press a control the way a finger does: a disabled or absent control cannot be pressed. */
async function press(r, label) {
  const node = control(r, label);
  assert.ok(node, `no control labeled "${label}" — showing: ${shown(r)}`);
  assert.notEqual(node.props.accessibilityState?.disabled, true, `"${label}" is disabled`);
  await TestRenderer.act(async () => node.props.onPress());
  await settle();
}

async function type(r, text) {
  const input = field(r);
  await TestRenderer.act(async () => input.props.onChangeText(text));
}

const toAccountChoice = async (r) => {
  await press(r, COPY.welcome.begin);
  await press(r, 'Continue with Her Keys Free');
};
const toExistingAccount = async (r) => press(r, COPY.welcome.existingAccount);
/** Legacy OTP service regression only: this route is not exposed in the product's account choice. */
async function openLegacyOtpForBoundaryTest(r) {
  const shell = r.root.findByType(WelcomeAuthShell);
  await TestRenderer.act(async () => shell.props.onChooseEmail());
  await settle();
}
async function toCodeStep(r, address = EMAIL) {
  await toAccountChoice(r);
  await openLegacyOtpForBoundaryTest(r);
  await type(r, address);
  await press(r, COPY.email.continue);
}

describe('the first run: Welcome → account choice → authenticate', () => {
  test('new users see Premium before account choice; neither path authenticates by itself', async () => {
    const d = device();
    const r = await open();
    assert.match(shown(r), /Rebuild your life\.\nRun it your way\./);
    assert.equal(control(r, 'Continue with Google'), undefined, 'no method is offered before she begins');

    await press(r, COPY.welcome.begin);
    assert.ok(shown(r).includes('Her Keys Premium'));
    assert.ok(control(r, 'Explore Premium Plans'));
    assert.equal(control(r, 'Continue with Google'), undefined, 'auth must wait until after Premium');
    await press(r, 'Continue with Her Keys Free');
    assert.ok(shown(r).includes(COPY.accountChoice.signUpTitle));
    assert.ok(control(r, 'Continue with Google') && control(r, 'Continue with email'));
    assert.equal(d.runtime.getState().kind, 'unauthenticated', 'Begin authenticates nothing');
    assert.deepEqual([d.cloudCalls, d.secureStorage.contents(), d.identity()], [[], {}, UNBOUND_IDENTITY], 'and touches nothing');
  });

  test('NO GUEST PATH: the tree offers account methods and nothing else — no skip, no guest, no "not now"', async () => {
    device({ offered: ['apple', 'google'] });
    const r = await open();
    const labels = () => r.root.findAllByType('Pressable').map((n) => n.props.accessibilityLabel);
    assert.deepEqual(labels(), [COPY.welcome.begin, COPY.welcome.existingAccount]);
    await toAccountChoice(r);
    assert.deepEqual(labels(), [COPY.back, 'Continue with Apple', 'Continue with Google', 'Continue with email', COPY.accountChoice.legalTerms, COPY.accountChoice.legalPrivacy]);
    assert.doesNotMatch(shown(r), /guest|skip|not now|without an account/i);
  });

  test('iOS Apple choice remains visible without waiting for provider discovery', async () => {
    device({ offered: ['apple', 'google'] });
    const r = await open();
    await toAccountChoice(r);
    assert.ok(control(r, 'Continue with Apple'), 'Apple is mandatory on native iOS');
    assert.ok(control(r, 'Continue with Google'), 'Google remains an alternative');
    assert.ok(control(r, 'Continue with email'), 'email/password remains an alternative');
    assert.equal(control(r, COPY.password.choice), undefined, 'never show a second email path');
  });

  test('ANDROID offers Google and email, and never Apple; IOS offers Apple, Google and email, with the Apple disclosure', async () => {
    device({ offered: ['google'] });
    const android = await open();
    await toAccountChoice(android);
    assert.ok(control(android, 'Continue with Google') && control(android, 'Continue with email'));
    assert.equal(control(android, 'Continue with Apple'), undefined);
    assert.doesNotMatch(shown(android), /Apple/);
    assert.equal(shown(android).includes(CROSS_PLATFORM_NOTE), false, 'no note where Apple is not offered');

    device({ offered: ['apple', 'google'] });
    const ios = await open();
    await toAccountChoice(ios);
    const text = shown(ios);
    assert.ok(text.indexOf('Continue with Apple') < text.indexOf('Continue with Google') && text.indexOf('Continue with Google') < text.indexOf('Continue with email'));
    assert.ok(text.includes(CROSS_PLATFORM_NOTE), 'EX-01: the owner-approved Apple limitation is disclosed where Apple is offered');
  });
});

describe('email/password through the same runtime', () => {
  test('the ONE visible email choice opens sign-in/password directly, not the code screen', async () => {
    const d = device();
    const r = await open();
    await toAccountChoice(r);
    assert.ok(control(r, 'Continue with email'));
    assert.equal(control(r, COPY.password.choice), undefined, 'no second email choice');
    await press(r, 'Continue with email');
    assert.match(shown(r), /Create your account/);
    assert.equal(control(r, COPY.otp.verify), undefined, 'no verification-code form');
    assert.doesNotMatch(shown(r), /send a short code|no password to remember/i);
    assert.deepEqual(d.requested, [], 'do not ask the OTP service to send a code');
  });

  test('the new choice is offered and verified sign-in binds the real account', async () => {
    const d = device({ password: [success(ACCOUNT_A, 'email')] });
    const r = await open();
    await toExistingAccount(r);
    await press(r, 'Continue with email');
    assert.match(shown(r), /Welcome back/);
    const inputs = r.root.findAllByType('TextInput');
    assert.equal(inputs.length, 2);
    await TestRenderer.act(async () => inputs[0].props.onChangeText(EMAIL));
    await TestRenderer.act(async () => inputs[1].props.onChangeText('secret-password-for-tests'));
    await press(r, COPY.password.signIn);
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.equal(d.runtime.getState().session.provider.provider, 'email');
    assert.deepEqual(d.cloudCalls, ['bootstrap']);
  });

  test('reconnect permits email/password login, not registration as another person', async () => {
    device();
    const r = await open('reconnect');
    await press(r, 'Continue with email');
    assert.equal(control(r, COPY.password.tabSignUp), undefined);
    assert.match(shown(r), /Welcome back/);
  });

  test('signup requiring email confirmation never binds a household', async () => {
    const d = device({ password: [{ kind: 'confirmationRequired' }] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with email');
    const inputs = r.root.findAllByType('TextInput');
    assert.equal(inputs.length, 3);
    for (const [index, value] of [EMAIL, 'secret-password-for-tests', 'secret-password-for-tests'].entries()) {
      await TestRenderer.act(async () => inputs[index].props.onChangeText(value));
    }
    await press(r, COPY.password.create);
    assert.match(shown(r), /Check your email for an account confirmation link/);
    assert.equal(d.runtime.getState().kind, 'unauthenticated');
    assert.deepEqual(d.cloudCalls, []);
    assert.deepEqual(d.secureStorage.contents(), {});
  });
});

describe('Google and Apple, through the runtime', () => {
  test('GOOGLE SUCCESS: the tap becomes the runtime\'s sign-in, and a new account is bootstrapped and bound', async () => {
    const d = device();
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Google');

    const state = d.runtime.getState();
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.session.accountId, ACCOUNT_A);
    assert.equal(state.session.provider.provider, 'google');
    assert.deepEqual(d.cloudCalls, ['bootstrap']);
    assert.equal(d.identity().binding.accountId, ACCOUNT_A);
    assert.doesNotMatch(shown(r), /did not go through/);
  });

  test('APPLE SUCCESS on iOS takes the same path to the same kind of account', async () => {
    const d = device({ offered: ['apple', 'google'] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Apple');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.equal(d.runtime.getState().session.provider.provider, 'apple');
    assert.deepEqual(d.cloudCalls, ['bootstrap']);
  });

  test('CANCELLATION is not a failure: back at the account choice with no banner, no error state, and nothing mutated', async () => {
    for (const method of ['Google', 'Apple']) {
      const d = device({ google: [{ kind: 'cancelled' }], apple: [{ kind: 'cancelled' }], offered: ['apple', 'google'] });
      const r = await open();
      await toAccountChoice(r);
      await press(r, `Continue with ${method}`);

      assert.equal(d.runtime.getState().kind, 'unauthenticated', `${method}: not authError`);
      assert.ok(shown(r).includes(COPY.accountChoice.title), `${method}: still the account choice`);
      assert.doesNotMatch(shown(r), /did not go through|didn’t go through|try again|error|failed/i, `${method}: no failure presentation of any kind`);
      assert.equal(disabled(r, 'Continue with Google'), false, 'the choice is usable again at once');
      assert.deepEqual([d.cloudCalls, d.secureStorage.contents(), d.identity()], [[], {}, UNBOUND_IDENTITY], 'no account, credential, binding or household change');
    }
  });

  test('PROVIDER ERROR is calm and recoverable: one quiet line, nothing changed, and the next attempt works', async () => {
    const d = device({ google: [{ kind: 'providerError', detail: 'access_denied: the user denied access' }, success(ACCOUNT_A, 'google')] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Google');

    assert.equal(d.runtime.getState().kind, 'authError');
    assert.ok(shown(r).includes(COPY.accountChoice.attemptFailed));
    assert.doesNotMatch(shown(r), /access_denied|denied access/, 'the provider\'s own words are not shown to her');
    assert.deepEqual([d.cloudCalls, d.secureStorage.contents(), d.identity()], [[], {}, UNBOUND_IDENTITY]);

    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.equal(shown(r).includes(COPY.accountChoice.attemptFailed), false, 'the line is gone once an attempt succeeds');
  });

  test('a method this device cannot run fails the same calm way (Apple tapped where the adapter is unavailable)', async () => {
    const d = device({ apple: [{ kind: 'unavailable', detail: 'Sign in with Apple is not available' }], offered: ['apple', 'google'] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Apple');
    assert.equal(d.runtime.getState().kind, 'authError');
    assert.ok(shown(r).includes(COPY.accountChoice.attemptFailed));
  });

  test('BOUND_OTHER: another account on a bound device is quarantined by the runtime; the tree shows no error and reveals nothing', async () => {
    const d = device({ identity: boundTo(ACCOUNT_A), google: [success(ACCOUNT_B, 'google')] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Google');

    const state = d.runtime.getState();
    assert.equal(state.kind, 'boundOther');
    assert.equal(state.quarantinedAccountId, ACCOUNT_A);
    assert.deepEqual(d.cloudCalls, [], 'nothing is bootstrapped, claimed or merged');
    assert.equal(d.identity().binding.accountId, ACCOUNT_A, 'A\'s household is preserved');
    // The route table now opens the conflict screen and nothing else; this tree simply has nothing more to say.
    assert.doesNotMatch(shown(r), /did not go through/);
  });

  test('a sign-in whose binding did not finish says so, and choosing a method again starts clean and completes', async () => {
    const d = device({ cloudAnswers: [{ kind: 'unreachable', detail: 'offline' }, { kind: 'ok', body: completeBody }] });
    const r = await open();
    await toAccountChoice(r);
    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'authenticatedUnbound', 'signed in, but no household is held yet');
    assert.ok(shown(r).includes(COPY.accountChoice.attemptFailed));

    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.deepEqual(d.cloudCalls, ['bootstrap', 'bootstrap'], 'the same bootstrap, retried — not a second household');
  });
});

describe('email, through the runtime', () => {
  test('EMAIL OTP END TO END: address → real request → code step → real verify → bound, keyed on the user id', async () => {
    const d = device({ email: { verifications: [success(ACCOUNT_A, 'email')] } });
    const r = await open();
    await toAccountChoice(r);
    await openLegacyOtpForBoundaryTest(r);
    assert.match(shown(r), /What’s your email\?/);

    await type(r, EMAIL);
    await press(r, COPY.email.continue);
    assert.deepEqual(d.requested, [EMAIL], 'the request carries the address exactly as typed');
    assert.ok(shown(r).includes(COPY.otp.lede(EMAIL)));
    assert.equal(d.runtime.getState().kind, 'unauthenticated', 'a sent code is not a session');

    assert.equal(disabled(r, COPY.otp.verify), true, 'Verify waits for a complete code');
    await type(r, CODE);
    await press(r, COPY.otp.verify);

    const state = d.runtime.getState();
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.session.accountId, ACCOUNT_A);
    assert.equal(state.session.provider.provider, 'email');
    assert.deepEqual(d.port.calls(), { request: 1, verify: 1 });
    assert.deepEqual(d.cloudCalls, ['bootstrap']);
    const kept = JSON.stringify([d.secureStorage.contents(), d.identity(), d.host.getSnapshot()]);
    assert.equal(kept.includes(CODE) || kept.toLowerCase().includes(EMAIL.toLowerCase()), false, 'neither the code nor the address is kept');
  });

  test('an obviously malformed address never leaves the device', async () => {
    const d = device();
    const r = await open();
    await toAccountChoice(r);
    await openLegacyOtpForBoundaryTest(r);
    await type(r, 'not-an-email');
    await press(r, COPY.email.continue);
    assert.ok(shown(r).includes(COPY.email.invalid));
    assert.deepEqual(d.requested, []);
  });

  test('a send that fails is one calm inline line, the address stays, and trying again asks again — once per press', async () => {
    for (const refusal of [{ kind: 'unreachable', detail: 'status_0' }, { kind: 'rateLimited', detail: 'over_email_send_rate_limit' }, { kind: 'rejected', detail: 'signup_disabled' }]) {
      const d = device({ email: { requests: [refusal, { kind: 'sent' }] } });
      const r = await open();
      await toCodeStep(r);
      assert.match(shown(r), /What’s your email\?/, `${refusal.kind}: still on the email step`);
      assert.ok(shown(r).includes(COPY.email.sendFailed), refusal.kind);
      assert.equal(field(r).props.value, EMAIL, 'what she typed is untouched');
      assert.equal(d.requested.length, 1, `${refusal.kind}: refused once, not retried behind her back`);

      await press(r, COPY.email.continue);
      assert.equal(d.requested.length, 2);
      assert.ok(shown(r).includes(COPY.otp.lede(EMAIL)));
    }
  });

  test('an address the auth service itself refuses as invalid reads as an invalid address', async () => {
    device({ email: { requests: [{ kind: 'rejected', detail: 'email_address_invalid' }] } });
    const r = await open();
    await toCodeStep(r);
    assert.ok(shown(r).includes(COPY.email.invalid));
  });

  test('WRONG OR EXPIRED CODE: one honest inline line (the service does not say which), still on the code step, and the next code works', async () => {
    const d = device({ email: { verifications: [{ kind: 'codeRejected', detail: 'otp_expired' }, success(ACCOUNT_A, 'email')] } });
    const r = await open();
    await toCodeStep(r);
    await type(r, '000000');
    await press(r, COPY.otp.verify);

    assert.ok(shown(r).includes(COPY.otp.invalidOrExpired));
    assert.equal(shown(r).includes(COPY.otp.wrongCode) || shown(r).includes(COPY.otp.expiredCode), false, 'neither claim is made on the service\'s behalf');
    assert.match(shown(r), /Enter your code/);
    assert.equal(d.runtime.getState().kind, 'unauthenticated', 'not an account failure');
    assert.deepEqual([d.cloudCalls, d.secureStorage.contents()], [[], {}]);

    await type(r, CODE);
    await press(r, COPY.otp.verify);
    assert.equal(d.runtime.getState().kind, 'accountBound');
  });

  test('a code check that cannot reach the service, or is rate limited, is the calm generic line — not "wrong code"', async () => {
    for (const failure of [{ kind: 'unreachable', detail: 'status_0' }, { kind: 'rateLimited', detail: 'status_429' }, { kind: 'failed', detail: 'no_session' }]) {
      const d = device({ email: { verifications: [failure] } });
      const r = await open();
      await toCodeStep(r);
      await type(r, CODE);
      await press(r, COPY.otp.verify);
      assert.ok(shown(r).includes(COPY.otp.verifyFailed), failure.kind);
      assert.equal(shown(r).includes(COPY.otp.invalidOrExpired), false, failure.kind);
      assert.equal(d.runtime.getState().kind, 'unauthenticated');
      assert.equal(d.port.calls().verify, 1, `${failure.kind}: not retried`);
    }
  });

  test('RESEND: a visible 30-second courtesy cooldown, then the same real request again; a rate-limit refusal is shown, never retried', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: NOW });
    const d = device({ email: { requests: [{ kind: 'sent' }, { kind: 'sent' }, { kind: 'rateLimited', detail: 'over_email_send_rate_limit' }] } });
    const r = await open();
    await toCodeStep(r);

    const tick = (seconds) => TestRenderer.act(async () => t.mock.timers.tick(seconds * 1000));
    assert.ok(control(r, COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS)), 'the cooldown starts when the code is sent');
    assert.equal(disabled(r, COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS)), true);

    await tick(10);
    assert.ok(control(r, COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS - 10)), 'and counts down');
    await tick(RESEND_COOLDOWN_SECONDS - 10);
    assert.equal(disabled(r, COPY.otp.resend), false, 'then Resend is offered');

    await press(r, COPY.otp.resend);
    assert.deepEqual(d.requested, [EMAIL, EMAIL], 'a resend is the real request, for the same address');
    assert.equal(disabled(r, COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS)), true, 'and the cooldown starts again');
    assert.doesNotMatch(shown(r), /didn’t go through/);

    await tick(RESEND_COOLDOWN_SECONDS);
    await press(r, COPY.otp.resend);
    assert.equal(d.requested.length, 3);
    assert.ok(shown(r).includes(COPY.otp.verifyFailed), 'the service\'s refusal is shown calmly, inline');
    assert.equal(disabled(r, COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS)), true, 'and Resend is not offered again straight away');
    await tick(5);
    await settle();
    assert.equal(d.requested.length, 3, 'nothing asks again on its own');
    t.mock.timers.reset();
  });

  test('CHANGE EMAIL returns to the address step with what she typed, and a new address is what gets asked for', async () => {
    const d = device();
    const r = await open();
    await toCodeStep(r);
    await press(r, COPY.otp.changeEmail);
    assert.match(shown(r), /What’s your email\?/);
    assert.equal(field(r).props.value, EMAIL);

    await type(r, 'second@example.test');
    await press(r, COPY.email.continue);
    assert.deepEqual(d.requested, [EMAIL, 'second@example.test']);
    assert.ok(shown(r).includes(COPY.otp.lede('second@example.test')));
  });

  test('a verified code for ANOTHER account on a bound device is quarantined, exactly as a provider sign-in is', async () => {
    const d = device({ identity: boundTo(ACCOUNT_A), email: { verifications: [success(ACCOUNT_B, 'email')] } });
    const r = await open();
    await toCodeStep(r);
    await type(r, CODE);
    await press(r, COPY.otp.verify);
    assert.equal(d.runtime.getState().kind, 'boundOther');
    assert.deepEqual(d.cloudCalls, []);
    assert.equal(d.identity().binding.accountId, ACCOUNT_A);
  });
});

describe('back, on screen and on the Android hardware key', () => {
  const hardwareBack = async () => {
    let handled;
    await TestRenderer.act(async () => {
      handled = BackHandler.__press();
    });
    return handled;
  };

  test('each step goes back one step, the address survives, and Welcome is the root', async () => {
    device();
    const r = await open();
    assert.equal(control(r, COPY.back), undefined, 'Welcome has no back control');
    await toCodeStep(r);

    await press(r, COPY.back);
    assert.match(shown(r), /What’s your email\?/);
    assert.equal(field(r).props.value, EMAIL, 'the code step returns to the address, preserved');
    await press(r, COPY.back);
    assert.ok(shown(r).includes(COPY.accountChoice.title));
    await press(r, COPY.back);
    assert.match(shown(r), /Rebuild your life/);
    assert.equal(control(r, COPY.back), undefined);
  });

  test('hardware Back follows the same rule, and at Welcome it is left to the system — there is no audit behind it to fall into', async () => {
    device();
    const r = await open();
    assert.equal(await hardwareBack(), false, 'at the root the press is not consumed: the system leaves the app');
    assert.match(shown(r), /Rebuild your life/);

    await toCodeStep(r);
    assert.equal(await hardwareBack(), true);
    assert.match(shown(r), /What’s your email\?/);
    assert.equal(await hardwareBack(), true);
    assert.ok(shown(r).includes(COPY.accountChoice.title));
    assert.equal(await hardwareBack(), true);
    assert.match(shown(r), /Rebuild your life/);
    assert.equal(await hardwareBack(), false);
  });

  test('the hardware listener is removed with the screen', async () => {
    device();
    const before = BackHandler.__count();
    const r = await open();
    assert.equal(BackHandler.__count(), before + 1);
    await TestRenderer.act(async () => r.unmount());
    assert.equal(BackHandler.__count(), before);
  });
});

describe('reconnect: a bound household whose credential lapsed', () => {
  /** Restore a stored credential that the auth service now refuses: bound, and degraded. */
  async function degradedDevice(options = {}) {
    let first = true;
    const sessionClient = {
      async activate(session) {
        if (first) {
          first = false;
          return { kind: 'invalid', detail: 'refresh token revoked' };
        }
        return { kind: 'active', session };
      },
      signOut: async () => ({ kind: 'ok' }),
      startAutoRefresh() {},
      stopAutoRefresh() {},
      subscribe: () => () => undefined,
    };
    const d = device({ identity: boundTo(ACCOUNT_A), secureInitial: { [SECURE_SESSION_KEY]: JSON.stringify(sessionFor(ACCOUNT_A, 'email')) }, sessionClient, ...options });
    await TestRenderer.act(async () => {
      await d.runtime.restore();
    });
    assert.equal(d.runtime.getState().kind, 'authDegraded');
    return d;
  }

  test('it opens on the calm reconnect header and the same choice — no Welcome, no back, and no "choose Google" nudge', async () => {
    await degradedDevice({ offered: ['apple', 'google'] });
    const r = await open('reconnect');
    const text = shown(r);
    assert.ok(text.includes('Nothing on this device was removed'));
    assert.doesNotMatch(text, /Rebuild your life/);
    assert.equal(control(r, COPY.back), undefined);
    assert.ok(control(r, 'Continue with Apple') && control(r, 'Continue with Google') && control(r, 'Continue with email'));
    assert.equal(text.includes(CROSS_PLATFORM_NOTE), false, 'a reconnect must return to the SAME account');
  });

  test('AN EMAIL ACCOUNT CAN RECONNECT: code step, verify, and the same account is bound again with no claim', async () => {
    const d = await degradedDevice({ email: { verifications: [success(ACCOUNT_A, 'email')] } });
    const r = await open('reconnect');
    await openLegacyOtpForBoundaryTest(r);
    assert.ok(control(r, COPY.back), 'the email step can go back to the reconnect choice');
    await type(r, EMAIL);
    await press(r, COPY.email.continue);
    await type(r, CODE);
    await press(r, COPY.otp.verify);

    const state = d.runtime.getState();
    assert.equal(state.kind, 'accountBound');
    assert.equal(state.householdId, HOUSEHOLD_A);
    assert.deepEqual(d.cloudCalls, [], 'reconnecting is not claiming');
  });

  test('another account\'s code does not reconnect it: back at the reconnect choice, calmly, with the household still hers', async () => {
    const d = await degradedDevice({ email: { verifications: [success(ACCOUNT_B, 'email')] } });
    const r = await open('reconnect');
    await openLegacyOtpForBoundaryTest(r);
    await type(r, 'other@example.test');
    await press(r, COPY.email.continue);
    await type(r, CODE);
    await press(r, COPY.otp.verify);

    assert.equal(d.runtime.getState().kind, 'authDegraded');
    assert.equal(d.runtime.getState().accountId, ACCOUNT_A);
    assert.ok(shown(r).includes('Nothing on this device was removed'), 'the reconnect choice again');
    assert.ok(shown(r).includes(COPY.accountChoice.attemptFailed));
    assert.equal(d.identity().binding.accountId, ACCOUNT_A);
    assert.equal(d.identity().quarantine, null);
  });

  test('a provider reconnect for the same account recovers it in place', async () => {
    const d = await degradedDevice({ google: [success(ACCOUNT_A, 'google')] });
    const r = await open('reconnect');
    await press(r, 'Continue with Google');
    assert.equal(d.runtime.getState().kind, 'accountBound');
    assert.deepEqual(d.cloudCalls, []);
  });
});

describe('the controller model, pure', () => {
  const at = (step, over = {}) => ({ ...initialWelcomeFlow('first-run'), step, ...over });

  test('the first run starts at Welcome; a reconnect starts at the choice, which is its root', () => {
    assert.equal(initialWelcomeFlow('first-run').step, 'welcome');
    assert.equal(initialWelcomeFlow('reconnect').step, 'account-choice');
    assert.equal(welcomeFlowBackTarget(initialWelcomeFlow('first-run')), null);
    assert.equal(welcomeFlowBackTarget(initialWelcomeFlow('reconnect')), null);
    assert.equal(welcomeFlowBackTarget(at('otp')), 'email');
    assert.equal(welcomeFlowBackTarget(at('otp', { inFlight: 'email' })), null, 'nothing moves while a request is out');
  });

  test('only one thing is ever in flight: a second start while waiting is ignored', () => {
    const waiting = at('account-choice', { inFlight: 'google' });
    for (const event of [{ type: 'providerStarted', method: 'apple' }, { type: 'chooseEmail' }, { type: 'emailSubmitted', email: 'x@y.zz' }, { type: 'codeSubmitted' }, { type: 'resendStarted' }, { type: 'back' }]) {
      assert.deepEqual(welcomeFlowReducer(waiting, event), waiting, event.type);
    }
  });

  test('Premium opens only after Get Started; returning users bypass it', () => {
    const start = initialWelcomeFlow('first-run');
    const newUser = welcomeFlowReducer(start, { type: 'begin' });
    const returning = welcomeFlowReducer(start, { type: 'existingAccount' });
    assert.equal(newUser.step, 'premium');
    assert.equal(newUser.passwordMode, 'signUp');
    assert.equal(returning.step, 'account-choice');
    assert.equal(returning.passwordMode, 'signIn');
    assert.equal(welcomeFlowBackTarget(newUser), 'welcome');
    assert.equal(welcomeFlowBackTarget(returning), 'welcome');
    assert.equal(welcomeFlowReducer(initialWelcomeFlow('reconnect'), { type: 'begin' }).step, 'account-choice');
  });

  test('Premium outcomes advance only after an actual purchase/restore or free choice', () => {
    const intro = welcomeFlowReducer(initialWelcomeFlow('first-run'), { type: 'begin' });
    const waiting = welcomeFlowReducer(intro, { type: 'premiumStarted' });
    assert.equal(waiting.premiumBusy, true);
    assert.equal(welcomeFlowBackTarget(waiting), null);
    assert.deepEqual(welcomeFlowReducer(waiting, { type: 'premiumContinueFree' }), waiting);
    const cancelled = welcomeFlowReducer(waiting, { type: 'premiumSettled', outcome: 'cancelled' });
    assert.equal(cancelled.step, 'premium');
    assert.equal(cancelled.premiumNotice, null);
    const missing = welcomeFlowReducer(waiting, { type: 'premiumSettled', outcome: 'no_offering' });
    assert.equal(missing.step, 'premium');
    assert.equal(missing.premiumNotice, 'no_offering');
    assert.equal(welcomeFlowReducer(missing, { type: 'premiumContinueFree' }).step, 'account-choice');
    for (const outcome of ['purchased', 'restored', 'already_entitled']) {
      const next = welcomeFlowReducer(waiting, { type: 'premiumSettled', outcome });
      assert.equal(next.step, 'account-choice', outcome);
      assert.equal(next.premiumBusy, false);
    }
    assert.deepEqual(welcomeFlowReducer(waiting, { type: 'premiumStarted' }), waiting);
  });

  test('a cancellation never sets the failure line; an auth error or an unfinished binding does', () => {
    const waiting = at('account-choice', { inFlight: 'google' });
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'unauthenticated' }).attemptFailed, false);
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'accountBound' }).attemptFailed, false);
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'boundOther' }).attemptFailed, false);
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'authDegraded' }).attemptFailed, false, 'a cancelled reconnect is still just a cancellation');
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'authError' }).attemptFailed, true);
    assert.equal(welcomeFlowReducer(waiting, { type: 'providerSettled', account: 'authenticatedUnbound' }).attemptFailed, true);
  });

  test('the view never invents settling or conflict, and the cooldown is whole seconds that end in null', () => {
    const sent = welcomeFlowReducer(at('email', { inFlight: 'email', email: EMAIL }), { type: 'emailRequestSettled', result: { kind: 'sent' }, now: NOW });
    assert.equal(sent.step, 'otp');
    assert.equal(welcomeFlowView(sent, 'android', NOW).resendSecondsLeft, RESEND_COOLDOWN_SECONDS);
    assert.equal(welcomeFlowView(sent, 'android', NOW + 29_001).resendSecondsLeft, 1);
    assert.equal(welcomeFlowView(sent, 'android', NOW + 30_000).resendSecondsLeft, null);
    assert.equal(welcomeFlowView(sent, 'android', NOW + 3_600_000).resendSecondsLeft, null, 'after a long background, Resend is simply available');
    for (const mode of ['first-run', 'reconnect']) {
      for (const step of ['welcome', 'premium', 'account-choice', 'email', 'otp']) {
        const presentation = welcomeFlowView({ ...initialWelcomeFlow(mode), step }, 'ios', NOW).presentation;
        assert.ok(presentation === 'normal' || presentation === 'auth-degraded', `${mode} ${step}`);
      }
    }
  });

  test('the model holds no code: no event carries one, and no state field could keep one', () => {
    const source = readFileSync('src/features/account/welcomeFlowModel.ts', 'utf8').replace(/\r\n/g, '\n');
    const events = /export type WelcomeFlowEvent =([\s\S]*?);\n\nexport function/.exec(source)[1];
    assert.doesNotMatch(events, /code\s*:|token\s*:|otp\s*:/i, 'no event has a code, token or otp field');
    assert.equal(Object.prototype.hasOwnProperty.call(initialWelcomeFlow('first-run'), 'password'), false, 'password text never enters the controller');
    assert.deepEqual(Object.keys(initialWelcomeFlow('first-run')).sort(), ['attemptFailed', 'email', 'emailError', 'inFlight', 'mode', 'otpError', 'passwordMode', 'passwordNotice', 'premiumBusy', 'premiumNotice', 'resendAvailableAt', 'step']);
  });
});

describe('settling, and the production wiring behind the stand-in', () => {
  test('SETTLING shows the shell\'s own progress presentation: no step, no method, no Welcome, and nothing pressable', async () => {
    device();
    const r = await render(<WelcomeAuthSettling />);
    assert.match(shown(r), /Getting things ready…/);
    assert.doesNotMatch(shown(r), /Continue with|Rebuild your life|Begin/);
    assert.deepEqual(r.root.findAllByType('Pressable'), []);
  });

  test('the production provider forwards to the ONE runtime exactly as the test stand-in does, and derives `settled` from the restore', () => {
    const provider = readFileSync('src/store/AccountProvider.tsx', 'utf8');
    assert.match(provider, /signIn: \(provider\) => run\(\(\) => accountRuntime\.signIn\(provider\)\)/);
    assert.match(provider, /signOut: \(\) => run\(\(\) => accountRuntime\.signOut\(\)\)/);
    assert.match(provider, /requestEmailOtp: \(email\) => accountRuntime\.requestEmailOtp\(email\)/);
    assert.match(provider, /const verified = await accountRuntime\.verifyEmailOtp\(email, code\);/);
    assert.match(provider, /emailAvailable: accountRuntime\.emailOtpAvailable\(\)/);
    // Settled is in memory, false until the restore resolves (however it resolves), and true at once only where there is
    // no account backend to restore from.
    assert.match(provider, /const \[settled, setSettled\] = useState\(!accountsAvailable\);/);
    assert.match(provider, /\.finally\(\(\) => \{\s*if \(!live\) return;\s*setBusy\(false\);[\s\S]*?setSettled\(true\);/);
    assert.doesNotMatch(provider, /AsyncStorage|SecureStore|localStorage/, 'nothing about settling is persisted');
  });

  test('the flow reaches the runtime only through useAccount, routes nothing, and touches no onboarding state', () => {
    const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const file of ['src/features/account/WelcomeAuthFlow.tsx', 'src/features/account/welcomeFlowModel.ts']) {
      const source = strip(readFileSync(file, 'utf8'));
      assert.doesNotMatch(source, /expo-router|router\.|<Redirect|useOnboarding|recordStep|completeOnboarding|store\.dispatch|store\.commit/, file);
      // (The model imports one TYPE from the runtime module; what is refused is holding or calling a runtime.)
      assert.doesNotMatch(source, /@supabase|supabase|SecureStore|AsyncStorage|accountRuntime\.|accountRuntime;|createAccountRuntime/, file);
      assert.doesNotMatch(source, /Platform\./, `${file}: which methods to offer is asked of the adapters, not of the OS`);
      assert.doesNotMatch(source, /console\./, file);
    }
    assert.match(strip(readFileSync('src/features/account/WelcomeAuthFlow.tsx', 'utf8')), /const account = useAccount\(\);/);
  });
});
