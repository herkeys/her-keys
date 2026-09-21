import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReachable, clientFor, createDeviceStore, offlineTransport, withLostAck } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

/**
 * The sync journeys, against the REAL local Supabase: real HTTP, real
 * PostgREST, real RLS, real CAS, real change_log, real barrier. Fault injection
 * happens only at the client-side transport boundary — the request really is
 * sent and the server really does commit; only the answer is discarded.
 *
 * Every device here has its own persisted blob, queue, cursor, mappings and
 * coordinator. They share the backend and nothing else.
 */
export async function syncIntegration(check, psql) {
  console.log('\n  sync engine — real local Supabase');

  if (!(await apiReachable())) {
    check('sync: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }

  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await load();

  // Synthetic local accounts, minted per run. Reusing fixed ids would let one
  // run meet the previous run's rows and call that a duplicate.
  const A = crypto.randomUUID();
  const B = crypto.randomUUID();
  const C = crypto.randomUUID();
  const D = crypto.randomUUID();
  const E = crypto.randomUUID();
  const F = crypto.randomUUID();
  const G = crypto.randomUUID();
  psql(
    'postgres',
    `INSERT INTO auth.users (id, email, aud, role) VALUES
       ('${A}','sync-${A}@local.test','authenticated','authenticated'),
       ('${B}','sync-${B}@local.test','authenticated','authenticated'),
       ('${C}','sync-${C}@local.test','authenticated','authenticated'),
       ('${D}','sync-${D}@local.test','authenticated','authenticated'),
       ('${E}','sync-${E}@local.test','authenticated','authenticated'),
       ('${F}','sync-${F}@local.test','authenticated','authenticated'),
       ('${G}','sync-${G}@local.test','authenticated','authenticated')
     ON CONFLICT (id) DO NOTHING;`,
    { label: 'sync fixture users' }
  );

  await journeyPostClaim(check, m, A);
  await journeySecondDevice(check, m, B);
  await journeyOfflineConflict(check, m, C);
  await journeyOneMoveAndLedger(check, m, D, psql);
  await journeyFoundation(check, m, E, F, psql);
  await journeyFoundationConflicts(check, m, G, psql);
}

async function load() {
  const at = (p) => `file://${join(REPO, 'src', ...p)}`;
  const [types, queue, claimSeam, push, pull, coordinator, apply, projection, transport, initial, rules, specs, rich, auth, resp, struct, tasksOps, state, interp] = await Promise.all([
    import(at(['domain', 'sync', 'syncTypes.ts'])),
    import(at(['domain', 'sync', 'queue.ts'])),
    import(at(['domain', 'sync', 'claimSeam.ts'])),
    import(at(['domain', 'sync', 'pushEngine.ts'])),
    import(at(['domain', 'sync', 'pullEngine.ts'])),
    import(at(['domain', 'sync', 'coordinator.ts'])),
    import(at(['domain', 'sync', 'apply.ts'])),
    import(at(['domain', 'sync', 'projection.ts'])),
    import(at(['platform', 'supabaseSyncTransport.ts'])),
    import(at(['state', 'initialState.ts'])),
    import(at(['domain', 'sync', 'domainRules.ts'])),
    import(at(['domain', 'sync', 'foundationSpecs.ts'])),
    import(`file://${join(REPO, 'tests', 'support', 'richHousehold.mjs')}`),
    import(at(['domain', 'authorization.ts'])),
    import(at(['domain', 'responsibility.ts'])),
    import(at(['domain', 'structure.ts'])),
    import(at(['domain', 'tasks.ts'])),
    import(at(['domain', 'state.ts'])),
    import(at(['domain', 'interpretations.ts'])),
  ]);
  return { types, queue, claimSeam, push, pull, coordinator, apply, projection, transport, initial, rules, specs, rich, auth, resp, struct, tasksOps, state, interp };
}

const TZ = 'America/Chicago';

/** One simulated installation: its own store, namespace, state and coordinator. */
function makeDevice(m, { accountId, deviceId, householdId, state, namespace, transport }) {
  const store = createDeviceStore();
  let currentState = state;
  let currentNamespace = namespace;
  store.commit(currentState, currentNamespace);

  const device = {
    accountId,
    deviceId,
    store,
    state: () => currentState,
    namespace: () => currentNamespace,
    setState(next) {
      currentState = next;
    },
    enqueue(kind, localId, op, at = new Date().toISOString()) {
      const result = m.queue.enqueue(currentNamespace, { kind, localId, op, at });
      if (result.ok) currentNamespace = result.namespace;
      // ONE durable operation: the domain change and its sync intent land
      // together, so a crash cannot keep the change and lose the intent.
      store.commit(currentState, currentNamespace);
      return result;
    },
    coordinator: null,
  };

  device.coordinator = m.coordinator.createSyncCoordinator({
    accountId,
    activeAccountId: () => device.activeAccount ?? accountId,
    namespace: () => currentNamespace,
    state: () => currentState,
    commit: async (nextState, nextNamespace) => {
      store.commit(nextState, nextNamespace);
      currentState = nextState;
      currentNamespace = nextNamespace;
    },
    householdId,
    profileId: accountId,
    now: () => Date.now(),
    push: { householdId, profileId: accountId, deviceId, transport, now: () => Date.now() },
    report: (event) => {
      if (event.type === 'sync.integrity_refused') console.log('      INTEGRITY:', event.detail);
    },
    pull: {
      transport,
      now: () => Date.now(),
      applyRow: (s, kind, localId, row, resolve) => m.apply.applyCloudRow(s, kind, localId, row, resolve),
      applyTombstone: (s, kind, localId) => m.apply.applyCloudTombstone(s, kind, localId),
      // The product's own rules, not test scaffolding: whether the server row IS what this device was
      // sending (a lost acknowledgement), and which local row an authoritative row displaces.
      matchesLocal: (kind, localId, row) =>
        m.rules.rowMatchesLocal(currentState, { householdId, profileId: accountId, namespace: currentNamespace }, kind, localId, row),
      displacedBy: (s, kind, localId, row, resolve, isPending) => m.rules.displacedBy(s, kind, localId, row, resolve, isPending),
      dropLocal: (s, kind, localId) => m.rules.dropLocal(s, kind, localId),
      // A minted local id must itself be a legal local id: the app's Id pattern
      // allows letters, digits and `._:-` only.
      mintLocalId: (kind, wanted) => `${wanted}-x${deviceId.slice(0, 4)}`,
    },
  });

  /** Throw the runtime away and rebuild from the blob, as a relaunch would. */
  device.restart = () => {
    const blob = store.read();
    currentState = blob.state;
    currentNamespace = blob.namespace;
    return device;
  };

  return device;
}

async function bootstrapCloud(m, accountId, deviceId) {
  const client = clientFor(accountId);
  const { data, error } = await client.rpc('bootstrap_account', {
    p_claim_key: crypto.randomUUID(),
    p_timezone: TZ,
    p_device_id: deviceId,
  });
  if (error) throw new Error(`bootstrap failed: ${error.message}`);
  return { client, householdId: data.household_id, idMap: data.id_map };
}

const task = (id, over = {}) => ({
  id,
  title: `Task ${id}`,
  categoryId: 'cat-home',
  subjectMemberId: null,
  durationMinutes: 10,
  commitment: 'flexible',
  dueDate: null,
  plan: { kind: 'unplanned' },
  notes: null,
  status: 'open',
  completedAt: null,
  createdAt: null,
  updatedAt: null,
  provenance: { producer: 'user-action', artifactId: null, confidence: null },
  scope: 'household',
  ...over,
});

// ---------------------------------------------------------------------------
// Journey 1 — the claim -> sync seam, both directions, then ordinary work.
// ---------------------------------------------------------------------------
async function journeyPostClaim(check, m, accountId) {
  const deviceId = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceId);

  const state = m.initial.createEmptyState(TZ);
  const namespace = m.claimSeam.namespaceFromClaim({ state, accountId, householdId, deviceId, idMap });

  check(
    'sync: the namespace adopts the claim id map rather than rediscovering the cloud',
    Object.keys(namespace.mappings).length === 10,
    `${Object.keys(namespace.mappings).length} mappings (household + owner + 8 starter categories)`
  );

  const transport = m.transport.createSupabaseSyncTransport(client);
  const device = makeDevice(m, { accountId, deviceId, householdId, state, namespace, transport });

  // 1. The FIRST sync after a claim must create nothing: everything it can see
  //    is already mapped. This is the push side of the seam.
  await device.coordinator.request('foreground');
  const afterFirst = await countRows(client, householdId);
  check(
    'sync: 1. the first sync after a claim creates no duplicate rows',
    afterFirst.categories === 8 && afterFirst.tasks === 0,
    `categories=${afterFirst.categories} tasks=${afterFirst.tasks}`
  );

  // The PULL side of the seam: the first pull meets the claim's own change_log
  // rows and resolves them straight onto the existing mappings.
  check(
    'sync: X. the first pull consumed the claim\'s own change_log without duplicating anything',
    device.namespace().cursor !== '0' && Object.keys(device.namespace().mappings).length === 11,
    `cursor=${device.namespace().cursor} mappings=${Object.keys(device.namespace().mappings).length}`
  );
  check(
    'sync: X. pulled state produced no outbound work',
    device.namespace().queue.length === 0,
    `${device.namespace().queue.length} queued`
  );

  // 2. A new local object, pushed, receives a stable cloud uuid.
  device.setState({ ...device.state(), tasks: [task('task-1')] });
  device.enqueue('task', 'task-1', 'create');
  await device.coordinator.request('localMutation');

  const mapping = device.namespace().mappings['task:task-1'];
  check('sync: 4. a new local object receives a cloud uuid mapping after push', Boolean(mapping?.cloudId), mapping?.cloudId);
  check('sync: 2. the push settled the queue', device.namespace().queue.length === 0);

  // 6. Its own write comes back on a later pull without a false conflict.
  await device.coordinator.request('manual');
  check(
    'sync: 6. the pushed write returning in a pull is recognised, not a false conflict',
    m.types.needsSyncAttentionCount(device.namespace()) === 0 && device.namespace().queue.length === 0,
    `unresolved=${m.types.needsSyncAttentionCount(device.namespace())}`
  );
  const afterOwn = await countRows(client, householdId);
  check('sync: 6b. and created no second row', afterOwn.tasks === 1, `tasks=${afterOwn.tasks}`);

  // 12/T. Push accepted, acknowledgement lost, then a restart. The retry must
  //       settle on the row the server already has.
  device.setState({ ...device.state(), tasks: [...device.state().tasks, task('task-lost')] });
  device.enqueue('task', 'task-lost', 'create');
  const lossy = withLostAck(transport, { create: 1 });
  const lossyDevice = makeDevice(m, {
    accountId,
    deviceId,
    householdId,
    state: device.state(),
    namespace: device.namespace(),
    transport: lossy,
  });
  await lossyDevice.coordinator.request('manual');
  check(
    'sync: 12. a lost acknowledgement leaves the work queued, not settled',
    lossyDevice.namespace().queue.length === 1,
    `${lossyDevice.namespace().queue.length} queued`
  );

  const rebuilt = lossyDevice.restart();
  const settled = makeDevice(m, {
    accountId,
    deviceId,
    householdId,
    state: rebuilt.state(),
    namespace: rebuilt.namespace(),
    transport,
  });
  await settled.coordinator.request('manual');
  const afterRetry = await countRows(client, householdId);
  check(
    'sync: 12/T. the retry after a lost ack settles on the SAME row — no duplicate',
    afterRetry.tasks === 2 && settled.namespace().queue.length === 0,
    `tasks=${afterRetry.tasks} queued=${settled.namespace().queue.length}`
  );
  check(
    'sync: T. and it resolved to an authoritative uuid rather than creating another',
    Boolean(settled.namespace().mappings['task:task-lost']?.cloudId)
  );

  // 19/20. Auth degraded: local work continues and the queue waits.
  device.setState({ ...device.state(), tasks: [...device.state().tasks, task('task-offline')] });
  device.enqueue('task', 'task-offline', 'create');
  const down = makeDevice(m, {
    accountId,
    deviceId,
    householdId,
    state: device.state(),
    namespace: device.namespace(),
    transport: offlineTransport(),
  });
  await down.coordinator.request('foreground');
  check(
    'sync: 19. offline keeps the work queued and the local household usable',
    down.namespace().queue.length >= 1 && down.state().tasks.length === 3,
    `queued=${down.namespace().queue.length} localTasks=${down.state().tasks.length}`
  );
  check('sync: 19b. and reports a degraded phase rather than an error', down.coordinator.snapshot().phase === 'offline');

  const resumed = makeDevice(m, {
    accountId,
    deviceId,
    householdId,
    state: down.restart().state(),
    namespace: down.namespace(),
    transport,
  });
  await resumed.coordinator.request('authRestored');
  check(
    'sync: 20. the same queue resumes under the same account when auth returns',
    resumed.namespace().queue.length === 0 && Boolean(resumed.namespace().mappings['task:task-offline']),
    `queued=${resumed.namespace().queue.length}`
  );

  // 16/V. The account guard, mid-cycle.
  const guarded = makeDevice(m, {
    accountId,
    deviceId,
    householdId,
    state: resumed.state(),
    namespace: resumed.namespace(),
    transport,
  });
  guarded.setState({ ...guarded.state(), tasks: [...guarded.state().tasks, task('task-guard')] });
  guarded.enqueue('task', 'task-guard', 'create');
  guarded.activeAccount = crypto.randomUUID();
  await guarded.coordinator.request('manual');
  const afterGuard = await countRows(client, householdId);
  check(
    'sync: V. a mid-cycle account mismatch aborts before anything is uploaded',
    afterGuard.tasks === 3 && guarded.namespace().queue.length === 1,
    `cloudTasks=${afterGuard.tasks} queued=${guarded.namespace().queue.length}`
  );
  check('sync: V b. and the namespace is untouched', guarded.namespace().accountId === accountId);
}

// ---------------------------------------------------------------------------
// Journey 2 — a second, empty device hydrates from the cloud.
// ---------------------------------------------------------------------------
async function journeySecondDevice(check, m, accountId) {
  const deviceA = crypto.randomUUID();
  const deviceB = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceA);

  const stateA = m.initial.createEmptyState(TZ);
  const nsA = m.claimSeam.namespaceFromClaim({ state: stateA, accountId, householdId, deviceId: deviceA, idMap });
  const transportA = m.transport.createSupabaseSyncTransport(client);
  const a = makeDevice(m, { accountId, deviceId: deviceA, householdId, state: stateA, namespace: nsA, transport: transportA });

  a.setState({ ...a.state(), tasks: [task('task-a1', { title: 'Book the dentist' })] });
  a.enqueue('task', 'task-a1', 'create');
  await a.coordinator.request('localMutation');

  // Device B starts empty and unhydrated.
  const b = makeDevice(m, {
    accountId,
    deviceId: deviceB,
    householdId,
    state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: deviceB }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });

  check('sync: J. a new device starts UNHYDRATED, not ready', b.namespace().hydration === 'unhydrated');
  check('sync: AB. the two devices have distinct origin device ids', deviceA !== deviceB);

  await b.coordinator.request('foreground');

  const pulled = b.state().tasks.find((t) => t.title === 'Book the dentist');
  check('sync: 13. the empty second device hydrated the household from the cloud', Boolean(pulled), pulled?.id);
  check(
    'sync: 13b. it holds cloud uuids and server revisions, not guesses',
    Object.values(b.namespace().mappings).some((x) => x.kind === 'task' && x.revision >= 1)
  );
  check('sync: 13c. and a safe cursor', b.namespace().cursor !== '0', `cursor=${b.namespace().cursor}`);
  check(
    'sync: 32. pulled state produced NO outbound mutation — it is not a local edit',
    b.namespace().queue.length === 0,
    `${b.namespace().queue.length} queued`
  );

  // 14. Device B edits; device A pulls it.
  const localTaskId = pulled.id;
  b.setState({
    ...b.state(),
    tasks: b.state().tasks.map((t) => (t.id === localTaskId ? { ...t, title: 'Book the dentist for Friday' } : t)),
  });
  b.enqueue('task', localTaskId, 'update');
  await b.coordinator.request('localMutation');
  check('sync: 14. device B pushed its edit', b.namespace().queue.length === 0);

  await a.coordinator.request('manual');
  const onA = a.state().tasks.find((t) => t.id === 'task-a1');
  check('sync: 14b. device A pulled device B\'s edit', onA?.title === 'Book the dentist for Friday', onA?.title);
  check(
    'sync: 14c. without inventing a conflict',
    m.types.needsSyncAttentionCount(a.namespace()) === 0,
    `unresolved=${m.types.needsSyncAttentionCount(a.namespace())}`
  );

  // 29. A duplicate pull batch is idempotent.
  const beforeReplay = JSON.stringify(a.state().tasks);
  const replay = makeDevice(m, {
    accountId,
    deviceId: deviceA,
    householdId,
    state: a.state(),
    namespace: { ...a.namespace(), cursor: '0' },
    transport: transportA,
  });
  await replay.coordinator.request('manual');
  check(
    'sync: 29. replaying the whole change log from cursor 0 changes nothing',
    JSON.stringify(replay.state().tasks) === beforeReplay,
    'state is byte-identical after a full replay'
  );
  check('sync: 29b. and produced no duplicate rows', (await countRows(client, householdId)).tasks === 1);

  // L. Crash mid-hydration: the namespace must not masquerade as ready.
  const crashing = makeDevice(m, {
    accountId,
    deviceId: crypto.randomUUID(),
    householdId,
    state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: crypto.randomUUID() }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });
  crashing.store.failNextCommit();
  let died = false;
  try {
    await crashing.coordinator.request('foreground');
  } catch {
    died = true;
  }
  const afterCrash = crashing.restart();
  check('sync: L. a crash mid-hydration was not swallowed', died);
  check(
    'sync: L b. on restart the namespace is still UNHYDRATED with cursor 0',
    afterCrash.namespace().hydration === 'unhydrated' && afterCrash.namespace().cursor === '0',
    `hydration=${afterCrash.namespace().hydration} cursor=${afterCrash.namespace().cursor}`
  );
  check(
    'sync: L c. and no partial household was left behind',
    afterCrash.state().tasks.length === 0,
    `${afterCrash.state().tasks.length} tasks`
  );

  const recovered = makeDevice(m, {
    accountId,
    deviceId: crypto.randomUUID(),
    householdId,
    state: afterCrash.state(),
    namespace: afterCrash.namespace(),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });
  await recovered.coordinator.request('foreground');
  check(
    'sync: L d. hydration replays cleanly afterwards',
    recovered.state().tasks.length === 1,
    `${recovered.state().tasks.length} tasks`
  );
}

