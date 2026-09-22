import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Overline, Sheet, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { isLocalDate, type LocalDate } from '../../domain/logicalDay';
import { MEAL_TITLE_MAX, checkMealTitle } from '../../domain/meals';
import type { MealSlot } from '../../domain/state';
import { MEAL_COPY, SLOT_CHOICES, SLOT_LABEL, mealTypeSummary } from './mealCopy';
import { dayChoiceLabel, dayChoices, longDate, mealDayLabel } from './mealDates';

export interface MealSheetValues {
  title: string;
  date: LocalDate;
  slot: MealSlot;
}

export type MealSheetMode = 'create' | 'edit' | 'again';

export interface MealSheetProps {
  visible: boolean;
  mode: MealSheetMode;
  /** What the sheet opens with. Every default is shown before saving: the day and the meal type are never hidden. */
  initial: MealSheetValues;
  today: LocalDate;
  /** What the last attempt found, for example that this meal changed somewhere else. */
  notice: string | null;
  busy: boolean;
  canWrite: boolean;
  onSubmit: (values: MealSheetValues) => void;
  onClose: () => void;
  onRemove?: () => void;
  onPlanAgain?: () => void;
  onAddTask?: () => void;
}

const TITLES: Record<MealSheetMode, string> = {
  create: MEAL_COPY.sheetAddTitle,
  edit: MEAL_COPY.sheetEditTitle,
  again: MEAL_COPY.sheetAgainTitle,
};

/**
 * Add, edit or plan-again, in one small sheet on the Meals screen. Quick to use: a name and a save is a complete decision, the day
 * starts as today and the meal type as "Not set", and both are visible before saving. It offers a day as one tap from the next two
 * weeks, or any date typed as YYYY-MM-DD, and never assumes a meal type. Remove means take it out of the plan, nothing more.
 */
export function MealSheet(props: MealSheetProps) {
  const { visible, mode, initial, today, notice, busy, canWrite, onSubmit, onClose, onRemove, onPlanAgain, onAddTask } = props;
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState<LocalDate>(initial.date);
  const [slot, setSlot] = useState<MealSlot>(initial.slot);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

  const choices = dayChoices(today);
  // An entry outside the next two weeks (or in the past) keeps its own day as a chip, so its date is never silently replaced.
  const days = choices.includes(date) ? choices : [date, ...choices];
  const customError = customOpen && customText.length > 0 && !isLocalDate(customText) ? MEAL_COPY.errDate : null;
  const checked = checkMealTitle(title);
  const canSave = canWrite && !busy && checked.ok && isLocalDate(date);

  const pickCustom = (text: string) => {
    setCustomText(text);
    if (isLocalDate(text)) setDate(text);
  };

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={TITLES[mode]}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText variant="sectionTitle">{TITLES[mode]}</AppText>
        {notice ? (
          <View style={styles.block}>
            <InlineNotice tone="waiting" title={notice} />
          </View>
        ) : null}

        <View style={styles.block}>
          <TextField
            label={MEAL_COPY.fieldMeal}
            value={title}
            onChangeText={setTitle}
            placeholder={MEAL_COPY.fieldMealPlaceholder}
            maxLength={MEAL_TITLE_MAX}
            autoFocus={mode !== 'edit'}
          />
        </View>

        <View style={styles.block}>
          <Overline>{MEAL_COPY.fieldDay}</Overline>
          <View style={styles.chips}>
            {days.map((day) => (
              <ChipToggle key={day} label={dayChoiceLabel(day, today)} selected={day === date && !customOpen} onPress={() => { setCustomOpen(false); setDate(day); }} />
            ))}
            <ChipToggle label={MEAL_COPY.fieldAnotherDay} selected={customOpen} onPress={() => setCustomOpen((open) => !open)} />
          </View>
          {customOpen ? (
            <TextField label={MEAL_COPY.fieldDate} value={customText} onChangeText={pickCustom} placeholder="2026-09-22" keyboardType="numbers-and-punctuation" error={customError} maxLength={10} />
          ) : null}
          <AppText variant="supporting" color={colors.textSecondary} accessibilityLiveRegion="polite">
            {`${MEAL_COPY.fieldDay}: ${mealDayLabel(date, today)}, ${longDate(date)}`}
          </AppText>
        </View>

        <View style={styles.block}>
          <Overline>{MEAL_COPY.fieldType}</Overline>
          <View style={styles.chips}>
            {SLOT_CHOICES.map((choice) => (
              <ChipToggle key={choice} label={SLOT_LABEL[choice]} selected={slot === choice} onPress={() => setSlot(slot === choice ? 'unspecified' : choice)} />
            ))}
          </View>
          <AppText variant="supporting" color={colors.textSecondary} accessibilityLiveRegion="polite">
            {`${MEAL_COPY.fieldType}: ${mealTypeSummary(slot)}`}
          </AppText>
        </View>

        <View style={styles.actions}>
          <Button label={MEAL_COPY.cancel} variant="ghost" onPress={onClose} />
          <Button label={mode === 'edit' ? MEAL_COPY.saveChanges : MEAL_COPY.save} onPress={() => onSubmit({ title, date, slot })} disabled={!canSave} />
        </View>

        {mode === 'edit' ? (
          <View style={styles.more}>
            {onPlanAgain ? <Button label={MEAL_COPY.planAgain} variant="secondary" size="sm" onPress={onPlanAgain} accessibilityHint={MEAL_COPY.planAgainHint} /> : null}
            {onAddTask ? <Button label={MEAL_COPY.addTaskForMeal} variant="secondary" size="sm" onPress={onAddTask} /> : null}
            {onRemove ? <Button label={MEAL_COPY.remove} variant="ghost" size="sm" onPress={onRemove} disabled={!canWrite || busy} accessibilityHint={MEAL_COPY.removeHint} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  block: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  more: { marginTop: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
});
