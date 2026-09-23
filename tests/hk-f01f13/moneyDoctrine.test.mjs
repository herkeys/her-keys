/**
 * HK13-D19 (P4) — nothing outside Money calls a Money item paid or received when only "done" was said (HK-F01-F13 integration audit).
 *
 * Completing one of Money's items IS recording it paid (an obligation) or received (expected income) — Money Home then says so. One Move
 * offered expected income as "the one thing to do today", and "I did it" recorded it RECEIVED; it offered an autopay bill before it was
 * due, the very pre-due nudge F09 rules out. The generic task editor completed either with "Mark done". Doctrine: "paid" only when paid
 * is what she said; "received" only when received is what she said.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { oneMoveForDay, resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { createMoneyFollowUp } from '../../src/features/coparent/mutations.ts';
import { createExpectedIncome, createObligation } from '../../src/features/money/mutations.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { buildMoneyHomeView } from '../../src/features/money/projection.ts';
import { attentionView } from '../../src/features/today/model/attentionView.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ, ctx } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';
import { harness, launch } from '../support/fixtures.mjs';

await import('../today/support/stub-expo-router.mjs');
await import('../today/support/stub-appstate.mjs');
const { router } = await import('../today/support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { TaskForm } = await import('../../src/features/tasks/TaskForm.tsx');
const { MoneyBody } = await import('../../src/features/money/MoneyBody.tsx');
router.back ??= (...args) => router.calls.push(['back', ...args]);

const PREVIOUS_DAY = '2026-09-15';

function onboarded(c) {
  let s = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) s = toggleOnboardingOption(s, group, id);
  return completeOnboarding(s, c);
}
const money = (overrides) => ({ title: 'Item', amountText: '50', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '', ...overrides });

/** A household holding ONE money-ish thing due today; returns the day's One Move. */
function oneMoveWith(make) {
  const c = ctx();
  const { state, id } = make(onboarded(c), c);
  return { move: oneMoveForDay(resolveOneMoveForToday(state, c), DAY), id };
}

describe('One Move never records money paid or received for her', () => {
  test('expected income is never the One Move ("I did it" would record it RECEIVED)', () => {
    const { move } = oneMoveWith((s, c) => createExpectedIncome(s, c, money({ title: 'Tax refund', paymentMechanism: null })));
    assert.equal(move.status, 'none');
  });

  test('an autopay bill is never offered before it is past due; past due, it may be (confirm it cleared)', () => {
    const today = oneMoveWith((s, c) => createObligation(s, c, money({ title: 'Phone plan', paymentMechanism: 'autopay' })));
    assert.equal(today.move.status, 'none', 'due today: no pre-due nudge');
    const late = oneMoveWith((s, c) => createObligation(s, c, money({ title: 'Phone plan', paymentMechanism: 'autopay', dueDate: PREVIOUS_DAY })));
    assert.deepEqual([late.move.status, late.move.move?.id], ['selected', late.id]);
  });

  test('a manual bill due today can still be the One Move, and an F07 reimbursement follow-up (done is not paid there) too', () => {
    const bill = oneMoveWith((s, c) => createObligation(s, c, money({ title: 'Water bill' })));
    assert.deepEqual([bill.move.status, bill.move.move?.id], ['selected', bill.id]);
    const followUp = oneMoveWith((s, c) =>
      createMoneyFollowUp(s, c, { childId: null, title: 'Soccer registration', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: DAY, notes: '' }, { kind: 'none' }));
    assert.deepEqual([followUp.move.status, followUp.move.move?.id], ['selected', followUp.id]);
  });
});

