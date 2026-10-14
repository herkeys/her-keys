import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aggregatePeriod, deltasOf, hasEnoughHistory, periodEndingOn, priorPeriodOf } from '../../src/domain/premium/momentum/aggregate.ts';
import { deriveEvents, netCompletedTaskIds } from '../../src/domain/premium/momentum/events.ts';
import { detectFriction, nextStepFor } from '../../src/domain/premium/momentum/friction.ts';
import { THRESHOLDS } from '../../src/domain/premium/momentum/model.ts';
import { buildWeeklyReview } from '../../src/domain/premium/momentum/report.ts';
import { parseSnapshot, toSnapshot } from '../../src/domain/premium/momentum/snapshot.ts';
import { userProvenance } from '../../src/domain/foundation/provenance.ts';

const TZ = 'America/New_York';
const TODAY = '2026-09-30'; // a Wednesday. Period 09-24..09-30; prior period 09-17..09-23; lookback from 09-03.
const NOW = Date.parse('2026-09-30T20:00:00Z');
const at = (date, time = '16:00:00') => `${date}T${time}.000Z`; // 16:00Z is noon in New York in September (no date drift)

let seq = 0;
const obs = (kind, id, outcome, date, extra = {}) => ({
  id: extra.obsId ?? `obs-${++seq}`,
  about: { kind, id },
  outcome,
  occurredAt: extra.occurredAt ?? at(date),
  logicalDate: date,
  plannedDate: extra.plannedDate ?? null,
  toDate: extra.toDate ?? null,
  createdAt: extra.occurredAt ?? at(date),
  provenance: extra.provenance ?? userProvenance(),
  scope: 'personal',
});
const done = (id, date, extra) => obs('task', id, 'completed', date, extra);
const defer = (id, date, planned, to, extra) => obs('task', id, 'deferred', date, { plannedDate: planned, toDate: to, ...extra });

const decision = (over = {}) => ({
  id: 'dec-1',
  status: 'applied',
  taskId: 't1',
  proposedAtMs: Date.parse('2026-09-28T15:50:00Z'),
  appliedAtMs: Date.parse('2026-09-28T16:00:00Z'),
  revertedAtMs: null,
  updatedAtMs: Date.parse('2026-09-28T16:00:00Z'),
  beforeDate: '2026-09-28',
  afterDate: '2026-09-29',
  ...over,
});

const review = (observations, decisions = [], confirmedPatterns = []) => buildWeeklyReview({ observations, decisions, confirmedPatterns, today: TODAY, timeZone: TZ, nowMs: NOW });
const countsOf = (observations, decisions = []) => {
  const { events } = deriveEvents({ observations, decisions, timeZone: TZ });
  const period = periodEndingOn(TODAY);
  return aggregatePeriod({ events, history: events, period, netCompleted: netCompletedTaskIds(observations) });
};

// ---------------------------------------------------------------------------------------------------------------- the period

describe('MOM-PERIOD — the actual reporting period', () => {
  test('seven logical days ending today, inclusive, and an equal-length prior period immediately before it', () => {
    assert.deepEqual(periodEndingOn(TODAY), { start: '2026-09-24', end: '2026-09-30', days: 7 });
    assert.deepEqual(priorPeriodOf(periodEndingOn(TODAY)), { start: '2026-09-17', end: '2026-09-23', days: 7 });
  });

  test('both edges of the period are in, the day before it starts and the day after it ends are out', () => {
    const c = countsOf([done('a', '2026-09-24'), done('b', '2026-09-30'), done('c', '2026-09-23'), done('d', '2026-10-01')]);
    assert.equal(c.tasksCompleted, 2);
  });

  test('a record from the FUTURE never enters a review', () => {
    const r = review([done('a', '2026-10-05'), done('b', '2026-10-06')]);
    assert.equal(r.status, 'insufficient_history');
    assert.equal(r.have.events, 0);
  });
});

// ------------------------------------------------------------------------------------------------------------ do not double count

