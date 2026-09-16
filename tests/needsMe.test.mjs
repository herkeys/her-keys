import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { captureNeedsMeItem, resolveNeedsMeItem, updateNeedsMeItem } from '../src/domain/needsMe.ts';
import { validateAppState } from '../src/domain/state.ts';
import { createEmptyState } from '../src/state/initialState.ts';
import { DAY, TZ, ctx, harness, launch } from './support/fixtures.mjs';

const empty = () => createEmptyState(TZ);

describe('Needs Me inbox', () => {
  test('quick capture needs only a title — no category, no due date, no classification', () => {
    const state = captureNeedsMeItem(empty(), ctx(), { title: 'Alexa needs poster board Thursday' });
    const item = state.needsMe[0];

    assert.equal(item.title, 'Alexa needs poster board Thursday');
    assert.equal(item.categoryId, null);
    assert.equal(item.dueDate, null);
    assert.equal(item.status, 'open');
    assert.equal(validateAppState(state).ok, true);
  });

  test('persists across a relaunch', async () => {
    const h = harness({ mode: 'empty' });
    let store = await launch(h);
    store.dispatch((state, context) => captureNeedsMeItem(state, context, { title: 'Call insurance' }));
    await store.flush();

    store = await launch(h);
    const { state } = store.getSnapshot();
    assert.equal(state.needsMe.length, 1);
    assert.equal(state.needsMe[0].title, 'Call insurance');
  });

  test('can later receive a category and a due date without having required them at capture', () => {
    const captured = captureNeedsMeItem(empty(), ctx(), { title: 'Need birthday gift for Mom' });
    const id = captured.needsMe[0].id;
    const classified = updateNeedsMeItem(captured, id, { categoryId: 'cat-relationships', dueDate: DAY });

    assert.equal(classified.needsMe[0].categoryId, 'cat-relationships');
    assert.equal(classified.needsMe[0].dueDate, DAY);
    assert.equal(classified.needsMe[0].title, 'Need birthday gift for Mom');
    assert.equal(validateAppState(classified).ok, true);
  });

  test('classifying an unknown item changes nothing', () => {
    const state = empty();
    assert.equal(updateNeedsMeItem(state, 'needsme-missing', { categoryId: 'cat-home' }), state);
  });

  test('resolve marks it done without deleting the record', () => {
    const captured = captureNeedsMeItem(empty(), ctx(), { title: 'Ayden home Friday' });
    const id = captured.needsMe[0].id;
    const resolved = resolveNeedsMeItem(captured, id);

    assert.equal(resolved.needsMe[0].status, 'resolved');
    assert.equal(resolved.needsMe.length, 1);
    assert.equal(validateAppState(resolved).ok, true);
  });

  test('resolving twice, or an unknown item, changes nothing further', () => {
    const captured = captureNeedsMeItem(empty(), ctx(), { title: 'x' });
    const id = captured.needsMe[0].id;
    const resolvedOnce = resolveNeedsMeItem(captured, id);
    assert.equal(resolveNeedsMeItem(resolvedOnce, id), resolvedOnce);
    const state = empty();
    assert.equal(resolveNeedsMeItem(state, 'needsme-missing'), state);
  });

  test('a category, once assigned, must be a real reference — integrity is still enforced', () => {
    const captured = captureNeedsMeItem(empty(), ctx(), { title: 'x' });
    const id = captured.needsMe[0].id;
    const dangling = updateNeedsMeItem(captured, id, { categoryId: 'cat-missing' });

    const result = validateAppState(dangling);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'integrity_violation');
  });
});
