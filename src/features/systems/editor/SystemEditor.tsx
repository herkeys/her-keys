import { router, Stack } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ChipToggle, Divider, EmptyState, InlineNotice, Overline, Screen, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { SYSTEM_LIMITS, type DraftIssue } from '../commands/draft';
import { MAX_STEPS_PER_SYSTEM } from '../commands/stepOrder';
import { copy, issueMessage } from '../copy';
import { WEEKDAYS_SHORT, formatDay } from '../format';
import type { ScheduleFrequency } from '../model/types';
import { useSystemEditor } from './useSystemEditor';

const FREQUENCIES: Array<[ScheduleFrequency, string]> = [
  ['daily', copy.editor.daily],
  ['weekly', copy.editor.weekly],
  ['monthly', copy.editor.monthly],
  ['yearly', copy.editor.yearly],
];

/**
 * One primary editor surface, with the optional parts (steps, schedule) disclosed as they are
 * needed. A name and an area are enough to make a useful System; everything else is optional and
 * nothing is required to be filled in first.
 *
 * Controls appear only when they can act: there is no Remove on a step that already exists (there
 * is no retire semantic, so it can be changed but not dropped), no Up on the first step, no Down
 * on the last. Nothing is disabled to look like something it is not.
 */
export function SystemEditor({ systemId }: { systemId?: string }) {
  const e = useSystemEditor(systemId);
  const { draft } = e;

  if (e.saveDisabled) {
    return (
      <Screen bottomClearance={spacing.xxxl}>
        <InlineNotice tone="attention" title={copy.editor.unavailable} />
      </Screen>
    );
  }
  if (draft === null || e.status === 'missing') {
    return (
      <Screen bottomClearance={spacing.xxxl}>
        <EmptyState title={copy.detail.missingTitle} body={copy.editor.missing} />
        <View style={styles.centered}>
          <Button label={copy.detail.back} variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const busy = e.status === 'saving';
  const errors = (field: string): string | null => {
    if (!e.showIssues) return null;
    const issue = e.issues.find((i: DraftIssue) => i.field === field);
    return issue === undefined ? null : issueMessage(issue, e.stepNumber);
  };
  const { actions } = e;
  const schedule = draft.schedule;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bottomClearance={spacing.xxxl}>
        <Stack.Screen options={{ title: draft.isNew ? copy.editor.newTitle : copy.editor.editTitle }} />

        {e.stale ? (
          <View style={styles.block}>
            <InlineNotice tone="attention" title={copy.editor.staleTitle} body={copy.editor.staleBody} />
            <Button label={copy.editor.loadLatest} variant="secondary" size="sm" style={styles.loadLatest} onPress={actions.reload} />
          </View>
        ) : null}

        {/* ------------------------------------------------------------ the basics */}
        <TextField
          label={copy.editor.name}
          value={draft.name}
          onChangeText={actions.setName}
          placeholder={copy.editor.namePlaceholder}
          maxLength={SYSTEM_LIMITS.name}
          autoFocus={draft.isNew}
          error={errors('name')}
        />
        <TextField
          label={copy.editor.purpose}
          value={draft.purpose}
          onChangeText={actions.setPurpose}
          placeholder={copy.editor.purposePlaceholder}
          multiline
          maxLength={SYSTEM_LIMITS.purpose}
          error={errors('purpose')}
        />

        <Overline style={styles.label}>{copy.editor.area}</Overline>
        <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={copy.editor.area}>
          {e.categories.map((category) => (
            <ChipToggle key={category.id} label={category.name} selected={category.id === draft.categoryId} onPress={() => actions.setCategory(category.id)} />
          ))}
        </View>
        {errors('area') !== null ? (
          <AppText variant="metadata" color={color.status.attention} style={styles.fieldError}>
            {errors('area')}
          </AppText>
        ) : null}

        {/* ---------------------------------------------------------------- steps */}
        <Overline style={[styles.label, styles.section]}>{copy.editor.stepsTitle}</Overline>
        <AppText variant="supporting" color={color.text.secondary} style={styles.help}>
          {copy.editor.stepsHelp}
        </AppText>
        {draft.steps.map((step, index) => (
          <View key={step.key}>
            {index > 0 ? <Divider tight /> : null}
            <TextField
              label={copy.editor.step(index + 1)}
              value={step.title}
              onChangeText={(text) => actions.setTitle(step.key, text)}
              maxLength={SYSTEM_LIMITS.stepTitle}
              error={errors(`step:${step.key}`)}
            />
            <TextField
              label={copy.editor.minutes(index + 1)}
              value={e.texts.minutes[step.key] ?? ''}
              onChangeText={(text) => actions.setMinutes(step.key, text)}
              keyboardType="number-pad"
              maxLength={4}
            />
            <View style={styles.stepControls}>
              {index > 0 ? <Button label={copy.editor.up} variant="ghost" size="sm" accessibilityHint={copy.editor.moveUp(index + 1)} onPress={() => actions.moveStep(step.key, -1)} /> : null}
              {index < draft.steps.length - 1 ? <Button label={copy.editor.down} variant="ghost" size="sm" accessibilityHint={copy.editor.moveDown(index + 1)} onPress={() => actions.moveStep(step.key, 1)} /> : null}
              {step.id === null ? <Button label={copy.editor.remove} variant="ghost" size="sm" accessibilityHint={copy.editor.removeNew(index + 1)} onPress={() => actions.removeNewStep(step.key)} /> : null}
            </View>
          </View>
        ))}
        {errors('steps') !== null ? (
          <AppText variant="metadata" color={color.status.attention} style={styles.fieldError}>
            {errors('steps')}
          </AppText>
        ) : null}
        {draft.steps.length < MAX_STEPS_PER_SYSTEM ? (
          <Button label={copy.editor.addStep} variant="secondary" size="sm" style={styles.addStep} onPress={actions.addStep} />
        ) : (
          <AppText variant="metadata" color={color.text.muted} style={styles.help}>
            {copy.editor.stepLimit}
          </AppText>
        )}

        {/* ------------------------------------------------------------- schedule */}
        <Overline style={[styles.label, styles.section]}>{copy.editor.scheduleTitle}</Overline>
        {draft.scheduleMode === 'keep' && e.hasOtherRule ? (
          <Card tone="subtle">
            <AppText variant="bodyStrong">{copy.editor.keepTitle}</AppText>
            <AppText variant="supporting" color={color.text.secondary} style={styles.help}>
              {copy.editor.keepBody}
            </AppText>
            <View style={styles.stepControls}>
              <Button label={copy.editor.useCalendar} variant="secondary" size="sm" onPress={actions.switchToCalendar} />
              <Button label={copy.editor.stopRepeating} variant="ghost" size="sm" onPress={() => actions.setMode('none')} />
            </View>
          </Card>
        ) : (
          <View>
            <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={copy.editor.scheduleTitle}>
              <ChipToggle label={copy.editor.noSchedule} selected={draft.scheduleMode === 'none'} onPress={() => actions.setMode('none')} />
              <ChipToggle label={copy.editor.repeats} selected={draft.scheduleMode === 'calendar'} onPress={() => actions.setMode('calendar')} />
            </View>

            {draft.scheduleMode === 'calendar' && schedule !== null ? (
              <View>
                <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={copy.editor.frequencyGroup}>
                  {FREQUENCIES.map(([value, label]) => (
                    <ChipToggle key={value} label={label} selected={schedule.frequency === value} onPress={() => actions.setFrequency(value)} />
                  ))}
                </View>
                <TextField label={copy.editor.every} value={e.texts.interval} onChangeText={actions.setIntervalText} keyboardType="number-pad" maxLength={3} />

                {schedule.frequency === 'weekly' ? (
                  <View>
                    <Overline style={styles.label}>{copy.editor.on}</Overline>
                    <View style={styles.chipRow} accessibilityLabel={copy.editor.weekdayGroup}>
                      {WEEKDAYS_SHORT.map((name, day) => (
                        <ChipToggle key={name} label={name} selected={schedule.byWeekday?.includes(day) ?? false} onPress={() => actions.toggleWeekday(day)} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {schedule.frequency === 'monthly' ? (
                  <TextField label={copy.editor.monthDay} value={e.texts.monthDay} onChangeText={actions.setMonthDayText} keyboardType="number-pad" maxLength={2} />
                ) : null}
                <TextField label={copy.editor.time} value={e.texts.time} onChangeText={actions.setTimeText} placeholder={copy.editor.timePlaceholder} maxLength={8} />
                {errors('schedule') !== null ? (
                  <AppText variant="metadata" color={color.status.attention} style={styles.fieldError}>
                    {errors('schedule')}
                  </AppText>
                ) : null}

                {e.preview !== null ? (
                  <Card tone="subtle" style={styles.preview}>
                    <Overline>{copy.editor.previewTitle}</Overline>
                    <AppText variant="body" style={styles.help}>
                      {e.preview.length === 0 ? copy.editor.previewNone : e.preview.map(formatDay).join(' · ')}
                    </AppText>
                    <AppText variant="metadata" color={color.text.muted} style={styles.help}>
                      {copy.editor.previewNote}
                    </AppText>
                  </Card>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {/* ----------------------------------------------------------------- save */}
        {e.saveError !== null ? (
          <AppText variant="supporting" color={color.status.attention} style={styles.saveError} accessibilityRole="alert">
            {copy.editor.notSaved}
          </AppText>
        ) : null}
        <Button
          label={busy ? copy.editor.saving : draft.isNew ? copy.editor.save : copy.editor.saveChanges}
          onPress={() => void actions.save()}
          disabled={busy || e.stale}
          style={styles.save}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center' },
  block: { marginBottom: spacing.lg },
  loadLatest: { alignSelf: 'flex-start', marginTop: spacing.sm },
  label: { marginBottom: spacing.sm },
  section: { marginTop: spacing.xl },
  help: { marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  fieldError: { marginBottom: spacing.md },
  stepControls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  addStep: { alignSelf: 'flex-start', marginBottom: spacing.md },
  preview: { marginBottom: spacing.lg },
  saveError: { marginTop: spacing.lg },
  save: { marginTop: spacing.xl },
});
