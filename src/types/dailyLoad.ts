import type { TaskItem } from './schedule';

export type DailyLoadStatus = 'overloaded' | 'balanced';

export type DailyLoadDecision = 'pending' | 'moved' | 'kept';

export interface DailyLoadGap {
  beforeEventId: string;
  beforeTitle: string;
  afterEventId: string;
  afterTitle: string;
  windowStartMinutes: number;
  windowEndMinutes: number;
  rawWindowMinutes: number;
}

export interface DailyLoadRecommendation {
  task: TaskItem;
  observation: string;
  reason: string;
  /** Buffer in this window as things stand now. */
  currentBufferMinutes: number;
  /** Buffer in this window if this task moves. */
  projectedBufferMinutes: number;
  /** The commitment this window runs up against, e.g. "Josie's soccer practice". */
  windowAfterTitle: string;
}

export type LoadLevel = 'open' | 'steady' | 'tight' | 'full';

export interface LoadEstimate {
  level: LoadLevel;
  label: string;
  caption: string;
  /** Filled segments out of `total`. Deliberately coarse — this is an estimate. */
  filled: number;
  total: number;
}

export interface DailyLoadAssessment {
  status: DailyLoadStatus;
  bufferMinutes: number;
  requiredBufferMinutes: number;
  gap: DailyLoadGap | null;
  candidates: DailyLoadRecommendation[];
}
