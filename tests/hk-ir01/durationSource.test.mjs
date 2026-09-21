/**
 * HK-INTEGRATION-READINESS-01 / HA-010 — an estimated duration cannot masquerade as something she said.
 *
 * DEFAULT != USER-PROVIDED. A 15 is a 15 whether she typed it or the default supplied it; the only thing that can tell
 * them apart is a recorded source, and a row with no recorded source is UNKNOWN, never promoted to hers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { addEvent } from '../../src/domain/events.ts';
import { DEFAULT_TASK_DURATION_MINUTES, durationKnowledgeOf, durationSourceForSave, isUserProvidedDuration } from '../../src/domain/foundation/duration.ts';
import { acceptInterpretation, proposeInterpretation, recordArtifact } from '../../src/domain/interpretations.ts';
import { toInstant, zonedTimeToEpochMs } from '../../src/domain/logicalDay.ts';
import { approveShortenTask } from '../../src/domain/recommendationActions.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { rowMatchesLocal } from '../../src/domain/sync/domainRules.ts';
import { toCloudRow } from '../../src/domain/sync/projection.ts';
import { UPDATABLE_COLUMNS, emptyNamespace, updatablePatch } from '../../src/domain/sync/syncTypes.ts';
import { decodeStoredState, encodeStoredState } from '../../src/persistence/envelope.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const DAY = '2026-09-21';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const ctx = () => {
  let n = 0;
  return { nowMs: NOW, today: DAY, createId: (p) => `${p}-${++n}` };
};
const at = (hour) => toInstant(zonedTimeToEpochMs(DAY, hour * 60, TZ));
const base = () => createEmptyState(TZ);
const cat = 'cat-home';
const sourceOf = (s, id = 'task-1') => s.tasks.find((t) => t.id === id).durationSource;

const encode = (state) => encodeStoredState(state, { appVersion: 'test', savedAt: '2026-09-21T15:00:00.000Z', writeSeq: 1 });

describe('HA-010 — creation records what the number is', () => {
  test('no duration supplied: the planning default applies and is recorded AS a default', () => {
    const s = addTask(base(), ctx(), { title: 'Return library books', categoryId: cat, scope: 'household' });
    assert.equal(s.tasks[0].durationMinutes, DEFAULT_TASK_DURATION_MINUTES);
    assert.equal(sourceOf(s), 'default');
    assert.equal(durationKnowledgeOf(s.tasks[0]), 'default-estimate');
    assert.equal(isUserProvidedDuration(s.tasks[0]), false);
  });

  test('explicit 15 and default 15 have the same number and different knowledge', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 'Defaulted', categoryId: cat, scope: 'household' });
    s = addTask(s, c, { title: 'Typed', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'user' });
    const [defaulted, typed] = s.tasks;
    assert.equal(defaulted.durationMinutes, typed.durationMinutes);
    assert.equal(isUserProvidedDuration(defaulted), false);
    assert.equal(isUserProvidedDuration(typed), true);
  });

  test('explicit 30 stays hers', () => {
    const s = addTask(base(), ctx(), { title: 'Thirty', categoryId: cat, scope: 'household', durationMinutes: 30, durationSource: 'user' });
    assert.deepEqual([s.tasks[0].durationMinutes, sourceOf(s)], [30, 'user']);
  });

  test('a bare number whose origin nobody stated is UNRECORDED, never assumed to be hers', () => {
    const s = addTask(base(), ctx(), { title: 'Unstated origin', categoryId: cat, scope: 'household', durationMinutes: 45 });
    assert.equal(sourceOf(s), null);
    assert.equal(durationKnowledgeOf(s.tasks[0]), 'unrecorded');
    assert.equal(isUserProvidedDuration(s.tasks[0]), false);
  });

  test('every state the creators produce is valid', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 'a', categoryId: cat, scope: 'household' });
    s = addTask(s, c, { title: 'b', categoryId: cat, scope: 'household', durationMinutes: 20, durationSource: 'user' });
    s = addTask(s, c, { title: 'c', categoryId: cat, scope: 'household', durationMinutes: 20 });
    assert.equal(validateAppState(s).ok, true);
  });
});

describe('HA-010 — a corrected number keeps only the knowledge it really has', () => {
  test('default 15 -> explicit 15 (she confirms it): the number is unchanged and the knowledge is now hers', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 't', categoryId: cat, scope: 'household' });
    assert.equal(sourceOf(s), 'default');
    s = updateTask(s, c, 'task-1', { durationMinutes: 15, durationSource: 'user' });
    assert.deepEqual([s.tasks[0].durationMinutes, sourceOf(s)], [15, 'user']);
  });

  test('an edit that does not touch the duration leaves its source alone', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 't', categoryId: cat, scope: 'household' });
    s = updateTask(s, c, 'task-1', { title: 'renamed', durationMinutes: 15 });
    assert.equal(sourceOf(s), 'default', 'the same number re-sent is not new information');
  });

  test('a changed number with no stated origin does NOT inherit the old number\'s source', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 't', categoryId: cat, scope: 'household', durationMinutes: 30, durationSource: 'user' });
    s = updateTask(s, c, 'task-1', { durationMinutes: 50 });
    assert.deepEqual([s.tasks[0].durationMinutes, sourceOf(s)], [50, null]);
  });

  test('an explicit source with the change is honoured', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 't', categoryId: cat, scope: 'household' });
    s = updateTask(s, c, 'task-1', { durationMinutes: 40, durationSource: 'user' });
    assert.deepEqual([s.tasks[0].durationMinutes, sourceOf(s)], [40, 'user']);
  });

  test('a stale edit of a task that is gone changes nothing', () => {
    const s = addTask(base(), ctx(), { title: 't', categoryId: cat, scope: 'household' });
    assert.equal(updateTask(s, ctx(), 'task-404', { durationMinutes: 99, durationSource: 'user' }), s);
  });

  test('accepting a reading: her words as Her Keys read them are INFERRED, not stated; no duration read means the default', () => {
    const c = ctx();
    let s = base();
    const r = recordArtifact(s, c, { kind: 'utterance', origin: 'user-submitted', contentDigest: 'd'.repeat(64) });
    s = proposeInterpretation(r.state, c, { artifactId: r.artifact.id, proposedKind: 'task', title: 'Call the dentist', durationMinutes: 20 });
    s = proposeInterpretation(s, c, { artifactId: r.artifact.id, proposedKind: 'task', title: 'Water the plants', durationMinutes: null });
    const [withMinutes, without] = s.interpretations;
    s = acceptInterpretation(s, c, withMinutes.id, { categoryId: cat });
    s = acceptInterpretation(s, c, without.id, { categoryId: cat });
    const [a, b] = s.tasks;
    assert.deepEqual([a.durationMinutes, a.durationSource], [20, 'inferred']);
    assert.deepEqual([b.durationMinutes, b.durationSource], [DEFAULT_TASK_DURATION_MINUTES, 'default']);
  });

  test('shortening a task by an approved recommendation makes the new length a derived estimate, not hers', () => {
    const c = ctx();
    let s = addEvent(base(), c, { title: 'Long work block', categoryId: 'cat-work', startsAt: at(6), endsAt: at(19), commitment: 'fixed', scope: 'professional' });
    s = addTask(s, c, { title: 'Return library books', categoryId: cat, durationMinutes: 200, durationSource: 'user', plan: { kind: 'day', date: DAY }, scope: 'household' });
    const id = s.tasks[0].id;
    assert.equal(sourceOf(s, id), 'user');
    const shortened = approveShortenTask(s, ctx(), id);
    assert.notEqual(shortened, s, 'the scenario must actually shorten');
    assert.ok(shortened.tasks[0].durationMinutes < 200);
    assert.equal(sourceOf(shortened, id), 'inferred');
  });
});

describe('HA-010 — the task form records what she was SHOWN, not what she said (IR-D6)', () => {
  const FORM = readFileSync(new URL('../../src/features/tasks/TaskForm.tsx', import.meta.url), 'utf8');

  test('untouched on a NEW task: the default she was shown - never hers', () => {
    assert.equal(durationSourceForSave({ touched: false, existing: null }), 'default');
  });

  test('touched: hers, on a new task and on an edit, whatever it was before', () => {
    assert.equal(durationSourceForSave({ touched: true, existing: null }), 'user');
    for (const before of ['user', 'default', 'inferred', null]) {
      assert.equal(durationSourceForSave({ touched: true, existing: { durationSource: before } }), 'user');
    }
  });

  test('untouched on an EDIT: whatever it already was - unknown stays unknown, a default is not promoted', () => {
    for (const before of ['user', 'default', 'inferred', null]) {
      assert.equal(durationSourceForSave({ touched: false, existing: { durationSource: before } }), before);
    }
    assert.equal(durationSourceForSave({ touched: false, existing: {} }), null, 'a row with no key at all is unknown');
  });

  test('the form asks that rule, tells it whether the field was touched, and only the duration field can touch it', () => {
    assert.match(FORM, /durationSourceForSave\(\{ touched: durationTouched, existing \}\)/, 'the decision is the domain rule, not a local guess');
    assert.match(FORM, /\{ \.\.\.edits, durationSource \}/, 'an edit carries the source');
    assert.match(FORM, /const input = \{ \.\.\.edits, durationSource,/, 'a new task carries the source');
    const handler = /label="Estimated minutes"[\s\S]*?onChangeText=\{\(text\) => \{\s*setDurationTouched\(true\);\s*setDurationMinutes\(text\);/;
    assert.match(FORM, handler, 'typing in the duration field is what makes the number hers');
    assert.equal((FORM.match(/setDurationTouched\(true\)/g) ?? []).length, 1, 'nothing else marks it touched');
  });
});

describe('HA-010 — legacy rows keep their uncertainty; persistence and restart preserve knowledge', () => {
  const stripSource = (raw) => {
    const envelope = JSON.parse(raw);
    for (const task of envelope.data.tasks) delete task.durationSource;
    return JSON.stringify(envelope);
  };

  test('a stored task with a 15 and no recorded source is NOT declared user-provided', () => {
    let s = addTask(base(), ctx(), { title: 'legacy', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'user' });
    const decoded = decodeStoredState(stripSource(encode(s)));
    assert.equal(decoded.kind, 'valid');
    assert.equal(decoded.state.tasks[0].durationMinutes, 15);
    assert.equal(decoded.state.tasks[0].durationSource, null);
    assert.equal(isUserProvidedDuration(decoded.state.tasks[0]), false);
    assert.equal(durationKnowledgeOf(decoded.state.tasks[0]), 'unrecorded');
  });

  test('each source survives encode -> restart -> decode, and a legacy row stays unrecorded across a second save', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 'd', categoryId: cat, scope: 'household' });
    s = addTask(s, c, { title: 'u', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'user' });
    s = addTask(s, c, { title: 'i', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'inferred' });
    const reloaded = decodeStoredState(encode(s)).state;
    assert.deepEqual(reloaded.tasks.map((t) => t.durationSource), ['default', 'user', 'inferred']);

    const legacy = decodeStoredState(stripSource(encode(s))).state;
    const again = decodeStoredState(encode(legacy)).state;
    assert.deepEqual(again.tasks.map((t) => t.durationSource), [null, null, null], 'a second save does not upgrade ambiguity into certainty');
  });

  test('a source the schema does not know is refused rather than trusted', () => {
    const s = addTask(base(), ctx(), { title: 't', categoryId: cat, scope: 'household' });
    const bad = { ...s, tasks: [{ ...s.tasks[0], durationSource: 'you-said-so' }] };
    assert.equal(validateAppState(bad).ok, false);
  });
});

describe('HA-010 — sync carries the knowledge in both directions', () => {
  const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
  const ACCOUNT = '11111111-1111-4111-8111-111111111111';
  const DEVICE = '22222222-2222-4222-8222-222222222222';
  const CAT_CLOUD = '44444444-4444-4444-8444-444444444444';
  const namespace = () => ({
    ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }),
    mappings: { [`category:${cat}`]: { kind: 'category', localId: cat, cloudId: CAT_CLOUD, revision: 1 } },
  });
  const project = (state, id) => toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespace() }, 'task', id);
  const home = (row) => applyCloudRow(base(), 'task', row.local_id, { ...row, id: '55555555-5555-4555-8555-555555555555', revision: 1 }, (id) => (id === CAT_CLOUD ? cat : null));

  test('default 15 and explicit 15 leave the device as different rows and come home as different rows', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 'Defaulted', categoryId: cat, scope: 'household' });
    s = addTask(s, c, { title: 'Typed', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'user' });
    const rows = s.tasks.map((t) => project(s, t.id));
    assert.deepEqual(rows.map((r) => [r.duration_minutes, r.duration_source]), [[15, 'default'], [15, 'user']]);
    assert.deepEqual(rows.map((r) => home(r).tasks[0].durationSource), ['default', 'user']);
  });

  test('an unrecorded source is sent as null and arrives as null: the round trip never invents provenance', () => {
    const s = addTask(base(), ctx(), { title: 'x', categoryId: cat, scope: 'household', durationMinutes: 15 });
    const row = project(s, 'task-1');
    assert.equal(row.duration_source, null);
    assert.equal(home(row).tasks[0].durationSource, null);
  });

  test('a cloud row from a server that has no such column arrives unrecorded', () => {
    const s = addTask(base(), ctx(), { title: 'x', categoryId: cat, scope: 'household', durationMinutes: 15, durationSource: 'user' });
    const { duration_source, ...legacyRow } = project(s, 'task-1');
    assert.equal(home(legacyRow).tasks[0].durationSource, null);
  });

  test('the column is one a client may UPDATE, and an update patch carries it', () => {
    assert.ok(UPDATABLE_COLUMNS.task.includes('duration_source'));
    const s = addTask(base(), ctx(), { title: 'x', categoryId: cat, scope: 'household' });
    assert.equal(updatablePatch('task', project(s, 'task-1')).duration_source, 'default');
  });

  test('a lost acknowledgement is recognised only when the source matches too (default != user)', () => {
    const c = ctx();
    let s = addTask(base(), c, { title: 'x', categoryId: cat, scope: 'household' });
    const ctxp = { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespace() };
    const row = { ...project(s, 'task-1'), id: 'x', revision: 2 };
    assert.equal(rowMatchesLocal(s, ctxp, 'task', 'task-1', row), true);
    assert.equal(rowMatchesLocal(s, ctxp, 'task', 'task-1', { ...row, duration_source: 'user' }), false, 'the cloud says she gave the number; this device says the default did');
  });

});
