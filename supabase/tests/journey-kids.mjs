import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOW, WITHHELD_MOVE, bindAsNewDevice, device, loadModules, mutate } from './journey-composition.mjs';
import { anonClient, apiReachable, clientFor } from './support/syncDevice.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
// The database the journeys run against: the private stack's scratch database when startJourneyStack() started one (the combined
// "journeys"/full-suite run), or the shared default database when this journey runs on its own (`only=kids`). See journey-composition.mjs.
const STACK_DB = process.env.HERKEYS_LOCAL_STACK_DB ?? 'postgres';

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
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES
      ('${P}','kids-${P}@local.test','authenticated','authenticated'),
      ('${Q}','kids-${Q}@local.test','authenticated','authenticated'),
      ('${R}','kids-${R}@local.test','authenticated','authenticated')
    ON CONFLICT (id) DO NOTHING;`, { label: 'kids fixture users' });
  const sql = (text) => {
    const out = psql(STACK_DB, `\\pset format unaligned\n\\pset tuples_only on\n${text}`, { label: 'kids query' }).out;
    return out.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !/^Output format|^Tuples only/.test(line)).join('|');
  };

  const sent = [];
  const gate = { offline: false, refuse: null, loseAck: 0 };
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
  // A name with the letter s in it must cross the boundary exactly as she typed it (a claim once turned every "s" into a space).
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Josie', birthDate: '2019-05-05' }));
  const josie = state().children.find((k) => k.displayName === 'Josie').id;
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
  check('kids: a child whose name contains the letter s keeps her EXACT name across the claim: in PostgreSQL, and on the device after the first pull',
    sql(`SELECT display_name FROM public.household_members WHERE household_id='${household}' AND local_id='${josie}';`) === 'Josie'
      && state().children.find((k) => k.id === josie)?.displayName === 'Josie');
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
  const anon = anonClient();
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

  psql(STACK_DB, `INSERT INTO public.profiles (id, timezone) VALUES ('${Q}', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
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

  // ---- 9. OC-01 (RESOLVED): a child added AFTER the household is bound to an account ----------------------------------------------------
  // The owner decided that a bound household MUST be able to add a child, through the EXISTING household-member identity and the EXISTING
  // sync path. Everything here starts where the Kids screen does (`addChildToHousehold` on the store); nothing calls the queue or an RPC.
  const memberRow = (h, local) => sql(`SELECT member_type || ':' || role || ':' || COALESCE(profile_id::text, '-') || ':' || scope || ':' || display_name || ':' || birth_date FROM public.household_members WHERE household_id='${h}' AND local_id='${local}';`);
  const memberIdOf = (h, local) => sql(`SELECT id FROM public.household_members WHERE household_id='${h}' AND local_id='${local}';`);
  const memberRowsOf = (h, local) => sql(`SELECT count(*) FROM public.household_members WHERE household_id='${h}' AND local_id='${local}';`);
  const memberSends = (list, local) => list.filter((r) => r.table === 'household_members' && r.row.local_id === local).length;
  const childCount = (h) => sql(`SELECT count(*) FROM public.household_members WHERE household_id='${h}' AND member_type='child';`);
  const kidNamed = (s, name) => s.children.filter((k) => k.displayName === name);
  const mappedTo = (d, local) => d.persisted().identity.sync.mappings[`member:${local}`]?.cloudId;
  // "Settled": nothing owed and no NEW unresolved evidence. Device A already holds one, on purpose: the task the server refused in
  // section 5 stays there as evidence (it is never lost and never retried), so "nothing needs attention" is measured against that.
  const unresolved = (d) => d.persisted().identity.sync.evidence.filter((e) => !e.resolved).length;
  const knownEvidence = unresolved(a);
  const idle = (d, known = 0) => d.persisted().identity.sync.queue.length === 0 && unresolved(d) === known;

  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Late', birthDate: '2024-01-01' }));
  const late = kidNamed(state(), 'Late')[0].id;
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: late, title: 'For the late child', ...D }));
  await K(a, (s, c) => mut.createChildEvent(s, c, { childId: late, title: 'Swim lesson', date: '2026-09-24', startText: '4:00 PM', endText: '5:00 PM', location: '', notes: '', commitment: 'fixed', handoffToPersonId: null }));
  const owedBeforeSending = a.persisted().identity.sync.queue.filter((q) => q.kind === 'member' && q.localId === late).map((q) => q.op).join(',');
  await a.settle();
  const lateCloud = memberIdOf(household, late);
  check('kids: OC-01 - a child added AFTER binding is one ordinary child row in PostgreSQL: no account, no role, the name and birth date she gave',
    memberRow(household, late) === 'child:member:-:child:Late:2024-01-01' && memberRowsOf(household, late) === '1', memberRow(household, late));
  check('kids: ...it was owed durably as ONE create, sent exactly once through the ordinary queue, mapped to the SAME local id, and the queue drained',
    owedBeforeSending === 'create' && memberSends(sent, late) === 1 && mappedTo(a, late) === lateCloud && idle(a, knownEvidence), `owed=${owedBeforeSending} sends=${memberSends(sent, late)}`);
  check('kids: ...and the work that names it (a task and an event) is attributed to it in PostgreSQL, by identity',
    sql(`SELECT (SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='For the late child' AND subject_member_id='${lateCloud}') || '/' || (SELECT count(*) FROM public.events WHERE household_id='${household}' AND title='Swim lesson' AND subject_member_id='${lateCloud}');`) === '1/1');

  // A THIRD child with the same name and birth date as an existing one: identity is the id, never the name.
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Sam', birthDate: '2018-03-03' }));
  await a.settle();
  const sams = kidNamed(state(), 'Sam');
  check('kids: a THIRD child called Sam (same name, same birth date) is a third identity, and the earlier Sams keep their own items',
    sams.length === 3 && new Set(sams.map((k) => k.id)).size === 3
      && sql(`SELECT count(*) || '/' || count(DISTINCT local_id) FROM public.household_members WHERE household_id='${household}' AND member_type='child' AND display_name='Sam';`) === '3/3'
      && sql(`SELECT m.local_id FROM public.tasks t JOIN public.household_members m ON m.id = t.subject_member_id WHERE t.household_id='${household}' AND t.local_id='${slip}';`) === older);

  // Restart: the same children, nothing created again.
  const kidsBefore = childCount(household);
  const sendsBefore = sent.filter((r) => r.table === 'household_members').length;
  const idsBefore = state().children.map((k) => k.id).sort().join(',');
  a.app.syncRuntime.stop();
  a = await device(m, { account: P, sent, storage: a.storage, secure: a.secure, gate });
  await a.app.accountRuntime.restore();
  await a.app.syncRuntime.idle();
  check('kids: after a restart the old and the new children all remain under the same ids, and nothing is created twice',
    state().children.map((k) => k.id).sort().join(',') === idsBefore && childCount(household) === kidsBefore
      && sent.filter((r) => r.table === 'household_members').length === sendsBefore && idle(a, knownEvidence), `${childCount(household)} rows, ${state().children.length} children`);

  // A second device hydrates the new children under the same identities.
  await b.app.syncRuntime.request('networkRestored');
  await b.app.syncRuntime.idle();
  check('kids: OC-01 - a SECOND device hydrates the new child under the same identity, and its task and event name THAT child',
    state(b).children.length === state().children.length && state(b).children.find((k) => k.id === late)?.displayName === 'Late'
      && state(b).tasks.find((t) => t.title === 'For the late child')?.subjectMemberId === late
      && state(b).events.find((e) => e.title === 'Swim lesson')?.subjectMemberId === late && b.persisted().identity.sync.queue.length === 0);
  check('kids: ...and the Kids projection is identical on both devices for every child, the new ones included',
    JSON.stringify(digest(state())) === JSON.stringify(digest(state(b))));

  // A rename made where the child is held (the server) is the SAME child everywhere: same id, new name in place, no duplicate.
  psql(STACK_DB, `UPDATE public.household_members SET display_name='Lately' WHERE household_id='${household}' AND local_id='${late}';`, { label: 'kids server-side rename' });
  const kidsNow = childCount(household);
  for (const d of [a, b]) {
    await d.app.syncRuntime.request('manual');
    await d.app.syncRuntime.idle();
  }
  check('kids: a rename made on the server is the SAME child on both devices - same id, new name in place, no duplicate, its work still attached, nothing echoed back',
    [state(), state(b)].every((s) => s.children.filter((k) => k.id === late).length === 1 && s.children.find((k) => k.id === late).displayName === 'Lately' && kidNamed(s, 'Late').length === 0
      && s.tasks.find((t) => t.title === 'For the late child').subjectMemberId === late && s.children.length === state().children.length)
      && childCount(household) === kidsNow && idle(a, knownEvidence) && idle(b));

  // Offline, then a restart while offline, then reconnect: created exactly once, before the work that names it.
  gate.offline = true;
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Offline kid', birthDate: '2022-02-02' }));
  const offlineKid = kidNamed(state(), 'Offline kid')[0].id;
  await K(a, (s, c) => mut.createChildTask(s, c, { childId: offlineKid, title: 'For the offline kid', ...D }));
  await a.settle();
  check('kids: a child added OFFLINE after binding is visible at once, owed durably with the work that names it, and nothing reached the cloud (and the device does not claim to be in sync)',
    kidNamed(state(), 'Offline kid').length === 1 && a.persisted().identity.sync.queue.some((q) => q.kind === 'member' && q.localId === offlineKid && q.op === 'create')
      && a.persisted().identity.sync.queue.some((q) => q.kind === 'task') && memberRowsOf(household, offlineKid) === '0' && a.app.syncRuntime.snapshot().phase !== 'idle');
  a.app.syncRuntime.stop(); // process death while offline
  a = await device(m, { account: P, sent, storage: a.storage, secure: a.secure, gate });
  await a.app.accountRuntime.restore();
  await a.app.syncRuntime.idle();
  check('kids: ...it survives a restart while offline: still there under the same id, still owed',
    kidNamed(state(), 'Offline kid').map((k) => k.id).join() === offlineKid && a.persisted().identity.sync.queue.some((q) => q.kind === 'member' && q.localId === offlineKid));
  gate.offline = false;
  await a.app.syncRuntime.request('networkRestored');
  await a.app.syncRuntime.idle();
  await a.settle();
  check('kids: on reconnect the child is created EXACTLY once (one row, one send) and the task that names it is attributed to it',
    memberRowsOf(household, offlineKid) === '1' && memberSends(sent, offlineKid) === 1
      && sql(`SELECT count(*) FROM public.tasks WHERE household_id='${household}' AND title='For the offline kid' AND subject_member_id='${memberIdOf(household, offlineKid)}';`) === '1' && idle(a, knownEvidence));

  // A LOST acknowledgement, against the real server: the row is committed, the device never hears, and the pull must ADOPT it.
  gate.loseAck = 1;
  await K(a, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Ack lost', birthDate: '2023-03-03' }));
  const ackLost = kidNamed(state(), 'Ack lost')[0].id;
  await a.settle();
  const committedButUnheard = memberRowsOf(household, ackLost) === '1' && mappedTo(a, ackLost) === undefined;
  gate.loseAck = 0;
  await a.app.syncRuntime.request('manual');
  await a.app.syncRuntime.idle();
  await a.settle();
  check('kids: a LOST acknowledgement settles on the SAME child: one row in PostgreSQL, one child on the device, mapped to that row, queue drained',
    committedButUnheard && memberRowsOf(household, ackLost) === '1' && memberRow(household, ackLost) === 'child:member:-:child:Ack lost:2023-03-03' && kidNamed(state(), 'Ack lost').length === 1 && mappedTo(a, ackLost) === memberIdOf(household, ackLost) && idle(a, knownEvidence),
    `committedButUnheard=${committedButUnheard} children=${kidNamed(state(), 'Ack lost').length}`);

  // A household member who is not the owner: the REAL server refuses (42501), and the device keeps that as evidence.
  const qSent = [];
  const qDev = await device(m, { account: Q, sent: qSent });
  await bindAsNewDevice(m, qDev, Q, household);
  const qIn = await qDev.signIn();
  await K(qDev, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Not the owner', birthDate: '2020-01-01' }));
  const notOwner = kidNamed(state(qDev), 'Not the owner')[0].id;
  for (let round = 0; round < 3; round += 1) await qDev.settle();
  const qEvidence = qDev.persisted().identity.sync.evidence.filter((e) => e.kind === 'member' && e.localId === notOwner);
  check('kids: OC-01 - the SERVER refuses a child from a household member who is not its owner (real 42501): kept as evidence, surfaced, nothing written',
    qIn.kind === 'accountBound' && qEvidence.length === 1 && qEvidence[0].evidence === 'forbidden' && qEvidence[0].attemptedOp === 'create' && qEvidence[0].resolved === false
      && qDev.app.syncRuntime.snapshot().needsAttention === true && memberRowsOf(household, notOwner) === '0', JSON.stringify(qEvidence));
  check('kids: ...it was sent ONCE and never again, and the refused child is not silently deleted from her device',
    memberSends(qSent, notOwner) === 1 && kidNamed(state(qDev), 'Not the owner').length === 1 && qDev.persisted().identity.sync.evidence.filter((e) => e.kind === 'member').length === 1);

  // Account switching: an account's pending child is never uploaded under another account.
  const T = crypto.randomUUID();
  const V = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${T}','kids-${T}@local.test','authenticated','authenticated'), ('${V}','kids-${V}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'kids switch users' });
  const tSent = [];
  const tGate = { offline: false, refuse: null, loseAck: 0 };
  const tDev = await device(m, { account: T, sent: tSent, gate: tGate });
  await mutate(tDev, (s) => ({ ...s, oneMoves: [WITHHELD_MOVE] }));
  await K(tDev, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Ted', birthDate: '2019-09-09' }));
  const tBound = await tDev.signIn();
  tGate.offline = true;
  await K(tDev, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Pending kid', birthDate: '2021-01-01' }));
  await tDev.settle();
  const pendingKid = kidNamed(state(tDev), 'Pending kid')[0].id;
  const owedPending = tDev.persisted().identity.sync.queue.some((q) => q.kind === 'member' && q.localId === pendingKid);
  await tDev.app.accountRuntime.signOut();
  const sentBeforeSwitch = tSent.length;
  const vDev = await device(m, { account: V, sent: tSent, storage: tDev.storage });
  const vState = await vDev.signIn();
  await vDev.settle();
  check('kids: account switching - one account\'s pending child is never uploaded under another: quarantined, nothing sent, nothing created, nothing deleted',
    tBound.kind === 'accountBound' && owedPending && vState.kind === 'boundOther' && tSent.length === sentBeforeSwitch
      && sql(`SELECT count(*) FROM public.household_members WHERE display_name='Pending kid';`) === '0' && sql(`SELECT count(*) FROM public.household_members WHERE profile_id='${V}';`) === '0'
      && vDev.persisted().state.children.some((k) => k.displayName === 'Pending kid'));

  // Demo and local-only households never sync a child.
  const W = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${W}','kids-${W}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'kids demo user' });
  const dSent = [];
  const demoDev = await device(m, { account: W, sent: dSent, mode: 'demo' });
  const demoIn = await demoDev.signIn();
  await K(demoDev, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Demo kid', birthDate: '2020-02-02' }));
  await demoDev.settle();
  const localDev = await device(m, { account: W, sent: dSent });
  await K(localDev, (s, c) => mut.addChildToHousehold(s, c, { displayName: 'Local kid', birthDate: '2020-02-02' }));
  await localDev.settle();
  check('kids: a DEMO household and a household that was never signed in keep their new child on the device: nothing sent, nothing created for the account',
    demoIn.kind === 'authenticatedUnbound' && kidNamed(state(demoDev), 'Demo kid').length === 1 && kidNamed(state(localDev), 'Local kid').length === 1 && dSent.length === 0
      && demoDev.persisted().identity.sync === null && localDev.persisted().identity.sync === null && sql(`SELECT count(*) FROM public.household_members WHERE profile_id='${W}';`) === '0');

  // The new write path, attacked over REAL PostgREST: who may create, change or remove a child, and what a hostile client can state.
  const kidRow = (h, local, extra = {}) => ({ household_id: h, local_id: local, member_type: 'child', display_name: 'Mallory', birth_date: '2019-03-04', scope: 'child', ...extra });
  const pushChild = (client, h, local, extra = {}) => client.rpc('sync_push', { p_entity_table: 'household_members', p_device_id: crypto.randomUUID(), p_row: kidRow(h, local, extra) });
  const rHousehold = rBound.state.householdId;
  const sam0 = () => sql(`SELECT display_name || ':' || revision || ':' || household_id FROM public.household_members WHERE id='${childCloudId}';`);
  const samBefore = sam0();
  const attack = {
    anonRpc: await pushChild(anon, household, 'atk-anon'),
    anonInsert: await anon.from('household_members').insert(kidRow(household, 'atk-anon-direct')),
    strangerRpc: await pushChild(stranger, household, 'atk-stranger'),
    strangerInsert: await stranger.from('household_members').insert(kidRow(household, 'atk-stranger-direct')),
    strangerRename: await stranger.from('household_members').update({ display_name: 'Hijacked' }).eq('id', childCloudId).select('id'),
    strangerErase: await stranger.from('household_members').delete().eq('id', childCloudId).select('id'),
    memberRpc: await pushChild(second, household, 'atk-member'),
    ownerInsert: await owner.from('household_members').insert(kidRow(household, 'atk-owner-direct')),
    ownerRename: await owner.from('household_members').update({ display_name: 'Renamed by a client' }).eq('id', childCloudId).select('id'),
    ownerErase: await owner.from('household_members').delete().eq('id', childCloudId).select('id'),
    privateSchema: await owner.schema('private').rpc('push_household_child', { p_device_id: crypto.randomUUID(), p_row: kidRow(household, 'atk-private') }),
    strangerAccount: await pushChild(stranger, rHousehold, 'atk-account', { profile_id: R }),
    strangerRole: await pushChild(stranger, rHousehold, 'atk-role', { role: 'owner' }),
    strangerAdult: await pushChild(stranger, rHousehold, 'atk-adult', { member_type: 'adult' }),
  };
  check('kids: RLS - an UNAUTHENTICATED caller can neither push a child through sync_push nor insert one directly',
    attack.anonRpc.error !== null && attack.anonInsert.error !== null, `${attack.anonRpc.error?.code}/${attack.anonInsert.error?.code}`);
  check('kids: RLS - an UNRELATED account cannot add a child to the family\'s household (42501), insert one, rename one or erase one',
    attack.strangerRpc.error?.code === '42501' && attack.strangerInsert.error !== null && (attack.strangerRename.data ?? []).length === 0 && (attack.strangerErase.data ?? []).length === 0,
    `${attack.strangerRpc.error?.code}/${attack.strangerInsert.error?.code}`);
  check('kids: RLS - a household member who is NOT the owner is refused (42501, only the owner), through the real RPC',
    attack.memberRpc.error?.code === '42501' && /only the owner/.test(attack.memberRpc.error?.message ?? ''), `${attack.memberRpc.error?.code} ${attack.memberRpc.error?.message}`);
  check('kids: RLS - even the OWNER has no direct write to household_members over PostgREST: insert, rename and erase are refused (the function is the only way in)',
    attack.ownerInsert.error?.code === '42501' && attack.ownerRename.error !== null && attack.ownerErase.error !== null, `${attack.ownerInsert.error?.code}/${attack.ownerRename.error?.code}/${attack.ownerErase.error?.code}`);
  check('kids: RLS - the private function is not reachable over PostgREST at all (its schema is not exposed)', attack.privateSchema.error !== null, attack.privateSchema.error?.code ?? 'no error');
  check('kids: RLS - a child cannot be handed an account, a role or an adult type by a client, even in the caller\'s OWN household',
    [attack.strangerAccount, attack.strangerRole, attack.strangerAdult].every((r) => r.error?.code === '42501'), [attack.strangerAccount, attack.strangerRole, attack.strangerAdult].map((r) => r.error?.code).join('/'));

  // A valid FOREIGN member id, stated in the caller's own household: the id is server-owned, so a NEW row is made and the foreign child is untouched.
  const hijack = await pushChild(stranger, rHousehold, 'atk-own-household', { id: childCloudId, revision: 99 });
  check('kids: RLS - stating another household\'s child id (and a forged revision) makes a NEW row in the caller\'s own household and leaves the foreign child exactly as it was',
    hijack.data?.status === 'created' && hijack.data?.cloud_id !== childCloudId && sam0() === samBefore
      && sql(`SELECT count(*) FROM public.household_members WHERE household_id='${rHousehold}' AND local_id='atk-own-household';`) === '1', `${hijack.data?.status} ${sam0()} vs ${samBefore}`);
  check('kids: RLS - none of the attacks wrote anything into the family\'s household, and its children are exactly as they were',
    sql(`SELECT count(*) FROM public.household_members WHERE household_id='${household}' AND local_id LIKE 'atk-%';`) === '0' && childCount(household) === String(state().children.length)
      && sql(`SELECT count(*) FROM public.household_members WHERE local_id IN ('atk-account','atk-role','atk-adult');`) === '0', `${childCount(household)} in PostgreSQL, ${state().children.length} on the device`);

  // ---- 10. A large household: 450 child-linked tasks, above the queue ceiling (400) and two pull chunks -----------------------------------
  const S = crypto.randomUUID();
  psql(STACK_DB, `INSERT INTO auth.users (id, email, aud, role) VALUES ('${S}','kids-${S}@local.test','authenticated','authenticated') ON CONFLICT (id) DO NOTHING;`, { label: 'kids bulk user' });
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
