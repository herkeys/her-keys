import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { epochMsOf } from '../../src/domain/logicalDay.ts';
import { setRecurrenceStatus } from '../../src/domain/structure.ts';
import { NEGATED_BOUNDARY_SENTENCES } from '../../src/features/coparent/copy.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import { createHandoff, editHandoff, handoffEditorSeed, repeatChoiceOf } from '../../src/features/coparent/mutations.ts';
import { hubTextManifest, presentHub, presentTransitionDetail, presentTransitionRow, repeatLine } from '../../src/features/coparent/present.ts';
import { buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { instantFromInput } from '../../src/features/coparent/time.ts';
import { HANDOFF, JOSIE, NOW, TZ, handoff, nyMs, world } from '../fixtures/coparent/world.mjs';

const utc = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);
const viewAt = (w, ms, extra = {}) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: ms, ...extra });
const ctxOf = (ms, zone = TZ) => ({ today: new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(ms)), zone });
const rulesOf = (w, id) => w.state.recurrences.filter((r) => r.about.id === id);

describe('Recurrence: an operational pattern she recorded — never a custody schedule, never agreed', () => {
  test('V: weekly / every-2-weeks / monthly are written through the shared recurrence rule, in the household zone, by her', () => {
    const cases = [
      ['weekly', { frequency: 'weekly', interval: 1, byWeekday: [5], byMonthDay: null }],
      ['every_2_weeks', { frequency: 'weekly', interval: 2, byWeekday: [5], byMonthDay: null }],
      ['monthly', { frequency: 'monthly', interval: 1, byWeekday: null, byMonthDay: 18 }],
    ];
    for (const [choice, expected] of cases) {
      const w = world();
      const id = handoff(w, { repeat: choice });
      const [rule] = rulesOf(w, id);
      assert.equal(rulesOf(w, id).length, 1);
      assert.equal(rule.about.kind, 'event');
      assert.equal(rule.trigger, 'schedule');
      assert.equal(rule.status, 'active');
      assert.equal(rule.anchorDate, '2026-09-18');
      assert.equal(rule.timeOfDayMinutes, 17 * 60);
      assert.equal(rule.timezone, TZ);
      assert.equal(rule.endsOn, null);
      assert.equal(rule.occurrenceCount, null);
      assert.equal(rule.provenance.producer, 'user-action');
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(rule[key], value, `${choice}.${key}`);
      assert.equal(repeatChoiceOf(rule), choice);
    }
  });

  test('the recorded handoff is the anchor; after it ends the NEXT date is derived from the rule and has no row of its own', () => {
    const w = world();
    const id = handoff(w, { repeat: 'weekly' });
    // Before the anchor: the recorded row.
    let t = viewAt(w, NOW).transitions[0];
    assert.equal(t.occurrence, 'recorded');
    assert.equal(t.localDate, '2026-09-18');
    // During it.
    t = viewAt(w, nyMs(17, 10, 18)).transitions[0];
    assert.equal(t.occurrence, 'recorded');
    assert.equal(t.timeStatus, 'in_progress');
    // After it ended: next Friday, derived.
    t = viewAt(w, nyMs(17, 31, 18)).transitions[0];
    assert.equal(t.occurrence, 'repeat_pattern');
    assert.equal(t.localDate, '2026-09-25');
    assert.equal(t.minutesOfDay, 17 * 60);
    assert.equal(t.recordedLocalDate, '2026-09-18');
    assert.equal(t.id, id, 'still the ONE canonical event — a derived date is not a second event');
    assert.equal(w.state.events.length, 1);
  });

  test('every 2 weeks keeps its phase: after the first, the next date is two weeks on, not one', () => {
    const w = world();
    handoff(w, { repeat: 'every_2_weeks' });
    const t = viewAt(w, nyMs(20, 0, 19)).transitions[0];
    assert.equal(t.localDate, '2026-10-02');
  });

  test('a derived date carries NO recorded responsibility or preparation — the copy says so', () => {
    const w = world();
    handoff(w, { repeat: 'weekly' });
    const now = nyMs(20, 0, 19);
    const v = viewAt(w, now);
    const detail = buildTransitionDetail(w.state, w.state.household.id, v.transitions[0].id, { nowMs: now });
    const p = presentTransitionDetail(detail, ctxOf(now));
    assert.match(p.whenLine, /^Next: Fri, Sep 25 · 5:00 PM$/);
    assert.ok(p.repeatLines.some((l) => l === 'Recorded for Fri, Sep 18. Nothing is recorded for this date.'));
    assert.match(p.repeatLines[0], /^Repeats every week on Friday\. This is the pattern you recorded\.$/);
  });

  test('W: the wording never calls a recorded pattern a custody schedule, parenting plan, court schedule, agreed or required', () => {
    const w = world();
    handoff(w, { repeat: 'every_2_weeks' });
    const now = nyMs(20, 0, 19);
    const v = viewAt(w, now);
    const strings = hubTextManifest(presentHub(v, ctxOf(now)));
    const detail = buildTransitionDetail(w.state, w.state.household.id, v.transitions[0].id, { nowMs: now });
    strings.push(JSON.stringify(presentTransitionDetail(detail, ctxOf(now))));
    // The only sentences allowed a boundary word are the ones that NAME the boundary to deny it.
    let joined = strings.join(' \n ');
    for (const sentence of NEGATED_BOUNDARY_SENTENCES) joined = joined.split(sentence).join('');
    assert.match(joined, /the pattern you recorded/);
    assert.doesNotMatch(joined, /custody|parenting (plan|time|schedule)|court|order(ed)?\b|agreed|agreement|required|legal|schedule/i);
  });

  test('editing only the title never touches the recorded schedule (same rule row, same id, same anchor)', () => {
    const w = world();
    const id = handoff(w, { repeat: 'weekly' });
    const before = JSON.stringify(w.state.recurrences);
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, title: 'Pickup Josie at school' } }), { ms: NOW + 1000 });
    assert.equal(JSON.stringify(w.state.recurrences), before);
  });

  test('moving the handoff re-anchors the rule by REPLACING it: the old rule ends, a new one starts, one active at a time', () => {
    const w = world();
    const id = handoff(w, { repeat: 'weekly' });
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, startTime: '18:00', endTime: '18:30' } }), { ms: NOW + 1000 });
    const rules = rulesOf(w, id);
    assert.equal(rules.length, 2);
    assert.deepEqual(rules.map((r) => r.status).sort(), ['active', 'ended']);
    assert.equal(rules.find((r) => r.status === 'active').timeOfDayMinutes, 18 * 60);
    assert.equal(rules.find((r) => r.status === 'ended').timeOfDayMinutes, 17 * 60, 'history of what she once recorded stays true');
  });

  test('choosing "doesn\'t repeat" ends the rule; the event and its history remain', () => {
    const w = world();
    const id = handoff(w, { repeat: 'monthly' });
    const seed = handoffEditorSeed(w.state, id);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, repeat: 'none' } }), { ms: NOW + 1000 });
    assert.deepEqual(rulesOf(w, id).map((r) => r.status), ['ended']);
    assert.equal(viewAt(w, NOW).transitions[0].repeat, null);
    // Once its one date has passed, there is no next date.
    assert.equal(viewAt(w, nyMs(20, 0, 19)).transitions.length, 0);
  });

  test('a rule this feature could not have written is kept exactly as recorded ("keep"), even when other fields are edited', () => {
    const w = world();
    const id = handoff(w);
    const at = '2026-09-16T14:00:00.000Z';
    w.state = {
      ...w.state,
      recurrences: [{ id: 'rule-x', about: { kind: 'event', id }, trigger: 'schedule', frequency: 'daily', interval: 3, byWeekday: null, byMonthDay: null, anchorDate: '2026-09-18', timeOfDayMinutes: 17 * 60, timezone: TZ, endsOn: null, occurrenceCount: null, status: 'active', createdAt: at, updatedAt: at, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'personal' }],
    };
    const seed = handoffEditorSeed(w.state, id);
    assert.equal(seed.fields.repeat, 'keep');
    const before = JSON.stringify(w.state.recurrences);
    w.run((s, c) => editHandoff(s, c, { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, notes: 'Bring the blue bag' } }), { ms: NOW + 1000 });
    assert.equal(JSON.stringify(w.state.recurrences), before);
    assert.match(repeatLine(viewAt(w, NOW).transitions[0].repeat), /^Repeats every 3 days\./);
  });

  test('a paused pattern is shown as paused and derives no next date; an ended one is not shown', () => {
    const w = world();
    const id = handoff(w, { repeat: 'weekly' });
    const ruleId = rulesOf(w, id)[0].id;
    w.apply((s, c) => setRecurrenceStatus(s, c, ruleId, 'paused'));
    const now = nyMs(20, 0, 19);
    let v = viewAt(w, now);
    assert.equal(v.transitions.length, 0, 'the recorded date passed and a paused pattern derives nothing');
    v = viewAt(w, NOW);
    assert.equal(v.transitions[0].repeat.status, 'paused');
    assert.match(repeatLine(v.transitions[0].repeat), /^Repeat paused \(every week on Friday\)\./);
    w.apply((s, c) => setRecurrenceStatus(s, c, ruleId, 'ended'));
    assert.equal(viewAt(w, NOW).transitions[0].repeat, null);
  });
});

