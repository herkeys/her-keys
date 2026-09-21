import { epochMsOf, logicalDateAt, zonedTimeToEpochMs, addDays, type LocalDate } from '../../../../domain/logicalDay';
import type { Money } from '../../../../domain/foundation/money';
import { parseClarificationCode } from '../clarificationCodes';
import {
  DEFAULT_ASSUMED_EVENT_MINUTES,
  draftDate,
  eventInstants,
  requestFor,
  revise,
  sortSteps,
  tidyTitle,
  verbatimTitle,
} from '../revise';
import type {
  AssumptionCode,
  ClarificationInput,
  ClarificationStep,
  CorrectionReading,
  CorrectionTextInput,
  EvidenceRef,
  InterpretationContext,
  InterpretationResult,
  Proposal,
  ProposalDraft,
  ProposalKind,
  ProposalPatch,
  TalkItOutInput,
  UnsupportedItem,
  UnsupportedReason,
} from '../types';
import { segment, type Clause } from './clauses';
import {
  CHANGE_TO_EXISTING,
  HEDGE_WORDS,
  HIGH_STAKES,
  IMPERATIVE_VERBS,
  IMPRECISE_DATE,
  OBLIGATION_CUES,
  OBLIGATION_LEAD,
  RECURRENCE,
} from './lexicon';
import { FOREIGN_CURRENCY, findAmounts, findCounterparty, readDirection, type Direction } from './money';
import { findHandoff, hintArea, readChild } from './people';
import {
  findDateExpressions,
  findDuration,
  findTimeExpressions,
  resolveDate,
  weekdayCandidates,
  type DateExpr,
  type Span,
  type TimeExpr,
} from './temporal';

/**
 * The LOCAL, DETERMINISTIC reader. Rules over language, not a lookup of known sentences and not a
 * language model. What it can read is written down in `envelope.ts`; anything else comes back as an
 * explicit failure or an unsupported item, never as an invented understanding.
 */

export const PROCESSING_LIMIT_CHARS = 4000;

const IMPERATIVE_START = new RegExp(`^(?:please\\s+)?(?:${IMPERATIVE_VERBS.join('|')})\\b`, 'i');

// ------------------------------------------------------------------ helpers ---

const shift = (span: Span, by: number): Span => ({ start: span.start + by, end: span.end + by });

/** Remove spans (and only those spans) from a string, leaving everything else exactly as she wrote it. */
function withoutSpans(text: string, spans: readonly Span[]): string {
  let out = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) out = `${out.slice(0, span.start)} ${out.slice(span.end)}`;
  return out;
}

// ---------------------------------------------------------- reading a clause ---

interface ClauseReading {
  proposals: Proposal[];
  unsupported: UnsupportedItem[];
}

const evidence = (field: EvidenceRef['field'], rule: EvidenceRef['rule'], span: Span | null): EvidenceRef => ({ field, rule, span });

function noteProposal(key: string, clause: Clause, reason: UnsupportedReason, hedged: boolean): ClauseReading {
  const { title, shortened } = verbatimTitle(clause.text);
  const assumptions: AssumptionCode[] = [];
  if (hedged) assumptions.push('hedged-language');
  if (shortened) assumptions.push('title-shortened');
  return {
    proposals: [
      {
        key,
        kind: 'needsMe',
        title,
        dueDate: null,
        startsAt: null,
        endsAt: null,
        durationMinutes: null,
        value: null,
        subjectMemberId: null,
        categoryHint: null,
        confidence: 'possible',
        clarification: null,
        assumptions,
        evidence: [evidence('kind', 'kind.note-only', { start: clause.start, end: clause.end })],
        childScoped: false,
        requiresExplicitReview: true,
        span: { start: clause.start, end: clause.end },
      },
    ],
    unsupported: [{ reason, span: { start: clause.start, end: clause.end }, person: null }],
  };
}

