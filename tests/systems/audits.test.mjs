/**
 * Feature 04 audits, as tests: tone and claim language, centralized copy, the affordance audit,
 * accessibility contracts, the types-only AI seam, and dense-fixture performance.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sizing } from '../../src/design/tokens.ts';
import * as words from '../../src/features/systems/copy.ts';
import { projectSystemDetail } from '../../src/features/systems/model/detail.ts';
import { projectSystemsHub } from '../../src/features/systems/model/hub.ts';
import { CHILDREN, DAY, MORNING, ruleRow, snapshot, stepRow, systemRow, withRows, realHousehold } from './support/canon.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir) => (statSync(dir, { throwIfNoEntry: false }) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const rel = (f) => relative(REPO, f).replace(/\\/g, '/');
const read = (f) => readFileSync(f, 'utf8');
const SOURCE = [...walk(join(REPO, 'src', 'features', 'systems')), ...walk(join(REPO, 'app', '(app)', 'systems'))].filter((f) => /\.(ts|tsx)$/.test(f));
const UI = SOURCE.filter((f) => /\.tsx$/.test(f));
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// ------------------------------------------------------------------ language ---

const TONE = [
  [/build(ing)? better habits|stay consistent|don['’]t break|keep (it|your) streak|\bstreaks?\b/i, 'habit / streak language'],
  [/you missed|missed (your|the) routine|get back on track|no excuses|crush (it|your)|perfect routine|nailed it/i, 'shame or coaching'],
  [/\bbehind\b|\boverdue\b|\bfailed\b|\bfailure\b|\blazy\b|\bslack/i, 'judgment'],
  [/great job|well done|congrat|nice work|keep it up|way to go|awesome|🎉/i, 'celebration'],
  [/\bscores?\b|\bpoints?\b|\bbadges?\b|\bsuccess rate\b|\bcompletion rate\b/i, 'scoring'],
  [/\byou (should|need to|have to|must)\b|you['’]d better/i, 'instructing her'],
  [/get organi[sz]ed|be more productive|maximi[sz]e|optimi[sz]e your/i, 'productivity pressure'],
];
const CLAIMS = [
  [/we['’]ll remind|will remind|reminds? you|reminder (was|is|will be) sent|notification/i, 'a reminder claim'],
  [/her keys (did|has done|ran|paid|sent|completed|handled|took care)/i, 'an execution claim'],
  [/\b(completed|done|finished) (this )?(run|step)\b/i, 'a completion claim'],
];
/** The one sentence that names a reminder — to say none is sent. Whitelisted by exact text. */
const ALLOWED = ['Nothing is scheduled, and no reminder is sent.'];
const violations = (text) => {
  let clean = text;
  for (const phrase of ALLOWED) clean = clean.split(phrase).join('');
  return [...TONE, ...CLAIMS].filter(([pattern]) => pattern.test(clean)).map(([, label]) => label);
};