// ---------------------------------------------------------------------------
// Journey 3 — two devices, offline, same row. CAS and conflict preservation.
// ---------------------------------------------------------------------------
async function journeyOfflineConflict(check, m, accountId) {
  const deviceA = crypto.randomUUID();
  const deviceB = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceA);

  const state = m.initial.createEmptyState(TZ);
  const ns = m.claimSeam.namespaceFromClaim({ state, accountId, householdId, deviceId: deviceA, idMap });
  const transportA = m.transport.createSupabaseSyncTransport(client);

  const a = makeDevice(m, { accountId, deviceId: deviceA, householdId, state, namespace: ns, transport: transportA });
  a.setState({ ...a.state(), tasks: [task('task-shared', { title: 'Original' })] });
  a.enqueue('task', 'task-shared', 'create');
  await a.coordinator.request('localMutation');

  // Device B hydrates, so both hold the same row at the same revision.
  const b = makeDevice(m, {
    accountId,
    deviceId: deviceB,
    householdId,
    state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: deviceB }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });
  await b.coordinator.request('foreground');
  const bTaskId = b.state().tasks[0]?.id;
  check('sync: P. both devices hold the same row', Boolean(bTaskId));

  const baseA = a.namespace().mappings['task:task-shared'].revision;
  const baseB = b.namespace().mappings[`task:${bTaskId}`].revision;
  check('sync: P b. at the same server revision', baseA === baseB, `A=${baseA} B=${baseB}`);

  // Both edit offline.
  a.setState({ ...a.state(), tasks: a.state().tasks.map((t) => ({ ...t, title: 'A wins the race' })) });
  a.enqueue('task', 'task-shared', 'update');
  b.setState({ ...b.state(), tasks: b.state().tasks.map((t) => ({ ...t, title: 'B was slower' })) });
  b.enqueue('task', bTaskId, 'update');

  // 30/E. More offline edits on B must NOT become more queue items.
  b.setState({ ...b.state(), tasks: b.state().tasks.map((t) => ({ ...t, title: 'B changed her mind' })) });
  b.enqueue('task', bTaskId, 'update');
  b.setState({ ...b.state(), tasks: b.state().tasks.map((t) => ({ ...t, title: 'B, finally' })) });
  b.enqueue('task', bTaskId, 'update');
  const bItem = b.namespace().queue.find((q) => q.localId === bTaskId);
  check(
    'sync: 30/E. three offline edits coalesce to ONE work item at the ORIGINAL base revision',
    b.namespace().queue.length === 1 && bItem.baseRevision === baseB,
    `queued=${b.namespace().queue.length} base=${bItem?.baseRevision}`
  );

  // A reconnects first and wins.
  await a.coordinator.request('networkRestored');
  check('sync: P c. device A pushed successfully', a.namespace().queue.length === 0);

  // B reconnects and must lose the CAS.
  await b.coordinator.request('networkRestored');
  const unresolved = m.types.unresolvedEvidence(b.namespace());
  const cas = unresolved.find((e) => e.evidence === 'cas-conflict');
  check('sync: 7/P. device B\'s stale write became CAS conflict evidence', Boolean(cas), cas?.detail);
  check('sync: 7b. her intent was NOT auto-applied to the new revision', b.namespace().queue.length === 0);
  check(
    'sync: 7c. needsSyncAttention is now true, with a count',
    m.types.needsSyncAttention(b.namespace()) && m.types.needsSyncAttentionCount(b.namespace()) >= 1,
    `count=${m.types.needsSyncAttentionCount(b.namespace())}`
  );

  const onB = b.state().tasks.find((t) => t.id === bTaskId);
  check(
    'sync: 7d. and device B adopted the authoritative server row, with no field merge',
    onB?.title === 'A wins the race',
    onB?.title
  );

  const cloudTitle = await scalarTitle(client, householdId);
  check('sync: 7e. the cloud row is A\'s, untouched by B', cloudTitle === 'A wins the race', cloudTitle);

  // 8. An unrelated row keeps syncing after that conflict.
  b.setState({ ...b.state(), tasks: [...b.state().tasks, task('task-unrelated', { title: 'Unrelated' })] });
  b.enqueue('task', 'task-unrelated', 'create');
  await b.coordinator.request('localMutation');
  check(
    'sync: 8. an unrelated row still syncs after another row conflicted',
    Boolean(b.namespace().mappings['task:task-unrelated']?.cloudId) && b.namespace().queue.length === 0
  );
  check(
    'sync: 8b. and the conflict evidence survived that cycle',
    m.types.needsSyncAttentionCount(b.namespace()) >= 1
  );

  // 27. The queue survives a process restart.
  b.setState({ ...b.state(), tasks: [...b.state().tasks, task('task-restart')] });
  b.enqueue('task', 'task-restart', 'create');
  const before = b.namespace().queue.length;
  const afterRestart = b.restart();
  check(
    'sync: 27. the durable queue and its evidence survive a restart',
    afterRestart.namespace().queue.length === before && m.types.needsSyncAttentionCount(afterRestart.namespace()) >= 1,
    `queued=${afterRestart.namespace().queue.length}`
  );
}

