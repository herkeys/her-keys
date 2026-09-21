import { dailyLoadDecisionFor } from '../../../domain/dailyLoadDecisions';
import type { DailyLoadIssues } from '../../../domain/dailyLoadIssues';
import type { LocalDate } from '../../../domain/logicalDay';
import type { DayView } from '../../../domain/projectDay';
import type { AppState } from '../../../domain/state';
import type { DecisionKind, DecisionSection } from './types';

/**
 * WHETHER THE DAY HAS A DECISION TO SHOW — and in what state.
 *
 * The verdict is Daily Load's; the actions and their guards are `DailyLoadCard`'s and the
 * recommendation-action domain functions'. This only answers: is there something for the
 * card to render, and has she already decided it? It reads the same records the card reads
 * (`dailyLoadDecisionFor`, and today's capacity ActionRecords), so the two cannot disagree.
 *
 * A timing decision (overlap, transition, tight window) whose window has ALREADY ENDED is not
 * offered as an action (WHY-doctrine D-02; foundation gap TODAY-FD-002). The tier itself is not
 * re-derived from the clock — `issues.tier` is exactly what Daily Load said — only the offer of an
 * action about a moment that has passed is withheld. Capacity pressure is a whole-day fact and is
 * not affected. A decision she has already made is always shown: it is what she decided.
 */

const CAPACITY_ACTIONS = new Set(['daily_load.drop_task', 'daily_load.shorten_task', 'daily_load.keep_capacity_plan', 'daily_load.protect_item']);

export interface DecisionResult {
  section: DecisionSection | null;
}

export function decisionView(state: AppState, today: LocalDate, day: DayView, issues: DailyLoadIssues, nowMinutes: number): DecisionResult {
  const { decision } = dailyLoadDecisionFor(state, today);
  const primary = issues.primary;
  const kind: DecisionKind | null =
    primary && primary.kind !== 'overdue' ? primary.kind : null;

  if (decision === 'moved' || decision === 'kept') {
    return { section: { kind, state: decision, needsDecision: false, tier: issues.tier } };
  }

  if (kind === null) return { section: null };

  if (kind === 'capacity_pressure') {
    const latest = [...state.actions].reverse().find((a) => a.logicalDate === today && CAPACITY_ACTIONS.has(a.type));
    if (latest) {
      return { section: { kind, state: latest.type === 'daily_load.keep_capacity_plan' ? 'kept' : 'adjusted', needsDecision: false, tier: issues.tier } };
    }
    return { section: { kind, state: 'undecided', needsDecision: true, tier: issues.tier } };
  }

  if (windowHasEnded(primary!, day, issues, nowMinutes)) return { section: null };
  return { section: { kind, state: 'undecided', needsDecision: true, tier: issues.tier } };
}

function windowHasEnded(primary: NonNullable<DailyLoadIssues['primary']>, day: DayView, issues: DailyLoadIssues, nowMinutes: number): boolean {
  if (primary.kind === 'overlap') {
    const a = day.events.find((e) => e.id === primary.eventAId);
    const b = day.events.find((e) => e.id === primary.eventBId);
    return a !== undefined && b !== undefined && Math.min(a.endMinutes, b.endMinutes) <= nowMinutes;
  }
  if (primary.kind === 'transition_conflict' || primary.kind === 'tight_window') {
    return issues.focus !== null && issues.focus.windowEndMinutes <= nowMinutes;
  }
  return false;
}
