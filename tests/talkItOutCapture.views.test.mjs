import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { unresolvedCaptureAttention } from '../src/features/talk-it-out/capture/attention.ts';
import { copy, copyCorpus } from '../src/features/talk-it-out/capture/copy.ts';
import { buildLifeInbox, inboxRowValue } from '../src/features/talk-it-out/capture/viewModel.ts';
import { AYDEN, startWorld } from './support/captureWorld.mjs';
import { inbox, review, tree } from './support/captureViews.mjs';
import { nyMs } from './support/fixtures.mjs';

const submit = (w, text, key) => w.coordinator.submit({ text, submissionKey: key });

/** The harness clock is Wednesday 2026-09-16, 10:00 in New York. "Friday at 3pm" is 2026-09-18 15:00 EDT. */
const FRIDAY = { day: 18, hour: 15 };

// ------------------------------------------------- structural evidence (goldens) ---

describe('view-model evidence floor: the screen, as text', () => {
  test('simple explicit capture', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Dentist Friday at 3pm', 'a');
    assert.deepEqual(tree(review(w, out.captureId)), [
      'CAPTURE phase=needs-review told=Today decided=0/1',
      '  SOURCE “Dentist Friday at 3pm”',
      '  PROPOSAL [ready] Appointment: Dentist  · POSSIBLE  · from ai-inference',
      '    What: Dentist',
      '    When: Fri, Sep 18 · 3:00 PM–3:30 PM',
      '    Area: Wellbeing',
      '    AREA selected=cat-wellbeing',
      '    note: You didn’t say how long it lasts, so I assumed 30 minutes.',
      '    why: You wrote “Friday”, which I read as the day.',
      '    why: You wrote “at 3pm”, which I read as the time.',
      '    why: The words point to your Wellbeing area.',
      '    actions: accept, reject, fix',
      '  capture actions: dismiss',
    ]);
  });

  test('child ambiguity: only the question is on the table — no provisional day, time or area is presented as a fact', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Pick him up from practice at 5pm', 'a');
    assert.deepEqual(tree(review(w, out.captureId)), [
      'CAPTURE phase=needs-clarification told=Today decided=0/1',
      '  SOURCE “Pick him up from practice at 5pm”',
      '  PROPOSAL [clarifying] Appointment: Pick him up from practice  · POSSIBLE  · from ai-inference',
      '    What: Pick him up from practice',
      '    QUESTION Which child do you mean?',
      '      ( ) Alexa',
      '      ( ) Ayden',
      '      ( ) Neither. It isn’t about a child',
      '    note: This is about one of your children, so it can’t be saved until I know which.',
      '    actions: reject, fix',
      '  capture actions: dismiss',
    ]);
  });

  test('after the clarification the assumptions she has not changed are still stated', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Pick him up from practice at 5pm', 'a');
    const q = w.state().interpretations[0];
    await w.coordinator.answerClarification(q.id, { kind: 'option', option: { kind: 'child', memberId: AYDEN.id } });
    const vm = review(w, out.captureId);
    assert.equal(vm.proposals.length, 1, 'the superseded reading is history, not a second card');
    assert.equal(vm.revisions, 1);
    const [p] = vm.proposals;
    assert.equal(p.phase, 'ready');
    assert.deepEqual(p.fields.map((f) => f.label), ['What', 'When', 'For', 'Area']);
    assert.ok(p.notes.includes(copy.review.assumption('date-assumed-today')), 'the day is still an assumption');
    assert.ok(p.notes.includes(copy.review.assumption('end-time-assumed')));
    assert.ok(p.notes.includes(copy.review.revised));
    assert.ok(!p.notes.includes(copy.review.assumption('meridiem-assumed')), 'pm was said');
  });

  test('a corrected value drops the assumption it replaced, and keeps the rest', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Pick up Alexa at 5', 'a'); // bare 5 -> assumed pm, assumed today, assumed 30 minutes
    const id = w.state().interpretations[0].id;
    const before = review(w, out.captureId).proposals[0].notes;
    assert.ok(before.includes(copy.review.assumption('meridiem-assumed')));
    await w.coordinator.correct(id, { kind: 'patch', patch: { timeMinutes: 17 * 60, durationMinutes: 60 } });
    const after = review(w, out.captureId).proposals[0].notes;
    assert.ok(!after.includes(copy.review.assumption('end-time-assumed')), 'she supplied the length');
    assert.ok(!after.includes(copy.review.assumption('meridiem-assumed')), 'she supplied the time');
    assert.ok(after.includes(copy.review.assumption('date-assumed-today')), 'the day is still assumed');
  });

  test('partial acceptance: the accepted and rejected are shown as decided, the open one is still asking, and the source is not "resolved"', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Picture day is Thursday, I need to send $20, and I think practice moved to 6.', 'a');
    const [note, task] = w.state().interpretations;
    await w.coordinator.accept(task.id, { categoryId: w.state().categories.find((c) => c.systemRole === 'money').id });
    await w.coordinator.reject(note.id);
    assert.deepEqual(tree(review(w, out.captureId)), [
      'CAPTURE phase=needs-review told=Today decided=2/3',
      '  SOURCE “Picture day is Thursday, I need to send $20, and I think practice moved to 6.”',
      '  PROPOSAL [rejected] A dated note: Picture day  · from ai-inference',
      '    What: Picture day',
      '    Date: Tomorrow',
      '    Not saved.',
      '    actions: (none)',
      '  PROPOSAL [accepted] To-do: Send $20  · from ai-inference',
      '    What: Send $20',
      '    Amount: You pay · $20.00',
      '    Saved as a to-do.',
      '    actions: (none)',
      '  PROPOSAL [ready] A note for you: I think practice moved to 6  · POSSIBLE  · from ai-inference',
      '    What: I think practice moved to 6',
      '    note: You weren’t sure about this one.',
      '    why: Read from what you told Her Keys today.',
      '    actions: accept, reject, fix',
      '  NOTE This changes something that already exists. I can’t update existing items yet, so I kept it as a note.',
      '  capture actions: dismiss',
    ]);
    assert.deepEqual(tree(inbox(w)), ['INBOX phase=items count=1', '  ITEM [none] I think practice moved to 6 — Ready to review (2 of 3 decided)']);
  });

  test('a "To-do" with no area is not acceptable until she picks one — and picking one makes it acceptable', async () => {
    const w = await startWorld();
    const out = await submit(w, 'I need to send $20', 'a');
    const id = w.state().interpretations[0].id;
    const before = review(w, out.captureId).proposals[0];
    assert.equal(before.area.needed, true);
    assert.equal(before.actions.canAccept, false);
    const money = w.state().categories.find((c) => c.systemRole === 'money').id;
    const after = review(w, out.captureId, { areaChoice: { [id]: money } }).proposals[0];
    assert.equal(after.area.needed, false);
    assert.equal(after.actions.canAccept, true);
  });

  test('a note that is only in her words is honest about not knowing what changed after the app is reopened', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Dentist Friday at 3pm', 'a');
    await w.store.flush();
    await w.restart();
    const vm = review(w, out.captureId);
    assert.equal(vm.source.kind, 'unavailable');
    assert.equal(vm.hollow, false, 'it still has a reading, so it is reviewable');
    assert.ok(vm.proposals[0].notes.includes(copy.review.checkDetails));
    assert.equal(vm.proposals[0].confidence, 'possible');
    assert.equal(vm.proposals[0].provenance, 'ai-inference');
  });

  test('a long source collapses; a short one does not', async () => {
    const w = await startWorld();
    const words = `Dentist Friday at 3pm. ${'x'.repeat(400)}`;
    const long = await submit(w, words, 'l');
    const short = await submit(w, 'Call the school', 's');
    assert.equal(review(w, long.captureId).source.long, true);
    assert.equal(review(w, long.captureId).source.text, words, 'the source is never truncated or altered, only collapsed by the screen');
    assert.equal(review(w, short.captureId).source.long, false);
  });
});

