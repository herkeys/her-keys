import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, LoadingState, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';
import type { LifeAdminGate } from './lifeAdminGate';
import type { LifeAdminView } from './lifeAdminView';

export interface LifeAdminBodyProps {
  gate: LifeAdminGate;
  view: LifeAdminView;
  /** One quiet line after something was saved. */
  flash: string | null;
  onAddRecord: () => void;
  onSkip: () => void;
  onOpenRecord: (recordId: string) => void;
}

/**
 * The Life Admin home, drawn from the projection and nothing else: a plain verdict, at most three Needs Review items (then
 * "See all"), what is coming up in the next two weeks, her records, and — on request — archived ones. It is built for "I can find
 * what matters", not for filing: no counts of failures, no colour that scores her, no reference number, location or note anywhere.
 */
export function LifeAdminBody({ gate, view, flash, onAddRecord, onSkip, onOpenRecord }: LifeAdminBodyProps) {
  const [allReview, setAllReview] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (gate.state === 'loading') return <LoadingState label={COPY.loading} />;
  if (gate.state === 'recovery') return <InlineNotice tone="attention" title={COPY.recoveryTitle} body={COPY.recoveryBody} />;

  if (view.phase === 'empty') {
    return (
      <View style={styles.root}>
        {!gate.canWrite ? <InlineNotice tone="waiting" title={COPY.readOnlyNotice} /> : null}
        <AppText variant="sectionTitle">{COPY.emptyTitle}</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {COPY.emptyBody}
        </AppText>
        <View style={styles.row}>
          <Button label={COPY.addRecord} onPress={onAddRecord} disabled={!gate.canWrite} />
          <Button label={COPY.skip} variant="ghost" onPress={onSkip} />
        </View>
      </View>
    );
  }

  const review = allReview ? view.needsReview : view.needsReviewShown;
  return (
    <View style={styles.root}>
      {!gate.canWrite ? <InlineNotice tone="waiting" title={COPY.readOnlyNotice} /> : null}
      <View accessibilityLiveRegion="polite">
        <AppText variant="sectionTitle" accessibilityRole="header">
          {view.verdict}
        </AppText>
        {flash ? (
          <AppText variant="supporting" color={colors.textSecondary}>
            {flash}
          </AppText>
        ) : null}
      </View>

      <Button label={COPY.addRecord} onPress={onAddRecord} disabled={!gate.canWrite} />

      {view.needsReview.length > 0 ? (
        <Section title={COPY.sectionNeedsReview}>
          <StatusList items={review.map((item) => ({ key: `review:${item.recordId}`, label: item.title, value: item.text, onPress: () => onOpenRecord(item.recordId) }))} />
          {view.needsReviewMore > 0 ? (
            <Button
              label={allReview ? COPY.showFewer : COPY.seeAll(view.needsReview.length)}
              variant="ghost"
              size="sm"
              onPress={() => setAllReview((open) => !open)}
              style={styles.inline}
            />
          ) : null}
        </Section>
      ) : null}

      {view.comingUp.length > 0 ? (
        <Section title={COPY.sectionComingUp}>
          <StatusList items={view.comingUp.map((item) => ({ key: `soon:${item.recordId}`, label: item.title, value: item.text, onPress: () => onOpenRecord(item.recordId) }))} />
        </Section>
      ) : null}

      {view.records.length > 0 ? (
        <Section title={COPY.sectionRecords}>
          <StatusList
            items={view.records.map((row) => ({
              key: `record:${row.recordId}`,
              label: row.title,
              value: [row.kindText, row.subjectText, row.dateText, row.openTaskText].filter((part): part is string => part !== null).join(' · '),
              onPress: () => onOpenRecord(row.recordId),
            }))}
          />
        </Section>
      ) : null}

      {view.archived.length > 0 ? (
        <Section title={COPY.sectionArchived}>
          <Button
            label={showArchived ? COPY.hideArchived : COPY.showArchived(view.archived.length)}
            variant="ghost"
            size="sm"
            onPress={() => setShowArchived((open) => !open)}
            style={styles.inline}
          />
          {showArchived ? (
            <StatusList items={view.archived.map((row) => ({ key: `archived:${row.recordId}`, label: row.title, value: row.archivedText, onPress: () => onOpenRecord(row.recordId) }))} />
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Overline>{title}</Overline>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  inline: { alignSelf: 'flex-start' },
});
