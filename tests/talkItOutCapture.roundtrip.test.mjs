/**
 * HK-IR01-F02 / D - THE STRUCTURED RECORDS FEATURE 02 DRIVES MUST SURVIVE THE ACCOUNT BOUNDARY, STATE FOR STATE.
 *
 * Feature 02 is a client of `src/domain/interpretations.ts`. What makes a capture durable is not her wording (session-only) but
 * the typed record: a source artifact, the readings made of it, the chain of corrections, the open question a reading is
 * waiting on, and what she decided. This proves every state F02 can leave a reading in goes device A -> cloud -> device B
 * through the production composition and the sync projection, and arrives as the SAME thing:
 *
 *   pending, clarifying (a durable open code), superseded (a chain of corrections), accepted (and the row it became),
 *   rejected, dismissed, and a source that was retracted.
 *
 * The fake cloud does not enforce the server's `freeze_decided_interpretation` trigger, so it is stood in for here (a hook that
 * refuses, and records, any attempt to edit an interpretation the cloud already holds as decided): the real client sequence must
 * never trip it. The real trigger is proved on PostgreSQL by supabase/tests, which this branch does not touch.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { UNDECIDED_READING_TITLE, titleForCloud } from '../src/domain/foundation/interpretation.ts';
import { OPEN_CODE_PATTERN } from '../src/domain/schemaPrimitives.ts';
import { validateAppState } from '../src/domain/state.ts';
import { MAX_CLARIFICATION_STEPS, formatClarificationCode, parseClarificationCode } from '../src/features/talk-it-out/capture/clarificationCodes.ts';
import { copy } from '../src/features/talk-it-out/capture/copy.ts';
import { buildCaptureVM, capturePhaseOf, leafReadings } from '../src/features/talk-it-out/capture/viewModel.ts';
import {
  ACCOUNT_A,
  NOW,
  accountCloudFor,
  bindAsNewDevice,
  createFakeCloud,
  makeCaptureDevice,
  tapCloud,
} from './support/captureAccountWorld.mjs';

const keyOf = (n) => `s${NOW.toString(36)}-${n}`;
const DECIDED = new Set(['accepted', 'rejected', 'superseded']);
const areaId = (device, role) => device.state().categories.find((c) => c.systemRole === role && c.status === 'active').id;

/**
 * Device A: bound, then a household of captures left in every state Feature 02 can leave one in.
 * Returns the world and the ids that matter.
 */
