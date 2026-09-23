#!/usr/bin/env node
/**
 * HK-FEATURE-09-MONEY — test-the-test: does each critical Money doctrine guarantee actually FAIL when it is
 * broken? Mirrors scripts-dev/meals-mutation-check.cjs and scripts-dev/f07-mutation-check.cjs exactly: for each
 * mutant it breaks ONE thing in real source (a text patch that must match exactly once), runs the tests that
 * guard it, and requires them to FAIL by a genuine assertion — not a crash. It refuses to mutate a file with
 * uncommitted changes and verifies the file is restored byte for byte.
 *
 *   node scripts-dev/money-mutation-check.cjs            run every mutant
 *   node scripts-dev/money-mutation-check.cjs M1 M3       run some
 *   DRY=1 node scripts-dev/money-mutation-check.cjs      only check that every patch still applies to exactly one place
 *
 * M1 covers BOTH "due passage implies paid" and "expected passage implies received" in one mutant: the status
 * derivation in projection.ts's viewOf is the SAME shared code for both directions (outflow/inflow) by design —
 * there is no second, direction-specific location to break separately without inventing a fake asymmetry. Both
 * doctrine tests (DUE DOES NOT MEAN PAID, EXPECTED DOES NOT MEAN RECEIVED) are asserted against this one mutant
 * and both must fail for it to count CAUGHT.
 */
'use strict';
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const T = (name) => `tests/money/${name}.test.mjs`;

const MUTANTS = [
  {
    id: 'M1',
    guards: 'DUE/EXPECTED != PAID/RECEIVED',
    what: 'a money item\'s status is derived from whether its date has passed, instead of an explicit resolve/cancel',
    file: 'src/features/money/projection.ts',
    from: "  const status: MoneyItemStatus = task.status === 'completed' ? 'resolved' : task.status === 'archived' ? 'cancelled' : 'open';",
    to: "  const status: MoneyItemStatus = task.dueDate! < today ? 'resolved' : task.status === 'archived' ? 'cancelled' : 'open';",
    tests: [T('mutations'), T('projection')],
  },
  {
    id: 'M2',
    guards: 'ACKNOWLEDGED reimbursement never reads PAID',
    what: 'an acknowledged (not accepted, not paid) reimbursement follow-up is interpreted as paid',
    file: 'src/features/money/reimbursements.ts',
    from: "    case 'acknowledged':\n      return 'acknowledged';",
    to: "    case 'acknowledged':\n      return 'paid';",
    tests: [T('reimbursements')],
  },
  {
    id: 'M3',
    guards: 'exact amount parsing, never a float',
    what: 'the amount is parsed through parseFloat + Math.round instead of the exact digit-based parseMoney, losing exact-parse validation',
    file: 'src/features/money/mutations.ts',
    from: '  const money = parseMoney(fields.amountText, \'USD\', direction);',
    to: '  const money = { amountMinor: Math.round(parseFloat(fields.amountText) * 100), currency: \'USD\', direction };',
    tests: [T('mutations')],
  },
  {
    id: 'M4',
    guards: 'resolving is idempotent — never a duplicate completion',
    what: 'resolving an already-resolved (or cancelled) item is allowed to run again',
    file: 'src/features/money/mutations.ts',
    from: "  if (task.status !== 'open') return refuse(state, 'not_open');\n  return done(completeTask(state, ctx, taskId), 'saved', taskId);",
    to: "  return done(completeTask(state, ctx, taskId), 'saved', taskId);",
    tests: [T('mutations')],
  },
  {
    id: 'M5',
    guards: 'one save creates exactly one canonical row, never duplicate operational work',
    what: 'creating a money item silently adds a second Task row for the same save',
    file: 'src/features/money/mutations.ts',
    from: "  const before = new Set(state.tasks.map((task) => task.id));\n  const next = addTask(state, ctx, {\n    title: value.title,",
    to: "  const before = new Set(state.tasks.map((task) => task.id));\n  const duplicated = addTask(state, ctx, { title: value.title, categoryId: category.categoryId, dueDate: value.due, scope: 'household', value: { amountMinor: value.amountMinor, currency: 'USD', direction } });\n  const next = addTask(duplicated, ctx, {\n    title: value.title,",
    tests: [T('mutations')],
  },
  {
    id: 'M6',
    guards: 'a default payment mechanism is never silently promoted to user-stated',
    what: 'leaving the payment mechanism unstated silently defaults it to "manual" instead of staying null',
    file: 'src/features/money/mutations.ts',
    from: "    paymentMechanism: direction === 'outflow' ? fields.paymentMechanism : null,",
    to: "    paymentMechanism: direction === 'outflow' ? (fields.paymentMechanism ?? 'manual') : null,",
    tests: [T('mutations')],
  },
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
  process.stdout.write(`${mutant.id.padEnd(4)} ${mutant.guards.padEnd(48)} `);
  const [verdict, detail] = runMutant(mutant);
  rows.push({ id: mutant.id, guards: mutant.guards, what: mutant.what, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${detail}`);
}
const bad = rows.filter((r) => !['CAUGHT', 'READY'].includes(r.verdict));
const caught = rows.filter((r) => r.verdict === 'CAUGHT').length;
console.log(`\n${process.env.DRY ? `${rows.length - bad.length} / ${rows.length} patches ready` : `${caught} / ${rows.length} mutants caught`}${bad.length ? `; NOT caught: ${bad.map((r) => `${r.id} (${r.verdict})`).join(', ')}` : ''}`);
process.exit(bad.length === 0 ? 0 : 1);
