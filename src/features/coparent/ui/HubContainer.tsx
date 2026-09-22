import { useMemo, useState } from 'react';
import { completePreparation } from '../mutations';
import { presentHub } from '../present';
import type { ContainerProps } from './containerTypes';
import { useAreaAttempt } from './hooks';
import { HubView } from './HubView';
import { openView } from './navigation';

/** The hub, wired: it reads the projection, opens the other views by route, and can mark a preparation item done in place. */
export function HubContainer({ view, ctx }: Pick<ContainerProps, 'view' | 'ctx'>) {
  const { attempt, busy, error } = useAreaAttempt();
  const [showAll, setShowAll] = useState(false);
  const presentation = useMemo(() => presentHub(view, ctx, { showAllUpcoming: showAll }), [view, ctx, showAll]);

  return (
    <HubView
      presentation={presentation}
      canCreate={view.capability.canCreate}
      busy={busy}
      error={error?.text ?? null}
      onOpenHandoff={(id) => openView({ mode: 'handoff', id })}
      onOpenFollowUp={(id) => openView({ mode: 'followup', id })}
      onAddHandoff={() => openView({ mode: 'new-handoff' })}
      onAddPrep={() => openView({ mode: 'new-prep' })}
      onAddFollowUp={() => openView({ mode: 'new-followup' })}
      onCompletePrep={(taskId) => void attempt('preparation', (state, transitionCtx) => completePreparation(state, transitionCtx, taskId))}
      onShowMoreUpcoming={() => setShowAll(true)}
    />
  );
}
