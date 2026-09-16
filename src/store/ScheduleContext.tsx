import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { approveDailyLoadMove, dailyLoadDecisionFor, keepDailyLoadPlan, type AppliedMove } from '../domain/dailyLoadDecisions';
import { assessDailyLoadIssues, type DailyLoadIssues } from '../domain/dailyLoadIssues';
import { loadTierOf, type LoadTier } from '../domain/loadTier';
import { projectDay } from '../domain/projectDay';
import {
  approveDropTask,
  approveMoveEvent,
  approveProtectItem,
  approveShortenTask,
  keepCapacityPlan,
} from '../domain/recommendationActions';
import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { CalendarEventItem, DailyLoadAssessment, DailyLoadDecision, TaskItem } from '../types';
import { useAppStore, useHouseholdState } from './AppStateProvider';

interface ScheduleContextValue {
  events: CalendarEventItem[];
  tasks: TaskItem[];
  assessment: DailyLoadAssessment;
  issues: DailyLoadIssues;
  loadTier: LoadTier;
  decision: DailyLoadDecision;
  candidateIndex: number;
  appliedMove: AppliedMove | null;
  showNextCandidate: () => void;
  moveRecommendedTask: () => void;
  keepAsPlanned: () => void;
  /** These four persist before resolving — the caller only shows success once the write has actually landed. */
  moveEvent: (eventId: string) => Promise<boolean>;
  dropTask: (taskId: string) => Promise<boolean>;
  shortenTask: (taskId: string) => Promise<boolean>;
  keepCapacity: () => Promise<boolean>;
  protectItem: (target: { targetType: 'task' | 'event'; targetId: string }) => Promise<boolean>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

/**
 * Today's schedule as the Daily Load card, the timeline and life status see
 * it. The facts come from the household store; this projects them onto the
 * logical day and recomputes the assessment. A move made before a relaunch
 * shows up because the task itself moved — no earlier analysis is kept.
 * Browsing alternative recommendations is the only local state.
 */
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const { state, today } = useHouseholdState();
  const [candidateIndex, setCandidateIndex] = useState(0);

  const day = useMemo(
    () => projectDay({ events: state.events, tasks: state.tasks, timeZone: state.user.timezone }, today),
    [state.events, state.tasks, state.user.timezone, today]
  );
  const assessment = useMemo(() => computeDailyLoad(day.events, day.tasks), [day]);
  const issues = useMemo(() => assessDailyLoadIssues(day.events, day.tasks, assessment), [day, assessment]);
  const { decision, appliedMove } = useMemo(() => dailyLoadDecisionFor(state, today), [state, today]);

  // Candidates change after a move or on a new day, so the index can never point past the end (HK-AUDIT-037).
  const count = assessment.candidates.length;
  const activeIndex = count === 0 ? 0 : candidateIndex % count;
  const activeCandidate = assessment.candidates[activeIndex] ?? null;

  const value: ScheduleContextValue = {
    events: day.events,
    tasks: day.tasks,
    assessment,
    issues,
    loadTier: loadTierOf(assessment),
    decision,
    candidateIndex: activeIndex,
    appliedMove,
    showNextCandidate: () => {
      if (count > 0) setCandidateIndex((activeIndex + 1) % count);
    },
    moveRecommendedTask: () => {
      if (activeCandidate) store.dispatch((current, ctx) => approveDailyLoadMove(current, ctx, activeCandidate.task.id));
    },
    keepAsPlanned: () => {
      store.dispatch((current, ctx) => keepDailyLoadPlan(current, ctx, activeCandidate?.task.id ?? null));
    },
    moveEvent: (eventId) => store.commit((current, ctx) => approveMoveEvent(current, ctx, eventId)),
    dropTask: (taskId) => store.commit((current, ctx) => approveDropTask(current, ctx, taskId)),
    shortenTask: (taskId) => store.commit((current, ctx) => approveShortenTask(current, ctx, taskId)),
    keepCapacity: () => store.commit((current, ctx) => keepCapacityPlan(current, ctx)),
    protectItem: (target) => store.commit((current, ctx) => approveProtectItem(current, ctx, target)),
  };

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider');
  return ctx;
}