async function populatedWorld({ settleEach = true } = {}) {
  const cloud = createFakeCloud();
  const tap = tapCloud(cloud);
  const accountCloud = accountCloudFor(cloud, ACCOUNT_A);
  const a = await makeCaptureDevice({ cloud, tap, accountCloud });
  assert.equal((await a.signIn()).kind, 'accountBound');

  // The cloud's own rule, stood in for: a decided interpretation is history. Record any attempt to edit one.
  const violations = [];
  cloud.hooks.duringUpdate = async (table, cloudId, patch) => {
    if (table !== 'interpretations') return;
    const held = [...cloud.rows.values()].find((r) => r._table === 'interpretations' && r.id === cloudId);
    if (held && DECIDED.has(held.state)) violations.push({ cloudId, was: held.state, patch: Object.keys(patch) });
  };

  // `settleEach`: a device that syncs between her actions sends a reading as pending and LATER edits it (create, then update);
  // one that was offline sends the finished chain in one go (each row created already decided). Both must arrive the same.
  const cap = async (text, n) => {
    const out = await a.coordinator.submit({ text, submissionKey: keyOf(n) });
    if (settleEach) await a.settle();
    return out;
  };
  const step = async (promise) => {
    const out = await promise;
    if (settleEach) await a.settle();
    return out;
  };
  const ids = {};

  // 1. clarifying: an open question, left open. A durable code, never her words.
  ids.practice = (await cap('Practice at 5 tomorrow', 0)).captureId;

  // 2. superseded twice, still pending: v1 -> v2 (she changed the title) -> v3 (she changed the day)
  const water = await cap('Pay the water bill by Friday.', 1);
  ids.water = water.captureId;
  const waterV2 = await step(a.coordinator.correct(water.readingIds[0], { kind: 'patch', patch: { title: 'Pay the water and sewer bill' } }));
  const waterV3 = await step(a.coordinator.correct(waterV2.readingId, { kind: 'patch', patch: { date: '2026-09-26' } }));
  assert.deepEqual([waterV2.kind, waterV3.kind], ['revised', 'revised']);
  ids.waterLeaf = waterV3.readingId;

  // 3. accepted straight away: a task carrying a duration the reader found
  const card = await cap('Renew the library card by Friday for 45 minutes.', 2);
  ids.card = card.captureId;
  assert.equal((await step(a.coordinator.accept(card.readingIds[0], { categoryId: areaId(a, 'home') }))).kind, 'accepted');

  // 4. corrected, THEN accepted: v1 superseded, v2 accepted, an event
  const dentist = await cap('Dentist Friday at 3pm.', 3);
  ids.dentist = dentist.captureId;
  const dentistV2 = await step(a.coordinator.correct(dentist.readingIds[0], { kind: 'patch', patch: { timeMinutes: 16 * 60 } }));
  assert.equal((await step(a.coordinator.accept(dentistV2.readingId))).kind, 'accepted');

  // 5. rejected: a note she said was not it
  const moved = await cap('Practice moved to 6', 4);
  ids.moved = moved.captureId;
  assert.equal((await step(a.coordinator.reject(moved.readingIds[0]))).kind, 'rejected');

  // 6. dismissed: a capture with an open reading, put away whole
  const bill = await cap('Pay the electric bill by Friday.', 5);
  ids.bill = bill.captureId;
  assert.equal((await step(a.coordinator.dismissCapture(bill.captureId))).kind, 'dismissed');

  // 7. a child-scoped chain: the question, her answer naming Ayden, a pending reading that now names a child
  const pickup = await cap('Pick him up from practice at 5pm', 6);
  ids.pickup = pickup.captureId;
  const answered = await step(a.coordinator.answerClarification(pickup.readingIds[0], { kind: 'option', option: { kind: 'child', memberId: 'kid-ayden' } }));
  assert.equal(answered.kind, 'revised');

  // 8. a source that produced no reading, withdrawn: retracted, never deleted
  const nothing = await cap('asdf qwerty', 7);
  ids.nothing = nothing.captureId;
  assert.equal((await step(a.coordinator.dismissCapture(nothing.captureId))).retracted, true);

  await a.settle();
  assert.equal(a.queue().length, 0, 'everything left the device');
  return { cloud, tap, accountCloud, a, ids, violations };
}

/** A fresh install of the same account, hydrated by its first pull. It starts with no household at all. */
async function secondDevice({ cloud, accountCloud }) {
  const b = await makeCaptureDevice({ cloud, tap: tapCloud(cloud), accountId: ACCOUNT_A, accountCloud, kids: [] });
  await bindAsNewDevice(b, accountCloud);
  const resumed = await b.signIn();
  assert.equal(resumed.kind, 'accountBound');
  return b;
}

/**
 * A reading described by what it MEANS, with every reference followed to what it points at, so two devices can be compared even
 * if their local ids differ. Nothing here reads an id as a value.
 */
function meaningOf(state, reading, asCloud = false) {
  // OD-A: the title an undecided reading shows the cloud is a neutral label, so device B never holds the title device A derived from her words.
  const titleOf = (r) => (asCloud ? titleForCloud(r) : r.title);
  const artifact = state.sourceArtifacts.find((s) => s.id === reading.artifactId);
  const before = reading.supersedesId === null ? null : state.interpretations.find((r) => r.id === reading.supersedesId);
  const target = reading.acceptedRef === null ? null : (state[reading.acceptedRef.kind === 'needsMe' ? 'needsMe' : `${reading.acceptedRef.kind}s`] ?? []).find((row) => row.id === reading.acceptedRef.id);
  return {
    source: artifact?.contentRef ?? `UNRESOLVED:${reading.artifactId}`,
    version: reading.interpretationVersion,
    state: reading.state,
    kind: reading.proposedKind,
    title: titleOf(reading),
    dueDate: reading.dueDate,
    startsAt: reading.startsAt,
    endsAt: reading.endsAt,
    durationMinutes: reading.durationMinutes,
    value: reading.value,
    categoryHint: reading.categoryHint,
    subject: reading.subjectMemberId === null ? null : (state.children.find((c) => c.id === reading.subjectMemberId)?.displayName ?? `UNRESOLVED:${reading.subjectMemberId}`),
    clarification: reading.clarification,
    supersedes: reading.supersedesId === null ? null : before === undefined ? `UNRESOLVED:${reading.supersedesId}` : `${titleOf(before)}@v${before.interpretationVersion}:${before.state}`,
    became: reading.acceptedRef === null ? null : target === undefined ? `UNRESOLVED:${reading.acceptedRef.id}` : `${reading.acceptedRef.kind}:${target.title}`,
    decided: reading.decidedAt !== null,
    producer: reading.provenance.producer,
    confidence: reading.provenance.confidence,
  };
}
const meanings = (state, asCloud = false) => state.interpretations.map((r) => meaningOf(state, r, asCloud)).sort((x, y) => `${x.source}#${String(x.version).padStart(3, '0')}`.localeCompare(`${y.source}#${String(y.version).padStart(3, '0')}`));

