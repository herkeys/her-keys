/**
 * TODAY — Scenario M: correction, end to end, through a REAL store.
 *
 * Today may not be an authoritative report she cannot challenge — and it may not invent a way to challenge it.
 * So: every affordance must reach an existing screen or an existing domain mutation; the mutation must go through
 * `store.commit` (persisted before it is shown); Today must re-derive from what the store now holds; and where no
 * correction path exists (MP-01..MP-04), no affordance implying one is rendered.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { decideIntent } from '../../src/domain/authorization.ts';
import { intentLifecycle } from '../../src/domain/authorization.ts';
import { addPerson, accept, acknowledge, decline, delegate, returnToSelf } from '../../src/domain/responsibility.ts';
import { updateTask } from '../../src/domain/tasks.ts';
import { STORAGE_KEYS, harness, stored } from '../support/fixtures.mjs';
import { richHousehold } from '../support/richHousehold.mjs';
import { DAY, at, dense, ev, eventNamed, household, mkCtx, nyMs, taskNamed, tk, valid, view, withAction } from './fixtures.mjs';
import { buildTodayView } from '../../src/features/today/model/index.ts';

const NOW = nyMs(9);

/** A real store, hydrated from the given household, on the fixed clock. */
async function launch(state, now = NOW) {
  const h = harness({ initial: { [STORAGE_KEYS.primary]: stored(state) }, mode: 'empty', now });
  const store = h.launch();
  await store.hydrate();
  const snapshot = () => store.getSnapshot();
  const today = () =>
    buildTodayView({ state: snapshot().state, nowMs: h.clock.now, runtime: { status: snapshot().status, recovery: snapshot().recovery, persistence: snapshot().persistence } });
  return { store, h, snapshot, today };
}

describe('every route Today can offer is an existing screen, reached with the params it reads', () => {
  const source = (path) => readFileSync(path, 'utf8');

  test('the task and event editors read the id Today passes, and save through the existing mutations', () => {
    assert.match(source('app/task-editor.tsx'), /useLocalSearchParams<\{ taskId\?: string/);
    assert.match(source('app/event-editor.tsx'), /useLocalSearchParams<\{ eventId\?: string/);
    const taskForm = source('src/features/tasks/TaskForm.tsx');
    assert.match(taskForm, /updateTask\(current, ctx, existing\.id, edits\)/);
    assert.match(taskForm, /archiveTask\(current, ctx, existing\.id\)/);
    assert.match(taskForm, /completeTask\(current, ctx, existing\.id\)/);
    assert.match(source('src/features/calendar/EventForm.tsx'), /updateEvent\(current, ctx, existing\.id, edits\)/);
    assert.match(source('src/features/calendar/EventForm.tsx'), /removeEvent\(current, ctx, existing\.id\)/);
  });

  test('every pathname the projection can produce maps to a real route file', () => {
    const files = { '/task-editor': 'app/task-editor.tsx', '/event-editor': 'app/event-editor.tsx', '/life/needs-me': 'app/(app)/life/needs-me.tsx' };
    const seen = new Set();
    const collect = (value) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        if (typeof value.pathname === 'string') seen.add(value.pathname);
        Object.values(value).forEach(collect);
      }
    };
    const states = [dense(), richHousehold({ withServerRows: true }).state];
    for (const s of states) collect(view(s, nyMs(6, 5)));
    assert.ok(seen.size >= 2, `saw ${[...seen].join()}`);
    for (const pathname of seen) assert.ok(files[pathname] && existsSync(files[pathname]), `${pathname} must be an existing screen`);
  });
});

