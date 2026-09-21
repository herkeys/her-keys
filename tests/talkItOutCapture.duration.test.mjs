/**
 * HK-IR01-F02 / E - DURATION PROVENANCE ON THE FEATURE 02 PATH (HA-010: DEFAULT != USER-PROVIDED).
 *
 * `Task.durationSource` says how far a duration may be trusted as a fact: `user` (she entered it in a duration field), `default`
 * (nobody supplied one; the planning default of 15 stands in), `inferred` (Her Keys read it from her words in a reading she
 * approved), `null` (never recorded). Feature 02 makes tasks in exactly one way - it accepts a reading through the foundation's
 * `acceptInterpretation` - so what it records is what that function records, and what it can honestly say is bounded by what it
 * offers her: it has no duration field, so nothing on this path is ever "entered in a duration field".
 *
 * These tests pin, on the real coordinator, the three cases side by side (explicit / inferred / absent), the wording, and the
 * boundary that needs an owner's decision (a duration she states in a free-text correction is still read by the reader).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { DEFAULT_TASK_DURATION_MINUTES, durationKnowledgeOf, isUserProvidedDuration } from '../src/domain/foundation/duration.ts';
import { addTask } from '../src/domain/tasks.ts';
import { copyCorpus, copy } from '../src/features/talk-it-out/capture/copy.ts';
import { initialForm, patchFromForm } from '../src/features/talk-it-out/capture/fixForm.ts';
import { buildCaptureVM } from '../src/features/talk-it-out/capture/viewModel.ts';
import { startWorld } from './support/captureWorld.mjs';
import { ACCOUNT_A, NOW, accountCloudFor, bindAsNewDevice, createFakeCloud, makeCaptureDevice, tapCloud } from './support/captureAccountWorld.mjs';

const ROOT = join(import.meta.dirname, '..');
let counter = 0;
const key = () => `d${(counter += 1)}`;

/** Capture -> (optionally correct) -> accept, on the bare store. Returns the task it made and the reading it came from. */
async function capturedTask(world, text, { correctWith = null, area = 'home' } = {}) {
  const out = await world.coordinator.submit({ text, submissionKey: key() });
  assert.equal(out.kind, 'captured', text);
  assert.equal(out.readingIds.length, 1, `${text}: one reading`);
  let readingId = out.readingIds[0];
  if (correctWith !== null) {
    const revised = await world.coordinator.correct(readingId, correctWith);
    assert.equal(revised.kind, 'revised', `${text}: the correction was understood`);
    readingId = revised.readingId;
  }
  const categoryId = world.state().categories.find((c) => c.systemRole === area && c.status === 'active').id;
  assert.equal((await world.coordinator.accept(readingId, { categoryId })).kind, 'accepted', text);
  const reading = world.state().interpretations.find((r) => r.id === readingId);
  const task = world.state().tasks.find((t) => t.id === reading.acceptedRef.id);
  return { task, reading, captureId: out.captureId };
}

