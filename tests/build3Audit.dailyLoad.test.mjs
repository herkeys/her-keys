/**
 * Build 3 hostile audit — Daily Load verdicts on real household data.
 *
 * Every day here is built through the real capture transitions and read back
 * through the same projection, engine and verdict Today uses, so a wrong
 * verdict here is a wrong verdict on her screen.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { approveDailyLoadMove, dailyLoadDecisionFor, keepDailyLoadPlan, latestTransitionDecision } from '../src/domain/dailyLoadDecisions.ts';
import { assessDailyLoadIssues } from '../src/domain/dailyLoadIssues.ts';
import { addEvent } from '../src/domain/events.ts';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { toInstant, zonedTimeToEpochMs } from '../src/domain/logicalDay.ts';
import { completeOnboarding, toggleOnboardingOption } from '../src/domain/onboarding.ts';
import { oneMoveForDay, resolveOneMoveForToday } from '../src/domain/oneMove.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { approveDropTask, approveMoveEvent, approveProtectItem, approveShortenTask, keepCapacityPlan } from '../src/domain/recommendationActions.ts';
import { addTask } from '../src/domain/tasks.ts';
import { tomorrowPreview } from '../src/domain/tomorrowPreview.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { describeLoad } from '../src/features/daily-load/describeLoad.ts';
import { describeDayState } from '../src/features/today/dayState.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, NEXT_DAY, TZ, ctx } from './support/fixtures.mjs';

const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));

/** A real household whose day is built from plain descriptions, in the given order. */
function household({ events = [], tasks = [] } = {}, context = ctx()) {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) {
    state = toggleOnboardingOption(state, group, id);
  }
  state = completeOnboarding(state, context);
  for (const e of events) {
    state = addEvent(state, context, { categoryId: 'cat-kids', commitment: 'fixed', scope: 'household', ...e, startsAt: at(...e.start), endsAt: at(...e.end) });
  }
  for (const t of tasks) state = addTask(state, context, { categoryId: 'cat-home', scope: 'household', ...t });
  return state;
}

function verdict(state) {
  const day = projectStateDay(state, DAY);
  const assessment = computeDailyLoad(day.events, day.tasks);
  const issues = assessDailyLoadIssues(day.events, day.tasks, assessment);
  return { day, assessment, issues, header: describeDayState(assessment, dailyLoadDecisionFor(state, DAY).decision, issues), meter: describeLoad(day.events, day.tasks, assessment, issues) };
}

const idOf = (state, title) => (state.events.find((e) => e.title === title) ?? state.tasks.find((t) => t.title === title)).id;
const timed = (hour, minute = 0) => ({ kind: 'timed', startsAt: at(hour, minute) });

describe('Build 3 audit — travel counts on every transition (B3-AUD-005)', () => {
  const lunchThenPickup = () =>
    household({
      events: [
        { title: 'Work', start: [9], end: [12] },
        { title: 'Lunch meeting', start: [12, 50], end: [13, 30] },
        { title: 'School pickup', start: [15], end: [15, 15], travelMinutesBefore: 75 },
      ],
    });

  test('a pickup with only 15 real minutes is flagged even when another gap is tighter on the raw calendar', () => {
    const { issues, assessment } = verdict(lunchThenPickup());
    assert.equal(assessment.gap.afterTitle, 'Lunch meeting', 'the raw tightest gap is elsewhere');
    assert.equal(issues.primary.kind, 'transition_conflict');
    assert.equal(issues.primary.source, 'travel_aware');
    assert.deepEqual([issues.primary.beforeTitle, issues.primary.afterTitle, issues.primary.bufferMinutes, issues.primary.travelMinutesUsed], ['Lunch meeting', 'School pickup', 15, 75]);
    assert.equal(issues.tier, 'overloaded');
  });

  test('a travel-aware conflict outranks a merely tight raw window elsewhere', () => {
    const state = household({
      events: [
        { title: 'Standup', start: [9], end: [9, 30] },
        { title: 'Review', start: [10], end: [11] },
        { title: 'School pickup', start: [13], end: [13, 15], travelMinutesBefore: 110 },
      ],
    });
    const { issues } = verdict(state);
    assert.equal(issues.primary.kind, 'transition_conflict');
    assert.equal(issues.primary.afterTitle, 'School pickup');
    assert.equal(issues.tightWindow.afterTitle, 'Review', 'the tight raw window is still known, just not the headline');
  });

  test('the recommendation is for the window the verdict names, never the raw tightest one', () => {
    let state = lunchThenPickup();
    const context = ctx({ createId: (prefix) => `${prefix}-x1` });
    state = addTask(state, context, { title: 'Pharmacy run', categoryId: 'cat-home', durationMinutes: 20, plan: timed(14), scope: 'household' });
    state = addTask(state, ctx({ createId: (prefix) => `${prefix}-x2` }), { title: 'Lunch errand', categoryId: 'cat-home', durationMinutes: 10, plan: timed(12, 30), scope: 'household' });

    const { issues } = verdict(state);
    assert.equal(issues.primary.source, 'travel_aware');
    assert.deepEqual(issues.focus.candidates.map((c) => c.task.title), ['Pharmacy run']);
    assert.equal(approveDailyLoadMove(state, ctx(), idOf(state, 'Lunch errand')), state, 'a task outside the named window is refused');
    const moved = approveDailyLoadMove(state, ctx(), idOf(state, 'Pharmacy run'));
    assert.notEqual(moved, state);
    assert.deepEqual(
      (({ windowBeforeEventId, windowAfterEventId }) => [windowBeforeEventId, windowAfterEventId])(moved.actions.at(-1).reason),
      [idOf(state, 'Lunch meeting'), idOf(state, 'School pickup')]
    );
  });

  test('no travel entered anywhere: nothing travel-aware is ever reported, however many gaps there are', () => {
    const state = household({
      events: [
        { title: 'A', start: [9], end: [9, 30] },
        { title: 'B', start: [10, 30], end: [11] },
        { title: 'C', start: [12], end: [13] },
      ],
    });
    const { issues } = verdict(state);
    assert.equal(issues.transitionConflict, null);
    assert.equal(issues.primary, null);
  });
});

