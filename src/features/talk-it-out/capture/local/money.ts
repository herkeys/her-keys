import { parseMoney, type Money, type MoneyDirection } from '../../../../domain/foundation/money';
import type { Span } from './temporal';

/**
 * Amounts and their DIRECTION. "I owe Jordan $85" and "Jordan owes me $85" are different facts, not
 * different signs of one fact — direction is read from what she said, and when she did not say it the
 * reader either asks or records no typed amount. It never picks a direction to be helpful.
 *
 * Only dollars are read. Another currency is reported as unsupported rather than coerced to USD.
 */

export interface AmountExpr {
  span: Span;
  /** Null when the number could not be turned into an exact amount (more decimals than cents, absurd size). */
  amount: { amountMinor: number; currency: 'USD' } | null;
}

const toMoney = (digits: string, direction: MoneyDirection): Money | null => parseMoney(digits.replace(/,/g, ''), 'USD', direction);

export function findAmounts(text: string): AmountExpr[] {
  const found: AmountExpr[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\d])/g)) {
    const money = toMoney(`${m[1]}${m[2] === undefined ? '' : `.${m[2]}`}`, 'outflow');
    found.push({ span: { start: m.index, end: m.index + m[0].length }, amount: money ? { amountMinor: money.amountMinor, currency: 'USD' } : null });
  }
  for (const m of text.matchAll(/(?<![\d$.,])\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|bucks|usd)\b/gi)) {
    const money = toMoney(`${m[1]}${m[2] === undefined ? '' : `.${m[2]}`}`, 'outflow');
    found.push({ span: { start: m.index, end: m.index + m[0].length }, amount: money ? { amountMinor: money.amountMinor, currency: 'USD' } : null });
  }
  return found.sort((a, b) => a.span.start - b.span.start);
}

/** An amount in another currency, named or symbolised. Not coerced. */
export const FOREIGN_CURRENCY = /(?:[€£¥₹]\s?\d|\b\d[\d,.]*\s*(?:euros?|pounds?|pesos?|yen|rupees?|cad|gbp|eur)\b)/i;

export type Direction = MoneyDirection | 'unknown';

const INFLOW = [
  /\bowes?\s+(?:me|us)\b/i,
  /\bowed\s+(?:to\s+)?(?:me|us)\b/i,
  /\b(?:pay|pays|paid|paying)\s+(?:me|us)\s+back\b/i,
  /\breimburs(?:e|es|ing|ed)\s+(?:me|us)\b/i,
  /\b(?:pay|pays|paid|paying|send|sends|sent|give|gives|gave)\s+(?:me|us)\b/i,
  /\brefund(?:ed|s)?\b/i,
  /\bi(?:'|’)?m\s+(?:getting|receiving|being\s+paid)\b/i,
];

const OUTFLOW = [
  /\b(?:i|we)\s+owe\b/i,
  /\bowe\s+(?!me\b|us\b)[A-Za-z]/i,
  /\b(?:pay|paying|send|sending|give|giving|bring|bringing|venmo|zelle|transfer|reimburse|cover|donate|contribute|chip\s+in|put\s+in|owe|owing)\b/i,
];

/** Direction from the words around an amount. Inflow cues are checked first because "pay me back" also contains "pay". */
export function readDirection(clause: string): Direction {
  if (INFLOW.some((rx) => rx.test(clause))) return 'inflow';
  if (OUTFLOW.some((rx) => rx.test(clause))) return 'outflow';
  return 'unknown';
}

/** A name adjacent to a money verb — the other party — or null. Capitalised words only, so ordinary nouns are never read as people. */
export function findCounterparty(clause: string): string | null {
  const patterns = [
    /\b(?:owe|owes|pay|paying|send|sending|give|giving|venmo|zelle|reimburse|to|with)\s+([A-Z][a-z]{1,20})\b(?!\s+(?:school|store|office))/,
    /\b([A-Z][a-z]{1,20})\s+(?:owes|owe|owed)\b/,
    /\b(?:from)\s+([A-Z][a-z]{1,20})\b/,
  ];
  for (const rx of patterns) {
    const m = rx.exec(clause);
    if (m) return m[1];
  }
  return null;
}
