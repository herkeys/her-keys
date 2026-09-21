import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { UNBOUND_IDENTITY } from '../src/domain/account/binding.ts';
import { decideBinding } from '../src/domain/account/claim.ts';
import { interpretationsOf } from '../src/domain/interpretations.ts';
import { validateAppState } from '../src/domain/state.ts';
import { requestFromDraft } from '../src/features/talk-it-out/capture/revise.ts';
import { draftOf } from '../src/features/talk-it-out/capture/coordinator.ts';
import { AYDEN, ALEXA, failWhenReadingsAreWritten, startWorld } from './support/captureWorld.mjs';
import { TZ } from './support/fixtures.mjs';

/** The harness clock is Wednesday 2026-09-16, 10:00 in New York. */
const submit = (world, text, key = 'k1') => world.coordinator.submit({ text, submissionKey: key });
const open = (world) => world.state().interpretations.filter((r) => r.state === 'pending' || r.state === 'clarifying');
const rows = (state) => ({ tasks: state.tasks.length, events: state.events.length, needsMe: state.needsMe.length });
const ZERO = { tasks: 0, events: 0, needsMe: 0 };

// ------------------------------------------------------ draft vs submitted ---

describe('Q — a draft is not a source; a submit is', () => {
  test('previewing words (what typing and routing do) creates nothing durable', async () => {
    const world = await startWorld();
    const before = world.persisted();
    const writes = world.memory.writeLog.length;
    for (const text of ['Dentist Friday at 3', 'Pick him up from practice at 5', 'asdf']) assert.ok(world.coordinator.preview(text));
    assert.equal(world.state().sourceArtifacts.length, 0);
    assert.equal(world.state().interpretations.length, 0);
    assert.equal(world.persisted(), before);
    assert.equal(world.memory.writeLog.length, writes, 'no storage write happened');
    assert.equal(world.text.has('capture:k1'), false);
  });

  test('an intentional submit creates exactly one source (kind message, user-submitted, no digest) and no canonical row', async () => {
    const world = await startWorld();
    const out = await submit(world, 'Dentist Friday at 3');
    assert.equal(out.kind, 'captured');
    const [artifact] = world.state().sourceArtifacts;
    assert.equal(world.state().sourceArtifacts.length, 1);
    assert.equal(artifact.kind, 'message');
    assert.equal(artifact.origin, 'user-submitted');
    assert.equal(artifact.contentRef, 'capture:k1');
    assert.equal(artifact.contentDigest, null, 'identical text typed twice is two captures, not one');
    assert.deepEqual(rows(world.state()), ZERO, 'nothing is canonical until she accepts');
  });
});

describe('empty input (15)', () => {
  test('input that normalises to nothing creates no source, no reading, no inbox item and no write', async () => {
    const world = await startWorld();
    const writes = world.memory.writeLog.length;
    for (const text of ['', '   ', '\n\t  \n', ' ']) {
      const out = await submit(world, text, `e-${text.length}`);
      assert.deepEqual(out, { kind: 'refused', reason: 'empty' });
    }
    assert.equal(world.state().sourceArtifacts.length, 0);
    assert.equal(world.state().interpretations.length, 0);
    assert.equal(world.memory.writeLog.length, writes);
  });
});

// ----------------------------------------------------- the durable lifecycle ---