async function countRows(client, householdId) {
  const [tasks, categories] = await Promise.all([
    client.from('tasks').select('id').eq('household_id', householdId),
    client.from('household_categories').select('id').eq('household_id', householdId),
  ]);
  return { tasks: (tasks.data ?? []).length, categories: (categories.data ?? []).length };
}

async function scalarTitle(client, householdId) {
  const { data } = await client.from('tasks').select('title').eq('household_id', householdId).eq('local_id', 'task-shared');
  return data?.[0]?.title ?? null;
}

// ---------------------------------------------------------------------------
// Journey 4 — One Move across two devices and two timezones (HR-03), the
// action ledger, and a cursor spanning two server transactions.
// ---------------------------------------------------------------------------
async function journeyOneMoveAndLedger(check, m, accountId, psql) {
  const deviceA = crypto.randomUUID();
  const deviceB = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceA);

  const state = m.initial.createEmptyState(TZ);
  const nsA = m.claimSeam.namespaceFromClaim({ state, accountId, householdId, deviceId: deviceA, idMap });
  const transportA = m.transport.createSupabaseSyncTransport(client);
  const a = makeDevice(m, { accountId, deviceId: deviceA, householdId, state, namespace: nsA, transport: transportA });

  a.setState({ ...a.state(), tasks: [task('task-move', { title: 'Rinse the recycling' })] });
  a.enqueue('task', 'task-move', 'create');
  await a.coordinator.request('localMutation');

  // The household's logical day is America/Chicago local time — the server
  // owns logical_day from the timezone at decision, so "today" must be
  // computed in that timezone, not UTC (between 00:00 and 06:00 UTC the two
  // days differ, and this check failed there through no product change).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(new Date());
  a.setState({
    ...a.state(),
    oneMoves: [{
      id: `onemove-${today}`, forDate: today, targetId: 'task-move', targetType: 'task',
      status: 'selected', decidedAt: new Date().toISOString(), completedAt: null,
      provenance: { producer: 'system-derived', artifactId: null, confidence: null }, scope: 'personal',
    }],
  });
  a.enqueue('oneMove', `onemove-${today}`, 'create');

  // Q/HR-03. Device B, in ANOTHER timezone, decided its OWN One Move for the
  // same product day while it had not yet seen A's. Exactly one row may live.
  const b = makeDevice(m, {
    accountId,
    deviceId: deviceB,
    householdId,
    state: m.initial.createEmptyState('Europe/London'),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: deviceB }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });
  await b.coordinator.request('foreground');

  check('sync: Q pre. device B hydrated the task it needs', b.state().tasks.length === 1, `tasks=${b.state().tasks.length} phase=${b.coordinator.snapshot().phase} detail=${b.coordinator.snapshot().detail}`);
  const bTask = b.state().tasks[0];
  b.setState({
    ...b.state(),
    // Local state permits one One Move per day, so this IS B's decision for
    // the day -- not a second row stacked on top of one it has not seen.
    oneMoves: [{
      id: 'onemove-b-own', forDate: today, targetId: bTask.id, targetType: 'task',
      status: 'selected', decidedAt: new Date().toISOString(), completedAt: null,
      provenance: { producer: 'system-derived', artifactId: null, confidence: null }, scope: 'personal',
    }],
  });
  b.enqueue('oneMove', 'onemove-b-own', 'create');

  // A reaches the server first and its decision becomes the authoritative one.
  await a.coordinator.request('localMutation');
  const moveRow = await oneMoveRow(client, householdId);
  check('sync: 23. today One Move pushed, and the SERVER owns its logical day', moveRow?.logical_day === today, moveRow?.logical_day);
  check(
    'sync: 23b. with the timezone at decision recorded as evidence, never sent by the client',
    moveRow?.timezone_at_decision === TZ,
    moveRow?.timezone_at_decision
  );
  check('sync: 23c. and a TYPED target, never polymorphic', Boolean(moveRow?.target_task_id) && moveRow?.target_needs_me_id === null);

  await b.coordinator.request('localMutation');

  const moveCount = await countOneMoves(client, householdId);
  check(
    'sync: Q/HR-03. exactly ONE One Move survives that product day, across two devices in two timezones',
    moveCount === 1,
    `${moveCount} rows`
  );
  const domain = m.types.unresolvedEvidence(b.namespace()).find((e) => e.evidence === 'domain-conflict');
  check(
    'sync: R. the second device competing decision is a DOMAIN conflict, not a generic validation failure',
    Boolean(domain),
    domain?.detail?.slice(0, 80)
  );
  check('sync: Q b. and her intent was not silently dropped', m.types.needsSyncAttention(b.namespace()));

  // 35. Completion transitions and reaches the other device.
  a.setState({
    ...a.state(),
    oneMoves: a.state().oneMoves.map((o) => ({ ...o, status: 'completed', completedAt: new Date().toISOString() })),
  });
  a.enqueue('oneMove', `onemove-${today}`, 'update');
  await a.coordinator.request('localMutation');
  await b.coordinator.request('manual');
  const onB = b.state().oneMoves.find((o) => o.status === 'completed');
  check('sync: 35. a completion transition reaches the second device', Boolean(onB), onB?.status);
  check('sync: 35b. without losing its target', Boolean(onB?.targetId), onB?.targetId);

  // 24. The action ledger: push, pull, immutable.
  a.setState({
    ...a.state(),
    actions: [{
      id: 'act-1', type: 'daily_load.drop_task', approval: 'approved', targetId: 'task-move',
      reason: { code: 'capacity_pressure', totalAvailableMinutes: 120, totalFlexibleNeededMinutes: 150, shortfallMinutes: 30 },
      before: { status: 'open' }, after: { status: 'archived' },
      logicalDate: today, createdAt: new Date().toISOString(),
      actor: 'user', source: 'her_keys_recommendation', scope: 'personal',
    }],
  });
  a.enqueue('action', 'act-1', 'create');
  await a.coordinator.request('localMutation');

  const ledger = await ledgerRow(client, householdId);
  check('sync: 24 pre. the ledger push reported', Boolean(ledger), `phase=${a.coordinator.snapshot().phase} detail=${a.coordinator.snapshot().detail} evidence=${JSON.stringify(m.types.unresolvedEvidence(a.namespace()).map((e) => [e.evidence, e.detail.slice(0, 120)]))}`);
  check('sync: 24. the action record pushed', Boolean(ledger), ledger?.action_type);
  check(
    'sync: 24b. its target is a CLOUD uuid, never a local id (SD4-007)',
    Boolean(ledger?.target_id) && ledger.target_id !== 'task-move',
    ledger?.target_id
  );

  const mutate = await client.from('action_records').update({ approval: 'declined' }).eq('id', ledger.id).select('*');
  check(
    'sync: 24c. and it is immutable: a valid session cannot update it',
    (mutate.data ?? []).length === 0 || Boolean(mutate.error),
    mutate.error?.code ?? 'no rows updated'
  );

  await b.coordinator.request('manual');
  check('sync: 24d. the second device pulled the ledger row', b.state().actions.length === 1, `${b.state().actions.length} actions`);
  const beforeReplay = JSON.stringify(b.state().actions);
  await b.coordinator.request('manual');
  check(
    'sync: 24e. and a second delivery changed nothing: history is not regenerated',
    JSON.stringify(b.state().actions) === beforeReplay
  );

  // 9. Two separate server transactions, then a cursor that spans both.
  const cursorBefore = a.namespace().cursor;
  b.setState({ ...b.state(), tasks: [...b.state().tasks, task('task-tx1', { title: 'Tx one' })] });
  b.enqueue('task', 'task-tx1', 'create');
  await b.coordinator.request('localMutation');
  b.setState({ ...b.state(), tasks: [...b.state().tasks, task('task-tx2', { title: 'Tx two' })] });
  b.enqueue('task', 'task-tx2', 'create');
  await b.coordinator.request('localMutation');

  await a.coordinator.request('manual');
  const sawBoth = ['Tx one', 'Tx two'].every((title) => a.state().tasks.some((t) => t.title === title));
  check('sync: 9. a cursor spanning TWO server transactions skipped neither', sawBoth);
  check('sync: 9b. and advanced past both', a.namespace().cursor !== cursorBefore, `${cursorBefore} -> ${a.namespace().cursor}`);
}


