/**
 * HK-FEATURE-05 — COPY-TRUTH AUDIT. Every user-facing string that says handled / covered / confirmed / authorized / ready / plan in
 * place / scheduled / completed / known / estimated / accepted / assigned / due / at risk / needs attention is tied to the one canonical
 * state that supports it, and to no other. Judgement words (guilt, "stay on top of") are absent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import * as copy from '../../src/features/kids/copy.ts';
import { stringLiterals } from './support.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const COPY_SOURCE = readFileSync(join(ROOT, 'src', 'features', 'kids', 'copy.ts'), 'utf8');

const COVERAGE = ['covered', 'accepted_still_yours', 'asked_no_answer', 'seen_not_accepted', 'reply_overdue', 'declined', 'handed_back', 'holder_unavailable', 'held_by_child', 'finished', 'nobody_recorded'];
const PLAN_REASONS = ['accepted_and_off_your_list', 'declined', 'handed_back', 'holder_unavailable', 'reply_overdue', 'awaiting_answer', 'seen_not_accepted', 'accepted_still_yours', 'held_by_child', 'finished', 'nothing_recorded'];
const facts = (coverage) => ({ responsibilityId: 'r', lifecycle: 'x', live: true, holder: { kind: 'person', id: 'p', displayName: 'Alex', available: true, relationship: 'co-parent' }, stillNeedsMe: null, requiresYou: null, coverage, ackDueAt: null });

/** Words that claim the load left her, and the ONLY state allowed to say them. */
const CLAIMS_COVERED = /\b(covered|handled|taken care of|off your list)\b/i;

