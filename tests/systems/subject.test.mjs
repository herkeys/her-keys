/**
 * HK-INTEGRATION-READINESS-01 / HA-011 on Feature 04 — a System names the child it is about.
 *
 * The audit found a System could not name a child (F04's own MP-02): the editor never emitted child scope, and its tests pinned that
 * limitation. The repaired foundation stores `HouseholdSystem.subjectMemberId` (an existing child id, or null), so Feature 04 now
 * authors, preserves, shows and refuses it truthfully. Nothing here guesses a child, matches a name, or invents a person.
 *
 * Pure transitions and a real store over in-memory storage, exactly like the rest of tests/systems. The screens are in ui.subject.test.mjs;
 * the cloud round trip to a second device is in tests/hk-ir01/f04SystemsSync.test.mjs.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addPerson } from '../../src/domain/responsibility.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { stepsInOrder } from '../../src/domain/structure.ts';
import * as responsibilityCommands from '../../src/features/systems/commands/responsibility.ts';
import { draftFromState, newDraft, requestedSubject, validateDraft } from '../../src/features/systems/commands/draft.ts';
import { applySystemDraft } from '../../src/features/systems/commands/saveDraft.ts';
import { issueMessage } from '../../src/features/systems/copy.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { evidenceOfDetail } from '../../src/features/systems/model/evidence.ts';
import { systemFingerprint } from '../../src/features/systems/model/fingerprint.ts';
import { scopeForSubject, subjectChoicesFor, subjectViewFor } from '../../src/features/systems/model/subject.ts';
import { saveSystemDraft } from '../../src/features/systems/useCases/commit.ts';
import { CHILDREN, DAY, MORNING, childSystemRow, ctxAt, realHousehold, stepRow, systemRow, withRows } from './support/canon.mjs';
import { homeCategoryId, keyFor, stateOf, systemsHarness } from './support/store.mjs';

const CLOCK = { nowMs: MORNING, today: DAY };
const detail = (state, id) => projectSystemDetail(state, id, CLOCK);
const household = () => realHousehold({ children: CHILDREN });
const homeOf = (state) => state.categories.find((c) => c.systemRole === 'home').id;
const kidsOf = (state) => state.categories.find((c) => c.systemRole === 'kids').id;
const step = (key, title) => ({ key, id: null, title, effortMinutes: null });
const draftFor = (state, over = {}) => ({ ...newDraft(state, 'sys-s', homeOf(state)).draft, name: 'Bedtime', ...over });
const create = (state, over = {}) => applySystemDraft(state, ctxAt(), draftFor(state, over), { fingerprint: null });
const edit = (state, id, change) => {
  const { draft, base } = draftFromState(state, id, keyFor);
  change(draft);
  return applySystemDraft(state, ctxAt(), draft, base);
};
const twoSteps = () => [stepRow({ id: 'st-1', systemId: 'sys-1', position: 0, title: 'Pyjamas' }), stepRow({ id: 'st-2', systemId: 'sys-1', position: 10, title: 'Teeth' })];

describe('HA-011 / F04 — a child System round-trips through Feature 04’s own commands', () => {
  test('create → persist → restart: the System keeps its child, its scope and its steps in order, and validates', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    await store.commit((state) => ({ ...state, children: CHILDREN }));
    const { draft, base } = newDraft(stateOf(store), 'sys-kid', homeCategoryId(stateOf(store)));
    draft.name = 'Josie bedtime';
    draft.subjectMemberId = 'child-1';
    draft.steps = [step(keyFor(0), 'Pyjamas'), step(keyFor(1), 'Teeth'), step(keyFor(2), 'Story')];
    assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'saved', systemId: 'sys-kid' });
    await store.flush();

    const restarted = stateOf(await sh.open());
    const [system] = restarted.systems;
    assert.deepEqual([system.id, system.scope, system.subjectMemberId], ['sys-kid', 'child', 'child-1']);
    assert.deepEqual(stepsInOrder(restarted, 'sys-kid').map((s) => s.title), ['Pyjamas', 'Teeth', 'Story']);
    assert.equal(validateAppState(restarted).ok, true);
    assert.deepEqual(detail(restarted, 'sys-kid').subject, { kind: 'child', id: 'child-1', name: 'Josie' }, 'and the screen can say who it is for after a restart');
  });

  test('two children, two Systems: each keeps its own child, and neither is collapsed into the other', () => {
    let state = household();
    state = create(state, { systemId: 'sys-a', name: 'Josie bedtime', subjectMemberId: 'child-1' }).state;
    state = create(state, { systemId: 'sys-b', name: 'Theo bedtime', subjectMemberId: 'child-2' }).state;
    assert.deepEqual(state.systems.map((s) => [s.id, s.scope, s.subjectMemberId]), [['sys-a', 'child', 'child-1'], ['sys-b', 'child', 'child-2']]);
    assert.deepEqual([detail(state, 'sys-a').subject.name, detail(state, 'sys-b').subject.name], ['Josie', 'Theo']);
  });

  test('a household-level System is UNCHANGED: household scope, an explicit null subject, and a view that says nothing about a child', () => {
    const made = create(household(), { steps: [step('a', 'Wipe counters')] });
    assert.equal(made.outcome.kind, 'saved');
    const [system] = made.state.systems;
    assert.deepEqual([system.scope, system.subjectMemberId], ['household', null]);
    assert.deepEqual(detail(made.state, 'sys-s').subject, { kind: 'none' });
    assert.deepEqual(evidenceOfDetail(detail(made.state, 'sys-s')).system.subject, { kind: 'none' }, 'the committed evidence shape for a household System is exactly what it always was');
    assert.equal(detail(made.state, 'sys-s').unknownStates.some((u) => u.field === 'subject'), false, 'nothing is "unknown" about a household routine’s child');

    const renamed = edit(made.state, 'sys-s', (d) => (d.name = 'Renamed'));
    assert.deepEqual(renamed.state.systems[0], { ...system, name: 'Renamed' }, 'editing it changes only what was edited');
  });

  test('a draft from an older caller that never mentions a subject: a new System is household-level, and an existing one KEEPS its child', () => {
    const draft = draftFor(household());
    delete draft.subjectMemberId;
    const made = applySystemDraft(household(), ctxAt(), draft, { fingerprint: null });
    assert.deepEqual([made.state.systems[0].scope, made.state.systems[0].subjectMemberId], ['household', null]);

    const start = withRows(household(), { systems: [childSystemRow('child-2', { id: 'sys-1', name: 'Theo bedtime' })] });
    const renamed = edit(start, 'sys-1', (d) => {
      delete d.subjectMemberId;
      d.name = 'Theo wind-down';
    });
    assert.equal(renamed.outcome.kind, 'saved');
    assert.deepEqual([renamed.state.systems[0].scope, renamed.state.systems[0].subjectMemberId], ['child', 'child-2'], 'omission can never erase a child');
    assert.equal(requestedSubject({ subjectMemberId: undefined }, { subjectMemberId: 'child-2' }), 'child-2');
    assert.equal(requestedSubject({ subjectMemberId: null }, { subjectMemberId: 'child-2' }), null, 'but an explicit null is a decision, and is honoured');
  });
});

describe('HA-011 / F04 — the subject is preserved across edit and save', () => {
  test('rename, re-describe, re-area, add and reorder steps, and set a schedule: the child and the scope do not move', () => {
    const start = withRows(household(), { systems: [childSystemRow('child-2', { id: 'sys-1', name: 'Theo bedtime' })], systemSteps: twoSteps() });
    const kids = kidsOf(start);
    const result = edit(start, 'sys-1', (d) => {
      d.name = 'Theo wind-down';
      d.purpose = 'Screens off.';
      d.categoryId = kids;
      d.steps = [d.steps[1], d.steps[0], step('n1', 'Story')];
      d.scheduleMode = 'calendar';
      d.schedule = { frequency: 'daily', interval: 1, byWeekday: null, byMonthDay: null, timeOfDayMinutes: 1140 };
    });
    assert.equal(result.outcome.kind, 'saved');
    assert.deepEqual(result.state.systems[0], { ...start.systems[0], name: 'Theo wind-down', description: 'Screens off.', categoryId: kids }, 'only the edited fields moved; the subject and scope are the same row values');
    assert.equal(result.state.recurrences.length, 1);
    assert.equal(validateAppState(result.state).ok, true);
  });

  test('an edit that changes nothing writes nothing, subject included (same state object)', () => {
    const start = withRows(household(), { systems: [childSystemRow('child-1', { id: 'sys-1' })], systemSteps: twoSteps() });
    const untouched = edit(start, 'sys-1', () => {});
    assert.equal(untouched.outcome.kind, 'saved');
    assert.equal(untouched.state, start, 'no row was rewritten');
  });

  test('a household-scope routine that already names a child (the cloud allows it) is not silently re-scoped by an unrelated edit', () => {
    const start = withRows(household(), { systems: [systemRow({ id: 'sys-1', name: 'Family reading', scope: 'household', subjectMemberId: 'child-2' })] });
    const renamed = edit(start, 'sys-1', (d) => (d.name = 'Family reading time'));
    assert.deepEqual([renamed.state.systems[0].scope, renamed.state.systems[0].subjectMemberId], ['household', 'child-2']);
    assert.equal(renamed.state.systems[0].name, 'Family reading time');
  });

  test('the child can be corrected: to another child, to a child from none, and back to the household', () => {
    const start = withRows(household(), { systems: [childSystemRow('child-1', { id: 'sys-1' })] });
    const toTheo = edit(start, 'sys-1', (d) => (d.subjectMemberId = 'child-2'));
    assert.deepEqual([toTheo.state.systems[0].scope, toTheo.state.systems[0].subjectMemberId], ['child', 'child-2']);
    const cleared = edit(toTheo.state, 'sys-1', (d) => (d.subjectMemberId = null));
    assert.deepEqual([cleared.state.systems[0].scope, cleared.state.systems[0].subjectMemberId], ['household', null], 'child scope with no child is invalid, so clearing the child returns it to the household');
    const namedAgain = edit(cleared.state, 'sys-1', (d) => (d.subjectMemberId = 'child-1'));
    assert.deepEqual([namedAgain.state.systems[0].scope, namedAgain.state.systems[0].subjectMemberId], ['child', 'child-1']);
    for (const outcome of [toTheo, cleared, namedAgain]) assert.equal(validateAppState(outcome.state).ok, true);
  });

  test('scopeForSubject, exhaustively: scope follows the subject and moves only when the subject does', () => {
    const row = (scope, subjectMemberId) => ({ scope, subjectMemberId });
    assert.equal(scopeForSubject(null, null), 'household');
    assert.equal(scopeForSubject(null, 'child-1'), 'child');
    assert.equal(scopeForSubject(row('household', null), 'child-1'), 'child');
    assert.equal(scopeForSubject(row('child', 'child-1'), 'child-1'), 'child');
    assert.equal(scopeForSubject(row('child', 'child-1'), 'child-2'), 'child');
    assert.equal(scopeForSubject(row('child', 'child-1'), null), 'household');
    assert.equal(scopeForSubject(row('household', 'child-2'), 'child-2'), 'household', 'unchanged subject: scope preserved');
    assert.equal(scopeForSubject(row('household', 'child-2'), null), 'household');
    assert.equal(scopeForSubject(row('personal', null), null), 'personal', 'a scope this editor does not own is preserved while the subject is untouched');
    assert.equal(scopeForSubject(row('personal', null), 'child-1'), 'child');
    assert.equal(scopeForSubject({ scope: 'household' }, null), 'household', 'a row written before the field existed reads as household-level');
  });
});

describe('HA-011 / F04 — a subject that is not one of the household’s children is REFUSED, never dropped or guessed', () => {
  const withPerson = () => addPerson(household(), ctxAt(), { displayName: 'Grandma June', relationship: 'grandparent' });
  const bad = (state) => [
    ['an id no child has', 'child-nope'],
    ['the account user (an adult, not a child subject)', state.user.id],
    ['a delegate’s id (people are not members)', state.people[0].id],
    ['a display name', 'Josie'],
    ['a display name in another case', 'josie'],
    ['a real child id with a stray space', ' child-1'],
    ['an empty string', ''],
  ];

  test('creating: each is refused with subject_unavailable, and nothing is written (the very same state object comes back)', () => {
    const state = withPerson();
    for (const [label, subject] of bad(state)) {
      const result = create(state, { subjectMemberId: subject });
      assert.deepEqual(result.outcome, { kind: 'invalid', issues: [{ code: 'subject_unavailable', field: 'subject' }] }, label);
      assert.equal(result.state, state, `${label}: nothing written`);
    }
  });

  test('editing: an unknown subject is refused and the child the System already has is neither changed nor erased', () => {
    const start = withRows(withPerson(), { systems: [childSystemRow('child-1', { id: 'sys-1' })] });
    for (const [label, subject] of bad(start)) {
      const result = edit(start, 'sys-1', (d) => {
        d.name = 'Should not save';
        d.subjectMemberId = subject;
      });
      assert.deepEqual(result.outcome, { kind: 'invalid', issues: [{ code: 'subject_unavailable', field: 'subject' }] }, label);
      assert.equal(result.state, start, `${label}: the System still names child-1`);
    }
  });

  test('the store refuses it too: a refused save leaves the saved System and storage exactly as they were', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    await store.commit((state) => withRows({ ...state, children: CHILDREN }, { systems: [childSystemRow('child-1', { id: 'sys-1', name: 'Josie bedtime' })] }));
    await store.flush();
    const before = stateOf(store);
    const { draft, base } = draftFromState(before, 'sys-1', keyFor);
    draft.subjectMemberId = before.user.id;
    const result = await saveSystemDraft(store, draft, base);
    assert.equal(result.kind, 'invalid');
    assert.deepEqual(result.issues, [{ code: 'subject_unavailable', field: 'subject' }]);
    assert.equal(stateOf(store), before);
  });

  test('validateDraft names the field, and the words are calm, plain and do not echo the offending value', () => {
    const state = withPerson();
    for (const [, subject] of bad(state)) {
      const issues = validateDraft(state, draftFor(state, { subjectMemberId: subject }));
      assert.deepEqual(issues, [{ code: 'subject_unavailable', field: 'subject' }]);
    }
    const message = issueMessage({ code: 'subject_unavailable', field: 'subject' });
    assert.match(message, /isn’t in your household/);
    assert.match(message, /Choose one of your children, or leave it for the whole household/);
    assert.doesNotMatch(message, /error|invalid|failed|wrong|denied|not allowed|illegal/i, 'honest, not alarming');
    assert.equal(validateDraft(state, draftFor(state, { subjectMemberId: 'child-1' })).length, 0);
    assert.equal(validateDraft(state, draftFor(state, { subjectMemberId: null })).length, 0);
  });
});

describe('HA-011 / F04 — the model reads and offers only the household’s own children', () => {
  test('subjectViewFor: none for a household System, the child by id, and "not recorded" when a row claims a child it cannot name', () => {
    const state = household();
    assert.deepEqual(subjectViewFor(state, { scope: 'household', subjectMemberId: null }), { kind: 'none' });
    assert.deepEqual(subjectViewFor(state, { scope: 'child', subjectMemberId: 'child-2' }), { kind: 'child', id: 'child-2', name: 'Theo' });
    assert.deepEqual(subjectViewFor(state, { scope: 'household', subjectMemberId: 'child-1' }), { kind: 'child', id: 'child-1', name: 'Josie' }, 'a household-scope routine that names a child still says which');
    assert.deepEqual(subjectViewFor(state, { scope: 'child', subjectMemberId: null }), { kind: 'child_not_recorded' }, 'never turned into the first child');
    assert.deepEqual(subjectViewFor(state, { scope: 'child', subjectMemberId: 'child-gone' }), { kind: 'child_not_recorded' });
    assert.deepEqual(subjectViewFor(state, { scope: 'household', subjectMemberId: 'child-gone' }), { kind: 'child_not_recorded' });
    assert.deepEqual(subjectViewFor(state, { scope: 'household' }), { kind: 'none' }, 'a row saved before the field existed');
    assert.deepEqual(subjectViewFor({ children: [] }, { scope: 'child', subjectMemberId: 'child-1' }), { kind: 'child_not_recorded' });
  });

  test('subjectChoicesFor lists the children and nobody else, in a stable order; a household with no child has none to offer', () => {
    const state = addPerson(household(), ctxAt(), { displayName: 'Aunt Ada', relationship: 'friend' });
    assert.deepEqual(subjectChoicesFor(state), [{ id: 'child-1', name: 'Josie' }, { id: 'child-2', name: 'Theo' }]);
    assert.equal(subjectChoicesFor(state).some((c) => c.id === state.user.id || c.name === 'Aunt Ada'), false, 'no adult, no delegate');
    assert.deepEqual(subjectChoicesFor(realHousehold()), []);
    assert.deepEqual(subjectChoicesFor({ children: [{ id: 'b', displayName: 'Theo' }, { id: 'a', displayName: 'Josie' }, { id: 'c', displayName: 'Josie' }] }), [
      { id: 'a', name: 'Josie' },
      { id: 'c', name: 'Josie' },
      { id: 'b', name: 'Theo' },
    ]);
  });

  test('a fresh draft is a household routine (never defaulted to a child), and draftFromState carries the subject verbatim', () => {
    const state = household();
    assert.equal(newDraft(state, 'sys-n', homeOf(state)).draft.subjectMemberId, null);
    const start = withRows(state, { systems: [childSystemRow('child-2', { id: 'sys-1' }), systemRow({ id: 'sys-2' })] });
    assert.equal(draftFromState(start, 'sys-1', keyFor).draft.subjectMemberId, 'child-2');
    assert.equal(draftFromState(start, 'sys-2', keyFor).draft.subjectMemberId, null);
  });
});

describe('HA-011 / F04 — a stale editor cannot overwrite the subject (D)', () => {
  const opened = async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    await store.commit((state) => withRows({ ...state, children: CHILDREN }, { systems: [childSystemRow('child-1', { id: 'sys-y', name: 'Bedtime' })] }));
    return store;
  };

  test('an editor opened BEFORE the child was changed by another save is refused; the newer subject stands; a reload then saves on top of it', async () => {
    const store = await opened();
    const stale = draftFromState(stateOf(store), 'sys-y', keyFor); // this screen opens first
    const other = draftFromState(stateOf(store), 'sys-y', keyFor); // another screen changes who it is for
    other.draft.subjectMemberId = 'child-2';
    assert.equal((await saveSystemDraft(store, other.draft, other.base)).kind, 'saved');
    const after = stateOf(store);
    assert.deepEqual([after.systems[0].scope, after.systems[0].subjectMemberId], ['child', 'child-2']);

    stale.draft.name = 'Bedtime (edited on the old screen)';
    assert.deepEqual(await saveSystemDraft(store, stale.draft, stale.base), { kind: 'stale' });
    assert.equal(stateOf(store), after, 'nothing was written');
    assert.equal(stateOf(store).systems[0].subjectMemberId, 'child-2', 'the old screen did not put child-1 back');

    const reloaded = draftFromState(stateOf(store), 'sys-y', keyFor);
    assert.equal(reloaded.draft.subjectMemberId, 'child-2', 'a reloaded editor carries the newer subject');
    reloaded.draft.name = 'Bedtime (edited on the new screen)';
    assert.equal((await saveSystemDraft(store, reloaded.draft, reloaded.base)).kind, 'saved');
    assert.deepEqual([stateOf(store).systems[0].scope, stateOf(store).systems[0].subjectMemberId], ['child', 'child-2']);
  });

  test('a subject changed by a SYNC pull (a raw canonical mutation, not an editor) also makes the open editor stale, in both directions', async () => {
    for (const change of [
      { scope: 'child', subjectMemberId: 'child-2' },
      { scope: 'household', subjectMemberId: null },
    ]) {
      const store = await opened();
      const { draft, base } = draftFromState(stateOf(store), 'sys-y', keyFor);
      await store.commit((state) => ({ ...state, systems: state.systems.map((s) => (s.id === 'sys-y' ? { ...s, ...change } : s)) }));
      const after = stateOf(store);
      draft.name = 'Edited on a screen opened before the pull';
      assert.deepEqual(await saveSystemDraft(store, draft, base), { kind: 'stale' }, JSON.stringify(change));
      assert.equal(stateOf(store), after);
    }
  });

  test('a stale editor that itself SETS a subject cannot win over a different subject that landed first', async () => {
    const store = await opened();
    const stale = draftFromState(stateOf(store), 'sys-y', keyFor);
    await store.commit((state) => ({ ...state, systems: state.systems.map((s) => (s.id === 'sys-y' ? { ...s, subjectMemberId: 'child-2' } : s)) }));
    stale.draft.subjectMemberId = null;
    assert.deepEqual(await saveSystemDraft(store, stale.draft, stale.base), { kind: 'stale' });
    assert.equal(stateOf(store).systems[0].subjectMemberId, 'child-2');
  });

  test('the fingerprint reads the child and the scope, is unmoved by a rebuilt identical row, and reads a missing key as null', () => {
    const a = withRows(household(), { systems: [childSystemRow('child-1', { id: 'sys-1' })] });
    const otherChild = { ...a, systems: [{ ...a.systems[0], subjectMemberId: 'child-2' }] };
    const otherScope = { ...a, systems: [{ ...a.systems[0], scope: 'household' }] };
    assert.notEqual(systemFingerprint(a, 'sys-1'), systemFingerprint(otherChild, 'sys-1'), 'a different child is a different System');
    assert.notEqual(systemFingerprint(a, 'sys-1'), systemFingerprint(otherScope, 'sys-1'), 'and so is a different scope');
    assert.equal(systemFingerprint(a, 'sys-1'), systemFingerprint(JSON.parse(JSON.stringify(a)), 'sys-1'), 'a sync pull that rebuilds identical rows is not a conflict');

    const { subjectMemberId: _dropped, ...noKey } = systemRow({ id: 'sys-1' });
    const without = { ...a, systems: [noKey] };
    const withNull = { ...a, systems: [{ ...noKey, subjectMemberId: null }] };
    assert.equal(systemFingerprint(without, 'sys-1'), systemFingerprint(withNull, 'sys-1'), 'a row saved before the field existed is not "changed" by now saying null');
  });
});

describe('HA-011 / F04 — a subject is not a run, an owner or a completion (E)', () => {
  test('a child System still has NO run: unsupported, no progress, start/complete unavailable, and no responsibility invented for the child', () => {
    const state = withRows(household(), { systems: [childSystemRow('child-1', { id: 'sys-1' })], systemSteps: twoSteps() });
    const view = detail(state, 'sys-1');
    assert.deepEqual(view.run, { supported: false, currentRef: null, progress: null, reason: 'no_run_semantics' });
    for (const name of ['start_run', 'complete_step']) {
      const action = view.actions.find((a) => a.action === name);
      assert.equal(action.available, false, name);
    }
    assert.equal(view.responsibility, null, 'being ABOUT Josie is not being handed to Josie');
    assert.equal(state.responsibilities.length, 0);
    assert.deepEqual(evidenceOfDetail(view).run, { supported: false, currentRef: null, progress: null });
  });

  test('saving a child System writes ONLY systems, steps and recurrences: no observation, task, event, One Move, intent, execution or outcome', () => {
    const state = household();
    const made = create(state, {
      subjectMemberId: 'child-1',
      steps: [step('a', 'Pyjamas')],
      scheduleMode: 'calendar',
      schedule: { frequency: 'weekly', interval: 1, byWeekday: [1, 3], byMonthDay: null, timeOfDayMinutes: 1140 },
    });
    assert.equal(made.outcome.kind, 'saved');
    const touched = ['systems', 'systemSteps', 'recurrences'];
    for (const key of Object.keys(state)) if (!touched.includes(key)) assert.equal(made.state[key], state[key], `${key} was not touched`);
    assert.equal(made.state.systems.length + made.state.systemSteps.length + made.state.recurrences.length, 3);
  });

  test('who a System is ABOUT and who is RESPONSIBLE for it are independent: handing it to Theo does not change whom it is about', () => {
    const start = withRows(household(), { systems: [childSystemRow('child-1', { id: 'sys-1', name: 'Josie bedtime' })] });
    const handed = responsibilityCommands.assignResponsibility(start, ctxAt(), 'sys-1', { kind: 'child', id: 'child-2' });
    const view = detail(handed, 'sys-1');
    assert.deepEqual([view.subject.name, view.responsibility.holder.name], ['Josie', 'Theo']);
    assert.equal(handed.systems[0].subjectMemberId, 'child-1');
    assert.equal(view.responsibility.stillNeedsMe, true, 'and a request still needs her (HA-008 is untouched)');

    const renamed = edit(handed, 'sys-1', (d) => (d.name = 'Josie’s bedtime'));
    assert.equal(renamed.state.responsibilities, handed.responsibilities, 'an edit does not touch the handoff');
    assert.equal(renamed.state.systems[0].subjectMemberId, 'child-1');
  });
});