describe('Build 3 audit — the travel-aware card explains itself honestly (B3-AUD-015, B3-AUD-016)', () => {
  const travelDay = () =>
    household({
      events: [
        { title: 'Work', start: [9], end: [14] },
        { title: 'Pickup', start: [15, 30], end: [15, 45], travelMinutesBefore: 60 },
      ],
      tasks: [{ title: 'Library', durationMinutes: 20, plan: timed(14, 10) }],
    });

  test('the candidate numbers and reason use the travel-aware buffer, never a negative shortfall', () => {
    const { issues } = verdict(travelDay());
    const [candidate] = issues.focus.candidates;
    assert.deepEqual([candidate.currentBufferMinutes, candidate.projectedBufferMinutes], [10, 30]);
    assert.match(candidate.reason, /60 minutes of travel and preparation you entered, 10 minutes is 35 short of the 45/);
    assert.doesNotMatch(candidate.reason, /-\d+ short/);
  });

  test('"Keep today as planned" is recorded for a travel-aware verdict even though the raw gap looks open', () => {
    const state = travelDay();
    assert.equal(verdict(state).assessment.status, 'balanced');
    const kept = keepDailyLoadPlan(state, ctx(), idOf(state, 'Library'));
    assert.notEqual(kept, state);
    assert.equal(dailyLoadDecisionFor(kept, DAY).decision, 'kept');
    assert.equal(kept.actions.at(-1).reason.bufferMinutes, 10);
  });
});