describe('E — the three sources side by side: explicit (hers), inferred (Her Keys read it), absent (the planning default)', () => {
  test('explicit: a duration she enters herself is user-provided; the same 15 read from her words is inferred; the same 15 with none given is the default', async () => {
    const world = await startWorld();
    const home = world.state().categories.find((c) => c.systemRole === 'home').id;
    // what a duration field records (TaskForm / addTask told the source): hers
    await world.store.commit((s, ctx) => addTask(s, ctx, { title: 'Typed by her', categoryId: home, scope: 'household', durationMinutes: 15, durationSource: 'user' }));
    const typed = world.state().tasks.find((t) => t.title === 'Typed by her');
    const { task: read } = await capturedTask(world, 'Renew the boat license by Friday for 15 minutes.');
    const { task: none } = await capturedTask(world, 'Renew the passport by Friday.');

    assert.deepEqual([typed.durationMinutes, read.durationMinutes, none.durationMinutes], [15, 15, 15], 'three tasks that all say 15 minutes');
    assert.deepEqual([typed.durationSource, read.durationSource, none.durationSource], ['user', 'inferred', 'default'], 'and differ only in what may be said about that 15');
    assert.deepEqual([typed, read, none].map(durationKnowledgeOf), ['user-provided', 'inferred-estimate', 'default-estimate']);
    assert.deepEqual([typed, read, none].map(isUserProvidedDuration), [true, false, false], 'only what she entered herself is user-provided');
  });

  test('inferred: a reading that carried a duration becomes a task whose duration is INFERRED, with the reader\'s number', async () => {
    const world = await startWorld();
    const { task, reading } = await capturedTask(world, 'Renew the library card by Friday for 45 minutes.');
    assert.equal(reading.durationMinutes, 45, 'the reader found it in her words');
    assert.equal(reading.provenance.producer, 'ai-inference');
    assert.deepEqual([task.durationMinutes, task.durationSource], [45, 'inferred']);
    assert.equal(isUserProvidedDuration(task), false, 'she approved a reading; she did not enter a number');
    assert.equal(task.provenance.confidence, 'established', 'her approval is still recorded as her approval, on the task as a whole');
  });

  test('absent: a reading with no duration yields the planning default through addTask - never user, never a bare number', async () => {
    const world = await startWorld();
    const { task, reading } = await capturedTask(world, 'Renew the passport by Friday.');
    assert.equal(reading.durationMinutes, null);
    assert.deepEqual([task.durationMinutes, task.durationSource], [DEFAULT_TASK_DURATION_MINUTES, 'default']);
    assert.equal(durationKnowledgeOf(task), 'default-estimate');
    assert.equal(isUserProvidedDuration(task), false);
  });

  test('a battery: every task Feature 02 makes is inferred exactly when its reading carried a duration, otherwise default - never user, never null', async () => {
    const world = await startWorld();
    const cases = [
      ['Call the pharmacy about the refill by Friday.', null],
      ['Renew the library card by Friday for 45 minutes.', 45],
      ['Pay the water bill by Friday.', null],
      ['Renew the boat license by Friday for 15 minutes.', 15],
      ['Order the permission slip by Friday for an hour.', 60],
      ['Return the library books by Friday for 20 minutes.', 20],
      ['Email the landlord by Friday.', null],
      ['Schedule the furnace repair by Friday for half an hour.', 30],
    ];
    const seen = [];
    for (const [text, minutes] of cases) {
      const { task, reading } = await capturedTask(world, text);
      seen.push({ text, source: task.durationSource, minutes: task.durationMinutes });
      assert.equal(reading.durationMinutes, minutes, `${text}: what the reader found`);
      assert.equal(task.durationSource, minutes === null ? 'default' : 'inferred', text);
      assert.equal(task.durationMinutes, minutes ?? DEFAULT_TASK_DURATION_MINUTES, text);
    }
    assert.equal(seen.some((s) => s.source === 'user' || s.source === null), false);
    assert.deepEqual(new Set(seen.map((s) => s.source)), new Set(['default', 'inferred']), 'both kinds were exercised');
  });
});

