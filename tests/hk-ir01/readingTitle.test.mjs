/**
 * OD-A (owner decision) - an undecided reading may sync as STRUCTURED state, but nothing copied from or derived from her words
 * may leave the device before she explicitly accepts it.
 *
 * The title of a reading is the one field that is her words. Until acceptance the cloud is given a neutral label that names only
 * the kind of thing waiting for her; after acceptance the canonical title travels; a reading that was rejected or superseded was
 * never approved and stays neutral; and a reading that ARRIVES neutral cannot be accepted as it stands, so no real row is ever
 * called "To-do to review". The rest of the reading (kind, dates, amount, child, hint, state, open question) is not withheld.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { UNDECIDED_READING_TITLE, isUndecidedReadingTitle, titleForCloud } from '../../src/domain/foundation/interpretation.ts';
import { acceptInterpretation, askClarification, canAccept, proposeInterpretation, recordArtifact, rejectInterpretation, supersedeInterpretation } from '../../src/domain/interpretations.ts';
import { validateAppState } from '../../src/domain/state.ts';
import { applyCloudRow } from '../../src/domain/sync/apply.ts';
import { rowMatchesLocal } from '../../src/domain/sync/domainRules.ts';
import { toCloudRow } from '../../src/domain/sync/projection.ts';
import { UPDATABLE_COLUMNS, emptyNamespace, updatablePatch } from '../../src/domain/sync/syncTypes.ts';
import { createEmptyState } from '../../src/state/initialState.ts';

const TZ = 'America/Chicago';
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const HOUSEHOLD = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const uuid = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

/** A sentence in her words, distinctive enough that no neutral label could contain any part of it. */
const SAID = 'Remind me to call Dr. Okonkwo about Mia’s cardiology referral before Thursday';
const TITLE = 'Call Dr. Okonkwo about Mia’s cardiology referral';

const ctx = () => {
  let n = 0;
  return { nowMs: NOW, today: '2026-09-21', createId: (p) => `${p}-${++n}` };
};

const withReading = (over = {}) => {
  const c = ctx();
  let s = recordArtifact(createEmptyState(TZ), c, { kind: 'message', origin: 'user-submitted', contentRef: 'capture:one', contentDigest: null }).state;
  const artifactId = s.sourceArtifacts[0].id;
  s = proposeInterpretation(s, c, { artifactId, proposedKind: 'task', title: TITLE, dueDate: '2026-09-24', durationMinutes: 20, categoryHint: 'kids', ...over });
  return { state: s, artifactId, c, id: s.interpretations[0].id };
};

// The artifact is mapped, and so is every row a reading names: what it was accepted into, and the reading it superseded (the queue sends those first).
const namespaceFor = (state, artifactId) => {
  const mappings = { [`sourceArtifact:${artifactId}`]: { kind: 'sourceArtifact', localId: artifactId, cloudId: uuid(4), revision: 1 } };
  let n = 8;
  for (const [kind, rows] of [['task', state.tasks], ['event', state.events], ['needsMe', state.needsMe], ['interpretation', state.interpretations]]) {
    for (const row of rows) mappings[`${kind}:${row.id}`] = { kind, localId: row.id, cloudId: uuid(n++ % 10), revision: 1 };
  }
  return { ...emptyNamespace({ accountId: ACCOUNT, householdId: HOUSEHOLD, deviceId: DEVICE }), mappings };
};
const project = (state, artifactId, id) => toCloudRow(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: namespaceFor(state, artifactId) }, 'interpretation', id);
const sentText = (row) => JSON.stringify(row);

