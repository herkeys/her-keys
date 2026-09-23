// HK-FEATURE-13 (People OS) - test-the-test. Run from the repository root:  node scripts-dev/f13-mutation-check.cjs   (DRY=1: applicability only)
//
// Each mutant makes the defect it guards against REAL for one run: a source mutant patches one or more lines (each must match exactly
// once), runs the tests that are meant to catch it, and restores the file byte for byte; a SQL mutant is applied to the private
// f13_env database after the fixtures (supabase/tests/run-f13.mjs, HERKEYS_F13_MUTANT_SQL) and judged by the People backend suites.
// A mutant the tests do NOT catch is a test that proves nothing: the script exits non-zero if any survives, if a patch did not apply
// exactly once, or if a file was not restored. Serial by design (this machine is short of commit memory). Never commit a mutant.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const T = (...names) => names.map((n) => `tests/people/${n}.test.mjs`);
const P = 'src/features/people/';

const SRC = [
  { id: 'M1', guards: 'IDENTITY', what: 'two people with the same name collapse into one identity',
    patches: [['src/domain/people.ts', '  const before = new Set(state.people.map((p) => p.id));',
      "  const twin = state.people.find((p) => p.displayName === name.value);\n  if (twin) return done(state, 'saved', twin.id);\n  const before = new Set(state.people.map((p) => p.id));"]],
    tests: T('domain', 'projection') },
  { id: 'M2', guards: 'DISPLAY NAME', what: 'a rename creates a NEW identity (the old one archived), splitting links and context',
    patches: [['src/domain/people.ts', "  return done({ ...state, people: state.people.map((p) => (p.id === personId ? { ...p, displayName: name.value, updatedAt: at } : p)) }, 'saved', personId);",
      "  void at;\n  return done(addPerson(archivePerson(state, ctx, personId), ctx, { displayName: name.value, relationship: 'other' }), 'saved', personId);"]],
    tests: T('domain', 'store') },
  { id: 'M3', guards: 'HOUSEHOLD DUPLICATION', what: 'a context on an existing CHILD (chosen by canonical id) creates a second, non-account person for her',
    patches: [['src/domain/people.ts', '  const existing = contextFor(state, target);\n  if (existing) {\n    if (existing.status',
      "  if (target.kind === 'child') {\n    const kid = state.children.find((c) => c.id === target.id);\n    if (kid) {\n      const dup = addPerson(state, ctx, { displayName: kid.displayName, relationship: 'other' });\n      return openPersonContext(dup, ctx, { kind: 'person', id: dup.people[dup.people.length - 1].id }, fields);\n    }\n  }\n  const existing = contextFor(state, target);\n  if (existing) {\n    if (existing.status"]],
    tests: T('domain', 'projection') },
  { id: 'M4', guards: 'TASK COUPLING', what: 'completing a linked Task archives the person context',
    patches: [['src/domain/tasks.ts', "      task.id === taskId ? { ...task, status: 'completed', completedAt, updatedAt: completedAt } : task\n    ),\n",
      "      task.id === taskId ? { ...task, status: 'completed', completedAt, updatedAt: completedAt } : task\n    ),\n    personContexts: (state.personContexts ?? []).map((c) => ((state.personTaskLinks ?? []).some((l) => l.contextId === c.id && l.followUp.id === taskId) ? { ...c, status: 'archived' } : c)),\n"]],
    tests: T('domain', 'projection') },
  { id: 'M5', guards: 'TODAY / ONE MOVE', what: 'a person context itself becomes the day\'s One Move',
    patches: [['src/domain/oneMove.ts', '  if (existing && decisionStands(state, existing)) return state;\n',
      "  if (existing && decisionStands(state, existing)) return state;\n  const pctx = (state.personContexts ?? [])[0];\n  if (pctx && !existing) return { ...state, oneMoves: [...state.oneMoves, { id: oneMoveRecordId(ctx.today), forDate: ctx.today, targetId: pctx.id, targetType: 'task', status: 'selected', decidedAt: new Date(ctx.nowMs).toISOString(), completedAt: null, provenance: systemProvenance(), scope: 'personal' }] };\n"]],
    tests: T('today') },
  { id: 'M8', guards: 'NOTE LEAK (People list)', what: 'the private note becomes the People list secondary line',
    patches: [[`${P}projection.ts`, '  const secondary = context ? (context.relationshipName ?? context.organizationName) : null;',
      '  const secondary = context ? (context.contextNote ?? context.relationshipName ?? context.organizationName) : null;']],
    tests: T('ui', 'projection') },
  { id: 'M8b', guards: 'NOTE LEAK (log / error)', what: 'an integrity message (the text that reaches logs and errors) carries the label and the note',
    patches: [['src/domain/foundation/personContext.ts', '    if (context.childId !== null && !childIds.has(context.childId)) problems.push(`person context ${context.id} references missing child ${context.childId}`);',
      '    if (context.childId !== null && !childIds.has(context.childId)) problems.push(`person context ${context.id} (${context.relationshipName}: ${context.contextNote}) references missing child ${context.childId}`);']],
    tests: T('domain') },
  { id: 'M8c', guards: 'NOTE LEAK (Life hub)', what: 'the Life tile shows a private note',
    patches: [[`${P}lifeTile.ts`, "  return { key: 'people', label: peopleCopy.tile.label, value, needsAttention: attention > 0, route: '/life/people' };",
      "  const note = (state.personContexts ?? []).find((c) => c.contextNote !== null)?.contextNote ?? '';\n  return { key: 'people', label: peopleCopy.tile.label, value: `${value} ${note}`, needsAttention: attention > 0, route: '/life/people' };"]],
    tests: T('projection') },
  { id: 'M8d', guards: 'NOTE LEAK (Today, via the Task)', what: 'the note is copied into the follow-up Task title, so it reaches Today',
    patches: [['src/domain/people.ts', "{ title, categoryId: category.id, dueDate, scope: 'personal' }",
      "{ title: `${title} ${context.contextNote ?? ''}`.trim(), categoryId: category.id, dueDate, scope: 'personal' }"]],
    tests: T('domain', 'today') },
  { id: 'M9', guards: 'FOLLOW-UP', what: 'opening Add Follow-up creates a Task before she saves',
    patches: [[`${P}ui/FollowUpFormView.tsx`, "  const [title, setTitle] = useState('');",
      "  const [title, setTitle] = useState(() => {\n    onSave({ title: 'Opened', dueDate: null });\n    return '';\n  });"]],
    tests: T('ui') },
  { id: 'M10', guards: 'LINK TARGET', what: 'a completed / archived Task keeps counting as Needs Follow-up',
    patches: [[`${P}projection.ts`, "    if (!task || task.status !== 'open') continue;", '    if (!task) continue;']],
    tests: T('projection') },
  { id: 'M11', guards: 'SOCIAL INFERENCE', what: 'a person with no follow-up generates an automatic "reach out" attention item',
    patches: [[`${P}projection.ts`, '  return items.sort(compareFollowUps);',
      "  for (const row of peopleRows(state)) if (!items.some((i) => i.personKey === row.key)) items.push({ taskId: `nudge-${row.key}`, title: 'Reach out', personKey: row.key, displayName: row.displayName, timing: 'today', dueDate: today, whenText: 'It has been a while.', createdAt: null });\n  return items.sort(compareFollowUps);"]],
    tests: T('projection', 'ui') },
  { id: 'M12', guards: 'CO-PARENT', what: 'generic People editing may rename / archive the F07 co-parent identity',
    patches: [['src/domain/people.ts', "export const isCoParent = (person: Pick<HouseholdPerson, 'relationship'>): boolean => person.relationship === 'co-parent';",
      "export const isCoParent = (person: Pick<HouseholdPerson, 'relationship'>): boolean => person.relationship === 'never';"]],
    tests: T('domain', 'projection') },
  { id: 'AF', guards: 'CANONICAL TARGET ARCHIVE', what: 'a context whose person is archived or gone keeps counting as active Needs Follow-up context',
    patches: [
      [`${P}projection.ts`, 'export function contextTargetActive(state: AppState, context: PersonContext): boolean {\n', 'export function contextTargetActive(state: AppState, context: PersonContext): boolean {\n  if (context) return true;\n'],
      [`${P}projection.ts`, '    const row = rowOf(state, source);\n    if (!row) continue;\n    const timing', "    const row = rowOf(state, source) ?? { key: `gone:${source.id}`, displayName: '' };\n    const timing"],
    ],
    tests: T('projection') },
  { id: 'AF2', guards: 'CANONICAL TARGET ARCHIVE (crash)', what: 'a context whose child has vanished crashes the projection',
    patches: [[`${P}projection.ts`, '  if (context.childId !== null) return context.childId !== state.user.id && state.children.some((c) => c.id === context.childId);',
      "  if (context.childId !== null) {\n    if (!state.children.some((c) => c.id === context.childId)) throw new Error('missing child');\n    return context.childId !== state.user.id;\n  }"]],
    tests: T('projection') },
  { id: 'R1', guards: 'RETRY', what: 'a retried save creates a second Task (the draft key no longer names the Task)',
    patches: [['src/domain/people.ts', "  const withTask = addTask(state, { ...ctx, createId: () => taskId }, ", '  const withTask = addTask(state, ctx, ']],
    tests: T('domain', 'store') },
  { id: 'O1', guards: 'ONE CONTEXT PER PERSON', what: 'opening a person who has an archived context creates a second one',
    patches: [['src/domain/people.ts', '    return restorePersonContext(state, ctx, existing.id);', '    void existing;']],
    tests: T('domain') },
];

