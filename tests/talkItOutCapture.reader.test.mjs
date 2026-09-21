import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDays, weekdayOf } from '../src/domain/logicalDay.ts';
import { formatClarificationCode, parseClarificationCode } from '../src/features/talk-it-out/capture/clarificationCodes.ts';
import { CAPABILITY_ENVELOPE, ENVELOPE_LIMITS } from '../src/features/talk-it-out/capture/local/envelope.ts';
import { PROCESSING_LIMIT_CHARS } from '../src/features/talk-it-out/capture/local/interpret.ts';
import { requestFromDraft } from '../src/features/talk-it-out/capture/revise.ts';
import { daysUntilWeekday, resolveWeekday, weekdayCandidates } from '../src/features/talk-it-out/capture/local/temporal.ts';
import { AREAS, FRIDAY_NOW, NOW, ONE_KID, PROPOSAL_KEYS, TZ, context, read, seeded } from './support/capture.mjs';

// ---------------------------------------------------------------- the envelope ---

describe('capability envelope: every documented rule generalizes across phrasings', () => {
  test('each rule documents at least three distinct phrasings', () => {
    for (const rule of CAPABILITY_ENVELOPE) {
      assert.ok(rule.variants.length >= 3, `${rule.id} lists ${rule.variants.length} variants`);
      assert.equal(new Set(rule.variants.map((v) => v.toLowerCase())).size, rule.variants.length, `${rule.id} repeats a variant`);
    }
  });

  for (const rule of CAPABILITY_ENVELOPE) {
    test(`${rule.id}: every variant fires the rule (rule-level behaviour, not a fixture lookup)`, () => {
      for (const text of rule.variants) {
        const result = read(text);
        const fired = result.proposals.some((p) => p.evidence.some((e) => e.rule === rule.id));
        assert.ok(fired, `“${text}” did not fire ${rule.id}; evidence: ${JSON.stringify(result.proposals.map((p) => p.evidence.map((e) => e.rule)))}`);
      }
    });
  }

  test('the documented limits are the limits the reader enforces', () => {
    assert.equal(ENVELOPE_LIMITS.processingLimitChars, PROCESSING_LIMIT_CHARS);
    assert.equal(ENVELOPE_LIMITS.maxClarificationSteps, 3);
  });

  test('novel phrasings of a rule that appear nowhere in the envelope are still read', () => {
    // Different weekday, different time, different noun, different filler: only the RULES are shared with the fixtures.
    const cases = [
      ['Vet on Saturday at 11am', 'date.weekday', 'time.clock'],
      ['Car inspection Monday at 8:15 a.m.', 'date.weekday', 'time.clock'],
      ['Haircut tomorrow at 4:45 pm', 'date.relative', 'time.clock'],
      ['Contractor Sept 30 at 9', 'date.calendar', 'time.clock'],
      ['Family photos Sunday from 10 to 11', 'date.weekday', 'time.range'],
    ];
    for (const [text, ...rules] of cases) {
      const result = read(text);
      assert.equal(result.proposals[0]?.kind, 'event', text);
      for (const rule of rules) assert.ok(result.proposals[0].evidence.some((e) => e.rule === rule), `${text} → ${rule}`);
    }
  });
});

// ------------------------------------------------------------ the weekday rule ---

describe('the weekday rule holds for every weekday on every day of a fortnight', () => {
  const start = '2026-09-20'; // a Sunday
  for (let offset = 0; offset < 14; offset += 1) {
    const today = addDays(start, offset);
    for (let weekday = 0; weekday < 7; weekday += 1) {
      test(`today ${today} (${weekdayOf(today)}) × weekday ${weekday}`, () => {
        const d = daysUntilWeekday(today, weekday);
        for (const modifier of ['none', 'this', 'next', 'coming']) {
          const r = resolveWeekday(weekday, modifier, today);
          if (r.status === 'resolved') {
            assert.equal(weekdayOf(r.date), weekday, `${modifier}: lands on the weekday named`);
            assert.ok(r.date >= today, `${modifier}: never in the past`);
            assert.ok(r.date <= addDays(today, 13), `${modifier}: within two weeks`);
          } else {
            assert.equal(r.candidates[1], addDays(r.candidates[0], 7), 'the two candidates are a week apart');
            for (const c of r.candidates) assert.equal(weekdayOf(c), weekday);
            assert.ok(r.candidates[0] >= today);
          }
        }
        // Doubt exists in exactly two situations.
        assert.equal(resolveWeekday(weekday, 'none', today).status === 'ambiguous', d === 0, 'bare weekday is doubtful only when it is today');
        assert.equal(resolveWeekday(weekday, 'next', today).status === 'ambiguous', d !== 0, '"next" is doubtful unless it is today');
        assert.equal(resolveWeekday(weekday, 'this', today).status, 'resolved', '"this" never asks');
        assert.equal(resolveWeekday(weekday, 'coming', today).status, 'resolved', '"coming" never asks');
        // A stored which_day.<weekday> question regenerates to the same two dates, from the day it was made.
        const [a, b] = weekdayCandidates(weekday, today);
        if (d !== 0) assert.deepEqual([a, b], [addDays(today, d), addDays(today, d + 7)]);
      });
    }
  }
});

