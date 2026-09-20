import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { decideIntent, executionAuthorization, grantAuthority, intentLifecycle, proposeIntent, revokeAuthority, approveUnderAuthority } from '../src/domain/authorization.ts';
import { ACTION_CATEGORIES, AUTONOMY_MODES, CATEGORY_PROFILE, atLeastAsSerious, permittedMode } from '../src/domain/foundation/authorization.ts';
import { parseMoney } from '../src/domain/foundation/money.ts';
import { accept, acknowledge, addPerson, decline, delegate, needsMePersonally, observeUnacknowledged, returnToSelf } from '../src/domain/responsibility.ts';
import { addDependency, addGoal, alternativesTo, goalProgress, stepsOf } from '../src/domain/structure.ts';
import { completeTask } from '../src/domain/tasks.ts';
import { ATTENTION_REASONS, attentionFor } from '../src/domain/reasoning/attention.ts';
import { relatedTo } from '../src/domain/reasoning/related.ts';
import { AppStateSchema } from '../src/domain/state.ts';
import { MORNING } from './support/fixtures.mjs';
import { USER, at, execution, lastTask, outcome, real, ref, survives, withTask } from './support/acceptance.mjs';
import { richHousehold } from './support/richHousehold.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });

describe('FE-10 — AI decomposition: a goal becomes steps, each saying who proposed it', () => {
  test('"plan the school trip" splits into part_of steps, with a low-energy alternative; progress is derived, never stored', () => {
    let s = addGoal(real(), at(), { title: 'Plan the school trip', categoryId: 'cat-kids' });
    const goal = ref('goal', s.goals[0].id);
    const generated = { producer: 'ai-inference', artifactId: null, confidence: 'possible' };
    for (const title of ['Sign the permission form', 'Pay the $35 fee', 'Pack the lunch']) {
      s = withTask(s, { title });
      ({ state: s } = addDependency(s, at(), { relation: 'part_of', from: ref('task', lastTask(s).id), to: goal, provenance: generated }));
    }
    s = withTask(s, { title: 'Ask Grandma to pack the lunch' });
    ({ state: s } = addDependency(s, at(), { relation: 'alternative_to', from: ref('task', lastTask(s).id), to: ref('task', s.tasks[2].id), provenance: generated }));

    assert.equal(stepsOf(s, goal).length, 3);
    assert.deepEqual(alternativesTo(s, ref('task', s.tasks[2].id)).map((r) => r.id), [lastTask(s).id], 'a lower-effort alternative to one step');
    assert.deepEqual(goalProgress(s, goal.id), { total: 3, done: 0, fraction: 0 });
    s = completeTask(s, at(), stepsOf(s, goal)[0].id);
    assert.equal(goalProgress(s, goal.id).done, 1);
    assert.ok(s.dependencies.every((d) => d.provenance.producer === 'ai-inference'), 'every generated relationship says it was generated');
    assert.equal(relatedTo(s, goal).parts.length, 3);
    survives(s, 'FE-10');
  });
});

describe('FE-11 — delegation: to a person, or to one of her children', () => {
  test('a task is handed to Grandma with a window to answer, another to a child; both are owner-private state', () => {
    let s = withTask(real(), { title: 'Pick up Ben from soccer' });
    s = { ...s, children: [{ id: 'child-1', displayName: 'Mia', birthDate: '2016-04-02', scope: 'child' }] };
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent', channel: 'sms' });
    s = delegate(s, at(), { about: ref('task', lastTask(s).id), to: ref('person', s.people[0].id), ackWithinMinutes: 45 });
    s = withTask(s, { title: 'Put the recycling out' });
    s = delegate(s, at(), { about: ref('task', lastTask(s).id), to: ref('child', 'child-1') });
    assert.deepEqual(s.responsibilities.map((r) => [r.responsibleKind, r.state]), [['person', 'requested'], ['child', 'requested']]);
    assert.ok(s.responsibilities[0].ackDueAt !== null && s.responsibilities[1].ackDueAt === null);
    assert.equal(s.responsibilities.every((r) => r.scope === 'personal'), true);
    survives(s, 'FE-11');
  });
});

