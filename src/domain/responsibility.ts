import type { TransitionContext } from './context';
import { commitmentFacetsOf } from './foundation/commitment';
import { systemProvenance, userProvenance, provenanceFor } from './foundation/provenance';
import {
  isActiveResponsibility,
  isUnacknowledged,
  type HouseholdPerson,
  type Responsibility,
} from './foundation/responsibility';
import { refExists, type ContentRefKind, type TypedRef } from './foundation/typedRef';
import { toInstant } from './logicalDay';
import { appendObservation } from './observations';
import type { AppState } from './state';

/**
 * People and responsibility (B4-FE01-013 / -014, ADR-019).
 *
 * The lifecycle Her Keys needs in order to know whether the load actually left her
 * head:
 *
 *   owned -> requested -> acknowledged -> accepted -> completed
 *                     \-> declined        (or: returned to her, or reassigned)
 *
 * Every step is also appended as a behavior observation, so "how often does delegating
 * to this person actually work?" is answerable from history and not from a counter.
 * Nothing here sends anything; it is the state a delivery integration would drive.
 */

// ------------------------------------------------------------------- people ---

export function addPerson(
  state: AppState,
  ctx: TransitionContext,
  input: { displayName: string; relationship: HouseholdPerson['relationship']; channel?: HouseholdPerson['channel'] }
): AppState {
  const at = toInstant(ctx.nowMs);
  const person: HouseholdPerson = {
    id: ctx.createId('person'),
    displayName: input.displayName,
    relationship: input.relationship,
    channel: input.channel ?? 'unspecified',
    status: 'active',
    createdAt: at,
    updatedAt: at,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
  return { ...state, people: [...state.people, person] };
}

export function archivePerson(state: AppState, ctx: TransitionContext, personId: string): AppState {
  const person = state.people.find((p) => p.id === personId);
  if (!person || person.status === 'archived') return state;
  const at = toInstant(ctx.nowMs);
  return { ...state, people: state.people.map((p) => (p.id === personId ? { ...p, status: 'archived', updatedAt: at } : p)) };
}

// ------------------------------------------------------------ responsibility ---

export type Holder = { kind: 'person'; id: string } | { kind: 'child'; id: string } | { kind: 'self' };

export interface DelegateInput {
  about: TypedRef<ContentRefKind>;
  to: Exclude<Holder, { kind: 'self' }>;
  /** How long, from now, an answer is expected. Past it, the request reads as unacknowledged. */
  ackWithinMinutes?: number | null;
  /** Whether it still needs her while the request is out. True until they accept. */
  stillNeedsMe?: boolean;
}

const validHolder = (state: AppState, to: Exclude<Holder, { kind: 'self' }>): boolean =>
  to.kind === 'person'
    ? state.people.some((person) => person.id === to.id && person.status === 'active')
    : state.children.some((child) => child.id === to.id);

const validAckWindow = (minutes: number | null | undefined): boolean =>
  minutes == null || (Number.isFinite(minutes) && minutes >= 0);

export const liveResponsibilityFor = (state: Pick<AppState, 'responsibilities'>, about: TypedRef): Responsibility | null =>
  state.responsibilities.find((r) => r.about.kind === about.kind && r.about.id === about.id && isActiveResponsibility(r)) ?? null;

const holderFields = (to: Holder) => ({
  responsibleKind: to.kind,
  responsiblePersonId: to.kind === 'person' ? to.id : null,
  responsibleChildId: to.kind === 'child' ? to.id : null,
});

const update = (state: AppState, id: string, next: (r: Responsibility) => Responsibility): AppState => ({
  ...state,
  responsibilities: state.responsibilities.map((r) => (r.id === id ? next(r) : r)),
});

const observe = (state: AppState, ctx: TransitionContext, id: string, outcome: Parameters<typeof appendObservation>[2]['outcome'], system = false) =>
  appendObservation(state, ctx, {
    about: { kind: 'responsibility', id },
    outcome,
    provenance: system ? systemProvenance() : userProvenance(),
  });

/**
 * She asks somebody to take it. One live responsibility per thing: a second request for
 * something already handed off changes nothing (use `reassign`), so one item can never
 * have two owners.
 */
export function delegate(state: AppState, ctx: TransitionContext, input: DelegateInput, previousResponsibilityId: string | null = null): AppState {
  if (!refExists(state, input.about)) return state;
  if (liveResponsibilityFor(state, input.about) !== null) return state;
  if (!validHolder(state, input.to) || !validAckWindow(input.ackWithinMinutes)) return state;

  const at = toInstant(ctx.nowMs);
  const responsibility: Responsibility = {
    id: ctx.createId('resp'),
    about: input.about,
    ...holderFields(input.to),
    state: 'requested',
    requestedAt: at,
    acknowledgedAt: null,
    respondedAt: null,
    completedAt: null,
    returnedAt: null,
    ackDueAt: input.ackWithinMinutes == null ? null : toInstant(ctx.nowMs + input.ackWithinMinutes * 60_000),
    stillNeedsMe: input.stillNeedsMe ?? true,
    previousResponsibilityId,
    createdAt: at,
    updatedAt: at,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  } as Responsibility;
  return observe({ ...state, responsibilities: [...state.responsibilities, responsibility] }, ctx, responsibility.id, 'delegated');
}

/** They saw it. Not the same as saying yes. */
export function acknowledge(state: AppState, ctx: TransitionContext, id: string): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  if (!r || r.state !== 'requested') return state;
  const at = toInstant(ctx.nowMs);
  return observe(update(state, id, (x) => ({ ...x, state: 'acknowledged', acknowledgedAt: at, updatedAt: at })), ctx, id, 'acknowledged');
}

