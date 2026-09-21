/**
 * HK-FEATURE-08 / ML3-ML5 — the Meals screen, rendered.
 *
 * The real components (MealsBody, MealSheet, MealTaskSheet) rendered without providers or a router, driven through their handlers.
 * What is asserted is what she can see and do: an empty plan is only ever said of a household that was read, a blank day is neutral,
 * every control announces itself, every default is visible before saving, and a proposed due date changes nothing until she chooses it.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { addMeal, addMealTask } from '../../src/domain/meals.ts';
import { acknowledge, addPerson, delegate } from '../../src/domain/responsibility.ts';
import { MealSheet } from '../../src/features/meals/MealSheet.tsx';
import { MealTaskSheet } from '../../src/features/meals/MealTaskSheet.tsx';
import { MealsBody } from '../../src/features/meals/MealsBody.tsx';
import { MEAL_COPY } from '../../src/features/meals/mealCopy.ts';
import { buildMealsView } from '../../src/features/meals/mealsView.ts';
import { at, real } from '../support/acceptance.mjs';
import { render } from '../support/render.tsx';

const TODAY = '2026-09-21'; // a Monday
const READY = { state: 'ready', canWrite: true };
const noop = () => {};
const handlers = () => ({ onAddMeal: noop, onOpenEntry: noop, onPlanAgain: noop, onAddTask: noop, onOpenTask: noop });

const withMeals = (specs, base = real()) => specs.reduce((s, spec, i) => addMeal(s, at(), { id: 'meal-s' + i + (spec.date ?? ''), ...spec }).state, base);
const flat = (node) => [].concat(node.props.children ?? []).join('');
const texts = (r) => r.root.findAllByType('Text').map(flat);
const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).filter((p) => p.props.accessibilityLabel === label);
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
const type = async (input, text) => TestRenderer.act(async () => input.props.onChangeText(text));

const body = (view, over = {}) => render(<MealsBody gate={READY} view={view} flash={null} {...handlers()} {...over} />);

describe('[B] [BJ] [BK] an empty plan is only said of a household that was read', () => {
  test('[BJ1] loading shows the loading state and never the empty copy', async () => {
    const r = await body(buildMealsView(real(), TODAY), { gate: { state: 'loading', canWrite: false } });
    assert.ok(texts(r).includes(MEAL_COPY.loading));
    assert.equal(texts(r).includes(MEAL_COPY.noMealsYet), false);
    assert.equal(byLabel(r, MEAL_COPY.addMeal).length, 0, 'nothing to add to while it loads');
  });

  test('[BK1] a recovered household shows the recovery notice, never the empty copy, and offers no writes', async () => {
    const r = await body(buildMealsView(real(), TODAY), { gate: { state: 'recovery', canWrite: false } });
    assert.ok(texts(r).includes(MEAL_COPY.recoveryTitle));
    assert.equal(texts(r).includes(MEAL_COPY.noMealsYet), false);
    assert.equal(byLabel(r, MEAL_COPY.addMeal).length, 0);
  });

  test('[BK2] memory-only persistence reads fine but the add controls are disabled and it says why', async () => {
    const r = await body(buildMealsView(real(), TODAY), { gate: { state: 'ready', canWrite: false } });
    assert.ok(texts(r).includes(MEAL_COPY.readOnlyNotice));
    assert.equal(byLabel(r, MEAL_COPY.addMeal)[0].props.disabled, true);
  });
});

describe('[A] no meals', () => {
  test('[A4] the empty state describes, one primary action exists, and nothing else is drawn but the tasks section', async () => {
    const r = await body(buildMealsView(real(), TODAY));
    const all = texts(r);
    assert.ok(all.includes(MEAL_COPY.noMealsYet));
    assert.equal(byLabel(r, MEAL_COPY.addMeal)[0].props.disabled, false);
    assert.equal(all.includes(MEAL_COPY.noMealsDay), false, 'no per-day blank lines when nothing is planned at all');
    for (const heading of ['UP NEXT', 'NEXT 14 DAYS', 'LATER', 'PLAN AGAIN', 'RECURRING MEAL WORK']) assert.equal(all.includes(heading), false, heading);
    assert.ok(all.includes('MEAL TASKS'));
  });

  test('[R3] with a plan elsewhere, a blank today or tomorrow reads as a quiet description, not a gap', async () => {
    const r = await body(buildMealsView(withMeals([{ title: 'Later dinner', date: '2026-09-25' }]), TODAY));
    const all = texts(r);
    assert.equal(all.filter((t) => t === MEAL_COPY.noMealsDay).length, 2, 'today and tomorrow, described, not counted');
    assert.equal(all.some((t) => /gap|behind|missing|unplanned|still need|forgot/i.test(t)), false);
  });

  test('[Y3] without a Meals category the notice explains it and adding is disabled', async () => {
    const state = { ...real(), categories: real().categories.filter((c) => c.systemRole !== 'meals') };
    const r = await body(buildMealsView(state, TODAY));
    assert.ok(texts(r).includes(MEAL_COPY.unavailableTitle));
    assert.equal(byLabel(r, MEAL_COPY.addMeal)[0].props.disabled, true);
    assert.equal(byLabel(r, MEAL_COPY.addTask)[0].props.disabled, true, 'and so is adding a meal task: it would have no category to live in');
  });
});

describe('[BH] every control announces itself', () => {
  test('[BH1] an entry row is a labelled button that announces the meal type only when stated, and opens the entry', async () => {
    let opened = null;
    const state = withMeals([{ id: 'meal-bh1', title: 'Tacos', date: '2026-09-22', slot: 'dinner' }, { id: 'meal-bh2', title: 'Soup', date: '2026-09-22' }]);
    const r = await body(buildMealsView(state, TODAY), { onOpenEntry: (id) => { opened = id; } });
    const tacos = byLabel(r, 'Tacos, Dinner, Tuesday 22 September')[0];
    const soup = byLabel(r, 'Soup, Tuesday 22 September')[0];
    assert.equal(tacos.props.accessibilityRole, 'button');
    assert.equal(tacos.props.accessibilityHint, MEAL_COPY.openHint);
    assert.ok(soup);
    await press(tacos);
    assert.equal(opened, 'meal-bh1');
  });

  test('[BH3] every pressable has a label and a role, and an entry row is at least 44 points tall', async () => {
    const state = withMeals([{ title: 'Tacos', date: TODAY, slot: 'dinner' }, { title: 'Old', date: '2026-09-17' }, { title: 'Far', date: '2026-10-30' }]);
    const r = await body(buildMealsView(state, TODAY));
    for (const p of pressables(r)) {
      assert.ok(p.props.accessibilityLabel, 'a control has no label');
      // shared rows (StatusList) announce "label: value"; every other control states its role
      assert.ok(['button', 'link'].includes(p.props.accessibilityRole) || p.props.accessibilityLabel.includes(':'), 'a control has no role: ' + p.props.accessibilityLabel);
    }
    const entryRows = pressables(r).filter((p) => p.props.accessibilityHint === MEAL_COPY.openHint);
    assert.ok(entryRows.length >= 2);
    for (const row of entryRows) assert.ok((StyleSheet.flatten(row.props.style).minHeight ?? 0) >= 44, 'an entry row is below the minimum touch target');
  });
});

describe('the sections are bounded and adaptive', () => {
  const state = () =>
    withMeals([
      { title: 'Today meal', date: TODAY }, { title: 'Plus three', date: '2026-09-24' }, { title: 'Plus twenty', date: '2026-10-11' },
      { title: 'Last week', date: '2026-09-18', slot: 'dinner' },
    ]);

  test('[D] up next, next 14 days, later and plan again appear only when they hold something', async () => {
    const all = texts(await body(buildMealsView(state(), TODAY)));
    for (const heading of ['UP NEXT', 'NEXT 14 DAYS', 'LATER', 'PLAN AGAIN']) assert.ok(all.includes(heading), heading);
    assert.equal(all.includes('RECURRING MEAL WORK'), false, 'hidden when nothing recurs');
  });

  test('[T] plan again lists a recent plan and starts a new one from it without touching the source', async () => {
    let started = null;
    const r = await body(buildMealsView(state(), TODAY), { onPlanAgain: (id) => { started = id; } });
    const row = pressables(r).find((p) => /^Last week:/.test(p.props.accessibilityLabel ?? ''));
    assert.ok(row, 'the recent plan is offered');
    await press(row);
    assert.match(started, /^meal-s3/);
  });

  test('[Q] a past plan never appears as an upcoming or eaten meal', async () => {
    const all = texts(await body(buildMealsView(state(), TODAY)));
    assert.equal(all.some((t) => /eaten|cooked|served|skipped|completed/i.test(t)), false);
  });
});

describe('[V] [AC] meal tasks on the hub', () => {
  test('[V2] a task shows its standing, opens the task editor, and a blank list says so', async () => {
    let opened = null;
    const empty = texts(await body(buildMealsView(real(), TODAY)));
    assert.ok(empty.includes(MEAL_COPY.noMealTasks));
    const { state } = addMealTask(real(), at(), { title: 'Buy tortillas', due: { date: TODAY, confirmed: true } });
    const r = await body(buildMealsView(state, TODAY), { onOpenTask: (id) => { opened = id; } });
    const row = pressables(r).find((p) => /^Buy tortillas:/.test(p.props.accessibilityLabel ?? ''));
    assert.ok(row);
    assert.match(row.props.accessibilityLabel, /Due today/);
    await press(row);
    assert.equal(opened, state.tasks[0].id);
  });

  test('[AC1] [BI] someone being asked reads as asked, and is never announced as covered or handled', async () => {
    let s = addMealTask(real(), at(), { title: 'Buy tortillas' }).state;
    s = addPerson(s, at(), { displayName: 'Sam', relationship: 'partner' });
    s = delegate(s, at(), { about: { kind: 'task', id: s.tasks[0].id }, to: { kind: 'person', id: s.people[0].id } });
    let r = await body(buildMealsView(s, TODAY));
    let row = pressables(r).find((p) => /^Buy tortillas:/.test(p.props.accessibilityLabel ?? ''));
    assert.match(row.props.accessibilityLabel, /Asked Sam, no answer yet/);
    s = acknowledge(s, at(), s.responsibilities[0].id);
    r = await body(buildMealsView(s, TODAY));
    row = pressables(r).find((p) => /^Buy tortillas:/.test(p.props.accessibilityLabel ?? ''));
    assert.match(row.props.accessibilityLabel, /Sam has seen this/);
    assert.equal(/covered|handled|taken care|done/i.test(row.props.accessibilityLabel), false);
  });

  test('[BI1] an undated task announces that it has no date, not silence', async () => {
    const { state } = addMealTask(real(), at(), { title: 'Buy milk' });
    const r = await body(buildMealsView(state, TODAY));
    const row = pressables(r).find((p) => /^Buy milk:/.test(p.props.accessibilityLabel ?? ''));
    assert.match(row.props.accessibilityLabel, /No date/);
    assert.equal(/\bmin\b|minutes|about 15/i.test(row.props.accessibilityLabel), false, 'an assumed duration is never announced as stated');
  });
});

const sheetProps = (over = {}) => ({
  visible: true, mode: 'create', initial: { title: '', date: TODAY, slot: 'unspecified' }, today: TODAY, notice: null, busy: false, canWrite: true,
  onSubmit: noop, onClose: noop, ...over,
});

describe('[I] [G] quick add shows every default before saving', () => {
  test('[G2] the day starts as today and the meal type as Not set, both visible, and Save waits for a name', async () => {
    const r = await render(<MealSheet {...sheetProps()} />);
    const all = texts(r);
    assert.ok(all.some((t) => t.startsWith('Day: Today, Monday 21 September')), 'the default day is stated');
    assert.ok(all.includes('Meal type: Not set'), 'the default meal type is stated');
    assert.equal(byLabel(r, 'Today')[0].props.accessibilityState.selected, true);
    assert.equal(byLabel(r, 'Dinner')[0].props.accessibilityState.selected, false, 'no meal type is preselected: nothing defaults to dinner');
    assert.equal(byLabel(r, MEAL_COPY.save)[0].props.disabled, true, 'a name is needed');
  });

  test('[I1] a name and a save is a complete decision, submitted exactly as shown', async () => {
    let got = null;
    const r = await render(<MealSheet {...sheetProps({ onSubmit: (v) => { got = v; } })} />);
    await type(r.root.findByType('TextInput'), 'Tacos');
    const save = byLabel(r, MEAL_COPY.save)[0];
    assert.equal(save.props.disabled, false);
    await press(save);
    assert.deepEqual(got, { title: 'Tacos', date: TODAY, slot: 'unspecified' });
  });

  test('[H] choosing a meal type shows it, and choosing it again clears it back to Not set', async () => {
    let got = null;
    const r = await render(<MealSheet {...sheetProps({ onSubmit: (v) => { got = v; } })} />);
    await press(byLabel(r, 'Dinner')[0]);
    assert.ok(texts(r).includes('Meal type: Dinner'));
    assert.equal(byLabel(r, 'Dinner')[0].props.accessibilityState.selected, true);
    await press(byLabel(r, 'Dinner')[0]);
    assert.ok(texts(r).includes('Meal type: Not set'));
    await press(byLabel(r, 'Snack')[0]);
    await type(r.root.findByType('TextInput'), 'Apples');
    await press(byLabel(r, MEAL_COPY.save)[0]);
    assert.deepEqual(got, { title: 'Apples', date: TODAY, slot: 'snack' });
  });

  test('[K] another day is one tap from the next two weeks, or any typed date', async () => {
    let got = null;
    const r = await render(<MealSheet {...sheetProps({ onSubmit: (v) => { got = v; } })} />);
    await press(byLabel(r, 'Tomorrow')[0]);
    assert.ok(texts(r).some((t) => t.startsWith('Day: Tomorrow, Tuesday 22 September')));
    await press(byLabel(r, 'Thu 24 Sep')[0]);
    assert.ok(texts(r).some((t) => t.startsWith('Day: Thursday, Thursday 24 September')));
    await press(byLabel(r, MEAL_COPY.fieldAnotherDay)[0]);
    const input = r.root.findAllByType('TextInput').find((i) => i.props.placeholder === '2026-09-22');
    await type(input, '2026-12-25');
    assert.ok(texts(r).some((t) => t.startsWith('Day: Fri 25 Dec, Friday 25 December')));
    await type(r.root.findAllByType('TextInput')[0], 'Holiday dinner');
    await press(byLabel(r, MEAL_COPY.save)[0]);
    assert.deepEqual(got, { title: 'Holiday dinner', date: '2026-12-25', slot: 'unspecified' });
  });

  test('[K3] a malformed typed date says so and does not change the day', async () => {
    const r = await render(<MealSheet {...sheetProps()} />);
    await press(byLabel(r, MEAL_COPY.fieldAnotherDay)[0]);
    const input = r.root.findAllByType('TextInput').find((i) => i.props.placeholder === '2026-09-22');
    await type(input, '2026-02-30');
    assert.ok(texts(r).includes(MEAL_COPY.errDate));
    assert.ok(texts(r).some((t) => t.startsWith('Day: Today, Monday 21 September')), 'the day was not changed by bad input');
  });

  test('[BK2] when writes are not possible, Save is disabled', async () => {
    const r = await render(<MealSheet {...sheetProps({ canWrite: false, initial: { title: 'Tacos', date: TODAY, slot: 'unspecified' } })} />);
    assert.equal(byLabel(r, MEAL_COPY.save)[0].props.disabled, true);
  });
});

describe('[J] [N] [T] edit, remove and plan again', () => {
  const edit = (over = {}) => sheetProps({ mode: 'edit', initial: { title: 'Tacos', date: '2026-09-22', slot: 'dinner' }, ...over });

  test('[J] editing opens with the meal\'s own values, an entry outside the next two weeks keeps its own day', async () => {
    const r = await render(<MealSheet {...edit({ initial: { title: 'Old plan', date: '2026-09-10', slot: 'lunch' } })} />);
    assert.equal(r.root.findByType('TextInput').props.value, 'Old plan');
    assert.ok(byLabel(r, 'Thu 10 Sep')[0], 'its own day is a chip, so its date is never silently replaced');
    assert.equal(byLabel(r, 'Thu 10 Sep')[0].props.accessibilityState.selected, true);
    assert.equal(byLabel(r, 'Lunch')[0].props.accessibilityState.selected, true);
  });

  test('[N1] [T1] the edit sheet offers remove, plan again and add a task, and remove says only that it leaves the plan', async () => {
    const calls = [];
    const r = await render(<MealSheet {...edit({ onRemove: () => calls.push('remove'), onPlanAgain: () => calls.push('again'), onAddTask: () => calls.push('task') })} />);
    for (const label of [MEAL_COPY.remove, MEAL_COPY.planAgain, MEAL_COPY.addTaskForMeal]) await press(byLabel(r, label)[0]);
    assert.deepEqual(calls, ['remove', 'again', 'task']);
    assert.equal(byLabel(r, MEAL_COPY.remove)[0].props.accessibilityHint, MEAL_COPY.removeHint);
    assert.equal(/eaten|skipped|done|complete/i.test(MEAL_COPY.remove + MEAL_COPY.removeHint + MEAL_COPY.removed), false);
  });

  test('[AQ] a notice from a stale save is shown inside the sheet', async () => {
    const r = await render(<MealSheet {...edit({ notice: MEAL_COPY.errStale })} />);
    assert.ok(texts(r).includes(MEAL_COPY.errStale));
  });

  test('[T1] plan again opens with the earlier title and slot and TODAY as a visible default day', async () => {
    const r = await render(<MealSheet {...sheetProps({ mode: 'again', initial: { title: 'Tacos', date: TODAY, slot: 'dinner' } })} />);
    assert.equal(r.root.findByType('TextInput').props.value, 'Tacos');
    assert.ok(texts(r).some((t) => t.startsWith('Day: Today, Monday 21 September')));
    assert.ok(texts(r).includes('Meal type: Dinner'));
    assert.equal(byLabel(r, MEAL_COPY.remove).length, 0, 'a new plan has nothing to remove');
  });
});

describe('[AB] [AA] the meal task sheet', () => {
  const taskProps = (over = {}) => ({ visible: true, proposedDate: null, notice: null, busy: false, canWrite: true, onSubmit: noop, onClose: noop, ...over });

  test('[AB1] from a meal, its day is only OFFERED: unselected, and a save without choosing it records it unconfirmed', async () => {
    let got = null;
    const r = await render(<MealTaskSheet {...taskProps({ proposedDate: '2026-09-22', onSubmit: (v) => { got = v; } })} />);
    const chip = byLabel(r, 'Due Tue 22 Sep, the day of this meal')[0];
    assert.ok(chip, 'the proposal is offered');
    assert.equal(chip.props.accessibilityState.selected, false, 'and nothing is preselected');
    await type(r.root.findAllByType('TextInput')[0], 'Buy tortillas');
    await press(byLabel(r, MEAL_COPY.taskSave)[0]);
    assert.deepEqual(got, { title: 'Buy tortillas', minutes: null, due: { date: '2026-09-22', confirmed: false } });
  });

  test('[AB2] turning the proposal on is her explicit confirmation', async () => {
    let got = null;
    const r = await render(<MealTaskSheet {...taskProps({ proposedDate: '2026-09-22', onSubmit: (v) => { got = v; } })} />);
    await press(byLabel(r, 'Due Tue 22 Sep, the day of this meal')[0]);
    assert.equal(byLabel(r, 'Due Tue 22 Sep, the day of this meal')[0].props.accessibilityState.selected, true);
    await type(r.root.findAllByType('TextInput')[0], 'Buy tortillas');
    await press(byLabel(r, MEAL_COPY.taskSave)[0]);
    assert.deepEqual(got.due, { date: '2026-09-22', confirmed: true });
  });

  test('[AB] from the Meals screen itself there is no proposal at all', async () => {
    let got = null;
    const r = await render(<MealTaskSheet {...taskProps({ onSubmit: (v) => { got = v; } })} />);
    assert.equal(pressables(r).some((p) => /^Due /.test(p.props.accessibilityLabel ?? '')), false);
    await type(r.root.findAllByType('TextInput')[0], 'Defrost chicken');
    await press(byLabel(r, MEAL_COPY.taskSave)[0]);
    assert.deepEqual(got, { title: 'Defrost chicken', minutes: null, due: null });
  });

  test('[AA] minutes are optional and left blank mean not stated; typed minutes are passed as a number; nonsense is refused in place', async () => {
    let got = null;
    const r = await render(<MealTaskSheet {...taskProps({ onSubmit: (v) => { got = v; } })} />);
    const [title, minutes] = r.root.findAllByType('TextInput');
    await type(title, 'Chop vegetables');
    await type(minutes, '25');
    await press(byLabel(r, MEAL_COPY.taskSave)[0]);
    assert.equal(got.minutes, 25);
    await type(minutes, 'soon');
    assert.ok(texts(r).includes(MEAL_COPY.errMinutes));
    assert.equal(byLabel(r, MEAL_COPY.taskSave)[0].props.disabled, true);
    await type(minutes, '');
    assert.equal(byLabel(r, MEAL_COPY.taskSave)[0].props.disabled, false);
  });

  test('[AA] the sheet says leaving minutes blank is fine, and never that a default is a stated time', async () => {
    const r = await render(<MealTaskSheet {...taskProps()} />);
    assert.ok(texts(r).includes(MEAL_COPY.minutesHint));
    assert.equal(texts(r).some((t) => /about 15|15 min|assumed/i.test(t)), false);
  });
});
