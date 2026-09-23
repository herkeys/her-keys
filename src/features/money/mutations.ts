import type { TransitionContext } from '../../domain/context';
import { formatAmount, parseMoney } from '../../domain/foundation/money';
import { isLocalDate, toInstant } from '../../domain/logicalDay';
import { FIELD_LIMITS, type AppState } from '../../domain/state';
import { addTask, archiveTask, completeTask } from '../../domain/tasks';
import { moneyCategory } from './identity';
import type { EditMoneyItemInput, MoneyItemFields, MoneyItemOutcome } from './types';

/**
 * MUTATIONS — composition over canonical domain transitions, and nothing else, mirroring
 * src/features/coparent/mutations.ts. Every write here is an existing domain function
 * (`addTask`, `completeTask`, `archiveTask`) or a spread over an existing row field that already
 * syncs. No new entity, column beyond the F09-M2a facet, kind or policy, and no sync code.
 *
 * `value` and `paymentMechanism` are facets with no writer in `updateTask` (MP-07-11 / M2a), so an
 * edit splices `state.tasks` directly, exactly as F07's `editMoneyFollowUp` does for `value`.
 *
 * Nothing here contacts anyone, moves money, or marks anything paid/received on its own: resolving
 * an item is always an explicit call the UI makes only in response to her own action.
 */

export interface MutationResult<O extends string> {
  state: AppState;
  outcome: O;
  id: string | null;
}

const refuse = <O extends string>(state: AppState, outcome: O): MutationResult<O> => ({ state, outcome, id: null });
const done = <O extends string>(state: AppState, outcome: O, id: string | null): MutationResult<O> => ({ state, outcome, id });

const trimmed = (value: string) => value.trim();

function requireCategory(state: AppState): { ok: true; categoryId: string } | { ok: false; outcome: 'no_category' | 'category_archived' } {
  const category = moneyCategory(state);
  if (category === null) return { ok: false, outcome: 'no_category' };
  if (category.status !== 'active') return { ok: false, outcome: 'category_archived' };
  return { ok: true, categoryId: category.id };
}

function textIssue(fields: { title: string; notes?: string }): 'invalid_title' | 'invalid_text' | null {
  const title = trimmed(fields.title);
  if (title.length === 0 || title.length > FIELD_LIMITS.titleLength) return 'invalid_title';
  if ((fields.notes ?? '').trim().length > FIELD_LIMITS.notesLength) return 'invalid_text';
  return null;
}

type ParsedMoneyItem = {
  title: string;
  due: string;
  notes: string | null;
  amountMinor: number;
};

function parseFields(
  state: AppState,
  fields: MoneyItemFields,
  direction: 'outflow' | 'inflow'
): { ok: true; value: ParsedMoneyItem } | { ok: false; outcome: MoneyItemOutcome } {
  if (fields.childId !== null && !state.children.some((child) => child.id === fields.childId)) return { ok: false, outcome: 'invalid_child' };
  const text = textIssue({ title: fields.title, notes: fields.notes });
  if (text !== null) return { ok: false, outcome: text };
  const due = trimmed(fields.dueDate);
  // A money item without a due/expected date has nothing to be attention-worthy about, and nothing for
  // Today/Calendar/One Move to read — the due date is required, unlike F07's optional follow-up date.
  if (!isLocalDate(due)) return { ok: false, outcome: 'invalid_date' };
  // USD only, by product decision: currency is never a caller-supplied value in F09 (see types.ts).
  const money = parseMoney(fields.amountText, 'USD', direction);
  // No amount is not $0, and a $0 obligation or expectation is not one.
  if (money === null || money.amountMinor <= 0) return { ok: false, outcome: 'invalid_amount' };
  return { ok: true, value: { title: trimmed(fields.title), due, notes: trimmed(fields.notes) || null, amountMinor: money.amountMinor } };
}

function createMoneyItem(
  state: AppState,
  ctx: TransitionContext,
  fields: MoneyItemFields,
  direction: 'outflow' | 'inflow'
): MutationResult<MoneyItemOutcome> {
  const category = requireCategory(state);
  if (!category.ok) return refuse(state, category.outcome);
  const parsed = parseFields(state, fields, direction);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;

  const before = new Set(state.tasks.map((task) => task.id));
  const next = addTask(state, ctx, {
    title: value.title,
    categoryId: category.categoryId,
    subjectMemberId: fields.childId,
    dueDate: value.due,
    notes: value.notes,
    // The narrowest truthful default for a household financial fact, not private personal data —
    // see docs/builds/HK_FEATURE_09_MONEY.md, "Default scope = household, not personal".
    scope: 'household',
    value: { amountMinor: value.amountMinor, currency: 'USD', direction },
    // Payment mechanism only ever applies to money LEAVING the household. Expected income is never "paid".
    paymentMechanism: direction === 'outflow' ? fields.paymentMechanism : null,
  });
  const created = next.tasks.find((task) => !before.has(task.id));
  if (!created) return refuse(state, 'invalid_title');
  return done(next, 'saved', created.id);
}

/** A household obligation: money leaving the household. Due, not yet paid, until she says otherwise. */
export function createObligation(state: AppState, ctx: TransitionContext, fields: MoneyItemFields): MutationResult<MoneyItemOutcome> {
  return createMoneyItem(state, ctx, fields, 'outflow');
}

