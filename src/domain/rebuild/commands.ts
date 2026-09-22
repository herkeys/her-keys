import type { TransitionContext } from '../context';
import { provenanceFor, userProvenance } from '../foundation/provenance';
import { refExists } from '../foundation/typedRef';
import { toInstant } from '../logicalDay';
import { FIELD_LIMITS, type AppState } from '../state';
import { addTask } from '../tasks';
import {
  REBUILD_FOCUS_NOTE_MAX,
  REBUILD_FOCUS_TITLE_MAX,
  type FocusRelation,
  type FocusTarget,
  type RebuildFocus,
  type RebuildFocusLink,
  type RebuildFocusState,
} from './schema';

/**
 * The RebuildFocus commands. Pure transitions, like every other canonical command: (state, ctx, input) -> state.
 *
 * What these commands never do, by construction:
 *   - create a Task, Goal, System or Event as a side effect of creating, renaming, pausing, resuming or archiving a Focus;
 *   - change a linked Task/Goal/System/Event when a Focus changes state (pausing is not cancelling, archiving is not completing);
 *   - change a Focus when a linked item changes (completing a Task is not completing a Focus);
 *   - read, copy or echo the note anywhere but the Focus itself.
 * `addNextStep` is the ONE place a Task is created, and only because she wrote it and saved it.
 */

/** Text as she meant it: trimmed; blank means "none". */
export const cleanText = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
};

export type FocusInputProblem = 'title_missing' | 'title_too_long' | 'note_too_long';

/** Why a title/note cannot be saved, or null when it can. The form asks this before it offers Save. */
export function focusInputProblem(input: { title: string; note?: string | null }): FocusInputProblem | null {
  const title = cleanText(input.title);
  if (title === null) return 'title_missing';
  if (title.length > REBUILD_FOCUS_TITLE_MAX) return 'title_too_long';
  const note = cleanText(input.note);
  if (note !== null && note.length > REBUILD_FOCUS_NOTE_MAX) return 'note_too_long';
  return null;
}

const focusOf = (state: AppState, focusId: string): RebuildFocus | undefined => state.rebuildFocuses.find((focus) => focus.id === focusId);

const replaceFocus = (state: AppState, next: RebuildFocus): AppState => ({
  ...state,
  rebuildFocuses: state.rebuildFocuses.map((focus) => (focus.id === next.id ? next : focus)),
});

