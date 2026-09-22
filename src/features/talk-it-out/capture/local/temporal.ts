import { addDays, formatLocalDate, isLocalDate, parseLocalDate, weekdayOf, type LocalDate } from '../../../../domain/logicalDay';
import { MONTHS, NUMBER_WORDS } from './lexicon';

/**
 * Dates and clock times, read by RULE (not by lookup of known sentences). Each finder returns spans into
 * the text it was given so a caller can remove exactly what was read and keep everything else.
 */

export interface Span {
  start: number;
  end: number;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

// -------------------------------------------------------------------- dates ---

export type DateExpr =
  | { rule: 'date.weekday'; span: Span; weekday: number; modifier: 'none' | 'this' | 'next' | 'coming' }
  | { rule: 'date.relative'; span: Span; offsetDays: number; tonight: boolean }
  | { rule: 'date.calendar'; span: Span; month: number; day: number; year: number | null }
  | { rule: 'date.day-of-month'; span: Span; day: number };

const PREP = String.raw`(?:\b(?:on|by|due)\s+)?`;
const WEEKDAY_FULL = String.raw`monday|tuesday|wednesday|thursday|friday|saturday|sunday`;
/** Abbreviations that are safe on their own. `mon`, `wed`, `sat`, `sun` are also ordinary words, so they need a cue. */
const WEEKDAY_SAFE_SHORT = String.raw`tues|thurs|thur|thu|tue|fri`;
const WEEKDAY_CUED_SHORT = String.raw`mon|wed|sat|sun`;
const MONTH_ALT = String.raw`jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?`;

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

const monthIndexOf = (token: string): number => MONTHS.indexOf(token.slice(0, 3).toLowerCase()) + 1;

/** A word that, sitting before "may", makes it the verb rather than the month. */
const MAY_VERB_SUBJECT = /\b(?:i|we|you|they|he|she|it|who|that|which|kids?|mom|dad)\s+$/i;

export function findDateExpressions(text: string): DateExpr[] {
  const found: DateExpr[] = [];

  for (const m of text.matchAll(new RegExp(`${PREP}(?:\\b(this|next|coming|upcoming)\\s+)?\\b(${WEEKDAY_FULL}|${WEEKDAY_SAFE_SHORT})\\b\\.?`, 'gi'))) {
    const modifier = (m[1] ?? '').toLowerCase();
    found.push({
      rule: 'date.weekday',
      span: { start: m.index, end: m.index + m[0].length },
      weekday: WEEKDAY_INDEX[m[2].toLowerCase()],
      modifier: modifier === 'this' ? 'this' : modifier === 'next' ? 'next' : modifier === 'coming' || modifier === 'upcoming' ? 'coming' : 'none',
    });
  }
  for (const m of text.matchAll(new RegExp(`${PREP}\\b(this|next|coming|upcoming|on)\\s+(${WEEKDAY_CUED_SHORT})\\b\\.?`, 'gi'))) {
    const cue = m[1].toLowerCase();
    found.push({
      rule: 'date.weekday',
      span: { start: m.index, end: m.index + m[0].length },
      weekday: WEEKDAY_INDEX[m[2].toLowerCase()],
      modifier: cue === 'this' ? 'this' : cue === 'next' ? 'next' : cue === 'on' ? 'none' : 'coming',
    });
  }

  for (const m of text.matchAll(/\b(?:(?:on|by|due)\s+)?(day\s+after\s+tomorrow|tomorrow|tmrw|tmr|today|tonight)\b/gi)) {
    const word = m[1].toLowerCase().replace(/\s+/g, ' ');
    found.push({
      rule: 'date.relative',
      span: { start: m.index, end: m.index + m[0].length },
      offsetDays: word.startsWith('day after') ? 2 : word === 'today' || word === 'tonight' ? 0 : 1,
      tonight: word === 'tonight',
    });
  }
  for (const m of text.matchAll(new RegExp(`\\bin\\s+(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})\\s+(day|days|week|weeks)\\b`, 'gi'))) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
    found.push({
      rule: 'date.relative',
      span: { start: m.index, end: m.index + m[0].length },
      offsetDays: /week/i.test(m[2]) ? n * 7 : n,
      tonight: false,
    });
  }

