/**
 * Feature 03 — time correctness (contract sections 35-39, scenarios S, T, U).
 *
 * Calendar keeps INSTANTS and measures ELAPSED minutes from the start of the household's logical
 * day. The foundation's `projectDay` reports wall-clock minutes-after-midnight and treats them as
 * elapsed time; that is right on 363 days a year and wrong on the two DST days. These tests prove
 * Calendar is right on those days AND reproduce the foundation behaviour (F03-FG-03) so the defect
 * recorded in the ledger is evidence, not an assertion. The "foundation says ..." checks pin
 * CURRENT inherited behaviour: when the shared projection is corrected in the integration wave they
 * are expected to change, deliberately.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadTierForDay } from '../src/domain/loadTier.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { dayFrameFor } from '../src/features/calendar/model/timeFrame.ts';
import { household, msAt } from './support/calendarScenarios.mjs';

const TZ = 'America/New_York';
const SPRING = '2026-03-08'; // 02:00 EST -> 03:00 EDT: a 23-hour day
const FALL = '2026-11-01'; //   02:00 EDT -> 01:00 EST: a 25-hour day
const project = (state, date, nowHHMM = '00:05') => projectCalendarDay({ state, date, today: date, nowMs: msAt(nowHHMM, date, TZ) });
const conflicts = (view, type) => view.conflicts.filter((c) => c.type === type);

describe('the household day is as long as it really is', () => {
  test('23 hours on the spring-forward day, 25 on the fall-back day, 24 otherwise', () => {
    assert.equal(dayFrameFor(SPRING, TZ).lengthMinutes, 23 * 60);
    assert.equal(dayFrameFor(FALL, TZ).lengthMinutes, 25 * 60);
    assert.equal(dayFrameFor('2026-09-16', TZ).lengthMinutes, 24 * 60);
  });
});

describe('T — DST spring forward', () => {
  const state = () =>
    household()
      .event('evt-a', { title: 'Early appointment', start: '01:00', end: '01:45', date: SPRING })
      .event('evt-b', { title: 'Breakfast meeting', start: '03:15', end: '04:00', date: SPRING }).state;

  test('the gap between 01:45 EST and 03:15 EDT is 30 elapsed minutes, not the 90 the wall clock suggests', () => {
    const view = project(state(), SPRING);
    const [narrow] = view.narrowTransitions;
    assert.equal(narrow.gapMinutes, 30);
    assert.equal(view.dayItems[1].timing.startMinute, 135, 'elapsed from 00:00 EST, the skipped hour is not counted');
    assert.equal(view.capacityState.foundationTier, 'tight', 'a 30-minute buffer is tight by the foundation\'s own thresholds');
  });

  test('F03-FG-03 reproduced: the foundation projection overstates that gap and calls the day open', () => {
    const s = state();
    const [a, b] = projectStateDay(s, SPRING).events;
    assert.equal(b.startMinutes - a.endMinutes, 90, 'foundation: wall-clock difference');
    assert.equal(loadTierForDay(s, SPRING), 'open', 'foundation: therefore open (it is not)');
  });

  test('an event across the change lasts its real elapsed time', () => {
    const s = household().event('evt-c', { start: '00:30', end: '03:30', date: SPRING }).state;
    const [item] = project(s, SPRING).dayItems;
    assert.equal(item.durationMinutes, 120, '00:30 EST to 03:30 EDT is two hours');
    assert.equal(item.timing.endMinute - item.timing.startMinute, 120);
  });

  test('an empty spring-forward day is simply open', () => {
    const view = project(household().state, SPRING);
    assert.equal(view.capacityState.tier, 'open');
  });
});

describe('U — DST fall back', () => {
  // The repeated hour: 01:00-02:00 happens twice (EDT then EST).
  const EDT = (hhmm) => Date.parse(`2026-11-01T${hhmm}:00.000-04:00`);
  const EST = (hhmm) => Date.parse(`2026-11-01T${hhmm}:00.000-05:00`);
  const withInstants = (rows) => {
    const b = household();
    for (const [id, start, end] of rows) b.event(id, { title: id, start: '00:00', end: '00:30', date: FALL });
    return b.with((s) => ({
      ...s,
      events: s.events.map((e) => {
        const row = rows.find(([id]) => id === e.id);
        return { ...e, startsAt: new Date(row[1]).toISOString(), endsAt: new Date(row[2]).toISOString() };
      }),
    })).state;
  };

  test('two events at the same wall-clock time an hour apart do not overlap', () => {
    const s = withInstants([
      ['evt-first', EDT('01:15'), EDT('01:45')],
      ['evt-second', EST('01:15'), EST('01:45')],
    ]);
    const view = project(s, FALL);
    assert.deepEqual(conflicts(view, 'FIXED_OVERLAP'), [], 'they are 60 real minutes apart');
    assert.deepEqual(view.dayItems.map((i) => i.ref.id), ['evt-first', 'evt-second'], 'ordering follows real time');
    assert.equal(view.dayItems[0].timing.startMinute, 75);
    assert.equal(view.dayItems[1].timing.startMinute, 135);
  });

  test('F03-FG-03 reproduced: the foundation sees those two events as the same time and reports an overlap', () => {
    const s = withInstants([
      ['evt-first', EDT('01:15'), EDT('01:45')],
      ['evt-second', EST('01:15'), EST('01:45')],
    ]);
    const [a, b] = projectStateDay(s, FALL).events;
    assert.equal(a.startMinutes, b.startMinutes, 'foundation: identical wall-clock coordinates');
    assert.equal(loadTierForDay(s, FALL), 'overloaded', 'foundation: a false overlap');
  });

  test('an event that spans the repeated hour keeps its real duration instead of collapsing to zero', () => {
    const s = withInstants([['evt-span', EDT('01:30'), EST('01:30')]]);
    const [item] = project(s, FALL).dayItems;
    assert.equal(item.durationMinutes, 60);
    assert.equal(item.timing.endMinute - item.timing.startMinute, 60);
    const [foundation] = projectStateDay(s, FALL).events;
    assert.equal(foundation.startMinutes, foundation.endMinutes, 'F03-FG-03: the foundation reports zero length');
  });

  test('the day is 25 hours long and its late hours are still reachable', () => {
    const s = household().event('evt-late', { start: '23:00', end: '23:30', date: FALL }).state;
    const [item] = project(s, FALL).dayItems;
    assert.equal(item.timing.startMinute, 23 * 60 + 60, 'one extra elapsed hour before 23:00 wall clock');
  });
});
