// HK-INTEGRATION-READINESS-01 - test-the-test. Run from the repository root:  node scripts-dev/ir01-mutation-check.cjs
//
// For each mutant: one source line is changed the way the defect it guards against would change it, the tests that are meant to
// catch it are run, and the file is restored byte for byte. A mutant that the tests do NOT catch is a test that proves nothing,
// so the script exits non-zero if any mutant survives, if a mutation did not apply exactly once, or if a file was not restored.
//
// Serial by design (one node process at a time): this machine is short of commit memory. Takes a few minutes.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const T = 'tests/hk-ir01/';
const COMPOSITION = [`${T}syncComposition.test.mjs`];
const PULL = [`${T}syncComposition.test.mjs`, `${T}pullProgress.test.mjs`];

const MUTANTS = [
  // ---- HA-001: composition is connected, exactly once, and durable -------------------------------------------------------
  { id: 'M1', guards: 'HA-001', what: 'composeAccountApp stops telling the sync runtime about account state (a bound account never starts sync)',
    file: 'src/store/composeAccountApp.ts', from: 'syncRuntime.onAccountState(state);', to: '/* disconnected */', tests: [...COMPOSITION, `${T}productionWiring.test.mjs`] },
  { id: 'M2', guards: 'HA-001', what: 'the production account root no longer composes sync',
    file: 'src/store/accountRuntimeInstance.ts', from: 'const app = composeAccountApp({', to: 'const app = createAccountRuntime({', tests: [`${T}productionWiring.test.mjs`] },
  { id: 'M3', guards: 'HA-001', what: 'the production store is created without the change observer (mutations never become queue intent)',
    file: 'src/store/appStoreInstance.ts', from: '  observe: changeObserver.observe,\n', to: '', tests: [`${T}productionWiring.test.mjs`] },
  { id: 'M4', guards: 'HA-001', what: 'the change observer stops queueing',
    file: 'src/domain/sync/changeObserver.ts', from: '      const intents = changedRows(previous, next, namespace);', to: '      const intents: ReturnType<typeof changedRows> = [];', tests: COMPOSITION },
  { id: 'M5', guards: 'HA-001', what: 'sign-out does not stop the coordinator (the previous account keeps syncing)',
    file: 'src/domain/sync/syncRuntime.ts', from: '      else if (active !== null) stop();', to: '      else if (active !== null) { /* survives */ }', tests: COMPOSITION },
  { id: 'M6', guards: 'HA-001', what: 'the seed is not applied at bind (unclaimed rows stay device-only)',
    file: 'src/domain/sync/claimSeam.ts', from: '  if (input.seed === undefined) return mapped;', to: '  if (input.seed !== undefined) return mapped;', tests: COMPOSITION },
  { id: 'M7', guards: 'HA-001 / IR-D10', what: 'the runtime stops after a cycle drains a full queue (held-back rows wait for some later trigger)',
    file: 'src/domain/sync/syncRuntime.ts', from: '        if ((await topUp(a)) === 0) break;', to: '        break;', tests: COMPOSITION },
  { id: 'M8', guards: 'HA-001 / IR-D11', what: 'the cursor is held at its old value (a pull that read everything never moves past it)',
    file: 'src/domain/sync/pullEngine.ts', from: "return { kind: 'fetched', batch: { nextCursor: result.nextCursor, tables } };", to: "return { kind: 'fetched', batch: { nextCursor: namespace.cursor, tables } };", tests: PULL },
  { id: 'M9', guards: 'HA-001 / IR-D11', what: 'the PostgREST transport slices the change list to one batch again',
    file: 'src/platform/supabaseSyncTransport.ts', from: '          rows: raw.map((row) => ({', to: '          rows: raw.slice(0, 201).map((row) => ({', tests: [`${T}pullProgress.test.mjs`] },
  { id: 'M10', guards: 'HA-001 / IR-D11', what: 'the engine keeps only the first 200 change rows of a response',
    file: 'src/domain/sync/pullEngine.ts', from: 'for (const [table, ids] of groupByTable(result.rows)) {', to: 'for (const [table, ids] of groupByTable(result.rows.slice(0, 200))) {', tests: PULL },
  { id: 'M11', guards: 'HA-001 / IR-D11', what: 'a row request is no longer bounded (every chunk asks for every id)',
    file: 'src/domain/sync/pullEngine.ts', from: 'wanted.slice(at, at + chunk)', to: 'wanted', tests: [`${T}pullProgress.test.mjs`] },
  { id: 'M12', guards: 'HA-001 / IR-D11', what: 'a failed later chunk no longer discards the fetch (partial rows are applied)',
    file: 'src/domain/sync/pullEngine.ts',
    from: "      if (isFailure(fetched)) {\n        if (fetched.failure === 'unauthorized') return { kind: 'paused', detail: fetched.detail };\n        return { kind: 'failed', detail: fetched.detail, retriable: fetched.failure !== 'forbidden' };\n      }\n      rows.push(...fetched.rows);",
    to: '      if (!isFailure(fetched)) rows.push(...fetched.rows);', tests: PULL },
  { id: 'M13', guards: 'HA-001 / IR-D5', what: 'a batch never completes hydration (the device stays unhydrated forever)',
    file: 'src/domain/sync/pullEngine.ts', from: "cursor: batch.nextCursor, hydration: 'ready' } };", to: 'cursor: batch.nextCursor, hydration: namespace.hydration } };', tests: PULL },
  { id: 'M14', guards: 'HA-001 / IR-D12', what: 'the top-up re-queues a row whose create already ended as evidence (retry loop)',
    file: 'src/domain/sync/changeBridge.ts', from: ' && !decided.has(key)) {', to: ') {', tests: [...COMPOSITION, `${T}changeBridge.test.mjs`] },

  // ---- HA-009: a removed prerequisite is not a completed prerequisite ---------------------------------------------------
  { id: 'M15', guards: 'HA-009', what: 'a REMOVED event reads as satisfied again (the audited defect)',
    file: 'src/domain/structure.ts', from: "status === undefined ? MISSING : status === 'removed' ? RETIRED : PENDING;", to: "status === undefined ? MISSING : status === 'removed' ? SATISFIED : PENDING;", tests: [`${T}dependencyStanding.test.mjs`] },
  { id: 'M16', guards: 'HA-009', what: 'a MISSING task reads as satisfied',
    file: 'src/domain/structure.ts', from: "status === undefined ? MISSING : status === 'completed' ? SATISFIED", to: "status === undefined ? SATISFIED : status === 'completed' ? SATISFIED", tests: [`${T}dependencyStanding.test.mjs`] },
  { id: 'M17', guards: 'HA-009', what: 'blockersOf keeps naming a retired prerequisite as something still needed',
    file: 'src/domain/structure.ts', from: "filter((to) => standingOf(state, to).standing === 'pending');", to: "filter((to) => standingOf(state, to).standing !== 'satisfied');", tests: [`${T}dependencyStanding.test.mjs`] },
  { id: 'M18', guards: 'HA-009', what: 'a dependent whose only prerequisites are gone reads as ready',
    file: 'src/domain/structure.ts', from: "return unavailablePrerequisitesOf(state, ref).length > 0 ? 'needsReview' : 'ready';", to: "return 'ready';", tests: [`${T}dependencyStanding.test.mjs`] },

  // ---- HA-010: a default is not a user-provided fact -------------------------------------------------------------------
  { id: 'M19', guards: 'HA-010', what: 'a defaulted duration is recorded as user-provided',
    file: 'src/domain/tasks.ts', from: "input.durationMinutes === undefined ? 'default' : (input.durationSource ?? null)", to: "input.durationMinutes === undefined ? 'user' : (input.durationSource ?? null)", tests: [`${T}durationSource.test.mjs`] },
  { id: 'M20', guards: 'HA-010', what: 'a legacy number with no stated source is upgraded to user-provided',
    file: 'src/domain/tasks.ts', from: "(input.durationSource ?? null)", to: "(input.durationSource ?? 'user')", tests: [`${T}durationSource.test.mjs`] },
  { id: 'M21', guards: 'HA-010', what: 'changing the number keeps the old provenance (a default edited to 30 stays a default, or a user 15 stays hers)',
    file: 'src/domain/tasks.ts', from: '    edits.durationSource = null;', to: '    edits.durationSource = current.durationSource;', tests: [`${T}durationSource.test.mjs`] },
  { id: 'M22', guards: 'HA-010', what: 'the cloud projection drops the provenance',
    file: 'src/domain/sync/projection.ts', from: 'duration_source: row.durationSource ?? null,', to: 'duration_source: null,', tests: [`${T}durationSource.test.mjs`, ...COMPOSITION] },
  { id: 'M23', guards: 'HA-010', what: 'applying a pulled task drops the provenance',
    file: 'src/domain/sync/apply.ts', from: 'durationSource: (strOrNull(row.duration_source) as never) ?? null,', to: 'durationSource: null,', tests: [`${T}durationSource.test.mjs`, ...COMPOSITION] },
  { id: 'M24', guards: 'HA-010 / IR-D6', what: 'the task form records an untouched prefilled 15 as hers (ignores the rule)',
    file: 'src/features/tasks/TaskForm.tsx', from: 'durationSourceForSave({ touched: durationTouched, existing })', to: "'user' as const", tests: [`${T}durationSource.test.mjs`] },
  { id: 'M30', guards: 'HA-010 / IR-D6', what: 'an untouched prefilled duration on a NEW task is recorded as hers',
    file: 'src/domain/foundation/duration.ts', from: "return input.existing === null ? 'default' :", to: "return input.existing === null ? 'user' :", tests: [`${T}durationSource.test.mjs`] },
  { id: 'M31', guards: 'HA-010 / IR-D6', what: 'an untouched duration of unknown provenance on an EDIT is promoted to hers',
    file: 'src/domain/foundation/duration.ts', from: '(input.existing.durationSource ?? null);', to: "(input.existing.durationSource ?? 'user');", tests: [`${T}durationSource.test.mjs`] },
  { id: 'M25', guards: 'HA-010', what: 'an accepted interpretation records the reader\'s duration as the user\'s',
    file: 'src/domain/interpretations.ts', from: "reading.durationMinutes === null ? undefined : 'inferred'", to: "reading.durationMinutes === null ? undefined : 'user'", tests: [`${T}durationSource.test.mjs`] },

  // ---- HA-011: a System keeps its child ----------------------------------------------------------------------------------
  { id: 'M26', guards: 'HA-011', what: 'the cloud projection drops a System\'s subject',
    file: 'src/domain/sync/projection.ts', from: '        category_id: category,\n        subject_member_id: subject,\n        scope: row.scope,\n        ...provenanceColumns(ctx, kind, localId, row.provenance),\n        ...facetColumns(\'system\', row),',
    to: '        category_id: category,\n        subject_member_id: null,\n        scope: row.scope,\n        ...provenanceColumns(ctx, kind, localId, row.provenance),\n        ...facetColumns(\'system\', row),', tests: [`${T}systemSubject.test.mjs`, ...COMPOSITION] },
  { id: 'M27', guards: 'HA-011', what: 'applying a pulled System drops its subject',
    file: 'src/domain/sync/apply.ts', from: "subjectMemberId: strOrNull(row.subject_member_id) === null ? null : (resolve(row.subject_member_id as string) ?? str(row.subject_member_id)),", to: 'subjectMemberId: null,', tests: [`${T}systemSubject.test.mjs`, ...COMPOSITION] },
  { id: 'M28', guards: 'HA-011', what: 'a child-scoped System with no child is accepted',
    file: 'src/domain/state.ts', from: "if (system.scope === 'child' && system.subjectMemberId === null) {", to: 'if (false) {', tests: [`${T}systemSubject.test.mjs`] },
  { id: 'M29', guards: 'HA-011', what: 'the adult account user is accepted as a System\'s subject',
    file: 'src/domain/state.ts', from: 'if (system.subjectMemberId !== null && !childIds.has(system.subjectMemberId)) {', to: 'if (system.subjectMemberId !== null && !childIds.has(system.subjectMemberId) && system.subjectMemberId !== state.user.id) {', tests: [`${T}systemSubject.test.mjs`] },
];

