import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Screen, Tag } from '../../design/components';
import { spacing } from '../../design/tokens';
import type { AppState } from '../../domain/state';
import { useStoreSnapshot } from '../../store/AppStateProvider';
import { COPY } from './copy';
import { calendarAvailability } from './model/availability';
import { initialPresentation, reducePresentation, selectedDateOf, type CalendarPresentation, type PresentationAction } from './model/presentation';
import { projectCalendarDay, projectCalendarWeek } from './model/projectCalendar';
import type { ItemRef } from './model/types';
import { CalendarDayView } from './ui/CalendarDayView';
import { CalendarDegradedNotice, CalendarLoading, CalendarRecovery } from './ui/CalendarStates';
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
  const availability = calendarAvailability(snapshot);

  if (availability.kind === 'loading') {
    return (
      <Screen>
        <CalendarLoading />
      </Screen>
    );
  }
  if (availability.kind === 'recovery' || snapshot.state === null || snapshot.today === null) {
    return (
      <Screen>
        <CalendarRecovery />
      </Screen>
    );
  }
  return <ReadyCalendar state={snapshot.state} today={snapshot.today} degraded={availability.persistenceDegraded} />;
}

function ReadyCalendar({ state, today, degraded }: { state: AppState; today: string; degraded: boolean }) {
  const nowMs = useNow();
  const [presentation, dispatch] = useReducer(
    (current: CalendarPresentation, action: PresentationAction) => reducePresentation(current, action, today),
    initialPresentation
  );
  const selectedDate = selectedDateOf(presentation, today);
  const week = presentation.view === 'week';
  const view = useMemo(() => (week ? null : projectCalendarDay({ state, date: selectedDate, today, nowMs })), [week, state, selectedDate, today, nowMs]);
  const weekView = useMemo(() => (week ? projectCalendarWeek({ state, selectedDate, today, nowMs }) : null), [week, state, selectedDate, today, nowMs]);

  // The inherited behaviour, preserved: pressing an item opens that item's own editor.
  const onOpenItem = (ref: ItemRef) => {
    if (ref.kind === 'event') router.push({ pathname: '/event-editor', params: { eventId: ref.id } });
    else router.push({ pathname: '/task-editor', params: { taskId: ref.id } });
  };

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
      {view !== null ? <CalendarDayView view={view} onOpenItem={onOpenItem} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  add: { alignSelf: 'flex-start', marginBottom: spacing.xl },
});
