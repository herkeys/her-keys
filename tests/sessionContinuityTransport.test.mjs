import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { failureFrom } from '../src/platform/supabaseSyncTransport.ts';

const err = (code, message, details = null) => ({ code, message, details });

describe('authentication failures are transport state, not domain evidence', () => {
  test('JWT failures pause sync', () => {
    for (const code of ['PGRST301', 'PGRST303', '28000']) {
      assert.equal(failureFrom(err(code, 'authentication failed')).failure, 'unauthorized', code);
    }
  });

  test('anonymous access to authenticated-only sync RPC pauses', () => {
    assert.equal(
      failureFrom(err('42501', 'permission denied for function sync_push')).failure,
      'unauthorized'
    );
  });

  test('real authenticated RLS refusals remain forbidden', () => {
    assert.equal(
      failureFrom(err('42501', 'new row violates row-level security policy for table "tasks"')).failure,
      'forbidden'
    );
  });
});
