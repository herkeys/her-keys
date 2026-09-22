import { DEFAULT_ASSUMED_EVENT_MINUTES } from '../revise';
import type { RuleId } from '../types';
import { MAX_CLAUSES } from './clauses';
import { PROCESSING_LIMIT_CHARS } from './interpret';

/**
 * LOCAL INTERPRETER CAPABILITY ENVELOPE.
 *
 * The deterministic reader is NOT a stand-in for Gemini or any language model. This file is the whole,
 * honest list of what it can read. It is executable documentation: `tests/talkItOutCapture.envelope`
 * feeds every variant below through the real reader and fails if a variant does not fire the rule it is
 * listed under. Passing therefore proves RULE-LEVEL behaviour on more than one phrasing per rule — it does
 * not, and must never be read to, prove general natural-language understanding.
 *
 * Anything outside the envelope comes back as an explicit failure or an `UnsupportedItem`.
 */

export interface EnvelopeRule {
  id: RuleId;
  summary: string;
  /** Distinct phrasings of the rule. Every one must fire `id` (evidence) under the standard test household. */
  variants: readonly string[];
}

export const CAPABILITY_ENVELOPE: readonly EnvelopeRule[] = [
  {
    id: 'date.weekday',
    summary: 'A weekday name (full, or tues/thurs/thu/fri; mon/wed/sat/sun only after this/next/on), optionally with this/next/coming. Doubtful cases are asked, not guessed.',
    variants: ['Dentist Friday at 3', 'Dentist on Friday at 3pm', 'Dentist this Friday at 3', 'Teacher conference on Thu at 4', 'Meeting on Tues at 9am'],
  },
  {
    id: 'date.relative',
    summary: 'today, tonight, tomorrow, day after tomorrow, in N days/weeks.',
    variants: ['Call the school tomorrow', 'Dentist today at 4pm', 'Pay the electric bill in 3 days', 'Drop off the form day after tomorrow', 'Dinner tonight at 7'],
  },
  {
    id: 'date.calendar',
    summary: 'Month + day ("Sept 25", "September 30th", "25 Oct") or numeric month/day ("9/28"). The next occurrence is used and flagged when it rolls into next year.',
    variants: ['Sept 25 field trip permission slip due', 'Send the form by September 30th', 'Book the plumber 9/28 at 10am', 'Renew registration on 10 Oct'],
  },
  {
    id: 'date.day-of-month',
    summary: '"the 1st", "the 15th": the next such day of the month.',
    variants: ['I need to pay rent by the 1st', 'Recital is on the 15th', 'Send the check by the 30th'],
  },
  {
    id: 'time.clock',
    summary: 'A clock time: 3pm, 3:30 p.m., 15:00, "at 5", noon, "5 o\'clock". A missing am/pm is ASSUMED from surrounding words (or 1–6 → pm, 7–11 → am) and always flagged.',
    variants: ['Dentist Friday at 3', 'Practice tomorrow at 5:30 pm', 'Meeting Friday 15:00', 'Lunch tomorrow at noon', 'Pickup today at 5 o\'clock'],
  },
  {
    id: 'time.range',
    summary: 'A start–end range: "from 3 to 4", "4-5pm", "6pm to 7:30pm".',
    variants: ['Dentist Friday from 3 to 4', 'Piano lesson tomorrow 4-5pm', 'Yoga Thursday 6pm to 7:30pm'],
  },
  {
    id: 'time.duration',
    summary: 'A stated length: "for an hour", "for 45 minutes", "half an hour", "a 30-minute …". With none stated an event is assumed to last 30 minutes (the calendar form\'s own default) and flagged.',
    variants: ['Dentist Friday at 3 for an hour', 'Practice tomorrow at 4 for 45 minutes', 'Call school tomorrow at 9 for half an hour', 'A 30-minute check-in Friday at 2'],
  },
  {
    id: 'money.amount',
    summary: 'US dollars only: $85, $12.50, 85 dollars, 20 bucks. Exact minor units; another currency is reported unsupported.',
    variants: ['I need to send $20', 'Pay the plumber 85 dollars', 'Send $12.50 for the book fair', 'Bring 20 bucks for pizza day'],
  },
  {
    id: 'money.direction',
    summary: 'Direction only from stated cues: I owe / pay / send / bring (outflow); owes me / pay me back / reimburse me (inflow). With an amount and a named other party but no cue, the reader ASKS; with neither it records no typed amount.',
    variants: ['I owe Jordan $85', 'Jordan owes me $85', 'Please pay me back $40', 'Reimburse me $25', 'I need to pay $60 for the sitter'],
  },
  {
    id: 'child.named',
    summary: 'A first name that is one of her children (whole word, possessive ok).',
    variants: ['Ayden has practice tomorrow at 4', 'Pick up Alexa at 3', 'Alexa\'s dentist appointment Friday at 2'],
  },
  {
    id: 'child.object-pronoun',
    summary: 'An object pronoun after a child-facing verb: pick HIM up, drop HER off. Resolves only when exactly one child could be meant; otherwise asks.',
    variants: ['Pick him up from practice at 5', 'Drop her off at school tomorrow', 'Bring him his cleats tomorrow'],
  },
  {
    id: 'child.noun',
    summary: '"my son", "our daughter", "the youngest", "my kid".',
    variants: ['My son has a game Saturday at 10am', 'Take my daughter to the doctor tomorrow at 4', 'Our youngest has a recital Friday at 6pm'],
  },
  {
    id: 'child.activity',
    summary: 'An activity that belongs to a child (practice, lesson, recital, game…), with no one named. School-wide occasions (picture day, field trip) are deliberately excluded.',
    variants: ['Piano lesson Thursday at 4', 'Soccer practice tomorrow at 5', 'Recital Friday at 7pm'],
  },
  {
    id: 'area.keyword',
    summary: 'Which of her areas a clause most plainly belongs to, from keyword sets. A tie or no hit means no hint (she picks the area when she accepts).',
    variants: ['Dentist Friday at 3', 'Pay the electric bill by Friday', 'Team meeting tomorrow at 9', 'Plumber tomorrow at 10', 'Pick up groceries tomorrow'],
  },
  {
    id: 'kind.obligation',
    summary: 'An obligation or instruction ("I need to…", "remember to…", "don\'t forget to…", an opening verb such as call/send/pay/bring) becomes a task, with a due date only when a day was said.',
    variants: ['I need to call the school', 'Remember to sign the form', 'Don\'t forget to bring the permission slip', 'Call the dentist tomorrow', 'We have to renew the passports'],
  },
  {
    id: 'kind.appointment',
    summary: 'A clock time with a day (or today) becomes an event. A "by 3pm" deadline stays a task with the time kept in its title.',
    variants: ['Dentist Friday at 3', 'Practice tomorrow at 5', 'Lunch with Maya Thursday at noon'],
  },
  {
    id: 'kind.dated-note',
    summary: 'A date with no action ("Picture day is Thursday") becomes a NOTE that names the date — not a task she never said.',
    variants: ['Picture day is Thursday', 'Report cards come out on the 30th', 'Teacher conferences are Oct 12'],
  },
  {
    id: 'kind.note-only',
    summary: 'Recognised but not representable as a structured row — a change to something that already exists, a recurrence, several dates/times/amounts, another currency. Kept as a NOTE in her own words and reported as unsupported.',
    variants: ['Practice moved to 6', 'Soccer every Tuesday at 4', 'I owe €40 for the trip', 'Dentist Friday and Saturday at 3'],
  },
];

