import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { openTasksInCategory } from '../../domain/taskLists';
import { useHouseholdState } from '../../store/AppStateProvider';
import { needsAttention, openTaskLabel } from './openTaskLabel';

interface CategoryTaskListProps {
  categoryId: string | null;
  /** Shown when nothing in this category is open. */
  emptyLabel: string;
}

/**
 * The one shared "tasks for this category" block every Life sub-screen uses:
 * every open task in the category — due or overdue first, then upcoming, then
 * the ones with no date — press-to-edit, with a quick "Add task" pre-filled to
 * the same category. Today and Daily Load still read only today's slice; this
 * list is where everything else she has saved stays reachable.
 */
export function CategoryTaskList({ categoryId, emptyLabel }: CategoryTaskListProps) {
  const { state, today } = useHouseholdState();
  const entries = categoryId ? openTasksInCategory(state, categoryId, today) : [];

  return (
    <View>
      {entries.length > 0 ? (
        <StatusList
          items={entries.map((entry) => ({
            key: entry.task.id,
            label: entry.task.title,
            value: openTaskLabel(entry, today),
            needsAttention: needsAttention(entry),
            onPress: () => router.push({ pathname: '/task-editor', params: { taskId: entry.task.id } }),
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          {emptyLabel}
        </AppText>
      )}
      <Button
        label="Add task"
        variant="ghost"
        size="sm"
        onPress={() => router.push(categoryId ? { pathname: '/task-editor', params: { categoryId } } : '/task-editor')}
        style={styles.addButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
});
