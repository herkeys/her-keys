import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseEmailPassword } from '../src/platform/emailPasswordProvider.ts';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const session = {
  access_token: 'fake-access',
  refresh_token: 'fake-refresh',
  expires_at: 1780000000,
  user: { id: ACCOUNT },
};
const client = (answer) => {
  const calls = [];
  return {
    calls,
    auth: {
      signUp: async ({ email, password }) => {
        calls.push('signup');
        assert.equal(email, 'rowan@example.test');
        assert.equal(password, 'correct horse battery staple');
        return answer;
      },
      signInWithPassword: async ({ email, password }) => {
        calls.push('signin');
        assert.equal(email, 'rowan@example.test');
        assert.equal(password, 'correct horse battery staple');
        return answer;
      },
    },
  };
};

describe('Supabase email/password adapter', () => {
  test('signup under Confirm Email produces NO session and no invented account', async () => {
    const c = client({ data: { user: { id: ACCOUNT }, session: null }, error: null });
    const out = await createSupabaseEmailPassword(c).authenticate('signUp', 'rowan@example.test', 'correct horse battery staple');
    assert.deepEqual(out, { kind: 'confirmationRequired' });
    assert.deepEqual(c.calls, ['signup']);
  });

  test('confirmed sign-in gives the existing account runtime a mapped session', async () => {
    const c = client({ data: { user: session.user, session }, error: null });
    const out = await createSupabaseEmailPassword(c).authenticate('signIn', 'rowan@example.test', 'correct horse battery staple');
    assert.equal(out.kind, 'success');
    assert.equal(out.session.accountId, ACCOUNT);
    assert.equal(out.session.provider.provider, 'email');
    assert.equal(out.session.accessToken, 'fake-access');
    assert.deepEqual(c.calls, ['signin']);
  });

  test('signup with Confirm Email off may receive an actual session', async () => {
    const c = client({ data: { user: session.user, session }, error: null });
    const out = await createSupabaseEmailPassword(c).authenticate('signUp', 'rowan@example.test', 'correct horse battery staple');
    assert.equal(out.kind, 'success');
    assert.equal(out.session.accountId, ACCOUNT);
  });

  test('auth errors are code-only and do not leak email or passwords', async () => {
    const c = client({ data: { user: null, session: null }, error: {
      status: 400, code: 'invalid_credentials', message: 'rowan@example.test correct horse battery staple',
    } });
    const out = await createSupabaseEmailPassword(c).authenticate('signIn', 'rowan@example.test', 'correct horse battery staple');
    assert.deepEqual(out, { kind: 'rejected', detail: 'invalid_credentials' });
    assert.equal(JSON.stringify(out).includes('rowan@example.test'), false);
    assert.equal(JSON.stringify(out).includes('horse'), false);
  });

  test('timeout/service exceptions are bounded refusals, not sessions', async () => {
    const out = await createSupabaseEmailPassword({
      auth: { signInWithPassword: async () => { throw new Error('secret-token'); } },
    }).authenticate('signIn', 'rowan@example.test', 'correct horse battery staple');
    assert.deepEqual(out, { kind: 'unreachable', detail: 'auth_request_threw' });
  });
});
