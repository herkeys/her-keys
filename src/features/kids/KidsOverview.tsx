import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';

export function KidsOverview() {
  const { events, tasks } = useSchedule();
  const { children, categoryIdForRole } = useHousehold();
  const kidsCategoryId = categoryIdForRole('kids');
  const kidsTasks = tasks.filter((t) => t.categoryId === kidsCategoryId);

  return (
    <View>
      <Overline style={styles.label}>Today</Overline>
      <StatusList
        items={children.map((child) => ({
          key: child.id,
          label: `${child.displayName}, ${child.age}`,
          value:
            events
              .filter((e) => e.subjectMemberId === child.id)
              .map((e) => e.title)
              .join(', ') || 'On the family schedule',
        }))}
      />

      {kidsTasks.length > 0 && (
        <>
          <Overline style={styles.labelSpaced}>On your list</Overline>
          <StatusList
            items={kidsTasks.map((t) => ({
              key: t.id,
              label: t.title,
              value: t.dueToday ? 'Due today' : 'Not due today',
              needsAttention: t.dueToday,
            }))}
          />
        </>
      )}

      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Kids feeds the same picture Her Keys uses on Today.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  note: { marginTop: spacing.xl },
});
