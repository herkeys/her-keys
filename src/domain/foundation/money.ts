import { z } from 'zod';

/**
 * MONEY — B4-FE01-020 (ADR-014).
 *
 * A value facet, not a finance module: enough to say "this is worth $35 and it
 * leaves the household", exactly, on the kinds of record that can honestly carry
 * it. Amounts are integers in the currency's MINOR unit (cents), so there is no
 * floating point anywhere between a receipt and the database — `0.1 + 0.2` never
 * happens because nothing here is ever a fraction.
 *
 * Direction is stored beside the amount rather than as a sign. A negative number
 * is one typo away from meaning the opposite, and "owed to us" and "owed by us" are
 * different facts, not different signs of one fact.
 *
 * Deliberately absent: bank connectivity, balances, budgets, payments, exchange
 * rates. This is the primitive those would be built from, and nothing more.
 */

export const MAX_AMOUNT_MINOR = Number.MAX_SAFE_INTEGER;

export const MONEY_DIRECTIONS = ['outflow', 'inflow'] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];

export const MoneySchema = z.strictObject({
  /** A whole number of minor units (cents). Never a fraction, never negative. */
  amountMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  /** ISO 4217, upper case. */
  currency: z.string().regex(/^[A-Z]{3}$/, { message: 'Expected an ISO 4217 currency code' }),
  direction: z.enum(MONEY_DIRECTIONS),
});
export type Money = z.infer<typeof MoneySchema>;

/** How many decimal places the currency's minor unit sits behind the major one. Most are 2. */
const MINOR_EXPONENT: Readonly<Record<string, number>> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3,
};

export function minorExponent(currency: string): number {
  return MINOR_EXPONENT[currency] ?? 2;
}

/**
 * Parse a decimal STRING ("35", "35.5", "35.50") into minor units, exactly. It works
 * on the digits, never through a float, and refuses anything with more places than
 * the currency has rather than rounding it — silently rounding money is how a fee
 * becomes a different fee.
 */
export function parseMoney(text: string, currency: string, direction: MoneyDirection): Money | null {
  const match = /^(\d{1,15})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const exponent = minorExponent(currency);
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) return null;
  const minorDigits = match[1] + fraction.padEnd(exponent, '0');
  const amountMinor = Number(minorDigits);
  if (!Number.isSafeInteger(amountMinor)) return null;
  const parsed = MoneySchema.safeParse({ amountMinor, currency, direction });
  return parsed.success ? parsed.data : null;
}

/** The exact decimal string for an amount, again without a float. */
export function formatAmount(money: Pick<Money, 'amountMinor' | 'currency'>): string {
  const exponent = minorExponent(money.currency);
  if (exponent === 0) return String(money.amountMinor);
  const digits = String(money.amountMinor).padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Sum amounts of one currency and direction. Mixing either is a modelling error, not something to coerce. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new RangeError(`cannot add ${a.currency} to ${b.currency}`);
  if (a.direction !== b.direction) throw new RangeError('cannot add an outflow to an inflow');
  const amountMinor = a.amountMinor + b.amountMinor;
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError('amount exceeds the exactly representable range');
  return { ...a, amountMinor };
}

/** Whether one amount is within a limit of the same currency. A different currency is never "within". */
export function isWithinLimit(amount: Pick<Money, 'amountMinor' | 'currency'>, limit: Pick<Money, 'amountMinor' | 'currency'> | null): boolean {
  if (limit === null) return true;
  return amount.currency === limit.currency && amount.amountMinor <= limit.amountMinor;
}

export interface MoneyTotals {
  outflow: Record<string, number>;
  inflow: Record<string, number>;
}

/** Totals per currency and direction, without ever mixing currencies. */
export function totalsOf(values: ReadonlyArray<Money | null>): MoneyTotals {
  const totals: MoneyTotals = { outflow: {}, inflow: {} };
  for (const value of values) {
    if (value === null) continue;
    const bucket = totals[value.direction];
    const next = (bucket[value.currency] ?? 0) + value.amountMinor;
    if (!Number.isSafeInteger(next)) throw new RangeError('amount exceeds the exactly representable range');
    bucket[value.currency] = next;
  }
  return totals;
}
