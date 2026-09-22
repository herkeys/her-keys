import { z } from 'zod';
import { Id, InstantSchema } from '../schemaPrimitives';
import { ProvenanceSchema } from './provenance';

/**
 * PEOPLE OS — THE PRIVATE CONTEXT LAYER (HK-FEATURE-13).
 *
 * Who a person IS already has a canonical home, and People OS does not make a second one:
 *
 *   a child of the household      `household_members` (member_type 'child')        locally `AppState.children`
 *   anyone who is not an account  `household_people` (owner-private)                locally `AppState.people`
 *                                 — the co-parent counterparty, a grandparent, a teacher, a neighbor
 *
 * A PERSON CONTEXT is what THIS USER wants Her Keys to remember about one of them. It is owner-private, it points at exactly ONE
 * canonical identity by a real foreign key (`childId` XOR `personId` — never a name, never a free-floating id), and at most one exists
 * per owner and person. It says nothing about the person globally: it does not mean the person agrees, that anything is verified,
 * that the relationship is close or healthy, or that anyone needs contacting. A context with no label and no note is still a context.
 *
 * A PERSON TASK LINK records that a canonical, owner-private Task was created as a follow-up FROM a person context. The relation is
 * `follow_up` and nothing else: what the follow-up actually is lives in the Task's own title. Links are created once, with the Task,
 * and never edited.
 *
 * The current user is never a People row: a context can name a CHILD member (the account holder is an adult, so the database cannot
 * even express it) or a non-account person — never an account.
 */

/** Model/domain bounds, mirrored by CHECK constraints in the F13 migration. Counted in characters (code points), as PostgreSQL does. */
export const PEOPLE_LIMITS = {
  relationshipLabel: 60,
  organizationLabel: 80,
  contextNote: 500,
  displayName: 80,
} as const;

/** Code points, not UTF-16 units: `char_length` in PostgreSQL counts an emoji once, and so must the device. */
export const charLength = (value: string): number => [...value].length;

// C0 and C1 controls, DEL, and the Unicode line/paragraph separators. At least as strict as PostgreSQL's [[:cntrl:]], so a value the
// device accepts is never refused by the server afterwards.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// A note may hold line breaks and tabs (and a carriage return, which normalizeNote removes); nothing else of the above.
// eslint-disable-next-line no-control-regex
const NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
/** U+2028 / U+2029 (line and paragraph separators), tested by code point so no literal separator ever sits in this source. */
const hasSeparator = (value: string): boolean => value.includes(String.fromCharCode(0x2028)) || value.includes(String.fromCharCode(0x2029));

/** A short single-line label: already trimmed, 1..max characters, no control characters. */
const ShortLabel = (max: number) =>
  z
    .string()
    .refine((value) => value === value.trim(), { message: 'Must be trimmed' })
    .refine((value) => charLength(value) >= 1 && charLength(value) <= max, { message: `Must be 1..${max} characters` })
    .refine((value) => !CONTROL.test(value) && !hasSeparator(value), { message: 'Must be a single line' });

/** A private note: 1..500 characters, not blank, trimmed at both ends; line breaks allowed. */
const ContextNote = z
  .string()
  .refine((value) => value === value.trim(), { message: 'Must be trimmed' })
  .refine((value) => charLength(value) >= 1 && charLength(value) <= PEOPLE_LIMITS.contextNote, { message: 'Must be 1..500 characters' })
  .refine((value) => !NOTE_CONTROL.test(value) && !hasSeparator(value), { message: 'Must not hold control characters' });

export const PERSON_CONTEXT_STATUSES = ['active', 'archived'] as const;
export type PersonContextStatus = (typeof PERSON_CONTEXT_STATUSES)[number];

export const PersonContextSchema = z
  .strictObject({
    id: Id,
    /** The CHILD this context is about (a `household_members` child). Exactly one of `childId` / `personId` is set. */
    childId: Id.nullable(),
    /** The non-account person this context is about (a `household_people` row of the same owner). */
    personId: Id.nullable(),
    /** Her own short label ("Mom", "Coach", "Attorney"). Display and context only: never identity, never security, never inferred. */
    relationshipLabel: ShortLabel(PEOPLE_LIMITS.relationshipLabel).nullable(),
    /** Where they are from ("Lincoln Elementary"). Optional context, not identity. */
    organizationLabel: ShortLabel(PEOPLE_LIMITS.organizationLabel).nullable(),
    /** Private memory. Shown ONLY on this person's own detail/edit surface (see `people/privateNote.ts`). */
    contextNote: ContextNote.nullable(),
    /** Archived = off the active People surfaces. It asserts nothing about the real relationship. */
    status: z.enum(PERSON_CONTEXT_STATUSES),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
    provenance: ProvenanceSchema,
    scope: z.literal('personal'),
  })
  .superRefine((row, ctx) => {
    if ((row.childId === null) === (row.personId === null)) {
      ctx.addIssue({ code: 'custom', path: ['childId'], message: 'a person context names exactly one person: a child or a non-account person' });
    }
  });