// ---------------------------------------------------------------------------
// Journey 5 — the FOUNDATION kinds, against the real database (B4-FOUNDATION-BUILDOUT-01).
//
// One device writes a row of every client-written kind; the database accepts them all; a brand-new
// second device hydrates and holds EXACTLY the same household; the server writes an execution and an
// outcome that both devices then pull; a stranger's account sees none of it.
// ---------------------------------------------------------------------------
async function journeyFoundation(check, m, accountId, strangerId, psql) {
  const deviceA = crypto.randomUUID();
  const deviceB = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceA);

  const { state: rich } = m.rich.richHousehold({ withOneMove: false });
  const nsA = m.claimSeam.namespaceFromClaim({ state: rich, accountId, householdId, deviceId: deviceA, idMap });
  const a = makeDevice(m, { accountId, deviceId: deviceA, householdId, state: rich, namespace: nsA, transport: m.transport.createSupabaseSyncTransport(client) });

  const specs = m.specs.FOUNDATION_SPECS;
  const plan = [
    ['task', rich.tasks.map((t) => t.id)], ['event', rich.events.map((e) => e.id)], ['system', rich.systems.map((s) => s.id)],
    ['meal', rich.meals.map((x) => x.id)], ['needsMe', rich.needsMe.map((x) => x.id)],
    ...specs.filter((s) => !s.serverWritten).map((s) => [s.kind, s.singleton ? (rich[s.collection] === null ? [] : ['capacity']) : rich[s.collection].map((r) => r.id)]),
  ];
  let expected = 0;
  for (const [kind, ids] of plan) for (const id of ids) { a.enqueue(kind, id, 'create'); expected += 1; }

  for (let pass = 0; pass < 4 && a.namespace().queue.length > 0; pass += 1) await a.coordinator.request('manual');

  const evidence = a.namespace().evidence.filter((e) => !e.resolved);
  check(`sync: F1. one device pushed ${expected} rows across 21 kinds and the database accepted every one`,
    a.namespace().queue.length === 0 && evidence.length === 0,
    `queued=${a.namespace().queue.length} evidence=${JSON.stringify(evidence.slice(0, 3).map((e) => `${e.kind}:${e.evidence}:${e.detail}`))}`);

  const counts = {};
  for (const spec of specs.filter((s) => !s.serverWritten)) {
    const { data } = await client.from(spec.table).select('id').eq('household_id', householdId);
    counts[spec.table] = (data ?? []).length;
  }
  const missing = specs.filter((s) => !s.serverWritten).filter((s) => counts[s.table] === 0).map((s) => s.table);
  check('sync: F2. every client-written foundation table holds its row in the cloud', missing.length === 0, missing.join(', ') || 'none missing');

  // Stored provenance and exact money survive the trip through the real database.
  const { data: taskRows } = await client.from('tasks').select('title,producer,confidence,source_artifact_id,value_amount_minor,value_currency,value_direction,splittable,min_chunk_minutes,energy_demand,consequence,needs_me_personally').eq('household_id', householdId);
  const fee = (taskRows ?? []).find((t) => t.title === 'Pay the $35 trip fee');
  const form = (taskRows ?? []).find((t) => t.title === 'Sign the permission form');
  check('sync: F3. an accepted inference keeps its producer, its established level and its source artifact in the cloud',
    fee?.producer === 'ai-inference' && fee?.confidence === 'established' && fee?.source_artifact_id !== null, JSON.stringify(fee));
  check('sync: F4. money is exact minor units and a direction, never a float', Number(form?.value_amount_minor) === 3500 && form?.value_currency === 'USD' && form?.value_direction === 'outflow', JSON.stringify(form));
  check('sync: F5. an unanswered facet is NULL in the cloud, not a plausible default', fee?.splittable === null && fee?.min_chunk_minutes === null && fee?.energy_demand === null);

  // ---- a brand-new second device hydrates the whole foundation ------------------------------------------
  const b = makeDevice(m, {
    accountId, deviceId: deviceB, householdId, state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: deviceB }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });
  for (let pass = 0; pass < 3; pass += 1) await b.coordinator.request('foreground');
  check('sync: F6. the second device hydrated: its cursor moved past zero and nothing is waiting to send',
    b.namespace().cursor !== '0' && b.namespace().queue.length === 0, `cursor=${b.namespace().cursor} queue=${b.namespace().queue.length}`);
  check('sync: F7. hydrating produced no outbound work and no conflict', b.namespace().queue.length === 0 && m.types.needsSyncAttentionCount(b.namespace()) === 0,
    `queue=${b.namespace().queue.length} unresolved=${m.types.needsSyncAttentionCount(b.namespace())}`);

  const byId = (rows) => [...rows].sort((x, y) => x.id.localeCompare(y.id));
  const differing = [];
  for (const spec of specs.filter((s) => !s.serverWritten)) {
    const mine = a.state()[spec.collection];
    const theirs = b.state()[spec.collection];
    const same = spec.singleton
      ? JSON.stringify(mine) === JSON.stringify(theirs)
      : JSON.stringify(byId(mine)) === JSON.stringify(byId(theirs));
    if (!same) differing.push(spec.kind);
  }
  for (const [kind, collection] of [['task', 'tasks'], ['event', 'events'], ['system', 'systems'], ['meal', 'meals'], ['needsMe', 'needsMe']]) {
    if (JSON.stringify(byId(a.state()[collection])) !== JSON.stringify(byId(b.state()[collection]))) differing.push(kind);
  }
  check('sync: F8. SECOND-DEVICE HYDRATION: the new device holds exactly what the first wrote — every kind, provenance and reference intact',
    differing.length === 0, differing.join(', ') || 'identical');
  const valid = m.state.validateAppState(b.state());
  check('sync: F9. and what it hydrated is a valid household the app would accept from disk', valid.ok, valid.ok ? '' : valid.issues.slice(0, 3).join('; '));

  // ---- the server writes what only the server can: an execution and an outcome -----------------------------
  const intentLocal = rich.intents[0].id;
  psql('postgres', `
    INSERT INTO public.action_executions
      (household_id, local_id, profile_id, intent_id, decision_id, attempt, attempted_at, result, error_class, reversibility, producer, scope, origin_created_at)
    SELECT i.household_id, 'srv-exec-1', i.profile_id, i.id, d.id, 1, now(), 'succeeded', 'none', 'reversible', 'automation', 'personal', now()
    FROM public.action_intents i JOIN public.intent_decisions d ON d.intent_id = i.id AND d.decision = 'approved'
    WHERE i.household_id = '${householdId}' AND i.local_id = '${intentLocal}';
    INSERT INTO public.action_outcomes
      (household_id, local_id, profile_id, execution_id, kind, observed_at, producer, scope, origin_created_at)
    SELECT e.household_id, 'srv-out-1', e.profile_id, e.id, 'delivered', now(), 'automation', 'personal', now()
    FROM public.action_executions e WHERE e.household_id = '${householdId}' AND e.local_id = 'srv-exec-1';`,
    { label: 'server writes an execution and an outcome' });

  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  const lifeA = m.auth.intentLifecycle(a.state(), intentLocal);
  const lifeB = m.auth.intentLifecycle(b.state(), intentLocal);
  check('sync: F10. the execution and outcome the SERVER wrote reach BOTH devices by pull, and the lifecycle derives from them',
    lifeA?.stage === 'succeeded' && lifeB?.stage === 'succeeded' && lifeB.outcomes.length === 1, `A=${lifeA?.stage} B=${lifeB?.stage}`);
  check('sync: F11. pulled server rows produced no outbound work', a.namespace().queue.length === 0 && b.namespace().queue.length === 0);

  const forged = await client.from('action_executions').insert({ household_id: householdId, local_id: 'forged', profile_id: accountId, intent_id: '00000000-0000-4000-8000-000000000001', attempt: 1, attempted_at: new Date().toISOString(), result: 'succeeded', error_class: 'none', reversibility: 'reversible', producer: 'automation', origin_created_at: new Date().toISOString() });
  check('sync: F12. a device cannot forge an execution: automation authority is not client authority', Boolean(forged.error), forged.error?.code ?? 'accepted');
  const queued = a.enqueue('execution', 'anything', 'create');
  check('sync: F13. the sync queue refuses to carry an execution at all', queued.ok === false, queued.reason);

  // ---- isolation --------------------------------------------------------------------------------------------
  const stranger = clientFor(strangerId);
  let leaked = 0;
  for (const spec of specs) {
    const { data } = await stranger.from(spec.table).select('id').eq('household_id', householdId);
    leaked += (data ?? []).length;
  }
  check('sync: F14. another account reads NONE of these rows, from any of the 18 tables', leaked === 0, `${leaked} rows leaked`);
  const anon = createAnon();
  let anonLeak = 0;
  for (const spec of specs) {
    const { data } = await anon.from(spec.table).select('id').eq('household_id', householdId);
    anonLeak += (data ?? []).length;
  }
  check('sync: F15. and an unauthenticated caller reads none', anonLeak === 0, `${anonLeak} rows`);

  // ---- a demo row can never reach the cloud ------------------------------------------------------------------
  const demoState = { ...a.state(), tasks: [...a.state().tasks, task('task-demo', { title: 'A rehearsal', categoryId: 'cat-home', provenance: { producer: 'demo-seed', artifactId: null, confidence: null } })] };
  a.setState(demoState);
  a.enqueue('task', 'task-demo', 'create');
  await a.coordinator.request('manual');
  const demoEvidence = a.namespace().evidence.filter((e) => e.localId === 'task-demo');
  const inCloud = await client.from('tasks').select('id').eq('household_id', householdId).eq('local_id', 'task-demo');
  check('sync: F16. a demo-seed row is refused by the database, kept as evidence, and never stored', demoEvidence.length === 1 && (inCloud.data ?? []).length === 0,
    `${demoEvidence.map((e) => e.evidence)} cloud=${(inCloud.data ?? []).length}`);

  return { client, householdId, a, b, deviceA, deviceB, rich };
}

