/**
 * HK-FEATURE-12 — LIFERECORD DOES NOT BECOME A TODAY OBJECT (M3).
 * Today sees canonical operational work. A record, whatever its dates, adds nothing to Today; a Task she created from a record
 * reaches Today exactly as any other Task does, and only through Task semantics.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addLifeRecord, addLifeRecordTask } from '../../src/domain/lifeRecords.ts';
import { oneMoveForDay, resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { projectStateDay } from '../../src/domain/projectDay.ts';
import { attentionFor } from '../../src/domain/reasoning/attention.ts';
import { mattersSection } from '../../src/features/today/model/mattersView.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ, ctx } from '../support/fixtures.mjs';

const YESTERDAY = '2026-09-15';

function onboardedEmpty(context = ctx()) {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) state = toggleOnboardingOption(state, group, id);
  return completeOnboarding(state, context);
}

const withRecords = (state, context) => {
  let next = addLifeRecord(state, context, { id: 'rec-1', title: 'Driver licence', kind: 'credential', expiresOn: YESTERDAY, renewBy: DAY, reviewOn: DAY, referenceNumber: 'DL-55667788' }).state;
  next = addLifeRecord(next, context, { id: 'rec-2', title: 'Car registration', kind: 'registration', expiresOn: DAY }).state;
  return next;
};

const matters = (state) => mattersSection({ state, day: projectStateDay(state, DAY), nowMinutes: 9 * 60, exclude: new Set() });

describe('F12 Today boundary', () => {
  test('records with passed, due and today dates change NOTHING in Today: attention, What Matters and the One Move are identical', () => {
    const context = ctx();
    const without = onboardedEmpty(context);
    const withRecs = withRecords(without, context);
    assert.deepEqual(attentionFor(withRecs, MORNING), attentionFor(without, MORNING));
    assert.deepEqual(matters(withRecs), matters(without));
    assert.deepEqual(oneMoveForDay(withRecs, DAY), oneMoveForDay(without, DAY));
    const decided = resolveOneMoveForToday(withRecs, context);
    for (const record of decided.oneMoves) assert.notEqual(record.targetId, 'rec-1');
    assert.equal(JSON.stringify(attentionFor(withRecs, MORNING)).includes('DL-55667788'), false);
  });

  test('a Task she created from a record, due today, reaches Today through ordinary Task semantics (and only the Task)', () => {
    const context = ctx();
    let state = withRecords(onboardedEmpty(context), context);
    state = addLifeRecordTask(state, context, {
      recordId: 'rec-1', taskId: 'task-f12-today', linkId: 'link-f12-today', relation: 'renewal', title: 'Renew driver licence', categoryId: 'cat-home', dueDate: DAY,
    }).state;
    const deadlines = attentionFor(state, MORNING).filter((item) => item.reason === 'deadline');
    assert.deepEqual(deadlines.map((item) => item.about), [{ kind: 'task', id: 'task-f12-today' }]);
    const titles = matters(state).anchors.map((anchor) => anchor.title);
    assert.ok(titles.includes('Renew driver licence'), 'the canonical Task is what Today shows');
    assert.ok(!titles.includes('Driver licence'), 'the record itself never becomes a Today item');
    assert.equal(JSON.stringify(matters(state)).includes('DL-55667788'), false, 'no reference number reaches Today');
  });
});
