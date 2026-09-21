/**
 * TODAY — required scenarios F, G, H, I, J (prompt §34) at the projection layer.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDependency } from '../../src/domain/structure.ts';
import { addEvidence } from '../../src/domain/patterns.ts';
import { captureNeedsMeItem } from '../../src/domain/needsMe.ts';
import { oneMoveForDay } from '../../src/domain/oneMove.ts';
import { addPerson, delegate } from '../../src/domain/responsibility.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { updateTask } from '../../src/domain/tasks.ts';
import { isMovable } from '../../src/features/daily-load/computeDailyLoad.ts';
import { MAX_PRIMARY_BLOCKS } from '../../src/features/today/model/index.ts';
import { addEvent } from '../../src/domain/events.ts';
import { richHousehold } from '../support/richHousehold.mjs';
import { DAY, NEXT_DAY, at, dense, ev, eventNamed, facet, household, inZone, mkCtx, nyInstant, nyMs, taskNamed, tk, valid, view, withAction, withMove } from './fixtures.mjs';

const keys = (v, level) => v.composition.filter((c) => c.level === level).map((c) => c.key);

describe('Scenario F — One Move: the established machinery chooses, Today only presents', () => {
  const build = (order) => {
    const tasks = {
      A: { title: 'File the insurance claim', minutes: 30, due: DAY, plan: { kind: 'unplanned' }, category: 'cat-money' },
      B: { title: 'Put away laundry', minutes: 10 },
      C: { title: 'Call the school', minutes: 20 },
    };
    let s = household();
    for (const k of order) s = tk(s, tasks[k]);
    s = facet(s, 'File the insurance claim', { consequence: 'critical' });
    s = captureNeedsMeItem(s, mkCtx(), { title: 'Renew passport' });
    return withMove(valid(s));
  };

  test('the choice is the machinery’s, whatever order the household was entered in', () => {
    for (const order of [['A', 'B', 'C'], ['C', 'B', 'A'], ['B', 'A', 'C']]) {
      const state = build(order);
      const v = view(state, nyMs(9));
      assert.equal(v.oneMove.action, 'Put away laundry', order.join(''));
      assert.equal(v.oneMove.targetId, taskNamed(state, 'Put away laundry').id);
      assert.equal(v.oneMove.targetId, oneMoveForDay(state, DAY).move.id, 'identical to what the One Move machinery says');
    }
  });

  test('Today ranks nothing: it follows the STORED decision, even if the stored target is not the one it would have picked', () => {
    const state = build(['A', 'B', 'C']);
    const claim = taskNamed(state, 'File the insurance claim');
    const swapped = { ...state, oneMoves: state.oneMoves.map((r) => ({ ...r, targetId: claim.id })) };
    assert.equal(view(swapped, nyMs(9)).oneMove.action, 'File the insurance claim');
  });

  test('“Why this?” is the recorded evidence, each reason re-checked against the row', () => {
    const only = withMove(valid(facet(tk(household(), { title: 'File the insurance claim', minutes: 30, due: DAY, plan: { kind: 'unplanned' }, category: 'cat-money' }), 'File the insurance claim', { consequence: 'high' })));
    const { why } = view(only, nyMs(9)).oneMove;
    assert.equal(why.basis, 'recorded_evidence');
    assert.deepEqual(why.reasons, ['It’s already on your list for today.', 'It’s due today.', 'If this slips, the cost is high.', 'It should take about 30 minutes.']);
    assert.deepEqual(why.evidence.map((e) => [e.code, e.label, e.aboutTitle]), [
      ['todays_radar', 'On today’s list', 'File the insurance claim'],
      ['deadline', 'Deadline', 'File the insurance claim'],
      ['consequence', 'Consequence', 'File the insurance claim'],
    ]);
  });

  test('a link the row no longer supports is dropped, not repeated', () => {
    const only = withMove(valid(tk(household(), { title: 'File the insurance claim', minutes: 30, due: DAY, plan: { kind: 'unplanned' } })));
    const later = updateTask(only, mkCtx(), taskNamed(only, 'File the insurance claim').id, { dueDate: '2026-09-25' });
    const { why } = view(later, nyMs(9)).oneMove;
    assert.equal(why.reasons.includes('It’s due today.'), false);
    assert.equal(why.evidence.some((e) => e.code === 'deadline'), false);
  });

  test('an evidence code Today does not understand is stored and never rendered', () => {
    const only = withMove(valid(tk(household(), { title: 'Put away laundry', minutes: 10 })));
    const record = only.oneMoves[0];
    const target = { kind: 'task', id: only.tasks[0].id };
    const withUnknown = addEvidence(only, mkCtx(), { for: { kind: 'oneMove', id: record.id }, support: target, code: 'zz_unknown' });
    assert.equal(withUnknown.evidenceLinks.some((l) => l.code === 'zz_unknown'), true, 'it is stored');
    const { why } = view(withUnknown, nyMs(9)).oneMove;
    assert.equal(JSON.stringify(why).includes('zz_unknown'), false, 'and never shown');
  });

  test('a Needs Me One Move says what it can and no more: no invented minutes, and it resolves the item', () => {
    const only = withMove(valid(captureNeedsMeItem(household(), mkCtx(), { title: 'Renew passport' })));
    const m = view(only, nyMs(9)).oneMove;
    assert.deepEqual([m.targetType, m.estimatedMinutes, m.completion, m.open], ['needsMe', null, 'resolves_needs_me', { pathname: '/life/needs-me' }]);
    assert.deepEqual(m.why.reasons, ['It’s the longest-waiting thing you captured.']);
  });
});

describe('Scenario G — “Her Keys handled this” needs an execution AND a success outcome', () => {
  const base = () => tk(household(), { title: 'Sign the permission form', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
  // One household per action: the intent must point at a row of the SAME state.
  const act = (opts) => {
    const s = base();
    return withAction(s, { about: { kind: 'task', id: taskNamed(s, 'Sign the permission form').id }, ...opts });
  };
  const NOW = nyMs(11);

  test('no execution or outcome records: no handled claim, and nothing waiting', () => {
    const v = view(withMove(valid(base())), NOW);
    assert.equal(v.handled, null);
    assert.equal(v.waiting, null);
  });

  test('the foundation’s trusted fixture (richHousehold, server rows): handled renders, truthfully', () => {
    assert.equal(view(richHousehold({ withServerRows: false }).state, NOW).handled, null, 'without server rows there is nothing to claim');
    const v = view(richHousehold({ withServerRows: true }).state, NOW);
    assert.equal(v.handled.rows.length, 1);
    assert.deepEqual([v.handled.rows[0].outcome, v.handled.rows[0].category], ['delivered', 'internal_reminder']);
    assert.equal(v.handled.rows[0].statement, 'Reminder about “Sign the permission form”');
  });

  test('a succeeded execution with a success outcome is handled', () => {
    const s = act({ execution: { attemptedAt: at(9, 5), result: 'succeeded' }, outcomes: [{ kind: 'delivered', observedAt: at(9, 6) }] });
    const v = view(s, NOW);
    assert.deepEqual(v.handled.rows.map((r) => [r.outcome, r.category]), [['delivered', 'internal_reminder']]);
  });

  test('a succeeded execution with NO outcome is not handled: it is unconfirmed', () => {
    const s = act({ execution: { attemptedAt: at(9, 5), result: 'succeeded' } });
    const v = view(s, NOW);
    assert.equal(v.handled, null);
    assert.deepEqual(v.waiting.rows.map((r) => r.kind), ['unconfirmed']);
    assert.match(v.waiting.rows[0].statement, /nothing has confirmed it yet/);
  });

  test('an outcome that is not success is not handled, and is not waiting either', () => {
    for (const kind of ['declined', 'no_effect', 'expired', 'cancelled', 'verification_failed']) {
      const s = act({ execution: { attemptedAt: at(9, 5), result: 'succeeded' }, outcomes: [{ kind, observedAt: at(9, 6) }] });
      const v = view(s, NOW);
      assert.equal(v.handled, null, kind);
      assert.equal(v.waiting, null, kind);
    }
  });

  test('an approval is not an execution: approved-but-not-run is waiting, never handled', () => {
    const v = view(act({}), NOW);
    assert.equal(v.handled, null);
    assert.deepEqual(v.waiting.rows.map((r) => r.kind), ['approved_not_run']);
    assert.equal(v.waiting.rows[0].statement, 'You approved this: set a reminder for “Sign the permission form”. It hasn’t run yet.');
  });

  test('a failed attempt today needs her; it is not handled', () => {
    const s = act({ execution: { attemptedAt: at(9, 5), result: 'failed' } });
    const v = view(s, NOW);
    assert.equal(v.handled, null);
    const failed = v.attention.rows.find((r) => r.reason === 'action_failed');
    assert.equal(failed.statement, 'Her Keys tried to set a reminder for “Sign the permission form”, but it didn’t work.');
  });

  test('an undone execution is not handled', () => {
    let s = act({ execution: { attemptedAt: at(9, 5), result: 'succeeded' }, outcomes: [{ kind: 'delivered', observedAt: at(9, 6) }] });
    const first = s.executions[0];
    s = valid({
      ...s,
      executions: [...s.executions, { ...first, id: 'exec-undo', attempt: 2, attemptedAt: at(9, 30), compensationCode: 'cancel_reminder', compensatesExecutionId: first.id }],
    });
    assert.equal(view(s, NOW).handled, null);
  });

  test('yesterday’s handled work is not today’s', () => {
    const s = act({ execution: { attemptedAt: at(9, 5, 15), result: 'succeeded' }, outcomes: [{ kind: 'delivered', observedAt: at(9, 6, 15) }] });
    assert.equal(view(s, NOW).handled, null);
  });

  test('a proposal that needs her yes is an approval row with the intent’s own consequence and reversibility, and never a promise it will run', () => {
    const s = act({ decide: null });
    const row = view(s, NOW).attention.rows.find((r) => r.reason === 'approval_required');
    assert.deepEqual([row.approval.phrase, row.approval.consequence, row.approval.reversibility], ['set a reminder', 'low', 'reversible']);
    assert.equal(row.statement, 'Her Keys would like to set a reminder for “Sign the permission form”. It needs your yes.');
    assert.deepEqual(row.actions.map((a) => a.kind), ['review_approval']);
    assert.doesNotMatch(row.statement, /will run|will send|will be/i);
  });
});

describe('Scenario H — what can wait: only what Daily Load itself would move, minus anything that says otherwise', () => {
  const build = () => {
    let s = household();
    s = tk(s, { title: 'Tidy the entryway', minutes: 5 }); // the One Move
    s = tk(s, { title: 'Water the plants', minutes: 20 }); // safely deferrable
    s = tk(s, { title: 'Book the plumber', minutes: 25 });
    s = facet(s, 'Book the plumber', { consequence: 'high' });
    s = tk(s, { title: 'Print the permit', minutes: 15 });
    s = tk(s, { title: 'Send the invoice', minutes: 30 });
    s = facet(s, 'Send the invoice', { dueAt: at(17) });
    s = tk(s, { title: 'Ask Dad to move the box', minutes: 12 });
    s = tk(s, { title: 'Renew registration', minutes: 45, due: NEXT_DAY });
    s = ev(s, { title: 'City hall appointment', from: [9], to: [10], day: 17 });
    s = addPerson(s, mkCtx(), { displayName: 'Dad', relationship: 'other' });
    s = delegate(s, mkCtx(), { about: { kind: 'task', id: taskNamed(s, 'Ask Dad to move the box').id }, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 60 });
    ({ state: s } = addDependency(s, mkCtx(), { relation: 'requires', from: { kind: 'event', id: eventNamed(s, 'City hall appointment').id }, to: { kind: 'task', id: taskNamed(s, 'Print the permit').id } }));
    return withMove(valid(s));
  };
  const state = build();
  const v = view(state, nyMs(9));

  test('only the first is presented as safe to defer', () => {
    assert.deepEqual(v.canWait.items.map((i) => i.title), ['Water the plants']);
    assert.equal(v.oneMove.action, 'Tidy the entryway');
  });

  test('every look-alike genuinely looks deferrable to the engine — and is still not listed', () => {
    const day = projectStateDay(state, DAY);
    for (const title of ['Book the plumber', 'Print the permit', 'Send the invoice', 'Ask Dad to move the box', 'Renew registration', 'Tidy the entryway']) {
      const item = day.tasks.find((t) => t.title === title);
      assert.equal(isMovable(item), true, `${title} looks movable`);
      assert.equal(v.canWait.items.some((i) => i.title === title), false, `${title} must not be labelled as safe to defer`);
    }
  });

  test('bounded at first glance: three items, the rest counted and one disclosure away', () => {
    let s = household();
    for (const [i, minutes] of [60, 50, 40, 30, 20, 10].entries()) s = tk(s, { title: `Chore ${i}`, minutes });
    const bounded = view(withMove(valid(s)), nyMs(9));
    assert.equal(bounded.canWait.items.length, 3);
    assert.equal(bounded.canWait.moreItems.length, 2, 'the One Move (10 min) is not listed; five remain');
    assert.deepEqual(bounded.canWait.items.map((i) => i.title), ['Chore 0', 'Chore 1', 'Chore 2'], 'largest first');
  });

  test('a day with nothing provably deferrable says nothing about waiting', () => {
    const s = withMove(valid(tk(household(), { title: 'Send the invoice', minutes: 30, due: DAY, plan: { kind: 'unplanned' } })));
    assert.equal(view(s, nyMs(9)).canWait, null);
  });
});

describe('Scenario I — data density: the hierarchy adapts, and the screen does not become a wall', () => {
  test('sparse: a household that has never entered anything is told so, plainly, with one place to begin', () => {
    const v = view(household(), nyMs(9));
    assert.deepEqual(keys(v, 'primary'), ['sparse']);
    assert.deepEqual(keys(v, 'secondary'), []);
    assert.equal(v.sparse.kind, 'never_entered');
    assert.equal(v.headline, 'Nothing is on your list yet.');
    assert.deepEqual(v.sparse.entry.map((e) => e.label), ['Add a task', 'Add an event']);
  });

  test('sparse: a household with history but nothing today is genuinely light, and says only that', () => {
    const v = view(valid(ev(household(), { title: 'Yesterday’s dentist', from: [10], to: [11], day: 15 })), nyMs(9));
    assert.equal(v.sparse.kind, 'light');
    assert.equal(v.headline, 'Your day looks light so far.');
    assert.deepEqual(v.sparse.entry.map((e) => e.label), ['Add a task']);
    assert.equal(v.decision ?? v.attention ?? v.matters ?? v.oneMove ?? v.canWait, null);
  });

  test('dense: at most three primary blocks; every list is bounded and the rest is counted', () => {
    const v = view(dense(), nyMs(9));
    assert.ok(keys(v, 'primary').length <= MAX_PRIMARY_BLOCKS, keys(v, 'primary').join());
    assert.ok(v.attention.rows.length <= 3 && v.attention.moreRows.length > 0, 'attention is bounded, the rest is one disclosure away');
    assert.ok((v.canWait?.items.length ?? 0) <= 3);
    assert.ok((v.waiting?.rows.length ?? 0) <= 3);
    assert.ok((v.matters?.anchors.length ?? 0) <= 3);
  });

  test('dense: when a busy day has too many blocks, “what matters” is what steps down — not the decision, what needs her, or the One Move', () => {
    // 6:05 AM: every overlap is still live, so the decision, attention, matters and the One Move all have something to say.
    const v = view(dense(), nyMs(6, 5));
    assert.deepEqual(keys(v, 'primary'), ['decision', 'attention', 'oneMove']);
    assert.equal(keys(v, 'secondary')[0], 'matters', 'it is still there, one level down');
    assert.ok(v.matters.anchors.length <= 3);
  });

  test('dense: once the overlaps are behind her, the decision is no longer offered and matters returns to the first level', () => {
    const v = view(dense(), nyMs(9));
    assert.equal(v.decision, null);
    assert.deepEqual(keys(v, 'primary'), ['attention', 'matters', 'oneMove']);
  });

  test('the hierarchy adapts across the spectrum', () => {
    const counts = [household(), withMove(valid(tk(household(), { title: 'Renew library card' }))), dense()].map((s) => keys(view(s, nyMs(9)), 'primary').length);
    assert.deepEqual(counts.map((n) => n <= MAX_PRIMARY_BLOCKS), [true, true, true]);
    assert.ok(counts[0] === 1 && counts[1] === 1, 'sparse and one-item days stay at one block');
  });
});

describe('Scenario J — the household’s logical day, not the device’s', () => {
  const INSTANT = Date.UTC(2026, 8, 21, 2, 30); // 2026-09-21T02:30:00Z

  test('the same instant projects into the correct household day, and shows the correct label', () => {
    const chicago = view(inZone(household(), 'America/Chicago'), INSTANT);
    const auckland = view(inZone(household(), 'Pacific/Auckland'), INSTANT);
    assert.deepEqual([chicago.day.date, chicago.day.label, chicago.day.weekday], ['2026-09-20', 'Sunday, Sep 20', 'Sunday']);
    assert.deepEqual([auckland.day.date, auckland.day.label, auckland.day.weekday], ['2026-09-21', 'Monday, Sep 21', 'Monday']);
  });

  test('near midnight: the last second of the day and the first of the next', () => {
    const state = inZone(household(), 'America/Chicago');
    const last = view(state, Date.UTC(2026, 8, 21, 4, 59, 59));
    const first = view(state, Date.UTC(2026, 8, 21, 5, 0, 0));
    assert.deepEqual([last.day.date, last.nowMinutes], ['2026-09-20', 23 * 60 + 59]);
    assert.deepEqual([first.day.date, first.nowMinutes], ['2026-09-21', 0]);
  });

  test('an event belongs to the household day it falls on in the household zone', () => {
    let s = inZone(household(), 'Pacific/Auckland');
    // 2026-09-21T03:00Z is 15:00 on Sep 21 in Auckland, but still Sep 20 in UTC's evening-before terms for the other zone.
    s = addEvent(s, mkCtx(), { title: 'Auckland pickup', categoryId: 'cat-kids', startsAt: '2026-09-21T03:00:00.000Z', endsAt: '2026-09-21T03:30:00.000Z', commitment: 'fixed', scope: 'household' });
    const v = view(valid(s), Date.UTC(2026, 8, 21, 1, 0));
    assert.equal(v.day.date, '2026-09-21');
    assert.deepEqual(v.matters.anchors.map((a) => [a.title, a.timeLabel]), [['Auckland pickup', '3:00 PM']]);
  });

  test('spring-forward: the missing hour does not move the day or its clock times', () => {
    let s = inZone(household(), 'America/New_York');
    s = addEvent(s, mkCtx(), { title: 'Early shift', categoryId: 'cat-work', startsAt: '2026-03-08T07:30:00.000Z', endsAt: '2026-03-08T08:30:00.000Z', commitment: 'fixed', scope: 'household' });
    const before = view(valid(s), Date.UTC(2026, 2, 8, 6, 30)); // 1:30 AM EST
    const after = view(valid(s), Date.UTC(2026, 2, 8, 7, 30)); // 3:30 AM EDT
    assert.deepEqual([before.day.date, before.nowMinutes, after.day.date, after.nowMinutes], ['2026-03-08', 90, '2026-03-08', 210]);
    assert.deepEqual(before.matters.anchors.map((a) => a.timeLabel), ['3:30 AM']);
  });

  test('fall-back: both 1:30 AMs are the same logical day', () => {
    const state = inZone(household(), 'America/New_York');
    assert.equal(view(state, Date.UTC(2026, 10, 1, 5, 30)).day.date, '2026-11-01');
    assert.equal(view(state, Date.UTC(2026, 10, 1, 6, 30)).day.date, '2026-11-01');
  });
});
