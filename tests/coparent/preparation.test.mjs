import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addTask } from '../../src/domain/tasks.ts';
import { addDependency, readinessOf } from '../../src/domain/structure.ts';
import { buildCoParentLogisticsView } from '../../src/features/coparent/projection.ts';
import {
  completePreparation,
  createPreparation,
  linkPreparation,
  removeHandoff,
  removePreparation,
  unlinkPreparation,
} from '../../src/features/coparent/mutations.ts';
import { presentHub, presentTransitionRow, readinessLine } from '../../src/features/coparent/present.ts';
import { DAY, JOSIE, MILO, NOW, TZ, finishPrep, handoff, prep, world, nyMs } from '../fixtures/coparent/world.mjs';

const view = (w, ms = w.nowMs) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: ms });
const first = (w, ms) => view(w, ms).transitions[0];
const ctx = { today: DAY, zone: TZ };

describe('Preparation: canonical tasks, tied only by an explicit edge, never a claim about the other household', () => {
  test('S: preparation is an ordinary canonical task — co-parenting category, child-linked, owner-only, default duration marked as a default', () => {
    const w = world();
    const id = handoff(w);
    const taskId = prep(w, { title: 'Pack the school laptop', dueDate: '2026-09-17', linkEventId: id });
    const task = w.state.tasks.find((t) => t.id === taskId);
    assert.equal(w.state.categories.find((c) => c.id === task.categoryId).systemRole, 'coparenting');
    assert.equal(task.subjectMemberId, JOSIE);
    assert.equal(task.scope, 'coparent-shared');
    assert.equal(task.provenance.producer, 'user-action');
    assert.equal(task.durationSource, 'default', 'DEFAULT ≠ USER-PROVIDED: the planning default is recorded as one (HA-010)');
    const edge = w.state.dependencies.find((d) => d.to.id === taskId);
    assert.deepEqual([edge.relation, edge.from.kind, edge.from.id, edge.status], ['requires', 'event', id, 'active']);
  });

  test('a preparation item with no recorded link is shown as NOT linked — a link is never inferred from dates or child', () => {
    const w = world();
    const id = handoff(w, { date: '2026-09-18' });
    const taskId = prep(w, { title: 'Return library book', dueDate: '2026-09-17' });
    const v = view(w);
    assert.equal(v.transitions[0].preparation.linked, 0, 'same child, due the day before — still not linked');
    const item = v.preparation[0].items.find((i) => i.taskId === taskId);
    assert.equal(item.linkedTransitionId, null);
    const hub = presentHub(v, ctx);
    assert.deepEqual(hub.preparation[0].items[0].lines.slice(0, 1), ['Not linked to a specific handoff.']);
    assert.ok(id);
  });

  test('T: a completed preparation task means "Marked done" — never packed, sent, delivered or received by the other household', () => {
    const w = world();
    const id = handoff(w);
    const taskId = prep(w, { title: 'Pack the school laptop', linkEventId: id });
    finishPrep(w, taskId);
    const t = first(w);
    const item = t.preparation.items[0];
    assert.equal(item.standing, 'done');
    assert.ok(item.completedAt);
    const words = JSON.stringify([presentTransitionRow(t, ctx), presentHub(view(w), ctx).recentlyCompleted]);
    assert.match(words, /Marked done/);
    assert.doesNotMatch(words, /packed|delivered|received|handed over|arrived|verified|sent/i);
    assert.equal(t.preparation.readiness, 'all_marked_done');
    assert.equal(readinessLine(t.preparation), 'All preparation you listed is marked done.');
  });

  test('U: a REMOVED prerequisite is unavailable, never completed — it cannot make the list read "all done"', () => {
    const w = world();
    const id = handoff(w);
    const a = prep(w, { title: 'Pack the school laptop', linkEventId: id });
    const b = prep(w, { title: 'Bring the uniform', linkEventId: id });
    finishPrep(w, a);
    w.run((s, c) => removePreparation(s, c, b));
    const t = first(w);
    assert.equal(t.preparation.done, 1);
    assert.equal(t.preparation.unavailable, 1);
    assert.equal(t.preparation.items.find((i) => i.taskId === b).standing, 'removed');
    assert.equal(t.preparation.readiness, 'needs_review', 'one done + one removed is NOT "all marked done"');
    assert.ok(t.review.includes('preparation_unavailable'));
    assert.equal(t.section, 'needs_review');
    assert.equal(readinessOf(w.state, { kind: 'event', id }), 'needsReview', 'agrees with the shared HA-009 answer');
    const words = JSON.stringify(presentTransitionRow(t, ctx));
    assert.match(words, /removed\. It isn't counted as done/);
  });

  test('property: for every combination of open/done/removed items, the readiness agrees with the shared `readinessOf`', () => {
    const statuses = ['open', 'done', 'removed'];
    const combos = [[]];
    for (const a of statuses) {
      combos.push([a]);
      for (const b of statuses) {
        combos.push([a, b]);
        for (const c of statuses) combos.push([a, b, c]);
      }
    }
    const map = { ready: 'all_marked_done', blocked: 'waiting_on_prep', needsReview: 'needs_review' };
    for (const combo of combos) {
      const w = world();
      const id = handoff(w);
      combo.forEach((status, i) => {
        const taskId = prep(w, { title: `Item ${i}`, linkEventId: id });
        if (status === 'done') finishPrep(w, taskId);
        if (status === 'removed') w.run((s, c) => removePreparation(s, c, taskId));
      });
      const t = first(w);
      const shared = readinessOf(w.state, { kind: 'event', id });
      if (combo.length === 0) {
        assert.equal(shared, 'ready', 'the shared answer for "nothing required" is vacuously ready');
        assert.equal(t.preparation.readiness, 'no_prep_recorded', 'but Feature 07 never says "ready" for an empty list');
      } else {
        assert.equal(t.preparation.readiness, map[shared], JSON.stringify(combo));
      }
      const open = combo.filter((s) => s === 'open').length;
      assert.equal(t.preparation.open, open);
    }
  });

  test('a task from ANOTHER category that a handoff requires still counts as its preparation', () => {
    const w = world();
    const id = handoff(w);
    const kids = w.state.categories.find((c) => c.systemRole === 'kids').id;
    w.apply((s, c) => addTask(s, c, { title: 'Sign the permission form', categoryId: kids, subjectMemberId: JOSIE, scope: 'child' }));
    const task = w.state.tasks.at(-1);
    w.apply((s, c) => addDependency(s, c, { relation: 'requires', from: { kind: 'event', id }, to: { kind: 'task', id: task.id } }).state);
    const t = first(w);
    assert.equal(t.preparation.linked, 1);
    assert.equal(t.preparation.items[0].title, 'Sign the permission form');
    assert.ok(view(w).preparation.flatMap((g) => g.items).some((i) => i.taskId === task.id));
  });

  test('link and unlink use the shared dependency path: the task is untouched, the edge is retired not deleted', () => {
    const w = world();
    const id = handoff(w);
    const taskId = prep(w, { title: 'Bring the uniform' });
    w.run((s, c) => linkPreparation(s, c, taskId, id));
    assert.equal(first(w).preparation.linked, 1);
    const dup = linkPreparation(w.state, w.at(), taskId, id);
    assert.equal(dup.outcome, 'link_refused', 'the same edge cannot be recorded twice');
    const edge = w.state.dependencies.find((d) => d.status === 'active');
    w.run((s, c) => unlinkPreparation(s, c, edge.id));
    assert.equal(first(w).preparation.linked, 0);
    assert.equal(w.state.dependencies.find((d) => d.id === edge.id).status, 'removed');
    assert.equal(w.state.tasks.find((t) => t.id === taskId).status, 'open');
  });

  test('a link to something that is not a co-parenting handoff is refused', () => {
    const w = world();
    const taskId = prep(w, { title: 'Bring the uniform' });
    const kids = w.state.categories.find((c) => c.systemRole === 'kids').id;
    w.apply((s, c) => ({ ...s, events: [...s.events, { id: 'evt-kids', title: 'Soccer', categoryId: kids, subjectMemberId: JOSIE, startsAt: '2026-09-18T20:00:00.000Z', endsAt: '2026-09-18T21:00:00.000Z', location: null, notes: null, commitment: 'fixed', status: 'active', travelMinutesBefore: null, travelMinutesAfter: null, preparationMinutes: null, energyDemand: null, consequence: null, needsMePersonally: null, value: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, createdAt: null, updatedAt: null, scope: 'household' }] }));
    assert.equal(linkPreparation(w.state, w.at(), taskId, 'evt-kids').outcome, 'invalid_link');
    assert.equal(createPreparation(w.state, w.at(), { childId: JOSIE, title: 'x', dueDate: '', notes: '', linkEventId: 'evt-kids' }).outcome, 'invalid_link');
  });

  test('a preparation item for a handoff that was REMOVED is flagged, not silently dropped or marked done', () => {
    const w = world();
    const id = handoff(w);
    const taskId = prep(w, { title: 'Pack the school laptop', linkEventId: id });
    w.run((s, c) => removeHandoff(s, c, id));
    const v = view(w);
    assert.equal(v.transitions.length, 0, 'a removed handoff is no longer upcoming');
    const flagged = v.needsReviewTasks.find((t) => t.taskId === taskId);
    assert.ok(flagged);
    assert.deepEqual(flagged.reasons, ['handoff_removed']);
    assert.equal(w.state.tasks.find((t) => t.id === taskId).status, 'open', 'removal of a handoff does not complete or remove its preparation');
  });

  test('AH6: recently completed requires real completion evidence — removal, age and opening never qualify', () => {
    const w = world();
    const id = handoff(w);
    const done = prep(w, { title: 'Done recently', linkEventId: id });
    const old = prep(w, { title: 'Done long ago', linkEventId: id });
    const removed = prep(w, { title: 'Removed', linkEventId: id });
    const open = prep(w, { title: 'Still open', linkEventId: id });
    w.run((s, c) => completePreparation(s, c, old), { ms: NOW - 30 * 86_400_000 });
    w.run((s, c) => completePreparation(s, c, done), { ms: NOW - 2 * 86_400_000 });
    w.run((s, c) => removePreparation(s, c, removed));
    const titles = view(w).recentlyCompleted.map((e) => e.title);
    assert.deepEqual(titles, ['Done recently']);
    assert.ok(![open, removed].some((tid) => view(w).recentlyCompleted.some((e) => e.id === tid)));
  });

  test('mutation guards: bad child, empty title, non-open completion, second completion', () => {
    const w = world({ children: [JOSIE, MILO] });
    assert.equal(createPreparation(w.state, w.at(), { childId: 'child-ghost', title: 'x', dueDate: '', notes: '', linkEventId: null }).outcome, 'invalid_child');
    assert.equal(createPreparation(w.state, w.at(), { childId: JOSIE, title: '   ', dueDate: '', notes: '', linkEventId: null }).outcome, 'invalid_title');
    assert.equal(createPreparation(w.state, w.at(), { childId: JOSIE, title: 'x', dueDate: '2026-02-30', notes: '', linkEventId: null }).outcome, 'invalid_date');
    const taskId = prep(w, { child: MILO });
    finishPrep(w, taskId);
    assert.equal(completePreparation(w.state, w.at(), taskId).outcome, 'not_open');
    assert.equal(removePreparation(w.state, w.at(), taskId).outcome, 'not_open', 'a completed item keeps its completion; it cannot be "removed" into looking uncompleted');
    assert.equal(nyMs(0) > 0, true);
  });
});
