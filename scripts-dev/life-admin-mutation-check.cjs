#!/usr/bin/env node
/**
 * HK-FEATURE-12 (Life Admin / Documents) — test-the-test: does each critical Life Admin guarantee actually FAIL when it is broken?
 *
 *   node scripts-dev/life-admin-mutation-check.cjs            run every mutant
 *   node scripts-dev/life-admin-mutation-check.cjs LA6 LA13   run some
 *   DRY=1 node scripts-dev/life-admin-mutation-check.cjs      only check that every patch still applies to exactly one place
 *
 * The method is Feature 08's (scripts-dev/meals-mutation-check.cjs): each mutant breaks ONE thing in real source (a text patch that
 * must match exactly once), runs the tests that guard it serially, and requires a GENUINE assertion failure (a crash or an
 * unparseable run is BROKEN, not caught). It refuses to mutate a file with uncommitted changes and verifies the byte-for-byte restore.
 * kind 'sql' breaks a policy or the link guard in F12's own scratch database (supabase/tests/run-f12.mjs 79) and requires the named
 * real-role check to fail; it never touches the shared database or another session's harness databases. Mutant code is never committed.
 */
'use strict';
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const T = (name) => `tests/lifeAdmin/${name}.test.mjs`;
const DOMAIN = 'src/domain/lifeRecords.ts';
const VIEW = 'src/features/lifeAdmin/lifeAdminView.ts';

