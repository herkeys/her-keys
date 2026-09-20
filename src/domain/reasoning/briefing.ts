import { pendingApprovals } from '../authorization';
import { oneMoveForDay, type OneMoveView } from '../oneMove';
import { projectStateDay } from '../projectDay';
import { isActiveResponsibility, type Responsibility } from '../foundation/responsibility';
import { logicalDateAt, type LocalDate } from '../logicalDay';
import { unacknowledgedResponsibilities } from '../responsibility';
import type { ActionExecution, ActionIntent } from '../foundation/authorization';
import type { AppState } from '../state';
import { attentionFor, type AttentionItem } from './attention';

/**
 * BRIEFING INPUTS — B4-FE01-025 (ADR-018).
 *
 * Everything a daily or spoken briefing needs, gathered from the shared primitives
 * through ONE function, so the briefing never has to know the internals of fifteen
 * modules. It builds no speech and no screen; a briefing is a rendering of this.
 *
 * "What changed since yesterday" is sourced from the per-row timestamps and the
 * append-only evidence tables, because `change_log` lives in the cloud and holds
 * pointers, not content. It is honest about what it cannot know: a row that stores no
 * timestamp (pre-Build-3 data) is never reported as changed.
 */

export interface Briefing {
  today: LocalDate;
  /** What matters today. */
  matters: { eventCount: number; taskCount: number; oneMove: OneMoveView };
  /** What changed since the given moment. */
  changed: { rows: number; observations: number };
  atRisk: AttentionItem[];
  needsHer: AttentionItem[];
  delegated: Responsibility[];
  unacknowledged: Responsibility[];
  /** What Her Keys did and succeeded at since the given moment. */
  handled: ActionExecution[];
  needsApproval: ActionIntent[];
}

const RISK_REASONS = new Set(['risk', 'conflict', 'capacity_overload', 'deadline']);

export function briefingFor(state: AppState, nowMs: number, sinceMs: number): Briefing {
  const today = logicalDateAt(nowMs, state.user.timezone);
  const day = projectStateDay(state, today);
  const attention = attentionFor(state, nowMs);

  const stamped: Array<{ createdAt: string | null; updatedAt?: string | null }> = [
    ...state.tasks, ...state.events, ...state.needsMe, ...state.people, ...state.responsibilities, ...state.goals, ...state.dependencies,
  ];
  const rows = stamped.filter((row) => {
    const at = row.updatedAt ?? row.createdAt;
    return at !== null && at !== undefined && Date.parse(at) > sinceMs;
  }).length;

  return {
    today,
    matters: { eventCount: day.events.length, taskCount: day.tasks.length, oneMove: oneMoveForDay(state, today) },
    changed: { rows, observations: state.observations.filter((o) => Date.parse(o.occurredAt) > sinceMs).length },
    atRisk: attention.filter((item) => RISK_REASONS.has(item.reason)),
    needsHer: attention.filter((item) => item.reason === 'needs_me' || item.reason === 'unacknowledged_delegation'),
    delegated: state.responsibilities.filter((r) => isActiveResponsibility(r) && r.responsibleKind !== 'self'),
    unacknowledged: unacknowledgedResponsibilities(state, nowMs),
    handled: state.executions.filter((e) => e.result === 'succeeded' && Date.parse(e.attemptedAt) > sinceMs),
    needsApproval: pendingApprovals(state, nowMs),
  };
}
