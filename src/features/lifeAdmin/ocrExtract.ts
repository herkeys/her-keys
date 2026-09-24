/**
 * HK-OCR-ASSIST — pure candidate extraction.
 *
 * Recognition says "these characters were read." This file says "these look like the kinds of values Life Admin already has
 * fields for" — dates, an issuer-like line, a reference-like token — and nothing more. It never decides which Life Admin field a
 * value belongs to (that is her choice, made on the review screen), never invents a value that was not in the text, and never
 * drops a candidate because another one seems "more likely": every match found is returned, in the order it was read, capped only
 * so the review screen stays usable. No network, no storage, no state: a string in, an `OcrCandidate` out.
 */
import { isLocalDate } from '../../domain/logicalDay';
import { LIFE_RECORD_LIMITS } from '../../domain/state';
import { EMPTY_OCR_CANDIDATE, type OcrCandidate, type OcrDateCandidate, type OcrTextCandidate } from './ocrCandidate';
import { maskReference } from './sensitive';

/** A context hint is read before she has chosen to reveal anything: any reference-shaped run inside it gets the same masking a
 * confirmed reference number already gets everywhere outside its own record detail. A hint must never be how an unmasked
 * reference reaches the screen. A token that is itself a real calendar date (in either written form this file recognizes) is
 * left alone: a date is not one of Life Admin's detail-only fields, and it is usually the very date the hint is explaining. */
function looksLikeADate(token: string): boolean {
  if (isLocalDate(token)) return true;
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/.exec(token);
  return slash !== null && toIsoIfValid(fullYear(slash[3]), Number(slash[1]), Number(slash[2])) !== null;
}

function redactSensitiveContext(text: string): string {
  return text.replace(/\b(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{3,63}\b/g, (token) => (looksLikeADate(token) ? token : (maskReference(token) ?? token)));
}

const MAX_DATE_CANDIDATES = 8;
const MAX_TEXT_CANDIDATES = 5;
const CONTEXT_WINDOW_CHARS = 40;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoIfValid(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
  return isLocalDate(iso) ? iso : null;
}

function fullYear(twoOrFour: string): number {
  if (twoOrFour.length === 4) return Number(twoOrFour);
  const n = Number(twoOrFour);
  // A short year on a scanned document is read as this century; there is no "current year" to anchor to on-device, and this
  // candidate is never auto-assigned, so a wrong guess costs her one tap to correct or skip, not a silently wrong fact.
  return n < 100 ? 2000 + n : n;
}

function contextAround(text: string, index: number, length: number): string | null {
  const start = Math.max(0, index - CONTEXT_WINDOW_CHARS);
  const end = Math.min(text.length, index + length + CONTEXT_WINDOW_CHARS);
  const slice = redactSensitiveContext(text.slice(start, end).replace(/\s+/g, ' ').trim());
  return slice.length > 0 ? slice.slice(0, 120) : null;
}

interface RawDateMatch {
  index: number;
  length: number;
  iso: string | null;
}

function matchIsoDates(text: string): RawDateMatch[] {
  const out: RawDateMatch[] = [];
  const re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  for (const m of text.matchAll(re)) {
    out.push({ index: m.index ?? 0, length: m[0].length, iso: toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3])) });
  }
  return out;
}

function matchSlashDates(text: string): RawDateMatch[] {
  const out: RawDateMatch[] = [];
  const re = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/g;
  for (const m of text.matchAll(re)) {
    // Read as month/day/year, the common US document convention. This is one reading of an ambiguous pattern, offered as a
    // candidate like any other: nothing here treats it as the correct one.
    out.push({ index: m.index ?? 0, length: m[0].length, iso: toIsoIfValid(fullYear(m[3]), Number(m[1]), Number(m[2])) });
  }
  return out;
}