describe('Build 3 audit — overlaps involving a flexible event (B3-AUD-006)', () => {
  const doubleBooked = () =>
    household({
      events: [
        { title: 'Pickup', start: [15], end: [15, 30] },
        { title: 'Dry cleaning', start: [15], end: [15, 45], commitment: 'flexible' },
      ],
    });

  test('a double-booked flexible errand is flagged, never "room between them"', () => {
    const { issues, header, meter } = verdict(doubleBooked());
    assert.equal(issues.primary.kind, 'overlap');
    assert.equal(issues.primary.movableEventId, idOf(doubleBooked(), 'Dry cleaning'));
    assert.equal(issues.tier, 'overloaded');
    assert.equal(header, 'Two of today’s commitments overlap.');
    assert.deepEqual([meter.level, meter.caption], ['full', 'Two commitments overlap.']);
  });

  test('only the flexible side can be moved; the fixed pickup never moves', () => {
    const state = doubleBooked();
    const pickup = idOf(state, 'Pickup');
    assert.equal(approveMoveEvent(state, ctx(), pickup), state);

    const moved = approveMoveEvent(state, ctx(), idOf(state, 'Dry cleaning'));
    assert.equal(moved.events.find((e) => e.id === pickup).startsAt, at(15));
    assert.equal(moved.actions.at(-1).reason.bufferMinutes, -30, 'the overlap is recorded as a negative buffer');
    const view = dailyLoadDecisionFor(moved, DAY);
    assert.deepEqual([view.decision, view.appliedMove.eventTitle, view.appliedMove.otherTitle, view.appliedMove.overlapped], ['moved', 'Dry cleaning', 'Pickup', true]);
    assert.equal(verdict(moved).issues.primary, null);
  });

  test('keeping the plan is recorded; protecting the errand turns the verdict into a notice', () => {
    const state = doubleBooked();
    assert.equal(dailyLoadDecisionFor(keepDailyLoadPlan(state, ctx(), null), DAY).decision, 'kept');

    const protectedState = approveProtectItem(state, ctx(), { targetType: 'event', targetId: idOf(state, 'Dry cleaning') });
    const { issues } = verdict(protectedState);
    assert.equal(issues.primary.kind, 'overlap');
    assert.equal(issues.primary.movableEventId, null);
    assert.equal(approveMoveEvent(protectedState, ctx(), idOf(state, 'Dry cleaning')), protectedState);
  });

  test('two flexible events overlapping are a notice: Her Keys does not pick one', () => {
    const state = household({
      events: [
        { title: 'Errand A', start: [11], end: [12], commitment: 'flexible' },
        { title: 'Errand B', start: [11, 30], end: [12, 30], commitment: 'flexible' },
      ],
    });
    const { issues } = verdict(state);
    assert.equal(issues.primary.kind, 'overlap');
    assert.equal(issues.primary.movableEventId, null);
    assert.equal(approveMoveEvent(state, ctx(), idOf(state, 'Errand A')), state);
    assert.equal(keepDailyLoadPlan(state, ctx(), null), state, 'nothing was offered, so there is nothing to decline');
  });
});

describe('Build 3 audit — capacity counts all of today’s work (B3-AUD-007)', () => {
  const longShift = (tasks) => household({ events: [{ title: 'Shift', start: [6], end: [21] }], tasks });

  test('work due today that cannot fit is flagged, with nothing offered to drop', () => {
    const state = longShift([{ title: 'Taxes', durationMinutes: 180, dueDate: DAY }]);
    const { issues, header } = verdict(state);
    assert.equal(issues.primary.kind, 'capacity_pressure');
    assert.deepEqual([issues.primary.availableMinutes, issues.primary.neededMinutes, issues.primary.pressureMinutes], [60, 180, 120]);
    assert.equal(issues.primary.largestTaskId, null);
    assert.equal(header, 'Today has more on it than it can hold.');

    const taxes = idOf(state, 'Taxes');
    assert.equal(approveDropTask(state, ctx(), taxes), state);
    assert.equal(approveShortenTask(state, ctx(), taxes), state);
  });

  test('twenty hours of due work on a nearly empty calendar is not "room between them"', () => {
    const state = household({
      events: [{ title: 'One thing', start: [9], end: [9, 30] }],
      tasks: Array.from({ length: 10 }, (_, index) => ({ title: `Due ${index}`, durationMinutes: 120, dueDate: DAY })),
    });
    const { issues } = verdict(state);
    assert.equal(issues.primary.kind, 'capacity_pressure');
    assert.equal(issues.primary.neededMinutes, 1200);
  });

  test('flexible events use up the day too, and time shared by two events is counted once', () => {
    const flexibleDay = household({
      events: [{ title: 'Flexible block', start: [6], end: [21], commitment: 'flexible' }],
      tasks: [{ title: 'Planned', durationMinutes: 180, plan: { kind: 'day', date: DAY } }],
    });
    assert.equal(verdict(flexibleDay).issues.capacityPressure.availableMinutes, 60);

    const nested = household({
      events: [
        { title: 'Work', start: [6], end: [20] },
        { title: 'Dentist', start: [14], end: [15] },
      ],
      tasks: [{ title: 'Planned', durationMinutes: 150, plan: { kind: 'day', date: DAY } }],
    });
    assert.equal(verdict(nested).issues.capacityPressure.availableMinutes, 120, 'the dentist hour sits inside work and is not subtracted twice');
  });

  test('protecting the named task does not make the overload disappear', () => {
    const state = longShift([
      { title: 'Big', durationMinutes: 120, plan: { kind: 'day', date: DAY } },
      { title: 'Small', durationMinutes: 30, plan: { kind: 'day', date: DAY } },
    ]);
    assert.equal(verdict(state).issues.primary.largestTaskTitle, 'Big');
    const protectedState = approveProtectItem(state, ctx(), { targetType: 'task', targetId: idOf(state, 'Big') });
    const after = verdict(protectedState).issues.primary;
    assert.equal(after.kind, 'capacity_pressure');
    assert.equal(after.neededMinutes, 150);
    assert.equal(after.largestTaskTitle, 'Small', 'the next flexible task is offered instead');
  });

  test('drop and shorten only ever touch the named flexible task, once per day, and only while the verdict is showing', () => {
    const state = longShift([
      { title: 'Big', durationMinutes: 120, plan: { kind: 'day', date: DAY } },
      { title: 'Due bill', durationMinutes: 30, dueDate: DAY },
    ]);
    const big = idOf(state, 'Big');
    assert.equal(approveDropTask(state, ctx(), idOf(state, 'Due bill')), state);
    const shortened = approveShortenTask(state, ctx(), big);
    assert.equal(shortened.tasks.find((t) => t.id === big).durationMinutes, 30, '120 minus the 90-minute shortfall');
    assert.equal(approveDropTask(shortened, ctx(), big), shortened, 'one capacity decision per day');
    assert.equal(keepCapacityPlan(shortened, ctx()), shortened);

    const overlapNow = addEvent(state, ctx({ createId: () => 'evt-late' }), { title: 'Clash', categoryId: 'cat-kids', startsAt: at(20), endsAt: at(21, 30), commitment: 'fixed', scope: 'household' });
    assert.equal(verdict(overlapNow).issues.primary.kind, 'overlap');
    assert.equal(approveDropTask(overlapNow, ctx(), big), overlapNow, 'a capacity card that is no longer showing cannot drop anything');
  });
});

