/**
 * V2UP-B - REVIEW AND APPROVAL, at the coordinator and view-model level (real store, real coordinator, real foundation transitions).
 *
 *   1. "Save the ready ones": selective approval of a capture with several readings. It goes through the SAME accept path once per
 *      reading, never saves anything that needs her eyes, and reports a partial failure truthfully.
 *   2. After a save, the record that now exists can be opened - and only while it exists.
 *   3. Account isolation for in-flight work: an answer that was waited for must never be written into another account's household.
 *
 * What was already proven elsewhere and is NOT repeated here (tests/talkItOutCapture.coordinator.test.mjs): accepting makes exactly one
 * record, a rejected reading makes none, double / concurrent / post-restart accept is safe, one submission key is one capture.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { UNDECIDED_READING_TITLE } from '../src/domain/foundation/interpretation.ts';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { namespaceForNewDevice } from '../src/domain/sync/claimSeam.ts';
import { bulkEligibility } from '../src/features/talk-it-out/capture/bulk.ts';
import { createCaptureCoordinator } from '../src/features/talk-it-out/capture/coordinator.ts';
import { boundOwnerOf, epochChanged, epochOf, ownerChanged, ownerKeyOf } from '../src/features/talk-it-out/capture/owner.ts';
import { localInterpreter } from '../src/features/talk-it-out/capture/port.ts';
import { createMemoryCaptureTextStore } from '../src/features/talk-it-out/capture/textStore.ts';
import { recordRouteOf } from '../src/features/talk-it-out/capture/recordRoute.ts';
import { buildCaptureVM } from '../src/features/talk-it-out/capture/viewModel.ts';
import { copy, copyCorpus } from '../src/features/talk-it-out/capture/copy.ts';
import { review } from './support/captureViews.mjs';
import { startWorld } from './support/captureWorld.mjs';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const WORDS = 'Water the plants, empty the bins and book the vet by Friday';

const prop = (key, title, over = {}) => ({
  key,
  kind: 'task',
  title,
  dueDate: '2026-09-18',
  startsAt: null,
  endsAt: null,
  durationMinutes: null,
  value: null,
  subjectMemberId: null,
  categoryHint: 'home',
  confidence: 'possible',
  clarification: null,
  assumptions: [],
  evidence: [],
  childScoped: false,
  requiresExplicitReview: true,
  span: { start: 0, end: 5 },
  ...over,
});

/** A reader that returns exactly these proposals, as the Premium reader's mapped result would. */
const reader = (proposals, gate = null) => async ({ local }) => {
  if (gate) await gate.promise;
  return { kind: 'enhanced', result: { ...local, proposals, unsupported: [], failure: null } };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const READY_SET = [
  prop('p1', 'Water the plants'),
  prop('p2', 'Empty the bins'),
  prop('p3', 'A note to self', { kind: 'needsMe', dueDate: null, categoryHint: null }),
  prop('p4', 'Book the vet', { assumptions: ['date-assumed-today'] }),
  prop('p5', 'Pay the vet', { value: { amountMinor: 8500, currency: 'USD', direction: 'outflow' } }),
  prop('p6', 'Sign the form', { subjectMemberId: 'kid-alexa' }),
  prop('p7', 'Buy a gift', { categoryHint: null }),
];

async function world(proposals = READY_SET, extra = {}) {
  const w = await startWorld({ enhance: reader(proposals), ...extra });
  const out = await w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
  assert.equal(out.kind, 'captured');
  return { w, out, ids: out.readingIds };
}

async function bindTo(w, accountId) {
  const householdId = randomUUID();
  w.store.setIdentity({
    binding: { accountId, householdId, boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} },
    receipt: null,
    quarantine: null,
    sync: namespaceForNewDevice({ accountId, householdId, deviceId: randomUUID() }),
  });
  await w.store.saveIdentity();
}

// -------------------------------------------------------------------------------- 1. SAVE THE READY ONES

