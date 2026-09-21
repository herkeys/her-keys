// HK-FEATURE-05 - test-the-test. Run from the repository root:  node scripts-dev/f05-mutation-check.cjs [MUTANT_ID]   (DRY=1 checks applicability only)
//
// For each mutant: ONE source line is changed the way the defect it guards against would change it, the tests meant to catch it are
// run, and the file is restored byte for byte. A mutant the tests do NOT catch is a test that proves nothing, so the script exits
// non-zero if any mutant survives, if a mutation did not apply exactly once, or if a file was not restored.
//
// The six REQUIRED mutants are K-M1 (child identity), K-M2 (default 15 -> user 15), K-M13 (removed prerequisite as satisfied),
// K-M8/K-M9 (assigned or accepted as covered), K-M11 (unknown as PLAN IN PLACE) and K-M10 (a removed fallback person keeps the plan
// green). S-M1/S-M2 drop a child's identity on the way to and from the cloud and are judged by the REAL-database journey.
//
// Serial by design (one node process at a time): this machine is short of commit memory. Do not edit src/ while it runs.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const T = 'tests/kids/';
const K = 'src/features/kids/';
const ALL = ['children', 'identity', 'time', 'projection', 'mutations', 'views', 'reachability', 'boundaries', 'copyTruth'].map((n) => `${T}${n}.test.mjs`);
const JOURNEY = { command: ['node', ['supabase/tests/run.mjs', 'kids']] };

