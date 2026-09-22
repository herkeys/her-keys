/**
 * Feature 03 — legitimate actions and ephemeral preview (contract sections 30-32A; scenarios N, O, AA, AB, AG, AH).
 *
 * These run against the REAL app store (in-memory storage, injected clock), not a mock: what Calendar
 * previews must be exactly what Accept does, cancel must leave no trace, a repeated accept must not
 * corrupt state, a schedule that changes under a preview must invalidate or recompute it, and a restart
 * must discard it.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent } from '../src/domain/events.ts';
import { acceptIntent, applyIntent, computePreview, refreshPreview, validityOf } from '../src/features/calendar/model/preview.ts';
import { dayEvidence } from '../src/features/calendar/model/structural.ts';
import { projectCalendarDay } from '../src/features/calendar/model/projectCalendar.ts';
import { STORAGE_KEYS, harness, launch, stored } from './support/fixtures.mjs';
import { DAY, NEXT, instantAt, msAt, scenarioById } from './support/calendarScenarios.mjs';

async function open(scenarioId, at = '10:00') {
  const built = scenarioById(scenarioId).build();
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(built.state) }, mode: 'empty', now: msAt(at) });
  const store = await launch(h);
  return { h, store, built, nowMs: msAt(at), snap: () => store.getSnapshot() };
}

const MOVE_B = { kind: 'move_event', id: 'evt-b' };
const evidenceWithoutPreview = (view) => {
  const { preview, ...rest } = dayEvidence(view);
  return rest;
};

describe('N — a move preview is non-canonical and equals what Accept does', () => {
  test('the preview shows today with the item gone and the item landing tomorrow at the same time', async () => {
    const { store, nowMs, snap } = await open('N');
    const { state, today } = snap();
    const outcome = computePreview({ state, today, nowMs, date: DAY, intent: MOVE_B });
    assert.equal(outcome.ok, true);
    const { preview } = outcome;
    assert.equal(preview.before.dayItems.some((i) => i.ref.id === 'evt-b'), true);
    assert.equal(preview.after.dayItems.some((i) => i.ref.id === 'evt-b'), false, 'gone from today in the preview');
    const landed = preview.destination.after.dayItems.find((i) => i.ref.id === 'evt-b');
    assert.equal(landed.timing.startMinute, 11 * 60 + 10, 'same wall-clock time tomorrow');
    assert.equal(landed.timing.endMinute - landed.timing.startMinute, 40, 'same length');
    assert.deepEqual(preview.after.preview, { active: true, basedOnRevision: preview.basedOnRevision, validity: 'current' });
    assert.equal(store.getSnapshot().state, state, 'the store was never touched');
  });

  test('the preview makes the day roomier by the foundation’s own verdict', async () => {
    const { snap, nowMs } = await open('N');
    const { state, today } = snap();
    const { preview } = computePreview({ state, today, nowMs, date: DAY, intent: MOVE_B });
    assert.equal(preview.before.capacityState.category, 'tight');
    assert.equal(preview.after.capacityState.category, 'room');
  });

  test('preview equals reality: after Accept, today projects to exactly what the preview showed', async () => {
    const { store, snap, nowMs } = await open('N');
    const { state, today } = snap();
    const { preview } = computePreview({ state, today, nowMs, date: DAY, intent: MOVE_B });
    const result = await acceptIntent(store, MOVE_B, preview.basedOn);
    assert.equal(result.status, 'applied');
    const real = projectCalendarDay({ state: snap().state, date: DAY, today: DAY, nowMs });
    assert.deepEqual(evidenceWithoutPreview(real), evidenceWithoutPreview(preview.after));
    const tomorrow = projectCalendarDay({ state: snap().state, date: NEXT, today: DAY, nowMs, includeActions: false });
    assert.deepEqual(tomorrow.dayItems.map((i) => i.ref.id), preview.destination.after.dayItems.map((i) => i.ref.id));
  });

  test('accept uses the legitimate mutation: one move record, the item really moved', async () => {
    const { store, snap, nowMs } = await open('N');
    const { state, today } = snap();
    const { preview } = computePreview({ state, today, nowMs, date: DAY, intent: MOVE_B });
    await acceptIntent(store, MOVE_B, preview.basedOn);
    const after = snap().state;
    assert.deepEqual(after.actions.map((a) => a.type), ['daily_load.move_event']);
    assert.equal(after.actions[0].targetId, 'evt-b');
    assert.equal(after.events.find((e) => e.id === 'evt-b').startsAt, instantAt('11:10', NEXT));
  });

  test('a move the foundation does not offer has no preview (SAFE-UNAVAILABLE)', async () => {
    const { snap, nowMs } = await open('N');
    const { state, today } = snap();
    assert.deepEqual(computePreview({ state, today, nowMs, date: DAY, intent: { kind: 'move_event', id: 'evt-a' } }), { ok: false, reason: 'not_offered' }, 'a fixed commitment');
    assert.deepEqual(computePreview({ state, today, nowMs, date: DAY, intent: { kind: 'move_event', id: 'missing' } }), { ok: false, reason: 'not_offered' });
  });
});

describe('AA — cancel leaves no trace', () => {
  test('opening and discarding a preview writes nothing and changes nothing', async () => {
    const { h, snap, nowMs } = await open('N');
    const before = snap().state;
    const writes = h.primaryWrites().length;
    computePreview({ state: before, today: snap().today, nowMs, date: DAY, intent: MOVE_B });
    computePreview({ state: before, today: snap().today, nowMs, date: DAY, intent: { kind: 'protect', targetType: 'event', targetId: 'evt-b' } });
    assert.equal(snap().state, before, 'the very same state object');
    assert.equal(h.primaryWrites().length, writes, 'no persistence write');
    assert.deepEqual(before.actions, []);
  });
});

describe('AB — a repeated accept cannot corrupt state', () => {
  test('two accepts in the same tick: one applies, the other is refused, and there is one action record', async () => {
    const { store, snap, nowMs } = await open('N');
    const { state, today } = snap();
    const { preview } = computePreview({ state, today, nowMs, date: DAY, intent: MOVE_B });
    const [first, second] = await Promise.all([acceptIntent(store, MOVE_B, preview.basedOn), acceptIntent(store, MOVE_B, preview.basedOn)]);
    assert.deepEqual([first.status, second.status].sort(), ['applied', 'stale']);
    assert.equal(snap().state.actions.length, 1);
  });

  test('accepting again without a token is a no-op the foundation gate refuses: still one record', async () => {
    const { store, snap } = await open('N');
    assert.equal((await acceptIntent(store, MOVE_B, null)).status, 'applied');
    assert.equal((await acceptIntent(store, MOVE_B, null)).status, 'not_applied');
    assert.equal(snap().state.actions.length, 1);
  });

  test('a store no-op reports success, but Calendar still reports it as not applied (F03-FG-12)', async () => {
    const { store, snap } = await open('N');
    const before = snap().state;
    assert.equal(await store.commit((s) => s), true, 'the store calls a no-op saved');
    assert.equal((await acceptIntent(store, { kind: 'move_event', id: 'evt-a' }, null)).status, 'not_applied');
    assert.equal(snap().state, before);
  });
});

describe('AG — a schedule that changes under a preview never leaves a stale-world preview', () => {
  const arrive = (store) =>
    store.commit((current, ctx) =>
      addEvent(current, ctx, { title: 'Arrived meeting', categoryId: 'cat-home', scope: 'household', commitment: 'fixed', startsAt: instantAt('14:00'), endsAt: instantAt('15:00') })
    );

  test('an unrelated change makes the preview stale, then it is RECOMPUTED against the current state', async () => {
    const { store, snap, nowMs } = await open('N');
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: MOVE_B });
    assert.equal(validityOf(preview, snap().state, DAY), 'current');

    await arrive(store);
    assert.equal(validityOf(preview, snap().state, DAY), 'stale', 'detected, never silent');
    const refreshed = refreshPreview(preview, { state: snap().state, today: DAY, nowMs });
    assert.equal(refreshed.status, 'updated');
    assert.equal(refreshed.preview.updated, true, 'the screen can say the preview was updated');
    assert.equal(refreshed.preview.after.dayItems.some((i) => i.title === 'Arrived meeting'), true, 'it now describes the CURRENT world');
    assert.equal(validityOf(refreshed.preview, snap().state, DAY), 'current');
  });

  test('a change that makes the action unavailable INVALIDATES the preview explicitly', async () => {
    const { store, snap, nowMs } = await open('N');
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: MOVE_B });
    await store.commit((current, ctx) => applyIntent(current, ctx, { kind: 'keep_timing' }));
    assert.deepEqual(refreshPreview(preview, { state: snap().state, today: DAY, nowMs }), { status: 'invalid' });
  });

  test('accepting a stale proposal is refused until revalidated; nothing is applied', async () => {
    const { store, snap, nowMs } = await open('N');
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: MOVE_B });
    await arrive(store);
    const before = snap().state;
    assert.equal((await acceptIntent(store, MOVE_B, preview.basedOn)).status, 'stale');
    assert.equal(snap().state, before, 'the store is exactly as the arrival left it');
    assert.equal(before.actions.length, 0);
  });

  test('a day rollover also stales a preview', async () => {
    const { snap, nowMs } = await open('N');
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: MOVE_B });
    assert.equal(validityOf(preview, snap().state, NEXT), 'stale');
  });
});

describe('AH — restart during a preview', () => {
  test('nothing about a preview is persisted, so a relaunch shows canonical state with no ghost', async () => {
    const { h, snap, nowMs } = await open('N');
    const canonical = JSON.stringify(snap().state);
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: MOVE_B });
    assert.ok(preview);

    const raw = h.storage.contents()[STORAGE_KEYS.primary];
    assert.doesNotMatch(raw, /basedOnRevision|"preview"|destination|previewContext/, 'no preview leaked into the stored envelope');

    const relaunched = await launch(h);
    assert.equal(JSON.stringify(relaunched.getSnapshot().state), canonical, 'canonical state is unchanged after a restart');
    assert.equal(relaunched.getSnapshot().state.actions.length, 0, 'no ghost mutation');
    assert.equal(relaunched.getSnapshot().recovery, null, 'no rehydration failure');
  });
});

describe('O — SHORTEN, DROP and PROTECT go through the same preview and the same mutations', () => {
  test('SHORTEN previews the shorter task and Accept records exactly that', async () => {
    const { store, snap, nowMs } = await open('O');
    const intent = { kind: 'shorten_task', id: 'tsk-garage' };
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent });
    assert.equal(preview.before.dayItems.find((i) => i.ref.id === 'tsk-garage').durationMinutes, 200);
    assert.equal(preview.after.dayItems.find((i) => i.ref.id === 'tsk-garage').durationMinutes, 140, '200 minus the 60-minute shortfall');
    assert.equal((await acceptIntent(store, intent, preview.basedOn)).status, 'applied');
    assert.equal(snap().state.tasks.find((t) => t.id === 'tsk-garage').durationMinutes, 140);
    assert.equal(snap().state.actions[0].type, 'daily_load.shorten_task');
  });

  test('DROP removes exactly the task the verdict names, and only one capacity decision is allowed per day', async () => {
    const { store, snap, nowMs } = await open('O');
    const intent = { kind: 'drop_task', id: 'tsk-garage' };
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent });
    assert.equal(preview.after.dayItems.some((i) => i.ref.id === 'tsk-garage'), false);
    assert.equal((await acceptIntent(store, intent, preview.basedOn)).status, 'applied');
    assert.equal(snap().state.tasks.find((t) => t.id === 'tsk-garage').status, 'archived');
    assert.deepEqual(computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: { kind: 'shorten_task', id: 'tsk-garage' } }), { ok: false, reason: 'not_offered' });
  });

  test('a fixed, due-today task is never offered for dropping', async () => {
    const { snap, nowMs } = await open('O');
    assert.deepEqual(computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent: { kind: 'drop_task', id: 'tsk-due' } }), { ok: false, reason: 'not_offered' });
  });

  test('PROTECT makes a flexible item fixed; it is then no longer protectable', async () => {
    const { store, snap, nowMs } = await open('N');
    const intent = { kind: 'protect', targetType: 'event', targetId: 'evt-b' };
    const { preview } = computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent });
    assert.equal(preview.before.dayItems.find((i) => i.ref.id === 'evt-b').flexibility, 'flexible');
    assert.equal(preview.after.dayItems.find((i) => i.ref.id === 'evt-b').flexibility, 'fixed');
    assert.equal((await acceptIntent(store, intent, preview.basedOn)).status, 'applied');
    assert.equal(computePreview({ state: snap().state, today: DAY, nowMs, date: DAY, intent }).ok, false);
    assert.equal(snap().state.events.find((e) => e.id === 'evt-b').commitment, 'fixed');
  });
});

describe('KEEP and UNDO', () => {
  test('keeping the plan records her decision and uses up the day’s one timing decision', async () => {
    const { store, snap, nowMs } = await open('N');
    assert.equal((await acceptIntent(store, { kind: 'keep_timing' }, null)).status, 'applied');
    const view = projectCalendarDay({ state: snap().state, date: DAY, today: DAY, nowMs });
    assert.equal(view.availableActions.find((a) => a.action === 'MOVE' && a.itemRef === null).reason, 'decision_already_made');
    assert.equal(view.availableActions.find((a) => a.action === 'KEEP').reason, 'decision_already_made');
  });

  test('a move can be undone today: the item returns and the day’s decision stays made', async () => {
    const { store, snap, nowMs } = await open('N');
    await acceptIntent(store, MOVE_B, null);
    const view = projectCalendarDay({ state: snap().state, date: DAY, today: DAY, nowMs });
    const undo = view.availableActions.find((a) => a.action === 'UNDO' && a.available);
    assert.deepEqual(undo.itemRef, { kind: 'event', id: 'evt-b' });
    const moved = snap().state.actions[0];
    assert.equal((await acceptIntent(store, { kind: 'undo_move', actionId: moved.id }, null)).status, 'applied');
    assert.equal(snap().state.events.find((e) => e.id === 'evt-b').startsAt, instantAt('11:10'));
    assert.equal(projectCalendarDay({ state: snap().state, date: DAY, today: DAY, nowMs }).availableActions.find((a) => a.action === 'UNDO').available, false);
  });
});

describe('read-only is valid (32A)', () => {
  test('on a day that is not today no recommendation action is available and none can be previewed as offered', async () => {
    const { snap, nowMs } = await open('N');
    const view = projectCalendarDay({ state: snap().state, date: NEXT, today: DAY, nowMs });
    assert.equal(view.availableActions.some((a) => ['MOVE', 'DROP', 'SHORTEN', 'KEEP', 'KEEP_CAPACITY', 'UNDO'].includes(a.action) && a.available), false);
  });

  test('Calendar imports no mutation other than the foundation’s recommendation actions', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/features/calendar/model/preview.ts', import.meta.url), 'utf8');
    const imported = [...source.matchAll(/import \{([^}]+)\} from '\.\.\/\.\.\/\.\.\/domain\/(?:dailyLoadDecisions|recommendationActions)'/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    assert.deepEqual(imported.sort(), ['approveDailyLoadMove', 'approveDropTask', 'approveMoveEvent', 'approveProtectItem', 'approveShortenTask', 'keepCapacityPlan', 'keepDailyLoadPlan', 'undoRecommendedMove']);
  });
});
