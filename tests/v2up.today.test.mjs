/**
 * V2 upgrade, workstream A (Today / Daily Load / One Move).
 *
 *  1. Capacity pressure offers an ORDERED list of eligible tasks, and the approvals accept any task in the LIVE list
 *     (still re-derived from live state, still one decision a day) — a non-destructive "another solution".
 *  2. What each option would honestly do: a smaller task may not clear the shortfall, and the copy says so.
 *  3. Every decision Daily Load and One Move ask for goes through `store.commit`: "Done" / "Moved" is shown only once the
 *     write landed, and a failed write says "Nothing changed — try again".
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { STORAGE_KEYS, harness, stored } from './support/fixtures.mjs';
import { addTask } from '../src/domain/tasks.ts';
import { assessDailyLoadIssues, detectCapacityPressure } from '../src/domain/dailyLoadIssues.ts';
import { oneMoveForDay } from '../src/domain/oneMove.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import {
  approveDropTask,
  approveProtectItem,
  approveShortenTask,
  capacityReliefFor,
  keepCapacityPlan,
} from '../src/domain/recommendationActions.ts';
import { validateAppState } from '../src/domain/state.ts';
import { computeDailyLoad } from '../src/features/daily-load/computeDailyLoad.ts';
import { capacityOptionCopy } from '../src/features/daily-load/capacityOptionCopy.ts';
import { DAY, NEXT_DAY, ev, household, mkCtx, nyMs, taskNamed, tk, valid } from './today/fixtures.mjs';

await import('./today/support/stub-appstate.mjs');
await import('./today/support/stub-expo-router.mjs');
const { AppStateProvider } = await import('../src/store/AppStateProvider.tsx');
const { ScheduleProvider } = await import('../src/store/ScheduleContext.tsx');
const { OneMoveProvider, useOneMove } = await import('../src/store/OneMoveContext.tsx');
const { DailyLoadCard } = await import('../src/features/daily-load/DailyLoadCard.tsx');
const { OneMoveCard } = await import('../src/features/one-move/OneMoveCard.tsx');

const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const ctxAt = (h = 9) => mkCtx(nyMs(h));

/**
 * A long fixed shift that leaves 60 minutes, against today's list:
 *   Big 120, Medium 45, Small 30, Tiny 10 (flexible, planned today, not due)  -> offered, largest first
 *   Due bill 20 (flexible but due today), Fixed errand 25 (fixed)              -> counted, never offered
 *   Planned-for-tomorrow 90                                                     -> not on today's list at all
 * needed 250 - available 60 = 190 minutes over.
 */
function crowdedDay() {
  let s = household();
  s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
  s = tk(s, { title: 'Big', minutes: 120 });
  s = tk(s, { title: 'Medium', minutes: 45 });
  s = tk(s, { title: 'Small', minutes: 30 });
  s = tk(s, { title: 'Tiny', minutes: 10 });
  s = tk(s, { title: 'Due bill', minutes: 20, due: DAY });
  s = tk(s, { title: 'Fixed errand', minutes: 25, commitment: 'fixed' });
  s = tk(s, { title: 'Tomorrow thing', minutes: 90, plan: { kind: 'day', date: NEXT_DAY } });
  return valid(s);
}

const idOf = (state, title) => taskNamed(state, title).id;
const pressureOf = (state) => {
  const day = projectStateDay(state, DAY);
  return detectCapacityPressure(day.events, day.tasks);
};
const issuesOf = (state) => {
  const day = projectStateDay(state, DAY);
  return assessDailyLoadIssues(day.events, day.tasks, computeDailyLoad(day.events, day.tasks));
};