export const ENVELOPE_LIMITS = {
  /** Text longer than this is not read at all (and is never claimed to have been). */
  processingLimitChars: PROCESSING_LIMIT_CHARS,
  /** More separate clauses than this are not read; the remainder is reported unsupported ('clause-limit'). */
  maxClauses: MAX_CLAUSES,
  assumedEventMinutes: DEFAULT_ASSUMED_EVENT_MINUTES,
  /** Clarification steps per reading (which child, which day, which direction) — a bound by construction. */
  maxClarificationSteps: 3,
  /** Free-text answers the reader will fail to follow, per reading, before it stops asking and offers manual correction. */
  maxUnderstoodRetries: 3,
} as const;

/** What the reader does NOT do, and what happens instead. The honest edge of the envelope. */
export const NOT_SUPPORTED: ReadonlyArray<{ topic: string; behavior: string }> = [
  { topic: 'General language understanding, tone, sarcasm, long narratives', behavior: 'Nothing recognised → source kept unresolved; feelings-and-goals talk falls through to the existing discovery conversation.' },
  { topic: 'Recurring things ("every Tuesday")', behavior: 'Kept as a note in her words; reported unsupported (belongs to Systems / routines).' },
  { topic: 'Changes to something that already exists ("practice moved to 6")', behavior: 'Kept as a note in her words; there is no "update an existing item" reading.' },
  { topic: 'Who is responsible ("Jordan will pick up Ayden")', behavior: 'The plan is read; the responsible person stays words in the title and the review says nothing was recorded about them. No person, role, account or responsibility is created.' },
  { topic: 'Goals, patterns, context', behavior: 'Not turned into tasks. Reported as not-turned-into-anything; the discovery conversation handles feelings-and-goals talk.' },
  { topic: 'Currencies other than USD', behavior: 'Kept as a note; reported unsupported. Never coerced to dollars.' },
  { topic: 'Sensitive, dangerous or high-stakes content', behavior: 'Not read at all (stopgap guard, OD-2). No proposals, nothing saved, nothing sent anywhere.' },
  { topic: 'Voice', behavior: 'No transcription exists; the affordance is hidden.' },
];
