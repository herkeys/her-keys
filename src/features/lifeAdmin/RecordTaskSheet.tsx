import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Overline, Sheet, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { checkLifeRecordTitle } from '../../domain/lifeRecords';
import { isLocalDate, type LocalDate } from '../../domain/logicalDay';
import { FIELD_LIMITS, type LifeRecordLinkRelation } from '../../domain/state';
import { LIFE_ADMIN_COPY as COPY } from './lifeAdminCopy';
import { recordDate } from './lifeAdminDates';

export interface RecordTaskSheetValues {
  title: string;
  categoryId: string | null;
  dueDate: string;
  minutes: string;
}

export interface RecordTaskSheetProps {
  visible: boolean;
  relation: LifeRecordLinkRelation;
  recordTitle: string;
  /** The record's renew-by date, offered as ONE explicit tap; never filled in on her behalf. */
  renewBy: LocalDate | null;
  categories: ReadonlyArray<{ id: string; name: string }>;
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  onSubmit: (values: RecordTaskSheetValues) => void;
  onClose: () => void;
}

/**
 * Create ONE canonical task from a record. Opening this sheet creates nothing, and closing it creates nothing; only Save does,
 * and a save creates exactly one task (visible only to her) tied to this record. The title is a visible suggestion she can change,
 * the category is her explicit pick, and the due date is empty unless she sets it.
 */
export function RecordTaskSheet({ visible, relation, recordTitle, renewBy, categories, notice, busy, canWrite, onSubmit, onClose }: RecordTaskSheetProps) {
  const [values, setValues] = useState<RecordTaskSheetValues>({
    title: COPY.taskSuggestedTitle[relation](recordTitle).slice(0, FIELD_LIMITS.titleLength),
    categoryId: null,
    dueDate: '',
    minutes: '',
  });
  const set = <K extends keyof RecordTaskSheetValues>(key: K, value: RecordTaskSheetValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const dueError = values.dueDate.trim().length > 0 && !isLocalDate(values.dueDate.trim()) ? COPY.errTaskDate : null;
  const minutesText = values.minutes.trim();
  const minutesError = minutesText.length > 0 && !/^[0-9]{1,4}$/.test(minutesText) ? COPY.errTaskMinutes : null;
  const canSave = canWrite && !busy && checkLifeRecordTitle(values.title).ok && values.categoryId !== null && dueError === null && minutesError === null;

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={COPY.taskSheetTitle[relation]}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle">{COPY.taskSheetTitle[relation]}</AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.block}>
          {COPY.taskSheetBody}
        </AppText>
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField label={COPY.fieldTaskTitle} value={values.title} onChangeText={(text) => set('title', text)} maxLength={FIELD_LIMITS.titleLength} />
        </View>

        <View style={styles.block}>
          <Overline>{COPY.fieldCategory}</Overline>
          <View style={styles.chips}>
            {categories.map((category) => (
              <ChipToggle key={category.id} label={category.name} selected={values.categoryId === category.id} onPress={() => set('categoryId', category.id)} />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <TextField label={COPY.fieldDue} value={values.dueDate} onChangeText={(text) => set('dueDate', text)} placeholder={COPY.fieldDatePlaceholder} keyboardType="numbers-and-punctuation" maxLength={10} error={dueError} />
          {renewBy !== null ? (
            <View style={styles.chips}>
              <ChipToggle label={COPY.useRenewBy(recordDate(renewBy))} selected={values.dueDate === renewBy} onPress={() => set('dueDate', values.dueDate === renewBy ? '' : renewBy)} />
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <TextField label={COPY.fieldMinutes} value={values.minutes} onChangeText={(text) => set('minutes', text)} keyboardType="number-pad" maxLength={4} error={minutesError} />
        </View>

        <View style={styles.actions}>
          <Button label={COPY.cancel} variant="ghost" onPress={onClose} />
          <Button label={COPY.addTask} onPress={() => onSubmit(values)} disabled={!canSave} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 560 },
  block: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
});