function matchMonthNameDates(text: string): RawDateMatch[] {
  const out: RawDateMatch[] = [];
  const monthWord = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const dayMonthYear = new RegExp(`\\b(\\d{1,2})\\s+(${monthWord})\\.?,?\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(dayMonthYear)) {
    const month = MONTHS[m[2].toLowerCase()];
    out.push({ index: m.index ?? 0, length: m[0].length, iso: month ? toIsoIfValid(Number(m[3]), month, Number(m[1])) : null });
  }
  const monthDayYear = new RegExp(`\\b(${monthWord})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(monthDayYear)) {
    const month = MONTHS[m[1].toLowerCase()];
    out.push({ index: m.index ?? 0, length: m[0].length, iso: month ? toIsoIfValid(Number(m[3]), month, Number(m[2])) : null });
  }
  return out;
}

/** Every date-shaped run of text Her Keys can read as a real calendar date, each kept once, in reading order. */
export function extractDateCandidates(recognizedText: string): OcrDateCandidate[] {
  if (recognizedText.trim().length === 0) return [];
  const matches = [...matchIsoDates(recognizedText), ...matchSlashDates(recognizedText), ...matchMonthNameDates(recognizedText)]
    .filter((m): m is RawDateMatch & { iso: string } => m.iso !== null)
    .sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const out: OcrDateCandidate[] = [];
  for (const m of matches) {
    if (seen.has(m.iso)) continue;
    seen.add(m.iso);
    out.push({ date: m.iso, context: contextAround(recognizedText, m.index, m.length) });
    if (out.length >= MAX_DATE_CANDIDATES) break;
  }
  return out;
}

const REFERENCE_TOKEN = /\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,63}\b/g;
/** Words that match the reference-token shape but are never useful as a reference candidate on their own. */
const REFERENCE_STOPWORDS = new Set(['PAGE', 'FORM']);

/** Alphanumeric tokens shaped like a policy/reference/registration number: never classified as "the" reference, just offered. */
export function extractReferenceCandidates(recognizedText: string): OcrTextCandidate[] {
  if (recognizedText.trim().length === 0) return [];
  const seen = new Set<string>();
  const out: OcrTextCandidate[] = [];
  for (const m of recognizedText.toUpperCase().matchAll(REFERENCE_TOKEN)) {
    const raw = m[0];
    if (REFERENCE_STOPWORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    if (raw.length > LIFE_RECORD_LIMITS.referenceNumber) continue;
    seen.add(raw);
    out.push({ text: raw, context: contextAround(recognizedText, m.index ?? 0, raw.length) });
    if (out.length >= MAX_TEXT_CANDIDATES) break;
  }
  return out;
}

const ISSUER_LINE = /^[A-Z][A-Za-z&.,'-]*(?:\s+[A-Z][A-Za-z&.,'-]*){0,5}$/;
/** Words too generic to offer as an issuer candidate by themselves. */
const ISSUER_STOPWORDS = new Set(['Expires', 'Issued', 'Date', 'Valid', 'Page', 'Form', 'Number', 'No']);

/** Short, capitalized lines that read like an organization name: a candidate, never a classification of "the issuer". */
export function extractIssuerCandidates(recognizedText: string): OcrTextCandidate[] {
  if (recognizedText.trim().length === 0) return [];
  const seen = new Set<string>();
  const out: OcrTextCandidate[] = [];
  let offset = 0;
  for (const rawLine of recognizedText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const index = recognizedText.indexOf(rawLine, offset);
    offset = index + rawLine.length;
    if (line.length === 0 || line.length > LIFE_RECORD_LIMITS.issuerName) continue;
    if (!ISSUER_LINE.test(line)) continue;
    if (ISSUER_STOPWORDS.has(line)) continue;
    if (/\d/.test(line)) continue;
    const key = line.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: line, context: null });
    if (out.length >= MAX_TEXT_CANDIDATES) break;
  }
  return out;
}

/** Everything a single scan can offer, in one immutable, in-memory snapshot. Never throws on empty or garbled input. */
export function buildOcrCandidate(recognizedText: string, engineConfidence: number | null = null): OcrCandidate {
  const text = typeof recognizedText === 'string' ? recognizedText : '';
  if (text.trim().length === 0) return { ...EMPTY_OCR_CANDIDATE, engineConfidence };
  return {
    recognizedText: text,
    dates: extractDateCandidates(text),
    issuers: extractIssuerCandidates(text),
    references: extractReferenceCandidates(text),
    engineConfidence,
    confirmed: false,
  };
}
