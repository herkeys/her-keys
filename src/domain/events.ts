import type { TransitionContext } from './context';
import { toInstant } from './logicalDay';
import type { CalendarEvent, AppState, VisibilityScope } from './state';

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
    source: 'user',
    createdAt: now,
    updatedAt: now,
    scope: input.scope,
  };
  return { ...state, events: [...state.events, event] };
}

export type UpdateEventInput = Partial<
  Pick<
    CalendarEvent,
    | 'title'
    | 'categoryId'
    | 'subjectMemberId'
    | 'startsAt'
    | 'endsAt'
    | 'location'
    | 'notes'
    | 'commitment'
    | 'travelMinutesBefore'
    | 'travelMinutesAfter'
    | 'preparationMinutes'
  >
>;

export function updateEvent(state: AppState, ctx: TransitionContext, eventId: string, patch: UpdateEventInput): AppState {
  const current = state.events.find((event) => event.id === eventId);
  if (!current) return state;
  return {
    ...state,
    events: state.events.map((event) => (event.id === eventId ? { ...event, ...patch, updatedAt: toInstant(ctx.nowMs) } : event)),
  };
}

/** Removed rather than deleted: a past action record can still name it, and its history stays valid. */
export function removeEvent(state: AppState, ctx: TransitionContext, eventId: string): AppState {
  const current = state.events.find((event) => event.id === eventId);
  if (!current || current.status === 'removed') return state;
  return {
    ...state,
    events: state.events.map((event) =>
      event.id === eventId ? { ...event, status: 'removed', updatedAt: toInstant(ctx.nowMs) } : event
    ),
  };
}
