import { useMemo } from 'react';
import { useSchedule } from '../../store/ScheduleContext';
import { useHousehold } from '../../store/useHousehold';
import { deriveLifeStatus, shownOnLife, type ShownLifeStatus } from './lifeStatus';

export function useLifeStatus(): ShownLifeStatus[] {
  const { events, tasks } = useSchedule();
  const { categories, systems, upcomingMeals } = useHousehold();

  return useMemo(
    () => shownOnLife(deriveLifeStatus({ categories, events, tasks, systems, upcomingMeals })),
    [categories, events, tasks, systems, upcomingMeals]
  );
}
