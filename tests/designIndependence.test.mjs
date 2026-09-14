import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addCategory, archiveCategory, renameCategory } from '../src/domain/categories.ts';
import { approveDailyLoadMove } from '../src/domain/dailyLoadDecisions.ts';
import { applyDiscoveryConversation } from '../src/domain/discovery.ts';
import { completeOneMove } from '../src/domain/oneMove.ts';
import { advance, createInitialState } from '../src/features/talk-it-out/engine.ts';
import { ctx, onboardedState, stored } from './support/fixtures.mjs';

/** A stored household that has been through every kind of change Build 2 records. */
function livedInEnvelope() {
  const context = ctx();
  let state = onboardedState();
  state = approveDailyLoadMove(state, context, 'task-2');
  state = completeOneMove(state, context);
  state = addCategory(state, context, { name: 'Pets', scope: 'household' });
  state = renameCategory(state, 'cat-kids', 'Children');
  state = archiveCategory(state, 'cat-relationships');
  state = applyDiscoveryConversation(state, context, advance(createInitialState(), 'I am always behind').state);
  return JSON.parse(stored(state));
}

function collect(value, keys = [], strings = []) {
  if (Array.isArray(value)) value.forEach((item) => collect(item, keys, strings));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collect(child, keys, strings);
    }
  } else if (typeof value === 'string') strings.push(value);
  return { keys, strings };
}

describe('Design independence of stored state', () => {
  test('no stored field describes presentation', () => {
    const { keys } = collect(livedInEnvelope());
    const presentation = /colou?r|font|icon|badge|card|tone|variant|layout|style|theme|route|label|caption|emoji|image/i;
    assert.deepEqual([...new Set(keys.filter((key) => presentation.test(key)))], []);
  });

  test('no stored value is a color, a route, a visual token or display copy', () => {
    const { strings } = collect(livedInEnvelope());
    const visual = /^#[0-9a-f]{3,8}$|^rgba?\(|^hsl|^\/(life|today|calendar|systems|ai|onboarding)|_card$|_badge$|^(amber|sage|attention|accent|success)$|pattern$/i;
    assert.deepEqual(strings.filter((value) => visual.test(value)), []);
  });

  test('stored statuses and kinds are semantic values', () => {
    const { data } = livedInEnvelope();
    assert.deepEqual([...new Set(data.categories.map((c) => c.status))].sort(), ['active', 'archived']);
    assert.deepEqual(data.oneMoves.map((r) => r.status), ['completed']);
    assert.deepEqual(data.actions.map((a) => [a.type, a.approval]), [['daily_load.move_task', 'approved']]);
    assert.ok(data.tasks.every((t) => ['unplanned', 'day', 'timed'].includes(t.plan.kind)));
  });
});
