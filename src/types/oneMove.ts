import type { LifeDomain } from './schedule';

export interface OneMoveItem {
  id: string;
  observation: string;
  action: string;
  domain: LifeDomain;
  /** Kept small on purpose — a One Move should read as doable right now. */
  estimatedMinutes: number;
}
