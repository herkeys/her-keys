import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HouseholdSystemSchema, AppStateSchema } from '../../src/domain/state.ts';
import { RecurrenceRuleSchema, SystemStepSchema } from '../../src/domain/foundation/structure.ts';
import { SYSTEM_LIMITS, newDraft, validateDraft } from '../../src/features/systems/commands/draft.ts';
import { MAX_STEPS_PER_SYSTEM } from '../../src/features/systems/commands/stepOrder.ts';
import { realHousehold, ruleRow, stepRow, systemRow } from './support/canon.mjs';

const codes = (issues) => issues.map((i) => i.code).sort();
const draftFor = (over = {}) => ({ ...newDraft(realHousehold(), 'sys-d', 'cat-home').draft, name: 'Sunday reset', ...over });
const step = (over = {}) => ({ key: 'a1', id: null, title: 'Wipe counters', effortMinutes: null, ...over });

describe('draft limits are the stored bounds, not a second opinion', () => {
  test('each SYSTEM_LIMITS value is exactly where the schema starts refusing', () => {
    const sysOk = (over) => HouseholdSystemSchema.safeParse({ ...systemRow(), ...over }).success;
    assert.equal(sysOk({ name: 'x'.repeat(SYSTEM_LIMITS.name) }), true);
    assert.equal(sysOk({ name: 'x'.repeat(SYSTEM_LIMITS.name + 1) }), false);
    assert.equal(sysOk({ description: 'x'.repeat(SYSTEM_LIMITS.purpose) }), true);
    assert.equal(sysOk({ description: 'x'.repeat(SYSTEM_LIMITS.purpose + 1) }), false);

    const stepOk = (over) => SystemStepSchema.safeParse({ ...stepRow(), ...over }).success;
    assert.equal(stepOk({ title: 'x'.repeat(SYSTEM_LIMITS.stepTitle) }), true);
    assert.equal(stepOk({ title: 'x'.repeat(SYSTEM_LIMITS.stepTitle + 1) }), false);
    assert.equal(stepOk({ effortMinutes: SYSTEM_LIMITS.stepMinutes }), true);
    assert.equal(stepOk({ effortMinutes: SYSTEM_LIMITS.stepMinutes + 1 }), false);
    assert.equal(stepOk({ position: 999 }), true);
    assert.equal(stepOk({ position: 1000 }), false);

    const ruleOk = (over) => RecurrenceRuleSchema.safeParse({ ...ruleRow(), ...over }).success;
    assert.equal(ruleOk({ interval: SYSTEM_LIMITS.interval }), true);
    assert.equal(ruleOk({ interval: SYSTEM_LIMITS.interval + 1 }), false);
  });

  test('the household-wide caps are the AppState caps', () => {
    const base = realHousehold();
    const withSystems = (n) => ({ ...base, systems: Array.from({ length: n }, (_, i) => systemRow({ id: `s-${i}` })) });
    const withSteps = (n) => ({ ...base, systems: [systemRow({ id: 'sys-1' })], systemSteps: Array.from({ length: n }, (_, i) => stepRow({ id: `st-${i}`, position: i % 1000 })) });
    assert.equal(AppStateSchema.safeParse(withSystems(SYSTEM_LIMITS.systems)).success, true);
    assert.equal(AppStateSchema.safeParse(withSystems(SYSTEM_LIMITS.systems + 1)).success, false);
    assert.equal(AppStateSchema.safeParse(withSteps(SYSTEM_LIMITS.steps)).success, true);
    assert.equal(AppStateSchema.safeParse(withSteps(SYSTEM_LIMITS.steps + 1)).success, false);
  });

  test('a full renumber always fits inside the stored position range', () => {
    assert.ok((MAX_STEPS_PER_SYSTEM - 1) * 10 <= 999);
  });
});

