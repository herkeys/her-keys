export interface PlannedMeal {
  day: string;
  meal: string;
}

/** Fictional dinner plan for the seeded household. The seeded day is a Wednesday. */
export const weekMeals: PlannedMeal[] = [
  { day: 'Today', meal: 'Sheet-pan chicken and vegetables' },
  { day: 'Thursday', meal: 'Leftovers night' },
  { day: 'Friday', meal: 'Tacos' },
];
