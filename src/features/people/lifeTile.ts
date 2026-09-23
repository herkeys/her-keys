import type { LocalDate } from '../../domain/logicalDay';
import type { AppState } from '../../domain/state';
import { peopleCopy } from './copy';
import { followUps, peopleRows, peopleVerdict } from './projection';

/**
 * The Life hub's People row, as data (HK-FEATURE-13). Registration in the hub itself is DEFERRED to integration (the hub is one
 * hand-written list: HK_FEATURE_13_MISSING_PRIMITIVES.md MP-13-08), so this is what that row will say, ready to wire.
 *
 * Conservative on purpose: a count or a date, never a name, a label, a note, a phone or an email.
 */
export interface PeopleLifeTile {
  key: 'people';
  label: string;
  value: string;
  needsAttention: boolean;
  route: '/life/people';
}

export function peopleLifeTile(state: AppState, today: LocalDate): PeopleLifeTile {
  const items = followUps(state, today);
  const attention = items.filter((item) => item.timing === 'overdue' || item.timing === 'today').length;
  const upcoming = items.some((item) => item.timing === 'upcoming');
  const people = peopleRows(state).length;
  // The verdict sentence never names anybody, so the tile may reuse it for follow-ups; otherwise it is a plain count.
  const value = attention > 0 || upcoming ? peopleVerdict(items, today) : people > 0 ? peopleCopy.tile.people(people) : peopleCopy.tile.none;
  return { key: 'people', label: peopleCopy.tile.label, value, needsAttention: attention > 0, route: '/life/people' };
}
