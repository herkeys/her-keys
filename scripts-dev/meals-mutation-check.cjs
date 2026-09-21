#!/usr/bin/env node
/**
 * HK-FEATURE-08-MEALS — test-the-test: does each critical Meals guarantee actually FAIL when it is broken?
 *
 *   node scripts-dev/meals-mutation-check.cjs            run every mutant
 *   node scripts-dev/meals-mutation-check.cjs M7 M12     run some
 *   DRY=1 node scripts-dev/meals-mutation-check.cjs      only check that every patch still applies to exactly one place
 *
 * For each mutant it breaks ONE thing in real source (a text patch that must match exactly once), runs the tests that guard it, and
 * requires them to FAIL. Unlike the IR01 script this was modelled on, a mutant counts as CAUGHT only when the run parsed and produced a
 * genuine assertion failure: unparseable output, or a crash (syntax error, missing module) with no failed assertion, is BROKEN and
 * fails the gate. It refuses to mutate a file with uncommitted changes and verifies the file is restored byte for byte.
 *
 * kind 'sql' breaks a policy in a scratch database and runs the real-role RLS suite. kind 'file' adds a file (a second durable model).
 */
'use strict';
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const T = (name) => `tests/meals/${name}.test.mjs`;

const MUTANTS = [
  { id: 'M1', guards: 'logical date', what: 'apply reads the meal date through an explicit-zone instant, so Tuesday becomes Monday',
    file: 'src/domain/sync/apply.ts', from: "          date: str(row.meal_date),", to: "          date: new Date(str(row.meal_date) + 'T00:00:00+13:00').toISOString().slice(0, 10),",
    tests: [T('logicalDate'), T('sync')] },
  { id: 'M2', guards: 'planned is not eaten', what: 'a past plan offered again is marked eaten',
    file: 'src/features/meals/mealsView.ts', from: "    planAgain.push({ sourceId: meal.id, title: meal.title, slot: meal.slot, lastPlannedOn: meal.date });", to: "    planAgain.push({ sourceId: meal.id, title: meal.title, slot: meal.slot, lastPlannedOn: meal.date, eaten: true } as never);",
    tests: [T('mealsView')] },
  { id: 'M3', guards: 'a blank day is not a failure', what: 'a day with no meals is projected as needing attention',
    file: 'src/features/meals/mealsView.ts', from: "  return { date, label: mealDayLabel(date, today), longLabel: longDate(date), entries };", to: "  return { date, label: mealDayLabel(date, today), longLabel: longDate(date), entries, needsAttention: entries.length === 0 } as MealDayView;",
    tests: [T('mealsView')] },
  { id: 'M4', guards: 'grocery is not inventory', what: 'completed tasks are projected as items in stock',
    file: 'src/features/meals/mealsView.ts', from: "    mealTasksMoreCount: Math.max(0, openTasks.length - TASK_LIMIT),", to: "    mealTasksMoreCount: Math.max(0, openTasks.length - TASK_LIMIT),\n    inStock: state.tasks.filter((t) => t.status === 'completed').map((t) => t.title),",
    tests: [T('mealsView')] },
  { id: 'M5', guards: 'prep is not served', what: 'completing any task marks the day\'s meals served',
    file: 'src/features/meals/mealsView.ts', from: "  const upNext = [today, tomorrow].map((date) => dayView(date, today, active.filter((meal) => meal.date === date).map(entryView)));",
    to: "  const upNext = [today, tomorrow].map((date) => dayView(date, today, active.filter((meal) => meal.date === date).map((meal) => ({ ...entryView(meal), executionState: state.tasks.some((t) => t.status === 'completed') ? ('served' as never) : ('not-tracked' as never) }))));",
    tests: [T('mealsView')] },
  { id: 'M6', guards: 'no allergy record is not safe', what: 'an entry is projected with an allergen status of safe',
    file: 'src/features/meals/mealsView.ts', from: "    unknownFacts: MEAL_UNKNOWN_FACTS,", to: "    unknownFacts: MEAL_UNKNOWN_FACTS,\n    allergenStatus: 'safe',",
    tests: [T('mealsView')] },
  { id: 'M7', guards: 'assigned is not covered', what: 'a task someone was asked to do is projected as covered',
    file: 'src/features/meals/mealsView.ts', from: "    coverage: 'not-established',", to: "    coverage: live === null ? 'not-established' : ('covered' as never),",
    tests: [T('mealTasks')] },
  { id: 'M8', guards: 'a move keeps one stable identity', what: 'moving a date creates a copy instead of moving the entry',
    file: 'src/domain/meals.ts', from: "  return { state: replaceMeal(state, { ...current, title, date, slot }), refusal: null, id };", to: "  return { state: { ...state, meals: [...state.meals, { ...current, id: current.id + '-copy', title, date, slot }] }, refusal: null, id };",
    tests: [T('mealActions')] },
  { id: 'M9', guards: 'several entries may share a date and slot', what: 'moving into an occupied date and slot overwrites the entry already there',
    file: 'src/domain/meals.ts', from: "  return { state: replaceMeal(state, { ...current, title, date, slot }), refusal: null, id };", to: "  return { state: { ...state, meals: replaceMeal(state, { ...current, title, date, slot }).meals.filter((m) => m.id === id || !(m.date === date && m.slot === slot)) }, refusal: null, id };",
    tests: [T('mealActions')] },
  { id: 'M10', kind: 'sql', guards: 'account isolation (RLS)', what: 'the meal select policy is opened to every authenticated account (a scratch database)',
    sql: "DROP POLICY meals_select_scoped ON public.meal_plan_entries; CREATE POLICY meals_select_scoped ON public.meal_plan_entries FOR SELECT TO authenticated USING (true);",
    expectFail: /unrelated account sees none/ },
  { id: 'M11', guards: 'the central sync composition', what: 'the production composition no longer starts the sync runtime when an account binds',
    file: 'src/store/composeAccountApp.ts', from: "      syncRuntime.onAccountState(state);", to: "      void state;",
    tests: [T('sync')] },
  { id: 'M12', guards: 'a stale editor never overwrites', what: 'an edit is allowed against a snapshot that no longer matches',
    file: 'src/domain/meals.ts', from: "  if (expected !== undefined && !sameSnapshot(expected, snapshotOfMeal(current))) return refuse(state, 'stale', id);\n\n  let title = current.title;", to: "  let title = current.title;",
    tests: [T('mealActions')] },
  { id: 'M13', guards: 'loading is not empty', what: 'the screen gate reports ready while an account-bound device has not finished its first pull',
    file: 'src/features/meals/mealsGate.ts', from: "  if (input.syncHydration !== null && input.syncHydration !== 'ready') return { state: 'loading', canWrite: false };", to: "",
    tests: [T('mealsView')] },
  { id: 'M14', guards: 'removal propagates', what: 'the projection never sends the archived status, so the other device keeps the meal active',
    file: 'src/domain/sync/projection.ts', from: "        // Removal from active planning travels as this column: archiving is an ordinary update, never a delete.\n        status: row.status,", to: "        status: 'active',",
    tests: [T('sync')] },
  { id: 'M15', guards: 'a proposed due date is not a stated one', what: 'a meal-derived due date is stored without her confirmation',
    file: 'src/domain/meals.ts', from: "  const confirmedDue = input.due?.confirmed === true ? input.due.date : null;", to: "  const confirmedDue = input.due ? input.due.date : null;",
    tests: [T('mealTasks')] },
  { id: 'M16', kind: 'file', guards: 'no second durable Meals semantic', what: 'a second durable Meals model (MealIdea) is added to the domain',
    file: 'src/domain/mealIdea.ts', content: "import { z } from 'zod';\n\nexport const MealIdeaSchema = z.strictObject({ id: z.string(), title: z.string() });\n",
    tests: [T('boundary')] },
  { id: 'M17', guards: 'a default is not user-provided', what: 'a duration she did not state is recorded as hers',
    file: 'src/domain/meals.ts', from: "    ...(minutes === null ? {} : { durationMinutes: minutes, durationSource: 'user' as const }),", to: "    durationMinutes: minutes ?? 15,\n    durationSource: 'user' as const,",
    tests: [T('mealTasks')] },
  { id: 'M18', guards: 'removal is not skipping', what: 'archiving a meal records a skipped outcome',
    file: 'src/domain/meals.ts', from: "  return { state: replaceMeal(state, { ...current, status: 'archived' }), refusal: null, id };", to: "  return { state: { ...replaceMeal(state, { ...current, status: 'archived' }), observations: [...state.observations, { outcome: 'skipped' } as never] }, refusal: null, id };",
    tests: [T('mealActions')] },
  { id: 'M19', guards: 'plan again never changes the original', what: 'Plan This Again rewrites the date of the entry it copies from',
    file: 'src/domain/meals.ts',
    from: "export const mealDraftFrom = (source: Pick<MealPlanEntry, 'title' | 'slot'>, today: LocalDate): MealDraft => ({\n  title: source.title,\n  slot: source.slot,\n  date: today,\n});",
    to: "export const mealDraftFrom = (source: Pick<MealPlanEntry, 'title' | 'slot'>, today: LocalDate): MealDraft => {\n  (source as unknown as { date: string }).date = today;\n  return { title: source.title, slot: source.slot, date: today };\n};",
    tests: [T('mealActions')] },
  { id: 'M20', guards: 'deterministic ordering', what: 'entries are ordered by a locale compare of their ids',
    file: 'src/domain/meals.ts', from: "  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;", to: "  return a.id.localeCompare(b.id);",
    tests: [T('mealsView')] },
];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const imports = ['register-ts.mjs', 'register-jsx.mjs'].flatMap((f) => ['--import', pathToFileURL(path.join(ROOT, 'tests', 'support', f)).href]);

