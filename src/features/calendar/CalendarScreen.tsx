import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Screen, Tag } from '../../design/components';
import { spacing } from '../../design/tokens';
import { isCoparentingHandoff } from '../../domain/handoffs';
import { undoableMove } from '../../domain/dailyLoadDecisions';
import type { AppState } from '../../domain/state';
import { useAppStore, useStoreSnapshot } from '../../store/AppStateProvider';
import { COPY } from './copy';
import { acceptIntent, computePreview, refreshPreview, validityOf, type ActionIntent, type ActionPreview, type PreviewableIntent } from './model/preview';
import { initialPresentation, reducePresentation, selectedDateOf, type CalendarPresentation, type PresentationAction } from './model/presentation';
import { projectCalendarDay, projectCalendarWeek } from './model/projectCalendar';
import type { ItemRef } from './model/types';
import { PreviewPanel, type PreviewNotice } from './ui/ActionPanels';
import { CalendarDayView, type DayActions } from './ui/CalendarDayView';
import { CalendarDegradedNotice } from './ui/CalendarStates';
import { CalendarGate } from './ui/CalendarGate';
import { DayNavigator, ViewSwitch } from './ui/DayHeader';
import { WeekOverview } from './ui/WeekOverview';

/** The wall clock, re-read once a minute so elapsed items stop reading as upcoming. Presentation only. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The Calendar tab. It reads the store, decides whether Calendar may REASON yet, and otherwise
 * delegates to pure views. Loading, recovery and known-empty are three different states.
 */
export function CalendarScreen() {
  const snapshot = useStoreSnapshot();
  return <CalendarGate snapshot={snapshot} ready={(state, today, degraded) => <ReadyCalendar state={state} today={today} degraded={degraded} />} />;
}

const titleOfRef = (state: AppState, ref: ItemRef): string =>
  (ref.kind === 'event' ? state.events.find((event) => event.id === ref.id)?.title : state.tasks.find((task) => task.id === ref.id)?.title) ?? 'That item';

