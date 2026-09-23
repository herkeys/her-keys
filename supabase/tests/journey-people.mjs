import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonClient, apiReachable, clientFor, createDeviceStore } from './support/syncDevice.mjs';

/**
 * HK-FEATURE-13 (People OS) — the People journeys against the REAL local API: real HTTP, real PostgREST, real RLS, real CAS, real
 * change log and the real snapshot barrier, with the production sync engine on every simulated device. Each device has its own
 * persisted blob, queue, cursor and mappings; they share the backend and nothing else.
 *
 *   P1  owner A (offline first) creates a person, a context, a follow-up, edits and archives — then pushes on reconnect
 *   P2  a FRESH device of A reconstructs the same identities and context; the archived context stays archived
 *   P3  USER B, a second adult of A's household, hydrates the household on a fresh device: the child, and NONE of A's People
 *   P4  B, a stranger and anon asking PostgREST directly get nothing — not a row, not a count
 *   P5  a stale edit from A's first device never overwrites the newer one from the second; the disagreement is recorded
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const STACK_DB = process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres';
const TZ = 'America/Chicago';

async function load() {
  const at = (p) => `file://${join(REPO, 'src', ...p)}`;
  const [types, queue, claimSeam, coordinator, apply, transport, initial, rules, people, state] = await Promise.all([
    import(at(['domain', 'sync', 'syncTypes.ts'])),
    import(at(['domain', 'sync', 'queue.ts'])),
    import(at(['domain', 'sync', 'claimSeam.ts'])),
    import(at(['domain', 'sync', 'coordinator.ts'])),
    import(at(['domain', 'sync', 'apply.ts'])),
    import(at(['platform', 'supabaseSyncTransport.ts'])),
    import(at(['state', 'initialState.ts'])),
    import(at(['domain', 'sync', 'domainRules.ts'])),
    import(at(['domain', 'people.ts'])),
    import(at(['domain', 'state.ts'])),
  ]);
  return { types, queue, claimSeam, coordinator, apply, transport, initial, rules, people, state };
}

function makeDevice(m, { accountId, deviceId, householdId, state, namespace, transport }) {
  const store = createDeviceStore();
  let currentState = state;
  let currentNamespace = namespace;
  store.commit(currentState, currentNamespace);
  const device = {
    state: () => currentState,
    namespace: () => currentNamespace,
    /** A domain change and its sync intents land in ONE durable write, as the app's change bridge does. */
    change(next, intents) {
      currentState = next;
      for (const [kind, localId, op] of intents) {
        const result = m.queue.enqueue(currentNamespace, { kind, localId, op, at: new Date().toISOString() });
        if (result.ok) currentNamespace = result.namespace;
      }
      store.commit(currentState, currentNamespace);
    },
  };
  device.coordinator = m.coordinator.createSyncCoordinator({
    accountId,
    activeAccountId: () => accountId,
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
    report: () => {},
    pull: {
      transport,
      now: () => Date.now(),
      applyRow: (s, kind, localId, row, resolve) => m.apply.applyCloudRow(s, kind, localId, row, resolve),
      applyTombstone: (s, kind, localId) => m.apply.applyCloudTombstone(s, kind, localId),
      matchesLocal: (kind, localId, row) => m.rules.rowMatchesLocal(currentState, { householdId, profileId: accountId, namespace: currentNamespace }, kind, localId, row),
      displacedBy: (s, kind, localId, row, resolve, isPending) => m.rules.displacedBy(s, kind, localId, row, resolve, isPending),
      dropLocal: (s, kind, localId) => m.rules.dropLocal(s, kind, localId),
      mintLocalId: (kind, wanted) => `${wanted}-x${deviceId.slice(0, 4)}`,
    },
  });
  device.sync = async (passes = 3) => {
    for (let pass = 0; pass < passes; pass += 1) await device.coordinator.request('manual');
  };
  return device;
}

