import { pendingApprovals } from '../authorization';
import { todaysIssues } from '../dailyLoadDecisions';
import { logicalDateAt, type LocalDate } from '../logicalDay';
import { unacknowledgedResponsibilities } from '../responsibility';
import type { AppState } from '../state';
import { consequenceRank } from '../foundation/authorization';
import type { TypedRef } from '../foundation/typedRef';

/**
 * ATTENTION INTENT — B4-FE01-019 (ADR-018).
 *
 * WHY something deserves her attention, as reasoning state. This is not delivery: there
 * is no push infrastructure, no notification UI and no token store here, and none is
 * needed for the semantics to be right. A future notifier reads this and decides how
 * and when; every module reading one shared answer is what stops each from inventing
 * its own trigger.
 *
 * Derived, never persisted. A stored "attention" would be a second copy of facts that
 * change under it.
 */

export const ATTENTION_REASONS = [
  'deadline',
  'risk',
  'conflict',
  'approval_required',
  'unacknowledged_delegation',
  'external_source_changed',
  'needs_me',
  'capacity_overload',
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export type AttentionUrgency = 'now' | 'today' | 'soon';

export interface AttentionItem {
  reason: AttentionReason;
  urgency: AttentionUrgency;
  about: TypedRef | null;
}

const URGENCY_RANK: Record<AttentionUrgency, number> = { now: 0, today: 1, soon: 2 };

export function attentionFor(state: AppState, nowMs: number): AttentionItem[] {
  const today: LocalDate = logicalDateAt(nowMs, state.user.timezone);
  const items: AttentionItem[] = [];

  // deadline — an open task due today or overdue is "now"; due within two days is "soon"
  for (const task of state.tasks) {
    if (task.status !== 'open' || task.dueDate === null) continue;
    const ref: TypedRef = { kind: 'task', id: task.id };
    if (task.dueDate <= today) items.push({ reason: 'deadline', urgency: task.dueDate < today ? 'now' : 'today', about: ref });
    else if (Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) <= 2 * 86_400_000) items.push({ reason: 'deadline', urgency: 'soon', about: ref });
  }

  // risk — something that would cost her if it slips, that nobody is demonstrably handling
  for (const task of state.tasks) {
    if (task.status !== 'open' || task.consequence === null || consequenceRank(task.consequence) < consequenceRank('high')) continue;
    const dueSoon = task.dueDate !== null && task.dueDate <= today;
    // ACKNOWLEDGED ≠ ACCEPTED: seeing a request is not agreeing to it, so only an actual ACCEPTED responsibility counts as
    // handled elsewhere. Treating "acknowledged" as covered would silently drop the risk alert for work nobody has agreed to do.
    const handledElsewhere = state.responsibilities.some(
      (r) => r.about.kind === 'task' && r.about.id === task.id && r.responsibleKind !== 'self' && r.state === 'accepted'
    );
    if (dueSoon && !handledElsewhere) items.push({ reason: 'risk', urgency: 'now', about: { kind: 'task', id: task.id } });
  }

  // conflict and capacity — what Daily Load already knows about today
  const primary = todaysIssues(state, today).primary;
  if (primary?.kind === 'overlap' || primary?.kind === 'transition_conflict') items.push({ reason: 'conflict', urgency: 'today', about: null });
  if (primary?.kind === 'capacity_pressure') items.push({ reason: 'capacity_overload', urgency: 'today', about: null });

  // approval — Her Keys proposed something and is waiting on her
  for (const intent of pendingApprovals(state, nowMs)) {
    items.push({ reason: 'approval_required', urgency: intent.consequence === 'critical' || intent.consequence === 'high' ? 'now' : 'today', about: { kind: 'intent', id: intent.id } });
  }

  // delegation — asked, and never answered
  for (const r of unacknowledgedResponsibilities(state, nowMs)) {
    items.push({ reason: 'unacknowledged_delegation', urgency: 'now', about: { kind: 'responsibility', id: r.id } });
  }

  // an external source moved after the row that mirrors it last caught up
  for (const ref of state.externalReferences) {
    if (ref.status !== 'active' || ref.linked === null || ref.lastObservedAt === null) continue;
    const list = ref.linked.kind === 'event' ? state.events : ref.linked.kind === 'task' ? state.tasks : [];
    const linked = (list as ReadonlyArray<{ id: string; updatedAt: string | null }>).find((row) => row.id === ref.linked?.id);
    if (linked && (linked.updatedAt === null || Date.parse(ref.lastObservedAt) > Date.parse(linked.updatedAt))) {
      items.push({ reason: 'external_source_changed', urgency: 'today', about: ref.linked });
    }
  }

  // needs her — captured, unclassified, still open
  for (const item of state.needsMe) {
    if (item.status === 'open') items.push({ reason: 'needs_me', urgency: item.dueDate !== null && item.dueDate <= today ? 'today' : 'soon', about: { kind: 'needsMe', id: item.id } });
  }

  return items.sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || ATTENTION_REASONS.indexOf(a.reason) - ATTENTION_REASONS.indexOf(b.reason)
  );
}