describe('FE-12 — closed-loop responsibility: it stops needing her only when she says so', () => {
  test('a refusal returns it to her; silence is noticed exactly once; a stated hand-over ends the need', () => {
    let s = withTask(real(), { title: 'Pick up Ben' });
    s = addPerson(s, at(), { displayName: 'Grandma June', relationship: 'grandparent' });
    const about = ref('task', lastTask(s).id);
    s = delegate(s, at(), { about, to: ref('person', s.people[0].id), ackWithinMinutes: 30 });
    assert.equal(needsMePersonally(s, about, MORNING), true, 'still needs her while the request is out');
    const later = at(MORNING + 2 * 3_600_000);
    s = observeUnacknowledged(s, later);
    s = observeUnacknowledged(s, later);
    assert.equal(s.observations.filter((o) => o.outcome === 'unacknowledged').length, 1, 'silence is recorded once, never repeated');
    s = decline(s, later, s.responsibilities[0].id);
    assert.equal(needsMePersonally(s, about, MORNING + 3 * 3_600_000), true, 'a refusal comes back to her');
    // She hands it over again; this time they say yes, and that — her stated hand-over — is what ends the need.
    s = delegate(s, later, { about, to: ref('person', s.people[0].id) });
    const second = s.responsibilities.at(-1).id;
    s = accept(acknowledge(s, later, second), later, second);
    assert.equal(needsMePersonally(s, about, MORNING + 4 * 3_600_000), false, 'accepted: it no longer needs her');
    s = returnToSelf(s, later, second);
    assert.equal(s.responsibilities.find((r) => r.id === second).responsibleKind, 'self', 'and if she takes it back it is hers again');
    assert.equal(needsMePersonally(s, about, MORNING + 5 * 3_600_000), true);
    survives(s, 'FE-12');
  });
});