const SQL = [
  { id: 'M6', guards: 'PRIVACY', what: 'a same-household member can read another adult\'s private contexts',
    sql: 'DROP POLICY person_contexts_select_own ON public.person_contexts; CREATE POLICY person_contexts_select_own ON public.person_contexts FOR SELECT TO authenticated USING (private.is_household_member(household_id));' },
  { id: 'M7', guards: 'LINK INFERENCE', what: 'the follow-up guard is gone, so a link can name another owner\'s private (or a shared) task',
    sql: 'DROP TRIGGER person_task_links_follow_up_task_guard ON public.person_task_links;' },
  { id: 'M7b', guards: 'LINK INFERENCE', what: 'a same-household member can read (and count) another adult\'s follow-up links',
    sql: 'DROP POLICY person_task_links_select_own ON public.person_task_links; CREATE POLICY person_task_links_select_own ON public.person_task_links FOR SELECT TO authenticated USING (private.is_household_member(household_id));' },
  { id: 'S1', guards: 'EXISTENCE ORACLE', what: 'one-context-per-person becomes household-wide, so another member\'s context on the same child collides (and is revealed)',
    sql: 'DROP INDEX public.person_contexts_one_per_child_uq; CREATE UNIQUE INDEX person_contexts_one_per_child_uq ON public.person_contexts (household_id, child_id) WHERE child_id IS NOT NULL;' },
  { id: 'S2', guards: 'NO SOCIAL INFERENCE (cloud)', what: 'an AI-inferred context is accepted by the database',
    sql: 'ALTER TABLE public.person_contexts DROP CONSTRAINT person_contexts_stated_by_her_check;' },
];

