import type { AppState } from '../../../domain/state';
import type { PresentationContext } from '../present';
import type { Clock, CoParentLogisticsView } from '../types';

/** What every container below the screen is handed: the household as it stands now, and how to read it. */
export interface ContainerProps {
  state: AppState;
  view: CoParentLogisticsView;
  /** Today's date and the HOUSEHOLD zone — never the device's. */
  ctx: PresentationContext;
  householdId: string;
  clock: Clock;
}