for (const [timing, settleEach] of [['device syncs as she goes: create, then update', true], ['device was offline: the finished chain arrives in one go', false]]) describe(`D — every state Feature 02 can leave a reading in survives the account boundary (${timing})`, () => {
  test('device A ends up holding every state (the scenario is what it claims to be)', async () => {
    const { a, tap } = await populatedWorld({ settleEach });
    const requests = tap.sent.map((s) => JSON.parse(s)).filter((r) => r.table === 'interpretations');
    const updates = requests.filter((r) => r.op === 'update').length;
    if (settleEach) assert.ok(updates >= 6, `the sequence was create-then-update (${updates} updates to interpretations)`);
    else assert.equal(updates, 0, 'offline: every reading was sent once, already in its final state');
    assert.equal(requests.filter((r) => r.op === 'create').length, a.state().interpretations.length, 'and each reading was created exactly once');
    const states = new Map();
    for (const r of a.state().interpretations) states.set(r.state, (states.get(r.state) ?? 0) + 1);
    assert.deepEqual([...states.keys()].sort(), ['accepted', 'clarifying', 'pending', 'rejected', 'superseded']);
    assert.deepEqual([states.get('accepted'), states.get('superseded'), states.get('pending'), states.get('clarifying'), states.get('rejected')], [2, 4, 2, 1, 2], 'two accepted; four superseded (three chains); two open; one waiting on a question; two rejected');
    assert.equal(a.state().sourceArtifacts.filter((s) => s.retractedAt !== null).length, 1);
    assert.deepEqual([a.state().tasks.length, a.state().events.length], [1, 1], 'and only what she accepted became a row');
    assert.ok(a.state().interpretations.some((r) => r.subjectMemberId === 'kid-ayden' && r.state === 'pending'), 'a pending reading that names a child');
  });

  test('the cloud holds each state as the local model does, and no edit of a decided reading was ever attempted', async () => {
    const { a, cloud, violations } = await populatedWorld({ settleEach });
    assert.deepEqual(violations, [], 'the client never tried to edit an accepted/rejected/superseded interpretation (freeze_decided_interpretation)');
    assert.equal(a.persisted().identity.sync.evidence.length, 0, 'and the server refused nothing');

    const rows = cloud.table('interpretations');
    assert.equal(rows.length, a.state().interpretations.length);
    const byState = (state) => rows.filter((r) => r.state === state);
    assert.equal(byState('accepted').every((r) => r.accepted_type !== null && r.decided_at !== null), true, 'accepted names what it became, and when');
    assert.equal(byState('pending').concat(byState('clarifying')).every((r) => r.accepted_type === null && r.decided_at === null), true, 'an undecided reading names nothing and has no decision time');
    assert.equal(byState('clarifying').every((r) => typeof r.clarification === 'string'), true);
    assert.equal(byState('pending').concat(byState('accepted'), byState('rejected'), byState('superseded')).every((r) => r.clarification === null), true, 'a durable question exists only while a reading is clarifying');
    // every supersession points at a row the cloud holds, of the same source, one version earlier, itself superseded
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows.filter((x) => x.supersedes_id !== null)) {
      const before = byId.get(r.supersedes_id);
      assert.ok(before, `supersedes_id ${r.supersedes_id} resolves to a cloud row`);
      assert.deepEqual([before.artifact_id, before.interpretation_version + 1, before.state], [r.artifact_id, r.interpretation_version, 'superseded']);
    }

    // positive control: the stand-in for the server's freeze rule does fire when a decided reading IS edited
    const decided = byState('accepted')[0];
    await cloud.transport.update('interpretations', decided.id, decided.revision, { title: 'edited after the decision' }, 'id');
    assert.deepEqual(violations.map((v) => v.was), ['accepted'], 'the hook records an edit of an accepted reading');
  });

  test('the comparison can fail: a broken supersession, a dangling reference or a wrongly accepted reading is reported', async () => {
    const { a } = await populatedWorld({ settleEach });
    const state = a.state();
    const intact = meanings(state);
    const leaf = state.interpretations.find((r) => r.supersedesId !== null && r.state === 'pending');
    const broken = (patch) => meanings({ ...state, interpretations: state.interpretations.map((r) => (r.id === leaf.id ? { ...r, ...patch } : r)) });
    assert.notDeepEqual(broken({ supersedesId: null }), intact, 'a chain cut at this link');
    assert.ok(JSON.stringify(broken({ supersedesId: 'gone' })).includes('UNRESOLVED:gone'), 'a supersession that points at nothing');
    assert.ok(JSON.stringify(broken({ artifactId: 'gone' })).includes('UNRESOLVED:gone'), 'a reading whose source does not exist');
    assert.ok(JSON.stringify(broken({ subjectMemberId: 'kid-gone' })).includes('UNRESOLVED:kid-gone'), 'a child that does not exist');
    assert.notDeepEqual(broken({ state: 'accepted' }), intact, 'a reading that is accepted when it was not');
    assert.ok(JSON.stringify(meanings({ ...state, interpretations: state.interpretations.map((r) => (r.state === 'accepted' ? { ...r, acceptedRef: { kind: r.acceptedRef.kind, id: 'gone' } } : r)) })).includes('UNRESOLVED:gone'), 'an accepted reading that names no row');
  });

  test('device B, hydrated by its first pull, holds the same readings: same meaning, every reference resolved, nothing accepted that was not', async () => {
    const world = await populatedWorld({ settleEach });
    const b = await secondDevice(world);
    const stateA = world.a.state();
    const stateB = b.state();

    assert.equal(validateAppState(stateB).ok, true, 'the pulled household is a valid household');
    assert.deepEqual(meanings(stateB), meanings(stateA, true), 'every reading arrived as the thing it was, with its source, its chain, its subject and what it became - and, until she accepted it, under the neutral label instead of a title derived from her words');
    for (const reading of stateB.interpretations.filter((r) => r.state !== 'accepted')) {
      assert.equal(reading.title, UNDECIDED_READING_TITLE[reading.proposedKind], `${reading.state} reading ${reading.id} must not carry a title on device B`);
    }
    for (const m of meanings(stateB)) {
      for (const [field, value] of Object.entries(m)) assert.equal(String(value).startsWith('UNRESOLVED:'), false, `${m.source} ${field} did not resolve on the second device`);
    }
    assert.deepEqual(stateB.sourceArtifacts.map((s) => [s.contentRef, s.kind, s.origin, s.contentDigest, s.retractedAt !== null]).sort(), stateA.sourceArtifacts.map((s) => [s.contentRef, s.kind, s.origin, s.contentDigest, s.retractedAt !== null]).sort(), 'the sources, retraction included');

    // "nothing arrives accepted that was not": the accepted set is exactly A's, each names a row that exists, and only those rows exist
    const accepted = stateB.interpretations.filter((r) => r.state === 'accepted');
    assert.deepEqual(accepted.map((r) => meaningOf(stateB, r).became).sort(), ['event:Dentist', 'task:Renew the library card']);
    assert.equal(stateB.interpretations.filter((r) => (r.state === 'accepted') !== (r.acceptedRef !== null)).length, 0, 'accepted exactly when it names a row');
    assert.deepEqual([stateB.tasks.length, stateB.events.length, stateB.needsMe.length], [1, 1, 0], 'no row was made of a reading nobody accepted');
    assert.equal(stateB.interpretations.filter((r) => r.state === 'accepted').length, stateA.interpretations.filter((r) => r.state === 'accepted').length);
  });

  test('a superseded chain is still a chain on device B: root to leaf, versions in order, only the leaf open, each link naming its predecessor', async () => {
    const world = await populatedWorld({ settleEach });
    const b = await secondDevice(world);
    const state = b.state();

    const chainOf = (leaf) => {
      const out = [leaf];
      for (let hops = 0; out.at(-1).supersedesId !== null && hops < 20; hops += 1) out.push(state.interpretations.find((r) => r.id === out.at(-1).supersedesId));
      return out.reverse();
    };
    const waterLeaf = leafReadings(state, state.sourceArtifacts.find((s) => s.contentRef === `capture:${keyOf(1)}`).id)[0];
    const chain = chainOf(waterLeaf);
    assert.deepEqual(chain.map((r) => [r.interpretationVersion, r.state, r.title]), [
      [1, 'superseded', UNDECIDED_READING_TITLE.task],
      [2, 'superseded', UNDECIDED_READING_TITLE.task],
      [3, 'pending', UNDECIDED_READING_TITLE.task],
    ], 'a chain on device B: no link carries the title device A derived, or the one she typed, until she accepts');
    assert.equal(chain[0].supersedesId, null, 'the root names nothing');
    assert.equal(new Set(chain.map((r) => r.artifactId)).size, 1, 'one source for the whole chain');
    assert.equal(chain[0].dueDate, '2026-09-25', 'the reading she was shown is history exactly as it was');
    assert.equal(chain[2].dueDate, '2026-09-26', 'and the correction is the leaf');
    assert.equal(chain.filter((r) => r.state === 'pending' || r.state === 'clarifying').length, 1, 'exactly one open reading in the chain');

    // the corrected-then-accepted chain
    const dentist = state.interpretations.filter((r) => r.artifactId === state.sourceArtifacts.find((s) => s.contentRef === `capture:${keyOf(3)}`).id);
    assert.deepEqual(dentist.map((r) => [r.interpretationVersion, r.state]).sort(), [[1, 'superseded'], [2, 'accepted']]);
    assert.equal(state.events[0].title, 'Dentist');
    assert.equal(new Date(state.events[0].startsAt).getUTCHours(), 21, 'the CORRECTED time (4pm Chicago) is what became the event, not the reading she was shown');
    assert.equal(b.queue().length, 0, 'pulled state produced no outbound work');
    assert.equal(b.tap.requests(), 0, 'and device B sent nothing at all');
  });

  test('the open question survives as a durable code and is answerable on device B with no source text; the child it names is the same child', async () => {
    const world = await populatedWorld({ settleEach });
    const b = await secondDevice(world);
    const state = b.state();
    const practice = state.sourceArtifacts.find((s) => s.contentRef === `capture:${keyOf(0)}`);

    assert.equal(b.coordinator.textOf(practice.id), null, 'the words are session-only: device B never had them');
    assert.equal(capturePhaseOf(state, practice.id), 'needs-clarification');
    const vm = buildCaptureVM({ state, captureId: practice.id, nowMs: NOW, text: null, session: null });
    assert.equal(vm.proposals[0].question.step, 'which_child', 'the question is regenerated from the durable code alone');
    assert.deepEqual(vm.proposals[0].question.options.map((o) => o.label).sort(), ['Alexa', 'Ayden', copy.clarify.optionNoChild].sort(), 'and offers device B\'s own children, which arrived by pull');
    assert.equal(vm.source.kind, 'unavailable');

    const ayden = state.children.find((c) => c.displayName === 'Ayden');
    const answered = await b.coordinator.answerClarification(vm.proposals[0].readingId, { kind: 'option', option: { kind: 'child', memberId: ayden.id } });
    assert.equal(answered.kind, 'revised');
    await b.settle();

    // ...and it comes back to device A as the same child, in A's own identity space
    await world.a.syncRuntime.request('foreground');
    await world.a.settle();
    const stateA = world.a.state();
    const successor = stateA.interpretations.find((r) => r.supersedesId !== null && stateA.sourceArtifacts.find((s) => s.id === r.artifactId).contentRef === `capture:${keyOf(0)}`);
    assert.equal(successor.state, 'pending');
    assert.equal(successor.subjectMemberId, 'kid-ayden', 'device A resolves the subject to ITS child id, not a cloud uuid');
    assert.equal(stateA.interpretations.find((r) => r.id === successor.supersedesId).state, 'superseded', 'and the question she was asked is history on A');
    assert.deepEqual(world.violations, [], 'the cloud\'s freeze rule was not tripped by either device');
  });

  test('a decision made on device B converges on device A: she NAMES the pulled reading first, then accepts it; one task, the reading accepted, nothing duplicated', async () => {
    const world = await populatedWorld({ settleEach });
    const b = await secondDevice(world);
    const water = b.state().sourceArtifacts.find((s) => s.contentRef === `capture:${keyOf(1)}`);
    const leaf = leafReadings(b.state(), water.id)[0];

    // The reading arrived under the neutral label: device B was never told what she said. It cannot be saved as it stands.
    assert.equal(leaf.title, UNDECIDED_READING_TITLE.task);
    assert.deepEqual(await b.coordinator.accept(leaf.id), { kind: 'needs-title' }, 'nothing is saved under the label');
    assert.equal(b.state().tasks.length, 1, 'no row called "To-do to review" exists');
    const card = buildCaptureVM({ state: b.state(), captureId: water.id, nowMs: NOW, text: null, session: null }).proposals[0];
    assert.deepEqual([card.titleNeeded, card.actions.canAccept], [true, false], 'the card says so and offers no save');
    assert.ok(card.notes.includes(copy.review.titleNeeded), 'in words');

    // She gives it a name (the ordinary correction), and THEN it can be saved.
    const named = await b.coordinator.correct(leaf.id, { kind: 'patch', patch: { title: 'Pay the water and sewer bill' } });
    assert.equal(named.kind, 'revised');
    assert.equal((await b.coordinator.accept(named.readingId)).kind, 'accepted', 'accepted on B once named (the money area comes from the reading\'s own hint)');
    await b.settle();
    await world.a.syncRuntime.request('foreground');
    await world.a.settle();

    for (const device of [world.a, b]) {
      const s = device.state();
      assert.equal(s.tasks.length, 2, 'the library card, and the water bill she named and accepted on B');
      const reading = s.interpretations.find((x) => x.state === 'accepted' && x.proposedKind === 'task' && x.interpretationVersion === 4);
      assert.equal(s.tasks.find((t) => t.id === reading.acceptedRef.id).title, 'Pay the water and sewer bill');
      assert.equal(reading.title, 'Pay the water and sewer bill', 'the accepted reading carries the canonical title she gave it');
      assert.deepEqual(s.tasks.map((t) => t.durationSource).sort(), ['default', 'inferred'], 'the reading with a duration is inferred, the one without is the planning default (never user-provided)');
    }
    assert.deepEqual(meanings(world.a.state(), true), meanings(b.state()), 'the two devices agree on every reading, as the cloud presents them');
    assert.equal(world.cloud.table('tasks').length, 2);
    assert.deepEqual(world.violations, []);
    assert.equal(world.a.queue().length + b.queue().length, 0);
  });
});

