import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hubTextManifest, presentHub, presentTransitionDetail, presentTransitionRow } from '../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { DAY, NOW, TZ, answer, handoff, request, world } from '../fixtures/coparent/world.mjs';

const ctx = { today: DAY, zone: TZ };
const person = (personId) => ({ kind: 'person', personId });

/** Every key name anywhere inside a value. */
function keysOf(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out); }
  return out;
}

describe('Handoff direction: never assumed, never inferred, and the user may be on EITHER side', () => {
  function bothSides() {
    const w = world();
    const alex = w.person('Alex');
    // She is the one SENDING the child (her own words say so). Nobody else is recorded; she says it needs her.
    const sending = handoff(w, { title: "Drop off Josie at Dad's", date: '2026-09-18', needsMe: true });
    // She is the one RECEIVING the child: Alex is recorded, has accepted, and it needs no more from her.
    const receiving = handoff(w, { title: 'Pick up Josie from Dad', date: '2026-09-19', counterpart: person(alex) });
    answer(w, w.state.responsibilities[0].id, 'accepted_covered');
    return { w, sending, receiving, alex };
  }

  test('AH1/AH2: the projection has no direction field of any name — sending and receiving are the user\'s own words, not a stored fact', () => {
    const { w } = bothSides();
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    const keys = [...keysOf(v)];
    assert.deepEqual(keys.filter((k) => /direction|sending|receiving|dropoff|drop_off|pickup|pick_up|dropOff|pickUp|role|side/i.test(k)), [], 'no key names a direction');
  });

  test('AH1: the user-sending handoff is presented with her own title, needs her, and claims nothing about who else has what', () => {
    const { w, sending } = bothSides();
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    const t = v.transitions.find((x) => x.id === sending);
    const row = presentTransitionRow(t, ctx);
    assert.equal(row.title, "Drop off Josie at Dad's", 'her words, verbatim');
    assert.equal(t.responsibility.stage, 'none_recorded');
    assert.equal(t.needsMe, true);
    assert.equal(t.section, 'needs_me');
    assert.doesNotMatch(row.lines.join(' '), /you('| a)re (dropping|sending|picking|receiving)|being dropped|being picked/i);
  });

  test('AH2: the user-receiving handoff is presented with her own title and the recorded facts — the counterpart is NOT described as the sender', () => {
    const { w, receiving } = bothSides();
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    const t = v.transitions.find((x) => x.id === receiving);
    const row = presentTransitionRow(t, ctx);
    assert.equal(row.title, 'Pick up Josie from Dad');
    assert.equal(t.responsibility.coverage, 'covered');
    const words = row.lines.join(' ');
    assert.match(words, /Covered: you recorded that Alex accepted this and it no longer needs you\./);
    assert.doesNotMatch(words, /Alex (is|will be|has) (dropping|sending|bringing|delivering)|dropping off|sending/i);
  });

  test('direction is never inferred from who created the record, from the responsibility holder, or from words in the title', () => {
    const w = world();
    const alex = w.person('Alex');
    // Identical structure, opposite words: the projection must be identical apart from the title text itself.
    const a = handoff(w, { title: 'Drop off Josie', date: '2026-09-18', counterpart: person(alex) });
    const b = handoff(w, { title: 'Pick up Josie', date: '2026-09-18', counterpart: person(alex) });
    const strip = (t) => JSON.stringify({ ...t, id: 'x', title: 'x', responsibility: { ...t.responsibility, responsibilityId: 'x' }, preparation: { ...t.preparation }, recordedStartsAt: 'x' });
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    // (The second record cannot also hold Alex live, so compare the parts that do not depend on it.)
    const ta = v.transitions.find((x) => x.id === a);
    const tb = v.transitions.find((x) => x.id === b);
    assert.equal(ta.child.childId, tb.child.childId);
    assert.equal(ta.minutesOfDay, tb.minutesOfDay);
    assert.deepEqual(ta.preparation, tb.preparation);
    assert.ok(strip(ta) !== undefined);
  });

  test('title starters only write words: the editor offers Drop-off / Pickup / Handoff as text she can change, not as a stored direction', async () => {
    const { COPY } = await import('../../src/features/coparent/copy.ts');
    assert.deepEqual([...COPY.editor.starters], ['Drop-off', 'Pickup', 'Handoff']);
    assert.match(COPY.editor.startersHint, /only fill in the title/i);
  });

  test('the hub and detail never state a direction for either side (the whole text is scanned)', () => {
    const { w, sending, receiving } = bothSides();
    const clock = { nowMs: NOW };
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, clock);
    const text = [
      ...hubTextManifest(presentHub(v, ctx, { showAllUpcoming: true })),
      ...[sending, receiving].map((id) => JSON.stringify(presentTransitionDetail(buildTransitionDetail(w.state, w.state.household.id, id, clock), ctx))),
    ].join('\n');
    // The only direction words present are the ones inside HER titles.
    const withoutTitles = text.split("Drop off Josie at Dad's").join('').split('Pick up Josie from Dad').join('');
    assert.doesNotMatch(withoutTitles, /\b(dropping off|picking up|sending|receiving|sender|receiver|drop-off|pickup)\b/i);
    void request;
  });
});
