import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { detectCapacityPressure } from '../../src/domain/dailyLoadIssues.ts';
import { parseMoney } from '../../src/domain/foundation/money.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { dayCapacity, evaluateMove, metricsOf, proposalDigest, reviewDay } from '../../src/domain/premium/dailyLoadReview.ts';
import {
  FRIDAY, SATURDAY, THURSDAY, WEDNESDAY, dayPlan, emptyHousehold, event, nyInstant, overloadDay, task, timedPlan, validated, wednesdayOverload,
} from '../support/premiumDomain.mjs';

const review = (state, date = WEDNESDAY, options) => reviewDay(state, date, options);
const proposalFor = (r, taskId) => r.proposals.find((p) => p.taskId === taskId);
const notOffered = (r, id) => r.considered.find((c) => c.id === id)?.notOfferedBecause;

describe('Wednesday: the first complete review', () => {
  test('names the genuine pressure, the records responsible, and what each would change', () => {
    const r = review(wednesdayOverload());
    assert.equal(r.outlook, 'pressure_with_proposals');
    assert.equal(r.metrics.tier, 'overloaded');
    assert.equal(r.pressures.length, 1);
    const [pressure] = r.pressures;
    assert.equal(pressure.kind, 'transition_conflict');
    assert.equal(pressure.magnitude, 35, '45 minutes wanted, 10 left');
    assert.deepEqual(pressure.responsible.map((x) => x.id).sort(), ['evt-dentist', 'evt-pickup', 'task-library']);
    const errand = pressure.responsible.find((x) => x.id === 'task-library');
    assert.deepEqual([errand.kind, errand.minutes, errand.estimated], ['task', 20, false]);
  });

  test('proposes the errand, at the same clock time on Thursday, and shows BOTH days before and after', () => {
    const r = review(wednesdayOverload());
    const [proposal] = r.proposals;
    assert.equal(proposal.taskId, 'task-library');
    assert.equal(proposal.toDate, THURSDAY);
    assert.equal(proposal.timeKept, true);
    assert.deepEqual(proposal.to, { kind: 'timed', startsAt: nyInstant(14, 50, 17) });
    assert.deepEqual([proposal.improvement.tierBefore, proposal.improvement.tierAfter], ['overloaded', 'tight']);
    assert.deepEqual([proposal.improvement.bufferBefore, proposal.improvement.bufferAfter], [10, 30]);
    assert.deepEqual(proposal.improvement.eases, ['transition_conflict']);
    assert.equal(proposal.improvement.clearsOverload, true);
    assert.equal(proposal.destination.before.tier, 'open');
    assert.equal(proposal.destination.after.tier, 'open');
    assert.equal(proposal.rank, 1);
    assert.match(proposal.digest, /^[0-9a-f]{64}$/);
  });

  test('every number in a proposal is a RECOMPUTATION of the real day, never a formula\'s promise', () => {
    const state = wednesdayOverload();
    const [proposal] = review(state).proposals;
    const moved = { ...state, tasks: state.tasks.map((t) => (t.id === proposal.taskId ? { ...t, plan: proposal.to } : t)) };
    assert.deepEqual(proposal.source.before, metricsOf(state, WEDNESDAY));
    assert.deepEqual(proposal.source.after, metricsOf(moved, WEDNESDAY));
    assert.deepEqual(proposal.destination.before, metricsOf(state, THURSDAY));
    assert.deepEqual(proposal.destination.after, metricsOf(moved, THURSDAY));
  });

  test('discloses what it assumed: flexibility is a default, and she can see why the task was considered movable', () => {
    const [proposal] = review(wednesdayOverload()).proposals;
    assert.deepEqual(proposal.assumptions, ['flexible_by_default']);
    assert.equal(proposal.durationKnowledge, 'user-provided');
  });

  test('an estimated duration is named as an assumption and as an evidence gap', () => {
    const state = wednesdayOverload((s) => task(s, { id: 'task-estimated', minutes: undefined, durationSource: undefined, plan: timedPlan(14, 50) }));
    // A task added without a duration carries the planning default (15 min) and says so.
    const r = review(state);
    const estimated = r.pressures[0].responsible.find((x) => x.id === 'task-estimated');
    assert.equal(estimated.estimated, true);
    assert.equal(r.pressures[0].estimated, true);
    assert.ok(r.evidenceGaps.includes('durations_estimated'));
    assert.ok(proposalFor(r, 'task-estimated')?.assumptions.includes('duration_estimated'));
  });

  test('a clear day is reported as clear: no pressure, no proposals, nothing invented', () => {
    let s = emptyHousehold();
    s = event(s, { id: 'evt-a', start: [10, 0], end: [11, 0] });
    s = task(s, { id: 'task-a', minutes: 30, plan: dayPlan(WEDNESDAY) });
    const r = review(validated(s));
    assert.equal(r.outlook, 'clear');
    assert.deepEqual([r.pressures.length, r.proposals.length], [0, 0]);
  });

  test('pressure with nothing safe to move says so (it never offers an unsafe move to fill the screen)', () => {
    let s = emptyHousehold();
    s = event(s, { id: 'evt-a', start: [14, 0], end: [14, 45] });
    s = event(s, { id: 'evt-b', start: [15, 15], end: [16, 15] });
    s = task(s, { id: 'task-fixed', minutes: 20, plan: timedPlan(14, 50), commitment: 'fixed' });
    const r = review(validated(s));
    assert.equal(r.outlook, 'pressure_without_move');
    assert.equal(r.proposals.length, 0);
    assert.equal(notOffered(r, 'task-fixed'), 'fixed');
  });
});

