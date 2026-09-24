import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  HER_KEYS_REMINDER_OWNER,
  isHerKeysReminderData,
  reminderDataMatchesPlan,
  routeFromHerKeysReminderData,
} from '../src/notifications/localNotificationOwnership.ts';

const plan = {
  kind: 'tomorrow-brief',
  triggerAtMs: 1000,
  deliveryDay: '2026-09-16',
  targetDate: '2026-09-17',
  title: 'Tomorrow, at a glance',
  body: 'Tomorrow has 1 thing due.',
  url: '/today',
  planKey: '2026-09-17:0:clear:0:1',
};

describe('local notification ownership boundary', () => {
  test('recognizes only Her Keys-owned reminder data', () => {
    assert.equal(isHerKeysReminderData({ owner: HER_KEYS_REMINDER_OWNER }), true);
    assert.equal(isHerKeysReminderData({ owner: 'another-feature' }), false);
    assert.equal(isHerKeysReminderData(undefined), false);
  });

  test('a scheduled request only matches the exact current plan', () => {
    const data = {
      owner: HER_KEYS_REMINDER_OWNER,
      kind: plan.kind,
      url: plan.url,
      planKey: plan.planKey,
      triggerAtMs: plan.triggerAtMs,
      targetDate: plan.targetDate,
    };
    assert.equal(reminderDataMatchesPlan(data, plan), true);
    assert.equal(reminderDataMatchesPlan({ ...data, targetDate: '2026-09-18' }, plan), false);
  });

  test('deep-link routing ignores notification data Her Keys does not own', () => {
    assert.equal(routeFromHerKeysReminderData({ owner: HER_KEYS_REMINDER_OWNER, url: '/today' }), '/today');
    assert.equal(routeFromHerKeysReminderData({ owner: 'someone-else', url: '/today' }), null);
    assert.equal(routeFromHerKeysReminderData({ owner: HER_KEYS_REMINDER_OWNER, url: '/life' }), null);
  });
});