describe('MOM-DEDUPE — one real thing is one event', () => {
  test('a duplicated observation row (same id) counts once', () => {
    const o = done('a', '2026-09-25', { obsId: 'same' });
    assert.equal(countsOf([o, { ...o }, { ...o }]).tasksCompleted, 1);
    assert.equal(countsOf([o, { ...o }]).totalEvents, 1);
  });

  test('completing, reopening and completing again is ONE task finished', () => {
    const c = countsOf([done('a', '2026-09-25', { occurredAt: at('2026-09-25', '14:00:00') }), obs('task', 'a', 'reopened', '2026-09-26'), done('a', '2026-09-27')]);
    assert.equal(c.tasksCompleted, 1);
  });

  test('completed then reopened and left open is NOT a completion', () => {
    const c = countsOf([done('a', '2026-09-25'), obs('task', 'a', 'reopened', '2026-09-26')]);
    assert.equal(c.tasksCompleted, 0);
  });

  test('two completions of different tasks are two', () => {
    assert.equal(countsOf([done('a', '2026-09-25'), done('b', '2026-09-25')]).tasksCompleted, 2);
  });
});

// ---------------------------------------------------------------------------------------- a suggestion she approved is not her postponing

describe('MOM-ATTRIBUTION — approved suggestions are not postponements, and are not counted twice', () => {
  const move = defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-28T16:00:05.000Z' });

  test('the task system recorded "deferred" for the approved move: it is reported ONCE, as the suggestion, never as a postponement', () => {
    const c = countsOf([move], [decision()]);
    assert.equal(c.postponements, 0);
    assert.equal(c.suggestionsApplied, 1);
    assert.equal(c.totalEvents, 1, 'two records of the same move are one event');
  });

  test('without the decision the same observation IS her postponement (the control)', () => {
    const c = countsOf([move], []);
    assert.equal(c.postponements, 1);
    assert.equal(c.suggestionsApplied, 0);
  });

  test('a different move of the same task is not claimed', () => {
    const other = defer('t1', '2026-09-28', '2026-09-28', '2026-09-30', { occurredAt: '2026-09-28T16:00:05.000Z' });
    const c = countsOf([other], [decision()]);
    assert.equal(c.postponements, 1);
    assert.equal(c.suggestionsApplied, 1);
  });

  test('a different task is not claimed', () => {
    const other = defer('t2', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-28T16:00:05.000Z' });
    assert.equal(countsOf([other], [decision()]).postponements, 1);
  });

  test('an identical move outside the decision’s life (well before it was proposed, or long after) is hers', () => {
    const early = defer('t1', '2026-09-27', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-27T16:00:00.000Z' });
    const late = defer('t1', '2026-09-29', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-29T16:00:00.000Z' });
    assert.equal(countsOf([early], [decision()]).postponements, 1);
    assert.equal(countsOf([late], [decision()]).postponements, 1);
  });

  test('clock skew inside the allowance still attributes (device and server clocks differ)', () => {
    const skewed = defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: new Date(Date.parse('2026-09-28T16:00:00Z') + THRESHOLDS.attributionSkewMs - 1000).toISOString() });
    assert.equal(countsOf([skewed], [decision()]).postponements, 0);
    const beyond = defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: new Date(Date.parse('2026-09-28T16:00:00Z') + THRESHOLDS.attributionSkewMs + 60_000).toISOString() });
    assert.equal(countsOf([beyond], [decision()]).postponements, 1);
  });

  test('one decision claims at most ONE observation; a second identical observation stays hers', () => {
    const twin = defer('t1', '2026-09-28', '2026-09-28', '2026-09-29', { occurredAt: '2026-09-28T16:00:06.000Z' });
    const c = countsOf([move, twin], [decision()]);
    assert.equal(c.postponements, 1);
    assert.equal(c.suggestionsApplied, 1);
  });

  test('two decisions never claim the same observation', () => {
    const c = countsOf([move], [decision(), decision({ id: 'dec-2' })]);
    assert.equal(c.postponements, 0);
    assert.equal(c.suggestionsApplied, 2, 'two applied decisions are two decisions; only one observation existed');
    assert.equal(c.totalEvents, 2);
  });

  test('a move to an EARLIER day writes no observation: the decision alone is the record', () => {
    const c = countsOf([], [decision({ afterDate: '2026-09-27' })]);
    assert.equal(c.suggestionsApplied, 1);
    assert.equal(c.postponements, 0);
  });

  test('an undone suggestion is reported as undone, not as a win', () => {
    const c = countsOf([move], [decision({ status: 'reverted', revertedAtMs: Date.parse('2026-09-29T12:00:00Z') })]);
    assert.equal(c.suggestionsApplied, 0, 'net: no longer applied');
    assert.equal(c.suggestionsReverted, 1);
    assert.equal(c.postponements, 0, 'and the move it undid is still not her postponement');
  });

  test('a blocked undo leaves the suggestion applied', () => {
    assert.equal(countsOf([], [decision({ status: 'revert_blocked' })]).suggestionsApplied, 1);
  });

  test('a declined suggestion is counted as declined; nothing that never happened is counted', () => {
    assert.equal(countsOf([], [decision({ status: 'rejected' })]).suggestionsDeclined, 1);
    for (const status of ['proposed', 'approved', 'applying', 'failed', 'abandoned']) {
      const c = countsOf([], [decision({ status })]);
      assert.equal(c.totalEvents, 0, status);
    }
  });

  test('an applied suggestion creates NO friction pattern however many are applied', () => {
    const decisions = ['a', 'b', 'c'].map((day, i) => decision({ id: `d${i}`, taskId: 't1', appliedAtMs: Date.parse(`2026-09-2${5 + i}T16:00:00Z`), proposedAtMs: Date.parse(`2026-09-2${5 + i}T15:50:00Z`), updatedAtMs: Date.parse(`2026-09-2${5 + i}T16:00:00Z`), beforeDate: `2026-09-2${5 + i}`, afterDate: `2026-09-2${6 + i}` }));
    const observations = [0, 1, 2].map((i) => defer('t1', `2026-09-2${5 + i}`, `2026-09-2${5 + i}`, `2026-09-2${6 + i}`, { occurredAt: `2026-09-2${5 + i}T16:00:03.000Z` }));
    const r = review([...observations, done('x', '2026-09-24'), done('y', '2026-09-24'), done('z', '2026-09-30')], decisions);
    assert.equal(r.status, 'ready');
    assert.deepEqual(r.patterns, []);
  });
});