describe('OD-A - what a reading says to the cloud before she decides', () => {
  test('a PENDING reading syncs, with the neutral label for its kind and none of her words', () => {
    const { state, artifactId, id } = withReading();
    const row = project(state, artifactId, id);
    assert.equal(row.title, UNDECIDED_READING_TITLE.task);
    assert.equal(row.state, 'pending', 'the reading itself is not held back');
    for (const word of ['Okonkwo', 'cardiology', 'referral', 'Dr.', 'Mia', 'Thursday', 'Remind', 'call']) {
      assert.ok(!sentText(row).toLowerCase().includes(word.toLowerCase()), `"${word}" is in the outbound row`);
    }
  });

  test('the structured metadata is NOT withheld: kind, dates, amount, child, hint and state all travel', () => {
    const { state, artifactId, id } = withReading({ dueDate: '2026-09-24', durationMinutes: 20, categoryHint: 'kids', value: { amountMinor: 3500, currency: 'USD', direction: 'owed' } });
    const row = project(state, artifactId, id);
    assert.deepEqual(
      [row.proposed_kind, row.due_date, row.duration_minutes, row.category_hint, row.value_amount_minor, row.value_currency, row.state],
      ['task', '2026-09-24', 20, 'kids', 3500, 'USD', 'pending'],
      'only the title is her words; everything else is typed state'
    );
  });

  test('each kind has its own neutral label, and none of them is a title anyone could have derived from her words', () => {
    const labels = Object.values(UNDECIDED_READING_TITLE);
    assert.equal(new Set(labels).size, 3);
    for (const label of labels) {
      assert.ok(label.length >= 1 && label.length <= 200, 'it satisfies the cloud title check');
      assert.equal(isUndecidedReadingTitle(label), true);
    }
    assert.equal(isUndecidedReadingTitle(TITLE), false);
    const { state: eventState, artifactId, id } = withReading({ proposedKind: 'event', title: 'Piano recital for Mia', dueDate: null, durationMinutes: null, categoryHint: null, startsAt: '2026-09-25T23:00:00.000Z', endsAt: '2026-09-26T00:00:00.000Z' });
    assert.equal(project(eventState, artifactId, id).title, UNDECIDED_READING_TITLE.event);
    const note = withReading({ proposedKind: 'needsMe', title: 'The school wants a form back', dueDate: null, durationMinutes: null, categoryHint: null });
    assert.equal(project(note.state, note.artifactId, note.id).title, UNDECIDED_READING_TITLE.needsMe);
  });

  test('a CLARIFYING reading is undecided too: its question code travels, her words do not', () => {
    const { state, artifactId, id } = withReading();
    const asked = askClarification(state, id, 'which_child');
    const row = project(asked, artifactId, id);
    assert.deepEqual([row.state, row.clarification, row.title], ['clarifying', 'which_child', UNDECIDED_READING_TITLE.task]);
  });

  test('after explicit ACCEPTANCE the canonical title may travel, with the state that says she approved it', () => {
    const { state, artifactId, id, c } = withReading();
    const accepted = acceptInterpretation(state, c, id, { categoryId: state.categories[0].id });
    assert.equal(accepted.interpretations[0].state, 'accepted');
    const row = project(accepted, artifactId, id);
    assert.deepEqual([row.title, row.state], [TITLE, 'accepted']);
  });

  test('a reading queued while pending and accepted BEFORE the push goes out with its accepted title: the boundary reads the row as it is sent', () => {
    const { state, artifactId, id, c } = withReading();
    const beforeAcceptance = project(state, artifactId, id);
    const afterAcceptance = project(acceptInterpretation(state, c, id, { categoryId: state.categories[0].id }), artifactId, id);
    assert.equal(beforeAcceptance.title, UNDECIDED_READING_TITLE.task);
    assert.equal(afterAcceptance.title, TITLE);
  });

  test('a REJECTED reading was never approved and stays neutral for good', () => {
    const { state, artifactId, id, c } = withReading();
    const rejected = rejectInterpretation(state, c, id);
    const row = project(rejected, artifactId, id);
    assert.deepEqual([row.state, row.title], ['rejected', UNDECIDED_READING_TITLE.task]);
    assert.ok(!sentText(row).includes('Okonkwo'));
  });

  test('a SUPERSEDED chain: every link before the accepted one is neutral, the accepted one carries its title', () => {
    const { state, artifactId, id, c } = withReading();
    const corrected = supersedeInterpretation(state, c, id, { proposedKind: 'task', title: 'Call the cardiology office for Mia', dueDate: '2026-09-24', categoryHint: 'kids' });
    const [first, second] = corrected.interpretations;
    assert.deepEqual([first.state, second.state], ['superseded', 'pending']);
    const acceptedChain = acceptInterpretation(corrected, c, second.id, { categoryId: corrected.categories[0].id });
    const rows = acceptedChain.interpretations.map((r) => project(acceptedChain, artifactId, r.id));
    assert.deepEqual(rows.map((r) => [r.state, r.title]), [
      ['superseded', UNDECIDED_READING_TITLE.task],
      ['accepted', 'Call the cardiology office for Mia'],
    ]);
    assert.ok(!sentText(rows[0]).includes('Okonkwo') && !sentText(rows[1]).includes('Okonkwo'), 'the first reading’s words appear in neither row');
  });
});