describe('covered / handled / off your list: only the state that is actually covered', () => {
  test('coverage lines and tags', () => {
    for (const state of COVERAGE) {
      const line = copy.coverageLine(facts(state));
      const tag = copy.coverageTag(state)?.label ?? '';
      const says = CLAIMS_COVERED.test(line) || CLAIMS_COVERED.test(tag);
      assert.equal(says, state === 'covered', `${state}: "${line}" / "${tag}"`);
    }
  });

  test('plan reasons: "off your list" only on the plan that rests on a covered handoff; PLAN IN PLACE only there', () => {
    for (const reason of PLAN_REASONS) {
      const line = copy.planReasonLine({ label: 'X', reason, relies: { displayName: 'Alex' }, openSteps: [] });
      assert.equal(CLAIMS_COVERED.test(line), reason === 'accepted_and_off_your_list', `${reason}: "${line}"`);
    }
    assert.deepEqual(Object.keys(copy.PLAN_LABEL).sort(), ['NEEDS_A_PLAN', 'NOT_ENOUGH_KNOWN', 'PLAN_IN_PLACE']);
    assert.deepEqual(Object.values(copy.PLAN_LABEL), ['Plan in place', 'Needs a plan', 'Not enough known']);
    for (const label of Object.values(copy.PLAN_LABEL)) assert.doesNotMatch(label, /\bready\b/i, 'no generalized READY label');
  });

  test('"accepted" and "said yes" are said only for accepted states; "asked" only for a request', () => {
    // "hasn't said yes" is a negation of the state, not a claim of it.
    const accepted = (s) => /\b(said yes|accepted)\b/i.test(copy.coverageLine(facts(s)).replace("hasn't said yes", ''));
    for (const state of COVERAGE) assert.equal(accepted(state), state === 'covered' || state === 'accepted_still_yours', state);
    for (const state of COVERAGE) {
      const asked = /\bYou asked\b/.test(copy.coverageLine(facts(state)));
      assert.equal(asked, state === 'asked_no_answer' || state === 'reply_overdue', state);
    }
    assert.match(copy.coverageLine(facts('seen_not_accepted')), /hasn't said yes/);
    assert.match(copy.coverageTag('seen_not_accepted').label, /not accepted/);
  });

  test('"seen" is not "yes": an acknowledged handoff never says it was accepted', () => {
    assert.doesNotMatch(copy.coverageLine(facts('seen_not_accepted')).replace("hasn't said yes", ''), /said yes|accepted|covered/i);
  });
});

describe('durations: only what she gave is said plainly; a default is never "you said"', () => {
  test('each knowledge says what it is', () => {
    assert.equal(copy.durationPhrase({ minutes: 20, knowledge: 'user-provided' }), '20 minutes');
    assert.equal(copy.durationPhrase({ minutes: 15, knowledge: 'default-estimate' }), 'About 15 minutes (an estimate)');
    assert.equal(copy.durationPhrase({ minutes: 15, knowledge: 'inferred-estimate' }), 'About 15 minutes (Her Keys estimated)');
    assert.equal(copy.durationPhrase({ minutes: 15, knowledge: 'unrecorded' }), 'About 15 minutes (not confirmed)');
    assert.equal(copy.minutesText(90), '1 hour 30 minutes');
  });

  test('nowhere does the copy say "you said" or "you told" about a length, and an explicit 15 differs from a default 15', () => {
    // The one place the words appear is the honest NEGATION on the default length: "It isn't something you told Her Keys."
    for (const text of stringLiterals(COPY_SOURCE)) if (/\byou (said|told)\b/i.test(text)) assert.match(text, /isn't something you told Her Keys/, text);
    assert.match(copy.FORM.minutesDefaultNote, /isn't something you told Her Keys/);
    assert.notEqual(copy.durationPhrase({ minutes: 15, knowledge: 'user-provided' }), copy.durationPhrase({ minutes: 15, knowledge: 'default-estimate' }));
  });
});

describe('due is not scheduled; nothing is invented as urgent', () => {
  test('a deadline says "due", never "scheduled"; a plan says "planned"', () => {
    assert.match(copy.duePhrase('2026-09-23', '2026-09-21'), /^Due /);
    assert.match(copy.duePhrase('2026-09-20', '2026-09-21'), /^Was due /);
    assert.doesNotMatch(copy.duePhrase('2026-09-23', '2026-09-21'), /scheduled|planned/i);
    assert.match(copy.whenPhrase({ schedule: { kind: 'day', localDate: '2026-09-22' } }, '2026-09-21'), /^Planned tomorrow$/);
  });

  test('"scheduled" appears once, in a sentence that is true exactly when there is no timed item', () => {
    const uses = COPY_SOURCE.split('\n').filter((l) => /scheduled/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    assert.equal(uses.length, 1);
    assert.match(uses[0], /nothingNext: 'Nothing scheduled is recorded\.'/);
  });

  test('attention wording never invents urgency: facts are stated, and "at risk" appears nowhere as a Kids judgement', () => {
    for (const code of ['not_accepted', 'handed_back', 'holder_unavailable', 'prerequisite_unavailable']) {
      const line = copy.attentionLine({ code, date: null }, '2026-09-21');
      assert.doesNotMatch(line, /urgent|at risk|overdue|late|hurry|asap/i, code);
    }
    const strings = COPY_SOURCE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(strings, /at risk|likely to fall through|tight|conflicting/i);
  });

  test('"high-stakes" is said only for the shared primitive\'s own `risk` reason', () => {
    const users = COPY_SOURCE.split('\n').filter((l) => /high-stakes/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    assert.equal(users.length, 1);
    assert.match(users[0], /return 'Marked high-stakes/);
  });
});

describe('authorization: the surface is planning only and claims nothing about who anyone recognises', () => {
  const literals = stringLiterals(COPY_SOURCE);

  test('the note says what Her Keys does and does not do, quietly', () => {
    assert.equal(copy.NOT_AUTHORIZATION, "Her Keys helps you plan. It doesn't check what a school, a court or a doctor recognizes.");
    assert.ok(copy.NOT_AUTHORIZATION.length < 120, 'restrained, not a legal-warning screen');
    assert.doesNotMatch(copy.NOT_AUTHORIZATION, /warning|danger|liab|must|required|illegal/i);
  });

  test('no user-facing string claims authorization, approval, verification or an official record', () => {
    for (const s of literals) {
      if (s === copy.NOT_AUTHORIZATION) continue;
      assert.doesNotMatch(s, /\bauthori[sz](ed|ation)\b|approved|verified|official|legal(ly)?\b|custody|pickup list|emergency contact/i, s);
    }
  });

  test('"confirmed" is only ever said as "not confirmed"', () => {
    for (const s of literals) if (/confirmed/i.test(s)) assert.match(s, /not confirmed|a confirmed length/i, s);
  });
});

describe('voice: calm, capable, adult, specific, never judging', () => {
  test('no guilt, no nagging, no childish or gamified language anywhere in the copy', () => {
    const literals = stringLiterals(COPY_SOURCE);
    assert.ok(literals.length > 80, 'the scan actually read the copy');
    const banned = /you forgot|you failed|you should have|be a better|stay on top|falling behind|get organized|behind on|don't forget|hurry|\bpoints?\b|\bstars?\b|badge|streak|level up|great job|awesome|yay|!/i;
    for (const s of literals) assert.doesNotMatch(s, banned, s);
  });

  test('errors say what to do, in full sentences, and nothing blames her', () => {
    for (const code of ['blank_title', 'bad_due_date', 'bad_duration']) assert.match(copy.taskError(code), /\.$/);
    for (const code of ['bad_start_time', 'end_not_after_start']) assert.match(copy.eventError(code), /\.$/);
    for (const code of ['blank_name', 'bad_birth_date', 'birth_date_in_future']) assert.match(copy.childError(code), /\.$/);
    assert.match(copy.NOTICE.saveFailed, /Try again\./);
    assert.match(copy.NOTICE.stale, /nothing was saved/i);
  });
});
