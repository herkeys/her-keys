import { StyleSheet, View } from 'react-native';
import { household } from '../../data/seed/household';
import { todaysEvents, todaysTasks } from '../../data/seed/schedule';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';

export function KidsOverview() {
  const kidsEvents = todaysEvents.filter((e) => e.category === 'kids');
  const kidsTasks = todaysTasks.filter((t) => t.domain === 'kids');

  return (
    <View>
      <Overline style={styles.label}>Today</Overline>
      <StatusList
        items={household.children.map((child) => ({
          key: child.id,
          label: `${child.name}, ${child.age}`,
          value:
            kidsEvents
              .filter((e) => e.ownerId === child.id)
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
