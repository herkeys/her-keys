import type { TransitionContext } from './context';
import { provenanceFor, userProvenance, type Provenance } from './foundation/provenance';
import { isLocalDate, toInstant, type LocalDate } from './logicalDay';
import { ID_PATTERN } from './schemaPrimitives';
import {
  LIFE_RECORD_CAPACITY,
  LIFE_RECORD_KINDS,
  LIFE_RECORD_LIMITS,
  LIFE_RECORD_LINK_CAPACITY,
  LIFE_RECORD_LINK_RELATIONS,
  type AppState,
  type LifeRecord,
  type LifeRecordKind,
  type LifeRecordLinkRelation,
  type LifeRecordTaskLink,
  type Task,
} from './state';
import { addTask } from './tasks';

/**
 * LIFE ADMIN / DOCUMENTS (HK-FEATURE-12): the local commands for a LifeRecord.
 *
 * Pure `(state, ctx, …) → result`, like `tasks.ts` and `meals.ts`. A refusal returns the SAME state reference, so the change bridge
 * sees nothing to send and the store has nothing to persist; a changed record is a new object while every other row keeps its
 * reference.
 *
 * What these commands never do, by construction: they never read a record's DATES to change anything (a passed expiration date
 * archives nothing and invalidates nothing), never create a Task on their own (only `addLifeRecordTask`, which she invokes by saving
 * the sheet, does), never match records by title, reference, issuer or date (two records with the same title are two records), and
 * never delete. Archiving is a status; nothing a record is linked to changes when it is archived.
 */

// CR, LF, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR, built from char codes so this source holds no invisible characters.
const LINE_BREAK_CHARS = String.fromCharCode(0x0d, 0x0a, 0x85, 0x2028, 0x2029);
const LINE_BREAKS = new RegExp(`[${LINE_BREAK_CHARS}]+`, 'g');

/** The editable facts of a record. Optional text is `null` when absent; an empty string clears. */
export interface LifeRecordFields {
  title: string;
  kind: LifeRecordKind;
  typeName: string | null;
  issuerName: string | null;
  referenceNumber: string | null;
  issuedOn: LocalDate | null;
  expiresOn: LocalDate | null;
  renewBy: LocalDate | null;
  reviewOn: LocalDate | null;
  locationHint: string | null;
  note: string | null;
  subjectMemberId: string | null;
}

export const LIFE_RECORD_FIELD_NAMES = [
  'title', 'kind', 'typeName', 'issuerName', 'referenceNumber', 'issuedOn', 'expiresOn', 'renewBy', 'reviewOn', 'locationHint', 'note', 'subjectMemberId',
] as const satisfies ReadonlyArray<keyof LifeRecordFields>;

/** Which field a refusal is about, so a form can say where the problem is without echoing what she typed. */
export type LifeRecordField = (typeof LIFE_RECORD_FIELD_NAMES)[number];

export type LifeRecordRefusal =
  | 'invalid-id'
  | 'exists'
  | 'invalid-field'
  | 'records-full'
  | 'not-found'
  | 'stale'
  | 'archived'
  | 'active';

export interface LifeRecordResult {
  state: AppState;
  /** Null when nothing went wrong. `exists` is a repeat of a save that already happened: treat it as success. */
  refusal: LifeRecordRefusal | null;
  /** The field an `invalid-field` refusal is about. Never the value. */
  field: LifeRecordField | null;
  id: string | null;
}

const refuse = (state: AppState, refusal: LifeRecordRefusal, id: string | null = null, field: LifeRecordField | null = null): LifeRecordResult => ({
  state,
  refusal,
  field,
  id,
});

// ------------------------------------------------------------------------------------------------------ normalisation ---

type Normalised<T> = { ok: true; value: T } | { ok: false };

/** Single-line text: line breaks collapse to one space, then trimmed. Blank is absent (null). Unicode permitted; nothing parsed. */
function optionalLine(raw: string | null | undefined, max: number): Normalised<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.replace(LINE_BREAKS, ' ').trim();
  if (text.length === 0) return { ok: true, value: null };
  return text.length > max ? { ok: false } : { ok: true, value: text };
}

