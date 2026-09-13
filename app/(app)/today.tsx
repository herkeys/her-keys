import { StyleSheet, View } from 'react-native';
import { household } from '../../src/data/seed/household';
import { AppText, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { DailyLoadCard } from '../../src/features/daily-load/DailyLoadCard';
import { LoadMeter } from '../../src/features/daily-load/LoadMeter';
import { LifeStatusSummary } from '../../src/features/life/LifeStatusSummary';
import { OneMoveCard } from '../../src/features/one-move/OneMoveCard';
import { TalkItOutEntry } from '../../src/features/talk-it-out/TalkItOutEntry';
import { describeDayState } from '../../src/features/today/dayState';
import { TimelineList } from '../../src/features/today/TimelineList';
import { useSchedule } from '../../src/store/ScheduleContext';

export default function TodayScreen() {
  const { assessment, decision } = useSchedule();
  const firstName = household.user.name.split(' ')[0];

  return (
    <Screen>
      <View style={styles.header}>
        <Overline>Today · Wednesday</Overline>
        <AppText variant="hero" style={styles.greeting}>
          Hi, {firstName}
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.state}>
          {describeDayState(assessment, decision)}
        </AppText>
      </View>

      <LoadMeter />
      <DailyLoadCard />
      <OneMoveCard />
      <LifeStatusSummary />

      <Overline style={styles.sectionLabel}>Today’s shape</Overline>
      <TimelineList />

      <TalkItOutEntry />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  greeting: { marginTop: spacing.sm },
  state: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.sm },
});
