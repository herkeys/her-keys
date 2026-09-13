import type { CalendarEventItem, TaskItem } from '../../types';

function toMinutes(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

/**
 * A fictional "overloaded day" scenario: a normal-looking Wednesday that is
 * actually too tight once the flexible tasks scheduled into the pickup ->
 * soccer window are accounted for. See src/features/daily-load/computeDailyLoad.ts
 * for the logic that detects this.
 */
export const todaysEvents: CalendarEventItem[] = [
  {
    id: 'evt-1',
    title: 'Team status call',
    startMinutes: toMinutes(9),
    endMinutes: toMinutes(9, 30),
    ownerId: 'user-1',
    category: 'work',
  },
  {
    id: 'evt-2',
    title: 'Pick up Josie & Theo',
    startMinutes: toMinutes(15),
    endMinutes: toMinutes(15, 15),
    ownerId: 'user-1',
    category: 'kids',
    location: 'Lincoln Elementary',
  },
  {
    id: 'evt-3',
    title: "Josie's soccer practice",
    startMinutes: toMinutes(16, 30),
    endMinutes: toMinutes(17, 30),
    ownerId: 'child-1',
    category: 'kids',
    location: 'Riverside Field',
  },
  {
    id: 'evt-4',
    title: 'Dinner',
    startMinutes: toMinutes(18, 30),
    endMinutes: toMinutes(19, 15),
    ownerId: 'user-1',
    category: 'meal',
  },
];

export const todaysTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Pay orthodontist invoice',
    durationMinutes: 10,
    commitment: 'fixed',
    dueToday: true,
    domain: 'money',
  },
  {
    id: 'task-2',
    title: 'Return library books',
    durationMinutes: 30,
    commitment: 'flexible',
    dueToday: false,
    domain: 'home',
    scheduledStartMinutes: toMinutes(15, 20),
  },
  {
    id: 'task-3',
    title: "Email Josie's teacher about the field trip form",
    durationMinutes: 10,
    commitment: 'flexible',
    dueToday: false,
    domain: 'kids',
    scheduledStartMinutes: toMinutes(15, 55),
  },
];