/** A short multi-line note: trimmed at the ends only. Blank is absent. */
function optionalNote(raw: string | null | undefined): Normalised<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.trim();
  if (text.length === 0) return { ok: true, value: null };
  return text.length > LIFE_RECORD_LIMITS.note ? { ok: false } : { ok: true, value: text };
}

function optionalDate(raw: string | null | undefined): Normalised<LocalDate | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const text = raw.trim();
  if (text.length === 0) return { ok: true, value: null };
  return isLocalDate(text) ? { ok: true, value: text } : { ok: false };
}

export type TitleCheck = { ok: true; title: string } | { ok: false; problem: 'blank' | 'too-long' };

export function checkLifeRecordTitle(raw: string): TitleCheck {
  const title = typeof raw === 'string' ? raw.replace(LINE_BREAKS, ' ').trim() : '';
  if (title.length === 0) return { ok: false, problem: 'blank' };
  if (title.length > LIFE_RECORD_LIMITS.title) return { ok: false, problem: 'too-long' };
  return { ok: true, title };
}

export const isLifeRecordKind = (value: unknown): value is LifeRecordKind =>
  typeof value === 'string' && (LIFE_RECORD_KINDS as readonly string[]).includes(value);

/**
 * Every field she stated, normalised, or the first field that is not acceptable. A subject must be a CHILD of this household,
 * named by id; a name is never matched to find one.
 */
function normalise(state: AppState, input: LifeRecordFields): { ok: true; fields: LifeRecordFields } | { ok: false; field: LifeRecordField } {
  const title = checkLifeRecordTitle(input.title);
  if (!title.ok) return { ok: false, field: 'title' };
  if (!isLifeRecordKind(input.kind)) return { ok: false, field: 'kind' };

  const typeName = optionalLine(input.typeName, LIFE_RECORD_LIMITS.typeName);
  if (!typeName.ok) return { ok: false, field: 'typeName' };
  const issuerName = optionalLine(input.issuerName, LIFE_RECORD_LIMITS.issuerName);
  if (!issuerName.ok) return { ok: false, field: 'issuerName' };
  const referenceNumber = optionalLine(input.referenceNumber, LIFE_RECORD_LIMITS.referenceNumber);
  if (!referenceNumber.ok) return { ok: false, field: 'referenceNumber' };
  const locationHint = optionalLine(input.locationHint, LIFE_RECORD_LIMITS.locationHint);
  if (!locationHint.ok) return { ok: false, field: 'locationHint' };
  const note = optionalNote(input.note);
  if (!note.ok) return { ok: false, field: 'note' };

  const dates: Partial<Record<'issuedOn' | 'expiresOn' | 'renewBy' | 'reviewOn', LocalDate | null>> = {};
  for (const name of ['issuedOn', 'expiresOn', 'renewBy', 'reviewOn'] as const) {
    const date = optionalDate(input[name]);
    if (!date.ok) return { ok: false, field: name };
    dates[name] = date.value;
  }

  const subjectMemberId = input.subjectMemberId ?? null;
  if (subjectMemberId !== null && !state.children.some((child) => child.id === subjectMemberId)) return { ok: false, field: 'subjectMemberId' };

  return {
    ok: true,
    fields: {
      title: title.title,
      kind: input.kind,
      typeName: typeName.value,
      issuerName: issuerName.value,
      referenceNumber: referenceNumber.value,
      issuedOn: dates.issuedOn ?? null,
      expiresOn: dates.expiresOn ?? null,
      renewBy: dates.renewBy ?? null,
      reviewOn: dates.reviewOn ?? null,
      locationHint: locationHint.value,
      note: note.value,
      subjectMemberId,
    },
  };
}

const fieldsOf = (record: LifeRecord): LifeRecordFields => ({
  title: record.title,
  kind: record.kind,
  typeName: record.typeName,
  issuerName: record.issuerName,
  referenceNumber: record.referenceNumber,
  issuedOn: record.issuedOn,
  expiresOn: record.expiresOn,
  renewBy: record.renewBy,
  reviewOn: record.reviewOn,
  locationHint: record.locationHint,
  note: record.note,
  subjectMemberId: record.subjectMemberId,
});