// ---------------------------------------------------------------------------
// Journey 6 — two devices decide the same thing offline. Nothing is lost; the cloud keeps one answer.
// ---------------------------------------------------------------------------
async function journeyFoundationConflicts(check, m, accountId, psql) {
  const deviceA = crypto.randomUUID();
  const deviceB = crypto.randomUUID();
  const { client, householdId, idMap } = await bootstrapCloud(m, accountId, deviceA);

  const nsA = m.claimSeam.namespaceFromClaim({ state: m.initial.createEmptyState(TZ), accountId, householdId, deviceId: deviceA, idMap });
  const a = makeDevice(m, { accountId, deviceId: deviceA, householdId, state: m.initial.createEmptyState(TZ), namespace: nsA, transport: m.transport.createSupabaseSyncTransport(client) });
  const b = makeDevice(m, {
    accountId, deviceId: deviceB, householdId, state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId, householdId, deviceId: deviceB }),
    transport: m.transport.createSupabaseSyncTransport(clientFor(accountId)),
  });

  let n = 0;
  const at = (over = {}) => ({ nowMs: Date.now(), today: '2026-09-16', createId: (p) => `${p}-${deviceA.slice(0, 4)}-${++n}`, ...over });
  const atB = () => ({ nowMs: Date.now(), today: '2026-09-16', createId: (p) => `${p}-${deviceB.slice(0, 4)}-${++n}` });

  // A creates two tasks, a person, and an intent, and pushes; B hydrates.
  let sa = m.tasksOps.addTask(a.state(), at(), { title: 'Sign the form', categoryId: 'cat-kids', scope: 'household' });
  sa = m.tasksOps.addTask(sa, at(), { title: 'Pay the fee', categoryId: 'cat-money', scope: 'household' });
  sa = m.resp.addPerson(sa, at(), { displayName: 'Grandma June', relationship: 'grandparent' });
  sa = m.resp.addPerson(sa, at(), { displayName: 'Neighbour Sam', relationship: 'neighbor' });
  sa = m.auth.proposeIntent(sa, at(), { category: 'internal_reminder', summaryCode: 'nudge', about: { kind: 'task', id: sa.tasks[0].id } });
  a.setState(sa);
  for (const t of sa.tasks) a.enqueue('task', t.id, 'create');
  for (const p of sa.people) a.enqueue('person', p.id, 'create');
  a.enqueue('intent', sa.intents[0].id, 'create');
  for (let i = 0; i < 3 && a.namespace().queue.length > 0; i += 1) await a.coordinator.request('manual');
  await b.coordinator.request('foreground');
  check('sync: G1. both devices hold the same tasks, people and intent before they diverge',
    b.state().tasks.length === 2 && b.state().people.length === 2 && b.state().intents.length === 1, `${b.state().tasks.length}/${b.state().people.length}/${b.state().intents.length}`);

  // --- ONE ANSWER PER INTENT: A approves, B (offline) declines ----------------------------------------------
  const intentId = sa.intents[0].id;
  a.setState(m.auth.decideIntent(a.state(), at(), intentId, 'approved'));
  a.enqueue('decision', a.state().decisions[0].id, 'create');
  b.setState(m.auth.decideIntent(b.state(), atB(), b.state().intents[0].id, 'declined'));
  const bDecisionId = b.state().decisions[0].id;
  b.enqueue('decision', bDecisionId, 'create');

  await a.coordinator.request('manual'); // A's approval lands first
  await b.coordinator.request('manual'); // B pulls it, and its own decline is displaced — not overwritten, not lost
  const { data: answers } = await client.from('intent_decisions').select('decision').eq('household_id', householdId);
  check('sync: G2. the cloud kept exactly ONE answer for the intent', (answers ?? []).length === 1 && answers[0].decision === 'approved', JSON.stringify(answers));
  check('sync: G3. the losing device adopted the authoritative answer and holds one decision', b.state().decisions.length === 1 && b.state().decisions[0].decision === 'approved',
    b.state().decisions.map((d) => d.decision).join(','));
  const lost = b.namespace().evidence.filter((e) => !e.resolved && e.kind === 'decision');
  check('sync: G4. her displaced decision is kept as durable conflict evidence, not silently overwritten', lost.length === 1 && lost[0].evidence === 'domain-conflict',
    lost.map((e) => `${e.evidence}:${e.detail}`).join(' | '));
  check('sync: G5. the unsent decline no longer waits in the queue', !b.namespace().queue.some((q) => q.kind === 'decision'));
  check('sync: G6. and the surviving household is one the app accepts from disk', m.state.validateAppState(b.state()).ok);

  // --- ONE LIVE OWNER PER THING: both delegate the same task to different people -----------------------------
  const task0 = { kind: 'task', id: sa.tasks[1].id };
  a.setState(m.resp.delegate(a.state(), at(), { about: task0, to: { kind: 'person', id: a.state().people[0].id } }));
  const bTask = { kind: 'task', id: b.state().tasks[1].id };
  b.setState(m.resp.delegate(b.state(), atB(), { about: bTask, to: { kind: 'person', id: b.state().people[1].id } }));
  a.enqueue('responsibility', a.state().responsibilities[0].id, 'create');
  b.enqueue('responsibility', b.state().responsibilities[0].id, 'create');
  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  const { data: owners } = await client.from('responsibilities').select('state').eq('household_id', householdId);
  check('sync: G7. one thing has ONE live owner in the cloud, however many devices delegated it', (owners ?? []).length === 1, `${(owners ?? []).length} responsibilities`);
  check('sync: G8. the device that lost holds the winner\'s delegation and kept its own as evidence',
    b.state().responsibilities.length === 1 && b.namespace().evidence.some((e) => e.kind === 'responsibility' && !e.resolved),
    `${b.state().responsibilities.length} live, evidence=${b.namespace().evidence.filter((e) => e.kind === 'responsibility').length}`);

  // --- A CYCLE NEITHER DEVICE COULD SEE: A adds x requires y, B adds y requires x ----------------------------
  const x = { kind: 'task', id: sa.tasks[0].id };
  const y = { kind: 'task', id: sa.tasks[1].id };
  let dA = m.struct.addDependency(a.state(), at(), { relation: 'requires', from: x, to: y });
  a.setState(dA.state);
  a.enqueue('dependency', dA.state.dependencies[0].id, 'create');
  const bx = { kind: 'task', id: b.state().tasks[0].id };
  const by = { kind: 'task', id: b.state().tasks[1].id };
  const dB = m.struct.addDependency(b.state(), atB(), { relation: 'requires', from: by, to: bx });
  b.setState(dB.state);
  b.enqueue('dependency', dB.state.dependencies[0].id, 'create');
  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  const { data: edges } = await client.from('dependencies').select('relation').eq('household_id', householdId);
  check('sync: G9. the cloud holds ONE of the two edges — a requirement cycle is never stored', (edges ?? []).length === 1, `${(edges ?? []).length} edges`);
  check('sync: G10. the device whose edge would have closed the loop yielded it, kept as evidence, and holds valid state',
    b.state().dependencies.length === 1 && m.state.validateAppState(b.state()).ok && b.namespace().evidence.some((e) => e.kind === 'dependency' && !e.resolved),
    `${b.state().dependencies.length} edges`);

  // --- the database refuses a cycle even when a device does NOT notice (defence in depth) -------------------
  const direct = await client.rpc('sync_push', { p_entity_table: 'dependencies', p_device_id: deviceB, p_row: {
    household_id: householdId, local_id: 'dep-cycle-direct', relation: 'requires', from_type: 'task', from_task_id: (await cloudIdOf(client, 'tasks', householdId, sa.tasks[1].id)),
    to_type: 'task', to_task_id: (await cloudIdOf(client, 'tasks', householdId, sa.tasks[0].id)), status: 'active', profile_id: accountId,
    producer: 'user-action', scope: 'personal', origin_created_at: new Date().toISOString(), origin_updated_at: new Date().toISOString() } });
  check('sync: G11. a cycle sent straight at the database is refused by the database', Boolean(direct.error), direct.error?.message?.slice(0, 80) ?? 'accepted');

  // --- THE SAME DOCUMENT, FORWARDED ON TWO DEVICES: one entity, adopted — not a conflict ---------------------
  // Both devices record an artifact with the SAME digest while offline from each other. The cloud keeps one (a document is
  // stored once, by digest). The device that arrives second must not lose anything or raise a conflict: its local artifact
  // simply BECOMES the cloud's, keeps its local id, and whatever names it keeps naming it.
  const digest = 'd'.repeat(64);
  const ra = m.interp.recordArtifact(a.state(), at(), { kind: 'email', origin: 'user-submitted', provider: 'forward', contentDigest: digest });
  a.setState(ra.state);
  a.enqueue('sourceArtifact', ra.artifact.id, 'create');
  const rb = m.interp.recordArtifact(b.state(), atB(), { kind: 'email', origin: 'user-submitted', provider: 'forward', contentDigest: digest });
  const withReading = m.interp.proposeInterpretation(rb.state, atB(), { artifactId: rb.artifact.id, proposedKind: 'task', title: 'Pay the fee from the email' });
  b.setState(withReading);
  b.enqueue('sourceArtifact', rb.artifact.id, 'create');
  b.enqueue('interpretation', withReading.interpretations[0].id, 'create');
  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  await b.coordinator.request('manual');
  const { data: artifacts } = await client.from('source_artifacts').select('id,local_id').eq('household_id', householdId).eq('content_digest', digest);
  check('sync: G12. one document forwarded from two devices is ONE artifact in the cloud', (artifacts ?? []).length === 1, `${(artifacts ?? []).length} artifacts`);
  check('sync: G13. the second device kept its own local id and now maps it to the cloud row the first created',
    (artifacts ?? []).length === 1 && b.namespace().mappings[`sourceArtifact:${rb.artifact.id}`]?.cloudId === artifacts[0].id,
    b.namespace().mappings[`sourceArtifact:${rb.artifact.id}`]?.cloudId ?? 'unmapped');
  check('sync: G14. and no conflict was raised for it: nothing competed', !b.namespace().evidence.some((e) => e.kind === 'sourceArtifact'),
    b.namespace().evidence.filter((e) => e.kind === 'sourceArtifact').map((e) => e.evidence).join(','));
  const { data: readings } = await client.from('interpretations').select('artifact_id,source_artifact_id').eq('household_id', householdId);
  check('sync: G15. the reading that named the adopted artifact reached the cloud naming THE cloud artifact',
    (readings ?? []).length === 1 && readings[0].artifact_id === artifacts?.[0]?.id && readings[0].source_artifact_id === artifacts?.[0]?.id && b.namespace().queue.length === 0,
    JSON.stringify(readings));

  // --- ONE CAPACITY PROFILE PER PERSON: two devices set it before either has seen the other ----------------------
  a.setState(m.struct.setCapacity(a.state(), at(), { dayEndMinutes: 20 * 60 }));
  a.enqueue('capacity', 'capacity', 'create');
  b.setState(m.struct.setCapacity(b.state(), atB(), { dayEndMinutes: 18 * 60 }));
  b.enqueue('capacity', 'capacity', 'create');
  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  const { data: caps } = await client.from('capacity_profiles').select('day_end_minutes').eq('household_id', householdId);
  check('sync: G16. the cloud holds ONE capacity profile for her', (caps ?? []).length === 1 && caps[0].day_end_minutes === 1200, JSON.stringify(caps));
  check('sync: G17. the device that lost holds the authoritative profile, and kept its own setting as evidence',
    b.state().capacity?.dayEndMinutes === 1200 && b.namespace().evidence.some((e) => e.kind === 'capacity' && !e.resolved),
    `dayEnd=${b.state().capacity?.dayEndMinutes} evidence=${b.namespace().evidence.filter((e) => e.kind === 'capacity').length}`);
  check('sync: G18. and both devices are quiet afterwards: nothing left waiting, state valid',
    a.namespace().queue.length === 0 && b.namespace().queue.length === 0 && m.state.validateAppState(b.state()).ok);

  // --- A PERMISSION SHE WITHDRAWS REACHES EVERY DEVICE ----------------------------------------------------------
  // Regression for PD-001: the revoke-only trigger refused an update that carried the client's origin_updated_at, so a
  // revocation could be made locally and never arrive — the other device would keep honouring a permission she took back.
  a.setState(m.auth.grantAuthority(a.state(), at(), { category: 'internal_reminder', mode: 'execute_authorized', persistent: true }));
  const permission = a.state().authorities[0];
  a.enqueue('authority', permission.id, 'create');
  await a.coordinator.request('manual');
  await b.coordinator.request('manual');
  check('sync: H1. a standing permission she grants reaches the other device, still in force',
    b.state().authorities.length === 1 && b.state().authorities[0].revokedAt === null, JSON.stringify(b.state().authorities.map((x) => x.revokedAt)));
  a.setState(m.auth.revokeAuthority(a.state(), at(), permission.id));
  a.enqueue('authority', permission.id, 'update');
  await a.coordinator.request('manual');
  const { data: stored } = await client.from('automation_authorities').select('revoked_at').eq('household_id', householdId);
  check('sync: H2. her revocation is ACCEPTED by the database (not refused as an edit to a locked row)',
    (stored ?? []).length === 1 && stored[0].revoked_at !== null && a.namespace().queue.length === 0 && !a.namespace().evidence.some((e) => e.kind === 'authority' && !e.resolved),
    JSON.stringify(stored));
  await b.coordinator.request('manual');
  check('sync: H3. the other device now holds the permission as WITHDRAWN', b.state().authorities[0]?.revokedAt !== null && b.state().authorities[0]?.revokedAt !== undefined,
    String(b.state().authorities[0]?.revokedAt));
  const proposed = m.auth.proposeIntent(b.state(), atB(), { category: 'internal_reminder', summaryCode: 'nudge-after-revoke', about: { kind: 'task', id: b.state().tasks[0].id } });
  const fresh = proposed.intents[proposed.intents.length - 1];
  check('sync: H4. and a new proposal on that device is only a suggestion: the withdrawn permission grants nothing',
    fresh.permittedMode === 'suggest' && m.auth.approveUnderAuthority(proposed, atB(), fresh.id) === proposed, fresh.permittedMode);
}

async function cloudIdOf(client, table, householdId, localId) {
  const { data } = await client.from(table).select('id').eq('household_id', householdId).eq('local_id', localId);
  return data?.[0]?.id ?? null;
}

function createAnon() {
  return createClient(process.env.HERKEYS_LOCAL_API_URL ?? 'http://127.0.0.1:54321', process.env.HERKEYS_LOCAL_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function oneMoveRow(client, householdId) {
  const { data } = await client.from('one_move_records').select('*').eq('household_id', householdId);
  return data?.[0] ?? null;
}

async function countOneMoves(client, householdId) {
  const { data } = await client.from('one_move_records').select('id').eq('household_id', householdId);
  return (data ?? []).length;
}

async function ledgerRow(client, householdId) {
  const { data } = await client.from('action_records').select('*').eq('household_id', householdId);
  return data?.[0] ?? null;
}
