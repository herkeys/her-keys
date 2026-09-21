import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TZ = 'America/New_York';
const NOW = Date.UTC(2026, 8, 16, 14, 0, 0); // Wed 2026-09-16 10:00 America/New_York
const TODAY = '2026-09-16';
const USER = { producer: 'user-action', artifactId: null, confidence: null };
const WITHHELD_MOVE = { id: `onemove-${TODAY}`, forDate: TODAY, targetId: null, targetType: 'task', status: 'withheld', decidedAt: '2026-09-16T13:00:00.000Z', completedAt: null, provenance: USER, scope: 'personal' };

const API_URL = process.env.HERKEYS_LOCAL_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.HERKEYS_LOCAL_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * HK-FEATURE-07 — Co-Parent Logistics against REAL PostgreSQL, PostgREST, RLS and the real claim RPC.
 *
 * Every device is built by `composeAccountApp` (the function the app's own root calls) with the real store, account runtime, sync
 * runtime, Supabase account client and sync transport; only storage/keychain are in memory and the provider is scripted. Feature 07
 * adds NO sync code and NO schema: every write below is a canonical mutation that the store's change observer queues like any other.
 *
 * Additive and local only: it creates fresh random users/households in the container's default database and drops nothing.
 */
export async function coparentJourneys(check, psql) {
  console.log('\n  Feature 07 co-parent logistics — real local Supabase');
  if (!(await apiReachable())) {
    check('coparent: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();

  const P = crypto.randomUUID(); // owner of the household
  const Q = crypto.randomUUID(); // a legitimate second adult member of the same household
  const R = crypto.randomUUID(); // an unrelated authenticated account
  psql(
    'postgres',
    `INSERT INTO auth.users (id, email, aud, role) VALUES
       ('${P}','cp-${P}@local.test','authenticated','authenticated'),
       ('${Q}','cp-${Q}@local.test','authenticated','authenticated'),
       ('${R}','cp-${R}@local.test','authenticated','authenticated')
     ON CONFLICT (id) DO NOTHING;`,
    { label: 'coparent fixture users' }
  );
  const sql = (text) => {
    const out = psql('postgres', `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'coparent query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };

  const sent = [];
  const a = await device(m, { account: P, sent });
  await mutate(a, (s) => ({
    ...s,
    oneMoves: [WITHHELD_MOVE],
    children: [
      { id: 'child-josie', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' },
      { id: 'child-milo', displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' },
    ],
  }));
  await a.store.flush();
  const bound = await a.signIn();
  check('coparent: signing in binds the account through the REAL claim RPC, carrying both children', bound.kind === 'accountBound', bound.kind);
  const household = bound.householdId;
  check('coparent: the sync runtime is OPERATING for the bound account (production composition, not a hand-built coordinator)',
    a.app.syncRuntime.running()?.accountId === P && a.app.syncRuntime.running()?.householdId === household);
  check('coparent: both children exist in PostgreSQL as household members of type child',
    sql(`SELECT count(*) FROM public.household_members WHERE household_id='${household}' AND member_type='child';`) === '2');

  // ---- the representative journey: every kind Feature 07 writes, through the feature's OWN mutations -------------
  const F = m.mut;
  const commit = (device, run) => F.commitMutation(device.store, run, ['saved']);
  const base = { title: 'Pickup Josie', date: '2026-09-18', startTime: '17:00', endTime: '17:30', location: '', notes: '', commitment: 'fixed', needsMe: null, repeat: 'none' };
  const h1 = await commit(a, (s, c) => F.createHandoff(s, c, { ...base, childId: 'child-josie', location: 'Front desk, 12 Elm St', needsMe: true, repeat: 'weekly' }, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }));
  const h2 = await commit(a, (s, c) => F.createHandoff(s, c, { ...base, childId: 'child-milo', title: 'Drop off Milo', date: '2026-09-19' }, { kind: 'new', displayName: 'Alex', relationship: 'co-parent' }));
  check('coparent: two handoffs were created through the canonical mutation, each with its own NEW person (two people named Alex)', h1.outcome === 'saved' && h2.outcome === 'saved', `${h1.outcome}/${h2.outcome}`);
  const prep1 = await commit(a, (s, c) => F.createPreparation(s, c, { childId: 'child-josie', title: 'Pack the school laptop', dueDate: '2026-09-17', notes: '', linkEventId: h1.id }));
  await commit(a, (s, c) => F.createPreparation(s, c, { childId: 'child-milo', title: 'Return library book', dueDate: '', notes: '', linkEventId: null }));
  const fu = await commit(a, (s, c) => F.createMoneyFollowUp(s, c, { title: 'Soccer registration', childId: 'child-josie', amountText: '80', currency: 'USD', direction: 'inflow', followUpDate: '2026-09-25', notes: '' }, { kind: 'person', personId: a.store.getSnapshot().state.people[0].id }));
  const rid = a.store.getSnapshot().state.responsibilities.find((r) => r.about.kind === 'event' && r.about.id === h1.id).id;
  await commit(a, (s, c) => F.recordAnswer(s, c, rid, 'accepted_needs_me'));
  await a.settle();
  check('coparent: preparation and money follow-up were created', prep1.outcome === 'saved' && fu.outcome === 'saved', `${prep1.outcome}/${fu.outcome}`);
  check('coparent: the durable queue drained and nothing needs attention', a.persisted().identity.sync.queue.length === 0 && !a.app.syncRuntime.snapshot().needsAttention,
    `queue=${a.persisted().identity.sync.queue.length}`);

  // ---- what PostgreSQL holds --------------------------------------------------------------------------------------
  check('coparent: both handoffs are rows in `events`, owner-only scope, owned by P, with the child as a real member reference',
    sql(`SELECT count(*) FROM public.events e JOIN public.household_members c ON c.id = e.subject_member_id WHERE e.household_id='${household}' AND e.scope='coparent-shared' AND e.owner_profile_id='${P}' AND c.member_type='child';`) === '2');
  check('coparent: each handoff names ITS OWN child (Josie / Milo) by identity',
    sql(`SELECT string_agg(e.title || '>' || c.display_name, ',' ORDER BY e.title) FROM public.events e JOIN public.household_members c ON c.id = e.subject_member_id WHERE e.household_id='${household}';`) === 'Drop off Milo>Milo,Pickup Josie>Josie');
  check('coparent: the location travelled as recorded, and the amountless handoff has none (null, never invented)',
    sql(`SELECT string_agg(e.title || '=' || COALESCE(e.location,'null'), ',' ORDER BY e.title) FROM public.events e WHERE e.household_id='${household}';`) === 'Drop off Milo=null,Pickup Josie=Front desk, 12 Elm St');
  check('coparent: two DIFFERENT people both named "Alex" exist as distinct rows (identity is the id, never the name)',
    sql(`SELECT count(DISTINCT id) || '/' || count(*) FROM public.household_people WHERE household_id='${household}' AND display_name='Alex' AND relationship='co-parent';`) === '2/2');
  check('coparent: the recorded acceptance is a responsibility row — accepted, STILL needs her, about the right handoff, held by a person',
    sql(`SELECT r.state || ':' || r.still_needs_me || ':' || r.responsible_kind FROM public.responsibilities r JOIN public.events e ON e.id = r.about_event_id WHERE r.household_id='${household}' AND e.title='Pickup Josie';`) === 'accepted:true:person');
  check('coparent: preparation is tied to the handoff by an ACTIVE requires edge (event requires task); the unlinked item has no edge',
    sql(`SELECT count(*) FROM public.dependencies d JOIN public.events e ON e.id = d.from_event_id JOIN public.tasks t ON t.id = d.to_task_id WHERE d.household_id='${household}' AND d.relation='requires' AND d.status='active' AND e.title='Pickup Josie' AND t.title='Pack the school laptop';`) === '1'
      && sql(`SELECT count(*) FROM public.dependencies WHERE household_id='${household}';`) === '1');
  check('coparent: the weekly repeat is one active recurrence rule in the HOUSEHOLD zone, anchored on the handoff',
    sql(`SELECT r.frequency || ':' || r.interval_count || ':' || r.by_weekday::text || ':' || r.timezone || ':' || r.status || ':' || r.anchor_date FROM public.recurrence_rules r JOIN public.events e ON e.id = r.about_event_id WHERE r.household_id='${household}' AND e.title='Pickup Josie';`) === 'weekly:1:{5}:America/New_York:active:2026-09-18');
  check('coparent: the follow-up is an amount-bearing task — exact minor units, currency, direction, follow-up date, child; owner-only',
    sql(`SELECT t.value_amount_minor || ':' || t.value_currency || ':' || t.value_direction || ':' || t.due_date || ':' || t.scope FROM public.tasks t WHERE t.household_id='${household}' AND t.title='Soccer registration';`) === '8000:USD:inflow:2026-09-25:coparent-shared');
  check('coparent: nothing local-only or interpretive was written (no artifacts, interpretations, intents or executions from this feature)',
    sql(`SELECT (SELECT count(*) FROM public.source_artifacts WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.interpretations WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.action_intents WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.action_executions WHERE household_id='${household}');`) === '0/0/0/0');

  // ---- Device B: the second install hydrates and shows the SAME logistics -----------------------------------------
  const b = await device(m, { account: P, sent });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  check('coparent: the second device resumes the bound account and hydrates', resumed.kind === 'accountBound' && b.persisted().identity.sync.hydration === 'ready', `${resumed.kind}/${b.persisted().identity.sync.hydration}`);
  const viewOf = (device) => {
    const s = device.store.getSnapshot().state;
    return m.proj.buildCoParentLogisticsView(s, s.household.id, { nowMs: NOW });
  };
  const va = viewOf(a);
  const vb = viewOf(b);
  const brief = (v) => JSON.stringify({ t: v.transitions, p: v.preparation, m: v.moneyFollowUps, n: v.people, c: v.children });
  check('coparent: CLIENT A -> queue -> PostgreSQL -> CLIENT B: the whole projection is identical (child, counterpart, responsibility, preparation, recurrence, money)', brief(va) === brief(vb),
    `A=${va.transitions.length}/${va.preparation.length}/${va.moneyFollowUps.length} B=${vb.transitions.length}/${vb.preparation.length}/${vb.moneyFollowUps.length}`);
  const tb = vb.transitions.find((t) => t.title === 'Pickup Josie');
  check('coparent: B keeps the CHILD identity (Josie, by id) and the COUNTERPART identity (Alex, active, Co-parent) of the accepted-but-still-needs-her handoff',
    tb?.child.status === 'known' && tb.child.childId === 'child-josie' && tb.responsibility.counterpart?.displayName === 'Alex' && tb.responsibility.counterpart.relationshipLabel === 'Co-parent'
      && tb.responsibility.stage === 'accepted' && tb.responsibility.coverage === 'not_covered');
  check('coparent: B sees two distinct counterpart adults with the same name, and each child\'s handoff names its own',
    new Set(vb.transitions.map((t) => t.responsibility.counterpart?.personId)).size === 2 && new Set(vb.transitions.map((t) => t.responsibility.counterpart?.label)).size === 2);
  check('coparent: B holds the exact amount and the link between preparation and handoff',
    vb.moneyFollowUps[0]?.amount.decimal === '80.00' && tb.preparation.linked === 1 && tb.preparation.items[0].title === 'Pack the school laptop');
  check('coparent: pulled state produced NO outbound work on B', b.persisted().identity.sync.queue.length === 0);

  // ---- and the round trip the OTHER way: B records that it no longer needs her; A converges ------------------------
  await F.commitMutation(b.store, (s, c) => F.recordStillNeedsMe(s, c, rid, false), ['saved']);
  await b.settle();
  await a.app.syncRuntime.request('foreground');
  await a.settle();
  const covered = viewOf(a).transitions.find((t) => t.title === 'Pickup Josie');
  check('coparent: B -> PostgreSQL -> A: her recorded answer arrives, and only then is the handoff covered', covered?.responsibility.coverage === 'covered',
    covered?.responsibility.coverage);

  // ---- archive the counterpart on one device: the other must stop showing a positive claim --------------------------
  const alexId = tb.responsibility.counterpart.personId;
  await mutate(b, (s, c) => m.resp.archivePerson(s, c, alexId));
  await b.settle();
  await a.app.syncRuntime.request('foreground');
  await a.settle();
  const reviewed = viewOf(a).transitions.find((t) => t.title === 'Pickup Josie');
  check('coparent: an archived counterpart on B makes A show NEEDS REVIEW — the covered/accepted claim does not survive, nothing was reassigned',
    reviewed?.responsibility.coverage === 'needs_review' && reviewed.section === 'needs_review'
      && sql(`SELECT r.state || ':' || r.responsible_kind FROM public.responsibilities r JOIN public.events e ON e.id = r.about_event_id WHERE r.household_id='${household}' AND e.title='Pickup Josie';`) === 'accepted:person');

  // ---- restart: process death, then a fresh runtime from the persisted blob -----------------------------------------
  const counts = () => sql(`SELECT (SELECT count(*) FROM public.events WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.tasks WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.household_people WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.responsibilities WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.dependencies WHERE household_id='${household}') || '/' || (SELECT count(*) FROM public.recurrence_rules WHERE household_id='${household}');`);
  const before = counts();
  a.app.syncRuntime.stop();
  const a2 = await device(m, { account: P, sent, storage: a.storage, secure: a.secure });
  const restored = await a2.app.accountRuntime.restore();
  await a2.app.syncRuntime.idle();
  check('coparent: restart restores the account and resumes sync with NO duplicate rows and no second claim',
    restored.kind === 'accountBound' && counts() === before && sql(`SELECT count(*) FROM public.account_claims WHERE profile_id='${P}' AND status='complete';`) === '1', `${restored.kind} ${counts()} vs ${before}`);

  // ---- RLS against the rows Feature 07 actually wrote --------------------------------------------------------------
  sql(`INSERT INTO public.profiles (id, timezone) VALUES ('${Q}','America/New_York') ON CONFLICT (id) DO NOTHING;
       INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
       VALUES ('${household}', 'user-2', '${Q}', 'adult', 'member', NULL, 'personal') ON CONFLICT DO NOTHING;`);
  // A household-scope control row so "the member's session works" is proven, not assumed (blocking everyone is not a PASS).
  await mutate(a2, (s, c) => m.tasks.addTask(s, c, { title: 'Household chore everyone may see', categoryId: s.categories[0].id, scope: 'household', durationMinutes: 10, durationSource: 'user' }));
  await a2.settle();

  const owner = clientFor(P);
  const member = clientFor(Q);
  const stranger = clientFor(R);
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const seen = async (client, table, filter) => {
    let query = client.from(table).select('id').eq('household_id', household);
    if (filter) query = filter(query);
    const { data } = await query;
    return (data ?? []).length;
  };
  const scopeOwned = (q) => q.eq('scope', 'coparent-shared');
  check('coparent RLS: the OWNER can read her own co-parenting events and tasks (legitimate access succeeds)',
    (await seen(owner, 'events', scopeOwned)) === 2 && (await seen(owner, 'tasks', scopeOwned)) === 3, `${await seen(owner, 'events', scopeOwned)}/${await seen(owner, 'tasks', scopeOwned)}`);
  check('coparent RLS: the second household member CAN read household-scope rows (their session works)', (await seen(member, 'tasks', (q) => q.eq('scope', 'household'))) === 1);
  check('coparent RLS: ...but the same member sees NONE of the owner-only co-parenting events or tasks — `coparent-shared` is not sharing',
    (await seen(member, 'events', scopeOwned)) === 0 && (await seen(member, 'tasks', scopeOwned)) === 0);
  check('coparent RLS: the member sees none of the owner-private people, responsibilities, dependencies or recurrence rules',
    (await seen(member, 'household_people')) + (await seen(member, 'responsibilities')) + (await seen(member, 'dependencies')) + (await seen(member, 'recurrence_rules')) === 0);
  check('coparent RLS: an unrelated authenticated account sees nothing of the household at all',
    (await seen(stranger, 'events')) + (await seen(stranger, 'tasks')) + (await seen(stranger, 'household_people')) + (await seen(stranger, 'responsibilities')) === 0);
  check('coparent RLS: an anonymous client sees nothing (or is refused outright)',
    (await seen(anon, 'events')) + (await seen(anon, 'tasks')) + (await seen(anon, 'household_people')) + (await seen(anon, 'responsibilities')) === 0);

  const eventsBefore = sql(`SELECT count(*) FROM public.events WHERE household_id='${household}';`);
  const tamper = await stranger.from('events').update({ location: 'stranger was here' }).eq('household_id', household).select('id');
  const memberTamper = await member.from('events').update({ location: 'member was here' }).eq('household_id', household).eq('scope', 'coparent-shared').select('id');
  const catId = (await owner.from('household_categories').select('id').eq('household_id', household).eq('system_role', 'coparenting').limit(1)).data?.[0]?.id;
  const plantRow = (scope, ownerProfileId) => ({
    household_id: household, local_id: `planted-${scope}`, owner_profile_id: ownerProfileId, title: 'Planted', category_id: catId,
    starts_at: '2026-09-30T20:00:00Z', ends_at: '2026-09-30T21:00:00Z', commitment: 'fixed', status: 'active', scope, producer: 'user-action',
  });
  const plant = await stranger.from('events').insert(plantRow('household', null));
  // A same-household member trying to write an owner-only row AS the owner (a forged owner_profile_id): the WITH CHECK refuses it.
  const forged = await member.from('events').insert(plantRow('coparent-shared', P));
  check('coparent RLS: a stranger and a same-household member can neither change an owner-only handoff nor plant one (refused by RLS, code 42501)',
    (tamper.data ?? []).length === 0 && (memberTamper.data ?? []).length === 0 && plant.error?.code === '42501' && forged.error?.code === '42501',
    `${tamper.data?.length}/${memberTamper.data?.length}/${plant.error?.code}/${forged.error?.code}`);
  check('coparent RLS: the attacks changed nothing (no location rewritten, nothing planted, same number of events)',
    sql(`SELECT count(*) FROM public.events WHERE household_id='${household}' AND (location LIKE '%was here%' OR local_id LIKE 'planted-%');`) === '0'
      && sql(`SELECT count(*) FROM public.events WHERE household_id='${household}';`) === eventsBefore);

  // ---- account switch on one device: nothing of P is uploaded under R ------------------------------------------------
  const requestsBefore = sent.length;
  const switched = await device(m, { account: R, sent, storage: a.storage });
  const other = await switched.signIn();
  check('coparent: account P -> account R on one device quarantines it — nothing starts and nothing of P\'s children, people or places is uploaded under R',
    other.kind === 'boundOther' && switched.app.syncRuntime.running() === null && sent.length === requestsBefore, `${other.kind} ${sent.length - requestsBefore} requests`);
}

async function loadModules() {
  const at = (p) => `file://${join(REPO, 'src', ...p)}`;
  const [compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, tasks, struct, resp, envelope, mut, proj] = await Promise.all([
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
    import(at(['domain', 'tasks.ts'])),
    import(at(['domain', 'structure.ts'])),
    import(at(['domain', 'responsibility.ts'])),
    import(at(['persistence', 'envelope.ts'])),
    import(at(['features', 'coparent', 'mutations.ts'])),
    import(at(['features', 'coparent', 'projection.ts'])),
  ]);
  return { compose, appStore, observer, repo, storage, provider, secure, cloud, transport, claimSeam, tasks, struct, resp, envelope, mut, proj };
}

/** A fresh install of an account whose household already exists in the cloud (the recorded stand-in for adopting an existing household). */
async function bindAsNewDevice(m, d, account, householdId) {
  d.store.setIdentity({
    binding: { accountId: account, householdId, boundAt: new Date(NOW).toISOString(), kind: 'claim', idMap: {} },
    receipt: null, quarantine: null,
    sync: m.claimSeam.namespaceForNewDevice({ accountId: account, householdId, deviceId: crypto.randomUUID() }),
  });
  await d.store.saveIdentity();
}

/** One installation, built exactly as the app's root builds it, against the real local stack. */
async function device(m, { account, sent, storage = m.storage.createMemoryStorage({}), secure = m.secure.createMemorySecureStorage({}), mode = 'empty' }) {
  const client = clientFor(account);
  const observer = m.observer.createChangeObserver({ now: () => NOW });
  const repository = m.repo.createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
  const store = m.appStore.createAppStore({ repository, mode, now: () => NOW, timeZone: () => TZ, observe: observer.observe });
  await store.hydrate();
  await store.flush();

  const real = m.transport.createSupabaseSyncTransport(client);
  const transport = {
    ...real,
    async create(table, deviceId, row) { sent.push({ table, row }); return real.create(table, deviceId, row); },
    async update(table, cloudId, base, patch, column) { sent.push({ table, patch }); return real.update(table, cloudId, base, patch, column); },
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