describe('A/I — accept: one reading, one row, provenance preserved, idempotent', () => {
  test('the reading is durable and unconfirmed; accepting it makes exactly one event, confirmed by her', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const [reading] = world.state().interpretations;
    assert.equal(reading.state, 'pending');
    assert.equal(reading.provenance.producer, 'ai-inference');
    assert.equal(reading.provenance.confidence, 'possible', 'an inference is never presented as more');
    assert.equal(reading.provenance.artifactId, world.state().sourceArtifacts[0].id, 'lineage points at the source');
    assert.deepEqual(rows(world.state()), ZERO);

    const out = await world.coordinator.accept(reading.id);
    assert.equal(out.kind, 'accepted');
    const s = world.state();
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].title, 'Dentist');
    assert.equal(s.events[0].provenance.producer, 'ai-inference', 'produced by inference');
    assert.equal(s.events[0].provenance.confidence, 'established', 'and confirmed by her — never user-action, because she approved it rather than stated it');
    assert.equal(s.events[0].provenance.artifactId, s.sourceArtifacts[0].id);
    const after = s.interpretations[0];
    assert.equal(after.state, 'accepted');
    assert.deepEqual(after.acceptedRef, { kind: 'event', id: s.events[0].id });
    assert.ok(after.decidedAt);
    assert.ok(s.observations.some((o) => o.about.kind === 'interpretation' && o.about.id === reading.id && o.outcome === 'accepted'));
    assert.equal(validateAppState(s).ok, true);
  });

  test('double accept — sequential, concurrent, and after an app restart — never makes a second row', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const id = world.state().interpretations[0].id;

    const [a, b] = await Promise.all([world.coordinator.accept(id), world.coordinator.accept(id)]);
    assert.ok([a.kind, b.kind].every((k) => k === 'accepted' || k === 'already-accepted'));
    assert.equal(world.state().events.length, 1, 'two simultaneous accepts, one event');
    const third = await world.coordinator.accept(id);
    assert.equal(third.kind, 'already-accepted');
    assert.equal(world.state().events.length, 1);

    await world.store.flush();
    await world.restart();
    assert.equal(world.state().events.length, 1, 'restored: still one');
    assert.equal((await world.coordinator.accept(id)).kind, 'already-accepted');
    assert.equal(world.state().events.length, 1, 'accepted again after restore: still one');
    assert.equal(world.state().observations.filter((o) => o.about.id === id && o.outcome === 'accepted').length, 1, 'and one observation');
  });

  test('a duplicate callback that races the reading across a re-mount cannot duplicate it', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist tomorrow at 5pm for an hour', 'k9');
    const id = world.state().interpretations[0].id;
    await Promise.all(Array.from({ length: 6 }, () => world.coordinator.accept(id)));
    assert.equal(world.state().events.length, 1);
  });
});

describe('C/D/W — one source, several proposals, each resolving on its own', () => {
  const TEXT = 'Picture day is Thursday, I need to send $20, and I think practice moved to 6.';

  test('three proposals share one source; only the accepted one materialises; the rest stay open; nothing is called resolved', async () => {
    const world = await startWorld();
    await submit(world, TEXT);
    const [note, task, change] = interpretationsOf(world.state(), world.state().sourceArtifacts[0].id);
    assert.equal(world.state().sourceArtifacts.length, 1);
    assert.deepEqual([note.proposedKind, task.proposedKind, change.proposedKind], ['needsMe', 'task', 'needsMe']);

    // "Send $20" names no area, so she must say which — the foundation's "she classifies at acceptance".
    assert.deepEqual(await world.coordinator.accept(task.id), { kind: 'needs-area' });
    assert.deepEqual(rows(world.state()), ZERO, 'a refused accept changes nothing');
    const money = world.state().categories.find((c) => c.systemRole === 'money').id;
    assert.equal((await world.coordinator.accept(task.id, { categoryId: money })).kind, 'accepted');
    assert.equal((await world.coordinator.reject(note.id)).kind, 'rejected');

    const s = world.state();
    assert.deepEqual(rows(s), { tasks: 1, events: 0, needsMe: 0 }, 'only the accepted task became real');
    assert.deepEqual(s.tasks[0].value, { amountMinor: 2000, currency: 'USD', direction: 'outflow' });
    assert.equal(s.interpretations.find((r) => r.id === change.id).state, 'pending', 'the unresolved one is still unresolved');
    assert.equal(s.interpretations.find((r) => r.id === note.id).state, 'rejected');
    assert.equal(s.sourceArtifacts[0].retractedAt, null, 'the shared source is untouched by any of it');
    assert.ok(s.observations.some((o) => o.about.id === note.id && o.outcome === 'declined'), 'rejection is distinguishable from never-reviewed');
  });

  test('after a restart the accepted stays accepted, the rejected stays rejected, and the open one is still open', async () => {
    const world = await startWorld();
    await submit(world, TEXT);
    const [note, task, change] = world.state().interpretations;
    await world.coordinator.accept(task.id, { categoryId: world.state().categories.find((c) => c.systemRole === 'money').id });
    await world.coordinator.reject(note.id);
    await world.store.flush();
    await world.restart();
    const byId = Object.fromEntries(world.state().interpretations.map((r) => [r.id, r.state]));
    assert.deepEqual(byId, { [note.id]: 'rejected', [task.id]: 'accepted', [change.id]: 'pending' });
    assert.equal(world.state().tasks.length, 1);
  });
});

