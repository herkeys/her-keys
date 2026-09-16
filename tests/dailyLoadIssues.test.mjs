import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assessDailyLoadIssues,
  CAPACITY_DAY_END_MINUTES,
  CAPACITY_DAY_START_MINUTES,
  detectCapacityPressure,
  detectOverdueTasks,
  detectOverlaps,
  detectTransitionIssues,
} from '../src/domain/dailyLoadIssues.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';

const event = (id, startMinutes, endMinutes, overrides = {}) => ({
  id,
  title: id,
  startMinutes,
  endMinutes,
  categoryId: 'cat-kids',
  subjectMemberId: null,
  commitment: 'fixed',
  ...overrides,
});

const task = (id, overrides = {}) => ({
  id,
  title: id,
  durationMinutes: 30,
  commitment: 'flexible',
  dueToday: false,
  daysOverdue: 0,
  categoryId: 'cat-home',
  subjectMemberId: null,
  ...overrides,
});

const at = (hour, minute = 0) => hour * 60 + minute;

describe('Direct overlap', () => {
  test('two fixed commitments that intersect are flagged', () => {
    const issues = detectOverlaps([event('a', at(15), at(16)), event('b', at(15, 30), at(16, 30))]);
    assert.equal(issues.length, 1);
    assert.deepEqual([issues[0].eventAId, issues[0].eventBId, issues[0].overlapMinutes], ['a', 'b', 30]);
  });

  test('a flexible event overlapping a fixed one is not a direct-overlap issue — nothing here can be safely automated only for two fixed items', () => {
    const issues = detectOverlaps([event('a', at(15), at(16), { commitment: 'fixed' }), event('b', at(15, 30), at(16), { commitment: 'flexible' })]);
    assert.deepEqual(issues, []);
  });

  test('back-to-back (touching, not overlapping) commitments are not flagged', () => {
    assert.deepEqual(detectOverlaps([event('a', at(15), at(16)), event('b', at(16), at(17))]), []);
  });

  test('deterministic order: earliest start first, then id', () => {
    const issues = detectOverlaps([
      event('late', at(18), at(19, 30)),
      event('late2', at(18, 30), at(19)),
      event('early', at(9), at(10, 30)),
      event('early2', at(9, 30), at(10)),
    ]);
    assert.deepEqual(issues.map((i) => [i.eventAId, i.eventBId]), [
      ['early', 'early2'],
      ['late', 'late2'],
    ]);
  });
});

describe('Transition conflict vs tight window (kept as separate detections)', () => {
  test('raw-gap overloaded is a transition_conflict with zero travel used', () => {
    const events = [event('pickup', at(15), at(15, 15)), event('soccer', at(15, 25), at(16, 30))];
    const assessment = computeDailyLoad(events, []);
    const [issue] = detectTransitionIssues(events, assessment);

    assert.equal(issue.kind, 'transition_conflict');
    assert.equal(issue.source, 'raw');
    assert.equal(issue.travelMinutesUsed, 0);
  });

  test('raw-gap tight (not yet overloaded) is a tight_window issue', () => {
    const events = [event('pickup', at(15), at(15, 15)), event('soccer', at(15, 45), at(16, 30))];
    const assessment = computeDailyLoad(events, []);
    const [issue] = detectTransitionIssues(events, assessment);
    assert.equal(issue.kind, 'tight_window');
    assert.equal(issue.bufferMinutes, 30);
  });

  test('travel time never invented: no travel minutes entered anywhere means no travel-aware issue, however tight the raw gap is', () => {
    const events = [event('pickup', at(15), at(15, 15)), event('soccer', at(15, 40), at(16, 30))];
    const assessment = computeDailyLoad(events, []);
    const issues = detectTransitionIssues(events, assessment);
    assert.ok(issues.every((issue) => issue.kind !== 'transition_conflict' || issue.source !== 'travel_aware'));
  });

  test('the canonical scenario: an open raw gap becomes a genuine risk once entered travel time is counted', () => {
    // Work ends 4:30, pickup at 4:45 — 15 raw minutes, already tight/overloaded on tasks alone,
    // but constructed here with a spacious 50-minute raw gap that only becomes a problem with travel.
    const events = [
      event('work', at(9), at(16, 30)),
      event('pickup', at(17, 20), at(17, 35), { travelMinutesBefore: 40 }),
    ];
    const assessment = computeDailyLoad(events, []);
    assert.equal(assessment.status, 'balanced', 'raw buffer alone looks fine');

    const issues = detectTransitionIssues(events, assessment);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'transition_conflict');
    assert.equal(issues[0].source, 'travel_aware');
    assert.equal(issues[0].travelMinutesUsed, 40);
    assert.equal(issues[0].bufferMinutes, assessment.bufferMinutes - 40);
  });

  test('travel time never invented: entered travel that keeps the day open produces no issue', () => {
    const events = [event('work', at(9), at(12)), event('appointment', at(14), at(15), { travelMinutesBefore: 10 })];
    const assessment = computeDailyLoad(events, []);
    assert.deepEqual(detectTransitionIssues(events, assessment), []);
  });

  test('a gap already overloaded on tasks alone does not get a redundant travel-aware duplicate', () => {
    const events = [
      event('pickup', at(15), at(15, 15)),
      event('soccer', at(15, 20), at(16, 30), { travelMinutesBefore: 20 }),
    ];
    const assessment = computeDailyLoad(events, []);
    const issues = detectTransitionIssues(events, assessment);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].source, 'raw');
  });
});

