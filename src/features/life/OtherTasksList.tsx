import { router } from 'expo-router';
import { StatusList, AppText } from '../../design/components';
import { colors } from '../../design/tokens';
import { openTasksWithoutList } from '../../domain/taskLists';
import { useHouseholdState } from '../../store/AppStateProvider';
import { useHousehold } from '../../store/useHousehold';
import { needsAttention, openTaskLabel } from './openTaskLabel';

/**
 * Open tasks whose category has no screen of its own yet — Meals, Wellbeing,
 * Relationships, Co-parenting, her own categories, and archived ones — so
 * nothing she saved is out of reach.
 */
export function OtherTasksList() {
  const { state, today } = useHouseholdState();
  const { categoryName } = useHousehold();
  const entries = openTasksWithoutList(state, today);

  if (entries.length === 0) {
    return (
      <AppText variant="body" color={colors.textSecondary}>
        Nothing else is open.
      </AppText>
    );
  }

  return (
    <StatusList
      items={entries.map((entry) => {
        const category = categoryName(entry.task.categoryId);
        return {
          key: entry.task.id,
          label: entry.task.title,
          value: category ? `${openTaskLabel(entry, today)} · ${category}` : openTaskLabel(entry, today),
          needsAttention: needsAttention(entry),
          onPress: () => router.push({ pathname: '/task-editor', params: { taskId: entry.task.id } }),
        };
      })}
    />
  );
}
