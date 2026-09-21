/**
 * HK-FEATURE-08 / ML7 — the copy-truth audit and the affordance audit.
 *
 * Every string a woman can read OR hear on the Meals surfaces is collected by rendering every state (visible text, accessibility labels
 * and hints), plus the copy module and the Life hub row, and inspected mechanically. A claim word may appear only where a named piece
 * of canonical evidence supports it; the words that assert something Her Keys cannot know (a meal eaten, food safe, an item bought, a
 * task covered) may not appear at all. Unsupported claims: zero.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { addMeal, addMealTask } from '../../src/domain/meals.ts';
import { addRecurrence } from '../../src/domain/structure.ts';
import { accept, acknowledge, addPerson, delegate } from '../../src/domain/responsibility.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { categoriesInOrder } from '../../src/domain/categories.ts';
import { deriveLifeStatus } from '../../src/features/life/lifeStatus.ts';
import { MealSheet } from '../../src/features/meals/MealSheet.tsx';
import { MealTaskSheet } from '../../src/features/meals/MealTaskSheet.tsx';
import { MealsBody } from '../../src/features/meals/MealsBody.tsx';
import { MEAL_COPY, SLOT_LABEL, dueProposalA11yLabel, dueProposalLabel, entryA11yLabel, moreLater, moreTasks, responsibilityText } from '../../src/features/meals/mealCopy.ts';
import { cadenceText } from '../../src/features/meals/recurringMealWork.ts';
import { buildMealsView } from '../../src/features/meals/mealsView.ts';
import { upcomingMealsOf } from '../../src/features/meals/upcomingMeals.ts';
import { at, real, USER } from '../support/acceptance.mjs';
import { render } from '../support/render.tsx';

const TODAY = '2026-09-21';
const noop = () => {};
const handlers = { onAddMeal: noop, onOpenEntry: noop, onPlanAgain: noop, onAddTask: noop, onOpenTask: noop };

/** A rich household: every section, every task standing, every responsibility state, a recurring task and a System. */
function richState() {
  let s = real();
  const plan = [
    ['Tacos', '2026-09-21', 'dinner'], ['Soup', '2026-09-22', undefined], ['Pasta', '2026-09-25', 'lunch'], ['Far away', '2026-10-30', 'snack'],
    ['Last week', '2026-09-18', 'dinner'], ['Older', '2026-09-12', 'breakfast'], ...Array.from({ length: 8 }, (_, i) => ['Later ' + i, `2026-11-0${i + 1}`, undefined]),
  ];
  plan.forEach(([title, date, slot], i) => { s = addMeal(s, at(), { id: 'meal-audit-' + i, title, date, slot }).state; });
  s = addPerson(s, at(), { displayName: 'Sam', relationship: 'partner' });
  const personId = s.people[0].id;
  const task = (title, due) => { s = addMealTask(s, at(), { title, due: due ? { date: due, confirmed: true } : null }).state; return s.tasks[s.tasks.length - 1].id; };
  const overdue = task('Buy tortillas', '2026-09-18');
  task('Buy milk', TODAY);
  task('Defrost chicken', '2026-09-24');
  const asked = task('Chop vegetables');
  const seen = task('Pack lunches');
  const said = task('Order groceries');
  for (const id of [asked, seen, said]) s = delegate(s, at(), { about: { kind: 'task', id }, to: { kind: 'person', id: personId }, ackWithinMinutes: 30 });
  s = acknowledge(s, at(), s.responsibilities.find((r) => r.about.id === seen).id);
  s = accept(s, at(), s.responsibilities.find((r) => r.about.id === said).id, true);
  void overdue;
  s = addRecurrence(s, at(), { kind: 'task', id: s.tasks.find((t) => t.title === 'Defrost chicken').id }, { anchorDate: '2026-09-22', frequency: 'weekly', byWeekday: [2, 4] });
  s = { ...s, systems: [{ id: 'sys-1', name: 'Sunday meal prep', description: '', categoryId: 'cat-meals', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: USER, scope: 'household' }] };
  for (let i = 0; i < 25; i += 1) s = addTask(s, at(), { title: 'Filler ' + i, categoryId: 'cat-meals', scope: 'household' });
  return s;
}

