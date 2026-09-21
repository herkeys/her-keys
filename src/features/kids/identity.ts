import { ageOn, parseLocalDate, type LocalDate } from '../../domain/logicalDay';
import type { Child } from '../../domain/state';

/**
 * WHO A CHILD IS, AND HOW TO TELL TWO APART (HK-FEATURE-05).
 *
 * The identity of a child is `Child.id`. Nothing here ever uses a name, a nickname or a position as identity: the name is only what
 * is SHOWN. Because two children can share a first name (or differ only by case, spacing, an accent or a look-alike letter), every
 * place a child is chosen or named also shows context that already exists on the child (age, birth date). Only when even those are
 * identical does a stable ordinal appear. An internal id is never shown.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Plain code-unit comparison: the same answer on every device and runtime, unlike a locale-dependent collation. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Cyrillic and Greek letters a reader takes for a Latin one, by code point. Not exhaustive; a display aid, never identity.
 * (Code points, not literals, so no invisible or look-alike character ever sits in the source.)
 */
const LOOK_ALIKES: Record<number, string> = {
  0x0430: 'a', 0x0435: 'e', 0x043e: 'o', 0x0440: 'p', 0x0441: 'c', 0x0445: 'x', 0x0443: 'y', 0x0456: 'i', 0x0458: 'j',
  0x03bf: 'o', 0x03b1: 'a', 0x03c1: 'p', 0x03b9: 'i', 0x03bd: 'v',
};

/** Spaces, ASCII punctuation, curly quotes and dashes: nothing a reader counts as part of a name. */
function isSeparator(code: number): boolean {
  return (
    code <= 0x2f ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e) ||
    code === 0xa0 ||
    (code >= 0x2000 && code <= 0x200a) ||
    (code >= 0x2010 && code <= 0x2015) ||
    code === 0x2018 ||
    code === 0x2019 ||
    code === 0x201c ||
    code === 0x201d ||
    code === 0x3000
  );
}

/**
 * What two names must share for a reader to take them for the same name: case, accents, spacing, punctuation and common look-alike
 * letters ignored. Two children whose keys are equal are shown with extra context. It never decides who a child IS.
 */
export function collisionKey(name: string): string {
  let text = name;
  try {
    text = text.normalize('NFKD');
  } catch {
    // An engine without normalisation keeps the raw text; the exact-match case still collides.
  }
  let key = '';
  for (const ch of text.toLowerCase()) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // a combining accent
    if (isSeparator(code)) continue;
    key += LOOK_ALIKES[code] ?? ch;
  }
  return key;
}

/** Display order: oldest first, then by name, then by id. Never array position, which can differ between devices. */
export function compareChildren(a: Pick<Child, 'birthDate' | 'displayName' | 'id'>, b: Pick<Child, 'birthDate' | 'displayName' | 'id'>): number {
  return compareText(a.birthDate, b.birthDate) || compareText(collisionKey(a.displayName), collisionKey(b.displayName)) || compareText(a.id, b.id);
}

export const orderedChildren = (children: readonly Child[]): Child[] => [...children].sort(compareChildren);

export function bornText(birthDate: LocalDate): string {
  const { year, month, day } = parseLocalDate(birthDate);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export interface ChildLabel {
  childId: string;
  displayName: string;
  /** Whole years on `today`; never negative. */
  age: number;
  /** "8", or "under 1". */
  ageText: string;
  /** True when another child in the household has a name a reader could mistake for this one. */
  nameCollides: boolean;
  /** Set only when the collision cannot be resolved by age and birth date. 1-based, stable for the same set of children. */
  ordinal: { position: number; of: number } | null;
  /** "Sam, 8" — enough when the name is unique. */
  short: string;
  /** What tells this child from a look-alike ("born Mar 3, 2018", plus "1 of 2" for twins); null when the name is unique. */
  context: string | null;
  /** What a chooser or a heading shows: the short form plus whatever is needed to tell this child from a look-alike. */
  full: string;
}

/** A label for every child, in display order. Pure in the children and the day. */
export function labelChildren(children: readonly Child[], today: LocalDate): ChildLabel[] {
  const ordered = orderedChildren(children);
  const groups = new Map<string, Child[]>();
  for (const child of ordered) {
    const key = collisionKey(child.displayName);
    groups.set(key, [...(groups.get(key) ?? []), child]);
  }

  return ordered.map((child) => {
    const group = groups.get(collisionKey(child.displayName)) ?? [child];
    const nameCollides = group.length > 1;
    const age = Math.max(0, ageOn(child.birthDate, today));
    const ageText = age < 1 ? 'under 1' : String(age);
    const short = `${child.displayName}, ${ageText}`;

    // Twins with the same name and the same birth date share every existing fact; only then is a position needed.
    const sameBirth = group.filter((other) => other.birthDate === child.birthDate);
    const ordinal = nameCollides && sameBirth.length > 1 ? { position: sameBirth.findIndex((other) => other.id === child.id) + 1, of: sameBirth.length } : null;

    const extra: string[] = [];
    if (nameCollides) extra.push(`born ${bornText(child.birthDate)}`);
    if (ordinal) extra.push(`${ordinal.position} of ${ordinal.of}`);
    const context = extra.length > 0 ? extra.join(' · ') : null;
    const full = context === null ? short : `${short} · ${context}`;
    return { childId: child.id, displayName: child.displayName, age, ageText, nameCollides, ordinal, short, context, full };
  });
}
