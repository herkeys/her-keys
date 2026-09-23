import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { hasOpenNextAction } from '../../domain/opportunities';
import { workCareerVerdict } from '../../domain/reasoning/workCareer';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';
import { useHouseholdState } from '../../store/AppStateProvider';
import { formatTime } from '../daily-load/computeDailyLoad';
import { CareerNext } from './CareerNext';
import { careerListsOf } from './careerLists';

/**
 * WORK / CAREER — one destination, two layers (F10). Work Now stays a thin projection over the
 * existing Task/Event category filter, exactly as before this feature; Career Next is new. Neither
 * layer invents a second task, calendar, or attention engine — see `workCareerVerdict` and
 * `domain/opportunities.ts`.
 */
export function WorkOverview() {
  const { events } = useSchedule();
  const { categoryIdForRole } = useHousehold();
  const { state } = useHouseholdState();
  const nowMs = Date.now();
  const workCategoryId = categoryIdForRole('work');
  const workEvents = events.filter((e) => e.categoryId === workCategoryId);
  const openOpportunity = (opportunityId: string) => router.push({ pathname: '/opportunity-editor', params: { opportunityId } });

  return (
    <View>
      <AppText variant="bodyStrong" style={styles.verdict}>
        {workCareerVerdict(state, nowMs)}
      </AppText>

      <Overline style={styles.label}>Work now</Overline>
      <Overline style={styles.labelSpaced}>Today</Overline>
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

      <Overline style={styles.labelSpaced}>On your list</Overline>
      <CategoryTaskList categoryId={workCategoryId} emptyLabel="Nothing work-related on your list." />

      <CareerNext
        lists={careerListsOf(state.careerOpportunities)}
        hasNextAction={(id) => hasOpenNextAction(state, id)}
        onOpen={openOpportunity}
        onAdd={() => router.push('/opportunity-editor')}
      />

      <AppText variant="caption" color={colors.textTertiary} style={styles.note}>
        Work hours shape how much room the rest of the day has.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  verdict: { marginBottom: spacing.xl },
  label: { marginBottom: spacing.md },
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  note: { marginTop: spacing.xl },
});
