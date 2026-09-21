import { computeDailyLoad, formatTime } from '../../daily-load/computeDailyLoad';
import { describeLoad } from '../../daily-load/describeLoad';
import { dailyLoadDecisionFor } from '../../../domain/dailyLoadDecisions';
import { assessDailyLoadIssues } from '../../../domain/dailyLoadIssues';
import { logicalDateAt, wallClockMinutesAt, zonedTimeToEpochMs } from '../../../domain/logicalDay';
import { projectStateDay } from '../../../domain/projectDay';
import { attentionFor } from '../../../domain/reasoning/attention';
import { briefingFor } from '../../../domain/reasoning/briefing';
import { isSettled, type HydrationStatus } from '../../../domain/routeAccess';
import type { AppState } from '../../../domain/state';
import { DEFAULT_CAPACITY } from '../../../domain/structure';
import type { RecoveryReason } from '../../../state/appStore';
import { describeDayState } from '../dayState';
import { fullDayLabel, weekdayName } from '../formatDay';
import { attentionView } from './attentionView';
import { canWaitSection } from './canWait';
import { decisionView } from './decisionView';
import { executionView } from './executionView';
import { mattersSection, nextRemainingEvent } from './mattersView';
import { deterministicNarrative, type BriefingNarrativeProvider } from './narrative';
import { oneMoveSection } from './oneMoveView';
import { upcomingSection } from './upcoming';
import type { AttentionRow, Composition, SectionKey, SparseSection, TodayReady, TodayView } from './types';

/**
 * THE TODAY PROJECTION.
 *
 *   canonical AppState -> established domain reasoning -> THIS -> presentation
 *
 * `buildTodayView` is pure and deterministic: the same state, the same instant and the
 * same runtime give the same view. It reads the clock only through `nowMs`, which the
 * caller supplies, and reads the day only through the household's own timezone, so a
 * test can hold any instant against any zone. It stores nothing and mutates nothing.
 * Nothing on the screen may be something this does not say.
 *
 * Three rules shape it:
 *
 *   1. UNKNOWN IS NOT LIGHT. Until state is resolved there is no view to show, and a
 *      stand-in state (a recovery that is running in memory while her real household is
 *      preserved elsewhere) is not her household. "Your day looks light" is said only over
 *      state that is resolved and genuinely light.
 *   2. COMPLEXITY FOLLOWS THE DAY. A section is `null` unless the day gives it something
 *      to say. There are no empty boxes.
 *   3. FIRST GLANCE IS BOUNDED. At most three primary blocks, and every list is capped with
 *      the rest one disclosure away.
 */

export const MAX_PRIMARY_BLOCKS = 3;
export const FIRST_GLANCE_ATTENTION = 3;
export const FIRST_GLANCE_WAITING = 3;

export interface TodayRuntime {
  status: HydrationStatus;
  recovery: { reason: RecoveryReason; quarantined: boolean } | null;
  persistence: 'enabled' | 'disabled';
}

export interface TodayInput {
  state: AppState | null;
  /** The instant the view is for. The only clock the projection reads. */
  nowMs: number;
  runtime: TodayRuntime;
  /** Replaceable prose for one slot (the headline). Defaults to the deterministic provider. */
  narrative?: BriefingNarrativeProvider;
}

