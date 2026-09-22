import type { Clock } from '../coparent';
import { formatAmount } from '../../domain/foundation/money';
import { addDays, logicalDateAt, type LocalDate } from '../../domain/logicalDay';
import { autopayPreDueSuppressed } from '../../domain/reasoning/attention';
import { FIRST_GLANCE_ATTENTION } from '../../features/today/model/todayView';
import type { AppState, Task } from '../../domain/state';
import { openTasksInCategory, type OpenTaskEntry } from '../../domain/taskLists';
import { moneyCategoryId } from './identity';
import { outstandingReimbursements, recentlyResolvedReimbursements, type ReimbursementProjection } from './reimbursements';

/**
 * MONEY HOME — read-side projection over Money's own canonical `Task` rows plus F07's
 * reimbursement truth. Nothing here is stored; nothing here is a second Today or a second
 * briefing queue (owner brief, "MONEY -> TODAY"). Money Home is Money's OWN page, allowed its
 * own bounded sections, separate from — and never duplicating — the shared Today pipeline.
 */

/** Display retention only, per the owner brief ("RESOLVED RETENTION"): NOT data retention. */
export const RECENTLY_RESOLVED_WINDOW_DAYS = 14;

/** Same bound Today already uses for its own attention list — "use existing prioritization conventions". */
export const NEEDS_ATTENTION_LIMIT = FIRST_GLANCE_ATTENTION;

export type MoneyItemStatus = 'open' | 'resolved' | 'cancelled';

export interface MoneyItemView {
  taskId: string;
  title: string;
  direction: 'outflow' | 'inflow';
  amountMinor: number;
  currency: string;
  decimal: string;
  dueDate: LocalDate;
  status: MoneyItemStatus;
  /** True once the calendar day AFTER dueDate has begun (household timezone). Never derived from urgency copy. */
  pastDue: boolean;
  paymentMechanism: 'manual' | 'autopay' | null;
  childId: string | null;
  completedAt: string | null;
}

function moneyTasks(state: AppState): Task[] {
  const categoryId = moneyCategoryId(state);
  if (categoryId === null) return [];
  return state.tasks.filter((task) => task.categoryId === categoryId && task.value !== null);
}

function viewOf(task: Task, today: LocalDate): MoneyItemView {
  const status: MoneyItemStatus = task.status === 'completed' ? 'resolved' : task.status === 'archived' ? 'cancelled' : 'open';
  return {
    taskId: task.id,
    title: task.title,
    direction: task.value!.direction,
    amountMinor: task.value!.amountMinor,
    currency: task.value!.currency,
    decimal: formatAmount(task.value!),
    dueDate: task.dueDate!,
    status,
    pastDue: task.dueDate! < today,
    paymentMechanism: task.paymentMechanism,
    childId: task.subjectMemberId,
    completedAt: task.completedAt,
  };
}

/** Every Money OS obligation/expected-income item, any status. A task with no dueDate is not a Money OS item (see mutations.ts). */
export function moneyItemsOf(state: AppState, today: LocalDate): MoneyItemView[] {
  return moneyTasks(state)
    .filter((task): task is Task & { dueDate: LocalDate } => task.dueDate !== null)
    .map((task) => viewOf(task, today));
}

export interface MoneyHomeView {
  verdict: string;
  needsAttention: MoneyItemView[];
  comingUp: MoneyItemView[];
  expectedIn: MoneyItemView[];
  outstandingReimbursements: ReimbursementProjection[];
  recentlyResolved: { own: MoneyItemView[]; reimbursements: ReimbursementProjection[] };
  /**
   * Open tasks filed in the money category that are NOT one of Money's own obligation/expected-
   * income items (no `value` facet) — a generic task someone captured and categorized as Money
   * without going through Money's own create flow. Money is a `TASK_LIST_ROLES` category
   * (src/domain/taskLists.ts), so the Life hub's generic "Other open tasks" fallback deliberately
   * excludes it, trusting THIS screen to list every open task in the category. Without this,
   * such a task would be unreachable anywhere in the app (tests/build3Audit.capture.test.mjs,
   * "every Life screen with a task list is wired to its role").
   */
  otherOpenTasks: OpenTaskEntry[];
}

