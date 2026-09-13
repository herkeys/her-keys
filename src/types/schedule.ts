export type CommitmentType = 'fixed' | 'flexible';

export type LifeDomain = 'home' | 'money' | 'kids' | 'work' | 'meals' | 'personal';

export type EventCategory = 'work' | 'kids' | 'meal' | 'personal';

export interface CalendarEventItem {
  id: string;
  title: string;
  startMinutes: number;
  endMinutes: number;
  ownerId: string;
  category: EventCategory;
  location?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  durationMinutes: number;
  commitment: CommitmentType;
  dueToday: boolean;
  scheduledStartMinutes?: number;
  domain: LifeDomain;
}
