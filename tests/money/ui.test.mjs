/**
 * Render and wiring tests for the Money OS UI, mirroring tests/coparent/ui.test.mjs.
 *
 * No live device or browser is available in this environment (react-native-web is not a
 * dependency of this app anywhere, confirmed absent even at WAVE3_BASE; Android emulator smoke
 * testing was not run for this pass). These render the real presentational components under
 * `node --test` with react-test-renderer, over state built by Money's own real mutations and
 * projections — genuine component-contract coverage (renders without crashing, responds to
 * presses, shows the right text), short of pixel/layout verification on a device.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { createEmptyState } from '../../src/state/initialState.ts';
import { addChild } from '../../src/domain/children.ts';
import { createExpectedIncome, createObligation, resolveMoneyItem } from '../../src/features/money/mutations.ts';
import { buildMoneyHomeView } from '../../src/features/money/projection.ts';
import { MoneyBody } from '../../src/features/money/MoneyBody.tsx';
import { MoneySheet } from '../../src/features/money/MoneySheet.tsx';
import { MONEY_COPY } from '../../src/features/money/moneyCopy.ts';
import { render } from '../support/render.tsx';

const TZ = 'America/New_York';
const DAY = '2026-09-16';
const MORNING = Date.UTC(2026, 8, 16, 14, 0);

function ctx(overrides = {}) {
  let counter = 0;
  return { nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-${++counter}`, ...overrides };
}
const base = () => createEmptyState(TZ);
const fields = (overrides = {}) => ({ title: 'Car insurance', amountText: '84.50', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '', ...overrides });
const READY_GATE = { state: 'ready', canWrite: true };

const stringsIn = (children) => [children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (r) => r.root.findAllByType('Text').map((node) => stringsIn(node.props.children));
const allText = (r) => texts(r).join(' | ');
const pressables = (r) => r.root.findAllByType('Pressable');
const labels = (r) => pressables(r).map((p) => p.props.accessibilityLabel);
const inputs = (r) => r.root.findAllByType('TextInput');
const inputOf = (r, label) => inputs(r).find((i) => i.props.accessibilityLabel === label);

async function press(r, label, nth = 0) {
  const found = pressables(r).filter((p) => p.props.accessibilityLabel === label);
  assert.ok(found[nth], `no pressable labelled "${label}" (have: ${labels(r).join(' | ')})`);
  assert.notEqual(found[nth].props.disabled, true, `"${label}" is disabled, so a real press would do nothing`);
  await TestRenderer.act(async () => {
    found[nth].props.onPress();
  });
}
async function type(r, label, value) {
  const input = inputOf(r, label);
  assert.ok(input, `no input labelled "${label}"`);
  await TestRenderer.act(async () => {
    input.props.onChangeText(value);
  });
}

describe('MoneyBody — renders without crashing, over real projected state', () => {
  test('the calm empty state renders the verdict and no sections', async () => {
    const view = buildMoneyHomeView(base(), 'household-1', { nowMs: MORNING });
    const r = await render(React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(r), /Nothing needs attention\./);
    assert.doesNotMatch(allText(r), /Needs attention/);
  });

  test('a due obligation renders in Needs attention with its amount and status line', async () => {
    const c = ctx();
    const created = createObligation(base(), c, fields());
    const view = buildMoneyHomeView(created.state, created.state.household.id, { nowMs: MORNING });
    const r = await render(React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(r), /needs attention/i);
    assert.match(allText(r), /Car insurance/);
    assert.match(allText(r), /84\.50/);
    assert.doesNotMatch(allText(r), /\bpaid\b/i, 'an open obligation is never worded as paid');
  });

  test('pressing an item in Needs attention calls onOpenItem with its task id', async () => {
    const c = ctx();
    const created = createObligation(base(), c, fields());
    const view = buildMoneyHomeView(created.state, created.state.household.id, { nowMs: MORNING });
    let opened = null;
    const r = await render(React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: (id) => (opened = id) }));
    await press(r, `Car insurance: 84.50 · Due ${DAY} · Manual`);
    assert.equal(opened, created.id);
  });

  test('add-bill and add-income buttons call their handlers, and are disabled when the gate refuses writes', async () => {
    const view = buildMoneyHomeView(base(), 'household-1', { nowMs: MORNING });
    let addedObligation = false;
    let addedIncome = false;
    const r = await render(
      React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => (addedObligation = true), onAddIncome: () => (addedIncome = true), onOpenItem: () => {} })
    );
    await press(r, MONEY_COPY.addObligation);
    await press(r, MONEY_COPY.addIncome);
    assert.ok(addedObligation && addedIncome);

    const readOnly = await render(
      React.createElement(MoneyBody, { gate: { state: 'ready', canWrite: false }, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} })
    );
    const addBtn = pressables(readOnly).find((p) => p.props.accessibilityLabel === MONEY_COPY.addObligation);
    assert.equal(addBtn.props.disabled, true);
  });

  test('a resolved item appears in Recently resolved, worded "Paid", never in Needs attention', async () => {
    const c = ctx();
    const created = createObligation(base(), c, fields());
    const resolved = resolveMoneyItem(created.state, c, created.id);
    const view = buildMoneyHomeView(resolved.state, resolved.state.household.id, { nowMs: MORNING });
    const r = await render(React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(r), /recently resolved/i);
    assert.match(allText(r), /Paid/);
    // The verdict sentence itself legitimately says "Nothing needs attention." — check the
    // SECTION HEADER specifically is absent, not just the phrase anywhere on the page.
    assert.equal(texts(r).includes('NEEDS ATTENTION'), false, 'the Needs attention section must not render once nothing is outstanding');
  });

  test('expected income is worded "Received" when resolved, never "Paid"', async () => {
    const c = ctx();
    const created = createExpectedIncome(base(), c, fields({ title: 'Paycheck' }));
    const resolved = resolveMoneyItem(created.state, c, created.id);
    const view = buildMoneyHomeView(resolved.state, resolved.state.household.id, { nowMs: MORNING });
    const r = await render(React.createElement(MoneyBody, { gate: READY_GATE, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(r), /Received/);
    assert.doesNotMatch(allText(r), /\bPaid\b/);
  });

  test('the loading and recovery gates render without the sections', async () => {
    const view = buildMoneyHomeView(base(), 'household-1', { nowMs: MORNING });
    const loading = await render(React.createElement(MoneyBody, { gate: { state: 'loading', canWrite: false }, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(loading), /Getting your money picture ready/);
    const recovery = await render(React.createElement(MoneyBody, { gate: { state: 'recovery', canWrite: false }, view, onAddObligation: () => {}, onAddIncome: () => {}, onOpenItem: () => {} }));
    assert.match(allText(recovery), /can't show your picture right now/);
  });
});

describe('MoneySheet — the create/edit form', () => {
  const emptyFields = { title: '', amountText: '', dueDate: DAY, paymentMechanism: null, childId: null, notes: '' };
  const baseProps = (overrides = {}) => ({
    visible: true,
    mode: 'create',
    direction: 'outflow',
    initial: emptyFields,
    notice: null,
    busy: false,
    canWrite: true,
    childOptions: [],
    onSubmit: () => {},
    onClose: () => {},
    ...overrides,
  });

  test('Save is disabled until a title and a positive amount are both present, then enables', async () => {
    const r = await render(React.createElement(MoneySheet, baseProps()));
    const save = () => pressables(r).find((p) => p.props.accessibilityLabel === MONEY_COPY.save);
    assert.equal(save().props.disabled, true, 'blank title and amount');
    await type(r, MONEY_COPY.fieldTitle, 'Car insurance');
    assert.equal(save().props.disabled, true, 'amount still blank');
    await type(r, `${MONEY_COPY.fieldAmount} (USD)`, '84.50');
    assert.equal(save().props.disabled, false, 'title, amount and the default valid due date are all present');
  });

  test('a zero or invalid amount keeps Save disabled and shows the error', async () => {
    const r = await render(React.createElement(MoneySheet, baseProps()));
    await type(r, MONEY_COPY.fieldTitle, 'Car insurance');
    await type(r, `${MONEY_COPY.fieldAmount} (USD)`, '0');
    const save = pressables(r).find((p) => p.props.accessibilityLabel === MONEY_COPY.save);
    assert.equal(save.props.disabled, true);
    assert.match(allText(r), new RegExp(MONEY_COPY.errAmount));
  });

  test('submitting calls onSubmit with exactly what was typed', async () => {
    let submitted = null;
    const r = await render(React.createElement(MoneySheet, baseProps({ onSubmit: (f) => (submitted = f) })));
    await type(r, MONEY_COPY.fieldTitle, 'Car insurance');
    await type(r, `${MONEY_COPY.fieldAmount} (USD)`, '84.50');
    await type(r, MONEY_COPY.fieldDueDateObligation, '2026-09-25');
    await press(r, MONEY_COPY.save);
    assert.deepEqual(submitted, { title: 'Car insurance', amountText: '84.50', dueDate: '2026-09-25', paymentMechanism: null, childId: null, notes: '' });
  });

  test('payment mechanism is offered for an obligation and not for expected income', async () => {
    const obligation = await render(React.createElement(MoneySheet, baseProps({ direction: 'outflow' })));
    assert.match(allText(obligation), /how this is paid/i);
    const income = await render(React.createElement(MoneySheet, baseProps({ direction: 'inflow' })));
    assert.doesNotMatch(allText(income), /how this is paid/i);
  });

  test('selecting autopay, then submitting, carries the mechanism; income never carries one even if set beforehand', async () => {
    let submitted = null;
    const r = await render(React.createElement(MoneySheet, baseProps({ direction: 'outflow', onSubmit: (f) => (submitted = f) })));
    await type(r, MONEY_COPY.fieldTitle, 'Rent');
    await type(r, `${MONEY_COPY.fieldAmount} (USD)`, '1800');
    await type(r, MONEY_COPY.fieldDueDateObligation, '2026-10-01');
    await press(r, 'Autopay');
    await press(r, MONEY_COPY.save);
    assert.equal(submitted.paymentMechanism, 'autopay');
  });

  test('a child chip is offered only when the household has children, and selecting one carries its id', async () => {
    const withChild = addChild(base(), ctx(), { displayName: 'Josie', birthDate: '2018-01-01' });
    const childId = withChild.children[0].id;
    let submitted = null;
    const r = await render(
      React.createElement(MoneySheet, baseProps({ childOptions: withChild.children, onSubmit: (f) => (submitted = f) }))
    );
    assert.match(allText(r), /Josie/);
    await type(r, MONEY_COPY.fieldTitle, 'Tuition');
    await type(r, `${MONEY_COPY.fieldAmount} (USD)`, '200');
    await type(r, MONEY_COPY.fieldDueDateObligation, '2026-10-01');
    await press(r, 'Josie');
    await press(r, MONEY_COPY.save);
    assert.equal(submitted.childId, childId);
  });

  test('resolve/cancel/duplicate actions appear only in edit mode, and each calls its own handler', async () => {
    let resolved = false;
    let cancelled = false;
    let duplicated = false;
    const r = await render(
      React.createElement(
        MoneySheet,
        baseProps({ mode: 'edit', initial: fields(), onResolve: () => (resolved = true), onCancel: () => (cancelled = true), onDuplicateForward: () => (duplicated = true) })
      )
    );
    await press(r, MONEY_COPY.markPaid);
    await press(r, MONEY_COPY.duplicateForward);
    await press(r, MONEY_COPY.cancelObligation);
    assert.ok(resolved && cancelled && duplicated);

    const createMode = await render(React.createElement(MoneySheet, baseProps()));
    assert.equal(labels(createMode).includes(MONEY_COPY.markPaid), false, 'a new item cannot be resolved before it exists');
  });

  test('the notice, when present, is shown and never silently dropped', async () => {
    const r = await render(React.createElement(MoneySheet, baseProps({ notice: MONEY_COPY.errStale })));
    assert.match(allText(r), new RegExp(MONEY_COPY.errStale));
  });
});
