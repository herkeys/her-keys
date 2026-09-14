import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadTierForBuffer, loadTierForDay, loadTierOf } from '../src/domain/loadTier.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { describeLoad } from '../src/features/daily-load/describeLoad.ts';
import { DAY, demoState } from './support/fixtures.mjs';

const event = (id, startMinutes, endMinutes) => ({ id, title: id, startMinutes, endMinutes, categoryId: 'cat-kids', subjectMemberId: null });

/** Pickup at 3:00–3:15 PM, then the next commitment `buffer` minutes later. */
const dayWithBuffer = (buffer) => [event('pickup', 900, 915), event('next', 915 + buffer, 975 + buffer)];

describe('Load tiers', () => {
  test('boundaries: 45 open, 44 and 23 tight, 22 and below overloaded', () => {
    const cases = [
      [120, 'open'],
      [45, 'open'],
      [44, 'tight'],
      [23, 'tight'],
      [22, 'overloaded'],
      [0, 'overloaded'],
      [-15, 'overloaded'],
    ];
    for (const [buffer, tier] of cases) assert.equal(loadTierForBuffer(buffer), tier, `buffer ${buffer}`);
  });

  test('the tier comes from the Daily Load assessment of the tightest transition', () => {
    for (const [buffer, tier] of [[45, 'open'], [44, 'tight'], [23, 'tight'], [22, 'overloaded']]) {
      assert.equal(loadTierOf(computeDailyLoad(dayWithBuffer(buffer), [])), tier, `buffer ${buffer}`);
    }
  });

  test('a day with no transitions between commitments is open', () => {
    assert.equal(loadTierOf(computeDailyLoad([], [])), 'open');
    assert.equal(loadTierOf(computeDailyLoad([event('only', 540, 600)], [])), 'open');
  });

  test('the seeded demo day, with 35 minutes before soccer, is tight', () => {
    assert.equal(loadTierForDay(demoState(), DAY), 'tight');
  });

  test('the load meter reads the tier instead of keeping its own thresholds', () => {
    const levelFor = (buffer) => {
      const events = dayWithBuffer(buffer);
      return describeLoad(events, [], computeDailyLoad(events, [])).level;
    };
    assert.equal(levelFor(22), 'full');
    assert.equal(levelFor(23), 'tight');
    assert.equal(levelFor(44), 'tight');
    assert.ok(['open', 'steady'].includes(levelFor(45)));
  });
});
