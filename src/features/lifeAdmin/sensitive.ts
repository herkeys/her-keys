/**
 * Sensitive-display rules for Life Admin (addendum N, P, Q, R).
 *
 * A reference number is NEVER shown in full outside the record's own detail, and even there only after she asks (Reveal), for as
 * long as the detail is open. Everywhere a reference could otherwise appear it is masked: the last four characters of the
 * normalised value when that value has at least eight, and no characters at all when it is shorter (a short identifier is too easy
 * to recognise from four). The location hint and the note never leave the detail at all, so they have no masked form.
 */

const BULLETS = String.fromCharCode(0x2022).repeat(4);

/** Letters and digits only: spacing and punctuation are not part of what the last four characters identify. */
const normalised = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '');

/** `••••1234` for a reference of eight or more characters, `••••` otherwise, `null` when there is none. */
export function maskReference(reference: string | null): string | null {
  if (reference === null) return null;
  const value = normalised(reference);
  return value.length >= 8 ? `${BULLETS}${value.slice(-4)}` : BULLETS;
}

/** The fields that may appear only on the record's own detail. Used by the privacy tests to scan every other surface. */
export const DETAIL_ONLY_FIELDS = ['referenceNumber', 'locationHint', 'note'] as const;
