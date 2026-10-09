import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPasswordRecoveryPort } from '../src/platform/passwordRecoveryProvider.ts';

function fakeClient(over = {}) {
  const calls = [];
  const client = {
    auth: {
      resetPasswordForEmail: async (email) => {
        calls.push({ op: 'request', email });
        return { error: over.requestError ?? null };
      },
      verifyOtp: async (args) => {
        calls.push({ op: 'verify', ...args });
        return over.verifyAnswer ?? {
          data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' } }, user: { id: '11111111-1111-4111-8111-111111111111' } },
          error: null,
        };
      },
      updateUser: async (changes) => {
        calls.push({ op: 'update', ...changes });
        return { error: over.updateError ?? null };
      },
      signOut: async (args) => {
        calls.push({ op: 'signOut', ...args });
        return { error: null };
      },
    },
  };
  return { client, calls };
}

describe('isolated in-app password recovery', () => {
  test('cannot update before recovery verification, then updates and closes the temporary session', async () => {
    const { client, calls } = fakeClient();
    const recovery = createPasswordRecoveryPort(client);
    assert.equal(await recovery.updatePassword('changed-password'), 'failed');
    assert.equal(calls.length, 0, 'no password update without verified recovery code');
    assert.equal(await recovery.request('rowan@example.test'), 'ok');
    assert.equal(await recovery.verify('rowan@example.test', '123456'), 'ok');
    assert.equal(await recovery.updatePassword('short'), 'failed');
    assert.equal(await recovery.updatePassword('changed-password'), 'ok');
    assert.deepEqual(calls.map((call) => call.op), ['request', 'verify', 'update', 'signOut']);
    assert.deepEqual(calls[1], { op: 'verify', email: 'rowan@example.test', token: '123456', type: 'recovery' });
    assert.equal(calls[3].scope, 'local', 'never revoke other devices');
    assert.equal(await recovery.updatePassword('another-password'), 'failed');
    assert.equal(await recovery.request('rowan@example.test'), 'unavailable');
  });

  test('invalid, expired and misbound verification cannot authorize a password change', async () => {
    for (const answer of [
      { data: { session: null, user: null }, error: { status: 400 } },
      { data: { session: { user: { id: 'A' } }, user: { id: 'B' } }, error: null },
    ]) {
      const { client, calls } = fakeClient({ verifyAnswer: answer });
      const recovery = createPasswordRecoveryPort(client);
      assert.equal(await recovery.verify('rowan@example.test', '111111'), 'failed');
      assert.equal(await recovery.updatePassword('changed-password'), 'failed');
      assert.equal(calls.find((call) => call.op === 'update'), undefined);
    }
  });

  test('requests do not reveal whether an account exists', async () => {
    const { client } = fakeClient({ requestError: { status: 400 } });
    assert.equal(await createPasswordRecoveryPort(client).request('unknown@example.test'), 'ok');
    const limited = fakeClient({ requestError: { status: 429 } });
    assert.equal(await createPasswordRecoveryPort(limited.client).request('unknown@example.test'), 'rateLimited');
  });

  test('a failed password update does not falsely report success', async () => {
    const { client } = fakeClient({ updateError: { status: 400 } });
    const recovery = createPasswordRecoveryPort(client);
    assert.equal(await recovery.verify('rowan@example.test', '123456'), 'ok');
    assert.equal(await recovery.updatePassword('changed-password'), 'failed');
    await recovery.dispose();
  });

  test('unconfigured client fails closed', async () => {
    const recovery = createPasswordRecoveryPort(null);
    assert.equal(await recovery.request('rowan@example.test'), 'unavailable');
    assert.equal(await recovery.verify('rowan@example.test', '123456'), 'unavailable');
    assert.equal(await recovery.updatePassword('changed-password'), 'unavailable');
  });
});
