import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonClient, apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
// The private stack's scratch database (run-f12.mjs journey, or the combined journeys run). Never the shared default database:
// the F12 migration is never applied to it.
const STACK_DB = process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres';
const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TODAY = '2026-09-21';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const WITHHELD_MOVE = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
const REF = 'JOURNEY-REF-55667788';
const NOTE = 'JOURNEY NOTE SENTINEL';

/**
 * HK-FEATURE-12 (Life Admin / Documents) — M5: records, their Tasks and the links between them against REAL local PostgreSQL,
 * PostgREST, RLS, change log and the real claim RPC.
 *
 * Every device is built by `composeAccountApp` (the function the app's own root calls) with the real store, account runtime, sync
 * runtime, coordinator, Supabase account client and sync transport; records are made with the F12 commands, the path the screen
 * takes. What is proven:
 *   - her records, Tasks and links reach PostgreSQL owner-private (profile_id = her, scope personal), links by cloud id;
 *   - a FRESH second device of hers reconstructs the same records, links and personal Tasks;
 *   - archive reaches every device and survives a restart (no resurrection); a stale editor cannot overwrite a newer archive;
 *   - a SECOND ADULT MEMBER of the SAME household, on her own bound device, hydrates the household and receives none of it —
 *     no record, no link, no private Task, no change pointer — while still receiving the household-visible Task;
 *   - a stranger and anon read nothing and cannot plant a record or a link.
 */