describe('capacity pressure — an ordered list of eligible tasks', () => {
  test('lists every flexible, not-due-today, open task on today’s list, largest first then id; the largest-task fields stay backward compatible', () => {
    const state = crowdedDay();
    const p = pressureOf(state);
    assert.equal(p.pressureMinutes, 190);
    assert.deepEqual(p.candidates.map((c) => [c.title, c.durationMinutes]), [['Big', 120], ['Medium', 45], ['Small', 30], ['Tiny', 10]]);
    assert.deepEqual([p.largestTaskId, p.largestTaskTitle, p.largestTaskMinutes], [p.candidates[0].taskId, 'Big', 120]);
  });

  test('equal durations are ordered by id, so the list reads the same whatever order tasks were entered in', () => {
    let s = household();
    s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
    s = tk(s, { title: 'Twin A', minutes: 90 });
    s = tk(s, { title: 'Twin B', minutes: 90 });
    const ids = pressureOf(valid(s)).candidates.map((c) => c.taskId);
    assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
  });

  test('negative control: when every task is fixed or due today the list is empty and nothing is offered', () => {
    let s = household();
    s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
    s = tk(s, { title: 'Taxes', minutes: 180, due: DAY });
    s = tk(s, { title: 'Pinned', minutes: 40, commitment: 'fixed' });
    const p = pressureOf(valid(s));
    assert.deepEqual([p.candidates, p.largestTaskId, p.largestTaskTitle, p.largestTaskMinutes], [[], null, null, null]);
  });

  test('browsing is free: deriving the list twice changes nothing and records no action', () => {
    const state = crowdedDay();
    const before = JSON.stringify(state);
    pressureOf(state);
    issuesOf(state);
    assert.equal(JSON.stringify(state), before);
    assert.equal(state.actions.length, 0);
  });
});

describe('approvals accept any task in the LIVE candidate list — and nothing else', () => {
  test('DROP of a non-largest candidate archives exactly that task, records one approved action, and leaves every other task alone', () => {
    const state = crowdedDay();
    const small = idOf(state, 'Small');
    const after = approveDropTask(state, ctxAt(), small);

    assert.notEqual(after, state);
    assert.equal(taskNamed(after, 'Small').status, 'archived');
    for (const title of ['Big', 'Medium', 'Tiny', 'Due bill', 'Fixed errand']) assert.equal(taskNamed(after, title).status, 'open', title);
    const [action] = after.actions;
    assert.deepEqual([after.actions.length, action.type, action.targetId, action.approval, action.reason.shortfallMinutes], [1, 'daily_load.drop_task', small, 'approved', 190]);
    assert.equal(validateAppState(after).ok, true);
  });

  test('SHORTEN of a non-largest candidate cuts it by the shortfall, floored at 15 minutes, and marks the new number as inferred', () => {
    const state = crowdedDay();
    const medium = idOf(state, 'Medium');
    const after = approveShortenTask(state, ctxAt(), medium);
    assert.equal(taskNamed(after, 'Medium').durationMinutes, 15, '45 - 190 is under the floor');
    assert.equal(taskNamed(after, 'Medium').durationSource, 'inferred');
    assert.deepEqual([after.actions[0].before, after.actions[0].after], [{ durationMinutes: 45 }, { durationMinutes: 15 }]);
    assert.equal(validateAppState(after).ok, true);
  });

  test('a task already at the 15-minute floor cannot be shortened (a no-op), but can still be dropped', () => {
    let s = household();
    s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
    s = tk(s, { title: 'Big', minutes: 120 });
    s = tk(s, { title: 'Floor', minutes: 15 });
    const state = valid(s);
    assert.equal(approveShortenTask(state, ctxAt(), idOf(state, 'Floor')), state);
    assert.equal(taskNamed(approveDropTask(state, ctxAt(), idOf(state, 'Floor')), 'Floor').status, 'archived');
  });

  test('refuses what the verdict does not offer: fixed, due today, not on today’s list, unknown ids', () => {
    const state = crowdedDay();
    for (const title of ['Fixed errand', 'Due bill', 'Tomorrow thing']) {
      assert.equal(approveDropTask(state, ctxAt(), idOf(state, title)), state, `${title} (drop)`);
      assert.equal(approveShortenTask(state, ctxAt(), idOf(state, title)), state, `${title} (shorten)`);
    }
    assert.equal(approveDropTask(state, ctxAt(), 'task-that-does-not-exist'), state);
  });

  test('re-derived at approval time: a task protected since the screen was drawn is no longer offered', () => {
    const state = crowdedDay();
    const small = idOf(state, 'Small');
    const protectedState = approveProtectItem(state, ctxAt(), { targetType: 'task', targetId: small });
    assert.equal(pressureOf(protectedState).candidates.some((c) => c.taskId === small), false);
    assert.equal(approveDropTask(protectedState, ctxAt(), small), protectedState);
    assert.equal(approveShortenTask(protectedState, ctxAt(), small), protectedState);
  });

  test('re-derived at approval time: a task archived or completed elsewhere is refused', () => {
    const state = crowdedDay();
    const small = idOf(state, 'Small');
    const archived = { ...state, tasks: state.tasks.map((t) => (t.id === small ? { ...t, status: 'archived' } : t)) };
    assert.equal(approveDropTask(archived, ctxAt(), small), archived);
    const completed = { ...state, tasks: state.tasks.map((t) => (t.id === small ? { ...t, status: 'completed' } : t)) };
    assert.equal(approveShortenTask(completed, ctxAt(), small), completed);
  });

  test('one capacity decision per day, whichever candidate and whichever action it was', () => {
    const state = crowdedDay();
    const dropped = approveDropTask(state, ctxAt(), idOf(state, 'Medium'));
    assert.equal(approveDropTask(dropped, ctxAt(), idOf(state, 'Small')), dropped, 'a second drop');
    assert.equal(approveShortenTask(dropped, ctxAt(), idOf(state, 'Tiny')), dropped, 'a shorten after a drop');
    assert.equal(keepCapacityPlan(dropped, ctxAt()), dropped, 'keeping after a decision');

    const kept = keepCapacityPlan(state, ctxAt());
    assert.equal(kept.actions[0].approval, 'declined');
    assert.equal(approveDropTask(kept, ctxAt(), idOf(state, 'Small')), kept, 'a drop after she kept the plan');
  });

  test('once the day fits there is no verdict, so a stale screen cannot drop anything more', () => {
    const state = crowdedDay();
    // Removing every other piece of work makes today fit; the verdict goes away and so does the authority to act.
    const fits = { ...state, tasks: state.tasks.map((t) => (t.title === 'Small' ? t : { ...t, status: 'archived' })) };
    assert.equal(pressureOf(fits), null);
    assert.equal(approveDropTask(fits, ctxAt(), idOf(state, 'Small')), fits);
  });

  test('keeping the plan still records the task Her Keys led with (the largest), exactly as before', () => {
    const state = crowdedDay();
    const kept = keepCapacityPlan(state, ctxAt());
    assert.equal(kept.actions[0].reason.consideredTaskId, idOf(state, 'Big'));
  });
});

