/**
 * Shared scenario builders for the Build 2 suites: the demo household on a
 * fixed New York day, and an app store wired to in-memory storage so launches,
 * relaunches and storage failures can be exercised without a device.
 */
import { materializeDemoState } from '../../src/data/seed/demoHousehold.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { resolveOneMoveForToday } from '../../src/domain/oneMove.ts';
import { createAppStateRepository, STORAGE_KEYS } from '../../src/persistence/appStateRepository.ts';
import { CURRENT_SCHEMA_VERSION, encodeStoredState } from '../../src/persistence/envelope.ts';
import { createMemoryStorage } from '../../src/persistence/storageAdapter.ts';
import { createAppStore } from '../../src/state/appStore.ts';

export { STORAGE_KEYS };

export const TZ = 'America/New_York';
export const DAY = '2026-09-16';
export const NEXT_DAY = '2026-09-17';

/** Epoch ms for a clock time in New York in September (EDT, UTC-4). */
export const nyMs = (hour, minute = 0, day = 16) => Date.UTC(2026, 8, day, hour + 4, minute);
export const nyInstant = (hour, minute = 0, day = 16) => new Date(nyMs(hour, minute, day)).toISOString();
export const MORNING = nyMs(10);

export const demoState = (anchorDate = DAY) => materializeDemoState({ anchorDate, timeZone: TZ });

export function ctx(overrides = {}) {
  let counter = 0;
  return { nowMs: MORNING, today: DAY, createId: (prefix) => `${prefix}-${++counter}`, ...overrides };
}

/** Demo state after "Show me my day": onboarding finished and today's One Move decided. */
export function onboardedState(base = demoState(), context = ctx()) {
  let state = base;
  state = toggleOnboardingOption(state, 'goals', 'calmer-household');
  state = toggleOnboardingOption(state, 'strengths', 'cooking');
  state = toggleOnboardingOption(state, 'struggles', 'overcommitting');
  return resolveOneMoveForToday(completeOnboarding(state, context), context);
}

/** Starts an event at a new New York clock time on the seeded day, keeping its length. */
export function startEventAt(state, eventId, hour, minute = 0) {
  return {
    ...state,
    events: state.events.map((event) => {
      if (event.id !== eventId) return event;
      const length = Date.parse(event.endsAt) - Date.parse(event.startsAt);
      const start = nyMs(hour, minute);
      return { ...event, startsAt: new Date(start).toISOString(), endsAt: new Date(start + length).toISOString() };
    }),
  };
}

export const stored = (state, writeSeq = 1) =>
  encodeStoredState(state, { appVersion: '1.0.0-test', savedAt: '2026-09-16T12:00:00.000Z', writeSeq });

/** Raw envelope text without the encoder's validation — for hostile states. Defaults to the current schema version. */
export const rawEnvelope = (data, schemaVersion = CURRENT_SCHEMA_VERSION) =>
  JSON.stringify({ schemaVersion, appVersion: '1.0.0-test', savedAt: '2026-09-16T12:00:00.000Z', writeSeq: 1, data });

export function harness({ initial = {}, storageOptions = {}, mode = 'demo', quarantine = true, now = MORNING } = {}) {
  const storage = createMemoryStorage(initial, storageOptions);
  const clock = { now };
  const repository = createAppStateRepository({ storage, appVersion: '1.0.0-test', now: () => clock.now, quarantineCorruptState: quarantine });
  const diagnostics = [];

  return {
    storage,
    clock,
    repository,
    diagnostics,
    launch: () => createAppStore({ repository, mode, now: () => clock.now, timeZone: () => TZ, report: (event) => diagnostics.push(event) }),
    primaryWrites: () => storage.writeLog.filter((write) => write.key === STORAGE_KEYS.primary),
    readPrimary: () => {
      const raw = storage.contents()[STORAGE_KEYS.primary];
      return raw === undefined ? null : JSON.parse(raw);
    },
  };
}

/** A launched store with hydration finished and its writes settled. */
export async function launch(h) {
  const store = h.launch();
  await store.hydrate();
  await store.flush();
  return store;
}