/** A new Focus: active, title only unless she adds a note. Nothing else is created. */
export function addRebuildFocus(state: AppState, ctx: TransitionContext, input: { id?: string; title: string; note?: string | null }): AppState {
  if (focusInputProblem(input) !== null) return state;
  const id = input.id ?? ctx.createId('focus');
  // A double tap that replays the same save is the same Focus, not a second one.
  if (focusOf(state, id) !== undefined) return state;
  const now = toInstant(ctx.nowMs);
  const focus: RebuildFocus = {
    id,
    title: cleanText(input.title)!,
    note: cleanText(input.note),
    state: 'active',
    createdAt: now,
    updatedAt: now,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
  return { ...state, rebuildFocuses: [...state.rebuildFocuses, focus] };
}

/** A rename is display only: same id, same links, same everything else. */
export function renameRebuildFocus(state: AppState, ctx: TransitionContext, focusId: string, title: string): AppState {
  const current = focusOf(state, focusId);
  const cleaned = cleanText(title);
  if (!current || cleaned === null || cleaned.length > REBUILD_FOCUS_TITLE_MAX || cleaned === current.title) return state;
  return replaceFocus(state, { ...current, title: cleaned, updatedAt: toInstant(ctx.nowMs) });
}

/** Set, change or clear the optional note. */
export function setRebuildFocusNote(state: AppState, ctx: TransitionContext, focusId: string, note: string | null): AppState {
  const current = focusOf(state, focusId);
  const cleaned = cleanText(note);
  if (!current || (cleaned !== null && cleaned.length > REBUILD_FOCUS_NOTE_MAX) || cleaned === current.note) return state;
  return replaceFocus(state, { ...current, note: cleaned, updatedAt: toInstant(ctx.nowMs) });
}

/**
 * Pause, resume or archive. ONLY the Focus changes: every linked Task, Goal, System and Event keeps its own truth, and every link
 * stays as it was (an archived Focus keeps its history).
 */
export function setRebuildFocusState(state: AppState, ctx: TransitionContext, focusId: string, next: RebuildFocusState): AppState {
  const current = focusOf(state, focusId);
  if (!current || current.state === next) return state;
  return replaceFocus(state, { ...current, state: next, updatedAt: toInstant(ctx.nowMs) });
}

export const pauseRebuildFocus = (state: AppState, ctx: TransitionContext, focusId: string) => setRebuildFocusState(state, ctx, focusId, 'paused');
export const resumeRebuildFocus = (state: AppState, ctx: TransitionContext, focusId: string) => setRebuildFocusState(state, ctx, focusId, 'active');
export const archiveRebuildFocus = (state: AppState, ctx: TransitionContext, focusId: string) => setRebuildFocusState(state, ctx, focusId, 'archived');

const sameTarget = (a: FocusTarget, b: FocusTarget) => a.kind === b.kind && a.id === b.id;

const liveLinkTo = (state: AppState, focusId: string, target: FocusTarget): RebuildFocusLink | undefined =>
  state.rebuildFocusLinks.find((link) => link.focusId === focusId && link.status === 'active' && sameTarget(link.target, target));

/**
 * Connect an EXISTING canonical item to a Focus. The item is not touched. A next action must be a Task; anything may be `supports`.
 * Connecting the same item twice is one connection.
 */
export function linkToFocus(
  state: AppState,
  ctx: TransitionContext,
  input: { id?: string; focusId: string; target: FocusTarget; relation: FocusRelation }
): AppState {
  const focus = focusOf(state, input.focusId);
  if (!focus || focus.state === 'archived') return state;
  if (input.relation === 'next_action' && input.target.kind !== 'task') return state;
  if (!refExists(state, input.target)) return state;
  if (liveLinkTo(state, input.focusId, input.target) !== undefined) return state;
  const id = input.id ?? ctx.createId('focuslink');
  if (state.rebuildFocusLinks.some((link) => link.id === id)) return state;
  const now = toInstant(ctx.nowMs);
  const link: RebuildFocusLink = {
    id,
    focusId: input.focusId,
    target: { kind: input.target.kind, id: input.target.id },
    relation: input.relation,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
  return { ...state, rebuildFocusLinks: [...state.rebuildFocusLinks, link] };
}

/** Disconnect: the link is kept as `removed`; the item and the Focus are untouched. */
export function unlinkFromFocus(state: AppState, ctx: TransitionContext, linkId: string): AppState {
  const current = state.rebuildFocusLinks.find((link) => link.id === linkId);
  if (!current || current.status === 'removed') return state;
  return {
    ...state,
    rebuildFocusLinks: state.rebuildFocusLinks.map((link) =>
      link.id === linkId ? { ...link, status: 'removed' as const, updatedAt: toInstant(ctx.nowMs) } : link
    ),
  };
}

export interface NextStepInput {
  focusId: string;
  /** What she wrote. Her Keys never writes it for her. */
  title: string;
  /** Where the household files it. Required by the canonical Task. */
  categoryId: string;
  taskId?: string;
  linkId?: string;
}

/**
 * SAVING a next step she wrote: ONE canonical Task (owner-private, `scope` 'personal', so it is as private as the Focus it came from)
 * plus ONE next-action link. Opening the form is not saving it — no command runs until she saves.
 */
export function addNextStep(state: AppState, ctx: TransitionContext, input: NextStepInput): AppState {
  const focus = focusOf(state, input.focusId);
  const title = cleanText(input.title);
  if (!focus || focus.state === 'archived' || title === null || title.length > FIELD_LIMITS.titleLength) return state;
  if (!state.categories.some((category) => category.id === input.categoryId && category.status === 'active')) return state;
  const taskId = input.taskId ?? ctx.createId('task');
  if (state.tasks.some((task) => task.id === taskId)) return state;
  const withTask = addTask(state, { ...ctx, createId: () => taskId }, { title, categoryId: input.categoryId, scope: 'personal' });
  return linkToFocus(withTask, ctx, { id: input.linkId, focusId: focus.id, target: { kind: 'task', id: taskId }, relation: 'next_action' });
}
