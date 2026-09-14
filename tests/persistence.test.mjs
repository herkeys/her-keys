import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AppStateSchema } from '../src/domain/state.ts';
import { STORAGE_KEYS } from '../src/persistence/appStateRepository.ts';
import { CURRENT_SCHEMA_VERSION, decodeStoredState, encodeStoredState, migrateStoredState } from '../src/persistence/envelope.ts';
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

  test('schema v1 is current, so v1 data passes through untouched', () => {
    const state = demoState();
    assert.deepEqual(migrateStoredState(1, state), { ok: true, data: state });
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
    const newer = rawEnvelope({ v: 3 }, 3);
    const h = harness({ initial: { [STORAGE_KEYS.primary]: rawEnvelope({ v: 2 }, 2), [STORAGE_KEYS.future]: newer } });

    assert.deepEqual(await h.repository.loadAppState(), { kind: 'future_version', storedVersion: 2, preserved: true });
    assert.equal(h.storage.contents()[STORAGE_KEYS.future], newer);
    assert.equal(h.storage.contents()[STORAGE_KEYS.primary], rawEnvelope({ v: 2 }, 2));
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
});