describe('Time: household zone only — no silent shift across devices, DST or place names', () => {
  test('AJ: an evening handoff stays on its household day even though it is already tomorrow in UTC', () => {
    const w = world();
    handoff(w, { date: '2026-09-18', startTime: '21:00', endTime: '21:30' });
    const event = w.state.events[0];
    assert.equal(event.startsAt, '2026-09-19T01:00:00.000Z', 'stored as an absolute instant');
    const t = viewAt(w, NOW).transitions[0];
    assert.equal(t.localDate, '2026-09-18');
    assert.equal(t.minutesOfDay, 21 * 60);
  });

  test('AJ: logical-day rollover — the same handoff reads "Tomorrow" then "Today" as the household day turns over', () => {
    const w = world();
    handoff(w, { date: '2026-09-17', startTime: '00:30', endTime: '01:00' });
    const at2359 = nyMs(23, 59, 16);
    const at0001 = nyMs(0, 1, 17);
    const rowBefore = presentTransitionRow(viewAt(w, at2359).transitions[0], ctxOf(at2359));
    const rowAfter = presentTransitionRow(viewAt(w, at0001).transitions[0], ctxOf(at0001));
    assert.match(rowBefore.whenLine, /^Tomorrow · 12:30 AM$/);
    assert.match(rowAfter.whenLine, /^Today · 12:30 AM$/);
  });

  test('AK: spring-forward — a wall time that does not exist moves forward, and an end before the moved start is refused', () => {
    const w = world();
    assert.equal(instantFromInput('2026-03-08', '02:30', TZ), '2026-03-08T07:30:00.000Z', '02:30 does not exist; it is 03:30 EDT');
    const refused = createHandoff(w.state, w.at(), { ...HANDOFF, childId: JOSIE, date: '2026-03-08', startTime: '02:30', endTime: '03:00' }, { kind: 'none' });
    assert.equal(refused.outcome, 'invalid_time');
    assert.equal(refused.state, w.state);
    const ok = createHandoff(w.state, w.at(), { ...HANDOFF, childId: JOSIE, date: '2026-03-08', startTime: '02:30', endTime: '04:00' }, { kind: 'none' });
    assert.equal(ok.outcome, 'saved');
  });

  test('AK: a weekly 9:00 AM pattern reads 9:00 AM local on both sides of spring-forward (different instants, same wall clock)', () => {
    const w = world({ nowMs: utc(2026, 3, 5, 15) });
    handoff(w, { date: '2026-03-01', startTime: '09:00', endTime: '09:30', repeat: 'weekly' });
    const before = viewAt(w, utc(2026, 3, 2, 15)).transitions[0];
    assert.equal(before.localDate, '2026-03-08');
    assert.equal(before.minutesOfDay, 9 * 60);
    assert.equal(before.startsAtMs, utc(2026, 3, 8, 13), '09:00 EDT');
    const after = viewAt(w, utc(2026, 3, 9, 15)).transitions[0];
    assert.equal(after.localDate, '2026-03-15');
    assert.equal(after.minutesOfDay, 9 * 60);
    assert.equal(after.startsAtMs, utc(2026, 3, 15, 13));
    assert.equal(epochMsOf(w.state.events[0].startsAt), utc(2026, 3, 1, 14), 'the recorded anchor is 09:00 EST = 14:00Z');
  });

  test('AL: fall-back — the repeated hour resolves to its first occurrence, and a weekly pattern holds its wall clock across the change', () => {
    assert.equal(instantFromInput('2026-11-01', '01:30', TZ), '2026-11-01T05:30:00.000Z', 'first (EDT) occurrence of the repeated 01:30');
    const w = world({ nowMs: utc(2026, 10, 27, 15) });
    handoff(w, { date: '2026-10-30', startTime: '17:00', endTime: '17:30', repeat: 'weekly' });
    const next = viewAt(w, utc(2026, 10, 31, 15)).transitions[0];
    assert.equal(next.localDate, '2026-11-06');
    assert.equal(next.minutesOfDay, 17 * 60);
    assert.equal(next.startsAtMs, utc(2026, 11, 6, 22), '17:00 EST is 22:00Z (it was 21:00Z on the EDT side)');
  });

  test('AH3: created in one zone, viewed on a device in another, with a location that "suggests" a third — the time never moves', () => {
    const w = world();
    handoff(w, { date: '2026-09-18', startTime: '17:00', endTime: '17:30', location: 'Union Station, Chicago' });
    const home = viewAt(w, NOW, { deviceTimeZone: 'America/New_York' });
    const la = viewAt(w, NOW, { deviceTimeZone: 'America/Los_Angeles' });
    const tokyo = viewAt(w, NOW, { deviceTimeZone: 'Asia/Tokyo' });
    for (const other of [la, tokyo]) {
      assert.deepEqual(other.transitions, home.transitions, 'device zone must not change any handoff fact');
      assert.equal(other.transitions[0].minutesOfDay, 17 * 60);
      assert.equal(other.transitions[0].localDate, '2026-09-18');
    }
    assert.equal(home.zone.differs, false);
    assert.equal(la.zone.differs, true);
    assert.equal(la.zone.household, TZ);
    // The row reads the same, and the zone context is said once at hub level — with no place-name inference.
    const rowHome = presentTransitionRow(home.transitions[0], ctxOf(NOW));
    const rowLa = presentTransitionRow(la.transitions[0], ctxOf(NOW));
    assert.deepEqual(rowLa, rowHome);
    assert.equal(presentHub(home, ctxOf(NOW)).zoneNote, null);
    assert.equal(presentHub(la, ctxOf(NOW)).zoneNote, 'Times are shown in your household time zone, America/New_York.');
    const wholeHub = JSON.stringify([presentHub(la, ctxOf(NOW)), la]);
    assert.doesNotMatch(wholeHub, /Chicago|Central|CST|CDT|Union Station/, 'a place name is never turned into a zone (or printed on the hub)');
  });

  test('entry and display are in the household zone: the same typed "17:00" is one absolute instant whatever the device says', () => {
    const w = world();
    const id = handoff(w, { date: '2026-09-18', startTime: '17:00', endTime: '17:30' });
    assert.equal(w.state.events.find((e) => e.id === id).startsAt, '2026-09-18T21:00:00.000Z');
    const seed = handoffEditorSeed(w.state, id);
    assert.equal(seed.fields.startTime, '17:00', 'the editor reads it back in the household zone');
    assert.equal(seed.fields.date, '2026-09-18');
  });
});
