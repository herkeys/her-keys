import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Overline, Screen, StatusList } from '../../../src/design/components';
import { colors, spacing } from '../../../src/design/tokens';
import { openTasksWithoutList } from '../../../src/domain/taskLists';
import { NeedsMeQuickAdd } from '../../../src/features/life/NeedsMeQuickAdd';
import { LIFE_HUB_COPY } from '../../../src/features/life/lifeHubCopy';
import { REBUILD_COPY } from '../../../src/features/rebuild/copy';
import { LIFE_ADMIN_COPY } from '../../../src/features/lifeAdmin/lifeAdminCopy';
import { lifeAdminHubSummary } from '../../../src/features/lifeAdmin/lifeAdminView';
import { peopleLifeTile } from '../../../src/features/people/lifeTile';
import { useLifeStatus } from '../../../src/features/life/useLifeStatus';
import { useLifeInbox } from '../../../src/features/talk-it-out/capture/CaptureContext';
import { copy } from '../../../src/features/talk-it-out/capture/copy';
import { inboxRowValue } from '../../../src/features/talk-it-out/capture/viewModel';
import { useHouseholdState } from '../../../src/store/AppStateProvider';

/**
 * The Life hub (IA reconciled in the F01-F13 integration, INT13-02).
 *
 * Two lists, not one long one:
 *   Where things stand — the household's areas, one row per category that has a Life screen (in the household's own order and names:
 *     Kids, Home, Money, Meals, Work, Co-parenting), then the catch-alls: other open tasks, the Life Inbox and Needs Me.
 *   Just for you — the three areas that are owner-private by construction: Me / Rebuild, Life Admin / Documents and People. Nothing in
 *     them is shared with the household, and none of them reaches her day by itself; only a Task she makes from one does.
 * Every row is a count or a date, never a name, a title, a note, a number or a place.
 */
export default function LifeHub() {
  const statuses = useLifeStatus();
  const inbox = useLifeInbox();
  const { state, today } = useHouseholdState();
  const openNeedsMe = state.needsMe.filter((item) => item.status === 'open');
  const otherOpenTasks = openTasksWithoutList(state, today).length;
  const activeFocuses = state.rebuildFocuses.filter((focus) => focus.state === 'active').length;
  const people = peopleLifeTile(state, today);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display">Life</AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.subtitle}>
          {LIFE_HUB_COPY.subtitle}
        </AppText>
      </View>

      <NeedsMeQuickAdd />

      <Overline style={styles.sectionLabel}>{LIFE_HUB_COPY.householdSection}</Overline>
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
        ]}
      />

      <View style={styles.privateSection}>
        <Overline style={styles.sectionLabelWithNote}>{LIFE_HUB_COPY.privateSection}</Overline>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.sectionNote}>
          {LIFE_HUB_COPY.privateSectionNote}
        </AppText>
      </View>
      <StatusList
        items={[
          // Her own life as a person (HK-FEATURE-11). A count of what she chose to keep visible — never a score, never a nudge.
          {
            key: 'me-rebuild',
            label: REBUILD_COPY.life.rowLabel,
            value: REBUILD_COPY.life.rowValue(activeFocuses),
            onPress: () => router.push('/life/rebuild'),
          },
          // Life Admin / Documents (HK-FEATURE-12): a count only. No title, number, note, place, issuer or child name reaches the hub.
          {
            key: 'life-admin',
            label: LIFE_ADMIN_COPY.hubLabel,
            ...lifeAdminHubSummary(state, today),
            onPress: () => router.push('/life/admin'),
          },
          // People (HK-FEATURE-13): the tile Feature 13 built for this hub (MP-13-08) — a count or a date, never a name or a note.
          {
            key: people.key,
            label: people.label,
            value: people.value,
            needsAttention: people.needsAttention,
            onPress: () => router.push(people.route),
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
  privateSection: { marginTop: spacing.xxl },
  sectionLabelWithNote: { marginBottom: spacing.xs },
  sectionNote: { marginBottom: spacing.md },
});
