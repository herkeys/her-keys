/**
 * Shared fixtures for the Feature 02 (Talk It Out + Life Inbox) suites.
 *
 * One fixed clock — Wednesday 23 September 2026, 10:00 in Chicago — so every relative date in every test
 * means the same thing, and a household with two children so a pronoun is genuinely ambiguous.
 */
import { logicalDateAt } from '../../src/domain/logicalDay.ts';
import { interpret } from '../../src/features/talk-it-out/capture/local/interpret.ts';

export const TZ = 'America/Chicago';
/** Wed 2026-09-23 10:00 CDT (UTC-5). */
export const NOW = Date.UTC(2026, 8, 23, 15, 0);
export const FRIDAY_NOW = Date.UTC(2026, 8, 25, 15, 0);
export const AREAS = ['kids', 'home', 'money', 'meals', 'work', 'wellbeing', 'relationships', 'coparenting'];

export const ALEXA = { id: 'kid-alexa', displayName: 'Alexa' };
export const AYDEN = { id: 'kid-ayden', displayName: 'Ayden' };
export const TWO_KIDS = [ALEXA, AYDEN];
export const ONE_KID = [ALEXA];

export function context(over = {}) {
  const nowMs = over.nowMs ?? NOW;
  return {
    nowMs,
    timeZone: TZ,
    today: logicalDateAt(nowMs, TZ),
    children: TWO_KIDS,
    people: [{ id: 'person-maya', displayName: 'Maya' }],
    areas: AREAS,
    ...over,
  };
}

export const read = (text, over = {}) => interpret({ captureId: 'cap-1', text, context: context(over) });

/** Every key a proposal is allowed to have. A bag or an extra field would break this. */
export const PROPOSAL_KEYS = [
  'assumptions', 'categoryHint', 'childScoped', 'clarification', 'confidence', 'dueDate', 'durationMinutes', 'endsAt', 'evidence',
  'key', 'kind', 'requiresExplicitReview', 'span', 'startsAt', 'subjectMemberId', 'title', 'value',
];

/** A tiny deterministic PRNG so a "random" corpus is the same corpus on every machine. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
