import { AppText, StatusList } from '../../design/components';
import { colors } from '../../design/tokens';
import { useHousehold } from '../../store/useHousehold';

export function MealsOverview() {
  const { upcomingMeals, categoryIdForRole } = useHousehold();
  const mealsCategoryId = categoryIdForRole('meals');
  const meals = upcomingMeals.filter((m) => m.categoryId === mealsCategoryId);

  if (meals.length === 0) {
    return (
      <AppText variant="body" color={colors.textSecondary}>
        Nothing planned.
      </AppText>
    );
  }

  return <StatusList items={meals.map((m) => ({ key: m.id, label: m.label, value: m.title }))} />;
}