// ---------------------------------------------------------------------------------------------------------------- other counts

describe('MOM-COUNTS — what is counted, and only that', () => {
  test('systems, routines, delegation and one-moves each count what happened', () => {
    const c = countsOf([
      obs('system', 's1', 'completed', '2026-09-25'),
      obs('system', 's1', 'skipped', '2026-09-26'),
      obs('system', 's1', 'missed', '2026-09-27'),
      obs('responsibility', 'r1', 'accepted', '2026-09-25'),
      obs('responsibility', 'r1', 'completed', '2026-09-26'),
      obs('oneMove', 'm1', 'completed', '2026-09-25'),
      obs('needsMe', 'n1', 'completed', '2026-09-25'),
    ]);
    assert.deepEqual([c.routinesDone, c.routinesSkipped, c.routinesMissed, c.delegationsAccepted, c.delegationsCompleted, c.oneMovesCompleted, c.itemsCompleted], [1, 1, 1, 1, 1, 1, 1]);
  });

  test('records Momentum has no honest reading for are ignored, never forced into a count', () => {
    const c = countsOf([obs('interpretation', 'i1', 'accepted', '2026-09-25'), obs('goal', 'g1', 'completed', '2026-09-25'), obs('task', 't', 'cancelled', '2026-09-25'), obs('meal', 'm', 'completed', '2026-09-25')]);
    assert.equal(c.totalEvents, 0);
  });

  test('"finished after postponing" counts only tasks she actually postponed before finishing', () => {
    const c = countsOf([defer('a', '2026-09-20', '2026-09-20', '2026-09-21'), done('a', '2026-09-26'), done('b', '2026-09-26')]);
    assert.equal(c.finishedAfterPostponing, 1);
    assert.equal(c.tasksCompleted, 2);
  });
});

// ---------------------------------------------------------------------------------------------------------------- insufficient history

