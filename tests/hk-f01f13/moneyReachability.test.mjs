/**
 * HK13-D17 (P3) — every open Money task is on Money Home, exactly once (HK-F01-F13 integration audit).
 *
 * Money is a `TASK_LIST_ROLES` category, so the Life hub's "Other open tasks" deliberately skips a Money task and trusts Money Home to
 * list it. Money Home listed: due now (bounded to the first glance), the next two weeks, and generic tasks with no amount. An item due
 * later than two weeks, one past the first-glance bound, an autopay bill due TODAY (kept out of attention, but not "after today"), and a
 * task with an amount but no date were listed nowhere on it.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { createMoneyFollowUp } from '../../src/features/coparent/mutations.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { openTasksInCategory } from '../../src/domain/taskLists.ts';
import { moneyCategoryId } from '../../src/features/money/identity.ts';
import { MoneyBody } from '../../src/features/money/MoneyBody.tsx';
import { MONEY_COPY } from '../../src/features/money/moneyCopy.ts';
import { cancelMoneyItem, createExpectedIncome, createObligation, resolveMoneyItem } from '../../src/features/money/mutations.ts';
import { NEEDS_ATTENTION_LIMIT, buildMoneyHomeView } from '../../src/features/money/projection.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { render } from '../support/render.tsx';

const TZ = 'America/New_York';
const DAY = '2026-09-16';
const MORNING = Date.UTC(2026, 8, 16, 14, 0);
let n = 0;
const ctx = () => ({ nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-mr-${++n}` });
const READY = { state: 'ready', canWrite: true };

function household() {
  let s = createEmptyState(TZ);
  const bill = (title, dueDate, paymentMechanism = 'manual') => {
    const r = createObligation(s, ctx(), { title, amountText: '40', dueDate, paymentMechanism, childId: null, notes: '' });
    s = r.state;
    return r.id;
  };
  const income = (title, dueDate) => {
    const r = createExpectedIncome(s, ctx(), { title, amountText: '900', dueDate, paymentMechanism: null, childId: null, notes: '' });
    s = r.state;
    return r.id;
  };
  const ids = {
    overdue: ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09'].map((d, i) => bill(`Overdue ${i + 1}`, d)),
    dueToday: bill('Electric', DAY),
    autopayToday: bill('Phone plan', DAY, 'autopay'),
    soon: bill('Water', '2026-09-21'),
    incomeSoon: income('Refund', '2026-09-25'),
    later: bill('Property tax', '2026-10-20'),
    incomeLater: income('Bonus', '2026-11-01'),
    resolved: bill('Paid already', '2026-09-10'),
    cancelled: bill('Not owed', '2026-09-12'),
  };
  s = resolveMoneyItem(s, ctx(), ids.resolved).state;
  s = cancelMoneyItem(s, ctx(), ids.cancelled).state;
  // An amount with no date: what a Talk It Out capture, or a date cleared in the generic editor, leaves behind.
  s = addTask(s, ctx(), { title: 'Split the dinner bill', categoryId: moneyCategoryId(s), scope: 'household', value: { amountMinor: 3200, currency: 'USD', direction: 'inflow' } });
  ids.undatedAmount = s.tasks.at(-1).id;
  // A generic task filed under Money.
  s = addTask(s, ctx(), { title: 'Call the bank', categoryId: moneyCategoryId(s), scope: 'household', dueDate: '2026-09-18' });
  ids.generic = s.tasks.at(-1).id;
  return { state: s, ids };
}

const view = (state) => buildMoneyHomeView(state, state.household.id, { nowMs: MORNING });

describe('Money Home lists every open Money task exactly once', () => {
  test('the sections partition the category\'s open tasks: nothing listed twice, nothing listed nowhere', () => {
    const { state } = household();
    const v = view(state);
    const listed = [
      ...v.needsAttention, ...v.needsAttentionMore, ...v.comingUp, ...v.expectedIn, ...v.later,
    ].map((i) => i.taskId).concat(v.otherOpenTasks.map((e) => e.task.id));
    const open = openTasksInCategory(state, moneyCategoryId(state), DAY).map((e) => e.task.id);
    assert.equal(new Set(listed).size, listed.length, 'nothing listed twice');
    assert.deepEqual(new Set(listed), new Set(open), 'every open task in the category, and nothing else');
  });

  test('each item is where it belongs', () => {
    const { state, ids } = household();
    const v = view(state);
    const idsOf = (items) => items.map((i) => i.taskId);
    assert.equal(v.needsAttention.length, NEEDS_ATTENTION_LIMIT, 'the first glance stays bounded');
    assert.deepEqual(new Set([...idsOf(v.needsAttention), ...idsOf(v.needsAttentionMore)]), new Set([...ids.overdue, ids.dueToday]), 'and the rest is kept, not dropped');
    assert.ok(idsOf(v.comingUp).includes(ids.autopayToday), 'an autopay bill due today is coming up — due, not a problem');
    assert.equal(idsOf([...v.needsAttention, ...v.needsAttentionMore]).includes(ids.autopayToday), false, 'and gets no pre-due nudge');
    assert.ok(idsOf(v.comingUp).includes(ids.soon));
    assert.deepEqual(idsOf(v.expectedIn), [ids.incomeSoon]);
    assert.deepEqual(idsOf(v.later), [ids.later, ids.incomeLater], 'after the two-week window, soonest first');
    assert.deepEqual(new Set(v.otherOpenTasks.map((e) => e.task.id)), new Set([ids.undatedAmount, ids.generic]));
  });
});

describe('Money Home, rendered', () => {
  const texts = (r) => r.root.findAllByType('Text').map((t) => [].concat(t.props.children).join(''));
  const labels = (r) => r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
  const body = (v) => render(<MoneyBody gate={READY} view={v} today={DAY} onAddObligation={() => {}} onAddIncome={() => {}} onOpenItem={() => {}} onOpenTask={() => {}} />);

  test('"Show N more" reveals the rest of what is due now; the Later section lists what is further out', async () => {
    const { state } = household();
    const v = view(state);
    const r = await body(v);
    const more = r.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === MONEY_COPY.showMore(v.needsAttentionMore.length));
    assert.ok(more, 'the rest is one tap away');
    assert.equal(labels(r).some((l) => String(l).startsWith(`${v.needsAttentionMore[0].title}:`)), false);
    await TestRenderer.act(async () => more.props.onPress());
    assert.ok(labels(r).some((l) => String(l).startsWith(`${v.needsAttentionMore[0].title}:`)));
    assert.ok(texts(r).includes(MONEY_COPY.sectionLater.toUpperCase()));
    assert.ok(labels(r).some((l) => String(l).startsWith('Property tax:')));
  });

  test('a merely requested reimbursement does not draw an empty "Needs attention" header', async () => {
    let s = createEmptyState(TZ);
    s = createMoneyFollowUp(s, ctx(), { childId: null, title: 'Soccer registration', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: '2026-09-25', notes: '' },
      { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }).state;
    const v = view(s);
    assert.equal(v.outstandingReimbursements.length, 1, 'requested, so outstanding');
    const r = await body(v);
    assert.equal(texts(r).includes(MONEY_COPY.sectionNeedsAttention.toUpperCase()), false);
  });
});
