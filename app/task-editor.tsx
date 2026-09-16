import { useLocalSearchParams } from 'expo-router';
import { TaskForm } from '../src/features/tasks/TaskForm';

/** Search params can arrive repeated; only the first value of each is used. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function TaskEditorModal() {
  const { taskId, categoryId, needsMeId } = useLocalSearchParams<{ taskId?: string; categoryId?: string; needsMeId?: string }>();
  return <TaskForm taskId={first(taskId)} initialCategoryId={first(categoryId)} needsMeId={first(needsMeId)} />;
}