const ctx = (() => {
  let n = 0;
  return () => ({ nowMs: Date.now(), today: new Date().toISOString().slice(0, 10), createId: (p) => `${p}-j${++n}` });
})();

export async function peopleJourneys(check, psql) {
  console.log('\n  People OS journeys — real local API (HK-FEATURE-13)');
  if (!(await apiReachable())) {
    check('people: the local API is reachable', false, 'start the stack');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await load();

  const A = crypto.randomUUID();
  const B = crypto.randomUUID();
  const C = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES
      ('${A}','people-${A}@local.test','authenticated','authenticated'),
      ('${B}','people-${B}@local.test','authenticated','authenticated'),
      ('${C}','people-${C}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'people users' });

  const deviceA1 = crypto.randomUUID();
  const clientA = clientFor(A);
  const boot = await clientA.rpc('bootstrap_account', { p_claim_key: crypto.randomUUID(), p_timezone: TZ, p_device_id: deviceA1 });
  if (boot.error) throw new Error(`bootstrap failed: ${boot.error.message}`);
  const householdId = boot.data.household_id;
  const bootC = await clientFor(C).rpc('bootstrap_account', { p_claim_key: crypto.randomUUID(), p_timezone: TZ, p_device_id: crypto.randomUUID() });
  if (bootC.error) throw new Error(`bootstrap C failed: ${bootC.error.message}`);
  // B is a second ADULT of A's household: privileged infrastructure (no client path creates one), exactly as the harness fixtures do.
  psql(STACK_DB, `INSERT INTO public.profiles (id, timezone) VALUES ('${B}', '${TZ}') ON CONFLICT (id) DO NOTHING;
                  INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
                  VALUES ('${householdId}', 'member-b-${B.slice(0, 8)}', '${B}', 'adult', 'member', NULL, 'personal');`, { label: 'people member B' });

  // ---- P1: offline first, then reconnect ---------------------------------------------------------------------------
  let s = m.initial.createEmptyState(TZ);
  s = { ...s, children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }] };
  const nsA = m.claimSeam.namespaceFromClaim({ state: s, accountId: A, householdId, deviceId: deviceA1, idMap: boot.data.id_map });
  const offline = { create: async () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null }), update: async () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null }), pull: async () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null }), fetchRows: async () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null }) };
  const realA = m.transport.createSupabaseSyncTransport(clientA);
  let transportA = offline;
  const switching = new Proxy({}, { get: (_t, key) => (...args) => transportA[key](...args) });
  const a1 = makeDevice(m, { accountId: A, deviceId: deviceA1, householdId, state: s, namespace: nsA, transport: switching });

  const p = m.people;
  let r = p.addExternalPerson(a1.state(), ctx(), { displayName: 'Jordan Lee', relationshipName: 'Neighbor', contextNote: 'JOURNEY-NOTE spare key' });
  const personId = r.id;
  a1.change(r.state, [['member', 'child-1', 'create'], ['person', personId, 'create'], ['personContext', r.state.personContexts.at(-1).id, 'create']]);
  const contextId = a1.state().personContexts.at(-1).id;
  r = p.openPersonContext(a1.state(), ctx(), { kind: 'child', id: 'child-1' }, { relationshipName: 'Daughter' });
  const childContextId = r.id;
  a1.change(r.state, [['personContext', childContextId, 'create']]);
  r = p.addFollowUp(a1.state(), ctx(), { contextId, draftKey: 'journeyfollowupkeyabcdefghij', title: 'Return the ladder' });
  const taskId = r.id;
  a1.change(r.state, [['task', taskId, 'create'], ['personTaskLink', p.followUpLinkId('journeyfollowupkeyabcdefghij'), 'create']]);
  r = p.archivePersonContext(a1.state(), ctx(), contextId);
  a1.change(r.state, [['personContext', contextId, 'update']]);
  await a1.sync(2);
  const { data: none } = await clientA.from('person_contexts').select('id').eq('household_id', householdId);
  check('people: P1. offline — nothing reached the server, and every intent is durable in the queue', (none ?? []).length === 0 && a1.namespace().queue.length >= 5, `queue=${a1.namespace().queue.length}`);

  transportA = realA;
  await a1.sync(4);
  const unresolved = a1.namespace().evidence.filter((e) => !e.resolved);
  check('people: P1. on reconnect every People row pushed through the ORDINARY engine, with no evidence', a1.namespace().queue.length === 0 && unresolved.length === 0,
    `queue=${a1.namespace().queue.length} evidence=${JSON.stringify(unresolved.slice(0, 3).map((e) => `${e.kind}:${e.evidence}:${e.detail}`))}`);
  const { data: ctxRows } = await clientA.from('person_contexts').select('id,status,relationship_name,context_note,child_id,person_id,revision').eq('household_id', householdId);
  const archivedRow = (ctxRows ?? []).find((row) => row.person_id !== null);
  // The archive was made while its create was still queued, so the queue sends the row as it now is (archived) in ONE create:
  // revision 1. What matters is that the server never held a live version of an archived context.
  check('people: P1. the server holds exactly two contexts; the neighbor\'s arrived ARCHIVED, with her words (the offline archive was folded into the pending create)',
    (ctxRows ?? []).length === 2 && archivedRow?.status === 'archived' && archivedRow?.relationship_name === 'Neighbor' && archivedRow?.revision === 1, JSON.stringify(archivedRow));
  const { data: links } = await clientA.from('person_task_links').select('context_id,follow_up_task_id,relation').eq('household_id', householdId);
  const { data: fuTask } = await clientA.from('tasks').select('id,scope,owner_profile_id,title').eq('id', links?.[0]?.follow_up_task_id ?? '00000000-0000-4000-8000-000000000000');
  check('people: P1. one follow_up link names the context and a PRIVATE task owned by A', (links ?? []).length === 1 && links[0].relation === 'follow_up' && links[0].context_id === archivedRow?.id
    && fuTask?.[0]?.scope === 'personal' && fuTask?.[0]?.owner_profile_id === A, JSON.stringify({ links, fuTask }));

  // ---- P2: a fresh device of A reconstructs ----------------------------------------------------------------------------
  const deviceA2 = crypto.randomUUID();
  const a2 = makeDevice(m, { accountId: A, deviceId: deviceA2, householdId, state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId: A, householdId, deviceId: deviceA2 }), transport: m.transport.createSupabaseSyncTransport(clientFor(A)) });
  await a2.sync(3);
  const s2 = a2.state();
  const ctx2 = s2.personContexts.find((c) => c.personId !== null);
  const person2 = s2.people.find((x) => x.id === ctx2?.personId);
  check('people: P2. a FRESH device of A rebuilt both contexts, the neighbor\'s still ARCHIVED (no resurrection), naming the same person',
    s2.personContexts.length === 2 && ctx2?.status === 'archived' && ctx2?.contextNote === 'JOURNEY-NOTE spare key' && person2?.displayName === 'Jordan Lee', JSON.stringify(ctx2));
  const link2 = s2.personTaskLinks[0];
  check('people: P2. ...and the follow-up link, re-pointed at the reconstructed private task', s2.personTaskLinks.length === 1 && s2.tasks.find((t) => t.id === link2.followUp.id)?.title === 'Return the ladder'
    && link2.contextId === ctx2.id);
  const childCtx2 = s2.personContexts.find((c) => c.childId !== null);
  check('people: P2. the child context names the reconstructed child, not a copy of it', childCtx2 && s2.children.some((c) => c.id === childCtx2.childId) && s2.children.length === 1);
  const valid = m.state.validateAppState(s2);
  check('people: P2. what it hydrated is a valid household', valid.ok, valid.ok ? '' : valid.issues.slice(0, 3).join('; '));

  // ---- P3: same-household B hydrates the household on a fresh device ---------------------------------------------------
  const deviceB = crypto.randomUUID();
  const clientB = clientFor(B);
  const b = makeDevice(m, { accountId: B, deviceId: deviceB, householdId, state: m.initial.createEmptyState(TZ),
    namespace: m.claimSeam.namespaceForNewDevice({ accountId: B, householdId, deviceId: deviceB }), transport: m.transport.createSupabaseSyncTransport(clientB) });
  await b.sync(3);
  const sb = b.state();
  check('people: P3. same-household B hydrates the SHARED child (canonical identity rights unchanged)', sb.children.some((c) => c.displayName === 'Mia'));
  check('people: P3. ...and NONE of A\'s People: no person, no context (not even about the shared child), no link, no private follow-up task',
    sb.people.length === 0 && sb.personContexts.length === 0 && sb.personTaskLinks.length === 0 && !sb.tasks.some((t) => t.title === 'Return the ladder'),
    JSON.stringify({ people: sb.people.length, contexts: sb.personContexts.length, links: sb.personTaskLinks.length }));
  check('people: P3. B\'s hydration saw no People table at all', !JSON.stringify(b.namespace().mappings).includes('personContext') && !JSON.stringify(b.namespace().mappings).includes('personTaskLink'));

  // ---- P4: direct API reads ---------------------------------------------------------------------------------------------
  const ids = (ctxRows ?? []).map((row) => row.id);
  const probe = async (client) => {
    const q1 = await client.from('person_contexts').select('id', { count: 'exact' }).eq('household_id', householdId);
    const q2 = await client.from('person_contexts').select('id').in('id', ids);
    const q3 = await client.from('person_task_links').select('id', { count: 'exact' }).eq('household_id', householdId);
    const q4 = await client.from('change_log').select('entity_id').in('entity_table', ['person_contexts', 'person_task_links']).eq('household_id', householdId);
    return { q1, q2, q3, q4 };
  };
  const pb = await probe(clientB);
  check('people: P4. B asking PostgREST directly gets zero contexts (count 0), zero by id, zero links (count 0), zero change-log entries',
    pb.q1.count === 0 && (pb.q2.data ?? []).length === 0 && pb.q3.count === 0 && (pb.q4.data ?? []).length === 0, JSON.stringify({ c1: pb.q1.count, c3: pb.q3.count }));
  const pc = await probe(clientFor(C));
  check('people: P4. an unrelated household\'s account gets nothing either', pc.q1.count === 0 && (pc.q2.data ?? []).length === 0 && pc.q3.count === 0 && (pc.q4.data ?? []).length === 0);
  const anon = await anonClient().from('person_contexts').select('id').eq('household_id', householdId);
  check('people: P4. anon is refused outright', anon.error !== null && (anon.data ?? []).length === 0, anon.error?.code ?? 'no error');

  // ---- P5: stale revision ----------------------------------------------------------------------------------------------
  const childLocalA1 = childContextId;
  r = p.editPersonContext(a2.state(), ctx(), childCtx2.id, { relationshipName: 'Eldest (device 2)' });
  a2.change(r.state, [['personContext', childCtx2.id, 'update']]);
  await a2.sync(2);
  r = p.editPersonContext(a1.state(), ctx(), childLocalA1, { relationshipName: 'Stale (device 1)' });
  a1.change(r.state, [['personContext', childLocalA1, 'update']]);
  await a1.sync(2);
  const { data: childRow } = await clientA.from('person_contexts').select('relationship_name,revision').not('child_id', 'is', null).eq('household_id', householdId);
  check('people: P5. a STALE edit never overwrote the newer one (the server keeps device 2\'s words)', childRow?.[0]?.relationship_name === 'Eldest (device 2)', JSON.stringify(childRow));
  check('people: P5. ...and device 1 recorded the disagreement instead of resolving it silently',
    a1.namespace().evidence.some((e) => e.kind === 'personContext' && e.localId === childLocalA1 && !e.resolved));
}
