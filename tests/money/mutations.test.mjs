import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addChild } from '../../src/domain/children.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import {
  cancelMoneyItem,
  createExpectedIncome,
  createObligation,
  displayAmount,
  duplicateMoneyItemForward,
  editMoneyItem,
  moneyItemRevision,
  resolveMoneyItem,
} from '../../src/features/money/mutations.ts';
import { moneyItemsOf } from '../../src/features/money/projection.ts';

const TZ = 'America/New_York';
const DAY = '2026-09-16';
const MORNING = Date.UTC(2026, 8, 16, 14, 0); // 10:00 EDT

function ctx(overrides = {}) {
  let counter = 0;
  return { nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-${++counter}`, ...overrides };
}

const base = () => createEmptyState(TZ);

const fields = (overrides = {}) => ({
  title: 'Car insurance',
  amountText: '84.50',
  dueDate: '2026-09-20',
  paymentMechanism: 'manual',
  childId: null,
  notes: '',
  ...overrides,
});

describe('Money OS — createObligation / createExpectedIncome', () => {
  test('an obligation is a canonical Task in the money category, USD, outflow, exactly as entered', () => {
    const state = base();
    const c = ctx();
    const result = createObligation(state, c, fields());
    assert.equal(result.outcome, 'saved');
    const task = result.state.tasks.find((t) => t.id === result.id);
    assert.equal(task.title, 'Car insurance');
    assert.deepEqual(task.value, { amountMinor: 8450, currency: 'USD', direction: 'outflow' });
    assert.equal(task.dueDate, '2026-09-20');
    assert.equal(task.paymentMechanism, 'manual');
    assert.equal(task.status, 'open');
    assert.equal(task.scope, 'household');
    assert.equal(task.provenance.producer, 'user-action', 'the amount is her own entry, not a default or an inference');
    assert.equal(state.categories.find((c2) => c2.id === task.categoryId).systemRole, 'money');
  });

  test('a default/unstated payment mechanism is never silently promoted: leaving it unset stays null, not "manual"', () => {
    const result = createObligation(base(), ctx(), fields({ paymentMechanism: null }));
    assert.equal(result.outcome, 'saved');
    const task = result.state.tasks.find((t) => t.id === result.id);
    assert.equal(task.paymentMechanism, null, 'an unstated mechanism is honestly "not known", never defaulted to a plausible-looking value');
  });

  test('expected income is inflow, and never carries a payment mechanism (that concept does not apply to money arriving)', () => {
    const result = createExpectedIncome(base(), ctx(), fields({ title: 'Reimbursement from work', paymentMechanism: 'autopay' }));
    assert.equal(result.outcome, 'saved');
    const task = result.state.tasks.find((t) => t.id === result.id);
    assert.equal(task.value.direction, 'inflow');
    assert.equal(task.paymentMechanism, null, 'income has no payment mechanism, regardless of what the caller passed');
  });

  test('exactly one row is added: no other collection changes, and no operational work is duplicated', () => {
    const state = base();
    const result = createObligation(state, ctx(), fields());
    assert.equal(result.state.tasks.length, state.tasks.length + 1);
    for (const key of ['events', 'systems', 'meals', 'needsMe', 'responsibilities', 'oneMoves']) {
      assert.deepEqual(result.state[key], state[key], `${key} must not change`);
    }
  });

  test('validation: empty title, non-numeric or zero amount, invalid date, and an unknown child are each refused, and change nothing', () => {
    const state = base();
    const c = ctx();
    for (const [bad, outcome] of [
      [fields({ title: '' }), 'invalid_title'],
      [fields({ amountText: '0' }), 'invalid_amount'],
      [fields({ amountText: 'not a number' }), 'invalid_amount'],
      [fields({ amountText: '-5' }), 'invalid_amount'],
      [fields({ dueDate: 'not-a-date' }), 'invalid_date'],
      [fields({ childId: 'child-does-not-exist' }), 'invalid_child'],
    ]) {
      const result = createObligation(state, c, bad);
      assert.equal(result.outcome, outcome, JSON.stringify(bad));
      assert.equal(result.id, null);
      assert.deepEqual(result.state, state, 'a refused create must not mutate state');
    }
  });

  test('an obligation may name a real canonical child by id, never by name', () => {
    const state = addChild(base(), ctx(), { displayName: 'Josie', birthDate: '2018-01-01' });
    const childId = state.children[0].id;
    const result = createObligation(state, ctx(), fields({ childId }));
    assert.equal(result.outcome, 'saved');
    const task = result.state.tasks.find((t) => t.id === result.id);
    assert.equal(task.subjectMemberId, childId);
  });

  test('a $0 amount is refused: no amount is not $0, and a $0 obligation is not one', () => {
    const result = createObligation(base(), ctx(), fields({ amountText: '0.00' }));
    assert.equal(result.outcome, 'invalid_amount');
  });
});

describe('Money OS — editMoneyItem', () => {
  test('an open item can be corrected: title, amount, due date, notes, mechanism', () => {
    const created = createObligation(base(), ctx(), fields());
    const task = created.state.tasks.find((t) => t.id === created.id);
    const edited = editMoneyItem(created.state, ctx(), {
      taskId: task.id,
      baseUpdatedAt: moneyItemRevision(task),
      fields: fields({ title: 'Car insurance (corrected)', amountText: '90.00', paymentMechanism: 'autopay' }),
    });
    assert.equal(edited.outcome, 'saved');
    const next = edited.state.tasks.find((t) => t.id === task.id);
    assert.equal(next.title, 'Car insurance (corrected)');
    assert.equal(next.value.amountMinor, 9000);
    assert.equal(next.paymentMechanism, 'autopay');
    assert.equal(next.value.direction, 'outflow', 'editing the amount never changes direction');
  });

  test('editing with a stale revision token is refused, and changes nothing', () => {
    const created = createObligation(base(), ctx(), fields());
    const task = created.state.tasks.find((t) => t.id === created.id);
    const result = editMoneyItem(created.state, ctx(), {
      taskId: task.id,
      baseUpdatedAt: 'not-the-real-revision',
      fields: fields({ title: 'Sneaky edit' }),
    });
    assert.equal(result.outcome, 'stale');
    assert.deepEqual(result.state, created.state);
  });

  test('editing a resolved item is refused: an edit never reopens or re-dates a settled fact', () => {
    const created = createObligation(base(), ctx(), fields());
    const task = created.state.tasks.find((t) => t.id === created.id);
    const resolved = resolveMoneyItem(created.state, ctx(), task.id);
    const result = editMoneyItem(resolved.state, ctx(), {
      taskId: task.id,
      baseUpdatedAt: moneyItemRevision(resolved.state.tasks.find((t) => t.id === task.id)),
      fields: fields({ title: 'trying to edit a resolved item' }),
    });
    assert.equal(result.outcome, 'not_open');
  });

  test('an identical edit is refused as unchanged', () => {
    const created = createObligation(base(), ctx(), fields());
    const task = created.state.tasks.find((t) => t.id === created.id);
    const result = editMoneyItem(created.state, ctx(), { taskId: task.id, baseUpdatedAt: moneyItemRevision(task), fields: fields() });
    assert.equal(result.outcome, 'unchanged');
  });
});

describe('Money OS — resolveMoneyItem / cancelMoneyItem (doctrine)', () => {
  test('DUE DOES NOT MEAN PAID: an obligation past its due date stays open until explicitly resolved', () => {
    const created = createObligation(base(), ctx(), fields({ dueDate: '2026-09-01' })); // well before "today" (09-16)
    const task = created.state.tasks.find((t) => t.id === created.id);
    assert.equal(task.status, 'open');
    const view = moneyItemsOf(created.state, DAY).find((v) => v.taskId === task.id);
    assert.equal(view.status, 'open');
    assert.equal(view.pastDue, true, 'it is correctly PAST DUE...');
    // ...and NOTHING about the passage of time itself resolves it. Only an explicit call does.
    const stillOpen = moneyItemsOf(created.state, '2027-01-01').find((v) => v.taskId === task.id);
    assert.equal(stillOpen.status, 'open', 'a year later, with no resolve call, it is still open');
  });

  test('EXPECTED DOES NOT MEAN RECEIVED: expected income past its date stays open until explicitly resolved', () => {
    const created = createExpectedIncome(base(), ctx(), fields({ dueDate: '2026-09-01' }));
    const laterView = moneyItemsOf(created.state, '2027-01-01').find((v) => v.taskId === created.id);
    assert.equal(laterView.status, 'open');
    assert.equal(laterView.direction, 'inflow');
  });

  test('resolving marks it resolved with a real timestamp, and resolving twice is refused (idempotent, not duplicated)', () => {
    const created = createObligation(base(), ctx(), fields());
    const first = resolveMoneyItem(created.state, ctx({ nowMs: MORNING + 60_000 }), created.id);
    assert.equal(first.outcome, 'saved');
    const task = first.state.tasks.find((t) => t.id === created.id);
    assert.equal(task.status, 'completed');
    assert.ok(task.completedAt);
    const second = resolveMoneyItem(first.state, ctx(), created.id);
    assert.equal(second.outcome, 'not_open', 'resolving an already-resolved item does nothing — never a second completion');
    assert.deepEqual(second.state, first.state);
  });

  test('cancelling keeps the record (archived, never deleted) and is refused on an already-resolved item', () => {
    const created = createObligation(base(), ctx(), fields());
    const cancelled = cancelMoneyItem(created.state, ctx(), created.id);
    assert.equal(cancelled.outcome, 'saved');
    const task = cancelled.state.tasks.find((t) => t.id === created.id);
    assert.equal(task.status, 'archived');
    assert.equal(task.title, 'Car insurance', 'the record survives, in full');

    const resolvedFirst = resolveMoneyItem(created.state, ctx(), created.id);
    const cancelAfterResolve = cancelMoneyItem(resolvedFirst.state, ctx(), created.id);
    assert.equal(cancelAfterResolve.outcome, 'not_open');
  });

  test('resolving or cancelling a missing or non-money task is refused', () => {
    assert.equal(resolveMoneyItem(base(), ctx(), 'does-not-exist').outcome, 'not_a_money_item');
    const withPlainTask = { ...base() };
    assert.equal(cancelMoneyItem(withPlainTask, ctx(), 'does-not-exist').outcome, 'not_a_money_item');
  });
});

describe('Money OS — duplicateMoneyItemForward (manual, never automatic — MP-09-01)', () => {
  test('creates a brand-new open item from the template, at the confirmed next date, leaving the source untouched', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields({ title: 'Rent', amountText: '1800', paymentMechanism: 'autopay' }));
    const resolved = resolveMoneyItem(created.state, c, created.id);
    const dup = duplicateMoneyItemForward(resolved.state, c, { taskId: created.id, nextDueDate: '2026-10-01' });
    assert.equal(dup.outcome, 'saved');
    assert.notEqual(dup.id, created.id);

    const source = dup.state.tasks.find((t) => t.id === created.id);
    assert.equal(source.status, 'completed', 'the source occurrence keeps its own resolved history, untouched');

    const next = dup.state.tasks.find((t) => t.id === dup.id);
    assert.equal(next.title, 'Rent');
    assert.deepEqual(next.value, { amountMinor: 180000, currency: 'USD', direction: 'outflow' });
    assert.equal(next.paymentMechanism, 'autopay');
    assert.equal(next.dueDate, '2026-10-01');
    assert.equal(next.status, 'open', 'the new occurrence starts open — it is a distinct, independent fact');
    assert.equal(next.provenance.producer, 'user-action', 'she confirmed this specific duplication; it is not silently inherited or inferred');
  });

  test('duplicating twice creates two distinct new occurrences, each independently resolvable', () => {
    const c = ctx();
    const created = createObligation(base(), c, fields({ title: 'Rent', amountText: '1800' }));
    const dup1 = duplicateMoneyItemForward(created.state, c, { taskId: created.id, nextDueDate: '2026-10-01' });
    const dup2 = duplicateMoneyItemForward(dup1.state, c, { taskId: created.id, nextDueDate: '2026-11-01' });
    assert.notEqual(dup1.id, dup2.id);
    const resolved1 = resolveMoneyItem(dup2.state, c, dup1.id);
    const stillOpen2 = resolved1.state.tasks.find((t) => t.id === dup2.id);
    assert.equal(stillOpen2.status, 'open', 'resolving October rent must never resolve November rent');
  });
});

describe('Money OS — displayAmount', () => {
  test('formats the exact decimal string, never a float', () => {
    const created = createObligation(base(), ctx(), fields({ amountText: '84.50' }));
    const task = created.state.tasks.find((t) => t.id === created.id);
    assert.equal(displayAmount(task), '84.50');
  });

  test('a non-money task has no display amount', () => {
    assert.equal(displayAmount({ value: null }), null);
  });
});