describe('honest relief — a smaller task may not clear the whole shortfall', () => {
  test('drop frees the whole task; what is left over is stated, never rounded away', () => {
    assert.deepEqual(
      [capacityReliefFor(190, 120).dropFreesMinutes, capacityReliefFor(190, 120).stillOverAfterDrop, capacityReliefFor(190, 30).stillOverAfterDrop],
      [120, 70, 160]
    );
    assert.equal(capacityReliefFor(40, 120).stillOverAfterDrop, 0, 'a big enough task does cover it');
  });

  test('shorten frees only what the 15-minute floor allows', () => {
    const r = capacityReliefFor(190, 45);
    assert.deepEqual([r.canShorten, r.shortenToMinutes, r.shortenFreesMinutes, r.stillOverAfterShorten], [true, 15, 30, 160]);
    const exact = capacityReliefFor(20, 60);
    assert.deepEqual([exact.shortenToMinutes, exact.shortenFreesMinutes, exact.stillOverAfterShorten], [40, 20, 0]);
    const floor = capacityReliefFor(190, 15);
    assert.deepEqual([floor.canShorten, floor.shortenFreesMinutes], [false, 0]);
  });

  test('the relief numbers equal what approving really does to the stored task and to the verdict', () => {
    const state = crowdedDay();
    const p = pressureOf(state);
    for (const c of p.candidates) {
      const dropped = approveDropTask(state, ctxAt(), c.taskId);
      assert.equal(pressureOf(dropped)?.pressureMinutes ?? 0, capacityReliefFor(p.pressureMinutes, c.durationMinutes).stillOverAfterDrop, `${c.title} drop`);
      if (!capacityReliefFor(p.pressureMinutes, c.durationMinutes).canShorten) continue;
      const shortened = approveShortenTask(state, ctxAt(), c.taskId);
      assert.equal(pressureOf(shortened)?.pressureMinutes ?? 0, capacityReliefFor(p.pressureMinutes, c.durationMinutes).stillOverAfterShorten, `${c.title} shorten`);
    }
  });

  test('copy says "still N minutes over" when it does not clear the day, and "covers" only when it does', () => {
    const partial = capacityOptionCopy('Medium', 45, 190);
    assert.match(partial.dropLine, /frees 45 minutes, but the day would still be 145 minutes over\./);
    assert.match(partial.shortenLine, /Shortening it to 15 minutes frees 30 minutes, but the day would still be 160 minutes over\./);
    assert.equal(partial.recommendation, 'Shorten or drop “Medium”.');
    assert.doesNotMatch(`${partial.dropLine} ${partial.shortenLine}`, /covers|fixes|solves/);

    const enough = capacityOptionCopy('Big', 120, 100);
    assert.match(enough.dropLine, /frees 120 minutes, which covers the 100 minutes the day is over\./);

    const floor = capacityOptionCopy('Tiny', 15, 190);
    assert.equal(floor.shortenLine, null);
    assert.equal(floor.recommendation, 'Drop “Tiny” for today.');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The card, on a real store.

async function mountCard(state, { failWrites = { on: false } } = {}) {
  const h = harness({
    initial: { [STORAGE_KEYS.primary]: stored(state) },
    mode: 'empty',
    now: nyMs(9),
    storageOptions: { failWrite: () => failWrites.on },
  });
  const store = h.launch();
  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      <AppStateProvider store={store}>
        <ScheduleProvider>
          <DailyLoadCard />
        </ScheduleProvider>
      </AppStateProvider>
    );
    await store.hydrate();
  });
  return { h, store, renderer, root: renderer.root, failWrites };
}

describe('Daily Load card — capacity pressure: “Show another option”', () => {
  test('cycles through the eligible tasks locally, wraps around, and writes nothing', async () => {
    const { h, store, root } = await mountCard(crowdedDay());
    await store.flush();
    const writes = h.primaryWrites().length;
    const snapshotState = store.getSnapshot().state;

    assert.match(text(root), /Shorten or drop “Big”\./);
    assert.match(text(root), /Option 1 of 4/);
    assert.match(text(root), /Dropping it frees 120 minutes, but the day would still be 70 minutes over\./);

    const seen = [];
    for (let i = 0; i < 4; i++) {
      await press(pressable(root, 'Show another option'));
      seen.push(/“(Big|Medium|Small|Tiny)”/.exec(text(root))[1]);
    }
    assert.deepEqual(seen, ['Medium', 'Small', 'Tiny', 'Big'], 'in order, then back to the start');
    assert.match(text(root), /Option 1 of 4/);

    await store.flush();
    assert.equal(h.primaryWrites().length, writes, 'browsing wrote nothing');
    assert.equal(store.getSnapshot().state, snapshotState, 'and changed nothing');
    assert.equal(store.getSnapshot().state.actions.length, 0);
  });

  test('approving the option shown (not the largest) drops exactly that task, persists it, and the card says it was adjusted', async () => {
    const { h, store, root } = await mountCard(crowdedDay());
    await press(pressable(root, 'Show another option'));
    await press(pressable(root, 'Show another option'));
    assert.match(text(root), /“Small”/);

    await press(pressable(root, 'Drop it'));
    const state = store.getSnapshot().state;
    assert.equal(taskNamed(state, 'Small').status, 'archived');
    assert.equal(taskNamed(state, 'Big').status, 'open');
    assert.equal(state.actions.length, 1);
    assert.match(text(root), /Today’s workload was adjusted\./);
    assert.match(text(root), /still asks about 160 minutes more than the day holds/, 'and it does not pretend the day now fits');
    assert.ok(h.primaryWrites().some((w) => w.ok && w.value.includes('daily_load.drop_task')), 'the decision reached storage');
  });

  test('a failed write says nothing changed, keeps her on the option she was looking at, and a retry works', async () => {
    const { store, root, failWrites } = await mountCard(crowdedDay());
    await press(pressable(root, 'Show another option'));
    failWrites.on = true;
    await press(pressable(root, 'Drop it'));
    assert.match(text(root), /Her Keys couldn’t save that yet\. Nothing changed — try again\./);
    assert.equal(store.getSnapshot().state.actions.length, 0);
    assert.equal(taskNamed(store.getSnapshot().state, 'Medium').status, 'open');
    assert.match(text(root), /“Medium”/);

    failWrites.on = false;
    await press(pressable(root, 'Drop it'));
    assert.equal(taskNamed(store.getSnapshot().state, 'Medium').status, 'archived');
    assert.doesNotMatch(text(root), /Nothing changed/);
  });

  test('protecting the option shown removes it from the list instead of stranding the card on a stale task', async () => {
    const { store, root } = await mountCard(crowdedDay());
    await press(pressable(root, 'Show another option'));
    await press(pressable(root, 'Protect it'));
    const state = store.getSnapshot().state;
    assert.equal(taskNamed(state, 'Medium').commitment, 'fixed');
    assert.match(text(root), /Option 1 of 3/);
    assert.doesNotMatch(text(root), /“Medium”/);
  });

  test('with a single candidate there is no “Show another option”; with none there is no action at all, only the honest note', async () => {
    let s = household();
    s = ev(s, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
    s = tk(s, { title: 'Only one', minutes: 120 });
    const single = await mountCard(valid(s));
    assert.equal(pressable(single.root, 'Show another option'), undefined);
    assert.ok(pressable(single.root, 'Drop it'));

    let n = household();
    n = ev(n, { title: 'Long shift', from: [6], to: [21], category: 'cat-work' });
    n = tk(n, { title: 'Taxes', minutes: 180, due: DAY });
    const none = await mountCard(valid(n));
    assert.equal(pressable(none.root, 'Drop it'), undefined);
    assert.equal(pressable(none.root, 'Show another option'), undefined);
    assert.match(text(none.root), /due today or fixed, so Her Keys won’t drop or shorten any of it/);
  });

  test('the controls carry labels and hints a screen reader can use', async () => {
    const { root } = await mountCard(crowdedDay());
    assert.match(pressable(root, 'Drop it').props.accessibilityHint, /Removes Big from today and frees 120 minutes/);
    assert.match(pressable(root, 'Shorten it').props.accessibilityHint, /Shortens Big to 15 minutes|Shortens Big to \d+ minutes/);
    assert.match(pressable(root, 'Show another option').props.accessibilityHint, /Nothing changes until you choose/);
    assert.match(pressable(root, 'Protect it').props.accessibilityHint, /fixed commitment/);
  });
});

describe('Daily Load card — the timing flow now saves before it says so', () => {
  /** A 15:00 pickup and 16:30 soccer with a flexible 30-minute task between them: the window is tight and the task is the move. */
  const tightDay = () => {
    let s = household();
    s = ev(s, { title: 'Pick up kids', from: [15], to: [15, 15] });
    s = ev(s, { title: 'Soccer practice', from: [16, 30], to: [17, 30] });
    s = tk(s, { title: 'Return library books', minutes: 40, plan: { kind: 'timed', startsAt: new Date(nyMs(15, 20)).toISOString() } });
    return valid(s);
  };

  test('moving the recommended task shows “moved” only after the write landed', async () => {
    const { store, root } = await mountCard(tightDay());
    assert.match(text(root), /Move “Return library books” to tomorrow\./);
    await press(pressable(root, 'Move it to tomorrow'));
    assert.match(text(root), /“Return library books” moved to tomorrow\./);
    assert.equal(store.getSnapshot().state.actions.at(-1).type, 'daily_load.move_task');
  });

  test('a failed move changes nothing and says so; Keep as planned is held to the same rule', async () => {
    const { store, root, failWrites } = await mountCard(tightDay());
    failWrites.on = true;
    await press(pressable(root, 'Move it to tomorrow'));
    assert.match(text(root), /Nothing changed — try again\./);
    assert.doesNotMatch(text(root), /moved to tomorrow/);
    assert.equal(store.getSnapshot().state.actions.length, 0);

    await press(pressable(root, 'Keep today as planned'));
    assert.match(text(root), /Nothing changed — try again\./);
    assert.equal(store.getSnapshot().state.actions.length, 0);

    failWrites.on = false;
    await press(pressable(root, 'Keep today as planned'));
    assert.match(text(root), /Today stays as you had it\./);
    assert.equal(store.getSnapshot().state.actions.at(-1).type, 'daily_load.keep_plan');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// One Move completion.

describe('One Move — “I did it” is recorded before “Done” is said', () => {
  const sneakers = () => {
    let s = household();
    s = tk(s, { title: 'Renew library card', minutes: 15, due: NEXT_DAY });
    return valid(s);
  };

  async function mountOneMove(failWrites = { on: false }) {
    const h = harness({
      initial: { [STORAGE_KEYS.primary]: stored(sneakers()) },
      mode: 'empty',
      now: nyMs(9),
      storageOptions: { failWrite: () => failWrites.on },
    });
    const store = h.launch();
    const seen = { move: null };
    const Probe = () => {
      seen.move = useOneMove();
      return null;
    };
    await TestRenderer.act(async () => {
      TestRenderer.create(
        <AppStateProvider store={store}>
          <OneMoveProvider>
            <Probe />
          </OneMoveProvider>
        </AppStateProvider>
      );
      await store.hydrate();
    });
    return { h, store, seen, failWrites };
  }

  test('a saved completion resolves true, completes the move and its task together, and reaches storage', async () => {
    const { h, store, seen } = await mountOneMove();
    assert.equal(seen.move.status, 'selected');
    let saved;
    await TestRenderer.act(async () => {
      saved = await seen.move.complete();
    });
    assert.equal(saved, true);
    const state = store.getSnapshot().state;
    assert.equal(oneMoveForDay(state, DAY).status, 'completed');
    assert.equal(taskNamed(state, 'Renew library card').status, 'completed');
    assert.ok(h.primaryWrites().some((w) => w.ok && w.value.includes('"completed"')));
  });

  test('a failed save resolves false and leaves the move, and its task, exactly as they were', async () => {
    const { store, seen, failWrites } = await mountOneMove();
    failWrites.on = true;
    let saved;
    await TestRenderer.act(async () => {
      saved = await seen.move.complete();
    });
    assert.equal(saved, false);
    const state = store.getSnapshot().state;
    assert.equal(oneMoveForDay(state, DAY).status, 'selected');
    assert.equal(taskNamed(state, 'Renew library card').status, 'open');
  });

  const selectedSection = () => ({
    status: 'selected',
    action: 'Renew library card',
    estimatedMinutes: 15,
    durationKnowledge: 'user-provided',
    targetType: 'task',
    targetId: 't1',
    open: null,
    completion: 'completes_task',
    why: null,
    source: null,
  });

  test('the card keeps “I did it” and tells her plainly when the save failed; a later success clears the note', async () => {
    let result = false;
    let calls = 0;
    const r = await render(<OneMoveCard section={selectedSection()} onComplete={async () => { calls += 1; return result; }} />);
    await press(pressable(r.root, 'I did it'));
    assert.equal(calls, 1);
    assert.match(text(r.root), /Her Keys couldn’t save that yet\. Nothing changed — try again\./);
    assert.ok(pressable(r.root, 'I did it'), 'still there to try again');

    result = true;
    await press(pressable(r.root, 'I did it'));
    assert.equal(calls, 2);
    assert.doesNotMatch(text(r.root), /Nothing changed/);
  });

  test('two taps in the same frame record the move once', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const r = await render(<OneMoveCard section={selectedSection()} onComplete={() => { calls += 1; return gate; }} />);
    const button = pressable(r.root, 'I did it');
    await TestRenderer.act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    assert.equal(calls, 1);
    await TestRenderer.act(async () => release(true));
  });

  test('a caller that returns nothing (the gallery, older tests) is still treated as success', async () => {
    let calls = 0;
    const r = await render(<OneMoveCard section={selectedSection()} onComplete={() => { calls += 1; }} />);
    await press(pressable(r.root, 'I did it'));
    assert.equal(calls, 1);
    assert.doesNotMatch(text(r.root), /Nothing changed/);
  });
});
