import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDays, addYears, ageOn, checkTimeZoneSupport, isLocalDate, logicalDateAt, weekdayOf, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { projectDay } from '../src/domain/projectDay.ts';
import { TZ, nyInstant, nyMs } from './support/fixtures.mjs';

describe('Logical day', () => {
  test('the platform timezone data reproduces the known answers', () => {
    assert.deepEqual(checkTimeZoneSupport(), { ok: true, failures: [] });
  });

  test('today is the calendar date in the household timezone, not in UTC', () => {
    // 11:30 PM in New York is already the next day in UTC.
    assert.equal(new Date(nyMs(23, 30)).toISOString().slice(0, 10), '2026-09-17');
    assert.equal(logicalDateAt(nyMs(23, 30), TZ), '2026-09-16');
    assert.equal(logicalDateAt(nyMs(0), TZ), '2026-09-16');
  });

  test('calendar arithmetic handles month ends, leap days and birthdays', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addYears('2028-02-29', -1), '2027-02-28');
    assert.equal(ageOn('2018-05-18', '2026-05-17'), 7);
    assert.equal(ageOn('2018-05-18', '2026-05-18'), 8);
    assert.equal(weekdayOf('2026-09-16'), 3);
  });

  test('only real calendar dates are accepted', () => {
    for (const bad of ['2026-02-30', '2026-9-16', '2026-13-01', '16-09-2026', '']) assert.equal(isLocalDate(bad), false, bad);
    assert.equal(isLocalDate('2028-02-29'), true);
  });

  test('wall-clock times on daylight-saving change days resolve predictably', () => {
    // 2:30 AM never happens on spring-forward day; it moves forward to 3:30 AM EDT.
    assert.equal(zonedTimeToEpochMs('2026-03-08', 150, TZ), Date.UTC(2026, 2, 8, 7, 30));
    // 1:30 AM happens twice on fall-back day; the first one is used.
    assert.equal(zonedTimeToEpochMs('2026-11-01', 90, TZ), Date.UTC(2026, 10, 1, 5, 30));
  });
});

describe('Projecting stored facts onto a day', () => {
  const event = (id, startsAt, endsAt) => ({ id, title: id, categoryId: 'cat-kids', subjectMemberId: null, startsAt, endsAt, location: null, scope: 'household' });
  const task = (id, overrides) => ({
    id,
    title: id,
    categoryId: 'cat-home',
    subjectMemberId: null,
    durationMinutes: 10,
    commitment: 'flexible',
    dueDate: null,
    plan: { kind: 'unplanned' },
    scope: 'household',
    ...overrides,
  });

  test('an event running past midnight is clipped to each day it touches', () => {
    const source = { timeZone: TZ, events: [event('late', nyInstant(22), nyInstant(1, 0, 17))], tasks: [] };
    const minutes = (date) => projectDay(source, date).events.map((e) => [e.startMinutes, e.endMinutes]);

    assert.deepEqual(minutes('2026-09-16'), [[22 * 60, 24 * 60]]);
    assert.deepEqual(minutes('2026-09-17'), [[0, 60]]);
    assert.deepEqual(minutes('2026-09-18'), []);
  });

  test('a task is on a day when it is due or overdue, planned for it, or timed on it in local time', () => {
    const tasks = [
      task('overdue', { dueDate: '2026-09-15' }),
      task('due-later', { dueDate: '2026-09-20' }),
      task('planned', { plan: { kind: 'day', date: '2026-09-16' } }),
      task('planned-tomorrow', { plan: { kind: 'day', date: '2026-09-17' } }),
      // 11:30 PM in New York is the 17th in UTC, but it belongs to the 16th.
      task('late-evening', { plan: { kind: 'timed', startsAt: nyInstant(23, 30) } }),
    ];
    const day = projectDay({ timeZone: TZ, events: [], tasks }, '2026-09-16');

    assert.deepEqual(
      day.tasks.map((t) => [t.id, t.dueToday, t.scheduledStartMinutes ?? null]),
      [
        ['overdue', true, null],
        ['planned', false, null],
        ['late-evening', false, 23 * 60 + 30],
      ]
    );
  });
});
