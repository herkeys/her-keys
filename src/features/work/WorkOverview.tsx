import { StyleSheet, View } from 'react-native';
import { todaysEvents } from '../../data/seed/schedule';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { formatTime } from '../daily-load/computeDailyLoad';

export function WorkOverview() {
  const workEvents = todaysEvents.filter((e) => e.category === 'work');

  return (
    <View>
      <Overline style={styles.label}>Today</Overline>
      {workEvents.length > 0 ? (
        <StatusList
          items={workEvents.map((e) => ({
            key: e.id,
            label: e.title,
            value: `${formatTime(e.startMinutes)}–${formatTime(e.endMinutes)}`,
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          Nothing on the work calendar today.
        </AppText>
      )}
      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Work hours shape how much room the rest of the day has.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  note: { marginTop: spacing.xl },
});