  for (const m of text.matchAll(new RegExp(`${PREP}(?:\\bthe\\s+)?\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:a\\.?m|p\\.?m|:))`, 'gi'))) {
    if (m[1].toLowerCase() === 'may' && MAY_VERB_SUBJECT.test(text.slice(0, m.index))) continue;
    found.push({ rule: 'date.calendar', span: { start: m.index, end: m.index + m[0].length }, month: monthIndexOf(m[1]), day: Number(m[2]), year: null });
  }
  for (const m of text.matchAll(new RegExp(`${PREP}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b\\.?`, 'gi'))) {
    if (m[2].toLowerCase() === 'may' && MAY_VERB_SUBJECT.test(text.slice(0, m.index))) continue;
    found.push({ rule: 'date.calendar', span: { start: m.index, end: m.index + m[0].length }, month: monthIndexOf(m[2]), day: Number(m[1]), year: null });
  }
  for (const m of text.matchAll(new RegExp(`${PREP}(?<![\\d/.$])\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b(?![\\d/])(?!\\s*(?:of\\b|cups?|tsp|tbsp|lbs?|oz|miles?|hours?|inch|inches|pizza|pound))`, 'g'))) {
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    const year = m[3] === undefined ? null : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    found.push({ rule: 'date.calendar', span: { start: m.index, end: m.index + m[0].length }, month, day: Number(m[2]), year });
  }
  for (const m of text.matchAll(new RegExp(`${PREP}\\bthe\\s+(\\d{1,2})(?:st|nd|rd|th)\\b(?!\\s+(?:grade|floor|place|time|row|graders?))`, 'gi'))) {
    found.push({ rule: 'date.day-of-month', span: { start: m.index, end: m.index + m[0].length }, day: Number(m[1]) });
  }

  // Longest first, then earliest: a wider expression owns its characters.
  found.sort((a, b) => a.span.start - b.span.start || b.span.end - b.span.start - (a.span.end - a.span.start));
  const kept: DateExpr[] = [];
  for (const expr of found) if (!kept.some((k) => overlaps(k.span, expr.span))) kept.push(expr);
  return kept;
}

export type DateResolution =
  | { status: 'resolved'; date: LocalDate; rolledForward: boolean }
  | { status: 'ambiguous'; weekday: number; candidates: [LocalDate, LocalDate] };

/** Days from `today` to the next occurrence of `weekday`, 0 when today is that weekday. */
export const daysUntilWeekday = (today: LocalDate, weekday: number): number => (weekday - weekdayOf(today) + 7) % 7;

/**
 * THE WEEKDAY RULE. "Friday" said on a Wednesday is this coming Friday. It is doubtful — and asked,
 * not guessed — in exactly two cases:
 *   - a bare weekday that is TODAY ("Friday" said on a Friday: today, or a week from today?)
 *   - "next <weekday>" when that weekday is still ahead this week ("next Friday" said on a Wednesday:
 *     the Friday two days away, or the one after?)
 * "this <weekday>" is unambiguous even on that weekday (today); "next <weekday>" on that weekday is
 * seven days on.
 */
export function resolveWeekday(weekday: number, modifier: 'none' | 'this' | 'next' | 'coming', today: LocalDate): DateResolution {
  const d = daysUntilWeekday(today, weekday);
  if (modifier === 'this') return { status: 'resolved', date: addDays(today, d), rolledForward: false };
  if (modifier === 'coming') return { status: 'resolved', date: addDays(today, d === 0 ? 7 : d), rolledForward: false };
  if (modifier === 'none') {
    if (d === 0) return { status: 'ambiguous', weekday, candidates: [today, addDays(today, 7)] };
    return { status: 'resolved', date: addDays(today, d), rolledForward: false };
  }
  // next
  if (d === 0) return { status: 'resolved', date: addDays(today, 7), rolledForward: false };
  return { status: 'ambiguous', weekday, candidates: [addDays(today, d), addDays(today, d + 7)] };
}

/** The two dates a stored `which_day.<weekday>` question is about, anchored to the day the reading was made. */
export function weekdayCandidates(weekday: number, anchor: LocalDate): [LocalDate, LocalDate] {
  const d = daysUntilWeekday(anchor, weekday);
  return d === 0 ? [anchor, addDays(anchor, 7)] : [addDays(anchor, d), addDays(anchor, d + 7)];
}

