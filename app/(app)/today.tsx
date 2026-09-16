import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { DailyLoadCard } from '../../src/features/daily-load/DailyLoadCard';
import { LoadMeter } from '../../src/features/daily-load/LoadMeter';
import { LifeStatusSummary } from '../../src/features/life/LifeStatusSummary';
import { OneMoveCard } from '../../src/features/one-move/OneMoveCard';
import { TalkItOutEntry } from '../../src/features/talk-it-out/TalkItOutEntry';
import { describeDayState } from '../../src/features/today/dayState';
import { weekdayName } from '../../src/features/today/formatDay';
import { HandledLedger } from '../../src/features/today/HandledLedger';
import { NeedsMeChip } from '../../src/features/today/NeedsMeChip';
import { PersistenceNotice } from '../../src/features/today/PersistenceNotice';
import { TimelineList } from '../../src/features/today/TimelineList';
import { TomorrowPreview } from '../../src/features/today/TomorrowPreview';
import { useSchedule } from '../../src/store/ScheduleContext';
import { useHousehold } from '../../src/store/useHousehold';

export default function TodayScreen() {
  const { assessment, decision, events, issues, tasks } = useSchedule();
  const { firstName, today } = useHousehold();

  return (
    <Screen>
      <View style={styles.header}>
        <Overline>{`Today · ${weekdayName(today)}`}</Overline>
        <AppText variant="hero" style={styles.greeting}>
          {firstName ? `Hi, ${firstName}` : 'Hi there'}
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.state}>
          {describeDayState(assessment, decision, issues)}
        </AppText>
        <PersistenceNotice />
      </View>

      <LoadMeter />
      <DailyLoadCard />
      <OneMoveCard />
      <NeedsMeChip />
      <LifeStatusSummary />

      {(events.length > 0 || tasks.length > 0) && (
        <>
          <Overline style={styles.sectionLabel}>Today’s shape</Overline>
          <TimelineList />
        </>
      )}

      <TomorrowPreview />
      <HandledLedger />

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
