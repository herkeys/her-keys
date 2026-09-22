import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, EmptyState, Overline, Screen, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { FIELD_LIMITS } from '../../domain/state';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { HOME_COPY, REFUSAL_COPY, describeRepeat } from './copy';
import { durationHint, parseTaskForm, taskEditorBaseline, taskFormInitial, type RepeatChoice, type TaskFormValues } from './model/forms';
import { commitHomeChange, createHomeTask, createSubmitGuard, updateHomeTask, type HomeTaskDraft, type HomeTaskEdit } from './model/mutations';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const REPEAT_CHOICES: Array<{ key: RepeatChoice; label: string; unit: string }> = [
  { key: 'none', label: 'No repeat', unit: '' },
  { key: 'daily', label: 'Daily', unit: 'days' },
  { key: 'weekly', label: 'Weekly', unit: 'weeks' },
  { key: 'monthly', label: 'Monthly', unit: 'months' },
  { key: 'yearly', label: 'Yearly', unit: 'years' },
];

/** Create or edit a Home task. Its context is always Home — there is no category chooser, so an edit cannot move it out. */
export function HomeTaskEditor() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const [reload, setReload] = useState(0);
  // `key` remounts the form, so "Reload" re-reads the record and starts from what it is NOW.
  return <TaskEditorForm key={reload} taskId={first(taskId)} onReload={() => setReload((n) => n + 1)} />;
}

function TaskEditorForm({ taskId, onReload }: { taskId?: string; onReload: () => void }) {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const existing = taskId ? (state.tasks.find((task) => task.id === taskId) ?? null) : null;
  const rule = existing ? (state.recurrences.find((r) => r.about.kind === 'task' && r.about.id === existing.id && r.status === 'active') ?? null) : null;

  // What she saw when the editor opened. Captured once: a later change to the record must make her save stale, not slip through.
  const baseline = useRef(taskEditorBaseline(existing)).current;
  const guard = useRef(createSubmitGuard()).current;
  const [values, setValues] = useState<TaskFormValues>(() => taskFormInitial(existing, rule));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TaskFormValues>) => setValues((current) => ({ ...current, ...patch }));

  if (taskId && existing === null) {
    return (
      <Screen>
        <EmptyState title="That isn’t here any more" body="It may have been removed on this or another device." />
      </Screen>
    );
  }

  const onSave = async () => {
    const parsed = parseTaskForm(values, existing && baseline ? { kind: 'edit', taskId: existing.id, basedOn: baseline } : { kind: 'create' });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setStale(false);
    setBusy(true);
    const result = await guard.run(() =>
      commitHomeChange(store, (current, ctx) => (existing ? updateHomeTask(current, ctx, parsed.value as HomeTaskEdit) : createHomeTask(current, ctx, parsed.value as HomeTaskDraft)))
    );
    setBusy(false);
    if (result.ok) return router.back();
    setError(REFUSAL_COPY[result.reason]);
    if (result.reason === 'stale') setStale(true);
  };

  const unit = REPEAT_CHOICES.find((choice) => choice.key === values.repeat)?.unit ?? '';

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit task' : 'Add a Home task' }} />
      <TextField label="Title" value={values.title} onChangeText={(title) => set({ title })} placeholder="Change the furnace filter" autoFocus={!existing} maxLength={FIELD_LIMITS.titleLength} />
      <TextField label="Due date (optional, YYYY-MM-DD)" value={values.dueText} onChangeText={(dueText) => set({ dueText })} placeholder="No due date" maxLength={10} />

      <TextField
        label="Minutes it takes (optional)"
        value={values.durationText}
        onChangeText={(durationText) => set({ durationText, durationTouched: true })}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="Not sure"
      />
      <AppText variant="metadata" color={colors.textTertiary} style={styles.hint}>
        {durationHint(existing)}
      </AppText>

      <TextField label="Notes (optional)" value={values.notes} onChangeText={(notes) => set({ notes })} multiline maxLength={FIELD_LIMITS.notesLength} />

      <Overline style={styles.label}>Commitment</Overline>
      <View style={styles.chips}>
        <ChipToggle label="Flexible" selected={values.commitment === 'flexible'} onPress={() => set({ commitment: 'flexible' })} />
        <ChipToggle label="Fixed" selected={values.commitment === 'fixed'} onPress={() => set({ commitment: 'fixed' })} />
      </View>

      <Overline style={styles.label}>Repeats</Overline>
      {values.repeatLocked && rule !== null ? (
        <AppText variant="supporting" color={colors.textSecondary} style={styles.hint}>
          {`This repeats ${describeRepeat(rule)}. Its repeat settings can’t be changed here.`}
        </AppText>
      ) : (
        <>
          <View style={styles.chips}>
            {REPEAT_CHOICES.map((choice) => (
              <ChipToggle key={choice.key} label={choice.label} selected={values.repeat === choice.key} onPress={() => set({ repeat: choice.key, repeatTouched: true })} />
            ))}
          </View>
          {values.repeat !== 'none' && (
            <TextField label={`Every how many ${unit}?`} value={values.intervalText} onChangeText={(intervalText) => set({ intervalText, repeatTouched: true })} keyboardType="number-pad" maxLength={3} />
          )}
          <AppText variant="metadata" color={colors.textTertiary} style={styles.hint}>
            A repeat says what’s expected. It doesn’t mean anything was done, and it doesn’t put anything on your calendar.
          </AppText>
        </>
      )}

      {error !== null && (
        <AppText variant="bodySm" color={colors.attention} accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
      {stale && <Button label="Reload the latest" variant="secondary" onPress={onReload} style={styles.save} />}

      <Button label={existing ? 'Save changes' : HOME_COPY.addTask} onPress={() => void onSave()} disabled={busy} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  hint: { marginBottom: spacing.lg },
  error: { marginBottom: spacing.lg },
  save: { marginTop: spacing.md, marginBottom: spacing.md },
});
