import { parseMoney } from '../../domain/foundation/money';
import { addDays, epochMsOf, logicalDateAt, weekdayOf, type LocalDate } from '../../domain/logicalDay';
import type { AppState, SystemRole } from '../../domain/state';
import type { ExtractRequest, ExtractedProposal, Extraction } from '../../monetization/premiumTypes';
import { DEFAULT_ASSUMED_EVENT_MINUTES, eventInstants, requestFor, sortSteps, verbatimTitle } from '../talk-it-out/capture/revise';
import type {
  AssumptionCode,
  ClarificationStep,
  InterpretationContext,
  InterpretationFailure,
  InterpretationResult,
  Proposal,
  UnsupportedItem,
} from '../talk-it-out/capture/types';

/**
 * Smart Inbox: turning the SERVER's validated extraction into the same `InterpretationResult` the local reader produces, so the whole
 * existing review path (clarify, correct, accept, reject, dismiss) is reused unchanged.
 *
 * The server's answer is treated as UNTRUSTED here too (defence in depth). This module adds the checks only the app can make:
 *   - the model's date is cross-checked against any weekday word in its own quote; a mismatch DROPS the date and asks "which day?"
 *     (a model's calendar arithmetic is never taken on trust);
 *   - an appointment with no time stays a note, never a calendar event with an invented time;
 *   - a child is only ever one of HER children, mapped from the opaque ref the model echoed;
 *   - possible duplicates of what she already has are flagged, never silently merged or dropped;
 *   - every proposal needs her review: nothing here creates a household record.
 */

export interface RequestContext {
  children: Array<{ ref: string; name: string; memberId: string }>;
  people: Array<{ ref: string; name: string }>;
}

/** The minimum a model needs, by short ref. The household's real ids stay on the device. */
export function buildExtractRequest(input: {
  text: string;
  householdId: string;
  idempotencyKey: string;
  context: InterpretationContext;
  appVersion?: string;
}): { request: ExtractRequest; refs: RequestContext } {
  const children = input.context.children.map((child, index) => ({ ref: `c${index + 1}`, name: child.displayName, memberId: child.id }));
  const people = input.context.people.map((person, index) => ({ ref: `p${index + 1}`, name: person.displayName }));
  return {
    refs: { children, people },
    request: {
      householdId: input.householdId,
      idempotencyKey: input.idempotencyKey,
      text: input.text,
      context: {
        timeZone: input.context.timeZone,
        today: input.context.today,
        children: children.map(({ ref, name }) => ({ ref, name })),
        people: people.map(({ ref, name }) => ({ ref, name })),
        areas: [...input.context.areas],
      },
      ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    },
  };
}

const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/\bsun(?:day)?\b/i, 0],
  [/\bmon(?:day)?\b/i, 1],
  [/\btue(?:s|sday)?\b/i, 2],
  [/\bwed(?:nesday)?\b/i, 3],
  [/\bthu(?:r|rs|rsday)?\b/i, 4],
  [/\bfri(?:day)?\b/i, 5],
  [/\bsat(?:urday)?\b/i, 6],
];

/** The weekdays a piece of her own text names. */
export function weekdaysNamed(text: string): number[] {
  return WEEKDAY_WORDS.filter(([pattern]) => pattern.test(text)).map(([, day]) => day);
}

export interface ExistingItem {
  title: string;
  date: LocalDate | null;
}

/** What she already has that a new proposal could duplicate: open tasks and active events, by title and day. */
export function existingItemsOf(state: AppState): ExistingItem[] {
  const tz = state.user.timezone;
  return [
    ...state.tasks.filter((t) => t.status === 'open').map((t): ExistingItem => ({ title: t.title, date: t.dueDate ?? (t.plan.kind === 'day' ? t.plan.date : t.plan.kind === 'timed' ? logicalDateAt(epochMsOf(t.plan.startsAt), tz) : null) })),
    ...state.events.filter((e) => e.status === 'active').map((e): ExistingItem => ({ title: e.title, date: logicalDateAt(epochMsOf(e.startsAt), tz) })),
  ];
}

const normalise = (title: string): string => title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Same day (or either undated) and one title contains the other, ignoring case and punctuation. A warning, never a block. */
export function looksLikeDuplicate(title: string, date: LocalDate | null, existing: readonly ExistingItem[]): boolean {
  const mine = normalise(title);
  if (mine.length < 4) return false;
  return existing.some((item) => {
    const theirs = normalise(item.title);
    if (theirs.length < 4) return false;
    const sameDay = date === null || item.date === null || item.date === date;
    return sameDay && (mine === theirs || mine.includes(theirs) || theirs.includes(mine));
  });
}

export interface MapInput {
  extraction: Extraction;
  text: string;
  context: InterpretationContext;
  refs: RequestContext;
  existing: readonly ExistingItem[];
  captureId: string;
}

const dateOk = (date: string, today: LocalDate): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= addDays(today, -1);

