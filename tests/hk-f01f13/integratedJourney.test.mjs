/**
 * HK-F01-F13 integration, Phase 11 — THE PRODUCT AS ONE SYSTEM: the 21-step multi-device journey.
 *
 * One household, every feature, through the production composition (`composeAccountApp`) on each device and each feature's OWN
 * command (the function its screen calls): a child and her context (F05, F13), a Task (F01/F03), a Calendar Event (F03), a System
 * (F04), a Home item (F06), a Co-Parent handoff (F07), a Meal (F08), a Money item (F09), a CareerOpportunity (F10), a RebuildFocus
 * (F11), a LifeRecord (F12), a PersonContext and a People follow-up (F13). Then offline: several edits and four archives; reconnect;
 * a fresh device of the same account hydrates and must hold EXACTLY what the first holds; then an unrelated account meets the device.
 *
 * Device A1 and A2 are one account; C is an unrelated account and household. Same-household member privacy (account B of A's
 * household) is a server property — RLS — proven against real PostgreSQL and PostgREST (supabase/tests 81 and every journey's P3),
 * which this in-memory cloud does not model; here the cloud answers a pull for one household, as `sync_pull` does.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addEvent, updateEvent } from '../../src/domain/events.ts';
import { addLifeRecord, addLifeRecordTask, archiveLifeRecord, updateLifeRecord } from '../../src/domain/lifeRecords.ts';
import { addMeal, archiveMeal, updateMeal } from '../../src/domain/meals.ts';
import { addOpportunity, addOpportunityNextAction, archiveOpportunity, setOpportunityStage } from '../../src/domain/opportunities.ts';
import { addExternalPerson, addFollowUp, archivePersonContext, contextFor, editPersonContext, openPersonContext } from '../../src/domain/people.ts';
import { addRebuildFocus, archiveRebuildFocus, linkToFocus, renameRebuildFocus } from '../../src/domain/rebuild/commands.ts';
import { canOpenScreen } from '../../src/domain/routeAccess.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { unresolvedEvidence } from '../../src/domain/sync/syncTypes.ts';
import { addTask, updateTask } from '../../src/domain/tasks.ts';
import { createHandoff } from '../../src/features/coparent/mutations.ts';
import { createHomeTask } from '../../src/features/home/model/mutations.ts';
import { addChildToHousehold } from '../../src/features/kids/mutations.ts';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { cancelMoneyItem, createObligation, editMoneyItem } from '../../src/features/money/mutations.ts';
import { buildPeopleHome } from '../../src/features/people/projection.ts';
import { applySystemDraft } from '../../src/features/systems/commands/saveDraft.ts';
import { careerListsOf } from '../../src/features/work/careerLists.ts';
import { ACCOUNT_A, TODAY, TUESDAY, accountCloudFor, act, boundDevice, makeDevice, secondDevice, uuid } from '../meals/support/twoDevice.mjs';

const ACCOUNT_C = '33333333-3333-4333-8333-333333333333';
const stateOf = (device) => device.store.getSnapshot().state;
const syncOf = (device) => device.store.getSnapshot().identity.sync;

/** Every synced collection this journey writes — compared row for row between the two devices of the account. */
const COLLECTIONS = ['children', 'tasks', 'events', 'systems', 'systemSteps', 'recurrences', 'responsibilities', 'people', 'meals',
  'careerOpportunities', 'dependencies', 'rebuildFocuses', 'rebuildFocusLinks', 'lifeRecords', 'lifeRecordLinks', 'personContexts',
  'personTaskLinks'];
const byId = (rows) => [...rows].sort((x, y) => x.id.localeCompare(y.id));

let step = 0;
async function run(device, transition, accept = (r) => r === null || r === 'saved' || r === 'added' || r === 'created') {
  step += 1;
  const { ok, result } = await act(device, transition);
  assert.ok(ok, `change #${step} was saved: ${JSON.stringify(result?.outcome ?? result?.refusal ?? null)}`);
  const verdict = result?.refusal ?? (typeof result?.outcome === 'object' ? (result.outcome.kind === 'saved' ? 'saved' : result.outcome.kind) : result?.outcome) ?? null;
  assert.ok(accept(verdict), `refused: ${JSON.stringify(verdict)}`);
  return result;
}

