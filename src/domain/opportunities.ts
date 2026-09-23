import type { TransitionContext } from './context';
import { addEvent, type AddEventInput } from './events';
import {
  OPPORTUNITY_CLOSED_REASONS,
  type CareerOpportunity,
  type OpportunityClosedReason,
  type OpportunityStage,
  type OpportunityType,
} from './foundation/opportunity';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { refExists, type TypedRef } from './foundation/typedRef';
import { toInstant } from './logicalDay';
import { addDependency, stepsOf } from './structure';
import { addTask, type AddTaskInput } from './tasks';
import type { AppState, CalendarEvent, Task, VisibilityScope } from './state';

/**
 * CAREER OPPORTUNITY — commands (F10 Work/Career OS).
 *
 * The Opportunity itself is never actionable truth. `addOpportunityNextAction` and
 * `scheduleOpportunityInterview` are the ONLY way F10 attaches an action to one, and both do it
 * by creating an ordinary canonical Task or Event and linking it with the existing `Dependency`
 * primitive (`relation: 'part_of'`) — the same mechanism a Goal's steps use. Nothing here adds a
 * field to Task, Event or Goal, and nothing here creates a second task or event shape.
 *
 * Stage changes ONLY through `setOpportunityStage`, ONLY by explicit call — never inferred from
 * an Event's time passing, a linked Task's completion, or how long it has sat unanswered.
 */

export interface AddOpportunityInput {
  title: string;
  organizationName?: string | null;
  opportunityType: OpportunityType;
  sourceNote?: string | null;
  applicationDeadline?: string | null;
  followUpDate?: string | null;
  contactName?: string | null;
  compensationNote?: string | null;
  notes?: string | null;
  provenance?: Provenance;
}

/** Always `exploring`: the smallest truthful default. She corrects the stage explicitly afterward if it starts further along. */
export function addOpportunity(state: AppState, ctx: TransitionContext, input: AddOpportunityInput): AppState {
  const now = toInstant(ctx.nowMs);
  const opportunity: CareerOpportunity = {
    id: ctx.createId('opp'),
    title: input.title,
    organizationName: input.organizationName ?? null,
    opportunityType: input.opportunityType,
    stage: 'exploring',
    closedReason: null,
    sourceNote: input.sourceNote ?? null,
    applicationDeadline: input.applicationDeadline ?? null,
    followUpDate: input.followUpDate ?? null,
    contactName: input.contactName ?? null,
    compensationNote: input.compensationNote ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    archivedAt: null,
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
    scope: 'personal',
  };
  return { ...state, careerOpportunities: [...state.careerOpportunities, opportunity] };
}

const EDITABLE_OPPORTUNITY_FIELDS = [
  'title',
  'organizationName',
  'opportunityType',
  'sourceNote',
  'applicationDeadline',
  'followUpDate',
  'contactName',
  'compensationNote',
  'notes',
] as const;

export type UpdateOpportunityInput = Partial<Pick<CareerOpportunity, (typeof EDITABLE_OPPORTUNITY_FIELDS)[number]>>;

/** Plain-field edits only. Stage and its reason change ONLY through `setOpportunityStage`; archiving changes ONLY through `archiveOpportunity`. */
export function updateOpportunity(state: AppState, ctx: TransitionContext, id: string, patch: UpdateOpportunityInput): AppState {
  const current = state.careerOpportunities.find((o) => o.id === id);
  if (!current) return state;
  const edits: UpdateOpportunityInput = {};
  for (const field of EDITABLE_OPPORTUNITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== undefined) (edits as Record<string, unknown>)[field] = patch[field];
  }
  const updated = { ...current, ...edits, updatedAt: toInstant(ctx.nowMs) };
  return { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? updated : o)) };
}

export type StageChangeRefusal = 'not_found' | 'missing_closed_reason' | 'unexpected_closed_reason';

/**
 * The ONLY way `stage` changes. `closedReason` is required exactly when moving TO `closed`
 * (no response is never upgraded to a rejection she never gave) and is cleared the moment the
 * stage is corrected away from `closed`. No stage is skipped or blocked: she may move forward,
 * sideways or backward, because the stored stage is her current recorded understanding, not a
 * pipeline she must complete in order.
 */
export function setOpportunityStage(
  state: AppState,
  ctx: TransitionContext,
  id: string,
  stage: OpportunityStage,
  closedReason: OpportunityClosedReason | null = null
): { state: AppState; refusal: StageChangeRefusal | null } {
  const current = state.careerOpportunities.find((o) => o.id === id);
  if (!current) return { state, refusal: 'not_found' };
  if (stage === 'closed' && (closedReason === null || !OPPORTUNITY_CLOSED_REASONS.includes(closedReason))) {
    return { state, refusal: 'missing_closed_reason' };
  }
  if (stage !== 'closed' && closedReason !== null) return { state, refusal: 'unexpected_closed_reason' };

  const at = toInstant(ctx.nowMs);
  const updated: CareerOpportunity = {
    ...current,
    stage,
    closedReason: stage === 'closed' ? closedReason : null,
    stageChangedAt: current.stage === stage ? current.stageChangedAt : at,
    updatedAt: at,
  };
  return { state: { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? updated : o)) }, refusal: null };
}