const sameFields = (a: LifeRecordFields, b: LifeRecordFields): boolean => LIFE_RECORD_FIELD_NAMES.every((name) => a[name] === b[name]);

// ------------------------------------------------------------------------------------------------------------- create ---

export interface AddLifeRecordInput extends Partial<Omit<LifeRecordFields, 'title' | 'kind'>> {
  title: string;
  kind: LifeRecordKind;
  /** A draft id allocated when the sheet opened: saving the same draft twice creates one record. */
  id?: string;
  /** Only a record she entered is `user-action`, which is the default. */
  provenance?: Provenance;
}

export function addLifeRecord(state: AppState, ctx: TransitionContext, input: AddLifeRecordInput): LifeRecordResult {
  const id = input.id ?? ctx.createId('life-record');
  if (state.lifeRecords.some((record) => record.id === id)) return refuse(state, 'exists', id);
  if (!ID_PATTERN.test(id)) return refuse(state, 'invalid-id');

  const checked = normalise(state, {
    title: input.title,
    kind: input.kind,
    typeName: input.typeName ?? null,
    issuerName: input.issuerName ?? null,
    referenceNumber: input.referenceNumber ?? null,
    issuedOn: input.issuedOn ?? null,
    expiresOn: input.expiresOn ?? null,
    renewBy: input.renewBy ?? null,
    reviewOn: input.reviewOn ?? null,
    locationHint: input.locationHint ?? null,
    note: input.note ?? null,
    subjectMemberId: input.subjectMemberId ?? null,
  });
  if (!checked.ok) return refuse(state, 'invalid-field', null, checked.field);
  if (state.lifeRecords.length >= LIFE_RECORD_CAPACITY) return refuse(state, 'records-full');

  const now = toInstant(ctx.nowMs);
  const record: LifeRecord = {
    id,
    ...checked.fields,
    status: 'active',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    provenance: provenanceFor(state.origin, input.provenance ?? userProvenance()),
    scope: 'personal',
  };
  return { state: { ...state, lifeRecords: [...state.lifeRecords, record] }, refusal: null, field: null, id };
}

// --------------------------------------------------------------------------------------------------------------- edit ---

/** What an editor opened against. Handing it back as `expected` makes a save refuse when the record changed underneath it. */
export interface LifeRecordSnapshot extends LifeRecordFields {
  status: LifeRecord['status'];
}

export const snapshotOfLifeRecord = (record: LifeRecord): LifeRecordSnapshot => ({ ...fieldsOf(record), status: record.status });

const sameSnapshot = (a: LifeRecordSnapshot, b: LifeRecordSnapshot): boolean => a.status === b.status && sameFields(a, b);

/** A field present in the patch replaces the stored value; `null` or blank clears an optional field. The title cannot be cleared. */
export type LifeRecordPatch = Partial<LifeRecordFields>;

const replaceRecord = (state: AppState, next: LifeRecord): AppState => ({
  ...state,
  lifeRecords: state.lifeRecords.map((record) => (record.id === next.id ? next : record)),
});

/**
 * Corrects a record: renames it, adds or clears metadata. It is always the SAME record (same id), so every link to it survives a
 * rename. An archived record may be corrected too, so something entered by mistake can be removed from it. Provenance is not
 * restamped. With `expected`, a save against a record that changed since the editor opened is refused as `stale`.
 */
export function updateLifeRecord(
  state: AppState,
  ctx: TransitionContext,
  id: string,
  patch: LifeRecordPatch,
  expected?: LifeRecordSnapshot
): LifeRecordResult {
  const current = state.lifeRecords.find((record) => record.id === id);
  if (current === undefined) return refuse(state, 'not-found', id);
  if (expected !== undefined && !sameSnapshot(expected, snapshotOfLifeRecord(current))) return refuse(state, 'stale', id);

  const merged: LifeRecordFields = { ...fieldsOf(current) };
  for (const name of LIFE_RECORD_FIELD_NAMES) {
    if (Object.prototype.hasOwnProperty.call(patch, name) && patch[name] !== undefined) {
      (merged as unknown as Record<string, unknown>)[name] = patch[name];
    }
  }
  const checked = normalise(state, merged);
  if (!checked.ok) return refuse(state, 'invalid-field', id, checked.field);
  if (sameFields(checked.fields, fieldsOf(current))) return { state, refusal: null, field: null, id };

  return { state: replaceRecord(state, { ...current, ...checked.fields, updatedAt: toInstant(ctx.nowMs) }), refusal: null, field: null, id };
}