export function buildTodayView(input: TodayInput): TodayView {
  const { state, nowMs, runtime } = input;

  // 1 — unknown, and stand-in, are never "light".
  if (state === null || !isSettled(runtime.status)) return { availability: 'unknown' };
  if (runtime.recovery !== null && runtime.persistence === 'disabled') {
    return { availability: 'unavailable', reason: 'stand_in_state', recoveryReason: runtime.recovery.reason };
  }

  const tz = state.user.timezone;
  const today = logicalDateAt(nowMs, tz);
  const nowMinutes = wallClockMinutesAt(nowMs, tz);

  // The day, judged by the established Daily Load reasoning.
  const day = projectStateDay(state, today);
  const assessment = computeDailyLoad(day.events, day.tasks);
  const issues = assessDailyLoadIssues(day.events, day.tasks, assessment);
  const timing = dailyLoadDecisionFor(state, today);

  // The briefing foundation (`sinceMs` is the start of the logical day: a boundary, not a stored marker).
  const briefing = briefingFor(state, nowMs, zonedTimeToEpochMs(today, 0, tz));
  const attentionItems = attentionFor(state, nowMs);

  const decision = decisionView(state, today, day, issues, nowMinutes).section;
  const oneMove = oneMoveSection(state, today, day);
  const attentionResult = attentionView(state, nowMs, today, day, attentionItems, briefing);
  const execution = executionView(state, nowMs, today, briefing);

  // ---- attention: her rows plus a failed attempt made today, most urgent first, bounded.
  const urgencyRank = { now: 0, today: 1, soon: 2 } as const;
  const attentionRows: AttentionRow[] = [...attentionResult.rows, ...execution.failed].sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);
  const attention = attentionRows.length === 0 ? null : { rows: attentionRows.slice(0, FIRST_GLANCE_ATTENTION), moreRows: attentionRows.slice(FIRST_GLANCE_ATTENTION) };

  const waitingRows = [...attentionResult.waiting, ...execution.waiting];
  const waiting = waitingRows.length === 0 ? null : { rows: waitingRows.slice(0, FIRST_GLANCE_WAITING), moreRows: waitingRows.slice(FIRST_GLANCE_WAITING) };
  const handled = execution.handled.length === 0 ? null : { rows: execution.handled };

  // ---- what matters: not what is already said elsewhere on the screen.
  const exclude = new Set<string>(attention ? attention.rows.flatMap((r) => (r.ref ? [`${r.ref.kind}:${r.ref.id}`] : [])) : []);
  if (oneMove?.status === 'selected' && oneMove.targetType !== null && oneMove.targetId !== null) exclude.add(`${oneMove.targetType}:${oneMove.targetId}`);
  if (decision?.needsDecision && issues.primary) {
    const p = issues.primary;
    if (p.kind === 'overlap') { exclude.add(`event:${p.eventAId}`); exclude.add(`event:${p.eventBId}`); }
    if (p.kind === 'transition_conflict' || p.kind === 'tight_window') { exclude.add(`event:${p.beforeEventId}`); exclude.add(`event:${p.afterEventId}`); }
  }
  const matters = mattersSection({ state, day, nowMinutes, exclude });

  const oneMoveKey = oneMove?.status === 'selected' && oneMove.targetType !== null && oneMove.targetId !== null ? `${oneMove.targetType}:${oneMove.targetId}` : null;
  const canWait = canWaitSection({ state, day, today, attention: attentionItems, oneMoveKey });
  const upcoming = upcomingSection(state, nowMs, today);

  // ---- an empty household, or a genuinely light day, is stated as what it is.
  const neverEntered = state.origin === 'empty' && state.events.length === 0 && state.tasks.length === 0 && state.needsMe.length === 0;
  const nothingToSay = day.events.length === 0 && day.tasks.length === 0 && attention === null && decision === null && oneMove === null && waiting === null && handled === null;
  const sparse: SparseSection | null = neverEntered
    ? { kind: 'never_entered', entry: [{ label: 'Add a task', route: { pathname: '/task-editor' } }, { label: 'Add an event', route: { pathname: '/event-editor' } }] }
    : nothingToSay
      ? { kind: 'light', entry: [{ label: 'Add a task', route: { pathname: '/task-editor' } }] }
      : null;

  // ---- orientation
  const next = nextRemainingEvent(day, nowMinutes);
  const narrate = input.narrative ?? deterministicNarrative;
  const headline = narrate({
    logicalDate: today,
    household: neverEntered ? 'never_entered' : 'has_entries',
    dayState: describeDayState(assessment, timing.decision, issues),
    tier: issues.tier,
    decision: decision?.state === 'moved' || decision?.state === 'kept' || decision?.state === 'adjusted' ? decision.state : 'pending',
    liveIssue: decision?.state === 'undecided' ? decision.kind : null,
    counts: { events: day.events.length, openTasks: day.tasks.length },
    next: next ? { title: next.title, startMinutes: next.startMinutes } : null,
    needsYou: attentionRows.length,
  }).headline;

  const load = day.events.length > 0 ? describeLoad(day.events, day.tasks, assessment, issues) : null;

  const everythingCount = day.events.length + day.tasks.filter((t) => t.scheduledStartMinutes !== undefined).length;
  const approved = state.actions.some((a) => 'approval' in a && a.approval === 'approved' && a.type.startsWith('daily_load.'));

  const ready: Omit<TodayReady, 'composition'> = {
    availability: 'ready',
    day: { date: today, label: fullDayLabel(today), weekday: weekdayName(today) },
    greeting: state.user.displayName?.trim().split(/\s+/)[0] || null,
    headline,
    nowMinutes,
    load,
    capacityNote: capacityNoteFor(state, load !== null),
    decision,
    attention,
    matters,
    oneMove,
    upcoming,
    canWait,
    waiting,
    handled,
    onYourMind: attentionResult.onYourMind,
    sparse,
    everythingCount,
  };

  return { ...ready, composition: compose(ready, { approved, neverEntered }) };
}