describe('D — the durable open question is a valid open code in the cloud, for every question Feature 02 can ask', () => {
  test('every clarification code Feature 02 can make (one to three DISTINCT questions, every weekday, any order) is a valid cloud open code and parses back', () => {
    const cloudCheck = /^[a-z][a-z0-9_.-]{0,63}$/; // interpretations.clarification_check, from the foundation manifest
    const steps = [{ kind: 'which_child' }, { kind: 'which_money_direction' }, { kind: 'which_day', weekday: null }, ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ kind: 'which_day', weekday }))];
    let checked = 0;
    let longest = 0;
    const visit = (chain) => {
      if (chain.length > 0) {
        const code = formatClarificationCode(chain);
        assert.match(code, cloudCheck, code);
        assert.match(code, OPEN_CODE_PATTERN);
        assert.deepEqual(parseClarificationCode(code), chain, `${code} parses back to the steps it was made from`);
        checked += 1;
        longest = Math.max(longest, code.length);
      }
      // a reading never asks the same KIND of question twice (revise() refuses to add one it already has)
      if (chain.length < MAX_CLARIFICATION_STEPS) for (const step of steps) if (!chain.some((c) => c.kind === step.kind)) visit([...chain, step]);
    };
    visit([]);
    assert.equal(checked, 92, 'ten single questions, thirty-four pairs, forty-eight triples');
    assert.ok(longest <= 64, `the longest code is ${longest} characters, inside the cloud's 64`);
    assert.throws(() => formatClarificationCode([]), RangeError);
    assert.throws(() => formatClarificationCode([steps[0], steps[1], steps[2], steps[3]]), RangeError, 'four steps is refused before it can be stored');
  });
});
