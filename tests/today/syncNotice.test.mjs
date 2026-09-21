/**
 * TODAY — the one sync line never states a number it does not have.
 *
 * `needsSyncAttention` is also true for a BACKLOG (the queue or the evidence store is full), where nothing is counted as
 * unresolved evidence. The notice used to render "0 changes need your attention." for it. With the composed sync runtime
 * (HA-001) queueing every canonical change, a full queue is reachable in production, so the line is proved here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { emptyNamespace, needsSyncAttention, needsSyncAttentionCount } from '../../src/domain/sync/syncTypes.ts';
import { syncNoticeLine } from '../../src/features/today/syncNoticeLine.ts';

const namespace = (overrides = {}) => ({
  ...emptyNamespace({ accountId: 'account-1', householdId: 'household-1', deviceId: 'device-1' }),
  ...overrides,
});

describe('the sync notice', () => {
  test('a backlog with nothing counted still needs attention, and is not worded as zero changes', () => {
    const backlog = namespace({ backlog: true });
    assert.equal(needsSyncAttention(backlog), true, 'the premise: a backlog needs attention');
    assert.equal(needsSyncAttentionCount(backlog), 0, 'the premise: and nothing is counted');
    const line = syncNoticeLine(needsSyncAttentionCount(backlog));
    assert.equal(line, 'Some changes need your attention.');
    assert.doesNotMatch(line, /\b0\b|zero|no changes/i);
  });

  test('a counted change or several are stated as before', () => {
    assert.equal(syncNoticeLine(1), 'One change needs your attention.');
    assert.equal(syncNoticeLine(2), '2 changes need your attention.');
    assert.equal(syncNoticeLine(7), '7 changes need your attention.');
  });

  test('nothing is said when nothing needs attention (the component renders nothing at all)', () => {
    assert.equal(needsSyncAttention(namespace()), false);
    assert.equal(needsSyncAttention(null), false);
  });

  test('the component uses the line, and holds no wording of its own', () => {
    const source = readFileSync('src/features/today/SyncNotice.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(source, /syncNoticeLine\(count\)/);
    assert.doesNotMatch(source, /need your attention|needs your attention/);
  });
});
