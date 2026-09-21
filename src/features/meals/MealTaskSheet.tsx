import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Sheet, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { LocalDate } from '../../domain/logicalDay';
import { MEAL_TASK_MAX_MINUTES, checkMealTaskTitle } from '../../domain/meals';
import { MEAL_COPY, dueProposalLabel } from './mealCopy';

export interface MealTaskSheetValues {
  title: string;
  /** Null when she did not say: the task then takes the planning default, recorded as a default. */
  minutes: number | null;
  /** Present only when the sheet was opened from a meal. `confirmed` is true only if she chose it. */
  due: { date: LocalDate; confirmed: boolean } | null;
}

export interface MealTaskSheetProps {
  visible: boolean;
  /** The day of the meal this task is opened from, offered as a proposal. Null when opened from the Meals screen itself. */
  proposedDate: LocalDate | null;
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  onSubmit: (values: MealTaskSheetValues) => void;
  onClose: () => void;
}

/**
 * Add a grocery or prep task: an ordinary task, filed under Meals. A name is enough. How long it takes is optional, and left blank
 * it stays an assumed default rather than something she said. When opened from a meal, that meal's day is only OFFERED as a due date:
 * nothing is recorded unless she turns it on, so a date Her Keys suggested is never stored as one she chose.
 */
export function MealTaskSheet({ visible, proposedDate, notice, busy, canWrite, onSubmit, onClose }: MealTaskSheetProps) {
  const [title, setTitle] = useState('');
  const [minutesText, setMinutesText] = useState('');
  const [dueConfirmed, setDueConfirmed] = useState(false);

  const trimmed = minutesText.trim();
  const minutes = trimmed === '' ? null : Number(trimmed);
  const minutesInvalid = minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > MEAL_TASK_MAX_MINUTES);
  const canSave = canWrite && !busy && checkMealTaskTitle(title).ok && !minutesInvalid;

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={MEAL_COPY.taskSheetTitle}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle">{MEAL_COPY.taskSheetTitle}</AppText>
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField label={MEAL_COPY.fieldTask} value={title} onChangeText={setTitle} placeholder={MEAL_COPY.fieldTaskPlaceholder} maxLength={200} autoFocus />
        </View>

        <View style={styles.block}>
          <TextField
            label={MEAL_COPY.fieldMinutes}
            value={minutesText}
            onChangeText={setMinutesText}
            keyboardType="number-pad"
            maxLength={4}
            error={minutesInvalid ? MEAL_COPY.errMinutes : null}
          />
          <AppText variant="supporting" color={colors.textSecondary}>
            {MEAL_COPY.minutesHint}
          </AppText>
        </View>

        {proposedDate !== null ? (
          <View style={styles.block}>
            <View style={styles.chips}>
              <ChipToggle label={dueProposalLabel(proposedDate)} selected={dueConfirmed} onPress={() => setDueConfirmed((on) => !on)} />
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label={MEAL_COPY.cancel} variant="ghost" onPress={onClose} />
          <Button
            label={MEAL_COPY.taskSave}
            onPress={() => onSubmit({ title, minutes, due: proposedDate === null ? null : { date: proposedDate, confirmed: dueConfirmed } })}
            disabled={!canSave}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  block: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
});
