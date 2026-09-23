import { categoryWithRole } from './categories';
import type { TransitionContext } from './context';
import {
  PEOPLE_LIMITS,
  charLength,
  labelProblem,
  normalizeLabel,
  normalizeNote,
  noteProblem,
  type PersonContext,
  type PersonTaskLink,
} from './foundation/personContext';
import { provenanceFor, userProvenance } from './foundation/provenance';
import type { HouseholdPerson } from './foundation/responsibility';
import { toInstant, type LocalDate, isLocalDate } from './logicalDay';
import { addPerson, archivePerson } from './responsibility';
import type { AppState } from './state';
import { addTask } from './tasks';

/**
 * PEOPLE OS — the commands (HK-FEATURE-13).
 *
 * Every command is a pure transition that returns a NAMED outcome; only `saved` changed anything. Identity is always an id: nothing
 * here compares a display name, an organization or a label to decide who somebody is, and nothing ever merges two people. Two people
 * called "Jennifer Smith" are two people.
 *
 * What each command does NOT do is as deliberate as what it does:
 *   - archiving a context never touches the person, a Task, a child or a co-parent record;
 *   - a Task being completed, archived or gone never touches a context;
 *   - the co-parent's identity is F07's: People can hold a private context about them, but never renames or archives them;
 *   - a child's identity is Kids': People never renames, archives or duplicates a child;
 *   - nothing here sends, calls, schedules, reminds or infers anything about anybody.
 */

export type PeopleOutcome =
  | 'saved'
  | 'unchanged'
  | 'already_saved'
  | 'not_found'
  | 'person_unavailable'
  | 'read_only_identity'
  | 'context_archived'
  | 'invalid_name'
  | 'invalid_label'
  | 'invalid_note'
  | 'invalid_title'
  | 'invalid_date'
  | 'invalid_draft'
  | 'no_category';

export interface PeopleResult {
  state: AppState;
  outcome: PeopleOutcome;
  /** The row created or edited (a context, a person or — for a follow-up — the Task), when there is one. */
  id: string | null;
}

const refuse = (state: AppState, outcome: PeopleOutcome): PeopleResult => ({ state, outcome, id: null });
const done = (state: AppState, outcome: PeopleOutcome, id: string | null): PeopleResult => ({ state, outcome, id });

/** Which canonical identity a context is about. A reference, by id — never a name. */
export type PersonTarget = { kind: 'child'; id: string } | { kind: 'person'; id: string };

const collections = (state: AppState) => ({
  personContexts: state.personContexts ?? [],
  personTaskLinks: state.personTaskLinks ?? [],
});

/** The context this user holds about a canonical person, whatever its state (at most one exists). */
export function contextFor(state: AppState, target: PersonTarget): PersonContext | null {
  const { personContexts } = collections(state);
  return personContexts.find((c) => (target.kind === 'child' ? c.childId === target.id : c.personId === target.id)) ?? null;
}

/** The co-parent's identity belongs to Co-Parent (F07): a person recorded as exactly that. */
export const isCoParent = (person: Pick<HouseholdPerson, 'relationship'>): boolean => person.relationship === 'co-parent';

/** Whether a target names a canonical person that exists and is active. The account holder is never a target. */
function targetStanding(state: AppState, target: PersonTarget): 'active' | 'inactive' | 'missing' {
  if (target.id === state.user.id) return 'missing';
  if (target.kind === 'child') return state.children.some((child) => child.id === target.id) ? 'active' : 'missing';
  const person = state.people.find((p) => p.id === target.id);
  if (!person) return 'missing';
  return person.status === 'active' ? 'active' : 'inactive';
}

// ------------------------------------------------------------------ input checks ---

type Checked<T> = { ok: true; value: T } | { ok: false; outcome: PeopleOutcome };

function checkName(raw: string): Checked<string> {
  const name = normalizeLabel(raw);
  if (name === null || labelProblem(name, PEOPLE_LIMITS.displayName) !== null) return { ok: false, outcome: 'invalid_name' };
  return { ok: true, value: name };
}

