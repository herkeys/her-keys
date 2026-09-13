import { weekMeals } from '../../data/seed/meals';
import { StatusList } from '../../design/components';

export function MealsOverview() {
  return <StatusList items={weekMeals.map((m) => ({ key: m.day, label: m.day, value: m.meal }))} />;
}