describe('MOM-HISTORY — the first user, and the honest state', () => {
  test('no records at all is "nothing recorded", with no invented accomplishment', () => {
    const r = review([]);
    assert.equal(r.status, 'insufficient_history');
    assert.equal(r.reason, 'nothing_recorded');
    assert.deepEqual(r.have, { events: 0, activeDays: 0 });
    assert.equal('counts' in r, false, 'there is no counts block to over-read');
  });

  test('the minimum is exactly 5 events across 3 days: one short of either is withheld', () => {
    const days = ['2026-09-24', '2026-09-25', '2026-09-26'];
    const four = [done('a', days[0]), done('b', days[1]), done('c', days[2]), done('d', days[2])];
    const fiveTwoDays = [done('a', days[0]), done('b', days[0]), done('c', days[1]), done('d', days[1]), done('e', days[1])];
    const fiveThreeDays = [...four, done('e', days[2])];
    assert.equal(review(four).status, 'insufficient_history');
    assert.equal(review(fiveTwoDays).status, 'insufficient_history');
    assert.equal(review(fiveThreeDays).status, 'ready');
    assert.equal(review(four).reason, 'too_little_recorded');
  });

  test('hasEnoughHistory is the single definition', () => {
    assert.equal(hasEnoughHistory({ totalEvents: THRESHOLDS.minEventsForReport, activeDays: THRESHOLDS.minActiveDaysForReport }), true);
    assert.equal(hasEnoughHistory({ totalEvents: THRESHOLDS.minEventsForReport - 1, activeDays: THRESHOLDS.minActiveDaysForReport }), false);
    assert.equal(hasEnoughHistory({ totalEvents: THRESHOLDS.minEventsForReport, activeDays: THRESHOLDS.minActiveDaysForReport - 1 }), false);
  });

  test('a ready first week has NO comparison and says why; no change is claimed against nothing', () => {
    const r = review([done('a', '2026-09-24'), done('b', '2026-09-25'), done('c', '2026-09-26'), done('d', '2026-09-27'), done('e', '2026-09-28')]);
    assert.equal(r.status, 'ready');
    assert.equal(r.comparison, null);
    assert.equal(r.comparisonUnavailable, 'prior_history_too_short');
    assert.deepEqual(r.patterns, []);
    assert.equal(r.nextStep, null);
  });

  test('a comparison appears only when the prior period ALSO had enough history, and the deltas are exact', () => {
    const thisWeek = ['24', '25', '26', '27', '28', '29'].map((d, i) => done(`n${i}`, `2026-09-${d}`));
    const priorWeek = ['17', '18', '19', '20'].map((d, i) => done(`p${i}`, `2026-09-${d}`));
    const priorEnough = [...priorWeek, done('p9', '2026-09-21')];
    assert.equal(review([...thisWeek, ...priorWeek]).comparison, null, 'four prior events is not enough to compare against');
    const r = review([...thisWeek, ...priorEnough, defer('q', '2026-09-26', '2026-09-26', '2026-09-27')]);
    assert.equal(r.status, 'ready');
    assert.equal(r.comparison.deltas.tasksCompleted, 6 - 5);
    assert.equal(r.comparison.deltas.postponements, 1 - 0);
  });

  test('there is no time-saved or scored figure anywhere in a ready report', () => {
    const r = review(['24', '25', '26', '27', '28'].map((d, i) => done(`t${i}`, `2026-09-${d}`)));
    const text = JSON.stringify(r);
    for (const forbidden of ['minutes', 'hours', 'saved', 'score', 'improv', 'recovered', 'prevented']) assert.ok(!text.toLowerCase().includes(forbidden), forbidden);
  });
});

// ---------------------------------------------------------------------------------------------------------------- confidence

