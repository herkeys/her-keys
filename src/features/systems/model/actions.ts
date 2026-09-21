import { MAX_STEPS_PER_SYSTEM } from '../commands/stepOrder';
import type { ActionAvailability, HolderChoice, ResponsibilityView, ScheduleView, SystemAction } from './types';

/**
 * The lifecycle-action map for ONE System, with the reason for every answer.
 *
 * An action that is not available is not rendered (no disabled decoys). The reasons are machine
 * codes for the structural evidence; the UI renders only what is available. Several actions are
 * unavailable for the same reason at every System — the foundation has no such semantics — and
 * they are listed anyway, so an auditor can see the absence was decided, not overlooked.
 */

export interface ActionInput {
  stepCount: number;
  schedule: Pick<ScheduleView, 'state' | 'nextExpected'>;
  responsibility: ResponsibilityView | null;
  holderChoices: HolderChoice[];
  /** False when the session cannot save (memory-only). Nothing may be offered then. */
  writable: boolean;
}

const yes = (action: SystemAction): ActionAvailability => ({ action, available: true, reason: 'available' });
const no = (action: SystemAction, reason: string): ActionAvailability => ({ action, available: false, reason });
const when = (action: SystemAction, ok: boolean, reason: string): ActionAvailability => (ok ? yes(action) : no(action, reason));

export function actionsFor(input: ActionInput): ActionAvailability[] {
  const { stepCount, schedule, responsibility, holderChoices, writable } = input;
  const guard = (list: ActionAvailability[]): ActionAvailability[] =>
    writable ? list : list.map((entry) => (entry.available ? no(entry.action, 'read_only_session') : entry));

  const liveHandoff = responsibility !== null && responsibility.live && responsibility.holder.kind !== 'self' ? responsibility : null;
  const hasLiveSchedule = schedule.state === 'active' || schedule.state === 'paused';

  return guard([
    yes('edit'),
    when('add_step', stepCount < MAX_STEPS_PER_SYSTEM, 'step_limit_reached'),
    when('edit_step', stepCount > 0, 'no_steps'),
    no('remove_step', 'no_retire_semantics'),
    when('reorder_steps', stepCount >= 2, 'fewer_than_two_steps'),
    yes('set_schedule'),
    when('stop_schedule', hasLiveSchedule, 'no_live_schedule'),
    when('pause_schedule', schedule.state === 'active', schedule.state === 'paused' ? 'already_paused' : 'no_live_schedule'),
    when('resume_schedule', schedule.state === 'paused', 'not_paused'),
    when(
      'skip_next',
      schedule.state === 'active' && schedule.nextExpected !== null,
      schedule.state === 'paused' ? 'paused' : schedule.state === 'active' ? 'no_upcoming_date' : 'no_live_schedule'
    ),
    when('assign_responsibility', liveHandoff === null && holderChoices.length > 0, liveHandoff !== null ? 'already_assigned' : 'no_holder_available'),
    when('reassign_responsibility', liveHandoff !== null && holderChoices.length > 0, liveHandoff === null ? 'no_live_handoff' : 'no_holder_available'),
    when('take_back_responsibility', liveHandoff !== null, 'no_live_handoff'),
    when('record_answer', liveHandoff !== null && (liveHandoff.state === 'requested' || liveHandoff.state === 'acknowledged'), 'nothing_awaiting_an_answer'),
    no('archive', 'no_status_semantics'),
    no('delete', 'no_delete_semantics'),
    no('duplicate', 'no_copy_semantics'),
    no('start_run', 'no_run_semantics'),
    no('complete_step', 'no_step_completion_semantics'),
  ]);
}
