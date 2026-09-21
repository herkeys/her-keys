import { addDays, epochMsOf, logicalDateAt, toInstant, wallClockMinutesAt, zonedTimeToEpochMs, type LocalDate } from '../../../domain/logicalDay';
import { MAX_CLARIFICATION_STEPS, formatClarificationCode, parseClarificationCode } from './clarificationCodes';
import { findAmounts } from './local/money';
import { weekdayCandidates } from './local/temporal';
import type {
  ClarificationOption,
  ClarificationRequest,
  ClarificationStep,
  InterpretationContext,
  Proposal,
  ProposalDraft,
  ProposalPatch,
} from './types';

/**
 * Changing a proposal. This file is domain logic, not language understanding, which is why it does not
 * live inside the swappable interpreter: whichever reader produced a proposal (this build's deterministic
 * one, or a future model behind the same port), a clarification answer, a structured edit and a
 * natural-language correction all reduce to a `ProposalPatch` and are applied HERE, by one function.
 * There is no second code path that can alter what a reading says.
 */

export const DEFAULT_ASSUMED_EVENT_MINUTES = 30;
/** The foundation allows 200; a DERIVED title stays short so a long clause never leaves a large excerpt of her words in durable state. */
export const TITLE_MAX = 90;
const MINUTE_MS = 60_000;

/** Cut at a word boundary and say so. The full words stay in the session echo, never in the record. */
function clip(t: string): { title: string; shortened: boolean } {
  if (t.length <= TITLE_MAX) return { title: t, shortened: false };
  const cut = t.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  const base = (space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '');
  return { title: `${base}…`, shortened: true };
}

export function eventInstants(date: LocalDate, startMinutes: number, durationMinutes: number, timeZone: string) {
  const startMs = zonedTimeToEpochMs(date, startMinutes, timeZone);
  return { startsAt: toInstant(startMs), endsAt: toInstant(startMs + durationMinutes * MINUTE_MS) };
}

export function tidyTitle(raw: string): { title: string; shortened: boolean } {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '');
  let previous = '';
  while (previous !== t) {
    previous = t;
    t = t.replace(/^(?:and|then|also|but|so|at|on|by|for|to|is|are|was)\b\s*/i, '');
    t = t.replace(/\s+(?:on|at|by|for|is|are|was|were|will\s+be|due|from|to|until|till|the|a|an|and|with|around|about)$/i, '');
    t = t.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '');
  }
  if (t.length > 0) t = t[0].toUpperCase() + t.slice(1);
  return clip(t);
}

/** A note keeps her clause exactly — trimmed of surrounding punctuation only. */
export function verbatimTitle(raw: string): { title: string; shortened: boolean } {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '');
  return clip(t.length > 0 ? t[0].toUpperCase() + t.slice(1) : t);
}

// ----------------------------------------------------------------- questions ---

/** The options for the FIRST step of a request, anchored to the day the reading was made. */
export function optionsFor(step: ClarificationStep, ctx: Pick<InterpretationContext, 'children'>, anchor: LocalDate): ClarificationOption[] {
  switch (step.kind) {
    case 'which_child':
      return [...ctx.children.map((c): ClarificationOption => ({ kind: 'child', memberId: c.id })), { kind: 'no-child' }];
    case 'which_day':
      return step.weekday === null
        ? [
            { kind: 'date', date: addDays(anchor, 1) },
            { kind: 'date', date: anchor },
          ]
        : weekdayCandidates(step.weekday, anchor).map((date): ClarificationOption => ({ kind: 'date', date }));
    case 'which_money_direction':
      return [
        { kind: 'direction', direction: 'outflow' },
        { kind: 'direction', direction: 'inflow' },
      ];
  }
}

export function requestFor(steps: readonly ClarificationStep[], ctx: Pick<InterpretationContext, 'children'>, anchor: LocalDate): ClarificationRequest | null {
  if (steps.length === 0) return null;
  const ordered = steps.slice(0, MAX_CLARIFICATION_STEPS) as [ClarificationStep, ...ClarificationStep[]];
  return { steps: ordered, options: optionsFor(ordered[0], ctx, anchor) };
}

/** Regenerates the open question of a stored reading from its durable code — no source text involved. */
export function requestFromDraft(draft: ProposalDraft, ctx: Pick<InterpretationContext, 'children' | 'timeZone'>): ClarificationRequest | null {
  if (draft.clarificationCode === null) return null;
  const steps = parseClarificationCode(draft.clarificationCode);
  if (steps === null) return null;
  return requestFor(steps, ctx, logicalDateAt(draft.createdAtMs, ctx.timeZone));
}