export interface ContextFields {
  relationshipName?: string | null;
  organizationName?: string | null;
  contextNote?: string | null;
}

/** Only the fields the caller NAMED, normalized; an emptied field becomes null ("cleared"). */
function checkFields(fields: ContextFields): Checked<Partial<Pick<PersonContext, 'relationshipName' | 'organizationName' | 'contextNote'>>> {
  const out: Partial<Pick<PersonContext, 'relationshipName' | 'organizationName' | 'contextNote'>> = {};
  if ('relationshipName' in fields && fields.relationshipName !== undefined) {
    const value = normalizeLabel(fields.relationshipName);
    if (labelProblem(value, PEOPLE_LIMITS.relationshipName) !== null) return { ok: false, outcome: 'invalid_label' };
    out.relationshipName = value;
  }
  if ('organizationName' in fields && fields.organizationName !== undefined) {
    const value = normalizeLabel(fields.organizationName);
    if (labelProblem(value, PEOPLE_LIMITS.organizationName) !== null) return { ok: false, outcome: 'invalid_label' };
    out.organizationName = value;
  }
  if ('contextNote' in fields && fields.contextNote !== undefined) {
    const value = normalizeNote(fields.contextNote);
    if (noteProblem(value) !== null) return { ok: false, outcome: 'invalid_note' };
    out.contextNote = value;
  }
  return { ok: true, value: out };
}

// ------------------------------------------------------------------ contexts ---

/**
 * Create the context for a canonical person, or open the one that already exists. One per person: an existing ACTIVE context is
 * returned untouched (`already_saved`), and an ARCHIVED one is restored rather than duplicated — archiving never frees a second slot.
 * Fields given are applied to the new context only; editing an existing one is `editPersonContext`.
 */