describe('33 — rejection means do not materialise, and stays that way', () => {
  test('a rejected reading creates no row, cannot be accepted later, and does not reappear after a restore', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const id = world.state().interpretations[0].id;
    assert.equal((await world.coordinator.reject(id)).kind, 'rejected');
    assert.deepEqual(rows(world.state()), ZERO);
    assert.deepEqual(await world.coordinator.accept(id), { kind: 'not-open' });
    assert.equal((await world.coordinator.reject(id)).kind, 'not-open', 'rejecting twice changes nothing');
    await world.store.flush();
    await world.restart();
    assert.equal(world.state().interpretations[0].state, 'rejected');
    assert.deepEqual(await world.coordinator.accept(id), { kind: 'not-open' });
    assert.deepEqual(rows(world.state()), ZERO);
    assert.equal(world.state().interpretations[0].provenance.confidence, 'possible', 'rejection upgrades nothing');
  });
});

// ------------------------------------------------------- correction (E, Z) ---

describe('E — a correction is a new reading; the one she was shown stays as history and can never materialise', () => {
  test('a typed correction supersedes: v1 keeps its original claim, v2 names it and carries the correction', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const v1 = world.state().interpretations[0];
    const out = await world.coordinator.correct(v1.id, { kind: 'patch', patch: { date: '2026-09-25', timeMinutes: 16 * 60 } });
    assert.equal(out.kind, 'revised');
    const s = world.state();
    assert.equal(s.interpretations.length, 2);
    const old = s.interpretations.find((r) => r.id === v1.id);
    const now = s.interpretations.find((r) => r.id === out.readingId);
    assert.equal(old.state, 'superseded');
    assert.equal(old.startsAt, v1.startsAt, 'what Her Keys originally claimed is not rewritten to look as though it had always said this');
    assert.equal(now.supersedesId, v1.id);
    assert.equal(now.interpretationVersion, 2);
    assert.equal(now.state, 'pending');
    assert.equal(now.provenance.confidence, 'possible', 'a correction does not raise confidence; only acceptance can');

    assert.deepEqual(await world.coordinator.accept(v1.id), { kind: 'not-open' }, 'the obsolete reading can never materialise');
    assert.deepEqual(rows(s), ZERO);
    await world.coordinator.accept(out.readingId);
    assert.equal(world.state().events.length, 1);
    assert.equal(world.state().events[0].startsAt, now.startsAt, 'the corrected value is the one that became real');
    assert.notEqual(world.state().events[0].startsAt, v1.startsAt);
  });

  test('a typed edit and a natural-language correction reach the same reading (one semantic operation)', async () => {
    const typed = await startWorld();
    const said = await startWorld();
    await submit(typed, 'Dentist Friday at 3pm');
    await submit(said, 'Dentist Friday at 3pm');
    const t = await typed.coordinator.correct(typed.state().interpretations[0].id, { kind: 'patch', patch: { date: '2026-09-25', timeMinutes: 16 * 60 } });
    const n = await said.coordinator.correct(said.state().interpretations[0].id, { kind: 'text', text: 'No, I meant next Friday at 4pm' });
    assert.equal(t.kind, 'revised');
    assert.equal(n.kind, 'revised');
    const pick = (w, id) => {
      const r = w.state().interpretations.find((x) => x.id === id);
      return { title: r.title, startsAt: r.startsAt, endsAt: r.endsAt, kind: r.proposedKind, state: r.state, v: r.interpretationVersion };
    };
    assert.deepEqual(pick(said, n.readingId), pick(typed, t.readingId));
  });

  test('"No, I meant next Friday" — she is correcting the date she was shown, so it cannot mean the same one', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist this Friday at 3pm'); // Fri 2026-09-18
    const id = world.state().interpretations[0].id;
    const out = await world.coordinator.correct(id, { kind: 'text', text: 'No, I meant next Friday' });
    assert.equal(out.kind, 'revised');
    const corrected = world.state().interpretations.find((r) => r.id === out.readingId);
    assert.equal(corrected.state, 'pending', 'no second question: the correction itself settled which Friday');
    assert.match(corrected.startsAt, /^2026-09-25T/);
  });

  test('a correction she cannot follow changes nothing and says so; enough of them stop the asking', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const id = world.state().interpretations[0].id;
    const before = JSON.stringify(world.state().interpretations);
    for (let i = 1; i <= 3; i += 1) {
      const out = await world.coordinator.correct(id, { kind: 'text', text: 'hmm not quite right' });
      assert.equal(out.kind, 'not-understood');
      assert.equal(out.attempts, i);
      assert.equal(out.exhausted, i >= 3);
    }
    assert.equal(JSON.stringify(world.state().interpretations), before);
  });

  test('Z — a correction can change the kind; the earlier reading never materialises and nothing is left half-accepted', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm');
    const v1 = world.state().interpretations[0];
    const out = await world.coordinator.correct(v1.id, { kind: 'patch', patch: { kind: 'task' } });
    assert.equal(out.kind, 'revised');
    const v2 = world.state().interpretations.find((r) => r.id === out.readingId);
    assert.equal(v2.proposedKind, 'task');
    assert.equal(v2.startsAt, null);
    assert.equal(v2.dueDate, '2026-09-18', 'the day she meant survives as the due date');
    await world.coordinator.accept(v2.id);
    assert.deepEqual(rows(world.state()), { tasks: 1, events: 0, needsMe: 0 }, 'a task, not the superseded event');
    assert.equal(world.state().interpretations.find((r) => r.id === v1.id).state, 'superseded');
    assert.equal(world.state().interpretations.filter((r) => r.state === 'accepted').length, 1, 'no orphaned accepted state');
  });
});