describe('SAVE THE READY ONES - which readings are eligible', () => {
  test('only an open, named reading with an area and NOTHING to check is ready; each other case says why it is not', async () => {
    const { w, out, ids } = await world();
    const state = w.state();
    const session = w.coordinator.sessionOf(out.captureId);
    const verdicts = ids.map((id) => bulkEligibility(state, state.interpretations.find((r) => r.id === id), session.details.get(id)));
    assert.deepEqual(
      verdicts.map((v) => (v.ok ? 'ready' : v.reason)),
      ['ready', 'ready', 'ready', 'assumption-made', 'money', 'child', 'needs-area']
    );
  });

  test('a reading whose assumptions are no longer known (after a restart) is never ready, and neither is a Premium reading', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins', { assumptions: ['premium-reading'] })]);
    const state = w.state();
    const [first, second] = ids.map((id) => state.interpretations.find((r) => r.id === id));
    assert.equal(bulkEligibility(state, first, null).ok, false, 'the session no longer knows what was assumed');
    assert.equal(bulkEligibility(state, first, w.coordinator.sessionOf(out.captureId).details.get(first.id)).ok, true);
    assert.equal(bulkEligibility(state, second, w.coordinator.sessionOf(out.captureId).details.get(second.id)).reason, 'assumption-made', 'her own copy tells her to check every detail of a Premium reading');
  });

  test('a chosen area makes an area-less reading ready; an area that is not hers does not', async () => {
    const { w, out, ids } = await world([prop('p1', 'Buy a gift', { categoryHint: null })]);
    const state = w.state();
    const reading = state.interpretations.find((r) => r.id === ids[0]);
    const details = w.coordinator.sessionOf(out.captureId).details.get(ids[0]);
    const home = state.categories.find((c) => c.systemRole === 'home').id;
    assert.equal(bulkEligibility(state, reading, details).reason, 'needs-area');
    assert.equal(bulkEligibility(state, reading, details, home).ok, true);
    assert.equal(bulkEligibility(state, reading, details, 'not-a-category').reason, 'needs-area');
  });

  test('the view model offers the step only as a count, and agrees with the eligibility rule reading by reading', async () => {
    const { w, out } = await world();
    const vm = review(w, out.captureId);
    assert.equal(vm.bulk.ready, 3);
    assert.deepEqual(vm.proposals.map((p) => p.bulkReady), [true, true, true, false, false, false, false]);
    const home = w.state().categories.find((c) => c.systemRole === 'home').id;
    const chosen = review(w, out.captureId, { areaChoice: { [out.readingIds[6]]: home } });
    assert.equal(chosen.bulk.ready, 4, 'choosing an area for the last one makes it ready, exactly as it enables its own Save');
  });
});

describe('SAVE THE READY ONES - what it does', () => {
  test('it saves exactly the ready readings, one record each, and leaves everything else exactly as it was', async () => {
    const { w, out, ids } = await world();
    const before = w.state();
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome, { saved: ids.slice(0, 3), needsReview: ids.slice(3), failed: [] });
    const after = w.state();
    assert.equal(after.tasks.length, before.tasks.length + 2);
    assert.equal(after.needsMe.length, before.needsMe.length + 1);
    assert.deepEqual(after.tasks.slice(-2).map((t) => t.title), ['Water the plants', 'Empty the bins']);
    const byId = (id) => after.interpretations.find((r) => r.id === id);
    assert.deepEqual(ids.map((id) => byId(id).state), ['accepted', 'accepted', 'accepted', 'pending', 'pending', 'pending', 'pending']);
    assert.equal(after.events.length, before.events.length, 'no appointment was made');
    // Each record is the one the single Save would make: it carries the reading it came from.
    for (const id of ids.slice(0, 3)) assert.ok(byId(id).acceptedRef, id);
    assert.equal(new Set(ids.slice(0, 3).map((id) => byId(id).acceptedRef.id)).size, 3, 'three different records');
  });

  test('it never saves money, a child\'s item, a guessed detail or an area-less reading, however many times it is pressed', async () => {
    const { w, out, ids } = await world();
    await w.coordinator.acceptReady(out.captureId);
    const again = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(again, { saved: [], needsReview: ids.slice(3), failed: [] }, 'a second press saves nothing new and makes no duplicates');
    const titles = [...w.state().tasks.map((t) => t.title), ...w.state().needsMe.map((n) => n.title)];
    for (const unsafe of ['Book the vet', 'Pay the vet', 'Sign the form', 'Buy a gift']) assert.ok(!titles.includes(unsafe), unsafe);
    assert.equal(w.state().tasks.filter((t) => t.title === 'Water the plants').length, 1);
  });

  test('a chosen area is used for the reading it was chosen for', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Buy a gift', { categoryHint: null })]);
    const money = w.state().categories.find((c) => c.systemRole === 'money').id;
    const outcome = await w.coordinator.acceptReady(out.captureId, { [ids[1]]: money });
    assert.deepEqual(outcome.saved, ids);
    const gift = w.state().tasks.find((t) => t.title === 'Buy a gift');
    assert.equal(gift.categoryId, money);
  });

  test('a rejected reading is not swept in', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    await w.coordinator.reject(ids[1]);
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome.saved, [ids[0], ids[2]]);
    assert.deepEqual(w.state().tasks.map((t) => t.title).filter((t) => ['Water the plants', 'Empty the bins', 'Mow the lawn'].includes(t)), ['Water the plants', 'Mow the lawn']);
  });

  test('two presses at once make one record each', async () => {
    const { w, out } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins')]);
    const [one, two] = await Promise.all([w.coordinator.acceptReady(out.captureId), w.coordinator.acceptReady(out.captureId)]);
    assert.equal(w.state().tasks.filter((t) => t.title === 'Water the plants').length, 1);
    assert.equal(w.state().tasks.filter((t) => t.title === 'Empty the bins').length, 1);
    assert.equal(one.failed.length + two.failed.length, 0);
  });

  test('a capture that is gone, or has nothing ready, saves nothing and says nothing was saved', async () => {
    const { w, out } = await world([prop('p1', 'Book the vet', { assumptions: ['hedged-language'] })]);
    assert.deepEqual(await w.coordinator.acceptReady(out.captureId), { saved: [], needsReview: [w.state().interpretations[0].id], failed: [] });
    assert.deepEqual(await w.coordinator.acceptReady('no-such-capture'), { saved: [], needsReview: [], failed: [] });
    assert.equal(copy.bulk.result(0, 0), 'Nothing was saved. Each one needs a look first.');
  });
});