const MUTANTS = [
  // ---- CHILD IDENTITY -------------------------------------------------------------------------------------------------------
  { id: 'K-M1', guards: 'child identity', what: 'a created task is attached to the FIRST child instead of the one chosen',
    file: `${K}mutations.ts`, from: '    subjectMemberId: draft.childId,\n    durationMinutes: minutes,', to: '    subjectMemberId: state.children[0].id,\n    durationMinutes: minutes,', tests: [`${T}mutations.test.mjs`, `${T}projection.test.mjs`] },
  { id: 'K-M6', guards: 'child identity', what: 'a child that is not in this household is accepted as a subject',
    file: `${K}mutations.ts`, from: 'subject is string => subject !== null && state.children.some((child) => child.id === subject);', to: 'subject is string => subject !== null;', tests: [`${T}mutations.test.mjs`] },
  { id: 'S-M1', guards: 'child identity (sync out)', what: 'the sync projection drops a task\'s child on the way to the cloud',
    file: 'src/domain/sync/projection.ts', from: '        category_id: category,\n        subject_member_id: subject,\n        duration_minutes:', to: '        category_id: category,\n        subject_member_id: null,\n        duration_minutes:', ...JOURNEY },
  { id: 'S-M2', guards: 'child identity (sync in)', what: 'the pull drops a task\'s child on the way back from the cloud',
    file: 'src/domain/sync/apply.ts', from: '          subjectMemberId: resolve(row.subject_member_id as string),\n          durationMinutes: num(row.duration_minutes),', to: '          subjectMemberId: null,\n          durationMinutes: num(row.duration_minutes),', ...JOURNEY },
  { id: 'K-M18', guards: 'reachability / AB', what: 'the "not linked to a child" list drops tasks that name the adult',
    file: `${K}unlinked.ts`, from: 'entry.task.subjectMemberId === null || !childIds.has(entry.task.subjectMemberId)', to: 'entry.task.subjectMemberId === null', tests: [`${T}reachability.test.mjs`] },
  { id: 'K-M19', guards: 'colliding names', what: 'two children with the same name are no longer treated as colliding',
    file: `${K}identity.ts`, from: 'const nameCollides = group.length > 1;', to: 'const nameCollides = false;', tests: [`${T}identity.test.mjs`, `${T}views.test.mjs`] },

  // ---- DURATION PROVENANCE --------------------------------------------------------------------------------------------------
  { id: 'K-M2', guards: 'duration provenance', what: 'a DEFAULT 15 is recorded as USER 15 at creation',
    file: `${K}mutations.ts`, from: '  const durationSource = durationSourceForSave({ touched: draft.durationTouched, existing: null });', to: "  const durationSource = 'user' as const;", tests: [`${T}mutations.test.mjs`] },
  { id: 'K-M3', guards: 'duration provenance', what: 'an edit that never touched the length upgrades it to hers',
    file: `${K}mutations.ts`, from: '  if (draft.durationTouched) {\n    // Touching', to: '  if (true) {\n    // Touching', tests: [`${T}mutations.test.mjs`] },
  { id: 'K-M22', guards: 'duration provenance (copy)', what: 'a default length is worded as if she gave it',
    file: `${K}copy.ts`, from: '      return `About ${minutesText(duration.minutes)} (an estimate)`;', to: '      return minutesText(duration.minutes);', tests: [`${T}copyTruth.test.mjs`, `${T}views.test.mjs`] },

  // ---- DEPENDENCY TRUTH -----------------------------------------------------------------------------------------------------
  { id: 'K-M13', guards: 'dependency truth', what: 'a REMOVED prerequisite is read as satisfied (ready)',
    file: `${K}projection.ts`, from: '  return { readiness: readinessOf(c.state, ref), waitingOn, unavailable };', to: "  return { readiness: waitingOn.length === 0 ? 'ready' : 'blocked', waitingOn, unavailable };", tests: [`${T}projection.test.mjs`] },

  // ---- RESPONSIBILITY -------------------------------------------------------------------------------------------------------
  { id: 'K-M8', guards: 'responsibility', what: 'a request nobody has answered is read as COVERED',
    file: `${K}responsibility.ts`, from: "      return row.ackDueAt !== null && Date.parse(row.ackDueAt) <= nowMs ? 'reply_overdue' : 'asked_no_answer';", to: "      return 'covered';", tests: [`${T}projection.test.mjs`, `${T}copyTruth.test.mjs`] },
  { id: 'K-M9', guards: 'responsibility', what: 'accepted-but-still-needs-me is read as COVERED',
    file: `${K}responsibility.ts`, from: "      return row.stillNeedsMe ? 'accepted_still_yours' : 'covered';", to: "      return 'covered';", tests: [`${T}projection.test.mjs`, `${T}copyTruth.test.mjs`] },
  { id: 'K-M5', guards: 'responsibility', what: 'accepting with no explicit answer to "still needs you?" is allowed (the foundation defaults it to covered)',
    file: `${K}mutations.ts`, from: "typeof stillNeedsMe === 'boolean' ? respond(", to: 'true ? respond(', tests: [`${T}mutations.test.mjs`, `${T}views.test.mjs`] },
  { id: 'K-M17', guards: 'responsibility', what: 'a handoff to an archived person is filed under "someone else has it"',
    file: `${K}projection.ts`, from: "    if (r.requiresYou === true || r.coverage === 'holder_unavailable') openWork.needsYou.push(item);", to: '    if (r.requiresYou === true) openWork.needsYou.push(item);', tests: [`${T}projection.test.mjs`] },
  { id: 'K-M21', guards: 'responsibility (copy)', what: 'accepted-but-still-yours is worded as off her list',
    file: `${K}copy.ts`, from: "      return `${who} said yes. It's marked as still needing you.`;", to: "      return `${who} said yes, and it's marked as off your list.`;", tests: [`${T}copyTruth.test.mjs`, `${T}views.test.mjs`] },

  // ---- FALLBACK READINESS ---------------------------------------------------------------------------------------------------
  { id: 'K-M11', guards: 'fallback readiness', what: 'nothing recorded is read as PLAN IN PLACE',
    file: `${K}responsibility.ts`, from: "    case 'nobody_recorded':\n      return { label: 'NOT_ENOUGH_KNOWN', reason: 'nothing_recorded' };", to: "    case 'nobody_recorded':\n      return { label: 'PLAN_IN_PLACE', reason: 'accepted_and_off_your_list' };", tests: [`${T}projection.test.mjs`, `${T}views.test.mjs`] },
  { id: 'K-M10', guards: 'removed fallback person', what: 'a person who has been ARCHIVED still counts as available, so PLAN IN PLACE survives',
    file: `${K}responsibility.ts`, from: "      available: person !== undefined && person.status === 'active',", to: '      available: person !== undefined,', tests: [`${T}projection.test.mjs`] },
  { id: 'K-M14', guards: 'fallback readiness', what: 'creating a step to sort a gap out turns the plan green',
    file: `${K}projection.ts`, from: "  return { label, reason, relies: responsibility.holder, openSteps: steps.filter((step) => step.status === 'open') };", to: "  return { label: steps.length > 0 ? 'PLAN_IN_PLACE' : label, reason, relies: responsibility.holder, openSteps: steps.filter((step) => step.status === 'open') };", tests: [`${T}projection.test.mjs`, `${T}views.test.mjs`] },

  // ---- SHARED ATTENTION, HOUSEHOLD BOUNDARY, ACCOUNT, TIME ---------------------------------------------------------------------
  { id: 'K-M15', guards: 'shared attention', what: 'Kids invents its own urgency for a shared attention item',
    file: `${K}projection.ts`, from: '      urgency: item.urgency,\n      date: dateOfRef(c, resolved.ref),', to: "      urgency: 'now',\n      date: dateOfRef(c, resolved.ref),", tests: [`${T}projection.test.mjs`] },
  { id: 'K-M16', guards: 'household boundary', what: 'a request for another household is answered with this one\'s children',
    file: `${K}projection.ts`, from: '  if (state.household.id !== householdId) return { householdId,', to: '  if (false as boolean) return { householdId,', tests: [`${T}projection.test.mjs`, `${T}boundaries.test.mjs`, `${T}views.test.mjs`] },
  { id: 'K-M7', guards: 'account gate (OC-01)', what: 'a child may be added to an account-bound household',
    file: `${K}mutations.ts`, from: 'export const canAddChild = (identity: IdentityRecord): boolean => isUnbound(identity);', to: 'export const canAddChild = (identity: IdentityRecord): boolean => true;', tests: [`${T}children.test.mjs`] },
  { id: 'K-M4', guards: 'stale editor', what: 'a stale editor overwrites a newer version',
    file: `${K}mutations.ts`, from: "  if (taskFingerprint(current) !== draft.baseline) return { state, outcome: 'stale' };", to: "  if (false as boolean) return { state, outcome: 'stale' };", tests: [`${T}mutations.test.mjs`] },
  { id: 'K-M20', guards: 'time / DST', what: 'a time inside the spring-forward gap is no longer reported',
    file: `${K}time.ts`, from: '  if (wallClockMinutesAt(epochMs, timeZone) !== minutesOfDay || logicalDateAt(epochMs, timeZone) !== date) {', to: '  if (false as boolean) {', tests: [`${T}time.test.mjs`, `${T}mutations.test.mjs`, `${T}views.test.mjs`] },
];

