/**
 * HK-IR01-F02 - FEATURE 02 (TALK IT OUT + LIFE INBOX) ON THE REPAIRED FOUNDATION.
 *
 * Two questions, answered through `composeAccountApp` (the composition the production root calls) with the real household store,
 * the real capture coordinator and the real local reader on top of it:
 *
 *   B. Does everything Feature 02 writes reach the account's cloud as canonical state - by the central observer alone, with no
 *      feature involved - and does a capture that has not produced anything durable fabricate nothing?
 *   C. Does the woman's raw wording ever become a cloud payload, a persisted envelope, an outbound queue item or a claim?
 *
 * A canary is a distinctive utterance whose words are looked for EVERYWHERE they could go. Every scan is paired with a positive
 * control (a legitimately structured field IS found where it should be), so an empty result cannot mean the scan saw nothing.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { describeLocalHousehold } from '../src/domain/account/claim.ts';
import { UNDECIDED_READING_TITLE } from '../src/domain/foundation/interpretation.ts';
import { FOUNDATION_SPECS, columnsOfSpec } from '../src/domain/sync/foundationSpecs.ts';
import { applyDiscoveryConversation } from '../src/domain/discovery.ts';
import { validateAppState } from '../src/domain/state.ts';
import { copy } from '../src/features/talk-it-out/capture/copy.ts';
import { routeMessage } from '../src/features/talk-it-out/capture/routing.ts';
import { buildCaptureVM, buildInboxItems } from '../src/features/talk-it-out/capture/viewModel.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import {
  ACCOUNT_A,
  NOW,
  accountCloudFor,
  createFakeCloud,
  leaksOf,
  localInterpreter,
  makeCaptureDevice,
  payloadSurfaces,
  tapCloud,
} from './support/captureAccountWorld.mjs';

const ROOT = join(import.meta.dirname, '..');

// The shape of the key TalkItOutContext.tsx makes: a time and a counter, never her words.
const keyOf = (n) => `s${NOW.toString(36)}-${n}`;

const CANARY = 'CANARY-ZEBRA-7731';
const CHATTER = 'Brenda from next door was rude at the mailbox again';
const UTTERANCE = `${CANARY} keeps going around my head and ${CHATTER}. I need to renew the library card by Friday for 45 minutes.`;
const TITLE = 'Renew the library card';

async function boundWorld() {
  const cloud = createFakeCloud();
  const tap = tapCloud(cloud);
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const device = await makeCaptureDevice({ cloud, tap, accountCloud });
  const state = await device.signIn();
  assert.equal(state.kind, 'accountBound');
  return { cloud, tap, accountCloud, device };
}

const surfacesOf = (world, devices = [world.device]) => payloadSurfaces({ cloud: world.cloud, tap: world.tap, accountCloud: world.accountCloud, devices });
const areaId = (device, role) => device.state().categories.find((c) => c.systemRole === role && c.status === 'active').id;
const cloudCount = (world, table) => world.cloud.table(table).length;

// ------------------------------------------------------------------ B: wiring ---

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};

/** Every file that is part of Feature 02: its own folder, the conversation context it extends, and the routes that render it. */
const F02_FILES = [
  ...walk(join(ROOT, 'src', 'features', 'talk-it-out')),
  ...['src/store/TalkItOutContext.tsx', 'app/talk-it-out.tsx', 'app/onboarding/talk-it-out.tsx', 'app/(app)/ai.tsx', 'app/(app)/life/inbox.tsx'].map((p) => join(ROOT, ...p.split('/'))).filter((p) => existsSync(p)),
];

