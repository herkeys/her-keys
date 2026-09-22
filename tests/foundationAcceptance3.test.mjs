import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { acceptInterpretation, proposeInterpretation, recordArtifact } from '../src/domain/interpretations.ts';
import { decideIntent, grantAuthority, proposeIntent } from '../src/domain/authorization.ts';
import { ExternalReferenceSchema, externalIdentityKey, resolveObservation, serverOriginLocalId } from '../src/domain/foundation/externalReference.ts';
import { parseMoney, totalsOf } from '../src/domain/foundation/money.ts';
import { ResponsibilitySchema } from '../src/domain/foundation/responsibility.ts';
import { Id } from '../src/domain/schemaPrimitives.ts';
import { addEvent } from '../src/domain/events.ts';
import { completeTask } from '../src/domain/tasks.ts';
import { addEvidence, confirmPattern, explain, proposePattern } from '../src/domain/patterns.ts';
import { acknowledge, addPerson, delegate, needsMePersonally, observeUnacknowledged } from '../src/domain/responsibility.ts';
import { addDependency, addGoal, addRecurrence, addSystemStep, blockersOf, nextOccurrence, setCapacity, skipOccurrence } from '../src/domain/structure.ts';
import { appendObservation } from '../src/domain/observations.ts';
import { attentionFor } from '../src/domain/reasoning/attention.ts';
import { briefingFor } from '../src/domain/reasoning/briefing.ts';
import { commitmentFacetsOf } from '../src/domain/foundation/commitment.ts';
import { relatedTo } from '../src/domain/reasoning/related.ts';
import { AppStateSchema, validateAppState } from '../src/domain/state.ts';
import { FOUNDATION_SPECS } from '../src/domain/sync/foundationSpecs.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { emptyNamespace } from '../src/domain/sync/syncTypes.ts';
import { DAY, MORNING, nyInstant, nyMs } from './support/fixtures.mjs';
import { AUTOMATION, DIGEST, USER, at, execution, lastTask, real, ref, survives, withTask } from './support/acceptance.mjs';
import { richHousehold } from './support/richHousehold.mjs';

