/**
 * A running Talk It Out capture "world" for the Feature 02 suites: a real AppStore on in-memory storage
 * (so persistence, restart and write failure are the real code paths), the real coordinator and the real
 * local reader. `restart()` is an app relaunch: a NEW store hydrated from the same storage and a NEW,
 * empty session text store — exactly what closing and reopening the app does.
 */
import { createAppStateRepository, STORAGE_KEYS } from '../../src/persistence/appStateRepository.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';
import { createCaptureCoordinator } from '../../src/features/talk-it-out/capture/coordinator.ts';
import { localInterpreter } from '../../src/features/talk-it-out/capture/port.ts';
import { createMemoryCaptureTextStore } from '../../src/features/talk-it-out/capture/textStore.ts';
import { MORNING, TZ } from './fixtures.mjs';

export const ALEXA = { id: 'kid-alexa', displayName: 'Alexa', birthDate: '2018-05-19', scope: 'child' };
export const AYDEN = { id: 'kid-ayden', displayName: 'Ayden', birthDate: '2021-08-07', scope: 'child' };

/** `mode: 'empty'` is a real household; `'demo'` is the fictional Ellis household (Josie and Theo). */
export async function startWorld({ mode = 'empty', kids = [ALEXA, AYDEN], failWhen = null } = {}) {
  const memory = createMemoryStorage();
  const control = { failWhen };
  const storage = {
    read: (key) => memory.read(key),
    remove: (key) => memory.remove(key),
    write: async (key, value) => {
      if (control.failWhen?.(key, value)) throw new Error('Simulated write failure');
      return memory.write(key, value);
    },
  };
  const clock = { now: MORNING };
  const repository = createAppStateRepository({ storage, appVersion: '1.0.0-test', now: () => clock.now, quarantineCorruptState: true });

  const world = { memory, control, clock, repository, STORAGE_KEYS };

  async function boot({ addKids }) {
    const store = createAppStore({ repository, mode, now: () => clock.now, timeZone: () => TZ });
    await store.hydrate();
    await store.flush();
    if (addKids && mode === 'empty' && kids.length > 0) {
      await store.commit((s) => ({ ...s, children: kids }));
    }
    const text = createMemoryCaptureTextStore();
    const coordinator = createCaptureCoordinator({ store, interpreter: localInterpreter, text, now: () => clock.now });
    Object.assign(world, { store, text, coordinator });
    return world;
  }

  world.restart = () => boot({ addKids: false });
  world.state = () => world.store.getSnapshot().state;
  world.persisted = () => {
    const raw = memory.contents()[STORAGE_KEYS.primary];
    return raw === undefined ? null : raw;
  };
  world.persistedState = () => (world.persisted() === null ? null : JSON.parse(world.persisted()).data);
  world.everythingStored = () => JSON.stringify(memory.contents());

  return boot({ addKids: true });
}

/** Fails any write whose payload already contains a proposed reading — the "app died before the readings were saved" window. */
export const failWhenReadingsAreWritten = (_key, value) => value.includes('"proposedKind"');
