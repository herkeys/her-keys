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
  psql(
    'postgres',
    `INSERT INTO auth.users (id, email, aud, role) VALUES
       ('${A}','sync-${A}@local.test','authenticated','authenticated'),
       ('${B}','sync-${B}@local.test','authenticated','authenticated'),
       ('${C}','sync-${C}@local.test','authenticated','authenticated')
     ON CONFLICT (id) DO NOTHING;`,
    { label: 'sync fixture users' }
  );

  await journeyPostClaim(check, m, A);
  await journeySecondDevice(check, m, B);
  await journeyOfflineConflict(check, m, C);
}

async function load() {
  const at = (p) => `file://${join(REPO, 'src', ...p)}`;
  const [types, queue, claimSeam, push, pull, coordinator, apply, projection, transport, initial] = await Promise.all([
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
  ]);
  return { types, queue, claimSeam, push, pull, coordinator, apply, projection, transport, initial };
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
    pull: {
      transport,
      now: () => Date.now(),
      applyRow: (s, kind, localId, row, resolve) => m.apply.applyCloudRow(s, kind, localId, row, resolve),
      applyTombstone: (s, kind, localId) => m.apply.applyCloudTombstone(s, kind, localId),
      matchesLocal: (kind, localId, row) => {
        // Compare what the server holds with what this device would send. Equal
        // means the push landed and only the answer was lost.
        try {
          const mine = m.projection.toCloudRow(
            currentState,
            { householdId, profileId: accountId, namespace: currentNamespace },
            kind,
            localId
          );
          return Object.entries(mine).every(([column, value]) => {
            if (column === 'household_id' || column === 'local_id' || column === 'profile_id') return true;
            const theirs = row[column];
            return theirs === value || (theirs ?? null) === (value ?? null);
          });
        } catch {
          return false;
        }
      },
      mintLocalId: (kind, wanted) => `${wanted}~${deviceId.slice(0, 4)}`,
      batchSize: 200,
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
