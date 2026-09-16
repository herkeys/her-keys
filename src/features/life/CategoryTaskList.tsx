import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { useSchedule } from '../../store/ScheduleContext';

interface CategoryTaskListProps {
  categoryId: string | null;
  /** Shown when there's nothing on today's radar for this category. */
  emptyLabel: string;
}

/**
 * The one shared "tasks for this category" block every Life sub-screen uses:
 * today's open tasks in the category, press-to-edit, with a quick "Add task"
 * pre-filled to the same category. The same list Daily Load reads — no
 * separate source of truth for what's on her list today.
 */
export function CategoryTaskList({ categoryId, emptyLabel }: CategoryTaskListProps) {
  const { tasks } = useSchedule();
  const items = categoryId ? tasks.filter((task) => task.categoryId === categoryId) : [];

  return (
    <View>
      {items.length > 0 ? (
        <StatusList
          items={items.map((task) => ({
            key: task.id,
            label: task.title,
            value: task.dueToday ? 'Due today' : 'Flexible',
            needsAttention: task.dueToday,
            onPress: () => router.push({ pathname: '/task-editor', params: { taskId: task.id } }),
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