// ----------------------------------------------- clarification (B, U, V, R) ---

describe('U — a child-scoped reading needs the right child before it can be anything', () => {
  test('U1: with two children the pronoun is a question; nothing materialises, and nothing can be forced', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const [r] = world.state().interpretations;
    assert.equal(r.state, 'clarifying');
    assert.equal(r.clarification, 'which_child');
    assert.equal(r.subjectMemberId, null);
    assert.deepEqual(await world.coordinator.accept(r.id), { kind: 'needs-clarification' });
    assert.deepEqual(rows(world.state()), ZERO);
  });

  test('U3: answering names the child; the row that results satisfies the foundation invariant (child scope, real child)', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const q = world.state().interpretations[0];
    const answered = await world.coordinator.answerClarification(q.id, { kind: 'option', option: { kind: 'child', memberId: AYDEN.id } });
    assert.equal(answered.kind, 'revised');
    assert.equal(answered.stillClarifying, false);
    assert.equal(world.state().interpretations.find((r) => r.id === q.id).state, 'superseded');
    await world.coordinator.accept(answered.readingId);
    const [event] = world.state().events;
    assert.equal(event.subjectMemberId, AYDEN.id);
    assert.equal(event.scope, 'child');
    assert.equal(validateAppState(world.state()).ok, true, 'the foundation validator agrees: a child-scoped row names a real child');
  });

  test('a free-text answer works exactly like the option, and "neither" is an explicit answer, not an absence', async () => {
    const a = await startWorld();
    const b = await startWorld();
    const c = await startWorld();
    for (const w of [a, b, c]) await submit(w, 'Pick him up from practice at 5pm');
    await a.coordinator.answerClarification(a.state().interpretations[0].id, { kind: 'text', text: "it's Alexa" });
    await b.coordinator.answerClarification(b.state().interpretations[0].id, { kind: 'option', option: { kind: 'child', memberId: ALEXA.id } });
    assert.equal(a.state().interpretations[1].subjectMemberId, ALEXA.id);
    // Two separate worlds have their own ids; everything else about the reading must be identical.
    const shape = (r) => ({ ...r, id: 0, createdAt: 0, supersedesId: 0, artifactId: 0, provenance: { ...r.provenance, artifactId: 0 } });
    assert.deepEqual(shape(a.state().interpretations[1]), shape(b.state().interpretations[1]));
    const none = await c.coordinator.answerClarification(c.state().interpretations[0].id, { kind: 'text', text: 'neither, it is not for a kid' });
    assert.equal(none.kind, 'revised');
    assert.equal(c.state().interpretations[1].subjectMemberId, null);
    assert.equal(c.state().interpretations[1].state, 'pending', 'she said it is not about a child, so the question is answered');
  });

  test('V3 — answers she gives that do not answer it leave the reading unresolved, bounded, and never guess', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const id = world.state().interpretations[0].id;
    for (const [i, text] of ['hmm', 'I am not sure', 'whichever'].entries()) {
      const out = await world.coordinator.answerClarification(id, { kind: 'text', text });
      assert.deepEqual(out, { kind: 'not-understood', attempts: i + 1, exhausted: i === 2 });
    }
    assert.equal(world.state().interpretations.length, 1, 'no superseding reading was made');
    assert.equal(world.state().interpretations[0].state, 'clarifying');
    assert.deepEqual(rows(world.state()), ZERO);
  });

  test('two open questions are asked in order, one at a time, and the second is still there after the first is answered', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up next Friday at 5pm'); // Wed → next Friday is doubtful AND the child is doubtful
    const q1 = world.state().interpretations[0];
    assert.equal(q1.clarification, 'which_child-which_day.fri');
    const a1 = await world.coordinator.answerClarification(q1.id, { kind: 'option', option: { kind: 'child', memberId: ALEXA.id } });
    assert.equal(a1.stillClarifying, true);
    const q2 = world.state().interpretations.find((r) => r.id === a1.readingId);
    assert.equal(q2.clarification, 'which_day.fri');
    assert.equal(q2.subjectMemberId, ALEXA.id);
    const a2 = await world.coordinator.answerClarification(q2.id, { kind: 'text', text: 'the second one' });
    assert.equal(a2.stillClarifying, false);
    const final = world.state().interpretations.find((r) => r.id === a2.readingId);
    assert.equal(final.state, 'pending');
    assert.match(final.startsAt, /^2026-09-25T/, '"the second one" of Sept 18 / Sept 25 is Sept 25');
    assert.equal(final.interpretationVersion, 3);
  });

  test('the day question stays anchored to when she first said it, however late she answers', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist next Friday at 3pm');
    const q = world.state().interpretations[0];
    assert.equal(q.clarification, 'which_day.fri');
    // She answers three days later, on the coming Friday itself.
    world.clock.now += 2 * 24 * 3600 * 1000;
    const out = await world.coordinator.answerClarification(q.id, { kind: 'text', text: 'the first one' });
    const final = world.state().interpretations.find((r) => r.id === out.readingId);
    assert.match(final.startsAt, /^2026-09-18T/, '"the first one" means the Friday she meant when she said it, not one from the day she answered');
  });

  test('R — killed mid-clarification: the same question comes back from the durable reading alone, and answering it needs no source text', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const id = world.state().interpretations[0].id;
    await world.store.flush();
    await world.restart(); // the app was closed; the session's words are gone
    assert.equal(world.text.has('capture:k1'), false);
    const reading = world.state().interpretations.find((r) => r.id === id);
    assert.equal(reading.state, 'clarifying');
    const draft = draftOf(world.state(), reading);
    const request = requestFromDraft(draft, { children: world.state().children, timeZone: TZ });
    assert.deepEqual(request.steps, [{ kind: 'which_child' }]);
    assert.deepEqual(request.options.map((o) => o.memberId ?? o.kind), [ALEXA.id, AYDEN.id, 'no-child']);
    const out = await world.coordinator.answerClarification(id, { kind: 'option', option: { kind: 'child', memberId: AYDEN.id } });
    assert.equal(out.kind, 'revised');
    assert.equal((await world.coordinator.accept(out.readingId)).kind, 'accepted');
    assert.equal(world.state().events[0].subjectMemberId, AYDEN.id);
    assert.equal(world.state().events.length, 1, 'accepted work does not duplicate across the restart');
  });

  test('a clarification answer becomes durable exactly when the reinterpretation does — one step, saved before it is shown', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const id = world.state().interpretations[0].id;
    // The write carrying the answer's effect fails: the app "died" before the answer became durable.
    world.control.failWhen = failWhenReadingsAreWritten;
    const out = await world.coordinator.answerClarification(id, { kind: 'option', option: { kind: 'child', memberId: AYDEN.id } });
    assert.equal(out.kind, 'not-saved');
    assert.equal(world.state().interpretations.length, 1, 'not shown, because it was not saved');
    world.control.failWhen = null;
    await world.restart();
    const back = world.state().interpretations;
    assert.equal(back.length, 1);
    assert.equal(back[0].state, 'clarifying', 'the still-durable question is asked again: not silently half-applied, not silently lost');
  });
});