describe('Build 3 audit — One Move honors the whole verdict (B3-AUD-008)', () => {
  const cases = [
    ['a double booking', { events: [{ title: 'Pickup', start: [15], end: [15, 30] }, { title: 'Dentist', start: [15, 15], end: [16] }] }],
    ['a travel-aware conflict', { events: [{ title: 'Work', start: [9], end: [14] }, { title: 'Pickup', start: [15], end: [15, 15], travelMinutesBefore: 50 }] }],
    ['capacity pressure', { events: [{ title: 'Shift', start: [6], end: [21] }], tasks: [{ title: 'Due tonight', durationMinutes: 90, dueDate: DAY }] }],
  ];

  for (const [label, day] of cases) {
    test(`${label}: a move that adds work is withheld`, () => {
      let state = household({ ...day, tasks: [...(day.tasks ?? []), { title: 'Sort the garage', durationMinutes: 60, dueDate: DAY }] });
      assert.equal(verdict(state).issues.tier, 'overloaded', label);
      assert.equal(loadTierForDay(state, DAY), 'overloaded');
      state = resolveOneMoveForToday(state, ctx());
      assert.equal(oneMoveForDay(state, DAY).status, 'withheld');
    });
  }
});

describe('Build 3 audit — the same day always reads the same way (B3-AUD-013)', () => {
  const A = { title: 'A', start: [10], end: [10, 30] };
  const B = { title: 'B (flexible)', start: [11], end: [11, 30], commitment: 'flexible' };
  const C = { title: 'C (fixed)', start: [11], end: [12] };

  const titleOf = (state, id) => state.events.find((e) => e.id === id)?.title ?? null;

  test('entry order never changes the verdict, the transition it names, or what is offered', () => {
    const orders = [[A, B, C], [A, C, B], [C, B, A], [B, A, C], [C, A, B], [B, C, A]];
    const readings = orders.map((events) => {
      const state = household({ events });
      const { issues } = verdict(state);
      return JSON.stringify({
        kind: issues.primary.kind,
        pair: [titleOf(state, issues.primary.eventAId), titleOf(state, issues.primary.eventBId)],
        movable: titleOf(state, issues.primary.movableEventId),
        window: [issues.tightWindow.beforeTitle, issues.tightWindow.afterTitle, issues.tightWindow.bufferMinutes],
      });
    });
    assert.equal(new Set(readings).size, 1, readings.join('\n'));
  });

  test('two commitments starting together are a double booking; moving the flexible one leaves the transition read the same way', () => {
    const state = household({ events: [A, B, C] });
    assert.equal(verdict(state).issues.primary.kind, 'overlap');
    const moved = approveMoveEvent(state, ctx(), idOf(state, 'B (flexible)'));
    const after = verdict(moved).issues.primary;
    assert.deepEqual([after.kind, after.beforeTitle, after.afterTitle, after.bufferMinutes], ['tight_window', 'A', 'C (fixed)', 30]);
  });

  test('equally sized candidates are offered in the same order however the stored list happens to be arranged', () => {
    const state = household({
      events: [{ title: 'Pickup', start: [15], end: [15, 15] }, { title: 'Soccer', start: [16], end: [17] }],
      tasks: [
        { title: 'Call school', durationMinutes: 15, plan: timed(15, 20) },
        { title: 'Text coach', durationMinutes: 15, plan: timed(15, 40) },
      ],
    });
    const reversed = { ...state, tasks: [...state.tasks].reverse(), events: [...state.events].reverse() };
    const order = (s) => verdict(s).issues.focus.candidates.map((c) => c.task.id).join();
    assert.equal(verdict(state).issues.focus.candidates.length, 2);
    assert.equal(order(reversed), order(state));
  });
});