describe('OD-A - the other device: a reading that arrives neutral', () => {
  const pulled = (state, artifactId, id) => {
    const row = { ...project(state, artifactId, id), id: uuid(7), revision: 1 };
    const back = createEmptyState(TZ);
    const withArtifact = { ...back, sourceArtifacts: state.sourceArtifacts };
    const resolve = (cloud) => (cloud === uuid(4) ? artifactId : null);
    return applyCloudRow(withArtifact, 'interpretation', id, row, resolve);
  };

  test('it lands as an ordinary pending reading with the neutral label, and the state is valid', () => {
    const { state, artifactId, id } = withReading();
    const there = pulled(state, artifactId, id);
    assert.equal(there.interpretations[0].title, UNDECIDED_READING_TITLE.task);
    assert.equal(there.interpretations[0].state, 'pending');
    assert.equal(validateAppState(there).ok, true);
  });

  test('it CANNOT be accepted as it stands: no real row is ever called "To-do to review"; she names it first', () => {
    const { state, artifactId, id, c } = withReading();
    const there = pulled(state, artifactId, id);
    assert.deepEqual(canAccept(there.interpretations[0], { categoryId: there.categories[0].id }), { ok: false, reason: 'needs_title' });
    const attempt = acceptInterpretation(there, c, id, { categoryId: there.categories[0].id });
    assert.equal(attempt.tasks.length, 0, 'nothing was created');
    assert.equal(attempt.interpretations[0].state, 'pending', 'and the reading is still waiting for her');
  });

  test('once she names it (a correction supersedes the reading), it can be accepted, and THEN its title syncs', () => {
    const { state, artifactId, id, c } = withReading();
    const there = pulled(state, artifactId, id);
    const named = supersedeInterpretation(there, c, id, { proposedKind: 'task', title: 'Cardiology referral call', dueDate: '2026-09-24', categoryHint: 'kids' });
    const successor = named.interpretations[1];
    assert.equal(canAccept(successor, { categoryId: named.categories[0].id }).ok, true);
    const accepted = acceptInterpretation(named, c, successor.id, { categoryId: named.categories[0].id });
    assert.equal(accepted.tasks[0].title, 'Cardiology referral call');
    assert.equal(project(accepted, artifactId, successor.id).title, 'Cardiology referral call');
  });

  test('a device recognises ITS OWN undecided row when it comes back (a lost acknowledgement), so it is not raised as somebody else’s edit', () => {
    const { state, artifactId, id } = withReading();
    const sent = { ...project(state, artifactId, id), id: uuid(7), revision: 1 };
    const ns = namespaceFor(state, artifactId);
    assert.equal(rowMatchesLocal(state, { householdId: HOUSEHOLD, profileId: ACCOUNT, namespace: ns }, 'interpretation', id, sent), true);
  });
});

describe('OD-A - the update path', () => {
  test('the title is an updatable column, so the accepted title can replace the neutral one in the SAME update that records the decision', () => {
    assert.ok(UPDATABLE_COLUMNS.interpretation.includes('title'));
    assert.ok(UPDATABLE_COLUMNS.interpretation.includes('state'));
    const { state, artifactId, id, c } = withReading();
    const accepted = acceptInterpretation(state, c, id, { categoryId: state.categories[0].id });
    const patch = updatablePatch('interpretation', project(accepted, artifactId, id));
    assert.equal(patch.title, TITLE);
    assert.equal(patch.state, 'accepted');
    const before = updatablePatch('interpretation', project(state, artifactId, id));
    assert.equal(before.title, UNDECIDED_READING_TITLE.task, 'and before acceptance the patch carries the neutral label');
  });

  test('titleForCloud is a pure function of state and kind: only `accepted` carries the title', () => {
    for (const s of ['pending', 'clarifying', 'rejected', 'superseded']) {
      assert.equal(titleForCloud({ state: s, proposedKind: 'event', title: 'her words' }), UNDECIDED_READING_TITLE.event);
    }
    assert.equal(titleForCloud({ state: 'accepted', proposedKind: 'event', title: 'her words' }), 'her words');
  });
});
