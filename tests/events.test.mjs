import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addEvent, removeEvent, updateEvent } from '../src/domain/events.ts';
import { zonedTimeToEpochMs, toInstant } from '../src/domain/logicalDay.ts';
import { projectStateDay } from '../src/domain/projectDay.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, STORAGE_KEYS, TZ, ctx, harness, launch } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);
const at = (hour, minute = 0) => toInstant(zonedTimeToEpochMs(DAY, hour * 60 + minute, TZ));

const baseInput = {
  title: 'Pick up prescription',
  categoryId: 'cat-home',
  startsAt: at(14),
  endsAt: at(14, 30),
  commitment: 'flexible',
  scope: 'household',
};

describe('Real events', () => {
  test('create: a real household starts with none and can add one', () => {
    const state = empty();
    assert.deepEqual(state.events, []);

    const after = addEvent(state, ctx(), baseInput);
    assert.equal(after.events.length, 1);
    assert.equal(after.events[0].title, 'Pick up prescription');
    assert.equal(after.events[0].status, 'active');
    // v4: the stored producer replaces the old `source` flag rather than sitting beside it.
    assert.equal(after.events[0].provenance.producer, 'user-action');
    assert.equal('source' in after.events[0], false, 'there is one source of truth for where an event came from');
    assert.equal(after.events[0].createdAt, new Date(ctx().nowMs).toISOString());
    assert.equal(validateAppState(after).ok, true);
  });

  test('edit: updating fields leaves the rest untouched and stamps updatedAt', () => {
    const created = addEvent(empty(), ctx(), baseInput);
    const id = created.events[0].id;
    const after = updateEvent(created, ctx({ nowMs: ctx().nowMs + 60_000 }), id, { title: 'Pick up refill', location: 'CVS' });

    assert.equal(after.events[0].title, 'Pick up refill');
    assert.equal(after.events[0].location, 'CVS');
    assert.equal(after.events[0].categoryId, 'cat-home');
    assert.notEqual(after.events[0].updatedAt, after.events[0].createdAt);
    assert.equal(validateAppState(after).ok, true);
  });

  test('editing an unknown event changes nothing', () => {
    const state = empty();
    assert.equal(updateEvent(state, ctx(), 'evt-missing', { title: 'x' }), state);
  });

  test('remove: soft-deletes so history keeps a valid reference, and it drops out of the projected day', () => {
    const created = addEvent(empty(), ctx(), baseInput);
    const id = created.events[0].id;
    const removed = removeEvent(created, ctx(), id);

    assert.equal(removed.events.find((e) => e.id === id).status, 'removed');
    assert.equal(validateAppState(removed).ok, true);
    assert.deepEqual(projectStateDay(removed, DAY).events, []);
  });

  test('removing twice, or an unknown event, changes nothing further', () => {
    const created = addEvent(empty(), ctx(), baseInput);
    const id = created.events[0].id;
    const removedOnce = removeEvent(created, ctx(), id);
    assert.equal(removeEvent(removedOnce, ctx(), id), removedOnce);
    const state = empty();
    assert.equal(removeEvent(state, ctx(), 'evt-missing'), state);
  });

  test('fixed vs flexible is recorded exactly as entered, never inferred', () => {
    const fixed = addEvent(empty(), ctx(), { ...baseInput, commitment: 'fixed' });
    const flexible = addEvent(empty(), ctx(), { ...baseInput, commitment: 'flexible' });
    assert.equal(fixed.events[0].commitment, 'fixed');
    assert.equal(flexible.events[0].commitment, 'flexible');
  });

  test('travel and preparation minutes are absent unless she enters them', () => {
    const state = addEvent(empty(), ctx(), baseInput);
    assert.equal(state.events[0].travelMinutesBefore, null);
    assert.equal(state.events[0].travelMinutesAfter, null);
    assert.equal(state.events[0].preparationMinutes, null);

    const withTravel = addEvent(empty(), ctx(), { ...baseInput, travelMinutesBefore: 20, preparationMinutes: 5 });
    assert.equal(withTravel.events[0].travelMinutesBefore, 20);
    assert.equal(withTravel.events[0].preparationMinutes, 5);
  });

  test('an event on the day it belongs to projects onto that logical date, timezone-correctly', () => {
    // 11 PM in New York on the 16th is already the 17th in UTC.
    const lateEvent = { ...baseInput, startsAt: at(23), endsAt: at(23, 30) };
    const state = addEvent(empty(), ctx(), lateEvent);

    assert.equal(projectStateDay(state, DAY).events.length, 1);
    assert.equal(projectStateDay(state, '2026-09-17').events.length, 0);
  });

  test('persists across a relaunch', async () => {
    const h = harness({ mode: 'empty' });
    let store = await launch(h);
    store.dispatch((state, context) => addEvent(state, context, baseInput));
    await store.flush();

    store = await launch(h);
    const { state } = store.getSnapshot();
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].title, 'Pick up prescription');
  });
});