describe('a wrong value is corrected through the real path, and Today re-derives', () => {
  const wrongDue = () => valid(tk(household(), { title: 'Book the dentist', minutes: 15, due: DAY, plan: { kind: 'unplanned' } }));

  test('a task with a wrong due date shows as due today; the editor route and the mutation correct it; Today updates on return', async () => {
    const s = wrongDue();
    const { store, today, snapshot, h } = await launch(s);
    const task = taskNamed(snapshot().state, 'Book the dentist');

    const before = today();
    const row = before.attention.rows.find((r) => r.ref?.id === task.id);
    assert.equal(row.statement, '“Book the dentist” is due today.');
    assert.deepEqual(row.actions.find((a) => a.kind === 'open').route, { pathname: '/task-editor', params: { taskId: task.id } });

    // What TaskForm does on "Save changes": store.commit(updateTask(...)).
    const saved = await store.commit((current, ctx) => updateTask(current, ctx, task.id, { dueDate: '2026-09-30' }));
    assert.equal(saved, true);

    const after = today();
    assert.equal(after.attention?.rows.some((r) => r.ref?.id === task.id) ?? false, false, 'no longer due today, so it no longer needs her today');
    assert.equal(snapshot().state.observations.some((o) => o.about.id === task.id && o.outcome === 'deferred'), true, 'legitimate mutation semantics: a later date is a recorded deferral');
    assert.equal(h.readPrimary().data.tasks.find((x) => x.id === task.id).dueDate, '2026-09-30', 'and it was persisted, not only shown');
  });

  test('editing an inferred row does NOT confirm it: the correction path never touches provenance (MP-01)', async () => {
    const inferred = { producer: 'ai-inference', artifactId: null, confidence: 'possible' };
    const s = valid(tk(household(), { title: 'Send the RSVP', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred }));
    const { store, today, snapshot } = await launch(s);
    const task = taskNamed(snapshot().state, 'Send the RSVP');
    assert.equal(today().attention.rows[0].source.uncertain, true);

    await store.commit((current, ctx) => updateTask(current, ctx, task.id, { title: 'Send the RSVP for Friday' }));
    const after = today();
    assert.equal(taskNamed(snapshot().state, 'Send the RSVP for Friday').provenance.confidence, 'possible');
    assert.equal(after.attention.rows[0].source.uncertain, true, 'still her keys’ unconfirmed claim: an edit is not a confirmation');
  });

  test('taking a delegation back goes through returnToSelf and the row becomes “back with you”', async () => {
    let s = ev(household(), { title: 'School pickup', from: [15, 30], to: [16] });
    s = addPerson(s, mkCtx(nyMs(8)), { displayName: 'Grandma June', relationship: 'grandparent' });
    s = valid(delegate(s, mkCtx(nyMs(8)), { about: { kind: 'event', id: eventNamed(s, 'School pickup').id }, to: { kind: 'person', id: s.people[0].id }, ackWithinMinutes: 30 }));
    const { store, today, snapshot, h } = await launch(s, nyMs(9));

    const row = today().attention.rows[0];
    assert.equal(row.reason, 'unacknowledged_delegation');
    const takeBack = row.actions.find((a) => a.kind === 'take_back');
    assert.equal(await store.commit((current, ctx) => returnToSelf(current, ctx, takeBack.responsibilityId)), true);

    const after = today().attention.rows[0];
    assert.deepEqual([after.reason, after.responsibility.state, after.statement], ['returned', 'returned', '“School pickup” is back with you.']);
    assert.equal(snapshot().state.observations.some((o) => o.about.kind === 'responsibility' && o.outcome === 'returned'), true);
    assert.equal(after.changedToday, 'Returned today at 9:00 AM.', 'a dated observation, not a stored last-looked marker');
    void h;
  });

  test('approving a proposal records her decision — and is NOT execution: it is waiting, never handled', async () => {
    const base = tk(household(), { title: 'Sign the permission form', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
    const s = withAction(base, { about: { kind: 'task', id: taskNamed(base, 'Sign the permission form').id }, decide: null });
    const { store, today, snapshot } = await launch(s);

    const intent = today().attention.rows.find((r) => r.approval).approval;
    assert.equal(await store.commit((current, ctx) => decideIntent(current, ctx, intent.intentId, 'approved')), true);

    const after = today();
    assert.equal(after.attention?.rows.some((r) => r.approval) ?? false, false, 'answered, so it no longer needs her');
    assert.deepEqual(after.waiting.rows.map((r) => r.kind), ['approved_not_run']);
    assert.equal(after.handled, null);
    assert.equal(intentLifecycle(snapshot().state, intent.intentId).stage, 'approved');
  });

  test('declining removes it from Today and claims nothing', async () => {
    const base = tk(household(), { title: 'Sign the permission form', minutes: 10, due: DAY, plan: { kind: 'unplanned' } });
    const s = withAction(base, { about: { kind: 'task', id: taskNamed(base, 'Sign the permission form').id }, decide: null });
    const { store, today, snapshot } = await launch(s);
    const intent = today().attention.rows.find((r) => r.approval).approval;
    await store.commit((current, ctx) => decideIntent(current, ctx, intent.intentId, 'declined'));
    const after = today();
    assert.equal(after.attention?.rows.some((r) => r.approval) ?? false, false);
    assert.equal(after.waiting, null);
    assert.equal(after.handled, null);
    assert.equal(intentLifecycle(snapshot().state, intent.intentId).stage, 'declined');
  });
});

describe('where no correction path exists, no affordance implies one', () => {
  const kinds = (v) => {
    const found = [];
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        if (Array.isArray(value.actions)) found.push(...value.actions.map((a) => a.kind));
        Object.values(value).forEach(walk);
      }
    };
    walk(v);
    return found;
  };

  test('the only actions Today can ever offer are open, take back and review an approval', () => {
    const all = new Set();
    for (const s of [dense(), richHousehold({ withServerRows: true }).state]) for (const k of kinds(view(s, nyMs(6, 5)))) all.add(k);
    assert.ok([...all].every((k) => ['open', 'take_back', 'review_approval'].includes(k)), [...all].join());
    assert.equal([...all].some((k) => /confirm|reject|dismiss|snooze|reschedule|retry|not_today/i.test(k)), false);
  });

  test('take-back is offered only for a handoff that is still out — never for one that was accepted, declined or returned', async () => {
    let s = ev(household(), { title: 'School pickup', from: [15, 30], to: [16] });
    s = addPerson(s, mkCtx(nyMs(8)), { displayName: 'Grandma June', relationship: 'grandparent' });
    s = delegate(s, mkCtx(nyMs(8)), { about: { kind: 'event', id: eventNamed(s, 'School pickup').id }, to: { kind: 'person', id: s.people[0].id } });
    const rid = s.responsibilities[0].id;
    const takeBack = (state) => kinds(view(valid(state), nyMs(10)));

    assert.ok(takeBack(s).includes('take_back'), 'requested');
    assert.ok(takeBack(acknowledge(s, mkCtx(nyMs(9)), rid)).includes('take_back'), 'acknowledged');
    const accepted = accept(acknowledge(s, mkCtx(nyMs(9)), rid), mkCtx(nyMs(9, 30)), rid);
    assert.equal(takeBack(accepted).includes('take_back'), false, 'accepted: it is with them, and not hers to take back from here');
    assert.equal(takeBack(decline(s, mkCtx(nyMs(9)), rid)).includes('take_back'), false, 'declined: it is already hers');
    assert.equal(takeBack(returnToSelf(s, mkCtx(nyMs(9)), rid)).includes('take_back'), false, 'returned: it is already hers');

    // Accepted, and she has said it still needs her: it stays visible as hers to watch — but the holder said yes, so it is not hers to take back from here.
    const stillMine = accept(acknowledge(s, mkCtx(nyMs(9)), rid), mkCtx(nyMs(9, 30)), rid, true);
    const row = view(valid(stillMine), nyMs(10)).attention.rows.find((r) => r.responsibility);
    assert.equal(row.reason, 'delegated_needs_you');
    assert.deepEqual(row.actions.map((a) => a.kind), ['open']);
  });

  test('an unconfirmed claim can be opened and edited, and nothing more (no confirm, no reject)', () => {
    const inferred = { producer: 'ai-inference', artifactId: null, confidence: 'possible' };
    const s = valid(tk(household(), { title: 'Send the RSVP', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, provenance: inferred }));
    assert.deepEqual(kinds(view(s, NOW)), ['open']);
  });

  test('handled and waiting rows carry no actions at all: they are server-written or informational', () => {
    const v = view(richHousehold({ withServerRows: true }).state, nyMs(11));
    assert.ok(v.handled.rows.length > 0);
    for (const row of v.handled.rows) assert.equal('actions' in row, false);
  });
});
