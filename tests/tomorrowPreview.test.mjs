import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { addTask } from '../src/domain/tasks.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { tomorrowPreview } from '../src/domain/tomorrowPreview.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, ctx } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);
const atNext = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(NEXT_DAY, hour * 60 + minute, TZ));

describe('Tomorrow Preview', () => {
  test('is exactly today plus one day, in the household timezone', () => {
    const preview = tomorrowPreview(empty(), ctx());
    assert.equal(preview.date, NEXT_DAY);
  });

  test('a genuinely light tomorrow says so plainly, not "reasonable" or manufactured concern', () => {
    const preview = tomorrowPreview(empty(), ctx());
    assert.equal(preview.fixedCommitmentCount, 0);
    assert.equal(preview.tightTransition, null);
    assert.match(preview.headline, /nothing fixed/i);
  });

  test('counts fixed commitments already on tomorrow\'s calendar', () => {
    const context = ctx();
    let state = empty();
    state = addEvent(state, context, { title: 'School drop-off', categoryId: 'cat-kids', startsAt: atNext(8), endsAt: atNext(8, 15), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Team meeting', categoryId: 'cat-work', startsAt: atNext(9), endsAt: atNext(9, 30), commitment: 'fixed', scope: 'professional' });

    const preview = tomorrowPreview(state, ctx());
    assert.equal(preview.fixedCommitmentCount, 2);
    assert.match(preview.headline, /2 fixed commitments/);
  });

  test('surfaces a tight transition risk on tomorrow, naming the real commitments', () => {
    const context = ctx();
    let state = empty();
    state = addEvent(state, context, { title: 'School drop-off', categoryId: 'cat-kids', startsAt: atNext(8), endsAt: atNext(8, 15), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: '9:00 meeting', categoryId: 'cat-work', startsAt: atNext(8, 30), endsAt: atNext(9, 30), commitment: 'fixed', scope: 'professional' });

    const preview = tomorrowPreview(state, ctx());
    assert.ok(preview.tightTransition);
    assert.equal(preview.tightTransition.beforeTitle, 'School drop-off');
    assert.equal(preview.tightTransition.afterTitle, '9:00 meeting');
    assert.match(preview.headline, /9:00 meeting/);
  });

  test('counts tasks due tomorrow', () => {
    const context = ctx();
    let state = empty();
    state = addTask(state, context, { title: 'Pay soccer registration', categoryId: 'cat-money', dueDate: NEXT_DAY, scope: 'household' });

    const preview = tomorrowPreview(state, ctx());
    assert.equal(preview.dueTaskCount, 1);
  });

  test('never mutates tomorrow\'s facts — a pure read', () => {
    const context = ctx();
    let state = empty();
    state = addEvent(state, context, { title: 'School drop-off', categoryId: 'cat-kids', startsAt: atNext(8), endsAt: atNext(8, 15), commitment: 'fixed', scope: 'household' });
    const before = JSON.stringify(state);

    tomorrowPreview(state, ctx());
    assert.equal(JSON.stringify(state), before);
  });

  test('an overlap tomorrow is surfaced, not silently absorbed into a commitment count', () => {
    const context = ctx();
    let state = empty();
    state = addEvent(state, context, { title: 'Dentist', categoryId: 'cat-home', startsAt: atNext(10), endsAt: atNext(11), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Parent-teacher conference', categoryId: 'cat-kids', startsAt: atNext(10, 30), endsAt: atNext(11, 30), commitment: 'fixed', scope: 'household' });

    const preview = tomorrowPreview(state, ctx());
    assert.match(preview.headline, /overlap/);
  });

  test('does not read today\'s events as tomorrow\'s', () => {
    const context = ctx();
    let state = empty();
    state = addEvent(state, context, { title: 'Today only', categoryId: 'cat-home', startsAt: toInstant(zonedTimeToEpochMs(DAY, 10 * 60, TZ)), endsAt: toInstant(zonedTimeToEpochMs(DAY, 10 * 60 + 30, TZ)), commitment: 'fixed', scope: 'household' });

    const preview = tomorrowPreview(state, ctx());
    assert.equal(preview.fixedCommitmentCount, 0);
  });
});