export function resolveDate(expr: DateExpr, today: LocalDate): DateResolution | null {
  switch (expr.rule) {
    case 'date.weekday':
      return resolveWeekday(expr.weekday, expr.modifier, today);
    case 'date.relative':
      return { status: 'resolved', date: addDays(today, expr.offsetDays), rolledForward: false };
    case 'date.calendar': {
      const { year: thisYear } = parseLocalDate(today);
      const build = (year: number): LocalDate => formatLocalDate({ year, month: expr.month, day: expr.day });
      const first = build(expr.year ?? thisYear);
      if (!isLocalDate(first)) return null;
      if (expr.year !== null || first >= today) return { status: 'resolved', date: first, rolledForward: false };
      const next = build(thisYear + 1);
      return isLocalDate(next) ? { status: 'resolved', date: next, rolledForward: true } : null;
    }
    case 'date.day-of-month': {
      const { year, month } = parseLocalDate(today);
      for (let offset = 0; offset < 13; offset += 1) {
        const total = month - 1 + offset;
        const candidate = formatLocalDate({ year: year + Math.floor(total / 12), month: (total % 12) + 1, day: expr.day });
        if (isLocalDate(candidate) && candidate >= today) return { status: 'resolved', date: candidate, rolledForward: offset > 0 };
      }
      return null;
    }
  }
}

// -------------------------------------------------------------------- times ---

export interface TimeExpr {
  rule: 'time.clock' | 'time.range';
  span: Span;
  startMinutes: number;
  endMinutes: number | null;
  /** True when am/pm was not said and had to be assumed. */
  meridiemAssumed: boolean;
}

export type Meridiem = 'am' | 'pm';

/** Words around a bare hour that say which half of the day it is in. */
export function meridiemHint(text: string): Meridiem | null {
  if (/\b(?:tonight|evening|night|dinner|supper|after\s+school|afternoon)\b/i.test(text)) return 'pm';
  if (/\b(?:morning|breakfast|before\s+school|drop[-\s]?off)\b/i.test(text)) return 'am';
  return null;
}

/** 12 is noon, 1–6 are afternoon, 7–11 are morning — unless a word around it says otherwise. */
const assumeMeridiem = (hour: number, hint: Meridiem | null): Meridiem => hint ?? (hour === 12 ? 'pm' : hour <= 6 ? 'pm' : 'am');

const minutesOf = (hour: number, minute: number, meridiem: Meridiem): number => (hour % 12) * 60 + minute + (meridiem === 'pm' ? 720 : 0);

const normMeridiem = (raw: string | undefined): Meridiem | null => (raw ? (raw.toLowerCase().startsWith('a') ? 'am' : 'pm') : null);

const validClock = (hour: number, minute: number, twelveHour: boolean) =>
  minute >= 0 && minute <= 59 && (twelveHour ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23);