describe('E — what a correction can and cannot make of a duration (OWNER DECISION recorded: HK_IR01_F02_COMPATIBILITY.md)', () => {
  test('a duration she states in a free-text correction is still READ by the reader, so it is recorded inferred - not user, not null, not the default', async () => {
    const world = await startWorld();
    const { task, reading } = await capturedTask(world, 'Renew the parking permit by Friday.', { correctWith: { kind: 'text', text: 'for 30 minutes' } });
    assert.equal(reading.interpretationVersion, 2, 'the correction is a new reading');
    assert.equal(reading.durationMinutes, 30);
    assert.deepEqual([task.durationMinutes, task.durationSource], [30, 'inferred'], 'the number she supplied is used, and it is not mislabelled the planning default');
    assert.equal(isUserProvidedDuration(task), false, 'conservative: it never OVER-claims that she entered a number');
  });

  test('a corrected number replaces the reader\'s, and is not upgraded by having been corrected', async () => {
    const world = await startWorld();
    const { task } = await capturedTask(world, 'Renew the library card by Friday for 45 minutes.', { correctWith: { kind: 'text', text: 'for 20 minutes' } });
    assert.deepEqual([task.durationMinutes, task.durationSource], [20, 'inferred']);
  });

  test('"user" is unreachable on this path because Feature 02 offers no duration field: the Fix-it form cannot carry one, and no clarification answer does', () => {
    const world = { user: { timezone: 'America/New_York' } };
    const reading = {
      id: 'r', artifactId: 'a', proposedKind: 'task', title: 'Renew the library card', dueDate: '2026-09-18', startsAt: null, endsAt: null, durationMinutes: 45,
      value: null, subjectMemberId: null, categoryHint: null, state: 'pending', clarification: null, acceptedRef: null, supersedesId: null, interpretationVersion: 1,
      createdAt: '2026-09-16T14:00:00.000Z', decidedAt: null, provenance: { producer: 'ai-inference', artifactId: 'a', confidence: 'possible' }, scope: 'personal',
    };
    const form = initialForm(reading, world);
    assert.equal(Object.keys(form).some((name) => /dur|minute|length/i.test(name)), false, 'no duration input');
    for (const changed of [{ title: 'x' }, { date: '2026-09-19' }, { kind: 'needsMe' }, { amountText: '5', direction: 'outflow' }, { subject: 'none' }]) {
      const result = patchFromForm({ ...form, ...changed }, form);
      if (result.kind === 'patch') assert.equal('durationMinutes' in result.patch, false, JSON.stringify(changed));
    }
    const source = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'fixForm.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/durationMinutes|durationSource/.test(source), false, 'the form never names a duration');
    const coordinator = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'coordinator.ts'), 'utf8');
    assert.equal(/durationSource/.test(coordinator), false, 'and the coordinator never writes a source of its own: it is the foundation\'s acceptInterpretation that decides');
  });

  test('DOCUMENTED FOUNDATION GAP: an event\'s length has no provenance either - an assumed 30 minutes and a stated 30 minutes are the same durable event', async () => {
    const world = await startWorld();
    const areaId = world.state().categories.find((c) => c.systemRole === 'wellbeing').id;
    const assumed = await world.coordinator.submit({ text: 'Dentist Friday at 3pm.', submissionKey: key() });
    const stated = await world.coordinator.submit({ text: 'Dentist Saturday from 3 to 3:30pm.', submissionKey: key() });
    assert.ok(world.coordinator.sessionOf(assumed.captureId).details.get(assumed.readingIds[0]).assumptions.includes('end-time-assumed'), 'the session knows the end was assumed');
    assert.equal(world.coordinator.sessionOf(stated.captureId).details.get(stated.readingIds[0]).assumptions.includes('end-time-assumed'), false);
    for (const id of [assumed.readingIds[0], stated.readingIds[0]]) assert.equal((await world.coordinator.accept(id, { categoryId: areaId })).kind, 'accepted');

    const [a, s] = world.state().events;
    assert.equal(Date.parse(a.endsAt) - Date.parse(a.startsAt), 30 * 60_000);
    assert.equal(Date.parse(s.endsAt) - Date.parse(s.startsAt), 30 * 60_000);
    assert.equal(Object.keys(a).some((k) => /source|assumed/i.test(k)), false, 'the event carries no marker that its end was assumed');
    assert.deepEqual(Object.keys(a).sort(), Object.keys(s).sort(), 'so a consumer cannot tell them apart');

    // the restart keeps the event and loses what was assumed; the review then says it no longer knows what was read from her words
    await world.restart();
    const remaining = world.state();
    assert.equal(remaining.events.length, 2);
    const vm = buildCaptureVM({ state: remaining, captureId: assumed.captureId, nowMs: world.clock.now, text: null, session: null });
    assert.equal(vm.proposals[0].phase, 'accepted');
  });
});

