import { categoryWithRole } from '../categories';
import type { AppState } from '../state';
import { attentionFor, type AttentionItem } from './attention';

/**
 * WORK/CAREER VERDICT — F10, ADDENDUM Z.
 *
 * A projection over the existing, shared `attentionFor` derivation — never a second attention
 * engine. "Work-relevant" is exactly: an opportunity attention item, or a deadline/risk item whose
 * task or event carries the household's `work` category. Capacity and conflict reasons are left to
 * Calendar/Capacity's own surfaces (ADDENDUM Q): only day-level capacity exists in this foundation,
 * so F10 makes no claim broader than what that primitive can actually prove.
 */

function isWorkRelevant(state: AppState, item: AttentionItem): boolean {
  if (item.about === null) return false;
  if (item.about.kind === 'opportunity') return true;
  const workCategoryId = categoryWithRole(state, 'work')?.id ?? null;
  if (workCategoryId === null) return false;
  if (item.about.kind === 'task') return state.tasks.find((t) => t.id === item.about!.id)?.categoryId === workCategoryId;
  if (item.about.kind === 'event') return state.events.find((e) => e.id === item.about!.id)?.categoryId === workCategoryId;
  return false;
}

/** Every work/career attention item, most urgent first — `attentionFor` already sorts this way. Bounding is the caller's job. */
export function workCareerAttention(state: AppState, nowMs: number): AttentionItem[] {
  return attentionFor(state, nowMs).filter((item) => isWorkRelevant(state, item));
}

function titleFor(state: AppState, item: AttentionItem): string | null {
  if (item.about === null) return null;
  if (item.about.kind === 'task') return state.tasks.find((t) => t.id === item.about!.id)?.title ?? null;
  if (item.about.kind === 'event') return state.events.find((e) => e.id === item.about!.id)?.title ?? null;
  if (item.about.kind === 'opportunity') return state.careerOpportunities.find((o) => o.id === item.about!.id)?.title ?? null;
  return null;
}

function sentenceFor(state: AppState, item: AttentionItem): string {
  const title = titleFor(state, item);
  const named = title ? `“${title}”` : 'One item';
  if (item.reason === 'opportunity_follow_up') return `${named} needs a follow-up.`;
  if (item.reason === 'risk') return `${named} needs attention — the cost is high if it slips.`;
  return `${named} is due.`;
}

/**
 * One concise, factual sentence (ADDENDUM Z composition order):
 *   1. a single now/today item, stated plainly;
 *   2. more than one now/today item, as a bounded count;
 *   3. otherwise the nearest approaching (`soon`) item;
 *   4. otherwise "nothing needs attention."
 * Never a judgment, a score, or more than one conclusion at a time.
 */
export function workCareerVerdict(state: AppState, nowMs: number): string {
  const items = workCareerAttention(state, nowMs);
  const now = items.filter((item) => item.urgency !== 'soon');
  if (now.length === 1) return sentenceFor(state, now[0]);
  if (now.length > 1) return `${now.length} work items need attention today.`;
  const soon = items.find((item) => item.urgency === 'soon');
  if (soon) {
    const title = titleFor(state, soon);
    return title ? `“${title}” is coming up.` : 'Something at work is coming up.';
  }
  return 'Nothing at work needs attention right now.';
}
