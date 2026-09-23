import { commitmentFacetsOf } from '../../../domain/foundation/commitment';
import { consequenceRank } from '../../../domain/foundation/authorization';
import type { Responsibility } from '../../../domain/foundation/responsibility';
import { refKey, type TypedRef } from '../../../domain/foundation/typedRef';
import { daysBetween, epochMsOf, logicalDateAt, type LocalDate } from '../../../domain/logicalDay';
import type { DayView } from '../../../domain/projectDay';
import type { AttentionItem, AttentionUrgency } from '../../../domain/reasoning/attention';
import type { Briefing } from '../../../domain/reasoning/briefing';
import { needsMePersonally } from '../../../domain/responsibility';
import type { AppState } from '../../../domain/state';
import { isDone } from '../../../domain/structure';
import { relativeDay } from '../formatDay';
import { ACTION_VERB } from './phrases';
import { capitalize, describeRef, holderName, timeLabelAt } from './refs';
import type { AttentionRow, OnYourMind, TodayAction, WaitingRow } from './types';

/**
 * WHAT ACTUALLY NEEDS HER — versus what merely exists.
 *
 * The source of truth for "does this deserve her attention" is `attentionFor` (B4-FE01-019):
 * one derivation every module shares, so Today cannot invent its own trigger. This adds the
 * one thing that derivation does not say — WHO holds a delegated thing and where the handoff
 * stands — from the responsibility lifecycle (B4-FE01-014), and answers "does this still need
 * HER?" with `needsMePersonally`, the tri-state the foundation defines. `null` stays "not
 * known": it is never turned into a yes or a no.
 *
 * Delegated is not covered. A request, an acknowledgement and an acceptance are three
 * different facts, and none of them is "done". Nothing here says covered, handled or taken
 * care of about a delegation, and an unanswered request past its deadline stays visible.
 *
 * Conflict and capacity attention are shown through the Daily Load decision block, not twice.
 * `soon`-urgency items are not first-level: they are context for later, not for now.
 */

export interface AttentionResult {
  /** Every row that needs her now or today, most urgent first. Bounding is the caller's job. */
  rows: AttentionRow[];
  /** Delegated things that are with someone else and do not need her personally. */
  waiting: WaitingRow[];
  onYourMind: OnYourMind | null;
}

const URGENCY_RANK: Record<AttentionUrgency, number> = { now: 0, today: 1, soon: 2 };

export function attentionView(
  state: AppState,
  nowMs: number,
  today: LocalDate,
  day: DayView,
  attention: AttentionItem[],
  briefing: Pick<Briefing, 'delegated' | 'unacknowledged'>
): AttentionResult {
  const tz = state.user.timezone;
  // The briefing's own answers for "who holds a thing" and "which requests went unanswered".
  const unanswered = new Set(briefing.unacknowledged.map((r) => r.id));
  const inFlight = new Set(briefing.delegated.map((r) => r.id));
  const rows: AttentionRow[] = [];
  const shown = new Set<string>();
  const add = (row: AttentionRow) => {
    if (shown.has(row.key)) return;
    shown.add(row.key);
    rows.push(row);
  };

  for (const item of attention) {
    if (item.reason === 'conflict' || item.reason === 'capacity_overload') continue;
    if (item.urgency === 'soon' || item.about === null) continue;
    const row = rowFor(state, item, item.about, nowMs, today, tz);
    if (row) add(row);
  }

  // ---- the handoff itself, for things on today's radar
  const waiting: WaitingRow[] = [];
  const latest = new Map<string, Responsibility>();
  for (const r of [...state.responsibilities].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) latest.set(refKey(r.about), r);

  for (const r of latest.values()) {
    // Live and delegated (the briefing's `delegated`), or handed back to her (declined / returned).
    if (!inFlight.has(r.id) && r.state !== 'declined' && r.state !== 'returned') continue;
    if (isDone(state, r.about)) continue;
    if (unanswered.has(r.id)) continue; // already a row, from attentionFor
    if (!onRadar(state, day, r.about)) continue;

    const info = describeRef(state, r.about);
    const title = info.title ?? 'this';
    const holder = holderName(state, r) ?? 'Someone';
    const changedToday = changeLabel(state, r.id, today, tz);
    const common = { needsMe: needsMePersonally(state, r.about, nowMs), source: info.source, changedToday };
    const open: TodayAction[] = info.route ? [{ kind: 'open', label: 'Open', route: info.route }] : [];
    const takeBack: TodayAction = { kind: 'take_back', label: 'Take it back', responsibilityId: r.id };
    const responsibility = { id: r.id, state: r.state, holderKind: r.responsibleKind, holder: holderName(state, r) };

    if (r.state === 'declined') {
      add({ key: `resp:${r.id}`, reason: 'declined', urgency: 'today', ref: r.about, title: info.title, statement: `${holder} said no to “${title}”. It’s yours again.`, responsibility, approval: null, ...common, needsMe: true, actions: open });
    } else if (r.state === 'returned') {
      add({ key: `resp:${r.id}`, reason: 'returned', urgency: 'today', ref: r.about, title: info.title, statement: `“${title}” is back with you.`, responsibility, approval: null, ...common, needsMe: true, actions: open });
    } else if (common.needsMe === true) {
      const statement =
        r.state === 'requested'
          ? `You asked ${holder} to take “${title}”. No answer yet.`
          : r.state === 'acknowledged'
            ? `${holder} has seen “${title}” but hasn’t said yes yet.`
            : `${holder} agreed to take “${title}”. You marked it as still needing you.`;
      add({ key: `resp:${r.id}`, reason: 'delegated_needs_you', urgency: 'today', ref: r.about, title: info.title, statement, responsibility, approval: null, ...common, actions: r.state === 'accepted' ? open : [takeBack, ...open] });
    } else {
      const statement =
        r.state === 'accepted'
          ? `${holder} agreed to take “${title}”.`
          : r.state === 'acknowledged'
            ? `“${title}” is with ${holder}, who has seen it but hasn’t said yes.`
            : `“${title}” is with ${holder}, who hasn’t answered yet.`;
      waiting.push({ key: `resp:${r.id}`, kind: 'delegated', title: info.title, statement, responsibilityState: r.state, changedToday });
    }
  }

  // One thing is never said twice: a delegated task's own deadline row folds into the handoff row that names it.
  const handoffRefs = new Set(rows.flatMap((r) => (r.key.startsWith('resp:') && r.ref ? [refKey(r.ref)] : [])));
  const folded = new Map<string, string>();
  const unique = rows.filter((r) => {
    if (!r.key.startsWith('task:') || !r.ref || !handoffRefs.has(refKey(r.ref))) return true;
    const due = state.tasks.find((t) => t.id === r.ref!.id)?.dueDate ?? null;
    if (due !== null) folded.set(refKey(r.ref), dueSentence(due, today));
    return false;
  });
  const merged = unique.map((r) => (r.key.startsWith('resp:') && r.ref && folded.has(refKey(r.ref)) ? { ...r, statement: `${r.statement} ${folded.get(refKey(r.ref))}` } : r));
  merged.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);

  const openMine = state.needsMe.filter((n) => n.status === 'open' && !shown.has(`needsMe:${n.id}`));
  const oldest = [...openMine].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
  const onYourMind = oldest ? { count: openMine.length, oldestTitle: oldest.title } : null;

  return { rows: merged, waiting, onYourMind };
}