describe('tone and claims — every user-facing sentence', () => {
  test('the copy module, statically, contains no shame, habit, coaching, scoring, reminder or execution language', () => {
    const file = join(REPO, 'src', 'features', 'systems', 'copy.ts');
    assert.deepEqual(violations(stripComments(read(file))), []);
  });

  test('and dynamically: every copy function, over every state it can be asked about', () => {
    const outputs = [];
    const all = (fn) => outputs.push(String(fn));
    const dates = ['2026-09-16', '2026-09-17', '2026-09-20', '2026-12-31', '2027-02-28'];
    for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
      for (const interval of [1, 2, 7]) {
        for (const byWeekday of [null, [0], [1, 4], [0, 2, 5]]) {
          for (const timeOfDayMinutes of [null, 0, 570, 1140]) {
            const s = { trigger: 'schedule', frequency, interval, byWeekday: frequency === 'weekly' ? byWeekday : null, byMonthDay: frequency === 'monthly' ? 15 : null, anchorDate: '2026-09-01', timeOfDayMinutes };
            all(words.scheduleSentence(s));
            for (const state of ['none', 'active', 'paused', 'ended']) for (const nextExpected of [null, ...dates]) all(words.scheduleTag({ ...s, state, nextExpected }, '2026-09-16'));
          }
        }
      }
    }
    for (const trigger of ['after_completion', 'manual']) all(words.scheduleSentence({ trigger, frequency: null, interval: null, byWeekday: null, byMonthDay: null, anchorDate: null, timeOfDayMinutes: null }));
    for (const reason of ['no_schedule', 'paused', 'stopped', 'not_calendar_based', 'nothing_upcoming']) all(words.noNextText(reason));
    all(words.skippedLine(dates));
    for (const d of [{ kind: 'total', minutes: 15, statedMinutes: null }, { kind: 'total', minutes: 95, statedMinutes: 20 }, { kind: 'partial', atLeastMinutes: 5, estimatedSteps: 1, totalSteps: 3 }, { kind: 'stated', minutes: 20 }, { kind: 'unknown' }]) all(words.durationDetailLine(d));
    for (const n of [0, 1, 2, 90]) all(words.stepCountLine(n));
    for (const state of ['owned', 'requested', 'acknowledged', 'accepted', 'declined', 'completed', 'returned']) {
      for (const unanswered of [false, true]) for (const name of ['Josie', null]) all(words.responsibilityLine({ id: 'r', holder: { kind: 'child', id: 'c', name }, state, live: true, unanswered, stillNeedsMe: true, requestedAt: null, ackDueAt: null }));
    }
    all(words.attentionLine({ kind: 'child', id: 'c', name: 'Josie' }));
    for (const category of Object.keys(words.ACTION_CATEGORY_LABEL).concat('unknown')) all(words.evidenceSummary({ category }));
    for (const body of Object.values(words.UNAVAILABLE_BODY)) all(body);
    const issueCodes = ['name_blank', 'name_too_long', 'purpose_too_long', 'area_missing', 'area_unavailable', 'too_many_steps', 'step_title_blank', 'step_title_too_long', 'step_minutes_invalid', 'system_limit_reached', 'interval_invalid', 'weekday_invalid', 'month_day_invalid', 'time_invalid', 'schedule_missing', 'schedule_ends_before_start', 'identifier_invalid', 'step_removal_unsupported'];
    for (const code of issueCodes) {
      all(words.issueMessage({ code, field: 'step:a' }, () => 2));
      all(words.issueMessage({ code, field: 'name' }));
    }
    const strings = [];
    const collect = (value) => {
      if (typeof value === 'string') strings.push(value);
      else if (typeof value === 'function') strings.push(value(3), value('Sun, Sep 20'), value('child'), value('person'));
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(words.copy);
    for (const text of [...outputs, ...strings]) assert.deepEqual(violations(text), [], `"${text}"`);
    assert.ok(outputs.length > 1000 && strings.length > 100, 'the matrix really ran');
  });

  test('significant copy is centralized: no sentence lives in JSX, apart from the preserved Her Keys+ card', () => {
    const literal = /(['"`])((?:(?!\1)[^\n\\]){0,200}?)\1/g;
    const loose = [];
    for (const file of UI) {
      if (rel(file) === 'app/(app)/systems/index.tsx') continue; // the existing monetization card keeps its own owner-approved words
      const code = stripComments(read(file))
        .split('\n')
        .filter((line) => !/^\s*(import|export .* from)\b/.test(line))
        .join('\n');
      for (const [, , body] of code.matchAll(literal)) {
        const wordsIn = body.trim().split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
        const looksLikeCopy = wordsIn.length >= 3 && /[A-Za-z]/.test(body) && !/^[a-z-]+(\s[a-z-]+)*$/.test(body) && !/[{}=;()]/.test(body) && !/^(flex|row|center|space|padding|handled)/.test(body);
        if (looksLikeCopy) loose.push(`${rel(file)}: "${body}"`);
      }
      // JSX text nodes: >Words words words<
      for (const [, body] of code.matchAll(/>\s*([A-Z][^<>{}\n]{18,})\s*</g)) loose.push(`${rel(file)}: JSX text "${body.trim()}"`);
    }
    assert.deepEqual(loose, []);
  });
});

// ---------------------------------------------------------------- affordances ---

describe('affordance audit — no broken or promissory UI', () => {
  test('no Coming Soon / TODO / TBD / Not implemented / placeholder action in Systems source', () => {
    const hits = SOURCE.filter((f) => /coming soon|\bTODO\b|\bTBD\b|not implemented|FIXME|lorem ipsum|placeholder action/i.test(read(f))).map(rel);
    assert.deepEqual(hits, []);
  });

  test('a control is disabled only for one stated reason it already explains on screen (saving, or stale)', () => {
    const disabled = [];
    for (const file of UI) for (const [, expression] of read(file).matchAll(/disabled=\{([^}]*)\}/g)) disabled.push(`${rel(file)}: ${expression.trim()}`);
    const allowed = new Set(['busy', 'busy || e.stale']);
    const unexpected = disabled.filter((d) => !allowed.has(d.split(': ')[1]));
    assert.deepEqual(unexpected, [], 'every disabled expression is one of: busy (an action is in flight) or busy || stale (the banner says why)');
  });
});

// ------------------------------------------------------------- accessibility ---

describe('accessibility contracts', () => {
  test('touch targets: the design system’s controls meet 44pt, and Systems adds no smaller one', () => {
    assert.ok(sizing.control.height >= 44 && sizing.control.heightSmall >= 44);
    const tiny = UI.filter((f) => /(minHeight|height|width):\s*(\d|[12]\d|3\d|4[0-3])\b/.test(stripComments(read(f)).replace(/borderRadius|lineHeight|marginTop|\bpaddingTop\b/g, ''))).map(rel);
    assert.deepEqual(tiny.filter((f) => !/SystemDetail\.tsx/.test(f)), [], 'no fixed sub-44pt interactive size (the step number gutter is text, not a control)');
  });

  test('dynamic type is respected: nothing disables font scaling', () => {
    assert.deepEqual(UI.filter((f) => /allowFontScaling=\{false\}|maxFontSizeMultiplier/.test(read(f))).map(rel), []);
  });

  test('step titles are never truncated; only the optional purpose line is clamped', () => {
    const detail = read(join(REPO, 'src', 'features', 'systems', 'ui', 'SystemDetail.tsx'));
    assert.equal(/numberOfLines/.test(detail), false, 'the detail screen truncates nothing');
    const card = read(join(REPO, 'src', 'features', 'systems', 'ui', 'SystemCard.tsx'));
    assert.equal((card.match(/numberOfLines/g) ?? []).length, 1, 'the hub clamps the purpose only, and the name is always whole');
  });
});

// ------------------------------------------------------------------- AI seam ---

describe('the future System-proposal contract is types only', () => {
  test('it exports no runtime code, and names no provider or prompt outside comments', () => {
    const file = join(REPO, 'src', 'features', 'systems', 'ai', 'systemProposalTypes.ts');
    const code = stripComments(read(file));
    assert.equal(/\bexport\s+(function|const|let|var|class|enum|async)\b/.test(code), false);
    assert.equal(/\b(fetch|import\s*\(|require\s*\()/.test(code), false);
    assert.deepEqual(SOURCE.filter((f) => rel(f).includes('/ai/') && !/systemProposalTypes\.ts$/.test(f)).map(rel), [], 'and nothing else lives beside it: no dead provider');
    for (const name of ['SystemDesignInput', 'SystemProposal', 'SystemProposalResult']) assert.match(code, new RegExp(`export (interface|type) ${name}\\b`));
  });
});

// --------------------------------------------------------------- performance ---

describe('performance — projections are cheap on a dense household', () => {
  function dense() {
    const systems = Array.from({ length: 50 }, (_, i) => systemRow({ id: `sys-${i}`, name: `System number ${i}`, description: 'A routine the household relies on.', categoryId: ['cat-home', 'cat-kids', 'cat-money', 'cat-meals'][i % 4] }));
    const systemSteps = systems.flatMap((s, i) => Array.from({ length: 8 + (i % 7) }, (_, k) => stepRow({ id: `${s.id}-st-${k}`, systemId: s.id, position: k * 10, title: `Step ${k + 1} of ${s.name}`, effortMinutes: k % 3 === 0 ? null : 3 + k })));
    const frequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    const recurrences = systems.flatMap((s, i) => (i % 5 === 4 ? [] : [ruleRow({ id: `r-${i}`, about: { kind: 'system', id: s.id }, frequency: frequencies[i % 4], interval: 1 + (i % 3), byWeekday: i % 4 === 1 ? [0, 3] : null, byMonthDay: i % 4 === 2 ? 15 : null, anchorDate: '2026-01-05', status: i % 5 === 0 ? 'paused' : 'active' })]));
    const observations = Array.from({ length: 5000 }, (_, i) => ({ id: `obs-${i}`, about: { kind: 'system', id: `sys-${i % 50}` }, outcome: 'skipped', occurredAt: '2026-01-01T12:00:00.000Z', logicalDate: '2026-01-01', plannedDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, toDate: null, createdAt: '2026-01-01T12:00:00.000Z', provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'personal' }));
    return withRows({ ...realHousehold({ children: CHILDREN }) }, { systems, systemSteps, recurrences, observations });
  }
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const time = (fn, runs = 25) => {
    for (let i = 0; i < 3; i += 1) fn();
    const samples = [];
    for (let i = 0; i < runs; i += 1) {
      const start = process.hrtime.bigint();
      fn();
      samples.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    return median(samples);
  };

  test('hub projection over 50 Systems (≈500 steps, 40 schedules, 5,000 observations): median under 100ms', () => {
    const state = dense();
    const ms = time(() => projectSystemsHub(snapshot(state)));
    console.log(`  [perf] SYSTEMS HUB projection: median ${ms.toFixed(2)}ms (soft target < 100ms)`);
    assert.ok(ms < 100, `median ${ms}ms`);
    assert.equal(projectSystemsHub(snapshot(state)).items.length, 50);
  });

  test('detail projection for a 14-step System with a schedule: median under 50ms', () => {
    const state = dense();
    const ms = time(() => projectSystemDetail(state, 'sys-6', { nowMs: MORNING, today: DAY }));
    console.log(`  [perf] SYSTEM DETAIL projection: median ${ms.toFixed(2)}ms (soft target < 50ms)`);
    assert.ok(ms < 50, `median ${ms}ms`);
  });

  test('a 90-step System projects and lays out inside the same budget', () => {
    const steps = Array.from({ length: 90 }, (_, i) => stepRow({ id: `big-${i}`, systemId: 'sys-big', position: i * 10, title: `Step ${i + 1}`, effortMinutes: i % 2 ? null : 2 }));
    const state = withRows(realHousehold(), { systems: [systemRow({ id: 'sys-big', name: 'Big reset' })], systemSteps: steps });
    const ms = time(() => projectSystemDetail(state, 'sys-big', { nowMs: MORNING, today: DAY }));
    console.log(`  [perf] 90-STEP detail projection: median ${ms.toFixed(2)}ms`);
    assert.ok(ms < 50);
  });
});
