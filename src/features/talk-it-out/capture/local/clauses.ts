import { CHANGE_TO_EXISTING, IMPERATIVE_VERBS, IMPRECISE_DATE, OBLIGATION_CUES, OBLIGATION_LEAD, RECURRENCE } from './lexicon';
import { findAmounts } from './money';
import { findDateExpressions, findTimeExpressions, type Span } from './temporal';

/**
 * Splitting one messy message into the separate things it says.
 *
 * Bounded on purpose: hard breaks (a line, `;`, a sentence end) always split; a comma or "and" splits
 * only when BOTH sides carry something the reader can act on and the right side starts a new clause.
 * Everything else stays together, because splitting "buy milk and eggs" into two tasks would be worse
 * than leaving one.
 */

export interface Clause {
  start: number;
  end: number;
  text: string;
}

export const MAX_CLAUSES = 12;

const IMPERATIVE_START = new RegExp(`^(?:please\\s+)?(?:${IMPERATIVE_VERBS.join('|')})\\b`, 'i');
const CLAUSE_STARTER = /^(?:i|we|he|she|they|it|my|our|the|also|then|plus|and|but|so|need|don['’]?t|remember|make\s+sure|there|please)\b/i;
const CONJUNCTION_LEAD = /^(?:and|also|then|plus|but|so)\s+/i;

/** Whether a fragment carries anything the reader could do something with. */
export function hasAnchor(text: string): boolean {
  return (
    findDateExpressions(text).length > 0 ||
    findTimeExpressions(text).length > 0 ||
    findAmounts(text).length > 0 ||
    OBLIGATION_LEAD.test(text) ||
    OBLIGATION_CUES.test(text) ||
    CHANGE_TO_EXISTING.test(text) ||
    RECURRENCE.test(text) ||
    IMPRECISE_DATE.test(text) ||
    IMPERATIVE_START.test(text.trim())
  );
}

/** Capitalised words that are dates, not names: "and Saturday at 3" continues a sentence, it does not begin one. */
const CAPITALISED_NOT_A_NAME =
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|tonight|next|this|the)\b/i;

const startsClause = (text: string) => {
  const t = text.trim();
  return CLAUSE_STARTER.test(t) || IMPERATIVE_START.test(t) || (/^[A-Z][a-z]+\b/.test(t) && !CAPITALISED_NOT_A_NAME.test(t));
};

/** A date, a clock time or an amount — the anchors that make a fragment a thing of its own. */
function strongSpans(text: string): Span[] {
  return [...findDateExpressions(text).map((d) => d.span), ...findTimeExpressions(text).map((t) => t.span), ...findAmounts(text).map((a) => a.span)];
}

/** Words left once the anchors are taken out: "practice at 5" keeps "practice"; a bare "4:30" keeps nothing. */
function residualWords(text: string): number {
  let rest = text;
  for (const span of strongSpans(text).sort((a, b) => b.start - a.start)) rest = `${rest.slice(0, span.start)} ${rest.slice(span.end)}`;
  return (rest.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !/^(?:at|on|by|for|and|the|to|from|until|till|am|pm|of)$/i.test(w)).length;
}

/**
 * A fragment stands as its own clause when it starts like one (a subject, an instruction, a name) — or
 * when it and what precedes it each hold their own date, time or amount and the fragment says
 * something more than a bare time ("Dentist Friday at 3 and practice at 5", but not "at 3 and 4:30").
 */
function standsAsClause(left: string, right: string): boolean {
  if (!hasAnchor(left) || !hasAnchor(right)) return false;
  if (startsClause(right)) return true;
  return strongSpans(right).length > 0 && strongSpans(left).length > 0 && residualWords(right) > 0;
}

/** A full stop that is part of "p.m.", "Dr.", "Sept." or a decimal is not the end of a sentence. */
const PROTECTED_BEFORE_PERIOD = /(?:\b(?:a\.m|p\.m|dr|mr|mrs|ms|st|sept|oct|nov|dec|jan|feb|aug|mar|apr|jun|jul|vs|etc|e\.g|i\.e))$/i;

function hardSegments(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    let cut = false;
    if (ch === '\n' || ch === ';') cut = true;
    else if (ch === '.' || ch === '!' || ch === '?') {
      const next = text[i + 1];
      const atBoundary = next === undefined || /\s/.test(next);
      if (atBoundary && !(ch === '.' && PROTECTED_BEFORE_PERIOD.test(text.slice(0, i)))) cut = true;
    }
    if (cut) {
      spans.push({ start, end: i });
      start = i + 1;
    }
  }
  spans.push({ start, end: text.length });
  return spans;
}

function trimSpan(text: string, span: Span): Span | null {
  let { start, end } = span;
  while (start < end && /[\s.!?,;:]/.test(text[start])) start += 1;
  while (end > start && /[\s.!?,;:]/.test(text[end - 1])) end -= 1;
  return end > start ? { start, end } : null;
}

/** Splits at every soft separator, then merges any fragment that is not a clause of its own back into the one before it. */
function softSegments(text: string, hard: Span): Span[] {
  const slice = text.slice(hard.start, hard.end);
  const cuts: Array<{ at: number; resume: number }> = [];
  for (const m of slice.matchAll(/,\s+|\s+(?:and|then|also|plus|but)\s+/gi)) {
    cuts.push({ at: m.index, resume: m.index + m[0].length });
  }
  if (cuts.length === 0) return [hard];

  const fragments: Span[] = [];
  let from = 0;
  for (const cut of cuts) {
    fragments.push({ start: hard.start + from, end: hard.start + cut.at });
    from = cut.resume;
  }
  fragments.push({ start: hard.start + from, end: hard.end });

  // A separator that begins with a word ("and …") belongs to the RIGHT fragment as its lead; it is trimmed off later.
  const merged: Span[] = [];
  for (let k = 0; k < fragments.length; k += 1) {
    const frag = fragments[k];
    const fragText = text.slice(frag.start, frag.end);
    if (merged.length === 0) {
      merged.push(frag);
      continue;
    }
    const left = merged[merged.length - 1];
    if (standsAsClause(text.slice(left.start, left.end), fragText)) merged.push(frag);
    else merged[merged.length - 1] = { start: left.start, end: frag.end };
  }
  return merged;
}

export function segment(text: string): { clauses: Clause[]; overflow: Span | null } {
  const clauses: Clause[] = [];
  for (const hard of hardSegments(text)) {
    for (const soft of softSegments(text, hard)) {
      const trimmed = trimSpan(text, soft);
      if (!trimmed) continue;
      let { start } = trimmed;
      const lead = CONJUNCTION_LEAD.exec(text.slice(start, trimmed.end));
      if (lead && trimmed.end - start > lead[0].length) start += lead[0].length;
      clauses.push({ start, end: trimmed.end, text: text.slice(start, trimmed.end) });
    }
  }
  if (clauses.length <= MAX_CLAUSES) return { clauses, overflow: null };
  return { clauses: clauses.slice(0, MAX_CLAUSES), overflow: { start: clauses[MAX_CLAUSES].start, end: clauses[clauses.length - 1].end } };
}