function readClause(clause: Clause, ctx: InterpretationContext, nextKey: () => string): ClauseReading {
  const raw = clause.text;
  const at = (s: Span): Span => shift(s, clause.start);
  const clauseSpan = { start: clause.start, end: clause.end };

  const hedged = HEDGE_WORDS.test(raw);
  const dates = findDateExpressions(raw);
  const amounts = findAmounts(raw);
  const times = findTimeExpressions(raw, [...dates.map((d) => d.span), ...amounts.map((a) => a.span)]);
  const duration = findDuration(raw);
  const lead = OBLIGATION_LEAD.exec(raw);
  const imperative = IMPERATIVE_START.test(raw);
  const obligationCue = OBLIGATION_CUES.test(raw);
  const imprecise = IMPRECISE_DATE.test(raw);
  const change = CHANGE_TO_EXISTING.test(raw);
  const recurrence = RECURRENCE.test(raw);
  const foreign = FOREIGN_CURRENCY.test(raw);

  const anchored = dates.length > 0 || times.length > 0 || amounts.length > 0 || Boolean(lead) || imperative || obligationCue || imprecise || change || recurrence || foreign;
  if (!anchored) return { proposals: [], unsupported: [{ reason: 'context-only', span: clauseSpan, person: null }] };

  // Things the durable model has no reading for. Kept as a note in her own words, and reported — never dropped.
  const noteReason: UnsupportedReason | null = recurrence
    ? 'recurrence'
    : change
      ? 'change-to-existing-item'
      : foreign
        ? 'foreign-currency'
        : dates.length > 1
          ? 'multiple-dates'
          : times.length > 1
            ? 'multiple-times'
            : amounts.length > 1
              ? 'multiple-amounts'
              : null;
  if (noteReason) return noteProposal(nextKey(), clause, noteReason, hedged);

  const obligationish = Boolean(lead) || imperative || obligationCue;
  const dateExpr: DateExpr | undefined = dates[0];
  const time: TimeExpr | undefined = times[0];
  const amount = amounts[0];
  const direction: Direction = amount ? readDirection(raw) : 'unknown';
  const counterparty = amount ? findCounterparty(raw) : null;
  const deadlineForm = time ? /\b(?:by|before|due|no\s+later\s+than)\s+$/i.test(raw.slice(0, time.span.start)) : false;

  let kind: ProposalKind;
  if (time && !deadlineForm) kind = 'event';
  else if (obligationish || (amount && (direction !== 'unknown' || counterparty))) kind = 'task';
  else if (dateExpr || time || imprecise || amount) kind = 'needsMe';
  else return { proposals: [], unsupported: [{ reason: 'context-only', span: clauseSpan, person: null }] };

  // A dated statement with no action ("Picture day is Thursday") is a note that names a date, not a task she never said.
  if (kind === 'needsMe') {
    const dated = dateExpr ? resolveDate(dateExpr, ctx.today) : null;
    const removals: Span[] = dateExpr && dated?.status === 'resolved' ? [dateExpr.span] : [];
    const { title, shortened } = removals.length > 0 ? tidyTitle(withoutSpans(raw, removals)) : verbatimTitle(raw);
    const assumptions: AssumptionCode[] = [];
    if (hedged) assumptions.push('hedged-language');
    if (shortened) assumptions.push('title-shortened');
    if (dated?.status === 'resolved' && dated.rolledForward) assumptions.push('date-rolled-forward');
    const refs: EvidenceRef[] = [evidence('kind', 'kind.dated-note', clauseSpan)];
    if (dateExpr) refs.push(evidence('date', dateExpr.rule, at(dateExpr.span)));
    return {
      proposals: [
        {
          key: nextKey(),
          kind: 'needsMe',
          title: title || verbatimTitle(raw).title,
          dueDate: dated?.status === 'resolved' ? dated.date : null,
          startsAt: null,
          endsAt: null,
          durationMinutes: null,
          value: null,
          subjectMemberId: null,
          categoryHint: null,
          confidence: 'possible',
          clarification: dated?.status === 'ambiguous' ? requestFor([{ kind: 'which_day', weekday: dated.weekday }], ctx, ctx.today) : null,
          assumptions,
          evidence: refs,
          childScoped: false,
          requiresExplicitReview: true,
          span: clauseSpan,
        },
      ],
      unsupported: [],
    };
  }

  // ---- an event or a task: read the typed facts.
  const assumptions: AssumptionCode[] = [];
  const refs: EvidenceRef[] = [evidence('kind', kind === 'event' ? 'kind.appointment' : 'kind.obligation', clauseSpan)];
  const steps: ClarificationStep[] = [];
  const removals: Span[] = [];
  if (hedged) assumptions.push('hedged-language');

  // date
  let date: LocalDate | null = null;
  const resolved = dateExpr ? resolveDate(dateExpr, ctx.today) : null;
  if (dateExpr) {
    refs.push(evidence('date', dateExpr.rule, at(dateExpr.span)));
    removals.push(dateExpr.span);
    if (resolved?.status === 'resolved') {
      date = resolved.date;
      if (resolved.rolledForward) assumptions.push('date-rolled-forward');
    } else if (resolved?.status === 'ambiguous') {
      steps.push({ kind: 'which_day', weekday: resolved.weekday });
      date = kind === 'event' ? resolved.candidates[0] : null; // provisional only: an open question cannot be accepted
    } else {
      removals.pop(); // not a real date after all — keep her words
    }
  }

  // time and duration
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  let taskDuration: number | null = null;
  if (kind === 'event' && time) {
    refs.push(evidence('time', time.rule, at(time.span)));
    removals.push(time.span);
    if (time.meridiemAssumed) assumptions.push('meridiem-assumed');

    let eventDate = date;
    // A date the reader could not turn into a real day (30 February) is treated as no date at all.
    if (eventDate === null && resolved === null) {
      // Time with no day: today if it is still ahead, otherwise ask — today's time has passed, so "5" is probably tomorrow's.
      const todayStart = zonedTimeToEpochMs(ctx.today, time.startMinutes, ctx.timeZone);
      if (todayStart > ctx.nowMs) {
        eventDate = ctx.today;
        assumptions.push('date-assumed-today');
      } else {
        steps.push({ kind: 'which_day', weekday: null });
        eventDate = addDays(ctx.today, 1);
      }
    }
    if (eventDate !== null) {
      let length: number;
      if (time.endMinutes !== null) length = time.endMinutes - time.startMinutes;
      else if (duration) {
        length = duration.minutes;
        refs.push(evidence('duration', 'time.duration', at(duration.span)));
        removals.push(duration.span);
      } else {
        length = DEFAULT_ASSUMED_EVENT_MINUTES;
        assumptions.push('end-time-assumed');
      }
      ({ startsAt, endsAt } = eventInstants(eventDate, time.startMinutes, length, ctx.timeZone));
      date = eventDate;
    }
  } else if (kind === 'task' && duration) {
    taskDuration = duration.minutes;
    refs.push(evidence('duration', 'time.duration', at(duration.span)));
    removals.push(duration.span);
  }

  // amount and direction
  let value: Money | null = null;
  if (amount && amount.amount) {
    refs.push(evidence('amount', 'money.amount', at(amount.span)));
    if (direction !== 'unknown') {
      value = { amountMinor: amount.amount.amountMinor, currency: 'USD', direction };
      refs.push(evidence('direction', 'money.direction', null));
    } else if (counterparty) {
      steps.push({ kind: 'which_money_direction' });
    } else {
      assumptions.push('amount-direction-unknown');
    }
  }

  // child
  const child = readChild(raw, ctx);
  if (child.rule && child.span) refs.push(evidence('child', child.rule, at(child.span)));
  if (child.needsChoice) steps.push({ kind: 'which_child' });
  if (child.group) assumptions.push('multiple-children-no-single-subject');

  // area
  const categoryHint = hintArea(raw, ctx, child.childScoped);
  if (categoryHint) refs.push(evidence('area', 'area.keyword', null));

  // title: her words, minus only what was read into typed fields and the framing of "I need to".
  let body = withoutSpans(raw, removals);
  const stripLead = OBLIGATION_LEAD.exec(body.trim());
  if (stripLead) body = body.trim().slice(stripLead[0].length);
  else if (kind === 'event') {
    // "I have a dentist appointment" → "Dentist appointment": framing removed, her nouns untouched.
    const framing = /^(?:i|we)\s*(?:'|’)?(?:ve\s+got|ve|\s+have\s+got|\s+have|\s+got)\s+(?:an?\s+|the\s+|our\s+)?/i.exec(body.trim());
    if (framing) body = body.trim().slice(framing[0].length);
  }
  body = body.replace(new RegExp(HEDGE_WORDS.source, 'gi'), ' ');
  const { title: tidied, shortened } = tidyTitle(body);
  const title = tidied || verbatimTitle(raw).title;
  if (shortened) assumptions.push('title-shortened');

  const handoff = findHandoff(raw, ctx);
  const unsupported: UnsupportedItem[] = handoff ? [{ reason: 'responsibility-handoff', span: at(handoff.span), person: { name: handoff.name, known: handoff.known } }] : [];

  sortSteps(steps);
  return {
    proposals: [
      {
        key: nextKey(),
        kind,
        title,
        dueDate: kind === 'task' ? date : null,
        startsAt,
        endsAt,
        durationMinutes: taskDuration,
        value,
        subjectMemberId: child.subjectMemberId,
        categoryHint,
        confidence: 'possible',
        clarification: requestFor(steps, ctx, ctx.today),
        assumptions,
        evidence: refs,
        childScoped: child.childScoped,
        requiresExplicitReview: true,
        span: clauseSpan,
      },
    ],
    unsupported,
  };
}

// --------------------------------------------------------------- interpret ---

export function interpret(input: TalkItOutInput): InterpretationResult {
  const { captureId, text, context } = input;
  const empty: InterpretationResult = { captureId, proposals: [], unsupported: [], failure: null, processedCharacters: 0 };
  if (text.trim().length === 0) return { ...empty, failure: { code: 'empty' } };
  // The window is honest: over it, NOTHING is read, and nothing is claimed to have been.
  if (text.length > PROCESSING_LIMIT_CHARS) return { ...empty, failure: { code: 'over-processing-limit' } };
  if (HIGH_STAKES.test(text)) return { ...empty, failure: { code: 'high-stakes' } };

  const { clauses, overflow } = segment(text);
  let counter = 0;
  const nextKey = () => `p${(counter += 1)}`;
  const proposals: Proposal[] = [];
  const unsupported: UnsupportedItem[] = [];
  for (const clause of clauses) {
    const reading = readClause(clause, context, nextKey);
    proposals.push(...reading.proposals);
    unsupported.push(...reading.unsupported);
  }
  if (overflow) unsupported.push({ reason: 'clause-limit', span: overflow, person: null });

  return {
    captureId,
    proposals,
    unsupported,
    failure: proposals.length === 0 ? { code: 'nothing-recognized' } : null,
    processedCharacters: overflow ? overflow.start : text.length,
  };
}

// ------------------------------------------------------------ clarification ---

const NEGATIVE_CHILD = /\b(?:neither|none|no\s*one|nobody|not\s+(?:for\s+)?(?:a\s+|one\s+of\s+)?(?:the\s+)?(?:kid|child|children|kids)|nope|both|all\s+of\s+(?:them|the\s+kids)|the\s+kids|everyone)\b/i;

function answerToPatch(input: ClarificationInput): ProposalPatch | null {
  const { proposal, answer, context } = input;
  if (answer.kind === 'option') {
    const o = answer.option;
    if (o.kind === 'child') return context.children.some((c) => c.id === o.memberId) ? { subject: { kind: 'child', memberId: o.memberId } } : null;
    if (o.kind === 'no-child') return { subject: { kind: 'none' } };
    if (o.kind === 'date') return { date: o.date };
    return { direction: o.direction };
  }
  return textAnswerToPatch(proposal, answer.text, context);
}

function textAnswerToPatch(draft: ProposalDraft, text: string, ctx: InterpretationContext): ProposalPatch | null {
  const steps = draft.clarificationCode === null ? null : parseClarificationCode(draft.clarificationCode);
  if (!steps) return null;
  const step = steps[0];
  const anchor = logicalDateAt(draft.createdAtMs, ctx.timeZone);

  if (step.kind === 'which_child') {
    const named = ctx.children.filter((c) => new RegExp(`\\b${c.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
    if (named.length === 1) return { subject: { kind: 'child', memberId: named[0].id } };
    if (named.length === 0 && NEGATIVE_CHILD.test(text)) return { subject: { kind: 'none' } };
    return null;
  }

  if (step.kind === 'which_day') {
    const [first, second] = step.weekday === null ? [addDays(anchor, 1), anchor] : weekdayCandidates(step.weekday, anchor);
    if (/\btoday\b/i.test(text) && step.weekday === null) return { date: anchor };
    if (/\btomorrow\b/i.test(text) && step.weekday === null) return { date: addDays(anchor, 1) };
    if (step.weekday !== null && /\b(?:next|second|later|following|other|after\s+that)\b/i.test(text)) return { date: second };
    if (step.weekday !== null && /\b(?:this|coming|first|nearer|sooner|upcoming|that\s+one)\b/i.test(text)) return { date: first };
    const expr = findDateExpressions(text)[0];
    if (expr) {
      const r = resolveDate(expr, anchor);
      if (r?.status === 'resolved') return { date: r.date };
    }
    return null;
  }

  // which_money_direction
  const d = readDirection(text);
  if (d !== 'unknown') return { direction: d };
  if (/\b(?:i\s+owe|we\s+owe|i\s+pay|i\s+need\s+to\s+pay|from\s+me|i\s+send|i(?:'|’)?m\s+paying)\b/i.test(text)) return { direction: 'outflow' };
  if (/\b(?:they\s+owe|owed\s+to\s+me|to\s+me|for\s+me|coming\s+in|i(?:'|’)?m\s+owed)\b/i.test(text)) return { direction: 'inflow' };
  return null;
}

export function clarify(input: ClarificationInput): InterpretationResult {
  const { captureId, proposal, context } = input;
  const base: InterpretationResult = { captureId, proposals: [], unsupported: [], failure: null, processedCharacters: 0 };
  const patch = answerToPatch(input);
  const revised = patch ? revise(proposal, patch, context) : null;
  if (!revised) return { ...base, failure: { code: 'answer-not-understood' } };
  return { ...base, proposals: [revised] };
}

// -------------------------------------------------------------- corrections ---

/** "No, I meant next Friday." → a typed patch, through the same rules as everything else. */
export function readCorrection(input: CorrectionTextInput): CorrectionReading {
  const { proposal, text, context } = input;
  const patch: ProposalPatch = {};
  const anchor = context.today;

  const dates = findDateExpressions(text);
  const dateExpr = dates[0];
  if (dateExpr) {
    const r = resolveDate(dateExpr, anchor);
    if (r?.status === 'resolved') patch.date = r.date;
    else if (r?.status === 'ambiguous') {
      // She is correcting a date she was shown, so she cannot mean the one she was shown.
      const shown = draftDate(proposal, context.timeZone);
      if (shown === r.candidates[0]) patch.date = r.candidates[1];
      else if (shown === r.candidates[1]) patch.date = r.candidates[0];
      else {
        const request = requestFor([{ kind: 'which_day', weekday: r.weekday }], context, anchor);
        return request ? { kind: 'question', request } : { kind: 'not-understood' };
      }
    }
  }

  const time = findTimeExpressions(text, dates.map((d) => d.span))[0];
  if (time && proposal.kind === 'event') {
    patch.timeMinutes = time.startMinutes;
    if (time.endMinutes !== null) patch.durationMinutes = time.endMinutes - time.startMinutes;
  }
  const duration = findDuration(text);
  if (duration && patch.durationMinutes === undefined) patch.durationMinutes = duration.minutes;

  const amounts = findAmounts(text);
  if (amounts.length === 1 && amounts[0].amount) {
    const said = readDirection(text);
    const direction = said !== 'unknown' ? said : proposal.value?.direction ?? null;
    if (direction) patch.amount = { amountMinor: amounts[0].amount.amountMinor, currency: 'USD', direction };
  }

  const named = context.children.filter((c) => new RegExp(`\\b${c.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (named.length === 1) patch.subject = { kind: 'child', memberId: named[0].id };
  else if (named.length === 0 && /\b(?:not\s+(?:for\s+)?(?:a\s+)?(?:kid|child)|no\s*one|nobody)\b/i.test(text)) patch.subject = { kind: 'none' };

  const kindWord = /\b(?:it(?:'|’)?s|make\s+it|change\s+it\s+to|should\s+be)\s+(?:just\s+)?an?\s+(task|to-?do|reminder|note|event|appointment)\b/i.exec(text);
  if (kindWord) {
    const w = kindWord[1].toLowerCase();
    patch.kind = w === 'note' ? 'needsMe' : w === 'event' || w === 'appointment' ? 'event' : 'task';
  }

  return Object.keys(patch).length === 0 ? { kind: 'not-understood' } : { kind: 'patch', patch };
}