const COMING_UP_WINDOW_DAYS = 14;

export function buildMoneyHomeView(state: AppState, householdId: string, clock: Clock): MoneyHomeView {
  const today = logicalDateAt(clock.nowMs, state.user.timezone);
  const items = moneyItemsOf(state, today);
  const open = items.filter((i) => i.status === 'open');

  // Needs attention: due today or overdue, minus the autopay pre-due suppression the shared
  // Today pipeline also applies (src/domain/reasoning/attention.ts) — the SAME rule, so Money
  // Home and Today never disagree about whether an item is attention-worthy yet.
  const dueNow = open.filter((i) => !autopayPreDueSuppressed(i.dueDate, i.paymentMechanism, today) && i.dueDate <= today);
  const reimbursementsOut = outstandingReimbursements(state, householdId, clock);
  // Most urgent first: past-due before due-today, oldest due date first. Bounded — never an endless overdue list.
  const needsAttention = [...dueNow]
    .sort((a, b) => (a.pastDue === b.pastDue ? a.dueDate.localeCompare(b.dueDate) : a.pastDue ? -1 : 1))
    .slice(0, NEEDS_ATTENTION_LIMIT);

  const horizon = addDays(today, COMING_UP_WINDOW_DAYS);
  const upcoming = open.filter((i) => i.dueDate > today && i.dueDate <= horizon).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const comingUp = upcoming.filter((i) => i.direction === 'outflow');
  const expectedIn = upcoming.filter((i) => i.direction === 'inflow');

  const resolvedHorizon = addDays(today, -RECENTLY_RESOLVED_WINDOW_DAYS);
  const recentlyResolvedOwn = items
    .filter((i) => i.status === 'resolved' && i.completedAt !== null && logicalDateAt(Date.parse(i.completedAt), state.user.timezone) >= resolvedHorizon)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const recentlyResolvedReimb = recentlyResolvedReimbursements(state, householdId, clock).filter(
    (r) => r.completedAt !== null && logicalDateAt(Date.parse(r.completedAt), state.user.timezone) >= resolvedHorizon
  );

  // The soonest open item overall, regardless of window or attention suppression — the calm
  // verdict's "next" fact is honest about what is coming, even an autopay item due today that
  // is correctly absent from needsAttention.
  const soonestOpen = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;

  const attentionCount = needsAttention.length + reimbursementsOut.length;
  const verdict = verdictSentence(attentionCount, dueNow.length + reimbursementsOut.length > NEEDS_ATTENTION_LIMIT, soonestOpen);

  const categoryId = moneyCategoryId(state);
  const otherOpenTasks = categoryId === null ? [] : openTasksInCategory(state, categoryId, today).filter((entry) => entry.task.value === null);

  return {
    verdict,
    needsAttention,
    comingUp,
    expectedIn,
    outstandingReimbursements: reimbursementsOut,
    recentlyResolved: { own: recentlyResolvedOwn, reimbursements: recentlyResolvedReimb },
    otherOpenTasks,
  };
}

/**
 * ONE deterministic plain-language verdict sentence (owner brief, "MONEY HOME"). Never claims
 * affordability or coverage — only counts what is actually attention-worthy right now.
 */
function verdictSentence(attentionCount: number, moreThanShown: boolean, next: MoneyItemView | null): string {
  if (attentionCount === 0) {
    if (next === null) return 'Nothing needs attention.';
    const noun = next.direction === 'outflow' ? 'obligation' : 'expected payment';
    return `Nothing needs attention. Next ${noun}: ${next.title} ${next.direction === 'outflow' ? 'due' : 'expected'} ${next.dueDate}.`;
  }
  const plural = attentionCount === 1 ? 'item needs' : 'items need';
  const suffix = moreThanShown ? ' or more' : '';
  return `${attentionCount}${suffix} money ${plural} attention.`;
}
