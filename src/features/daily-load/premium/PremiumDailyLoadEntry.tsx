import { useSchedule } from '../../../store/ScheduleContext';
import { PremiumDailyLoadSection } from './PremiumDailyLoadSection';

/**
 * The Premium review appears where the Free Daily Load speaks, and only when the Free verdict says the day is not open. (Receipts
 * of earlier changes stay reachable on any day, so an undo never disappears because the day got better.) This is the one place the
 * Free schedule is read; the Section beneath it is props-driven and independently tested.
 */
export function PremiumDailyLoadEntry() {
  const { issues } = useSchedule();
  return <PremiumDailyLoadSection showWhenClear={issues.tier !== 'open'} />;
}