const CHILD = { id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' };

describe('FE-19 — explainability: one contract answers "why?" for a pattern, a One Move and a proposal', () => {
  test('an explanation is a code and a reference to the thing that supports it — structured evidence, never a chain of thought', () => {
    const { state: s } = richHousehold();
    const pattern = s.patterns[0];
    const forPattern = explain(s, ref('pattern', pattern.id));
    const forIntent = explain(s, ref('intent', s.intents[0].id));
    assert.ok(forPattern.length >= 3, 'the pattern stands on the observations it names');
    assert.ok(forIntent.length >= 1);
    for (const link of [...forPattern, ...forIntent]) {
      assert.deepEqual(Object.keys(link).sort(), ['code', 'createdAt', 'for', 'id', 'provenance', 'scope', 'support'], 'exactly a code, a reference and provenance');
      assert.match(link.code, /^[a-z][a-z0-9_.-]{0,63}$/, 'a code, not prose');
      assert.ok(['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility', 'observation'].includes(link.support.kind));
    }
    // "Why this One Move?" needs no new mechanism, and the answer outlives a move that was cleared.
    const withMove = addEvidence(s, at(), { for: ref('oneMove', 'onemove-cleared'), support: ref('task', s.tasks[0].id), code: 'deadline' });
    assert.equal(explain(withMove, ref('oneMove', 'onemove-cleared')).length, 1);
    survives(withMove, 'FE-19');
  });
});

describe('FE-20 — calendar OS: external calendars are referenced by identity, not copied', () => {
  test('two providers, linked to local events; a changed version is recognised as the same object and flagged for attention', () => {
    let s = addEvent(real(), at(), { title: 'Piano recital', categoryId: 'cat-kids', startsAt: '2026-09-26T22:00:00.000Z', endsAt: '2026-09-26T23:00:00.000Z', commitment: 'fixed', scope: 'household' });
    s = addEvent(s, at(), { title: 'Team offsite', categoryId: 'cat-work', startsAt: '2026-09-28T14:00:00.000Z', endsAt: '2026-09-28T20:00:00.000Z', commitment: 'fixed', scope: 'professional' });
    const xref = (id, provider, account, object, event, over = {}) => ({
      id, provider, externalAccount: account, externalObjectId: object, externalVersion: 'v1', origin: 'external', direction: 'inbound', authority: 'external',
      lastObservedAt: '2026-09-16T13:00:00.000Z', lastObservedDigest: DIGEST('a'), linked: ref('event', event), writtenAt: null, status: 'active',
      createdAt: '2026-09-16T13:00:00.000Z', updatedAt: '2026-09-16T13:00:00.000Z', provenance: { producer: 'import-sync', artifactId: null, confidence: 'likely' }, scope: 'personal', ...over,
    });
    s = { ...s, externalReferences: [xref('xref-g', 'gcal', 'acct-home', 'evt-9', s.events[0].id), xref('xref-o', 'outlook', 'acct-work', 'evt-9', s.events[1].id)] };
    survives(s, 'FE-20');
    assert.notEqual(externalIdentityKey(s.externalReferences[0]), externalIdentityKey(s.externalReferences[1]), 'the same object id in two providers is two objects');
    const seen = resolveObservation(s.externalReferences, { provider: 'gcal', externalAccount: 'acct-home', externalObjectId: 'evt-9', externalVersion: 'v2', observedAt: '2026-09-20T09:00:00.000Z', observedDigest: DIGEST('b') });
    assert.equal(seen.kind, 'known');
    assert.equal(seen.reference.externalVersion, 'v2');
    const moved = { ...s, externalReferences: [seen.reference, s.externalReferences[1]] };
    assert.ok(attentionFor(moved, MORNING).some((i) => i.reason === 'external_source_changed' && i.about.id === s.events[0].id), 'the source moved after the row that mirrors it last caught up');
  });
});

describe('FE-21 — external identity: (provider, account, object) is the key, and a connector can mint ids no device chose', () => {
  test('two references cannot claim one identity; a server-originated local id fits the id pattern', () => {
    const { state } = richHousehold();
    const dup = { ...state.externalReferences[0], id: 'xref-dup' };
    assert.equal(validateAppState({ ...state, externalReferences: [state.externalReferences[0], dup] }).ok, false);
    const id = serverOriginLocalId('gmail', 'msg-42', 'f'.repeat(64));
    assert.equal(Id.safeParse(id).success, true, `${id} is a legal local id`);
    assert.match(id, /^ext:gmail:/);
    assert.equal(ExternalReferenceSchema.safeParse({ ...state.externalReferences[0], id }).success, true);
  });
});

describe('FE-22 — the integration feedback loop: what Her Keys wrote comes back as itself, not as something new', () => {
  test('a calendar event Her Keys created externally is recognised on the echo — even renamed — and a stranger is still new', () => {
    // 1. Her Keys, with authority, writes "Dentist" to an external calendar. Representation only: the record of it.
    let s = withTask(real(), { title: 'Book the dentist' });
    s = addEvent(s, at(), { title: 'Dentist', categoryId: 'cat-wellbeing', startsAt: '2026-09-24T15:00:00.000Z', endsAt: '2026-09-24T16:00:00.000Z', commitment: 'fixed', scope: 'personal' });
    const event = s.events[0];
    s = grantAuthority(s, at(), { category: 'external_calendar_write', mode: 'execute_authorized', persistent: true, provider: 'gcal' });
    s = proposeIntent(s, at(), { category: 'external_calendar_write', summaryCode: 'write_dentist_event', about: ref('event', event.id), provider: 'gcal' });
    const intent = s.intents[0];
    assert.equal(intent.permittedMode, 'execute_authorized');
    s = {
      ...s,
      externalReferences: [{
        id: 'xref-out', provider: 'gcal', externalAccount: 'acct-home', externalObjectId: 'evt-made-by-us', externalVersion: 'v1', origin: 'her-keys', direction: 'outbound', authority: 'her-keys',
        lastObservedAt: null, lastObservedDigest: null, linked: ref('event', event.id), writtenAt: '2026-09-16T14:05:00.000Z', status: 'active',
        createdAt: '2026-09-16T14:05:00.000Z', updatedAt: '2026-09-16T14:05:00.000Z', provenance: AUTOMATION, scope: 'personal',
      }],
      executions: [execution({ id: 'exec-out', intentId: intent.id, authorityId: s.authorities[0].id, provider: 'gcal', externalActionId: 'evt-made-by-us', externalReferenceId: 'xref-out' })],
    };
    survives(s, 'FE-22 (written)');

    // 2. The provider reports the object back on its next sync — with a new title, as a person might edit it.
    const echo = resolveObservation(s.externalReferences, { provider: 'gcal', externalAccount: 'acct-home', externalObjectId: 'evt-made-by-us', externalVersion: 'v2', observedAt: '2026-09-17T08:00:00.000Z', observedDigest: DIGEST('c') });
    assert.equal(echo.kind, 'known', 'recognised by IDENTITY, never by title or time');
    assert.equal(echo.selfWritten, true, 'and known to be Her Keys\' own write');
    const candidatesBefore = s.interpretations.length;
    // The ingestion rule that prevents the loop: a known, self-written object creates NO new candidate.
    const next = echo.kind === 'known' && echo.selfWritten ? { ...s, externalReferences: [echo.reference] } : proposeInterpretation(s, at(), { artifactId: 'x', proposedKind: 'event', title: 'Dentist' });
    assert.equal(next.interpretations.length, candidatesBefore, 'no duplicate event, no second reading, no loop');
    assert.equal(next.events.length, 1);

    // 3. A genuinely different object is still new, and so still needs a domain object.
    assert.equal(resolveObservation(s.externalReferences, { provider: 'gcal', externalAccount: 'acct-home', externalObjectId: 'evt-someone-elses', externalVersion: null, observedAt: '2026-09-17T08:00:00.000Z', observedDigest: null }).kind, 'new');
    assert.equal(resolveObservation(s.externalReferences, { provider: 'gcal', externalAccount: 'acct-other', externalObjectId: 'evt-made-by-us', externalVersion: null, observedAt: '2026-09-17T08:00:00.000Z', observedDigest: null }).kind, 'new', 'the same id in a different account is a different object');

    // 4. And nothing anywhere holds a provider credential: the reference names WHICH account, never a way into it.
    const keys = new Set();
    const walk = (schema) => {
      const shape = schema?.shape ?? schema?.element?.shape ?? schema?.def?.innerType?.shape ?? schema?.def?.innerType?.element?.shape;
      if (!shape) return;
      for (const [key, child] of Object.entries(shape)) { keys.add(key); walk(child); walk(child?.def?.element); }
    };
    walk(AppStateSchema);
    assert.deepEqual([...keys].filter((k) => /token|secret|password|credential|apiKey|refresh|oauth|bearer/i.test(k)), [], 'no provider token can live in AppState');
  });
});

describe('FE-23 — co-parent logistics: a co-parent is a person she works with, never an account', () => {
  test('exchange days, pickups and messages live in her coparent-shared scope, owner-only, addressed to a person with no access', () => {
    let s = addPerson(real(), at(), { displayName: 'Sam', relationship: 'co-parent', channel: 'sms' });
    s = withTask(s, { title: 'Swap the Thursday pickup', categoryId: 'cat-coparenting', scope: 'coparent-shared' });
    s = delegate(s, at(), { about: ref('task', lastTask(s).id), to: ref('person', s.people[0].id), ackWithinMinutes: 120 });
    survives(s, 'FE-23');
    const ctx = { householdId: '00000000-0000-4000-8000-0000000000b1', profileId: '00000000-0000-4000-8000-0000000000a1' };
    const mappings = { 'category:cat-coparenting': { kind: 'category', localId: 'cat-coparenting', cloudId: '00000000-0000-4000-8000-0000000000c1', revision: 1 } };
    const row = toCloudRow(s, { ...ctx, namespace: { ...emptyNamespace({ accountId: ctx.profileId, householdId: ctx.householdId, deviceId: '00000000-0000-4000-8000-0000000000d1' }), mappings } }, 'task', lastTask(s).id);
    assert.equal(row.owner_profile_id, ctx.profileId, 'coparent-shared is OWNER-ONLY: it is a category, not a grant of access to anyone');
    assert.equal(s.people[0].scope, 'personal');
    assert.equal(Object.keys(s.people[0]).some((k) => /account|profile|userId|email|phone/i.test(k)), false, 'a person has no account and no contact details to leak');
  });
});

describe('FE-24 — Money OS starts from exact amounts on the things that carry them', () => {
  test('bills, a repair, a school fee and a refund add up per currency and direction — never floating point, never mixed', () => {
    let s = real();
    const rows = [['Electric bill', '128.40', 'outflow', '2026-09-18'], ['Car repair', '640', 'outflow', '2026-09-20'], ['School trip fee', '35', 'outflow', '2026-09-24'], ['Refund: lost jacket', '20', 'inflow', '2026-09-19']];
    for (const [title, amount, direction, dueDate] of rows) {
      s = withTask(s, { title, dueDate, categoryId: 'cat-money' });
      s = { ...s, tasks: s.tasks.map((t) => (t.id === lastTask(s).id ? { ...t, value: parseMoney(amount, 'USD', direction) } : t)) };
    }
    s = withTask(s, { title: 'Euro deposit', categoryId: 'cat-money' });
    s = { ...s, tasks: s.tasks.map((t) => (t.id === lastTask(s).id ? { ...t, value: parseMoney('50', 'EUR', 'outflow') } : t)) };
    const totals = totalsOf(s.tasks.map((t) => t.value));
    assert.deepEqual(totals, { outflow: { USD: 12840 + 64000 + 3500, EUR: 5000 }, inflow: { USD: 2000 } });
    assert.equal(commitmentFacetsOf({ kind: 'task', row: s.tasks[0] }).value.amountMinor, 12840);
    survives(s, 'FE-24');
  });
});

describe('FE-25 — a household system is an engine: steps, a schedule, an autonomy setting and an effort', () => {
  test('"Sunday reset" has ordered steps, a weekly rule that honours a skipped week, and says how much Her Keys may do', () => {
    let s = real();
    s = { ...s, systems: [{ id: 'sys-1', name: 'Sunday reset', description: 'Reset the house', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'prepare', effortMinutes: 45, energyDemand: 'moderate', provenance: USER, scope: 'household' }] };
    for (const title of ['Strip the beds', 'Start laundry', 'Wipe the kitchen']) s = addSystemStep(s, at(), 'sys-1', { title, effortMinutes: 10 });
    s = addRecurrence(s, at(), ref('system', 'sys-1'), { frequency: 'weekly', byWeekday: [0], anchorDate: '2026-09-13' });
    const rule = s.recurrences[0];
    assert.equal(nextOccurrence(s, rule, '2026-09-14'), '2026-09-20');
    s = skipOccurrence(s, at(), ref('system', 'sys-1'), '2026-09-20');
    assert.equal(nextOccurrence(s, rule, '2026-09-14'), '2026-09-27', 'a skipped week is history, not an edit to the rule');
    assert.deepEqual(s.systemSteps.map((x) => x.position), [0, 1, 2]);
    assert.equal(s.systems[0].automationMode, 'prepare');
    survives(s, 'FE-25');
  });
});

describe('FE-26 — pattern intelligence: what she does, noticed, kept at the confidence it earned', () => {
  test('a pattern stands on independent days; only she can establish it; it reads back at exactly its level', () => {
    let s = withTask(real(), { title: 'Laundry' });
    const ids = [];
    for (const day of ['2026-09-08', '2026-09-15', '2026-09-22']) {
      s = appendObservation(s, at(MORNING, day), { about: ref('task', lastTask(s).id), outcome: 'skipped', plannedDate: day });
      ids.push(s.observations.at(-1).id);
    }
    s = proposePattern(s, at(), { kind: 'deferral', weekday: 2, timeBucket: 'evening', observationIds: ids, code: 'repeated_deferral' });
    assert.equal(s.patterns[0].provenance.confidence, 'likely', 'three independent days');
    assert.notEqual(s.patterns[0].provenance.confidence, 'established', 'evidence alone never establishes a pattern');
    survives(s, 'FE-26 (candidate)');
    s = confirmPattern(s, at(), s.patterns[0].id);
    assert.deepEqual([s.patterns[0].status, s.patterns[0].provenance.confidence], ['confirmed', 'established']);
    survives(s, 'FE-26 (confirmed)');
  });
});

describe('FE-27 — shared household participation is REPRESENTED and refused: everything stays hers', () => {
  test('every foundation row is owner-private by schema; a household-visible scope is not accepted for any of them', () => {
    const { state: s } = richHousehold({ withServerRows: true });
    for (const spec of FOUNDATION_SPECS) {
      const rows = spec.singleton ? [s[spec.collection]] : s[spec.collection];
      for (const row of rows) assert.equal(row.scope, 'personal', `${spec.kind} is owner-private`);
    }
    assert.equal(ResponsibilitySchema.safeParse({ ...s.responsibilities[0], scope: 'household' }).success, false, 'a handoff cannot be made household-visible');
    assert.equal(validateAppState({ ...s, goals: [{ ...s.goals[0], scope: 'household' }] }).ok, false);
    assert.equal(s.children.length, 0, 'and membership is untouched: nobody was added to the household');
  });

  test('no JSON bag anywhere: every foundation field is a typed scalar, a typed reference or a typed structure', () => {
    const banned = new Set(['record', 'any', 'unknown', 'map', 'custom']);
    const found = [];
    const walk = (schema, path) => {
      const def = schema?.def;
      if (!def) return;
      if (banned.has(def.type)) found.push(`${path}:${def.type}`);
      const shape = schema.shape ?? def.innerType?.shape;
      if (shape) for (const [key, child] of Object.entries(shape)) walk(child, `${path}.${key}`);
      if (def.element) walk(def.element, `${path}[]`);
      if (def.innerType) walk(def.innerType, path);
      for (const option of def.options ?? []) walk(option, path);
    };
    for (const spec of FOUNDATION_SPECS) walk(AppStateSchema.shape[spec.collection], spec.collection);
    assert.deepEqual(found, [], 'an untyped bag in a foundation collection');
  });
});

// ==================================================================================================================
// CROSS-DOMAIN SCENARIOS — typed relations only. No JSON payload carries meaning in any of them.
// ==================================================================================================================
describe('SCENARIO A — the school trip: a form, a fee, a child, and a work conflict', () => {
  test('one email becomes an event and two obligations; the trip waits on both; the work meeting collides; the $35 is exact; everything traces to the email', () => {
    let s = { ...real(), children: [CHILD] };
    const r = recordArtifact(s, at(), { kind: 'email', origin: 'user-submitted', provider: 'forward', contentDigest: DIGEST('a') });
    s = r.state;
    const email = r.artifact;
    s = proposeInterpretation(s, at(), { artifactId: email.id, proposedKind: 'event', title: 'Field trip', startsAt: nyInstant(9, 0, 25), endsAt: nyInstant(15, 0, 25) });
    s = proposeInterpretation(s, at(), { artifactId: email.id, proposedKind: 'task', title: 'Return the permission form', dueDate: '2026-09-23' });
    s = proposeInterpretation(s, at(), { artifactId: email.id, proposedKind: 'task', title: 'Pay the $35 fee', dueDate: '2026-09-24', value: parseMoney('35', 'USD', 'outflow') });
    for (const reading of [...s.interpretations]) s = acceptInterpretation(s, at(), reading.id, { categoryId: 'cat-kids' });
    // The email names her child, so the rows become his: child-scoped, naming him.
    s = { ...s, events: s.events.map((e) => ({ ...e, subjectMemberId: 'child-1', scope: 'child' })), tasks: s.tasks.map((t) => ({ ...t, subjectMemberId: 'child-1', scope: 'child' })) };
    const [trip] = s.events.map((e) => ref('event', e.id));
    const [form, fee] = s.tasks.map((t) => ref('task', t.id));
    ({ state: s } = addDependency(s, at(), { relation: 'requires', from: trip, to: form }));
    ({ state: s } = addDependency(s, at(), { relation: 'requires', from: trip, to: fee }));
    // Her work: a meeting at the same time, in her professional scope.
    s = addEvent(s, at(), { title: 'Quarterly review', categoryId: 'cat-work', startsAt: nyInstant(10, 0, 25), endsAt: nyInstant(11, 0, 25), commitment: 'fixed', scope: 'professional' });

    assert.equal(blockersOf(s, trip).length, 2, 'the trip cannot happen until both are done');
    s = completeTask(s, at(), form.id);
    assert.deepEqual(blockersOf(s, trip).map((r) => r.id), [fee.id]);
    assert.deepEqual(totalsOf(s.tasks.map((t) => t.value)), { outflow: { USD: 3500 }, inflow: {} });
    const around = relatedTo(s, form);
    assert.ok(around.siblings.some((x) => x.id === trip.id) && around.siblings.some((x) => x.id === fee.id), 'the event, the form and the fee all trace to the same email');
    assert.equal(around.artifact.id, email.id);
    assert.equal(s.tasks.every((t) => t.provenance.producer === 'ai-inference' && t.provenance.confidence === 'established'), true, 'accepted by her, still an inference by origin');
    const onTheDay = attentionFor(s, nyMs(8, 0, 25));
    assert.ok(onTheDay.some((i) => i.reason === 'conflict'), 'the review overlaps the trip');
    survives(s, 'SCENARIO A');
  });
});

describe('SCENARIO B — money pressure: a bill, a car repair and a school fee in one week', () => {
  test('exact obligations, ranked by consequence and date, with no authority to pay any of them — Her Keys may only suggest', () => {
    let s = real();
    // The repair was due yesterday and nobody is handling it: exactly the shape a "risk" is.
    const bills = [['Electric bill', '128.40', '2026-09-16', 'moderate'], ['Car repair', '640', '2026-09-15', 'high'], ['School fee', '35', '2026-09-24', 'low']];
    for (const [title, amount, dueDate, consequence] of bills) {
      s = withTask(s, { title, dueDate, categoryId: 'cat-money' });
      s = { ...s, tasks: s.tasks.map((t) => (t.id === lastTask(s).id ? { ...t, value: parseMoney(amount, 'USD', 'outflow'), consequence } : t)) };
      s = proposeIntent(s, at(), { category: 'financial_action', summaryCode: `pay_${title.split(' ')[0].toLowerCase()}`, about: ref('task', lastTask(s).id), amount: parseMoney(amount, 'USD', 'outflow'), provider: 'bank-x' });
    }
    assert.deepEqual(s.intents.map((i) => i.permittedMode), ['suggest', 'suggest', 'suggest'], 'no authority was ever granted; nothing may be paid');
    assert.deepEqual(s.intents.map((i) => i.consequence), ['critical', 'critical', 'critical']);
    const week = s.tasks.filter((t) => t.dueDate <= '2026-09-24');
    assert.equal(totalsOf(week.map((t) => t.value)).outflow.USD, 12840 + 64000 + 3500);
    const items = attentionFor(s, MORNING);
    assert.ok(items.some((i) => i.reason === 'deadline' && i.urgency === 'today'), 'the electric bill is due today');
    assert.ok(items.some((i) => i.reason === 'risk' && i.about?.id === s.tasks[1].id), 'the high-consequence repair is at risk');
    const b = briefingFor(s, MORNING, MORNING - 3_600_000);
    assert.equal(b.needsApproval.length, 3, 'three payments waiting for her yes');
    // She approves ONE; the cloud would refuse to record an execution for the other two.
    s = decideIntent(s, at(), s.intents[1].id, 'approved');
    assert.equal(briefingFor(s, MORNING, MORNING - 3_600_000).needsApproval.length, 2);
    survives(s, 'SCENARIO B');
  });

  test('ACKNOWLEDGED ≠ ACCEPTED (audit W2-02): a high-consequence task someone only acknowledged is still a risk', () => {
    let s = real();
    s = withTask(s, { title: 'Car repair', dueDate: '2026-09-15', categoryId: 'cat-money' });
    s = { ...s, tasks: s.tasks.map((t) => (t.id === lastTask(s).id ? { ...t, consequence: 'high' } : t)) };
    const task = lastTask(s);
    s = addPerson(s, at(), { displayName: 'Sam', relationship: 'friend' });
    const person = s.people[0];
    s = delegate(s, at(), { about: { kind: 'task', id: task.id }, to: { kind: 'person', id: person.id } });
    const respId = s.responsibilities.find((r) => r.about.id === task.id).id;

    // Merely seeing the request must not clear the risk: she has said yes to nothing yet.
    s = acknowledge(s, at(), respId);
    assert.equal(s.responsibilities.find((r) => r.id === respId).state, 'acknowledged');
    assert.ok(attentionFor(s, MORNING).some((i) => i.reason === 'risk' && i.about?.id === task.id), 'acknowledged-but-not-accepted is still a risk');

    // Only actual acceptance may stand down the risk.
    s = { ...s, responsibilities: s.responsibilities.map((r) => (r.id === respId ? { ...r, state: 'accepted' } : r)) };
    assert.ok(!attentionFor(s, MORNING).some((i) => i.reason === 'risk' && i.about?.id === task.id), 'accepted is genuinely handled elsewhere');
  });
});

describe('SCENARIO C — practice, travel, dinner and the end of her workday', () => {
  test('a transition that does not fit is derivable from typed travel, preparation and capacity — no scheduler guesses', () => {
    let s = real();
    s = addEvent(s, at(), { title: 'Work: end-of-day call', categoryId: 'cat-work', startsAt: nyInstant(16, 0), endsAt: nyInstant(17, 20), commitment: 'fixed', scope: 'professional' });
    s = addEvent(s, at(), { title: 'Soccer practice', categoryId: 'cat-kids', startsAt: nyInstant(17, 30), endsAt: nyInstant(18, 30), commitment: 'fixed', scope: 'household', travelMinutesBefore: 20, travelMinutesAfter: 20, preparationMinutes: 10 });
    s = withTask(s, { title: 'Get dinner on the table', categoryId: 'cat-meals', dueDate: DAY });
    s = { ...s, tasks: s.tasks.map((t) => ({ ...t, durationMinutes: 40, preparationMinutes: 15, energyDemand: 'moderate' })),
      meals: [{ id: 'meal-1', date: DAY, title: 'Sheet-pan chicken', categoryId: 'cat-meals', slot: 'unspecified', status: 'active', prepMinutes: 25, energyDemand: 'low', provenance: USER, scope: 'household' }] };
    s = setCapacity(s, at(), { dayEndMinutes: 21 * 60, transitionBufferMinutes: 15 });
    const practice = commitmentFacetsOf({ kind: 'event', row: s.events[1] });
    assert.deepEqual(practice.transition, { before: 20, after: 20, preparation: 10 });
    const leaveBy = Date.parse(s.events[1].startsAt) - (practice.transition.before + practice.transition.preparation) * 60_000;
    const workEnds = Date.parse(s.events[0].endsAt);
    assert.ok(leaveBy < workEnds, 'she would have to leave before the call ends: derived from typed facts alone');
    const meal = commitmentFacetsOf({ kind: 'meal', row: s.meals[0] });
    assert.equal(meal.effortMinutes, 25);
    assert.ok(attentionFor(s, nyMs(9, 0)).some((i) => i.reason === 'conflict'), 'and the day already knows it');
    survives(s, 'SCENARIO C');
  });
});

describe('SCENARIO D — a delegated pickup that nobody acknowledged, on a day her work overlaps it', () => {
  test('silence is noticed once, the pickup comes back to her, and the briefing puts it in front of her — with the meeting it collides with', () => {
    let s = { ...real(), children: [CHILD] };
    s = addEvent(s, at(), { title: 'Client meeting', categoryId: 'cat-work', startsAt: nyInstant(15, 0), endsAt: nyInstant(16, 30), commitment: 'fixed', scope: 'professional' });
    s = addEvent(s, at(), { title: 'Pick up Mia from school', categoryId: 'cat-kids', startsAt: nyInstant(15, 30), endsAt: nyInstant(16, 0), commitment: 'fixed', scope: 'child', subjectMemberId: 'child-1' });
    const pickup = ref('event', s.events[1].id);
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent', channel: 'sms' });
    s = delegate(s, at(), { about: pickup, to: ref('person', s.people[0].id), ackWithinMinutes: 30 });
    assert.equal(needsMePersonally(s, pickup, MORNING), true, 'until they accept, it still needs her');

    const noon = at(nyMs(13, 0));
    s = observeUnacknowledged(observeUnacknowledged(s, noon), noon);
    assert.equal(s.observations.filter((o) => o.outcome === 'unacknowledged').length, 1);
    const b = briefingFor(s, nyMs(13, 0), nyMs(9, 0));
    assert.equal(b.unacknowledged.length, 1);
    assert.ok(b.needsHer.some((i) => i.reason === 'unacknowledged_delegation' && i.about.kind === 'responsibility' && i.about.id === s.responsibilities[0].id), 'the handoff itself is what needs her');
    assert.ok(attentionFor(s, nyMs(13, 0)).some((i) => i.reason === 'conflict'), 'the client meeting overlaps the pickup');
    const around = relatedTo(s, pickup);
    assert.equal(around.responsibilities.length, 1);
    // The silence is a fact ABOUT THE HANDOFF, so that is where it is found — and it was recorded exactly once.
    const handoff = relatedTo(s, ref('responsibility', s.responsibilities[0].id));
    assert.equal(handoff.observations.filter((o) => o.outcome === 'unacknowledged').length, 1);
    // Then Grandma answers, and the need ends because SHE said yes — not because time passed.
    s = acknowledge(s, at(nyMs(13, 30)), s.responsibilities[0].id);
    assert.equal(needsMePersonally(s, pickup, nyMs(13, 30)), true, 'acknowledged is not accepted');
    survives(s, 'SCENARIO D');
  });
});
