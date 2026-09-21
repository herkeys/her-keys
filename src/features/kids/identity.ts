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

/** Look-alike letters that a reader takes for a Latin one. Not exhaustive; a display aid, never identity. */
const LOOK_ALIKES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j',
  'ο': 'o', 'α': 'a', 'ρ': 'p', 'ι': 'i', 'ν': 'v',
};

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
  return text
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s!-/:-@[-`{-~‘’“”‐-―]/g, '')
    .replace(/[Ͱ-ϿЀ-ӿ]/g, (ch) => LOOK_ALIKES[ch] ?? ch);
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

    let full = short;
    if (nameCollides) full += ` · born ${bornText(child.birthDate)}`;
    if (ordinal) full += ` · ${ordinal.position} of ${ordinal.of}`;
    return { childId: child.id, displayName: child.displayName, age, ageText, nameCollides, ordinal, short, full };
  });
}