function ReadyCalendar({ state, today, degraded }: { state: AppState; today: string; degraded: boolean }) {
  const store = useAppStore();
  const nowMs = useNow();
  const [presentation, dispatch] = useReducer(
    (current: CalendarPresentation, action: PresentationAction) => reducePresentation(current, action, today),
    initialPresentation
  );
  const selectedDate = selectedDateOf(presentation, today);
  const week = presentation.view === 'week';
  const view = useMemo(() => (week ? null : projectCalendarDay({ state, date: selectedDate, today, nowMs })), [week, state, selectedDate, today, nowMs]);
  const weekView = useMemo(() => (week ? projectCalendarWeek({ state, selectedDate, today, nowMs }) : null), [week, state, selectedDate, today, nowMs]);

  // PRESENTATION STATE ONLY: a preview lives here, in memory. It is never written to the store, so a restart discards it.
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [notice, setNotice] = useState<PreviewNotice>(null);
  const [busy, setBusy] = useState(false);
  // A second tap in the same frame would otherwise commit twice before `busy` renders.
  const inFlight = useRef(false);

  // The schedule changed underneath an open preview (a mutation, a background pull, a day rollover): recompute it
  // against the current state, or say plainly that it no longer applies. It is never left describing a stale world.
  useEffect(() => {
    if (preview === null) return;
    const refreshed = refreshPreview(preview, { state, today, nowMs });
    if (refreshed.status === 'updated') {
      setPreview(refreshed.preview);
      setNotice('updated');
    } else if (refreshed.status === 'invalid') {
      setPreview(null);
      setNotice('out_of_date');
    }
    // `nowMs` is deliberately not a dependency: the clock ticking does not change what the preview is based on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today]);

  const onOpenItem = (ref: ItemRef) => {
    // A co-parenting handoff is Co-Parent's: it opens there, where moving it also moves its repeat (HK13-D35).
    if (ref.kind === 'event' && isCoparentingHandoff(state, ref.id)) router.push({ pathname: '/life/coparent', params: { mode: 'handoff', id: ref.id } });
    else if (ref.kind === 'event') router.push({ pathname: '/event-editor', params: { eventId: ref.id } });
    else router.push({ pathname: '/task-editor', params: { taskId: ref.id } });
  };

  const openPreview = (intent: PreviewableIntent) => {
    const outcome = computePreview({ state, today, nowMs, date: selectedDate, intent });
    if (outcome.ok) {
      setPreview(outcome.preview);
      setNotice(null);
    } else {
      setPreview(null);
      setNotice('out_of_date');
    }
  };

  const run = async (intent: ActionIntent, expected: ActionPreview['basedOn'] | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const result = await acceptIntent(store, intent, expected);
    inFlight.current = false;
    setBusy(false);
    if (result.status === 'applied') {
      setPreview(null);
      setNotice(null);
    } else if (result.status === 'failed') setNotice('failed');
    else {
      // stale or not applied: nothing was changed, and the preview is dropped rather than left describing a world that is gone.
      setPreview(null);
      setNotice('out_of_date');
    }
  };

  const undo = useMemo(() => {
    const action = undoableMove(state, today);
    return action === null ? null : { actionId: action.id, title: titleOfRef(state, { kind: action.type === 'daily_load.move_task' ? 'task' : 'event', id: action.targetId }) };
  }, [state, today]);

  const actions: DayActions | undefined =
    presentation.view === 'day' && selectedDate === today
      ? {
          onPreview: openPreview,
          onKeep: (keep) => void run({ kind: keep === 'timing' ? 'keep_timing' : 'keep_capacity' }, null),
          onProtect: (ref) => openPreview({ kind: 'protect', targetType: ref.kind, targetId: ref.id }),
          undo: undo === null ? null : { title: undo.title, busy, onUndo: () => void run({ kind: 'undo_move', actionId: undo.actionId }, null) },
        }
      : undefined;

  const validity = preview === null ? null : validityOf(preview, state, today);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          {COPY.screenTitle}
        </AppText>
        {state.origin === 'demo' ? <Tag label={COPY.demoMarker} tone="neutral" /> : null}
      </View>
      <Button label={COPY.addEvent} onPress={() => router.push('/event-editor')} style={styles.add} />
      {degraded ? <CalendarDegradedNotice /> : null}
      <ViewSwitch view={presentation.view} onChange={(next) => dispatch({ type: 'setView', view: next })} />
      <DayNavigator
        date={selectedDate}
        today={today}
        view={presentation.view}
        onStep={(direction) => dispatch({ type: 'step', days: week ? direction * 7 : direction })}
        onToday={() => dispatch({ type: 'goToday' })}
      />
      {preview !== null && validity !== null ? (
        <PreviewPanel
          preview={preview}
          validity={validity}
          notice={notice}
          busy={busy}
          onAccept={() => void run(preview.intent, preview.basedOn)}
          onCancel={() => {
            setPreview(null);
            setNotice(null);
          }}
          onPreviewAgain={() => openPreview(preview.intent)}
        />
      ) : null}
      {preview === null && notice === 'out_of_date' ? <PreviewGone /> : null}
      {weekView !== null ? (
        <WeekOverview
          week={weekView}
          today={today}
          onSelectDay={(date) => {
            dispatch({ type: 'select', date });
            dispatch({ type: 'setView', view: 'day' });
          }}
        />
      ) : null}
      {view !== null ? <CalendarDayView view={view} onOpenItem={onOpenItem} actions={actions} /> : null}
    </Screen>
  );
}

/** The preview is gone because the schedule it described is gone — said plainly, once. */
function PreviewGone() {
  return (
    <AppText variant="supporting" style={styles.gone}>
      {COPY.previewStale}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  add: { alignSelf: 'flex-start', marginBottom: spacing.xl },
  gone: { marginBottom: spacing.lg },
});
