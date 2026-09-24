/**
 * Feature 03 — builder validation: the attack list (contract section 84), as mechanical checks over Feature 03's
 * own source. This is builder validation, NOT the independent audit. Every check is a scan or an assertion a
 * later auditor can re-run; the behavioural attacks (unknown-is-zero, due-by, delegated, child subject, stale
 * preview, ...) are proved in the scenario suites and referenced in the ledger.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAL = join(ROOT, 'src', 'features', 'calendar');
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : /\.(ts|tsx)$/.test(name) ? [join(dir, name)] : []));
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * Feature 03's own files. `EventForm.tsx` is inherited and deliberately untouched.
 * External Intelligence is a later refinement with its own architecture guard.
 */
const REFINEMENT_ADAPTERS = new Set(['GoogleCalendarPanel.tsx', 'useGoogleCalendarBridge.ts']);
const own = () => walk(CAL).filter((f) => {
  if (f.endsWith('EventForm.tsx')) return false;
  return !REFINEMENT_ADAPTERS.has(relative(CAL, f).split(sep).join('/'));
});
const model = () => walk(join(CAL, 'model'));
const read = (file) => code(readFileSync(file, 'utf8'));

describe('External Intelligence refinement boundary', () => {
  test('the historical Feature 03 scan excludes only the named provider adapters, each covered by the refinement architecture guard', () => {
    assert.deepEqual([...REFINEMENT_ADAPTERS].sort(), ['GoogleCalendarPanel.tsx', 'useGoogleCalendarBridge.ts']);
    const guard = readFileSync(join(ROOT, 'tests', 'externalIntelligenceArchitecture.test.mjs'), 'utf8');
    for (const file of REFINEMENT_ADAPTERS) assert.ok(guard.includes(file), `${file} is named by the external-intelligence guard`);
  });
});

describe('no threshold, score or product number invented in Calendar', () => {
  test('the model contains no capacity threshold literal: 45, 23, 22, the 06:00-22:00 window, or a percentage', () => {
    for (const file of model()) {
      const source = read(file);
      assert.doesNotMatch(source, /(?<![\w.])(45|23|22|360|1320|480|0\.8|0\.75|0\.9)(?![\w.])/, `${file} contains a threshold-looking literal`);
      assert.doesNotMatch(source, /\*\s*100\b|toFixed\(|Math\.round\([^)]*\/\s*[a-z]+\)\s*\*\s*100|percent/i, `${file} computes a percentage`);
    }
  });

  test('the only capacity vocabulary imported is the foundation’s, by name', () => {
    const imports = model().flatMap((f) => [...read(f).matchAll(/import \{([^}]+)\} from '\.\.\/\.\.\/(?:\.\.\/domain\/(?:loadThresholds|dailyLoadIssues)|daily-load\/computeDailyLoad)'/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/^type /, ''))));
    for (const name of imports) assert.ok(['loadTierForBuffer', 'assessDailyLoadIssues', 'CAPACITY_DAY_START_MINUTES', 'CAPACITY_DAY_END_MINUTES', 'computeDailyLoad', 'REQUIRED_TRANSITION_BUFFER_MINUTES', 'LoadTier', 'DailyLoadIssues', 'DailyLoadIssue'].includes(name), name);
  });

  test('the view model has no field a person could read as a score, rank, grade or health', () => {
    const types = read(join(CAL, 'model', 'types.ts'));
    assert.doesNotMatch(types, /\b(score|rank|grade|health|rating|percent|loadPercent|busyness|quality)\b/i);
  });

  test('travel and preparation are never defaulted: no constant stands in for a missing value', () => {
    for (const file of model()) assert.doesNotMatch(read(file), /DEFAULT_(TRAVEL|PREP|DURATION|TRANSITION)|assumedTravel|guessTravel|estimateTravel/i, file);
  });
});

