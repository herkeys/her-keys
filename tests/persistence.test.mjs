import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AppStateSchema } from '../src/domain/state.ts';
import { STORAGE_KEYS } from '../src/persistence/appStateRepository.ts';
import { CURRENT_SCHEMA_VERSION, decodeStoredState, encodeStoredState, migrateStoredState } from '../src/persistence/envelope.ts';
import { MAX_WRITE_SEQUENCE } from '../src/persistence/writeQueue.ts';
import { demoState, harness, onboardedState, rawEnvelope, stored } from './support/fixtures.mjs';

const reasonOf = (raw) => {
  const decoded = decodeStoredState(raw);
  return decoded.kind === 'invalid' ? decoded.reason : decoded.kind;
};

describe('Storage envelope', () => {
  test('state round-trips through the versioned envelope unchanged', () => {
    const state = onboardedState();
    const raw = stored(state, 7);
    const envelope = JSON.parse(raw);

    assert.deepEqual(Object.keys(envelope), ['schemaVersion', 'appVersion', 'savedAt', 'writeSeq', 'data']);
    assert.equal(envelope.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(decodeStoredState(raw), { kind: 'valid', state, writeSeq: 7, migratedFrom: null });
  });

  test('the encoder refuses to store a state it would not accept back', () => {
    const broken = { ...demoState(), tasks: [{ nope: true }] };
    assert.throws(() => encodeStoredState(broken, { appVersion: '1', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: 1 }), /Refusing to store invalid state/);
  });

  test('hostile stored text is classified rather than trusted', () => {
    const state = demoState();
    const cases = [
      ['{"schemaVersion":1,"data":', 'malformed_json'],
      ['', 'malformed_json'],
      ['[]', 'not_an_object'],
      ['null', 'not_an_object'],
      ['42', 'not_an_object'],
      [JSON.stringify({ data: state }), 'missing_schema_version'],
      [JSON.stringify({ schemaVersion: '1', data: state }), 'invalid_schema_version'],
      [JSON.stringify({ schemaVersion: 1.5, data: state }), 'invalid_schema_version'],
      [rawEnvelope(state, 0), 'unsupported_schema_version'],
      [rawEnvelope(state, -3), 'unsupported_schema_version'],
      [JSON.stringify({ schemaVersion: 1, data: state }), 'invalid_envelope'],
      [JSON.stringify({ schemaVersion: 1, appVersion: 'x', savedAt: 'yesterday', writeSeq: 1, data: state }), 'invalid_envelope'],
      [JSON.stringify({ schemaVersion: 1, appVersion: 'x', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: 1 }), 'invalid_envelope'],
      [JSON.stringify({ schemaVersion: 1, appVersion: 'x', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: MAX_WRITE_SEQUENCE + 1, data: state }), 'invalid_envelope'],
      [rawEnvelope({ ...state, children: undefined }), 'invalid_state'],
      [rawEnvelope({ household: state.household }), 'invalid_state'],
      [rawEnvelope({ ...state, tasks: [...state.tasks, state.tasks[0]] }), 'integrity_violation'],
    ];
    for (const [raw, reason] of cases) assert.equal(reasonOf(raw), reason, raw.slice(0, 60));
  });

  test('state from a newer schema version is recognized, not parsed with older rules', () => {
    assert.deepEqual(decodeStoredState(rawEnvelope({ entirelyNewShape: true }, CURRENT_SCHEMA_VERSION + 1)), {
      kind: 'future_version',
      storedVersion: CURRENT_SCHEMA_VERSION + 1,
    });
  });
});

describe('Migration seam', () => {
  const isV1 = (data) => AppStateSchema.safeParse(data).success;
  const planTo2 = (step) => ({
    currentVersion: 2,
    migrations: new Map(step ? [[1, step]] : []),
    validators: new Map([
      [1, isV1],
      [2, ({ upgraded, ...rest }) => upgraded === true && isV1(rest)],
    ]),
  });

  test('the current schema passes through untouched', () => {
    const state = demoState();
    assert.deepEqual(migrateStoredState(CURRENT_SCHEMA_VERSION, state), { ok: true, data: state });
  });

  test('v1 data is carried all the way forward with conservative, honest backfills', () => {
    const v1Event = { id: 'evt-1', title: 'Team status call', categoryId: 'cat-work', subjectMemberId: 'user-1', startsAt: '2026-09-16T13:00:00.000Z', endsAt: '2026-09-16T13:30:00.000Z', location: null, scope: 'professional' };
    const v1Task = { id: 'task-1', title: 'Pay orthodontist invoice', categoryId: 'cat-money', subjectMemberId: null, durationMinutes: 10, commitment: 'flexible', dueDate: null, plan: { kind: 'unplanned' }, scope: 'household' };
    const v1OneMove = { id: 'onemove-2026-09-16', forDate: '2026-09-16', targetId: 'one-move-1', status: 'selected', decidedAt: '2026-09-16T13:00:00.000Z', completedAt: null, scope: 'personal' };
    const v1State = { ...demoState(), events: [v1Event], tasks: [v1Task], oneMoves: [v1OneMove] };
    // v1 had neither of these. Building the fixture from a current demo state
    // means stripping the fields later versions added, or the frozen v1
    // validator correctly refuses it.
    delete v1State.needsMe;
    delete v1State.migrationEvidence;

    const migrated = migrateStoredState(1, v1State);
    assert.equal(migrated.ok, true);
    // A pre-existing event's commitment is never assumed movable, whatever it actually was.
    assert.equal(migrated.data.events[0].commitment, 'fixed');
    assert.equal(migrated.data.events[0].status, 'active');
    assert.equal(migrated.data.events[0].source, 'demo');
    assert.equal(migrated.data.events[0].createdAt, null);
    assert.equal(migrated.data.tasks[0].status, 'open');
    assert.equal(migrated.data.tasks[0].createdAt, null);
    // demoState() is a DEMO household, where a catalog target is exactly what it
    // says it is, so v2 -> v3 leaves it alone.
    assert.equal(migrated.data.oneMoves[0].targetType, 'catalog');
    assert.deepEqual(migrated.data.migrationEvidence, []);
    assert.deepEqual(migrated.data.needsMe, []);
    assert.equal(AppStateSchema.safeParse(migrated.data).success, true);
  });

  test('older data is carried forward one validated step at a time', () => {
    const result = migrateStoredState(1, demoState(), planTo2((data) => ({ ...data, upgraded: true })));
    assert.equal(result.ok, true);
    assert.equal(result.data.upgraded, true);
  });

  test('a missing, throwing or invalid migration fails instead of guessing', () => {
    assert.deepEqual(migrateStoredState(1, demoState(), planTo2(null)), { ok: false, reason: 'migration_failed' });
    assert.deepEqual(migrateStoredState(1, demoState(), planTo2(() => { throw new Error('boom'); })), { ok: false, reason: 'migration_failed' });
    assert.deepEqual(migrateStoredState(1, demoState(), planTo2(() => ({ upgraded: true }))), { ok: false, reason: 'migration_failed' });
    assert.deepEqual(migrateStoredState(1, { notV1: true }, planTo2((data) => ({ ...data, upgraded: true }))), { ok: false, reason: 'migration_failed' });
    assert.deepEqual(migrateStoredState(3, demoState(), planTo2(null)), { ok: false, reason: 'unsupported_schema_version' });
    assert.deepEqual(migrateStoredState(CURRENT_SCHEMA_VERSION + 1, demoState()), { ok: false, reason: 'unsupported_schema_version' });
  });
});

describe('Repository', () => {
  test('loads nothing, then exactly what was saved', async () => {
    const h = harness();
    assert.deepEqual(await h.repository.loadAppState(), { kind: 'empty' });

    await h.repository.saveAppState(onboardedState(), 3);
    const loaded = await h.repository.loadAppState();
    assert.equal(loaded.kind, 'loaded');
    assert.equal(loaded.writeSeq, 3);
    assert.deepEqual(loaded.state, onboardedState());
  });

  test('unreadable state is kept aside for inspection in development, and not otherwise', async () => {
    const broken = '{"schemaVersion":1,"data":';

    const internal = harness({ initial: { [STORAGE_KEYS.primary]: broken } });
    const outcome = await internal.repository.loadAppState();
    assert.deepEqual(outcome, { kind: 'invalid', reason: 'malformed_json', issues: [], quarantined: true });
    const kept = JSON.parse(internal.storage.contents()[STORAGE_KEYS.corrupt]);
    assert.equal(kept.reason, 'malformed_json');
    assert.equal(kept.raw, broken);

    const production = harness({ initial: { [STORAGE_KEYS.primary]: broken }, quarantine: false });
    assert.equal((await production.repository.loadAppState()).quarantined, false);
    assert.equal(production.storage.contents()[STORAGE_KEYS.corrupt], undefined);
  });

  test('newer-version state is preserved and never replaced by an older copy', async () => {
    const newer = rawEnvelope({ v: 100 }, 100);
    const h = harness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ v: 99 }, 99), [STORAGE_KEYS.future]: newer } });

    assert.deepEqual(await h.repository.loadAppState(), { kind: 'future_version', storedVersion: 99, preserved: true });
    assert.equal(h.storage.contents()[STORAGE_KEYS.future], newer);
    assert.equal(h.storage.contents()[STORAGE_KEYS.primary], rawEnvelope({ v: 99 }, 99));
  });

  test('a storage read failure is reported without discarding anything', async () => {
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(demoState()) }, storageOptions: { failReads: true } });
    assert.deepEqual(await h.repository.loadAppState(), { kind: 'read_failed' });
    assert.equal(h.storage.writeLog.length, 0);
  });

  test('reset clears household state and its diagnostic copy but keeps newer-version data', async () => {
    const future = rawEnvelope({}, 9);
    const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(demoState()), [STORAGE_KEYS.corrupt]: '{}', [STORAGE_KEYS.future]: future } });
    await h.repository.resetAppState();
    assert.deepEqual(h.storage.contents(), { [STORAGE_KEYS.future]: future });
  });

  test('a diagnostic-cleanup failure cannot delete the canonical household', async () => {
    const primary = stored(onboardedState());
    const h = harness({ initial: { [STORAGE_KEYS.primary]: primary, [STORAGE_KEYS.corrupt]: '{}' } });
    const remove = h.storage.remove.bind(h.storage);
    h.storage.remove = async (key) => {
      if (key === STORAGE_KEYS.corrupt) throw new Error('simulated diagnostic cleanup failure');
      await remove(key);
    };

    await assert.rejects(h.repository.resetAppState(), /diagnostic cleanup failure/);
    assert.equal(h.storage.contents()[STORAGE_KEYS.primary], primary);
  });
});