function runTests(files) {
  const run = spawnSync(process.execPath, [...imports, '--test', '--test-concurrency=1', ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900000 });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const pass = Number((out.match(/ℹ pass (\d+)/) ?? [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) ?? [])[1]);
  return { out, pass, fail, parsed: Number.isFinite(pass) && Number.isFinite(fail), assertion: /AssertionError/.test(out) };
}

function verdictOf(result) {
  if (!result.parsed || result.pass + result.fail === 0) return ['BROKEN', 'the run produced no parseable test result'];
  if (result.fail === 0) return ['SURVIVED', `${result.pass} passed, 0 failed`];
  if (!result.assertion) return ['BROKEN', `${result.fail} failed but none by assertion (a crash, not a caught mutant)`];
  return ['CAUGHT', `${result.fail} failed, ${result.pass} passed`];
}

function patch(mutant) {
  const file = path.join(ROOT, mutant.file);
  const original = fs.readFileSync(file);
  const text = original.toString('utf8');
  const crlf = text.includes('\r\n');
  const normal = text.replace(/\r\n/g, '\n');
  const count = normal.split(mutant.from).length - 1;
  if (count !== 1) return { error: `patch matches ${count} places (must be exactly 1)` };
  const mutated = normal.replace(mutant.from, () => mutant.to);
  return { original, next: Buffer.from(crlf ? mutated.replace(/\n/g, '\r\n') : mutated, 'utf8'), file };
}