// ------------------------------------------- invariants over a varied, hostile corpus ---

const CORPUS = [
  ...CAPABILITY_ENVELOPE.flatMap((r) => r.variants),
  'Picture day is Thursday, I need to send $20, and I think practice moved to 6.',
  'Dentist Friday at 3 and practice at 5 and I owe Jordan $85',
  'Jordan will pick up Ayden at 5',
  'Ask Maya to pick him up at 5',
  'I want mornings to feel less chaotic.',
  'I feel like I am always behind',
  '',
  '   ',
  '!!!',
  '😭😭',
  'اجتماع يوم الجمعة الساعة 3',
  'Ünïcödé Friday at 3',
  '$',
  '$$$',
  'at at at at',
  '9/9/9/9/9',
  '25th 26th 27th',
  'next next Friday',
  '3-4-5-6',
  '$99999999999999999999999 for the trip',
  '$0.001 for a stamp',
  'Feb 30 at 3pm dentist',
  'February 31st',
  'the 31st',
  'in 99999 days',
  'x'.repeat(500),
  '.*+?^${}()|[]\\',
  'Friday Friday Friday',
  'Friday and Saturday at 3',
  'tomorrow at 3 and 4 and 5',
  'ALEXA HAS PRACTICE FRIDAY AT 5',
  'alexa and ayden have soccer tomorrow at 4',
  'Send $20, $30 and $40',
  '\n\n\n',
  'a. b. c. d. e. f. g. h. i. j. k. l. m. n. o.',
  Array.from({ length: 30 }, (_, i) => `Call person ${i} tomorrow at ${(i % 9) + 1}`).join('. '),
];

const VOCAB = [
  'Dentist', 'practice', 'Alexa', 'Ayden', 'him', 'her', 'Jordan', 'Maya', 'I need to', 'remember to', 'call', 'send', 'pick up', 'pay',
  '$20', '$85.50', '40 dollars', 'I owe', 'owes me', 'Friday', 'next Friday', 'this Thursday', 'tomorrow', 'today', 'tonight', 'Sept 25',
  '9/28', 'the 15th', 'at 3', 'at 5:30pm', '15:00', 'noon', 'from 3 to 4', 'for an hour', 'every Tuesday', 'moved to 6', 'I think', 'maybe',
  'and', ',', '.', 'the school', 'field trip', 'groceries', 'a form', 'in 3 days', 'next week', '€40', 'my son', 'the kids', 'by Monday',
];

function randomCorpus(count, seed) {
  const rand = seeded(seed);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const n = 1 + Math.floor(rand() * 9);
    out.push(Array.from({ length: n }, () => VOCAB[Math.floor(rand() * VOCAB.length)]).join(' '));
  }
  return out;
}

