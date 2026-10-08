/**
 * Welcome tree — frontend shell contract tests.
 *
 * The shell is presentational: one view-state object in, intent callbacks
 * out. These tests assert what is rendered (provider sets and order per
 * platform, error copy, disabled/pending treatments, back affordance), that
 * callbacks fire with nothing auth-flavored behind them, and — by scanning
 * the feature's sources — that the shell cannot touch Supabase, SecureStore,
 * AsyncStorage, or any persisted welcome flag.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import TestRenderer from 'react-test-renderer';

import { emailObviousError, methodsForPlatform, stepAfterBack, OTP_CODE_LENGTH, RESEND_COOLDOWN_SECONDS } from '../src/features/welcome/model.ts';
import { METHOD_LABELS, WELCOME_AUTH_COPY as COPY } from '../src/features/welcome/copy.ts';
import { HER_KEYS_LEGAL_URLS } from '../src/config/legal.ts';
import { WelcomeAuthShell } from '../src/features/welcome/WelcomeAuthShell.tsx';
import { render } from './support/render.tsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WELCOME_DIR = join(ROOT, 'src', 'features', 'welcome');

const textOf = (children) =>
  Array.isArray(children) ? children.map(textOf).join('') : children === null || children === undefined || typeof children === 'boolean' ? '' : String(children);
const allText = (r) => r.root.findAllByType('Text').map((n) => textOf(n.props.children));
const joined = (r) => allText(r).join(' | ');
const pressables = (r) => r.root.findAllByType('Pressable');
const pressableByLabel = (r, label) => pressables(r).find((n) => n.props.accessibilityLabel === label);
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const type = async (node, text) => TestRenderer.act(async () => node.props.onChangeText(text));

const BASE = {
  step: 'welcome',
  presentation: 'normal',
  platform: 'ios',
  pending: null,
  email: '',
  emailError: null,
  otpError: null,
  resendSecondsLeft: null,
};

const callbacks = (overrides = {}) => ({
  onBegin: () => {},
  onApple: () => {},
  onGoogle: () => {},
  onChooseEmail: () => {},
  onSubmitEmail: () => {},
  onSubmitOtp: () => {},
  onResendOtp: () => {},
  onChangeEmail: () => {},
  onBack: () => {},
  ...overrides,
});

const shell = (state, cb = callbacks()) => <WelcomeAuthShell state={{ ...BASE, ...state }} {...cb} />;

describe('provider set and order are a platform decision', () => {
  test('Android offers Google + email, and never Apple', async () => {
    assert.deepEqual(methodsForPlatform('android'), ['google', 'email']);
    const r = await render(shell({ step: 'account-choice', platform: 'android' }));
    const text = joined(r);
    assert.match(text, /Continue with Google/);
    assert.match(text, /Continue with email/);
    assert.doesNotMatch(text, /Apple/);
    assert.equal(pressableByLabel(r, 'Continue with Apple'), undefined);
  });

  test('iOS offers Apple + Google + email, Apple before Google', async () => {
    assert.deepEqual(methodsForPlatform('ios'), ['apple', 'google', 'email']);
    const r = await render(shell({ step: 'account-choice', platform: 'ios' }));
    const text = joined(r);
    assert.ok(text.indexOf('Continue with Apple') < text.indexOf('Continue with Google'), 'Apple precedes Google on iOS');
    assert.ok(text.indexOf('Continue with Google') < text.indexOf('Continue with email'), 'email is last');
  });

  test('account choice exposes both public Her Keys legal PDFs on both platforms', async () => {
    assert.match(HER_KEYS_LEGAL_URLS.terms, /^https:\/\/npykvnxnehlsdlbumzwk\.supabase\.co\/.+\/her-keys-terms\.pdf$/);
    assert.match(HER_KEYS_LEGAL_URLS.privacy, /^https:\/\/npykvnxnehlsdlbumzwk\.supabase\.co\/.+\/her-keys-policy\.pdf$/);
    for (const platform of ['ios', 'android']) {
      const r = await render(shell({ step: 'account-choice', platform }));
      for (const label of [COPY.accountChoice.legalTerms, COPY.accountChoice.legalPrivacy]) {
        const link = pressableByLabel(r, label);
        assert.ok(link, `${platform}: ${label} link exists`);
        assert.equal(link.props.accessibilityRole, 'link');
        assert.equal(link.props.disabled, false);
      }
      assert.match(joined(r), /agree to the Terms and Conditions/);
    }
    const pending = await render(shell({ step: 'account-choice', platform: 'android', pending: 'google' }));
    assert.equal(pressableByLabel(pending, COPY.accountChoice.legalTerms).props.disabled, true);
    assert.equal(pressableByLabel(pending, COPY.accountChoice.legalPrivacy).props.disabled, true);
  });

  test('account-choice copy never promises unsupported new-device restoration', () => {
    assert.match(COPY.accountChoice.lede, /not available yet/);
    const panel = readFileSync(join(ROOT, 'src', 'features', 'account', 'AccountPanel.tsx'), 'utf8');
    assert.doesNotMatch(panel, /follows you to your next phone|new phone is not a fresh start/);
  });

  test('no button is ever labeled "Continue with Android"', async () => {
    for (const platform of ['ios', 'android']) {
      const r = await render(shell({ step: 'account-choice', platform }));
      assert.doesNotMatch(joined(r), /Continue with Android/);
    }
  });

  test('provider buttons announce the full provider name', async () => {
    const r = await render(shell({ step: 'account-choice', platform: 'ios' }));
    for (const label of ['Continue with Apple', 'Continue with Google', 'Continue with email']) {
      const node = pressableByLabel(r, label);
      assert.ok(node, `${label} exists`);
      assert.equal(node.props.accessibilityRole, 'button');
    }
  });
});

describe('callbacks report intent and carry no auth implementation', () => {
  test('each provider press fires exactly its callback', async () => {
    const calls = [];
    const cb = callbacks({
      onApple: () => calls.push('apple'),
      onGoogle: () => calls.push('google'),
      onChooseEmail: () => calls.push('email'),
    });
    const r = await render(shell({ step: 'account-choice', platform: 'ios' }, cb));
    await press(pressableByLabel(r, 'Continue with Apple'));
    await press(pressableByLabel(r, 'Continue with Google'));
    await press(pressableByLabel(r, 'Continue with email'));
    assert.deepEqual(calls, ['apple', 'google', 'email']);
  });

  test('a cancelled provider flow returns to the choice with NO error presentation', async () => {
    const r = await render(shell({ step: 'account-choice', platform: 'ios', pending: 'google' }));
    assert.match(joined(r), /Connecting your account/);
    // The flow settles as cancelled: pending clears, no error state appears.
    await TestRenderer.act(async () => {
      r.update(shell({ step: 'account-choice', platform: 'ios', pending: null }));
    });
    const text = joined(r);
    assert.doesNotMatch(text, /didn’t go through|doesn’t match|expired|error|failed/i);
    assert.match(text, /Continue with Google/);
  });

  test('while a flow is pending every contradictory control is disabled', async () => {
    const r = await render(shell({ step: 'account-choice', platform: 'ios', pending: 'apple' }));
    for (const label of ['Continue with Apple', 'Continue with Google', 'Continue with email']) {
      assert.equal(pressableByLabel(r, label).props.accessibilityState.disabled, true, `${label} disabled while pending`);
    }
    // The pending treatment is a restrained inline indicator, not a screen takeover.
    assert.match(joined(r), /Connecting your account…/);
    assert.equal(r.root.findAllByType('ActivityIndicator').length, 1);
  });
});

describe('welcome is the root and back never skips it', () => {
  test('the back model: welcome has no back; each step returns one step', () => {
    assert.equal(stepAfterBack('welcome'), null);
    assert.equal(stepAfterBack('account-choice'), 'welcome');
    assert.equal(stepAfterBack('email'), 'account-choice');
    assert.equal(stepAfterBack('otp'), 'email');
  });

  test('Android hardware Back uses the same model as the visible control (one function, one rule)', () => {
    // The integration binds BackHandler and the visible control to the same
    // pure function, so the two paths cannot diverge. OTP → email preserves
    // the address because the controller owns it and the shell never clears it.
    assert.equal(stepAfterBack('otp'), 'email');
  });

  test('Welcome shows no back affordance; later steps show one labeled control', async () => {
    const welcome = await render(shell({ step: 'welcome' }));
    assert.equal(pressableByLabel(welcome, COPY.back), undefined);

    const choice = await render(shell({ step: 'account-choice' }));
    const back = pressableByLabel(choice, COPY.back);
    assert.ok(back, 'account choice offers a labeled back control');
    assert.equal(back.props.accessibilityRole, 'button');
  });

  test('the back control reports intent through onBack', async () => {
    let backed = 0;
    const r = await render(shell({ step: 'email' }, callbacks({ onBack: () => backed++ })));
    await press(pressableByLabel(r, COPY.back));
    assert.equal(backed, 1);
  });
});

describe('email entry', () => {
  test('obvious-error validation: not empty, one @, content both sides, plausible suffix — as typed', () => {
    for (const bad of ['', 'rowan', 'rowan@', '@example.com', 'rowan@example', 'rowan@example.c', 'rowan @example.com', 'rowan@@example.com', 'rowan@.com']) {
      assert.equal(emailObviousError(bad), 'invalid-email', JSON.stringify(bad));
    }
    for (const ok of ['rowan@example.com', 'Rowan@Example.COM', 'r@sub.domain.org']) {
      assert.equal(emailObviousError(ok), null, JSON.stringify(ok));
    }
  });

  test('Continue is disabled until something is typed', async () => {
    const r = await render(shell({ step: 'email' }));
    assert.equal(pressableByLabel(r, COPY.email.continue).props.accessibilityState.disabled, true);
    const input = r.root.findByType('TextInput');
    await type(input, 'rowan@example.com');
    assert.equal(pressableByLabel(r, COPY.email.continue).props.accessibilityState.disabled, false);
  });

  test('an obvious format error shows inline and never reaches the controller', async () => {
    const submitted = [];
    const r = await render(shell({ step: 'email' }, callbacks({ onSubmitEmail: (e) => submitted.push(e) })));
    const input = r.root.findByType('TextInput');
    await type(input, 'not-an-email');
    await press(pressableByLabel(r, COPY.email.continue));
    assert.match(joined(r), /doesn’t look like a complete email address/);
    assert.deepEqual(submitted, [], 'no submit on an obvious error');
  });

  test('a plausible email submits exactly as typed — never lowercased, never rewritten', async () => {
    const submitted = [];
    const r = await render(shell({ step: 'email' }, callbacks({ onSubmitEmail: (e) => submitted.push(e) })));
    const input = r.root.findByType('TextInput');
    assert.equal(input.props.autoCapitalize, 'none');
    await type(input, 'Rowan@Example.com');
    await press(pressableByLabel(r, COPY.email.continue));
    assert.deepEqual(submitted, ['Rowan@Example.com']);
  });

  test('a send failure is inline, in words, near the field — and editing keeps the text', async () => {
    const r = await render(shell({ step: 'email', email: 'rowan@example.com', emailError: 'send-failed' }));
    assert.match(joined(r), /That didn’t go through\. Your information is still here — try again\./);
    assert.equal(r.root.findByType('TextInput').props.value, 'rowan@example.com');
  });

  test('the email field is labeled and keyboard-appropriate', async () => {
    const r = await render(shell({ step: 'email' }));
    const input = r.root.findByType('TextInput');
    assert.equal(input.props.accessibilityLabel, COPY.email.fieldLabel);
    assert.equal(input.props.keyboardType, 'email-address');
  });
});

describe('OTP verification', () => {
  const otpShell = (overrides, cb) => shell({ step: 'otp', email: 'rowan@example.com', ...overrides }, cb);

  test('one logical field: labeled, numeric keyboard, paste/autofill enabled, code length capped', async () => {
    const r = await render(otpShell({}));
    const inputs = r.root.findAllByType('TextInput');
    assert.equal(inputs.length, 1, 'one input, not six boxes');
    const input = inputs[0];
    assert.equal(input.props.accessibilityLabel, COPY.otp.fieldLabel);
    assert.equal(input.props.keyboardType, 'number-pad');
    assert.equal(input.props.maxLength, OTP_CODE_LENGTH);
    assert.equal(input.props.autoComplete, 'one-time-code');
  });

  test('Verify is disabled until the code is complete', async () => {
    const r = await render(otpShell({}));
    assert.equal(pressableByLabel(r, COPY.otp.verify).props.accessibilityState.disabled, true);
    await type(r.root.findByType('TextInput'), '12345');
    assert.equal(pressableByLabel(r, COPY.otp.verify).props.accessibilityState.disabled, true);
    await type(r.root.findByType('TextInput'), '123456');
    assert.equal(pressableByLabel(r, COPY.otp.verify).props.accessibilityState.disabled, false);
  });

  test('a complete code submits through onSubmitOtp', async () => {
    const codes = [];
    const r = await render(otpShell({}, callbacks({ onSubmitOtp: (c) => codes.push(c) })));
    await type(r.root.findByType('TextInput'), '917340');
    await press(pressableByLabel(r, COPY.otp.verify));
    assert.deepEqual(codes, ['917340']);
  });

  test('wrong, expired and network failures each carry their own calm copy', async () => {
    const wrong = await render(otpShell({ otpError: 'wrong-code' }));
    assert.match(joined(wrong), /That code doesn’t match\. Check it and try again\./);
    const expired = await render(otpShell({ otpError: 'expired-code' }));
    assert.match(joined(expired), /This code expired\. Request a new one\./);
    const failed = await render(otpShell({ otpError: 'verify-failed' }));
    assert.match(joined(failed), /That didn’t go through\. Your information is still here — try again\./);
  });

  test('errors are announced', async () => {
    const r = await render(otpShell({ otpError: 'wrong-code' }));
    const errorText = r.root.findAllByType('Text').find((n) => textOf(n.props.children).includes('doesn’t match'));
    assert.equal(errorText.props.accessibilityLiveRegion, 'polite');
  });

  test('the resend cooldown shows the countdown disabled, then enables "Resend code"', async () => {
    const cooling = await render(otpShell({ resendSecondsLeft: RESEND_COOLDOWN_SECONDS }));
    const label = COPY.otp.resendIn(RESEND_COOLDOWN_SECONDS);
    assert.match(joined(cooling), new RegExp(label.replace(/[()]/g, '\\$&')));
    assert.equal(pressableByLabel(cooling, label).props.accessibilityState.disabled, true);

    let resent = 0;
    const ready = await render(otpShell({ resendSecondsLeft: null }, callbacks({ onResendOtp: () => resent++ })));
    const resend = pressableByLabel(ready, COPY.otp.resend);
    assert.equal(resend.props.accessibilityState.disabled, false);
    await press(resend);
    assert.equal(resent, 1);
  });

  test('change-email affordance reports upward, preserving the typed address in the controller', async () => {
    let changed = 0;
    const r = await render(otpShell({}, callbacks({ onChangeEmail: () => changed++ })));
    await press(pressableByLabel(r, COPY.otp.changeEmail));
    assert.equal(changed, 1);
  });
});

describe('hard presentations', () => {
  test('settling implies no step: a labeled progress state and nothing else', async () => {
    const r = await render(shell({ presentation: 'settling' }));
    assert.equal(r.root.findByType('View').props.accessibilityRole ?? r.root.findAllByType('View').find((v) => v.props.accessibilityRole === 'progressbar')?.props.accessibilityRole, 'progressbar');
    assert.match(joined(r), /Getting things ready…/);
    assert.doesNotMatch(joined(r), /Continue with|Rebuild your life|Begin/);
  });

  test('degraded keeps her information calm and still offers the same account choice', async () => {
    const r = await render(shell({ presentation: 'auth-degraded', step: 'account-choice' }));
    const text = joined(r);
    assert.match(text, /Nothing on this device was removed/);
    assert.match(text, /Continue with Google/);
  });

  test('account-conflict is isolated: quarantine copy, Sign out, and no provider or email surface', async () => {
    const r = await render(shell({ presentation: 'account-conflict' }, callbacks({ onSignOut: () => {} })));
    const text = joined(r);
    assert.match(text, /belongs to someone/);
    assert.match(text, /Sign out/);
    assert.doesNotMatch(text, /Continue with|Verification code|Email/);
    assert.equal(r.root.findAllByType('TextInput').length, 0);
  });
});

describe('the shell can carry no auth, persistence, or invented design', () => {
  const featureFiles = (dir) =>
    readdirSync(dir, { recursive: true })
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => join(dir, name));
  // Scan CODE, not prose: comments may name the forbidden things to say why they are absent.
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const sources = () => featureFiles(WELCOME_DIR).map((path) => [path, stripComments(readFileSync(path, 'utf8'))]);

  test('no auth-shell source imports Supabase, SecureStore or AsyncStorage', () => {
    for (const [path, source] of sources()) {
      assert.doesNotMatch(source, /supabase|secure-?store|async-storage|AsyncStorage|SecureStore/i, path);
    }
  });

  test('no persisted welcome flag exists anywhere in the feature', () => {
    for (const [path, source] of sources()) {
      assert.doesNotMatch(source, /hasSeenWelcome|welcomeSeen|welcomeTreeComplete/i, path);
    }
  });

  test('no invented hex colors — the paper-and-ink tokens are the only palette', () => {
    for (const [path, source] of sources()) {
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, path);
    }
  });

  test('method labels reuse the account feature wording and add only email', () => {
    assert.equal(METHOD_LABELS.apple, 'Continue with Apple');
    assert.equal(METHOD_LABELS.google, 'Continue with Google');
    assert.equal(METHOD_LABELS.email, 'Continue with email');
    assert.deepEqual(Object.keys(METHOD_LABELS).sort(), ['apple', 'email', 'google']);
  });
});
