/**
 * HK-FEATURE-13 (People OS) test world: an EMPTY (real, account-able) household with two children and a co-parent recorded by
 * Co-Parent's own canonical path (`addPerson`, relationship `co-parent`). Every other person is added by the test that needs it.
 * All names are fictional.
 */
import { addPerson } from '../../src/domain/responsibility.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ } from '../support/fixtures.mjs';

export const JOSIE = 'child-josie';
export const MILO = 'child-milo';
export { DAY, MORNING, TZ };

/** A draft key of the shape the Add Follow-up flow mints (24..48 lowercase base-36). */
export const draft = (n) => `draft${String(n).padStart(4, '0')}abcdefghijklmnopqrst`;

export function world({ coParent = true } = {}) {
  let n = 0;
  const at = (ms = MORNING, today = DAY) => ({ nowMs: ms, today, createId: (p) => `${p}-${++n}` });
  let state = createEmptyState(TZ);
  state = {
    ...state,
    children: [
      { id: JOSIE, displayName: 'Josie', birthDate: '2016-04-02', scope: 'child' },
      { id: MILO, displayName: 'Milo', birthDate: '2019-11-20', scope: 'child' },
    ],
  };
  let coParentId = null;
  if (coParent) {
    state = addPerson(state, at(), { displayName: 'Alex Rivera', relationship: 'co-parent' });
    coParentId = state.people.at(-1).id;
  }
  return { state, at, coParentId };
}

/** Run a People command and return its result, asserting nothing. */
export const run = (fn, state, ctx, ...args) => fn(state, ctx, ...args);
