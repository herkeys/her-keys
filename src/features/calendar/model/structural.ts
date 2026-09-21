import type { CalendarDayViewModel, CalendarWeekViewModel } from './types';

/**
 * STRUCTURAL EVIDENCE (contract section 67). Deterministic, pretty-printed JSON of the top-level
 * view model: keys sorted, numbers rounded to a fixed precision, no dates or runtime values that
 * differ between runs. Tests compare the live projection against the committed file, so a change
 * to what Calendar concludes is a visible diff that needs intentional review — not a snapshot of
 * JSX, and not prose.
 */

const round = (value: number): number => Math.round(value * 1000) / 1000;

function canonical(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? round(value) : String(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) result[key] = canonical(source[key]);
    }
    return result;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

/** The scenario evidence for one day: exactly the fields the contract lists, nothing derived from the UI. */
export function dayEvidence(view: CalendarDayViewModel): unknown {
  return {
    selectedDate: view.selectedDate,
    dayMode: view.dayMode,
    timeZone: view.timeZone,
    householdOrigin: view.householdOrigin,
    dayItems: view.dayItems.map((item) => ({
      ref: item.ref,
      title: item.title,
      flexibility: item.flexibility,
      timing:
        item.timing.kind === 'timed'
          ? { kind: 'timed', startMinute: item.timing.startMinute, endMinute: item.timing.endMinute, endKnown: item.timing.endKnown, continuesFromPreviousDay: item.timing.continuesFromPreviousDay, continuesIntoNextDay: item.timing.continuesIntoNextDay }
          : { kind: 'date_only', basis: item.timing.basis, dueDate: item.timing.dueDate, daysOverdue: item.timing.daysOverdue },
      progress: item.progress,
      subject: item.subject,
      responsibility: item.responsibility === null ? null : { coverage: item.responsibility.coverage, state: item.responsibility.state, covered: item.responsibility.covered, unacknowledged: item.responsibility.unacknowledged },
      blockedBy: item.blockedBy.map((blocker) => ({ ref: blocker.ref, finishMinute: blocker.finishMinute })),
      repeats: item.repeats === null ? null : { frequency: item.repeats.frequency, interval: item.repeats.interval },
    })),
    narrowTransitions: view.narrowTransitions,
    conflicts: view.conflicts.map((conflict) => ({ type: conflict.type, itemRefs: conflict.itemRefs, evidenceRefs: conflict.evidenceRefs, evidence: conflict.evidence })),
    unplacedItems: view.unplacedItems.map((item) => ({ itemRef: item.itemRef, state: item.state, reason: item.reason, durationKnown: item.durationKnown, openings: item.openings, missing: item.missing })),
    openWindows: view.openWindows,
    capacityState: view.capacityState,
    availableActions: view.availableActions,
    unknownStates: view.unknownStates,
    preview: view.preview,
  };
}

export const dayEvidenceJson = (view: CalendarDayViewModel): string => stableJson(dayEvidence(view));
export const weekEvidenceJson = (week: CalendarWeekViewModel): string => stableJson(week);
