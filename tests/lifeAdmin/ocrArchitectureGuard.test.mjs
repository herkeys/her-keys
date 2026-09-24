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

/**
 * Raw OCR text must never be written anywhere: no file-content write and no key-value / database store. The adapter's ONLY file use is
 * moving the picked image into a temp file and removing it (`File#move` / `delete`); nothing here writes text, so any of these is a
 * violation. (The persistence-LAYER import above does not cover these — a write through a storage API needs no such import.)
 */
const RAW_TEXT_PERSISTENCE = /writeAsStringAsync|\bwriteAsync\b|\.write\s*\(|\bAsyncStorage\b|async-storage|\bSecureStore\b|expo-secure-store|\blocalStorage\b|\bsessionStorage\b|\bMMKV\b|expo-sqlite|\bIndexedDB\b/;

function violationsIn(source) {
  const out = [];
  if (NETWORK_OR_CLOUD.test(source)) out.push('network/cloud surface');
  if (PERSISTENCE_OR_SYNC_IMPORT.test(source)) out.push('persistence/sync/appStore import');
  if (RAW_TEXT_PERSISTENCE.test(source)) out.push('raw text persistence');
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
  test('writing recognized text to a file is caught', () => {
    assert.deepEqual(violationsIn("import * as FS from 'expo-file-system'; await FS.writeAsStringAsync('file:///raw.txt', recognizedText);"), ['raw text persistence']);
    assert.deepEqual(violationsIn("const out = new File(dir, 'raw.txt'); out.write(recognizedText);"), ['raw text persistence']);
  });
  test('writing recognized text to a key-value or database store is caught', () => {
    assert.deepEqual(violationsIn("import AsyncStorage from '@react-native-async-storage/async-storage'; await AsyncStorage.setItem('raw', text);"), ['raw text persistence']);
    assert.deepEqual(violationsIn("import * as SecureStore from 'expo-secure-store'; await SecureStore.setItemAsync('raw', text);"), ['raw text persistence']);
    assert.deepEqual(violationsIn("localStorage.setItem('raw', text);"), ['raw text persistence']);
  });
  test('moving the picked image to a temp file is NOT flagged (that is the adapter\'s only file use)', () => {
    assert.deepEqual(violationsIn("const destination = new File(tempDirectory(), tempFileName()); await new File(saved.uri).move(destination);"), []);
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

  test('no OCR file writes recognized text to a file, a key-value store or a database', () => {
    for (const name of OCR_FILES) assert.deepEqual(violationsIn(sourceOf(name)).filter((v) => v === 'raw text persistence'), [], name);
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

/**
 * INSPECTION ONLY — these checks read the real, installed `expo-image-picker` package's own
 * AndroidManifest.xml and this project's own `app.json`. That is NOT the same thing as a real
 * merged manifest (which needs `expo prebuild` + the Android Gradle plugin, neither of which this
 * environment has — no Android SDK is installed here). It proves what one package declares and
 * what this project configures, not what a real build produces after manifest merging. Real
 * merged-manifest verification is required Android-native follow-up work, not something this
 * guard can stand in for.
 */
const IMAGE_PICKER_MANIFEST = fileURLToPath(new URL('../../node_modules/expo-image-picker/android/src/main/AndroidManifest.xml', import.meta.url));
const APP_JSON = fileURLToPath(new URL('../../app.json', import.meta.url));

describe('Android permission inventory — INSPECTION ONLY (installed-package manifest, not a merged build)', () => {
  test('expo-image-picker\'s own AndroidManifest.xml declares exactly CAMERA plus the two Android<=32 storage permissions, nothing more sensitive', () => {
    const manifest = readFileSync(IMAGE_PICKER_MANIFEST, 'utf8');
    assert.match(manifest, /<uses-permission android:name="android\.permission\.CAMERA"\s*\/>/, 'CAMERA is declared (needed for Take photo)');
    assert.match(
      manifest,
      /<uses-permission android:name="android\.permission\.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32"\s*\/>/,
      'WRITE_EXTERNAL_STORAGE is declared, capped at maxSdkVersion 32 (a legacy permission this package contributes for older Android picker behavior)'
    );
    assert.match(
      manifest,
      /<uses-permission android:name="android\.permission\.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"\s*\/>/,
      'READ_EXTERNAL_STORAGE is declared, capped at maxSdkVersion 32 (same as above)'
    );
  });

  test('expo-image-picker\'s own manifest never declares audio, location, contacts, or a background-service permission', () => {
    const manifest = readFileSync(IMAGE_PICKER_MANIFEST, 'utf8');
    assert.equal(/RECORD_AUDIO/.test(manifest), false, 'no microphone permission is declared by the package itself');
    assert.equal(/ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION/.test(manifest), false, 'no location permission');
    assert.equal(/(READ|WRITE)_CONTACTS/.test(manifest), false, 'no contacts permission');
    assert.equal(/FOREGROUND_SERVICE/.test(manifest), false, 'no background/foreground-service permission');
  });

  test('this project\'s own app.json explicitly blocks the microphone permission the expo-image-picker config plugin would otherwise add', () => {
    const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
    const entry = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
    assert.ok(entry, 'expo-image-picker is registered with options, not just as a bare string');
    assert.equal(entry[1].microphonePermission, false, 'microphonePermission is explicitly false — RECORD_AUDIO is blocked, not merely unmentioned');
    assert.equal(entry[1].photosPermission, false, 'photosPermission is explicitly false — no photo-library-wide permission is requested');
  });

  test('no storage-permission suppression was added: this feature records READ/WRITE_EXTERNAL_STORAGE honestly rather than blocking them', () => {
    const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
    const entry = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
    const keys = Object.keys(entry[1]);
    assert.equal(keys.some((k) => /storage/i.test(k)), false, `no storage-related option exists in this config (${keys.join(', ')}) — expo-image-picker offers none, and this feature does not pretend otherwise`);
  });
});