describe('SAVE THE READY ONES - it is the single Save, repeated: every per-reading rule still applies', () => {
  test('structurally: the coordinator has ONE accept implementation, and both `accept` and `acceptReady` call it', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'features', 'talk-it-out', 'capture', 'coordinator.ts'), 'utf8');
    assert.equal(source.match(/acceptInterpretation[(]/g).length, 1, 'the foundation transition is called from exactly one place');
    assert.match(source, /accept: acceptOne,/);
    assert.match(source, /await acceptOne[(]reading[.]id/);
  });

  test('behaviourally: N ready readings are N separate durable commits, exactly what N single Saves do', async () => {
    const { w, out } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    let commits = 0;
    const counting = { subscribe: w.store.subscribe, getSnapshot: () => w.store.getSnapshot(), commit: (t) => { commits += 1; return w.store.commit(t); } };
    const coordinator = createCaptureCoordinator({ store: counting, interpreter: localInterpreter, text: w.text, now: () => w.clock.now, enhance: reader([]) });
    // This coordinator has no session of its own, so it must refuse to guess what was assumed: nothing is saved without it.
    assert.deepEqual((await coordinator.acceptReady(out.captureId)).saved, []);
    assert.equal(commits, 0);
    // The coordinator that read the capture saves all three, one commit each.
    const real = w.coordinator;
    const spy = { subscribe: w.store.subscribe, getSnapshot: () => w.store.getSnapshot(), commit: (t) => { commits += 1; return w.store.commit(t); } };
    const c2 = createCaptureCoordinator({ store: spy, interpreter: localInterpreter, text: createMemoryCaptureTextStore(), now: () => w.clock.now, enhance: reader([prop('q1', 'Water the plants'), prop('q2', 'Empty the bins')]) });
    const read = await c2.submit({ text: WORDS, submissionKey: 'k2' });
    commits = 0;
    const outcome = await c2.acceptReady(read.captureId);
    assert.equal(outcome.saved.length, 2);
    assert.equal(commits, 2, 'one commit per reading');
    assert.ok(real);
  });

  test('a reading that arrived unnamed (another device kept the words) is never saved by the batch: it must be named first', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    // The neutral label only ever arrives from another device through sync; the same state is built here by hand.
    const renamed = await w.store.commit((s) => ({ ...s, interpretations: s.interpretations.map((r) => (r.id === ids[0] ? { ...r, title: UNDECIDED_READING_TITLE.task } : r)) }));
    const reading = w.state().interpretations.find((r) => r.id === ids[0]);
    const details = w.coordinator.sessionOf(out.captureId).details.get(ids[0]);
    assert.equal(bulkEligibility(w.state(), { ...reading, title: UNDECIDED_READING_TITLE.task }, details).reason, 'needs-title');
    if (!renamed) return; // the store refuses to hold it; the pure rule above is the whole proof
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome.saved, [ids[1], ids[2]]);
    assert.deepEqual(outcome.needsReview, [ids[0]]);
    assert.equal(w.state().interpretations.find((r) => r.id === ids[0]).state, 'pending');
    assert.equal((await w.coordinator.accept(ids[0])).kind, 'needs-title', 'the single Save says the same thing');
  });

  test('an area-less to-do is never saved by the batch, and the single Save refuses it for the same reason', async () => {
    const { w, out, ids } = await world([prop('p1', 'Buy a gift', { categoryHint: null }), prop('p2', 'Mow the lawn'), prop('p3', 'Empty the bins')]);
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome.needsReview, [ids[0]]);
    assert.equal((await w.coordinator.accept(ids[0])).kind, 'needs-area');
  });

  test('high-stakes words are never a capture at all, so there is nothing for the batch to save', async () => {
    const w = await startWorld({ enhance: reader(READY_SET) });
    const out = await w.coordinator.submit({ text: 'He hit me again and I have to pick up Ayden at 5', submissionKey: 'hs' });
    assert.equal(out.kind, 'high-stakes');
    assert.deepEqual(w.state().interpretations, []);
    assert.deepEqual(await w.coordinator.acceptReady('hs'), { saved: [], needsReview: [], failed: [] });
  });

  test('a reading with an open question is left for the question, never saved by the batch', async () => {
    const { w, out, ids } = await world([prop('p1', 'Pick up Alexa', { clarification: { steps: [{ kind: 'which_day', weekday: null }], options: [{ kind: 'date', date: '2026-09-16' }, { kind: 'date', date: '2026-09-17' }] } }), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome.saved, [ids[1], ids[2]]);
    assert.deepEqual(outcome.needsReview, [ids[0]]);
  });
});

