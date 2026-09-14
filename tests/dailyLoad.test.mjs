import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { materializeDemoState } from '../src/data/seed/demoHousehold.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { describeDayState } from '../src/features/today/dayState.ts';

/** The seeded demo day, materialized and projected exactly as the app shows it. */
const SEEDED_DAY = '2026-09-16';
const { events: todaysEvents, tasks: todaysTasks } = projectStateDay(
  materializeDemoState({ anchorDate: SEEDED_DAY, timeZone: 'America/New_York' }),
  SEEDED_DAY
);

const at = (hour, minute = 0) => hour * 60 + minute;

const event = (id, startMinutes, endMinutes) => ({
  id,
  title: id,
  startMinutes,
  endMinutes,
  ownerId: 'user-1',
  category: 'kids',
});

const task = (id, scheduledStartMinutes, durationMinutes, overrides = {}) => ({
  id,
  title: id,
  durationMinutes,
  commitment: 'flexible',
  dueToday: false,
  domain: 'home',
  scheduledStartMinutes,
  ...overrides,
});

/** A 75-minute window, the same shape as the seeded pickup -> soccer gap. */
const pickup = event('pickup', at(15), at(15, 15));
const soccer = event('soccer', at(16, 30), at(17, 30));

/** What approving a move does to the task list: the task leaves today's schedule. */
const unschedule = (tasks, id) => tasks.map((t) => (t.id === id ? { ...t, scheduledStartMinutes: undefined } : t));

describe('Daily Load on the seeded day', () => {
  test('finds the pickup -> soccer window and offers both flexible tasks, largest first', () => {
    const assessment = computeDailyLoad(todaysEvents, todaysTasks);

    assert.equal(assessment.status, 'overloaded');
    assert.equal(assessment.bufferMinutes, 35);
    assert.equal(assessment.gap?.beforeEventId, 'evt-2');
    assert.equal(assessment.gap?.afterEventId, 'evt-3');
    assert.deepEqual(
      assessment.candidates.map((c) => [c.task.id, c.projectedBufferMinutes, c.resolvesShortfall]),
      [
        ['task-2', 65, true],
        ['task-3', 45, true],
      ]
    );
  });

  test('approving the first recommendation leaves the day balanced', () => {
    const before = computeDailyLoad(todaysEvents, todaysTasks);
    const after = computeDailyLoad(todaysEvents, unschedule(todaysTasks, before.candidates[0].task.id));

    assert.equal(after.status, 'balanced');
    assert.equal(describeDayState(after, 'moved'), 'One change made. Today has room now.');
  });

  // HK-AUDIT-009
  test('explains the shortfall against a default, not something it claims to know about her', () => {
    const [candidate] = computeDailyLoad(todaysEvents, todaysTasks).candidates;

    assert.match(candidate.reason, /45/);
    assert.doesNotMatch(candidate.reason, /you usually/i);
  });
});

describe('Daily Load recommendations', () => {
  // HK-AUDIT-005
  test('never recommends moving a task that is due today, but still counts its time', () => {
    const assessment = computeDailyLoad([pickup, soccer], [task('form', at(15, 20), 40, { dueToday: true })]);

    assert.equal(assessment.status, 'overloaded');
    assert.equal(assessment.bufferMinutes, 35);
    assert.deepEqual(assessment.candidates, []);
  });

  // HK-AUDIT-006
  test('does not offer a zero-minute task as a way to recover time', () => {
    const assessment = computeDailyLoad([pickup, soccer], [task('big', at(15, 20), 40), task('zero', at(15, 25), 0)]);

    assert.deepEqual(
      assessment.candidates.map((c) => c.task.id),
      ['big']
    );
  });

  // HK-AUDIT-006
  test('flags a move that would still leave the window short', () => {
    const assessment = computeDailyLoad([pickup, soccer], [task('big', at(15, 20), 50), task('small', at(16, 10), 10)]);

    assert.equal(assessment.bufferMinutes, 15);
    assert.deepEqual(
      assessment.candidates.map((c) => [c.task.id, c.projectedBufferMinutes, c.resolvesShortfall]),
      [
        ['big', 65, true],
        ['small', 25, false],
      ]
    );
  });

  // HK-AUDIT-006
  test('the day state does not claim room after a move that left the day overloaded', () => {
    const tasks = [task('big', at(15, 20), 50), task('small', at(16, 10), 10)];
    const after = computeDailyLoad([pickup, soccer], unschedule(tasks, 'small'));

    assert.equal(after.status, 'overloaded');
    assert.doesNotMatch(describeDayState(after, 'moved'), /room now/i);
  });
});

describe('Daily Load windows', () => {
  // HK-AUDIT-007
  test('a fixed task scheduled inside a window still uses up its time', () => {
    const assessment = computeDailyLoad([pickup, soccer], [task('call-bank', at(15, 20), 60, { commitment: 'fixed' })]);

    assert.equal(assessment.status, 'overloaded');
    assert.equal(assessment.bufferMinutes, 15);
    assert.deepEqual(assessment.candidates, []);
  });

  // HK-AUDIT-008
  test('a gap is only measured once every earlier commitment has finished', () => {
    const work = event('work', at(9), at(17));
    const dentist = event('dentist', at(14), at(15));
    const lateGame = event('game', at(17, 10), at(18));

    const assessment = computeDailyLoad([work, dentist, lateGame], []);

    assert.equal(assessment.gap?.beforeEventId, 'work');
    assert.equal(assessment.gap?.windowStartMinutes, at(17));
    assert.equal(assessment.bufferMinutes, 10);
  });

  // HK-AUDIT-008
  test('events nested inside a longer commitment do not open a gap of their own', () => {
    const allDay = event('all-day', at(8), at(18));
    const assessment = computeDailyLoad([allDay, event('a', at(9), at(10)), event('b', at(10, 5), at(11))], []);

    assert.equal(assessment.gap, null);
    assert.equal(assessment.status, 'balanced');
  });
});
