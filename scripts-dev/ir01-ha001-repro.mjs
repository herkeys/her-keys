// Re-runnable against the UNTOUCHED audit tip (a checkout of c2e56b9), from this repository root:
//   REPO=C:/path/to/checkout node --import file:///C:/path/to/checkout/tests/support/register-ts.mjs scripts-dev/ir01-ha001-repro.mjs
// (Deliberately hand-composes what the OLD production root composed, so on the repaired branch it would prove nothing; the repaired
// composition is attacked by tests/hk-ir01/syncComposition.test.mjs and supabase/tests/journey-composition.mjs.)
// HA-001 reproduction against the UNTOUCHED production modules (foundation c2e56b9).
// Composes exactly what src/store/accountRuntimeInstance.ts composes, with only the platform leaves
// (AsyncStorage, SecureStore, Apple/Google, Supabase) replaced by in-memory / scripted stand-ins.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const REPO = process.env.REPO;
const at = (...p) => pathToFileURL(join(REPO, ...p)).href;

const [{ createAccountRuntime }, { UNBOUND_IDENTITY }, { createProviderRegistry, createScriptedProvider }, secure, { createMemoryStorage }, { createAppStateRepository }, { createAppStore }, { createEmptyState }, { addTask }, coord, claimSeam, queueMod] = await Promise.all([
  import(at('src', 'domain', 'account', 'accountRuntime.ts')),
  import(at('src', 'domain', 'account', 'binding.ts')),
  import(at('src', 'domain', 'account', 'provider.ts')),
  import(at('src', 'domain', 'account', 'secureSession.ts')),
  import(at('src', 'persistence', 'storageAdapter.ts')),
  import(at('src', 'persistence', 'appStateRepository.ts')),
  import(at('src', 'state', 'appStore.ts')),
  import(at('src', 'state', 'initialState.ts')),
  import(at('src', 'domain', 'tasks.ts')),
  import(at('src', 'domain', 'sync', 'coordinator.ts')),
  import(at('src', 'domain', 'sync', 'claimSeam.ts')),
  import(at('src', 'domain', 'sync', 'queue.ts')),
]);

const TZ = 'America/Chicago';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const session = { accountId: ACCOUNT, accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 3_600_000, provider: { provider: 'apple', subject: 'apple-x', suggestedDisplayName: null } };