// ------------------------------------------------------------- Life Inbox ---

describe('Life Inbox: unresolved life admin, not a second task list or an activity feed', () => {
  test('N — empty is a calm success: no celebration, no streak, no nudge to add something', async () => {
    const w = await startWorld();
    const vm = inbox(w);
    assert.deepEqual(vm, { phase: 'empty', message: copy.inbox.empty });
    assert.equal(inboxRowValue(vm), copy.inbox.rowEmpty);
    assert.doesNotMatch(vm.message, /!|zero|streak|congrat|great|clear|celebrat|add/i);
  });

  test('M — once every proposal has a final disposition the source leaves the active inbox, and its history stays', async () => {
    const w = await startWorld();
    const out = await submit(w, 'Picture day is Thursday, and I need to call the school', 'a');
    assert.equal(inbox(w).items.length, 1);
    for (const r of w.state().interpretations) {
      if (r.proposedKind === 'needsMe') await w.coordinator.accept(r.id);
      else await w.coordinator.reject(r.id);
    }
    assert.deepEqual(inbox(w), { phase: 'empty', message: copy.inbox.empty });
    assert.equal(w.state().sourceArtifacts.length, 1, 'history is kept');
    assert.equal(w.state().interpretations.length, 2, 'and so are the readings');
    assert.equal(review(w, out.captureId).phase, 'resolved');
  });

  test('accepted, rejected and superseded readings are never active inbox work', async () => {
    const w = await startWorld();
    await submit(w, 'Dentist Friday at 3pm', 'a');
    const v1 = w.state().interpretations[0].id;
    const c = await w.coordinator.correct(v1, { kind: 'patch', patch: { title: 'Dentist cleaning' } });
    assert.equal(inbox(w).items.length, 1);
    assert.equal(inbox(w).items[0].openCount, 1, 'only the current reading is open — the superseded one is history');
    await w.coordinator.accept(c.readingId);
    assert.equal(inbox(w).phase, 'empty');
  });

  test('a canonical row is never listed: the inbox does not repeat the task list', async () => {
    const w = await startWorld();
    await submit(w, 'Dentist Friday at 3pm', 'a');
    await w.coordinator.accept(w.state().interpretations[0].id);
    const vm = inbox(w);
    assert.equal(vm.phase, 'empty');
    assert.equal(w.state().events.length, 1);
  });

  test('a capture with unresolved and decided parts shows how far it has got', async () => {
    const w = await startWorld();
    await submit(w, 'Picture day is Thursday, I need to call the school, and I think practice moved to 6.', 'a');
    await w.coordinator.reject(w.state().interpretations[0].id);
    const [item] = inbox(w).items;
    assert.equal(item.progressLabel, copy.inbox.progress(1, 3));
    assert.equal(item.openCount, 2);
  });

  test('T — loading is not empty', async () => {
    const w = await startWorld();
    const snapshot = w.store.getSnapshot();
    for (const status of ['unhydrated', 'hydrating']) {
      const vm = buildLifeInbox({ status, recovery: null, state: null, nowMs: w.clock.now, textAvailable: () => false });
      assert.deepEqual(vm, { phase: 'loading', message: copy.inbox.loading }, status);
      assert.notEqual(vm.phase, 'empty');
      assert.equal(inboxRowValue(vm), copy.inbox.loading);
    }
    // Even with a state in hand, a household that has not finished loading is not "empty".
    const half = buildLifeInbox({ status: 'hydrating', recovery: null, state: snapshot.state, nowMs: w.clock.now, textAvailable: () => false });
    assert.equal(half.phase, 'loading');
  });

  test('T — a household recovered from unreadable stored state is not "nothing needs attention"', async () => {
    const w = await startWorld({ kids: [], initial: { 'herkeys.appState': '{ this is not valid json' } });
    const snap = w.store.getSnapshot();
    assert.equal(snap.status, 'recovery');
    assert.ok(snap.recovery);
    const vm = inbox(w);
    assert.equal(vm.phase, 'recovery');
    assert.notEqual(vm.phase, 'empty');
    assert.equal(vm.message, copy.inbox.recovery);
    assert.notEqual(inboxRowValue(vm), copy.inbox.rowEmpty, 'the Life row must not say "Nothing waiting" here');
  });

  test('X — a source with no reading is listed as such, honestly, whether or not its words are still held', async () => {
    const w = await startWorld();
    const out = await submit(w, 'asdf qwerty', 'a');
    const item = inbox(w).items[0];
    assert.equal(item.phase, 'awaiting-interpretation');
    assert.equal(item.phaseLabel, copy.inbox.phaseFailed, 'while the session knows it could not be read, it says so');
    assert.equal(item.hollow, false);
    await w.store.flush();
    await w.restart();
    const after = inbox(w).items[0];
    assert.equal(after.hollow, true, 'after the app closed the words are gone');
    assert.equal(after.phaseLabel, copy.inbox.phaseAwaiting);
    const vm = review(w, out.captureId);
    assert.equal(vm.hollow, true);
    assert.deepEqual(vm.actions, { canDismiss: true, canRetry: false });
    await w.coordinator.dismissCapture(out.captureId);
    assert.equal(inbox(w).phase, 'empty', 'dismissed sources leave the inbox');
  });
});