// ---------------------------------------------------------------------------------------------------- archive/restore ---

/**
 * Takes a record off her active surfaces. That is all it means: nothing is deleted, no linked Task is completed, archived or
 * touched, and no link is removed. The record stays (same id) so the change reaches every device as an ordinary update.
 */
export function archiveLifeRecord(state: AppState, ctx: TransitionContext, id: string, expected?: LifeRecordSnapshot): LifeRecordResult {
  const current = state.lifeRecords.find((record) => record.id === id);
  if (current === undefined) return refuse(state, 'not-found', id);
  if (current.status === 'archived') return refuse(state, 'archived', id);
  if (expected !== undefined && !sameSnapshot(expected, snapshotOfLifeRecord(current))) return refuse(state, 'stale', id);
  const now = toInstant(ctx.nowMs);
  return { state: replaceRecord(state, { ...current, status: 'archived', archivedAt: now, updatedAt: now }), refusal: null, field: null, id };
}

/** Brings an archived record back to her active surfaces, unchanged otherwise. */
export function restoreLifeRecord(state: AppState, ctx: TransitionContext, id: string): LifeRecordResult {
  const current = state.lifeRecords.find((record) => record.id === id);
  if (current === undefined) return refuse(state, 'not-found', id);
  if (current.status === 'active') return refuse(state, 'active', id);
  return { state: replaceRecord(state, { ...current, status: 'active', archivedAt: null, updatedAt: toInstant(ctx.nowMs) }), refusal: null, field: null, id };
}

// ------------------------------------------------------------------------------------------------------- record → Task ---

/** The longest a task may be said to take, in minutes (a day), and the task limit in state.ts. */
export const LIFE_RECORD_TASK_MAX_MINUTES = 1440;
const TASK_CAPACITY = 5000;

export interface AddLifeRecordTaskInput {
  recordId: string;
  /** Both ids are allocated when the sheet OPENS. Opening allocates ids and changes nothing; only this save creates anything. */
  taskId: string;
  linkId: string;
  relation: LifeRecordLinkRelation;
  title: string;
  /** Her explicit pick. Nothing is inferred from the record. */
  categoryId: string;
  /** Only a date she set. A record's renew-by date is never copied in unless she chose it. */
  dueDate?: LocalDate | null;
  /** Minutes she typed; absent means she did not say, and the planning default applies AS a default. */
  minutes?: number | null;
}

export type LifeRecordTaskRefusal =
  | 'not-found'
  | 'archived'
  | 'invalid-id'
  | 'invalid-relation'
  | 'invalid-title'
  | 'invalid-category'
  | 'invalid-date'
  | 'invalid-minutes'
  | 'task-full'
  | 'links-full'
  | 'conflict'
  | 'exists';

export interface LifeRecordTaskResult {
  state: AppState;
  /** `exists` is a repeat of a save that already happened (same Task, same link): treat it as success. */
  refusal: LifeRecordTaskRefusal | null;
  taskId: string | null;
  linkId: string | null;
}

/**
 * ONE accepted creation → ONE canonical Task → ONE link, in one transition, so the store persists both or neither. The Task is an
 * ordinary canonical Task of hers (`addTask`), owner-private (`personal`), with no subject and no due date she did not set. The
 * link is owner-private too. A repeat of the same save is recognised by its draft ids and creates nothing twice; a draft id that
 * already names something else is a `conflict`, never an overwrite.
 */
