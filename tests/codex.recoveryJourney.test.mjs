import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { PasswordRecoveryView } from '../src/features/welcome/views/PasswordRecoveryView.tsx';
import { createPasswordRecoveryPort } from '../src/platform/passwordRecoveryProvider.ts';

// Actual screen and adapter; only Supabase is scripted here. Live HTTP evidence
// is recorded separately and this renderer is not native-device certification.
const account = '11111111-1111-4111-8111-111111111111';
const text = r => r.root.findAllByType('Text').map(n => [n.props.children].flat(Infinity).join('')).join(' ');
const settle = () => new Promise(resolve => setImmediate(resolve));
const press = (r, label) => TestRenderer.act(async () => {
  const button = r.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === label);
  assert.ok(button, label); assert.equal(button.props.disabled, false);
  button.props.onPress(); await settle();
});
const enter = (r, label, value) => TestRenderer.act(async () => {
  const field = r.root.findAllByType('TextInput').find(n => n.props.accessibilityLabel === label);
  assert.ok(field, label); field.props.onChangeText(value);
});

test('recovery UI preserves retries and never reports completion before the actual password update succeeds', async () => {
  let requestError = { status: 0 }; let verifyError = { status: 403 }; let finish;
  let updates = 0; let signOuts = 0; let returns = 0;
  const port = createPasswordRecoveryPort({ auth: {
    resetPasswordForEmail: async () => ({ error: requestError }),
    verifyOtp: async () => ({ error: verifyError, data: verifyError ? { session: null, user: null } : { user: { id: account }, session: { user: { id: account } } } }),
    updateUser: async () => { updates++; return new Promise(resolve => { finish = resolve; }); },
    signOut: async () => { signOuts++; return { error: null }; },
  } });
  const r = await render(<PasswordRecoveryView initialEmail="rowan@example.test" request={port.request} verify={port.verify} updatePassword={port.updatePassword} onReturnToSignIn={() => { returns++; }} />);
  try {
    await press(r, 'Send Reset Email');
    assert.match(text(r), /Check your connection/);
    assert.equal(r.root.findAllByType('TextInput').some(n => n.props.accessibilityLabel === 'Recovery code'), false);
    requestError = null;
    await press(r, 'Send Reset Email');
    await enter(r, 'Recovery code', '123456');
    await press(r, 'Verify Recovery Code');
    assert.match(text(r), /invalid or expired/);
    assert.equal(updates, 0);
    verifyError = null;
    await press(r, 'Verify Recovery Code');
    await enter(r, 'New password', 'synthetic-new-password');
    await enter(r, 'Confirm new password', 'different-synthetic-password');
    await press(r, 'Update Password');
    assert.match(text(r), /passwords do not match/); assert.equal(updates, 0);
    await enter(r, 'Confirm new password', 'synthetic-new-password');
    await press(r, 'Update Password');
    assert.equal(updates, 1);
    assert.doesNotMatch(text(r), /Your password has been changed/);
    await TestRenderer.act(async () => { finish({ error: null }); await settle(); });
    assert.match(text(r), /Your password has been changed/);
    assert.equal(signOuts, 1, 'the temporary recovery session ends before completion');
    assert.equal(r.root.findAllByType('TextInput').length, 0, 'secrets leave the form after success');
    await press(r, 'Return to Sign In'); assert.equal(returns, 1);
  } finally {
    await TestRenderer.act(async () => r.unmount());
    await port.dispose();
  }
});
