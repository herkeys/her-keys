import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { moneyCategoryId } from '../../src/features/money/identity.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { cancelMoneyItem, createExpectedIncome, createObligation, resolveMoneyItem } from '../../src/features/money/mutations.ts';
import { buildMoneyHomeView, moneyItemsOf, NEEDS_ATTENTION_LIMIT, RECENTLY_RESOLVED_WINDOW_DAYS } from '../../src/features/money/projection.ts';

const TZ = 'America/New_York';
const DAY = '2026-09-16';
const MORNING = Date.UTC(2026, 8, 16, 14, 0);

function ctx(overrides = {}) {
  let counter = 0;
  return { nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-${++counter}`, ...overrides };
}

const base = () => createEmptyState(TZ);
const fields = (overrides = {}) => ({ title: 'Item', amountText: '50', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '', ...overrides });
const householdOf = (state) => state.household.id;

describe('Money Home — verdict sentence', () => {
  test('nothing to attend to, and nothing upcoming: the calm, factual empty state', () => {
    const view = buildMoneyHomeView(base(), 'household-1', { nowMs: MORNING });
    assert.equal(view.verdict, 'Nothing needs attention.');
  });

  test('nothing to attend to, but something is coming: names it, without claiming affordability', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields({ title: 'Car insurance', dueDate: '2026-09-25' }));
    const view = buildMoneyHomeView(created.state, householdOf(created.state), { nowMs: MORNING });
    assert.equal(view.verdict, 'Nothing needs attention. Next obligation: Car insurance due 2026-09-25.');
    assert.doesNotMatch(view.verdict, /cover|afford|through/i, 'never an affordability claim from obligations alone');
  });

  test('items needing attention are counted, and pluralized correctly', () => {
    const c = ctx();
    let state = createObligation(base(), c, fields({ title: 'A', dueDate: DAY })).state;
    state = createObligation(state, c, fields({ title: 'B', dueDate: DAY })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.verdict, '2 money items need attention.');
  });

  test('a single item is singular, not "1 items"', () => {
    const c = ctx();
    const state = createObligation(base(), c, fields({ dueDate: DAY })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.verdict, '1 money item needs attention.');
  });
});

describe('Money Home — needs attention: bounded, and the autopay pre-due rule matches Today exactly', () => {
  test('a manual obligation due today needs attention', () => {
    const c = ctx();
    const state = createObligation(base(), c, fields({ paymentMechanism: 'manual', dueDate: DAY })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.needsAttention.length, 1);
  });

  test('SCHEDULED AUTOPAY DOES NOT MEAN CLEARED, and gets no pre-due nudge: an autopay item due today or later is silent', () => {
    const c = ctx();
    let state = createObligation(base(), c, fields({ title: 'Mortgage (autopay, due today)', paymentMechanism: 'autopay', dueDate: DAY })).state;
    state = createObligation(state, c, fields({ title: 'Mortgage (autopay, due later)', paymentMechanism: 'autopay', dueDate: '2026-09-20' })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.needsAttention.length, 0);
    assert.equal(view.verdict, 'Nothing needs attention. Next obligation: Mortgage (autopay, due today) due 2026-09-16.');
  });

  test('once its due date has actually passed, an unconfirmed autopay item surfaces again — never silently, and never claimed "failed"', () => {
    const c = ctx();
    const state = createObligation(base(), c, fields({ title: 'Mortgage', paymentMechanism: 'autopay', dueDate: '2026-09-01' })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.needsAttention.length, 1, 'past-due autopay still surfaces — this is "confirm cleared", not silence');
    assert.equal(view.needsAttention[0].pastDue, true);
  });

  test('Money Home and the shared Today pipeline apply the identical autopay pre-due rule (never disagree)', () => {
    const c = ctx();
    const preDue = createObligation(base(), c, fields({ title: 'Preduecard', paymentMechanism: 'autopay', dueDate: '2026-09-20' }));
    const overdue = createObligation(preDue.state, c, fields({ title: 'Overduecard', paymentMechanism: 'autopay', dueDate: '2026-09-01' }));
    const today = attentionFor(overdue.state, MORNING);
    const preDueRef = { kind: 'task', id: preDue.id };
    const overdueRef = { kind: 'task', id: overdue.id };
    assert.equal(today.some((a) => a.about?.kind === preDueRef.kind && a.about?.id === preDueRef.id), false, 'Today also stays silent pre-due');
    assert.equal(today.some((a) => a.about?.kind === overdueRef.kind && a.about?.id === overdueRef.id), true, 'Today also surfaces it once overdue');
  });

  test('needs attention is bounded — never an endless overdue list', () => {
    const c = ctx();
    let state = base();
    for (let i = 0; i < NEEDS_ATTENTION_LIMIT + 5; i += 1) {
      state = createObligation(state, c, fields({ title: `Bill ${i}`, dueDate: DAY })).state;
    }
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.needsAttention.length, NEEDS_ATTENTION_LIMIT);
    assert.match(view.verdict, /or more/, 'the count still says there is more, even though the list is capped');
  });
});

describe('Money Home — coming up / expected in / recently resolved', () => {
  test('an obligation due later is "coming up"; expected income due later is "expected in" — never mixed', () => {
    const c = ctx();
    let state = createObligation(base(), c, fields({ title: 'Bill', dueDate: '2026-09-22' })).state;
    state = createExpectedIncome(state, c, fields({ title: 'Paycheck', dueDate: '2026-09-23' })).state;
    const view = buildMoneyHomeView(state, householdOf(state), { nowMs: MORNING });
    assert.equal(view.comingUp.length, 1);
    assert.equal(view.comingUp[0].title, 'Bill');
    assert.equal(view.expectedIn.length, 1);
    assert.equal(view.expectedIn[0].title, 'Paycheck');
  });

  test('recently resolved is bounded to a display window, and is display retention only — the record itself is never deleted', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields({ title: 'Old bill', dueDate: DAY }));
    const resolved = resolveMoneyItem(created.state, c, created.id);
    const justInside = buildMoneyHomeView(resolved.state, householdOf(resolved.state), { nowMs: MORNING + RECENTLY_RESOLVED_WINDOW_DAYS * 86_400_000 - 3_600_000 });
    assert.equal(justInside.recentlyResolved.own.length, 1);
    const justOutside = buildMoneyHomeView(resolved.state, householdOf(resolved.state), { nowMs: MORNING + (RECENTLY_RESOLVED_WINDOW_DAYS + 5) * 86_400_000 });
    assert.equal(justOutside.recentlyResolved.own.length, 0, 'outside the display window...');
    const stillThere = resolved.state.tasks.find((t) => t.id === created.id);
    assert.equal(stillThere.status, 'completed', '...but the canonical record is still there, in full');
  });

  test('resolved items never appear in needsAttention, even if their old due date has long since passed', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields({ title: 'Paid already', dueDate: '2025-01-01' }));
    const resolved = resolveMoneyItem(created.state, c, created.id);
    const view = buildMoneyHomeView(resolved.state, householdOf(resolved.state), { nowMs: MORNING });
    assert.equal(view.needsAttention.some((i) => i.taskId === created.id), false);
  });
});

describe('moneyItemsOf', () => {
  test('reflects cancelled items as cancelled, not resolved and not open', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields());
    const cancelled = cancelMoneyItem(created.state, c, created.id);
    const view = moneyItemsOf(cancelled.state, DAY).find((v) => v.taskId === created.id);
    assert.equal(view.status, 'cancelled');
  });
});

describe('otherOpenTasks — every open task in the money category stays reachable (tests/build3Audit.capture.test.mjs)', () => {
  test('a generic open task filed under Money without an amount is surfaced, distinct from Money\'s own items', () => {
    const c = ctx();
    const categoryId = moneyCategoryId(base());
    const withPlainTask = addTask(base(), c, { title: 'Call the insurance company', categoryId, scope: 'household' });
    const view = buildMoneyHomeView(withPlainTask, householdOf(withPlainTask), { nowMs: MORNING });
    assert.equal(view.otherOpenTasks.length, 1);
    assert.equal(view.otherOpenTasks[0].task.title, 'Call the insurance company');
    assert.equal(view.otherOpenTasks[0].task.value, null);
  });

  test('a Money obligation (has a value facet) is never double-listed in otherOpenTasks', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields());
    const view = buildMoneyHomeView(created.state, householdOf(created.state), { nowMs: MORNING });
    assert.equal(view.otherOpenTasks.some((entry) => entry.task.id === created.id), false);
  });

  test('a completed or archived plain task is not listed (only open tasks)', () => {
    const c = ctx();
    const categoryId = moneyCategoryId(base());
    const state = addTask(base(), c, { title: 'Done already', categoryId, scope: 'household', durationMinutes: 5 });
    const task = state.tasks[0];
    const completed = { ...state, tasks: [{ ...task, status: 'completed' }] };
    const view = buildMoneyHomeView(completed, householdOf(completed), { nowMs: MORNING });
    assert.equal(view.otherOpenTasks.length, 0);
  });
});