describe('SAVE THE READY ONES - a failure is reported as it happened', () => {
  test('when a save cannot be made durable that reading is "failed" and unchanged; the ones before it stay saved; the rest are not attempted as saved', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    const tasksBefore = w.state().tasks.length;
    // Writes that would contain a SECOND new task fail (both write attempts), so the first save lands and the next two cannot.
    w.control.failWhen = (_key, value) => {
      try { return JSON.parse(value).data.tasks.length >= tasksBefore + 2; } catch { return false; }
    };
    const outcome = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(outcome, { saved: [ids[0]], needsReview: [], failed: [ids[1], ids[2]] });
    assert.equal(w.state().tasks.length, tasksBefore + 1, 'only what was durably saved is shown as saved');
    assert.deepEqual(ids.map((id) => w.state().interpretations.find((r) => r.id === id).state), ['accepted', 'pending', 'pending']);
    assert.equal(copy.bulk.result(1, 2), 'Saved 1 item. 2 couldn’t be saved, so nothing was changed for them. You can try them again.');

    // Trying again finishes the job without touching the one that was saved.
    w.control.failWhen = null;
    const retry = await w.coordinator.acceptReady(out.captureId);
    assert.deepEqual(retry, { saved: [ids[1], ids[2]], needsReview: [], failed: [] });
    assert.equal(w.state().tasks.length, tasksBefore + 3);
    assert.equal(w.state().tasks.filter((t) => t.title === 'Water the plants').length, 1, 'never saved twice');
  });
});

// -------------------------------------------------------------------------------- 2. OPEN WHAT WAS SAVED

describe('after a save, the record can be opened - while it exists', () => {
  test('each kind names its own destination: the editors the Calendar already uses, and Needs Me for a note', async () => {
    const { w, out, ids } = await world([
      prop('p1', 'Water the plants'),
      prop('p2', 'Dentist', { kind: 'event', dueDate: null, startsAt: '2026-09-18T20:00:00.000Z', endsAt: '2026-09-18T20:30:00.000Z', categoryHint: 'wellbeing' }),
      prop('p3', 'A note to self', { kind: 'needsMe', dueDate: null, categoryHint: null }),
    ]);
    for (const id of ids) assert.equal((await w.coordinator.accept(id)).kind, 'accepted');
    const targets = review(w, out.captureId).proposals.map((p) => p.openTarget);
    assert.deepEqual(targets.map((t) => [t.kind, t.label]), [['task', 'Open the to-do'], ['event', 'Open the appointment'], ['needsMe', 'Open the note']]);
    const state = w.state();
    assert.deepEqual(recordRouteOf(targets[0]), { pathname: '/task-editor', params: { taskId: state.tasks.at(-1).id } });
    assert.deepEqual(recordRouteOf(targets[1]), { pathname: '/event-editor', params: { eventId: state.events.at(-1).id } });
    assert.deepEqual(recordRouteOf(targets[2]), { pathname: '/life/needs-me' });
  });

  test('nothing to open before a save, after a rejection, or once the record has been deleted since', async () => {
    const { w, out, ids } = await world([prop('p1', 'Water the plants'), prop('p2', 'Empty the bins'), prop('p3', 'Mow the lawn')]);
    assert.deepEqual(review(w, out.captureId).proposals.map((p) => p.openTarget), [null, null, null]);
    await w.coordinator.accept(ids[0]);
    await w.coordinator.reject(ids[1]);
    const vm = review(w, out.captureId);
    assert.ok(vm.proposals[0].openTarget);
    assert.equal(vm.proposals[1].openTarget, null);
    assert.equal(vm.proposals[2].openTarget, null);
    const id = vm.proposals[0].openTarget.id;
    // The store refuses to delete a record a reading points at, so the missing-record case is shown on a state built without it.
    assert.equal(await w.store.commit((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })), false);
    const without = { ...w.state(), tasks: w.state().tasks.filter((t) => t.id !== id) };
    const gone = buildCaptureVM({ state: without, captureId: out.captureId, nowMs: w.clock.now, text: null, session: null });
    assert.equal(gone.proposals[0].openTarget, null, 'a record that is not there is not offered');
  });
});

