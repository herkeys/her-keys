#!/usr/bin/env node
/**
 * HK-FEATURE-11 (Me / Rebuild) — test-the-test: does each critical F11 guarantee actually FAIL when it is broken?
 *
 *   node scripts-dev/rebuild-mutation-check.cjs              run every mutant
 *   node scripts-dev/rebuild-mutation-check.cjs R1 R5        run some
 *   DRY=1 node scripts-dev/rebuild-mutation-check.cjs        only check that every patch still applies to exactly one place
 *
 * Same engine as scripts-dev/meals-mutation-check.cjs: each mutant breaks ONE thing in real source (a text patch that must match
 * exactly once), runs the tests that guard it, and requires a genuine ASSERTION failure — a crash, a syntax error or unparseable output
 * is BROKEN, not caught. It refuses to mutate a file with uncommitted changes and verifies the file is restored byte for byte.
 * kind 'sql' breaks one policy or trigger in the disposable ENV C database and runs the real-role RLS suite 78. The SQL mutants use the
 * shared local container: run them only when no other session's harness is running.
 *
 * Numbering follows the F11 brief's "TEST-THE-TEST" list (R1..R10, R10 = Addendum H's replacement), then the addenda (R11+).
 */
'use strict';
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const T = (name) => `tests/rebuild/${name}.test.mjs`;