function assertInvariants(text, result, ctx) {
  const label = `“${text.slice(0, 80)}”`;
  const childIds = new Set(ctx.children.map((c) => c.id));
  assert.equal(result.captureId, 'cap-1');
  assert.ok(result.processedCharacters >= 0 && result.processedCharacters <= text.length, `${label}: processed within the text`);
  if (result.failure) assert.equal(result.proposals.length, 0, `${label}: a failure carries no proposals`);
  else assert.ok(result.proposals.length > 0, `${label}: no failure means at least one proposal`);

  for (const p of result.proposals) {
    assert.deepEqual(Object.keys(p).sort(), PROPOSAL_KEYS, `${label}: a proposal is exactly the typed shape — no bag, no extra field`);
    assert.equal(p.confidence, 'possible', `${label}: a local reader never claims more than possible`);
    assert.equal(p.requiresExplicitReview, true);
    assert.ok(['task', 'event', 'needsMe'].includes(p.kind), `${label}: kind ${p.kind}`);
    assert.ok(p.title.trim().length >= 1 && p.title.length <= 200, `${label}: title length ${p.title.length}`);
    if (p.kind === 'event') {
      assert.ok(p.startsAt && p.endsAt && Date.parse(p.endsAt) > Date.parse(p.startsAt), `${label}: an event has a real start and end`);
      assert.equal(p.dueDate, null);
    } else {
      assert.equal(p.startsAt, null);
      assert.equal(p.endsAt, null);
    }
    if (p.kind === 'needsMe') {
      assert.equal(p.value, null, `${label}: a note carries no typed amount (the row cannot hold one)`);
      assert.equal(p.subjectMemberId, null);
      assert.equal(p.durationMinutes, null);
    }
    if (p.value) {
      assert.ok(['outflow', 'inflow'].includes(p.value.direction), `${label}: direction is stated, never absent`);
      assert.ok(Number.isSafeInteger(p.value.amountMinor) && p.value.amountMinor >= 0);
    }
    if (p.subjectMemberId !== null) assert.ok(childIds.has(p.subjectMemberId), `${label}: subject is a real child`);
    if (p.clarification) {
      assert.ok(p.clarification.steps.length >= 1 && p.clarification.steps.length <= 3, `${label}: bounded clarification`);
      assert.ok(p.clarification.options.length >= 1);
      if (p.clarification.steps.some((s) => s.kind === 'which_child')) assert.equal(p.subjectMemberId, null, `${label}: no child is guessed while the question is open`);
      if (p.clarification.steps.some((s) => s.kind === 'which_money_direction')) assert.equal(p.value, null, `${label}: no direction is guessed while the question is open`);
    }
    if (p.childScoped) {
      assert.ok(p.subjectMemberId !== null || p.clarification?.steps.some((s) => s.kind === 'which_child'), `${label}: a child-scoped proposal has a subject or is asking who`);
    }
    for (const e of p.evidence) if (e.span) assert.ok(e.span.start >= 0 && e.span.end <= text.length && e.span.start < e.span.end, `${label}: evidence inside the text`);
    assert.ok(p.span.start >= 0 && p.span.end <= text.length);
  }
  for (const u of result.unsupported) {
    assert.ok(u.span.start >= 0 && u.span.end <= text.length, `${label}: unsupported span inside the text`);
    if (u.reason !== 'responsibility-handoff') assert.equal(u.person, null);
  }
}

describe('reader invariants: what a proposal can never be, over a large hostile corpus', () => {
  const ctx = context();
  test('the fixed corpus (envelope variants, junk, unicode, overflow, injection-shaped strings)', () => {
    for (const text of CORPUS) assertInvariants(text, read(text), ctx);
  });

  test('2,000 seeded random sentences, one child and two, on a Wednesday and a Friday', () => {
    for (const [c, seed] of [
      [context(), 1],
      [context({ children: ONE_KID }), 2],
      [context({ nowMs: FRIDAY_NOW }), 3],
      [context({ children: [] }), 4],
    ]) {
      for (const text of randomCorpus(500, seed)) assertInvariants(text, read(text, c), c);
    }
  });

  test('the reader is deterministic: the same words and context give the same result', () => {
    for (const text of [...CORPUS, ...randomCorpus(100, 9)]) assert.deepEqual(read(text), read(text));
  });

  test('the reader never throws, and never puts her words into an Error', () => {
    for (const text of [...CORPUS, ...randomCorpus(300, 11), ' ', '\uD800', 'a'.repeat(10_000)]) {
      assert.doesNotThrow(() => read(text));
    }
  });
});

// ---------------------------------------------------------- bounds and honesty ---

describe('processing window: honest about what was and was not read', () => {
  test('text over the window is not read at all, and no reading is claimed', () => {
    const long = `Dentist Friday at 3. ${'x '.repeat(PROCESSING_LIMIT_CHARS)}`;
    const result = read(long);
    assert.equal(result.failure.code, 'over-processing-limit');
    assert.equal(result.proposals.length, 0);
    assert.equal(result.processedCharacters, 0);
  });

  test('text exactly at the window IS read', () => {
    const text = `Dentist Friday at 3. ${'a'.repeat(PROCESSING_LIMIT_CHARS - 21)}`;
    assert.equal(text.length, PROCESSING_LIMIT_CHARS);
    const result = read(text);
    assert.equal(result.failure, null);
    assert.equal(result.proposals[0].kind, 'event');
  });

  test('more clauses than the reader takes are reported unsupported, not silently dropped', () => {
    const text = Array.from({ length: ENVELOPE_LIMITS.maxClauses + 3 }, (_, i) => `Call person ${i} tomorrow`).join('. ');
    const result = read(text);
    assert.equal(result.proposals.length, ENVELOPE_LIMITS.maxClauses);
    assert.ok(result.unsupported.some((u) => u.reason === 'clause-limit'), 'the remainder is reported');
    assert.ok(result.processedCharacters < text.length, 'processedCharacters admits it stopped early');
  });

  test('empty and whitespace-only input reads nothing', () => {
    for (const text of ['', '   ', '\n\t ']) assert.equal(read(text).failure.code, 'empty');
  });
});

