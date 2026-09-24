import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { addTask } from '../src/domain/tasks.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import {
  buildNextTomorrowReminder,
  EVENING_REMINDER_MINUTES,
} from '../src/notifications/localReminderPlan.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, ctx, nyMs } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);
const at = (date, hour, minute = 0) => toInstant(zonedTimeToEpochMs(date, hour * 60 + minute, TZ));

describe('local Tomorrow reminder plan', () => {
  test('does not manufacture a notification when tomorrow has nothing worth reviewing', () => {
    assert.equal(buildNextTomorrowReminder(empty(), nyMs(18)), null);
  });

  test('before 7 PM, schedules this evening for tomorrow in the household timezone', () => {
    let state = empty();
    state = addTask(state, ctx(), { title: 'Pay soccer registration', categoryId: 'cat-money', dueDate: NEXT_DAY, scope: 'household' });

    const plan = buildNextTomorrowReminder(state, nyMs(18));
    assert.ok(plan);
    assert.equal(plan.deliveryDay, DAY);
    assert.equal(plan.targetDate, NEXT_DAY);
    assert.equal(plan.triggerAtMs, zonedTimeToEpochMs(DAY, EVENING_REMINDER_MINUTES, TZ));
  });

  test('after 7 PM, schedules the next evening and describes the following day', () => {
    const dayAfter = '2026-09-18';
    let state = empty();
    state = addTask(state, ctx(), { title: 'Submit form', categoryId: 'cat-home', dueDate: dayAfter, scope: 'household' });

    const plan = buildNextTomorrowReminder(state, nyMs(20));
    assert.ok(plan);
    assert.equal(plan.deliveryDay, NEXT_DAY);
    assert.equal(plan.targetDate, dayAfter);
    assert.equal(plan.triggerAtMs, zonedTimeToEpochMs(NEXT_DAY, EVENING_REMINDER_MINUTES, TZ));
  });

  test('overlap and transition warnings never put private event titles on the lock screen', () => {
    let state = empty();
    state = addEvent(state, ctx(), {
      title: 'Therapy with Dr. Private',
      categoryId: 'cat-home',
      startsAt: at(NEXT_DAY, 10),
      endsAt: at(NEXT_DAY, 11),
      commitment: 'fixed',
      scope: 'personal',
    });
    state = addEvent(state, ctx(), {
      title: 'Private school meeting',
      categoryId: 'cat-kids',
      startsAt: at(NEXT_DAY, 10, 30),
      endsAt: at(NEXT_DAY, 11, 30),
      commitment: 'fixed',
      scope: 'household',
    });

    const plan = buildNextTomorrowReminder(state, nyMs(18));
    assert.ok(plan);
    assert.equal(plan.body, 'Tomorrow has a schedule overlap worth a look.');
    assert.doesNotMatch(plan.body, /Therapy|Dr\. Private|school meeting/i);
  });

  test('task titles stay private; only counts leave the app surface', () => {
    let state = empty();
    state = addTask(state, ctx(), {
      title: 'Call attorney about private matter',
      categoryId: 'cat-home',
      dueDate: NEXT_DAY,
      scope: 'personal',
    });

    const plan = buildNextTomorrowReminder(state, nyMs(18));
    assert.ok(plan);
    assert.equal(plan.body, 'Tomorrow has 1 thing due.');
    assert.doesNotMatch(plan.body, /attorney|private matter/i);
  });

  test('fixed commitments and due work produce grammatical count-only copy', () => {
    let state = empty();
    state = addEvent(state, ctx(), {
      title: 'Appointment',
      categoryId: 'cat-home',
      startsAt: at(NEXT_DAY, 9),
      endsAt: at(NEXT_DAY, 9, 30),
      commitment: 'fixed',
      scope: 'household',
    });
    state = addTask(state, ctx(), { title: 'One', categoryId: 'cat-home', dueDate: NEXT_DAY, scope: 'household' });
    state = addTask(state, ctx(), { title: 'Two', categoryId: 'cat-home', dueDate: NEXT_DAY, scope: 'household' });

    const plan = buildNextTomorrowReminder(state, nyMs(18));
    assert.ok(plan);
    assert.equal(plan.body, 'Tomorrow has 1 fixed commitment and 2 things due.');
  });

  test('Life Admin dates alone never authorize a notification', () => {
    const state = {
      ...empty(),
      lifeRecords: [
        {
          id: 'life-private',
          expiresOn: NEXT_DAY,
        },
      ],
    };
    assert.equal(buildNextTomorrowReminder(state, nyMs(18)), null);
  });
});