// --------------------------------------------------- crash and failure (X, G) ---

describe('X — the source exists but reading did not finish', () => {
  test('one source remains, nothing is canonical, a retry finishes it without a second source or a second reading', async () => {
    const world = await startWorld({ failWhen: null });
    world.control.failWhen = failWhenReadingsAreWritten; // the write that would save the readings fails
    const out = await submit(world, 'Dentist Friday at 3pm');
    assert.equal(out.kind, 'not-saved');
    assert.equal(world.state().sourceArtifacts.length, 1, 'the source was saved first');
    assert.equal(world.state().interpretations.length, 0);
    assert.deepEqual(rows(world.state()), ZERO);

    world.control.failWhen = null;
    const retry = await world.coordinator.interpretCapture(world.state().sourceArtifacts[0].id);
    assert.equal(retry.kind, 'captured');
    assert.equal(world.state().sourceArtifacts.length, 1, 'no duplicate source');
    assert.equal(world.state().interpretations.length, 1, 'exactly one reading');
    const again = await world.coordinator.interpretCapture(world.state().sourceArtifacts[0].id);
    assert.equal(again.duplicate, true);
    assert.equal(world.state().interpretations.length, 1, 'retrying again adds nothing');
    // Submitting the very same submission again (a re-tapped Send) is the same capture.
    const resubmitted = await submit(world, 'Dentist Friday at 3pm');
    assert.equal(resubmitted.duplicate, true);
    assert.equal(world.state().sourceArtifacts.length, 1);
  });

  test('after the app is closed in that window the source is still there, honestly unreadable (Option B), and can be re-said or dismissed', async () => {
    const world = await startWorld();
    world.control.failWhen = failWhenReadingsAreWritten;
    await submit(world, 'Dentist Friday at 3pm');
    world.control.failWhen = null;
    await world.store.flush();
    await world.restart();
    assert.equal(world.state().sourceArtifacts.length, 1, 'the source survived the crash');
    assert.equal(world.state().interpretations.length, 0);
    const id = world.state().sourceArtifacts[0].id;
    assert.deepEqual(await world.coordinator.interpretCapture(id), { kind: 'text-unavailable', captureId: id }, 'the wording was not kept, and that is said, not papered over');
    assert.equal(world.state().interpretations.length, 0, 'nothing is fabricated');
    assert.deepEqual(rows(world.state()), ZERO);
    assert.deepEqual(await world.coordinator.dismissCapture(id), { kind: 'dismissed', rejected: 0, retracted: true });
    assert.ok(world.state().sourceArtifacts[0].retractedAt, 'the source is withdrawn, never deleted');
  });

  test('a save that cannot be made is refused honestly and leaves nothing behind', async () => {
    const world = await startWorld();
    world.control.failWhen = () => true;
    const out = await submit(world, 'Dentist Friday at 3pm');
    assert.equal(out.kind, 'not-saved');
    assert.equal(world.state().sourceArtifacts.length, 0);
    assert.equal(world.text.has('capture:k1'), false, 'and her words are not held for a source that does not exist');
  });
});