// -------------------------------------------------------------------------------- 3. ACCOUNT ISOLATION

describe('the owner of a household (what "a different account" means to the capture feature)', () => {
  const bound = (accountId, householdId) => ({ identity: { binding: { accountId, householdId, boundAt: 't' } }, state: { household: { id: 'household-1' } } });
  const unbound = { identity: { binding: null }, state: { household: { id: 'household-1' } } };

  test('only a different bound household is a switch: claiming a local household, and signing out, are not', () => {
    const a = boundOwnerOf(bound('a', 'ha'));
    assert.equal(ownerChanged(a, boundOwnerOf(bound('b', 'hb'))), true, 'another account');
    assert.equal(ownerChanged(a, boundOwnerOf(bound('a', 'other'))), true, 'the same account, another household');
    assert.equal(ownerChanged(a, boundOwnerOf(bound('a', 'ha'))), false);
    assert.equal(ownerChanged(boundOwnerOf(unbound), a), false, 'a local household being claimed is the same household');
    assert.equal(ownerChanged(a, boundOwnerOf(unbound)), false, 'signing out keeps the household');
    assert.equal(ownerChanged(null, null), false);
  });

  test('the conversation key still moves on any change of identity, as it always did, and now on a reset (a new household object with the same id)', () => {
    const household = { id: 'household-1' };
    const at = (accountId, householdId, boundAt = 't', h = household) => ({ identity: { binding: { accountId, householdId, boundAt } }, state: { household: h } });
    const base = ownerKeyOf(at('a', 'ha'));
    assert.notEqual(base, ownerKeyOf(at('b', 'hb')));
    assert.notEqual(base, ownerKeyOf(at('a', 'ha', 'later')));
    assert.equal(base, ownerKeyOf(at('a', 'ha')));
    assert.notEqual(base, ownerKeyOf(at('a', 'ha', 't', { id: 'household-1' })), 'a reset household has the same id and is not the same household');
  });
});

