import { consequenceRank } from '../../../domain/foundation/authorization';
import type { LocalDate } from '../../../domain/logicalDay';
import { oneMoveForDay } from '../../../domain/oneMove';
import { explain } from '../../../domain/patterns';
import type { DayView } from '../../../domain/projectDay';
import type { AppState, OneMoveRecord, OneMoveTargetType } from '../../../domain/state';
import type { OneMoveItem } from '../../../types';
import { relativeDay } from '../formatDay';
import { describeRef, eventRoute, needsMeRoute, sourceOf, taskRoute } from './refs';
import type { OneMoveCompletion, OneMoveSection, OneMoveWhy, SourceLine, TodayRoute } from './types';

/**
 * TODAY'S ONE MOVE, AS PRESENTED.
 *
 * Selection is not here and never will be: `resolveOneMoveForToday` (the One Move
 * machinery) chooses, once per logical day, and stores its choice. This reads that
 * stored decision through `oneMoveForDay` and answers three presentation questions
 * with typed facts only: what "I did it" will actually change, where the row can be
 * opened, and why it was chosen (the stored evidence links — never a transcript).
 *
 * Lifecycle, as the foundation defines it:
 *   none       no decision stored for this logical day -> nothing is rendered. Not "no
 *              data" theatre: yesterday's decision is never today's, because the lookup
 *              is keyed on the logical day.
 *   selected   a recommendation; "I did it" is her act, and the decision recorded is hers.
 *   completed  done; it no longer asks for anything.
 *   withheld   Her Keys deliberately added nothing because the day is full. This is a
 *              decision, distinct from having nothing to say.
 */

interface Affordance {
  open: (id: string) => TodayRoute | null;
  completion: OneMoveCompletion;
}

/**
 * TOTAL over the registered target kinds (`ONE_MOVE_TARGET_TYPES`). A kind added to the
 * registry without a line here fails to compile, so a new kind can never silently get no
 * affordance. Nothing is manufactured: where a kind has no legitimate screen or no
 * completion effect of its own, it says so (`open: null`, `records_only`).
 */
const AFFORDANCE: Record<OneMoveTargetType, Affordance> = {
  catalog: { open: () => null, completion: 'records_only' },
  task: { open: (id) => taskRoute(id), completion: 'completes_task' },
  needsMe: { open: () => needsMeRoute(), completion: 'resolves_needs_me' },
  event: { open: (id) => eventRoute(id), completion: 'records_only' },
  system: { open: () => null, completion: 'records_only' },
  responsibility: { open: () => null, completion: 'records_only' },
};

/** The evidence codes this codebase understands, in her language. An unknown code is stored and never rendered. */
const EVIDENCE_LABEL: ReadonlyMap<string, string> = new Map([
  ['deadline', 'Deadline'],
  ['capacity_conflict', 'Capacity'],
  ['dependency', 'Dependency'],
  ['pattern', 'Pattern'],
  ['preference', 'Preference'],
  ['explicit_instruction', 'Your instruction'],
  ['repeated_deferral', 'Repeated deferral'],
  ['consequence', 'Consequence'],
  ['todays_radar', 'On today’s list'],
  ['oldest_open', 'Waiting longest'],
]);

/** The codes the One Move selection emits, each of which can be re-checked against the row it points at. */
const CHECKABLE_CODES: ReadonlySet<string> = new Set(['todays_radar', 'deadline', 'consequence', 'oldest_open']);

export function oneMoveSection(state: AppState, today: LocalDate, day: DayView): OneMoveSection | null {
  const view = oneMoveForDay(state, today);
  if (view.status === 'none') return null;

  const record = state.oneMoves.find((r) => r.forDate === today) ?? null;

  if (view.status === 'withheld') {
    return { status: 'withheld', action: null, estimatedMinutes: null, targetType: null, targetId: null, open: null, completion: null, why: null, source: null };
  }

  const move = view.move;
  const targetType = record?.targetType ?? null;
  const targetId = record?.targetId ?? null;
  const affordance = targetType !== null ? AFFORDANCE[targetType] : null;
  const open = affordance !== null && targetId !== null ? affordance.open(targetId) : null;

  const base = {
    action: move?.action ?? null,
    estimatedMinutes: move?.estimatedMinutes ?? null,
    targetType,
    targetId,
    open,
    source: targetSource(state, targetType, targetId),
  };

  if (view.status === 'completed') return { status: 'completed', ...base, completion: null, why: null };

  return {
    status: 'selected',
    ...base,
    completion: affordance?.completion ?? null,
    why: record !== null && move !== null ? whyFor(state, today, day, record, move) : null,
  };
}

function targetSource(state: AppState, targetType: OneMoveTargetType | null, targetId: string | null): SourceLine | null {
  if (targetType === null || targetId === null || targetType === 'catalog') return null;
  if (targetType === 'responsibility') {
    const row = state.responsibilities.find((r) => r.id === targetId);
    return row ? sourceOf(row) : null;
  }
  return describeRef(state, { kind: targetType, id: targetId }).source;
}

function whyFor(state: AppState, today: LocalDate, day: DayView, record: OneMoveRecord, move: OneMoveItem): OneMoveWhy {
  const reasons: string[] = [];
  const evidence: OneMoveWhy['evidence'] = [];

  for (const link of explain(state, { kind: 'oneMove', id: record.id })) {
    const label = EVIDENCE_LABEL.get(link.code);
    if (label === undefined) continue;
    const reason = supportedReason(link.code, link.support, state, today, day);
    // A code Today can re-check against the row must still hold; a stale link is neither a reason nor evidence.
    if (reason === null && CHECKABLE_CODES.has(link.code)) continue;
    evidence.push({ code: link.code, label, aboutTitle: describeRef(state, link.support).title });
    if (reason !== null && !reasons.includes(reason)) reasons.push(reason);
  }

  // A reason survives only if the row still says so. A stale link is dropped, not repeated.
  if (reasons.length === 0) return { basis: 'item_observation', reasons: [move.observation], evidence };

  if (move.estimatedMinutes !== undefined && move.estimatedMinutes > 0) {
    reasons.push(`It should take about ${move.estimatedMinutes} minute${move.estimatedMinutes === 1 ? '' : 's'}.`);
  }
  return { basis: 'recorded_evidence', reasons, evidence };
}

function supportedReason(code: string, support: { kind: string; id: string }, state: AppState, today: LocalDate, day: DayView): string | null {
  if (support.kind === 'task') {
    const task = state.tasks.find((t) => t.id === support.id);
    if (!task || task.status !== 'open') return null;
    if (code === 'todays_radar') return day.tasks.some((t) => t.id === task.id) ? 'It’s already on your list for today.' : null;
    if (code === 'deadline') {
      if (task.dueDate === null || task.dueDate > today) return null;
      return task.dueDate === today ? 'It’s due today.' : `It was due ${relativeDay(task.dueDate, today)}.`;
    }
    if (code === 'consequence') {
      return task.consequence !== null && consequenceRank(task.consequence) >= consequenceRank('high') ? `If this slips, the cost is ${task.consequence}.` : null;
    }
    return null;
  }
  if (support.kind === 'needsMe' && code === 'oldest_open') {
    const oldest = state.needsMe
      .filter((n) => n.status === 'open')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
    return oldest?.id === support.id ? 'It’s the longest-waiting thing you captured.' : null;
  }
  return null;
}