// A real household with content the claim closure does NOT carry: a task no One Move names, and an event.
const seeded = createEmptyState(TZ);
const withTask = addTask(seeded, { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-1` }, { title: 'Order the permission slip', categoryId: seeded.categories[0].id, scope: 'household' });
const state0 = {
  ...withTask,
  onboarding: { ...withTask.onboarding, goalIds: ['calmer-household'], lastStep: 'strengths' },
};

const storage = createMemoryStorage({});
const repository = createAppStateRepository({ storage, appVersion: 'test', now: () => NOW, quarantineCorruptState: false });
const store = createAppStore({ repository, mode: 'empty', now: () => NOW, timeZone: () => TZ });
await store.hydrate();
await store.commit(() => state0);
await store.flush();

const cloud = {
  async bootstrapAccount() { return { kind: 'ok', body: { status: 'complete', household_id: HOUSEHOLD, id_map: { 'household-1': HOUSEHOLD, 'user-1': '66666666-6666-4666-8666-666666666666' } } }; },
  async claimLocalHousehold(input) {
    globalThis.__claimPayload = input.payload;
    return { kind: 'ok', body: { status: 'complete', household_id: HOUSEHOLD, claim_id: null, id_map: { 'household-1': HOUSEHOLD, 'user-1': '66666666-6666-4666-8666-666666666666' }, conflict_evidence: [] } };
  },
};

const runtime = createAccountRuntime({
  sessions: secure.createSecureSessionStore(secure.createMemorySecureStorage({})),
  providers: createProviderRegistry([createScriptedProvider('apple', { results: [{ kind: 'success', session }] })]),
  cloud,
  identity: { current: () => store.currentIdentity(), set: (i) => store.setIdentity(i), save: () => store.saveIdentity() },
  localState: () => store.getSnapshot().state,
  timezone: () => TZ, now: () => NOW, newClaimKey: () => '88888888-8888-4888-8888-888888888888', deviceId: null,
});

const bound = await runtime.signIn('apple');
const identity = store.currentIdentity();
const q = identity.sync?.queue ?? [];
const mappings = Object.keys(identity.sync?.mappings ?? {});

console.log('1. account state after signIn            :', bound.kind);
console.log('2. claim payload carried tasks           :', globalThis.__claimPayload?.tasks?.length, '(the permission-slip task is outside the One Move closure)');
console.log('3. local tasks / durable mappings for it :', store.getSnapshot().state.tasks.length, '/', mappings.filter((k) => k.startsWith('task:')).length);
console.log('4. outbound queue after bind             :', q.length, 'item(s)  <-- the pre-claim task has NO outbound work');
console.log('5. onboarding mapping present            :', mappings.some((k) => k.startsWith('onboarding:')));

// A mutation AFTER binding: does anything turn it into outbound work?
await store.commit((s, ctx) => addTask(s, ctx, { title: 'Book the dentist', categoryId: s.categories[0].id, scope: 'household' }));
await store.flush();
console.log('6. queue after a post-bind mutation      :', (store.currentIdentity().sync?.queue ?? []).length, 'item(s)  <-- mutation is not bridged to the queue');

// Who constructs a sync coordinator in production? (structural)
import { readdirSync, readFileSync, statSync } from 'node:fs';
const hits = [];
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f) && /createSyncCoordinator\(/.test(readFileSync(p, 'utf8'))) hits.push(p.replace(REPO, '')); } };
walk(join(REPO, 'src')); walk(join(REPO, 'app'));
console.log('7. production callers of createSyncCoordinator:', JSON.stringify(hits), '(definition only)');

// The latent second defect: if a coordinator WERE composed, the first pull meets the claim's own bootstrap rows.
const ns = identity.sync;
const stateBefore = store.getSnapshot().state;
const transport = {
  async pull() { return { kind: 'pulled', rows: [{ entityTable: 'onboarding_state', entityId: ACCOUNT, op: 'upsert', rowRevision: 1 }], nextCursor: '5' }; },
  async fetchRows(table) {
    if (table !== 'onboarding_state') return { kind: 'rows', rows: [] };
    return { kind: 'rows', rows: [{ household_id: HOUSEHOLD, profile_id: ACCOUNT, goal_ids: [], strength_ids: [], struggle_ids: [], last_step: null, completed_at: null, scope: 'personal', producer: 'onboarding', source_artifact_id: null, confidence: null, revision: 1 }] };
  },
  async create() { return { kind: 'failure', failure: 'unreachable', detail: 'n/a', code: null }; },
  async update() { return { kind: 'failure', failure: 'unreachable', detail: 'n/a', code: null }; },
};
const { applyCloudRow, applyCloudTombstone } = await import(at('src', 'domain', 'sync', 'apply.ts'));
let cur = { state: stateBefore, namespace: ns };
const c = coord.createSyncCoordinator({
  accountId: ACCOUNT, activeAccountId: () => ACCOUNT, namespace: () => cur.namespace, state: () => cur.state,
  commit: async (s, n) => { cur = { state: s, namespace: n }; }, householdId: HOUSEHOLD, profileId: ACCOUNT, now: () => NOW,
  push: { householdId: HOUSEHOLD, profileId: ACCOUNT, deviceId: ns.deviceId, transport, now: () => NOW },
  pull: { transport, now: () => NOW, applyRow: applyCloudRow, applyTombstone: applyCloudTombstone, mintLocalId: (k, w) => `${w}-x` },
});
await c.request('foreground');
console.log('8. local onboarding goals before first pull:', JSON.stringify(stateBefore.onboarding.goalIds));
console.log('   local onboarding goals after  first pull:', JSON.stringify(cur.state.onboarding.goalIds), ' <-- server default overwrote local content');