describe('validateDraft — every refusal names its field and its code', () => {
  const state = realHousehold();

  test('a minimal draft (name + area) is valid; blank or oversized text is not', () => {
    assert.deepEqual(validateDraft(state, draftFor()), []);
    assert.deepEqual(codes(validateDraft(state, draftFor({ name: '   ' }))), ['name_blank']);
    assert.deepEqual(codes(validateDraft(state, draftFor({ name: 'x'.repeat(121) }))), ['name_too_long']);
    assert.deepEqual(codes(validateDraft(state, draftFor({ purpose: 'x'.repeat(501) }))), ['purpose_too_long']);
  });

  test('the area must be one of the household’s live areas (a NEW choice), and is required', () => {
    assert.deepEqual(codes(validateDraft(state, draftFor({ categoryId: '' }))), ['area_missing']);
    assert.deepEqual(codes(validateDraft(state, draftFor({ categoryId: 'cat-nonexistent' }))), ['area_unavailable']);
    const archived = { ...state, categories: state.categories.map((c) => (c.id === 'cat-home' ? { ...c, status: 'archived' } : c)) };
    assert.deepEqual(codes(validateDraft(archived, draftFor({ categoryId: 'cat-home' }))), ['area_unavailable']);
  });

  test('an unchanged area on an existing System is kept even if the area was archived since', () => {
    const existing = { ...state, systems: [systemRow({ id: 'sys-1', categoryId: 'cat-home' })] };
    const archived = { ...existing, categories: existing.categories.map((c) => (c.id === 'cat-home' ? { ...c, status: 'archived' } : c)) };
    assert.deepEqual(validateDraft(archived, draftFor({ systemId: 'sys-1', isNew: false, categoryId: 'cat-home' })), []);
  });

  test('steps: title required and bounded, minutes a whole number 0–1440 or unknown, at most 90', () => {
    assert.deepEqual(codes(validateDraft(state, draftFor({ steps: [step({ title: '  ' })] }))), ['step_title_blank']);
    assert.deepEqual(codes(validateDraft(state, draftFor({ steps: [step({ title: 'x'.repeat(201) })] }))), ['step_title_too_long']);
    for (const bad of [-1, 1441, 2.5, Number.NaN]) assert.deepEqual(codes(validateDraft(state, draftFor({ steps: [step({ effortMinutes: bad })] }))), ['step_minutes_invalid'], String(bad));
    for (const good of [null, 0, 1, 1440]) assert.deepEqual(validateDraft(state, draftFor({ steps: [step({ effortMinutes: good })] })), [], String(good));
    const many = Array.from({ length: MAX_STEPS_PER_SYSTEM + 1 }, (_, i) => step({ key: `k${i}` }));
    assert.ok(codes(validateDraft(state, draftFor({ steps: many }))).includes('too_many_steps'));
  });

  test('schedule: only shapes the foundation can represent', () => {
    const cal = (schedule) => draftFor({ scheduleMode: 'calendar', schedule });
    const ok = { frequency: 'weekly', interval: 1, byWeekday: [0, 3], byMonthDay: null, timeOfDayMinutes: 570 };
    assert.deepEqual(validateDraft(state, cal(ok)), []);
    assert.deepEqual(codes(validateDraft(state, cal(null))), ['schedule_missing']);
    for (const interval of [0, 367, 1.5]) assert.deepEqual(codes(validateDraft(state, cal({ ...ok, interval }))), ['interval_invalid'], String(interval));
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, byWeekday: [7] }))), ['weekday_invalid']);
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, byWeekday: [1, 1] }))), ['weekday_invalid']);
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, byWeekday: [] }))), ['weekday_invalid']);
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, frequency: 'daily' }))), ['weekday_invalid'], 'weekdays belong to a weekly rule');
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, byWeekday: null, byMonthDay: 15 }))), ['month_day_invalid'], 'a month day belongs to a monthly rule');
    assert.deepEqual(validateDraft(state, cal({ frequency: 'monthly', interval: 1, byWeekday: null, byMonthDay: 31, timeOfDayMinutes: null })), []);
    assert.deepEqual(codes(validateDraft(state, cal({ frequency: 'monthly', interval: 1, byWeekday: null, byMonthDay: 32, timeOfDayMinutes: null }))), ['month_day_invalid']);
    assert.deepEqual(codes(validateDraft(state, cal({ ...ok, timeOfDayMinutes: 1440 }))), ['time_invalid']);
  });

  test('mode "none" and "keep" carry no schedule to validate', () => {
    assert.deepEqual(validateDraft(state, draftFor({ scheduleMode: 'none', schedule: null })), []);
    assert.deepEqual(validateDraft(state, draftFor({ scheduleMode: 'keep', schedule: null })), []);
  });
});
