import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decideIntent, proposeIntent } from '../../src/domain/authorization.ts';
import { archivePerson } from '../../src/domain/responsibility.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { NEGATED_BOUNDARY_SENTENCES } from '../../src/features/coparent/copy.ts';
import {
  completeFollowUp,
  createMoneyFollowUp,
  editMoneyFollowUp,
  followUpEditorSeed,
  removeFollowUp,
  suggestedCurrency,
} from '../../src/features/coparent/mutations.ts';
import { buildCoParentLogisticsView, buildMoneyFollowUpDetail } from '../../src/features/coparent/projection.ts';
import { presentFollowUp, presentHub } from '../../src/features/coparent/present.ts';
import { DAY, FOLLOW_UP, JOSIE, NOW, TZ, answer, finishFollowUp, followUp, request, world } from '../fixtures/coparent/world.mjs';

const view = (w, ms = w.nowMs) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: ms });
const ctx = { today: DAY, zone: TZ };
const present = (w, taskId, ms = w.nowMs) => presentFollowUp(buildMoneyFollowUpDetail(w.state, w.state.household.id, taskId, { nowMs: ms }).followUp, ctx);
const stripNegated = (text) => NEGATED_BOUNDARY_SENTENCES.reduce((acc, sentence) => acc.split(sentence).join(''), text);
const person = (personId) => ({ kind: 'person', personId });