describe('an answer that was waited for is never written into another account', () => {
  const answer = [prop('p1', 'Water the plants'), prop('p2', 'Empty the bins')];

  test('CONTROL: with no switch the same flow saves its readings (so the tests below can fail)', async () => {
    const gate = deferred();
    const w = await startWorld({ kids: [], enhance: reader(answer, gate) });
    await bindTo(w, ACCOUNT_A);
    const submitting = w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
    await tick();
    gate.resolve();
    const out = await submitting;
    assert.equal(out.kind, 'captured');
    assert.equal(out.readingIds.length, 2);
  });

  test('a household that was reset and bound to another account receives nothing from the old account\'s read, and none of its words', async () => {
    const gate = deferred();
    const w = await startWorld({ kids: [], enhance: reader(answer, gate) });
    await bindTo(w, ACCOUNT_A);
    const submitting = w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
    await tick();
    assert.equal(w.state().sourceArtifacts.length, 1, 'the source was saved before the reader was asked');
    assert.equal(await w.store.reset(), true);
    await bindTo(w, ACCOUNT_B);
    gate.resolve();
    assert.deepEqual(await submitting, { kind: 'not-saved' });
    assert.deepEqual([w.state().sourceArtifacts.length, w.state().interpretations.length, w.state().tasks.length], [0, 0, 0]);
    assert.deepEqual(w.text.refs(), [], 'her words are forgotten');
    assert.equal(w.everythingStored().includes('Water the plants'), false, 'and nothing of the old account\'s reading is on the device\'s disk');
  });

  test('a household whose binding changed under the read keeps NO reading from it, and forgets the words', async () => {
    const gate = deferred();
    const w = await startWorld({ kids: [], enhance: reader(answer, gate) });
    await bindTo(w, ACCOUNT_A);
    const submitting = w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
    await tick();
    await bindTo(w, ACCOUNT_B);
    gate.resolve();
    assert.deepEqual(await submitting, { kind: 'not-saved' });
    assert.equal(w.state().interpretations.length, 0, 'no reading was proposed into the other account\'s household');
    assert.deepEqual(w.text.refs(), []);
  });

  test('being claimed by its first account, or signing out, while the read is out does NOT discard it: it is the same household', async () => {
    const cases = [
      { before: async () => {}, during: async (w) => bindTo(w, ACCOUNT_A) },
      {
        before: async (w) => bindTo(w, ACCOUNT_A),
        during: async (w) => {
          w.store.setIdentity(UNBOUND_IDENTITY);
          await w.store.saveIdentity();
        },
      },
    ];
    for (const { before, during } of cases) {
      const gate = deferred();
      const w = await startWorld({ kids: [], enhance: reader(answer, gate) });
      await before(w);
      const submitting = w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      await tick();
      await during(w);
      gate.resolve();
      const out = await submitting;
      assert.equal(out.kind, 'captured');
      assert.equal(out.readingIds.length, 2);
    }
  });

  /**
   * One coordinator, on a store whose owner changes at the moment the NEXT write is queued: the tap happened under account A and the
   * commit runs under B. The fence inside the store's own turn is the only thing that can stop that write.
   */
  async function guarded() {
    const w = await startWorld({ kids: [], enhance: undefined });
    await bindTo(w, ACCOUNT_A);
    const swap = { armed: false, on: false };
    const store = {
      subscribe: w.store.subscribe,
      getSnapshot: () => {
        const snap = w.store.getSnapshot();
        return swap.on ? { ...snap, identity: { ...snap.identity, binding: { accountId: ACCOUNT_B, householdId: 'hb', boundAt: 't', kind: 'claim', idMap: {} } } } : snap;
      },
      commit: (transition) => {
        const run = w.store.commit(transition);
        if (swap.armed) swap.on = true;
        return run;
      },
    };
    const coordinator = createCaptureCoordinator({ store, interpreter: localInterpreter, text: createMemoryCaptureTextStore(), now: () => w.clock.now, enhance: reader(answer) });
    const out = await coordinator.submit({ text: WORDS, submissionKey: 'k1' });
    assert.equal(out.kind, 'captured');
    swap.armed = true;
    return { w, out, coordinator, swap };
  }

  test('a Save whose household changed hands before it ran writes nothing and does not say "saved"', async () => {
    const { w, out, coordinator } = await guarded();
    const tasks = w.state().tasks.length;
    const outcome = await coordinator.accept(out.readingIds[0]);
    assert.equal(outcome.kind, 'not-saved');
    assert.equal(w.state().tasks.length, tasks, 'no record was made');
    assert.equal(w.state().interpretations.find((r) => r.id === out.readingIds[0]).state, 'pending');
  });

  test('a rejection under the same circumstances is not reported as done either', async () => {
    const { w, out, coordinator } = await guarded();
    assert.equal((await coordinator.reject(out.readingIds[1])).kind, 'not-saved');
    assert.equal(w.state().interpretations.find((r) => r.id === out.readingIds[1]).state, 'pending', 'nothing was rejected');
  });

  test('a bulk save stops when the household changes hands: what was not saved is reported as not saved, and nothing is written', async () => {
    const { w, out, coordinator } = await guarded();
    const bulk = await coordinator.acceptReady(out.captureId);
    assert.deepEqual(bulk, { saved: [], needsReview: [], failed: out.readingIds });
    assert.equal(w.state().interpretations.filter((r) => r.state !== 'pending').length, 0);
    assert.equal(w.state().tasks.filter((t) => t.title === 'Water the plants' || t.title === 'Empty the bins').length, 0);
  });
});

// -------------------------------------------------------------------------------- 3b. THE RESET WINDOW (work started under A, household wiped before the write)

