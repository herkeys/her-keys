import { useMemo, type ReactNode } from 'react';
import { EmptyState, Screen } from '../../../design/components';
import { deviceTimeZone, logicalDateAt } from '../../../domain/logicalDay';
import { useAccount } from '../../../store/AccountProvider';
import { useHouseholdState, useStoreSnapshot } from '../../../store/AppStateProvider';
import { availabilityOf } from '../availability';
import { COPY } from '../copy';
import type { PresentationContext } from '../present';
import { buildCoParentLogisticsView } from '../projection';
import { AvailabilityNotice } from './AvailabilityNotice';
import type { ContainerProps } from './containerTypes';
import { FollowUpDetailContainer, HandoffDetailContainer } from './DetailContainers';
import { FollowUpEditorContainer, HandoffEditorContainer, PreparationEditorContainer } from './EditorContainers';
import { useNowMs } from './hooks';
import { HubContainer } from './HubContainer';
import { MODES_NEEDING_ID, paramText, resolveMode } from './modes';

export interface CoParentScreenProps {
  /** The route's search params, as read. Any of them can be missing, or a list when a key was repeated. */
  mode?: string | string[];
  id?: string | string[];
  handoff?: string | string[];
}

/**
 * THE CO-PARENT LOGISTICS SCREEN.
 *
 * First it asks whether the household may be spoken for at all. Until it is ready — loading, unreadable, or another account's —
 * nothing is shown but the reason: no hub, no create button, and never the empty state (a household that could not be read is not a
 * household with nothing in it). Only then does it read the projection and open the view the route asked for.
 */
export function CoParentScreen(props: CoParentScreenProps) {
  const snapshot = useStoreSnapshot();
  const account = useAccount();
  const availability = availabilityOf(snapshot, account.state);

  if (availability.kind !== 'ready') {
    return (
      <Screen>
        <AvailabilityNotice availability={availability} />
      </Screen>
    );
  }
  return <ReadyScreen {...props} />;
}

function ReadyScreen({ mode: rawMode, id: rawId, handoff: rawHandoff }: CoParentScreenProps) {
  const { state } = useHouseholdState();
  const nowMs = useNowMs(60_000);
  const device = useMemo(() => deviceTimeZone(), []);
  const householdId = state.household.id;
  const zone = state.user.timezone;

  const clock = useMemo(() => ({ nowMs, deviceTimeZone: device }), [nowMs, device]);
  const view = useMemo(() => buildCoParentLogisticsView(state, householdId, clock), [state, householdId, clock]);
  // What "today" is, and how a time reads, is decided by the HOUSEHOLD zone. The device's zone only decides whether to say so.
  const ctx = useMemo<PresentationContext>(() => ({ today: logicalDateAt(nowMs, zone), zone }), [nowMs, zone]);

  const mode = resolveMode(rawMode);
  const id = paramText(rawId);
  const props: ContainerProps = { state, view, ctx, householdId, clock };

  let body: ReactNode;
  if (id === undefined && MODES_NEEDING_ID.includes(mode)) {
    body = <EmptyState title={COPY.states.notFoundTitle} body={COPY.states.notFoundBody} />;
  } else if (mode === 'handoff' && id !== undefined) {
    body = <HandoffDetailContainer {...props} id={id} />;
  } else if (mode === 'followup' && id !== undefined) {
    body = <FollowUpDetailContainer {...props} id={id} />;
  } else if (mode === 'new-handoff' || mode === 'edit-handoff') {
    body = <HandoffEditorContainer id={mode === 'edit-handoff' ? id : undefined} state={state} view={view} />;
  } else if (mode === 'new-prep') {
    body = <PreparationEditorContainer state={state} view={view} ctx={ctx} linkId={paramText(rawHandoff)} />;
  } else if (mode === 'new-followup' || mode === 'edit-followup') {
    body = <FollowUpEditorContainer id={mode === 'edit-followup' ? id : undefined} state={state} view={view} />;
  } else {
    body = <HubContainer view={view} ctx={ctx} />;
  }

  return <Screen>{body}</Screen>;
}
