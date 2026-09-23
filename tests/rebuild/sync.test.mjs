/**
 * HK-FEATURE-11 / M5 — RebuildFocus through the PRODUCTION sync composition.
 *
 * Every test starts at `makeDevice` (the real store, repository, change observer, account runtime, sync runtime and coordinator);
 * only the platform leaves are stand-ins, and the cloud is the in-memory model in tests/support/fakeCloud.mjs. F11 has NO sync code
 * of its own: its rows are two more manifest kinds, queued by the ordinary change observer and pushed/pulled by the ordinary engine.
 * The REAL PostgreSQL / PostgREST / RLS proof is supabase/tests/78-f11-rebuild-focus.sql and supabase/tests/journey-rebuild.mjs.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addNextStep,
  addRebuildFocus,
  archiveRebuildFocus,
  linkToFocus,
  pauseRebuildFocus,
  renameRebuildFocus,
  setRebuildFocusNote,
} from '../../src/domain/rebuild/commands.ts';
import { liveLinksOf, openNextActions, orderedFocuses } from '../../src/domain/rebuild/read.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { redactRowValues } from '../../src/platform/supabaseSyncTransport.ts';
import { ACCOUNT_A, accountCloudFor, bindAsNewDevice, makeDevice, mutate, withheldMove } from '../support/accountDevice.mjs';
import { createFakeCloud } from '../support/fakeCloud.mjs';

const TITLE = 'Make space for myself again';
const NOTE = 'Saturday mornings used to be mine.';
const PERSONAL = 'cat-wellbeing';

async function signedInDevice(cloud, accountCloud) {
  const device = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await mutate(device, (state) => ({ ...state, oneMoves: [withheldMove] }));
  await device.signIn();
  return device;
}

async function secondDevice(cloud, accountCloud) {
  const device = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
  await bindAsNewDevice(device, accountCloud);
  assert.equal((await device.signIn()).kind, 'accountBound');
  return device;
}

const focusStep = (focusId, title, taskId) => (s, c) =>
  addNextStep(s, { ...c, createId: (p) => (p === 'task' ? taskId : `${p}-${taskId}`) }, { focusId, title, categoryId: PERSONAL });

describe('[F11-M5] create -> cloud -> a FRESH client reconstructs Focus + relationship', () => {
  test('the Focus, its private next-step Task and the typed link arrive on a second device, by identity, with nothing re-queued', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    await mutate(a, (s, c) => setRebuildFocusNote(addRebuildFocus(s, c, { id: 'focus-a', title: TITLE }), c, 'focus-a', NOTE));
    await mutate(a, focusStep('focus-a', 'Book the pottery class', 'task-pot'));
    await a.settle();

    const [focusRow] = cloud.table('rebuild_focuses');
    assert.deepEqual(
      { title: focusRow.title, note: focusRow.note, state: focusRow.state, scope: focusRow.scope, profile: focusRow.profile_id, producer: focusRow.producer },
      { title: TITLE, note: NOTE, state: 'active', scope: 'personal', profile: ACCOUNT_A, producer: 'user-action' }
    );
    const taskRow = cloud.table('tasks').find((t) => t.title === 'Book the pottery class');
    assert.deepEqual([taskRow.scope, taskRow.owner_profile_id], ['personal', ACCOUNT_A], 'the step is owner-private in the cloud too');
    const [linkRow] = cloud.table('rebuild_focus_links');
    assert.deepEqual(
      { focus: linkRow.focus_id, type: linkRow.target_type, task: linkRow.target_task_id, goal: linkRow.target_goal_id, system: linkRow.target_system_id, event: linkRow.target_event_id, relation: linkRow.relation, profile: linkRow.profile_id },
      { focus: focusRow.id, type: 'task', task: taskRow.id, goal: null, system: null, event: null, relation: 'next_action', profile: ACCOUNT_A },
      'exactly one typed target column is set, and it is the cloud id of the Task'
    );
    for (const row of cloud.table('tasks')) assert.equal(Object.keys(row).some((k) => /focus|rebuild/i.test(k)), false, 'no Focus column on a Task');

    const b = await secondDevice(cloud, accountCloud);
    const state = b.store.getSnapshot().state;
    const focus = state.rebuildFocuses.find((f) => f.title === TITLE);
    assert.ok(focus, 'the Focus arrived');
    assert.deepEqual([focus.note, focus.state, focus.scope], [NOTE, 'active', 'personal']);
    assert.deepEqual(openNextActions(state, focus.id).map((t) => [t.title, t.scope]), [['Book the pottery class', 'personal']], 'and its link resolves to the arrived Task');
    assert.equal(b.persisted().identity.sync.queue.length, 0, 'pulling produced no outbound work');
    assert.equal(b.persisted().kind, 'valid', 'and the reconstructed household is valid on disk');
  });

  test('a Focus named BEFORE sign-in reaches the cloud through the ordinary post-binding seed', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await makeDevice({ cloud, accountId: ACCOUNT_A, accountCloud });
    await mutate(a, (state) => ({ ...state, oneMoves: [withheldMove] }));
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-early', title: 'Build a life outside work' }));
    await mutate(a, focusStep('focus-early', 'Join the Thursday choir', 'task-choir'));
    assert.equal(cloud.table('rebuild_focuses').length, 0, 'nothing leaves the device before an account exists');
    await a.signIn();
    await a.settle();
    assert.deepEqual(cloud.table('rebuild_focuses').map((r) => r.title), ['Build a life outside work']);
    assert.equal(cloud.table('rebuild_focus_links').length, 1);
  });
});

describe('[F11-M5] archive transport: no resurrection', () => {
  test('archived on A -> fresh B holds it archived, off the Rebuild surface; its Task is untouched', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-x', title: 'Get back to doing things I enjoy' }));
    await mutate(a, focusStep('focus-x', 'Book a swim', 'task-swim'));
    await a.settle();
    await mutate(a, (s, c) => archiveRebuildFocus(s, c, 'focus-x'));
    await a.settle();
    assert.equal(cloud.table('rebuild_focuses')[0].state, 'archived');
    assert.equal(cloud.table('tasks').find((t) => t.title === 'Book a swim').status, 'open', 'archiving the Focus did not touch the Task');

    const b = await secondDevice(cloud, accountCloud);
    const state = b.store.getSnapshot().state;
    assert.equal(state.rebuildFocuses.length, 1, 'kept, not deleted');
    assert.equal(state.rebuildFocuses[0].state, 'archived');
    assert.deepEqual(orderedFocuses(state), [], 'and not back on the surface');
    // A later, unrelated pull still does not bring it back.
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-y', title: 'Another area' }));
    await a.settle();
    await b.settle();
    const later = b.store.getSnapshot().state;
    assert.equal(later.rebuildFocuses.find((f) => f.title === 'Get back to doing things I enjoy').state, 'archived');
  });

  test('pause and rename travel; the id and the link never change', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-p', title: 'Reconnect with creativity' }));
    await mutate(a, focusStep('focus-p', 'Buy a sketchbook', 'task-sketch'));
    await a.settle();
    const cloudId = cloud.table('rebuild_focuses')[0].id;
    await mutate(a, (s, c) => renameRebuildFocus(pauseRebuildFocus(s, c, 'focus-p'), c, 'focus-p', 'Make things again'));
    await a.settle();
    const [row] = cloud.table('rebuild_focuses');
    assert.deepEqual([row.id, row.title, row.state], [cloudId, 'Make things again', 'paused']);
    assert.equal(cloud.table('rebuild_focus_links')[0].focus_id, cloudId);
    const b = await secondDevice(cloud, accountCloud);
    const focus = b.store.getSnapshot().state.rebuildFocuses[0];
    assert.deepEqual([focus.title, focus.state], ['Make things again', 'paused']);
    assert.equal(liveLinksOf(b.store.getSnapshot().state, focus.id).length, 1);
  });
});

describe('[F11-M5] offline, stale and refused', () => {
  test('offline create, edit and pause are shown at once and saved locally; on reconnect they reach the cloud in order', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    cloud.state.offline = true;
    assert.equal(await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-off', title: 'Offline area' })), true, 'no wait for the server');
    await mutate(a, (s, c) => renameRebuildFocus(s, c, 'focus-off', 'Offline area, renamed'));
    await mutate(a, (s, c) => pauseRebuildFocus(s, c, 'focus-off'));
    await a.settle();
    assert.equal(a.store.getSnapshot().state.rebuildFocuses[0].state, 'paused', 'visible immediately');
    assert.equal(a.persisted().state.rebuildFocuses[0].title, 'Offline area, renamed', 'and durable locally');
    assert.equal(cloud.table('rebuild_focuses').length, 0);
    cloud.state.offline = false;
    await a.settle();
    const [row] = cloud.table('rebuild_focuses');
    assert.deepEqual([row.title, row.state], ['Offline area, renamed', 'paused']);
  });

  test('a STALE edit (another device changed the Focus first) never silently overwrites the newer cloud truth', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-s', title: 'Original' }));
    await a.settle();
    const [row] = cloud.table('rebuild_focuses');
    cloud.editRow('rebuild_focuses', row.id, { title: 'Renamed on the other device' });
    await mutate(a, (s, c) => renameRebuildFocus(s, c, 'focus-s', 'Renamed here'));
    await a.settle();
    assert.equal(cloud.table('rebuild_focuses')[0].title, 'Renamed on the other device', 'the newer cloud truth stands');
    assert.equal(cloud.table('rebuild_focuses')[0].revision, 2, 'no blind overwrite bumped it again');
  });

  test('a REFUSED row leaves the queue as evidence and carries none of her words; nothing else is blocked', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    const secret = 'a private sentence that must never be copied';
    cloud.hooks.refuse = (table) =>
      table === 'rebuild_focuses'
        ? { kind: 'failure', failure: 'validation', code: '23514', detail: `new row violates check constraint "rebuild_focuses_title_check" | ${redactRowValues(`Failing row contains (x, y, ${secret}).`)}` }
        : null;
    await mutate(a, (s, c) => setRebuildFocusNote(addRebuildFocus(s, c, { id: 'focus-r', title: 'Refused' }), c, 'focus-r', secret));
    await mutate(a, (s, c) => addTask(s, { ...c, createId: () => 'task-ok' }, { title: 'Unrelated task', categoryId: 'cat-home', scope: 'household' }));
    await a.settle();
    const sync = a.persisted().identity.sync;
    const evidence = sync.evidence.filter((e) => e.kind === 'rebuildFocus');
    assert.equal(evidence.length, 1, 'recorded, not dropped');
    assert.equal(JSON.stringify(sync).includes(secret), false, 'her note is nowhere in the sync record');
    assert.ok(cloud.table('tasks').some((t) => t.title === 'Unrelated task'), 'one refused row did not block the rest');
    assert.equal(a.store.getSnapshot().state.rebuildFocuses[0].note, secret, 'and her Focus is still hers, on her device');
  });

  test('the transport keeps the constraint name and drops a failing row\'s values', () => {
    assert.equal(redactRowValues('Failing row contains (1f0c…, a private note, active).'), 'Failing row contains (redacted).');
    assert.equal(redactRowValues('Key (focus_id)=(abc) is not present in table "rebuild_focuses".'), 'Key (focus_id)=(abc) is not present in table "rebuild_focuses".');
    assert.equal(redactRowValues(null), null);
  });
});

describe('[F11-M5] two devices, one relationship', () => {
  test('the same item connected to the same Focus on two devices is ONE link after both sync (adopted, never doubled)', async () => {
    const cloud = createFakeCloud();
    const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
    const a = await signedInDevice(cloud, accountCloud);
    await mutate(a, (s, c) => addRebuildFocus(s, c, { id: 'focus-d', title: 'Shared area' }));
    await mutate(a, (s, c) => addTask(s, { ...c, createId: () => 'task-d' }, { title: 'Walk at lunch', categoryId: PERSONAL, scope: 'personal' }));
    await a.settle();
    const b = await secondDevice(cloud, accountCloud);
    const bState = b.store.getSnapshot().state;
    const bFocus = bState.rebuildFocuses[0].id;
    const bTask = bState.tasks.find((t) => t.title === 'Walk at lunch').id;

    // Both link it while the other has not heard: A first, then B (B's local link is still unsent when A's arrives).
    await mutate(a, (s, c) => linkToFocus(s, { ...c, createId: () => 'focuslink-from-a' }, { focusId: 'focus-d', target: { kind: 'task', id: 'task-d' }, relation: 'next_action' }));
    await a.settle();
    cloud.state.offline = true;
    await mutate(b, (s, c) => linkToFocus(s, { ...c, createId: () => 'focuslink-from-b' }, { focusId: bFocus, target: { kind: 'task', id: bTask }, relation: 'next_action' }));
    cloud.state.offline = false;
    await b.settle();
    await b.settle();

    const live = cloud.table('rebuild_focus_links').filter((l) => l.status === 'active');
    const onB = liveLinksOf(b.store.getSnapshot().state, bFocus);
    assert.equal(onB.length, 1, 'B holds one live connection, not two');
    assert.equal(openNextActions(b.store.getSnapshot().state, bFocus).length, 1, 'and counts one next step');
    assert.ok(live.length >= 1);
  });
});
