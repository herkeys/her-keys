/**
 * Feature 04 scenarios that are about what Systems READS and DECIDES from canonical state:
 * A · AB · AC · AD · AE · AF · AH · F · G · L · N (with O/P/Q) · R · S · T · U.
 * Mutation scenarios live in scenarios.write.test.mjs.
 *
 * Every scenario: canonical fixture → foundation inputs → view-model assertions → structural
 * evidence compared against its committed artifact. Scenario prose is not coverage; assertions are.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HouseholdSystemSchema } from '../../src/domain/state.ts';
import { addPerson, delegate } from '../../src/domain/responsibility.ts';
import { addDependency, addRecurrence, skipOccurrence } from '../../src/domain/structure.ts';
import { logicalDateAt, weekdayOf, zonedTimeToEpochMs, addDays, toInstant } from '../../src/domain/logicalDay.ts';
import { PREVIEW_COUNT, previewOccurrences, scheduleViewFor } from '../../src/features/systems/model/schedule.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { evidenceOfDetail, evidenceOfHub } from '../../src/features/systems/model/evidence.ts';
import { systemFingerprint } from '../../src/features/systems/model/fingerprint.ts';
import { projectSystemsHub } from '../../src/features/systems/model/hub.ts';
import { durationFor } from '../../src/features/systems/model/steps.ts';
import { assertEvidence, assertValid, ctxAt, CHILDREN, DAY, MORNING, AUTOMATION, ruleRow, realHousehold, snapshot, stepRow, systemRow, T0, TZ, USER, withRows, demoHousehold } from './support/canon.mjs';

const CLOCK = { nowMs: MORNING, today: DAY };
const canonicalOf = (state, id) => JSON.parse(systemFingerprint(state, id));
const detailOf = (state, id, clock = CLOCK) => projectSystemDetail(state, id, clock);

describe('SCENARIO A — empty Systems: calm, known, and offers to create', () => {
  test('a real household with no Systems is KNOWN empty, and creation is offered', () => {
    const hub = projectSystemsHub(snapshot(realHousehold()));
    assert.deepEqual(hub.availability, { kind: 'ready', notice: null });
    assert.equal(hub.isEmpty, true);
    assert.equal(hub.canCreate, true);
    assert.deepEqual(hub.items, []);
    assertEvidence('A-empty', { scenario: 'A', view: evidenceOfHub(hub) });
  });
});

describe('SCENARIO AB — loading is not empty', () => {
  test('until state is known there is no empty state and no create prompt', () => {
    for (const status of ['unhydrated', 'hydrating']) {
      const hub = projectSystemsHub(snapshot(null, { status, today: null }));
      assert.deepEqual(hub.availability, { kind: 'loading' }, status);
      assert.equal(hub.isEmpty, false, `${status} must never read as empty`);
      assert.equal(hub.canCreate, false, `${status} must never offer creation`);
    }
    // even "ready" with no state yet is not a known-empty household
    const halfway = projectSystemsHub(snapshot(null, { status: 'ready', today: null }));
    assert.equal(halfway.isEmpty, false);
    // and a state that is PRESENT but not yet settled must not be read as known-empty either: the status decides, not the state
    for (const status of ['unhydrated', 'hydrating']) {
      const early = projectSystemsHub(snapshot(realHousehold(), { status }));
      assert.deepEqual([early.availability, early.isEmpty, early.canCreate, early.items], [{ kind: 'loading' }, false, false, []], `${status} with a state already present`);
    }
    assertEvidence('AB-loading', { scenario: 'AB', view: evidenceOfHub(projectSystemsHub(snapshot(null, { status: 'hydrating', today: null }))) });
  });
});

describe('SCENARIO AC — no authoritative Systems over unrecovered state', () => {
  const standIn = withRows(demoHousehold(), {}); // a stand-in session state that DOES hold Systems

  test('a session that cannot save shows no Systems and offers no creation, whatever its stand-in state holds', () => {
    assert.ok(standIn.systems.length > 0, 'the stand-in state really holds Systems');
    const cases = [
      ['future_version', 'newer_version'],
      ['read_failed', 'unreadable'],
      ['mode_mismatch', 'memory_only'],
    ];
    const seen = {};
    for (const [reason, expected] of cases) {
      const hub = projectSystemsHub(snapshot(standIn, { status: 'recovery', recovery: { reason, quarantined: false }, persistence: 'disabled' }));
      assert.deepEqual(hub.availability, { kind: 'unavailable', reason: expected }, reason);
      assert.deepEqual(hub.items, [], `${reason}: nothing authoritative to show`);
      assert.equal(hub.isEmpty, false, `${reason}: unknown is not empty`);
      assert.equal(hub.canCreate, false, `${reason}: a save here would not be durable`);
      seen[reason] = evidenceOfHub(hub);
    }
    assertEvidence('AC-recovery', { scenario: 'AC', unavailable: seen, startedOver: evidenceOfHub(projectSystemsHub(snapshot(realHousehold(), { status: 'recovery', recovery: { reason: 'invalid_state', quarantined: true } }))) });
  });

  test('a normal start-over recovery: the fresh state IS authoritative, with a calm notice', () => {
    const hub = projectSystemsHub(snapshot(realHousehold(), { status: 'recovery', recovery: { reason: 'invalid_state', quarantined: true } }));
    assert.deepEqual(hub.availability, { kind: 'ready', notice: 'started_over' });
    assert.equal(hub.canCreate, true);
    assert.equal(hub.isEmpty, true);
  });
});

describe('SCENARIO L — a System without a schedule is complete', () => {
  test('no rule: valid, no invented schedule, no "next" claim', () => {
    const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1', name: 'Grocery reset', description: 'What we always buy.' })] });
    const view = detailOf(state, 'sys-1');
    assert.equal(view.schedule.state, 'none');
    assert.equal(view.schedule.nextExpected, null);
    assert.equal(view.schedule.noNextReason, 'no_schedule');
    assert.equal(view.schedule.ruleId, null);
    assert.equal(state.recurrences.length, 0, 'nothing was created to give it a schedule');
    assertEvidence('L-no-recurrence', { scenario: 'L', canonical: canonicalOf(state, 'sys-1'), view: evidenceOfDetail(view) });
  });
});

describe('SCENARIO N (with O · P · Q) — a definition is a blueprint, not a run', () => {
  const state = withRows(realHousehold(), {
    systems: [systemRow({ id: 'sys-1', name: 'School-night reset' })],
    systemSteps: [
      stepRow({ id: 'st-1', systemId: 'sys-1', position: 0, title: 'Pack uniform' }),
      stepRow({ id: 'st-2', systemId: 'sys-1', position: 10, title: 'Fill water bottle' }),
      stepRow({ id: 'st-3', systemId: 'sys-1', position: 20, title: 'Put bag by door' }),
    ],
  });

  test('reusable steps carry no completion state and the definition offers no run', () => {
    const view = detailOf(state, 'sys-1');
    assert.deepEqual(view.steps.map((s) => s.title), ['Pack uniform', 'Fill water bottle', 'Put bag by door']);
    for (const step of view.steps) {
      assert.deepEqual(Object.keys(step).sort(), ['dependencyRefs', 'effortMinutes', 'id', 'order', 'provenance', 'title'], 'a step has no done / completed / progress field');
    }
    assert.deepEqual(view.run, { supported: false, currentRef: null, progress: null, reason: 'no_run_semantics' });
  });

  test('O · P · Q — run, restart and template-edit-during-run are SAFE-UNAVAILABLE, with the reason', () => {
    const actions = Object.fromEntries(detailOf(state, 'sys-1').actions.map((a) => [a.action, a]));
    assert.deepEqual(actions.start_run, { action: 'start_run', available: false, reason: 'no_run_semantics' });
    assert.deepEqual(actions.complete_step, { action: 'complete_step', available: false, reason: 'no_step_completion_semantics' });
    // no run / step-completion collection exists to hold progress, so nothing can be durable or restarted
    for (const key of ['runs', 'stepCompletions', 'occurrences']) assert.equal(key in state, false, `AppState has no ${key}`);
    assertEvidence('N-template-not-run', { scenario: 'N/O/P/Q', canonical: canonicalOf(state, 'sys-1'), view: evidenceOfDetail(detailOf(state, 'sys-1')) });
  });
});

describe('SCENARIO T — unknown step duration is never zero', () => {
  const build = (efforts) =>
    withRows(realHousehold(), {
      systems: [systemRow({ id: 'sys-1', name: 'Morning launch' })],
      systemSteps: efforts.map((effortMinutes, i) => stepRow({ id: `st-${i + 1}`, systemId: 'sys-1', position: i * 10, title: `Step ${i + 1}`, effortMinutes })),
    });

  test('some steps estimated: a floor, never a total', () => {
    const state = build([5, null, 10]);
    const view = detailOf(state, 'sys-1');
    assert.deepEqual(view.duration, { kind: 'partial', atLeastMinutes: 15, estimatedSteps: 2, totalSteps: 3 });
    assert.ok(view.unknownStates.some((u) => u.field === 'duration' && u.reason === 'some_steps_have_no_estimate'));
    assertEvidence('T-unknown-duration', { scenario: 'T', canonical: canonicalOf(state, 'sys-1'), view: evidenceOfDetail(view) });
  });

  test('every step estimated → a total; none → unknown; a stated duration is used only when no step has one', () => {
    assert.deepEqual(durationFor([{ effortMinutes: 5 }, { effortMinutes: 0 }, { effortMinutes: 10 }], null), { kind: 'total', minutes: 15, statedMinutes: null });
    assert.deepEqual(durationFor([{ effortMinutes: null }, { effortMinutes: null }], null), { kind: 'unknown' });
    assert.deepEqual(durationFor([], null), { kind: 'unknown' });
    assert.deepEqual(durationFor([{ effortMinutes: null }], 20), { kind: 'stated', minutes: 20 });
    assert.deepEqual(durationFor([{ effortMinutes: 5 }, { effortMinutes: null }], 20), { kind: 'partial', atLeastMinutes: 5, estimatedSteps: 1, totalSteps: 2 }, 'a stated total does not paper over an unestimated step');
    assert.equal(durationFor([{ effortMinutes: 0 }], null).kind, 'total', 'a KNOWN zero is known');
  });
});

describe('SCENARIO U — order is not dependency', () => {
  const ctx = ctxAt();
  let state = withRows(realHousehold(), {
    systems: [systemRow({ id: 'sys-a', name: 'Morning launch' }), systemRow({ id: 'sys-b', name: 'School-night reset' }), systemRow({ id: 'sys-c', name: 'Grocery reset' })],
    systemSteps: [
      stepRow({ id: 'a-1', systemId: 'sys-a', position: 0, title: 'One' }),
      stepRow({ id: 'a-2', systemId: 'sys-a', position: 10, title: 'Two' }),
      stepRow({ id: 'a-3', systemId: 'sys-a', position: 20, title: 'Three' }),
    ],
  });
  const linked = addDependency(state, ctx, { relation: 'requires', from: { kind: 'system', id: 'sys-a' }, to: { kind: 'system', id: 'sys-b' } });
  assert.equal(linked.refusal, null);
  state = assertValid(linked.state);

  test('an explicit edge is shown, neutrally, from both ends', () => {
    assert.deepEqual(detailOf(state, 'sys-a').needs, [{ kind: 'system', id: 'sys-b', label: 'School-night reset' }]);
    assert.deepEqual(detailOf(state, 'sys-b').neededBy, [{ kind: 'system', id: 'sys-a', label: 'Morning launch' }]);
  });

  test('later steps do not become dependencies of earlier ones, and no step carries a dependency', () => {
    const view = detailOf(state, 'sys-a');
    assert.deepEqual(view.steps.map((s) => s.dependencyRefs), [[], [], []]);
    assert.deepEqual(detailOf(state, 'sys-c').needs, [], 'a System with no edge needs nothing');
    assert.equal(state.dependencies.length, 1, 'ordering created no edge');
    assertEvidence('U-dependency', { scenario: 'U', canonical: canonicalOf(state, 'sys-a'), view: evidenceOfDetail(view) });
  });
});

describe('SCENARIO F — recurrence is the foundation’s primitive, derived not materialized', () => {
  const shapes = [
    ['daily every 2 days', { frequency: 'daily', interval: 2 }, '2026-09-16'],
    ['weekly Monday and Thursday', { frequency: 'weekly', byWeekday: [4, 1] }, '2026-09-17'],
    ['monthly on the 31st clamps to month end', { frequency: 'monthly', byMonthDay: 31, anchorDate: '2026-01-31' }, '2026-09-30'],
    ['yearly on 29 Feb falls back to 28 Feb', { frequency: 'yearly', anchorDate: '2024-02-29' }, '2027-02-28'],
  ];

  test('each supported shape derives the right next date without writing anything', () => {
    for (const [label, over, expected] of shapes) {
      const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })], recurrences: [ruleRow(over)] });
      const before = JSON.stringify(state);
      const view = scheduleViewFor(state, 'sys-1', DAY);
      assert.equal(view.nextExpected, expected, label);
      assert.equal(JSON.stringify(state), before, `${label}: projecting must not change canonical state`);
      assert.equal(state.recurrences.length, 1, `${label}: no occurrence rows were fabricated`);
    }
  });

  test('unsupported-in-UI shapes are preserved and never given a date', () => {
    for (const over of [{ trigger: 'after_completion', frequency: 'weekly' }, { trigger: 'manual', frequency: null }]) {
      const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })], recurrences: [ruleRow(over)] });
      const view = scheduleViewFor(state, 'sys-1', DAY);
      assert.equal(view.nextExpected, null);
      assert.equal(view.noNextReason, 'not_calendar_based');
      assert.equal(view.trigger, over.trigger, 'the stored shape is carried verbatim');
    }
  });

  test('a paused schedule has no next date and says why; a stopped one likewise', () => {
    for (const [status, reason] of [['paused', 'paused'], ['ended', 'stopped']]) {
      const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })], recurrences: [ruleRow({ status })] });
      const view = scheduleViewFor(state, 'sys-1', DAY);
      assert.equal(view.state, status);
      assert.equal(view.nextExpected, null);
      assert.equal(view.noNextReason, reason);
    }
  });

  test('evidence for the weekly shape', () => {
    const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1', name: 'Sunday reset' })], recurrences: [ruleRow({ byWeekday: [0], timeOfDayMinutes: 570 })] });
    assert.equal(weekdayOf('2026-09-20'), 0);
    const view = detailOf(state, 'sys-1');
    assert.equal(view.schedule.nextExpected, '2026-09-20');
    assertEvidence('F-recurrence-weekly', { scenario: 'F', canonical: canonicalOf(state, 'sys-1'), view: evidenceOfDetail(view) });
  });
});

describe('SCENARIO G — the recurrence preview is bounded and presentation-only', () => {
  const rule = { trigger: 'schedule', frequency: 'weekly', interval: 1, byWeekday: [0], byMonthDay: null, anchorDate: DAY, endsOn: null, occurrenceCount: null };
  const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })] });

  test('exactly the next three expected dates, nothing stored', () => {
    const before = JSON.stringify(state);
    assert.deepEqual(previewOccurrences(state, rule, 'sys-1', DAY), ['2026-09-20', '2026-09-27', '2026-10-04']);
    assert.equal(JSON.stringify(state), before);
    assert.equal(PREVIEW_COUNT, 3);
    assert.equal(previewOccurrences(state, rule, 'sys-1', DAY, 500).length, 3, 'a caller cannot ask for more than the bound');
  });

  test('it honors the exceptions she recorded, because it uses the foundation’s own derivation', () => {
    const skipped = skipOccurrence(withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1' })] }), ctxAt(), { kind: 'system', id: 'sys-1' }, '2026-09-20');
    assert.deepEqual(previewOccurrences(skipped, rule, 'sys-1', DAY), ['2026-09-27', '2026-10-04', '2026-10-11']);
  });

  test('it shows fewer when the rule ends, none for a manual rule', () => {
    assert.deepEqual(previewOccurrences(state, { ...rule, endsOn: '2026-09-25' }, 'sys-1', DAY), ['2026-09-20']);
    assert.deepEqual(previewOccurrences(state, { ...rule, trigger: 'manual', frequency: null, byWeekday: null }, 'sys-1', DAY), []);
  });
});

describe('SCENARIO R — recurrence follows the HOUSEHOLD zone and logical day, not the device', () => {
  const instant = Date.UTC(2026, 8, 21, 3, 30); // Mon 03:30 UTC == Sun 22:30 in Chicago

  test('the same instant is a different logical day in a different household zone, and next-expected follows it', () => {
    const rule = ruleRow({ byWeekday: [0], anchorDate: '2026-09-01', timezone: 'America/Chicago' });
    const chicago = withRows(realHousehold({ timeZone: 'America/Chicago' }), { systems: [systemRow({ id: 'sys-1' })], recurrences: [{ ...rule, timezone: 'America/Chicago' }] });
    const utc = withRows(realHousehold({ timeZone: 'UTC' }), { systems: [systemRow({ id: 'sys-1' })], recurrences: [{ ...rule, timezone: 'UTC' }] });

    const chicagoToday = logicalDateAt(instant, chicago.user.timezone);
    const utcToday = logicalDateAt(instant, utc.user.timezone);
    assert.equal(chicagoToday, '2026-09-20');
    assert.equal(utcToday, '2026-09-21');
    assert.equal(scheduleViewFor(chicago, 'sys-1', chicagoToday).nextExpected, '2026-09-20', 'still Sunday at 22:30 in her household');
    assert.equal(scheduleViewFor(utc, 'sys-1', utcToday).nextExpected, '2026-09-27');
    assertEvidence('R-recurrence-timezone', {
      scenario: 'R',
      instant: toInstant(instant),
      households: {
        'America/Chicago': { logicalDay: chicagoToday, nextExpected: scheduleViewFor(chicago, 'sys-1', chicagoToday).nextExpected },
        UTC: { logicalDay: utcToday, nextExpected: scheduleViewFor(utc, 'sys-1', utcToday).nextExpected },
      },
    });
  });
});

describe('SCENARIO S — DST: dates are calendar dates; wall-clock times go through the established utility', () => {
  const chicago = 'America/Chicago';

  test('a daily rule across spring-forward and fall-back never skips or repeats a day', () => {
    for (const [from, days] of [['2026-03-06', 6], ['2026-10-30', 6]]) {
      const state = withRows(realHousehold({ timeZone: chicago }), { systems: [systemRow({ id: 'sys-1' })], recurrences: [ruleRow({ frequency: 'daily', anchorDate: from, timezone: chicago })] });
      const seen = [];
      let cursor = from;
      for (let i = 0; i < days; i += 1) {
        const view = scheduleViewFor(state, 'sys-1', cursor);
        seen.push(view.nextExpected);
        cursor = addDays(view.nextExpected, 1);
      }
      assert.deepEqual(seen, Array.from({ length: days }, (_, i) => addDays(from, i)), `${from}: one occurrence per calendar day`);
    }
  });

  test('a weekly Sunday 02:30 rule keeps its wall-clock and its Sundays; the utility resolves the gap and the repeat', () => {
    const state = withRows(realHousehold({ timeZone: chicago }), {
      systems: [systemRow({ id: 'sys-1' })],
      recurrences: [ruleRow({ byWeekday: [0], anchorDate: '2026-03-01', timeOfDayMinutes: 150, timezone: chicago })],
    });
    const at = (d) => scheduleViewFor(state, 'sys-1', d);
    assert.equal(at('2026-03-02').nextExpected, '2026-03-08', 'the spring-forward Sunday is still Sunday');
    assert.equal(at('2026-03-09').nextExpected, '2026-03-15');
    assert.equal(at('2026-03-02').timeOfDayMinutes, 150, 'the rule keeps its wall-clock; Feature 04 never converts it');
    assert.equal(at('2026-03-02').timezone, chicago);

    // The conversion is the foundation's, and its documented behaviour is what the rule relies on:
    assert.equal(toInstant(zonedTimeToEpochMs('2026-03-08', 150, chicago)), '2026-03-08T08:30:00.000Z', 'a time that never happens moves FORWARD past the gap (02:30 -> 03:30 CDT)');
    assert.equal(toInstant(zonedTimeToEpochMs('2026-11-01', 90, chicago)), '2026-11-01T06:30:00.000Z', 'on fall-back the EARLIER of the two 01:30s is used');
    assertEvidence('S-dst', {
      scenario: 'S',
      zone: chicago,
      weeklySundayAt0230: { springForwardDay: '2026-03-08', instant: '2026-03-08T08:30:00.000Z', note: 'nonexistent time moves forward' },
      fallBackDay: { day: '2026-11-01', at0130: '2026-11-01T06:30:00.000Z', note: 'earlier of the repeated times' },
    });
  });
});

describe('SCENARIO AH — hub ordering: grounded in facts, no score, deterministic ties', () => {
  const ctx = ctxAt();
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  function fixture() {
    let state = withRows(realHousehold({ children: CHILDREN }), {
      systems: [
        systemRow({ id: 'sys-attn', name: 'Zebra pickup handoff' }),
        systemRow({ id: 'sys-daily', name: 'Morning launch' }),
        systemRow({ id: 'sys-tie-a', name: 'Sunday meal prep' }),
        systemRow({ id: 'sys-tie-b', name: 'Sunday reset' }),
        systemRow({ id: 'sys-monthly', name: 'Monthly bill review' }),
        systemRow({ id: 'sys-paused', name: 'Summer swim bag' }),
        systemRow({ id: 'sys-none-a', name: 'alpha closet' }),
        systemRow({ id: 'sys-none-b', name: 'Beta closet' }),
      ],
      recurrences: [
        ruleRow({ id: 'r-daily', about: { kind: 'system', id: 'sys-daily' }, frequency: 'daily' }),
        ruleRow({ id: 'r-tie-a', about: { kind: 'system', id: 'sys-tie-a' }, byWeekday: [0] }),
        ruleRow({ id: 'r-tie-b', about: { kind: 'system', id: 'sys-tie-b' }, byWeekday: [0] }),
        ruleRow({ id: 'r-monthly', about: { kind: 'system', id: 'sys-monthly' }, frequency: 'monthly', byMonthDay: 28, anchorDate: '2026-09-01' }),
        ruleRow({ id: 'r-paused', about: { kind: 'system', id: 'sys-paused' }, status: 'paused' }),
      ],
    });
    // a request she made of Josie, due an answer in an hour — nobody answered
    state = delegate(state, ctx, { about: { kind: 'system', id: 'sys-attn' }, to: { kind: 'child', id: 'child-1' }, ackWithinMinutes: 60 });
    return assertValid(state);
  }

  test('needs-attention first, then soonest next date, then the rest by name — ties stay put', () => {
    const state = fixture();
    const hub = projectSystemsHub(snapshot(state, { nowMs: MORNING + TWO_HOURS }));
    assert.deepEqual(
      hub.items.map((i) => i.id),
      ['sys-attn', 'sys-daily', 'sys-tie-a', 'sys-tie-b', 'sys-monthly', 'sys-none-a', 'sys-none-b', 'sys-paused']
    );
    assert.equal(hub.items[0].needsAttention, true);
    assert.equal(hub.items.filter((i) => i.needsAttention).length, 1);
    assert.deepEqual(hub.items.map((i) => i.schedule.nextExpected), [null, '2026-09-16', '2026-09-20', '2026-09-20', '2026-09-28', null, null, null]);
    assert.ok(!('score' in hub.items[0]) && !('rank' in hub.items[0]) && !('priority' in hub.items[0]), 'no hidden numeric rank');
    assertEvidence('AH-hub-ordering', { scenario: 'AH', view: evidenceOfHub(hub) });
  });

  test('the same facts always give the same order, and an unanswered request is only "attention" once its answer is overdue', () => {
    const state = fixture();
    const now = projectSystemsHub(snapshot(state, { nowMs: MORNING + TWO_HOURS })).items.map((i) => i.id);
    const again = projectSystemsHub(snapshot({ ...state, systems: [...state.systems].reverse() }, { nowMs: MORNING + TWO_HOURS })).items.map((i) => i.id);
    assert.deepEqual(again, now, 'storage order cannot change the presentation order');
    const early = projectSystemsHub(snapshot(state, { nowMs: MORNING + 30 * 60 * 1000 }));
    assert.equal(early.items.some((i) => i.needsAttention), false, 'not overdue yet: it was asked for, not neglected');
  });
});

describe('SCENARIO AF — execution / outcome claim truth', () => {
  const baseState = () =>
    withRows(realHousehold(), {
      systems: [systemRow({ id: 'sys-1', name: 'Bill-review routine' }), systemRow({ id: 'sys-2', name: 'Other routine' })],
      recurrences: [ruleRow()],
      systemSteps: [stepRow({ id: 'st-1', systemId: 'sys-1', position: 0, title: 'Pay electric bill' })],
    });

  test('AF.1 — a recurring System with no execution rows claims nothing was sent, run or paid', () => {
    const view = detailOf(baseState(), 'sys-1');
    assert.deepEqual(view.actionEvidence, []);
    assert.equal(view.schedule.state, 'active');
    assert.deepEqual(Object.keys(view.steps[0]).includes('status'), false, 'a step has no execution status');
  });

  test('AF.2 — real evidence is described exactly as recorded; execution is not success; other Systems and steps gain nothing', () => {
    const intent = (id, aboutId) => ({
      id, category: 'financial_action', about: { kind: 'system', id: aboutId }, consequence: 'critical', reversibility: 'irreversible', summaryCode: 'pay_utility',
      amount: { amountMinor: 4200, currency: 'USD', direction: 'outflow' }, provider: null, permittedMode: 'ask_approval', createdAt: T0, expiresAt: null, provenance: AUTOMATION, scope: 'personal',
    });
    const decision = (id, intentId) => ({ id, intentId, decision: 'approved', basis: 'explicit', authorityId: null, decidedAt: T0, createdAt: T0, provenance: USER, scope: 'personal' });
    const execution = (id, intentId, decisionId, over = {}) => ({
      id, intentId, decisionId, authorityId: null, attempt: 1, attemptedAt: T0, provider: null, externalActionId: null, externalReferenceId: null, result: 'failed', errorClass: 'transient',
      reversibility: 'irreversible', compensationCode: null, compensatesExecutionId: null, createdAt: T0, provenance: AUTOMATION, scope: 'personal', ...over,
    });

    let state = baseState();
    state = { ...state, intents: [intent('i-1', 'sys-1'), intent('i-2', 'sys-1'), intent('i-3', 'sys-2')], decisions: [decision('d-1', 'i-1')], executions: [execution('e-1', 'i-1', 'd-1')], outcomes: [] };
    assertValid(state, 'AF fixture');

    const failed = detailOf(state, 'sys-1');
    assert.equal(failed.actionEvidence.length, 2);
    const first = failed.actionEvidence[0];
    assert.equal(first.decision, 'approved');
    assert.deepEqual(first.attempts.map((a) => a.result), ['failed'], 'an attempt that failed is recorded as failed — not as done');
    assert.deepEqual([first.stage, first.latestOutcome], ['failed', null], 'the foundation derives the stage: a failed attempt is never presented as succeeded');
    assert.equal(failed.actionEvidence[1].stage, 'proposed', 'and an unanswered proposal is only a proposal');
    assert.deepEqual(first.outcomes, [], 'no outcome was observed, so none is claimed');
    assert.equal(failed.actionEvidence[1].decision, null, 'a proposal she has not answered is only a proposal');
    assert.deepEqual(failed.actionEvidence[1].attempts, [], 'and nothing was attempted for it');
    assert.equal(detailOf(state, 'sys-2').actionEvidence.length, 1, 'an intent about another System does not leak across');
    assert.deepEqual(failed.steps.map((s) => Object.keys(s).includes('status')), [false], 'the step "Pay electric bill" gained no execution status');

    const done = {
      ...state,
      executions: [execution('e-1', 'i-1', 'd-1', { result: 'succeeded', errorClass: 'none' })],
      outcomes: [{ id: 'o-1', executionId: 'e-1', kind: 'verified', observedAt: T0, createdAt: T0, provenance: AUTOMATION, scope: 'personal' }],
    };
    assertValid(done, 'AF fixture (succeeded)');
    const ok = detailOf(done, 'sys-1').actionEvidence[0];
    assert.deepEqual(ok.attempts.map((a) => a.result), ['succeeded']);
    assert.deepEqual(ok.outcomes.map((o) => o.kind), ['verified']);
    assert.deepEqual([ok.stage, ok.latestOutcome], ['succeeded', 'verified']);
    assertEvidence('AF-execution-claims', { scenario: 'AF.2', failedAttempt: evidenceOfDetail(failed).system.actionEvidence, succeededAndVerified: evidenceOfDetail(detailOf(done, 'sys-1')).system.actionEvidence });
  });
});

describe('SCENARIO AD — a large System', () => {
  test('90 steps project in order, in one list, with an honest duration', () => {
    const steps = Array.from({ length: 90 }, (_, i) => stepRow({ id: `st-${i + 1}`, systemId: 'sys-1', position: i * 10, title: `Step ${i + 1}`, effortMinutes: i % 3 === 0 ? null : 2 }));
    const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-1', name: 'Big reset' })], systemSteps: steps });
    const view = detailOf(state, 'sys-1');
    assert.equal(view.steps.length, 90);
    assert.deepEqual(view.steps.map((s) => s.order), Array.from({ length: 90 }, (_, i) => i + 1));
    assert.equal(view.duration.kind, 'partial');
    assertEvidence('AD-large-system', {
      scenario: 'AD',
      steps: view.steps.length,
      first: view.steps[0].title,
      last: view.steps.at(-1).title,
      duration: view.duration,
    });
  });
});

describe('SCENARIO AE — cross-domain System: NOT-APPLICABLE at the fork', () => {
  test('a System has exactly ONE area; cross-domain relations exist only as dependencies (Scenario U)', () => {
    const shape = HouseholdSystemSchema.shape;
    assert.ok('categoryId' in shape && !('categoryIds' in shape), 'one required area, no list of areas');
    assertEvidence('AE-not-applicable', { scenario: 'AE', status: 'NOT-APPLICABLE', evidence: 'HouseholdSystem.categoryId is a single required id; no multi-area field exists', relations: 'dependencies (Scenario U)' });
  });
});
