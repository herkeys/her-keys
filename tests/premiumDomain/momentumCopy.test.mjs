/**
 * The words the weekly review is allowed to say. Pinned as a table so a screen can never quietly compose a claim the evidence does not
 * support: no time "recovered", nothing "prevented", no score, no percentage, no praise, no streak, no direction called good or bad.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { COPY, basedOnLine, comparisonLines, comparisonUnavailableLine, countLines, insufficientBody, nextStepBody, nextStepHeadline, patternLine, periodLabel, savedLine, savedReviewLine, tierExplanation, tierLabel, unavailableLine } from '../../src/features/momentum/premium/copy.ts';

const ZERO = { tasksCompleted: 0, itemsCompleted: 0, oneMovesCompleted: 0, routinesDone: 0, routinesSkipped: 0, routinesMissed: 0, postponements: 0, postponedTasks: 0, finishedAfterPostponing: 0, suggestionsApplied: 0, suggestionsReverted: 0, suggestionsDeclined: 0, delegationsAccepted: 0, delegationsCompleted: 0, totalEvents: 0, activeDays: 0 };
const BUSY = { ...ZERO, tasksCompleted: 5, itemsCompleted: 2, oneMovesCompleted: 1, routinesDone: 3, routinesSkipped: 1, routinesMissed: 2, postponements: 4, postponedTasks: 2, finishedAfterPostponing: 1, suggestionsApplied: 2, suggestionsReverted: 1, suggestionsDeclined: 3, delegationsAccepted: 2, delegationsCompleted: 1, totalEvents: 30, activeDays: 7 };

const FORBIDDEN = /hours?\b|minutes? (saved|back|recovered)|saved you|recover|prevent|conflicts? (avoided|prevented)|score|\d\s?%|percent|streak|great|amazing|well done|good job|productiv|improv|\bbetter\b|\bworse\b|\bbest\b|keep it up|stress|calm|peace/i;

const everyString = () => {
  const out = [];
  const walk = (value) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(COPY);
  out.push(...countLines(BUSY), ...comparisonLines({ tasksCompleted: 3, postponedTasks: -2, suggestionsApplied: 0, delegationsAccepted: 1 }), comparisonUnavailableLine);
  out.push(insufficientBody('nothing_recorded', { events: 0, activeDays: 0 }, { events: 5, activeDays: 3 }), insufficientBody('too_little_recorded', { events: 2, activeDays: 1 }, { events: 5, activeDays: 3 }));
  for (const tier of ['possible', 'likely', 'established']) out.push(tierLabel[tier], tierExplanation({ tier, sightings: 3 }));
  out.push(nextStepHeadline('Call the plumber'), nextStepHeadline(null), nextStepBody);
  for (const saved of ['recorded', 'already_saved', 'pending']) out.push(savedLine(saved));
  out.push(unavailableLine({ kind: 'unavailable', reason: 'receipts' }), unavailableLine({ kind: 'unavailable', reason: 'server' }));
  out.push(basedOnLine({ observationIds: ['a'], decisionIds: ['b'], truncated: true }));
  return out;
};

describe('MOMC — what the review may say', () => {
  test('no sentence anywhere claims time recovered, conflicts prevented, a score, praise or a judgement', () => {
    for (const text of everyString()) assert.doesNotMatch(text, FORBIDDEN, text);
  });

  test('no price, plan name or limit appears (none is owner-approved), and the customer-facing name is "Her Keys Premium"', () => {
    const text = everyString().join(' ');
    assert.doesNotMatch(text, /\$|per (month|year)|her_keys_plus|Her Keys\+|\b150\b|\b60\b|\b31\b/);
    assert.ok(everyString().some((s) => s.includes('Her Keys Premium')));
  });

  test('a zero count is never mentioned: an empty week says nothing, rather than "0 tasks"', () => {
    assert.deepEqual(countLines(ZERO), []);
    for (const line of countLines({ ...ZERO, tasksCompleted: 1 })) assert.doesNotMatch(line, /\b0\b/);
  });

  test('singular and plural agree', () => {
    assert.deepEqual(countLines({ ...ZERO, tasksCompleted: 1 }), ['You finished 1 task.']);
    assert.deepEqual(countLines({ ...ZERO, tasksCompleted: 2 }), ['You finished 2 tasks.']);
    assert.deepEqual(countLines({ ...ZERO, postponements: 1, postponedTasks: 1 }), ['You moved 1 task to a later day.']);
    assert.deepEqual(countLines({ ...ZERO, postponements: 3, postponedTasks: 1 }), ['You moved 1 task to a later day, 3 times in all.']);
  });

  test('every line is a count of something recorded, and an approved suggestion is credited to the suggestion, not to her postponing', () => {
    const lines = countLines({ ...ZERO, suggestionsApplied: 2 });
    assert.deepEqual(lines, ['You approved 2 changes suggested by Her Keys Premium, and they are still in place.']);
    assert.ok(!countLines({ ...ZERO, suggestionsApplied: 2 }).some((l) => /moved .* to a later day/.test(l)));
  });

  test('a comparison is a signed difference in a count and never calls either direction good or bad', () => {
    assert.deepEqual(comparisonLines({ tasksCompleted: 3 }), ['3 more tasks finished than the week before.']);
    assert.deepEqual(comparisonLines({ tasksCompleted: 1 }), ['1 more task finished than the week before.']);
    assert.deepEqual(comparisonLines({ postponedTasks: -2 }), ['2 fewer tasks moved to a later day than the week before.']);
    assert.deepEqual(comparisonLines({ suggestionsApplied: 0 }), ['The same number of suggested changes approved as the week before.']);
  });

  test('the actual period is always named, by date', () => {
    assert.equal(periodLabel({ start: '2026-09-10', end: '2026-09-16' }), 'Sep 10 to Sep 16');
    assert.equal(periodLabel({ start: '2026-12-28', end: '2027-01-03' }), 'Dec 28 to Jan 3');
  });

  test('the thin-history message states exactly what exists and what a review needs — with correct grammar', () => {
    assert.match(insufficientBody('too_little_recorded', { events: 1, activeDays: 1 }, { events: 5, activeDays: 3 }), /there is 1 thing recorded across 1 day\. A review needs at least 5 things across at least 3 different days/);
    assert.match(insufficientBody('too_little_recorded', { events: 4, activeDays: 2 }, { events: 5, activeDays: 3 }), /there are 4 things recorded across 2 days/);
    assert.match(insufficientBody('nothing_recorded', { events: 0, activeDays: 0 }, { events: 5, activeDays: 3 }), /won’t make something up/);
  });

  test('a pattern says how many times, in plain words; "possible" says it is not yet a pattern; only "established" says she confirmed it', () => {
    assert.match(tierExplanation({ tier: 'possible', sightings: 2 }), /not yet enough to call it a pattern/);
    assert.doesNotMatch(tierExplanation({ tier: 'likely', sightings: 3 }), /confirm/i);
    assert.match(tierExplanation({ tier: 'established', sightings: 5 }), /You confirmed this one yourself/);
    assert.equal(tierLabel.established, 'Confirmed by you');
  });

  test('a pattern about a removed item says so instead of keeping a copy of what she removed', () => {
    const titleOf = () => null;
    assert.match(patternLine({ kind: 'repeated_postponement', about: { kind: 'task', id: 't' }, weekday: null, sightings: 3 }, titleOf), /^An item you’ve since removed has been moved to a later day 3 times/);
    assert.match(patternLine({ kind: 'repeated_postponement', about: { kind: 'task', id: 't' }, weekday: null, sightings: 2 }, () => 'Call the plumber'), /^“Call the plumber” has been moved to a later day 2 times/);
  });

  test('a weekday pattern names the right weekday', () => {
    const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    names.forEach((name, weekday) => assert.match(patternLine({ kind: 'weekday_slippage', about: null, weekday, sightings: 3 }, () => null), new RegExp(`for ${name} keep getting moved`)));
  });

  test('"saved" is claimed only for a copy that is saved; a pending copy says exactly that', () => {
    assert.match(savedLine('recorded'), /is saved/);
    assert.match(savedLine('already_saved'), /earlier today is saved/);
    assert.doesNotMatch(savedLine('pending'), /\bis saved\b/);
    assert.match(savedLine('pending'), /hasn’t been saved yet/);
  });

  test('approving the next step is described as recording her choice, never as doing anything', () => {
    assert.match(COPY.nextStep.scope, /only records that you decided to look\. Nothing is moved, changed or finished for you\./);
    assert.equal(savedReviewLine({ period: { start: '2026-09-03', end: '2026-09-09' }, counts: { ...ZERO, tasksCompleted: 1 } }), 'Sep 3 to Sep 9 · 1 task finished');
  });
});
