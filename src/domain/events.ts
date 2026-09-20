import type { TransitionContext } from './context';
import { emptyEventFacets } from './foundation/commitment';
import type { Money } from './foundation/money';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { toInstant } from './logicalDay';
import { appendObservation } from './observations';
import type { CalendarEvent, AppState, VisibilityScope } from './state';
import { pickFields } from './tasks';

/**
 * Real event capture. FIXED vs FLEXIBLE is her own call at capture time —
 * Her Keys never infers it, and only a FLEXIBLE event is ever a candidate for
 * a move recommendation. Travel and preparation minutes are hers to enter or
 * leave blank; nothing here ever estimates them.
 */

export interface AddEventInput {
  title: string;
  categoryId: string;
  subjectMemberId?: string | null;
  startsAt: string;
  endsAt: string;
  commitment: 'fixed' | 'flexible';
  location?: string | null;
  notes?: string | null;
  travelMinutesBefore?: number | null;
  travelMinutesAfter?: number | null;
  preparationMinutes?: number | null;
  scope: VisibilityScope;
  /** Where this event really came from. A user capture is `user-action`, which is the default. */
  provenance?: Provenance;
  /** What attending costs or earns, exactly. Unknown unless stated. */
  value?: Money | null;
}

export function addEvent(state: AppState, ctx: TransitionContext, input: AddEventInput): AppState {
  const now = toInstant(ctx.nowMs);
  const event: CalendarEvent = {
    id: ctx.createId('evt'),
    title: input.title,
    categoryId: input.categoryId,
    subjectMemberId: input.subjectMemberId ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location ?? null,
    notes: input.notes ?? null,
    commitment: input.commitment,
    status: 'active',
    travelMinutesBefore: input.travelMinutesBefore ?? null,
    travelMinutesAfter: input.travelMinutesAfter ?? null,
    preparationMinutes: input.preparationMinutes ?? null,
    ...emptyEventFacets(),
    value: input.value ?? null,
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
    createdAt: now,
    updatedAt: now,
    scope: input.scope,
  };
  return { ...state, events: [...state.events, event] };
}

const EDITABLE_EVENT_FIELDS = [
  'title',
  'categoryId',
  'subjectMemberId',
  'startsAt',
  'endsAt',
  'location',
  'notes',
  'commitment',
  'travelMinutesBefore',
  'travelMinutesAfter',
  'preparationMinutes',
] as const;

export type UpdateEventInput = Partial<Pick<CalendarEvent, (typeof EDITABLE_EVENT_FIELDS)[number]>>;

/** Only the editable fields are taken from the patch — an edit never rewrites an event's visibility scope, status, source or history. */
export function updateEvent(state: AppState, ctx: TransitionContext, eventId: string, patch: UpdateEventInput): AppState {
  const current = state.events.find((event) => event.id === eventId);
  if (!current) return state;
  const edits = pickFields(patch, EDITABLE_EVENT_FIELDS);
  return {
    ...state,
    events: state.events.map((event) => (event.id === eventId ? { ...event, ...edits, updatedAt: toInstant(ctx.nowMs) } : event)),
  };
}

/** Removed rather than deleted: a past action record can still name it, and its history stays valid. */
export function removeEvent(state: AppState, ctx: TransitionContext, eventId: string): AppState {
  const current = state.events.find((event) => event.id === eventId);
  if (!current || current.status === 'removed') return state;
  const next: AppState = {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId ? { ...event, status: 'removed', updatedAt: toInstant(ctx.nowMs) } : event
    ),
  };
  return appendObservation(next, ctx, { about: { kind: 'event', id: eventId }, outcome: 'cancelled' });
}
