import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, EmptyState, Overline, StatusList } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { peopleCopy } from '../copy';
import type { PeopleHomeView as HomeData } from '../projection';

export interface PeopleHomeViewProps {
  view: HomeData;
  /** Show every follow-up instead of the first three. */
  showAllFollowUps: boolean;
  onOpenPerson: (key: string) => void;
  onAddPerson: () => void;
  onSeeAllFollowUps: () => void;
}

/**
 * People home (HK-FEATURE-13): one factual sentence, the explicit follow-ups (at most three at first glance), everyone, and what she
 * updated lately. No score, no streak, no "top" anything — the list is in name order, and only work is ever ranked.
 */
export function PeopleHomeView({ view, showAllFollowUps, onOpenPerson, onAddPerson, onSeeAllFollowUps }: PeopleHomeViewProps) {
  if (view.empty) {
    return (
      <View>
        <Header />
        <EmptyState title={peopleCopy.empty} body={peopleCopy.subtitle} actionLabel={peopleCopy.addPerson} onAction={onAddPerson} />
      </View>
    );
  }

  const followUps = showAllFollowUps ? view.allFollowUps : view.followUps;
  return (
    <View>
      <Header />
      <AppText variant="sectionTitle" accessibilityRole="header" style={styles.verdict}>
        {view.verdict}
      </AppText>

      {view.followUpTotal > 0 ? (
        <View style={styles.section}>
          <Overline style={styles.sectionLabel}>{peopleCopy.sections.needsFollowUp}</Overline>
          <StatusList
            items={followUps.map((item) => ({
              key: item.taskId,
              label: item.title,
              value: `${item.displayName} · ${item.whenText}`,
              needsAttention: item.timing === 'overdue' || item.timing === 'today',
              onPress: () => onOpenPerson(item.personKey),
            }))}
          />
          {!showAllFollowUps && view.followUpTotal > view.followUps.length ? (
            <Button label={peopleCopy.seeAll(view.followUpTotal)} variant="ghost" size="sm" onPress={onSeeAllFollowUps} style={styles.seeAll} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Overline style={styles.sectionLabel}>{peopleCopy.sections.people}</Overline>
        <View>
          {view.people.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={[row.displayName, row.kindLabel, row.secondary].filter(Boolean).join(', ')}
              onPress={() => onOpenPerson(row.key)}
              style={styles.row}
            >
              <AppText variant="body">{row.displayName}</AppText>
              {row.kindLabel || row.secondary ? (
                <AppText variant="supporting" color={colors.textSecondary}>
                  {[row.kindLabel, row.secondary].filter(Boolean).join(' · ')}
                </AppText>
              ) : null}
            </Pressable>
          ))}
        </View>
        <Button label={peopleCopy.addPerson} variant="secondary" size="sm" onPress={onAddPerson} style={styles.add} />
      </View>

      {view.recent.length > 0 ? (
        <View style={styles.section}>
          <Overline style={styles.sectionLabel}>{peopleCopy.sections.recentlyUpdated}</Overline>
          <StatusList
            items={view.recent.map((item) => ({
              key: `recent-${item.key}`,
              label: item.displayName,
              value: [item.relationshipName, item.updatedAt.slice(0, 10)].filter(Boolean).join(' · '),
              onPress: () => onOpenPerson(item.key),
            }))}
          />
        </View>
      ) : null}

      {view.archived.length > 0 ? (
        <View style={styles.section}>
          <Overline style={styles.sectionLabel}>{peopleCopy.sections.archived}</Overline>
          <StatusList
            items={view.archived.map((item) => ({
              key: `archived-${item.key}-${item.what}`,
              label: item.displayName,
              value: item.what === 'person' ? 'Archived' : 'Saved details archived',
              onPress: () => onOpenPerson(item.key),
            }))}
          />
        </View>
      ) : null}
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <AppText variant="display" accessibilityRole="header">
        {peopleCopy.title}
      </AppText>
      <AppText variant="supporting" color={colors.textSecondary} style={styles.subtitle}>
        {peopleCopy.subtitle}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm },
  verdict: { marginBottom: spacing.xl },
  section: { marginBottom: spacing.xxl },
  sectionLabel: { marginBottom: spacing.md },
  row: { paddingVertical: spacing.md, minHeight: 48, justifyContent: 'center' },
  seeAll: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  add: { marginTop: spacing.md, alignSelf: 'flex-start' },
});
