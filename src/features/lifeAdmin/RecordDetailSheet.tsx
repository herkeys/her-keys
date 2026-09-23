import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, Overline, Sheet, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { LifeRecordLinkRelation } from '../../domain/state';
import { LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';
import type { RecordDetail } from './lifeAdminView';

export interface RecordDetailSheetProps {
  visible: boolean;
  detail: RecordDetail;
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  onEdit: () => void;
  onAddTask: (relation: LifeRecordLinkRelation) => void;
  onArchive: () => void;
  onRestore: () => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}

/**
 * One record, in full: the ONE surface where its reference number, location hint and note appear. The reference starts masked and
 * is shown only after she taps Reveal; that choice lives in this component alone, so leaving the record forgets it (it is never
 * stored). The copy under the title says what the record is: what she recorded, not something Her Keys checked or holds.
 */
export function RecordDetailSheet({ visible, detail, notice, busy, canWrite, onEdit, onAddTask, onArchive, onRestore, onOpenTask, onClose }: RecordDetailSheetProps) {
  const [revealed, setRevealed] = useState(false);
  const facts: Array<[string, string]> = [];
  facts.push([COPY.fieldKind, detail.kindText]);
  if (detail.typeName !== null) facts.push([COPY.fieldType, detail.typeName]);
  if (detail.issuerName !== null) facts.push([COPY.fieldIssuer, detail.issuerName]);
  if (detail.subjectText !== null) facts.push([COPY.fieldAbout, detail.subjectText]);

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={detail.title}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle" accessibilityRole="header">
          {detail.title}
        </AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.block}>
          {COPY.detailFacts}
        </AppText>
        {detail.archived ? (
          <View style={styles.block}>
            <InlineNotice tone="info" title={COPY.archivedNotice} />
          </View>
        ) : null}
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <StatusList items={facts.map(([label, value]) => ({ key: label, label, value }))} />
        </View>

        {detail.maskedReference !== null ? (
          <View style={styles.block}>
            <Overline>{COPY.fieldReference}</Overline>
            <View style={styles.referenceRow}>
              <AppText variant="bodyStrong" accessibilityLabel={revealed ? undefined : COPY.fieldReference}>
                {revealed ? detail.referenceNumber : detail.maskedReference}
              </AppText>
              <Button label={revealed ? COPY.hide : COPY.reveal} variant="ghost" size="sm" onPress={() => setRevealed((open) => !open)} accessibilityHint={COPY.revealHint} />
            </View>
            <AppText variant="supporting" color={colors.textTertiary}>
              {COPY.copyUnavailable}
            </AppText>
          </View>
        ) : null}

        {detail.dates.length > 0 ? (
          <View style={styles.block}>
            <StatusList items={detail.dates.map((date) => ({ key: date.key, label: date.label, value: date.status === null ? date.value : `${date.value} · ${date.status}` }))} />
          </View>
        ) : null}

        {detail.locationHint !== null ? (
          <View style={styles.block}>
            <Overline>{COPY.fieldLocation}</Overline>
            <AppText variant="body">{detail.locationHint}</AppText>
          </View>
        ) : null}

        {detail.note !== null ? (
          <View style={styles.block}>
            <Overline>{COPY.fieldNote}</Overline>
            <AppText variant="body">{detail.note}</AppText>
          </View>
        ) : null}

        <View style={styles.block}>
          <Overline>{COPY.linkedTasks}</Overline>
          {detail.tasks.length === 0 ? (
            <AppText variant="body" color={colors.textSecondary}>
              {COPY.noLinkedTasks}
            </AppText>
          ) : (
            <StatusList
              items={detail.tasks.map((task) => ({
                key: task.taskId,
                label: task.title ?? COPY.taskUnavailable,
                value: task.standing,
                onPress: task.title === null ? undefined : () => onOpenTask(task.taskId),
              }))}
            />
          )}
        </View>

        <View style={styles.more}>
          {!detail.archived ? (
            <>
              <Button label={COPY.addRenewalTask} variant="secondary" size="sm" onPress={() => onAddTask('renewal')} disabled={!canWrite || busy} />
              <Button label={COPY.addFollowUp} variant="secondary" size="sm" onPress={() => onAddTask('follow_up')} disabled={!canWrite || busy} />
              <Button label={COPY.addNextStep} variant="secondary" size="sm" onPress={() => onAddTask('next_step')} disabled={!canWrite || busy} />
            </>
          ) : null}
          <Button label={COPY.edit} variant="secondary" size="sm" onPress={onEdit} disabled={!canWrite || busy} />
          {detail.archived ? (
            <Button label={COPY.restore} variant="ghost" size="sm" onPress={onRestore} disabled={!canWrite || busy} />
          ) : (
            <Button label={COPY.archive} variant="ghost" size="sm" onPress={onArchive} disabled={!canWrite || busy} accessibilityHint={COPY.archiveHint} />
          )}
        </View>

        <View style={styles.actions}>
          <Button label={COPY.close} variant="ghost" onPress={onClose} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 600 },
  block: { marginTop: spacing.lg },
  referenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  more: { marginTop: spacing.xl, gap: spacing.sm, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg },
});
