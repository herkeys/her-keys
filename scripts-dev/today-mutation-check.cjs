#!/usr/bin/env node
/**
 * HK-FEATURE-01-TODAY — mutation check (builder validation, not the independent audit).
 *
 * "A regression test only counts once it fails with the defect put back." This puts each named defect back into the
 * Today source, runs the Today test suite serially, requires it to FAIL, and restores the file byte-for-byte.
 *
 *   node scripts-dev/today-mutation-check.cjs            # every mutant
 *   ONLY=M01,M07 node scripts-dev/today-mutation-check.cjs
 *
 * Safety: it refuses to run on a dirty worktree, retries file restores (Windows may hold a file briefly), and on exit
 * restores every touched file with `git checkout`. It also refuses to run unless the UNMUTATED baseline is green and
 * substantial — an early version of this check "caught" every mutant only because the test command itself was broken.
 * Exit code: 0 = every mutant caught, 1 = a mutant survived, 2 = could not run.
 */
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');

const DQ = String.fromCharCode(8220); // “
const DQR = String.fromCharCode(8221); // ”
const BT = String.fromCharCode(96); // `

const mutations = [
  {
    id: 'M01', what: 'handled without requiring a success outcome (execution == success)', file: 'src/features/today/model/executionView.ts',
    edits: [
      ['if (!latest || !OUTCOME_IS_SUCCESS[latest.kind] || !sameDay(latest.observedAt, today, tz)) continue;', 'if (latest && (!OUTCOME_IS_SUCCESS[latest.kind] || !sameDay(latest.observedAt, today, tz))) continue;'],
      ['outcome: latest.kind,', "outcome: latest?.kind ?? 'completed',"],
    ],
  },
  { id: 'M02', what: 'an unanswered delegation drops out of Today', file: 'src/features/today/model/attentionView.ts', edits: [["case 'unacknowledged_delegation': {", "case 'unacknowledged_delegation': { return null;"]] },
  { id: 'M03', what: 'can-wait ignores a stated high consequence', file: 'src/features/today/model/canWait.ts', edits: [["if (facets.consequence !== null && consequenceRank(facets.consequence) >= consequenceRank('high')) continue;", '']] },
  { id: 'M04', what: 'a stand-in state is shown as her household', file: 'src/features/today/model/todayView.ts', edits: [["if (runtime.recovery !== null && runtime.persistence === 'disabled') {", 'if (false) {']] },
  { id: 'M05', what: 'a hydrating state is treated as resolved', file: 'src/features/today/model/todayView.ts', edits: [["if (state === null || !isSettled(runtime.status)) return { availability: 'unknown' };", "if (state === null) return { availability: 'unknown' };"]] },
  { id: 'M06', what: 'the screen never re-reads the clock (no tick)', file: 'src/features/today/useTodayView.ts', edits: [['      setTick(Date.now());\n', '']] },
  { id: 'M07', what: 'a stale One Move evidence link is kept as evidence', file: 'src/features/today/model/oneMoveView.ts', edits: [['if (reason === null && CHECKABLE_CODES.has(link.code)) continue;', '']] },
  { id: 'M08', what: 'elapsed commitments still count as what matters', file: 'src/features/today/model/mattersView.ts', edits: [['.filter((e) => e.endMinutes > nowMinutes)', '.filter(() => true)']] },
  { id: 'M09', what: 'the three-primary-block cap is removed', file: 'src/features/today/model/todayView.ts', edits: [["if (primary.length > MAX_PRIMARY_BLOCKS && primary.includes('matters')) {", 'if (false) {']] },
  { id: 'M10', what: 'an unconfirmed claim is presented like a stated fact', file: 'src/features/today/model/refs.ts', edits: [["uncertain: carriesConfidence(producer) && (confidence === 'possible' || confidence === 'likely'),", 'uncertain: false,']] },
  { id: 'M11', what: 'the approval confirmation is bypassed (one tap approves)', file: 'src/features/today/TodayAttention.tsx', edits: [['onApprove={() => setReviewing(row)}', "onApprove={() => void onDecide(row.approval!.intentId, 'approved')}"]] },
  { id: 'M12', what: 'a timing decision is offered after its window ended', file: 'src/features/today/model/decisionView.ts', edits: [['if (windowHasEnded(primary!, day, issues, nowMinutes)) return { section: null };', '']] },
  { id: 'M13', what: 'exclamation-mark cheerleading in copy', file: 'src/features/today/model/narrative.ts', edits: [["return 'Nothing is on your list yet.';", "return 'Nothing is on your list yet!';"]] },
  { id: 'M14', what: 'an accepted handoff is described as taken care of', file: 'src/features/today/model/attentionView.ts', edits: [['agreed to take ' + DQ + '${title}' + DQR + '.' + BT, 'has taken care of ' + DQ + '${title}' + DQR + '.' + BT]] },
  { id: 'M15', what: 'the decisions ledger is labelled "Handled by Her Keys" again', file: 'src/features/today/HandledLedger.tsx', edits: [['title="Changes you approved"', 'title="Handled by Her Keys"']] },
  { id: 'M16', what: "the day comes from UTC, not the household's timezone", file: 'src/features/today/model/todayView.ts', edits: [['const today = logicalDateAt(nowMs, tz);', 'const today = new Date(nowMs).toISOString().slice(0, 10);']] },
  { id: 'M17', what: 'take-back is offered for an accepted handoff', file: 'src/features/today/model/attentionView.ts', edits: [["actions: r.state === 'accepted' ? open : [takeBack, ...open] });", 'actions: [takeBack, ...open] });']] },
  { id: 'M18', what: "the foundation's order of what needs her is reversed", file: 'src/features/today/model/attentionView.ts', edits: [['merged.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);', 'merged.reverse();']] },
  { id: 'M19', what: 'a dependency Her Keys inferred is stated as fact ("needs")', file: 'src/features/today/model/requirements.ts', edits: [['const stated = requirements.filter((r) => !isUnconfirmed(r));', 'const stated = requirements;']] },
  { id: 'M20', what: 'a dropped, finished or removed commitment is still "waiting"', file: 'src/features/today/model/requirements.ts', edits: [['.filter((from) => isLive(state, from))', '.filter(() => true)']] },
  { id: 'M21', what: 'a dependency the One Move context names leaks into its reasons', file: 'src/features/today/model/oneMoveView.ts', edits: [["return { basis: 'recorded_evidence', reasons, evidence, context };", "return { basis: 'recorded_evidence', reasons: [...reasons, ...context], evidence, context };"]] },
  { id: 'M22', what: 'the unconfirmed badge is dropped from the "Coming up" line', file: 'src/features/today/model/upcoming.ts', edits: [['source: spoken.unconfirmed ? first.source : null,', 'source: null,']] },
  { id: 'M23', what: 'a button row hides its unconfirmed badge from a screen reader (list)', file: 'src/features/today/TodayList.tsx', edits: [['accessibilityLabel={row.source?.uncertain ? ' + BT + '${row.text} ${sourceLabelOf(row.source)}.' + BT + ' : row.text}', 'accessibilityLabel={row.text}']] },
  { id: 'M24', what: 'a button row hides its unconfirmed badge from a screen reader (matters)', file: 'src/features/today/TodayMatters.tsx', edits: [[", item.source?.uncertain ? sourceLabelOf(item.source) : null]", ']']] },
];

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function write(file, data) {
  let err;
  for (let i = 0; i < 40; i++) {
    try { fs.writeFileSync(file, data); return; } catch (e) { err = e; sleep(250); }
  }
  throw err;
}