/**
 * Visibility/retention, independent of `stage` (ADDENDUM J): archiving never rewrites the
 * recorded outcome, and closing never archives. Linked Tasks and Events are untouched either way
 * (ADDENDUM K) — the caller decides what, if anything, to do about them.
 */
export function archiveOpportunity(state: AppState, ctx: TransitionContext, id: string): AppState {
  const current = state.careerOpportunities.find((o) => o.id === id);
  if (!current || current.archivedAt !== null) return state;
  const at = toInstant(ctx.nowMs);
  return { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? { ...o, archivedAt: at, updatedAt: at } : o)) };
}

export function restoreOpportunity(state: AppState, ctx: TransitionContext, id: string): AppState {
  const current = state.careerOpportunities.find((o) => o.id === id);
  if (!current || current.archivedAt === null) return state;
  const at = toInstant(ctx.nowMs);
  return { ...state, careerOpportunities: state.careerOpportunities.map((o) => (o.id === id ? { ...o, archivedAt: null, updatedAt: at } : o)) };
}

const opportunityRef = (id: string): TypedRef<'opportunity'> => ({ kind: 'opportunity', id });

/**
 * The canonical next action is a canonical Task. This creates it and links it in one step, so the
 * Opportunity itself never grows a `nextActionText` field. `scope` defaults to `professional` (the
 * canonical owner-private scope Opportunities already use) so a Task created here cannot leak a
 * private Opportunity's context through a household-visible row (ADDENDUM M); pass `scope` to
 * override only when the caller has a specific reason to.
 */
export function addOpportunityNextAction(
  state: AppState,
  ctx: TransitionContext,
  opportunityId: string,
  input: Omit<AddTaskInput, 'scope'> & { scope?: VisibilityScope }
): { state: AppState; task: Task | null } {
  if (!refExists(state, opportunityRef(opportunityId))) return { state, task: null };
  const afterTask = addTask(state, ctx, { ...input, scope: input.scope ?? 'professional' });
  const task = afterTask.tasks[afterTask.tasks.length - 1];
  const { state: linked } = addDependency(afterTask, ctx, {
    relation: 'part_of',
    from: { kind: 'task', id: task.id },
    to: opportunityRef(opportunityId),
  });
  return { state: linked, task };
}

/**
 * An interview is a canonical Event, never an Opportunity sub-record. Same shape as
 * `addOpportunityNextAction`: create, then link with `relation: 'part_of'`.
 */
export function scheduleOpportunityInterview(
  state: AppState,
  ctx: TransitionContext,
  opportunityId: string,
  input: Omit<AddEventInput, 'scope'> & { scope?: VisibilityScope }
): { state: AppState; event: CalendarEvent | null } {
  if (!refExists(state, opportunityRef(opportunityId))) return { state, event: null };
  const afterEvent = addEvent(state, ctx, { ...input, scope: input.scope ?? 'professional' });
  const event = afterEvent.events[afterEvent.events.length - 1];
  const { state: linked } = addDependency(afterEvent, ctx, {
    relation: 'part_of',
    from: { kind: 'event', id: event.id },
    to: opportunityRef(opportunityId),
  });
  return { state: linked, event };
}

/** Every canonical Task linked as a step of this opportunity, open or not — read straight from `Dependency`, never a second store. */
export function linkedTasksOf(state: AppState, opportunityId: string): Task[] {
  return stepsOf(state, opportunityRef(opportunityId))
    .filter((ref) => ref.kind === 'task')
    .map((ref) => state.tasks.find((t) => t.id === ref.id))
    .filter((t): t is Task => t !== undefined);
}

/** Every canonical Event linked as this opportunity's interview(s), soonest first. */
export function linkedInterviewsOf(state: AppState, opportunityId: string): CalendarEvent[] {
  return stepsOf(state, opportunityRef(opportunityId))
    .filter((ref) => ref.kind === 'event')
    .map((ref) => state.events.find((e) => e.id === ref.id))
    .filter((e): e is CalendarEvent => e !== undefined)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Career Momentum fact #1 (ADDENDUM N): whether an active opportunity has an open next-action
 * Task. Deterministic — zero open linked Tasks means no, whatever the opportunity's stage says.
 */
export function hasOpenNextAction(state: AppState, opportunityId: string): boolean {
  return linkedTasksOf(state, opportunityId).some((t) => t.status === 'open');
}

/** "2 linked next steps are still open" (ADDENDUM K) — the count a closed/archived opportunity's detail view surfaces, never auto-resolves. */
export function openLinkedTaskCount(state: AppState, opportunityId: string): number {
  return linkedTasksOf(state, opportunityId).filter((t) => t.status === 'open').length;
}