/** Expected incoming money. Expected, not yet received, until she says otherwise. */
export function createExpectedIncome(state: AppState, ctx: TransitionContext, fields: MoneyItemFields): MutationResult<MoneyItemOutcome> {
  return createMoneyItem(state, ctx, fields, 'inflow');
}

function findMoneyTask(state: AppState, taskId: string) {
  const category = moneyCategory(state);
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || category === null || task.categoryId !== category.id || task.value === null) return null;
  return task;
}

/** A short, stable, non-cryptographic digest of what an editor needs to detect a stale edit (mirrors F07). */
export function moneyItemRevision(task: { updatedAt: string | null }): string | null {
  return task.updatedAt;
}

/** Edit an open money item. The amount lives in the existing `value` facet; entering a new one never becomes an agreed/verified one. */
export function editMoneyItem(state: AppState, ctx: TransitionContext, input: EditMoneyItemInput): MutationResult<MoneyItemOutcome> {
  const task = findMoneyTask(state, input.taskId);
  if (!task) return refuse(state, 'not_a_money_item');
  if (task.status !== 'open') return refuse(state, 'not_open');
  if (moneyItemRevision(task) !== input.baseUpdatedAt) return refuse(state, 'stale');

  const direction = task.value!.direction;
  const parsed = parseFields(state, input.fields, direction);
  if (!parsed.ok) return refuse(state, parsed.outcome);
  const { value } = parsed;

  const paymentMechanism = direction === 'outflow' ? input.fields.paymentMechanism : null;
  const unchanged =
    value.title === task.title &&
    input.fields.childId === task.subjectMemberId &&
    value.due === task.dueDate &&
    value.notes === task.notes &&
    value.amountMinor === task.value!.amountMinor &&
    paymentMechanism === task.paymentMechanism;
  if (unchanged) return refuse(state, 'unchanged');

  const nextTasks = state.tasks.map((candidate) =>
    candidate.id === task.id
      ? {
          ...candidate,
          title: value.title,
          subjectMemberId: input.fields.childId,
          dueDate: value.due,
          notes: value.notes,
          value: { ...candidate.value!, amountMinor: value.amountMinor },
          paymentMechanism,
          updatedAt: toInstant(ctx.nowMs),
        }
      : candidate
  );
  return done({ ...state, tasks: nextTasks }, 'saved', task.id);
}

/** Resolve an obligation as paid, or expected income as received. Always an explicit call — never inferred from the date. */
export function resolveMoneyItem(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<MoneyItemOutcome> {
  const task = findMoneyTask(state, taskId);
  if (!task) return refuse(state, 'not_a_money_item');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(completeTask(state, ctx, taskId), 'saved', taskId);
}

/** Cancel an obligation, or mark expected income as no longer expected. Kept, never deleted — a past record can still name it. */
export function cancelMoneyItem(state: AppState, ctx: TransitionContext, taskId: string): MutationResult<MoneyItemOutcome> {
  const task = findMoneyTask(state, taskId);
  if (!task) return refuse(state, 'not_a_money_item');
  if (task.status !== 'open') return refuse(state, 'not_open');
  return done(archiveTask(state, ctx, taskId), 'saved', taskId);
}

export interface DuplicateForwardInput {
  taskId: string;
  /** The next occurrence's due/expected date, normally the value `nextOccurrence()` previewed. Her confirmation, not automation. */
  nextDueDate: string;
}

/**
 * Create the next occurrence of a recurring money item, by explicit, user-confirmed copy — never
 * automatic materialization. See docs/builds/HK_FEATURE_09_MISSING_PRIMITIVES.md, MP-09-01, for why:
 * the existing recurrence engine derives one next date for one persistent subject and cannot honestly
 * retain independent per-occurrence history, which a recurring bill's paid/unpaid record needs.
 *
 * The SOURCE item is untouched (it may still be open and overdue, or already resolved) — this never
 * edits it, only reads its template (title, amount, mechanism, child) to seed a brand-new open item.
 */
export function duplicateMoneyItemForward(state: AppState, ctx: TransitionContext, input: DuplicateForwardInput): MutationResult<MoneyItemOutcome> {
  const source = findMoneyTask(state, input.taskId);
  if (!source) return refuse(state, 'not_a_money_item');
  if (!isLocalDate(input.nextDueDate)) return refuse(state, 'invalid_date');
  const category = requireCategory(state);
  if (!category.ok) return refuse(state, category.outcome);

  const before = new Set(state.tasks.map((task) => task.id));
  const next = addTask(state, ctx, {
    title: source.title,
    categoryId: category.categoryId,
    subjectMemberId: source.subjectMemberId,
    dueDate: input.nextDueDate,
    notes: source.notes,
    scope: source.scope,
    value: { ...source.value! },
    paymentMechanism: source.paymentMechanism,
  });
  const created = next.tasks.find((task) => !before.has(task.id));
  if (!created) return refuse(state, 'invalid_title');
  return done(next, 'saved', created.id);
}

/** For UI display only: the exact decimal string of a task's amount, or null if it is not a money task. */
export function displayAmount(task: { value: { amountMinor: number; currency: string } | null }): string | null {
  return task.value === null ? null : formatAmount(task.value);
}
