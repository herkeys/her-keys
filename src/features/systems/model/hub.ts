import type { SystemStep } from '../../../domain/foundation/structure';
import type { AppState } from '../../../domain/state';
import { availabilityOf, type SnapshotSlice } from './availability';
import { attentionReasonsFor, responsibilityViewFor } from './responsibility';
import { scheduleViewFor } from './schedule';
import { durationFor } from './steps';
import type { HubItem, HubView } from './types';

export interface HubInput extends SnapshotSlice {
  nowMs: number;
}

/** Sorts after every real date. */
const NO_DATE = '9999-99-99';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * "What repeatable Systems run my household?"
 *
 * Ordering is grounded in facts she can see, with NO score and no hidden rank:
 *   1. needs attention  — a request she made that nobody answered by the time it was due
 *   2. next expected date, soonest first (only when the foundation can actually derive one)
 *   3. everything without a derivable date, by name, then id
 * Two Systems that tie on all of that stay in a fixed order (name, then id), so the list never
 * shuffles between renders.
 *
 * It is a list of what exists, not an activity feed: no history, no counts of what was done.
 */
export function projectSystemsHub(input: HubInput): HubView {
  const availability = availabilityOf(input);
  if (availability.kind !== 'ready' || input.state === null || input.today === null) {
    return { availability, items: [], isEmpty: false, canCreate: false };
  }

  const state: AppState = input.state;
  const { today, nowMs } = input;

  const stepsBySystem = new Map<string, SystemStep[]>();
  for (const step of state.systemSteps) {
    const list = stepsBySystem.get(step.systemId);
    if (list) list.push(step);
    else stepsBySystem.set(step.systemId, [step]);
  }
  const areaName = new Map(state.categories.map((category) => [category.id, category.name]));

  const keyed = state.systems.map((system) => {
    const steps = stepsBySystem.get(system.id) ?? [];
    const schedule = scheduleViewFor(state, system.id, today);
    const responsibility = responsibilityViewFor(state, system.id, nowMs);
    const item: HubItem = {
      id: system.id,
      name: system.name,
      purpose: system.description,
      areaName: areaName.get(system.categoryId) ?? null,
      stepCount: steps.length,
      duration: durationFor(steps, system.effortMinutes),
      schedule: {
        state: schedule.state,
        trigger: schedule.trigger,
        frequency: schedule.frequency,
        interval: schedule.interval,
        byWeekday: schedule.byWeekday,
        byMonthDay: schedule.byMonthDay,
        timeOfDayMinutes: schedule.timeOfDayMinutes,
        nextExpected: schedule.nextExpected,
        noNextReason: schedule.noNextReason,
      },
      responsibility:
        responsibility === null
          ? null
          : { holderName: responsibility.holder.name, holderKind: responsibility.holder.kind, state: responsibility.state, unanswered: responsibility.unanswered },
      needsAttention: attentionReasonsFor(responsibility).length > 0,
    };
    return item;
  });

  const items = keyed.sort(
    (a, b) =>
      Number(b.needsAttention) - Number(a.needsAttention) ||
      compare(a.schedule.nextExpected ?? NO_DATE, b.schedule.nextExpected ?? NO_DATE) ||
      compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compare(a.id, b.id)
  );

  return { availability, items, isEmpty: items.length === 0, canCreate: true };
}