/**
 * The first-level composition: which sections, in what order, at what level. Primary
 * blocks are capped at three — when a busy day has more, "what matters" is the block
 * that steps down, because the decision, what needs her and the One Move each ask
 * something of her and the list of anchors does not.
 */
function compose(view: Omit<TodayReady, 'composition'>, extra: { approved: boolean; neverEntered: boolean }): Composition[] {
  const primary: SectionKey[] = [];
  if (view.sparse) primary.push('sparse');
  if (view.decision) primary.push('decision');
  if (view.attention) primary.push('attention');
  if (view.matters) primary.push('matters');
  if (view.oneMove) primary.push('oneMove');

  const secondary: SectionKey[] = [];
  if (primary.length > MAX_PRIMARY_BLOCKS && primary.includes('matters')) {
    primary.splice(primary.indexOf('matters'), 1);
    secondary.push('matters');
  }
  if (view.upcoming) secondary.push('upcoming');
  if (view.canWait) secondary.push('canWait');
  if (view.waiting) secondary.push('waiting');
  if (view.handled) secondary.push('handled');
  if (view.onYourMind) secondary.push('onYourMind');
  if (extra.approved) secondary.push('approved');
  if (view.everythingCount > 0) secondary.push('everything');
  if (!extra.neverEntered) secondary.push('alsoChecked');

  return [...primary.map((key): Composition => ({ key, level: 'primary' })), ...secondary.map((key): Composition => ({ key, level: 'secondary' }))];
}

/**
 * TODAY-FD-001: Daily Load reads product-default constants, not the household's capacity
 * profile. When the household HAS set its own day, saying nothing would let the reading
 * look like it honored her setting. So it says what it used.
 */
function capacityNoteFor(state: AppState, hasLoad: boolean): string | null {
  const c = state.capacity;
  if (!hasLoad || c === null) return null;
  const differs =
    (c.dayStartMinutes !== null && c.dayStartMinutes !== DEFAULT_CAPACITY.dayStartMinutes) ||
    (c.dayEndMinutes !== null && c.dayEndMinutes !== DEFAULT_CAPACITY.dayEndMinutes) ||
    (c.transitionBufferMinutes !== null && c.transitionBufferMinutes !== DEFAULT_CAPACITY.transitionBufferMinutes);
  if (!differs) return null;
  return `Her Keys is reading this against its default day, ${formatTime(DEFAULT_CAPACITY.dayStartMinutes)} to ${formatTime(DEFAULT_CAPACITY.dayEndMinutes)}, with ${DEFAULT_CAPACITY.transitionBufferMinutes} minutes between commitments. Your own day settings aren’t part of this reading yet.`;
}
