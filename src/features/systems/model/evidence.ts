import type { HubView, SystemDetailView } from './types';

/**
 * STRUCTURAL EVIDENCE — the deterministic, JSX-free truth artifact for a scenario.
 *
 * A snapshot of rendered UI proves what was drawn; this proves what the projection *decided*:
 * the System, its ordered steps, which actions are available and why, whether a run exists, and
 * every field that is deliberately unknown. Committed copies live under
 * `tests/fixtures/systems/scenarios/` and a test regenerates each from its fixture and compares —
 * a mismatch is a failure, so the evidence cannot drift away from behavior.
 *
 * It holds no copy (sentences), no colors, no layout. Only facts and machine codes.
 */

export function evidenceOfDetail(view: SystemDetailView) {
  const { schedule } = view;
  return {
    system: {
      ref: { kind: 'system', id: view.id },
      name: view.name,
      // A System has no lifecycle status at the fork (MP-01); only its schedule has a state.
      state: { lifecycle: 'not_represented', schedule: schedule.state },
      subject: view.subject,
      scope: view.scope,
      area: view.area,
      responsibility: view.responsibility,
      recurrence:
        schedule.state === 'none'
          ? null
          : {
              ruleRef: schedule.ruleId === null ? null : { kind: 'recurrence', id: schedule.ruleId },
              state: schedule.state,
              trigger: schedule.trigger,
              frequency: schedule.frequency,
              interval: schedule.interval,
              byWeekday: schedule.byWeekday,
              byMonthDay: schedule.byMonthDay,
              timeOfDayMinutes: schedule.timeOfDayMinutes,
              endsOn: schedule.endsOn,
              occurrenceCount: schedule.occurrenceCount,
              timezone: schedule.timezone,
            },
      nextExpected: schedule.nextExpected,
      skipped: schedule.skipped,
      duration: view.duration,
      provenance: view.provenance,
      needs: view.needs,
      neededBy: view.neededBy,
      actionEvidence: view.actionEvidence,
    },
    steps: view.steps.map((step) => ({
      ref: { kind: 'systemStep', id: step.id },
      order: step.order,
      title: step.title,
      dependencyRefs: step.dependencyRefs,
      duration: step.effortMinutes === null ? { known: false } : { known: true, minutes: step.effortMinutes },
      // Step-level responsibility does not exist in the foundation (MP-09).
      responsibility: null,
    })),
    actions: view.actions.map(({ action, available, reason }) => ({ action, available, reason })),
    run: { supported: view.run.supported, currentRef: view.run.currentRef, progress: view.run.progress },
    unknownStates: view.unknownStates,
  };
}

export function evidenceOfHub(view: HubView) {
  return {
    availability: view.availability,
    isEmpty: view.isEmpty,
    canCreate: view.canCreate,
    items: view.items.map((item) => ({
      ref: { kind: 'system', id: item.id },
      name: item.name,
      area: item.areaName,
      stepCount: item.stepCount,
      duration: item.duration,
      schedule: item.schedule,
      responsibility: item.responsibility,
      needsAttention: item.needsAttention,
    })),
  };
}
