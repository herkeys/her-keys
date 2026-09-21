import type { TransitionContext } from '../../../domain/context';
import { approveDailyLoadMove, keepDailyLoadPlan, latestTransitionDecision, undoableMove } from '../../../domain/dailyLoadDecisions';
import { approveDropTask, approveMoveEvent, approveProtectItem, approveShortenTask, keepCapacityPlan } from '../../../domain/recommendationActions';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import type { ActionAvailability, ActionName, DayItem, DayMode } from './types';

/**
 * ACTION AVAILABILITY (docs/builds/HK_FEATURE_03_ACTION_MAP.md).
 *
 * Availability is decided by DRY-RUNNING the foundation's own pure mutation on the current
 * state: if it returns a different state, the action is legitimate right now; if it returns the
 * same state it would be a silent no-op, so it is not offered. Calendar therefore never re-encodes
 * a precondition (and cannot drift from what Accept will really do), and it creates no action the
 * foundation does not already have. Nothing here is committed.
 *
 * Every recommendation action is TODAY-ONLY by foundation design (F03-FG-08): it reads the store's
 * `ctx.today`, gates on the live verdict for today, and moves things to today + 1.
 */

const CAPACITY_ACTION_TYPES = new Set(['daily_load.drop_task', 'daily_load.shorten_task', 'daily_load.keep_capacity_plan']);
const ACTION_ORDER: ActionName[] = ['EDIT', 'MOVE', 'KEEP', 'DROP', 'SHORTEN', 'KEEP_CAPACITY', 'PROTECT', 'UNDO'];

export interface ActionInputs {
  state: AppState;
  today: LocalDate;
  nowMs: number;
  mode: DayMode;
  items: DayItem[];
}

export function actionAvailability({ state, today, nowMs, mode, items }: ActionInputs): ActionAvailability[] {
  const result: ActionAvailability[] = [];
  const add = (action: ActionName, item: DayItem | null, available: boolean, reason: ActionAvailability['reason']) =>
    result.push({ action, itemRef: item === null ? null : item.ref, available, reason });

  // EDIT is the existing editors, on any day.
  for (const item of items) add('EDIT', item, true, 'legitimate_edit_path');

  const dryRun: TransitionContext = { nowMs, today, createId: (prefix) => `${prefix}-dry-run` };
  const changes = (next: AppState) => next !== state;

  const flexible = items.filter((item) => item.flexibility === 'flexible' && item.progress !== 'elapsed');

  // PROTECT has no verdict or day gate in the foundation: any flexible item that is still ahead of her.
  const protectable = mode === 'past' ? [] : flexible.filter((item) => changes(approveProtectItem(state, dryRun, { targetType: item.ref.kind, targetId: item.ref.id })));
  for (const item of protectable) add('PROTECT', item, true, 'flexible_item');
  if (protectable.length === 0) add('PROTECT', null, false, mode === 'past' ? 'elapsed' : 'fixed_commitment');

  if (mode !== 'today') {
    for (const action of ['MOVE', 'KEEP', 'DROP', 'SHORTEN', 'KEEP_CAPACITY', 'UNDO'] as ActionName[]) add(action, null, false, 'not_today');
    return sortActions(result);
  }

  const timingDecided = latestTransitionDecision(state, today) !== null;
  const capacityDecided = state.actions.some((action) => action.logicalDate === today && CAPACITY_ACTION_TYPES.has(action.type));

  let moves = 0;
  let drops = 0;
  let shortens = 0;
  for (const item of flexible) {
    const id = item.ref.id;
    if (item.ref.kind === 'event') {
      if (changes(approveMoveEvent(state, dryRun, id))) {
        add('MOVE', item, true, 'offered_by_verdict');
        moves++;
      }
      continue;
    }
    if (changes(approveDailyLoadMove(state, dryRun, id))) {
      add('MOVE', item, true, 'offered_by_verdict');
      moves++;
    }
    if (changes(approveDropTask(state, dryRun, id))) {
      add('DROP', item, true, 'offered_by_verdict');
      drops++;
    }
    if (changes(approveShortenTask(state, dryRun, id))) {
      add('SHORTEN', item, true, 'offered_by_verdict');
      shortens++;
    }
  }
  if (moves === 0) add('MOVE', null, false, timingDecided ? 'decision_already_made' : 'not_offered_by_verdict');
  if (drops === 0) add('DROP', null, false, capacityDecided ? 'decision_already_made' : 'not_offered_by_verdict');
  if (shortens === 0) add('SHORTEN', null, false, capacityDecided ? 'decision_already_made' : 'not_offered_by_verdict');

  if (changes(keepDailyLoadPlan(state, dryRun, null))) add('KEEP', null, true, 'offered_by_verdict');
  else add('KEEP', null, false, timingDecided ? 'decision_already_made' : 'no_recommendation_shown');

  if (changes(keepCapacityPlan(state, dryRun))) add('KEEP_CAPACITY', null, true, 'offered_by_verdict');
  else add('KEEP_CAPACITY', null, false, capacityDecided ? 'decision_already_made' : 'no_recommendation_shown');

  const undo = undoableMove(state, today);
  if (undo !== null) result.push({ action: 'UNDO', itemRef: { kind: undo.type === 'daily_load.move_task' ? 'task' : 'event', id: undo.targetId }, available: true, reason: 'undoable_today' });
  else add('UNDO', null, false, 'nothing_to_undo');

  return sortActions(result);
}

function sortActions(actions: ActionAvailability[]): ActionAvailability[] {
  return actions.sort(
    (a, b) =>
      ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) ||
      Number(b.available) - Number(a.available) ||
      (a.itemRef?.id ?? '').localeCompare(b.itemRef?.id ?? '')
  );
}
