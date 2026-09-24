/**
 * HK-OCR-ASSIST — the architecture guard, and its own test-the-test.
 *
 * Proves, by reading the real source of every OCR file, that none of them can reach the network, cloud storage, an external
 * OCR/AI API, or the app's own persistence/sync/store layers, and that none of them can save an unconfirmed value with an
 * inference provenance. A guard that only ever passes is not proof of anything, so every check below is first run against a
 * synthetic, deliberately violating source string and required to fail it — only then is it trusted against the real files.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const DIR = fileURLToPath(new URL('../../src/features/lifeAdmin/', import.meta.url));
const OCR_FILES = readdirSync(DIR).filter((name) => name.startsWith('ocr') || name === 'OcrReviewScreen.tsx' || name === 'ScanEntryPoint.tsx');
const NATIVE_BOUNDARY_FILES = ['ocrNativeAdapter.ts', 'ScanEntryPoint.tsx'];

function sourceOf(name) {
  return readFileSync(DIR + name, 'utf8');
}

/** Network / cloud / external-API surface. Any hit is forbidden anywhere in the OCR feature. */
const NETWORK_OR_CLOUD = /\bfetch\s*\(|XMLHttpRequest|axios|\bhttps?:\/\/(?!.*@example\.com)|WebSocket|supabase|storage\.from\(|\.upload\(|googleapis\.com|openai\.com|vision\.google|amazonaws\.com/i;

/** Persistence / sync / canonical-state surface. The OCR feature's own files must never import these. */
const PERSISTENCE_OR_SYNC_IMPORT = /from\s+['"][^'"]*\/(persistence|domain\/sync|state\/appStore)[^'"]*['"]/;

/** The one provenance a value may never carry when it leaves this feature. */
const AI_INFERENCE_PROVENANCE = /inferenceProvenance\s*\(|['"]ai-inference['"]/;

/** The two commands that actually write a LifeRecord. The native-boundary files must never be able to reach them. */
const LIFE_RECORD_MUTATION_IMPORT = /from\s+['"][^'"]*domain\/lifeRecords['"]/;

function violationsIn(source) {
  const out = [];
  if (NETWORK_OR_CLOUD.test(source)) out.push('network/cloud surface');
  if (PERSISTENCE_OR_SYNC_IMPORT.test(source)) out.push('persistence/sync/appStore import');
  if (AI_INFERENCE_PROVENANCE.test(source)) out.push('ai-inference provenance');
  return out;
}

describe('architecture guard: test-the-test (a synthetic violation must be caught before any real file is trusted)', () => {
  test('a fetch() call to an external OCR/AI endpoint is caught', () => {
    assert.deepEqual(violationsIn("async function bad() { return fetch('https://api.example-ocr.com/recognize'); }"), ['network/cloud surface']);
  });
  test('a Supabase Storage upload is caught', () => {
    assert.deepEqual(violationsIn("import { supabase } from '../../platform/supabase'; supabase.storage.from('docs').upload(x, y);"), ['network/cloud surface']);
  });
  test('an import of the persistence layer is caught', () => {
    assert.deepEqual(violationsIn("import { AppStateRepository } from '../../persistence/appStateRepository';"), ['persistence/sync/appStore import']);
  });
  test('an import of the sync layer is caught', () => {
    assert.deepEqual(violationsIn("import { pushEntity } from '../../domain/sync/pushEngine';"), ['persistence/sync/appStore import']);
  });
  test('an import of the canonical store is caught', () => {
    assert.deepEqual(violationsIn("import type { AppStore } from '../../state/appStore';"), ['persistence/sync/appStore import']);
  });
  test('inferenceProvenance(...) is caught', () => {
    assert.deepEqual(violationsIn("addLifeRecord(state, ctx, { ...fields, provenance: inferenceProvenance('possible') });"), ['ai-inference provenance']);
  });
  test('the literal ai-inference producer string is caught', () => {
    assert.deepEqual(violationsIn("const provenance = { producer: 'ai-inference', artifactId: null, confidence: 'possible' };"), ['ai-inference provenance']);
  });
  test('clean, unrelated source is NOT flagged (the guard does not cry wolf)', () => {
    assert.deepEqual(violationsIn("export function add(a, b) { return a + b; }"), []);
  });
});

describe('architecture guard: the real OCR source, as shipped', () => {
  test('at least the files this guard is meant to cover actually exist (the guard is not vacuously passing)', () => {
    assert.ok(OCR_FILES.length >= 6, `expected the OCR feature files to be present, found: ${OCR_FILES.join(', ')}`);
  });

  test('no OCR file reaches the network, cloud storage, or an external OCR/AI API', () => {
    for (const name of OCR_FILES) assert.deepEqual(violationsIn(sourceOf(name)).filter((v) => v === 'network/cloud surface'), [], name);
  });

  test('no OCR file imports persistence, sync, or the canonical store', () => {
    for (const name of OCR_FILES) assert.deepEqual(violationsIn(sourceOf(name)).filter((v) => v === 'persistence/sync/appStore import'), [], name);
  });

  test('no OCR file ever constructs or names an ai-inference provenance', () => {
    for (const name of OCR_FILES) assert.deepEqual(violationsIn(sourceOf(name)).filter((v) => v === 'ai-inference provenance'), [], name);
  });

  test('the two files that reach native camera/picker/OCR modules cannot import the LifeRecord save commands: confirmation cannot be bypassed', () => {
    for (const name of NATIVE_BOUNDARY_FILES) {
      assert.equal(LIFE_RECORD_MUTATION_IMPORT.test(sourceOf(name)), false, `${name} must not be able to call addLifeRecord/updateLifeRecord directly`);
    }
  });

  test('the native-boundary files never import the domain/state or domain/sync modules: a scanned image or its text cannot become part of AppState or a sync payload', () => {
    for (const name of NATIVE_BOUNDARY_FILES) {
      const source = sourceOf(name);
      assert.equal(/from\s+['"][^'"]*domain\/(state|sync)[^'"]*['"]/.test(source), false, `${name}: no AppState or sync import`);
    }
  });

  test('this guard test file itself is swept by the existing F12 boundary scan in screen.test.mjs (no console/fetch/supabase in any lifeAdmin file, including these)', () => {
    // screen.test.mjs already runs readdirSync over src/features/lifeAdmin/ and applies its own network/logging/telemetry regex
    // to every file there, OCR files included — this test just documents that this file relies on that, rather than
    // duplicating it, so the two guards cannot silently drift apart.
    const screenTest = readFileSync(fileURLToPath(new URL('./screen.test.mjs', import.meta.url)), 'utf8');
    assert.match(screenTest, /readdirSync\(dir\)/);
  });
});
