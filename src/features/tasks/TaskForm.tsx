import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, Overline, Screen, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { DEFAULT_TASK_DURATION_MINUTES, durationSourceForSave } from '../../domain/foundation/duration';
import { isLocalDate } from '../../domain/logicalDay';
import { promoteNeedsMeItem, promotionDefaults } from '../../domain/needsMe';
import { FIELD_LIMITS } from '../../domain/state';
import { archiveTask, completeTask, updateTask, addTask } from '../../domain/tasks';
import type { Transition } from '../../state/appStore';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { useHousehold } from '../../store/useHousehold';

export function TaskForm({
  taskId,
  initialCategoryId,
  needsMeId,
}: {
  taskId?: string;
  initialCategoryId?: string;
  /** Promoting a Needs Me item: its details prefill the form, and it is resolved only when this task is saved. */
  needsMeId?: string;
}) {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const { categories } = useHousehold();
  const existing = taskId ? (state.tasks.find((task) => task.id === taskId) ?? null) : null;
  const promotion = !existing && needsMeId ? promotionDefaults(state, needsMeId) : null;

  const [title, setTitle] = useState(existing?.title ?? promotion?.title ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? promotion?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? '');
  const [commitment, setCommitment] = useState<'fixed' | 'flexible'>(existing?.commitment ?? 'flexible');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? promotion?.dueDate ?? '');
  const [durationMinutes, setDurationMinutes] = useState(existing ? String(existing.durationMinutes) : String(DEFAULT_TASK_DURATION_MINUTES));
  // The prefilled number is the planning default, not something she said. Only touching the field makes it hers.
  const [durationTouched, setDurationTouched] = useState(false);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A second tap in the same frame would otherwise save twice before `busy` renders.
  const inFlight = useRef(false);

  const save = async (transition: Transition) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const saved = await store.commit(transition);
    inFlight.current = false;
    setBusy(false);
    if (saved) router.back();
    else setError('Her Keys couldn’t save that yet. Try again.');
  };

  const onSave = () => {
    if (title.trim().length === 0) return setError('Give it a title.');
    if (!categoryId) return setError('Choose a category.');
    if (dueDate.trim() !== '' && !isLocalDate(dueDate.trim())) return setError('Due date should look like YYYY-MM-DD, or be left blank.');
    const duration = Number(durationMinutes);
    if (!/^\d+$/.test(durationMinutes.trim()) || !Number.isInteger(duration) || duration > FIELD_LIMITS.durationMinutes) {
      return setError(`Estimated minutes should be a whole number from 0 to ${FIELD_LIMITS.durationMinutes}.`);
    }

    setError(null);
    const edits = {
      title: title.trim(),
      categoryId,
      commitment,
      dueDate: dueDate.trim() || null,
      durationMinutes: duration,
      notes: notes.trim() || null,
    };
    // Touched: hers. Untouched on a new task: the default she was shown. Untouched on an edit: whatever it already was.
    const durationSource = durationSourceForSave({ touched: durationTouched, existing });
    if (existing) return save((current, ctx) => updateTask(current, ctx, existing.id, { ...edits, durationSource }));
    const input = { ...edits, durationSource, scope: 'household' as const };
    if (promotion && needsMeId) return save((current, ctx) => promoteNeedsMeItem(current, ctx, needsMeId, input));
    return save((current, ctx) => addTask(current, ctx, input));
  };

  const onComplete = () => {
    if (existing) void save((current, ctx) => completeTask(current, ctx, existing.id));
  };

  const onArchive = () => {
    if (existing) void save((current, ctx) => archiveTask(current, ctx, existing.id));
  };

  return (
    <Screen>
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Return library books"
        autoFocus
        maxLength={FIELD_LIMITS.titleLength}
      />

      <Overline style={styles.label}>Category</Overline>
      <View style={styles.chipRow}>
        {categories.map((category) => (
          <ChipToggle key={category.id} label={category.name} selected={category.id === categoryId} onPress={() => setCategoryId(category.id)} />
        ))}
      </View>

      <Overline style={styles.label}>Commitment</Overline>
      <View style={styles.chipRow}>
        <ChipToggle label="Flexible" selected={commitment === 'flexible'} onPress={() => setCommitment('flexible')} />
        <ChipToggle label="Fixed" selected={commitment === 'fixed'} onPress={() => setCommitment('fixed')} />
      </View>

      <TextField label="Due date (optional, YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="No due date" maxLength={10} />
      <TextField
        label="Estimated minutes"
        value={durationMinutes}
        onChangeText={(text) => {
          setDurationTouched(true);
          setDurationMinutes(text);
        }}
        keyboardType="number-pad"
        maxLength={4}
      />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />

      {error && (
        <AppText variant="bodySm" color={colors.attention} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <Button label={existing ? 'Save changes' : 'Add task'} onPress={onSave} disabled={busy} style={styles.save} />
      {existing && existing.status === 'open' && (
        <>
          <Button label="Mark done" variant="secondary" onPress={onComplete} disabled={busy} style={styles.save} />
          <Button label="Remove task" variant="ghost" onPress={onArchive} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  error: { marginBottom: spacing.lg },
  save: { marginTop: spacing.md, marginBottom: spacing.md },
});
