import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
// The database the journeys run against: the private stack's scratch database when startJourneyStack() started one (the combined
// "journeys"/full-suite run), or the shared default database when this journey runs on its own (`only=home`). See journey-composition.mjs.
const STACK_DB = process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres';
const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const TODAY = '2026-09-21';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const WITHHELD_MOVE = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-21T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };

/**
 * HK-FEATURE-06 (Home OS) — HM6: the Home journey against REAL local PostgreSQL, PostgREST, RLS and the real claim RPC.
 *
 * Device A is built by `composeAccountApp` (the function the app's own root calls), with the real household store, account runtime,
 * sync runtime, coordinator, Supabase account client and sync transport. Home changes are made with Home's OWN mutations through
 * `commitHomeChange` — the path a Home screen takes — so nothing here is a hand-assembled substitute. Only storage and the keychain
 * are in-memory and the provider is scripted; nothing about the cloud is modelled.
 *
 * Home adds NO schema, NO RLS and NO sync kind. So this is not a duplicate of the common RLS suite: RLS = INHERITED CERTIFIED COMMON
 * POSTURE. What is proven here is that Home's canonical records survive the real database and a second device, and that a stranger
 * cannot reach them.
 */
export async function homeJourneys(check, psql) {
  console.log('\n  Home OS — production composition against real local Supabase');
  if (!(await apiReachable())) {
    check('home: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();

  const P = crypto.randomUUID();
  const Q = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${P}','home-${P}@local.test','authenticated','authenticated'),('${Q}','home-${Q}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'home fixture users' });
  const sql = (text) => {
    const out = psql(STACK_DB, `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'home query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };

  // ---- Device A ---------------------------------------------------------------------------------------------------------------
  const a = await device(m, { account: P });
  await mutate(a, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  await mutate(a, (s, ctx) => m.resp.addPerson(s, ctx, { displayName: 'Sam', relationship: 'contractor' }));
  const bound = await a.signIn();
  check('home: signing in binds the account through the REAL claim RPC', bound.kind === 'accountBound', bound.kind);
  const household = bound.householdId;
  const state = (d) => d.store.getSnapshot().state;
  const save = (d, work) => m.home.commitHomeChange(d.store, work);

  const iso = (date, h) => new Date(Date.UTC(2026, 8, Number(date.slice(8)), h + 5, 0)).toISOString();
  const results = [];
  results.push(await save(a, (s, c) => m.home.createHomeTask(s, c, { title: 'Change the furnace filter', dueDate: '2026-09-25', durationMinutes: 30, notes: null, commitment: 'flexible', repeat: { frequency: 'monthly', interval: 3 } })));
  results.push(await save(a, (s, c) => m.home.createHomeTask(s, c, { title: 'Buy 20x25 furnace filter', dueDate: null, notes: null, commitment: 'flexible', repeat: null })));
  results.push(await save(a, (s, c) => m.home.createHomeVisit(s, c, { title: 'Furnace tune-up', startsAt: iso('2026-09-25', 9), endsAt: iso('2026-09-25', 10), location: null, notes: null, commitment: 'fixed' })));
  check('home: every Home mutation was committed through the production store (none refused)', results.every((r) => r.ok), JSON.stringify(results));

  const filter = state(a).tasks.find((t) => t.title === 'Change the furnace filter');
  const buy = state(a).tasks.find((t) => t.title === 'Buy 20x25 furnace filter');
  const asked = await save(a, (s, c) => m.home.askSomeone(s, c, { about: { kind: 'task', id: filter.id }, holder: { kind: 'person', id: s.people[0].id } }));
  await mutate(a, (s, c) => m.struct.addDependency(s, c, { relation: 'requires', from: { kind: 'task', id: filter.id }, to: { kind: 'task', id: buy.id } }).state);
  const marked = await save(a, (s, c) => m.home.markHomeTaskDone(s, c, buy.id));
  await mutate(a, (s) => m.cat.renameCategory(s, 'cat-home', 'House stuff'));
  check('home: asking a person and marking a task done were committed', asked.ok && marked.ok, JSON.stringify([asked, marked]));
  await a.settle();

  // ---- What PostgreSQL holds ----------------------------------------------------------------------------------------------------
  const homeCategory = sql(`SELECT id FROM public.household_categories WHERE household_id='${household}' AND system_role='home';`);
  check('home: the household has exactly one category with the home role in PostgreSQL', /^[0-9a-f-]{36}$/.test(homeCategory), homeCategory);
  check('home: the Home tasks reached PostgreSQL FILED UNDER the home-role category', sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND category_id='${homeCategory}';`) === '2');
  check('home: the Home visit reached PostgreSQL filed under the home-role category', sql(`SELECT count(*) FROM public.events WHERE household_id='${household}' AND category_id='${homeCategory}';`) === '1');
  check('home: duration provenance survived the real database (a typed 30 is user, an untouched one is default — DEFAULT != USER-PROVIDED)',
    sql(`SELECT string_agg(title || '=' || coalesce(duration_source,'null'), ';' ORDER BY title) FROM public.tasks WHERE household_id='${household}';`) === 'Buy 20x25 furnace filter=default;Change the furnace filter=user');
  check('home: the rename is presentation — it reached the database and the tasks still point at the same category',
    sql(`SELECT name FROM public.household_categories WHERE id='${homeCategory}';`) === 'House stuff' &&
      sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND category_id='${homeCategory}';`) === '2');
  check('home: the shared recurrence rule reached PostgreSQL (monthly x3, active) and is about the task, not a completion',
    sql(`SELECT frequency || '/' || interval_count || '/' || status FROM public.recurrence_rules WHERE household_id='${household}' AND about_task_id=(SELECT id FROM public.tasks WHERE household_id='${household}' AND title='Change the furnace filter');`) === 'monthly/3/active');
  check('home: asking someone is a REQUESTED responsibility in PostgreSQL — not accepted, not completed',
    sql(`SELECT state || '/' || responsible_kind FROM public.responsibilities WHERE household_id='${household}';`) === 'requested/person');
  check('home: the prerequisite edge reached PostgreSQL', sql(`SELECT count(*) FROM public.dependencies WHERE household_id='${household}' AND status='active';`) === '1');
  check('home: marking done left append-only completion evidence (one completed observation), and no observation for the rule',
    sql(`SELECT count(*) FROM public.behavior_observations WHERE household_id='${household}' AND outcome='completed';`) === '1');
  check('home: the durable queue drained', a.persisted().identity.sync.queue.length === 0, String(a.persisted().identity.sync.queue.length));

  // ---- Device B pulls it from the real database ----------------------------------------------------------------------------------
  const b = await device(m, { account: P });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  check('home: a second device resumes the bound account and hydrates from PostgreSQL', resumed.kind === 'accountBound', resumed.kind);

  const facts = (d) => m.view.buildHomeView(state(d), NOW).items.map((i) => ({
    title: i.title, kind: i.canonicalKind, resolution: i.resolutionState, role: i.homeSystemRole, duration: i.duration, coverage: i.responsibility.coverage,
    holder: i.responsibility.holder?.name ?? null, dependency: i.dependency.readiness, recurrence: i.recurrence.state, next: i.recurrence.nextExpected,
    lastDone: i.lastDone?.date ?? null, evidence: i.lastDone?.evidence ?? null, unknown: [...i.unknownFacts].sort(),
  })).sort((x, y) => x.title.localeCompare(y.title));
  const factsA = JSON.stringify(facts(a));
  const factsB = JSON.stringify(facts(b));
  check('home: CLIENT A -> queue -> PostgreSQL -> CLIENT B: the two devices read IDENTICAL Home facts (context, duration knowledge, coverage, prerequisite, recurrence, last done)', factsA === factsB, factsA === factsB ? '' : `${factsA}\n   vs ${factsB}`);
  const viewB = m.view.buildHomeView(state(b), NOW);
  check('home: device B knows which category is Home by its ROLE, and what the household now calls it', viewB.context.kind === 'active' && viewB.context.category.systemRole === 'home' && viewB.label === 'House stuff', `${viewB.context.kind}/${viewB.label}`);
  const item = viewB.items.find((i) => i.title === 'Change the furnace filter');
  check('home: on device B the request is "asked" (not covered) and the completed prerequisite makes the task ready', item.responsibility.coverage === 'asked' && item.dependency.readiness === 'ready', `${item.responsibility.coverage}/${item.dependency.readiness}`);
  check('home: pulling produced no outbound work', b.persisted().identity.sync.queue.length === 0);

  // ---- Cross-device staleness, against the real database ---------------------------------------------------------------------------
  const openedOnB = m.home.taskBaselineOf(state(b).tasks.find((t) => t.title === 'Change the furnace filter'));
  const current = state(a).tasks.find((t) => t.title === 'Change the furnace filter');
  await save(a, (s, c) => m.home.updateHomeTask(s, c, { taskId: current.id, basedOn: m.home.taskBaselineOf(current), title: 'Change the furnace filter (edited on A)', dueDate: current.dueDate, notes: null, commitment: 'flexible', repeat: 'unchanged' }));
  await a.settle();
  const edited = sql(`SELECT title || '/' || revision || '/' || (category_id='${homeCategory}') FROM public.tasks WHERE household_id='${household}' AND local_id='${current.id}';`);
  check('home: an edit on A reached PostgreSQL by compare-and-set (revision advanced, category unchanged)', edited === 'Change the furnace filter (edited on A)/2/true', edited);
  await b.app.syncRuntime.request('foreground');
  await b.settle();
  const stale = await save(b, (s, c) => m.home.updateHomeTask(s, c, { taskId: current.id, basedOn: openedOnB, title: 'Overwritten from a stale editor on B', dueDate: current.dueDate, notes: null, commitment: 'flexible', repeat: 'unchanged' }));
  check('home: a save from an editor opened BEFORE the other device\'s change is REFUSED as stale, and nothing was overwritten', stale.ok === false && stale.reason === 'stale' && state(b).tasks.find((t) => t.id === current.id).title === 'Change the furnace filter (edited on A)', JSON.stringify(stale));

  // ---- Restart: no duplicates ------------------------------------------------------------------------------------------------------
  const before = sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}';`);
  const restarted = await device(m, { account: P, storage: a.storage, secure: a.secure });
  const restored = await restarted.app.accountRuntime.restore();
  await restarted.app.syncRuntime.idle();
  check('home: a restarted device resumes the same account and creates no duplicate Home row', restored.kind === 'accountBound' && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}';`) === before, `${restored.kind} ${before}`);

  // ---- A stranger -------------------------------------------------------------------------------------------------------------------------
  const stranger = clientFor(Q);
  const read = await stranger.from('tasks').select('id,title').eq('household_id', household);
  check('home: a stranger cannot read the household\'s Home tasks through PostgREST (RLS)', !read.error && (read.data ?? []).length === 0, JSON.stringify(read.data ?? read.error));
  const readCat = await stranger.from('household_categories').select('id').eq('household_id', household);
  check('home: a stranger cannot read the household\'s categories', !readCat.error && (readCat.data ?? []).length === 0);
  const plant = await stranger.from('tasks').insert({ household_id: household, local_id: 'planted', title: 'Planted in Home', category_id: homeCategory, scope: 'household' });
  check('home: a stranger cannot plant a task in the household\'s Home category (insert WITH CHECK)', plant.error !== null, JSON.stringify(plant.error));
  const edit = await stranger.from('tasks').update({ title: 'Hijacked' }).eq('household_id', household).select('id');
  check('home: a stranger cannot edit a Home task', !edit.error && (edit.data ?? []).length === 0);
  check('home: the attacks changed nothing', sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title IN ('Planted in Home','Hijacked');`) === '0');
}

async function loadModules() {
  const at = (...p) => `file://${join(REPO, 'src', ...p)}`;
  const [compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, struct, cat, resp, envelope, home, view] = await Promise.all([
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
    import(at('domain', 'structure.ts')),
    import(at('domain', 'categories.ts')),
    import(at('domain', 'responsibility.ts')),
    import(at('persistence', 'envelope.ts')),
    import(at('features', 'home', 'model', 'mutations.ts')),
    import(at('features', 'home', 'model', 'buildHomeView.ts')),
  ]);
  return { compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, struct, cat, resp, envelope, home, view };
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
