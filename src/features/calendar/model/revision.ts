import type { AppState } from '../../../domain/state';

/**
 * WHAT CALENDAR HAS INSTEAD OF A STORE REVISION (F03-FG-12).
 *
 * The store exposes no revision counter, but it is immutable: every accepted change replaces the
 * collections it touched and leaves the rest as the same array. So a preview (or any snapshot)
 * remembers the identity of the slices Calendar reads, and is stale exactly when one of them is
 * no longer the same object. It can report a change that does not affect Calendar, but it cannot
 * miss one. Nothing here is persisted or synced.
 */
export interface RevisionToken {
  events: AppState['events'];
  tasks: AppState['tasks'];
  dependencies: AppState['dependencies'];
  responsibilities: AppState['responsibilities'];
  recurrences: AppState['recurrences'];
  people: AppState['people'];
  children: AppState['children'];
  actions: AppState['actions'];
  timeZone: string;
  today: string;
}

export const tokenOf = (state: AppState, today: string): RevisionToken => ({
  events: state.events,
  tasks: state.tasks,
  dependencies: state.dependencies,
  responsibilities: state.responsibilities,
  recurrences: state.recurrences,
  people: state.people,
  children: state.children,
  actions: state.actions,
  timeZone: state.user.timezone,
  today,
});

export function sameToken(a: RevisionToken, b: RevisionToken): boolean {
  return (
    a.events === b.events &&
    a.tasks === b.tasks &&
    a.dependencies === b.dependencies &&
    a.responsibilities === b.responsibilities &&
    a.recurrences === b.recurrences &&
    a.people === b.people &&
    a.children === b.children &&
    a.actions === b.actions &&
    a.timeZone === b.timeZone &&
    a.today === b.today
  );
}

const digests = new WeakMap<AppState, string>();

/**
 * A short, deterministic digest of the canonical rows Calendar reads — the `basedOnRevision` shown
 * in structural evidence. It is a memo of a pure function of an immutable state (keyed weakly by the
 * state object), not stored anywhere.
 */
export function revisionOf(state: AppState): string {
  const cached = digests.get(state);
  if (cached !== undefined) return cached;

  let hash = 0x811c9dc5;
  const mix = (text: string) => {
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x7c;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };

  mix(state.user.timezone);
  for (const e of state.events) {
    mix(`e|${e.id}|${e.status}|${e.commitment}|${e.startsAt}|${e.endsAt}|${e.location ?? ''}|${e.travelMinutesBefore ?? ''}|${e.travelMinutesAfter ?? ''}|${e.preparationMinutes ?? ''}|${e.subjectMemberId ?? ''}`);
  }
  for (const t of state.tasks) {
    mix(`t|${t.id}|${t.status}|${t.commitment}|${t.durationMinutes}|${t.dueDate ?? ''}|${JSON.stringify(t.plan)}|${t.earliestStartAt ?? ''}|${t.latestFinishAt ?? ''}|${t.dueAt ?? ''}|${t.splittable ?? ''}|${t.subjectMemberId ?? ''}`);
  }
  for (const d of state.dependencies) mix(`d|${d.id}|${d.status}|${d.relation}`);
  for (const r of state.responsibilities) mix(`r|${r.id}|${r.state}|${r.updatedAt}`);
  for (const a of state.actions) mix(`a|${a.id}`);

  const digest = `r1:${hash.toString(16).padStart(8, '0')}`;
  digests.set(state, digest);
  return digest;
}