const MUTANTS = [
  { id: 'R1', guards: 'FOCUS IS NOT A TASK', what: 'creating a Focus also creates a Task',
    file: 'src/domain/rebuild/commands.ts',
    from: '  return { ...state, rebuildFocuses: [...state.rebuildFocuses, focus] };',
    to: "  return addTask({ ...state, rebuildFocuses: [...state.rebuildFocuses, focus] }, ctx, { title: focus.title, categoryId: state.categories[0]?.id ?? 'cat-home', scope: 'personal' });",
    tests: [T('focus.model')] },
  { id: 'R2', guards: 'TASK COMPLETED != FOCUS COMPLETED', what: 'completing a linked Task archives its Focus',
    file: 'src/domain/tasks.ts',
    from: '  // `completedAt` is one mutable timestamp; the observation is the append-only fact that it happened.\n  return appendObservation(next, ctx, {',
    to: "  const linkedFocus = new Set(state.rebuildFocusLinks.filter((l) => l.target.kind === 'task' && l.target.id === taskId).map((l) => l.focusId));\n  const withFocus = { ...next, rebuildFocuses: next.rebuildFocuses.map((f) => (linkedFocus.has(f.id) ? { ...f, state: 'archived' as const } : f)) };\n  return appendObservation(withFocus, ctx, {",
    tests: [T('focus.model'), T('focus.relationships')] },
  { id: 'R3', guards: 'PAUSED DOES NOT MEAN FAILED', what: 'pausing a Focus cancels (archives) its open linked Tasks',
    file: 'src/domain/rebuild/commands.ts',
    from: '  return replaceFocus(state, { ...current, state: next, updatedAt: toInstant(ctx.nowMs) });',
    to: "  const linked = new Set(state.rebuildFocusLinks.filter((l) => l.focusId === focusId && l.target.kind === 'task').map((l) => l.target.id));\n  const cancelled = next === 'active' ? state : { ...state, tasks: state.tasks.map((t) => (linked.has(t.id) && t.status === 'open' ? { ...t, status: 'archived' as const } : t)) };\n  return replaceFocus(cancelled, { ...current, state: next, updatedAt: toInstant(ctx.nowMs) });",
    tests: [T('focus.model'), T('focus.relationships')] },
  { id: 'R4', guards: 'REBUILDFOCUS IS NOT A ONE MOVE', what: 'an active Focus joins the One Move candidate pool',
    file: 'src/domain/oneMove.ts',
    from: '  return [...taskCandidates, ...needsMeCandidates];',
    to: "  const focusCandidates: OneMoveCandidate[] = state.rebuildFocuses.filter((f) => f.state === 'active').map((f) => ({ targetType: 'task', item: { id: f.id, title: f.title, durationMinutes: 0 } as never }));\n  return [...focusCandidates, ...taskCandidates, ...needsMeCandidates];",
    tests: [T('focus.relationships')] },
  { id: 'R5', kind: 'sql', guards: 'same-household member cannot read a private Focus', what: 'the Focus select policy is widened to every household member',
    sql: 'DROP POLICY rebuild_focuses_select_own ON public.rebuild_focuses; CREATE POLICY rebuild_focuses_select_own ON public.rebuild_focuses FOR SELECT TO authenticated USING (private.is_household_member(household_id));',
    expectFail: /DENY reading A's Focuses/ },
  { id: 'R6', kind: 'sql', guards: 'a link row never exposes a private Focus', what: 'the link select policy is widened to every household member',
    sql: 'DROP POLICY rebuild_focus_links_select_own ON public.rebuild_focus_links; CREATE POLICY rebuild_focus_links_select_own ON public.rebuild_focus_links FOR SELECT TO authenticated USING (private.is_household_member(household_id));',
    expectFail: /DENY reading A's links/ },
  { id: 'R7', guards: 'identity is the id (a rename never breaks a relationship)', what: 'renaming a Focus replaces it with a new id',
    // The brief's R7 names a child/person display name; F11 links NO child or person, so that mutant has no target (NOT-APPLICABLE).
    // This is the same guarantee for what F11 does link: a display-name change must not break an existing relationship.
    file: 'src/domain/rebuild/commands.ts',
    from: '  return replaceFocus(state, { ...current, title: cleaned, updatedAt: toInstant(ctx.nowMs) });',
    to: '  return { ...state, rebuildFocuses: [...state.rebuildFocuses.filter((f) => f.id !== focusId), { ...current, id: `${focusId}-renamed`, title: cleaned, updatedAt: toInstant(ctx.nowMs) }] };',
    tests: [T('focus.model')] },
  { id: 'R8', guards: 'no resurrection after hydration', what: 'a pulled Focus is always applied as active',
    file: 'src/domain/sync/foundationProjection.ts',
    from: "  if (spec.provenance === 'standard') local.provenance = provenanceFromRow(row, resolve);\n  local.scope = 'personal';",
    to: "  if (spec.provenance === 'standard') local.provenance = provenanceFromRow(row, resolve);\n  if (kind === 'rebuildFocus') local.state = 'active';\n  local.scope = 'personal';",
    tests: [T('sync')] },
  { id: 'R9', guards: 'MISSED ROUTINE != PERSONAL REGRESSION', what: 'a missed linked System becomes a Needs-attention item',
    file: 'src/features/rebuild/model.ts',
    from: '  const verdict = active.length === 0 ? null : verdictFor(state, active, needsAttention.length, today, nowMs);',
    to: "  for (const focus of active) for (const link of liveLinksOf(state, focus.id)) if (link.target.kind === 'system' && state.observations.some((o) => o.about.kind === 'system' && o.about.id === link.target.id && o.outcome === 'missed')) needsAttention.push({ taskId: link.target.id, focusId: focus.id, title: 'Routine missed', label: 'Behind' });\n  const verdict = active.length === 0 ? null : verdictFor(state, active, needsAttention.length, today, nowMs);",
    tests: [T('ui')] },
  { id: 'R10', guards: 'AFFORDANCE != TASK (Addendum H)', what: 'opening "Add a next step" saves a placeholder Task at once',
    file: 'src/features/rebuild/FocusDetailBody.tsx',
    from: '<Button label={REBUILD_COPY.home.addNextStep} size="sm" variant="ghost" disabled={!canWrite} onPress={() => setStepOpen(true)} />',
    to: "<Button label={REBUILD_COPY.home.addNextStep} size=\"sm\" variant=\"ghost\" disabled={!canWrite} onPress={() => { setStepOpen(true); void onAddStep({ title: 'Next step', categoryId: view.defaultCategoryId ?? '' }); }} />",
    tests: [T('ui')] },
  { id: 'R11', guards: 'an inert target is not an open next action (Addendum O)', what: 'archived, completed or absent linked Tasks still count',
    file: 'src/domain/rebuild/read.ts',
    from: "    if (task !== undefined && task.status === 'open') out.push(task);",
    to: "    out.push(task ?? ({ id: link.target.id, title: '', status: 'open' } as never));",
    tests: [T('focus.model'), T('focus.relationships')] },
  { id: 'R12', guards: 'no missing-next-step guilt signal (Addendum E)', what: 'a Focus with no step drives the verdict',
    file: 'src/features/rebuild/model.ts',
    from: '  if (attentionCount > 0) return REBUILD_COPY.verdict.attention(attentionCount);',
    to: "  if (attentionCount > 0) return REBUILD_COPY.verdict.attention(attentionCount);\n  if (active.some((f) => openNextActions(state, f.id).length === 0)) return 'Your focus has no next step.';",
    tests: [T('ui')] },
  { id: 'R13', guards: 'no suggestion engine (Addendum G)', what: 'a lighter version is invented when none was recorded',
    file: 'src/features/rebuild/model.ts',
    from: '  return { taskId: task.id, title: task.title, dateLabel, lighterVersion: lighterVersionOf(state, task.id, tasks) };',
    to: '  return { taskId: task.id, title: task.title, dateLabel, lighterVersion: lighterVersionOf(state, task.id, tasks) ?? `Just ten minutes of ${task.title}` };',
    tests: [T('ui')] },
  { id: 'R14', guards: 'the note never leaves its Focus (Addendum J)', what: 'the home card shows the note',
    file: 'src/features/rebuild/model.ts',
    from: "  return { id: focus.id, title: focus.title, state: focus.state === 'paused' ? 'paused' : 'active', steps, canAddNextStep: steps.length === 0 };",
    to: "  return { id: focus.id, title: focus.note === null ? focus.title : `${focus.title} — ${focus.note}`, state: focus.state === 'paused' ? 'paused' : 'active', steps, canAddNextStep: steps.length === 0 };",
    tests: [T('ui')] },
  { id: 'R15', guards: 'a refused row carries none of her words (Addendum J)', what: 'the transport keeps the failing row values',
    file: 'src/platform/supabaseSyncTransport.ts',
    from: "  return details.replace(/Failing row contains \\([\\s\\S]*\\)\\.?/, 'Failing row contains (redacted).');",
    to: '  return details;',
    tests: [T('sync')] },
  { id: 'R16', kind: 'sql', guards: 'no inference through a link target', what: 'the link-target visibility trigger is dropped',
    sql: 'DROP TRIGGER rebuild_focus_links_target_visible ON public.rebuild_focus_links;',
    expectFail: /PRIVATE Task is refused with the very same answer/ },
  { id: 'R17', guards: 'the one stable order (Addendum K)', what: 'Focuses are ordered by title',
    file: 'src/domain/rebuild/read.ts',
    from: '        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||',
    to: '        STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.title.localeCompare(b.title) ||',
    tests: [T('focus.model'), T('ui')] },
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
    const run = spawnSync(process.execPath, ['supabase/tests/run.mjs', '78'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900000, env: { ...process.env, MSYS_NO_PATHCONV: '1', HERKEYS_MUTANT_SQL: mutant.sql } });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    if (!/checks passed/.test(out) && !/FAIL/.test(out)) return ['BROKEN', 'the database run produced no result'];
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
  process.stdout.write(`${mutant.id.padEnd(4)} ${mutant.guards.padEnd(58)} `);
  const [verdict, detail] = runMutant(mutant);
  rows.push({ id: mutant.id, guards: mutant.guards, what: mutant.what, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${detail}`);
}
const bad = rows.filter((r) => !['CAUGHT', 'READY'].includes(r.verdict));
const caught = rows.filter((r) => r.verdict === 'CAUGHT').length;
console.log(`\n${process.env.DRY ? `${rows.length - bad.length} / ${rows.length} patches ready` : `${caught} / ${rows.length} mutants caught`}${bad.length ? `; NOT caught: ${bad.map((r) => `${r.id} (${r.verdict})`).join(', ')}` : ''}`);
process.exit(bad.length === 0 ? 0 : 1);