export function openPersonContext(state: AppState, ctx: TransitionContext, target: PersonTarget, fields: ContextFields = {}): PeopleResult {
  const existing = contextFor(state, target);
  if (existing) {
    if (existing.status === 'active') return done(state, 'already_saved', existing.id);
    return restorePersonContext(state, ctx, existing.id);
  }
  const standing = targetStanding(state, target);
  if (standing === 'missing') return refuse(state, 'not_found');
  if (standing === 'inactive') return refuse(state, 'person_unavailable');
  const checked = checkFields(fields);
  if (!checked.ok) return refuse(state, checked.outcome);

  const at = toInstant(ctx.nowMs);
  const context: PersonContext = {
    id: ctx.createId('pctx'),
    childId: target.kind === 'child' ? target.id : null,
    personId: target.kind === 'person' ? target.id : null,
    relationshipName: checked.value.relationshipName ?? null,
    organizationName: checked.value.organizationName ?? null,
    contextNote: checked.value.contextNote ?? null,
    status: 'active',
    createdAt: at,
    updatedAt: at,
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
  return done({ ...state, personContexts: [...collections(state).personContexts, context] }, 'saved', context.id);
}

/** Edit or clear the label, organization or note. Which person it is about never changes. */
export function editPersonContext(state: AppState, ctx: TransitionContext, contextId: string, fields: ContextFields): PeopleResult {
  const { personContexts } = collections(state);
  const current = personContexts.find((c) => c.id === contextId);
  if (!current) return refuse(state, 'not_found');
  const checked = checkFields(fields);
  if (!checked.ok) return refuse(state, checked.outcome);
  const next = { ...current, ...checked.value };
  if (next.relationshipName === current.relationshipName && next.organizationName === current.organizationName && next.contextNote === current.contextNote) {
    return done(state, 'unchanged', current.id);
  }
  const updated: PersonContext = { ...next, updatedAt: toInstant(ctx.nowMs) };
  return done({ ...state, personContexts: personContexts.map((c) => (c.id === contextId ? updated : c)) }, 'saved', contextId);
}

function setContextStatus(state: AppState, ctx: TransitionContext, contextId: string, status: PersonContext['status']): PeopleResult {
  const { personContexts } = collections(state);
  const current = personContexts.find((c) => c.id === contextId);
  if (!current) return refuse(state, 'not_found');
  if (current.status === status) return done(state, 'unchanged', contextId);
  const updated: PersonContext = { ...current, status, updatedAt: toInstant(ctx.nowMs) };
  return done({ ...state, personContexts: personContexts.map((c) => (c.id === contextId ? updated : c)) }, 'saved', contextId);
}

/** Off the active People surfaces. The person, their Tasks and every other subsystem's record are untouched. */
export const archivePersonContext = (state: AppState, ctx: TransitionContext, contextId: string): PeopleResult =>
  setContextStatus(state, ctx, contextId, 'archived');

export const restorePersonContext = (state: AppState, ctx: TransitionContext, contextId: string): PeopleResult =>
  setContextStatus(state, ctx, contextId, 'active');

// ----------------------------------------------------------- external people ---

export interface NewPersonInput extends ContextFields {
  displayName: string;
}

/**
 * Somebody who is not an account and not yet in Her Keys. The identity is the canonical non-account person (`household_people`),
 * recorded with the relationship `other` — the value that says nothing more — because what she calls them is HER label, and lives on
 * her private context. A context is created only when she gave something to remember; a name alone is a person with no context.
 * No existing person is looked up by name: a second "Jordan Lee" is a second person.
 */
export function addExternalPerson(state: AppState, ctx: TransitionContext, input: NewPersonInput): PeopleResult {
  const name = checkName(input.displayName);
  if (!name.ok) return refuse(state, name.outcome);
  const checked = checkFields(input);
  if (!checked.ok) return refuse(state, checked.outcome);

  const before = new Set(state.people.map((p) => p.id));
  const withPerson = addPerson(state, ctx, { displayName: name.value, relationship: 'other', channel: 'unspecified' });
  const person = withPerson.people.find((p) => !before.has(p.id));
  if (!person) return refuse(state, 'not_found');

  const hasContext = Object.values(checked.value).some((v) => v !== null && v !== undefined);
  if (!hasContext) return done(withPerson, 'saved', person.id);
  const opened = openPersonContext(withPerson, ctx, { kind: 'person', id: person.id }, input);
  return opened.outcome === 'saved' ? done(opened.state, 'saved', person.id) : refuse(state, opened.outcome);
}

function editablePerson(state: AppState, personId: string): { person: HouseholdPerson } | { outcome: PeopleOutcome } {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return { outcome: 'not_found' };
  // The co-parent's identity is Co-Parent's (F07): read-only here.
  if (isCoParent(person)) return { outcome: 'read_only_identity' };
  return { person };
}

/** A new display name for the SAME person: same id, every link and context intact. */
export function renamePerson(state: AppState, ctx: TransitionContext, personId: string, displayName: string): PeopleResult {
  const found = editablePerson(state, personId);
  if ('outcome' in found) return refuse(state, found.outcome);
  const name = checkName(displayName);
  if (!name.ok) return refuse(state, name.outcome);
  if (name.value === found.person.displayName) return done(state, 'unchanged', personId);
  const at = toInstant(ctx.nowMs);
  return done({ ...state, people: state.people.map((p) => (p.id === personId ? { ...p, displayName: name.value, updatedAt: at } : p)) }, 'saved', personId);
}

/** Archive the identity (no delete in V1). Her context stays exactly as it was and becomes inert while the person is archived. */
export function archiveExternalPerson(state: AppState, ctx: TransitionContext, personId: string): PeopleResult {
  const found = editablePerson(state, personId);
  if ('outcome' in found) return refuse(state, found.outcome);
  if (found.person.status === 'archived') return done(state, 'unchanged', personId);
  return done(archivePerson(state, ctx, personId), 'saved', personId);
}

export function restoreExternalPerson(state: AppState, ctx: TransitionContext, personId: string): PeopleResult {
  const found = editablePerson(state, personId);
  if ('outcome' in found) return refuse(state, found.outcome);
  if (found.person.status === 'active') return done(state, 'unchanged', personId);
  const at = toInstant(ctx.nowMs);
  return done({ ...state, people: state.people.map((p) => (p.id === personId ? { ...p, status: 'active', updatedAt: at } : p)) }, 'saved', personId);
}

// ----------------------------------------------------------------- follow-up ---

/**
 * The key the Add Follow-up flow mints when it OPENS (in memory only — opening writes nothing). It is the idempotency key of the
 * save: the Task's and the link's local ids are derived from it, so saving twice (a retry, a double tap that got past the guard)
 * finds the Task already there and creates nothing more. It is also the entropy that keeps a private Task's local id unguessable
 * (the scoped-table local-id probe, HK_FEATURE_13_PEOPLE.md M0).
 */
export const DRAFT_KEY_PATTERN = /^[a-z0-9]{24,48}$/;

export interface FollowUpInput {
  contextId: string;
  draftKey: string;
  title: string;
  dueDate?: LocalDate | null;
}

export const followUpTaskId = (draftKey: string): string => `task-fu-${draftKey}`;
export const followUpLinkId = (draftKey: string): string => `ptl-${draftKey}`;

/**
 * Save a follow-up: exactly ONE canonical owner-private Task and exactly ONE `follow_up` link, in ONE pure transition — so the store
 * commits both or neither. The Task is an ordinary Task (canonical `addTask`, scope `personal`); its title is what SHE typed: no name,
 * label or note is copied into it.
 */
export function addFollowUp(state: AppState, ctx: TransitionContext, input: FollowUpInput): PeopleResult {
  if (!DRAFT_KEY_PATTERN.test(input.draftKey)) return refuse(state, 'invalid_draft');
  const taskId = followUpTaskId(input.draftKey);
  const linkId = followUpLinkId(input.draftKey);
  const { personContexts, personTaskLinks } = collections(state);

  const context = personContexts.find((c) => c.id === input.contextId);
  if (!context) return refuse(state, 'not_found');

  // A retry of a save that already happened: nothing more is created.
  const existingTask = state.tasks.find((t) => t.id === taskId);
  const existingLink = personTaskLinks.find((l) => l.id === linkId);
  if (existingLink) return done(state, 'already_saved', taskId);
  if (existingTask) {
    // The Task exists and its link does not. The store commits both in one write, so this is reachable only if something outside
    // this transition intervened. It is RECOVERED explicitly — the missing link is added to the Task that is already there — and
    // only when that Task is still hers and private; it is never reported as done while the link is missing.
    if (existingTask.scope !== 'personal') return refuse(state, 'not_found');
    return done({ ...state, personTaskLinks: [...personTaskLinks, followUpLink(state, ctx, linkId, context.id, existingTask.id, existingTask.createdAt)] }, 'saved', taskId);
  }
  if (context.status !== 'active') return refuse(state, 'context_archived');
  const target: PersonTarget = context.childId !== null ? { kind: 'child', id: context.childId } : { kind: 'person', id: context.personId! };
  if (targetStanding(state, target) !== 'active') return refuse(state, 'person_unavailable');

  const title = input.title.trim();
  if (title.length === 0 || charLength(title) > 200) return refuse(state, 'invalid_title');
  const dueDate = input.dueDate ?? null;
  if (dueDate !== null && !isLocalDate(dueDate)) return refuse(state, 'invalid_date');

  const category = categoryWithRole(state, 'relationships');
  if (!category || category.status !== 'active') return refuse(state, 'no_category');

  const withTask = addTask(state, { ...ctx, createId: () => taskId }, { title, categoryId: category.id, dueDate, scope: 'personal' });
  const task = withTask.tasks.find((t) => t.id === taskId);
  if (!task) return refuse(state, 'not_found');

  return done({ ...withTask, personTaskLinks: [...personTaskLinks, followUpLink(state, ctx, linkId, context.id, task.id, task.createdAt)] }, 'saved', task.id);
}

function followUpLink(state: AppState, ctx: TransitionContext, id: string, contextId: string, taskId: string, createdAt: string | null): PersonTaskLink {
  return {
    id,
    contextId,
    followUp: { kind: 'task', id: taskId },
    relation: 'follow_up',
    createdAt: createdAt ?? toInstant(ctx.nowMs),
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
}
