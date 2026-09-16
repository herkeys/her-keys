import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  approveDailyLoadMove,
  dailyLoadDecisionFor,
  keepDailyLoadPlan,
  undoableMove,
  undoRecommendedMove,
  type AppliedMove,
} from '../domain/dailyLoadDecisions';
import { assessDailyLoadIssues, type DailyLoadIssues } from '../domain/dailyLoadIssues';
import type { LoadTier } from '../domain/loadTier';
import { projectDay } from '../domain/projectDay';
import {
  approveDropTask,
  approveMoveEvent,
  approveProtectItem,
  approveShortenTask,
  keepCapacityPlan,
} from '../domain/recommendationActions';
import { computeDailyLoad } from '../features/daily-load/computeDailyLoad';
import type { CalendarEventItem, DailyLoadAssessment, DailyLoadDecision, DailyLoadRecommendation, TaskItem } from '../types';
import { useAppStore, useHouseholdState } from './AppStateProvider';

interface ScheduleContextValue {
  events: CalendarEventItem[];
  tasks: TaskItem[];
  assessment: DailyLoadAssessment;
  issues: DailyLoadIssues;
  /** The day as Daily Load judges it — the same verdict the card shows. */
  loadTier: LoadTier;
  decision: DailyLoadDecision;
  /** The task moves the current timing verdict offers, largest first — always for the window that verdict names. */
  candidates: DailyLoadRecommendation[];
  candidateIndex: number;
  appliedMove: AppliedMove | null;
  /** Today's approved move, while Undo can still safely reverse it. */
  undoableMoveId: string | null;
  showNextCandidate: () => void;
  moveRecommendedTask: () => void;
  keepAsPlanned: () => void;
  /** These persist before resolving — the caller only shows success once the write has actually landed. */
  moveEvent: (eventId: string) => Promise<boolean>;
  dropTask: (taskId: string) => Promise<boolean>;
  shortenTask: (taskId: string) => Promise<boolean>;
  keepCapacity: () => Promise<boolean>;
  protectItem: (target: { targetType: 'task' | 'event'; targetId: string }) => Promise<boolean>;
  undoMove: (actionId: string) => Promise<boolean>;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

/**
 * Today's schedule as the Daily Load card, the timeline and life status see
 * it. The facts come from the household store; this projects them onto the
 * logical day and recomputes the verdict. A move made before a relaunch
 * shows up because the item itself moved — no earlier analysis is kept.
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
  const undoableMoveId = useMemo(() => undoableMove(state, today)?.id ?? null, [state, today]);

  // Candidates change after a move or on a new day, so the index can never point past the end (HK-AUDIT-037).
  const candidates = issues.focus?.candidates ?? [];
  const count = candidates.length;
  const activeIndex = count === 0 ? 0 : candidateIndex % count;
  const activeCandidate = candidates[activeIndex] ?? null;

  const value: ScheduleContextValue = {
    events: day.events,
    tasks: day.tasks,
    assessment,
    issues,
    loadTier: issues.tier,
    decision,
    candidates,
    candidateIndex: activeIndex,
    appliedMove,
    undoableMoveId,
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
    undoMove: (actionId) => store.commit((current, ctx) => undoRecommendedMove(current, ctx, actionId)),
  };

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider');
  return ctx;
}