describe('who may be offered, and why not', () => {
  const withTask = (patch, extra = {}) => wednesdayOverload((s) => task(s, { id: 'task-x', minutes: 20, plan: timedPlan(14, 52), patch, ...extra }));
  const offered = (r, id) => r.proposals.some((p) => p.taskId === id);

  test('a flexible, Her Keys-made, ordinary task IS eligible', () => {
    const r = review(withTask({}));
    assert.equal(notOffered(r, 'task-x'), null);
  });

  const cases = [
    ['fixed', { commitment: 'fixed' }],
    ['completed', { status: 'completed', completedAt: nyInstant(9, 0) }],
    ['archived', { status: 'archived' }],
    ['due today', { dueDate: WEDNESDAY }],
    ['overdue', { dueDate: '2026-09-14' }],
    ['imported', { provenance: { producer: 'import-sync', artifactId: null, confidence: 'likely' } }],
    ['automation-made', { provenance: { producer: 'automation', artifactId: null, confidence: null } }],
    ['system-derived (routine)', { provenance: { producer: 'system-derived', artifactId: null, confidence: null } }],
    ['high consequence', { consequence: 'high' }],
    ['critical consequence', { consequence: 'critical' }],
    ['a payment (money category)', { categoryId: 'cat-money' }],
    ['carries an amount', { value: parseMoney('35', 'USD', 'outflow') }],
    ['has a payment mechanism', { paymentMechanism: 'autopay' }],
    ['co-parenting', { categoryId: 'cat-coparenting' }],
  ];
  for (const [name, patch] of cases) {
    test(`NEVER offered when ${name}`, () => {
      const r = review(withTask(patch));
      assert.equal(offered(r, 'task-x'), false);
      assert.notEqual(notOffered(r, 'task-x'), null, 'and the audit says why');
    });
  }

  test('a child\'s obligation is context only', () => {
    const state = wednesdayOverload((s) => ({ ...task(s, { id: 'task-kid', minutes: 20, plan: timedPlan(14, 52), patch: { subjectMemberId: 'child-1' } }), children: [{ id: 'child-1', displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' }] }));
    const r = review(validated(state));
    assert.equal(notOffered(r, 'task-kid'), 'child_obligation');
    assert.equal(r.proposals.some((p) => p.taskId === 'task-kid'), false);
  });

  test('a moderate-consequence task is still eligible (only high and critical are protected)', () => {
    assert.equal(notOffered(review(withTask({ consequence: 'moderate' })), 'task-x'), null);
    assert.equal(notOffered(review(withTask({ consequence: 'low' })), 'task-x'), null);
  });

  test('events are never offered in v1: a flexible event is context, a fixed one is "fixed"', () => {
    const r = review(wednesdayOverload((s) => event(s, { id: 'evt-flex', start: [14, 5], end: [14, 30], commitment: 'flexible' })));
    assert.equal(notOffered(r, 'evt-flex'), 'event_not_offered');
    assert.equal(notOffered(r, 'evt-pickup'), 'fixed');
    assert.equal(r.proposals.some((p) => p.taskId === 'evt-flex'), false);
  });

  test('the audit lists every record the review considered, in a stable order', () => {
    const r = review(wednesdayOverload());
    assert.deepEqual(r.considered.map((c) => `${c.kind}:${c.id}`), ['event:evt-dentist', 'event:evt-pickup', 'task:task-library']);
  });
});

describe('destination days are EVALUATED, never assumed', () => {
  test('an overloaded Thursday is skipped; the move goes to the first day that can take it', () => {
    const r = review(wednesdayOverload((s) => overloadDay(s, 17)));
    const [proposal] = r.proposals;
    assert.equal(proposal.toDate, FRIDAY);
    assert.notEqual(proposal.toDate, THURSDAY);
  });

  test('if EVERY day in the horizon is overloaded, nothing is offered (one day\'s overload is never traded for another\'s)', () => {
    let s = wednesdayOverload();
    for (let day = 17; day <= 23; day += 1) s = overloadDay(s, day);
    const r = review(validated(s));
    assert.equal(r.outlook, 'pressure_without_move');
    assert.equal(r.proposals.length, 0);
  });

  test('a destination that would go over capacity is refused', () => {
    // Thursday already holds 16 hours of tasks: adding 20 minutes tips it into capacity pressure.
    let s = wednesdayOverload();
    for (let i = 0; i < 4; i += 1) s = task(s, { id: `task-heavy-${i}`, minutes: 240, plan: dayPlan(THURSDAY) });
    const r = review(validated(s));
    assert.notEqual(r.proposals[0]?.toDate, THURSDAY);
    assert.equal(evaluateMove(s, 'task-library', WEDNESDAY, THURSDAY), null);
  });

  test('prefers the destination that stays easiest, and tells her when the destination gets tighter', () => {
    // Thursday has a fixed event 1:30-2:40 pm; moving the errand (same clock time) would cram it, so it falls back to a plain day.
    let s = wednesdayOverload((x) => event(x, { id: 'evt-thu', start: [14, 30], end: [14, 40], day: 17 }));
    const r = review(validated(s));
    const [proposal] = r.proposals;
    assert.equal(proposal.timeKept, false, 'the 2:50 slot is not free on Thursday, so the errand keeps the day, not the time');
    assert.deepEqual(proposal.to, { kind: 'day', date: proposal.toDate });
    assert.ok(proposal.assumptions.includes('time_not_kept'));
  });

  test('a task\'s own windows are honoured: it is never moved past its due date, before it may start, or after it must finish', () => {
    const due = review(wednesdayOverload((s) => task(s, { id: 'task-due', minutes: 20, plan: timedPlan(14, 52), patch: { dueDate: THURSDAY } })));
    assert.ok(due.proposals.every((p) => p.taskId !== 'task-due' || p.toDate <= THURSDAY));
    const late = review(wednesdayOverload((s) => task(s, { id: 'task-late', minutes: 20, plan: timedPlan(14, 52), patch: { earliestStartAt: nyInstant(8, 0, 19) } })));
    assert.ok(late.proposals.every((p) => p.taskId !== 'task-late' || p.toDate >= SATURDAY));
    const early = review(wednesdayOverload((s) => task(s, { id: 'task-early', minutes: 20, plan: timedPlan(14, 52), patch: { latestFinishAt: nyInstant(20, 0, 17) } })));
    assert.ok(early.proposals.every((p) => p.taskId !== 'task-early' || p.toDate <= THURSDAY));
  });

  test('a task due TOMORROW can only go to tomorrow (or nowhere), and never earlier than today', () => {
    const r = review(wednesdayOverload((s) => task(s, { id: 'task-due', minutes: 20, plan: timedPlan(14, 52), patch: { dueDate: FRIDAY } })));
    for (const p of r.proposals.filter((x) => x.taskId === 'task-due')) assert.ok(p.toDate > WEDNESDAY && p.toDate <= FRIDAY);
  });

  test('moves go LATER only; nothing is ever pulled earlier or kept on the same day', () => {
    const r = review(wednesdayOverload());
    for (const p of r.proposals) assert.ok(p.toDate > WEDNESDAY);
  });
});

describe('capacity pressure', () => {
  const heavyWednesday = () => {
    let s = emptyHousehold();
    s = event(s, { id: 'evt-long', start: [6, 0], end: [20, 0] }); // 14 of the 16 capacity hours
    s = task(s, { id: 'task-big', minutes: 90, plan: dayPlan(WEDNESDAY) });
    s = task(s, { id: 'task-small', minutes: 60, plan: dayPlan(WEDNESDAY) });
    return validated(s);
  };

  test('is a ranked pressure and the biggest flexible task is the first thing offered', () => {
    const r = review(heavyWednesday());
    assert.equal(r.pressures[0].kind, 'capacity_pressure');
    assert.equal(r.metrics.capacityPressureMinutes, 30);
    assert.equal(r.proposals[0].taskId, 'task-big', 'moving the 90 minute task clears the 30 minute shortfall; the 60 minute one does too, but clears it with less disturbance? ranks by eased minutes');
    assert.ok(r.proposals[0].improvement.eases.includes('capacity_pressure'));
    assert.equal(r.proposals[0].improvement.capacityPressureAfter, 0);
  });

  test('lists several alternatives in a deterministic, explained order (at most three)', () => {
    const r = review(heavyWednesday());
    assert.ok(r.proposals.length >= 2 && r.proposals.length <= 3);
    assert.deepEqual(r.proposals.map((p) => p.rank), r.proposals.map((_, i) => i + 1));
    assert.deepEqual(review(heavyWednesday()), r, 'same input, identical review');
  });
});

describe('determinism, purity and honesty', () => {
  test('the review is reproducible and independent of the order records are stored in', () => {
    const state = wednesdayOverload((s) => task(s, { id: 'task-second', minutes: 20, plan: timedPlan(14, 52) }));
    const shuffled = { ...state, tasks: [...state.tasks].reverse(), events: [...state.events].reverse() };
    assert.deepEqual(review(state), review(shuffled));
  });

  test('it never mutates the household it reads', () => {
    const state = wednesdayOverload();
    const snapshot = JSON.stringify(state);
    review(state);
    review(state, THURSDAY);
    evaluateMove(state, 'task-library', WEDNESDAY, THURSDAY);
    assert.equal(JSON.stringify(state), snapshot);
  });

  test('the evidence fingerprint tracks what the review rests on: it moves with the day, not with a title', () => {
    const base = wednesdayOverload();
    const renamed = { ...base, tasks: base.tasks.map((t) => ({ ...t, title: 'A completely different name' })) };
    const longer = { ...base, tasks: base.tasks.map((t) => ({ ...t, durationMinutes: 25 })) };
    assert.equal(review(base).evidenceFingerprint, review(renamed).evidenceFingerprint);
    assert.notEqual(review(base).evidenceFingerprint, review(longer).evidenceFingerprint);
    assert.match(review(base).evidenceFingerprint, /^[0-9a-f]{64}$/);
  });

  test('travel she never entered is named as missing evidence, not guessed', () => {
    const r = review(wednesdayOverload((s) => event(s, { id: 'evt-far', title: 'Appointment', start: [17, 0], end: [17, 30], location: 'Across town' })));
    assert.ok(r.evidenceGaps.includes('travel_not_entered'));
    const entered = review(wednesdayOverload((s) => event(s, { id: 'evt-far', start: [17, 0], end: [17, 30], location: 'Across town', travelMinutesBefore: 20 })));
    assert.equal(entered.evidenceGaps.includes('travel_not_entered'), false);
  });

  test('Google Calendar events are ALWAYS stated as not part of the review (a read-only overlay the household state never holds)', () => {
    assert.ok(review(wednesdayOverload()).evidenceGaps.includes('external_calendar_not_included'));
    assert.ok(review(emptyHousehold()).evidenceGaps.includes('external_calendar_not_included'));
  });

  test('the proposal digest identifies the exact move: task, source day, from-plan and to-plan', () => {
    const [p] = review(wednesdayOverload()).proposals;
    assert.equal(p.digest, proposalDigest(p.taskId, p.from, p.to, p.sourceDate));
    assert.notEqual(p.digest, proposalDigest(p.taskId, p.from, { kind: 'day', date: FRIDAY }, p.sourceDate));
    assert.notEqual(p.digest, proposalDigest('other-task', p.from, p.to, p.sourceDate));
    assert.notEqual(p.digest, proposalDigest(p.taskId, p.from, p.to, THURSDAY));
  });

  test('reviewing a day with no tasks and no events is clear and cheap', () => {
    const r = review(emptyHousehold());
    assert.equal(r.outlook, 'clear');
    assert.deepEqual([r.pressures, r.proposals, r.considered], [[], [], []]);
  });
});

describe('the capacity twin equals the Free detector', () => {
  // dayCapacity exists because detectCapacityPressure only reports when there IS pressure. They must agree wherever both speak.
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }
  test('over 300 generated days, available and needed match whenever the Free detector reports pressure, and needed <= available otherwise', () => {
    const rand = prng(20261013);
    let withPressure = 0;
    for (let i = 0; i < 300; i += 1) {
      let s = emptyHousehold();
      const events = Math.floor(rand() * 5);
      for (let e = 0; e < events; e += 1) {
        const start = 6 * 60 + Math.floor(rand() * 14 * 60);
        const length = 15 + Math.floor(rand() * 240);
        s = event(s, { id: `e${e}`, start: [Math.floor(start / 60), start % 60], end: [Math.min(23, Math.floor((start + length) / 60)), (start + length) % 60], commitment: rand() > 0.5 ? 'fixed' : 'flexible', travelMinutesBefore: rand() > 0.7 ? 20 : null });
      }
      const tasks = Math.floor(rand() * 8);
      for (let t = 0; t < tasks; t += 1) s = task(s, { id: `t${t}`, minutes: 10 + Math.floor(rand() * 200), plan: dayPlan(WEDNESDAY) });
      const day = projectStateDay(s, WEDNESDAY);
      const free = detectCapacityPressure(day.events, day.tasks);
      const mine = dayCapacity(s, WEDNESDAY);
      if (free !== null) {
        withPressure += 1;
        assert.deepEqual([mine.availableMinutes, mine.neededMinutes], [free.availableMinutes, free.neededMinutes], `iteration ${i}`);
      } else {
        assert.ok(mine.neededMinutes <= mine.availableMinutes, `iteration ${i}`);
      }
    }
    assert.ok(withPressure > 20, `the generator must exercise pressure (${withPressure})`);
  });
});
