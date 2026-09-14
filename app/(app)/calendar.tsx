import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { weekdayName } from '../../src/features/today/formatDay';
import { TimelineList } from '../../src/features/today/TimelineList';
import { useHousehold } from '../../src/store/useHousehold';

export default function CalendarScreen() {
  const { today } = useHousehold();

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Calendar</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          Today, pulled together from your calendar and your task list.
        </AppText>
      </View>
      <Overline style={styles.sectionLabel}>{weekdayName(today)}</Overline>
      <TimelineList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.sm },
});