const STEP_ORDER: Record<ClarificationStep['kind'], number> = { which_child: 0, which_day: 1, which_money_direction: 2 };
export const sortSteps = (steps: ClarificationStep[]) => steps.sort((a, b) => STEP_ORDER[a.kind] - STEP_ORDER[b.kind]);

/** The durable code a proposal should carry (null when nothing is left to ask). */
export const clarificationCodeOf = (proposal: Pick<Proposal, 'clarification'>): string | null =>
  proposal.clarification ? formatClarificationCode(proposal.clarification.steps) : null;

// ------------------------------------------------------------------- revising ---

export const draftDate = (draft: ProposalDraft, tz: string): LocalDate | null =>
  draft.startsAt !== null ? logicalDateAt(epochMsOf(draft.startsAt), tz) : draft.dueDate;

/**
 * Applies a patch to a reading and returns the revised proposal, or null when the patch cannot produce a
 * valid reading (for example turning a note into an appointment without being told a time): nothing is
 * invented to fill the gap.
 *
 * Open questions the patch answers are closed; any it does not answer stay open, in order, so a reading
 * that needed a child AND a day is asked the second question after the first is answered.
 */
export function revise(
  draft: ProposalDraft,
  patch: ProposalPatch,
  ctx: InterpretationContext,
  options: { extraSteps?: readonly ClarificationStep[] } = {}
): Proposal | null {
  const tz = ctx.timeZone;
  let steps: ClarificationStep[] = draft.clarificationCode === null ? [] : [...(parseClarificationCode(draft.clarificationCode) ?? [])];

  let subjectMemberId = draft.subjectMemberId;
  if (patch.subject) {
    subjectMemberId = patch.subject.kind === 'child' ? patch.subject.memberId : null;
    steps = steps.filter((s) => s.kind !== 'which_child');
  }
  if (patch.date !== undefined) steps = steps.filter((s) => s.kind !== 'which_day');

  let value = draft.value;
  if (patch.amount !== undefined) {
    value = patch.amount;
    steps = steps.filter((s) => s.kind !== 'which_money_direction');
  }
  if (patch.direction !== undefined) {
    const named = findAmounts(draft.title);
    if (named.length === 1 && named[0].amount) value = { amountMinor: named[0].amount.amountMinor, currency: 'USD', direction: patch.direction };
    else if (value !== null) value = { ...value, direction: patch.direction };
    steps = steps.filter((s) => s.kind !== 'which_money_direction');
  }
  if (options.extraSteps) for (const s of options.extraSteps) if (!steps.some((e) => e.kind === s.kind)) steps = [...steps, s];

  const kind = patch.kind ?? draft.kind;
  const currentDate = draftDate(draft, tz);
  const date = patch.date !== undefined ? patch.date : currentDate;
  const currentMinutes = draft.startsAt !== null ? wallClockMinutesAt(epochMsOf(draft.startsAt), tz) : null;
  const currentLength = draft.startsAt !== null && draft.endsAt !== null ? Math.round((epochMsOf(draft.endsAt) - epochMsOf(draft.startsAt)) / MINUTE_MS) : null;

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  let dueDate: LocalDate | null = null;
  let durationMinutes: number | null = kind === 'task' ? (patch.durationMinutes ?? draft.durationMinutes) : null;

  if (kind === 'event') {
    const minutes = patch.timeMinutes ?? currentMinutes;
    const length = patch.durationMinutes ?? currentLength ?? DEFAULT_ASSUMED_EVENT_MINUTES;
    if (date === null || minutes === null) return null; // an event needs a day and a time; neither is invented
    ({ startsAt, endsAt } = eventInstants(date, minutes, length, tz));
    durationMinutes = null;
  } else {
    dueDate = date;
    if (kind === 'needsMe') {
      value = null;
      durationMinutes = null;
    }
  }

  const title = patch.title !== undefined ? tidyTitle(patch.title).title : draft.title;
  if (title.length === 0) return null;

  sortSteps(steps);
  const anchor = logicalDateAt(draft.createdAtMs, tz);
  return {
    key: `r${draft.version + 1}`,
    kind,
    title,
    dueDate,
    startsAt,
    endsAt,
    durationMinutes,
    value,
    subjectMemberId,
    categoryHint: patch.categoryHint !== undefined ? patch.categoryHint : draft.categoryHint,
    confidence: 'possible',
    clarification: requestFor(steps, ctx, anchor),
    assumptions: [],
    evidence: [],
    childScoped: subjectMemberId !== null || steps.some((s) => s.kind === 'which_child'),
    requiresExplicitReview: true,
    span: { start: 0, end: 0 },
  };
}