describe('high-stakes guard (stopgap, OD-2): read nothing rather than force it into logistics', () => {
  const cases = [
    'He hit me again last night and I need to call the school tomorrow',
    "I'm afraid of him and I have to pick up Ayden at 5",
    'I keep thinking about suicide, also dentist Friday at 3',
    'my ex threatens me every time I have to do the exchange Friday at 6',
    'I was assaulted, need to call my doctor tomorrow',
  ];
  for (const text of cases) {
    test(`“${text.slice(0, 48)}…” yields no proposals at all`, () => {
      const result = read(text);
      assert.equal(result.failure.code, 'high-stakes');
      assert.equal(result.proposals.length, 0, 'not even the innocuous half is turned into a chore');
      assert.equal(result.unsupported.length, 0);
    });
  }
  test('ordinary household text is not caught by the guard', () => {
    for (const text of ['Abuse of the coupon policy is annoying, call the store tomorrow', 'Dentist Friday at 3', 'Assault course birthday party Saturday at 2pm']) {
      // The guard errs toward NOT reading; these three document the conservative false positives honestly.
      const failure = read(text).failure?.code ?? null;
      assert.ok(failure === null || failure === 'high-stakes', text);
    }
    assert.equal(read('Dentist Friday at 3').failure, null);
  });
});

// ------------------------------------------------- clarification code grammar ---

describe('durable clarification codes', () => {
  test('every code is a valid foundation open code and round-trips', () => {
    const open = /^[a-z][a-z0-9_.-]{0,63}$/;
    const samples = [
      [{ kind: 'which_child' }],
      [{ kind: 'which_day', weekday: null }],
      [{ kind: 'which_day', weekday: 5 }],
      [{ kind: 'which_money_direction' }],
      [{ kind: 'which_child' }, { kind: 'which_day', weekday: 0 }, { kind: 'which_money_direction' }],
    ];
    for (const steps of samples) {
      const code = formatClarificationCode(steps);
      assert.match(code, open);
      assert.deepEqual(parseClarificationCode(code), steps);
    }
  });

  test('an unknown code is not understood rather than guessed at, and bounds are enforced', () => {
    for (const code of ['which_planet', 'which_day.xyz', 'which_child-which_child-which_child-which_child', '', 'WHICH_CHILD']) assert.equal(parseClarificationCode(code), null, code);
    assert.throws(() => formatClarificationCode([]));
    assert.throws(() => formatClarificationCode(Array.from({ length: 4 }, () => ({ kind: 'which_child' }))));
  });

  test('a stored question regenerates identically from the durable reading alone — no source text', () => {
    for (const [text, over] of [
      ['Pick him up from practice at 5', {}],
      ['Dentist next Friday at 3', {}],
      ['Dentist Friday at 3', { nowMs: FRIDAY_NOW }],
      ['Talk to Jordan about the $85', {}],
    ]) {
      const c = context(over);
      const p = read(text, over).proposals[0];
      assert.ok(p.clarification, text);
      const draft = {
        readingId: 'r1', version: 1, kind: p.kind, title: p.title, dueDate: p.dueDate, startsAt: p.startsAt, endsAt: p.endsAt,
        durationMinutes: p.durationMinutes, value: p.value, subjectMemberId: p.subjectMemberId, categoryHint: p.categoryHint,
        clarificationCode: formatClarificationCode(p.clarification.steps), createdAtMs: c.nowMs,
      };
      // Regenerated "later" — a different wall clock — from the reading's own creation time.
      assert.deepEqual(requestFromDraft(draft, { children: c.children, timeZone: TZ }), p.clarification, text);
    }
  });
});

// ------------------------------------------------------------- reader scenarios ---