describe('MOM-CONFIDENCE — tiers grounded in independent observation counts', () => {
  const pp = (id, date, planned = date, to = '2026-10-01') => defer(id, date, planned, to);
  const friction = (postponements, confirmed = []) => {
    const { events } = deriveEvents({ observations: postponements, decisions: [], timeZone: TZ });
    return detectFriction({ postponements: events.filter((e) => e.type === 'postponed_by_you'), confirmed });
  };

  test('one postponement is an event, never a pattern', () => assert.deepEqual(friction([pp('t', '2026-09-25')]), []));

  test('two postponements on the SAME day are one sighting: repetition inside a day is not a pattern', () => {
    assert.deepEqual(friction([pp('t', '2026-09-25'), pp('t', '2026-09-25')]), []);
  });

  test('two independent days: possible', () => {
    const [p] = friction([pp('t', '2026-09-24'), pp('t', '2026-09-26')]);
    assert.equal(p.kind, 'repeated_postponement');
    assert.equal(p.tier, 'possible');
    assert.equal(p.sightings, 2);
  });

  test('three independent days: likely — the existing promotion threshold, not a new one', () => {
    const [p] = friction([pp('t', '2026-09-24'), pp('t', '2026-09-26'), pp('t', '2026-09-28')]);
    assert.equal(p.tier, 'likely');
    assert.equal(p.sightings, 3);
  });

  test('many sightings alone NEVER reach established', () => {
    const many = ['03', '06', '09', '12', '15', '18', '21', '24', '27'].map((d) => pp('t', `2026-09-${d}`));
    assert.equal(friction(many)[0].tier, 'likely');
  });

  test('established requires HER confirmation of a matching pattern; a candidate, a rejection or another task does not count', () => {
    const rows = [pp('t', '2026-09-24'), pp('t', '2026-09-26'), pp('t', '2026-09-28')];
    const mk = (over) => ({ id: 'p', kind: 'deferral', about: { kind: 'task', id: 't' }, categoryId: null, weekday: null, timeBucket: null, status: 'confirmed', firstObservedOn: '2026-09-01', lastObservedOn: '2026-09-02', createdAt: at('2026-09-02'), updatedAt: at('2026-09-02'), provenance: {}, scope: 'personal', ...over });
    assert.equal(friction(rows, [mk({})])[0].tier, 'established');
    assert.equal(friction(rows, [mk({})])[0].confirmedByHer, true);
    assert.equal(friction(rows, [mk({ status: 'candidate' })])[0].tier, 'likely');
    assert.equal(friction(rows, [mk({ status: 'rejected' })])[0].tier, 'likely');
    assert.equal(friction(rows, [mk({ about: { kind: 'task', id: 'other' } })])[0].tier, 'likely');
  });

  test('a weekday pattern needs two DIFFERENT tasks slipping from that weekday on two different dates', () => {
    // 2026-09-08 and 2026-09-15 and 2026-09-22 are Tuesdays.
    const twoTasks = friction([pp('a', '2026-09-08', '2026-09-08'), pp('b', '2026-09-15', '2026-09-15')]);
    const weekday = twoTasks.find((p) => p.kind === 'weekday_slippage');
    assert.equal(weekday.weekday, 2);
    assert.equal(weekday.tier, 'possible');
    const oneTask = friction([pp('a', '2026-09-08', '2026-09-08'), pp('a', '2026-09-15', '2026-09-15')]);
    assert.ok(!oneTask.some((p) => p.kind === 'weekday_slippage'), 'one task moved twice is the task pattern, not a weekday pattern');
    assert.ok(oneTask.some((p) => p.kind === 'repeated_postponement'));
    const threeDates = friction([pp('a', '2026-09-08', '2026-09-08'), pp('b', '2026-09-15', '2026-09-15'), pp('c', '2026-09-22', '2026-09-22')]);
    assert.equal(threeDates.find((p) => p.kind === 'weekday_slippage').tier, 'likely');
  });

  test('every pattern carries its evidence ids, capped', () => {
    const many = Array.from({ length: 15 }, (_, i) => pp('t', `2026-09-${String(10 + i).padStart(2, '0')}`));
    const [p] = friction(many);
    assert.ok(p.evidence.length > 0 && p.evidence.length <= THRESHOLDS.maxEvidenceIds);
  });

  test('the next step is offered only once evidence is at least likely, and always needs her approval', () => {
    const possible = friction([pp('t', '2026-09-24'), pp('t', '2026-09-26')]);
    const likely = friction([pp('t', '2026-09-24'), pp('t', '2026-09-26'), pp('t', '2026-09-28')]);
    assert.equal(nextStepFor(possible), null);
    assert.deepEqual(nextStepFor(likely), { kind: 'review_repeated_postponement', about: { kind: 'task', id: 't' }, requiresApproval: true });
  });
});