export function addLifeRecordTask(state: AppState, ctx: TransitionContext, input: AddLifeRecordTaskInput): LifeRecordTaskResult {
  const refuseTask = (refusal: LifeRecordTaskRefusal): LifeRecordTaskResult => ({ state, refusal, taskId: null, linkId: null });

  const existingTask = state.tasks.find((task) => task.id === input.taskId);
  const existingLink = state.lifeRecordLinks.find((link) => link.id === input.linkId);
  if (existingTask !== undefined || existingLink !== undefined) {
    const repeat =
      existingTask !== undefined &&
      existingLink !== undefined &&
      existingLink.taskId === input.taskId &&
      existingLink.lifeRecordId === input.recordId;
    return repeat ? { state, refusal: 'exists', taskId: input.taskId, linkId: input.linkId } : refuseTask('conflict');
  }
  if (!ID_PATTERN.test(input.taskId) || !ID_PATTERN.test(input.linkId)) return refuseTask('invalid-id');

  const record = state.lifeRecords.find((row) => row.id === input.recordId);
  if (record === undefined) return refuseTask('not-found');
  if (record.status === 'archived') return refuseTask('archived');
  if (!(LIFE_RECORD_LINK_RELATIONS as readonly string[]).includes(input.relation)) return refuseTask('invalid-relation');

  const title = checkLifeRecordTitle(input.title);
  if (!title.ok) return refuseTask('invalid-title');
  const category = state.categories.find((row) => row.id === input.categoryId);
  if (category === undefined || category.status !== 'active') return refuseTask('invalid-category');
  const due = optionalDate(input.dueDate);
  if (!due.ok) return refuseTask('invalid-date');
  const minutes = input.minutes ?? null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > LIFE_RECORD_TASK_MAX_MINUTES)) return refuseTask('invalid-minutes');
  if (state.tasks.length >= TASK_CAPACITY) return refuseTask('task-full');
  if (state.lifeRecordLinks.length >= LIFE_RECORD_LINK_CAPACITY) return refuseTask('links-full');

  // The one place an id is chosen for the task: addTask asks its context for it, so the draft id becomes the task's id.
  const withId: TransitionContext = { ...ctx, createId: (prefix) => (prefix === 'task' ? input.taskId : ctx.createId(prefix)) };
  const withTask = addTask(state, withId, {
    title: title.title,
    categoryId: category.id,
    scope: 'personal',
    ...(minutes === null ? {} : { durationMinutes: minutes, durationSource: 'user' as const }),
    dueDate: due.value,
  });
  const link: LifeRecordTaskLink = {
    id: input.linkId,
    lifeRecordId: record.id,
    taskId: input.taskId,
    relation: input.relation,
    createdAt: toInstant(ctx.nowMs),
    provenance: provenanceFor(state.origin, userProvenance()),
    scope: 'personal',
  };
  return { state: { ...withTask, lifeRecordLinks: [...withTask.lifeRecordLinks, link] }, refusal: null, taskId: input.taskId, linkId: input.linkId };
}

// ---------------------------------------------------------------------------------------------------------- queries ---

/** Records still on her active surfaces. Archived records stay in state, and stay reachable by id. */
export const activeLifeRecords = (state: Pick<AppState, 'lifeRecords'>): LifeRecord[] => state.lifeRecords.filter((record) => record.status === 'active');

export interface LinkedTask {
  linkId: string;
  relation: LifeRecordLinkRelation;
  taskId: string;
  /** Null when the Task is not on this device. Never a crash, never a re-link. */
  task: Task | null;
}

/** The Tasks she created from a record, in the order she created them. A Task that is gone resolves to null, not to an error. */
export function linkedTasksOf(state: Pick<AppState, 'lifeRecordLinks' | 'tasks'>, recordId: string): LinkedTask[] {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  return state.lifeRecordLinks
    .filter((link) => link.lifeRecordId === recordId)
    .map((link) => ({ linkId: link.id, relation: link.relation, taskId: link.taskId, task: byId.get(link.taskId) ?? null }));
}

/**
 * Administrative work still to do for a record: linked Tasks that are OPEN. A completed Task is done work, not a renewal; an archived
 * or missing Task is not work at all. Neither changes the record.
 */
export const openLinkedTaskCount = (state: Pick<AppState, 'lifeRecordLinks' | 'tasks'>, recordId: string): number =>
  linkedTasksOf(state, recordId).filter((linked) => linked.task !== null && linked.task.status === 'open').length;