// ------------------------------------------ AA — time-sensitive unresolved ---

describe('AA — an unresolved capture with a time keeps its place as the time approaches', () => {
  test('urgency rises with the referenced time and never fades to nothing once it has passed', async () => {
    const w = await startWorld();
    await submit(w, 'Dentist Friday at 3pm', 'a');
    const s = w.state();
    const at = (day, hour, minute = 0) => unresolvedCaptureAttention(s, nyMs(hour, minute, day))[0];

    assert.equal(at(14, 10).urgency, 'none', 'four days out');
    assert.equal(at(15, 10).urgency, 'none', 'three days out');
    assert.equal(at(16, 10).urgency, 'soon', 'two days out');
    assert.equal(at(17, 10).urgency, 'soon');
    assert.equal(at(FRIDAY.day, 8).urgency, 'today');
    assert.equal(at(FRIDAY.day, 12, 30).urgency, 'now', 'within three hours');
    const passed = at(FRIDAY.day, 16);
    assert.equal(passed.urgency, 'now');
    assert.equal(passed.passed, true, 'passed and still unresolved: not silently dropped');
    assert.equal(at(20, 10).urgency, 'now', 'days later it is still there');
    assert.equal(at(FRIDAY.day, 8).reason, 'time_bound_unresolved');
    assert.deepEqual(at(FRIDAY.day, 8).timeRef, { kind: 'event-start', at: s.interpretations[0].startsAt });
  });

  test('it never pretends the appointment is real: nothing canonical exists, and deriving attention changes nothing', async () => {
    const w = await startWorld();
    await submit(w, 'Dentist Friday at 3pm', 'a');
    const before = JSON.stringify(w.state());
    unresolvedCaptureAttention(w.state(), nyMs(FRIDAY.hour - 1, 0, FRIDAY.day));
    assert.equal(JSON.stringify(w.state()), before);
    assert.equal(w.state().events.length, 0);
    assert.equal(w.state().tasks.length, 0);
    assert.equal(w.state().needsMe.length, 0);
  });

  test('an unanswered question on a time-bound capture is prioritised as the thing blocking it', async () => {
    const w = await startWorld();
    await submit(w, 'Call the school Friday, and pick him up Friday', 'a');
    const [call, pick] = w.state().interpretations;
    assert.equal(call.state, 'pending');
    assert.equal(pick.state, 'clarifying');
    const items = unresolvedCaptureAttention(w.state(), nyMs(10, 0, 16));
    assert.deepEqual(items.map((i) => i.reason), ['clarification_blocks_time_bound', 'time_bound_unresolved']);
    assert.equal(items[0].readingId, pick.id);
    assert.equal(items[0].blockedBy, 'clarification');
  });

  test('ordering is by meaning: time first (longest-overdue leading), then blocked-by-question, then review, then unread, recency only breaks ties', async () => {
    const w = await startWorld();
    // Each is told a little later than the one before, so "newest first" has something to break ties with.
    const later = () => (w.clock.now += 60_000);
    await submit(w, 'Dentist next Friday at 3pm', 'c1'); // clarifying, Fri 18 (provisional earliest)
    later();
    await submit(w, 'Call the school tomorrow', 'c2'); // pending, due Thu 17
    later();
    await submit(w, 'Call the plumber', 'c3'); // pending, no time
    later();
    await submit(w, 'asdf', 'c4'); // no reading
    later();
    await submit(w, 'Renew the passports', 'c5'); // pending, no time, newer than c3
    const ids = Object.fromEntries(['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => [k, w.state().sourceArtifacts.find((a) => a.contentRef === `capture:${k}`).id]));
    const order = (nowMs) => unresolvedCaptureAttention(w.state(), nowMs).map((i) => Object.keys(ids).find((k) => ids[k] === i.captureId));
    // Wed 10:00: c2 (due tomorrow) precedes c1 (Friday); then the time-less ones, newest first, then the unread source.
    assert.deepEqual(order(nyMs(10, 0, 16)), ['c2', 'c1', 'c5', 'c3', 'c4']);
    // Friday 12:30: both are "now"; the overdue Thursday item leads the one due in two hours.
    assert.deepEqual(order(nyMs(12, 30, 18)).slice(0, 2), ['c2', 'c1']);
  });

  test('a capture with no time gains no urgency from age: old is not urgent', async () => {
    const w = await startWorld();
    await submit(w, 'Call the plumber', 'a');
    for (const days of [0, 7, 30, 365]) {
      const [item] = unresolvedCaptureAttention(w.state(), nyMs(10, 0, 16) + days * 86_400_000);
      assert.equal(item.urgency, 'none');
      assert.equal(item.reason, 'review_required');
      assert.equal(item.timeRef, null);
    }
  });

  test('there is no numeric score, percentage or rank anywhere in the projection', async () => {
    const w = await startWorld();
    await submit(w, 'Dentist Friday at 3pm', 'a');
    await submit(w, 'asdf', 'b');
    const allowed = ['blockedBy', 'captureId', 'passed', 'readingId', 'reason', 'timeRef', 'urgency'];
    for (const item of unresolvedCaptureAttention(w.state(), nyMs(10, 0, 17))) {
      assert.deepEqual(Object.keys(item).sort(), allowed);
      for (const [key, value] of Object.entries(item)) if (typeof value === 'number') assert.fail(`${key} is numeric`);
    }
  });

  test('a withdrawn source is not attention', async () => {
    const w = await startWorld();
    const out = await submit(w, 'asdf', 'a');
    assert.equal(unresolvedCaptureAttention(w.state(), w.clock.now).length, 1);
    await w.coordinator.dismissCapture(out.captureId);
    assert.equal(unresolvedCaptureAttention(w.state(), w.clock.now).length, 0);
  });
});

// ------------------------------------------------------------------- copy ---

describe('tone: attentive, calm, concise, practical, respectful — audited mechanically', () => {
  const FORBIDDEN = [
    [/!/, 'exclamation mark'],
    [/\p{Extended_Pictographic}/u, 'emoji'],
    [/you['’]ve got this/i, 'cheerleading'],
    [/great job|well done|proud of you|congrat|nice work/i, 'praise'],
    [/don['’]t worry|no worries|it['’]s okay to|it['’]s ok to|be gentle|you deserve|take a breath|self-care/i, 'reassurance / therapy language'],
    [/amazing|awesome|superstar|fantastic|wonderful|yay|oops|sorry|magic|journey|unlock|supercharge/i, 'enthusiasm / cutesy'],
    [/coming soon|inbox zero|streak|celebrate|you did it/i, 'marketing / gamification'],
    [/\blove\b|\bhappy to\b|\bexcited\b/i, 'performed warmth'],
    [/\bAI\b|\bartificial\b|\bmodel\b|\bGemini\b/i, 'talking about the machinery'],
  ];

  test('every string the feature can show passes the tone audit', () => {
    const corpus = copyCorpus();
    assert.ok(corpus.length > 100, `${corpus.length} strings audited`);
    for (const text of corpus) {
      for (const [pattern, label] of FORBIDDEN) assert.doesNotMatch(text, pattern, `“${text}” — ${label}`);
      assert.ok(text.length <= 240, `“${text}” is ${text.length} characters`);
      assert.doesNotMatch(text, /\s{2,}/, `“${text}” has a double space`);
      assert.equal(text, text.trim());
    }
  });

  test('uncertainty and inference are never worded as fact', () => {
    assert.match(copy.capture.understood, /Nothing is saved until you say so/);
    assert.match(copy.review.assumption('hedged-language'), /weren’t sure/);
    assert.match(copy.review.assumption('end-time-assumed'), /assumed/);
    assert.match(copy.composer.disclaimer, /until you approve it/);
    for (const code of ['nothing-recognized', 'over-processing-limit', 'high-stakes']) {
      assert.doesNotMatch(copy.capture.failure(code), /I understood/i, 'never claims understanding it does not have');
    }
  });

  test('clarification asks what matters, never for a category or an optional field', () => {
    const prompts = [copy.clarify.which_child, copy.clarify.which_day(null), copy.clarify.which_day('Friday'), copy.clarify.which_money_direction];
    for (const p of prompts) assert.doesNotMatch(p, /category|description|optional|which module|choose kids|choose home/i, p);
    assert.equal(prompts[2], 'Which Friday do you mean?');
  });
});
