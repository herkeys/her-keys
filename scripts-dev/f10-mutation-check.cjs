#!/usr/bin/env node
/**
 * HK-FEATURE-10 — mutation check (builder validation, not the independent audit).
 *
 * "A regression test only counts once it fails with the defect put back." This puts each named F10
 * ADDENDUM AD defect back into the source, runs tests/work/opportunity.test.mjs serially, requires it to
 * FAIL, and restores the file byte-for-byte. Two of the addendum's eight required mutations
 * (PRIVACY, IDENTITY) have no app-level target to mutate — see the note at the end of this file.
 *
 *   node scripts-dev/f10-mutation-check.cjs            # every mutant
 *   ONLY=M1,M4 node scripts-dev/f10-mutation-check.cjs
 *
 * Safety: refuses to run on a dirty worktree, retries file restores (Windows may hold a file briefly),
 * and on exit restores every touched file with `git checkout`. Refuses to run unless the UNMUTATED
 * baseline is green and substantial.
 * Exit code: 0 = every mutant caught, 1 = a mutant survived, 2 = could not run.
 */
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');

const mutations = [
  {
    id: 'M1', what: 'RELATIONSHIP — an opportunity with no linked Task appears to have a next step',
    file: 'src/domain/opportunities.ts',
    edits: [[
      'export function hasOpenNextAction(state: AppState, opportunityId: string): boolean {\n  return linkedTasksOf(state, opportunityId).some((t) => t.status === \'open\');\n}',
      'export function hasOpenNextAction(state: AppState, opportunityId: string): boolean {\n  return true; // MUTANT\n}',
    ]],
  },
  {
    id: 'M2', what: 'INTERVIEW — an Event\'s time passing automatically advances the Opportunity stage',
    file: 'src/domain/opportunities.ts',
    edits: [[
      `  const { state: linked } = addDependency(afterEvent, ctx, {
    relation: 'part_of',
    from: { kind: 'event', id: event.id },
    to: opportunityRef(opportunityId),
  });
  return { state: linked, event };
}`,
      `  const { state: linked } = addDependency(afterEvent, ctx, {
    relation: 'part_of',
    from: { kind: 'event', id: event.id },
    to: opportunityRef(opportunityId),
  });
  if (Date.parse(event.startsAt) < ctx.nowMs) { // MUTANT
    const { state: advanced } = setOpportunityStage(linked, ctx, opportunityId, 'interviewing');
    return { state: advanced, event };
  }
  return { state: linked, event };
}`,
    ]],
  },
  {
    id: 'M3', what: 'STAGE — applied is silently treated as interviewing',
    file: 'src/domain/opportunities.ts',
    edits: [[
      '  const current = state.careerOpportunities.find((o) => o.id === id);\n  if (!current) return { state, refusal: \'not_found\' };',
      '  const current = state.careerOpportunities.find((o) => o.id === id);\n  if (!current) return { state, refusal: \'not_found\' };\n  if (stage === \'applied\') stage = \'interviewing\'; // MUTANT',
    ]],
  },
  {
    id: 'M4', what: 'CLOSURE — closing an Opportunity automatically completes its linked Tasks',
    file: 'src/domain/opportunities.ts',
    edits: [[
      `  return { state: { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? updated : o)) }, refusal: null };
}`,
      `  const nextState = { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? updated : o)) };
  if (stage === 'closed') { // MUTANT
    const linkedIds = new Set(linkedTasksOf(state, id).map((t) => t.id));
    return { state: { ...nextState, tasks: nextState.tasks.map((t) => (linkedIds.has(t.id) ? { ...t, status: 'completed', completedAt: at } : t)) }, refusal: null };
  }
  return { state: nextState, refusal: null };
}`,
    ]],
  },
  {
    id: 'M5', what: 'ONE MOVE — CareerOpportunity itself becomes a One Move target without a canonical Task',
    file: 'src/domain/state.ts',
    edits: [[
      "export const ONE_MOVE_TARGET_TYPES = ['catalog', 'task', 'needsMe', 'event', 'system', 'responsibility'] as const;",
      "export const ONE_MOVE_TARGET_TYPES = ['catalog', 'task', 'needsMe', 'event', 'system', 'responsibility', 'opportunity'] as const; // MUTANT",
    ]],
  },
  {
    id: 'M6', what: 'MONEY BOUNDARY — a structured compensation field is added to the accepted schema',
    file: 'src/domain/foundation/opportunity.ts',
    edits: [[
      "    compensationNote: FreeNote,\n    notes: z.string().max(1000).nullable(),",
      "    compensationNote: FreeNote,\n    salaryCents: z.number().int().nullable(), // MUTANT\n    notes: z.string().max(1000).nullable(),",
    ]],
  },
];

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function write(file, data) {
  let err;
  for (let i = 0; i < 40; i++) {
    try { fs.writeFileSync(file, data); return; } catch (e) { err = e; sleep(250); }
  }
  throw err;
}