function runTests(files) {
  try {
    const out = execFileSync('node', ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', ...files], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    return { fail: Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? NaN), pass: Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? NaN) };
  } catch (error) {
    const out = `${error.stdout ?? ''}`;
    return { fail: Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? 1), pass: Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? 0) };
  }
}

const only = process.argv[2];
let survivors = 0;
let broken = 0;
const rows = [];
for (const mutant of MUTANTS.filter((m) => !only || m.id === only)) {
  const target = path.join(ROOT, mutant.file);
  const original = fs.readFileSync(target, 'utf8');
  const crlf = original.includes('\r\n');
  const normalised = crlf ? original.replace(/\r\n/g, '\n') : original;
  const matches = normalised.split(mutant.from).length - 1;
  if (matches !== 1) {
    broken += 1;
    rows.push(`${mutant.id}  DID NOT APPLY (${matches} matches)  ${mutant.what}`);
    continue;
  }
  if (process.env.DRY) {
    console.log(`${mutant.id.padEnd(4)} applies exactly once in ${mutant.file}`);
    continue;
  }
  const mutated = normalised.replace(mutant.from, () => mutant.to);
  fs.writeFileSync(target, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
  let result;
  try {
    result = runTests(mutant.tests);
  } finally {
    fs.writeFileSync(target, original);
  }
  const restored = fs.readFileSync(target, 'utf8') === original;
  const caught = !(result.fail === 0);
  if (!caught) survivors += 1;
  if (!restored) broken += 1;
  rows.push(`${mutant.id.padEnd(4)} ${caught ? 'CAUGHT    ' : 'SURVIVED  '} (${String(result.fail).padStart(2)} failing)  ${mutant.guards.padEnd(16)} ${mutant.what}${restored ? '' : '   !! FILE NOT RESTORED'}`);
  console.log(rows[rows.length - 1]);
}

if (process.env.DRY) {
  console.log(`\ndry run: ${broken === 0 ? 'every mutation applies exactly once' : `${broken} mutation(s) did not apply`}`);
  process.exit(broken === 0 ? 0 : 1);
}
console.log(`\n${MUTANTS.filter((m) => !only || m.id === only).length - survivors - broken} caught, ${survivors} survived, ${broken} broken`);
process.exit(survivors + broken === 0 ? 0 : 1);
