/**
 * HK-FEATURE-05 — STRUCTURAL SCENARIO EVIDENCE. Each core scenario is built through the real transitions and reduced to the SEMANTIC
 * output the plan names (childId, nextItem, needsAttentionReasons, responsibilityState, coverageState, dependencyStanding,
 * durationSource, fallbackPlanState, unknownFacts, availableActions). The digest is compared with a committed fixture under
 * tests/fixtures/kids/scenarios/. No JSX snapshot is involved.
 *
 * Regenerate deliberately, and review the diff:   KIDS_REGENERATE=1 node --import ./tests/support/register-ts.mjs --test tests/kids/scenarios.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { removeEvent } from '../../src/domain/events.ts';
import { addDependency } from '../../src/domain/structure.ts';
import { archiveTask, completeTask } from '../../src/domain/tasks.ts';
import { recordAccepted, recordAcknowledged, recordDeclined, requestHandoff } from '../../src/features/kids/mutations.ts';
import { buildChildDetail } from '../../src/features/kids/projection.ts';
import { NOW, addEventFor, addTaskFor, archive, askNewPerson, emptyHousehold, idOf, makeCtx, responsibilityOf, withChildren } from './support.mjs';

const DIR = join(import.meta.dirname, '..', 'fixtures', 'kids', 'scenarios');
const REGENERATE = process.env.KIDS_REGENERATE === '1';

function evidence(s, childId, focusTitle) {
  const d = buildChildDetail(s, s.household.id, childId, { nowMs: NOW });
  const items = [...d.upcoming, ...Object.values(d.openWork).flat(), ...d.plans.map((p) => p.item)];
  const focus = focusTitle ? items.find((i) => i.title === focusTitle) : null;
  const scheduled = d.upcoming[0] ?? null;
  return {
    childId,
    childLabel: d.label.full,
    nextItem: scheduled ? { title: scheduled.title, kind: scheduled.ref.kind, localDate: scheduled.schedule.localDate, startMinutes: scheduled.schedule.startMinutes } : null,
    needsAttentionReasons: d.needsAttention.map((e) => `${e.source}:${e.code}:${e.urgency ?? 'none'}`),
    openWork: Object.fromEntries(Object.entries(d.openWork).map(([bucket, list]) => [bucket, list.map((i) => i.title)])),
    focus: focus
      ? {
          title: focus.title,
          responsibilityState: focus.responsibility.lifecycle,
          coverageState: focus.responsibility.coverage,
          requiresYou: focus.responsibility.requiresYou,
          dependencyStanding: focus.dependency ? { readiness: focus.dependency.readiness, waitingOn: focus.dependency.waitingOn.map((p) => p.title), unavailable: focus.dependency.unavailable.map((p) => `${p.title}:${p.cause}`) } : null,
          durationSource: focus.duration ? focus.duration.knowledge : null,
          fallbackPlanState: focus.plan ? `${focus.plan.label}:${focus.plan.reason}` : null,
          openSteps: focus.plan ? focus.plan.openSteps.map((x) => x.title) : [],
          unknownFacts: focus.unknownFacts,
          availableActions: focus.actions,
        }
      : null,
  };
}

const world = (names = [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]) => {
  const c = makeCtx();
  const s = withChildren(emptyHousehold(), c, names);
  return { s, c, sam: s.children[0].id, ivy: s.children[1]?.id };
};
const asked = (w, ref, name = 'Alex') => askNewPerson(w.s, w.c, ref, name);

const SCENARIOS = {
  A: ['one child, no operational records', () => { const { s } = world([['Sam', '2018-03-03']]); return [s, s.children[0].id, null]; }],
  B: ['several children; items belong to their own child', () => { const w = world(); const s = addTaskFor(addEventFor(w.s, w.c, w.sam, 'Soccer').state, w.c, w.ivy, 'Field-trip form').state; return [s, w.ivy, 'Field-trip form']; }],
  C: ['two children with the same first name', () => { const w = world([['Sam', '2018-03-03'], ['Sam', '2020-07-07']]); const s = addEventFor(w.s, w.c, w.ivy, 'Swim').state; return [s, w.ivy, 'Swim']; }],
  D: ['one upcoming commitment', () => { const w = world(); const s = addEventFor(w.s, w.c, w.sam, 'Soccer practice', { location: 'Riverside' }).state; return [s, w.sam, 'Soccer practice']; }],
  E: ['several upcoming commitments, soonest first', () => { const w = world(); let s = addEventFor(w.s, w.c, w.sam, 'Later', { date: '2026-09-24' }).state; s = addEventFor(s, w.c, w.sam, 'Sooner', { date: '2026-09-22', startText: '8:00 AM', endText: '9:00 AM' }).state; return [s, w.sam, 'Sooner']; }],
  F: ['a child-linked unresolved task', () => { const w = world(); const s = addTaskFor(w.s, w.c, w.sam, 'Permission slip', { dueDate: '2026-09-23' }).state; return [s, w.sam, 'Permission slip']; }],
  G: ['unknown duration provenance (a legacy row)', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Old row'); const s = { ...t.state, tasks: t.state.tasks.map((x) => ({ ...x, durationSource: null })) }; return [s, w.sam, 'Old row']; }],
  H: ['default duration', () => { const w = world(); const s = addTaskFor(w.s, w.c, w.sam, 'Default length').state; return [s, w.sam, 'Default length']; }],
  I: ['explicit user duration (a stated 15)', () => { const w = world(); const s = addTaskFor(w.s, w.c, w.sam, 'Stated length', { durationText: '15', durationTouched: true }).state; return [s, w.sam, 'Stated length']; }],
  O: ['assigned but unaccepted', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Costume'); const a = asked({ ...w, s: t.state }, { kind: 'task', id: t.id }); return [a.state, w.sam, 'Costume']; }],
  'O2': ['acknowledged (seen) but not accepted', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Costume'); const ref = { kind: 'task', id: t.id }; const a = asked({ ...w, s: t.state }, ref); const s = recordAcknowledged(a.state, w.c, responsibilityOf(a.state, ref).id).state; return [s, w.sam, 'Costume']; }],
  P: ['accepted but still needs her: NOT covered', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Costume'); const ref = { kind: 'task', id: t.id }; const a = asked({ ...w, s: t.state }, ref); const s = recordAccepted(a.state, w.c, responsibilityOf(a.state, ref).id, true).state; return [s, w.sam, 'Costume']; }],
  Q: ['accepted and off her list: covered', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Costume'); const ref = { kind: 'task', id: t.id }; const a = asked({ ...w, s: t.state }, ref); const s = recordAccepted(a.state, w.c, responsibilityOf(a.state, ref).id, false).state; return [s, w.sam, 'Costume']; }],
  R: ['requires her: the handoff was declined', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Costume'); const ref = { kind: 'task', id: t.id }; const a = asked({ ...w, s: t.state }, ref); const s = recordDeclined(a.state, w.c, responsibilityOf(a.state, ref).id).state; return [s, w.sam, 'Costume']; }],
  S: ['assigned to someone else, still unresolved and still hers', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Sign the form', { dueDate: '2026-09-21' }); const a = asked({ ...w, s: t.state }, { kind: 'task', id: t.id }); return [a.state, w.sam, 'Sign the form']; }],
  T: ['a completed prerequisite is satisfied', () => { const w = world(); const pre = addTaskFor(w.s, w.c, w.sam, 'Get the form'); const t = addTaskFor(pre.state, w.c, w.sam, 'Hand in the form'); let s = addDependency(t.state, w.c, { relation: 'requires', from: { kind: 'task', id: t.id }, to: { kind: 'task', id: pre.id } }).state; s = completeTask(s, w.c, pre.id); return [s, w.sam, 'Hand in the form']; }],
  U: ['a REMOVED prerequisite is unavailable, not completed', () => { const w = world(); const pre = addTaskFor(w.s, w.c, w.sam, 'Get the form'); const t = addTaskFor(pre.state, w.c, w.sam, 'Hand in the form'); let s = addDependency(t.state, w.c, { relation: 'requires', from: { kind: 'task', id: t.id }, to: { kind: 'task', id: pre.id } }).state; s = archiveTask(s, w.c, pre.id); return [s, w.sam, 'Hand in the form']; }],
  'U2': ['a removed EVENT prerequisite is unavailable too', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'School meeting'); const t = addTaskFor(ev.state, w.c, w.sam, 'Prepare questions'); let s = addDependency(t.state, w.c, { relation: 'requires', from: { kind: 'task', id: t.id }, to: { kind: 'event', id: ev.id } }).state; s = removeEvent(s, w.c, ev.id); return [s, w.sam, 'Prepare questions']; }],
  V: ['a missing prerequisite is not satisfied', () => { const w = world(); const pre = addTaskFor(w.s, w.c, w.sam, 'Get the form'); const t = addTaskFor(pre.state, w.c, w.sam, 'Hand in the form'); const s0 = addDependency(t.state, w.c, { relation: 'requires', from: { kind: 'task', id: t.id }, to: { kind: 'task', id: pre.id } }).state; const s = { ...s0, tasks: s0.tasks.filter((x) => x.id !== pre.id) }; return [s, w.sam, 'Hand in the form']; }],
  W: ['a fallback plan genuinely supported by evidence', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); const ref = { kind: 'event', id: ev.id }; const a = asked({ ...w, s: ev.state }, ref); const s = recordAccepted(a.state, w.c, responsibilityOf(a.state, ref).id, false).state; return [s, w.sam, 'Tuesday pickup']; }],
  X: ['a fallback gap: NEEDS A PLAN', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); const ref = { kind: 'event', id: ev.id }; const a = asked({ ...w, s: ev.state }, ref); const s = recordDeclined(a.state, w.c, responsibilityOf(a.state, ref).id).state; return [s, w.sam, 'Tuesday pickup']; }],
  Y: ['insufficient evidence: NOT ENOUGH KNOWN', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); return [ev.state, w.sam, 'Tuesday pickup']; }],
  Z: ['the person relied on is later archived', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); const ref = { kind: 'event', id: ev.id }; const a = asked({ ...w, s: ev.state }, ref); let s = recordAccepted(a.state, w.c, responsibilityOf(a.state, ref).id, false).state; s = archive(s, w.c, a.personId); return [s, w.sam, 'Tuesday pickup']; }],
  AA: ['a person who is not in this household cannot hold it', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); const out = requestHandoff(ev.state, w.c, { ref: { kind: 'event', id: ev.id }, personId: 'person-elsewhere' }); assert.equal(out.outcome, 'unknown_person'); return [out.state, w.sam, 'Tuesday pickup']; }],
  AB: ['a household-level task never becomes a child\'s', () => { const w = world(); const t = addTaskFor(w.s, w.c, w.sam, 'Sam only'); const s = { ...t.state, tasks: [...t.state.tasks, { ...t.state.tasks[0], id: 'task-house', title: 'Household chore', subjectMemberId: null, scope: 'household' }] }; return [s, w.sam, 'Sam only']; }],
  AC: ['creating a task to sort a gap out does NOT make the plan green', () => { const w = world(); const ev = addEventFor(w.s, w.c, w.sam, 'Tuesday pickup'); const step = addTaskFor(ev.state, w.c, w.sam, 'Arrange backup pickup', { partOf: { kind: 'event', id: ev.id } }); return [step.state, w.sam, 'Tuesday pickup']; }],
};

describe('structural scenario evidence (compare or regenerate)', () => {
  if (REGENERATE) mkdirSync(DIR, { recursive: true });
  for (const [id, [description, build]] of Object.entries(SCENARIOS)) {
    test(`${id}. ${description}`, () => {
      const [state, childId, focusTitle] = build();
      const actual = { scenario: id, description, ...evidence(state, childId, focusTitle) };
      const file = join(DIR, `${id}.json`);
      if (REGENERATE) writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
      assert.ok(existsSync(file), `missing fixture ${file}: regenerate deliberately with KIDS_REGENERATE=1`);
      assert.deepEqual(actual, JSON.parse(readFileSync(file, 'utf8')));
    });
  }

  test('the plan\'s named semantic fields are all present in the evidence', () => {
    const [state, childId, focus] = SCENARIOS.W[1]();
    const e = evidence(state, childId, focus);
    for (const key of ['childId', 'nextItem', 'needsAttentionReasons']) assert.ok(key in e, key);
    for (const key of ['responsibilityState', 'coverageState', 'dependencyStanding', 'durationSource', 'fallbackPlanState', 'unknownFacts', 'availableActions']) assert.ok(key in e.focus, key);
  });

  test('a regenerated fixture set changes nothing (the evidence is deterministic)', () => {
    for (const [, [, build]] of Object.entries(SCENARIOS)) {
      const [s1, c1, f1] = build();
      const [s2, c2, f2] = build();
      assert.deepEqual(evidence(s1, c1, f1), evidence(s2, c2, f2));
    }
  });
});