function runTodayTests() {
  // The glob form, exactly as package.json's test script passes it. A bare directory is NOT a valid --test argument.
  const args = ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', 'tests/today/*.test.mjs'];
  const run = spawnSync('node', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false });
  const out = run.stdout + run.stderr;
  const num = (re) => { const m = re.exec(out); return m ? Number(m[1]) : -1; };
  return { fails: num(/ℹ fail (\d+)/), passes: num(/ℹ pass (\d+)/), tests: num(/ℹ tests (\d+)/), names: [...out.matchAll(/^\s+✖ (.+?) \(/gm)].map((x) => x[1]) };
}

const dirty = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
if (dirty !== '') { console.log('ABORT: the worktree is not clean:\n' + dirty); process.exit(2); }

const baseline = runTodayTests();
console.log(`baseline (unmutated): tests=${baseline.tests} pass=${baseline.passes} fail=${baseline.fails}`);
if (baseline.fails !== 0 || baseline.tests < 100) { console.log('ABORT: the unmutated baseline is not green and substantial, so "the tests failed" would prove nothing'); process.exit(2); }

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
    const r = runTodayTests();
    results.push({ id: m.id, what: m.what, status: r.fails > 0 ? 'CAUGHT' : r.fails === 0 ? 'SURVIVED' : 'ERROR', fails: r.fails, first: r.names[0] ?? '' });
  } finally {
    write(m.file, original);
  }
}

for (const r of results) console.log(`${r.id}  ${String(r.status).padEnd(11)} failing=${String(r.fails ?? '-').padStart(3)}  ${r.what}${r.first ? '  <- ' + r.first.slice(0, 64) : ''}${r.detail ? '  [' + r.detail + ']' : ''}`);
const caught = results.filter((r) => r.status === 'CAUGHT').length;
console.log(`\ncaught: ${caught} / ${results.length}`);
console.log('worktree after restore: ' + (execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim() === '' ? 'CLEAN' : 'DIRTY'));
process.exit(caught === results.length ? 0 : 1);