describe('a household that is reset (or whose store is not settled) while work is in flight is never written into', () => {
  const answer = [prop('p1', 'Water the plants'), prop('p2', 'Empty the bins')];

  /**
   * A coordinator on the real store, whose store hands back control at the moment the NEXT write is queued, so a test can reset, rebind,
   * claim or sign out between "the tap" (when the coordinator read who it was writing for) and "the write" (inside the store's own turn).
   */
  async function raced({ bound = ACCOUNT_A } = {}) {
    const w = await startWorld({ kids: [], enhance: undefined });
    if (bound) await bindTo(w, bound);
    const race = { hook: null, hide: false };
    const store = {
      subscribe: w.store.subscribe,
      getSnapshot: () => {
        const snap = w.store.getSnapshot();
        return race.hide ? { ...snap, state: null } : snap;
      },
      commit: async (transition) => {
        const hook = race.hook;
        race.hook = null;
        if (hook) await hook(w, race);
        return w.store.commit(transition);
      },
    };
    const text = createMemoryCaptureTextStore();
    const coordinator = createCaptureCoordinator({ store, interpreter: localInterpreter, text, now: () => w.clock.now, enhance: reader(answer) });
    return { w, race, text, coordinator };
  }

  const wipe = async (w) => { assert.equal(await w.store.reset(), true); };
  const BLOCKING = {
    'a reset to a fresh, unbound household': wipe,
    'a reset followed by a bind to another account': async (w) => { await wipe(w); await bindTo(w, ACCOUNT_B); },
    'a switch to another account': async (w) => { await bindTo(w, ACCOUNT_B); },
    'a store with no household (mid-reset, not hydrated)': async (_w, race) => { race.hide = true; },
  };
  const FRESH = new Set(['a reset to a fresh, unbound household', 'a reset followed by a bind to another account']);
  const counts = (w) => [w.state().sourceArtifacts.length, w.state().interpretations.length, w.state().tasks.length];

  for (const [name, hook] of Object.entries(BLOCKING)) {
    test(`SUBMIT: ${name} before the source is saved writes nothing, says not-saved and keeps no words`, async () => {
      const { w, race, text, coordinator } = await raced();
      race.hook = hook;
      assert.deepEqual(await coordinator.submit({ text: WORDS, submissionKey: 'k1' }), { kind: 'not-saved' });
      assert.deepEqual(counts(w), [0, 0, 0], 'nothing of it is in the household that was written to');
      assert.deepEqual(text.refs(), [], 'her words are forgotten');
      assert.equal(w.everythingStored().includes('Water the plants'), false);
    });

    test(`ACCEPT: ${name} between the tap and the write writes no record and does not say "saved"`, async () => {
      const { w, race, coordinator } = await raced();
      const out = await coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      assert.equal(out.kind, 'captured');
      race.hook = hook;
      const outcome = await coordinator.accept(out.readingIds[0]);
      assert.equal(outcome.kind, 'not-saved');
      assert.equal(w.state().tasks.length, 0, 'no record was made');
      if (!FRESH.has(name)) assert.equal(w.state().interpretations.find((r) => r.id === out.readingIds[0]).state, 'pending', 'the old reading was left as it was');
    });

    test(`REJECT: ${name} between the tap and the write rejects nothing and does not say it was done`, async () => {
      const { w, race, coordinator } = await raced();
      const out = await coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      race.hook = hook;
      assert.equal((await coordinator.reject(out.readingIds[0])).kind, 'not-saved');
      if (!FRESH.has(name)) assert.equal(w.state().interpretations.filter((r) => r.state !== 'pending').length, 0, 'nothing was rejected');
      else assert.equal(w.state().interpretations.length, 0);
    });

    test(`BULK: ${name} part-way through saves nothing further, and every reading it did not save is reported as failed`, async () => {
      const { w, race, coordinator } = await raced();
      const out = await coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      assert.equal(out.readingIds.length, 2);
      race.hook = hook;
      assert.deepEqual(await coordinator.acceptReady(out.captureId), { saved: [], needsReview: [], failed: out.readingIds });
      assert.equal(w.state().tasks.length, 0);
    });
  }

  test('SUBMIT on an UNBOUND household that is reset before the write: the words are not written into the replacement household', async () => {
    const { w, race, text, coordinator } = await raced({ bound: null });
    race.hook = wipe;
    assert.deepEqual(await coordinator.submit({ text: WORDS, submissionKey: 'k1' }), { kind: 'not-saved' });
    assert.deepEqual(counts(w), [0, 0, 0]);
    assert.deepEqual(text.refs(), []);
  });

  test('SUBMIT: a reset while the Premium reader is out (no rebind at all) drops its answer and its words', async () => {
    const gate = deferred();
    const w = await startWorld({ kids: [], enhance: reader(answer, gate) });
    await bindTo(w, ACCOUNT_A);
    const submitting = w.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
    await tick();
    assert.equal(w.state().sourceArtifacts.length, 1);
    await wipe(w);
    gate.resolve();
    assert.deepEqual(await submitting, { kind: 'not-saved' });
    assert.deepEqual(counts(w), [0, 0, 0]);
    assert.deepEqual(w.text.refs(), []);
  });

  // The negative controls: the same flows, with the household changing in the two ways that are NOT a change of owner.
  const CONTINUES = {
    'first-account claim (unbound -> bound, same household)': { bound: null, hook: (w) => bindTo(w, ACCOUNT_A) },
    'sign-out (bound -> unbound, same household)': { bound: ACCOUNT_A, hook: async (w) => { w.store.setIdentity(UNBOUND_IDENTITY); await w.store.saveIdentity(); } },
    'nothing at all (CONTROL)': { bound: ACCOUNT_A, hook: async () => {} },
  };
  for (const [name, { bound, hook }] of Object.entries(CONTINUES)) {
    test(`NEGATIVE CONTROL - ${name} between the tap and the write: submit, accept, bulk and reject still work`, async () => {
      const a = await raced({ bound });
      a.race.hook = hook;
      const out = await a.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      assert.equal(out.kind, 'captured', 'the source was saved');
      assert.equal(out.readingIds.length, 2);

      const b = await raced({ bound });
      const outB = await b.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      b.race.hook = hook;
      assert.equal((await b.coordinator.accept(outB.readingIds[0])).kind, 'accepted');
      assert.equal(b.w.state().tasks.length, 1);

      const c = await raced({ bound });
      const outC = await c.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      c.race.hook = hook;
      const bulk = await c.coordinator.acceptReady(outC.captureId);
      assert.equal(bulk.saved.length, 2);
      assert.deepEqual(bulk.failed, []);

      const d = await raced({ bound });
      const outD = await d.coordinator.submit({ text: WORDS, submissionKey: 'k1' });
      d.race.hook = hook;
      assert.equal((await d.coordinator.reject(outD.readingIds[0])).kind, 'rejected');
    });
  }
});

