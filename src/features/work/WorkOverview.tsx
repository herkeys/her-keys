import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { isOpportunityOpen } from '../../domain/foundation/opportunity';
import { hasOpenNextAction } from '../../domain/opportunities';
import { workCareerVerdict } from '../../domain/reasoning/workCareer';
import { CategoryTaskList } from '../life/CategoryTaskList';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';
import { useHouseholdState } from '../../store/AppStateProvider';
import { formatTime } from '../daily-load/computeDailyLoad';

const STAGE_LABEL: Record<string, string> = {
  exploring: 'Exploring',
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  closed: 'Closed',
};

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

  const openOpportunities = state.careerOpportunities
    .filter((o) => isOpportunityOpen(o) && o.archivedAt === null)
    .sort((a, b) => a.stageChangedAt.localeCompare(b.stageChangedAt))
    .reverse();

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

      <Overline style={styles.labelSpaced}>Career next</Overline>
      {openOpportunities.length > 0 ? (
        <StatusList
          items={openOpportunities.map((o) => ({
            key: o.id,
            label: o.title,
            value: STAGE_LABEL[o.stage] ?? o.stage,
            needsAttention: !hasOpenNextAction(state, o.id),
            onPress: () => router.push({ pathname: '/opportunity-editor', params: { opportunityId: o.id } }),
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          No career opportunities recorded yet.
        </AppText>
      )}
      <Button
        label="Add an opportunity"
        variant="ghost"
        size="sm"
        onPress={() => router.push('/opportunity-editor')}
        style={styles.addButton}
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
  addButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
  note: { marginTop: spacing.xl },
});
