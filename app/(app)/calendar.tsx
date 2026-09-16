import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { weekdayName } from '../../src/features/today/formatDay';
import { TimelineList } from '../../src/features/today/TimelineList';
import { useSchedule } from '../../src/store/ScheduleContext';
import { useHousehold } from '../../src/store/useHousehold';

export default function CalendarScreen() {
  const { today } = useHousehold();
  const { events, tasks } = useSchedule();

  const onPressItem = (row: { id: string; kind: 'event' | 'task' }) => {
    if (row.kind === 'event') router.push({ pathname: '/event-editor', params: { eventId: row.id } });
    else router.push({ pathname: '/task-editor', params: { taskId: row.id } });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Calendar</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          Today, pulled together from your calendar and your task list.
        </AppText>
      </View>

      <Button label="Add event" onPress={() => router.push('/event-editor')} style={styles.addButton} />

      <Overline style={styles.sectionLabel}>{weekdayName(today)}</Overline>
      {events.length === 0 && tasks.length === 0 ? (
        <AppText variant="body" color={colors.textSecondary}>
          Nothing here yet. Add your first event to start building today's picture.
        </AppText>
      ) : (
        <TimelineList onPressItem={onPressItem} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  addButton: { marginBottom: spacing.xxl, alignSelf: 'flex-start', paddingHorizontal: spacing.xxl },
  sectionLabel: { marginBottom: spacing.sm },
});
