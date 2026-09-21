// HK-FEATURE-06 (Home OS) - test-the-test. Run from the repository root:  node scripts-dev/f06-mutation-check.cjs   (DRY=1 to only check the mutations apply)
//
// For each mutant: one source line is changed the way the defect it guards against would change it, the tests that are meant to
// catch it are run, and the file is restored byte for byte. A mutant that the tests do NOT catch is a test that proves nothing, so
// the script exits non-zero if any mutant survives, if a mutation did not apply exactly once, or if a file was not restored.
//
// Serial by design (one node process at a time): this machine is short of commit memory.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const T = 'tests/hk-f06/';
const CONTEXT = [`${T}homeContext.test.mjs`];
const VIEW = [`${T}homeView.test.mjs`];
const MUT = [`${T}homeMutations.test.mjs`];
const COPY = [`${T}homeCopy.test.mjs`];
const READY = [`${T}homeReadiness.test.mjs`];
const PERF = [`${T}homePerformance.test.mjs`];
const FORMS = [`${T}homeForms.test.mjs`];
const UI = [`${T}homeUi.test.mjs`];

const HOME = 'src/features/home/';
const M = `${HOME}model/`;

const MUTANTS = [
  // ---- required 1: HOME CONTEXT - the association is dropped ------------------------------------------------------------
  { id: 'H1', required: '1 HOME CONTEXT', what: 'creating a Home task files it under the first category instead of the Home context',
    file: `${M}mutations.ts`, from: "    title: draft.title.trim(),\n    categoryId: context.category.id,\n    scope: 'household',\n    commitment: draft.commitment,", to: "    title: draft.title.trim(),\n    categoryId: state.categories[0].id,\n    scope: 'household',\n    commitment: draft.commitment,", tests: MUT },
  { id: 'H2', required: '1 HOME CONTEXT', what: 'applying a pulled task drops its category (the association does not survive sync to a second device)',
    file: 'src/domain/sync/apply.ts', from: "categoryId: resolve(row.category_id as string) ?? str(row.category_id),\n          subjectMemberId: resolve(row.subject_member_id as string),\n          durationMinutes: num(row.duration_minutes),", to: "categoryId: state.categories[0].id,\n          subjectMemberId: resolve(row.subject_member_id as string),\n          durationMinutes: num(row.duration_minutes),", tests: [...CONTEXT, ...MUT] },
  { id: 'H3', required: '1 HOME CONTEXT', what: 'an edit moves the record to another category',
    file: `${M}mutations.ts`, from: "  let next = updateTask(state, ctx, task.id, {\n    title: edit.title.trim(),", to: "  let next = updateTask(state, ctx, task.id, {\n    categoryId: 'cat-kids',\n    title: edit.title.trim(),", tests: MUT },

  // ---- required 2: HOME NAME INDEPENDENCE -----------------------------------------------------------------------------------
  { id: 'H4', required: '2 NAME INDEPENDENCE', what: 'Home finds its area by the name "Home" instead of the system role',
    file: `${M}homeContext.ts`, from: 'const category = categoryWithRole(state, HOME_ROLE);', to: "const category = state.categories.find((c) => c.name === 'Home') ?? null;", tests: [...CONTEXT, ...VIEW] },
  { id: 'H5', required: '2 NAME INDEPENDENCE', what: 'a record is a Home record if its title mentions home (title parsing)',
    file: `${M}homeContext.ts`, from: 'return context.kind !== \'missing\' && record.categoryId === context.category.id;', to: "return context.kind !== 'missing' && (record.categoryId === context.category.id || (record as { title: string }).title.toLowerCase().includes('home'));", tests: [...CONTEXT, ...VIEW] },
  { id: 'H6', required: '2 LIFECYCLE', what: 'an archived Home area is treated as missing (records lose their association)',
    file: `${M}homeContext.ts`, from: "return category.status === 'active' ? { kind: 'active', category } : { kind: 'archived', category };", to: "return category.status === 'active' ? { kind: 'active', category } : { kind: 'missing' };", tests: [...CONTEXT, ...VIEW] },

  // ---- required 3: DURATION PROVENANCE ---------------------------------------------------------------------------------------
  // (An earlier form of H7 only forced `durationSource: 'user'` and SURVIVED: it was an EQUIVALENT mutant, because the shared addTask itself
  // ignores a supplied source when no number is given. This is the realistic defect: Home pre-fills the planning default and calls it hers.)
  { id: 'H7', required: '3 DURATION', what: 'Home pre-fills the planning default (15) and records it as user-provided at creation',
    file: `${M}mutations.ts`, from: "    ...(draft.durationMinutes === undefined ? {} : { durationMinutes: draft.durationMinutes, durationSource: 'user' as const }),", to: "    durationMinutes: draft.durationMinutes ?? 15,\n    durationSource: 'user' as const,", tests: MUT },
  { id: 'H8', required: '3 DURATION', what: 'an edit that never touched duration upgrades a default (or unknown) source to user-provided',
    file: `${M}mutations.ts`, from: "const durationPatch = edit.durationMinutes === undefined ? {} : { durationMinutes: edit.durationMinutes, durationSource: durationSourceForSave({ touched: true, existing: task }) };", to: "const durationPatch = { durationSource: 'user' as const, ...(edit.durationMinutes === undefined ? {} : { durationMinutes: edit.durationMinutes }) };", tests: MUT },
  { id: 'H9', required: '3 DURATION', what: 'the copy states a planning default as if she had said it',
    file: `${HOME}copy.ts`, from: "text: `About ${formatMinutes(minutes)} (planning estimate, not from you)`", to: "text: `${formatMinutes(minutes)}`", tests: COPY },

  // ---- required 4: DEPENDENCY --------------------------------------------------------------------------------------------------
  { id: 'H10', required: '4 DEPENDENCY', what: 'a REMOVED (archived) prerequisite reads as satisfied (the shared standing)',
    file: 'src/domain/structure.ts', from: "status === undefined ? MISSING : status === 'completed' ? SATISFIED : status === 'archived' ? RETIRED : PENDING;", to: "status === undefined ? MISSING : status === 'completed' ? SATISFIED : status === 'archived' ? SATISFIED : PENDING;", tests: VIEW },
  { id: 'H11', required: '4 DEPENDENCY', what: 'a MISSING prerequisite reads as satisfied (the shared standing)',
    file: 'src/domain/structure.ts', from: "status === undefined ? MISSING : status === 'completed' ? SATISFIED", to: "status === undefined ? SATISFIED : status === 'completed' ? SATISFIED", tests: VIEW },
  { id: 'H12', required: '4 DEPENDENCY', what: 'Home re-derives readiness itself and treats an unavailable prerequisite as ready',
    file: `${M}buildHomeView.ts`, from: 'return { readiness: readinessOf(state, ref), prerequisites };', to: "return { readiness: prerequisites.some((p) => p.standing === 'pending') ? 'blocked' : 'ready', prerequisites };", tests: VIEW },

  // ---- required 5: RESPONSIBILITY --------------------------------------------------------------------------------------------
  { id: 'H13', required: '5 RESPONSIBILITY', what: 'an accepted handoff is covered without her saying it no longer needs her',
    file: `${M}facts.ts`, from: "else if (live.state === 'accepted') coverage = shared === false ? 'covered' : 'accepted_needs_you';", to: "else if (live.state === 'accepted') coverage = 'covered';", tests: [...VIEW, ...COPY] },
  { id: 'H14', required: '5 RESPONSIBILITY', what: 'merely asking someone reads as covered',
    file: `${M}facts.ts`, from: "if (live.state === 'requested') coverage = isUnacknowledged(live, nowMs) ? 'no_answer' : 'asked';", to: "if (live.state === 'requested') coverage = 'covered';", tests: [...VIEW, ...COPY] },
  { id: 'H15', required: '5 RESPONSIBILITY', what: '"they said yes" relies on the domain default and so reads as "no longer needs her"',
    file: `${M}mutations.ts`, from: 'return done(accept(state, ctx, input.responsibilityId, input.stillNeedsMe));', to: 'return done(accept(state, ctx, input.responsibilityId));', tests: MUT },
  { id: 'H16', required: '5 RESPONSIBILITY', what: 'asking someone records that it no longer needs her',
    file: `${M}mutations.ts`, from: 'ackWithinMinutes: input.ackWithinMinutes ?? null, stillNeedsMe: true }', to: 'ackWithinMinutes: input.ackWithinMinutes ?? null, stillNeedsMe: false }', tests: MUT },
  { id: 'H17', required: '5 RESPONSIBILITY', what: 'Home starts invoking completeResponsibility',
    file: `${M}mutations.ts`, from: "import { accept, acknowledge, decline, delegate, liveResponsibilityFor, returnToSelf } from '../../../domain/responsibility';", to: "import { accept, acknowledge, completeResponsibility, decline, delegate, liveResponsibilityFor, returnToSelf } from '../../../domain/responsibility';", tests: MUT },

  // ---- required 6: COMPLETION TRUTH ------------------------------------------------------------------------------------------
  { id: 'H18', required: '6 COMPLETION TRUTH', what: 'a completed task no longer carries "condition not verified"',
    file: `${M}buildHomeView.ts`, from: "if (!open) unknownFacts.push('condition_not_verified');", to: 'void 0;', tests: [...VIEW, ...COPY] },
  { id: 'H19', required: '6 COMPLETION TRUTH', what: 'the "not verified" statement is replaced by "Fixed and verified"',
    file: `${HOME}copy.ts`, from: "text: 'Her Keys doesn’t check that the problem is actually fixed'", to: "text: 'Fixed and verified'", tests: COPY },
  { id: 'H20', required: '6 COMPLETION TRUTH', what: 'Last Done is worded as "Fixed <date>" instead of "Marked done <date>"',
    file: `${HOME}copy.ts`, from: 'text: `Marked done ${formatDate(item.lastDone.date)}`', to: 'text: `Fixed ${formatDate(item.lastDone.date)}`', tests: COPY },
  { id: 'H21', required: '6 COMPLETION TRUTH', what: 'an empty Home says everything at home is handled',
    file: `${HOME}copy.ts`, from: 'An empty list doesn’t mean nothing at home needs attention.', to: 'Everything at home is handled.', tests: COPY },

  // ---- required 7: RECURRENCE --------------------------------------------------------------------------------------------------
  { id: 'H22', required: '7 RECURRENCE', what: 'creating a recurrence rule also completes the task (a definition becomes a completed occurrence)',
    file: `${M}mutations.ts`, from: "return repeating === created ? refuse(state, 'refused') : done(repeating);", to: "return repeating === created ? refuse(state, 'refused') : done(completeTask(repeating, ctx, task.id));", tests: [...MUT, ...VIEW] },

  // ---- required 8: LAST DONE ---------------------------------------------------------------------------------------------------
  { id: 'H23', required: '8 LAST DONE', what: 'Last Done reads the row\'s updatedAt (an edit timestamp) as completion evidence',
    file: `${M}buildHomeView.ts`, from: "taskCompletedAt: task.status === 'completed' ? task.completedAt : null", to: "taskCompletedAt: task.status === 'completed' ? task.updatedAt : null", tests: [...VIEW, ...MUT] },
  { id: 'H24', required: '8 LAST DONE', what: 'a repeat rule with no completion is given a Last Done from its anchor date',
    file: `${M}buildHomeView.ts`, from: "const lastDone = lastDoneOf({ kind: 'task', completions: index.completions.get(key) ?? [], taskCompletedAt: task.status === 'completed' ? task.completedAt : null, timeZone });", to: "const lastDone = lastDoneOf({ kind: 'task', completions: index.completions.get(key) ?? [], taskCompletedAt: task.status === 'completed' ? task.completedAt : null, timeZone }) ?? (recurrence.rule ? { date: recurrence.rule.anchorDate, at: `${recurrence.rule.anchorDate}T12:00:00.000Z`, evidence: 'completion_observation' as const } : null);", tests: VIEW },

  // ---- required 9: SYNC COMPOSITION --------------------------------------------------------------------------------------------
  { id: 'H25', required: '9 SYNC COMPOSITION', what: 'the production composition stops telling the sync runtime about account state (a bound account never syncs)',
    file: 'src/store/composeAccountApp.ts', from: 'syncRuntime.onAccountState(state);', to: '/* disconnected */', tests: [...CONTEXT, ...MUT] },

  // ---- required 10: LOADING VS EMPTY -------------------------------------------------------------------------------------------
  { id: 'H26', required: '10 LOADING VS EMPTY', what: 'hydration in progress renders as an empty Home',
    file: `${M}readiness.ts`, from: "if (!readiness.settled || view === null) return { kind: 'loading' };", to: "if (view === null) return { kind: 'loading' };", tests: [...VIEW, ...READY] },
  { id: 'H27', required: '10 UNRECOVERED VS EMPTY', what: 'a recovered (started-over) household renders as an ordinary empty Home',
    file: `${M}readiness.ts`, from: "if (readiness.recovery !== null) return { kind: 'unrecovered_empty', reason: readiness.recovery.reason, quarantined: readiness.recovery.quarantined };", to: 'void 0;', tests: READY },
  { id: 'H28', required: '10 UNRECOVERED VS EMPTY', what: 'the recovery is never surfaced from the store snapshot',
    file: `${M}readiness.ts`, from: 'recovery: settled && snapshot.recovery !== null ? { reason: snapshot.recovery.reason, quarantined: snapshot.recovery.quarantined } : null,', to: 'recovery: null,', tests: READY },

  // ---- Home-specific safeguards ------------------------------------------------------------------------------------------------
  { id: 'H29', required: 'stale editor', what: 'a stale edit is applied instead of refused',
    file: `${M}mutations.ts`, from: "if (taskFingerprint(task) !== edit.basedOn.fingerprint) return refuse(state, 'stale');", to: 'void 0;', tests: MUT },
  { id: 'H30', required: 'stale editor', what: 'staleness is judged by timestamp only, so a same-instant change is missed',
    file: `${M}mutations.ts`, from: 'JSON.stringify([task.title, task.dueDate, task.plan, task.durationMinutes, task.durationSource, task.commitment, task.notes, task.status, task.updatedAt])', to: 'JSON.stringify([task.updatedAt])', tests: MUT },
  { id: 'H31', required: 'double save', what: 'a second Save after success runs again (a second task is created)',
    file: `${M}mutations.ts`, from: 'if (saved !== null) return Promise.resolve(saved);', to: 'void 0;', tests: MUT },
  { id: 'H32', required: 'double save', what: 'two concurrent Saves both run',
    file: `${M}mutations.ts`, from: 'if (running !== null) return running;', to: 'void 0;', tests: MUT },
  { id: 'H33', required: 'context guard', what: 'marking done is allowed on a record outside Home',
    file: `${M}mutations.ts`, from: "if (!isHomeRecord(homeContextOf(state), task)) return refuse(state, 'not_a_home_record');\n  if (task.status !== 'open') return refuse(state, 'wrong_state');\n  return done(completeTask(", to: "if (task.status !== 'open') return refuse(state, 'wrong_state');\n  return done(completeTask(", tests: MUT },
  { id: 'H34', required: 'removed != completed', what: 'a removed (set aside) task is listed as marked done',
    file: `${M}buildHomeView.ts`, from: "if (task.status === 'archived') continue; // set aside is not completed, and it is not something she still has to carry", to: 'void 0;', tests: [...VIEW, ...MUT] },
  { id: 'H35', required: 'visit truth', what: 'a past visit no longer says its outcome is unknown',
    file: `${M}buildHomeView.ts`, from: "if (over) unknownFacts.push('visit_outcome_unknown');", to: 'void 0;', tests: [...VIEW, ...COPY] },
  { id: 'H36', required: 'due again', what: '"It\'s due again" carries the old due date over (a stale date reads as overdue)',
    file: `${M}mutations.ts`, from: "completedAt: null, dueDate: null, plan: { kind: 'unplanned' }, updatedAt", to: 'completedAt: null, dueDate: row.dueDate, plan: row.plan, updatedAt', tests: MUT },
  { id: 'H37', required: 'progressive disclosure', what: 'a section silently keeps only its first 50 rows (tasks become unreachable)',
    file: `${M}buildHomeView.ts`, from: 'const ids = (list: HomeItem[]) => list.map((item) => item.homeItemId);', to: 'const ids = (list: HomeItem[]) => list.slice(0, 50).map((item) => item.homeItemId);', tests: [...MUT, ...PERF] },
  { id: 'H38', required: 'time of day', what: 'a visit that ended earlier today jumps into "Past visits" as the hours pass (membership depends on the clock)',
    file: `${M}buildHomeView.ts`, from: "item.timing.some((fact) => fact.kind === 'visit' && fact.when === 'past'));", to: "item.resolutionState === 'past_visit');", tests: VIEW },
  { id: 'H39', required: 'shared attention', what: 'Home drops the shared "no answer" attention reason',
    file: `${M}buildHomeView.ts`, from: 'push(byItem, key, { reason: item.reason, urgency: item.urgency });', to: "if (item.reason !== 'unacknowledged_delegation') push(byItem, key, { reason: item.reason, urgency: item.urgency });", tests: VIEW },

  // ---- forms and screens (added with HM4/HM5) -------------------------------------------------------------------------------------
  { id: 'H40', required: 'form: duration truth', what: 'the task form sends a prefilled duration she never touched (an edit upgrades a default to hers)',
    file: `${M}forms.ts`, from: "if (values.durationTouched && typed !== '') {", to: "if (typed !== '') {", tests: FORMS },
  { id: 'H41', required: 'form: locked repeat', what: 'the task form overwrites a repeat Home cannot express',
    file: `${M}forms.ts`, from: "repeat: values.repeatLocked || !values.repeatTouched ? 'unchanged' : repeat };", to: "repeat: !values.repeatTouched ? 'unchanged' : repeat };", tests: FORMS },
  { id: 'H42', required: 'completion truth', what: 'a task she marked done is offered "Mark done" again instead of only "It\'s due again"',
    file: `${M}buildHomeView.ts`, from: "if (task.status === 'completed') return ['due_again', 'edit'];", to: "if (task.status === 'completed') return ['mark_done', 'due_again', 'edit'];", tests: [...VIEW, ...UI] },
  { id: 'H43', required: 'accessibility', what: 'the spoken label keeps the visual dash ("Asked Sam , no answer yet")',
    file: `${HOME}copy.ts`, from: "    .replace(/\\s[—–]\\s/g, ', ');", to: ';', tests: COPY },
  { id: 'H44', required: 'progressive disclosure', what: 'a section can never be expanded past its first 5 rows (tasks become unreachable)',
    file: `${HOME}ui/HomeSectionBlock.tsx`, from: 'const shown = expanded ? rows : rows.slice(0, SECTION_LIMIT);', to: 'const shown = rows.slice(0, SECTION_LIMIT);', tests: UI },
  { id: 'H45', required: 'archived context', what: 'creation controls are shown while the Home area is archived',
    file: `${HOME}ui/HomeScreenView.tsx`, from: '{view.canCreate && (', to: '{(view.canCreate || true) && (', tests: UI },
  { id: 'H46', required: 'unrecovered vs empty', what: 'the screen shows the recovery notice only when there is no content (a recovered household with a task hides it)',
    file: `${HOME}ui/HomeScreenView.tsx`, from: '{unrecovered !== null && <InlineNotice', to: "{unrecovered !== null && screen.kind !== 'content' && <InlineNotice", tests: [...UI, ...READY] },
  { id: 'H47', required: 'responsibility', what: 'the detail screen records "They said yes" without asking whether it still needs her (defaults to no longer needs)',
    file: `${HOME}ui/HomeItemDetailView.tsx`, from: 'const [needsMe, setNeedsMe] = useState(true);', to: 'const [needsMe, setNeedsMe] = useState(false);', tests: UI },
];

function runTests(files) {
  try {
    const out = execFileSync('node', ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', ...files], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    return { fail: Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? NaN), pass: Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? 0) };
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
    console.log(rows[rows.length - 1]);
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
  rows.push(`${mutant.id.padEnd(4)} ${caught ? 'CAUGHT    ' : 'SURVIVED  '} (${String(result.fail).padStart(2)} failing)  ${mutant.required.padEnd(24)} ${mutant.what}${restored ? '' : '   !! FILE NOT RESTORED'}`);
  console.log(rows[rows.length - 1]);
}

if (process.env.DRY) {
  console.log(`\ndry run: ${broken === 0 ? 'every mutation applies exactly once' : `${broken} mutation(s) did not apply`}`);
  process.exit(broken === 0 ? 0 : 1);
}
console.log(`\n${MUTANTS.filter((m) => !only || m.id === only).length - survivors - broken} caught, ${survivors} survived, ${broken} broken`);
process.exit(survivors + broken === 0 ? 0 : 1);
