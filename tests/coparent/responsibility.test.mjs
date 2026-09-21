import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decideIntent, proposeIntent } from '../../src/domain/authorization.ts';
import { archivePerson, delegate } from '../../src/domain/responsibility.ts';
import { addTask } from '../../src/domain/tasks.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { recordAnswer, recordCounterpart, recordStillNeedsMe, reassignCounterpart } from '../../src/features/coparent/mutations.ts';
import { availableResponsibilityActions, presentTransitionRow, responsibilityLines } from '../../src/features/coparent/present.ts';
import { DAY, JOSIE, NOW, TZ, answer, handoff, request, respOf, world } from '../fixtures/coparent/world.mjs';

const view = (w, ms = w.nowMs) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: ms });
const first = (w, ms) => view(w, ms).transitions[0];
const ctx = { today: DAY, zone: TZ };
const person = (personId) => ({ kind: 'person', personId });
const text = (t) => responsibilityLines(t.responsibility, ctx).join(' | ');

describe('Responsibility: assigned ≠ acknowledged ≠ accepted ≠ covered, and it is all "what you recorded"', () => {
  test('N: a recorded request is not an answer — unaccepted, not covered, and says nothing was sent', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const t = first(w);
    assert.equal(t.responsibility.stage, 'requested');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.equal(t.responsibility.evidence.sent, false);
    const lines = text(t);
    assert.match(lines, /You recorded a request to Alex on Wed, Sep 16\. No answer is recorded\./);
    assert.match(lines, /Her Keys has not contacted Alex\./);
    assert.doesNotMatch(lines, /\b(sent|delivered|accepted|covered)\b/i);
  });

  test('O: accepted is not covered unless she says it no longer needs her — and the choice is always explicit', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    answer(w, rid, 'accepted_needs_me');
    let t = first(w);
    assert.equal(t.responsibility.stage, 'accepted');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.match(text(t), /accepted this\. It still needs you\./);
    assert.doesNotMatch(text(t), /Covered/);

    // She then says it no longer needs her: that, and only that, makes it covered.
    w.run((s, c) => recordStillNeedsMe(s, c, rid, false));
    t = first(w);
    assert.equal(t.responsibility.coverage, 'covered');
    assert.match(text(t), /^Covered: you recorded that Alex accepted this and it no longer needs you\./);
  });

  test('P: covered only when the shared semantics support it (accepted ∧ no longer needs her ∧ person available)', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    for (const choice of ['acknowledged']) {
      answer(w, rid, choice);
      assert.notEqual(first(w).responsibility.coverage, 'covered', `${choice} alone is never covered`);
    }
    answer(w, rid, 'accepted_covered');
    assert.equal(first(w).responsibility.coverage, 'covered');
    assert.equal(w.state.responsibilities[0].stillNeedsMe, false);
  });

  test('declined and returned put it back with her, and it needs her', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    answer(w, rid, 'declined');
    let t = first(w);
    assert.equal(t.responsibility.stage, 'declined');
    assert.equal(t.section, 'needs_me');
    assert.deepEqual(t.needsMeReasons, ['back_with_you']);
    assert.match(text(t), /declined\. It's back with you\./);

    // She asks again (a declined responsibility is not live), then takes it back.
    request(w, { kind: 'event', id }, alex);
    const rid2 = w.state.responsibilities.at(-1).id;
    answer(w, rid2, 'returned');
    t = first(w);
    assert.equal(t.responsibility.stage, 'with_you');
    assert.equal(text(t), 'Back with you.');
    assert.equal(t.responsibility.holder, 'self');
  });

  test('Q: "you are responsible" comes only from her explicit answer or a hand-back — never from silence', () => {
    const w = world();
    const silent = handoff(w, { title: 'No answer given' });
    const marked = handoff(w, { title: 'Needs me', date: '2026-09-19', needsMe: true });
    const notNeeded = handoff(w, { title: 'Not me', date: '2026-09-20', needsMe: false });
    const v = view(w);
    const t = (id) => v.transitions.find((x) => x.id === id);
    assert.equal(t(silent).needsMe, null, 'no answer is unknown, not "handling it"');
    assert.ok(t(silent).unknowns.includes('needs_you_not_recorded'));
    assert.equal(t(marked).needsMe, true);
    assert.deepEqual(t(marked).needsMeReasons, ['marked_needs_you']);
    assert.equal(t(marked).section, 'needs_me');
    assert.equal(t(notNeeded).needsMe, false);
    assert.equal(t(notNeeded).section, 'none');
  });

  test('R: another adult is recorded but the item stays unresolved — it is WAITING, not covered', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { needsMe: true, counterpart: person(alex) });
    const t = first(w);
    assert.equal(t.section, 'waiting');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.equal(t.needsMe, true, 'the shared answer: it still needs her while nobody has accepted');
    assert.ok(view(w).waitingIds.includes(id));
  });

  test('assigned-with-no-request (an `owned` person row written elsewhere) is not worded as a request', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    const at = '2026-09-16T14:00:00.000Z';
    w.state = {
      ...w.state,
      responsibilities: [
        {
          id: 'resp-owned', about: { kind: 'event', id }, responsibleKind: 'person', responsiblePersonId: alex, responsibleChildId: null, state: 'owned',
          requestedAt: null, acknowledgedAt: null, respondedAt: null, completedAt: null, returnedAt: null, ackDueAt: null, stillNeedsMe: true,
          previousResponsibilityId: null, createdAt: at, updatedAt: at, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'personal',
        },
      ],
    };
    const t = first(w);
    assert.equal(t.responsibility.stage, 'assigned');
    assert.equal(t.responsibility.coverage, 'not_covered');
    assert.match(text(t), /Alex is recorded as responsible\. No request is recorded\./);
    assert.doesNotMatch(text(t), /You recorded a request/);
    assert.deepEqual(availableResponsibilityActions(t.responsibility), ['completed', 'reassign', 'returned']);
  });

  test('a recorded-complete responsibility is completion evidence for that record only, in her words', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    answer(w, w.state.responsibilities[0].id, 'completed');
    const t = first(w);
    assert.equal(t.responsibility.stage, 'completed');
    assert.equal(t.responsibility.coverage, 'completed');
    assert.equal(text(t), "You recorded Alex's part as complete.");
    assert.doesNotMatch(text(t), /complied|compliance|court|required|order/i, 'operational completion is never legal compliance');
    assert.deepEqual(availableResponsibilityActions(t.responsibility), []);
  });

  test('Z/AA: an accepted, covered counterpart who is later archived is NEEDS REVIEW — never covered, never reassigned to her', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    answer(w, rid, 'accepted_covered');
    assert.equal(first(w).responsibility.coverage, 'covered');

    w.apply((s, c) => archivePerson(s, c, alex));
    const t = first(w);
    assert.equal(t.responsibility.coverage, 'needs_review', 'the positive claim must not survive the person being unavailable');
    assert.equal(t.section, 'needs_review');
    assert.ok(t.review.includes('counterpart_unavailable'));
    assert.deepEqual(availableResponsibilityActions(t.responsibility), ['reassign', 'returned']);
    const lines = text(t);
    assert.match(lines, /no longer available in Her Keys/);
    assert.doesNotMatch(lines, /Covered|accepted this and it no longer needs you/);
    // Nothing quietly became hers.
    assert.equal(w.state.responsibilities.length, 1);
    assert.equal(w.state.responsibilities[0].responsibleKind, 'person');
    assert.equal(w.state.responsibilities[0].state, 'accepted');
    assert.equal(presentTransitionRow(t, ctx).tags.some((tag) => tag.label === 'Covered'), false);
  });

  test('a positive recording is refused for an unavailable person; taking it back or choosing someone else is allowed', () => {
    const w = world();
    const alex = w.person('Alex');
    const jordan = w.person('Jordan');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    w.apply((s, c) => archivePerson(s, c, alex));

    for (const choice of ['acknowledged', 'accepted_covered', 'accepted_needs_me']) {
      const r = recordAnswer(w.state, w.at(), rid, choice);
      assert.equal(r.outcome, 'counterpart_unavailable', choice);
      assert.equal(r.state, w.state);
    }
    const s = recordStillNeedsMe(w.state, w.at(), rid, false);
    assert.equal(s.outcome, 'counterpart_unavailable');

    // Reassign to somebody available: the old one is closed as returned and named by its successor.
    w.run((st, c) => reassignCounterpart(st, c, rid, person(jordan)));
    const t = first(w);
    assert.equal(t.responsibility.counterpart.personId, jordan);
    assert.equal(t.responsibility.stage, 'requested');
    const old = w.state.responsibilities.find((r) => r.id === rid);
    assert.equal(old.state, 'returned');
    assert.equal(w.state.responsibilities.find((r) => r.previousResponsibilityId === rid).responsiblePersonId, jordan);
  });

  test('archived person while the request is still open is also NEEDS REVIEW (not "waiting")', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: person(alex) });
    w.apply((s, c) => archivePerson(s, c, alex));
    const t = first(w);
    assert.equal(t.section, 'needs_review');
    assert.equal(view(w).waitingIds.includes(id), false);
  });

  test('available actions match the domain rules for every stage (no control that would be refused, none for an unavailable person)', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    assert.deepEqual(availableResponsibilityActions(first(w).responsibility), ['record_asked']);
    request(w, { kind: 'event', id }, alex);
    const rid = w.state.responsibilities[0].id;
    assert.deepEqual(availableResponsibilityActions(first(w).responsibility), ['acknowledged', 'accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'reassign', 'returned']);
    answer(w, rid, 'acknowledged');
    assert.deepEqual(availableResponsibilityActions(first(w).responsibility), ['accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'reassign', 'returned']);
    answer(w, rid, 'accepted_needs_me');
    assert.deepEqual(availableResponsibilityActions(first(w).responsibility), ['completed', 'no_longer_needs_me', 'reassign', 'returned']);
    w.run((s, c) => recordStillNeedsMe(s, c, rid, false));
    assert.deepEqual(availableResponsibilityActions(first(w).responsibility), ['completed', 'still_needs_me', 'reassign', 'returned']);

    // Every offered action, applied to a fresh copy of that state, is accepted by the mutation layer (nothing dead).
    const acceptedNow = w.state;
    for (const action of ['completed', 'still_needs_me', 'returned']) {
      const r =
        action === 'still_needs_me' ? recordStillNeedsMe(acceptedNow, w.at(), rid, true) : recordAnswer(acceptedNow, w.at(), rid, action);
      assert.equal(r.outcome, 'saved', action);
    }
  });

  test('one live responsibility per record: a second request is refused, and "reassign" is the way to change who', () => {
    const w = world();
    const alex = w.person('Alex');
    const jordan = w.person('Jordan');
    const id = handoff(w);
    request(w, { kind: 'event', id }, alex);
    const again = recordCounterpart(w.state, w.at(), { kind: 'event', id }, person(jordan));
    assert.equal(again.outcome, 'already_recorded');
    assert.equal(again.state, w.state);
    assert.equal(respOf(w.state, 'event', id).length, 1);
  });

  test('answer overdue is the shared clock-derived fact, worded without judgement', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    // A request made elsewhere (another feature) with an answer time she set.
    w.apply((s, c) => delegate(s, c, { about: { kind: 'event', id }, to: { kind: 'person', id: alex }, ackWithinMinutes: 60 }), NOW);
    assert.equal(first(w, NOW + 30 * 60_000).responsibility.answerOverdue, false);
    const late = first(w, NOW + 3 * 3_600_000);
    assert.equal(late.responsibility.answerOverdue, true);
    assert.equal(late.section, 'needs_me');
    assert.deepEqual(late.needsMeReasons, ['answer_overdue']);
    const words = JSON.stringify(presentTransitionRow(late, ctx));
    assert.doesNotMatch(words, /ignored|late again|failed|refused|didn't respond|uncooperative/i);
  });

  test('feature 07 acts only on co-parenting records', () => {
    const w = world();
    const alex = w.person('Alex');
    const kids = w.state.categories.find((c) => c.systemRole === 'kids').id;
    w.apply((s, c) => addTask(s, c, { title: 'Sign the form', categoryId: kids, scope: 'household' }));
    const task = w.state.tasks[0];
    w.apply((s, c) => delegate(s, c, { about: { kind: 'task', id: task.id }, to: { kind: 'person', id: alex } }));
    const rid = w.state.responsibilities[0].id;
    assert.equal(recordAnswer(w.state, w.at(), rid, 'acknowledged').outcome, 'not_a_coparent_record');
    assert.equal(recordCounterpart(w.state, w.at(), { kind: 'task', id: task.id }, person(alex)).outcome, 'not_a_coparent_record');
  });

  test('request evidence: "sent" and "delivered" appear ONLY from real execution rows, never from a recorded request', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: person(alex) });
    const rid = w.state.responsibilities[0].id;
    assert.equal(first(w).responsibility.evidence.sent, false);
    assert.doesNotMatch(text(first(w)), /sent|delivered/i);

    // A request intent about the responsibility is proposed and approved — still nothing sent.
    w.apply((s, c) => proposeIntent(s, c, { category: 'delegation_request', summaryCode: 'ask_for_pickup', about: { kind: 'responsibility', id: rid } }));
    const intent = w.state.intents[0];
    w.apply((s, c) => decideIntent(s, c, intent.id, 'approved'));
    assert.equal(first(w).responsibility.evidence.sent, false, 'an approved intent is not an executed one');

    // The trusted server boundary writes an execution and an outcome; the device only pulls them.
    const at = '2026-09-16T15:00:00.000Z';
    const auto = { producer: 'automation', artifactId: null, confidence: null };
    w.state = {
      ...w.state,
      executions: [{ id: 'exec-1', intentId: intent.id, decisionId: w.state.decisions[0].id, authorityId: null, attempt: 1, attemptedAt: at, provider: null, externalActionId: null, externalReferenceId: null, result: 'succeeded', errorClass: 'none', reversibility: 'reversible', compensationCode: null, compensatesExecutionId: null, createdAt: at, provenance: auto, scope: 'personal' }],
    };
    let t = first(w);
    assert.equal(t.responsibility.evidence.sent, true);
    assert.equal(t.responsibility.evidence.delivered, false);
    assert.match(text(t), /Her Keys sent the request\./);
    assert.doesNotMatch(text(t), /Delivery was reported/);
    assert.doesNotMatch(text(t), /Her Keys has not contacted/);

    w.state = { ...w.state, outcomes: [{ id: 'outcome-1', executionId: 'exec-1', kind: 'delivered', observedAt: at, createdAt: at, provenance: auto, scope: 'personal' }] };
    t = first(w);
    assert.equal(t.responsibility.evidence.delivered, true);
    assert.match(text(t), /Delivery was reported\./);
  });

  test('an outcome with no succeeded execution is never "delivered"', () => {
    const w = world();
    const alex = w.person('Alex');
    handoff(w, { counterpart: person(alex) });
    const rid = w.state.responsibilities[0].id;
    w.apply((s, c) => proposeIntent(s, c, { category: 'delegation_request', summaryCode: 'ask_for_pickup', about: { kind: 'responsibility', id: rid } }));
    const intent = w.state.intents[0];
    w.apply((s, c) => decideIntent(s, c, intent.id, 'approved'));
    const at = '2026-09-16T15:00:00.000Z';
    const auto = { producer: 'automation', artifactId: null, confidence: null };
    w.state = {
      ...w.state,
      executions: [{ id: 'exec-f', intentId: intent.id, decisionId: w.state.decisions[0].id, authorityId: null, attempt: 1, attemptedAt: at, provider: null, externalActionId: null, externalReferenceId: null, result: 'failed', errorClass: 'transient', reversibility: 'reversible', compensationCode: null, compensatesExecutionId: null, createdAt: at, provenance: auto, scope: 'personal' }],
      outcomes: [{ id: 'outcome-f', executionId: 'exec-f', kind: 'delivered', observedAt: at, createdAt: at, provenance: auto, scope: 'personal' }],
    };
    const evidence = first(w).responsibility.evidence;
    assert.deepEqual(evidence, { sent: false, delivered: false });
  });

  test('JOSIE fixture is intact (guards the fixture itself)', () => {
    assert.equal(JOSIE, 'child-josie');
  });
});