// ---------------------------------------------------------------------------------------------------------------- determinism

describe('MOM-DETERMINISM — the same records give the same review', () => {
  const rows = () => [
    done('a', '2026-09-24'),
    done('b', '2026-09-25'),
    defer('c', '2026-09-26', '2026-09-26', '2026-09-27'),
    defer('c', '2026-09-28', '2026-09-28', '2026-09-29'),
    defer('c', '2026-09-30', '2026-09-30', '2026-10-01'),
    obs('system', 's', 'completed', '2026-09-27'),
  ];
  test('shuffling the input changes nothing', () => {
    seq = 0;
    const a = rows();
    const b = [...a].reverse();
    assert.deepEqual(review(a), review(b));
  });
  test('running twice changes nothing', () => {
    seq = 0;
    const a = rows();
    assert.deepEqual(review(a), review(a));
  });
});

// ---------------------------------------------------------------------------------------------------------------- the saved snapshot

describe('MOM-SNAPSHOT — what is kept after the review is generated', () => {
  const ready = () => {
    seq = 0;
    return review([done('a', '2026-09-24'), done('b', '2026-09-25'), done('c', '2026-09-26'), defer('c2', '2026-09-26', '2026-09-26', '2026-09-27'), defer('c2', '2026-09-28', '2026-09-28', '2026-09-29'), defer('c2', '2026-09-30', '2026-09-30', '2026-10-01')]);
  };

  test('an insufficient-history answer is not a report and is not saved', () => assert.equal(toSnapshot(review([])), null));

  test('a ready review round-trips through the strict parser', () => {
    const snapshot = toSnapshot(ready());
    assert.ok(snapshot);
    assert.deepEqual(parseSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot);
  });

  test('it holds numbers and typed references only: no titles, notes, amounts or observation content', () => {
    const text = JSON.stringify(toSnapshot(ready()));
    for (const forbidden of ['title', 'notes', 'amount', 'quote', 'text', 'name']) assert.ok(!text.includes(`"${forbidden}"`), forbidden);
  });

  test('it always fits the ledger column, even with every pattern slot used', () => {
    seq = 0;
    const rows = [];
    for (let t = 0; t < 8; t += 1) for (const d of ['24', '26', '28']) rows.push(defer(`task-${'x'.repeat(40)}-${t}`, `2026-09-${d}`, `2026-09-${d}`, '2026-10-01'));
    for (let i = 0; i < 6; i += 1) rows.push(done(`d${i}`, '2026-09-25'));
    const snapshot = toSnapshot(review(rows));
    assert.ok(new TextEncoder().encode(JSON.stringify(snapshot)).length <= THRESHOLDS.snapshotMaxBytes);
    assert.ok(snapshot.patterns.length <= THRESHOLDS.maxPatterns);
  });

  test('a tampered, extended or older-version snapshot is "not a report", never a guess', () => {
    const snapshot = toSnapshot(ready());
    assert.equal(parseSnapshot({ ...snapshot, v: 'momentum-v0' }), null);
    assert.equal(parseSnapshot({ ...snapshot, extra: 1 }), null);
    assert.equal(parseSnapshot({ ...snapshot, counts: { ...snapshot.counts, tasksCompleted: -1 } }), null);
    assert.equal(parseSnapshot(null), null);
    assert.equal(parseSnapshot('report'), null);
  });
});

// ---------------------------------------------------------------------------------------------------------------- deltas

describe('MOM-DELTAS', () => {
  test('signed, this period minus the prior', () => {
    const a = { ...countsOf([]), tasksCompleted: 5, postponements: 1 };
    const b = { ...countsOf([]), tasksCompleted: 7, postponements: 4 };
    const d = deltasOf(a, b);
    assert.equal(d.tasksCompleted, -2);
    assert.equal(d.postponements, -3);
  });
});