describe('G/O/H — nothing safe to read, or unsupported', () => {
  test('text the reader cannot read is still kept as a source, with no reading and no fabricated understanding', async () => {
    const world = await startWorld();
    const out = await submit(world, 'asdf qwerty');
    assert.equal(out.kind, 'captured');
    assert.equal(out.failure.code, 'nothing-recognized');
    assert.equal(world.state().sourceArtifacts.length, 1);
    assert.equal(world.state().interpretations.length, 0);
    assert.deepEqual(rows(world.state()), ZERO);
    assert.equal(world.coordinator.sessionOf(out.captureId).failure.code, 'nothing-recognized');
  });

  test('over-window text is kept, not read, and not claimed to have been read', async () => {
    const world = await startWorld();
    const out = await submit(world, `Dentist Friday at 3. ${'blah '.repeat(1200)}`);
    assert.equal(out.failure.code, 'over-processing-limit');
    assert.equal(world.state().interpretations.length, 0);
  });

  test('high-stakes text is not saved, not read, not turned into anything, and not held', async () => {
    const world = await startWorld();
    const writes = world.memory.writeLog.length;
    const out = await submit(world, 'He hit me again and I have to pick up Ayden at 5');
    assert.deepEqual(out, { kind: 'high-stakes' });
    assert.equal(world.state().sourceArtifacts.length, 0, 'no durable trace that it was said');
    assert.equal(world.state().interpretations.length, 0);
    assert.equal(world.memory.writeLog.length, writes);
    assert.equal(world.text.has('capture:k1'), false);
  });

  test('a capture not yet loaded is refused safely rather than crashing', async () => {
    const world = await startWorld();
    const { createAppStore } = await import('../src/state/appStore.ts');
    const { createCaptureCoordinator } = await import('../src/features/talk-it-out/capture/coordinator.ts');
    const { localInterpreter } = await import('../src/features/talk-it-out/capture/port.ts');
    const { createMemoryCaptureTextStore } = await import('../src/features/talk-it-out/capture/textStore.ts');
    const cold = createAppStore({ repository: world.repository, mode: 'empty', now: () => world.clock.now, timeZone: () => TZ });
    const coordinator = createCaptureCoordinator({ store: cold, interpreter: localInterpreter, text: createMemoryCaptureTextStore(), now: () => world.clock.now });
    assert.deepEqual(await coordinator.submit({ text: 'Dentist Friday at 3', submissionKey: 'cold' }), { kind: 'not-saved' });
    assert.equal(coordinator.preview('Dentist Friday at 3'), null);
  });
});

