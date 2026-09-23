import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen, StatusList } from '../../../src/design/components';
import { colors, spacing } from '../../../src/design/tokens';
import { openTasksWithoutList } from '../../../src/domain/taskLists';
import { NeedsMeQuickAdd } from '../../../src/features/life/NeedsMeQuickAdd';
import { REBUILD_COPY } from '../../../src/features/rebuild/copy';
import { useLifeStatus } from '../../../src/features/life/useLifeStatus';
import { useLifeInbox } from '../../../src/features/talk-it-out/capture/CaptureContext';
import { copy } from '../../../src/features/talk-it-out/capture/copy';
import { inboxRowValue } from '../../../src/features/talk-it-out/capture/viewModel';
import { useHouseholdState } from '../../../src/store/AppStateProvider';

export default function LifeHub() {
  const statuses = useLifeStatus();
  const inbox = useLifeInbox();
  const { state, today } = useHouseholdState();
  const openNeedsMe = state.needsMe.filter((item) => item.status === 'open');
  const otherOpenTasks = openTasksWithoutList(state, today).length;
  const activeFocuses = state.rebuildFocuses.filter((focus) => focus.state === 'active').length;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display">Life</AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.subtitle}>
          Five areas, one picture. Everything here is what Her Keys reads when it looks at your day.
        </AppText>
      </View>

      <NeedsMeQuickAdd />

      <Overline style={styles.sectionLabel}>Where things stand</Overline>
      <StatusList
        items={[
          ...statuses.map((s) => ({
            key: s.key,
            label: s.label,
            value: s.value,
            needsAttention: s.needsAttention,
            onPress: () => router.push(s.route),
          })),
          // One row, not a list: everything saved in a category without its own screen stays reachable.
          ...(otherOpenTasks > 0
            ? [
                {
                  key: 'other-tasks',
                  label: 'Other open tasks',
                  value: `${otherOpenTasks} open`,
                  onPress: () => router.push('/life/other-tasks'),
                },
              ]
            : []),
          // Unresolved captures — what still needs a decision. Never says "nothing" while loading or recovering.
          {
            key: 'life-inbox',
            label: copy.inbox.rowLabel,
            value: inboxRowValue(inbox),
            needsAttention: inbox.phase === 'items' && inbox.items.some((item) => item.urgency === 'now' || item.urgency === 'today'),
            onPress: () => router.push('/life/inbox'),
          },
          {
            key: 'needs-me',
            label: 'Needs Me',
            value: openNeedsMe.length === 0 ? 'Nothing captured' : `${openNeedsMe.length} captured`,
            onPress: () => router.push('/life/needs-me'),
          },
          // Her own life as a person (HK-FEATURE-11). A count of what she chose to keep visible — never a score, never a nudge.
          {
            key: 'me-rebuild',
            label: REBUILD_COPY.life.rowLabel,
            value: REBUILD_COPY.life.rowValue(activeFocuses),
            onPress: () => router.push('/life/rebuild'),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  sectionLabel: { marginBottom: spacing.md },
});
