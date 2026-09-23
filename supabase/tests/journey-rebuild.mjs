import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
// Always the private stack's scratch database: this journey needs the F11 migration, and the shared default database is never migrated.
const STACK_DB = process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres';
const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 22, 15, 0, 0);
const TODAY = '2026-09-22';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const WITHHELD_MOVE = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-22T14:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };
const TITLE = 'Make space for myself again';
const NOTE = 'Saturday mornings used to be mine.';

/**
 * HK-FEATURE-11 (Me / Rebuild) — the Focus journey against REAL local PostgreSQL, PostgREST, RLS and the real claim RPC.
 *
 * Device A is built by `composeAccountApp` (the app root's own function) with the real store, account runtime, sync runtime,
 * coordinator, Supabase account client and sync transport; Focuses are made with the Me / Rebuild commands the screen commits.
 * Proven here over real HTTP: a Focus, its note and its private next step reach PostgreSQL owner-private and by typed reference; a
 * FRESH second device reconstructs Focus + relationship; an archive travels and does not resurrect; a second adult member of the SAME
 * household and an unrelated account both see nothing — not the Focus, not the link, not the change-log entry — through the API.
 */
export async function rebuildJourneys(check, psql) {
  console.log('\n  Me / Rebuild — production composition against real local Supabase (private stack)');
  if (!(await apiReachable())) {
    check('rebuild: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  const hasTable = psql(STACK_DB, "select to_regclass('public.rebuild_focuses') is not null;", { label: 'rebuild probe' }).out.includes('t');
  check('rebuild: the database this journey runs against carries the F11 migration', hasTable, STACK_DB);
  if (!hasTable) return;
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();

  const P = crypto.randomUUID(); // the owner
  const Q = crypto.randomUUID(); // a second adult member of the SAME household
  const R = crypto.randomUUID(); // an unrelated account
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${P}','rb-${P}@local.test','authenticated','authenticated'),('${Q}','rb-${Q}@local.test','authenticated','authenticated'),('${R}','rb-${R}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'rebuild fixture users' });
  const sql = (text) => {
    const out = psql(STACK_DB, `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'rebuild query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };
  const state = (d) => d.store.getSnapshot().state;

  // ---- Device A: a Focus, its note, and a private next step, through the Me / Rebuild commands --------------------------------------
  const a = await device(m, { account: P });
  await mutate(a, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  const bound = await a.signIn();
  check('rebuild: signing in binds the account through the REAL claim RPC', bound.kind === 'accountBound', bound.kind);
  const household = bound.householdId;
  const saved = [
    await mutate(a, (s, c) => m.cmd.setRebuildFocusNote(m.cmd.addRebuildFocus(s, c, { id: 'focus-j', title: TITLE }), c, 'focus-j', NOTE)),
    await mutate(a, (s, c) => m.cmd.addNextStep(s, c, { focusId: 'focus-j', title: 'Book the pottery class', categoryId: 'cat-wellbeing' })),
  ];
  check('rebuild: naming a Focus and saving a next step were committed through the production store', saved.every(Boolean));
  await a.settle();

  // ---- What PostgreSQL holds ------------------------------------------------------------------------------------------------------
  const focusRow = sql(`SELECT id || '/' || profile_id || '/' || scope || '/' || state || '/' || title || '/' || coalesce(note,'') FROM public.rebuild_focuses WHERE household_id='${household}';`);
  const [focusId] = focusRow.split('/');
  check('rebuild: the Focus reached PostgreSQL owner-private (profile_id = her, scope personal), with its note, as ONE row', focusRow === `${focusId}/${P}/personal/active/${TITLE}/${NOTE}`, focusRow);
  check('rebuild: the next step is a canonical Task in PostgreSQL, owner-private like its Focus',
    sql(`SELECT scope || '/' || owner_profile_id || '/' || status FROM public.tasks WHERE household_id='${household}' AND title='Book the pottery class';`) === `personal/${P}/open`);
  check('rebuild: the link is a typed reference — exactly one real FK set, to that Task, next_action, owned by her',
    sql(`SELECT l.target_type || '/' || (l.target_task_id = t.id) || '/' || (l.target_goal_id IS NULL AND l.target_system_id IS NULL AND l.target_event_id IS NULL) || '/' || l.relation || '/' || (l.focus_id = '${focusId}') || '/' || (l.profile_id = '${P}')
         FROM public.rebuild_focus_links l JOIN public.tasks t ON t.household_id = l.household_id AND t.title = 'Book the pottery class' WHERE l.household_id='${household}';`) === 'task/true/true/next_action/true/true');
  check('rebuild: the Focus and link change-log entries carry the owner',
    sql(`SELECT count(*) FROM public.change_log WHERE household_id='${household}' AND entity_table IN ('rebuild_focuses','rebuild_focus_links') AND owner_profile_id='${P}';`) === '2');
  check('rebuild: the durable queue drained', a.persisted().identity.sync.queue.length === 0, String(a.persisted().identity.sync.queue.length));

  // ---- A FRESH client reconstructs Focus + relationship -----------------------------------------------------------------------------
  const b = await device(m, { account: P });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  check('rebuild: a fresh device resumes the bound account and hydrates from PostgreSQL', resumed.kind === 'accountBound', resumed.kind);
  const focusB = state(b).rebuildFocuses.find((f) => f.title === TITLE);
  check('rebuild: CLIENT A -> queue -> PostgreSQL -> FRESH CLIENT B: the Focus arrived with its note and state', focusB !== undefined && focusB.note === NOTE && focusB.state === 'active', JSON.stringify(focusB ?? null));
  const stepsB = focusB === undefined ? [] : m.read.openNextActions(state(b), focusB.id).map((t) => `${t.title}/${t.scope}`);
  check('rebuild: ...and its relationship resolves on B to the same private next step', stepsB.join(',') === 'Book the pottery class/personal', stepsB.join(','));
  check('rebuild: pulling produced no outbound work on B', b.persisted().identity.sync.queue.length === 0);

  // ---- Archive transport: no resurrection -----------------------------------------------------------------------------------------
  await mutate(a, (s, c) => m.cmd.archiveRebuildFocus(s, c, 'focus-j'));
  await a.settle();
  check('rebuild: the archive reached PostgreSQL by compare-and-set; the Task was not touched',
    sql(`SELECT state || '/' || revision FROM public.rebuild_focuses WHERE id='${focusId}';`) === 'archived/2'
      && sql(`SELECT status FROM public.tasks WHERE household_id='${household}' AND title='Book the pottery class';`) === 'open');
  await b.app.syncRuntime.request('foreground');
  await b.settle();
  const archivedOnB = state(b).rebuildFocuses.find((f) => f.id === focusB?.id);
  check('rebuild: ARCHIVED on A arrives ARCHIVED on B — kept, off the Rebuild surface, and not resurrected', archivedOnB?.state === 'archived' && m.read.orderedFocuses(state(b)).length === 0, archivedOnB?.state);
  const c = await device(m, { account: P });
  await bindAsNewDevice(m, c, P, household);
  await c.signIn();
  check('rebuild: a THIRD fresh device hydrates it archived too (the cloud does not hand it back as active)', state(c).rebuildFocuses.find((f) => f.title === TITLE)?.state === 'archived');

  // ---- Q: a second adult member of the SAME household ---------------------------------------------------------------------------------
  // The same way the Kids journey adds a second adult: a profile, then a membership (no client path can create either).
  psql(STACK_DB, `INSERT INTO public.profiles (id, timezone) VALUES ('${Q}', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope) VALUES ('${household}', 'user-rb-q', '${Q}', 'adult', 'member', NULL, 'personal');`, { label: 'rebuild same-household member' });
  const q = clientFor(Q);
  const qFocus = await q.from('rebuild_focuses').select('id,title,note');
  const qLinks = await q.from('rebuild_focus_links').select('id,focus_id');
  check('rebuild: RLS SAME-HOUSEHOLD MEMBER reads NONE of her Focuses through PostgREST', !qFocus.error && (qFocus.data ?? []).length === 0, JSON.stringify(qFocus.data ?? qFocus.error));
  check('rebuild: ...and NONE of her links (no link row, so no count and no Focus id)', !qLinks.error && (qLinks.data ?? []).length === 0, JSON.stringify(qLinks.data ?? qLinks.error));
  const qPull = await q.rpc('sync_pull', { p_cursor: '0', p_household_id: household });
  const qTables = new Set(((qPull.data ?? {}).rows ?? []).map((row) => row.entity_table));
  check('rebuild: ...and her pull of the shared household carries no Focus or link change at all', !qPull.error && !qTables.has('rebuild_focuses') && !qTables.has('rebuild_focus_links'), JSON.stringify([...qTables]));
  const qEdit = await q.from('rebuild_focuses').update({ title: 'Changed by Q' }).eq('id', focusId).select('id');
  check('rebuild: ...and cannot edit her Focus', !qEdit.error && (qEdit.data ?? []).length === 0, JSON.stringify(qEdit.data ?? qEdit.error));

  // ---- R: an unrelated account ------------------------------------------------------------------------------------------------------
  const r = clientFor(R);
  const rRead = await r.from('rebuild_focuses').select('id').eq('household_id', household);
  check('rebuild: an unrelated account reads nothing', !rRead.error && (rRead.data ?? []).length === 0, JSON.stringify(rRead.data ?? rRead.error));
  const rPlant = await r.from('rebuild_focuses').insert({ household_id: household, profile_id: R, local_id: 'planted', title: 'Planted', state: 'active', producer: 'user-action', origin_created_at: new Date(NOW).toISOString(), origin_updated_at: new Date(NOW).toISOString() });
  check('rebuild: an unrelated account cannot plant a Focus in her household', rPlant.error !== null, JSON.stringify(rPlant.error));
  check('rebuild: the attacks changed nothing', sql(`SELECT count(*) || '/' || string_agg(title, ',') FROM public.rebuild_focuses WHERE household_id='${household}';`) === `1/${TITLE}`);
}

async function loadModules() {
  const at = (...p) => `file://${join(REPO, 'src', ...p)}`;
  const [compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, envelope, cmd, read] = await Promise.all([
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
    import(at('persistence', 'envelope.ts')),
    import(at('domain', 'rebuild', 'commands.ts')),
    import(at('domain', 'rebuild', 'read.ts')),
  ]);
  return { compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, envelope, cmd, read };
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
    const result = await app.accountRuntime.signIn('apple');
    await app.syncRuntime.idle();
    return result;
  };
  dev.settle = async () => {
    for (const t of timers.splice(0)) if (t.live) t.work();
    await app.syncRuntime.idle();
  };
  return dev;
}

const mutate = (d, fn) => d.store.commit((state, ctx) => fn(state, ctx));