function runMutant(mutant) {
  if (mutant.kind === 'sql') {
    if (process.env.DRY) return ['READY', 'sql mutant'];
    const run = spawnSync(process.execPath, ['supabase/tests/run.mjs', 'f08'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900000, env: { ...process.env, MSYS_NO_PATHCONV: '1', HERKEYS_MUTANT_SQL: mutant.sql } });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    if (!/checks passed/.test(out) && !/FAIL/.test(out)) return ['BROKEN', 'the database run produced no result'];
    const failed = out.split('\n').filter((l) => /^\s*FAIL\s/.test(l));
    if (run.status === 0 && failed.length === 0) return ['SURVIVED', 'the RLS suite still passed'];
    if (!failed.some((l) => mutant.expectFail.test(l))) return ['BROKEN', `failed, but not the isolation check: ${failed.slice(0, 2).join(' | ')}`];
    return ['CAUGHT', `${failed.length} check(s) failed`];
  }

  if (mutant.kind === 'file') {
    const file = path.join(ROOT, mutant.file);
    if (fs.existsSync(file)) return ['BROKEN', `${mutant.file} already exists`];
    if (process.env.DRY) return ['READY', 'file mutant'];
    fs.writeFileSync(file, mutant.content);
    try {
      return verdictOf(runTests(mutant.tests));
    } finally {
      fs.rmSync(file, { force: true });
      if (fs.existsSync(file)) return ['BROKEN', 'the added file could not be removed'];
    }
  }

  const rel = mutant.file.replace(/\\/g, '/');
  if (git('status', '--porcelain', '--', rel).trim() !== '') return ['BROKEN', `${rel} has uncommitted changes; commit before mutating`];
  const prepared = patch(mutant);
  if (prepared.error) return ['BROKEN', prepared.error];
  if (process.env.DRY) return ['READY', 'patch applies exactly once'];
  fs.writeFileSync(prepared.file, prepared.next);
  try {
    return verdictOf(runTests(mutant.tests));
  } finally {
    fs.writeFileSync(prepared.file, prepared.original);
    if (sha(fs.readFileSync(prepared.file)) !== sha(prepared.original)) {
      console.error(`FATAL: ${rel} was not restored byte for byte; run git checkout -- ${rel}`);
      process.exit(2);
    }
  }
}

const wanted = process.argv.slice(2);
const chosen = MUTANTS.filter((m) => wanted.length === 0 || wanted.includes(m.id));
const rows = [];
for (const mutant of chosen) {
  process.stdout.write(`${mutant.id.padEnd(4)} ${mutant.guards.padEnd(42)} `);
  const [verdict, detail] = runMutant(mutant);
  rows.push({ id: mutant.id, guards: mutant.guards, what: mutant.what, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${detail}`);
}
const bad = rows.filter((r) => !['CAUGHT', 'READY'].includes(r.verdict));
const caught = rows.filter((r) => r.verdict === 'CAUGHT').length;
console.log(`\n${process.env.DRY ? `${rows.length - bad.length} / ${rows.length} patches ready` : `${caught} / ${rows.length} mutants caught`}${bad.length ? `; NOT caught: ${bad.map((r) => `${r.id} (${r.verdict})`).join(', ')}` : ''}`);
if (git('status', '--porcelain', '--', 'src').split('\n').filter((l) => /^\s*M/.test(l) && !/^\?\?/.test(l)).length > 0 && !process.env.DRY) {
  // the working tree may hold uncommitted feature work, so this is informational: restoration is verified per mutant above
}
process.exit(bad.length === 0 ? 0 : 1);
