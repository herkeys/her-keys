/**
 * Feature 04 scenarios about what survives, and what must never leak: Z · AA · AC (through a real store).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isSyncable } from '../../src/domain/foundation/provenance.ts';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/envelope.ts';
import { draftFromState, newDraft } from '../../src/features/systems/commands/draft.ts';
import { projectSystemsHub } from '../../src/features/systems/model/hub.ts';
import { evidenceOfHub } from '../../src/features/systems/model/evidence.ts';
import { saveSystemDraft } from '../../src/features/systems/useCases/commit.ts';
import { STORAGE_KEYS, rawEnvelope } from '../support/fixtures.mjs';
import { MORNING, assertEvidence } from './support/canon.mjs';
import { homeCategoryId, keyFor, stateOf, systemsHarness } from './support/store.mjs';

/** What the hub is handed for a live store: exactly the snapshot slice, plus the clock. */
const hubOf = (store) => {
  const { status, state, today, recovery, persistence } = store.getSnapshot();
  return projectSystemsHub({ status, state, today, recovery, persistence, nowMs: MORNING });
};

async function createIn(store, id, name) {
  const { draft, base } = newDraft(stateOf(store), id, homeCategoryId(stateOf(store)));
  draft.name = name;
  draft.steps = [{ key: keyFor(0), id: null, title: 'Step one', effortMinutes: null }];
  return saveSystemDraft(store, draft, base);
}

describe('SCENARIO Z — restart during an unsaved edit', () => {
  test('the saved System is exactly as it was; no partial row exists; no draft was ever written', async () => {
    const sh = systemsHarness();
    const store = await sh.open();
    assert.equal((await createIn(store, 'sys-z', 'School-night reset')).kind, 'saved');
    await store.flush();
    const saved = { systems: stateOf(store).systems, steps: stateOf(store).systemSteps };
    const keysBefore = Object.keys(sh.storage.contents()).sort();

    // an editor is opened and typed into, then the app is killed: the draft only ever existed in memory
    const { draft } = draftFromState(stateOf(store), 'sys-z', keyFor);
    draft.name = 'UNSAVED-TITLE-XYZ';
    draft.steps.push({ key: 'n1', id: null, title: 'UNSAVED-STEP-XYZ', effortMinutes: 9 });
    await store.flush();

    const restarted = await sh.open();
    assert.deepEqual(stateOf(restarted).systems, saved.systems, 'the saved System is unchanged');
    assert.deepEqual(stateOf(restarted).systemSteps, saved.steps, 'and so are its steps: no half-applied edit');
    const everything = JSON.stringify(sh.storage.contents());
    assert.equal(everything.includes('UNSAVED-TITLE-XYZ') || everything.includes('UNSAVED-STEP-XYZ'), false, 'no unsaved text reached storage');
    assert.deepEqual(Object.keys(sh.storage.contents()).sort(), keysBefore, 'and no draft slot was added: draft persistence does not exist, and was not silently invented');
    assertEvidence('Z-restart-unsaved', { scenario: 'Z', savedSystemAfterRestart: stateOf(restarted).systems[0].name, draftPersisted: false, storageKeys: keysBefore.length });
  });
});

describe('SCENARIO AA — demo Systems stay demo-local', () => {
  test('demo → real: a System made in the demo never appears in the real household', async () => {
    const sh = systemsHarness({ mode: 'demo' });
    const demo = await sh.open('demo');
    assert.equal((await createIn(demo, 'sys-demo', 'Demo only')).kind, 'saved');
    const made = stateOf(demo).systems.find((s) => s.id === 'sys-demo');
    assert.equal(made.provenance.producer, 'demo-seed', 'everything in a demo household is rehearsal, whoever typed it');
    assert.equal(isSyncable(made.provenance.producer), false, 'so it can never reach the cloud');
    await demo.flush();

    const real = await sh.open('empty'); // a real-user build opening the same device storage
    const snapshot = real.getSnapshot();
    assert.equal(snapshot.recovery.reason, 'mode_mismatch');
    assert.equal(snapshot.state.origin, 'empty');
    assert.equal(snapshot.state.systems.length, 0, 'not one demo System was adopted');
    assert.equal(snapshot.state.systems.some((s) => s.provenance.producer === 'demo-seed'), false);
  });

  test('real → demo → real: a real household is preserved, invisible to the demo session, and untouched by it', async () => {
    const sh = systemsHarness({ mode: 'empty' });
    const real = await sh.open('empty');
    assert.equal((await createIn(real, 'sys-real', 'Real routine')).kind, 'saved');
    await real.flush();
    const rawBefore = sh.storage.contents()[STORAGE_KEYS.primary];

    const demo = await sh.open('demo');
    const snap = demo.getSnapshot();
    assert.equal(snap.recovery.reason, 'mode_mismatch');
    assert.equal(snap.persistence, 'disabled', 'a demo session must never replace real data');
    const hub = hubOf(demo);
    assert.deepEqual(hub.availability, { kind: 'unavailable', reason: 'memory_only' });
    assert.deepEqual(hub.items, [], 'the real household is not shown here, and the demo stand-in is not shown as hers either');
    assert.equal(hub.canCreate, false);
    assert.deepEqual(await createIn(demo, 'sys-leak', 'Should not save'), { kind: 'not_saved' }, 'a save attempt is refused, not pretended');
    assert.equal(sh.storage.contents()[STORAGE_KEYS.primary], rawBefore, 'the real household on disk was not touched');

    const back = stateOf(await sh.open('empty'));
    assert.deepEqual(back.systems.map((s) => s.name), ['Real routine']);
    assert.equal(back.systems.some((s) => s.provenance.producer === 'demo-seed'), false, 'no demo System leaked into the real namespace');
    assertEvidence('AA-demo-isolation', { scenario: 'AA', demoSessionOverRealData: evidenceOfHub(hub), realAfterDemoSession: back.systems.map((s) => s.name) });
  });
});

describe('SCENARIO AC (store) — recovery and quarantine are respected', () => {
  test('newer-version data: memory-only session, Systems not shown, no save', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ anything: true }, CURRENT_SCHEMA_VERSION + 1) } });
    const store = await sh.open('empty');
    assert.equal(store.getSnapshot().recovery.reason, 'future_version');
    const hub = hubOf(store);
    assert.deepEqual(hub.availability, { kind: 'unavailable', reason: 'newer_version' });
    assert.deepEqual([hub.items, hub.canCreate, hub.isEmpty], [[], false, false]);
    assert.deepEqual(await createIn(store, 'sys-x', 'Nope'), { kind: 'not_saved' });
  });

  test('unreadable storage: unavailable, not "you have no Systems"', async () => {
    const sh = systemsHarness({ storageOptions: { failReads: true } });
    const store = await sh.open('empty');
    assert.equal(store.getSnapshot().recovery.reason, 'read_failed');
    const hub = hubOf(store);
    assert.deepEqual(hub.availability, { kind: 'unavailable', reason: 'unreadable' });
    assert.equal(hub.isEmpty, false);
  });

  test('corrupted stored state that was set aside: the fresh state is authoritative, with a calm notice', async () => {
    const sh = systemsHarness({ initial: { [STORAGE_KEYS.primary]: '{ this is not json' } });
    const store = await sh.open('empty');
    assert.notEqual(store.getSnapshot().recovery, null);
    const hub = hubOf(store);
    assert.deepEqual(hub.availability, { kind: 'ready', notice: 'started_over' });
    assert.equal(hub.canCreate, true);
    assert.equal((await createIn(store, 'sys-fresh', 'A fresh start')).kind, 'saved');
  });
});
