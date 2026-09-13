import { StyleSheet, View } from 'react-native';
import { AppText } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { formatTime } from '../daily-load/computeDailyLoad';

interface TimelineRow {
  id: string;
  time: number;
  title: string;
  meta?: string;
}

/**
 * The lowest rung of the hierarchy: raw reference data, so it sits directly on
 * the page ground with hairline rules rather than on a surface of its own.
 */
export function TimelineList() {
  const { events, tasks } = useSchedule();
  const scheduledTasks = tasks.filter((t) => t.scheduledStartMinutes != null);

  const items: TimelineRow[] = [
    ...events.map((e) => ({ id: e.id, time: e.startMinutes, title: e.title, meta: e.location })),
    ...scheduledTasks.map((t) => ({
      id: t.id,
      time: t.scheduledStartMinutes as number,
      title: t.title,
      meta: t.dueToday ? 'Due today' : undefined,
    })),
  ].sort((a, b) => a.time - b.time);

  if (items.length === 0) {
    return (
      <AppText variant="body" color={colors.textSecondary}>
        Nothing left scheduled for today.
      </AppText>
    );
  }

  return (
    <View>
      {items.map((item, idx) => (
        <View key={item.id} style={[styles.row, idx === items.length - 1 ? null : styles.rowDivider]}>
          <AppText variant="caption" color={colors.textTertiary} style={styles.time}>
            {formatTime(item.time)}
          </AppText>
          <View style={styles.body}>
            <AppText variant="body">{item.title}</AppText>
            {item.meta && (
              <AppText variant="caption" color={colors.textTertiary} style={styles.meta}>
                {item.meta}
              </AppText>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: spacing.lg, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  time: { width: 72, paddingTop: 2 },
  body: { flex: 1 },
  meta: { marginTop: spacing.xxs },
});
