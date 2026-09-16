import { useLocalSearchParams } from 'expo-router';
import { TaskForm } from '../src/features/tasks/TaskForm';

export default function TaskEditorModal() {
  const { taskId, categoryId, title } = useLocalSearchParams<{ taskId?: string; categoryId?: string; title?: string }>();
  return <TaskForm taskId={taskId} initialCategoryId={categoryId} initialTitle={title} />;
}
