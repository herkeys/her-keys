import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { TimelineList } from '../../src/features/today/TimelineList';

export default function CalendarScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Calendar</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          Today, pulled together from your calendar and your task list.
        </AppText>
      </View>
      <Overline style={styles.sectionLabel}>Wednesday</Overline>
      <TimelineList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.sm },
});
