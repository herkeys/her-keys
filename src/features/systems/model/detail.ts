import { intentLifecycle } from '../../../domain/authorization';
import type { DependencyRefKind } from '../../../domain/foundation/structure';
import type { LocalDate } from '../../../domain/logicalDay';
import type { AppState } from '../../../domain/state';
import { actionsFor } from './actions';
import { attentionReasonsFor, holderChoicesFor, responsibilityViewFor } from './responsibility';
import { scheduleViewFor } from './schedule';
import { durationFor, stepViewsFor } from './steps';
import type { ActionEvidenceView, RefView, SubjectView, SystemDetailView, UnknownState } from './types';

export interface Clock {
  nowMs: number;
  today: LocalDate;
}

function labelOf(state: AppState, kind: DependencyRefKind, id: string): string | null {
  switch (kind) {
    case 'task': return state.tasks.find((row) => row.id === id)?.title ?? null;
    case 'event': return state.events.find((row) => row.id === id)?.title ?? null;
    case 'needsMe': return state.needsMe.find((row) => row.id === id)?.title ?? null;
    case 'system': return state.systems.find((row) => row.id === id)?.name ?? null;
    case 'meal': return state.meals.find((row) => row.id === id)?.title ?? null;
    case 'goal': return state.goals.find((row) => row.id === id)?.title ?? null;
    case 'opportunity': return state.careerOpportunities.find((row) => row.id === id)?.title ?? null;
  }
}

/**
 * What THIS System requires, and what requires it — read straight from the foundation's one
 * dependency edge, neutrally. No "blocked" claim is made: `isDone` cannot say a System is done
 * (it has no completion), so a blocker could never clear and calling it blocked would be false.
 * Step order is never read as a dependency: ordering and dependency stay separate facts.
 */
function dependenciesOf(state: AppState, systemId: string): { needs: RefView[]; neededBy: RefView[] } {
  const live = state.dependencies.filter((edge) => edge.status === 'active' && edge.relation === 'requires');
  const view = (ref: { kind: DependencyRefKind; id: string }): RefView => ({ kind: ref.kind, id: ref.id, label: labelOf(state, ref.kind, ref.id) });
  // Codepoint order, not locale collation: this feeds committed evidence that must not vary by device.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byLabel = (a: RefView, b: RefView) => cmp(a.label ?? '￿', b.label ?? '￿') || cmp(a.id, b.id);
  return {
    needs: live.filter((edge) => edge.from.kind === 'system' && edge.from.id === systemId).map((edge) => view(edge.to)).sort(byLabel),
    neededBy: live.filter((edge) => edge.to.kind === 'system' && edge.to.id === systemId).map((edge) => view(edge.from)).sort(byLabel),
  };
}

/**
 * What Her Keys itself recorded about acting on this System — real intent / decision / execution /
 * outcome rows and nothing else. Executions are written only by the trusted server; a client only
 * ever pulls them, so absent rows mean nothing was done, and this never says otherwise.
 */
function actionEvidenceOf(state: AppState, systemId: string): ActionEvidenceView[] {
  return state.intents
    .filter((intent) => intent.about?.kind === 'system' && intent.about.id === systemId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((intent): ActionEvidenceView => {
      const decisions = state.decisions.filter((d) => d.intentId === intent.id);
      const withdrawn = decisions.some((d) => d.decision === 'withdrawn');
      const answered = decisions.find((d) => d.decision !== 'withdrawn') ?? null;
      const executions = state.executions.filter((e) => e.intentId === intent.id).sort((a, b) => a.attempt - b.attempt);
      const outcomes = executions
        .flatMap((execution) => state.outcomes.filter((o) => o.executionId === execution.id))
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
      return {
        intentId: intent.id,
        category: intent.category,
        stage: intentLifecycle(state, intent.id)?.stage ?? 'proposed',
        latestOutcome: outcomes.length === 0 ? null : outcomes[outcomes.length - 1].kind,
        decision: withdrawn ? 'withdrawn' : (answered?.decision as 'approved' | 'declined' | undefined) ?? null,
        decisionBasis: answered?.basis ?? null,
        attempts: executions.map((e) => ({ attempt: e.attempt, result: e.result, attemptedAt: e.attemptedAt })),
        outcomes: outcomes.map((o) => ({ kind: o.kind, observedAt: o.observedAt })),
      };
    });
}

/**
 * The reusable blueprint of one System, as the detail screen and the structural evidence see it.
 * Null when the System does not exist. `writable` is false in a session that cannot save.
 */
export function projectSystemDetail(state: AppState, systemId: string, clock: Clock, writable = true): SystemDetailView | null {
  const system = state.systems.find((row) => row.id === systemId);
  if (!system) return null;

  const steps = stepViewsFor(state, systemId);
  const duration = durationFor(steps, system.effortMinutes);
  const schedule = scheduleViewFor(state, systemId, clock.today);
  const responsibility = responsibilityViewFor(state, systemId, clock.nowMs);
  const holderChoices = holderChoicesFor(state);
  const { needs, neededBy } = dependenciesOf(state, systemId);

  // A child-scoped System that cannot name its child (MP-02) is shown as exactly that — never a guess.
  const subject: SubjectView = system.scope === 'child' ? { kind: 'child_not_recorded' } : { kind: 'none' };

  const unknownStates: UnknownState[] = [{ field: 'consequence', reason: 'not_represented_for_systems' }];
  if (subject.kind === 'child_not_recorded') unknownStates.push({ field: 'subject', reason: 'child_not_recorded' });
  if (duration.kind === 'partial') unknownStates.push({ field: 'duration', reason: 'some_steps_have_no_estimate' });
  if (duration.kind === 'unknown') unknownStates.push({ field: 'duration', reason: 'no_estimates' });
  if (schedule.state !== 'none' && schedule.nextExpected === null && schedule.noNextReason !== null) {
    unknownStates.push({ field: 'nextExpected', reason: schedule.noNextReason });
  }
  if (responsibility !== null && responsibility.holder.kind !== 'self' && responsibility.holder.name === null) {
    unknownStates.push({ field: 'responsibility.holder', reason: 'holder_not_found' });
  }

  return {
    id: system.id,
    name: system.name,
    purpose: system.description,
    area: { id: system.categoryId, name: state.categories.find((category) => category.id === system.categoryId)?.name ?? null },
    scope: system.scope,
    subject,
    provenance: { producer: system.provenance.producer, confidence: system.provenance.confidence },
    steps,
    duration,
    schedule,
    responsibility,
    holderChoices,
    attention: attentionReasonsFor(responsibility),
    needs,
    neededBy,
    actionEvidence: actionEvidenceOf(state, systemId),
    actions: actionsFor({ stepCount: steps.length, schedule, responsibility, holderChoices, writable }),
    run: { supported: false, currentRef: null, progress: null, reason: 'no_run_semantics' },
    unknownStates,
  };
}