function mapOne(p: ExtractedProposal, input: MapInput): Proposal {
  const { context, refs, text, existing } = input;
  const assumptions: AssumptionCode[] = ['premium-reading'];
  const steps: ClarificationStep[] = [];
  const title = verbatimTitle(p.title);
  if (title.shortened) assumptions.push('title-shortened');

  // ---- the day: cross-check the model's calendar arithmetic against the words it was reading ---------------------------------
  let date: LocalDate | null = p.date !== null && dateOk(p.date, context.today) ? p.date : null;
  const quoted = text.slice(p.span.start, p.span.end);
  const named = weekdaysNamed(quoted);
  if (date !== null && named.length === 1 && weekdayOf(date) !== named[0]) date = null;
  const wantsDay = date === null && (p.ambiguity.includes('which_day') || p.date !== null || named.length > 0);
  if (wantsDay) steps.push({ kind: 'which_day', weekday: named.length === 1 ? named[0] : null });

  // ---- the kind: an appointment needs a day AND a time, or it is a dated note --------------------------------------------------
  let kind = p.kind;
  if (kind === 'event' && (date === null || p.startMinutes === null)) kind = 'needsMe';

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  let durationMinutes: number | null = null;
  if (kind === 'event' && date !== null && p.startMinutes !== null) {
    const minutes = p.durationMinutes ?? (p.endMinutes !== null ? p.endMinutes - p.startMinutes : null);
    if (minutes === null) assumptions.push('end-time-assumed');
    ({ startsAt, endsAt } = eventInstants(date, p.startMinutes, minutes ?? DEFAULT_ASSUMED_EVENT_MINUTES, context.timeZone));
  } else if (kind === 'task') {
    durationMinutes = p.durationMinutes;
  }

  // ---- money: a typed amount only with a stated direction; otherwise she is asked ---------------------------------------------
  let value = null;
  let titleText = title.title;
  if (p.amount !== null) {
    if (p.direction !== null) value = parseMoney(p.amount, 'USD', p.direction);
    else {
      assumptions.push('amount-direction-unknown');
      steps.push({ kind: 'which_money_direction' });
      // The direction question reads the amount from the title, so the title must carry it.
      if (!titleText.replace(/[,\s]/g, '').includes(p.amount.replace(/\.00$/, ''))) titleText = `${titleText} ($${p.amount})`;
    }
  }

  // ---- the child: only one of HER children, mapped from the opaque ref -----------------------------------------------------------
  const child = p.childRef === null ? null : refs.children.find((c) => c.ref === p.childRef) ?? null;
  const childScoped = child !== null || p.childAmbiguous;
  if (child === null && p.ambiguity.includes('which_child') && context.children.length > 0) steps.push({ kind: 'which_child' });

  if (p.hedged) assumptions.push('hedged-language');
  const dueDate = kind === 'event' ? null : date;
  if (looksLikeDuplicate(titleText, kind === 'event' && startsAt !== null ? logicalDateAt(epochMsOf(startsAt), context.timeZone) : dueDate, existing)) assumptions.push('possible-duplicate');

  sortSteps(steps);
  const uniqueSteps = steps.filter((s, i) => steps.findIndex((o) => o.kind === s.kind) === i);
  return {
    key: p.key,
    kind,
    title: titleText.length > 0 ? titleText : title.title,
    dueDate,
    startsAt,
    endsAt,
    durationMinutes,
    value,
    subjectMemberId: child?.memberId ?? null,
    categoryHint: (p.category as SystemRole | null) !== null && context.areas.includes(p.category as SystemRole) ? (p.category as SystemRole) : null,
    confidence: 'possible',
    clarification: requestFor(uniqueSteps, context, context.today),
    assumptions,
    evidence: [],
    childScoped,
    requiresExplicitReview: true,
    span: { start: Math.min(p.span.start, text.length), end: Math.min(Math.max(p.span.end, p.span.start), text.length) },
  };
}

/** Maps a validated server extraction to the reader result the coordinator already knows how to review. */
export function mapExtraction(input: MapInput): InterpretationResult {
  const proposals = input.extraction.proposals.map((p) => mapOne(p, input));
  const unsupported: UnsupportedItem[] = input.extraction.unsupported.map((u) => ({
    reason: u.reason,
    span: { start: Math.min(u.span.start, input.text.length), end: Math.min(Math.max(u.span.end, u.span.start), input.text.length) },
    person: u.person,
  }));
  // Anything the server refused to pass on is NOT silently lost: the whole note is marked as partly unread.
  if (input.extraction.dropped > 0) unsupported.push({ reason: 'context-only', span: { start: 0, end: input.text.length }, person: null });
  const failure: InterpretationFailure | null = proposals.length === 0 && unsupported.length === 0 ? { code: 'nothing-recognized' } : null;
  return { captureId: input.captureId, proposals, unsupported, failure: proposals.length === 0 ? failure : null, processedCharacters: input.text.length };
}
