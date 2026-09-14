import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { todaysEvents, todaysTasks as seedTasks } from '../data/seed/schedule';
import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { CalendarEventItem, DailyLoadAssessment, DailyLoadDecision, DailyLoadRecommendation, TaskItem } from '../types';

interface ScheduleContextValue {
  events: CalendarEventItem[];
  tasks: TaskItem[];
  assessment: DailyLoadAssessment;
  decision: DailyLoadDecision;
  candidateIndex: number;
  appliedRecommendation: DailyLoadRecommendation | null;
  showNextCandidate: () => void;
  moveRecommendedTask: () => void;
  keepAsPlanned: () => void;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

/**
 * Holds today's local schedule state so the Daily Load recommendation and
 * the Today timeline stay in sync: moving a task here is what makes it
 * disappear from the timeline and the buffer recalculate. In-memory only —
 * Build 1 has no persistence, so this resets on reload.
 */
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskItem[]>(seedTasks);
  const [decision, setDecision] = useState<DailyLoadDecision>('pending');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [appliedRecommendation, setAppliedRecommendation] = useState<DailyLoadRecommendation | null>(null);

  const assessment = useMemo(() => computeDailyLoad(todaysEvents, tasks), [tasks]);
  const activeCandidate = assessment.candidates[candidateIndex] ?? null;

  function showNextCandidate() {
    if (assessment.candidates.length === 0) return;
    setCandidateIndex((i) => (i + 1) % assessment.candidates.length);
  }

  function moveRecommendedTask() {
    if (!activeCandidate) return;
    setAppliedRecommendation(activeCandidate);
    setTasks((prev) =>
      prev.map((t) => (t.id === activeCandidate.task.id ? { ...t, scheduledStartMinutes: undefined } : t))
    );
    setDecision('moved');
  }

  function keepAsPlanned() {
    setDecision('kept');
  }

  const value: ScheduleContextValue = {
    events: todaysEvents,
    tasks,
    assessment,
    decision,
    candidateIndex,
    appliedRecommendation,
    showNextCandidate,
    moveRecommendedTask,
    keepAsPlanned,
  };

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider');
  return ctx;
}