describe('the fence itself: epochChanged', () => {
  const snap = (binding, household) => ({ identity: { binding }, state: household === null ? null : { household } });
  const h1 = { id: 'household-1' };
  const h2 = { id: 'household-1' }; // a reset household has the SAME id
  const A = { accountId: 'a', householdId: 'ha', boundAt: 't' };
  const B = { accountId: 'b', householdId: 'hb', boundAt: 't' };

  test('another bound household, a replaced household object (same id), and a missing household are all changes', () => {
    const start = epochOf(snap(A, h1));
    assert.equal(epochChanged(start, snap(B, h1)), true, 'another account');
    assert.equal(epochChanged(start, snap(null, h2)), true, 'a reset: same id, new object, unbound');
    assert.equal(epochChanged(start, snap(A, h2)), true, 'a replaced household');
    assert.equal(epochChanged(start, snap(A, null)), true, 'no household');
    assert.equal(epochChanged(epochOf(snap(null, h1)), snap(null, h2)), true, 'an unbound household that was reset');
  });

  test('the same household is not a change, including being claimed and signing out', () => {
    assert.equal(epochChanged(epochOf(snap(A, h1)), snap(A, h1)), false);
    assert.equal(epochChanged(epochOf(snap(null, h1)), snap(A, h1)), false, 'first claim');
    assert.equal(epochChanged(epochOf(snap(A, h1)), snap(null, h1)), false, 'sign-out');
  });
});

// -------------------------------------------------------------------------------- the words

describe('the new copy', () => {
  test('it is in the audited corpus, and it is plain, calm and exact about what happened', () => {
    const corpus = copyCorpus();
    for (const line of [copy.bulk.saveReady(3), copy.bulk.saveReadyHint, copy.review.openRecord('task'), copy.bulk.result(3, 0), copy.bulk.result(2, 2), copy.bulk.result(0, 0)]) assert.ok(corpus.includes(line), line);
    assert.equal(copy.bulk.saveReady(3), 'Save the 3 that need no checking');
    assert.equal(copy.bulk.result(1, 0), 'Saved 1 item.');
    assert.equal(copy.bulk.result(3, 0), 'Saved 3 items.');
    assert.equal(copy.bulk.result(0, 1), '1 couldn’t be saved, so nothing was changed for it. You can try it again.');
  });
});
