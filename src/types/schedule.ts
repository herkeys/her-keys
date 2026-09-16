export type CommitmentType = 'fixed' | 'flexible';

/**
 * The shapes the Daily Load engine, the timeline and life status read: one
 * logical day, with times as minutes after local midnight. They are projected
 * from the stored household state by src/domain/projectDay.ts — never stored
 * themselves.
 */
export interface CalendarEventItem {
  id: string;
  title: string;
  startMinutes: number;
  endMinutes: number;
  categoryId: string;
  /** Who the event concerns, when one person does. */
  subjectMemberId: string | null;
  location?: string;
  /** FIXED can never be moved by a recommendation; only FLEXIBLE can. */
  commitment: CommitmentType;
  /** User-entered only — never computed, so a transition conflict is never invented from absence. */
  travelMinutesBefore?: number;
  travelMinutesAfter?: number;
  preparationMinutes?: number;
}

export interface TaskItem {
  id: string;
  title: string;
  durationMinutes: number;
  commitment: CommitmentType;
  /** Due on this day or already overdue. */
  dueToday: boolean;
  /** Days past its due date; 0 when not overdue or when it has no due date. Reporting only — `dueToday` already governs movability. */
  daysOverdue: number;
  scheduledStartMinutes?: number;
  categoryId: string;
  subjectMemberId: string | null;
}