function dueSentence(dueDate: LocalDate, today: LocalDate): string {
  if (dueDate === today) return 'It’s due today.';
  if (dueDate > today) return `It’s due ${relativeDay(dueDate, today)}.`;
  const days = daysBetween(dueDate, today);
  return `It’s ${days} day${days === 1 ? '' : 's'} overdue.`;
}

/** Whether the thing is part of today: on today's projection, or an open captured item. */
function onRadar(state: AppState, day: DayView, ref: TypedRef): boolean {
  if (ref.kind === 'task') {
    if (day.tasks.some((t) => t.id === ref.id)) return true;
    const row = state.tasks.find((t) => t.id === ref.id);
    if (!row || row.status !== 'open') return false;
    // A high-consequence open task matters today whether or not it is planned for today.
    const consequence = commitmentFacetsOf({ kind: 'task', row }).consequence;
    return consequence !== null && consequenceRank(consequence) >= consequenceRank('high');
  }
  if (ref.kind === 'event') return day.events.some((e) => e.id === ref.id);
  if (ref.kind === 'needsMe') return state.needsMe.some((n) => n.id === ref.id && n.status === 'open');
  return false;
}

/** "Accepted today at 2:10 PM." — only from a dated behavior observation, never from a stored "last looked" marker. */
function changeLabel(state: AppState, responsibilityId: string, today: LocalDate, tz: string): string | null {
  const changes = state.observations
    .filter((o) => o.about.kind === 'responsibility' && o.about.id === responsibilityId && o.logicalDate === today)
    .filter((o) => o.outcome === 'acknowledged' || o.outcome === 'accepted' || o.outcome === 'declined' || o.outcome === 'returned')
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const last = changes[changes.length - 1];
  return last ? `${capitalize(last.outcome)} today at ${timeLabelAt(last.occurredAt, tz)}.` : null;
}

function dueClause(dueDate: LocalDate, today: LocalDate): string {
  if (dueDate === today) return 'is due today';
  const days = daysBetween(dueDate, today);
  return `is ${days} day${days === 1 ? '' : 's'} overdue`;
}

