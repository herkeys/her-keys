import { router } from 'expo-router';
import { Screen } from '../../../src/design/components';
import { MealsOverview } from '../../../src/features/meals/MealsOverview';

/** The direct Meals route, already registered under Life. Editing a meal task opens the one task editor she already has. */
export default function MealsScreen() {
  return (
    <Screen>
      <MealsOverview onOpenTask={(taskId) => router.push({ pathname: '/task-editor', params: { taskId } })} />
    </Screen>
  );
}
