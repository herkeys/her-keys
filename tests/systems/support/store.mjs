/**
 * A REAL app store over in-memory storage, with deterministic ids, for the scenarios that are about
 * durability: remounts, restarts, failed writes, and demo/real isolation. The id counter is shared
 * across every store opened on one harness, so a "restart" never re-mints an id already on disk.
 */
import { createAppStore } from '../../../src/state/appStore.ts';
import { harness, TZ } from '../../support/fixtures.mjs';

export function systemsHarness({ mode = 'empty', initial = {}, storageOptions = {} } = {}) {
  const h = harness({ mode, initial, storageOptions });
  let counter = 0;
  const createId = (prefix) => `${prefix}-${++counter}`;

  /** Launch a store on the SAME storage, optionally in the other data mode (a different build). */
  const open = async (as = mode) => {
    const store = createAppStore({ repository: h.repository, mode: as, now: () => h.clock.now, timeZone: () => TZ, createId });
    await store.hydrate();
    await store.flush();
    return store;
  };
  return { h, storage: h.storage, open };
}

export const homeCategoryId = (state) => state.categories.find((category) => category.systemRole === 'home').id;
export const stateOf = (store) => store.getSnapshot().state;
export const keyFor = (index) => `e${index}`;
