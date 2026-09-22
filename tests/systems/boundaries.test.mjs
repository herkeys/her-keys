/**
 * Static boundaries for Feature 04. These read source text, so they hold regardless of what a
 * scenario happens to execute: parallel-branch independence, household-zone time truth, and the
 * infrastructure Systems must not grow (notifications, network, model SDKs, executors).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const sourceFiles = (dir) => (statSync(dir, { throwIfNoEntry: false }) ? walk(dir).filter((f) => /\.(ts|tsx)$/.test(f)) : []);
const rel = (file) => relative(REPO, file).replace(/\\/g, '/');
const text = (file) => readFileSync(file, 'utf8');

const FEATURE = sourceFiles(join(REPO, 'src', 'features', 'systems'));
const ROUTES = sourceFiles(join(REPO, 'app', '(app)', 'systems'));
const DOMAIN_LOGIC = FEATURE.filter((f) => /[\\/](model|commands)[\\/]/.test(f));

const importsOf = (source) => [...source.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('parallel-branch independence (Features 01 · 02 · 03 never imported)', () => {
  // The three siblings' own territories, and the contexts/routes that belong to them.
  const SIBLINGS = [
    /features\/today(\/|$)/,
    /features\/talk-it-out(\/|$)/,
    /features\/calendar(\/|$)/,
    /features\/daily-load(\/|$)/,
    /features\/one-move(\/|$)/,
    /store\/TalkItOutContext/,
    /store\/OneMoveContext/,
    /store\/ScheduleContext/,
    /app\/\(app\)\/(today|calendar|ai)/,
    /app\/(talk-it-out|task-editor|event-editor)/,
  ];

  test('Systems code imports nothing from a sibling feature', () => {
    assert.ok(FEATURE.length > 0, 'the Systems feature exists');
    const offenders = [];
    for (const file of [...FEATURE, ...ROUTES]) {
      for (const spec of importsOf(text(file))) {
        if (spec.startsWith('.') && SIBLINGS.some((p) => p.test(spec.replace(/\\/g, '/')))) offenders.push(`${rel(file)} -> ${spec}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('Systems code reads only shared foundation, the permanent UI system and neutral infrastructure', () => {
    const allowedRoots = ['domain', 'design', 'state', 'store', 'persistence', 'config', 'platform', 'monetization', 'features/systems', 'types'];
    const outside = [];
    for (const file of FEATURE) {
      for (const spec of importsOf(text(file))) {
        if (!spec.startsWith('.')) continue;
        const resolved = join(dirname(file), spec);
        const fromSrc = relative(join(REPO, 'src'), resolved).replace(/\\/g, '/');
        if (fromSrc.startsWith('..')) continue; // tests/app-level paths are checked elsewhere
        if (!allowedRoots.some((root) => fromSrc === root || fromSrc.startsWith(`${root}/`))) outside.push(`${rel(file)} -> ${spec}`);
      }
    }
    assert.deepEqual(outside, []);
  });
});

describe('time truth — the household zone and logical day, never the device', () => {
  const DEVICE_TIME = /\bDate\.now\s*\(|\bnew\s+Date\s*\(|\btoLocale(Date|Time)?String\s*\(|\bgetTimezoneOffset\s*\(|Intl\.DateTimeFormat|\bperformance\.now\s*\(/;

  test('model and command code never reads the device clock or zone (the caller supplies the clock)', () => {
    const offenders = DOMAIN_LOGIC.filter((f) => DEVICE_TIME.test(text(f))).map(rel);
    assert.deepEqual(offenders, []);
  });
});

describe('what Systems must not become', () => {
  const FORBIDDEN = [
    [/expo-notifications|scheduleNotificationAsync|requestPermissionsAsync|PushNotification/i, 'notification delivery'],
    [/\bfetch\s*\(|XMLHttpRequest|axios|supabase\.from|createClient\s*\(/i, 'network / provider access'],
    [/@google\/genai|generative-ai|gemini|openai|anthropic|\bllm\b/i, 'a model SDK or prompt'],
    [/setInterval\s*\(|BackgroundFetch|TaskManager|registerTaskAsync/i, 'a background job'],
    [/\b(streaks?|badges?|confetti|leaderboards?|points|scores?)\b/i, 'gamification'],
  ];

  test('Systems source contains no notification, network, model, background-job or gamification code', () => {
    const hits = [];
    for (const file of [...FEATURE, ...ROUTES]) {
      // the future-contract doc-comments may NAME what is not built; comments are not code
      const code = text(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const [pattern, label] of FORBIDDEN) if (pattern.test(code)) hits.push(`${rel(file)}: ${label}`);
    }
    assert.deepEqual(hits, []);
  });

  test('Systems writes go through the store only, and never touch schema, sync, persistence or Supabase', () => {
    const hits = [];
    for (const file of [...FEATURE, ...ROUTES]) {
      for (const spec of importsOf(text(file))) {
        if (/domain\/sync|persistence\/|supabase|platform\/supabase/.test(spec)) hits.push(`${rel(file)} -> ${spec}`);
      }
    }
    assert.deepEqual(hits, []);
  });
});
