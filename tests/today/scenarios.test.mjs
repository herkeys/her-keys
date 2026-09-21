/**
 * TODAY — required scenarios A, B, C, D, E (prompt §34) at the projection layer.
 *
 * Scenario prose is not coverage. Every scenario here builds a REAL household through the domain's
 * own operations, projects it with `buildTodayView`, and asserts sections PRESENT, sections ABSENT,
 * ordering, target identity, evidence, confidence treatment, responsibility state, primary/secondary
 * placement and the actions available — and the ones deliberately not available.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addPerson, accept, acknowledge, decline, delegate, returnToSelf } from '../../src/domain/responsibility.ts';
import { computeDailyLoad } from '../../src/features/daily-load/computeDailyLoad.ts';
import { assessDailyLoadIssues } from '../../src/domain/dailyLoadIssues.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { describeDayState } from '../../src/features/today/dayState.ts';
import { DAY, at, eventNamed, ev, facet, household, mkCtx, nyMs, taskNamed, tk, valid, view, withMove } from './fixtures.mjs';

const keys = (v, level) => v.composition.filter((c) => c.level === level).map((c) => c.key);

const meal = () => ({
  id: 'meal-a', date: DAY, title: 'Sheet-pan chicken', categoryId: 'cat-meals', prepMinutes: 25, energyDemand: 'low',
  provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household',
});

describe('Scenario A — an ordinary day', () => {
  // school drop-off, a work meeting, a flexible errand, a second flexible task, a meal, an afternoon pickup
  const build = () => {
    let s = household();
    s = ev(s, { title: 'School drop-off', from: [8, 15], to: [8, 45] });
    s = ev(s, { title: 'Work meeting', from: [11], to: [12], category: 'cat-work' });
    s = ev(s, { title: 'Pickup', from: [15, 15], to: [15, 45] });
    s = tk(s, { title: 'Return library books', minutes: 15 });
    s = tk(s, { title: 'Order new sneakers', minutes: 20 });
    s = { ...s, meals: [meal()] };
    return withMove(valid(s));
  };
  const state = build();
  const v = view(state, nyMs(8));

  test('is ready, addressed to her, on the household’s logical day', () => {
    assert.equal(v.availability, 'ready');
    assert.equal(v.greeting, 'Maren');
    assert.deepEqual([v.day.date, v.day.label], [DAY, 'Wednesday, Sep 16']);
  });

  test('is calm: no decision, no attention, no manufactured warning', () => {
    assert.equal(v.decision, null);
    assert.equal(v.attention, null);
    assert.equal(v.upcoming, null);
    assert.equal(v.handled, null);
    assert.equal(v.waiting, null);
    assert.equal(v.sparse, null);
    assert.notEqual(v.load?.level, 'tight');
    assert.notEqual(v.load?.level, 'full');
    assert.equal(v.headline, 'Your day fits. Next up: School drop-off at 8:15 AM.');
  });

  test('first level is concise: matters then One Move; everything else is secondary', () => {
    assert.deepEqual(keys(v, 'primary'), ['matters', 'oneMove']);
    assert.deepEqual(keys(v, 'secondary'), ['canWait', 'everything', 'alsoChecked']);
  });

  test('matters names the next commitment first, then the fixed ones in time order', () => {
    assert.deepEqual(v.matters.anchors.map((a) => [a.title, a.reason, a.isNext]), [
      ['School drop-off', 'next_commitment', true],
      ['Work meeting', 'fixed_commitment', false],
      ['Pickup', 'fixed_commitment', false],
    ]);
    assert.deepEqual(v.matters.anchors.map((a) => a.timeLabel), ['8:15 AM', '11:00 AM', '3:15 PM']);
  });

  test('One Move is the smallest task on the day, with a route and a truthful completion effect', () => {
    assert.equal(v.oneMove.status, 'selected');
    assert.equal(v.oneMove.action, 'Return library books');
    assert.equal(v.oneMove.completion, 'completes_task');
    assert.deepEqual(v.oneMove.open, { pathname: '/task-editor', params: { taskId: taskNamed(state, 'Return library books').id } });
  });

  test('supporting detail is secondary: the other flexible task can wait, the One Move target is not listed as waiting', () => {
    assert.deepEqual(v.canWait.items.map((i) => i.title), ['Order new sneakers']);
  });
});

describe('Scenario B — an overloaded day', () => {
  // work ends near practice, a task sits in the only gap, and an obligation is overdue
  const build = () => {
    let s = household();
    s = ev(s, { title: 'Work call', from: [15], to: [16, 30], category: 'cat-work' });
    s = ev(s, { title: 'Soccer practice', from: [17], to: [18, 30] });
    s = tk(s, { title: 'Prep dinner', minutes: 20, plan: { kind: 'timed', startsAt: at(16, 30) }, category: 'cat-meals' });
    s = tk(s, { title: 'Pay school lunch account', minutes: 30, due: '2026-09-14', plan: { kind: 'unplanned' }, category: 'cat-money' });
    return withMove(valid(s));
  };
  const state = build();
  const v = view(state, nyMs(14));

  test('recognizes the real constraint: a live, undecided timing conflict, in Daily Load’s own classification', () => {
    const day = projectStateDay(state, DAY);
    const issues = assessDailyLoadIssues(day.events, day.tasks, computeDailyLoad(day.events, day.tasks));
    assert.equal(issues.tier, 'overloaded');
    assert.deepEqual([v.decision.kind, v.decision.state, v.decision.needsDecision, v.decision.tier], ['transition_conflict', 'undecided', true, 'overloaded']);
    assert.equal(v.load.level, 'full');
  });

  test('says what the day is, in the existing verdict sentence — not just "busy"', () => {
    const day = projectStateDay(state, DAY);
    const assessment = computeDailyLoad(day.events, day.tasks);
    const issues = assessDailyLoadIssues(day.events, day.tasks, assessment);
    assert.equal(v.headline, describeDayState(assessment, 'pending', issues));
    assert.equal(v.headline, 'Your day works — but one window is too tight.');
  });

  test('surfaces the obligation that is actually overdue, specifically', () => {
    assert.equal(v.attention.rows.length, 1);
    const [row] = v.attention.rows;
    assert.deepEqual([row.reason, row.urgency], ['deadline', 'now']);
    assert.equal(row.statement, '“Pay school lunch account” is 2 days overdue.');
    assert.deepEqual(row.actions.map((a) => a.kind), ['open']);
  });

  test('adds no work to a full day: the One Move is deliberately withheld, and nothing else fills the gap', () => {
    assert.equal(v.oneMove.status, 'withheld');
    assert.equal(v.oneMove.targetId, null);
    assert.equal(v.oneMove.why, null);
  });

  test('first level: the decision, what needs her, and the withheld move — three blocks, matters stepped aside', () => {
    assert.deepEqual(keys(v, 'primary'), ['decision', 'attention', 'oneMove']);
    assert.equal(v.matters, null, 'the two events are already named by the decision');
  });
});

describe('Scenario C — delegation risk', () => {
  // pickup handed to Grandma June, no answer, and the user has a fixed dentist appointment across it
  const setup = () => {
    let s = household();
    s = ev(s, { title: 'School pickup', from: [15, 30], to: [16] });
    s = ev(s, { title: 'Dentist', from: [15, 45], to: [16, 45], category: 'cat-wellbeing' });
    s = addPerson(s, mkCtx(nyMs(9)), { displayName: 'Grandma June', relationship: 'grandparent' });
    const about = { kind: 'event', id: eventNamed(s, 'School pickup').id };
    s = delegate(s, mkCtx(nyMs(12)), { about, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 30 });
    return valid(s);
  };
  const state = setup();
  const requested = () => state.responsibilities[0];

  test('an unanswered request past its deadline stays visible, most urgent, and is NOT treated as covered', () => {
    const v = view(state, nyMs(14));
    const [row] = v.attention.rows;
    assert.deepEqual([row.reason, row.urgency, row.needsMe], ['unacknowledged_delegation', 'now', true]);
    assert.deepEqual([row.responsibility.state, row.responsibility.holder], ['requested', 'Grandma June']);
    assert.equal(row.statement, 'Grandma June hasn’t answered your request about “School pickup”. An answer was due by 12:30 PM.');
    assert.equal(v.waiting, null, 'an unanswered request is not "waiting on someone" — it needs her');
    assert.doesNotMatch(row.statement, /covered|handled|taken care|done|sorted/i);
  });

  test('the risk is specific: the fixed commitment it collides with is the day’s undecided decision', () => {
    const v = view(state, nyMs(14));
    assert.deepEqual([v.decision.kind, v.decision.state], ['overlap', 'undecided']);
  });

  test('she can take it back (an existing domain mutation); the holder’s answers are not hers to record', () => {
    const [row] = view(state, nyMs(14)).attention.rows;
    assert.deepEqual(row.actions.map((a) => a.kind), ['take_back', 'open']);
    const back = returnToSelf(state, mkCtx(nyMs(14)), row.actions[0].responsibilityId);
    const after = view(back, nyMs(14)).attention.rows[0];
    assert.deepEqual([after.reason, after.responsibility.state], ['returned', 'returned']);
    assert.equal(after.statement, '“School pickup” is back with you.');
  });

  test('acknowledged is not accepted, and neither is done: each is its own truthful state', () => {
    const acked = acknowledge(state, mkCtx(nyMs(13)), requested().id);
    const a = view(acked, nyMs(14)).attention.rows[0];
    assert.deepEqual([a.reason, a.responsibility.state], ['delegated_needs_you', 'acknowledged']);
    assert.equal(a.statement, 'Grandma June has seen “School pickup” but hasn’t said yes yet.');

    const accepted = accept(acked, mkCtx(nyMs(13, 30)), requested().id);
    const v = view(accepted, nyMs(14));
    assert.equal(v.attention?.rows.some((r) => r.responsibility) ?? false, false, 'accepted, and she has not said it still needs her, so it no longer competes for attention');
    const [waiting] = v.waiting.rows;
    assert.deepEqual([waiting.kind, waiting.responsibilityState], ['delegated', 'accepted']);
    assert.equal(waiting.statement, 'Grandma June agreed to take “School pickup”.');
    assert.equal(waiting.changedToday, 'Accepted today at 1:30 PM.');
    assert.doesNotMatch(waiting.statement, /covered|handled|taken care|done|sorted/i);
  });

  test('a decline hands it back to her, plainly', () => {
    const declined = decline(state, mkCtx(nyMs(13)), requested().id);
    const row = view(declined, nyMs(14)).attention.rows[0];
    assert.deepEqual([row.reason, row.needsMe], ['declined', true]);
    assert.equal(row.statement, 'Grandma June said no to “School pickup”. It’s yours again.');
  });
});

describe('Scenario D — a nearly empty day', () => {
  const state = withMove(valid(tk(household(), { title: 'Renew library card', minutes: 15 })));
  const v = view(state, nyMs(9));

  test('is simple: one item dominates, and there are no empty intelligence modules', () => {
    assert.deepEqual(keys(v, 'primary'), ['oneMove']);
    assert.equal(v.decision, null);
    assert.equal(v.attention, null);
    assert.equal(v.matters, null);
    assert.equal(v.canWait, null);
    assert.equal(v.upcoming, null);
    assert.equal(v.handled, null);
    assert.equal(v.waiting, null);
    assert.equal(v.sparse, null, 'one task is not "light"');
  });

  test('makes no capacity or risk claim it cannot support', () => {
    assert.equal(v.load, null, 'no commitments to measure, so no meter and no "Open — plenty of room"');
    assert.equal(v.capacityNote, null);
    assert.equal(v.headline, 'One task is on your list today.');
  });

  test('the one item is the One Move', () => {
    assert.equal(v.oneMove.action, 'Renew library card');
  });
});

describe('Scenario E — uncertain inference', () => {
  const inferred = (confidence) => ({ producer: 'ai-inference', artifactId: null, confidence });
  const imported = (confidence) => ({ producer: 'import-sync', artifactId: null, confidence });
  const legacy = { producer: 'legacy-unknown', artifactId: null, confidence: null };

  test('a `possible` inference is shown as Her Keys’ claim, never as something she said', () => {
    let s = household();
    s = tk(s, { title: 'Send RSVP for the field trip', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred('possible') });
    const v = view(withMove(valid(s)), nyMs(9));
    const [row] = v.attention.rows;
    assert.deepEqual(row.source, { producer: 'ai-inference', confidence: 'possible', uncertain: true, userStated: false });
    assert.deepEqual(v.oneMove.source, row.source, 'the One Move points at the same uncertain row');
  });

  test('its correction treatment is edit-only: there is no confirm and no reject, because no such mutation exists (MP-01)', () => {
    let s = household();
    s = tk(s, { title: 'Send RSVP for the field trip', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred('possible') });
    const v = view(withMove(valid(s)), nyMs(9));
    assert.deepEqual(v.attention.rows[0].actions.map((a) => a.kind), ['open']);
    assert.equal(v.attention.rows[0].actions[0].route.pathname, '/task-editor');
  });

  test('every producer keeps its own truth: stated, inferred, external, confirmed, legacy, demo', () => {
    let s = household();
    s = ev(s, { title: 'Dentist', from: [10], to: [11], provenance: imported('likely') });
    s = tk(s, { title: 'Stated task', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
    s = tk(s, { title: 'Confirmed by her', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred('established') });
    s = tk(s, { title: 'Legacy row', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: legacy });
    const v = view(valid(s), nyMs(9));

    const bySource = Object.fromEntries(v.attention.rows.map((r) => [r.title, r.source]));
    assert.deepEqual(bySource['Stated task'], { producer: 'user-action', confidence: null, uncertain: false, userStated: true });
    assert.deepEqual(bySource['Confirmed by her'], { producer: 'ai-inference', confidence: 'established', uncertain: false, userStated: false }, 'confirmed is not the same as stated');
    assert.deepEqual(bySource['Legacy row'], { producer: 'legacy-unknown', confidence: null, uncertain: false, userStated: false }, 'unknown is not user-stated');
    assert.deepEqual(v.matters.anchors.find((a) => a.title === 'Dentist').source, { producer: 'import-sync', confidence: 'likely', uncertain: true, userStated: false });
  });

  test('a stated fact carries no badge at first glance', () => {
    let s = household();
    s = ev(s, { title: 'Dentist', from: [10], to: [11] });
    assert.equal(view(valid(s), nyMs(9)).matters.anchors[0].source, null);
  });

  test('viewing never upgrades confidence: the projection is read-only over state', () => {
    let s = household();
    s = tk(s, { title: 'Send RSVP', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred('possible') });
    const before = JSON.stringify(s);
    view(s, nyMs(9));
    assert.equal(JSON.stringify(s), before);
    assert.equal(taskNamed(s, 'Send RSVP').provenance.confidence, 'possible');
  });
});