const MUTANTS = [
  { id: 'LA1', guards: 'date passed is not legally invalid', what: 'a record whose recorded expiration date passed is dropped from her active records (treated as void)',
    file: VIEW, from: "  const active = state.lifeRecords.filter((record) => record.status === 'active');",
    to: "  const active = state.lifeRecords.filter((record) => record.status === 'active' && !(record.expiresOn !== null && record.expiresOn < today));",
    tests: [T('view')] },
  { id: 'LA2', guards: 'a date never creates a Task', what: 'saving a record with a renew-by or expiration date also creates a Task',
    file: DOMAIN, from: '  return { state: { ...state, lifeRecords: [...state.lifeRecords, record] }, refusal: null, field: null, id };',
    to: "  const dated = record.renewBy ?? record.expiresOn;\n  const withTask = dated === null ? state : addTask(state, ctx, { title: 'Renew ' + record.title, categoryId: state.categories[0].id, scope: 'personal', dueDate: dated });\n  return { state: { ...withTask, lifeRecords: [...withTask.lifeRecords, record] }, refusal: null, field: null, id };",
    tests: [T('commands'), T('today')] },
  { id: 'LA3', guards: 'task completed is not record renewed', what: 'a record whose linked Task was completed stops needing review (treated as renewed)',
    file: VIEW, from: '    .map((record) => reviewItemOf(record, today))',
    to: "    .filter((record) => !((state).lifeRecordLinks ?? []).some((l) => l.lifeRecordId === record.id && (state).tasks.find((t) => t.id === l.taskId)?.status === 'completed'))\n    .map((record) => reviewItemOf(record, today))",
    tests: [T('view')] },
  { id: 'LA4', guards: 'matching titles are not the same record', what: 'a new record with a matching title silently retires (archives) the older one [supersession not built: the inference itself is the mutant]',
    file: DOMAIN, from: '  return { state: { ...state, lifeRecords: [...state.lifeRecords, record] }, refusal: null, field: null, id };',
    to: "  const older = state.lifeRecords.map((r) => (r.title === record.title && r.status === 'active' ? { ...r, status: 'archived', archivedAt: record.createdAt } : r));\n  return { state: { ...state, lifeRecords: [...older, record] }, refusal: null, field: null, id };",
    tests: [T('commands')] },
  { id: 'LA5', guards: 'retiring a record never deletes it', what: 'archiving (the only history-retiring action in V1; supersession not built) deletes the record',
    file: DOMAIN, from: "  return { state: replaceRecord(state, { ...current, status: 'archived', archivedAt: now, updatedAt: now }), refusal: null, field: null, id };",
    to: '  return { state: { ...state, lifeRecords: state.lifeRecords.filter((r) => r.id !== id) }, refusal: null, field: null, id };',
    tests: [T('commands'), T('screen')] },
  { id: 'LA6', kind: 'sql', guards: 'same-household member cannot read a private record', what: 'the record SELECT policy is opened to every household member (F12 scratch database)',
    sql: 'DROP POLICY life_records_select_own ON public.life_records; CREATE POLICY life_records_select_own ON public.life_records FOR SELECT TO authenticated USING (private.is_household_member(household_id));',
    expectFail: /member: DENY the owner's record by id/ },
  { id: 'LA7', kind: 'sql', guards: 'a private link reveals nothing', what: 'the link SELECT policy is opened to every household member (F12 scratch database)',
    sql: 'DROP POLICY life_record_task_links_select_own ON public.life_record_task_links; CREATE POLICY life_record_task_links_select_own ON public.life_record_task_links FOR SELECT TO authenticated USING (private.is_household_member(household_id));',
    expectFail: /member: DENY every link/ },
  { id: 'LA7b', kind: 'sql', guards: 'a crafted link cannot confirm a private Task exists', what: 'the link guard answers "someone else\'s Task" differently from "no such Task" (SECURITY DEFINER oracle)',
    sql: "CREATE OR REPLACE FUNCTION private.guard_life_record_task_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = new.task_id) THEN RAISE EXCEPTION 'no such task' USING errcode = '23503'; END IF; IF NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = new.task_id AND t.scope = 'personal' AND t.owner_profile_id = new.profile_id) THEN RAISE EXCEPTION 'that task is private to someone else' USING errcode = '42501'; END IF; RETURN new; END $m$;",
    expectFail: /known-id probe closed/ },
  { id: 'LA8', guards: 'a child display name is not subject identity', what: 'a record\'s subject is looked up by display name instead of canonical id',
    file: DOMAIN, from: "  if (subjectMemberId !== null && !state.children.some((child) => child.id === subjectMemberId)) return { ok: false, field: 'subjectMemberId' };",
    to: "  if (subjectMemberId !== null && !state.children.some((child) => child.displayName === subjectMemberId)) return { ok: false, field: 'subjectMemberId' };",
    tests: [T('commands')] },
  { id: 'LA9', guards: 'archive is never resurrected by hydration', what: 'a pulled record always arrives active',
    file: 'src/domain/sync/apply.ts', from: '          status: str(row.status) as never,\n          archivedAt: instant(row.archived_at),',
    to: "          status: 'active' as never,\n          archivedAt: null,",
    tests: [T('sync')] },
  { id: 'LA10', guards: 'an archived Task is not active admin work', what: 'any Task that is not completed (archived included) counts as open admin work',
    file: DOMAIN, from: "  linkedTasksOf(state, recordId).filter((linked) => linked.task !== null && linked.task.status === 'open').length;",
    to: "  linkedTasksOf(state, recordId).filter((linked) => linked.task !== null && linked.task.status !== 'completed').length;",
    tests: [T('commands'), T('view')] },
  { id: 'LA11', guards: 'duplicate titles are two records', what: 'a record whose title matches an existing one is treated as that record (a repeat save)',
    file: DOMAIN, from: "  if (state.lifeRecords.some((record) => record.id === id)) return refuse(state, 'exists', id);",
    to: "  if (state.lifeRecords.some((record) => record.id === id || record.title === String(input.title).trim())) return refuse(state, 'exists', id);",
    tests: [T('commands')] },
  { id: 'LA12a', guards: 'sensitive fields stay off the home', what: 'the home row shows the reference number and the location hint',
    file: VIEW, from: '      kindText: record.typeName ?? KIND_LABEL[record.kind],',
    to: "      kindText: [record.typeName ?? KIND_LABEL[record.kind], record.referenceNumber, record.locationHint].filter(Boolean).join(' · '),",
    tests: [T('privacy')] },
  { id: 'LA12b', guards: 'sensitive fields never reach a log', what: 'saving a record writes its note and reference to the console',
    file: DOMAIN, from: '  const record: LifeRecord = {',
    to: "  console.info('[herkeys] life record saved', input.note ?? '', input.referenceNumber ?? '');\n  const record: LifeRecord = {",
    tests: [T('privacy')] },
  { id: 'LA12c', guards: 'sensitive fields never reach durable error evidence', what: 'a refused row\'s values are kept in sync evidence again',
    file: 'src/platform/supabaseSyncTransport.ts', from: "  const detail = [error.message, error.details ? withoutRowValues(error.details) : null].filter(Boolean).join(' | ').slice(0, 400);",
    to: "  const detail = [error.message, error.details].filter(Boolean).join(' | ').slice(0, 400);",
    tests: [T('sync')] },
  { id: 'LA12d', guards: 'the Life hub shows a count only', what: 'the hub summary names a record',
    file: VIEW, from: '  if (review > 0) return { value: COPY.hubReview(review), needsAttention: true };',
    to: "  if (review > 0) return { value: COPY.hubReview(review) + ' ' + state.lifeRecords[0].title, needsAttention: true };",
    tests: [T('view'), T('privacy')] },
  { id: 'LA13', guards: 'a missing linked Task never crashes', what: 'a link whose Task is gone throws instead of resolving to unavailable',
    file: DOMAIN, from: '    .map((link) => ({ linkId: link.id, relation: link.relation, taskId: link.taskId, task: byId.get(link.taskId) ?? null }));',
    to: "    .map((link) => ({ linkId: link.id, relation: link.relation, taskId: link.taskId, task: byId.get(link.taskId) ?? (() => { throw new Error('dangling link'); })() }));",
    tests: [T('commands'), T('view')] },
  { id: 'LA14', guards: 'expires today is not passed', what: 'a recorded expiration date of today is treated as passed',
    file: VIEW, from: '  if (record.expiresOn !== null && record.expiresOn < today) {',
    to: '  if (record.expiresOn !== null && record.expiresOn <= today) {',
    tests: [T('view')] },
  { id: 'LA15', guards: 'Needs Review is bounded at three', what: 'the home shows five Needs Review items before See all',
    file: VIEW, from: 'export const NEEDS_REVIEW_CAP = 3;', to: 'export const NEEDS_REVIEW_CAP = 5;',
    tests: [T('view'), T('screen')] },
  { id: 'LA16', guards: 'a private record only ever gets private work', what: 'a Task created from a record is household-visible',
    file: DOMAIN, from: "    scope: 'personal',\n    ...(minutes === null", to: "    scope: 'household',\n    ...(minutes === null",
    tests: [T('commands'), T('screen')] },
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
    const run = spawnSync(process.execPath, ['supabase/tests/run-f12.mjs', '79'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900000, env: { ...process.env, MSYS_NO_PATHCONV: '1', HERKEYS_F12_MUTANT_SQL: mutant.sql } });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    if (!/F12 backend: \d+ passed/.test(out)) return ['BROKEN', `the database run produced no result: ${out.slice(-200)}`];
    const failed = out.split('\n').filter((l) => /^\s*FAIL\s/.test(l));
    if (run.status === 0 && failed.length === 0) return ['SURVIVED', 'the RLS suite still passed'];
    if (!failed.some((l) => mutant.expectFail.test(l))) return ['BROKEN', `failed, but not the guarding check: ${failed.slice(0, 2).join(' | ')}`];
    return ['CAUGHT', `${failed.length} check(s) failed`];
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
  process.stdout.write(`${mutant.id.padEnd(6)} ${mutant.guards.padEnd(56)} `);
  const [verdict, detail] = runMutant(mutant);
  rows.push({ id: mutant.id, guards: mutant.guards, what: mutant.what, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${detail}`);
}
const bad = rows.filter((r) => !['CAUGHT', 'READY'].includes(r.verdict));
const caught = rows.filter((r) => r.verdict === 'CAUGHT').length;
console.log(`\n${process.env.DRY ? `${rows.length - bad.length} / ${rows.length} patches ready` : `${caught} / ${rows.length} mutants caught`}${bad.length ? `; NOT caught: ${bad.map((r) => `${r.id} (${r.verdict})`).join(', ')}` : ''}`);
process.exit(bad.length === 0 ? 0 : 1);