// -------------------------------------------------- doubled submit (50) ---

describe('50 — the same submission is one submission', () => {
  test('two simultaneous sends of one draft make one source and one set of readings', async () => {
    const world = await startWorld();
    const [a, b] = await Promise.all([submit(world, 'Dentist Friday at 3pm', 'same'), submit(world, 'Dentist Friday at 3pm', 'same')]);
    assert.equal(a.captureId, b.captureId);
    assert.equal(world.state().sourceArtifacts.length, 1);
    assert.equal(world.state().interpretations.length, 1);
  });

  test('the same words sent as two separate captures are two sources — a repeated errand is not swallowed', async () => {
    const world = await startWorld();
    await submit(world, 'Call the school tomorrow', 'first');
    await submit(world, 'Call the school tomorrow', 'second');
    assert.equal(world.state().sourceArtifacts.length, 2);
    assert.equal(world.state().interpretations.length, 2);
  });
});

// ---------------------------------------------- people, money, source (J K Y AB) ---

describe('J/Y — a mentioned person stays a mention', () => {
  test('accepting a plan that names Jordan creates no person, no role, no account and no responsibility', async () => {
    const world = await startWorld();
    await submit(world, 'Jordan will pick up Ayden at 5pm');
    const before = { people: world.state().people.length, responsibilities: world.state().responsibilities.length, members: world.state().children.length };
    const out = await world.coordinator.accept(world.state().interpretations[0].id);
    assert.equal(out.kind, 'accepted');
    const s = world.state();
    assert.deepEqual({ people: s.people.length, responsibilities: s.responsibilities.length, members: s.children.length }, before);
    assert.equal(s.people.length, 0, 'Jordan is not in her household model');
    assert.equal(s.responsibilities.length, 0, 'nothing says Jordan accepted anything');
    assert.equal(s.events[0].subjectMemberId, AYDEN.id, 'the child subject is still resolved');
    assert.match(s.events[0].title, /Jordan/, 'Jordan survives only as her words');
    assert.equal(world.coordinator.sessionOf(s.sourceArtifacts[0].id).unsupported.some((u) => u.reason === 'responsibility-handoff'), true);
  });
});

describe('K — money direction is stored, distinct, and never coerced', () => {
  test('"I owe" and "owes me" become an outflow and an inflow of the same amount', async () => {
    const world = await startWorld();
    await submit(world, 'I owe Jordan $85', 'a');
    await submit(world, 'Jordan owes me $85', 'b');
    for (const r of world.state().interpretations) await world.coordinator.accept(r.id);
    const [owe, owed] = world.state().tasks;
    assert.equal(owe.value.direction, 'outflow');
    assert.equal(owed.value.direction, 'inflow');
    assert.equal(owe.value.amountMinor, 8500);
    assert.equal(owed.value.amountMinor, 8500);
    assert.notDeepEqual(owe.value, owed.value);
  });

  test('no cue but a named person is a question; answering it types the amount with the direction she gave', async () => {
    const world = await startWorld();
    await submit(world, 'Talk to Jordan about the $85');
    const q = world.state().interpretations[0];
    assert.equal(q.clarification, 'which_money_direction');
    assert.equal(q.value, null, 'no direction is invented while it is open');
    assert.equal((await world.coordinator.accept(q.id)).kind, 'needs-clarification');
    const out = await world.coordinator.answerClarification(q.id, { kind: 'text', text: 'Jordan owes me' });
    assert.equal(out.kind, 'revised');
    assert.deepEqual(world.state().interpretations.find((r) => r.id === out.readingId).value, { amountMinor: 8500, currency: 'USD', direction: 'inflow' });
  });
});