const collect = (renderer) => {
  const out = [];
  for (const t of renderer.root.findAllByType('Text')) out.push([].concat(t.props.children ?? []).join(''));
  for (const n of renderer.root.findAll((x) => typeof x.props?.accessibilityLabel === 'string')) out.push(n.props.accessibilityLabel);
  for (const n of renderer.root.findAll((x) => typeof x.props?.accessibilityHint === 'string')) out.push(n.props.accessibilityHint);
  return out.map((s) => s.trim()).filter(Boolean);
};

async function everythingSheSeesAndHears() {
  const view = buildMealsView(richState(), TODAY, at().nowMs + 7_200_000);
  const strings = new Set();
  const add = (list) => list.forEach((s) => strings.add(s));
  const body = (gate, v, over = {}) => render(React.createElement(MealsBody, { gate, view: v, flash: null, ...handlers, ...over }));

  add(collect(await body({ state: 'ready', canWrite: true }, view, { flash: MEAL_COPY.removed })));
  add(collect(await body({ state: 'ready', canWrite: true }, buildMealsView(real(), TODAY))));
  add(collect(await body({ state: 'loading', canWrite: false }, view)));
  add(collect(await body({ state: 'recovery', canWrite: false }, view)));
  add(collect(await body({ state: 'ready', canWrite: false }, view)));
  add(collect(await body({ state: 'ready', canWrite: true }, buildMealsView({ ...real(), categories: real().categories.filter((c) => c.systemRole !== 'meals') }, TODAY))));
  add(collect(await body({ state: 'ready', canWrite: true }, buildMealsView(addMeal(real(), at(), { title: 'One', date: '2026-09-25' }).state, TODAY))));

  const sheet = { visible: true, today: TODAY, busy: false, canWrite: true, onSubmit: noop, onClose: noop };
  for (const mode of ['create', 'edit', 'again']) {
    add(collect(await render(React.createElement(MealSheet, { ...sheet, mode, notice: mode === 'edit' ? MEAL_COPY.errStale : null, initial: { title: 'Tacos', date: '2026-09-22', slot: 'dinner' }, onRemove: noop, onPlanAgain: noop, onAddTask: noop }))));
  }
  const taskSheet = { visible: true, notice: null, busy: false, canWrite: true, onSubmit: noop, onClose: noop };
  add(collect(await render(React.createElement(MealTaskSheet, { ...taskSheet, proposedDate: '2026-09-22' }))));
  add(collect(await render(React.createElement(MealTaskSheet, { ...taskSheet, proposedDate: null, notice: MEAL_COPY.errMinutes }))));

  // the copy module itself, and the Life hub row
  add(Object.values(MEAL_COPY));
  add(Object.values(SLOT_LABEL));
  add([moreLater(1), moreLater(5), moreTasks(1), moreTasks(9), dueProposalLabel('2026-09-22'), dueProposalA11yLabel('2026-09-22')]);
  for (const slot of Object.keys(SLOT_LABEL)) add([entryA11yLabel('Tacos', slot, '2026-09-22')]);
  for (const s of ['owned', 'requested', 'acknowledged', 'accepted']) for (const opts of [{}, { stillNeedsMe: true }, { unanswered: true }]) add([responsibilityText(s, 'Sam', opts), responsibilityText(s, null, opts)]);
  for (const rule of [{ trigger: 'schedule', frequency: 'daily', interval: 1 }, { trigger: 'schedule', frequency: 'weekly', interval: 2, byWeekday: [2] }, { trigger: 'schedule', frequency: 'monthly', interval: 1, byMonthDay: 3 }, { trigger: 'manual', frequency: null, interval: 1 }, { trigger: 'after_completion', frequency: 'weekly', interval: 1 }]) add([cadenceText({ byWeekday: null, byMonthDay: null, ...rule })]);
  for (const meals of [[], [{ label: 'Today' }], [{ label: 'Sat 3 Oct' }]]) {
    const s = { ...real() };
    const row = deriveLifeStatus({ categories: categoriesInOrder(s), events: [], tasks: [], systems: [], upcomingMeals: meals.map((m) => ({ ...m, categoryId: 'cat-meals' })) }).find((x) => x.systemRole === 'meals');
    add([row.value]);
  }
  void upcomingMealsOf;
  return [...strings].filter((s) => /[A-Za-z]/.test(s));
}