describe('Build 3 audit — one timing decision per day, events included (B3-AUD-014)', () => {
  const squeezed = () =>
    household({
      events: [
        { title: 'Pickup', start: [15], end: [15, 15] },
        { title: 'Errand', start: [15, 25], end: [15, 55], commitment: 'flexible' },
        { title: 'Pharmacy', start: [16, 5], end: [16, 20], commitment: 'flexible' },
      ],
      tasks: [{ title: 'Call back', durationMinutes: 10, plan: timed(16, 25) }],
    });

  test('an event move is the day’s decision: Today shows it, and nothing else is decided on top of it', () => {
    const state = squeezed();
    const moved = approveMoveEvent(state, ctx(), idOf(state, 'Errand'));
    assert.notEqual(moved, state);
    assert.equal(latestTransitionDecision(moved, DAY).type, 'daily_load.move_event');

    const view = dailyLoadDecisionFor(moved, DAY);
    assert.deepEqual([view.decision, view.appliedMove.eventTitle, view.appliedMove.overlapped], ['moved', 'Errand', false]);
    assert.equal(approveMoveEvent(moved, ctx(), idOf(state, 'Pharmacy')), moved);
    assert.equal(keepDailyLoadPlan(moved, ctx(), null), moved);
  });

  test('after a task move, an event move is refused the same day', () => {
    const state = household({
      events: [
        { title: 'Pickup', start: [15], end: [15, 15] },
        { title: 'Errand', start: [15, 45], end: [16, 15], commitment: 'flexible' },
      ],
      tasks: [{ title: 'Call back', durationMinutes: 10, plan: timed(15, 20) }],
    });
    const moved = approveDailyLoadMove(state, ctx(), idOf(state, 'Call back'));
    assert.notEqual(moved, state);
    assert.equal(approveMoveEvent(moved, ctx(), idOf(state, 'Errand')), moved);
  });
});

describe('Build 3 audit — Tomorrow Preview counts only tomorrow (B3-AUD-010)', () => {
  test('overdue items and today’s open items are not "due tomorrow"', () => {
    let state = createEmptyState(TZ);
    const context = ctx();
    state = addTask(state, context, { title: 'Overdue form', categoryId: 'cat-kids', dueDate: '2026-09-15', scope: 'household' });
    state = addTask(state, context, { title: 'Due today', categoryId: 'cat-money', dueDate: DAY, scope: 'household' });
    const empty = tomorrowPreview(state, ctx());
    assert.deepEqual([empty.dueTaskCount, empty.headline], [0, 'Nothing fixed on the calendar yet.']);

    state = addTask(state, context, { title: 'Due tomorrow', categoryId: 'cat-money', dueDate: NEXT_DAY, scope: 'household' });
    const one = tomorrowPreview(state, ctx());
    assert.deepEqual([one.dueTaskCount, one.headline], [1, '1 thing due tomorrow.']);
  });

  test('a double booking tomorrow that involves a flexible event is named, and nothing is written', () => {
    let state = createEmptyState(TZ);
    const context = ctx();
    const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(NEXT_DAY, hour * 60 + minute, TZ));
    state = addEvent(state, context, { title: 'Dentist', categoryId: 'cat-kids', startsAt: at(15), endsAt: at(16), commitment: 'fixed', scope: 'household' });
    state = addEvent(state, context, { title: 'Errand', categoryId: 'cat-home', startsAt: at(15, 30), endsAt: at(16, 30), commitment: 'flexible', scope: 'household' });
    const before = JSON.stringify(state);
    assert.equal(tomorrowPreview(state, ctx()).headline, 'Dentist and Errand overlap tomorrow.');
    assert.equal(JSON.stringify(state), before);
  });
});
