import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildClaimPayload } from '../src/domain/account/claim.ts';
import { AppStateSchema } from '../src/domain/state.ts';
import { SyncNamespaceSchema } from '../src/domain/sync/syncTypes.ts';
import { toCloudRow } from '../src/domain/sync/projection.ts';
import { FOUNDATION_SPECS } from '../src/domain/sync/foundationSpecs.ts';
import { emptyNamespace, mappingKey } from '../src/domain/sync/syncTypes.ts';
import { richHousehold } from './support/richHousehold.mjs';

/**
 * NO PROVIDER CREDENTIAL, ANYWHERE THE HOUSEHOLD CAN REACH.
 *
 * An external reference names WHICH account an object lives in, never a way into it. A connector that needs a token
 * needs its own encrypted server-side store, which is a separate boundary and is not built here. So the rule is
 * enforced on every surface a token could leak into: stored state, the sync namespace (queue, mappings, conflict
 * evidence), the claim payload, every row a device sends, and the source of the foundation itself.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = /token|secret|passw(or)?d|credential|api_?key|bearer|oauth|refresh|authorization|private_?key/i;

const keysOf = (root) => {
  const keys = new Set();
  const walk = (schema) => {
    const def = schema?.def;
    if (!def) return;
    const shape = schema.shape ?? def.innerType?.shape;
    if (shape) for (const [key, child] of Object.entries(shape)) { keys.add(key); walk(child); }
    if (def.element) walk(def.element);
    if (def.innerType) walk(def.innerType);
    if (def.valueType) walk(def.valueType);
    for (const option of def.options ?? []) walk(option);
  };
  walk(root);
  return [...keys];
};

const objectKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => objectKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); objectKeys(v, out); }
  return out;
};

const filesUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(path) ? [path] : [];
  });

describe('no credential can be stored, queued, claimed or sent', () => {
  test('stored household state has no credential-shaped field', () => {
    assert.deepEqual(keysOf(AppStateSchema).filter((k) => TOKEN.test(k)), []);
  });

  test('the sync namespace — queue, mappings and conflict evidence — has none either', () => {
    assert.deepEqual(keysOf(SyncNamespaceSchema).filter((k) => TOKEN.test(k)), []);
  });

  test('the claim payload for a household holding every foundation kind carries none', () => {
    const { state } = richHousehold();
    assert.deepEqual([...objectKeys(buildClaimPayload(state))].filter((k) => TOKEN.test(k)), []);
  });

  test('no row a device sends to the cloud, for any of the 25 synced kinds, carries none', () => {
    const { state } = richHousehold({ withServerRows: false, withOneMove: false });
    const ids = (collection) => state[collection].map((r) => r.id);
    const kinds = [['task', 'tasks'], ['event', 'events'], ['system', 'systems'], ['meal', 'meals'], ['needsMe', 'needsMe'], ['category', 'categories'], ...FOUNDATION_SPECS.map((s) => [s.kind, s.collection])];
    const cloud = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    let n = 0;
    const mappings = {};
    for (const [kind, collection] of kinds) {
      const spec = FOUNDATION_SPECS.find((s) => s.kind === kind);
      const locals = spec?.singleton ? (state.capacity === null ? [] : ['capacity']) : ids(collection);
      for (const id of locals) mappings[mappingKey(kind, id)] = { kind, localId: id, cloudId: cloud(++n), revision: 1 };
    }
    for (const id of ids('externalReferences')) mappings[mappingKey('externalReference', id)] = { kind: 'externalReference', localId: id, cloudId: cloud(++n), revision: 1 };
    const ns = { ...emptyNamespace({ accountId: cloud(9001), householdId: cloud(9002), deviceId: cloud(9003) }), mappings };
    const offenders = [];
    for (const [kind, collection] of kinds) {
      const spec = FOUNDATION_SPECS.find((s) => s.kind === kind);
      const locals = spec?.singleton ? (state.capacity === null ? [] : ['capacity']) : ids(collection);
      for (const localId of locals) {
        const row = toCloudRow(state, { householdId: cloud(9002), profileId: cloud(9001), namespace: ns }, kind, localId);
        for (const key of Object.keys(row)) if (TOKEN.test(key)) offenders.push(`${kind}.${key}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('nothing in the foundation or the sync engine even NAMES a provider credential in code', () => {
    const sourceOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const words = /\b(accessToken|refreshToken|idToken|providerToken|apiKey|clientSecret|bearerToken|oauthToken|password)\b/;
    const offenders = [...filesUnder(join(REPO, 'src', 'domain', 'foundation')), ...filesUnder(join(REPO, 'src', 'domain', 'sync'))]
      .filter((file) => words.test(sourceOnly(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(REPO, ''));
    assert.deepEqual(offenders, []);
  });
});