describe('no second design system', () => {
  test('no hex color, font family, font size or theme constant anywhere in Calendar’s UI', () => {
    for (const file of own().filter((f) => f.endsWith('.tsx'))) {
      const source = read(file);
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${file} contains a hex color`);
      assert.doesNotMatch(source, /rgba?\(|hsla?\(/, `${file} contains a raw color function`);
      assert.doesNotMatch(source, /fontFamily|fontSize|fontWeight|letterSpacing/, `${file} sets typography directly`);
    }
  });

  test('every color used comes from the shared tokens', () => {
    for (const file of own().filter((f) => f.endsWith('.tsx'))) {
      const source = read(file);
      const usesColors = /colors\./.test(source);
      if (usesColors) assert.match(source, /from '\.\.\/(\.\.\/)?(\.\.\/)?design\/tokens'|from '\.\.\/\.\.\/design\/tokens'|from '\.\.\/\.\.\/\.\.\/design\/tokens'/, file);
    }
  });
});

describe('nothing persisted, nothing external, no AI wired', () => {
  test('Calendar never touches storage: no AsyncStorage, no localStorage, no SecureStore, no file system, no store write outside a committed transition', () => {
    for (const file of own()) assert.doesNotMatch(read(file), /AsyncStorage|localStorage|sessionStorage|SecureStore|expo-file-system|writeFile|setItem\(|\.dispatch\(/, file);
  });

  test('every store write goes through `commit` in one place (acceptIntent)', () => {
    const writers = own().filter((f) => /\.commit\(/.test(read(f))).map((f) => relative(CAL, f).split(sep).join('/'));
    assert.deepEqual(writers, ['model/preview.ts']);
  });

  test('no external calendar provider, credential, network call or polling', () => {
    for (const file of own()) {
      const source = read(file);
      assert.doesNotMatch(source, /\b(googleapis|EventKit|CalDAV|iCal|oauth|XMLHttpRequest|WebSocket)\b|calendar\.google|graph\.microsoft|\bfetch\(|\.ics\b/i, file);
    }
  });

  test('no Gemini, no prompt, no model configuration, no generic AI service', () => {
    for (const file of own()) assert.doesNotMatch(read(file), /gemini|openai|anthropic|generativeai|systemPrompt|temperature\s*:|AIService|llm/i, file);
  });

  test('polling is limited to re-reading the local clock once a minute (presentation only)', () => {
    const lines = own().flatMap((f) => read(f).split('\n').filter((l) => /setInterval\(|setTimeout\(/.test(l)).map((l) => `${relative(CAL, f).split(sep).join('/')}: ${l.trim()}`));
    assert.deepEqual(lines, ['CalendarScreen.tsx: const id = setInterval(() => setNow(Date.now()), intervalMs);']);
  });
});

describe('Feature 03 does not run recurrence, routines or scheduling', () => {
  test('no recurrence evaluation, occurrence generation, routine execution or notification anywhere in Calendar', () => {
    for (const file of own()) {
      assert.doesNotMatch(read(file), /occurrencesOf|nextOccurrence|skipOccurrence|addRecurrence|Notifications|scheduleNotification|BackgroundFetch|TaskManager|runRoutine|systemSteps/i, file);
    }
  });

  test('Calendar mutates only through the foundation’s recommendation actions', () => {
    // The union, per foundation module that holds mutations, of every function Calendar imports from it.
    const MUTATING = new Set(['dailyLoadDecisions', 'recommendationActions', 'events', 'tasks', 'structure', 'responsibility', 'needsMe', 'observations', 'onboarding', 'categories', 'interpretations', 'authorization']);
    const byModule = new Map();
    for (const file of own()) {
      for (const m of read(file).matchAll(/import \{([^}]+)\} from '(?:\.\.\/)+domain\/(\w+)'/g)) {
        if (!MUTATING.has(m[2])) continue;
        const names = m[1].split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '));
        byModule.set(m[2], new Set([...(byModule.get(m[2]) ?? []), ...names]));
      }
    }
    const summary = Object.fromEntries([...byModule].map(([module, names]) => [module, [...names].sort()]));
    assert.deepEqual(summary, {
      dailyLoadDecisions: ['approveDailyLoadMove', 'keepDailyLoadPlan', 'latestTransitionDecision', 'todaysIssues', 'undoRecommendedMove', 'undoableMove'],
      recommendationActions: ['approveDropTask', 'approveMoveEvent', 'approveProtectItem', 'approveShortenTask', 'keepCapacityPlan'],
      structure: ['isDone'],
      responsibility: ['needsMePersonally'],
    });
  });
});

describe('sibling-feature independence and shell freeze (contract sections 4, 5, 76)', () => {
  const ALLOWED = new Set(['design', 'domain', 'store', 'state', 'types', 'config', 'features/calendar', 'features/daily-load']);
  const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);

  test('every relative import from Calendar resolves to Calendar itself or shared foundation — never a sibling feature', () => {
    for (const file of own()) {
      for (const spec of importsOf(file)) {
        const target = relative(join(ROOT, 'src'), resolve(dirname(file), spec)).split(sep).join('/');
        const top = target.startsWith('features/') ? target.split('/').slice(0, 2).join('/') : target.split('/')[0];
        assert.ok(ALLOWED.has(top), `${relative(ROOT, file)} imports ${spec} -> ${top}`);
      }
    }
  });

  test('specifically no import of Today, Talk It Out, Life, Systems, One Move, Tasks, or any new feature directory', () => {
    const forbidden = /features\/(today|talk-it-out|life|systems|one-move|tasks|home|kids|meals|money|work|onboarding|inbox|routines)\b/;
    for (const file of own()) assert.doesNotMatch(readFileSync(file, 'utf8'), forbidden, file);
    assert.doesNotMatch(readFileSync(join(ROOT, 'app', '(app)', 'calendar.tsx'), 'utf8'), forbidden);
  });

  test('no route was added: the Calendar route is one re-export, and no other app file names a Calendar screen', () => {
    assert.equal(readFileSync(join(ROOT, 'app', '(app)', 'calendar.tsx'), 'utf8').trim(), "export { CalendarScreen as default } from '../../src/features/calendar/CalendarScreen';");
    const appFiles = readdirSync(join(ROOT, 'app'), { recursive: true }).filter((f) => /\.tsx$/.test(String(f)));
    assert.ok(!appFiles.some((f) => /calendar/i.test(String(f)) && !String(f).endsWith(`(app)${sep}calendar.tsx`)), 'a second Calendar route exists');
  });

  test('Calendar declares no tab of its own and does not edit the shell', () => {
    for (const file of own()) assert.doesNotMatch(read(file), /Tabs\.Screen|Stack\.Screen|registerRootComponent|<Tabs\b/, file);
  });
});
