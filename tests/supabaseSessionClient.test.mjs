import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSupabaseSessionClient } from '../src/platform/supabaseSessionClient.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const stored = (accountId = A) => ({
  accountId,
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  expiresAt: 1,
  provider: { provider: 'apple', subject: 'apple-a', suggestedDisplayName: null },
});

const supa = (accountId = A, over = {}) => ({
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_at: 2_000_000_000,
  user: { id: accountId },
  ...over,
});

function fakeClient(nextSession = supa()) {
  let listener = null;
  let signOuts = 0;
  let starts = 0;
  let stops = 0;
  const auth = {
    onAuthStateChange(cb) {
      listener = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async setSession() {
      return { data: { session: nextSession }, error: null };
    },
    async signOut() {
      signOuts += 1;
      return { error: null };
    },
    startAutoRefresh() { starts += 1; },
    stopAutoRefresh() { stops += 1; },
  };
  return {
    client: { auth },
    fire(event, session) { listener?.(event, session); },
    counts: () => ({ signOuts, starts, stops }),
  };
}

describe('Supabase session continuity bridge', () => {
  test('setSession returns a rotated pair to the secure-session owner', async () => {
    const h = fakeClient();
    const bridge = createSupabaseSessionClient(h.client);
    const result = await bridge.activate(stored());
    assert.equal(result.kind, 'active');
    assert.equal(result.session.accountId, A);
    assert.equal(result.session.accessToken, 'new-access');
    assert.equal(result.session.refreshToken, 'new-refresh');
  });

  test('a session for another actor is rejected and removed from the transport client', async () => {
    const h = fakeClient(supa(B));
    const bridge = createSupabaseSessionClient(h.client);
    const result = await bridge.activate(stored(A));
    assert.equal(result.kind, 'invalid');
    assert.equal(h.counts().signOuts, 1);
  });

  test('TOKEN_REFRESHED emits only for the actor installed in the transport client', async () => {
    const h = fakeClient();
    const bridge = createSupabaseSessionClient(h.client);
    await bridge.activate(stored(A));
    const seen = [];
    bridge.subscribe((event) => seen.push(event));

    h.fire('TOKEN_REFRESHED', supa(B));
    assert.equal(seen.length, 0);

    h.fire('TOKEN_REFRESHED', supa(A, { refresh_token: 'rotated-again' }));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'refreshed');
    assert.equal(seen[0].session.refreshToken, 'rotated-again');
  });

  test('React Native foreground control delegates to Supabase auth refresh lifecycle', () => {
    const h = fakeClient();
    const bridge = createSupabaseSessionClient(h.client);
    bridge.startAutoRefresh();
    bridge.stopAutoRefresh();
    assert.deepEqual(h.counts(), { signOuts: 0, starts: 1, stops: 1 });
  });
});
