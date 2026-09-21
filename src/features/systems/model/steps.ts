import type { AppState } from '../../../domain/state';
import { stepsInOrder } from '../../../domain/structure';
import type { DurationView, StepView } from './types';

/**
 * A System's steps as BLUEPRINT content: ordered, typed, and carrying no completion state.
 *
 * The foundation has no run and no step completion, so a step here is an instruction that exists,
 * not one that has been done. Nothing on a `StepView` may ever imply otherwise.
 */
export function stepViewsFor(state: Pick<AppState, 'systemSteps'>, systemId: string): StepView[] {
  return stepsInOrder(state, systemId).map((step, index) => ({
    id: step.id,
    order: index + 1,
    title: step.title,
    effortMinutes: step.effortMinutes,
    provenance: step.provenance.producer,
    dependencyRefs: [],
  }));
}

/**
 * How long a run takes — as far as it is actually known.
 *
 * UNKNOWN IS NOT ZERO. A total is stated only when EVERY step has an estimate. If only some do,
 * the honest answer is a floor ("at least N minutes, M of K steps estimated"), never a sum passed
 * off as the whole. A duration she stated on the System itself is used only when no step has one.
 */
export function durationFor(steps: ReadonlyArray<{ effortMinutes: number | null }>, statedMinutes: number | null): DurationView {
  const estimated = steps.filter((step) => step.effortMinutes !== null);
  const sum = estimated.reduce((total, step) => total + (step.effortMinutes as number), 0);

  if (steps.length > 0 && estimated.length === steps.length) return { kind: 'total', minutes: sum, statedMinutes };
  if (estimated.length > 0) return { kind: 'partial', atLeastMinutes: sum, estimatedSteps: estimated.length, totalSteps: steps.length };
  if (statedMinutes !== null) return { kind: 'stated', minutes: statedMinutes };
  return { kind: 'unknown' };
}