export function findTimeExpressions(text: string, blocked: readonly Span[] = []): TimeExpr[] {
  const hint = meridiemHint(text);
  const found: TimeExpr[] = [];
  const claimed: Span[] = [...blocked];
  const claim = (expr: TimeExpr) => {
    if (claimed.some((c) => overlaps(c, expr.span))) return;
    found.push(expr);
    claimed.push(expr.span);
  };

  // A range: "3-4pm", "from 3 to 4", "3pm to 4:30pm", "11-1pm".
  const range = /(?:\b(from|between)\s+)?(?<![\d/.$:])\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d:/])/gi;
  for (const m of text.matchAll(range)) {
    const [h1, m1, h2, m2] = [Number(m[2]), Number(m[3] ?? 0), Number(m[5]), Number(m[6] ?? 0)];
    const cued = m[1] !== undefined || m[4] !== undefined || m[7] !== undefined || (m[3] !== undefined && m[6] !== undefined);
    if (!cued || !validClock(h1, m1, true) || !validClock(h2, m2, true)) continue;
    let s = normMeridiem(m[4]);
    let e = normMeridiem(m[7]);
    let assumed = false;
    if (!s && !e) {
      s = assumeMeridiem(h1, hint);
      e = assumeMeridiem(h2, hint);
      assumed = true;
    } else if (!s && e) {
      s = e;
      if (minutesOf(h1, m1, s) >= minutesOf(h2, m2, e)) s = s === 'pm' ? 'am' : 'pm';
    } else if (s && !e) {
      e = s;
      if (minutesOf(h2, m2, e) <= minutesOf(h1, m1, s)) e = e === 'pm' ? 'am' : 'pm';
    }
    const start = minutesOf(h1, m1, s as Meridiem);
    const end = minutesOf(h2, m2, e as Meridiem);
    if (end <= start) continue;
    claim({ rule: 'time.range', span: { start: m.index, end: m.index + m[0].length }, startMinutes: start, endMinutes: end, meridiemAssumed: assumed });
  }

  // One time with am/pm said: "3pm", "at 3:30 p.m.".
  for (const m of text.matchAll(/(?:\b(?:at|@)\s*)?(?<![\d:$])\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z0-9])/gi)) {
    const [h, min] = [Number(m[1]), Number(m[2] ?? 0)];
    if (!validClock(h, min, true)) continue;
    claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: minutesOf(h, min, normMeridiem(m[3]) as Meridiem), endMinutes: null, meridiemAssumed: false });
  }

  // 24-hour or bare-colon: "15:00", "08:30", "3:30".
  for (const m of text.matchAll(/(?:\bat\s+)?(?<![\d:$/])\b(\d{1,2}):(\d{2})\b(?!\s*[ap]\.?m)/gi)) {
    const [h, min] = [Number(m[1]), Number(m[2])];
    if (!validClock(h, min, false)) continue;
    const explicit24 = h >= 13 || h === 0 || m[1].length === 2 && m[1].startsWith('0');
    if (explicit24) {
      claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: h * 60 + min, endMinutes: null, meridiemAssumed: false });
    } else {
      const mer = assumeMeridiem(h, hint);
      claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: minutesOf(h, min, mer), endMinutes: null, meridiemAssumed: true });
    }
  }

  // "noon", "midnight".
  for (const m of text.matchAll(/\b(noon|midday|midnight)\b/gi)) {
    claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: m[1].toLowerCase() === 'midnight' ? 0 : 720, endMinutes: null, meridiemAssumed: false });
  }

  // "5 o'clock".
  for (const m of text.matchAll(/\b(\d{1,2})\s*o['’]?clock\b/gi)) {
    const h = Number(m[1]);
    if (!validClock(h, 0, true)) continue;
    claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: minutesOf(h, 0, assumeMeridiem(h, hint)), endMinutes: null, meridiemAssumed: true });
  }

  // "at 5": a bare hour needs the word "at" to be a time at all.
  for (const m of text.matchAll(/\bat\s+(\d{1,2})\b(?!\s*(?:%|percent|dollars?|bucks|\$|kids|people|times|items|things|minutes?|mins?|hours?|:))(?![\d:./])/gi)) {
    const h = Number(m[1]);
    if (!validClock(h, 0, true)) continue;
    claim({ rule: 'time.clock', span: { start: m.index, end: m.index + m[0].length }, startMinutes: minutesOf(h, 0, assumeMeridiem(h, hint)), endMinutes: null, meridiemAssumed: true });
  }

  return found.sort((a, b) => a.span.start - b.span.start);
}

// ---------------------------------------------------------------- durations ---

export interface DurationExpr {
  span: Span;
  minutes: number;
}

export function findDuration(text: string): DurationExpr | null {
  const words = Object.keys(NUMBER_WORDS).join('|');
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/\bfor\s+(?:about\s+|around\s+|roughly\s+)?half\s+an?\s+hour\b/i, () => 30],
    [/\bfor\s+(?:about\s+|around\s+|roughly\s+)?an?\s+hour\s+and\s+a\s+half\b/i, () => 90],
    [
      new RegExp(`\\bfor\\s+(?:about\\s+|around\\s+|roughly\\s+)?(\\d+(?:\\.\\d+)?|${words})\\s*(hours?|hrs?|minutes?|mins?)\\b`, 'i'),
      (m) => {
        const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
        return Math.round(n * (/^h/i.test(m[2]) ? 60 : 1));
      },
    ],
    [/\b(\d{1,3})[-\s]?(?:minute|min)\b/i, (m) => Number(m[1])],
    [/\b(?:an?\s+)?hour[-\s]?long\b/i, () => 60],
  ];
  for (const [regex, minutesOfMatch] of patterns) {
    const m = regex.exec(text);
    if (!m) continue;
    const minutes = minutesOfMatch(m);
    if (minutes >= 1 && minutes <= 1440) return { span: { start: m.index, end: m.index + m[0].length }, minutes };
  }
  return null;
}