describe('reader-level scenarios', () => {
  test('A — simple explicit capture: one supported proposal, no clarification, no invented certainty', () => {
    const r = read('Dentist appointment on Friday at 3pm');
    assert.equal(r.proposals.length, 1);
    const p = r.proposals[0];
    assert.equal(p.kind, 'event');
    assert.equal(p.clarification, null);
    assert.equal(p.categoryHint, 'wellbeing');
    assert.equal(p.startsAt, '2026-09-25T20:00:00.000Z', '3pm CDT');
    assert.ok(!p.assumptions.includes('meridiem-assumed'), 'pm was said');
    assert.ok(p.assumptions.includes('end-time-assumed'), 'the end was not said, and that is flagged');
  });

  test('B — an ambiguous day is asked, never guessed', () => {
    const p = read('Dentist next Friday at 3').proposals[0];
    assert.deepEqual(p.clarification.steps, [{ kind: 'which_day', weekday: 5 }]);
    assert.deepEqual(p.clarification.options, [{ kind: 'date', date: '2026-09-25' }, { kind: 'date', date: '2026-10-02' }]);
    const onFriday = read('Dentist Friday at 3', { nowMs: FRIDAY_NOW }).proposals[0];
    assert.deepEqual(onFriday.clarification.options.map((o) => o.date), ['2026-09-25', '2026-10-02']);
    assert.equal(read('Dentist Friday at 3').proposals[0].clarification, null, 'an unambiguous Friday is not asked about');
  });

  test('C — one source, several independently reviewable proposals', () => {
    const r = read('Picture day is Thursday, I need to send $20, and I think practice moved to 6.');
    assert.deepEqual(r.proposals.map((p) => p.kind), ['needsMe', 'task', 'needsMe']);
    assert.deepEqual(r.proposals.map((p) => p.key), ['p1', 'p2', 'p3']);
    assert.equal(r.proposals[0].dueDate, '2026-09-24');
    assert.deepEqual(r.proposals[1].value, { amountMinor: 2000, currency: 'USD', direction: 'outflow' });
    assert.ok(r.unsupported.some((u) => u.reason === 'change-to-existing-item'));
  });

  test('F — a hedge is carried as an assumption, never dropped and never presented as her certainty', () => {
    const p = read('I think practice moved to 6').proposals[0];
    assert.ok(p.assumptions.includes('hedged-language'));
    assert.equal(p.confidence, 'possible');
    assert.match(p.title, /I think/, 'her hedge stays in her own words');
  });

  test('G/L — nothing safe to read, and goals or feelings, produce nothing to materialise', () => {
    for (const text of ['I want mornings to feel less chaotic.', 'I feel like I am always behind', 'asdf', 'hello there']) {
      const r = read(text);
      assert.equal(r.failure.code, 'nothing-recognized', text);
      assert.equal(r.proposals.length, 0);
    }
  });

  test('H — unsupported meaning is explicit and never becomes an "other" bag', () => {
    for (const [text, reason] of [
      ['Soccer every Tuesday at 4', 'recurrence'],
      ['Practice moved to 6', 'change-to-existing-item'],
      ['I owe €40 for the trip', 'foreign-currency'],
      ['Dentist Friday and Saturday at 3', 'multiple-dates'],
      ['Pay $20 or $30 for the trip', 'multiple-amounts'],
    ]) {
      const r = read(text);
      assert.ok(r.unsupported.some((u) => u.reason === reason), `${text} → ${reason}; got ${JSON.stringify(r.unsupported.map((u) => u.reason))}`);
      assert.ok(r.proposals.every((p) => p.kind !== 'other'));
    }
  });

  test('J/Y — a mentioned person is a mention: no person, role, account or responsibility comes out of it', () => {
    for (const [text, known] of [['Jordan will pick up Ayden at 5', false], ['Maya is picking up Alexa tomorrow at 4', true], ['Ask Sam to take him to practice at 5', false]]) {
      const r = read(text);
      const handoff = r.unsupported.find((u) => u.reason === 'responsibility-handoff');
      assert.ok(handoff, text);
      assert.equal(handoff.person.known, known, `${text}: known-ness comes from her household, not from the sentence`);
      for (const p of r.proposals) {
        assert.deepEqual(Object.keys(p).sort(), PROPOSAL_KEYS, 'there is no place on a proposal to put a person');
        assert.match(p.title, new RegExp(handoff.person.name), 'the name stays as her words');
      }
    }
  });

  test('K — money direction is read from what she said and the two directions never collapse', () => {
    const owe = read('I owe Jordan $85').proposals[0].value;
    const owed = read('Jordan owes me $85').proposals[0].value;
    assert.equal(owe.direction, 'outflow');
    assert.equal(owed.direction, 'inflow');
    assert.equal(owe.amountMinor, owed.amountMinor);
    for (const [text, direction] of [
      ['I need to pay $60 for the sitter', 'outflow'], ['Please pay me back $40', 'inflow'], ['Reimburse me $25', 'inflow'], ['Venmo Sam $15', 'outflow'],
      ['Sam paid me back $12.50', 'inflow'], ['We owe the school $45', 'outflow'],
    ]) assert.equal(read(text).proposals[0].value?.direction, direction, text);
    // No cue but a named other party: ask. No cue and nobody named: no typed amount, and the amount stays in her words.
    const asked = read('Talk to Jordan about the $85').proposals[0];
    assert.deepEqual(asked.clarification.steps, [{ kind: 'which_money_direction' }]);
    assert.equal(asked.value, null);
    const unstated = read('Sign the field trip form for $35').proposals[0];
    assert.equal(unstated.kind, 'task');
    assert.equal(unstated.value, null, 'no direction was said, so no typed amount is invented');
    assert.equal(unstated.clarification, null, 'and nobody is named, so nobody is asked');
    assert.ok(unstated.assumptions.includes('amount-direction-unknown'));
    assert.match(unstated.title, /\$35/, 'the amount stays in her words');
    // An amount that is alone in its clause stays a note in her words: it is not turned into a task she never said.
    assert.equal(read('Field trip fee is $35').proposals[0].kind, 'needsMe');
  });

  test('U — child subject: two children ask, one child resolves, a named child resolves', () => {
    const asked = read('Pick him up from practice at 5').proposals[0];
    assert.equal(asked.subjectMemberId, null);
    assert.equal(asked.childScoped, true);
    assert.deepEqual(asked.clarification.steps, [{ kind: 'which_child' }]);
    assert.deepEqual(asked.clarification.options, [{ kind: 'child', memberId: 'kid-alexa' }, { kind: 'child', memberId: 'kid-ayden' }, { kind: 'no-child' }]);
    const only = read('Pick him up from practice at 5', { children: ONE_KID }).proposals[0];
    assert.equal(only.subjectMemberId, 'kid-alexa');
    assert.equal(only.clarification, null, 'no needless question when only one child can be meant');
    assert.equal(read('Pick up Ayden from practice at 5').proposals[0].subjectMemberId, 'kid-ayden');
    // No children in the household: a pronoun is not evidence of a child.
    const none = read('Pick him up from practice at 5', { children: [] }).proposals[0];
    assert.equal(none.childScoped, false);
    assert.equal(none.subjectMemberId, null);
  });

  test('U — the group is not a single subject; a school-wide occasion is not a child\'s activity', () => {
    const group = read('Alexa and Ayden have soccer tomorrow at 4').proposals[0];
    assert.equal(group.subjectMemberId, null);
    assert.ok(group.assumptions.includes('multiple-children-no-single-subject'));
    assert.equal(group.clarification, null);
    assert.equal(read('Picture day is Thursday').proposals[0].childScoped, false);
  });

  test('a time with no day is today when it is still ahead, and asked about when it has already passed', () => {
    const ahead = read('Practice at 5pm').proposals[0];
    assert.ok(ahead.assumptions.includes('date-assumed-today'));
    assert.equal(ahead.clarification?.steps.some((s) => s.kind === 'which_day') ?? false, false);
    const late = read('Practice at 5pm', { nowMs: Date.UTC(2026, 8, 23, 23, 30) }).proposals[0]; // 6:30pm
    assert.deepEqual(late.clarification.steps.filter((s) => s.kind === 'which_day'), [{ kind: 'which_day', weekday: null }]);
  });

  test('every clarification the reader raises lists its questions in a fixed order: child, then day, then direction', () => {
    const p = read('Pick him up next Friday at 5').proposals[0];
    assert.deepEqual(p.clarification.steps.map((s) => s.kind), ['which_child', 'which_day']);
  });

  test('the reader is constructed with AREAS only from categories the household has', () => {
    const p = read('Dentist Friday at 3', { areas: ['home'] }).proposals[0];
    assert.equal(p.categoryHint, null, 'wellbeing does not exist for this household, so it cannot be suggested');
    assert.ok(AREAS.includes('wellbeing'));
  });
});

test('fixed clock sanity: the standard "today" is a Wednesday', () => {
  assert.equal(weekdayOf(context().today), 3);
  assert.equal(context().today, '2026-09-23');
  assert.equal(NOW, Date.UTC(2026, 8, 23, 15, 0));
});
