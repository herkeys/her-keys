/**
 * HK-FEATURE-05 — time in the household's own zone, including the two daylight-saving cases (scenarios AG, AH, AI).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { clockText, dayPhrase, momentAt, parseClockInput, rangeText, resolveWallTime } from '../../src/features/kids/time.ts';

describe('dayPhrase', () => {
  test('relative words, weekdays within the week, dates beyond', () => {
    const today = '2026-09-21'; // Monday
    assert.equal(dayPhrase('2026-09-21', today), 'Today');
    assert.equal(dayPhrase('2026-09-22', today), 'Tomorrow');
    assert.equal(dayPhrase('2026-09-20', today), 'Yesterday');
    assert.equal(dayPhrase('2026-09-24', today), 'Thursday');
    assert.equal(dayPhrase('2026-09-27', today), 'Sunday');
    assert.equal(dayPhrase('2026-09-28', today), 'Sep 28');
    assert.equal(dayPhrase('2027-01-05', today), 'Jan 5, 2027');
    assert.equal(dayPhrase('2026-09-10', today), 'Sep 10');
  });
});

describe('clock text and parsing', () => {
  test('12-hour text, midnight and noon', () => {
    assert.equal(clockText(0), '12:00 AM');
    assert.equal(clockText(720), '12:00 PM');
    assert.equal(clockText(16 * 60 + 30), '4:30 PM');
    assert.equal(clockText(9 * 60 + 5), '9:05 AM');
  });

  test('parses 12-hour and 24-hour input; refuses nonsense', () => {
    assert.equal(parseClockInput('4:30 PM'), 990);
    assert.equal(parseClockInput('4:30pm'), 990);
    assert.equal(parseClockInput('16:30'), 990);
    assert.equal(parseClockInput('12:00 AM'), 0);
    assert.equal(parseClockInput('12:15 PM'), 735);
    assert.equal(parseClockInput('9:05'), 545);
    for (const bad of ['', '25:00', '4:60', '13:00 PM', '0:30 AM', 'noon', '4', '4:5 PM']) assert.equal(parseClockInput(bad), null, bad);
  });

  test('ranges share a meridiem when they can and say when they run into the next day', () => {
    const at = (h, m = 0, date = '2026-09-22') => ({ localDate: date, minutesOfDay: h * 60 + m });
    assert.equal(rangeText(at(16, 30), at(17, 30)), '4:30–5:30 PM');
    assert.equal(rangeText(at(11, 30), at(13)), '11:30 AM–1:00 PM');
    assert.equal(rangeText(at(23, 30), at(0, 30, '2026-09-23')), '11:30 PM–12:30 AM (next day)');
    assert.equal(rangeText(at(16, 30), null), '4:30 PM');
  });
});

describe('wall time -> a real moment, with daylight saving named rather than hidden', () => {
  const NY = 'America/New_York';

  test('an ordinary time is exact and unadjusted', () => {
    const r = resolveWallTime('2026-09-22', 17 * 60, 'America/Chicago');
    assert.equal(r.adjusted, null);
    assert.equal(new Date(r.epochMs).toISOString(), '2026-09-22T22:00:00.000Z');
  });

  test('spring forward: 2:30 AM does not exist on 2026-03-08 and is said to be adjusted (AH)', () => {
    const r = resolveWallTime('2026-03-08', 2 * 60 + 30, NY);
    assert.equal(r.adjusted, 'gap');
    // The first real moment after the gap: 3:30 AM EDT = 07:30Z.
    assert.equal(new Date(r.epochMs).toISOString(), '2026-03-08T07:30:00.000Z');
    assert.equal(momentAt(r.epochMs, NY).minutesOfDay, 3 * 60 + 30);
  });

  test('fall back: 1:30 AM happens twice on 2026-11-01 and the FIRST is taken and said so (AI)', () => {
    const r = resolveWallTime('2026-11-01', 60 + 30, NY);
    assert.equal(r.adjusted, 'repeated');
    assert.equal(new Date(r.epochMs).toISOString(), '2026-11-01T05:30:00.000Z'); // EDT, the first 1:30
  });

  test('either side of the change is an ordinary time', () => {
    assert.equal(resolveWallTime('2026-03-08', 60 + 30, NY).adjusted, null); // 1:30 exists
    assert.equal(resolveWallTime('2026-03-08', 3 * 60 + 30, NY).adjusted, null);
    assert.equal(resolveWallTime('2026-11-01', 12 * 60, NY).adjusted, null);
  });

  test('the logical day turns over at the household midnight, not at UTC midnight (AG)', () => {
    // 03:30Z on the 22nd is 22:30 on the 21st in Chicago.
    assert.equal(momentAt(Date.UTC(2026, 8, 22, 3, 30), 'America/Chicago').localDate, '2026-09-21');
    assert.equal(momentAt(Date.UTC(2026, 8, 22, 5, 30), 'America/Chicago').localDate, '2026-09-22');
  });
});
