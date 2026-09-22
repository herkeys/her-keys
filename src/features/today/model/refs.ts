import { carriesConfidence, isUserStated, type Provenance } from '../../../domain/foundation/provenance';
import type { TypedRef } from '../../../domain/foundation/typedRef';
import { wallClockMinutesAt, epochMsOf } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { formatTime } from '../../daily-load/computeDailyLoad';
import type { SourceLine, TodayRoute } from './types';

/**
 * How Today reads a row's provenance: the stored producer and the stored
 * confidence, exactly as they are. `uncertain` is only ever true for a claim Her
 * Keys made that she has not confirmed. Nothing here promotes, defaults or
 * infers a level — `legacy-unknown` stays unknown and is never `userStated`.
 */
export function sourceOf(row: { provenance: Provenance }): SourceLine {
  const { producer, confidence } = row.provenance;
  return {
    producer,
    confidence: carriesConfidence(producer) ? confidence : null,
    uncertain: carriesConfidence(producer) && (confidence === 'possible' || confidence === 'likely'),
    userStated: isUserStated(producer),
  };
}

export const taskRoute = (taskId: string): TodayRoute => ({ pathname: '/task-editor', params: { taskId } });
export const eventRoute = (eventId: string): TodayRoute => ({ pathname: '/event-editor', params: { eventId } });
export const needsMeRoute = (): TodayRoute => ({ pathname: '/life/needs-me' });
export const opportunityRoute = (opportunityId: string): TodayRoute => ({ pathname: '/opportunity-editor', params: { opportunityId } });

export interface RefInfo {
  ref: TypedRef;
  title: string | null;
  route: TodayRoute | null;
  source: SourceLine | null;
}

/** Resolves a typed reference to what Today may say about it: a name, a place to open it, and where it came from. */
export function describeRef(state: AppState, ref: TypedRef): RefInfo {
  switch (ref.kind) {
    case 'task': {
      const row = state.tasks.find((t) => t.id === ref.id);
      return { ref, title: row?.title ?? null, route: row ? taskRoute(row.id) : null, source: row ? sourceOf(row) : null };
    }
    case 'event': {
      const row = state.events.find((e) => e.id === ref.id);
      return { ref, title: row?.title ?? null, route: row ? eventRoute(row.id) : null, source: row ? sourceOf(row) : null };
    }
    case 'needsMe': {
      const row = state.needsMe.find((n) => n.id === ref.id);
      return { ref, title: row?.title ?? null, route: row ? needsMeRoute() : null, source: row ? sourceOf(row) : null };
    }
    case 'goal': {
      const row = state.goals.find((g) => g.id === ref.id);
      return { ref, title: row?.title ?? null, route: null, source: row ? sourceOf(row) : null };
    }
    case 'system': {
      const row = state.systems.find((s) => s.id === ref.id);
      return { ref, title: row?.name ?? null, route: null, source: row ? sourceOf(row) : null };
    }
    case 'meal': {
      const row = state.meals.find((m) => m.id === ref.id);
      return { ref, title: row?.title ?? null, route: null, source: row ? sourceOf(row) : null };
    }
    case 'person': {
      const row = state.people.find((p) => p.id === ref.id);
      return { ref, title: row?.displayName ?? null, route: null, source: row ? sourceOf(row) : null };
    }
    case 'opportunity': {
      const row = state.careerOpportunities.find((o) => o.id === ref.id);
      return { ref, title: row?.title ?? null, route: row ? opportunityRoute(row.id) : null, source: row ? sourceOf(row) : null };
    }
    case 'responsibility': {
      const row = state.responsibilities.find((r) => r.id === ref.id);
      return row ? { ...describeRef(state, row.about), ref } : { ref, title: null, route: null, source: null };
    }
    default:
      return { ref, title: null, route: null, source: null };
  }
}

/** A clock time in the household's own timezone — never the device's. */
export function timeLabelAt(instant: string, timeZone: string): string {
  return formatTime(wallClockMinutesAt(epochMsOf(instant), timeZone));
}

/** Who holds a delegated thing, by the name she gave them. `null` when the holder is not resolvable. */
export function holderName(state: AppState, r: { responsibleKind: 'self' | 'person' | 'child'; responsiblePersonId: string | null; responsibleChildId: string | null }): string | null {
  if (r.responsibleKind === 'person') return state.people.find((p) => p.id === r.responsiblePersonId)?.displayName ?? null;
  if (r.responsibleKind === 'child') return state.children.find((c) => c.id === r.responsibleChildId)?.displayName ?? null;
  return null;
}

/** "one" … "ten" read better than digits in a sentence; larger counts stay numerals. */
export function countWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n >= 0 && n < words.length ? words[n] : String(n);
}

export const capitalize = (text: string): string => (text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`);
