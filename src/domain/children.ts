import type { TransitionContext } from './context';
import { isLocalDate, type LocalDate } from './logicalDay';
import type { AppState, Child } from './state';

/**
 * ADDING A CHILD (HK-FEATURE-05, finding F-K0-01).
 *
 * A `Child` is the canonical member identity every child-linked row points at (`subjectMemberId`). Until this file nothing created
 * one: a real household had none and the demo seeded two. This is the one local transition that does, and it changes no shape: the
 * `Child` it writes is exactly the stored `ChildSchema`, so there is no schema change and no migration.
 *
 * What it does NOT do, on purpose:
 *   - It does not rename, correct or remove a child. The cloud's `household_members` row is read-only to the client (a local edit would
 *     diverge from it) and removal semantics are deferred (B4-P0-066).
 *   - It does not know about sync. A child added BEFORE the household is bound to an account reaches the cloud through the claim, which
 *     carries every child (claim payload v3). A child added AFTER binding has no cloud identity and no server path
 *     (HK_FEATURE_05_OWNER_CHECKPOINT_01); the caller must not offer this once the household is bound. A pure state transition cannot
 *     see the account, so that gate lives with the screen, using `isUnbound(identity)`.
 *
 * The child is identified by the id this mints, never by name: two children may share one, and that is allowed.
 */

/** The stored shape caps the household at this many children (`AppStateSchema.children.max(20)`). */
export const MAX_CHILDREN = 20;
export const MAX_CHILD_NAME_LENGTH = 80;
/** A birth year before this cannot be a real household member and is almost certainly a typing slip. */
export const EARLIEST_BIRTH_YEAR = 1900;

export type AddChildRefusal = 'blank_name' | 'name_too_long' | 'bad_birth_date' | 'birth_date_in_future' | 'birth_date_too_early' | 'too_many_children';

export interface NewChildInput {
  displayName: string;
  birthDate: LocalDate;
}

/** Trimmed, with runs of whitespace collapsed. What is stored is what she sees. */
export function cleanChildName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ');
}

/** Why a child cannot be added as described, or null. `today` is the household's logical day. */
export function checkNewChild(state: Pick<AppState, 'children'>, input: NewChildInput, today: LocalDate): AddChildRefusal | null {
  const name = cleanChildName(input.displayName);
  if (name.length === 0) return 'blank_name';
  if (name.length > MAX_CHILD_NAME_LENGTH) return 'name_too_long';
  if (!isLocalDate(input.birthDate)) return 'bad_birth_date';
  if (input.birthDate > today) return 'birth_date_in_future';
  if (Number(input.birthDate.slice(0, 4)) < EARLIEST_BIRTH_YEAR) return 'birth_date_too_early';
  if (state.children.length >= MAX_CHILDREN) return 'too_many_children';
  return null;
}

/**
 * The child, added. An input that would be refused returns the SAME state object (a transition that changes nothing), so a screen that
 * skips `checkNewChild` still cannot write something the store would reject, and never writes half of one.
 */
export function addChild(state: AppState, ctx: TransitionContext, input: NewChildInput): AppState {
  if (checkNewChild(state, input, ctx.today) !== null) return state;
  const child: Child = {
    id: ctx.createId('child'),
    displayName: cleanChildName(input.displayName),
    birthDate: input.birthDate,
    scope: 'child',
  };
  return { ...state, children: [...state.children, child] };
}
