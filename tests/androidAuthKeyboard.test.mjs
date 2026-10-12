/**
 * Android keyboard avoidance for the welcome tree's email, password, one-time-code and recovery screens.
 *
 * Build 2A recovered commit 2641898 ("Keep Android auth actions above the keyboard"), which replaced an iOS-only
 * `padding` conditional with `padding` on both platforms: under Android edge-to-edge the window-resize mode alone does
 * not lift the action buttons above the IME (see PP-D10 in docs/audits/HK_IOS_ANDROID_PLATFORM_PARITY.md).
 *
 * `Platform.OS` is set to 'android' BEFORE the views are imported, so a load-time conditional such as
 * `Platform.OS === 'ios' ? 'padding' : undefined` would be evaluated for Android and fail here. This proves the
 * rendered behavior prop, not a source pattern. It does NOT prove anything on a device (registry runtime item RT-18).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Platform } from 'react-native';

Platform.OS = 'android';

const { render } = await import('./support/render.tsx');
const React = (await import('react')).default;
const { EmailEntryView, EMAIL_AUTH_KEYBOARD_BEHAVIOR } = await import('../src/features/welcome/views/EmailEntryView.tsx');
const { OtpEntryView } = await import('../src/features/welcome/views/OtpEntryView.tsx');
const { EmailPasswordView } = await import('../src/features/welcome/views/EmailPasswordView.tsx');
const { PasswordRecoveryView } = await import('../src/features/welcome/views/PasswordRecoveryView.tsx');

const noop = () => {};
const resolved = async () => 'ok';

const SCREENS = {
  'email entry': () => <EmailEntryView email="" error={null} pending={false} onSubmitEmail={noop} />,
  'one-time code': () => (
    <OtpEntryView email="her@example.com" error={null} pending={false} resendSecondsLeft={null} onSubmitOtp={noop} onResendOtp={noop} onChangeEmail={noop} />
  ),
  'password sign in': () => <EmailPasswordView mode="signIn" notice={null} pending={false} onSubmit={noop} onForgotPassword={noop} />,
  'password sign up': () => <EmailPasswordView mode="signUp" notice={null} pending={false} onSubmit={noop} />,
  'password recovery': () => (
    <PasswordRecoveryView initialEmail="" request={resolved} verify={resolved} updatePassword={resolved} onReturnToSignIn={noop} />
  ),
};

describe('Android auth keyboard avoidance', () => {
  test('the harness really is running as Android', () => {
    assert.equal(Platform.OS, 'android');
  });

  test('the shared constant is padding, not an OS-dependent value', () => {
    assert.equal(EMAIL_AUTH_KEYBOARD_BEHAVIOR, 'padding');
  });

  for (const [name, element] of Object.entries(SCREENS)) {
    test(`${name} keeps its actions above the keyboard on Android`, async () => {
      const r = await render(element());
      const avoiders = r.root.findAllByType('KeyboardAvoidingView');
      assert.equal(avoiders.length, 1, 'exactly one keyboard-avoiding container per screen');
      assert.equal(avoiders[0].props.behavior, 'padding');
    });
  }

  test('the same screens still use padding when the platform is iOS', async () => {
    Platform.OS = 'ios';
    try {
      for (const [name, element] of Object.entries(SCREENS)) {
        const r = await render(element());
        assert.equal(r.root.findAllByType('KeyboardAvoidingView')[0].props.behavior, 'padding', name);
      }
    } finally {
      Platform.OS = 'android';
    }
  });
});