const NODE_ARGS = ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1'];
const INFRA = /spawnSync|UNKNOWN|paging file|fork: retry|out of memory|heap|ENOMEM|Zone Allocation/i;

function runTests(mutant) {
  const [cmd, args] = mutant.command ?? ['node', [...NODE_ARGS, ...(mutant.tests ?? ALL)]];
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    return { fail: 0, infra: false, out };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const failing = mutant.command
      ? (out.match(/^\s*FAIL /gm) || []).length || (/HARNESS ERROR|checks passed/.test(out) ? 1 : 0)
      : Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? 0);
    // No failing check and no test-runner verdict: the run itself died (memory, docker). That is not "caught".
    return { fail: failing, infra: failing === 0 && INFRA.test(out), out };
  }
}

const only = process.argv[2];
const chosen = MUTANTS.filter((m) => !only || m.id === only);
let survivors = 0;
let broken = 0;
const rows = [];
for (const mutant of chosen) {
  const target = path.join(ROOT, mutant.file);
  const original = fs.readFileSync(target, 'utf8');
  const crlf = original.includes('\r\n');
  const normalised = crlf ? original.replace(/\r\n/g, '\n') : original;
  const matches = normalised.split(mutant.from).length - 1;
  if (matches !== 1) {
    broken += 1;
    rows.push(`${mutant.id}  DID NOT APPLY (${matches} matches)  ${mutant.what}`);
    console.log(rows[rows.length - 1]);
    continue;
  }
  if (process.env.DRY) {
    console.log(`${mutant.id.padEnd(6)} applies exactly once in ${mutant.file}`);
    continue;
  }
  const mutated = normalised.replace(mutant.from, () => mutant.to);
  fs.writeFileSync(target, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
  let result;
  try {
    result = runTests(mutant);
    if (result.infra) result = runTests(mutant); // one retry, only for an infrastructure signature
  } finally {
    fs.writeFileSync(target, original);
  }
  const restored = fs.readFileSync(target, 'utf8') === original;
  const caught = result.fail > 0;
  if (result.infra) broken += 1;
  else if (!caught) survivors += 1;
  if (!restored) broken += 1;
  rows.push(`${mutant.id.padEnd(6)} ${result.infra ? 'INCONCLUSIVE' : caught ? 'CAUGHT      ' : 'SURVIVED    '} (${String(result.fail).padStart(2)} failing)  ${mutant.guards.padEnd(26)} ${mutant.what}${restored ? '' : '   !! FILE NOT RESTORED'}`);
  console.log(rows[rows.length - 1]);
}

if (process.env.DRY) {
  console.log(`\ndry run: ${broken === 0 ? 'every mutation applies exactly once' : `${broken} mutation(s) did not apply`}`);
  process.exit(broken === 0 ? 0 : 1);
}
console.log(`\n${chosen.length - survivors - broken} caught, ${survivors} survived, ${broken} broken`);
process.exit(survivors + broken === 0 ? 0 : 1);