describe('Capacity pressure', () => {
  test('a genuinely reasonable day reports no pressure', () => {
    const events = [event('work', at(9), at(12))];
    const tasks = [task('errand', { durationMinutes: 30 })];
    assert.equal(detectCapacityPressure(events, tasks), null);
  });

  test('flexible workload exceeding what the day window has left is flagged, naming the largest task', () => {
    const dayWindow = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;
    const events = [event('work', CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_START_MINUTES + dayWindow - 60)]; // only 60 minutes free
    const tasks = [task('big', { durationMinutes: 40 }), task('small', { durationMinutes: 30 })];

    const issue = detectCapacityPressure(events, tasks);
    assert.equal(issue.kind, 'capacity_pressure');
    assert.equal(issue.availableMinutes, 60);
    assert.equal(issue.neededMinutes, 70);
    assert.equal(issue.pressureMinutes, 10);
    assert.equal(issue.largestTaskId, 'big');
  });

  test('overdue minutes are excluded from demand — an overdue task never worsens the capacity verdict', () => {
    const dayWindow = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;
    const events = [event('work', CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_START_MINUTES + dayWindow - 30)];
    const tasks = [task('overdue-big', { durationMinutes: 200, daysOverdue: 3 })];
    assert.equal(detectCapacityPressure(events, tasks), null);
  });

  test('due-today minutes are excluded from demand the same way `computeDailyLoad` already excludes them from candidates', () => {
    const dayWindow = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;
    const events = [event('work', CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_START_MINUTES + dayWindow - 30)];
    const tasks = [task('due-today-big', { durationMinutes: 200, dueToday: true })];
    assert.equal(detectCapacityPressure(events, tasks), null);
  });

  test('a fixed commitment consumes its own entered travel and preparation minutes from the window too', () => {
    const dayWindow = CAPACITY_DAY_END_MINUTES - CAPACITY_DAY_START_MINUTES;
    const events = [
      event('work', CAPACITY_DAY_START_MINUTES, CAPACITY_DAY_START_MINUTES + dayWindow - 100, {
        travelMinutesAfter: 30,
        preparationMinutes: 20,
      }),
    ];
    // 100 raw minutes free, minus 50 travel/prep margin = 50 available.
    const tasks = [task('errand', { durationMinutes: 60 })];
    const issue = detectCapacityPressure(events, tasks);
    assert.equal(issue.availableMinutes, 50);
    assert.equal(issue.pressureMinutes, 10);
  });

  test('flexible events outside the day window do not appear at all', () => {
    // A fixed event entirely outside the capacity window still exists on the calendar but not in this math.
    const events = [event('late-night', 0, 60)];
    const tasks = [task('errand', { durationMinutes: 30 })];
    assert.equal(detectCapacityPressure(events, tasks), null);
  });
});

describe('Overdue reporting', () => {
  test('overdue tasks are reported, sorted most-overdue first, and never treated as movable', () => {
    const issues = detectOverdueTasks([task('a', { daysOverdue: 1 }), task('b', { daysOverdue: 5 }), task('c', { daysOverdue: 0 })]);
    assert.deepEqual(issues.map((i) => i.taskId), ['b', 'a']);
  });
});

describe('assessDailyLoadIssues: deterministic single verdict', () => {
  test('a genuinely reasonable day reports no material issue and the open tier', () => {
    const events = [event('appointment', at(10), at(10, 30))];
    const tasks = [];
    const assessment = computeDailyLoad(events, tasks);
    const result = assessDailyLoadIssues(events, tasks, assessment);

    assert.equal(result.primary, null);
    assert.equal(result.tier, 'open');
  });

  test('priority order: an overlap outranks every other issue on the same day', () => {
    const events = [
      event('a', at(15), at(16)),
      event('b', at(15, 30), at(16, 30)), // overlaps a
    ];
    const tasks = [task('big', { durationMinutes: 500 })]; // would also be capacity pressure
    const assessment = computeDailyLoad(events, tasks);
    const result = assessDailyLoadIssues(events, tasks, assessment);

    assert.equal(result.primary.kind, 'overlap');
    assert.equal(result.tier, 'overloaded');
  });

  test('priority order: transition conflict outranks capacity pressure and tight window', () => {
    const events = [event('pickup', at(15), at(15, 15)), event('soccer', at(15, 20), at(16, 30))];
    const tasks = [task('big', { durationMinutes: 500 })];
    const assessment = computeDailyLoad(events, tasks);
    const result = assessDailyLoadIssues(events, tasks, assessment);

    assert.equal(result.primary.kind, 'transition_conflict');
    assert.equal(result.tier, 'overloaded');
  });

  test('priority order: capacity pressure outranks tight window', () => {
    const events = [
      // Padding blocks sit well clear of pickup/appointment (>=45-minute gaps either side, so they're never the tightest transition) while still eating most of the capacity window.
      event('morning-work', CAPACITY_DAY_START_MINUTES, at(13, 20)),
      event('pickup', at(15), at(15, 15)),
      event('appointment', at(15, 40), at(16)), // 25-minute raw gap from pickup: tight, not overloaded
      event('evening-work', at(16, 45), CAPACITY_DAY_END_MINUTES),
    ];
    const tasks = [task('huge', { durationMinutes: 300 })];
    const assessment = computeDailyLoad(events, tasks);
    const result = assessDailyLoadIssues(events, tasks, assessment);

    assert.equal(result.primary.kind, 'capacity_pressure');
    assert.equal(result.tier, 'overloaded');
  });

  test('priority order: overdue is the lowest-ranked issue, surfaced only when nothing else is true', () => {
    const events = [event('appointment', at(10), at(10, 30))];
    const tasks = [task('late-thing', { daysOverdue: 2 })];
    const assessment = computeDailyLoad(events, tasks);
    const result = assessDailyLoadIssues(events, tasks, assessment);

    assert.equal(result.primary.kind, 'overdue');
    assert.equal(result.tier, 'open', 'an overdue item alone does not make the day overloaded or tight');
  });
});
