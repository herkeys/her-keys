import { intentLifecycle } from '../../../domain/authorization';
import type { ActionIntent } from '../../../domain/foundation/authorization';
import type { LocalDate } from '../../../domain/logicalDay';
import { epochMsOf, logicalDateAt } from '../../../domain/logicalDay';
import type { Briefing } from '../../../domain/reasoning/briefing';
import type { AppState } from '../../../domain/state';
import { ACTION_NOUN, ACTION_VERB, OUTCOME_IS_SUCCESS } from './phrases';
import { describeRef } from './refs';
import type { AttentionRow, HandledRow, WaitingRow } from './types';

/**
 * WHAT HER KEYS DID, AND WHAT IT IS WAITING ON.
 *
 * The chain the foundation keeps apart is kept apart here too:
 *
 *   a suggestion is not a decision      (an intent is only a proposal)
 *   a decision is not authorization     (approval is hers, a standing authority is hers)
 *   authorization is not execution      (an approved intent that has not run is WAITING)
 *   execution is not a successful outcome (a succeeded attempt with no success outcome is
 *                                          UNCONFIRMED, never "handled")
 *
 * "Handled" is said only for a succeeded execution that ALSO has a success outcome observed
 * today. That is stricter than `briefingFor().handled`, which counts a succeeded execution
 * alone (recorded as TODAY-FD-003): this narrows the foundation's answer and never widens it.
 *
 * Executions and outcomes are server-written and only pulled; nothing here writes them, and
 * there is no execution engine in this build.
 */

export interface ExecutionResult {
  handled: HandledRow[];
  waiting: WaitingRow[];
  /** A failed attempt made today. It needs her, so it is offered to the attention block. */
  failed: AttentionRow[];
}

const sameDay = (instant: string, today: LocalDate, tz: string) => logicalDateAt(epochMsOf(instant), tz) === today;

export function executionView(state: AppState, nowMs: number, today: LocalDate, briefing: Pick<Briefing, 'handled'>): ExecutionResult {
  const tz = state.user.timezone;
  const handled: HandledRow[] = [];
  const waiting: WaitingRow[] = [];
  const failed: AttentionRow[] = [];

  const undone = new Set(state.executions.flatMap((e) => (e.compensatesExecutionId !== null && e.result === 'succeeded' ? [e.compensatesExecutionId] : [])));
  const intentById = new Map(state.intents.map((i) => [i.id, i] as const));

  // ---- handled: the briefing's succeeded executions (since the start of the logical day), NARROWED to those
  // that also have a success outcome observed today. Never widened.
  for (const execution of briefing.handled) {
    if (execution.compensatesExecutionId !== null || undone.has(execution.id)) continue;
    const outcomes = state.outcomes.filter((o) => o.executionId === execution.id).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const latest = outcomes[outcomes.length - 1];
    if (!latest || !OUTCOME_IS_SUCCESS[latest.kind] || !sameDay(latest.observedAt, today, tz)) continue;
    const intent = intentById.get(execution.intentId);
    if (!intent) continue;
    const aboutTitle = intent.about ? describeRef(state, intent.about).title : null;
    handled.push({
      key: `handled:${execution.id}`,
      executionId: execution.id,
      outcome: latest.kind,
      category: intent.category,
      statement: `${ACTION_NOUN[intent.category]}${aboutTitle ? ` about “${aboutTitle}”` : ''}`,
      aboutTitle,
    });
  }

  // ---- waiting / failed: read the derived lifecycle of every intent that has moved past "proposed"
  for (const intent of state.intents) {
    if (intent.expiresAt !== null && Date.parse(intent.expiresAt) <= nowMs) continue;
    const lifecycle = intentLifecycle(state, intent.id);
    if (!lifecycle || lifecycle.stage === 'proposed' || lifecycle.stage === 'declined' || lifecycle.stage === 'withdrawn') continue;

    const last = lifecycle.executions[lifecycle.executions.length - 1];
    const aboutTitle = intent.about ? describeRef(state, intent.about).title : null;
    const verb = ACTION_VERB[intent.category];
    const about = aboutTitle ? ` for “${aboutTitle}”` : '';
    const attemptedToday = last !== undefined && sameDay(last.attemptedAt, today, tz);

    if (lifecycle.stage === 'approved') {
      waiting.push({ key: `approved:${intent.id}`, kind: 'approved_not_run', title: aboutTitle, statement: `You approved this: ${verb}${about}. It hasn’t run yet.`, responsibilityState: null, changedToday: null });
    } else if (lifecycle.stage === 'attempted' && attemptedToday) {
      waiting.push({ key: `attempted:${intent.id}`, kind: 'attempted', title: aboutTitle, statement: `Her Keys tried to ${verb}${about}, but the result isn’t clear.`, responsibilityState: null, changedToday: null });
    } else if (lifecycle.stage === 'succeeded' && attemptedToday && lifecycle.outcomes.length === 0) {
      waiting.push({ key: `unconfirmed:${intent.id}`, kind: 'unconfirmed', title: aboutTitle, statement: `Her Keys tried to ${verb}${about}. It went through, but nothing has confirmed it yet.`, responsibilityState: null, changedToday: null });
    } else if (lifecycle.stage === 'failed' && attemptedToday) {
      failed.push(failedRow(state, intent));
    }
  }

  return { handled, waiting, failed };
}

function failedRow(state: AppState, intent: ActionIntent): AttentionRow {
  const about = intent.about ? describeRef(state, intent.about) : null;
  const title = about?.title ?? null;
  return {
    key: `failed:${intent.id}`,
    reason: 'action_failed',
    urgency: 'today',
    ref: intent.about,
    title,
    statement: `Her Keys tried to ${ACTION_VERB[intent.category]}${title ? ` for “${title}”` : ''}, but it didn’t work.`,
    needsMe: true,
    responsibility: null,
    approval: null,
    changedToday: null,
    source: about?.source ?? null,
    actions: about?.route ? [{ kind: 'open', label: 'Open', route: about.route }] : [],
  };
}
