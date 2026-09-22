// HK-FEATURE-07 - test-the-test. Run from the repository root:  node scripts-dev/f07-mutation-check.cjs   (DRY=1 to only check applicability)
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
const T = 'tests/coparent/';
const F = 'src/features/coparent/';
const t = (...names) => names.map((n) => `${T}${n}.test.mjs`);
const CORE = t('core', 'identity', 'responsibility');
const ALL_DOMAIN = t('core', 'identity', 'responsibility', 'preparation', 'schedule', 'money', 'sharing', 'state', 'editing', 'copyTruth');

const MUTANTS = [
  // ---- 1. CHILD IDENTITY -----------------------------------------------------------------------------------------------------
  { id: 'M1', guards: 'child identity', what: 'a handoff\'s child is looked up by position (the first child), not by id',
    file: `${F}identity.ts`, from: 'state.children.find((candidate) => candidate.id === subjectMemberId);', to: 'state.children[0];', tests: t('core', 'identity') },
  { id: 'M2', guards: 'child identity', what: 'creating a handoff drops the child (subjectMemberId is never written)',
    file: `${F}mutations.ts`, from: '    subjectMemberId: fields.childId,\n    startsAt: value.startsAt,', to: '    subjectMemberId: null,\n    startsAt: value.startsAt,', tests: t('core', 'identity', 'editing') },
  { id: 'M3', guards: 'child identity', what: 'an edit drops the child when the form is saved',
    file: `${F}mutations.ts`, from: '  if (fields.childId !== event.subjectMemberId) patch.subjectMemberId = fields.childId;', to: '  if (fields.childId !== event.subjectMemberId) patch.subjectMemberId = null;', tests: t('editing') },

  // ---- 2. COUNTERPART IDENTITY -----------------------------------------------------------------------------------------------
  { id: 'M4', guards: 'counterpart identity', what: 'a person is found by DISPLAY NAME, so two people named Alex collapse into the first',
    file: `${F}identity.ts`, from: '  const person = state.people.find((candidate) => candidate.id === personId);', to: '  const person = state.people.find((candidate) => candidate.displayName === state.people.find((p) => p.id === personId)?.displayName);', tests: t('identity') },
  { id: 'M5', guards: 'counterpart identity', what: 'same-name people share one label (the picker cannot tell them apart)',
    file: `${F}identity.ts`, from: '    if (group.length === 1) {', to: '    if (group.length >= 1) {', tests: t('identity') },

  // ---- 3. RESPONSIBILITY -----------------------------------------------------------------------------------------------------
  { id: 'M6', guards: 'assigned != covered', what: 'a merely requested (assigned) counterpart counts as covering the handoff',
    file: `${F}projection.ts`, from: "  else if (stage === 'accepted' && r.stillNeedsMe === false) coverage = 'covered';", to: "  else if (stage === 'accepted' || stage === 'requested') coverage = 'covered';", tests: CORE },
  { id: 'M7', guards: 'accepted != covered', what: 'an acceptance alone (still needs her) counts as covered',
    file: `${F}projection.ts`, from: "  else if (stage === 'accepted' && r.stillNeedsMe === false) coverage = 'covered';", to: "  else if (stage === 'accepted') coverage = 'covered';", tests: CORE },
  { id: 'M8', guards: 'assigned != requested', what: 'an `owned` person row (no request recorded) is worded as a request',
    file: `${F}projection.ts`, from: "      return r.responsibleKind === 'self' ? 'with_you' : 'assigned';", to: "      return r.responsibleKind === 'self' ? 'with_you' : 'requested';", tests: t('responsibility') },

  // ---- 4. AGREEMENT TRUTH ----------------------------------------------------------------------------------------------------
  { id: 'M9', guards: 'planned != agreed', what: 'a recorded request is worded "agreed to this"',
    file: `${F}copy.ts`, from: '`You recorded a request to ${name} on ${date}. No answer is recorded.`', to: '`${name} agreed to this on ${date}.`', tests: t('responsibility', 'copyTruth') },
  { id: 'M10', guards: 'planned != agreed', what: 'the repeat line says the other party agreed',
    file: `${F}copy.ts`, from: '`Repeats ${phrase}. This is the pattern you recorded.`', to: '`Repeats ${phrase}. Agreed by both parents.`', tests: t('schedule', 'copyTruth') },

  // ---- 5. LEGAL TRUTH --------------------------------------------------------------------------------------------------------
  { id: 'M11', guards: 'schedule != legal', what: 'an operational recurrence is worded as a custody schedule',
    file: `${F}copy.ts`, from: '`Repeats ${phrase}. This is the pattern you recorded.`', to: '`Custody schedule: ${phrase}.`', tests: t('schedule', 'copyTruth') },
  { id: 'M12', guards: 'complete != compliance', what: 'a recorded-complete responsibility is worded as compliance',
    file: `${F}copy.ts`, from: "    completed: (name: string) => `You recorded ${name}'s part as complete.`,", to: "    completed: (name: string) => `${name} complied with the parenting order.`,", tests: t('responsibility', 'copyTruth') },

  // ---- 6. PACKING TRUTH ------------------------------------------------------------------------------------------------------
  { id: 'M13', guards: 'packed != received', what: 'a completed preparation item is worded as delivered to the other household',
    file: `${F}copy.ts`, from: "      done: 'Marked done',", to: "      done: 'Delivered to the other household',", tests: t('preparation', 'copyTruth') },
  { id: 'M14', guards: 'removed != packed', what: 'a REMOVED preparation item reads as done',
    file: `${F}projection.ts`, from: "  return standing.cause === 'retired' ? 'removed' : 'missing';", to: "  return standing.cause === 'retired' ? 'done' : 'missing';", tests: t('preparation') },
  { id: 'M15', guards: 'no packing != ready', what: 'an empty preparation list reads as "all marked done"',
    file: `${F}projection.ts`, from: "    items.length === 0 ? 'no_prep_recorded' : open > 0", to: "    items.length === 0 ? 'all_marked_done' : open > 0", tests: t('core', 'preparation') },

  // ---- 7. REIMBURSEMENT TRUTH ------------------------------------------------------------------------------------------------
  { id: 'M16', guards: 'follow-up done != payment', what: 'a completed follow-up task is worded as payment received',
    file: `${F}copy.ts`, from: "    done: 'Marked done. Her Keys has no record of a payment.',", to: "    done: 'Payment received.',", tests: t('money', 'copyTruth') },
  { id: 'M17', guards: 'follow-up done != payment', what: 'completing the follow-up task makes the payment evidence "reported paid"',
    file: `${F}projection.ts`, from: "    paymentEvidence: ctx.evidence.serviceReportedPayment(ref) ? 'service_reported_paid' : 'none',", to: "    paymentEvidence: task.status === 'completed' ? 'service_reported_paid' : 'none',", tests: t('money') },
  { id: 'M18', guards: 'amount entered != agreed', what: 'a zero amount is accepted as a follow-up about money',
    file: `${F}mutations.ts`, from: '  if (money === null || money.amountMinor <= 0) return', to: '  if (money === null) return', tests: t('money') },
  { id: 'M19', guards: 'no direction != default', what: 'the money direction is defaulted when she did not choose one',
    file: `${F}mutations.ts`, from: "  if (fields.direction === null) return { ok: false, outcome: 'invalid_direction' };", to: "  if (fields.direction === null) fields = { ...fields, direction: 'inflow' };", tests: t('money') },

  // ---- 8. COUNTERPART INVALIDATION -------------------------------------------------------------------------------------------
  { id: 'M20', guards: 'invalidated counterpart', what: 'an archived counterpart keeps the positive coverage it had',
    file: `${F}projection.ts`, from: '  else if (holderUnavailable && POSITIVE_STAGES.has(stage)) coverage', to: '  else if (false && holderUnavailable && POSITIVE_STAGES.has(stage)) coverage', tests: CORE },
  { id: 'M42', guards: 'invalidated counterpart', what: 'the stale "no longer needs you" of an archived counterpart still reads as not needing her',
    file: `${F}projection.ts`, from: "  const needsMe = responsibility.coverage === 'needs_review' ? true : needsMePersonally(ctx.state, ref, ctx.nowMs);", to: '  const needsMe = needsMePersonally(ctx.state, ref, ctx.nowMs);', tests: t('responsibility', 'scenarioMap') },
  { id: 'M21', guards: 'invalidated counterpart', what: 'a positive answer can be recorded for an archived person',
    file: `${F}mutations.ts`, from: "    if (r.responsibleKind !== 'person' || !person || person.status !== 'active') return refuse(state, 'counterpart_unavailable');", to: '    void person;', tests: t('responsibility') },

  // ---- 9. SHARING TRUTH ------------------------------------------------------------------------------------------------------
  { id: 'M22', guards: 'scope label != sharing', what: 'the privacy line claims the record is shared with the other parent',
    file: `${F}copy.ts`, from: "    ownerOnly: 'Only your account can open this in Her Keys.',", to: "    ownerOnly: 'Shared with the other parent.',", tests: t('sharing', 'copyTruth') },
  { id: 'M23', guards: 'scope label != sharing', what: 'Feature 07 files its rows household-visible instead of owner-only',
    file: `${F}mutations.ts`, from: '    // The most private scope there is. It is NOT sharing: `coparent-shared` is enforced owner-only.\n    scope: \'coparent-shared\',', to: "    scope: 'household',", tests: t('sharing') },
  { id: 'M24', guards: 'scope label != sharing', what: 'the presenter says nothing-about-visibility rows are owner-only too',
    file: `${F}projection.ts`, from: '    ownerOnly: isOwnerOnlyScope(event.scope),', to: '    ownerOnly: true,', tests: t('sharing') },

  // ---- 10. SYNC COMPOSITION --------------------------------------------------------------------------------------------------
  { id: 'M25', guards: 'production composition', what: 'composeAccountApp stops telling the sync runtime about account state (a bound account never starts sync)',
    file: 'src/store/composeAccountApp.ts', from: 'syncRuntime.onAccountState(state);', to: '/* disconnected */', tests: t('syncComposition') },
  { id: 'M26', guards: 'production composition', what: 'the change observer stops queueing (a canonical mutation never becomes sync intent)',
    file: 'src/domain/sync/changeObserver.ts', from: '      const intents = changedRows(previous, next, namespace);', to: '      const intents: ReturnType<typeof changedRows> = [];', tests: t('syncComposition') },
  { id: 'M27', guards: 'child name across the boundary', what: 'the claim mangles a child\'s name again (the /s+/ defect)',
    file: 'src/domain/account/claim.ts', from: ".replace(/\\s+/g, ' ')", to: ".replace(/s+/g, ' ')", tests: ['tests/claimDisplayName.test.mjs'] },

  // ---- 11. LOADING vs EMPTY --------------------------------------------------------------------------------------------------
  { id: 'M28', guards: 'loading != empty', what: 'the screen is allowed to render (and so to say "nothing recorded") while hydration is incomplete',
    file: `${F}availability.ts`, from: "  if (snapshot.status === 'unhydrated' || snapshot.status === 'hydrating' || snapshot.state === null) return { kind: 'loading' };", to: "  if (snapshot.state === null) return { kind: 'loading' };\n  if (snapshot.status === 'unhydrated' || snapshot.status === 'hydrating') return { kind: 'ready' };", tests: t('state') },
  { id: 'M29', guards: 'unrecovered != empty', what: 'a household that could not be read is treated as ready (and would render empty)',
    file: `${F}availability.ts`, from: '  if (snapshot.recovery !== null) return', to: '  if (false) return', tests: t('state') },

  // ---- hardening -------------------------------------------------------------------------------------------------------------
  { id: 'M30', guards: 'stale editor', what: 'an editor opened on an old row overwrites newer content',
    file: `${F}mutations.ts`, from: "  if (handoffRevision(state, event) !== input.baseUpdatedAt) return refuse(state, 'stale');", to: '  void input.baseUpdatedAt;', tests: t('editing') },
  { id: 'M31', guards: 'stale editor', what: 'staleness is decided by updatedAt alone (blind to two edits in one clock tick)',
    file: `${F}mutations.ts`, from: '  return `${event.updatedAt ?? \'\'}#${digest(content)}`;', to: '  return `${event.updatedAt ?? \'\'}#0`;', tests: t('editing') },
  { id: 'M32', guards: 'recurrence edit', what: 'saving an unrelated field re-anchors the recorded schedule',
    file: `${F}mutations.ts`, from: '  const scheduleTouched = fields.repeat !== repeatChoiceOf(rule) || value.startsAt !== event.startsAt;', to: '  const scheduleTouched = true;', tests: t('schedule') },
  { id: 'M33', guards: 'location privacy', what: 'the hub view carries the exact location text',
    file: `${F}projection.ts`, from: "    hasLocation: event.location !== null && event.location.trim() !== '',", to: "    hasLocation: event.location !== null && event.location.trim() !== '',\n    locationText: event.location,", tests: t('core', 'copyTruth') },
  { id: 'M34', guards: 'household zone', what: 'a handoff is placed in the DEVICE zone instead of the household zone',
    file: `${F}projection.ts`, from: '    zone: state.user.timezone,\n    labels:', to: '    zone: clock.deviceTimeZone ?? state.user.timezone,\n    labels:', tests: t('schedule') },
  { id: 'M35', guards: 'household isolation', what: 'a view for the wrong household is built anyway',
    file: `${F}projection.ts`, from: "  if (householdId !== state.household.id) return emptyView(state, householdId, clock, 'household_mismatch');\n\n  const ctx = contextFor(state, clock);\n  const categoryId", to: '  const ctx = contextFor(state, clock);\n  const categoryId', tests: t('state') },
  { id: 'M36', guards: 'answer overdue', what: 'an unanswered request never becomes an overdue fact',
    file: `${F}projection.ts`, from: '    answerOverdue: live !== null && isUnacknowledged(live, ctx.nowMs),', to: '    answerOverdue: false,', tests: t('responsibility') },
  { id: 'M37', guards: 'one live owner', what: 'a second recorded counterpart is not refused as already recorded',
    file: `${F}mutations.ts`, from: "  if (liveResponsibilityFor(state, ref) !== null) return refuse(state, 'already_recorded');", to: '  void liveResponsibilityFor;', tests: t('responsibility') },
  { id: 'M38', guards: 'next handoff', what: 'the next handoff skips a handoff that needs review (hides the actual next one)',
    file: `${F}projection.ts`, from: '  const nextTransition = transitions[0] ?? null;', to: '  const nextTransition = transitions.find((view) => view.review.length === 0) ?? null;', tests: t('core', 'identity', 'state') },
  { id: 'M39', guards: 'ordering', what: 'time ties are ordered by array position (no id tie-break)',
    file: `${F}projection.ts`, from: 'a.startsAtMs - b.startsAtMs || a.id.localeCompare(b.id);', to: 'a.startsAtMs - b.startsAtMs;', tests: t('state') },
  { id: 'M40', guards: 'recently completed', what: 'a REMOVED preparation item is listed as recently completed',
    file: `${F}projection.ts`, from: "    } else if (item.standing === 'done' && task.completedAt !== null && epochMsOf(task.completedAt) >= windowStart) {", to: "    } else if ((item.standing === 'done' || item.standing === 'removed') && epochMsOf(task.updatedAt ?? task.createdAt ?? '1970-01-01T00:00:00.000Z') >= windowStart) {", tests: t('preparation') },
  { id: 'M41', guards: 'no invented link', what: 'a preparation task is linked to the next handoff for the same child without an edge',
    file: `${F}projection.ts`, from: '    const link = linkable[0] ?? null;', to: '    const link = linkable[0] ?? (activeEvents.find((e) => e.subjectMemberId === task.subjectMemberId) ? { edge: null, event: activeEvents.find((e) => e.subjectMemberId === task.subjectMemberId) } : null);', tests: t('preparation') },
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
  rows.push(`${mutant.id.padEnd(4)} ${caught ? 'CAUGHT    ' : 'SURVIVED  '} (${String(result.fail).padStart(2)} failing)  ${mutant.guards.padEnd(28)} ${mutant.what}${restored ? '' : '   !! FILE NOT RESTORED'}`);
  console.log(rows[rows.length - 1]);
}

if (process.env.DRY) {
  console.log(`\ndry run: ${broken === 0 ? 'every mutation applies exactly once' : `${broken} mutation(s) did not apply`}`);
  process.exit(broken === 0 ? 0 : 1);
}
console.log(`\n${MUTANTS.filter((m) => !only || m.id === only).length - survivors - broken} caught, ${survivors} survived, ${broken} broken`);
process.exit(survivors + broken === 0 ? 0 : 1);
void ALL_DOMAIN;