const FORBIDDEN = [
  // "fresh" is a food claim; "started fresh" is the app's own reset wording (PersistenceNotice says it too) and is not about food.
  ['food safety or medical claim', /\b(safe|unsafe|allerg\w*|healthy|unhealthy|nutritious|nutrition\w*|calor\w*|macros?|diet\w*|gluten\w*|stale|expired|expires|spoil\w*|pantry|inventory|ingredient\w*)\b|(?<!started )\bfresh\b/i],
  ['execution or consumption claim', /\b(eaten|ate|eating|cooked|served|consumed|prepared|purchased|bought|finished|skipped|missed|failed)\b/i],
  ['guilt, prescription or pressure', /\b(should|must|behind|forgot|forgotten|catch up|get organi[sz]ed|start planning|be productive|on track|off track|streak|score|goal|unplanned|incomplete|complete|completed)\b|\bneed to\b|\bstill need\b(?! you)/i],
  ['ranking or recommendation', /\b(best|better|healthier|recommend\w*|suggest\w*|favou?rite|popular|top pick|easy|easiest|effortless|quick meal)\b/i],
  ['coverage claim', /\b(covered|handled|taken care of|all set|sorted|done for you|delegated|assigned)\b/i],
  ['a time of day', /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i],
  ['unfinished or fake affordance', /coming soon|\btodo\b|\btbd\b|not implemented|lorem|placeholder|\bfake\b/i],
  ['the retired coverage wording', /planned through|nothing planned/i],
];

