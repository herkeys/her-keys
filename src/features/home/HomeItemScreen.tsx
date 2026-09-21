import { Stack, router, useLocalSearchParams } from 'expo-router';
import { LoadingState, Screen } from '../../design/components';
import { HOME_COPY } from './copy';
import {
  askSomeone,
  makeHomeTaskDueAgain,
  markHomeTaskDone,
  recordAccepted,
  recordDeclined,
  recordSeen,
  removeHomeTask,
  removeHomeVisit,
  stopHomeRepeating,
  takeBack,
} from './model/mutations';
import type { HomeAction } from './model/types';
import { HomeItemDetailView, type DetailActionPayload } from './ui/HomeItemDetailView';
import { useHomeCommit, useHomeView } from './useHomeView';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** One Home item, by its canonical typed reference (`task:<id>` / `event:<id>` / `system:<id>`). No HomeRecord exists. */
export function HomeItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const { view, copyContext } = useHomeView();
  const { run, busy, error } = useHomeCommit();

  if (view === null || copyContext === null) {
    return (
      <Screen>
        <LoadingState label={HOME_COPY.loading.label} detail={HOME_COPY.loading.detail} />
      </Screen>
    );
  }

  const id = first(itemId);
  const item = view.items.find((candidate) => candidate.homeItemId === id) ?? null;

  const onAction = async (action: HomeAction, payload?: DetailActionPayload) => {
    if (item === null) return;
    const entityId = item.entityId;
    const responsibilityId = item.responsibility.responsibilityId;
    switch (action) {
      case 'edit':
        router.push(item.canonicalKind === 'event' ? { pathname: '/life/home-visit-editor', params: { eventId: entityId } } : { pathname: '/life/home-task-editor', params: { taskId: entityId } });
        return;
      case 'open_systems':
        router.push('/systems');
        return;
      case 'mark_done':
        await run((state, ctx) => markHomeTaskDone(state, ctx, entityId));
        return;
      case 'due_again':
        await run((state, ctx) => makeHomeTaskDueAgain(state, ctx, entityId));
        return;
      case 'stop_repeating':
        await run((state, ctx) => stopHomeRepeating(state, ctx, entityId));
        return;
      case 'remove': {
        const removed = await run((state, ctx) => (item.canonicalKind === 'event' ? removeHomeVisit(state, ctx, entityId) : removeHomeTask(state, ctx, entityId)));
        if (removed) router.back();
        return;
      }
      case 'ask_someone':
        if (payload?.holder === undefined || item.canonicalKind === 'system') return;
        await run((state, ctx) => askSomeone(state, ctx, { about: { kind: item.canonicalKind as 'task' | 'event', id: entityId }, holder: payload.holder! }));
        return;
      case 'record_seen':
        if (responsibilityId !== null) await run((state, ctx) => recordSeen(state, ctx, responsibilityId));
        return;
      case 'record_accepted':
        // Her answer is required: Home never lets the domain default decide whether it still needs her.
        if (responsibilityId !== null && payload?.stillNeedsMe !== undefined) await run((state, ctx) => recordAccepted(state, ctx, { responsibilityId, stillNeedsMe: payload.stillNeedsMe! }));
        return;
      case 'record_declined':
        if (responsibilityId !== null) await run((state, ctx) => recordDeclined(state, ctx, responsibilityId));
        return;
      case 'take_back':
        if (responsibilityId !== null) await run((state, ctx) => takeBack(state, ctx, responsibilityId));
        return;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: view.label }} />
      <HomeItemDetailView item={item} holders={view.holders} copyContext={copyContext} busy={busy} error={error} onAction={(action, payload) => void onAction(action, payload)} />
    </>
  );
}