describe('E — wording: nothing Feature 02 says presents an inferred or default duration as something she said', () => {
  const minutesWord = /\b(?:minutes?|hours?|hrs?|mins?)\b/i;

  test('the ONLY string in the feature that names an amount of time is the end-time assumption, and it says she did NOT say it', () => {
    const naming = copyCorpus().filter((line) => minutesWord.test(line));
    assert.deepEqual(naming, [copy.review.assumption('end-time-assumed')]);
    assert.match(naming[0], /didn.t say/i);
    assert.match(naming[0], /assumed/i);
    for (const line of copyCorpus()) assert.equal(/\byou (?:said|told me|gave|entered|set|chose)\b[^.]*\b(?:minutes?|hours?|long|length|duration)\b/i.test(line), false, `"${line}" credits her with a duration`);
  });

  test('the review of a reading that carries a duration shows no duration as a fact, and quotes her words as "what I read", never as what she set', async () => {
    const world = await startWorld();
    const out = await world.coordinator.submit({ text: 'Renew the library card by Friday for 45 minutes.', submissionKey: key() });
    const vm = buildCaptureVM({ state: world.state(), captureId: out.captureId, nowMs: world.clock.now, text: world.coordinator.textOf(out.captureId), session: world.coordinator.sessionOf(out.captureId) });
    const shown = [...vm.proposals[0].fields.map((f) => `${f.label} ${f.value}`), ...vm.proposals[0].notes];
    assert.equal(shown.some((line) => minutesWord.test(line)), false, `no duration among ${JSON.stringify(shown)}`);
    const length = vm.proposals[0].evidence.filter((line) => minutesWord.test(line));
    assert.deepEqual(length, [copy.review.whyEvidence('for 45 minutes', 'length')], 'only her own quoted words, framed as what was read from them');
    assert.match(length[0], /which I read as/);

    // after acceptance the outcome line claims nothing about how long it takes
    const home = world.state().categories.find((c) => c.systemRole === 'home').id;
    await world.coordinator.accept(out.readingIds[0], { categoryId: home });
    const after = buildCaptureVM({ state: world.state(), captureId: out.captureId, nowMs: world.clock.now, text: null, session: null });
    assert.equal(after.proposals[0].outcomeLine, copy.review.savedAs('task'));
    assert.equal(minutesWord.test(after.proposals[0].outcomeLine), false);
  });

  test('a reading with NO duration says nothing about one, before or after acceptance', async () => {
    const world = await startWorld();
    const out = await world.coordinator.submit({ text: 'Renew the passport by Friday.', submissionKey: key() });
    const vmOf = (text, session) => buildCaptureVM({ state: world.state(), captureId: out.captureId, nowMs: world.clock.now, text, session });
    const everything = (vm) => JSON.stringify([vm.proposals.map((p) => [p.fields, p.notes, p.evidence, p.outcomeLine]), vm.sessionNotes]);
    assert.equal(minutesWord.test(everything(vmOf(world.coordinator.textOf(out.captureId), world.coordinator.sessionOf(out.captureId)))), false);
    const home = world.state().categories.find((c) => c.systemRole === 'home').id;
    await world.coordinator.accept(out.readingIds[0], { categoryId: home });
    assert.equal(minutesWord.test(everything(vmOf(null, null))), false);
    assert.equal(world.state().tasks[0].durationMinutes, 15, 'while the task itself carries the planning default');
  });
});

describe('E — the provenance survives the account boundary: cloud column, second device', () => {
  test('tasks.duration_source is inferred / default in the cloud, "user" is never sent by this path, and a second device reads the same knowledge back', async () => {
    const cloud = createFakeCloud();
    const tap = tapCloud(cloud);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeCaptureDevice({ cloud, tap, accountCloud });
    await a.signIn();
    const home = a.state().categories.find((c) => c.systemRole === 'home').id;
    const capture = (text, n) => a.coordinator.submit({ text, submissionKey: `s${NOW.toString(36)}-${n}` });
    const withDuration = await capture('Renew the library card by Friday for 45 minutes.', 0);
    const without = await capture('Renew the passport by Friday.', 1);
    const corrected = await capture('Renew the parking permit by Friday.', 2);
    const revised = await a.coordinator.correct(corrected.readingIds[0], { kind: 'text', text: 'for 30 minutes' });
    for (const id of [withDuration.readingIds[0], without.readingIds[0], revised.readingId]) assert.equal((await a.coordinator.accept(id, { categoryId: home })).kind, 'accepted');
    await a.settle();

    const rows = Object.fromEntries(cloud.table('tasks').map((t) => [t.title, [t.duration_minutes, t.duration_source]]));
    assert.deepEqual(rows, {
      'Renew the library card': [45, 'inferred'],
      'Renew the passport': [15, 'default'],
      'Renew the parking permit': [30, 'inferred'],
    });
    assert.equal(tap.sent.some((request) => /"duration_source":"user"/.test(request)), false, 'nothing on this path ever sent "user"');
    assert.equal(tap.sent.some((request) => /"duration_source":null/.test(request)), false, 'and nothing sent an unrecorded source alongside a number');

    const b = await makeCaptureDevice({ cloud, tap: tapCloud(cloud), accountId: ACCOUNT_A, accountCloud, kids: [] });
    await bindAsNewDevice(b, accountCloud);
    await b.signIn();
    const pulled = Object.fromEntries(b.state().tasks.map((t) => [t.title, [t.durationMinutes, t.durationSource, durationKnowledgeOf(t)]]));
    assert.deepEqual(pulled, {
      'Renew the library card': [45, 'inferred', 'inferred-estimate'],
      'Renew the passport': [15, 'default', 'default-estimate'],
      'Renew the parking permit': [30, 'inferred', 'inferred-estimate'],
    });
    assert.equal(b.state().tasks.some(isUserProvidedDuration), false, 'device B does not turn any of them into something she said');
  });
});