export async function lifeAdminJourneys(check, psql) {
  console.log('\n  Life Admin / Documents — production composition against real local Supabase');
  if (!(await apiReachable())) {
    check('life-admin: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();

  const P = crypto.randomUUID();
  const M = crypto.randomUUID();
  const Q = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${P}','la-${P}@local.test','authenticated','authenticated'),('${M}','la-${M}@local.test','authenticated','authenticated'),('${Q}','la-${Q}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'life-admin fixture users' });
  const sql = (text) => {
    const out = psql(STACK_DB, `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'life-admin query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };
  const state = (d) => d.store.getSnapshot().state;
  const commit = async (d, work) => {
    let result;
    const ok = await d.store.commit((s, c) => {
      result = work(s, c);
      return result.state;
    });
    return { ok, refusal: result?.refusal ?? null };
  };

  // ---- Device A of P: a record made before binding, then more after -------------------------------------------------------------
  const a = await device(m, { account: P });
  await commit(a, (s) => ({ state: { ...s, oneMoves: [WITHHELD_MOVE] } }));
  const pre = await commit(a, (s, c) => m.life.addLifeRecord(s, c, { id: 'life-record-pre', title: 'Passport', kind: 'credential', typeName: 'Passport', referenceNumber: REF, note: NOTE, expiresOn: '2027-03-01', renewBy: '2026-12-01' }));
  const bound = await a.signIn();
  check('life-admin: signing in binds the account through the REAL claim RPC (with a record already held)', bound.kind === 'accountBound' && pre.ok, bound.kind);
  const household = bound.householdId;
  const made = [];
  made.push(await commit(a, (s, c) => m.life.addLifeRecord(s, c, { id: 'life-record-lease', title: 'Lease', kind: 'document', reviewOn: '2026-10-01', locationHint: 'Blue filing cabinet' })));
  made.push(await commit(a, (s, c) => m.life.addLifeRecordTask(s, c, { recordId: 'life-record-pre', taskId: 'task-life-renew', linkId: 'life-link-renew', relation: 'renewal', title: 'Renew passport', categoryId: 'cat-home', dueDate: '2026-11-15' })));
  made.push(await commit(a, (s, c) => ({ state: m.tasks.addTask(s, c, { title: 'Household chore', categoryId: 'cat-home', scope: 'household' }) })));
  check('life-admin: every record, Task and link was committed through the production store', made.every((r) => r.ok && r.refusal === null), JSON.stringify(made));
  await a.settle();

  // ---- What PostgreSQL holds ----------------------------------------------------------------------------------------------------
  check('life-admin: both records reached PostgreSQL, owner-private (profile = her, scope personal)',
    sql(`SELECT count(*) FROM public.life_records WHERE household_id='${household}' AND profile_id='${P}' AND scope='personal';`) === '2');
  check('life-admin: the record made BEFORE binding reached the cloud after it (the claim carried no record)',
    sql(`SELECT reference_number || '/' || expires_on || '/' || renew_by FROM public.life_records WHERE household_id='${household}' AND local_id='life-record-pre';`) === `${REF}/2027-03-01/2026-12-01`);
  check('life-admin: the Task made from the record is a personal canonical Task of hers in PostgreSQL',
    sql(`SELECT scope || '/' || (owner_profile_id='${P}') || '/' || due_date FROM public.tasks WHERE household_id='${household}' AND local_id='task-life-renew';`) === 'personal/true/2026-11-15');
  check('life-admin: the link reached PostgreSQL naming the record and the Task by their CLOUD ids',
    sql(`SELECT count(*) FROM public.life_record_task_links l JOIN public.life_records r ON r.id = l.life_record_id JOIN public.tasks t ON t.id = l.task_id
         WHERE l.household_id='${household}' AND l.profile_id='${P}' AND r.local_id='life-record-pre' AND t.local_id='task-life-renew';`) === '1');
  check('life-admin: every change pointer for her records and link is stamped with HER profile',
    sql(`SELECT count(*) FILTER (WHERE owner_profile_id='${P}') || '/' || count(*) FROM public.change_log WHERE household_id='${household}' AND entity_table IN ('life_records','life_record_task_links');`) === '3/3');
  check('life-admin: the durable queue drained', a.persisted().identity.sync.queue.length === 0, String(a.persisted().identity.sync.queue.length));

  // ---- A fresh second device of P reconstructs everything -------------------------------------------------------------------------
  const b = await device(m, { account: P });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  await b.settle();
  check('life-admin: a fresh second device resumes the bound account and hydrates from PostgreSQL', resumed.kind === 'accountBound', resumed.kind);
  const facts = (d) => JSON.stringify(m.view.buildLifeAdminView(state(d), TODAY));
  check('life-admin: CLIENT A -> PostgreSQL -> CLIENT B: the two devices show IDENTICAL Life Admin homes', facts(a) === facts(b), `${facts(a)}\n   vs ${facts(b)}`);
  const recordB = state(b).lifeRecords.find((r) => r.title === 'Passport');
  const linkB = state(b).lifeRecordLinks[0];
  const taskB = state(b).tasks.find((t) => t.id === linkB?.taskId);
  check('life-admin: on device B the link resolves to B\'s own record and B\'s own personal Task, and the reference survived',
    linkB?.lifeRecordId === recordB?.id && taskB?.scope === 'personal' && taskB?.title === 'Renew passport' && recordB?.referenceNumber === REF);
  check('life-admin: device B\'s hydrated state is valid, and pulling produced no outbound work',
    m.state.validateAppState(state(b)).ok && b.persisted().identity.sync.queue.length === 0);

  // ---- Archive propagates; a stale editor cannot overwrite it; a restart does not resurrect it ---------------------------------
  const leaseA = state(a).lifeRecords.find((r) => r.title === 'Lease');
  const leaseB = state(b).lifeRecords.find((r) => r.title === 'Lease');
  const openedOnB = m.life.snapshotOfLifeRecord(leaseB);
  await commit(a, (s, c) => m.life.archiveLifeRecord(s, c, leaseA.id));
  await a.settle();
  check('life-admin: archiving on A reached PostgreSQL as an ordinary update (archived, revision advanced, nothing deleted)',
    sql(`SELECT status || '/' || (archived_at IS NOT NULL) || '/' || revision FROM public.life_records WHERE household_id='${household}' AND local_id='${leaseA.id}';`) === 'archived/true/2');
  // sync_pull hands out only what committed below the cluster-wide snapshot barrier (SD4-012), so on a busy local container (other
  // sessions' harnesses share it) a change can arrive a pull or two later. Pull until it does, bounded; losing it would be the failure.
  const pulls = await pullUntil(b, () => state(b).lifeRecords.find((r) => r.id === leaseB.id)?.status === 'archived');
  const stale = await commit(b, (s, c) => m.life.updateLifeRecord(s, c, leaseB.id, { title: 'Overwritten from a stale editor' }, openedOnB));
  const bNs = b.persisted().identity.sync;
  check('life-admin: on B the archive arrived, and an edit from an editor opened before it is refused as STALE',
    state(b).lifeRecords.find((r) => r.id === leaseB.id).status === 'archived' && stale.refusal === 'stale',
    JSON.stringify({ pulls, status: state(b).lifeRecords.find((r) => r.id === leaseB.id).status, refusal: stale.refusal, queue: bNs.queue.map((q) => [q.kind, q.op]) }));
  const restarted = await device(m, { account: P, storage: b.storage, secure: b.secure });
  const restored = await restarted.app.accountRuntime.restore();
  await restarted.settle();
  await pullUntil(restarted, () => true);
  check('life-admin: a restarted device resumes, keeps the record ARCHIVED (no resurrection) and creates no duplicate',
    restored.kind === 'accountBound' && state(restarted).lifeRecords.find((r) => r.id === leaseB.id).status === 'archived'
      && sql(`SELECT count(*) FROM public.life_records WHERE household_id='${household}';`) === '2'
      && sql(`SELECT status FROM public.life_records WHERE household_id='${household}' AND local_id='${leaseA.id}';`) === 'archived');

  // ---- A SECOND ADULT MEMBER of the SAME household ---------------------------------------------------------------------------------
  // Build 4 products create one adult per household, so the member row is inserted directly, exactly as helpers/10-fixtures.sql does.
  psql(STACK_DB, `INSERT INTO public.profiles (id, timezone) VALUES ('${M}', '${TZ}') ON CONFLICT (id) DO NOTHING;
                  INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
                  VALUES ('${household}', 'member-2-${M.slice(0, 8)}', '${M}', 'adult', 'member', NULL, 'personal');`, { label: 'life-admin second member' });
  const member = await device(m, { account: M });
  await bindAsNewDevice(m, member, M, household);
  const memberBound = await member.signIn();
  await member.settle();
  check('life-admin: the second member\'s device binds to the SAME household and hydrates it', memberBound.kind === 'accountBound' && memberBound.householdId === household, memberBound.kind);
  const seen = state(member);
  check('life-admin: SAME-HOUSEHOLD MEMBER hydrated NO record and NO link of the owner', seen.lifeRecords.length === 0 && seen.lifeRecordLinks.length === 0);
  check('life-admin: ...NOT the owner\'s personal Task made from a record, but DOES get the household-visible Task',
    !seen.tasks.some((t) => t.title === 'Renew passport') && seen.tasks.some((t) => t.title === 'Household chore'));
  check('life-admin: ...and no private value is anywhere in her persisted device state', !JSON.stringify(member.persisted()).includes(REF) && !JSON.stringify(member.persisted()).includes(NOTE));
  const mc = clientFor(M);
  const directRecords = await mc.from('life_records').select('id').eq('household_id', household);
  const directLinks = await mc.from('life_record_task_links').select('id').eq('household_id', household);
  const pointers = await mc.from('change_log').select('entity_table').eq('household_id', household).in('entity_table', ['life_records', 'life_record_task_links']);
  check('life-admin: through PostgREST the member reads no record, no link, and no Life Admin change pointer',
    !directRecords.error && directRecords.data.length === 0 && !directLinks.error && directLinks.data.length === 0 && !pointers.error && pointers.data.length === 0,
    JSON.stringify([directRecords.error, directLinks.error, pointers.error]));
  const recordId = sql(`SELECT id FROM public.life_records WHERE household_id='${household}' AND local_id='life-record-pre';`);
  const probe = await mc.from('life_records').update({ title: 'Hijacked' }).eq('id', recordId).select('id');
  check('life-admin: the member cannot edit the owner\'s record (zero rows, the same as an id that names nothing)', !probe.error && (probe.data ?? []).length === 0);

  // ---- A stranger and anon ----------------------------------------------------------------------------------------------------
  const stranger = clientFor(Q);
  const read = await stranger.from('life_records').select('id,title').eq('household_id', household);
  const plant = await stranger.from('life_records').insert({ household_id: household, local_id: 'planted', profile_id: Q, title: 'Planted', record_kind: 'other', status: 'active', scope: 'personal', producer: 'user-action', origin_created_at: new Date(NOW).toISOString(), origin_updated_at: new Date(NOW).toISOString() });
  check('life-admin: a stranger reads nothing and cannot plant a record in the household (RLS WITH CHECK)',
    !read.error && (read.data ?? []).length === 0 && plant.error !== null, JSON.stringify(plant.error));
  const anon = anonClient();
  const anonRead = await anon.from('life_records').select('id');
  check('life-admin: anon is refused outright', anonRead.error !== null || (anonRead.data ?? []).length === 0, JSON.stringify(anonRead.error));
  check('life-admin: the attacks changed nothing', sql(`SELECT count(*) FROM public.life_records WHERE household_id='${household}' AND title IN ('Planted','Hijacked');`) === '0');
}

/** Ask for a pull until `arrived()` holds, at most 20 times, half a second apart. Returns how many pulls it took. */
async function pullUntil(d, arrived) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await d.app.syncRuntime.request('manual');
    await d.settle();
    if (arrived()) return attempt;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return -1;
}

async function loadModules() {
  const at = (...p) => `file://${join(REPO, 'src', ...p)}`;
  const [compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, life, tasks, view, state, envelope] = await Promise.all([
    import(at('store', 'composeAccountApp.ts')),
    import(at('state', 'appStore.ts')),
    import(at('domain', 'sync', 'changeObserver.ts')),
    import(at('persistence', 'appStateRepository.ts')),
    import(at('persistence', 'storageAdapter.ts')),
    import(at('domain', 'account', 'provider.ts')),
    import(at('domain', 'account', 'secureSession.ts')),
    import(at('platform', 'supabaseCloud.ts')),
    import(at('platform', 'supabaseSyncTransport.ts')),
    import(at('domain', 'sync', 'claimSeam.ts')),
    import(at('domain', 'lifeRecords.ts')),
    import(at('domain', 'tasks.ts')),
    import(at('features', 'lifeAdmin', 'lifeAdminView.ts')),
    import(at('domain', 'state.ts')),
    import(at('persistence', 'envelope.ts')),
  ]);
  return { compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, life, tasks, view, state, envelope };
}

async function bindAsNewDevice(m, d, account, householdId) {
  d.store.setIdentity({
    binding: { accountId: account, householdId, boundAt: new Date(NOW).toISOString(), kind: 'claim', idMap: {} },
    receipt: null, quarantine: null,
    sync: m.claimSeam.namespaceForNewDevice({ accountId: account, householdId, deviceId: crypto.randomUUID() }),
  });
  await d.store.saveIdentity();
}

/** One installation, built exactly as the app's root builds it, against the real local stack. */
async function device(m, { account, storage = m.storage.createMemoryStorage({}), secure = m.secure.createMemorySecureStorage({}), mode = 'empty' }) {
  const client = clientFor(account);
  const observer = m.observer.createChangeObserver({ now: () => NOW });
  const repository = m.repo.createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = m.appStore.createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  await store.flush();

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
    sync: { transport: m.transport.createSupabaseSyncTransport(client), newDeviceId: () => crypto.randomUUID(), schedule, debounceMs: 0 },
  });
  const dev = { app, store, storage, secure, account };
  dev.signIn = async () => {
    const result = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return result;
  };
  dev.settle = async () => {
    for (let i = 0; i < 6; i += 1) {
      for (const timer of timers.splice(0)) if (timer.live) timer.work();
      await app.syncRuntime.idle();
    }
  };
  dev.persisted = () => {
    const raw = storage.contents()[m.repo.STORAGE_KEYS.primary];
    return raw === undefined ? null : m.envelope.decodeStoredState(raw);
  };
  return dev;
}