function rowFor(state: AppState, item: AttentionItem, about: TypedRef, nowMs: number, today: LocalDate, tz: string): AttentionRow | null {
  const info = describeRef(state, about);
  const title = info.title;
  const common = { urgency: item.urgency, ref: about, title, source: info.source, changedToday: null as string | null, responsibility: null, approval: null };
  const open: TodayAction[] = info.route ? [{ kind: 'open', label: 'Open', route: info.route }] : [];

  switch (item.reason) {
    case 'deadline':
    case 'risk': {
      const task = state.tasks.find((t) => t.id === about.id);
      if (!task || task.status !== 'open' || task.dueDate === null) return null;
      // A past-due AUTOPAY bill may well have been paid by the autopay; Her Keys has no record either way, so Today never calls it
      // "overdue" — Money's "confirm cleared" (HK13-D40).
      const autopayPastDue = task.paymentMechanism === 'autopay' && task.value?.direction === 'outflow' && task.dueDate < today;
      const clause = autopayPastDue
        ? `was due ${relativeDay(task.dueDate, today)} on autopay — Her Keys has no record showing whether it cleared`
        : dueClause(task.dueDate, today);
      const cost = item.reason === 'risk' && task.consequence !== null ? ` If it slips, the cost is ${task.consequence}.` : '';
      return { key: `task:${task.id}`, reason: item.reason, ...common, statement: `“${task.title}” ${clause}.${cost}`, needsMe: needsMePersonally(state, about, nowMs), actions: open };
    }
    case 'needs_me': {
      const row = state.needsMe.find((n) => n.id === about.id);
      if (!row || row.status !== 'open' || row.dueDate === null) return null;
      const clause = row.dueDate === today ? 'is on your list and due today' : `was due ${relativeDay(row.dueDate, today)}`;
      return { key: `needsMe:${row.id}`, reason: 'needs_me', ...common, statement: `“${row.title}” ${clause}.`, needsMe: true, actions: open };
    }
    case 'unacknowledged_delegation': {
      const r = state.responsibilities.find((x) => x.id === about.id);
      if (!r) return null;
      const target = describeRef(state, r.about);
      const holder = holderName(state, r) ?? 'Someone';
      const due = r.ackDueAt !== null ? ` An answer was due by ${whenLabel(r.ackDueAt, today, tz)}.` : '';
      return {
        key: `resp:${r.id}`,
        reason: 'unacknowledged_delegation',
        urgency: item.urgency,
        ref: r.about,
        title: target.title,
        statement: `${holder} hasn’t answered your request about “${target.title ?? 'this'}”.${due}`,
        needsMe: true,
        responsibility: { id: r.id, state: r.state, holderKind: r.responsibleKind, holder: holderName(state, r) },
        approval: null,
        changedToday: null,
        source: target.source,
        actions: [{ kind: 'take_back', label: 'Take it back', responsibilityId: r.id }, ...(target.route ? [{ kind: 'open' as const, label: 'Open', route: target.route }] : [])],
      };
    }
    case 'approval_required': {
      const intent = state.intents.find((i) => i.id === about.id);
      if (!intent) return null;
      const target = intent.about ? describeRef(state, intent.about) : null;
      const phrase = ACTION_VERB[intent.category];
      const forWhat = target?.title ? ` for “${target.title}”` : '';
      const summary = `Her Keys would like to ${phrase}${forWhat}.`;
      return {
        key: `intent:${intent.id}`,
        reason: 'approval_required',
        urgency: item.urgency,
        ref: intent.about,
        title: target?.title ?? null,
        statement: `${summary} It needs your yes.`,
        needsMe: true,
        responsibility: null,
        approval: { intentId: intent.id, phrase, summary, consequence: intent.consequence, reversibility: intent.reversibility },
        changedToday: null,
        source: null,
        actions: [{ kind: 'review_approval', label: 'Review', intentId: intent.id }],
      };
    }
    case 'external_source_changed': {
      if (title === null) return null;
      return { key: `xsrc:${about.kind}:${about.id}`, reason: 'external_source_changed', ...common, statement: `“${title}” may be out of date — the outside source it came from has changed.`, needsMe: null, actions: open };
    }
    case 'opportunity_follow_up': {
      const row = state.careerOpportunities.find((o) => o.id === about.id);
      if (!row) return null;
      const dates = [row.followUpDate, row.applicationDeadline].filter((d): d is typeof row.followUpDate & string => d !== null);
      const earliest = dates.sort()[0];
      const label = earliest === row.applicationDeadline ? 'application deadline' : 'follow-up';
      const clause = earliest === today ? `is today` : earliest !== undefined && earliest < today ? `was ${relativeDay(earliest, today)}` : `is ${relativeDay(earliest ?? today, today)}`;
      const org = row.organizationName ? ` at ${row.organizationName}` : '';
      return { key: `opp:${row.id}`, reason: 'opportunity_follow_up', ...common, statement: `The ${label} for “${row.title}”${org} ${clause}.`, needsMe: true, actions: open };
    }
    default:
      return null;
  }
}

/** A time if it falls today, otherwise the day. Always in the household's own timezone. */
function whenLabel(instant: string, today: LocalDate, tz: string): string {
  const date = logicalDateAt(epochMsOf(instant), tz);
  return date === today ? timeLabelAt(instant, tz) : `${relativeDay(date, today)} at ${timeLabelAt(instant, tz)}`;
}