function runOpportunityTests() {
  const args = ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', 'tests/work/opportunity.test.mjs'];
  const run = spawnSync('node', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false });
  const out = run.stdout + run.stderr;
  const num = (re) => { const m = re.exec(out); return m ? Number(m[1]) : -1; };
  return { fails: num(/ℹ fail (\d+)/), passes: num(/ℹ pass (\d+)/), tests: num(/ℹ tests (\d+)/), names: [...out.matchAll(/^\s+✖ (.+?) \(/gm)].map((x) => x[1]), out };
}

const dirty = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
if (dirty !== '') { console.log('ABORT: the worktree is not clean:\n' + dirty); process.exit(2); }

const baseline = runOpportunityTests();
console.log(`baseline (unmutated): tests=${baseline.tests} pass=${baseline.passes} fail=${baseline.fails}`);
if (baseline.fails !== 0 || baseline.tests < 20) { console.log('ABORT: the unmutated baseline is not green and substantial, so "the tests failed" would prove nothing'); process.exit(2); }

const touched = new Set();
process.on('exit', () => { for (const f of touched) { try { execFileSync('git', ['checkout', '--', f]); } catch { /* best effort */ } } });

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const results = [];
for (const m of mutations) {
  if (only && !only.has(m.id)) continue;
  const original = fs.readFileSync(m.file);
  const eol = original.toString('utf8').includes('\r\n') ? '\r\n' : '\n';
  let text = original.toString('utf8').replace(/\r\n/g, '\n');
  let ok = true;
  for (const [from, to] of m.edits) {
    if (text.split(from).length !== 2) { results.push({ id: m.id, what: m.what, status: 'NOT APPLIED', detail: from.slice(0, 60) }); ok = false; break; }
    text = text.replace(from, () => to);
  }
  if (!ok) continue;
  touched.add(m.file);
  write(m.file, text.replace(/\n/g, eol));
  try {
    const r = runOpportunityTests();
    results.push({ id: m.id, what: m.what, status: r.fails > 0 ? 'CAUGHT' : r.fails === 0 ? 'SURVIVED' : 'ERROR', fails: r.fails, first: r.names[0] ?? '' });
  } finally {
    write(m.file, original);
  }
}

for (const r of results) console.log(`${r.id}  ${String(r.status).padEnd(11)} failing=${String(r.fails ?? '-').padStart(3)}  ${r.what}${r.first ? '  <- ' + r.first.slice(0, 70) : ''}${r.detail ? '  [' + r.detail + ']' : ''}`);
const caught = results.filter((r) => r.status === 'CAUGHT').length;
console.log(`\ncaught: ${caught} / ${results.length}`);
console.log('worktree after restore: ' + (execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim() === '' ? 'CLEAN' : 'DIRTY'));
console.log(`
Not run here (no app-level target exists to mutate — proven at a different layer instead):
  PRIVACY  — "a same-household but unauthorized profile reads an owner-private CareerOpportunity"
             is enforced ONLY by Postgres RLS (career_opportunities_select_own). Proof:
             supabase/tests/57-foundation-rls.sql, "same-household member B: sees NONE of A's
             career opportunities" / "B: sees exactly her own opportunity" — real roles, real RLS,
             no application code exists to bypass it from.
  IDENTITY — "F10 collision/context logic relies on a child's display name rather than its canonical
             ID" has no F10 target: F10 writes no child-referencing logic at all (Work->Kids is
             reuse-only, per the prompt's own boundary). The identity guarantee this would attack is
             F05's, and is covered by F05's own mutation check.`);
process.exit(caught === results.length ? 0 : 1);
