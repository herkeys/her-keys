/**
 * Feature 04 scenarios about lifecycle and responsibility: H · I · J · K · M · V (AG) · AJ.
 * Pure transitions over deterministic fixtures — the same functions the store commits.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addPerson } from '../../src/domain/responsibility.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { toCloudRow } from '../../src/domain/sync/projection.ts';
import { emptyNamespace } from '../../src/domain/sync/syncTypes.ts';
import * as responsibilityCommands from '../../src/features/systems/commands/responsibility.ts';
import * as scheduleCommands from '../../src/features/systems/commands/schedule.ts';
import * as saveDraftModule from '../../src/features/systems/commands/saveDraft.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { evidenceOfDetail } from '../../src/features/systems/model/evidence.ts';
import { systemFingerprint } from '../../src/features/systems/model/fingerprint.ts';
import { projectSystemsHub } from '../../src/features/systems/model/hub.ts';
import { scheduleViewFor } from '../../src/features/systems/model/schedule.ts';
import { CHILDREN, DAY, MORNING, assertEvidence, assertValid, childSystemRow, ctxAt, realHousehold, ruleRow, snapshot, stepRow, systemRow, withRows } from './support/canon.mjs';

const CLOCK = { nowMs: MORNING, today: DAY };
const canonicalOf = (state, id) => JSON.parse(systemFingerprint(state, id));
const detail = (state, id) => projectSystemDetail(state, id, CLOCK);
const base = () => withRows(realHousehold({ children: CHILDREN }), { systems: [systemRow({ id: 'sys-1', name: 'Backpack landing zone' }), systemRow({ id: 'sys-2', name: 'Bill envelope' })] });
const action = (view, name) => view.actions.find((a) => a.action === name);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A fresh, deterministic id counter for every test: ids in the evidence never depend on test order.
let ctx;
beforeEach(() => {
  ctx = ctxAt();
});

// DELIBERATELY REWRITTEN (HK-INTEGRATION-READINESS-01 / HA-011). This scenario used to pin the fork's LIMITATION: "HouseholdSystem
// has no subjectMemberId, so a child-scoped System is SAFE-UNAVAILABLE and the draft has no way to name a child". The repaired
// foundation stores the subject, so the same scenario now pins the opposite, and its evidence file is renamed
// (H-child-unavailable -> H-child-subject) so no stale "unavailable" claim survives.
describe('SCENARIO H — a System names its child: the cloud requires it, the model stores it, and the editor authors it truthfully', () => {
  test('the cloud REQUIRES a subject for a child-scoped System, and the client now stores and sends one', () => {
    const migration = readFileSync(join(REPO, 'supabase', 'migrations', '20260919231500_build4_cloud_schema.sql'), 'utf8');
    assert.match(migration, /household_systems_child_scope_subject_check[\s\S]{0,120}scope <> 'child'::text OR subject_member_id IS NOT NULL/, 'a child-scoped System without a subject is refused by the database');

    const state = withRows(base(), { systems: [childSystemRow('child-1', { id: 'sys-kid', name: 'Josie bedtime' })] });
    const namespace = {
      ...emptyNamespace({ accountId: 'acct', householdId: 'hh', deviceId: 'dev' }),
      mappings: {
        'category:cat-home': { kind: 'category', localId: 'cat-home', cloudId: 'cloud-cat-home', revision: 1 },
        'member:child-1': { kind: 'member', localId: 'child-1', cloudId: 'cloud-child-1', revision: 1 },
      },
    };
    const context = { householdId: 'hh', profileId: 'p', namespace };
    const childRow = toCloudRow(state, context, 'system', 'sys-kid');
    assert.deepEqual([childRow.scope, childRow.subject_member_id], ['child', 'cloud-child-1'], 'the projection sends the child the System names');
    const householdRow = toCloudRow(state, context, 'system', 'sys-1');
    assert.deepEqual([householdRow.scope, householdRow.subject_member_id], ['household', null], 'and a household System sends no subject');
    const unmapped = { ...namespace, mappings: { 'category:cat-home': namespace.mappings['category:cat-home'] } };
    assert.throws(() => toCloudRow(state, { householdId: 'hh', profileId: 'p', namespace: unmapped }, 'system', 'sys-kid'), /needs child member child-1/, 'a child with no mapping refuses to leave the device: it is never sent as a household routine');
  });

  test('a System Feature 04 authors for a child is child-scoped WITH that child; a household draft keeps a null subject', () => {
    const start = realHousehold({ children: CHILDREN });
    const draftFor = (over) => ({ systemId: 'sys-h', isNew: true, name: 'Bedtime', purpose: '', categoryId: 'cat-kids', subjectMemberId: null, steps: [], scheduleMode: 'none', schedule: null, ...over });
    assert.deepEqual(Object.keys(draftFor()).sort(), ['categoryId', 'isNew', 'name', 'purpose', 'schedule', 'scheduleMode', 'steps', 'subjectMemberId', 'systemId'], 'a draft names a child by id and has NO scope field: scope can only follow the subject');

    const forChild = saveDraftModule.applySystemDraft(start, ctx, draftFor({ systemId: 'sys-h1', name: 'Josie bedtime', subjectMemberId: 'child-1' }), { fingerprint: null });
    const forHousehold = saveDraftModule.applySystemDraft(start, ctx, draftFor({ systemId: 'sys-h2', name: 'Sunday reset' }), { fingerprint: null });
    assert.equal(forChild.outcome.kind, 'saved');
    assert.equal(forHousehold.outcome.kind, 'saved');
    const [child] = forChild.state.systems;
    const [household] = forHousehold.state.systems;
    assert.deepEqual([child.scope, child.subjectMemberId], ['child', 'child-1']);
    assert.deepEqual([household.scope, household.subjectMemberId], ['household', null]);
    assertValid(forChild.state);
    assertValid(forHousehold.state);
    assertEvidence('H-child-subject', {
      scenario: 'H',
      status: 'AVAILABLE',
      evidence: [
        'HouseholdSystem carries subjectMemberId (HA-011), an existing child id or null',
        "cloud household_systems_child_scope_subject_check requires a subject when scope = 'child'",
        'toCloudRow(system) emits subject_member_id; a child with no mapping refuses to leave the device',
        'a draft that names a child writes child scope and that child id; an unknown, adult or delegate id is refused',
      ],
      child: { scope: child.scope, subjectMemberId: child.subjectMemberId },
      household: { scope: household.scope, subjectMemberId: household.subjectMemberId },
    });
  });
});

describe('SCENARIO I — two children are never collapsed (holder distinctness; the subject is a separate fact)', () => {
  test('System A held by Josie and System B held by Theo stay distinct, and each view names only its own', () => {
    let state = base();
    state = responsibilityCommands.assignResponsibility(state, ctx, 'sys-1', { kind: 'child', id: 'child-1' });
    state = responsibilityCommands.assignResponsibility(state, ctx, 'sys-2', { kind: 'child', id: 'child-2' });
    assertValid(state);
    const a = detail(state, 'sys-1').responsibility;
    const b = detail(state, 'sys-2').responsibility;
    assert.deepEqual([a.holder.name, b.holder.name], ['Josie', 'Theo']);
    assert.notEqual(a.id, b.id);
    assert.equal(state.responsibilities.filter((r) => r.about.id === 'sys-1').length, 1, 'assigning B did not touch A');
    assertEvidence('I-two-children', { scenario: 'I', a: evidenceOfDetail(detail(state, 'sys-1')).system.responsibility, b: evidenceOfDetail(detail(state, 'sys-2')).system.responsibility });
  });
});

describe('SCENARIO J — responsibility keeps assigned, acknowledged and accepted apart', () => {
  test('assigning creates a REQUEST to an existing child: no account, no acknowledgement, no acceptance, no invented deadline', () => {
    const state = responsibilityCommands.assignResponsibility(base(), ctx, 'sys-1', { kind: 'child', id: 'child-1' });
    const [row] = state.responsibilities;
    assert.deepEqual([row.about, row.responsibleKind, row.responsibleChildId, row.responsiblePersonId], [{ kind: 'system', id: 'sys-1' }, 'child', 'child-1', null]);
    assert.equal(row.state, 'requested');
    assert.equal(row.acknowledgedAt, null);
    assert.equal(row.respondedAt, null);
    assert.equal(row.ackDueAt, null, 'no deadline she did not give');
    assert.equal(row.stillNeedsMe, true, 'until they accept, it still needs her');
    assert.equal(state.children.every((c) => !('accountId' in c)), true, 'a child holding a routine is not an account');
    const view = detail(state, 'sys-1').responsibility;
    assert.deepEqual([view.state, view.live, view.unanswered], ['requested', true, false]);
  });

  test('each answer is its own recorded fact, in order; declining or taking it back returns it to her', () => {
    let state = responsibilityCommands.assignResponsibility(base(), ctx, 'sys-1', { kind: 'child', id: 'child-1' });
    const states = [];
    const step = (fn) => {
      state = assertValid(fn(state));
      states.push(detail(state, 'sys-1').responsibility?.state);
    };
    step((s) => responsibilityCommands.recordAnswer(s, ctx, 'sys-1', 'acknowledged'));
    step((s) => responsibilityCommands.recordAnswer(s, ctx, 'sys-1', 'accepted'));
    assert.deepEqual(states, ['acknowledged', 'accepted'], 'seen, then yes — two separate facts');
    assert.equal(detail(state, 'sys-1').responsibility.stillNeedsMe, true, 'yes is not proof the load left her');
    assert.equal(state.observations.filter((o) => o.about.kind === 'responsibility').map((o) => o.outcome).join(), 'delegated,acknowledged,accepted');

    const declined = responsibilityCommands.recordAnswer(responsibilityCommands.assignResponsibility(base(), ctx, 'sys-1', { kind: 'child', id: 'child-1' }), ctx, 'sys-1', 'declined');
    const dv = detail(declined, 'sys-1').responsibility;
    assert.deepEqual([dv.state, dv.live, dv.stillNeedsMe], ['declined', false, true], 'a "no" is remembered as history and it needs her again');

    const back = responsibilityCommands.takeBackResponsibility(responsibilityCommands.assignResponsibility(base(), ctx, 'sys-1', { kind: 'child', id: 'child-1' }), ctx, 'sys-1');
    assert.equal(detail(back, 'sys-1').responsibility.state, 'returned');
    const again = responsibilityCommands.assignResponsibility(back, ctx, 'sys-1', { kind: 'child', id: 'child-2' });
    assert.equal(detail(again, 'sys-1').responsibility.holder.name, 'Theo');
    assertEvidence('J-responsibility', { scenario: 'J', afterAccepted: evidenceOfDetail(detail(state, 'sys-1')).system.responsibility, afterDeclined: evidenceOfDetail(detail(declined, 'sys-1')).system.responsibility });
  });

  test('a second request for something already handed off changes nothing; reassign is the way', () => {
    const one = responsibilityCommands.assignResponsibility(base(), ctx, 'sys-1', { kind: 'child', id: 'child-1' });
    assert.equal(responsibilityCommands.assignResponsibility(one, ctx, 'sys-1', { kind: 'child', id: 'child-2' }), one);
    const moved = responsibilityCommands.reassignResponsibility(one, ctx, 'sys-1', { kind: 'child', id: 'child-2' });
    assertValid(moved);
    assert.equal(detail(moved, 'sys-1').responsibility.holder.name, 'Theo');
    assert.equal(moved.responsibilities.filter((r) => r.state !== 'returned').length, 1, 'never two owners');
  });
});

describe('SCENARIO K — a person who is not a record is never created to satisfy an assignment', () => {
  test('an unknown holder is refused and no person appears', () => {
    const state = base();
    const refused = responsibilityCommands.assignResponsibility(state, ctx, 'sys-1', { kind: 'person', id: 'grandma-june' });
    assert.equal(refused, state, 'nothing changed');
    assert.equal(refused.people.length, 0, 'no phantom person');
    assert.equal(refused.responsibilities.length, 0);
  });

  test('only people and children that exist can be chosen; with none, assignment is not offered at all', () => {
    const none = detail(withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })] }), 'sys-1');
    assert.deepEqual(none.holderChoices, []);
    assert.deepEqual(action(none, 'assign_responsibility'), { action: 'assign_responsibility', available: false, reason: 'no_holder_available' });

    const withPerson = addPerson(base(), ctx, { displayName: 'Grandma June', relationship: 'grandparent' });
    const view = detail(withPerson, 'sys-1');
    assert.deepEqual(view.holderChoices.map((c) => [c.kind, c.name]), [['person', 'Grandma June'], ['child', 'Josie'], ['child', 'Theo']]);
    assert.equal(action(view, 'assign_responsibility').available, true);
    const assigned = responsibilityCommands.assignResponsibility(withPerson, ctx, 'sys-1', { kind: 'person', id: withPerson.people[0].id });
    assert.equal(detail(assigned, 'sys-1').responsibility.holder.name, 'Grandma June');
    assertEvidence('K-unknown-person', { scenario: 'K', unknownHolder: 'refused; no person created', noHolders: none.actions.filter((a) => a.action === 'assign_responsibility'), choices: view.holderChoices });
  });
});

describe('SCENARIO M — pause and resume act on the SCHEDULE, not on the System; a skip is not a pause', () => {
  const scheduled = () => withRows(base(), { recurrences: [ruleRow({ byWeekday: [0], anchorDate: '2026-09-01' })] });

  test('pause suspends the schedule (no next date, and it says why); resume restores it; nothing is deleted', () => {
    const paused = scheduleCommands.pauseSchedule(scheduled(), ctx, 'sys-1');
    assertValid(paused);
    const pv = scheduleViewFor(paused, 'sys-1', DAY);
    assert.deepEqual([pv.state, pv.nextExpected, pv.noNextReason], ['paused', null, 'paused']);
    assert.equal(paused.recurrences.length, 1);
    assert.equal(paused.systems.length, 2, 'the System itself is untouched');
    const hub = projectSystemsHub(snapshot(paused));
    assert.equal(hub.items.find((i) => i.id === 'sys-1').schedule.state, 'paused', 'and it is not presented as actively recurring');

    const resumed = scheduleCommands.resumeSchedule(paused, ctx, 'sys-1');
    assert.equal(scheduleViewFor(resumed, 'sys-1', DAY).nextExpected, '2026-09-20');
    assertEvidence('M-pause-resume', { scenario: 'M', paused: evidenceOfDetail(detail(paused, 'sys-1')).system.recurrence, resumed: evidenceOfDetail(detail(resumed, 'sys-1')).system.recurrence });
  });

  test('pause/resume guard: only an active rule pauses, only a paused rule resumes, and a second live rule is impossible', () => {
    const s = scheduled();
    assert.equal(scheduleCommands.resumeSchedule(s, ctx, 'sys-1'), s, 'nothing to resume');
    const paused = scheduleCommands.pauseSchedule(s, ctx, 'sys-1');
    assert.equal(scheduleCommands.pauseSchedule(paused, ctx, 'sys-1'), paused, 'already paused');
    assert.equal(scheduleCommands.pauseSchedule(base(), ctx, 'sys-1').recurrences.length, 0, 'no schedule, nothing to pause');
    const withSecondActive = { ...paused, recurrences: [...paused.recurrences, ruleRow({ id: 'rule-2', about: { kind: 'system', id: 'sys-1' } })] };
    assert.equal(scheduleCommands.resumeSchedule(withSecondActive, ctx, 'sys-1'), withSecondActive, 'resuming would make two active rules');
  });

  test('stopping keeps the row as ended, and a new schedule can then be set', () => {
    const stopped = scheduleCommands.stopSchedule(scheduled(), ctx, 'sys-1');
    assert.equal(stopped.recurrences[0].status, 'ended');
    assert.equal(scheduleViewFor(stopped, 'sys-1', DAY).noNextReason, 'stopped');
    const again = scheduleCommands.setCalendarSchedule(stopped, ctx, 'sys-1', { frequency: 'daily', interval: 1, byWeekday: null, byMonthDay: null, timeOfDayMinutes: null });
    assertValid(again.state);
    assert.equal(again.state.recurrences.length, 2, 'the ended rule is history; a new live rule is added');
  });

  test('skipping the next occurrence is neutral history: the System stays active, and two taps skip only ONE', () => {
    const s = scheduled();
    const first = scheduleCommands.skipNextOccurrence(s, ctx, 'sys-1', '2026-09-20');
    assert.equal(first.outcome, 'skipped');
    const view = scheduleViewFor(first.state, 'sys-1', DAY);
    assert.deepEqual([view.state, view.nextExpected, view.skipped], ['active', '2026-09-27', ['2026-09-20']]);
    assert.equal(first.state.recurrences[0].status, 'active', 'SKIPPED OCCURRENCE ≠ DISABLED SYSTEM');
    const second = scheduleCommands.skipNextOccurrence(first.state, ctx, 'sys-1', '2026-09-20');
    assert.equal(second.outcome, 'changed', 'the date she saw is no longer next: nothing more is skipped');
    assert.equal(second.state, first.state);
    assert.equal(first.state.observations.filter((o) => o.outcome === 'skipped').length, 1);
    assert.equal(validateAppState(first.state).ok, true);
  });
});

describe('SCENARIO V (with AG · AJ) — archive, delete and duplicate are SAFE-UNAVAILABLE, and nothing fakes them', () => {
  test('every System reports them unavailable with the reason; no command exists that would perform them', () => {
    const state = withRows(base(), { systemSteps: [stepRow({ id: 'st-1', systemId: 'sys-1' })] });
    const view = detail(state, 'sys-1');
    assert.deepEqual(action(view, 'archive'), { action: 'archive', available: false, reason: 'no_status_semantics' });
    assert.deepEqual(action(view, 'delete'), { action: 'delete', available: false, reason: 'no_delete_semantics' });
    assert.deepEqual(action(view, 'duplicate'), { action: 'duplicate', available: false, reason: 'no_copy_semantics' });
    assert.deepEqual(action(view, 'remove_step'), { action: 'remove_step', available: false, reason: 'no_retire_semantics' });

    const exported = [saveDraftModule, scheduleCommands, responsibilityCommands].flatMap((m) => Object.keys(m));
    assert.deepEqual(exported.filter((name) => /delete|archive|duplicate|remove|clone|copy/i.test(name)), [], 'no lifecycle command exists to fake');
    assertEvidence('V-lifecycle-unavailable', {
      scenario: 'V / AG / AJ',
      status: 'SAFE-UNAVAILABLE',
      actions: view.actions.filter((a) => ['archive', 'delete', 'duplicate', 'remove_step'].includes(a.action)),
      why: {
        archive: 'HouseholdSystem has no status field',
        delete: 'sync ALLOWED_OPS for system/systemStep is create+update only; a local delete would dangle and resurrect',
        duplicate: 'no copy mutation exists; what resets versus carries (accepted responsibility, history) is undefined',
      },
    });
  });
});