/** They said yes. It only stops needing her if she says so — accepting is not, by itself, proof the load left. */
export function accept(state: AppState, ctx: TransitionContext, id: string, stillNeedsMe = false): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  if (!r || (r.state !== 'requested' && r.state !== 'acknowledged')) return state;
  const at = toInstant(ctx.nowMs);
  return observe(update(state, id, (x) => ({ ...x, state: 'accepted', respondedAt: at, stillNeedsMe, updatedAt: at })), ctx, id, 'accepted');
}

/** They said no. It is hers again and it needs her. */
export function decline(state: AppState, ctx: TransitionContext, id: string): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  if (!r || (r.state !== 'requested' && r.state !== 'acknowledged')) return state;
  const at = toInstant(ctx.nowMs);
  return observe(update(state, id, (x) => ({ ...x, state: 'declined', respondedAt: at, stillNeedsMe: true, updatedAt: at })), ctx, id, 'declined');
}

export function completeResponsibility(state: AppState, ctx: TransitionContext, id: string): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  if (!r || !isActiveResponsibility(r)) return state;
  const at = toInstant(ctx.nowMs);
  return observe(update(state, id, (x) => ({ ...x, state: 'completed', completedAt: at, stillNeedsMe: false, updatedAt: at })), ctx, id, 'completed');
}

/** It comes back to her — because they could not, or because she took it back. */
export function returnToSelf(state: AppState, ctx: TransitionContext, id: string): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  if (!r || !isActiveResponsibility(r) || r.responsibleKind === 'self') return state;
  const at = toInstant(ctx.nowMs);
  return observe(
    update(state, id, (x) => ({ ...x, ...holderFields({ kind: 'self' }), state: 'returned', returnedAt: at, stillNeedsMe: true, updatedAt: at })),
    ctx,
    id,
    'returned'
  );
}

/** Hand it to somebody else. The earlier handoff is closed as returned and named by its successor. */
export function reassign(state: AppState, ctx: TransitionContext, id: string, to: Exclude<Holder, { kind: 'self' }>, ackWithinMinutes?: number | null): AppState {
  const r = state.responsibilities.find((x) => x.id === id);
  // Validate the successor before closing the current handoff. Otherwise a stale UI choice
  // (or malformed caller input) can silently return the work to her without reassigning it.
  if (!r || !isActiveResponsibility(r) || !validHolder(state, to) || !validAckWindow(ackWithinMinutes)) return state;
  const returned = returnToSelf(state, ctx, id);
  if (returned === state) return state;
  const closed = observe(returned, ctx, id, 'reassigned');
  return delegate(closed, ctx, { about: r.about as DelegateInput['about'], to, ackWithinMinutes }, id);
}

// ------------------------------------------------------------------ derived ---

/** Requests past the time an answer was due, that have no answer. Derived from the clock, never stored. */
export function unacknowledgedResponsibilities(state: Pick<AppState, 'responsibilities'>, atMs: number): Responsibility[] {
  return state.responsibilities.filter((r) => isUnacknowledged(r, atMs));
}

/**
 * Record — once — that a request went unanswered. The state is derived from the clock;
 * the observation is the durable fact that it happened, which is what delegation
 * reliability is later measured from. Idempotent: it never records the same miss twice.
 */
export function observeUnacknowledged(state: AppState, ctx: TransitionContext): AppState {
  let next = state;
  for (const r of unacknowledgedResponsibilities(state, ctx.nowMs)) {
    const seen = next.observations.some((o) => o.about.kind === 'responsibility' && o.about.id === r.id && o.outcome === 'unacknowledged');
    if (!seen) next = observe(next, ctx, r.id, 'unacknowledged', true);
  }
  return next;
}

/**
 * Does this still need HER? The honest answer depends on the handoff, not on a flag
 * someone might forget to clear:
 *
 *   - handed off and unanswered past its deadline  -> yes, and more urgently (it escalates)
 *   - handed off and declined, or returned          -> yes
 *   - handed off and requested/acknowledged/accepted -> whatever she said it still needs
 *   - never handed off                               -> what the row itself says, or unknown
 *
 * `null` is "not known" and is never coerced to a guess.
 */
export function needsMePersonally(state: AppState, about: TypedRef, atMs: number): boolean | null {
  const live = liveResponsibilityFor(state, about);
  if (live !== null && live.responsibleKind !== 'self') {
    return isUnacknowledged(live, atMs) ? true : live.stillNeedsMe;
  }
  const latest = [...state.responsibilities].reverse().find((r) => r.about.kind === about.kind && r.about.id === about.id);
  if (latest && (latest.state === 'declined' || latest.state === 'returned')) return true;
  if (about.kind === 'needsMe') return state.needsMe.find((n) => n.id === about.id)?.status === 'open' ? true : null;

  const collections = { task: state.tasks, event: state.events, meal: state.meals, system: state.systems } as const;
  const list = (collections as Record<string, ReadonlyArray<Record<string, unknown> & { id: string }>>)[about.kind];
  const row = list?.find((r) => r.id === about.id);
  if (!row) return null;
  return commitmentFacetsOf({ kind: about.kind as 'task' | 'event' | 'meal' | 'system', row }).needsMePersonally;
}