describe('FE-13 — proactive automation: what Her Keys WOULD do is recorded; nothing is done', () => {
  test('proposals carry a permitted mode derived from her authority; no code in the domain can reach the network or a provider', () => {
    let s = grantAuthority(real(), at(), { category: 'internal_reminder', mode: 'execute_authorized', persistent: true });
    s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    s = proposeIntent(s, at(), { category: 'outbound_message', summaryCode: 'text_the_coach', provider: 'sms' });
    assert.deepEqual(s.intents.map((i) => i.permittedMode), ['execute_authorized', 'suggest'], 'a permission for reminders is not a permission to send a message');
    const files = sourceFiles(join(REPO, 'src', 'domain'));
    const offenders = files.filter((f) => /\bfetch\s*\(|XMLHttpRequest|WebSocket|expo-notifications|sendPush|Linking\.openURL/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders.map((f) => f.replace(REPO, '')), [], 'the domain layer has no way to perform an action');
    survives(s, 'FE-13');
  });
});

describe('FE-14 — autonomy: four modes, standing or one-time, revocable, and never inferred', () => {
  test('the most autonomy any covering authority allows is what is permitted; revoking takes it away at once', () => {
    const base = grantAuthority(real(), at(), { category: 'schedule_change', mode: 'prepare', persistent: true });
    let s = grantAuthority(base, at(), { category: 'schedule_change', mode: 'execute_authorized', persistent: false, maxConsequence: 'moderate' });
    const intent = { category: 'schedule_change', consequence: 'moderate', provider: null, amount: null };
    const now = new Date(MORNING).toISOString();
    assert.equal(permittedMode(s.authorities, intent, { categoryId: null, subjectMemberId: null }, now).mode, 'execute_authorized');
    s = proposeIntent(s, at(), { category: 'schedule_change', summaryCode: 'move_event' });
    s = approveUnderAuthority(s, at(), s.intents[0].id);
    assert.equal(s.decisions[0].basis, 'standing_authority');
    const used = new Set([s.authorities[1].id]);
    assert.equal(permittedMode(s.authorities, intent, { categoryId: null, subjectMemberId: null }, now, used).mode, 'prepare', 'a one-time permission, once spent, is gone');
    s = revokeAuthority(s, at(MORNING + 1000), s.authorities[0].id);
    assert.equal(permittedMode(s.authorities, intent, { categoryId: null, subjectMemberId: null }, new Date(MORNING + 5000).toISOString(), used).mode, 'suggest', 'and revoking the standing one leaves only "suggest"');
    assert.deepEqual([...AUTONOMY_MODES], ['suggest', 'prepare', 'ask_approval', 'execute_authorized']);
    survives(s, 'FE-14');
  });
});

describe('FE-15 — a consequence model that tells a reminder from a payment', () => {
  test('a $35 payment through a bank is a critical, irreversible, monetary intent — representable without a new table', () => {
    let s = proposeIntent(real(), at(), { category: 'financial_action', summaryCode: 'pay_trip_fee', provider: 'bank-x', amount: parseMoney('35', 'USD', 'outflow') });
    const payment = s.intents[0];
    assert.deepEqual([payment.consequence, payment.reversibility, payment.amount.amountMinor, payment.provider], ['critical', 'irreversible', 3500, 'bank-x']);
    assert.equal(proposeIntent(real(), at(), { category: 'financial_action', summaryCode: 'pay' }).intents.length, 1, 'the domain accepts it; the CLOUD refuses one with no amount (financial_amount_check)');
    for (const category of ACTION_CATEGORIES) assert.ok(CATEGORY_PROFILE[category], `every category has a consequence profile: ${category}`);
    const distinct = new Set(ACTION_CATEGORIES.map((c) => `${CATEGORY_PROFILE[c].consequence}/${CATEGORY_PROFILE[c].reversibility}`));
    assert.ok(distinct.size >= 5, 'a rule can tell the categories apart');
    assert.equal(atLeastAsSerious('low', 'financial_action'), 'critical', 'a proposal may be MORE serious than its category, never less');
    s = decideIntent(s, at(), payment.id, 'approved');
    survives(s, 'FE-15');
  });
});

describe('FE-16 — observe the outcome: what happened after, over time, without editing what came before', () => {
  test('a first attempt fails transiently, a retry succeeds, then delivery, acknowledgement and completion are each recorded', () => {
    let s = proposeIntent(real(), at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    s = decideIntent(s, at(), s.intents[0].id, 'approved');
    const decisionId = s.decisions[0].id;
    const intentId = s.intents[0].id;
    s = {
      ...s,
      executions: [
        execution({ id: 'exec-1', intentId, decisionId, attempt: 1, result: 'failed', errorClass: 'transient' }),
        execution({ id: 'exec-2', intentId, decisionId, attempt: 2, attemptedAt: '2026-09-16T14:20:00.000Z', createdAt: '2026-09-16T14:20:00.000Z' }),
      ],
      outcomes: [outcome(1, 'exec-2', 'delivered', '2026-09-16T14:21:00.000Z'), outcome(2, 'exec-2', 'acknowledged', '2026-09-17T09:00:00.000Z'), outcome(3, 'exec-2', 'completed', '2026-09-18T09:00:00.000Z')],
    };
    const life = intentLifecycle(s, intentId);
    assert.deepEqual([life.stage, life.executions.map((e) => e.result), life.outcomes.map((o) => o.kind)], ['succeeded', ['failed', 'succeeded'], ['delivered', 'acknowledged', 'completed']]);
    assert.ok(s.executions.every((e) => executionAuthorization(s, e).authorized), 'every attempt was covered by the approval');
    survives(s, 'FE-16');
  });
});

describe('FE-17 — smart notifications are DERIVED intents to get her attention, and deliver nothing', () => {
  test('attention items are typed and reasoned; no delivery channel, token or schedule exists in stored state', () => {
    let s = withTask(real(), { title: 'Pay the electric bill', dueDate: '2026-09-16' });
    s = proposeIntent(s, at(), { category: 'internal_reminder', summaryCode: 'nudge' });
    const items = attentionFor(s, MORNING);
    assert.ok(items.some((i) => i.reason === 'deadline') && items.some((i) => i.reason === 'approval_required'));
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), ['about', 'reason', 'urgency']);
      assert.ok(ATTENTION_REASONS.includes(item.reason));
    }
    const keys = new Set();
    const walk = (schema) => {
      const shape = schema?.shape ?? schema?.element?.shape ?? schema?.def?.innerType?.shape ?? schema?.def?.innerType?.element?.shape;
      if (!shape) return;
      for (const [key, child] of Object.entries(shape)) { keys.add(key); walk(child); walk(child?.def?.element); }
    };
    walk(AppStateSchema);
    assert.deepEqual([...keys].filter((k) => /pushToken|deviceToken|apns|fcm|notificationId|deliverAt|sendAt|webhook/i.test(k)), [], 'nothing that could deliver');
    survives(s, 'FE-17');
  });
});

describe('FE-18 — cross-domain reasoning: one question, every domain, per-fact provenance', () => {
  test('"what else does this touch?" is answered from typed relations across tasks, events, goals, people, artifacts and evidence', () => {
    const { state: s, form, trip } = richHousehold();
    const around = relatedTo(s, ref('task', form.id));
    assert.ok(around.requiredBy.some((r) => r.kind === 'event' && r.id === trip.id), 'the field trip waits on this form');
    assert.equal(around.responsibilities.length, 1, 'it is delegated');
    assert.ok(around.observations.length >= 3, 'and she has skipped it before');
    assert.equal(around.intents.length, 1);
    assert.ok(around.partOf.some((r) => r.kind === 'goal'), 'and it is a step of a goal');
    assert.ok(around.dependencies.every((d) => d.provenance && d.provenance.producer), 'every relation says who made it');
    const fee = relatedTo(s, ref('task', s.tasks[0].id));
    assert.equal(fee.artifact.kind, 'email');
    assert.equal(fee.externalReferences.length, 1, 'the fee is the email object she linked');
    assert.equal(fee.interpretations.length, 1);
    survives(s, 'FE-18');
  });
});
