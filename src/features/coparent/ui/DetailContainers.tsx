import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { EmptyState } from '../../../design/components';
import { COPY } from '../copy';
import { completeFollowUp, completePreparation, removeFollowUp, removeHandoff, removePreparation, unlinkPreparation } from '../mutations';
import { presentFollowUpDetail, presentTransitionDetail, type ResponsibilityAction } from '../present';
import { buildMoneyFollowUpDetail, buildTransitionDetail } from '../projection';
import { responsibilityRun, type CounterpartChoice } from './actions';
import type { ContainerProps } from './containerTypes';
import { FollowUpDetailView } from './FollowUpDetailView';
import { useAreaAttempt } from './hooks';
import { leave, openView } from './navigation';
import { TransitionDetailView } from './TransitionDetailView';

/**
 * Leaving a screen — even by opening an editor on top of it — must forget what was uncovered or half-confirmed on it. Bumping this
 * number when the screen loses focus re-mounts the view, so a revealed location and an open removal prompt start over.
 */
function useResetOnBlur(): number {
  const [epoch, setEpoch] = useState(0);
  useFocusEffect(useCallback(() => () => setEpoch((n) => n + 1), []));
  return epoch;
}

const NotFound = () => <EmptyState title={COPY.states.notFoundTitle} body={COPY.states.notFoundBody} />;

/** One handoff, wired: reads the detail projection, and turns each tap into the one mutation it means. */
export function HandoffDetailContainer({ id, state, ctx, householdId, clock }: ContainerProps & { id: string }) {
  const { attempt, busy, error } = useAreaAttempt();
  const epoch = useResetOnBlur();
  const detail = useMemo(() => buildTransitionDetail(state, householdId, id, clock), [state, householdId, id, clock]);
  const presentation = useMemo(() => presentTransitionDetail(detail, ctx), [detail, ctx]);

  if (detail.status === 'not_a_handoff') return <EmptyState title={COPY.states.notAHandoffTitle} body={COPY.states.notAHandoffBody} />;
  const transition = detail.transition;
  if (presentation === null || transition === null) return <NotFound />;

  const onResponsibilityAction = (action: ResponsibilityAction, counterpart: CounterpartChoice | null) => {
    // A tap that cannot form a mutation (no person chosen) is never turned into a guess; the view does not offer one.
    const run = responsibilityRun({ kind: 'event', id }, transition.responsibility, action, counterpart);
    if (run !== null) void attempt('responsibility', run);
  };

  return (
    <TransitionDetailView
      key={epoch}
      householdId={householdId}
      presentation={presentation}
      detail={detail}
      presentationCtx={ctx}
      busy={busy}
      error={error}
      onResponsibilityAction={onResponsibilityAction}
      onCompletePrep={(taskId) => void attempt('preparation', (s, c) => completePreparation(s, c, taskId))}
      onRemovePrep={(taskId) => void attempt('preparation', (s, c) => removePreparation(s, c, taskId))}
      onUnlinkPrep={(dependencyId) => void attempt('preparation', (s, c) => unlinkPreparation(s, c, dependencyId))}
      onAddPrep={() => openView({ mode: 'new-prep', handoff: id })}
      onEdit={() => openView({ mode: 'edit-handoff', id })}
      onRemove={() => void attempt('manage', (s, c) => removeHandoff(s, c, id), leave)}
    />
  );
}

/** One follow-up, wired. "Mark done" records that the follow-up was done — nothing more. */
export function FollowUpDetailContainer({ id, state, ctx, householdId, clock }: ContainerProps & { id: string }) {
  const { attempt, busy, error } = useAreaAttempt();
  const epoch = useResetOnBlur();
  const detail = useMemo(() => buildMoneyFollowUpDetail(state, householdId, id, clock), [state, householdId, id, clock]);
  const presentation = useMemo(() => presentFollowUpDetail(detail, ctx), [detail, ctx]);

  if (detail.status === 'not_a_follow_up') return <EmptyState title={COPY.states.notAFollowUpTitle} body={COPY.states.notAFollowUpBody} />;
  const followUp = detail.followUp;
  if (presentation === null || followUp === null) return <NotFound />;

  const onResponsibilityAction = (action: ResponsibilityAction, counterpart: CounterpartChoice | null) => {
    const run = responsibilityRun({ kind: 'task', id }, followUp.responsibility, action, counterpart);
    if (run !== null) void attempt('responsibility', run);
  };

  return (
    <FollowUpDetailView
      key={epoch}
      presentation={presentation}
      detail={detail}
      busy={busy}
      error={error}
      onResponsibilityAction={onResponsibilityAction}
      onEdit={() => openView({ mode: 'edit-followup', id })}
      onMarkDone={() => void attempt('manage', (s, c) => completeFollowUp(s, c, id))}
      onRemove={() => void attempt('manage', (s, c) => removeFollowUp(s, c, id), leave)}
    />
  );
}
