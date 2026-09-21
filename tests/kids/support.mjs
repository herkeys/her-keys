/**
 * Shared builders for the Feature 05 (Kids OS) suites. Every household is built through the REAL transitions the app uses
 * (addChild, createChildTask, createChildEvent, requestHandoff, ...), never by writing state literals, so a test cannot drift from
 * what a screen can actually produce.
 */
import assert from 'node:assert/strict';
import { addChild } from '../../src/domain/children.ts';
import { archivePerson } from '../../src/domain/responsibility.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { createChildEvent, createChildTask, requestHandoffToNewPerson } from '../../src/features/kids/mutations.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

export const TZ = 'America/Chicago';
/** Monday 2026-09-21, 10:00 in Chicago (CDT). */
export const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
export const TODAY = '2026-09-21';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function makeCtx(nowMs = NOW, today = TODAY) {
  let n = 0;
  return { nowMs, today, createId: (prefix) => `${prefix}-${++n}` };
}

export const emptyHousehold = (timeZone = TZ) => createEmptyState(timeZone);

/** A household with the named children, added through the real `addChild`. Returns the state; use `idOf` to find a child. */
export function withChildren(state, ctx, list) {
  let s = state;
  for (const [displayName, birthDate] of list) {
    const next = addChild(s, ctx, { displayName, birthDate });
    assert.notEqual(next, s, `addChild refused ${displayName}`);
    s = next;
  }
  return s;
}

export const idOf = (state, name, nth = 0) => state.children.filter((child) => child.displayName === name)[nth].id;

const DRAFT = { dueDate: '', durationText: '', durationTouched: false, notes: '', commitment: 'flexible', handoffToPersonId: null, partOf: null };

export function addTaskFor(state, ctx, childId, title, overrides = {}) {
  const out = createChildTask(state, ctx, { childId, title, ...DRAFT, ...overrides });
  assert.equal(out.outcome, 'created', `task "${title}" was ${out.outcome}`);
  return { state: out.state, id: out.taskId };
}

export function addEventFor(state, ctx, childId, title, overrides = {}) {
  const out = createChildEvent(state, ctx, {
    childId,
    title,
    date: '2026-09-22',
    startText: '5:00 PM',
    endText: '6:00 PM',
    location: '',
    notes: '',
    commitment: 'fixed',
    handoffToPersonId: null,
    ...overrides,
  });
  assert.equal(out.outcome, 'created', `event "${title}" was ${out.outcome}`);
  return { state: out.state, id: out.eventId };
}

/** Ask a brand-new person to take an item, through the real handoff path. */
export function askNewPerson(state, ctx, ref, name = 'Alex', relationship = 'co-parent') {
  const out = requestHandoffToNewPerson(state, ctx, { ref, name, relationship });
  assert.equal(out.outcome, 'requested');
  return { state: out.state, personId: out.personId };
}

export const responsibilityOf = (state, ref) => state.responsibilities.find((r) => r.about.kind === ref.kind && r.about.id === ref.id);

export function archive(state, ctx, personId) {
  return archivePerson(state, ctx, personId);
}

export function assertValid(state) {
  const verdict = validateAppState(state);
  assert.equal(verdict.ok, true, verdict.ok ? '' : `invalid state: ${verdict.issues.join('; ')}`);
}