describe('Money follow-up: a task she intends to do — never a debt, a request that was sent, or a payment', () => {
  test('AB: a child-related follow-up is a canonical amount-bearing task with a follow-up date and (optionally) a recorded counterpart', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    const task = w.state.tasks.find((t) => t.id === id);
    assert.equal(task.title, 'Soccer registration');
    assert.equal(task.subjectMemberId, JOSIE);
    assert.equal(task.dueDate, '2026-09-25');
    assert.deepEqual(task.value, { amountMinor: 8000, currency: 'USD', direction: 'inflow' });
    assert.equal(task.scope, 'coparent-shared');
    assert.equal(task.status, 'open');
    assert.equal(w.state.categories.find((c) => c.id === task.categoryId).systemRole, 'coparenting');
    assert.equal(w.state.responsibilities[0].about.id, id);
    assert.equal(w.state.responsibilities[0].responsiblePersonId, alex);

    const p = present(w, id);
    assert.equal(p.amountLine, 'Amount you entered: 80.00 USD');
    assert.equal(p.dateLine, 'Follow up by Fri, Sep 25');
    assert.equal(p.statusLine, 'Follow-up open');
    assert.equal(p.childLine, 'About Josie');
    assert.ok(p.lines.some((l) => l.startsWith('You recorded a request to Alex')));
    assert.equal(view(w).moneyFollowUps.length, 1);
  });

  test('AD: an amount she entered is never an agreed amount, an owed amount or a direction word', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    const p = present(w, id);
    const words = stripNegated(JSON.stringify([p, presentHub(view(w), ctx)]));
    assert.equal(p.amountNote, "An amount you entered isn't an agreed amount.");
    assert.doesNotMatch(words, /agreed|owe|owing|debt|settled|paid|payment|received|reimburs.*(due|owed)|inflow|outflow/i);
  });

  test('AC: completing the follow-up is "marked done" — it never becomes payment received', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    finishFollowUp(w, id);
    const task = w.state.tasks.find((t) => t.id === id);
    assert.equal(task.status, 'completed');
    const detail = buildMoneyFollowUpDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    assert.equal(detail.followUp.standing, 'done');
    assert.equal(detail.followUp.paymentEvidence, 'none');
    const p = presentFollowUp(detail.followUp, ctx);
    assert.equal(p.statusLine, 'Marked done. Her Keys has no record of a payment.');
    assert.doesNotMatch(stripNegated(JSON.stringify(p)), /paid|received|settled|payment|owed|owes/i);
    // It appears under "Recently completed" as work done, with the same sentence — and NOT under "Money to follow up".
    const hub = presentHub(view(w), ctx);
    assert.equal(hub.money.length, 0);
    assert.match(hub.recentlyCompleted[0].line, /^Marked done\. Her Keys has no record of a payment\. \(/);
  });

  test('a counterpart who "accepted" is still not payment: the responsibility ladder says nothing about money', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    answer(w, w.state.responsibilities[0].id, 'accepted_covered');
    const p = present(w, id);
    assert.ok(p.lines.some((l) => l.startsWith('Covered: you recorded that Alex accepted this')));
    assert.equal(buildMoneyFollowUpDetail(w.state, w.state.household.id, id, { nowMs: NOW }).followUp.paymentEvidence, 'none');
    assert.doesNotMatch(stripNegated(JSON.stringify(p)), /\b(paid|received|settled|owes?|owed)\b/i);
  });

  test('payment is shown ONLY from a real `paid` outcome under a succeeded financial-action execution about that task', () => {
    const w = world();
    const id = followUp(w);
    const at = '2026-09-16T16:00:00.000Z';
    const auto = { producer: 'automation', artifactId: null, confidence: null };
    const execution = (intentId, decisionId, result) => ({ id: 'exec-p', intentId, decisionId, authorityId: null, attempt: 1, attemptedAt: at, provider: null, externalActionId: null, externalReferenceId: null, result, errorClass: result === 'succeeded' ? 'none' : 'transient', reversibility: 'reversible', compensationCode: null, compensatesExecutionId: null, createdAt: at, provenance: auto, scope: 'personal' });
    const outcome = { id: 'outcome-p', executionId: 'exec-p', kind: 'paid', observedAt: at, createdAt: at, provenance: auto, scope: 'personal' };

    // 1. An intent alone (even approved) is not evidence.
    w.apply((s, c) => proposeIntent(s, c, { category: 'financial_action', summaryCode: 'settle_share', about: { kind: 'task', id }, amount: { amountMinor: 8000, currency: 'USD', direction: 'outflow' } }));
    w.apply((s, c) => decideIntent(s, c, w.state.intents[0].id, 'approved'));
    assert.equal(present(w, id).lines.some((l) => /payment/i.test(l)), false);

    // 2. A `paid` outcome under a FAILED execution is not evidence.
    const intentId = w.state.intents[0].id;
    const decisionId = w.state.decisions[0].id;
    w.state = { ...w.state, executions: [execution(intentId, decisionId, 'failed')], outcomes: [outcome] };
    assert.equal(buildMoneyFollowUpDetail(w.state, w.state.household.id, id, { nowMs: NOW }).followUp.paymentEvidence, 'none');

    // 3. A succeeded execution with a `paid` outcome IS evidence — worded as a service's report, never as "settled".
    w.state = { ...w.state, executions: [execution(intentId, decisionId, 'succeeded')] };
    const detail = buildMoneyFollowUpDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    assert.equal(detail.followUp.paymentEvidence, 'service_reported_paid');
    const p = presentFollowUp(detail.followUp, ctx);
    assert.ok(p.lines.includes('A connected service reported a payment.'));
    assert.doesNotMatch(JSON.stringify(p), /settled|owed|owes|received/i);
  });

  test('a `paid` outcome under an intent of a DIFFERENT category, or about a different task, is not evidence', () => {
    const w = world();
    const id = followUp(w);
    const other = followUp(w, { title: 'Field trip fee', amountText: '12.50' });
    const at = '2026-09-16T16:00:00.000Z';
    const auto = { producer: 'automation', artifactId: null, confidence: null };
    w.apply((s, c) => proposeIntent(s, c, { category: 'internal_reminder', summaryCode: 'remind', about: { kind: 'task', id } }));
    w.apply((s, c) => proposeIntent(s, c, { category: 'financial_action', summaryCode: 'other', about: { kind: 'task', id: other }, amount: { amountMinor: 1250, currency: 'USD', direction: 'outflow' } }));
    w.apply((s, c) => decideIntent(s, c, w.state.intents[0].id, 'approved'));
    w.apply((s, c) => decideIntent(s, c, w.state.intents[1].id, 'approved'));
    w.state = {
      ...w.state,
      executions: w.state.intents.map((intent, i) => ({ id: `exec-${i}`, intentId: intent.id, decisionId: w.state.decisions[i].id, authorityId: null, attempt: 1, attemptedAt: at, provider: null, externalActionId: null, externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'reversible', compensationCode: null, compensatesExecutionId: null, createdAt: at, provenance: auto, scope: 'personal' })),
      outcomes: [0, 1].map((i) => ({ id: `outcome-${i}`, executionId: `exec-${i}`, kind: 'paid', observedAt: at, createdAt: at, provenance: auto, scope: 'personal' })),
    };
    const v = view(w);
    assert.equal(v.moneyFollowUps.find((f) => f.taskId === id).paymentEvidence, 'none', 'wrong category');
    assert.equal(v.moneyFollowUps.find((f) => f.taskId === other).paymentEvidence, 'service_reported_paid', 'the task the evidence is about');
  });

  test('amounts are exact integers of minor units — no float, no rounding, no guessing', () => {
    const w = world();
    const cases = [['19.99', 1999], ['80', 8000], ['0.05', 5], ['1234567.89', 123456789], ['  25.5 ', 2550]];
    for (const [text, minor] of cases) {
      const id = followUp(w, { title: `Cost ${text.trim()}`, amountText: text });
      assert.equal(w.state.tasks.find((t) => t.id === id).value.amountMinor, minor, text);
    }
    assert.equal(buildMoneyFollowUpDetail(w.state, w.state.household.id, w.state.tasks[0].id, { nowMs: NOW }).followUp.amount.decimal, '19.99');
    const jpy = followUp(w, { title: 'Yen cost', amountText: '800', currency: 'JPY' });
    assert.equal(w.state.tasks.find((t) => t.id === jpy).value.amountMinor, 800);
  });

  test('no amount is not $0, and nothing is invented: bad amounts, currencies and directions are refused with named outcomes', () => {
    const w = world();
    const attempt = (over) => createMoneyFollowUp(w.state, w.at(), { ...FOLLOW_UP, ...over }, { kind: 'none' });
    for (const amountText of ['', '0', '0.00', 'abc', '80,50', '80.555', '-5', '1e3']) {
      const r = attempt({ amountText });
      assert.equal(r.outcome, 'invalid_amount', JSON.stringify(amountText));
      assert.equal(r.state, w.state);
    }
    assert.equal(attempt({ amountText: '80.5', currency: 'JPY' }).outcome, 'invalid_amount', 'a currency with no minor unit refuses places, never rounds');
    assert.equal(attempt({ currency: '' }).outcome, 'invalid_currency');
    assert.equal(attempt({ currency: 'US' }).outcome, 'invalid_currency');
    assert.equal(attempt({ currency: 'usd' }).outcome, 'saved', 'a lower-case code is normalised, not guessed');
    assert.equal(attempt({ direction: null }).outcome, 'invalid_direction', 'direction is her explicit choice — never defaulted');
    assert.equal(attempt({ title: '  ' }).outcome, 'invalid_title');
    assert.equal(attempt({ childId: 'child-ghost' }).outcome, 'invalid_child');
    assert.equal(attempt({ followUpDate: '2026-13-01' }).outcome, 'invalid_date');
  });

  test('a follow-up may be about no particular child: no child recorded is shown as such and is not a review item', () => {
    const w = world();
    const id = followUp(w, { childId: null });
    const f = view(w).moneyFollowUps.find((x) => x.taskId === id);
    assert.equal(f.child.status, 'not_recorded');
    assert.deepEqual(f.review, []);
    assert.equal(present(w, id).childLine, 'No child recorded');
  });

  test('membership is the co-parenting category AND an amount: other categories and amountless tasks are not follow-ups', () => {
    const w = world();
    const money = w.state.categories.find((c) => c.systemRole === 'money').id;
    const cop = w.state.categories.find((c) => c.systemRole === 'coparenting').id;
    w.apply((s, c) => addTask(s, c, { title: 'Pay the trip fee', categoryId: money, scope: 'household', value: { amountMinor: 3500, currency: 'USD', direction: 'outflow' } }));
    w.apply((s, c) => addTask(s, c, { title: 'Call about the schedule', categoryId: cop, subjectMemberId: JOSIE, scope: 'coparent-shared' }));
    const v = view(w);
    assert.equal(v.moneyFollowUps.length, 0);
    assert.equal(v.preparation.flatMap((g) => g.items).length, 1, 'the amountless co-parenting task is a plain to-do, not money');
    assert.equal(buildMoneyFollowUpDetail(w.state, w.state.household.id, w.state.tasks[0].id, { nowMs: NOW }).status, 'not_a_follow_up');
  });

  test('editing keeps the counterpart and state, changes only what she edited, and a stale row is refused', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    const seed = followUpEditorSeed(w.state, id);
    assert.equal(seed.fields.amountText, '80.00');
    assert.equal(seed.fields.direction, 'inflow');
    const rid = w.state.responsibilities[0].id;

    w.run((s, c) => editMoneyFollowUp(s, c, { taskId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, amountText: '40', followUpDate: '2026-09-30' } }), { ms: NOW + 60_000 });
    const task = w.state.tasks.find((t) => t.id === id);
    assert.equal(task.value.amountMinor, 4000);
    assert.equal(task.dueDate, '2026-09-30');
    assert.equal(w.state.responsibilities[0].id, rid);
    assert.equal(w.state.responsibilities[0].state, 'requested', 'entering a new amount does not change what anyone answered');

    const stale = editMoneyFollowUp(w.state, w.at(NOW + 120_000), { taskId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Overwrite' } });
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.state, w.state);

    const fresh = followUpEditorSeed(w.state, id);
    assert.equal(editMoneyFollowUp(w.state, w.at(NOW + 180_000), { taskId: id, baseUpdatedAt: fresh.baseUpdatedAt, fields: fresh.fields }).outcome, 'unchanged');
  });

  test('a counterpart who is later archived makes the follow-up NEEDS REVIEW; nothing is reassigned', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: person(alex) });
    answer(w, w.state.responsibilities[0].id, 'accepted_covered');
    w.apply((s, c) => archivePerson(s, c, alex));
    const v = view(w);
    assert.deepEqual(v.moneyFollowUps[0].review, ['counterpart_unavailable']);
    assert.equal(v.moneyFollowUps[0].responsibility.coverage, 'needs_review');
    assert.ok(v.needsReviewTasks.some((t) => t.taskId === id));
    assert.doesNotMatch(JSON.stringify(present(w, id).lines), /Covered/);
    assert.equal(w.state.responsibilities.length, 1);
  });

  test('removing a follow-up is removal: it leaves the list and never appears as completed', () => {
    const w = world();
    const id = followUp(w);
    w.run((s, c) => removeFollowUp(s, c, id));
    const v = view(w);
    assert.equal(v.moneyFollowUps.length, 0);
    assert.equal(v.recentlyCompleted.length, 0);
    assert.equal(completeFollowUp(w.state, w.at(), id).outcome, 'not_open');
  });

  test('the suggested currency is only ever one she already used in her own household, or nothing', () => {
    const w = world();
    assert.equal(suggestedCurrency(w.state), null);
    followUp(w, { currency: 'EUR' });
    assert.equal(suggestedCurrency(w.state), 'EUR');
    followUp(w, { title: 'Second', currency: 'CAD' });
    assert.equal(suggestedCurrency(w.state), 'CAD');
  });

  test('a household with only a follow-up is not "empty", and the hub lists it under money, by date', () => {
    const w = world();
    followUp(w, { title: 'Later', followUpDate: '2026-10-05' });
    followUp(w, { title: 'Sooner', followUpDate: '2026-09-25' });
    followUp(w, { title: 'No date', followUpDate: '' });
    const v = view(w);
    assert.equal(v.isEmpty, false);
    assert.deepEqual(v.moneyFollowUps.map((f) => f.title), ['Sooner', 'Later', 'No date']);
    assert.equal(present(w, v.moneyFollowUps[2].taskId).dateLine, 'No follow-up date');
  });
});
