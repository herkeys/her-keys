import { router } from 'expo-router';
import { Screen } from '../../design/components';
import { logicalDateAt } from '../../domain/logicalDay';
import {
  addNextStep,
  addRebuildFocus,
  linkToFocus,
  renameRebuildFocus,
  setRebuildFocusNote,
  setRebuildFocusState,
  unlinkFromFocus,
} from '../../domain/rebuild/commands';
import { completeTask } from '../../domain/tasks';
import { useAccount } from '../../store/AccountProvider';
import { useAppStore, useStoreSnapshot } from '../../store/AppStateProvider';
import { rebuildAvailabilityOf } from './availability';
import { FocusDetailBody } from './FocusDetailBody';
import { FocusEditorBody } from './FocusEditorBody';
import { buildFocusDetail, buildRebuildHome } from './model';
import { RebuildHomeBody } from './RebuildHomeBody';

export type RebuildMode = 'home' | 'new' | 'focus';

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export function resolveRebuildMode(raw: string | string[] | undefined): RebuildMode {
  const mode = first(raw);
  return mode === 'new' || mode === 'focus' ? mode : 'home';
}

export interface RebuildScreenProps {
  mode?: string | string[];
  id?: string | string[];
  step?: string | string[];
}

const pushRebuild = (params: Record<string, string>) => router.push({ pathname: '/life/rebuild', params });

/**
 * ME / REBUILD. One route; `mode` picks the view. The only file in the feature that knows about the store and the router: every
 * body below it is a pure function of a view model and handlers, and every write is one of the canonical commands.
 */
export function RebuildScreen({ mode: rawMode, id: rawId, step }: RebuildScreenProps) {
  const store = useAppStore();
  const snapshot = useStoreSnapshot();
  const account = useAccount();
  const gate = rebuildAvailabilityOf(snapshot, account.state);
  const state = gate.kind === 'ready' ? snapshot.state : null;
  const nowMs = Date.now();
  const today = state === null ? null : logicalDateAt(nowMs, state.user.timezone);
  const mode = resolveRebuildMode(rawMode);
  const focusId = first(rawId);

  // Cheap, pure projections of the current household, rebuilt on every render so "today" and "upcoming" are always current.
  const home = state === null || today === null ? null : buildRebuildHome(state, today, nowMs);
  const detail = state === null || today === null || focusId === undefined ? null : buildFocusDetail(state, focusId, today, nowMs);

  let body;
  if (mode === 'new') {
    body = (
      <FocusEditorBody
        canWrite={gate.kind === 'ready' && gate.canWrite}
        onSave={async (input) => {
          const saved = await store.commit((s, ctx) => addRebuildFocus(s, ctx, input));
          if (saved) router.back();
          return saved;
        }}
        onCancel={() => router.back()}
      />
    );
  } else if (mode === 'focus' && focusId !== undefined) {
    body = (
      <FocusDetailBody
        gate={gate}
        view={detail}
        startWithStepForm={first(step) === '1'}
        onRename={(title) => store.commit((s, ctx) => renameRebuildFocus(s, ctx, focusId, title))}
        onSaveNote={(note) => store.commit((s, ctx) => setRebuildFocusNote(s, ctx, focusId, note))}
        onSetState={async (next) => {
          const saved = await store.commit((s, ctx) => setRebuildFocusState(s, ctx, focusId, next));
          // An archived Focus leaves this surface: back to the home, where it no longer appears.
          if (saved && next === 'archived') router.back();
          return saved;
        }}
        onAddStep={(input) => store.commit((s, ctx) => addNextStep(s, ctx, { focusId, ...input }))}
        onMarkDone={(taskId) => store.commit((s, ctx) => completeTask(s, ctx, taskId))}
        onEditStep={(taskId) => router.push({ pathname: '/task-editor', params: { taskId } })}
        onConnect={(target) => store.commit((s, ctx) => linkToFocus(s, ctx, { focusId, target, relation: 'supports' }))}
        onDisconnect={(linkId) => store.commit((s, ctx) => unlinkFromFocus(s, ctx, linkId))}
      />
    );
  } else {
    body = (
      <RebuildHomeBody
        gate={gate}
        view={home}
        onAddFocus={() => pushRebuild({ mode: 'new' })}
        onNotNow={() => router.back()}
        onOpenFocus={(id) => pushRebuild({ mode: 'focus', id })}
        onAddNextStep={(id) => pushRebuild({ mode: 'focus', id, step: '1' })}
      />
    );
  }

  return <Screen>{body}</Screen>;
}
