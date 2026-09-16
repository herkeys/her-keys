import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, Overline, Screen, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { isLocalDate } from '../../domain/logicalDay';
import { archiveTask, completeTask, updateTask, addTask } from '../../domain/tasks';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { useHousehold } from '../../store/useHousehold';

export function TaskForm({
  taskId,
  initialCategoryId,
  initialTitle,
}: {
  taskId?: string;
  initialCategoryId?: string;
  initialTitle?: string;
}) {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const { categories } = useHousehold();
  const existing = taskId ? (state.tasks.find((task) => task.id === taskId) ?? null) : null;

  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? '');
  const [commitment, setCommitment] = useState<'fixed' | 'flexible'>(existing?.commitment ?? 'flexible');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [durationMinutes, setDurationMinutes] = useState(existing ? String(existing.durationMinutes) : '15');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    if (title.trim().length === 0) return setError('Give it a title.');
    if (!categoryId) return setError('Choose a category.');
    if (dueDate.trim() !== '' && !isLocalDate(dueDate.trim())) return setError('Due date should look like YYYY-MM-DD, or be left blank.');
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 0) return setError('Estimated minutes should be a whole number.');

    setError(null);
    setBusy(true);
    const input = {
      title: title.trim(),
      categoryId,
      commitment,
      dueDate: dueDate.trim() || null,
      durationMinutes: duration,
      notes: notes.trim() || null,
      scope: 'household' as const,
    };
    const saved = existing
      ? await store.commit((current, ctx) => updateTask(current, ctx, existing.id, input))
      : await store.commit((current, ctx) => addTask(current, ctx, input));
    setBusy(false);
    if (saved) router.back();
    else setError('Her Keys couldn’t save that yet. Try again.');
  };

  const onComplete = async () => {
    if (!existing) return;
    setBusy(true);
    const saved = await store.commit((current, ctx) => completeTask(current, ctx, existing.id));
    setBusy(false);
    if (saved) router.back();
    else setError('Her Keys couldn’t save that yet. Try again.');
  };

  const onArchive = async () => {
    if (!existing) return;
    setBusy(true);
    const saved = await store.commit((current, ctx) => archiveTask(current, ctx, existing.id));
    setBusy(false);
    if (saved) router.back();
    else setError('Her Keys couldn’t save that yet. Try again.');
  };

  return (
    <Screen>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Return library books" autoFocus />

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

      <TextField label="Due date (optional, YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="No due date" />
      <TextField label="Estimated minutes" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      {error && (
        <AppText variant="bodySm" color={colors.attention} style={styles.error}>
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