/** A claim word may appear only where this evidence supports it. */
const CLAIMS = {
  planned: {
    evidence: 'an ACTIVE MealPlanEntry exists (a planning record), or none does and the string only describes that',
    allowed: [/^No meals planned( yet)?\.?$/, /^\d+ more meals? (is|are) planned after that\.$/, /^1 more meal is planned after that\.$/, /^Planned [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/, /^[A-Za-z]+ · planned [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/, /^Meal plans belong to a Meals category/],
  },
  due: {
    evidence: 'a task due date she gave (standing wording), or the OFFERED proposal of a meal\'s day, unselected until she chooses it',
    allowed: [/^Due (today|tomorrow|[A-Z][a-z]{2} \d{1,2})$/, /^Due [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, the day of this meal$/, /^Due [A-Za-z]+ \d{1,2} [A-Za-z]+, the day of this meal$/, /^Due (today|tomorrow|[A-Z][a-z]{2} \d{1,2})( · .+)?$/],
  },
  asked: { evidence: 'a live responsibility in state requested', allowed: [/^Asked \w+, (no answer yet|still waiting)$/, /Asked \w+, (no answer yet|still waiting)$/] },
  seen: { evidence: 'a live responsibility in state acknowledged (seen is not yes)', allowed: [/^\w+ has seen this$/, /\w+ has seen this$/] },
  yes: { evidence: 'a live responsibility in state accepted, with stillNeedsMe stated', allowed: [/^\w+ said yes( · still needs you)?$/, /\w+ said yes( · still needs you)?$/] },
  repeats: { evidence: 'an active canonical recurrence rule on a Meals TASK', allowed: [/^Repeats (when you ask for it|after each time it’s done)$/] },
};

const claimWords = { planned: /\bplanned\b/i, due: /\bdue\b/i, asked: /\basked\b/i, seen: /\bseen\b/i, yes: /\bsaid yes\b/i, repeats: /\brepeats\b/i };

describe('[BN] the copy-truth audit', () => {
  test('[BN1] [BN2] every string she can read or hear is free of the forbidden vocabulary', async () => {
    const strings = await everythingSheSeesAndHears();
    assert.ok(strings.length > 80, `only ${strings.length} strings were collected`);
    const problems = [];
    for (const text of strings) {
      for (const [label, re] of FORBIDDEN) if (re.test(text)) problems.push(`${label}: "${text}"`);
      if (/!/.test(text)) problems.push(`an exclamation mark: "${text}"`);
    }
    assert.deepEqual(problems, []);
    console.log(`  copy audit: ${strings.length} distinct strings read or heard across every Meals state, ${FORBIDDEN.length} forbidden classes, 0 hits`);
  });

  test('[BN1] every claim word appears only where its canonical evidence is named (unsupported claims: zero)', async () => {
    const strings = await everythingSheSeesAndHears();
    const table = {};
    const unsupported = [];
    for (const text of strings) {
      for (const [word, re] of Object.entries(claimWords)) {
        if (!re.test(text)) continue;
        const claim = CLAIMS[word];
        // A shared list row is announced as "label: value"; the claim lives in the value, so both forms are checked.
        const forms = [text, text.replace(/^.*?: /, '')];
        const ok = claim.allowed.some((allowed) => forms.some((form) => allowed.test(form)));
        (table[word] ??= new Set()).add(text);
        if (!ok) unsupported.push(`${word}: "${text}"`);
      }
    }
    assert.deepEqual(unsupported, []);
    for (const [word, texts] of Object.entries(table)) console.log(`  claim "${word}" (${texts.size} strings) is supported by: ${CLAIMS[word].evidence}`);
  });

  test('[P3] [Q] no string says a removed or past meal was eaten or skipped', async () => {
    const strings = await everythingSheSeesAndHears();
    assert.equal(strings.some((s) => /\b(eaten|skipped|removed it because|missed)\b/i.test(s)), false);
    assert.ok(strings.includes(MEAL_COPY.removed), 'removal is worded as removal: "Removed from your plan."');
  });

  test('[CG2] [S2] the Life hub row never claims coverage and no string carries a percentage or a "x of y planned" count', async () => {
    const strings = await everythingSheSeesAndHears();
    for (const s of strings) {
      assert.equal(/planned through|\d\s*%|\d+\s+of\s+\d+/i.test(s), false, s);
    }
    assert.ok(strings.includes('No meals planned yet'));
    assert.ok(strings.includes('Next: Today'));
  });

  test('[AA] [BI] no string presents an assumed duration as a stated time', async () => {
    const strings = await everythingSheSeesAndHears();
    assert.equal(strings.some((s) => /\b(15|fifteen) ?(min|minutes)\b|about \d+ ?min/i.test(s)), false);
  });
});

describe('the affordance audit', () => {
  test('[BN] no unfinished or fake affordance exists in any Meals source', () => {
    for (const file of ['MealsOverview.tsx', 'MealsBody.tsx', 'MealSheet.tsx', 'MealTaskSheet.tsx', 'mealCopy.ts', 'mealsView.ts', 'recurringMealWork.ts']) {
      const text = readFileSync(new URL('../../src/features/meals/' + file, import.meta.url), 'utf8');
      assert.equal(/coming soon|\bTODO\b|\bTBD\b|not implemented|lorem|fake (recipe|pantry|inventory|grocery|nutrition|ai)|onPress=\{\(\) => \{\}\}|onPress=\{noop\}/i.test(text), false, file);
    }
  });

  test('[BN] every enabled control in every state has a real handler, and a disabled one is explained on screen', async () => {
    const view = buildMealsView(richState(), TODAY);
    const cases = [
      [{ state: 'ready', canWrite: true }, view],
      [{ state: 'ready', canWrite: false }, view],
      [{ state: 'ready', canWrite: true }, buildMealsView({ ...real(), categories: real().categories.filter((c) => c.systemRole !== 'meals') }, TODAY)],
    ];
    for (const [gate, v] of cases) {
      const r = await render(React.createElement(MealsBody, { gate, view: v, flash: null, ...handlers }));
      const texts = collect(r);
      for (const p of r.root.findAllByType('Pressable')) {
        if (p.props.disabled) {
          assert.ok(texts.includes(MEAL_COPY.readOnlyNotice) || texts.includes(MEAL_COPY.unavailableTitle), `a disabled control (${p.props.accessibilityLabel}) is not explained`);
        } else {
          assert.equal(typeof p.props.onPress, 'function', `${p.props.accessibilityLabel} does nothing`);
        }
      }
    }
  });
});