describe('L — talk that is not actionable creates nothing to materialise', () => {
  test('goals and feelings are recognised as nothing and never become a task', async () => {
    const world = await startWorld();
    for (const [i, text] of ['I want mornings to feel less chaotic', 'I feel like I am always behind'].entries()) {
      const out = await submit(world, text, `l${i}`);
      assert.equal(out.failure.code, 'nothing-recognized');
    }
    assert.deepEqual(rows(world.state()), ZERO);
    assert.equal(world.state().interpretations.length, 0);
  });
});

describe('AB/16/18 — the submitted source is evidence and is never rewritten', () => {
  test('the source is never edited: not by clarification, correction, acceptance or rejection', async () => {
    const world = await startWorld();
    await submit(world, 'Pick him up from practice at 5pm');
    const snapshot = JSON.stringify(world.state().sourceArtifacts);
    const q = world.state().interpretations[0];
    const a = await world.coordinator.answerClarification(q.id, { kind: 'option', option: { kind: 'child', memberId: ALEXA.id } });
    const c = await world.coordinator.correct(a.readingId, { kind: 'patch', patch: { title: 'Pick up Alexa' } });
    await world.coordinator.accept(c.readingId);
    assert.equal(JSON.stringify(world.state().sourceArtifacts), snapshot);
    assert.equal(world.coordinator.textOf(world.state().sourceArtifacts[0].id), 'Pick him up from practice at 5pm', 'her original wording is exactly what she sent');
  });

  test('"the source was wrong": she captures again; the first stays as history and the second is its own source', async () => {
    const world = await startWorld();
    await submit(world, 'Dentist Friday at 3pm', 'orig');
    await world.coordinator.reject(world.state().interpretations[0].id);
    await submit(world, 'Dentist Saturday at 3pm', 'redo');
    assert.equal(world.state().sourceArtifacts.length, 2);
    assert.equal(world.coordinator.textOf(world.state().sourceArtifacts[0].id), 'Dentist Friday at 3pm', 'the first is not destructively rewritten');
    assert.equal(world.state().interpretations.length, 2);
  });
});

// ------------------------------------------------------------- privacy ---

describe('56 — her words are not in durable state or storage', () => {
  test('words that did not become a title never reach storage, in any key', async () => {
    const world = await startWorld();
    const secret = 'zephyrquartz marmalade sorrowful';
    await submit(world, `Dentist Friday at 3pm. My private worry is the ${secret} thing about last time.`);
    await world.store.flush();
    const everything = world.everythingStored();
    for (const word of secret.split(' ')) assert.equal(everything.includes(word), false, `${word} was persisted`);
    assert.equal(everything.includes('private worry'), false);
    assert.ok(everything.includes('Dentist'), 'only the derived title is kept');
  });

  test('a very long clause leaves only a short, flagged title in the record — never a dump of what she wrote', async () => {
    const world = await startWorld();
    const long = `Call the school tomorrow ${'about the thing that happened '.repeat(15)}`;
    await submit(world, long);
    const [reading] = world.state().interpretations;
    assert.ok(reading.title.length <= 90, `${reading.title.length}`);
    assert.ok(reading.title.endsWith('…'));
  });
});

// -------------------------------------------------------------------- demo ---

describe('P — demo captures stay demo', () => {
  test('a captured and accepted item in the demo household carries demo provenance and the household can never be claimed', async () => {
    const world = await startWorld({ mode: 'demo' });
    assert.equal(world.state().origin, 'demo');
    await submit(world, 'Dentist Friday at 3pm');
    const id = world.state().interpretations.at(-1).id;
    const before = world.state().events.length;
    assert.equal((await world.coordinator.accept(id)).kind, 'accepted');
    const event = world.state().events.at(-1);
    assert.equal(world.state().events.length, before + 1);
    assert.equal(event.provenance.producer, 'demo-seed', 'in a demo everything is part of the rehearsal');
    const decision = decideBinding({ origin: 'demo', hasContent: true, onboardingComplete: true }, UNBOUND_IDENTITY, 'acct-1');
    assert.deepEqual(decision, { mode: 'refuseDemo' });
    assert.equal(world.state().children.some((c) => c.id === 'kid-alexa'), false, 'and the demo household is Josie and Theo, not a real household');
  });
});
