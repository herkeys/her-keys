import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TODAY = '2026-09-21';
const CANARY = 'CANARY-LOCAL-ONLY-6f1c0b';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
/** Today's One Move already decided as "withheld", so a household's tasks do not cause one to be decided from them. */
const WITHHELD_MOVE = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
/** Bigger than the queue's seed ceiling (400) and than two pull-fetch chunks, so both limits are actually crossed. */
const BULK = 450;

/**
 * HK-INTEGRATION-READINESS-01 — the production composition against REAL PostgreSQL, PostgREST, RLS and the real claim RPC.
 *
 * Every device is built by `composeAccountApp`, the function the app's own root calls, with the real household store, the real
 * account runtime, the real sync runtime and coordinator, the real Supabase account client and the real sync transport. Only
 * storage and the keychain are in-memory and the provider is scripted. Nothing about the cloud is modelled: the same journeys
 * that tests/hk-ir01/syncComposition.test.mjs runs against a model run here against the database.
 */
export async function productionCompositionJourneys(check, psql) {
  console.log('\n  production composition — real local Supabase');
  if (!(await apiReachable())) {
    check('composition: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();

  const P = crypto.randomUUID();
  const Q = crypto.randomUUID();
  const R = crypto.randomUUID();
  psql(
    'postgres',
    `INSERT INTO auth.users (id, email, aud, role) VALUES
       ('${P}','comp-${P}@local.test','authenticated','authenticated'),
       ('${Q}','comp-${Q}@local.test','authenticated','authenticated'),
       ('${R}','comp-${R}@local.test','authenticated','authenticated')
     ON CONFLICT (id) DO NOTHING;`,
    { label: 'composition fixture users' }
  );

  const sql = (text) => {
    const out = psql('postgres', `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'composition query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };

  // ---- Device A: real household content, then the real claim, then the real runtime -------------------------------
  const sent = [];
  const a = await device(m, { account: P, sent });
  await householdWithContent(m, a);

  const bound = await a.signIn();
  check('composition: signing in binds the account through the REAL claim RPC (version 3)', bound.kind === 'accountBound', bound.kind);
  check('composition: the sync runtime is OPERATING for the bound account and household',
    a.app.syncRuntime.running()?.accountId === P && a.app.syncRuntime.running()?.householdId === bound.householdId);

  const household = bound.householdId;
  const counts = () => sql(`SELECT (SELECT count(*) FROM public.tasks WHERE household_id='${household}') || '/' ||
    (SELECT count(*) FROM public.events WHERE household_id='${household}') || '/' ||
    (SELECT count(*) FROM public.household_systems WHERE household_id='${household}') || '/' ||
    (SELECT count(*) FROM public.household_members WHERE household_id='${household}' AND member_type='child') || '/' ||
    (SELECT count(*) FROM public.dependencies WHERE household_id='${household}');`);
  check('composition: content the claim did NOT carry reached PostgreSQL (3 tasks / 1 event / 1 system / 1 child / 1 dependency)',
    counts() === '3/1/1/1/1', counts());

  const durations = sql(`SELECT string_agg(title || '=' || duration_minutes || ':' || COALESCE(duration_source,'null'), ',' ORDER BY title) FROM public.tasks WHERE household_id='${household}';`);
  check('composition: explicit 15 and default 15 are different rows in the cloud (HA-010)',
    durations === 'Book the dentist=15:default,File the form=10:user,Order the permission slip=15:user', durations);
  check('composition: the child-scoped System kept its child across the boundary, and the server derived its type (HA-011)',
    sql(`SELECT count(*) FROM public.household_systems s JOIN public.household_members m ON m.id = s.subject_member_id AND m.household_id = s.household_id WHERE s.household_id='${household}' AND s.scope='child' AND m.local_id='child-1' AND s.subject_member_type='child';`) === '1');
  check('composition: her onboarding reached the server-created row by UPDATE (a create is refused) and was not overwritten',
    sql(`SELECT goal_ids::text || ':' || (revision > 1)::text FROM public.onboarding_state WHERE household_id='${household}';`) === '{calmer-household}:true'
      && a.store.getSnapshot().state.onboarding.goalIds.length === 1);
  check('composition: the durable queue drained and nothing needs attention', a.persisted().identity.sync.queue.length === 0 && !a.app.syncRuntime.snapshot().needsAttention,
    `queue=${a.persisted().identity.sync.queue.length}`);

  // ---- a mutation AFTER binding travels with no feature involved ----------------------------------------------
  await mutate(a, (s, ctx) => m.tasks.addTask(s, ctx, { title: 'Renew the passport', categoryId: s.categories[0].id, scope: 'household', durationMinutes: 30, durationSource: 'user' }));
  await a.settle();
  check('composition: a post-bind mutation reached PostgreSQL through the queue', counts().startsWith('4/'), counts());
  const editedId = a.store.getSnapshot().state.tasks.find((t) => t.title === 'Renew the passport').id;
  await mutate(a, (s, ctx) => m.tasks.updateTask(s, ctx, editedId, { title: 'Renew the passport online', durationMinutes: 45 }));
  await a.settle();
  check('composition: an edit travels as a compare-and-set update; a changed number does NOT keep the old source (HA-010)',
    sql(`SELECT title || ':' || duration_minutes || ':' || COALESCE(duration_source,'null') || ':' || revision FROM public.tasks WHERE household_id='${household}' AND local_id='${editedId}';`) === 'Renew the passport online:45:null:2');

  // ---- HA-009: removal is retirement, and the second device reads it that way -------------------------------
  const meetingId = a.store.getSnapshot().state.events[0].id;
  await mutate(a, (s, ctx) => m.events.removeEvent(s, ctx, meetingId));
  await a.settle();
  check('composition: the removal reached the cloud as a status, and the dependency edge was NOT rewritten (history preserved)',
    sql(`SELECT (SELECT status FROM public.events WHERE household_id='${household}') || ':' || (SELECT status FROM public.dependencies WHERE household_id='${household}');`) === 'removed:active');

  // ---- Device B: a second install of the same account hydrates the household ----------------------------------
  const b = await device(m, { account: P, sent });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  check('composition: the second device resumes the bound account and hydrates', resumed.kind === 'accountBound' && b.persisted().identity.sync.hydration === 'ready',
    `${resumed.kind}/${b.persisted().identity.sync.hydration}`);
  const sa = a.store.getSnapshot().state;
  const sb = b.store.getSnapshot().state;
  const brief = (s) => s.tasks.map((t) => `${t.title}|${t.durationMinutes}|${t.durationSource}`).sort().join(';');
  check('composition: CLIENT A -> queue -> PostgreSQL -> CLIENT B: tasks equal, with duration knowledge intact', brief(sa) === brief(sb), `${brief(sb)}`);
  check('composition: B holds the child, and the child-scoped System and the task name THAT child',
    sb.children.length === 1 && sb.systems[0]?.subjectMemberId === sb.children[0].id && sb.tasks.find((t) => t.title === 'Book the dentist')?.subjectMemberId === sb.children[0].id);
  check('composition: HA-009 across devices - the removed prerequisite reads "needs review", never "done"',
    m.struct.readinessOf(sb, { kind: 'task', id: sb.tasks.find((t) => t.title === 'File the form').id }) === 'needsReview'
      && !m.struct.isDone(sb, { kind: 'event', id: sb.events[0].id }));
  check('composition: pulled state produced NO outbound work on B', b.persisted().identity.sync.queue.length === 0);

  // ---- restart: process death, then a fresh runtime from the persisted blob -------------------------------------
  const before = counts();
  a.app.syncRuntime.stop(); // process death: nothing of the old runtime survives
  const a2 = await device(m, { account: P, sent, storage: a.storage, secure: a.secure });
  const restored = await a2.app.accountRuntime.restore();
  await a2.app.syncRuntime.idle();
  check('composition: restart restores the same account and resumes sync (no second claim, no duplicates)',
    restored.kind === 'accountBound' && counts() === before && sql(`SELECT count(*) FROM public.account_claims WHERE profile_id='${P}' AND status='complete';`) === '1', `${restored.kind} ${counts()}`);

  // ---- RLS: a stranger cannot see, change or write into this household -----------------------------------------
  const stranger = clientFor(Q);
  const peek = await stranger.from('tasks').select('id').eq('household_id', household);
  check('composition: RLS - a stranger cannot read the household\'s tasks', (peek.data ?? []).length === 0);
  const tamper = await stranger.from('tasks').update({ duration_source: 'user' }).eq('household_id', household).select('id');
  check('composition: RLS - a stranger\'s update of duration_source matches nothing', (tamper.data ?? []).length === 0);
  const plant = await stranger.from('tasks').insert({ household_id: household, local_id: 'planted', title: 'Planted', category_id: (await clientFor(P).from('household_categories').select('id').eq('household_id', household).limit(1)).data[0].id, duration_minutes: 5, commitment: 'flexible', plan_kind: 'unplanned', status: 'open', scope: 'household', producer: 'user-action' });
  check('composition: RLS - a stranger cannot plant a task in the household (insert WITH CHECK)', plant.error !== null, plant.error?.code ?? 'no error');
  check('composition: the attacks changed nothing', counts() === before && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND local_id='planted';`) === '0');

  // ---- account switch: A's household on this device, B signs in ---------------------------------------------
  const requestsBefore = sent.length;
  const switched = await device(m, { account: Q, sent, storage: a.storage });
  const otherState = await switched.signIn();
  check('composition: account A -> account Q on one device quarantines: nothing starts, nothing of A is uploaded under Q',
    otherState.kind === 'boundOther' && switched.app.syncRuntime.running() === null && sent.length === requestsBefore
      && sql(`SELECT count(*) FROM public.household_members WHERE profile_id='${Q}';`) === '0');

  // ---- demo isolation -------------------------------------------------------------------------------------------
  const demo = await device(m, { account: R, sent, mode: 'demo' });
  const demoState = await demo.signIn();
  await mutate(demo, (s, ctx) => m.tasks.addTask(s, ctx, { title: 'Demo edit', categoryId: s.categories[0].id, scope: 'household' }));
  await demo.settle();
  check('composition: a DEMO household is refused as a whole; nothing runs, nothing is created for the account',
    demoState.kind === 'authenticatedUnbound' && demo.app.syncRuntime.running() === null && sql(`SELECT count(*) FROM public.household_members WHERE profile_id='${R}';`) === '0');

  // ---- a household bigger than one batch, through the REAL sync_pull (which has no limit and one-transaction claims) --------
  const S = crypto.randomUUID();
  psql('postgres', `INSERT INTO auth.users (id, email, aud, role) VALUES ('${S}','comp-${S}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'composition big-household user' });
  const big = await device(m, { account: S, sent });
  await mutate(big, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  await mutate(big, (s, ctx) => {
    let next = s;
    for (let i = 0; i < BULK; i += 1) next = m.tasks.addTask(next, ctx, { title: `Bulk ${i}`, categoryId: s.categories[0].id, scope: 'household', durationMinutes: 20, durationSource: 'user' });
    return next;
  });
  await big.store.flush();
  const bigBound = await big.signIn();
  const bigCount = () => sql(`SELECT count(*) FROM public.tasks WHERE household_id='${bigBound.householdId}';`);
  check(`composition: a ${BULK}-task household is sent in full by ONE sign-in, past the queue ceiling (IR-D10)`,
    bigBound.kind === 'accountBound' && bigCount() === String(BULK) && big.persisted().identity.sync.queue.length === 0, `${bigBound.kind} ${bigCount()} queue=${big.persisted().identity.sync.queue.length}`);

  const fetched = [];
  const bigB = await device(m, { account: S, sent, fetched });
  await bindAsNewDevice(m, bigB, S, bigBound.householdId);
  await bigB.signIn();
  const bigStored = bigB.persisted().identity.sync;
  const taskRequests = fetched.filter((request) => request.table === 'tasks').map((request) => request.count);
  check(`composition: a second device pulls all ${BULK} through the real sync_pull, and the cursor moves past them (IR-D11)`,
    bigB.store.getSnapshot().state.tasks.length === BULK && bigStored.hydration === 'ready' && bigStored.cursor !== '0',
    `${bigB.store.getSnapshot().state.tasks.length} tasks, ${bigStored.hydration}, cursor ${bigStored.cursor}`);
  check('composition: ...in row requests no larger than the chunk, each task requested once, and the reading device uploaded nothing',
    taskRequests.length > 1 && taskRequests.every((count) => count <= 100) && taskRequests.reduce((sum, count) => sum + count, 0) === BULK && bigB.persisted().identity.sync.queue.length === 0 && bigCount() === String(BULK),
    `requests ${taskRequests.join('+')}`);

  // ---- OD-A: an undecided reading reaches PostgreSQL as structured state, under a neutral label -------------------------------
  const U = crypto.randomUUID();
  psql('postgres', `INSERT INTO auth.users (id, email, aud, role) VALUES ('${U}','comp-${U}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'composition reading user' });
  const FIRST = 'Call Dr. Okonkwo about the cardiology referral';
  const SECOND = 'Book the orthodontist for Theo';
  const giveaways = ['Okonkwo', 'cardiology', 'referral', 'orthodontist', 'Theo'];
  const rd = await device(m, { account: U, sent });
  await mutate(rd, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  await mutate(rd, (s, ctx) => m.interpretations.recordArtifact(s, ctx, { kind: 'message', origin: 'user-submitted', contentRef: 'capture:od-a', contentDigest: null }).state);
  const readingArtifact = rd.store.getSnapshot().state.sourceArtifacts[0].id;
  const propose = (title) => (s, ctx) => m.interpretations.proposeInterpretation(s, ctx, { artifactId: readingArtifact, proposedKind: 'task', title, dueDate: '2026-09-24', durationMinutes: 20, categoryHint: 'kids' });
  await mutate(rd, propose(FIRST));
  await rd.store.flush();
  const rdBound = await rd.signIn();
  const readings = () => sql(`SELECT string_agg(state || ':' || title, '|' ORDER BY state, title) FROM public.interpretations WHERE household_id='${rdBound.householdId}';`);
  const inCloud = (word) => sql(`SELECT count(*) FROM (
      SELECT i::text AS x FROM public.interpretations i WHERE i.household_id='${rdBound.householdId}'
      UNION ALL SELECT a::text FROM public.source_artifacts a WHERE a.household_id='${rdBound.householdId}'
      UNION ALL SELECT t::text FROM public.tasks t WHERE t.household_id='${rdBound.householdId}'
      UNION ALL SELECT n::text FROM public.needs_me_items n WHERE n.profile_id='${U}') z WHERE z.x ILIKE '%${word}%';`);
  check('composition: an UNDECIDED reading is in PostgreSQL as structured state under the neutral label (not held out of sync, and not her words)',
    rdBound.kind === 'accountBound' && readings() === 'pending:To-do to review'
      && sql(`SELECT proposed_kind || ':' || due_date || ':' || duration_minutes || ':' || category_hint FROM public.interpretations WHERE household_id='${rdBound.householdId}';`) === 'task:2026-09-24:20:kids', readings());
  check('composition: nothing of her words - no give-away word - is in ANY row the household holds, or in any row the client sent',
    giveaways.every((word) => inCloud(word) === '0') && sent.filter((row) => giveaways.some((word) => JSON.stringify(row).includes(word))).length === 0);

  const firstReading = rd.store.getSnapshot().state.interpretations[0].id;
  await mutate(rd, (s, ctx) => m.interpretations.acceptInterpretation(s, ctx, firstReading, { categoryId: s.categories[0].id }));
  await rd.settle();
  check('composition: after explicit acceptance the canonical title travels in the SAME update that records the decision, and the real freeze trigger allows it',
    readings() === `accepted:${FIRST}` && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${rdBound.householdId}' AND title='${FIRST}';`) === '1'
      && rd.persisted().identity.sync.queue.length === 0 && rd.persisted().identity.sync.evidence.length === 0, readings());

  await mutate(rd, propose(SECOND));
  await rd.settle();
  check('composition: a later undecided reading is neutral again; the accepted one keeps its title', readings() === `accepted:${FIRST}|pending:To-do to review`, readings());

  const rd2 = await device(m, { account: U, sent });
  await bindAsNewDevice(m, rd2, U, rdBound.householdId);
  await rd2.signIn();
  const there = rd2.store.getSnapshot().state.interpretations;
  const undecided = there.find((r) => r.state === 'pending');
  check('composition: a second device sees the accepted title, the undecided reading under its neutral label, and cannot accept that one as it stands',
    there.length === 2 && there.find((r) => r.state === 'accepted')?.title === FIRST && undecided?.title === 'To-do to review'
      && m.interpretations.canAccept(undecided, { categoryId: rd2.store.getSnapshot().state.categories[0].id }).reason === 'needs_title', JSON.stringify(there.map((r) => [r.state, r.title])));

  // ---- local-only kinds never travel ----------------------------------------------------------------------------
  const leaked = sent.filter((row) => JSON.stringify(row).includes(CANARY)).length;
  check('composition: a local-only record (migration evidence) never appears in ANY row the client sent', leaked === 0, `${leaked} rows`);
  check('composition: ...and is in no cloud table the household owns',
    sql(`SELECT count(*) FROM (SELECT t::text AS x FROM public.tasks t WHERE t.household_id='${household}' UNION ALL SELECT e::text FROM public.events e WHERE e.household_id='${household}' UNION ALL SELECT s::text FROM public.household_systems s WHERE s.household_id='${household}' UNION ALL SELECT o::text FROM public.one_move_records o WHERE o.household_id='${household}' UNION ALL SELECT b::text FROM public.onboarding_state b WHERE b.household_id='${household}' UNION ALL SELECT d::text FROM public.dependencies d WHERE d.household_id='${household}') z WHERE z.x LIKE '%${CANARY}%';`) === '0');
  check('composition: the local-only record is still on the device', JSON.stringify(a.store.getSnapshot().state.migrationEvidence).includes(CANARY));
}

async function loadModules() {
  const at = (p) => `file://${join(REPO, 'src', ...p)}`;
  const [compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, events, tasks, struct, initial, envelope, interpretations] = await Promise.all([
    import(at(['store', 'composeAccountApp.ts'])),
    import(at(['state', 'appStore.ts'])),
    import(at(['domain', 'sync', 'changeObserver.ts'])),
    import(at(['persistence', 'appStateRepository.ts'])),
    import(at(['persistence', 'storageAdapter.ts'])),
    import(at(['domain', 'account', 'provider.ts'])),
    import(at(['domain', 'account', 'secureSession.ts'])),
    import(at(['platform', 'supabaseCloud.ts'])),
    import(at(['platform', 'supabaseSyncTransport.ts'])),
    import(at(['domain', 'sync', 'claimSeam.ts'])),
    import(at(['domain', 'events.ts'])),
    import(at(['domain', 'tasks.ts'])),
    import(at(['domain', 'structure.ts'])),
    import(at(['state', 'initialState.ts'])),
    import(at(['persistence', 'envelope.ts'])),
    import(at(['domain', 'interpretations.ts'])),
  ]);
  return { compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, events, tasks, struct, initial, envelope, interpretations };
}

/**
 * A fresh install of an account whose household already exists in the cloud, bound the way adoption of an existing household will
 * leave it. That adoption step is a recorded contract that is not implemented in this build; this is its stand-in, so the pull path
 * it will feed can be attacked against the real database now.
 */
async function bindAsNewDevice(m, d, account, householdId) {
  d.store.setIdentity({
    binding: { accountId: account, householdId, boundAt: new Date(NOW).toISOString(), kind: 'claim', idMap: {} },
    receipt: null, quarantine: null,
    sync: m.claimSeam.namespaceForNewDevice({ accountId: account, householdId, deviceId: crypto.randomUUID() }),
  });
  await d.store.saveIdentity();
}

/** One installation, built exactly as the app's root builds it, against the real local stack. */
async function device(m, { account, sent, fetched = [], storage = m.storage.createMemoryStorage({}), secure = m.secure.createMemorySecureStorage({}), mode = 'empty' }) {
  const client = clientFor(account);
  const observer = m.observer.createChangeObserver({ now: () => NOW });
  const repository = m.repo.createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = m.appStore.createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  await store.flush();

  // The real transport, wrapped only to RECORD what the client sends (never to change it).
  const real = m.transport.createSupabaseSyncTransport(client);
  const transport = {
    ...real,
    async create(table, deviceId, row) { sent.push({ table, row }); return real.create(table, deviceId, row); },
    async update(table, cloudId, base, patch, column) { sent.push({ table, patch }); return real.update(table, cloudId, base, patch, column); },
    async fetchRows(table, ids, column) { fetched.push({ table, count: ids.length }); return real.fetchRows(table, ids, column); },
  };

  const timers = [];
  const schedule = (work) => { const timer = { work, live: true }; timers.push(timer); return () => { timer.live = false; }; };
  const session = { accountId: account, accessToken: 'unused', refreshToken: 'unused', expiresAt: NOW + 3_600_000, provider: { provider: 'apple', subject: `apple-${account}`, suggestedDisplayName: null } };

  const app = m.compose.composeAccountApp({
    store,
    observer,
    account: {
      sessions: m.secure.createSecureSessionStore(secure),
      providers: m.provider.createProviderRegistry([m.provider.createScriptedProvider('apple', { results: Array.from({ length: 6 }, () => ({ kind: 'success', session })) })]),
      cloud: m.cloud.createSupabaseAccountClient(client),
      timezone: () => TZ,
      now: () => NOW,
      newClaimKey: () => crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
    },
    sync: { transport, newDeviceId: () => crypto.randomUUID(), schedule, debounceMs: 0 },
  });

  const dev = { app, store, storage, secure, account };
  dev.persisted = () => m.envelope.decodeStoredState(storage.contents()['herkeys.appState']);
  dev.signIn = async () => {
    const state = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return state;
  };
  dev.settle = async () => {
    for (const t of timers.splice(0)) if (t.live) t.work();
    await app.syncRuntime.idle();
  };
  return dev;
}

const mutate = (d, fn) => d.store.commit((state, ctx) => fn(state, ctx));

async function householdWithContent(m, d) {
  await mutate(d, (s) => ({
    ...s,
    oneMoves: [WITHHELD_MOVE],
    children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }],
    onboarding: { ...s.onboarding, goalIds: ['calmer-household'], strengthIds: ['cooking'], lastStep: 'struggles' },
    // A record that exists only on the device: it must never travel.
    migrationEvidence: [{
      id: 'evidence-canary', kind: 'one-move', reason: 'LEGACY_REAL_CATALOG_ONE_MOVE', sourceSchemaVersion: 1,
      original: { oneMoveId: 'onemove-old', forDate: '2026-09-01', targetId: null, targetType: CANARY, status: 'withheld', decidedAt: '2026-09-01T12:00:00.000Z', completedAt: null, scope: 'personal' },
    }],
  }));
  await mutate(d, (s, ctx) => m.tasks.addTask(s, ctx, { title: 'Order the permission slip', categoryId: s.categories[0].id, scope: 'household', durationMinutes: 15, durationSource: 'user' }));
  await mutate(d, (s, ctx) => m.tasks.addTask(s, ctx, { title: 'Book the dentist', categoryId: s.categories[0].id, scope: 'child', subjectMemberId: 'child-1' }));
  await mutate(d, (s, ctx) => m.events.addEvent(s, ctx, { title: 'Parent meeting', categoryId: s.categories[0].id, startsAt: '2026-09-25T23:00:00.000Z', endsAt: '2026-09-26T00:00:00.000Z', commitment: 'fixed', scope: 'household' }));
  await mutate(d, (s, ctx) => m.tasks.addTask(s, ctx, { title: 'File the form', categoryId: s.categories[0].id, scope: 'household', durationMinutes: 10, durationSource: 'user' }));
  await mutate(d, (s, ctx) => {
    const task = s.tasks.find((t) => t.title === 'File the form');
    const event = s.events[0];
    return m.struct.addDependency(s, ctx, { relation: 'requires', from: { kind: 'task', id: task.id }, to: { kind: 'event', id: event.id } }).state;
  });
  await mutate(d, (s) => ({
    ...s,
    systems: [{ id: 'sys-1', name: 'Homework wind-down', description: '', categoryId: s.categories[0].id, subjectMemberId: 'child-1', automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: USER, scope: 'child' }],
  }));
  await d.store.flush();
}