describe('the generic task editor says what completing a Money item records', () => {
  async function completeButtonFor(make) {
    const store = await launch(harness({ mode: 'empty', initial: {} }));
    let id;
    await store.commit((s, c) => {
      const made = make(s, c);
      id = made.id;
      return made.state;
    });
    await store.flush();
    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        <AppStateProvider store={store}>
          <TaskForm taskId={id} />
        </AppStateProvider>
      );
    });
    try {
      const labels = renderer.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
      return labels.find((l) => /^Mark (done|paid|received)$/.test(l));
    } finally {
      await store.flush();
      await TestRenderer.act(async () => renderer.unmount());
    }
  }

  test('a bill: "Mark paid"; expected income: "Mark received"; any other task: "Mark done"', async () => {
    assert.equal(await completeButtonFor((s, c) => createObligation(s, c, money({ title: 'Water bill' }))), 'Mark paid');
    assert.equal(await completeButtonFor((s, c) => createExpectedIncome(s, c, money({ title: 'Tax refund', paymentMechanism: null }))), 'Mark received');
    assert.equal(
      await completeButtonFor((s, c) => {
        const next = addTask(s, c, { title: 'Call the bank', categoryId: 'cat-money', scope: 'household' });
        return { state: next, id: next.tasks.at(-1).id };
      }),
      'Mark done',
      'a plain task filed under Money is not a Money item'
    );
    assert.equal(
      await completeButtonFor((s, c) =>
        createMoneyFollowUp(s, c, { childId: null, title: 'Soccer registration', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: DAY, notes: '' }, { kind: 'none' })),
      'Mark done',
      'an F07 follow-up is done, never paid'
    );
  });
});

describe('HK13-D40 — a past-due autopay bill is never called overdue', () => {
  // F09's doctrine: an autopay obligation is never told "failed" or "cleared" — only "confirm cleared", since Her Keys has no record
  // of whether the autopay went out. Past its due date it surfaces again (it may need her), but "overdue" would claim it is unpaid.
  function household() {
    const c = ctx();
    let s = onboarded(c);
    const auto = createObligation(s, c, money({ title: 'Phone plan', paymentMechanism: 'autopay', dueDate: PREVIOUS_DAY }));
    s = auto.state;
    const manual = createObligation(s, c, money({ title: 'Water bill', paymentMechanism: 'manual', dueDate: PREVIOUS_DAY }));
    return { state: manual.state, auto: auto.id, manual: manual.id };
  }

  test('Today: it was due on autopay and Her Keys has no record of whether it cleared; a manual bill is still overdue', () => {
    const { state, auto, manual } = household();
    const rows = attentionView(state, MORNING, DAY, projectStateDay(state, DAY), attentionFor(state, MORNING), { delegated: [], unacknowledged: [] }).rows;
    const autoRow = rows.find((r) => r.key === `task:${auto}`);
    assert.ok(autoRow, 'the past-due autopay bill still surfaces: it may need her');
    assert.match(autoRow.statement, /^“Phone plan” was due .+ on autopay — Her Keys has no record showing whether it cleared\.$/);
    assert.doesNotMatch(autoRow.statement, /overdue|failed|missed|late|unpaid/i);
    assert.equal(rows.find((r) => r.key === `task:${manual}`).statement, '“Water bill” is 1 day overdue.', 'a manual bill she has not marked paid is overdue');
  });

  test('Money Home: "confirm it cleared", never "Overdue since"', async () => {
    const { state } = household();
    const view = buildMoneyHomeView(state, state.household.id, { nowMs: MORNING });
    const r = await render(<MoneyBody gate={{ state: 'ready', canWrite: true }} view={view} today={DAY} onAddObligation={() => {}} onAddIncome={() => {}} onOpenItem={() => {}} onOpenTask={() => {}} />);
    const labels = r.root.findAllByType('Pressable').map((p) => String(p.props.accessibilityLabel ?? ''));
    const auto = labels.find((l) => l.startsWith('Phone plan:'));
    assert.match(auto, /Due 2026-09-15 · Autopay · confirm it cleared$/);
    assert.doesNotMatch(auto, /Overdue/);
    assert.match(labels.find((l) => l.startsWith('Water bill:')), /Overdue since 2026-09-15 · Manual$/);
  });
});
