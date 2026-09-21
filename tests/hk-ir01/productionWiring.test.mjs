/**
 * HK-INTEGRATION-READINESS-01 / HA-001 — the production roots must actually use the composition the tests exercise.
 *
 * `accountRuntimeInstance.ts` and `appStoreInstance.ts` import `expo-*` and cannot be loaded under node, so the composition tests
 * (syncComposition.test.mjs) start from `composeAccountApp`, the function those roots call. That is only honest if the roots really
 * do call it. These checks read the roots and fail if production stops composing sync — the "bound but nothing operates" defect
 * this build repairs. They are structural on purpose: they assert wiring, not behaviour.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const srcFiles = walk(join(ROOT, 'src'));

describe('HA-001 — production composes account-backed synchronization', () => {
  test('the account root builds the account runtime THROUGH composeAccountApp, with the real transport and the store\'s observer', () => {
    const source = read('src', 'store', 'accountRuntimeInstance.ts');
    assert.match(source, /composeAccountApp\(\{/, 'the root must call the composition function');
    assert.match(source, /observer:\s*changeObserver/, 'the composition must be given the observer wired into the store');
    assert.match(source, /createSupabaseSyncTransport\(client\)/, 'a real transport must be supplied when accounts are configured');
    assert.match(source, /export const syncRuntime/, 'the sync runtime must be exported for the app to trigger');
    assert.doesNotMatch(source, /createAccountRuntime\(/, 'the account runtime must not be built any other way');
  });

  test('the store is created WITH the observer, so every canonical change becomes queue intent in the same write', () => {
    const source = read('src', 'store', 'appStoreInstance.ts');
    assert.match(source, /observe:\s*changeObserver\.observe/);
    assert.match(source, /createChangeObserver\(/);
  });

  test('the composition forwards EVERY account state change to the sync runtime and wires the observer nudge', () => {
    const source = read('src', 'store', 'composeAccountApp.ts');
    assert.match(source, /syncRuntime\.onAccountState\(state\)/);
    assert.match(source, /observer\.onQueued\(\(\) => syncRuntime\.noteLocalMutation\(\)\)/);
    assert.match(source, /state\.kind === 'accountBound' \? state\.session\.accountId : null/, 'only a bound account with a session may transport');
  });

  test('the app requests a cycle when it returns to the foreground (an event, not polling)', () => {
    const source = read('src', 'store', 'AccountProvider.tsx');
    assert.match(source, /AppState\.addEventListener\('change'/);
    assert.match(source, /syncRuntime\.request\('foreground'\)/);
  });

  test('exactly ONE place constructs a coordinator: the sync runtime', () => {
    const sites = srcFiles
      .filter((f) => /createSyncCoordinator\(/.test(readFileSync(f, 'utf8')) && !f.endsWith(join('sync', 'coordinator.ts')))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    assert.deepEqual(sites, ['src/domain/sync/syncRuntime.ts']);
  });
});

describe('HA-001 — no feature-specific sync architecture', () => {
  test('nothing under src/features imports a sync MECHANISM (queue, engines, coordinator, runtime, bridge, seam, transport)', () => {
    // `syncTypes` is vocabulary: a status display may read `needsSyncAttention`. Owning or driving sync is what is forbidden.
    const mechanism = /from\s+['"][^'"]*\/sync\/(queue|pushEngine|pullEngine|coordinator|syncRuntime|changeBridge|changeObserver|claimSeam|cycleMerge|transport|projection|apply)['"]/;
    const offenders = [];
    for (const file of srcFiles.filter((f) => f.includes(join('src', 'features')))) {
      const text = readFileSync(file, 'utf8');
      if (mechanism.test(text) || /from\s+['"][^'"]*platform\/supabase/.test(text)) offenders.push(relative(ROOT, file));
    }
    assert.deepEqual(offenders, [], 'features mutate canonical state; synchronization is infrastructure');
  });

  test('nothing outside the sync modules and the composition roots enqueues work', () => {
    const allowed = new Set([
      'src/domain/sync/queue.ts',
      'src/domain/sync/changeBridge.ts',
    ]);
    const offenders = srcFiles
      .filter((f) => /\benqueue\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
      // the write queue's own `enqueue(state)` is unrelated: it is the persistence queue
      .filter((f) => !allowed.has(f) && !f.endsWith('persistence/writeQueue.ts') && !f.endsWith('state/appStore.ts'));
    assert.deepEqual(offenders, []);
  });
});