/** The real sync_pull answers for ONE household; the shared fake cloud answers for all. Narrowed as the server narrows it. */
function asTheServerScopesPulls(cloud, households) {
  const { pull, fetchRows } = cloud.transport;
  const mine = (row) => row !== undefined && (households.has(row.household_id) || households.has(`profile:${row.profile_id}`));
  cloud.transport.pull = async (cursor) => {
    const answer = await pull(cursor);
    return answer.kind === 'pulled' ? { ...answer, rows: answer.rows.filter((e) => mine(cloud.rows.get(`${e.entityTable}:${e.entityId}`))) } : answer;
  };
  cloud.transport.fetchRows = async (table, ids, column) => {
    const answer = await fetchRows(table, ids, column);
    return answer.kind === 'rows' ? { ...answer, rows: answer.rows.filter(mine) } : answer;
  };
}

test('[P11] the 21-step journey: every feature on one household, offline edits and archives, a fresh device holds exactly the same truth, and an unrelated account sees none of it', async () => {
  const { cloud, accountCloud, a: a1 } = await boundDevice();
  asTheServerScopesPulls(cloud, new Set([accountCloud.ids.householdId, `profile:${ACCOUNT_A}`]));
  const home = stateOf(a1).categories.find((c) => c.systemRole === 'home').id;

  // 1. a child, and her context (F05 Kids, F13 People)
  const child = await run(a1, (s, ctx) => addChildToHousehold(s, ctx, { displayName: 'Mia', birthDate: '2016-04-02' }));
  const childContext = (await run(a1, (s, ctx) => openPersonContext(s, ctx, { kind: 'child', id: child.childId }, { relationshipName: 'Daughter' }))).id;
  // 2. a Task (F01 Today / F03)
  await run(a1, (s, ctx) => addTask(s, ctx, { title: 'Call the plumber', categoryId: home, durationMinutes: 20, durationSource: 'user', scope: 'household', plan: { kind: 'day', date: TODAY } }));
  const task = stateOf(a1).tasks.at(-1).id;
  // 3. a Calendar Event (F03)
  await run(a1, (s, ctx) => addEvent(s, ctx, { title: 'Dentist', categoryId: home, startsAt: '2026-09-22T14:00:00.000Z', endsAt: '2026-09-22T15:00:00.000Z', commitment: 'fixed', scope: 'household' }));
  const event = stateOf(a1).events.at(-1).id;
  // 4. a System with a step (F04)
  await run(a1, (s, ctx) => applySystemDraft(s, ctx, { systemId: 'system-journey', isNew: true, name: 'Sunday reset', purpose: 'The week ahead', categoryId: home,
    steps: [{ key: 'a', id: null, title: 'Start the laundry', effortMinutes: 5 }], scheduleMode: 'none', schedule: null }, { fingerprint: null }));
  // 5. a Home item (F06)
  await run(a1, (s, ctx) => createHomeTask(s, ctx, { title: 'Replace the furnace filter', dueDate: TUESDAY, notes: null, commitment: 'flexible', repeat: { frequency: 'monthly', interval: 3 } }));
  // 6. a Co-Parent handoff (F07)
  await run(a1, (s, ctx) => createHandoff(s, ctx, { childId: child.childId, title: 'School pickup handoff', date: TUESDAY, startTime: '15:00', endTime: '15:30', location: 'School',
    notes: '', commitment: 'fixed', needsMe: true, repeat: 'none' }, { kind: 'new', displayName: 'Sam', relationship: 'co-parent' }));
  // 7. a Meal (F08)
  const meal = (await run(a1, (s, ctx) => addMeal(s, ctx, { title: 'Tacos', date: TUESDAY, slot: 'dinner' }))).id;
  // 8. a Money item (F09)
  const bill = (await run(a1, (s, ctx) => createObligation(s, ctx, { title: 'Water bill', amountText: '84.23', dueDate: '2026-09-28', notes: '', childId: null, paymentMechanism: 'autopay' }))).id;
  // 9. a CareerOpportunity and its next action (F10)
  await run(a1, (s, ctx) => addOpportunity(s, ctx, { title: 'Program manager', opportunityType: 'job' }));
  const opportunity = stateOf(a1).careerOpportunities.at(-1).id;
  await run(a1, (s, ctx) => addOpportunityNextAction(s, ctx, opportunity, { title: 'Update the resume', categoryId: 'cat-work' }));
  // 10. a RebuildFocus with a next step (F11)
  await run(a1, (s, ctx) => addRebuildFocus(s, ctx, { id: 'focus-journey', title: 'Sleep' }));
  await run(a1, (s, ctx) => addTask(s, ctx, { title: 'Phone out of the bedroom', categoryId: 'cat-wellbeing', scope: 'personal' }));
  await run(a1, (s, ctx) => linkToFocus(s, ctx, { id: 'focuslink-journey', focusId: 'focus-journey', target: { kind: 'task', id: stateOf(a1).tasks.at(-1).id }, relation: 'next_action' }));
  // 11. a LifeRecord and its renewal Task (F12)
  await run(a1, (s, ctx) => addLifeRecord(s, ctx, { id: 'life-record-journey', title: 'Passport', kind: 'credential', referenceNumber: 'P-1234567' }));
  await run(a1, (s, ctx) => addLifeRecordTask(s, ctx, { recordId: 'life-record-journey', taskId: 'task-f12-journey', linkId: 'life-link-journey', relation: 'renewal', title: 'Renew the passport', categoryId: home }));
  // 12. a PersonContext (F13)
  const person = (await run(a1, (s, ctx) => addExternalPerson(s, ctx, { displayName: 'Coach Ray', relationshipName: 'Coach' }))).id;
  const personContext = contextFor(stateOf(a1), { kind: 'person', id: person }).id;
  // 13. a People follow-up (F13)
  await run(a1, (s, ctx) => addFollowUp(s, ctx, { contextId: personContext, draftKey: 'journeyfollowup0000000001', title: 'Text Ray about practice' }));

  await a1.settle();
  assert.deepEqual(syncOf(a1).queue, [], 'every feature\'s rows reached the cloud');
  assert.deepEqual(unresolvedEvidence(syncOf(a1)), [], 'with nothing refused');
  assert.ok(validateAppState(stateOf(a1)).ok);

  // 14. offline
  cloud.state.offline = true;
  const cloudBefore = JSON.stringify(cloud.table('tasks'));
  // 15. several edits across features
  await run(a1, (s, ctx) => updateTask(s, ctx, task, { title: 'Call the plumber about the sink' }));
  await run(a1, (s, ctx) => updateEvent(s, ctx, event, { startsAt: '2026-09-22T16:00:00.000Z', endsAt: '2026-09-22T17:00:00.000Z' }));
  await run(a1, (s, ctx) => updateMeal(s, ctx, meal, { slot: 'lunch' }));
  await run(a1, (s, ctx) => {
    const t = s.tasks.find((x) => x.id === bill);
    return editMoneyItem(s, ctx, { taskId: bill, baseUpdatedAt: t.updatedAt, fields: { title: 'Water bill', amountText: '91.10', dueDate: '2026-09-28', notes: '', childId: null, paymentMechanism: 'manual' } });
  });
  await run(a1, (s, ctx) => setOpportunityStage(s, ctx, opportunity, 'applied'));
  await run(a1, (s, ctx) => renameRebuildFocus(s, ctx, 'focus-journey', 'Sleep by eleven'));
  await run(a1, (s, ctx) => updateLifeRecord(s, ctx, 'life-record-journey', { note: 'In the safe' }));
  await run(a1, (s, ctx) => editPersonContext(s, ctx, childContext, { contextNote: 'Loves soccer' }));
  // 16. archives owned by four features
  await run(a1, (s, ctx) => archiveOpportunity(s, ctx, opportunity));
  await run(a1, (s, ctx) => archiveLifeRecord(s, ctx, 'life-record-journey'));
  await run(a1, (s, ctx) => archiveRebuildFocus(s, ctx, 'focus-journey'));
  await run(a1, (s, ctx) => archiveMeal(s, ctx, meal));
  await run(a1, (s, ctx) => archivePersonContext(s, ctx, personContext));
  await run(a1, (s, ctx) => cancelMoneyItem(s, ctx, bill));
  await a1.settle();
  assert.equal(JSON.stringify(cloud.table('tasks')), cloudBefore, 'offline: the cloud has not moved');
  assert.ok(syncOf(a1).queue.length >= 10, `every offline change is owed: ${syncOf(a1).queue.length}`);
  assert.equal(stateOf(a1).tasks.find((t) => t.id === task).title, 'Call the plumber about the sink', 'and shown at once');

  // 17. reconnect
  cloud.state.offline = false;
  await a1.syncRuntime.request('manual');
  await a1.settle();
  assert.deepEqual(syncOf(a1).queue, [], 'everything reached the cloud');
  assert.deepEqual(unresolvedEvidence(syncOf(a1)), [], 'nothing conflicted or was refused');
  const inCloud = (table, localId) => cloud.table(table).filter((r) => r.local_id === localId);
  assert.notEqual(inCloud('career_opportunities', opportunity)[0].archived_at, null);
  assert.equal(inCloud('career_opportunities', opportunity)[0].stage, 'applied');
  assert.equal(inCloud('life_records', 'life-record-journey')[0].status, 'archived');
  assert.equal(inCloud('rebuild_focuses', 'focus-journey')[0].state, 'archived');
  assert.equal(inCloud('meal_plan_entries', meal)[0].status, 'archived');
  assert.equal(inCloud('tasks', bill)[0].status, 'archived');
  assert.equal(inCloud('tasks', bill)[0].payment_mechanism, 'manual');

  // 18. a fresh device of the same account hydrates
  const a2 = await secondDevice({ cloud, accountCloud });
  await a2.syncRuntime.request('manual');
  await a2.settle();

  // 19. the truth: the fresh device holds exactly what the first holds, row for row, in every feature
  for (const collection of COLLECTIONS) {
    assert.deepEqual(byId(stateOf(a2)[collection]), byId(stateOf(a1)[collection]), `${collection}: the fresh device reconstructs the same rows`);
  }
  assert.ok(validateAppState(stateOf(a2)).ok, 'what it hydrated is a valid household');
  assert.deepEqual(careerListsOf(stateOf(a2).careerOpportunities).archived.map((o) => o.id), [opportunity], 'Work: the archived opportunity is archived, not active');
  assert.deepEqual(buildLifeAdminView(stateOf(a2), TODAY).records, [], 'Life Admin: the archived record is off the active list');
  const peopleHome = buildPeopleHome(stateOf(a2), TODAY);
  assert.equal(JSON.stringify(peopleHome).includes('Loves soccer') || JSON.stringify(stateOf(a2).personContexts).includes('Loves soccer'), true, 'People: the edited child context reached the fresh device');
  assert.deepEqual(syncOf(a2).queue, [], 'the fresh device owes nothing: hydrating queued no echo');
  assert.deepEqual(unresolvedEvidence(syncOf(a2)), []);

  // 20. an unrelated account meets the device
  await a2.accountRuntime.signOut();
  const callsBefore = cloud.calls.length;
  const c = await makeDevice({ cloud, accountId: ACCOUNT_C, accountCloud: accountCloudFor(cloud, ACCOUNT_C), storage: a2.storage });
  const accountC = await c.signIn();
  await c.settle();

  // 21. isolation
  assert.equal(accountC.kind, 'boundOther', 'the device holds A\'s household: quarantined from C');
  assert.equal(cloud.calls.length, callsBefore, 'not one request on C\'s behalf');
  const snapshot = c.store.getSnapshot();
  const access = { status: snapshot.status, onboarding: snapshot.state.onboarding, internalTools: false, account: accountC };
  assert.equal(canOpenScreen('(app)', access), false, 'C can open no screen that renders A\'s household');
  assert.ok(c.persisted().identity.quarantine, 'A\'s household is preserved');
  for (const collection of COLLECTIONS) {
    assert.equal(c.persisted().state[collection].length, stateOf(a1)[collection].length, `${collection}: nothing of A\'s was deleted`);
  }
  // C on a device of her own hydrates her own household only.
  const cloudC = accountCloudFor(cloud, ACCOUNT_C);
  asTheServerScopesPulls(cloud, new Set([cloudC.ids.householdId, `profile:${ACCOUNT_C}`]));
  const cOwn = await makeDevice({ cloud, accountId: ACCOUNT_C, accountCloud: cloudC });
  assert.equal((await cOwn.signIn()).kind, 'accountBound');
  await cOwn.settle();
  for (const collection of COLLECTIONS) {
    assert.equal(stateOf(cOwn)[collection].length, 0, `${collection}: C's own device holds nothing of A's`);
  }
  assert.equal(uuid().length, 36);
});