// The static checks are pure functions of a source string, so the same functions that scan the real files can be shown to fail
// on a synthetic offender (the last test of this block).
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Import specifiers a Feature 02 file must not have: a sync mechanism, the platform, persistence, the account layer. */
const forbiddenImports = (source) =>
  [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((spec) => {
      const sync = /\/sync\//.test(spec) && !/\/sync\/syncTypes$/.test(spec); // `syncTypes` is vocabulary
      const platform = /\/platform\//.test(spec) || /supabase/i.test(spec);
      const persistence = /\/persistence\//.test(spec);
      const account = /\/domain\/account\//.test(spec) || /composeAccountApp|accountRuntimeInstance|AccountProvider/.test(spec);
      return sync || platform || persistence || account;
    });

const MECHANISM_NAMES = /\b(?:enqueue|topUpQueue|queueIntents|changedRows|createSyncCoordinator|createSyncRuntime|composeAccountApp|createChangeObserver|setIdentity|saveIdentity|currentIdentity|SyncNamespace|namespaceFrom\w+)\b/;
const storeMethodsUsed = (source) => [...source.matchAll(/\bstore\.([A-Za-z]+)/g)].map((match) => match[1]);
const OUTBOUND_APIS = /\bconsole\.|\bfetch\(|XMLHttpRequest|AsyncStorage|SecureStore|localStorage|\bSentry\b|\banalytics\b/;
const OBSERVED_OR_READ = ['commit', 'dispatch', 'getSnapshot', 'subscribe'];

describe('B — Feature 02 writes canonical state through the store and knows nothing about synchronization', () => {
  test('the scan covers the whole feature (a guard against scanning nothing)', () => {
    const rel = F02_FILES.map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    for (const expected of ['src/features/talk-it-out/capture/coordinator.ts', 'src/features/talk-it-out/capture/CaptureContext.tsx', 'src/features/talk-it-out/capture/textStore.ts', 'src/store/TalkItOutContext.tsx']) {
      assert.ok(rel.includes(expected), `${expected} is part of the scan`);
    }
    assert.ok(F02_FILES.length >= 20, `${F02_FILES.length} files`);
  });

  test('no Feature 02 file imports a sync mechanism, the platform, persistence or the account layer; only the sync VOCABULARY is allowed', () => {
    const offenders = F02_FILES.flatMap((file) => forbiddenImports(readFileSync(file, 'utf8')).map((spec) => `${relative(ROOT, file)} imports ${spec}`));
    // Build 2 (Gemini) legitimately gave the Talk It Out CONTEXT the server-backed AI client, taken from the composition root. That is
    // the one exception, and it is exact: the context may import `herKeysAiClient` from it and nothing else (no sync, no identity,
    // no store write), and no other Feature 02 file may import the composition root at all.
    const context = join(ROOT, 'src', 'store', 'TalkItOutContext.tsx');
    const contextSource = stripComments(readFileSync(context, 'utf8'));
    const fromComposition = [...contextSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/accountRuntimeInstance'/g)].flatMap((m) => m[1].split(',').map((name) => name.trim()).filter(Boolean));
    assert.deepEqual(fromComposition, ['herKeysAiClient'], 'the context takes only the AI client from the composition root');
    const allowedException = `${relative(ROOT, context)} imports ./accountRuntimeInstance`;
    assert.deepEqual(offenders.filter((offender) => offender !== allowedException), []);
  });

  test('no Feature 02 file names a queue, a namespace, a coordinator, an identity write or the composition', () => {
    const offenders = F02_FILES.filter((file) => MECHANISM_NAMES.test(stripComments(readFileSync(file, 'utf8')))).map((file) => relative(ROOT, file));
    assert.deepEqual(offenders, []);
  });

  test('the only things Feature 02 does to the store are commit and dispatch (writes, both observed) and getSnapshot / subscribe (reads)', () => {
    const used = new Set(F02_FILES.flatMap((file) => storeMethodsUsed(stripComments(readFileSync(file, 'utf8')))));
    assert.deepEqual([...used].filter((name) => !OBSERVED_OR_READ.includes(name)), []);
    const coordinator = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'coordinator.ts'), 'utf8');
    assert.ok(/store\.commit\(/.test(coordinator), 'the coordinator writes through commit');
    assert.equal(/store\.dispatch\(/.test(coordinator), false, 'and never through anything that is not durable-before-show');
  });

  test('nothing in Feature 02 logs, fetches or stores on its own (her words have no other road out)', () => {
    const offenders = F02_FILES.filter((file) => OUTBOUND_APIS.test(stripComments(readFileSync(file, 'utf8')))).map((file) => relative(ROOT, file));
    assert.deepEqual(offenders, []);
  });

  test('the static checks can fail: each one flags a synthetic offender and passes the allowed vocabulary', () => {
    assert.deepEqual(forbiddenImports("import { enqueue } from '../../../domain/sync/queue';"), ['../../../domain/sync/queue']);
    assert.deepEqual(forbiddenImports("import { createSyncCoordinator } from '../../domain/sync/coordinator';"), ['../../domain/sync/coordinator']);
    assert.equal(forbiddenImports("import { createSupabaseSyncTransport } from '../../platform/supabaseSyncTransport';").length, 1);
    assert.equal(forbiddenImports("import { repo } from '../../persistence/appStateRepository';").length, 1);
    assert.equal(forbiddenImports("import { decideBinding } from '../../domain/account/claim';").length, 1);
    assert.deepEqual(forbiddenImports("import { needsSyncAttention } from '../../domain/sync/syncTypes';"), [], 'the vocabulary module is allowed');
    assert.ok(MECHANISM_NAMES.test('store.setIdentity(next);') && MECHANISM_NAMES.test('enqueue(namespace, item)'));
    assert.deepEqual(storeMethodsUsed('await store.commit(a); store.saveIdentity(); store.getSnapshot();'), ['commit', 'saveIdentity', 'getSnapshot']);
    assert.ok(OUTBOUND_APIS.test('console.info(words)') && OUTBOUND_APIS.test('await fetch(url)') && OUTBOUND_APIS.test('AsyncStorage.setItem(k, v)'));
    assert.equal(OUTBOUND_APIS.test(stripComments('// console.log is not called here\nconst a = 1;')), false, 'a comment is not a call');
  });

  test('the production root gives Feature 02 the SAME store the change observer is wired into', () => {
    const layout = readFileSync(join(ROOT, 'app', '_layout.tsx'), 'utf8');
    assert.match(layout, /<AppStateProvider store=\{appStore\}>/, 'the root provides the app store');
    assert.match(layout, /import \{ appStore, internalTools \} from '..\/src\/store\/appStoreInstance'/);
    const instance = readFileSync(join(ROOT, 'src', 'store', 'appStoreInstance.ts'), 'utf8');
    assert.match(instance, /observe:\s*changeObserver\.observe/, 'and that store is created with the observer');
    const context = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'CaptureContext.tsx'), 'utf8');
    assert.match(context, /const store = useAppStore\(\);/);
    assert.match(context, /createCaptureCoordinator\(\{ store,/, 'the capture coordinator is built on that provided store');
  });

  test('the submission key is a time and a counter: nothing she said can become a contentRef', () => {
    const source = readFileSync(join(ROOT, 'src', 'store', 'TalkItOutContext.tsx'), 'utf8');
    const line = source.split('\n').find((l) => l.includes('const submissionKey ='));
    assert.ok(line, 'found where the key is made');
    assert.equal(/text|words|trim|message/i.test(line), false, `the key is not derived from her words: ${line.trim()}`);
  });
});

// ---------------------------------------------------------- B: a bound account ---

describe('B — a capture session on a bound account reaches the cloud as metadata and structured readings, and fabricates nothing', () => {
  test('capture -> durable intent in the SAME write as the change -> cloud: the source artifact, the reading, and NO task', async () => {
    const world = await boundWorld();
    const { device, tap, cloud } = world;
    const requestsBefore = tap.requests();

    const out = await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    assert.equal(out.kind, 'captured');
    assert.equal(out.readingIds.length, 1, 'the reader took the errand and left the chatter');

    // The intent is durable together with the change, before any network work is attempted.
    const durable = device.persisted();
    const artifact = durable.state.sourceArtifacts[0];
    const reading = durable.state.interpretations[0];
    assert.deepEqual(device.queue().map((item) => [item.kind, item.localId, item.op]), [['sourceArtifact', artifact.id, 'create'], ['interpretation', reading.id, 'create']], 'exactly the two rows the capture made, artifact first');
    assert.equal(tap.requests(), requestsBefore, 'and nothing has been sent yet');
    assert.equal(cloudCount(world, 'tasks') + cloudCount(world, 'events') + cloudCount(world, 'needs_me_items'), 0);

    await device.settle();

    assert.equal(device.queue().length, 0, 'the queue drained');
    assert.equal(cloudCount(world, 'source_artifacts'), 1);
    assert.equal(cloudCount(world, 'interpretations'), 1);
    for (const table of ['tasks', 'events', 'needs_me_items']) assert.equal(cloudCount(world, table), 0, `capture-only state fabricated a row in ${table}`);
    assert.deepEqual([device.state().tasks.length, device.state().events.length, device.state().needsMe.length], [0, 0, 0], 'and none locally');

    // The source artifact row carries metadata, a digest slot and a reference - and no content column of any kind.
    const [row] = cloud.table('source_artifacts');
    const manifest = new Set(columnsOfSpec(FOUNDATION_SPECS.find((spec) => spec.kind === 'sourceArtifact')).map((c) => c.name));
    const extras = new Set(['_table', 'id', 'revision', 'created_at', 'origin_device_id']);
    assert.deepEqual(Object.keys(row).filter((k) => !manifest.has(k) && !extras.has(k)), [], 'no column outside the manifest');
    assert.deepEqual(
      { kind: row.kind, origin: row.origin, provider: row.provider, content_digest: row.content_digest, content_ref: row.content_ref, retracted_at: row.retracted_at, scope: row.scope },
      { kind: 'message', origin: 'user-submitted', provider: null, content_digest: null, content_ref: `capture:${keyOf(0)}`, retracted_at: null, scope: 'personal' },
    );
    for (const table of new Set([...cloud.rows.values()].map((r) => r._table))) {
      for (const r of cloud.table(table)) assert.deepEqual(Object.keys(r).filter((k) => /^(body|text|transcript|utterance|words|raw\w*|content|message)$/i.test(k)), [], `${table} has no column that could hold her words`);
    }

    // The reading is the structured, typed one: what Her Keys understood, and how sure it is, and where it came from.
    const [interp] = cloud.table('interpretations');
    assert.deepEqual(
      { state: interp.state, proposed_kind: interp.proposed_kind, title: interp.title, due_date: interp.due_date, duration_minutes: interp.duration_minutes, producer: interp.producer, confidence: interp.confidence, accepted_type: interp.accepted_type ?? null },
      // OD-A: the reading travels as structured state, but its title is copied from her words, so until she accepts it the cloud has a neutral label.
      { state: 'pending', proposed_kind: 'task', title: UNDECIDED_READING_TITLE.task, due_date: '2026-09-25', duration_minutes: 45, producer: 'ai-inference', confidence: 'possible', accepted_type: null },
    );
    assert.notEqual(interp.title, device.persisted().state.interpretations[0].title, 'the device that heard her keeps the derived title; the cloud does not have it');
    assert.equal(interp.artifact_id, row.id, 'the reading names the source row the cloud holds');
    assert.equal(interp.source_artifact_id, row.id, 'and so does its provenance');
  });

  test('accepting the reading creates exactly one task, through the same observer, and the cloud reading names it', async () => {
    const world = await boundWorld();
    const { device, cloud } = world;
    await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    await device.settle();
    const reading = device.state().interpretations[0];

    assert.deepEqual(await device.coordinator.accept(reading.id), { kind: 'needs-area' }, 'she classifies at acceptance; a refusal changes nothing');
    assert.equal(device.queue().length, 0, 'a refused accept queued nothing');
    assert.equal((await device.coordinator.accept(reading.id, { categoryId: areaId(device, 'home') })).kind, 'accepted');
    assert.deepEqual(device.queue().map((item) => item.kind).sort(), ['interpretation', 'observation', 'task'], 'the task, the reading that became it and the observation of her decision');
    await device.settle();

    assert.equal(cloudCount(world, 'tasks'), 1);
    const [task] = cloud.table('tasks');
    assert.deepEqual([task.title, task.duration_minutes, task.due_date], [TITLE, 45, '2026-09-25']);
    const [interp] = cloud.table('interpretations');
    assert.equal(interp.state, 'accepted');
    assert.equal(interp.accepted_type, 'task');
    assert.equal(interp.accepted_task_id, task.id, 'the reading points at the task row the cloud holds');
    assert.equal(device.queue().length, 0);
  });

  test('a reading that is still undecided, or clarifying, or dismissed never becomes a task, an event or a note in the cloud', async () => {
    const world = await boundWorld();
    const { device } = world;
    await device.coordinator.submit({ text: 'Practice at 5 tomorrow', submissionKey: keyOf(0) });
    await device.coordinator.submit({ text: 'Pay the water bill by Friday.', submissionKey: keyOf(1) });
    await device.coordinator.submit({ text: 'Dentist Friday at 3pm.', submissionKey: keyOf(2) });
    await device.settle();

    const localReading = (title) => device.state().interpretations.find((r) => r.title === title);
    const byTitle = (title) => world.cloud.table('interpretations').find((r) => r.local_id === localReading(title).id); // the cloud's titles are neutral (OD-A)
    assert.deepEqual([byTitle('Practice').state, byTitle('Practice').clarification], ['clarifying', 'which_child'], 'a durable open code, not a guess');
    assert.equal(byTitle('Pay the water bill').state, 'pending');
    for (const table of ['tasks', 'events', 'needs_me_items']) assert.equal(cloudCount(world, table), 0, `${table} while three readings wait on her`);

    for (const { id } of device.state().sourceArtifacts) await device.coordinator.dismissCapture(id);
    await device.settle();
    assert.deepEqual(world.cloud.table('interpretations').map((r) => r.state), ['rejected', 'rejected', 'rejected']);
    for (const table of ['tasks', 'events', 'needs_me_items']) assert.equal(cloudCount(world, table), 0, `${table} after she dismissed all three`);
    assert.deepEqual([device.state().tasks.length, device.state().events.length, device.state().needsMe.length], [0, 0, 0]);
  });

  test('a capture that produced nothing durable queues nothing, writes nothing and sends nothing: empty, high-stakes, and a draft', async () => {
    const world = await boundWorld();
    const { device, tap, cloud } = world;
    await device.settle(); // let whatever binding scheduled finish, so the baseline below is a quiet one
    const writes = device.storage.writeLog.length;
    const requests = tap.requests();
    const rows = cloud.rows.size;
    const queued = device.queue().length;

    for (const blank of ['', '   ', '\n\t  \n']) assert.deepEqual(await device.coordinator.submit({ text: blank, submissionKey: keyOf(1) }), { kind: 'refused', reason: 'empty' });
    assert.deepEqual(await device.coordinator.submit({ text: 'He hit me again and I have to pick up Ayden at 5', submissionKey: keyOf(2) }), { kind: 'high-stakes' });
    for (const draft of ['Dentist Friday at 3', 'Pick him up from practice at 5', 'asdf']) assert.ok(device.coordinator.preview(draft), 'previewing is reading, not saving');
    await device.settle();

    assert.equal(device.state().sourceArtifacts.length, 0);
    assert.equal(device.state().interpretations.length, 0);
    assert.equal(device.queue().length, queued, 'nothing queued');
    assert.equal(device.storage.writeLog.length, writes, 'nothing written');
    assert.equal(tap.requests(), requests, 'nothing sent');
    assert.equal(cloud.rows.size, rows, 'and the cloud holds exactly what it held');
    assert.deepEqual(device.text.refs(), [], 'and nothing is held in the session either');
  });

  test('a capture the reader could not read is kept as METADATA ONLY: one source row, no reading, no task; dismissing it withdraws exactly that source', async () => {
    const world = await boundWorld();
    const { device, cloud } = world;
    const out = await device.coordinator.submit({ text: 'asdf qwerty', submissionKey: keyOf(0) });
    assert.equal(out.failure.code, 'nothing-recognized');
    assert.deepEqual(device.queueKinds(), ['sourceArtifact'], 'the only durable fact is that something arrived');
    await device.settle();
    assert.deepEqual([cloudCount(world, 'source_artifacts'), cloudCount(world, 'interpretations'), cloudCount(world, 'tasks')], [1, 0, 0]);
    assert.equal(cloud.table('source_artifacts')[0].retracted_at, null);

    assert.deepEqual(await device.coordinator.dismissCapture(out.captureId), { kind: 'dismissed', rejected: 0, retracted: true });
    await device.settle();
    assert.ok(cloud.table('source_artifacts')[0].retracted_at, 'the withdrawal reached the cloud (the source is retracted, never deleted)');
    assert.deepEqual([cloudCount(world, 'interpretations'), cloudCount(world, 'tasks')], [0, 0]);
    assert.deepEqual(device.text.refs(), [], 'and her words were forgotten with it');
  });

  test('a capture made while SIGNED OUT is queued durably, sends nothing, and is delivered - without her words - when the same account signs back in', async () => {
    const world = await boundWorld();
    const { device, tap, cloud } = world;
    await device.accountRuntime.signOut();
    assert.equal(device.syncRuntime.running(), null, 'sign-out stopped the coordinator');
    await device.settle();
    const requests = tap.requests();
    const calls = cloud.calls.length;

    const out = await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    assert.equal(out.kind, 'captured');
    await device.settle();
    assert.deepEqual(device.queueKinds(), ['sourceArtifact', 'interpretation'], 'the intent is durable although nothing can be sent');
    assert.deepEqual([tap.requests(), cloud.calls.length], [requests, calls], 'and nothing was sent while signed out');

    assert.equal((await device.signIn()).kind, 'accountBound');
    assert.deepEqual([cloudCount(world, 'source_artifacts'), cloudCount(world, 'interpretations'), cloudCount(world, 'tasks')], [1, 1, 0]);
    assert.equal(device.queue().length, 0);
    assert.deepEqual(leaksOf(surfacesOf(world), UTTERANCE, { tokens: [CANARY, CHATTER] }), []);
  });

  test('a DEMO household\'s captures are part of the rehearsal: they queue nothing, send nothing, and no session can bind them', async () => {
    const cloud = createFakeCloud();
    const tap = tapCloud(cloud);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const device = await makeCaptureDevice({ cloud, tap, accountCloud, mode: 'demo' });
    assert.equal((await device.signIn()).kind, 'authenticatedUnbound', 'a demo household is refused as a whole');
    const out = await device.coordinator.submit({ text: 'Dentist Friday at 3pm.', submissionKey: keyOf(0) });
    assert.equal(out.kind, 'captured');
    assert.equal((await device.coordinator.accept(out.readingIds[0])).kind, 'accepted');
    await device.settle();
    assert.equal(device.state().origin, 'demo');
    assert.equal(device.state().events.at(-1).provenance.producer, 'demo-seed');
    assert.deepEqual([tap.requests(), cloud.calls.length, cloud.rows.size], [0, 0, 0]);
    assert.equal(device.persisted().identity.sync, null, 'not even a namespace');
  });

  test('HA-001 for Feature 02: a capture-only household made BEFORE sign-in is not an empty household, and reaches the cloud on binding', async () => {
    const cloud = createFakeCloud();
    const tap = tapCloud(cloud);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const device = await makeCaptureDevice({ cloud, tap, accountCloud, kids: [] });
    await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    await device.coordinator.submit({ text: 'asdf qwerty', submissionKey: keyOf(1) });
    assert.deepEqual([device.state().tasks.length, device.state().events.length, device.state().needsMe.length], [0, 0, 0], 'capture-only: no canonical row');
    assert.equal(describeLocalHousehold(device.state()).hasContent, true, 'so it is content, and bootstrap must not be chosen (HA-002)');
    assert.equal(device.queue().length, 0, 'unbound: there is no queue to write to');

    const state = await device.signIn();
    assert.equal(state.kind, 'accountBound');
    assert.equal(accountCloud.ids.claims, 1, 'it claimed; it did not bootstrap an empty household over her capture');
    assert.deepEqual([cloudCount({ cloud }, 'source_artifacts'), cloudCount({ cloud }, 'interpretations')], [2, 1], 'the claim carried none of it; the seed queued all of it');
    for (const table of ['tasks', 'events', 'needs_me_items']) assert.equal(cloud.table(table).length, 0, `${table}`);
    assert.equal(device.queue().length, 0);
    assert.deepEqual(leaksOf(payloadSurfaces({ cloud, tap, accountCloud, devices: [device] }), UTTERANCE, { tokens: [CANARY, CHATTER] }), [], 'and the claim payload carried none of her words either');
  });
});

// ----------------------------------------------------- C: raw text never leaves ---

describe('C — her raw wording never becomes a cloud payload, an envelope, a queue item or a claim', () => {
  test('the scanner can see: a planted leak is found, a legitimately structured title is found where it belongs, and a short title is not a leak', async () => {
    const world = await boundWorld();
    await world.device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    await world.device.settle();
    const surfaces = surfacesOf(world);

    const planted = { ...surfaces, 'a planted payload': JSON.stringify({ notes: UTTERANCE }) };
    assert.ok(leaksOf(planted, UTTERANCE, { tokens: [CANARY] }).length >= 2, 'the whole utterance and the token are both reported');
    assert.ok(leaksOf({ 'a payload': `x ${UTTERANCE.slice(10, 60)} y` }, UTTERANCE).length === 1, 'a fifty-character run is reported');
    assert.equal(surfaces['cloud rows'].includes(TITLE), false, 'OD-A: before she accepts, the derived title did not travel');
    assert.ok(surfaces['cloud rows'].includes(UNDECIDED_READING_TITLE.task) && surfaces['transport requests'].includes(UNDECIDED_READING_TITLE.task), 'positive control: the neutral label did - the scan reads real payloads');
    assert.ok(TITLE.length < 30, 'a short structured title is below the run window, so it is not mistaken for a leak');
    assert.ok(Object.keys(surfaces).length >= 10, `${Object.keys(surfaces).length} surfaces are scanned`);
  });

  test('THE CANARY: through capture, correction, clarification, acceptance and dismissal, her words appear in no cloud row, request, claim, envelope, queue item or diagnostic', async () => {
    const world = await boundWorld();
    const { device } = world;

    // 1. an errand wrapped in chatter she would not want anywhere
    const first = await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    // 2. a child-scoped question, her free-text answer, and a free-text correction: each is her raw wording too
    const PRACTICE = 'Practice at 5 tomorrow. CANARY-PRACTICE-5521 is the name of the coach I dislike.';
    const ANSWER = "Ayden, it's just a to-do CANARY-ANSWER-1183";
    const CORRECTION = 'no, I meant Friday CANARY-CORRECTION-9902';
    const second = await device.coordinator.submit({ text: PRACTICE, submissionKey: keyOf(1) });
    assert.equal(second.readingIds.length, 1);
    const answered = await device.coordinator.answerClarification(second.readingIds[0], { kind: 'text', text: ANSWER });
    assert.equal(answered.kind, 'revised', 'the free-text answer was understood');
    const corrected = await device.coordinator.correct(answered.readingId, { kind: 'text', text: CORRECTION });
    assert.equal(corrected.kind, 'revised', 'the free-text correction was understood');
    assert.equal((await device.coordinator.accept(corrected.readingId, { categoryId: areaId(device, 'kids') })).kind, 'accepted');
    assert.equal((await device.coordinator.accept(first.readingIds[0], { categoryId: areaId(device, 'home') })).kind, 'accepted');
    // 3. something she dismissed
    const DISMISSED = 'CANARY-DISMISSED-6640 was in the note from school. Pay the electric bill by Friday.';
    const third = await device.coordinator.submit({ text: DISMISSED, submissionKey: keyOf(2) });
    await device.coordinator.dismissCapture(third.captureId);
    await device.settle();

    const state = device.state();
    assert.equal(state.tasks.length, 2, 'the two she accepted');
    assert.equal(cloudCount(world, 'tasks'), 2);
    assert.ok(cloudCount(world, 'interpretations') >= 5, 'the whole chain travelled');

    const surfaces = surfacesOf(world);
    const tokens = [CANARY, CHATTER, 'CANARY-PRACTICE-5521', 'CANARY-ANSWER-1183', 'CANARY-CORRECTION-9902', 'CANARY-DISMISSED-6640', 'the coach I dislike'];
    for (const said of [UTTERANCE, PRACTICE, ANSWER, CORRECTION, DISMISSED]) assert.deepEqual(leaksOf(surfaces, said, { tokens }), [], `something she said reached a payload: ${said.slice(0, 30)}...`);
    assert.ok(surfaces['cloud rows'].includes(TITLE), 'positive control: the accepted, derived title is in the cloud');
    // The cloud's copy of the durable state is exactly the structured, sanitized record: it validates as a household.
    assert.equal(validateAppState(state).ok, true);
  });

  test('a capture stays session-only after a restart: the review says her exact words are gone, nothing raw is durable, and the structured reading still works', async () => {
    const world = await boundWorld();
    const { device } = world;
    const out = await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    const unread = await device.coordinator.submit({ text: 'asdf qwerty zxcv', submissionKey: keyOf(1) });
    await device.settle();
    assert.equal(device.coordinator.textOf(out.captureId), UTTERANCE, 'while the app is open she can see what she said');

    const relaunched = await device.restart();
    assert.equal(relaunched.restored.kind, 'accountBound', 'the same account resumes');
    assert.equal(world.accountCloud.ids.claims, 1, 'without a second claim');
    assert.deepEqual(relaunched.text.refs(), [], 'the new process holds none of her words');
    assert.equal(relaunched.coordinator.textOf(out.captureId), null);

    const state = relaunched.state();
    const vm = buildCaptureVM({ state, captureId: out.captureId, nowMs: NOW, text: relaunched.coordinator.textOf(out.captureId), session: relaunched.coordinator.sessionOf(out.captureId) });
    assert.deepEqual(vm.source, { kind: 'unavailable', message: copy.review.sourceUnavailable }, 'the review says the exact words are no longer held');
    assert.equal(vm.hollow, false, 'the durable reading is still reviewable');
    assert.ok(vm.proposals[0].notes.includes(copy.review.checkDetails), 'and it says the assumptions are no longer known');

    const inbox = buildInboxItems(state, NOW, (id) => relaunched.coordinator.textOf(id) !== null);
    assert.deepEqual(inbox.filter((item) => item.hollow).map((item) => item.captureId), [unread.captureId], 'a source with no reading and no words is honestly hollow');
    assert.equal(buildCaptureVM({ state, captureId: unread.captureId, nowMs: NOW, text: null, session: null }).actions.canRetry, false, 'it cannot be re-read, only re-said or dismissed');

    // The reading still works with no wording at all, and what it makes reaches the cloud once.
    assert.equal((await relaunched.coordinator.accept(state.interpretations[0].id, { categoryId: areaId(relaunched, 'home') })).kind, 'accepted');
    await relaunched.settle();
    assert.equal(cloudCount(world, 'tasks'), 1, 'exactly one task, no duplicate after the restart');
    const surfaces = surfacesOf(world, [device, relaunched]);
    assert.deepEqual(leaksOf(surfaces, UTTERANCE, { tokens: [CANARY, CHATTER] }), [], 'after the restart, on both processes, nothing raw is durable or sent');
    assert.equal(surfaces['device 1 storage (every key)'].includes('asdf qwerty zxcv'), false, 'including the words of the capture that made no reading');
  });

  test('high-stakes wording (the OD-2 stopgap) is read as nothing: no source, no reading, nothing queued, nothing sent - and it cannot be routed into Discovery', async () => {
    const world = await boundWorld();
    const { device, tap } = world;
    const HIGH = 'I am afraid of him and everything is CANARY-HS-4420. Also pick up the dry cleaning Friday.';
    await device.settle();
    const writes = device.storage.writeLog.length;
    const requests = tap.requests();
    const queued = device.queue().length;

    assert.deepEqual(await device.coordinator.submit({ text: HIGH, submissionKey: keyOf(0) }), { kind: 'high-stakes' });
    assert.equal(device.coordinator.preview(HIGH).failure.code, 'high-stakes', 'the same guard reads it while she types');
    await device.settle();

    assert.deepEqual([device.state().sourceArtifacts.length, device.state().interpretations.length, device.state().tasks.length], [0, 0, 0]);
    assert.equal(device.queue().length, queued);
    assert.equal(device.storage.writeLog.length, writes, 'not one byte written');
    assert.equal(tap.requests(), requests, 'not one request');
    assert.deepEqual(device.text.refs(), [], 'not even held for the session');
    assert.deepEqual(leaksOf(surfacesOf(world), HIGH, { tokens: ['CANARY-HS-4420'] }), []);

    // HA-006: whatever the conversation is doing, this text goes to the capture guard and never into a scripted Discovery answer.
    for (const stage of ['listening', 'clarifying', 'refining', 'resolved']) {
      assert.equal(routeMessage({ stage, hasWords: true, readerAvailable: true, recognized: true, highStakes: true, conversationUnderstood: true }), 'capture', `stage ${stage}`);
    }
  });

  test('the conversation path (Discovery) stores structure only: a message that opens a topic leaves her words nowhere, and the topic reaches the cloud', async () => {
    const world = await boundWorld();
    const { device } = world;
    const SAID = 'I feel so far behind on everything CANARY-DISC-5520 lately';
    // exactly what TalkItOutSession.submit does for a message the conversation takes (store.dispatch of the discovery record)
    const turn = advance(createInitialState(), SAID);
    assert.equal(turn.state.topicId, 'overload', 'the conversation took it as a topic');
    device.store.dispatch((state, ctx) => applyDiscoveryConversation(state, ctx, turn.state));
    await device.settle();

    assert.equal(device.state().discovery.topicId, 'overload');
    assert.equal(cloudCount(world, 'discovery_records'), 1, 'the structure travels');
    const surfaces = surfacesOf(world);
    assert.ok(surfaces['cloud rows'].includes('overload'), 'positive control: the topic id is in the cloud');
    assert.deepEqual(leaksOf(surfaces, SAID, { tokens: ['CANARY-DISC-5520'] }), []);
  });

  // Owner decision OD-A (resolved): an undecided reading syncs as structured state, but nothing copied from or derived from her words
  // does until she accepts it. This replaces the boundary that used to be pinned here (a note's own clause, capped at 90 characters,
  // travelled while the reading was still pending).
  test('OD-A: a note keeps her own clause as its LOCAL title; nothing of it travels until she accepts, and then only the canonical, capped title', async () => {
    const world = await boundWorld();
    const { device } = world;
    const HEAD = 'CANARY-NOTE-91';
    const TAIL = 'CANARY-TAIL-55';
    const SAID = `The school portal announced ${HEAD} and the band concert program is due every Tuesday and it has a long ramble that keeps going well past the ninety character title clip so the tail is ${TAIL}.`;
    const out = await device.coordinator.submit({ text: SAID, submissionKey: keyOf(0) });
    assert.equal(out.readingIds.length, 1);
    await device.settle();

    const local = device.state().interpretations[0];
    assert.ok(local.title.includes(HEAD) && local.title.length <= 90, 'the device that heard her keeps her own clause as the reading\'s title, capped at 90 characters');
    const [row] = world.cloud.table('interpretations');
    assert.deepEqual([row.proposed_kind, row.state, row.title], ['needsMe', 'pending', UNDECIDED_READING_TITLE.needsMe], 'the cloud has the structured reading under a neutral label');
    const surfaces = syncSurfacesOf(world);
    for (const [where, haystack] of Object.entries(surfaces)) assert.equal(haystack.includes(HEAD) || haystack.includes(TAIL), false, `${where} holds a piece of her clause`);
    assert.deepEqual(leaksOf(surfaces, SAID, { window: 12, tokens: [HEAD, TAIL] }), []);

    // Her explicit acceptance makes the clause excerpt the canonical title of the row it became, and THEN it may travel: capped, and only that.
    assert.equal((await device.coordinator.accept(local.id)).kind, 'accepted');
    await device.settle();
    const [accepted] = world.cloud.table('interpretations');
    assert.deepEqual([accepted.state, accepted.title], ['accepted', local.title]);
    assert.ok(accepted.title.length <= 90 && accepted.title.endsWith('…'), 'the canonical title is capped and says it was cut');
    assert.equal(syncSurfacesOf(world)['cloud rows'].includes(TAIL), false, 'what lies beyond the cap never travels');
    assert.deepEqual(leaksOf(syncSurfacesOf(world), SAID, { window: 120, tokens: [TAIL] }), [], 'never a run longer than a title, and never the whole');
  });

  test('the high-stakes assertions are sensitive to the guard: without it the same words WOULD become a durable source', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const unguarded = { ...localInterpreter, interpret: (input) => localInterpreter.interpret({ ...input, text: input.text.replace(/afraid of him/i, 'happy with him') }) };
    const device = await makeCaptureDevice({ cloud, accountCloud, interpreter: unguarded });
    const out = await device.coordinator.submit({ text: 'I am afraid of him and I need to pick up the dry cleaning Friday.', submissionKey: keyOf(0) });
    assert.equal(out.kind, 'captured');
    assert.equal(device.state().sourceArtifacts.length, 1);
    const guarded = await makeCaptureDevice({ cloud: createFakeCloud(), accountCloud });
    assert.deepEqual(await guarded.coordinator.submit({ text: 'I am afraid of him and I need to pick up the dry cleaning Friday.', submissionKey: keyOf(0) }), { kind: 'high-stakes' }, 'the app\'s own reader refuses it');
  });
});

// ----------------------------------------------------- OD-A: nothing derived from her words before she accepts ---

/**
 * The surfaces that are SYNC: what the cloud holds, every request the transport made, the change log, claim payloads, the durable
 * outbound queue and identity block, and the runtime diagnostics. The device's own storage is NOT among them: the device that heard
 * her keeps her reading (and its derived title) locally, and that is not what the owner decision is about.
 */
const SYNC_SURFACE = /^(cloud |transport requests|claim payloads|device \d+ (durable outbound queue|durable identity|runtime diagnostics))/;
const syncSurfacesOf = (world, devices = [world.device]) => Object.fromEntries(Object.entries(surfacesOf(world, devices)).filter(([name]) => SYNC_SURFACE.test(name)));

/** Every string VALUE in a payload surface (never a key: `duration_minutes` is not her word "minutes"). */
const stringValues = (surface) => {
  const out = [];
  const walk = (node) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
  };
  for (const chunk of surface.split('\n')) {
    try {
      walk(JSON.parse(chunk));
    } catch {
      out.push(chunk);
    }
  }
  return out;
};

/** Where a reading's derived title (whole, a 12-character run of it, or any of its words of five letters or more) appears as a VALUE. */
const titleLeaksOf = (surfaces, title) => {
  const found = [];
  const words = (title.match(/[A-Za-z’']{5,}/g) ?? []).map((w) => w.toLowerCase());
  const runs = Array.from({ length: Math.max(0, title.length - 11) }, (_, i) => title.slice(i, i + 12).toLowerCase());
  for (const [where, surface] of Object.entries(surfaces)) {
    const values = stringValues(surface).map((v) => v.toLowerCase());
    if (values.some((v) => v.includes(title.toLowerCase()))) found.push(`${where}: the whole title`);
    for (const run of runs) if (values.some((v) => v.includes(run))) { found.push(`${where}: a 12-character run of the title ("${run}")`); break; }
    for (const word of words) if (values.some((v) => v.includes(word))) found.push(`${where}: the word "${word}"`);
  }
  return found;
};

describe('OD-A — before she accepts, account sync carries no raw and no quasi-verbatim title derived from what she said', () => {
  const SAID = [
    { key: 0, text: UTTERANCE },
    { key: 1, text: 'Dentist Friday at 3pm.' },
    { key: 2, text: 'The school portal announced the spring picnic volunteer form and the band concert program is due every Tuesday and it has a long ramble that keeps going well past the ninety character title clip.' },
    { key: 3, text: 'Practice at 5 tomorrow. CANARY-PRACTICE-5521 is the coach I dislike.' },
    { key: 4, text: 'Pay the water bill $84 by Friday. CANARY-BILL-3312 is the account number.' },
  ];
  const TOKENS = [CANARY, CHATTER, 'CANARY-PRACTICE-5521', 'CANARY-BILL-3312', 'the coach I dislike', 'account number'];
  const NEUTRAL = new Set(Object.values(UNDECIDED_READING_TITLE));

  async function captured() {
    const world = await boundWorld();
    const { device } = world;
    for (const { key, text } of SAID) assert.equal((await device.coordinator.submit({ text, submissionKey: keyOf(key) })).kind, 'captured');
    await device.settle();
    return world;
  }

  test('undecided readings DO sync, as structured state: every reading is in the cloud with its kind, dates, amount, hint and open question', async () => {
    const world = await captured();
    const { device, cloud } = world;
    const readings = device.state().interpretations;
    assert.ok(readings.length >= 5, `${readings.length} readings`);
    assert.equal(cloud.table('interpretations').length, readings.length, 'not held out of sync, as a whole or in part');
    for (const reading of readings) {
      const row = cloud.table('interpretations').find((r) => r.local_id === reading.id);
      assert.deepEqual(
        [row.state, row.proposed_kind, row.due_date, row.duration_minutes, row.category_hint, row.clarification, row.value_amount_minor ?? null],
        [reading.state, reading.proposedKind, reading.dueDate, reading.durationMinutes, reading.categoryHint, reading.clarification, reading.value?.amountMinor ?? null],
        `the structured part of ${reading.title} travelled`
      );
    }
    assert.ok(readings.some((r) => r.state === 'clarifying') && readings.some((r) => r.value !== null) && readings.some((r) => r.proposedKind === 'event') && readings.some((r) => r.proposedKind === 'needsMe'), 'the battery covers a question, an amount, an event and a note');
  });

  test('every undecided reading is presented to the cloud under a neutral label: no whole utterance, no 12-character run of it, no title, no run of a title, no word of a title', async () => {
    const world = await captured();
    const { device, cloud } = world;
    const surfaces = syncSurfacesOf(world);
    assert.ok(Object.keys(surfaces).length >= 6, `${Object.keys(surfaces).join(', ')}`);

    for (const row of cloud.table('interpretations')) assert.ok(NEUTRAL.has(row.title), `a cloud reading is titled "${row.title}"`);
    for (const { text } of SAID) assert.deepEqual(leaksOf(surfaces, text, { window: 12, tokens: TOKENS }), [], `something she said reached sync: ${text.slice(0, 30)}...`);
    for (const reading of device.state().interpretations) assert.deepEqual(titleLeaksOf(surfaces, reading.title), [], `the title derived for "${reading.title}" reached sync`);
    assert.equal(cloudCount(world, 'tasks') + cloudCount(world, 'events') + cloudCount(world, 'needs_me_items'), 0, 'and no canonical row was made of anything');
  });

  test('a free-text answer and a free-text correction change nothing about that: the successor is still undecided, still neutral, and nothing she typed travels', async () => {
    const world = await boundWorld();
    const { device } = world;
    const first = await device.coordinator.submit({ text: 'Practice at 5 tomorrow. CANARY-PRACTICE-5521 is the coach I dislike.', submissionKey: keyOf(0) });
    const ANSWER = "Ayden, it's just a to-do CANARY-ANSWER-1183";
    const CORRECTION = 'no, I meant Friday CANARY-CORRECTION-9902';
    const answered = await device.coordinator.answerClarification(first.readingIds[0], { kind: 'text', text: ANSWER });
    assert.equal(answered.kind, 'revised');
    const corrected = await device.coordinator.correct(answered.readingId, { kind: 'text', text: CORRECTION });
    assert.equal(corrected.kind, 'revised');
    const typed = await device.coordinator.correct(corrected.readingId, { kind: 'patch', patch: { title: 'Ayden football practice with Coach Ferreira' } });
    assert.equal(typed.kind, 'revised', 'she even typed a title of her own');
    await device.settle();

    const surfaces = syncSurfacesOf(world);
    const rows = world.cloud.table('interpretations');
    assert.ok(rows.length >= 4, 'the whole chain travelled');
    assert.deepEqual(rows.map((r) => r.state).filter((s) => s !== 'superseded'), ['pending']);
    for (const row of rows) assert.ok(NEUTRAL.has(row.title), `"${row.title}" is not a neutral label`);
    for (const said of [ANSWER, CORRECTION, 'Ayden football practice with Coach Ferreira']) assert.deepEqual(leaksOf(surfaces, said, { window: 12, tokens: ['CANARY-ANSWER-1183', 'CANARY-CORRECTION-9902', 'Ferreira', 'CANARY-PRACTICE-5521'] }), [], said);
  });

  test('after explicit acceptance the canonical title travels - and only that one: what she left undecided stays neutral', async () => {
    const world = await captured();
    const { device, cloud } = world;
    const card = device.state().interpretations.find((r) => r.title === TITLE);
    assert.equal((await device.coordinator.accept(card.id, { categoryId: areaId(device, 'home') })).kind, 'accepted');
    await device.settle();

    const row = cloud.table('interpretations').find((r) => r.local_id === card.id);
    assert.deepEqual([row.state, row.title], ['accepted', TITLE], 'the accepted, canonical title may sync');
    assert.deepEqual(cloud.table('tasks').map((t) => t.title), [TITLE]);
    const others = device.state().interpretations.filter((r) => r.id !== card.id);
    for (const other of others) {
      assert.ok(NEUTRAL.has(cloud.table('interpretations').find((r) => r.local_id === other.id).title), `${other.title} is still neutral`);
      // the other readings' words are absent (the accepted title's own words are allowed, so skip a title that shares none of them)
      assert.deepEqual(titleLeaksOf(syncSurfacesOf(world), other.title).filter((f) => !/library|card|renew/i.test(f)), [], `${other.title}`);
    }
    for (const { text } of SAID.slice(1)) assert.deepEqual(leaksOf(syncSurfacesOf(world), text, { window: 12, tokens: TOKENS.slice(2) }), [], text.slice(0, 30));
  });

  test('a reading she rejects, or a capture she dismisses, was never approved: it stays neutral for good', async () => {
    const world = await captured();
    const { device, cloud } = world;
    const [rejectedOne] = device.state().interpretations.filter((r) => r.state === 'pending');
    assert.equal((await device.coordinator.reject(rejectedOne.id)).kind, 'rejected');
    const dismissedSource = device.state().sourceArtifacts.at(-1);
    await device.coordinator.dismissCapture(dismissedSource.id);
    await device.settle();

    assert.ok(cloud.table('interpretations').filter((r) => r.state === 'rejected').length >= 2);
    for (const row of cloud.table('interpretations')) assert.ok(NEUTRAL.has(row.title), `a ${row.state} reading is titled "${row.title}"`);
    for (const reading of device.state().interpretations) assert.deepEqual(titleLeaksOf(syncSurfacesOf(world), reading.title), [], reading.title);
  });

  test('a restart changes nothing: the words are gone, the readings are still neutral in the cloud, and a fresh scan finds nothing', async () => {
    const world = await captured();
    const relaunched = await world.device.restart();
    await relaunched.settle();
    const surfaces = syncSurfacesOf(world, [world.device, relaunched]);
    for (const { text } of SAID) assert.deepEqual(leaksOf(surfaces, text, { window: 12, tokens: TOKENS }), []);
    for (const reading of relaunched.state().interpretations) assert.deepEqual(titleLeaksOf(surfaces, reading.title), []);
    for (const row of world.cloud.table('interpretations')) assert.ok(NEUTRAL.has(row.title));
  });

  test('the boundary protects even against a READER that puts her whole wording in a title: nothing reaches sync before acceptance, and the scan still catches it once she accepts', async () => {
    const cloud = createFakeCloud();
    const tap = tapCloud(cloud);
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const leaky = { ...localInterpreter, interpret: (input) => { const read = localInterpreter.interpret(input); return { ...read, proposals: read.proposals.map((p) => ({ ...p, title: input.text.slice(0, 200) })) }; } };
    const device = await makeCaptureDevice({ cloud, tap, accountCloud, interpreter: leaky });
    await device.signIn();
    const world = { cloud, tap, accountCloud, device };
    await device.coordinator.submit({ text: UTTERANCE, submissionKey: keyOf(0) });
    await device.settle();

    assert.deepEqual(leaksOf(syncSurfacesOf(world), UTTERANCE, { window: 12, tokens: [CANARY, CHATTER] }), [], 'the whole wording was the reading\'s title, and none of it left the device');
    assert.ok(leaksOf(payloadSurfaces({ cloud, tap, accountCloud, devices: [device] }), UTTERANCE, { window: 12, tokens: [CANARY] }).some((f) => f.startsWith('device 0 storage')), 'it is still on the device that heard it (the device keeps her reading)');
    assert.deepEqual(cloud.table('interpretations').map((r) => r.title), [UNDECIDED_READING_TITLE.task]);

    // Accepting it is HER explicit act: from then on its title is the canonical title of the row it became, and the scan sees it.
    assert.equal((await device.coordinator.accept(device.state().interpretations[0].id, { categoryId: areaId(device, 'home') })).kind, 'accepted');
    await device.settle();
    assert.ok(leaksOf(syncSurfacesOf(world), UTTERANCE, { window: 12, tokens: [CANARY] }).some((f) => f.startsWith('cloud rows')), 'the scan CAN fail: an accepted title made of her whole wording is found in the cloud');
  });

  test('the scan can see: a planted derived title is found by every one of its three tests, and a neutral label is not a finding', () => {
    const title = 'Renew the library card';
    const planted = { 'a payload': JSON.stringify({ title, duration_minutes: 45 }) };
    const found = titleLeaksOf(planted, title);
    assert.ok(found.some((f) => f.includes('the whole title')) && found.some((f) => f.includes('12-character run')) && found.some((f) => f.includes('the word "library"')), found.join('; '));
    assert.deepEqual(titleLeaksOf({ 'a payload': JSON.stringify({ title: UNDECIDED_READING_TITLE.task, duration_minutes: 45 }) }, title), [], 'and a key such as duration_minutes is never mistaken for her word');
    assert.deepEqual(stringValues('{"a":{"b":["x","y"]},"c":1}\n{"d":"z"}'), ['x', 'y', 'z']);
  });

  test('the card and the coordinator both refuse to save a reading that arrived unnamed, and the UI has words for it', () => {
    const cards = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'CaptureCards.tsx'), 'utf8');
    assert.match(cards, /outcome\.kind === 'needs-title'\) return copy\.review\.titleNeeded/, 'the card says why');
    assert.match(cards, /vm\.titleNeeded \? copy\.review\.titleNeeded/, 'and hints it on the disabled button');
    const coordinator = readFileSync(join(ROOT, 'src', 'features', 'talk-it-out', 'capture', 'coordinator.ts'), 'utf8');
    assert.match(coordinator, /isUndecidedReadingTitle\(reading\.title\)\) return \{ kind: 'needs-title' \}/);
  });
});

