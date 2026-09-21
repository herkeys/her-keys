import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { NOW, WITHHELD_MOVE, bindAsNewDevice, device, loadModules, mutate } from './journey-composition.mjs';
import { apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const API_URL = process.env.HERKEYS_LOCAL_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.HERKEYS_LOCAL_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * HK-FEATURE-05 — Kids OS against REAL PostgreSQL, PostgREST, RLS and the real claim RPC.
 *
 * Every device is built by `composeAccountApp` (the function the app's own root calls). Every Kids write goes through the real Kids
 * mutations and the real household store; the only test seam is `gate` (offline / server refusal), which changes what the TRANSPORT
 * answers and nothing about what the client sends. Nothing about the cloud is modelled.
 */
export async function kidsJourneys(check, psql) {
  console.log('\n  Kids OS — real local Supabase');
  if (!(await apiReachable())) {
    check('kids: the local Supabase API is reachable', false, 'start the stack with npx supabase start');
    return;
  }
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = await loadModules();
  const at = (...p) => `file://${join(REPO, 'src', ...p)}`;
  const [mut, proj, resp] = await Promise.all([
    import(at('features', 'kids', 'mutations.ts')),
    import(at('features', 'kids', 'projection.ts')),
    import(at('domain', 'responsibility.ts')),
  ]);

  const P = crypto.randomUUID(); // the owner
  const Q = crypto.randomUUID(); // a second member of the same household
  const R = crypto.randomUUID(); // an unrelated account
  psql('postgres', `INSERT INTO auth.users (id, email, aud, role) VALUES
      ('${P}','kids-${P}@local.test','authenticated','authenticated'),
      ('${Q}','kids-${Q}@local.test','authenticated','authenticated'),
      ('${R}','kids-${R}@local.test','authenticated','authenticated')
    ON CONFLICT (id) DO NOTHING;`, { label: 'kids fixture users' });
  const sql = (text) => {
    const out = psql('postgres', `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'kids query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };

  const sent = [];
  const gate = { offline: false, refuse: null };
  let refusals = 0;
  let a = await device(m, { account: P, sent, gate });
  const K = (d, run) => mut.commitKids(d.store, run);
  const state = (d = a) => d.store.getSnapshot().state;
  const D = { dueDate: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', handoffToPersonId: null, partOf: null };

  // ---- 1. A household built the way a screen builds it, BEFORE she signs in ----------------------------------------------
  await mutate(a, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Sam', birthDate: '2018-03-03' }));
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Sam', birthDate: '2020-07-07' }));
  const [older, younger] = state().children.map((k) => k.id);
  const slip = (await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Sign permission slip', ...D, dueDate: '2026-09-23' }))).result.taskId;
  const book = (await K(a, (s, c) => mut.createChildTask(s, c, { childId: younger, title: 'Return library book', ...D, durationText: '20', durationTouched: true }))).result.taskId;
  const handIn = (await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Hand in the slip', ...D }))).result.taskId;
  const soccer = (await K(a, (s, c) => mut.createChildEvent(s, c, { childId: older, title: 'Soccer practice', date: '2026-09-22', startText: '5:00 PM', endText: '6:00 PM', location: 'Riverside Field', notes: '', commitment: 'fixed', handoffToPersonId: null }))).result.eventId;
  await K(a, (s, c) => mut.requestHandoffToNewPerson(s, c, { ref: { kind: 'event', id: soccer }, name: 'Alex', relationship: 'co-parent' }));
  const rid = state().responsibilities[0].id;
  await K(a, (s, c) => mut.recordAccepted(s, c, rid, false));
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Arrange backup pickup', ...D, partOf: { kind: 'event', id: soccer } }));
  await mutate(a, (s, c) => m.struct.addDependency(s, c, { relation: 'requires', from: { kind: 'task', id: handIn }, to: { kind: 'task', id: slip } }).state);
  await a.store.flush();

  const bound = await a.signIn();
  const household = bound.householdId;
  check('kids: signing in claims the household that Kids built (claim v3 carries every child)', bound.kind === 'accountBound', bound.kind);

  // ---- 2. Child identity, duration provenance and responsibility truth in PostgreSQL ------------------------------------------------
  check('kids: both children called Sam are in the cloud as two children with two identities',
    sql(`SELECT count(*) || '/' || count(DISTINCT local_id) FROM public.household_members WHERE household_id='${household}' AND member_type='child' AND display_name='Sam';`) === '2/2');
  const wantOwner = state().tasks.map((t) => `${t.title}->${t.subjectMemberId}`).sort().join(',');
  check('kids: every task is about the RIGHT Sam, by identity and not by name (child identity round trip)',
    sql(`SELECT string_agg(t.title || '->' || m.local_id, ',' ORDER BY t.title COLLATE "C") FROM public.tasks t JOIN public.household_members m ON m.id = t.subject_member_id AND m.household_id = t.household_id WHERE t.household_id='${household}';`) === wantOwner, wantOwner);
  check('kids: the event is about the right Sam and is child-scoped',
    sql(`SELECT m.local_id || ':' || e.scope || ':' || e.status FROM public.events e JOIN public.household_members m ON m.id = e.subject_member_id WHERE e.household_id='${household}';`) === `${older}:child:active`);
  check('kids: an untouched length is the DEFAULT in the cloud and a typed length is hers (15 default vs 20 user)',
    sql(`SELECT string_agg(title || '=' || duration_minutes || ':' || COALESCE(duration_source,'null'), ',' ORDER BY title COLLATE "C") FROM public.tasks WHERE household_id='${household}';`)
      === 'Arrange backup pickup=15:default,Hand in the slip=15:default,Return library book=20:user,Sign permission slip=15:default');
  check('kids: the handoff arrived as accepted AND off her list, held by a person', sql(`SELECT r.state || ':' || r.still_needs_me || ':' || r.responsible_kind || ':' || r.about_type FROM public.responsibilities r WHERE r.household_id='${household}';`) === 'accepted:false:person:event');
  check('kids: the person is a household person, not a household member', sql(`SELECT p.display_name || ':' || p.relationship || ':' || p.status FROM public.household_people p WHERE p.household_id='${household}';`) === 'Alex:co-parent:active' && sql(`SELECT count(*) FROM public.household_members WHERE household_id='${household}' AND display_name='Alex';`) === '0');
  check('kids: the prerequisite and the plan step travelled as ordinary typed edges (requires + part_of)',
    sql(`SELECT string_agg(relation || ':' || from_type || '>' || to_type || ':' || status, ',' ORDER BY relation) FROM public.dependencies WHERE household_id='${household}';`) === 'part_of:task>event:active,requires:task>task:active');
  check('kids: the queue drained and nothing needs attention', a.persisted().identity.sync.queue.length === 0 && !a.app.syncRuntime.snapshot().needsAttention);

  // ---- 3. Edits after binding travel through the queue; provenance survives --------------------------------------------------------
  const slipRow = state().tasks.find((t) => t.id === slip);
  await K(a, (s, c) => mut.editChildTask(s, c, { taskId: slip, baseline: mut.taskFingerprint(slipRow), title: slipRow.title, dueDate: '2026-09-23', durationText: '15', durationTouched: true, notes: '', commitment: 'flexible', childId: older }));
  await a.settle();
  check('kids: confirming the SAME 15 minutes turns the default into hers in the cloud (default 15 -> user 15), revision 2',
    sql(`SELECT duration_minutes || ':' || duration_source || ':' || revision FROM public.tasks WHERE household_id='${household}' AND local_id='${slip}';`) === '15:user:2');

  // ---- 4. Offline create, restart offline, reconnect ---------------------------------------------------------------------------
  gate.offline = true;
  const offlineId = (await K(a, (s, c) => mut.createChildTask(s, c, { childId: younger, title: 'Made offline', ...D, durationText: '35', durationTouched: true }))).result.taskId;
  await a.settle();
  check('kids: a task created OFFLINE waits in the durable queue and nothing reached the cloud',
    sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='Made offline';`) === '0' && a.persisted().identity.sync.queue.length > 0);
  a.app.syncRuntime.stop(); // process death while offline
  a = await device(m, { account: P, sent, storage: a.storage, secure: a.secure, gate });
  await a.app.accountRuntime.restore();
  await a.app.syncRuntime.idle();
  const revived = state().tasks.find((t) => t.id === offlineId);
  check('kids: after a restart while offline the item is still there, still about the same child, with its length still hers, and still queued',
    revived?.subjectMemberId === younger && revived.durationSource === 'user' && revived.durationMinutes === 35 && a.persisted().identity.sync.queue.length > 0);
  gate.offline = false;
  await a.app.syncRuntime.request('networkRestored');
  await a.app.syncRuntime.idle();
  check('kids: on reconnect it is sent exactly once, to the right child, with its provenance',
    sql(`SELECT count(*) || ':' || max(m.local_id) || ':' || max(t.duration_source) FROM public.tasks t JOIN public.household_members m ON m.id=t.subject_member_id WHERE t.household_id='${household}' AND t.title='Made offline';`) === `1:${younger}:user` && a.persisted().identity.sync.queue.length === 0);

  // ---- 5. A server refusal is evidence, not a loop, and blocks nothing else ------------------------------------------------------------
  gate.refuse = (table, row) => { if (table === 'tasks' && row.title === 'Refused by the server') { refusals += 1; return true; } return false; };
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Refused by the server', ...D }));
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Sent after the refusal', ...D }));
  await a.settle();
  await a.settle();
  await a.settle();
  check('kids: a refused row is recorded once as evidence and never re-sent, and a later row still syncs',
    refusals === 1 && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='Refused by the server';`) === '0'
      && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='Sent after the refusal';`) === '1', `refusals=${refusals}`);
  gate.refuse = null;

  // ---- 6. A second device: the same Kids truth, child by child --------------------------------------------------------------------------
  const b = await device(m, { account: P, sent });
  await bindAsNewDevice(m, b, P, household);
  const resumed = await b.signIn();
  // A row the server REFUSED lives on device A only, by design (it is evidence, not lost); the second device can never have it.
  const deviceOnly = new Set(['Refused by the server']);
  const digest = (s) => {
    const clock = { nowMs: NOW };
    const keep = (i) => !deviceOnly.has(i.title);
    return proj.buildKidsView(s, s.household.id, clock).children.map((card) => {
      const d = proj.buildChildDetail(s, s.household.id, card.childId, clock);
      const child = s.children.find((k) => k.id === card.childId);
      const work = Object.fromEntries(Object.entries(d.openWork).map(([bucket, list]) => [bucket, list.filter(keep).map((i) => [i.title, i.duration?.knowledge ?? null, i.dependency?.readiness ?? null, i.responsibility.coverage]).sort()]));
      return JSON.stringify({ born: child.birthDate, label: card.label.full, next: card.next?.title ?? null, upcoming: d.upcoming.filter(keep).map((i) => [i.title, i.responsibility.coverage, i.plan?.label ?? null]), work, plans: d.plans.filter((p) => keep(p.item)).map((p) => [p.item.title, p.plan.label, p.plan.reason, p.plan.openSteps.map((x) => x.title)]) });
    });
  };
  check('kids: a second device resumes the account and hydrates', resumed.kind === 'accountBound' && b.persisted().identity.sync.hydration === 'ready', `${resumed.kind}/${b.persisted().identity.sync.hydration}`);
  const da = digest(state());
  const db = digest(state(b));
  check('kids: CLIENT A -> queue -> PostgreSQL -> CLIENT B: the Kids projection is identical for every child (identity, durations, dependencies, responsibility, plans)', JSON.stringify(da) === JSON.stringify(db), db.join('\n'));
  check('kids: on B the two Sams are still two different children with the right items',
    state(b).children.filter((k) => k.displayName === 'Sam').length === 2 && JSON.stringify(da).includes('born Mar 3, 2018') && JSON.stringify(da).includes('born Jul 7, 2020'));
  const soccerPlan = (s) => proj.buildChildDetail(s, s.household.id, s.children.find((k) => k.birthDate === '2018-03-03').id, { nowMs: NOW }).plans.find((p) => p.item.title === 'Soccer practice').plan;
  check('kids: B reads the fallback as PLAN IN PLACE, from the same accepted handoff', soccerPlan(state(b)).label === 'PLAN_IN_PLACE');

  // ---- 7. The person she relied on is archived: the plan cannot stay green, on either device ----------------------------------------
  await K(a, (s, c) => ({ state: resp.archivePerson(s, c, s.people[0].id) }));
  await a.settle();
  await b.app.syncRuntime.request('networkRestored');
  await b.app.syncRuntime.idle();
  check('kids: archiving Alex reached the cloud as a status, not a deletion', sql(`SELECT status FROM public.household_people WHERE household_id='${household}';`) === 'archived');
  const gone = soccerPlan(state(b));
  check('kids: on the SECOND device PLAN IN PLACE became NEEDS A PLAN (holder unavailable) after the pull', gone.label === 'NEEDS_A_PLAN' && gone.reason === 'holder_unavailable', `${gone.label}/${gone.reason}`);
  check('kids: and on the first device too', soccerPlan(state(a)).label === 'NEEDS_A_PLAN');

  // ---- 8. Row-level security, attacked over real PostgREST with valid foreign identifiers -------------------------------------------------
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const stranger = clientFor(R);
  const owner = clientFor(P);
  const childCloudId = sql(`SELECT id FROM public.household_members WHERE household_id='${household}' AND local_id='${older}';`);
  const taskCloudId = sql(`SELECT id FROM public.tasks WHERE household_id='${household}' AND local_id='${slip}';`);
  const tables = ['tasks', 'events', 'responsibilities', 'household_people', 'dependencies', 'household_members'];
  const denied = async (client, who) => {
    const seen = [];
    for (const table of tables) {
      const read = await client.from(table).select('id').eq('household_id', household);
      seen.push(`${table}:${(read.data ?? []).length}`);
    }
    const write = await client.from('tasks').update({ notes: 'tampered' }).eq('id', taskCloudId).select('id');
    const erase = await client.from('tasks').delete().eq('id', taskCloudId).select('id');
    const plant = await client.from('tasks').insert({ household_id: household, local_id: `planted-${who}`, title: 'Planted', category_id: (await owner.from('household_categories').select('id').eq('household_id', household).limit(1)).data[0].id, subject_member_id: childCloudId, duration_minutes: 5, commitment: 'flexible', plan_kind: 'unplanned', status: 'open', scope: 'child', producer: 'user-action' });
    return { seen, wrote: (write.data ?? []).length, erased: (erase.data ?? []).length, planted: plant.error === null };
  };

  const noOne = await denied(anon, 'anon');
  check('kids: RLS UNAUTHENTICATED - no read, update, delete or insert of any child-linked table', noOne.seen.every((s) => s.endsWith(':0')) && noOne.wrote === 0 && noOne.erased === 0 && noOne.planted === false, JSON.stringify(noOne));

  const rBound = await (async () => {
    const rDev = await device(m, { account: R, sent });
    await mutate(rDev, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
    return { dev: rDev, state: await rDev.signIn() };
  })();
  const foreign = await denied(stranger, 'stranger');
  check('kids: RLS UNRELATED ACCOUNT - with a valid foreign child id and household id it reads, changes, deletes and plants nothing', foreign.seen.every((s) => s.endsWith(':0')) && foreign.wrote === 0 && foreign.erased === 0 && foreign.planted === false, JSON.stringify(foreign));
  const strangerCategory = (await stranger.from('household_categories').select('id').eq('household_id', rBound.state.householdId).limit(1)).data[0].id;
  const substituted = await stranger.from('tasks').insert({ household_id: rBound.state.householdId, local_id: 'fk-substitution', title: 'Uses another family\'s child', category_id: strangerCategory, subject_member_id: childCloudId, duration_minutes: 5, commitment: 'flexible', plan_kind: 'unplanned', status: 'open', scope: 'child', producer: 'user-action' });
  check('kids: RLS FOREIGN-KEY SUBSTITUTION - a task in HER OWN household cannot name another household\'s child', substituted.error !== null, substituted.error?.code ?? 'no error');
  const hop = await stranger.from('tasks').insert({ household_id: household, local_id: 'hop', title: 'x', category_id: strangerCategory, duration_minutes: 5, commitment: 'flexible', plan_kind: 'unplanned', status: 'open', scope: 'household', producer: 'user-action' });
  check('kids: RLS - the unrelated account cannot insert into the family\'s household either', hop.error !== null);

  const ownerSees = [];
  for (const table of tables) ownerSees.push(`${table}:${((await owner.from(table).select('id').eq('household_id', household)).data ?? []).length}`);
  const ownerWrite = await owner.from('tasks').update({ notes: 'the owner may' }).eq('id', taskCloudId).select('id');
  check('kids: RLS OWNER - reads every child-linked table and may change her own task', ownerSees.every((s) => !s.endsWith(':0')) && (ownerWrite.data ?? []).length === 1, ownerSees.join(' '));

  psql('postgres', `INSERT INTO public.profiles (id, timezone) VALUES ('${Q}', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope) VALUES ('${household}', 'user-2', '${Q}', 'adult', 'member', NULL, 'personal');`, { label: 'kids second member' });
  const second = clientFor(Q);
  const memberSees = {};
  for (const table of tables) memberSees[table] = ((await second.from(table).select('id').eq('household_id', household)).data ?? []).length;
  check('kids: RLS SAME-HOUSEHOLD SECOND MEMBER - reads the household\'s child tasks, events and children', memberSees.tasks > 0 && memberSees.events > 0 && memberSees.household_members > 0, JSON.stringify(memberSees));
  check('kids: ...but not the owner-private people and responsibilities beside them (a known limit, MP-K-13)', memberSees.responsibilities === 0 && memberSees.household_people === 0, JSON.stringify(memberSees));

  // What a second member may WRITE is whatever the household semantics say: child- and household-scoped rows belong to the household,
  // so a member may edit one; the owner-private people, responsibilities and dependencies are not theirs to read, let alone change.
  const memberEdit = await second.from('tasks').update({ notes: 'a household member may edit a child task' }).eq('id', taskCloudId).select('id');
  const memberPeople = await second.from('household_people').update({ status: 'archived' }).eq('household_id', household).select('id');
  const memberPlant = await second.from('responsibilities').delete().eq('household_id', household).select('id');
  check('kids: RLS SAME-HOUSEHOLD SECOND MEMBER - may edit the household\'s child task (permitted), and can neither change nor delete the owner-private people and responsibilities',
    (memberEdit.data ?? []).length === 1 && (memberPeople.data ?? []).length === 0 && (memberPlant.data ?? []).length === 0,
    `edit=${(memberEdit.data ?? []).length} people=${(memberPeople.data ?? []).length} resp=${(memberPlant.data ?? []).length} err=${memberEdit.error?.code ?? '-'}`);

  // ---- 9. OC-01 evidence: a child added AFTER binding has no cloud identity ------------------------------------------------------------
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Late', birthDate: '2024-01-01' }));
  const late = state().children.find((k) => k.displayName === 'Late').id;
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: late, title: 'For the late child', ...D }));
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: older, title: 'Still syncs after that', ...D }));
  await a.settle();
  check('kids: OC-01 - the late child has no cloud identity, so ITS task stays on the device as evidence (never mis-attributed to another child)',
    sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='For the late child';`) === '0'
      && sql(`SELECT count(*) FROM public.household_members WHERE household_id='${household}' AND display_name='Late';`) === '0'
      && JSON.stringify(a.persisted().identity.sync.evidence).includes('unresolvable-dependency'));
  check('kids: OC-01 - and it blocks nothing: a later task for another child still reaches the cloud',
    sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='Still syncs after that';`) === '1');

  // ---- 10. A large household: 450 child-linked tasks, above the queue ceiling (400) and two pull chunks -----------------------------------
  const S = crypto.randomUUID();
  psql('postgres', `INSERT INTO auth.users (id, email, aud, role) VALUES ('${S}','kids-${S}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'kids bulk user' });
  const big = await device(m, { account: S, sent });
  await mutate(big, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  for (const name of ['Bo', 'Cy', 'Di', 'Ed', 'Flo']) await K(big, (s, c) => mut.addChildToHousehold(s, c, { displayName: name, birthDate: '2017-04-04' }));
  await mutate(big, (s, c) => {
    let next = s;
    for (let i = 0; i < 450; i += 1) next = mut.createChildTask(next, c, { childId: next.children[i % 5].id, title: `Bulk ${i}`, ...D, durationText: '20', durationTouched: true }).state;
    return next;
  });
  await big.store.flush();
  const bigBound = await big.signIn();
  const perChild = (h) => sql(`SELECT string_agg(z.c || ':' || z.n, ',' ORDER BY z.c) FROM (SELECT m.local_id AS c, count(*) AS n FROM public.tasks t JOIN public.household_members m ON m.id = t.subject_member_id AND m.household_id = t.household_id WHERE t.household_id='${h}' GROUP BY m.local_id) z;`);
  const wantSplit = state(big).children.map((k) => `${k.id}:90`).sort().join(',');
  check('kids: a 450-task child-linked household is sent in full by ONE sign-in, 90 to each of five children, each attributed to its own child, queue drained',
    bigBound.kind === 'accountBound' && perChild(bigBound.householdId) === wantSplit && big.persisted().identity.sync.queue.length === 0, `${bigBound.kind} ${perChild(bigBound.householdId)}`);
  const bigFetched = [];
  const bigB = await device(m, { account: S, sent, fetched: bigFetched });
  await bindAsNewDevice(m, bigB, S, bigBound.householdId);
  await bigB.signIn();
  const bigDigestA = digest(state(big));
  const bigDigestB = digest(state(bigB));
  check('kids: a second device pulls all 450 through the real sync_pull in bounded requests, and its Kids projection is identical for every child',
    state(bigB).tasks.length === 450 && bigFetched.filter((r) => r.table === 'tasks').every((r) => r.count <= 100) && JSON.stringify(bigDigestA) === JSON.stringify(bigDigestB), `${state(bigB).tasks.length} tasks`);
}
