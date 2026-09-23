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
// The closeout repair (OC-01): fast unit-level judges for the TypeScript mutants, the SQL security suite for the migration's.
const BRIDGE = 'tests/hk-ir01/changeBridge.test.mjs';
const COMPOSITION = 'tests/hk-ir01/syncComposition.test.mjs';
const F05_MIGRATION = 'supabase/migrations/20260921190000_f05_add_child_after_binding.sql';
const SQL_SUITE = { command: ['node', ['supabase/tests/run.mjs', '77']] };
// The LIVE `public.sync_push` is the one the last migration declares. F10, F11, F12 and F13 each re-declare it (cumulatively, carrying
// F05's child path), so a mutant on F05's own copy changes a function the chain has already replaced and proves nothing (HK13-D39).
// Mutants on sync_push's body therefore target the last declaration; migration file names start with their version, so they sort in
// chain order. (F05's `private.push_household_child` is declared once, so its mutants stay on F05's file.)
const LIVE_SYNC_PUSH = (() => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const declaring = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('CREATE OR REPLACE FUNCTION public.sync_push('));
  return `supabase/migrations/${declaring[declaring.length - 1]}`;
})();

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
  // OC-01 was RESOLVED by the owner: a household bound to an account MUST be able to add a child. The gate's meaning was reversed on
  // purpose, so K-M7 now guards the one household that still cannot take one (it belongs to ANOTHER account), and K-M23 guards the
  // owner's decision itself (the old "only while unbound" gate must not come back).
  { id: 'K-M7', guards: 'account gate (OC-01)', what: 'a child may be added to a household that belongs to ANOTHER account (quarantined)',
    file: `${K}mutations.ts`, from: 'export const canAddChild = (identity: IdentityRecord): boolean => identity.quarantine === null;', to: 'export const canAddChild = (identity: IdentityRecord): boolean => true;', tests: [`${T}children.test.mjs`] },
  { id: 'K-M23', guards: 'account gate (OC-01)', what: 'the old gate comes back: a child cannot be added to a household bound to an account',
    file: `${K}mutations.ts`, from: 'export const canAddChild = (identity: IdentityRecord): boolean => identity.quarantine === null;', to: 'export const canAddChild = (identity: IdentityRecord): boolean => identity.quarantine === null && identity.binding === null;', tests: [`${T}children.test.mjs`, `${T}views.test.mjs`] },
  { id: 'K-M4', guards: 'stale editor', what: 'a stale editor overwrites a newer version',
    file: `${K}mutations.ts`, from: "  if (taskFingerprint(current) !== draft.baseline) return { state, outcome: 'stale' };", to: "  if (false as boolean) return { state, outcome: 'stale' };", tests: [`${T}mutations.test.mjs`] },
  { id: 'K-M20', guards: 'time / DST', what: 'a time inside the spring-forward gap is no longer reported',
    file: `${K}time.ts`, from: '  if (wallClockMinutesAt(epochMs, timeZone) !== minutesOfDay || logicalDateAt(epochMs, timeZone) !== date) {', to: '  if (false as boolean) {', tests: [`${T}time.test.mjs`, `${T}mutations.test.mjs`, `${T}views.test.mjs`] },

  // ---- A CHILD ADDED AFTER BINDING (owner checkpoint OC-01, closeout repair) ------------------------------------------------------
  // The five REQUIRED new mutants are S-N1, S-N2, S-N3, S-N4 and S-N5. The rest guard the parts of the same path the five do not name.
  // TypeScript mutants are judged by the sync composition and bridge tests; SQL mutants (a line of the F05 migration) are judged by the
  // SQL security suite in a disposable database (`run.mjs 77`), so a weakened function never touches the shared local database.
  { id: 'S-N1', guards: 'post-bind child write', what: 'a child added after binding is never queued: its create is not an allowed operation',
    file: 'src/domain/sync/syncTypes.ts', from: "  member: ['create'],", to: '  member: [],', tests: [BRIDGE, COMPOSITION] },
  { id: 'S-N1b', guards: 'post-bind child write', what: 'the change bridge cannot see the household\'s children, so a new one is never observed',
    file: 'src/domain/sync/syncKinds.ts', from: "  member: 'children',", to: '', tests: [BRIDGE, COMPOSITION] },
  { id: 'S-N2', guards: 'child id round trip (out)', what: 'the child\'s local id changes on its way to the cloud',
    file: 'src/domain/sync/projection.ts', from: "        ...base,\n        member_type: 'child',", to: "        ...base,\n        local_id: `${localId}-x`,\n        member_type: 'child',", tests: [COMPOSITION] },
  { id: 'S-N2b', guards: 'child id round trip (in)', what: 'the pull gives a child it already knows a NEW local id',
    file: 'src/domain/sync/pullEngine.ts', from: "    const localId = existing?.localId ?? (taken ? ctx.mintLocalId('member', wanted) : wanted);", to: "    const localId = ctx.mintLocalId('member', wanted);", tests: [COMPOSITION] },
  { id: 'S-N3', guards: 'hydration identity', what: 'hydration matches an incoming child to a local one by NAME instead of by id',
    file: 'src/domain/sync/pullEngine.ts', from: '    const known = nextState.children.find((candidate) => candidate.id === localId);', to: '    const known = nextState.children.find((candidate) => candidate.displayName === child.displayName);', tests: [COMPOSITION] },
  { id: 'S-N4', guards: 'authority (SQL)', what: 'the function no longer checks that the caller OWNS the household: a member, or an unrelated account calling it, can add a child',
    file: F05_MIGRATION, from: '  IF v_house IS NULL OR NOT private.is_household_owner(v_house) THEN', to: '  IF v_house IS NULL THEN', ...SQL_SUITE },
  { id: 'S-N4b', guards: 'authority (SQL)', what: 'sync_push no longer checks household membership before the child is written',
    file: LIVE_SYNC_PUSH, from: '  IF NOT private.is_household_member(v_house) THEN', to: '  IF false THEN', ...SQL_SUITE },
  { id: 'S-N5', guards: 'second device hydration', what: 'a second device applies children only while it holds none, so a newly created child never arrives',
    file: 'src/domain/sync/pullEngine.ts', from: "    if (row.member_type !== 'child') continue;", to: "    if (row.member_type !== 'child' || nextState.children.length > 0) continue;", tests: [COMPOSITION] },
  { id: 'S-N6', guards: 'lost acknowledgement', what: 'the pull does not adopt a child this device created, so a lost acknowledgement makes a duplicate child',
    file: 'src/domain/sync/pullEngine.ts', from: '    const adopts = existing === null && ownRow && heldLocally &&', to: '    const adopts = false && existing === null && ownRow && heldLocally &&', tests: [COMPOSITION] },
  { id: 'S-N7', guards: 'dependency order', what: 'a child ranks AFTER the work that names it, so a task is sent before its child has a cloud id',
    file: 'src/domain/sync/syncTypes.ts', from: '  member: 0,', to: '  member: 9,', tests: [BRIDGE, 'tests/foundationSpecs.test.mjs', COMPOSITION] },
  { id: 'S-N8', guards: 'no child mapped to the account holder (SQL)', what: 'the collision probe also matches the account holder\'s own member row, so a child can be reported as "already created" and mapped to the adult',
    file: LIVE_SYNC_PUSH, from: "         WHEN p_entity_table = 'household_members' THEN ' AND member_type = ''child'''", to: "         WHEN p_entity_table = 'household_members' THEN ''", ...SQL_SUITE },
  { id: 'S-N9', guards: 'child bound (SQL)', what: 'the 20-child bound is gone (200)',
    file: F05_MIGRATION, from: '  IF v_children >= 20 THEN', to: '  IF v_children >= 200 THEN', ...SQL_SUITE },
  { id: 'S-N11', guards: 'child name across the boundary', what: 'the name cleaner loses its backslash again: `/s+/` turns every letter s into a space ("Josie" -> "Jo ie")',
    file: 'src/domain/account/claim.ts', from: "    .replace(/\\s+/g, ' ')", to: "    .replace(/s+/g, ' ')", tests: [BRIDGE, COMPOSITION, 'tests/claimPayload.test.mjs'] },
  { id: 'S-N10', guards: 'server-owned columns (SQL)', what: 'the function accepts columns a client must not state (an account, a role) instead of refusing them',
    file: F05_MIGRATION, from: "    IF v_key <> ALL (ARRAY['household_id', 'local_id', 'origin_device_id', 'member_type', 'display_name', 'birth_date', 'scope']) THEN", to: '    IF false THEN', ...SQL_SUITE },
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