const DRY = process.env.DRY === '1';
const results = [];
let broken = false;

function nodeTests(files) {
  const r = spawnSync(process.execPath, ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', ...files],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout}${r.stderr}`;
  const failed = Number((out.match(/^ℹ fail (\d+)/m) ?? [])[1] ?? NaN);
  const passed = Number((out.match(/^ℹ pass (\d+)/m) ?? [])[1] ?? NaN);
  return { status: r.status, failed, passed };
}

for (const m of SRC) {
  const originals = new Map();
  let applied = true;
  try {
    for (const [file, from, to] of m.patches) {
      const abs = path.join(ROOT, file);
      const text = originals.get(file) ?? fs.readFileSync(abs, 'utf8');
      if (!originals.has(file)) originals.set(file, text);
      const crlf = text.includes('\r\n');
      const current = fs.readFileSync(abs, 'utf8');
      const f = crlf ? from.replace(/\n/g, '\r\n') : from;
      const t = crlf ? to.replace(/\n/g, '\r\n') : to;
      const n = current.split(f).length - 1;
      if (n !== 1) {
        applied = false;
        console.log(`${m.id}: patch matched ${n} times in ${file}`);
        break;
      }
      if (!DRY) fs.writeFileSync(abs, current.replace(f, t));
    }
    if (!applied) {
      results.push({ ...m, verdict: 'NOT APPLIED' });
      broken = true;
      continue;
    }
    if (DRY) {
      results.push({ ...m, verdict: 'applies' });
      continue;
    }
    const r = nodeTests(m.tests);
    const caught = r.status !== 0 && r.failed > 0;
    results.push({ ...m, verdict: caught ? `CAUGHT (${r.failed} failing)` : 'SURVIVED' });
    if (!caught) broken = true;
  } finally {
    for (const [file, text] of originals) {
      fs.writeFileSync(path.join(ROOT, file), text);
      if (fs.readFileSync(path.join(ROOT, file), 'utf8') !== text) {
        console.log(`${m.id}: ${file} was NOT restored`);
        broken = true;
      }
    }
  }
  console.log(`${m.id.padEnd(4)} ${results[results.length - 1].verdict.padEnd(22)} ${m.guards}: ${m.what}`);
}

for (const m of SQL) {
  if (DRY) {
    results.push({ ...m, verdict: 'applies (SQL)' });
    continue;
  }
  const r = spawnSync(process.execPath, ['supabase/tests/run-f13.mjs', '79'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, HERKEYS_F13_MUTANT_SQL: m.sql }, maxBuffer: 256 * 1024 * 1024 });
  const out = `${r.stdout}${r.stderr}`;
  const failed = Number((out.match(/F13 backend: \d+ passed, (\d+) failed/) ?? [])[1] ?? NaN);
  const caught = r.status !== 0 && failed > 0;
  results.push({ ...m, verdict: caught ? `CAUGHT (${failed} failing)` : Number.isNaN(failed) ? 'ERROR' : 'SURVIVED' });
  if (!caught) broken = true;
  console.log(`${m.id.padEnd(4)} ${results[results.length - 1].verdict.padEnd(22)} ${m.guards}: ${m.what}`);
}

const caught = results.filter((r) => r.verdict.startsWith('CAUGHT')).length;
console.log(`\n${DRY ? 'DRY: ' : ''}${caught}/${results.length} mutants caught${broken ? ' — FAILURE' : ''}`);
process.exit(broken ? 1 : 0);