export type PersonContext = z.infer<typeof PersonContextSchema>;

export const PERSON_TASK_RELATIONS = ['follow_up'] as const;
export type PersonTaskRelation = (typeof PERSON_TASK_RELATIONS)[number];

export const PersonTaskLinkSchema = z.strictObject({
  id: Id,
  /** The owner-private person context the follow-up was created from. */
  contextId: Id,
  /** The canonical Task. Typed (ADR-005) so a later kind — an Event — is additive. V1: a task only. */
  followUp: z.strictObject({ kind: z.literal('task'), id: Id }),
  relation: z.enum(PERSON_TASK_RELATIONS),
  createdAt: InstantSchema,
  provenance: ProvenanceSchema,
  scope: z.literal('personal'),
});
export type PersonTaskLink = z.infer<typeof PersonTaskLinkSchema>;

// ------------------------------------------------------------ normalization ---

/** Trim; an empty result means "not recorded" (null). Collapses internal whitespace runs for single-line labels. */
export function normalizeLabel(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.replace(/\s+/g, ' ').trim();
  return value.length === 0 ? null : value;
}

/** Trim the ends only; line breaks inside a note are hers. Windows line endings become plain line breaks. */
export function normalizeNote(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.replace(/\r\n?/g, '\n').trim();
  return value.length === 0 ? null : value;
}

export type LabelProblem = 'too_long' | 'not_single_line';

/** Why a normalized label cannot be stored, or null. The same rules the schema and the database apply. */
export function labelProblem(value: string | null, max: number): LabelProblem | null {
  if (value === null) return null;
  if (CONTROL.test(value) || hasSeparator(value)) return 'not_single_line';
  return charLength(value) > max ? 'too_long' : null;
}

export function noteProblem(value: string | null): 'too_long' | 'invalid_characters' | null {
  if (value === null) return null;
  if (NOTE_CONTROL.test(value) || hasSeparator(value)) return 'invalid_characters';
  return charLength(value) > PEOPLE_LIMITS.contextNote ? 'too_long' : null;
}

// ---------------------------------------------------------------- integrity ---

/** The slice of state the People integrity rules read. */
export interface PeopleIntegrityInput {
  children: ReadonlyArray<{ id: string }>;
  people: ReadonlyArray<{ id: string }>;
  tasks: ReadonlyArray<{ id: string; scope: string }>;
  personContexts: readonly PersonContext[];
  personTaskLinks: readonly PersonTaskLink[];
}

/**
 * Relationships a shape cannot express, stated the way `findIntegrityProblems` states the rest: ids and paths only, never a value
 * (a label or note never reaches a log through this).
 */
export function peopleIntegrityProblems(state: PeopleIntegrityInput): string[] {
  const problems: string[] = [];
  const childIds = new Set(state.children.map((child) => child.id));
  const personIds = new Set(state.people.map((person) => person.id));
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));

  const contextIds = new Set<string>();
  const perIdentity = new Set<string>();
  for (const context of state.personContexts) {
    if (contextIds.has(context.id)) problems.push(`duplicate person context id ${context.id}`);
    contextIds.add(context.id);
    if (context.childId !== null && !childIds.has(context.childId)) problems.push(`person context ${context.id} references missing child ${context.childId}`);
    if (context.personId !== null && !personIds.has(context.personId)) problems.push(`person context ${context.id} references missing person ${context.personId}`);
    // One context per owner and person. Archiving does not free the slot: the existing context is restored instead.
    const key = context.childId !== null ? `child:${context.childId}` : `person:${context.personId}`;
    if (perIdentity.has(key)) problems.push(`${key} has more than one person context`);
    perIdentity.add(key);
  }

  const linkIds = new Set<string>();
  const linkedTasks = new Set<string>();
  for (const link of state.personTaskLinks) {
    if (linkIds.has(link.id)) problems.push(`duplicate person task link id ${link.id}`);
    linkIds.add(link.id);
    if (!contextIds.has(link.contextId)) problems.push(`person task link ${link.id} references missing person context ${link.contextId}`);
    const task = tasks.get(link.followUp.id);
    if (task === undefined) problems.push(`person task link ${link.id} references missing task ${link.followUp.id}`);
    // Private context -> private Task, always (V1). A household-visible Task would carry private context out of the owner's view.
    else if (task.scope !== 'personal') problems.push(`person task link ${link.id} names a task that is not owner-private`);
    if (linkedTasks.has(link.followUp.id)) problems.push(`task ${link.followUp.id} is linked as a follow-up more than once`);
    linkedTasks.add(link.followUp.id);
  }
  return problems;
}
