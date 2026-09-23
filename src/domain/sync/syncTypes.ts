import { z } from 'zod';
import {
  EXISTING_FACETS,
  FOUNDATION_KIND_NAMES,
  FOUNDATION_SPECS,
  updatableColumnsOf,
  type FoundationKind,
  type FoundationSpec,
} from './foundationSpecs';

/**
 * The sync vocabulary.
 *
 * Deliberately small. Sync is metadata about the one canonical household state,
 * not a second model of it — there is no SyncState, CloudState or
 * RemoteHousehold shadowing `AppState`. Everything here answers "what has this
 * device told the cloud, and what has it heard back?", and nothing here is a
 * product fact.
 */

/**
 * The entity kinds that actually travel, from the participation matrix. Each
 * maps one local collection to one cloud table.
 *
 * `member` is a CHILD of the household and nothing else (HK-FEATURE-05, owner checkpoint OC-01): an adult member IS an account and is
 * created by the server alone. A child is created by the household's owner through the same `sync_push` every other kind uses, and is
 * never edited or removed by a client (its only operation is `create`).
 *
 * Absent on purpose: `households` is claim-only (B4-P0-019 — "ordinary client sync can never create, change or remove a
 * membership"); `change_log` is transport; `account_claims` is server-only.
 */
export const CORE_SYNC_KINDS = [
  'member',
  'category',
  'event',
  'task',
  'system',
  'meal',
  'needsMe',
  'oneMove',
  'discovery',
  'onboarding',
  'action',
  // HK-FEATURE-12 Life Admin: two OWNER-PRIVATE kinds (profile_id, personal scope), registered by hand like needsMe.
  'lifeRecord',
  'lifeRecordLink',
] as const;
export type CoreSyncKind = (typeof CORE_SYNC_KINDS)[number];

/**
 * Core kinds plus the eighteen the foundation buildout adds (B4-FOUNDATION-BUILDOUT-01). The foundation
 * kinds are described ONCE, in `foundationSpecs.ts`, and everything below that is per-kind is derived from
 * that description — the table, the identity column, the operations, the columns a client may update and
 * the dependency rank — so the migration, the projection and this file cannot disagree.
 */
export const SYNC_ENTITY_KINDS = [...CORE_SYNC_KINDS, ...FOUNDATION_KIND_NAMES] as const;
export type SyncEntityKind = (typeof SYNC_ENTITY_KINDS)[number];

const fromFoundation = <T>(pick: (spec: FoundationSpec) => T): Record<FoundationKind, T> =>
  Object.fromEntries(FOUNDATION_SPECS.map((spec) => [spec.kind, pick(spec)])) as Record<FoundationKind, T>;

/**
 * Kinds that carry a local/cloud mapping but never travel through the sync
 * queue. Claim creates it and claim alone: `households` has no client write
 * grant at all. (`member` used to be here too; a child now travels as the
 * `member` kind, while the account holder's own member row is still only ever
 * mapped, never pushed.)
 */
export const MAPPING_ONLY_KINDS = ['household'] as const;
export type MappingOnlyKind = (typeof MAPPING_ONLY_KINDS)[number];

export type MappedKind = SyncEntityKind | MappingOnlyKind;

/** Cloud table per kind. The matrix, executable. */
export const CLOUD_TABLE: Record<SyncEntityKind, string> = {
  ...fromFoundation((spec) => spec.table),
  member: 'household_members',
  category: 'household_categories',
  event: 'events',
  task: 'tasks',
  system: 'household_systems',
  meal: 'meal_plan_entries',
  needsMe: 'needs_me_items',
  oneMove: 'one_move_records',
  discovery: 'discovery_records',
  onboarding: 'onboarding_state',
  action: 'action_records',
  lifeRecord: 'life_records',
  lifeRecordLink: 'life_record_task_links',
};

/**
 * The column that carries a row's cloud identity.
 *
 * `onboarding_state` has no surrogate key -- its identity is
 * (household_id, profile_id) -- which is why `log_row_change` records its
 * `profile_id` as the entity id. Fetching it by `id` would ask for a column
 * that does not exist.
 */
export const IDENTITY_COLUMN: Record<SyncEntityKind, string> = {
  ...fromFoundation(() => 'id'),
  member: 'id',
  category: 'id',
  event: 'id',
  task: 'id',
  system: 'id',
  meal: 'id',
  needsMe: 'id',
  oneMove: 'id',
  discovery: 'id',
  onboarding: 'profile_id',
  action: 'id',
  lifeRecord: 'id',
  lifeRecordLink: 'id',
};

/**
 * Which operations each kind may ever produce.
 *
 * `action` is insert-only: the ledger has no UPDATE or DELETE grant and the
 * `forbid_ledger_mutation` trigger binds even the table owner. Local trimming at
 * the 10,000 cap is cache eviction and must never emit a cloud delete
 * (SD4-021) — which is true here by construction, because no path produces one.
 *
 * `member` (a child) is insert-only for the same shape of reason: a client holds no UPDATE or DELETE on `household_members`, and
 * there is no rename, so nothing about an existing child is ever sent. What her device knows of a child arrives by pull.
 *
 * `discovery` is the only kind with a tombstone, and it is a soft one:
 * `deleted_at`, an UPDATE. Every other kind has no DELETE policy and no DELETE
 * privilege, so this wave does not invent removal for them.
 */
export const ALLOWED_OPS: Record<SyncEntityKind, readonly SyncOp[]> = {
  // A server-written kind (an execution, an outcome) is never pushed: a device cannot forge one.
  // An append-only kind is created and never edited.
  ...fromFoundation((spec): readonly SyncOp[] => (spec.serverWritten ? [] : spec.mutable ? ['create', 'update'] : ['create'])),
  member: ['create'],
  category: ['create', 'update'],
  event: ['create', 'update'],
  task: ['create', 'update'],
  system: ['create', 'update'],
  meal: ['create', 'update'],
  needsMe: ['create', 'update'],
  oneMove: ['create', 'update'],
  discovery: ['create', 'update', 'tombstone'],
  onboarding: ['create', 'update'],
  action: ['create'],
  lifeRecord: ['create', 'update'],
  // A link is written once, with its Task, and never edited: the cloud grants it no UPDATE.
  lifeRecordLink: ['create'],
};

/**
 * The columns `authenticated` may actually UPDATE, per kind.
 *
 * Extracted from `information_schema.column_privileges`, not guessed. Sending a
 * column outside this set is refused with 42501, which the transport would then
 * have to classify as "forbidden" -- turning a perfectly ordinary edit into
 * permanent failure evidence. The narrower list is the contract, so the client
 * sends what it is allowed to send.
 *
 * `action` has an empty list on purpose: the ledger is immutable and has no
 * UPDATE grant at all.
 */
/**
 * The columns the nine content kinds gained. A client states where a row came from when it creates it
 * (`producer`, `source_artifact_id`, `confidence`) and may afterwards move only its confidence; the facet
 * columns are editable like any other field. Derived from the manifest so it matches the generated grants.
 */
const existingUpdatable = (kind: keyof typeof EXISTING_FACETS | 'category' | 'needsMe' | 'oneMove' | 'discovery' | 'onboarding'): string[] => [
  'confidence',
  ...((EXISTING_FACETS as Record<string, ReadonlyArray<{ col: string; type: string; prefix?: string }>>)[kind] ?? []).flatMap((f) =>
    f.type === 'money' ? [`${f.prefix}_amount_minor`, `${f.prefix}_currency`, `${f.prefix}_direction`] : [f.col]
  ),
];
const merged = (columns: readonly string[], kind: Parameters<typeof existingUpdatable>[0]): string[] =>
  [...columns, ...existingUpdatable(kind)].sort();

export const UPDATABLE_COLUMNS: Record<SyncEntityKind, readonly string[]> = {
  ...fromFoundation((spec) => updatableColumnsOf(spec)),
  member: [],
  category: merged(['name', 'origin_updated_at', 'sort_order', 'status', 'subject_member_id', 'system_role'], 'category'),
  event: merged(['category_id', 'commitment', 'ends_at', 'location', 'notes', 'origin_updated_at',
                 'preparation_minutes', 'scope', 'starts_at', 'status', 'subject_member_id', 'title',
                 'travel_minutes_after', 'travel_minutes_before'], 'event'),
  task: merged(['category_id', 'commitment', 'completed_at', 'due_date', 'duration_minutes', 'duration_source', 'notes',
                'origin_updated_at', 'plan_kind', 'planned_date', 'planned_starts_at', 'scope', 'status',
                'subject_member_id', 'title'], 'task'),
  system: merged(['category_id', 'description', 'name', 'origin_updated_at', 'scope', 'subject_member_id'], 'system'),
  // `meal_slot` and `status` are listed by hand, like task `duration_source`: they are NOT facets, so they stay out of EXISTING_FACETS
  // (and out of the generated shipping migration). Archiving a meal is an UPDATE of `status`; there is no delete.
  meal: merged(['category_id', 'meal_date', 'meal_slot', 'origin_updated_at', 'scope', 'status', 'subject_member_id', 'title'], 'meal'),
  needsMe: merged(['category_id', 'due_date', 'status', 'title'], 'needsMe'),
  oneMove: merged(['cleared_at', 'completed_at', 'decided_at', 'status', 'target_needs_me_id',
                   'target_task_id', 'target_type', 'target_event_id', 'target_system_id',
                   'target_responsibility_id'], 'oneMove'),
  discovery: merged(['deleted_at', 'local_id', 'topic_id'], 'discovery'),
  onboarding: merged(['completed_at', 'goal_ids', 'last_step', 'strength_ids', 'struggle_ids'], 'onboarding'),
  action: [],
  // Exactly the migration's UPDATE grant on life_records (20260922180000_f12_life_records.sql).
  lifeRecord: ['archived_at', 'confidence', 'expires_on', 'issued_on', 'issuer_name', 'location_hint', 'note', 'origin_updated_at', 'record_kind',
               'reference_number', 'renew_by', 'review_on', 'status', 'subject_member_id', 'title', 'type_name'],
  lifeRecordLink: [],
};

/** The row an UPDATE may carry: the projected row, narrowed to the grant. */
export function updatablePatch(kind: SyncEntityKind, row: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const column of UPDATABLE_COLUMNS[kind]) {
    if (column in row) patch[column] = row[column];
  }
  return patch;
}

export const SYNC_OPS = ['create', 'update', 'tombstone'] as const;
export type SyncOp = (typeof SYNC_OPS)[number];

/**
 * Dependency rank. Lower ranks are pushed first, because a task cannot reference
 * a category the cloud has never seen and an action cannot reference either.
 * Explicit, because relying on object iteration order would be relying on an
 * accident.
 */
export const DEPENDENCY_RANK: Record<SyncEntityKind, number> = {
  // Every synced row names its source artifact, so artifacts come first; a One Move can name a
  // responsibility, so it comes after the foundation kinds at rank 3. The foundation kinds carry
  // their own rank in the manifest, and a test derives the reference graph and holds them to it.
  ...fromFoundation((spec) => spec.rank),
  // A child is what a task, event, System, category or routine names as its subject, so it goes before every one of them.
  member: 0,
  category: 1,
  task: 2,
  needsMe: 2,
  event: 2,
  system: 2,
  meal: 2,
  discovery: 2,
  onboarding: 2,
  oneMove: 4,
  action: 5,
  // A record names a child (0) and an artifact; a link names a record and a Task (both 2), so it goes after them.
  lifeRecord: 2,
  lifeRecordLink: 3,
};

// ---------------------------------------------------------------- bounds ----
/**
 * Technical parameters, not product decisions. Nothing in the frozen authority
 * fixes a number — only that the queue and the evidence store are bounded — so
 * these are named here and documented rather than scattered as literals.
 */

/** Pending outbound work items per account namespace. */
export const MAX_QUEUE_ITEMS = 500;

/**
 * Unresolved conflict/failure records per namespace. Unresolved evidence is
 * NEVER discarded to make room; reaching this bound is a backlog condition.
 */
export const MAX_UNRESOLVED_EVIDENCE = 200;

/**
 * Row ids per row-fetch request (one HTTP GET with `id=in.(...)`). A UUID is 37 characters in that list, so 100 keeps the request
 * line near 4 KB, comfortably under the 8 KB most gateways refuse past. This bounds one REQUEST. It does not page the change
 * list: a pull is complete for its range and is applied and made durable as one batch (see PullResult).
 */
export const PULL_FETCH_CHUNK = 100;

// ------------------------------------------------------------- mappings ----
const Uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Expected a UUID' }
);
const Instant = z.iso.datetime();

/**
 * What this device knows about one synchronized row.
 *
 * `revision` is the server revision this device last SAW — the base for the next
 * CAS. It is not the pull cursor and never acts as one; conflating the two is
 * how writes get lost (SD4-012).
 */
export const MappingSchema = z.strictObject({
  kind: z.enum([...SYNC_ENTITY_KINDS, ...MAPPING_ONLY_KINDS]),
  localId: z.string().max(128),
  cloudId: Uuid,
  revision: z.number().int().min(0),
});
export type Mapping = z.infer<typeof MappingSchema>;

/** `kind:localId`. Two kinds may legitimately mint the same local id string. */
export function mappingKey(kind: MappedKind, localId: string): string {
  return `${kind}:${localId}`;
}

// ----------------------------------------------------------------- queue ----
export const QueueItemSchema = z.strictObject({
  /** Stable local work identity. Not a cloud concept: cloud idempotency is the local_id constraint plus base revision. */
  id: z.string().max(128),
  kind: z.enum(SYNC_ENTITY_KINDS),
  localId: z.string().max(128),
  op: z.enum(SYNC_OPS),
  /**
   * The server revision this work is based on, captured when the FIRST pending
   * edit for this row was queued. Later edits before a successful push do not
   * move it — that is what stops three offline edits turning into two
   * self-inflicted stale conflicts.
   */
  baseRevision: z.number().int().min(0).nullable(),
  /** Earliest enqueue order, preserved across coalescing. */
  order: z.number().int().min(0),
  enqueuedAt: Instant,
  attempts: z.number().int().min(0).max(10_000),
  lastAttemptAt: Instant.nullable(),
  /** Why the last attempt did not settle. Never a stack trace. */
  lastError: z.string().max(400).nullable(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

/**
 * No payload is stored on the queue item, and that is the whole coalescing
 * design. The row is read from canonical local state at push time, so the
 * LATEST local intent is what goes out, while `baseRevision` and `order` keep
 * the original CAS base and the original position. One logical row therefore has
 * at most one pending work item, and edits 1, 2 and 3 cannot fight each other.
 */

// -------------------------------------------------------------- evidence ----
export const EVIDENCE_KINDS = [
  /** The server row moved past our base revision. Her intent is kept, unapplied. */
  'cas-conflict',
  /** A uniqueness invariant that represents a competing valid decision, not malformed input. */
  'domain-conflict',
  /** Pull brought a tombstone for a row with unacknowledged local intent. */
  'tombstone-conflict',
  /** Another install already owns this local id. Two entities, never merged. */
  'identity-collision',
  /** The server refused the content itself. Retrying will be refused again. */
  'validation-failure',
  /** RLS or a grant said no. Permanent until something else changes. */
  'forbidden',
  /** A dependency can never resolve, so the work can never be valid. */
  'unresolvable-dependency',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * What was attempted, against what, and what happened.
 *
 * Deliberately not a transcript. Enough to answer the five questions a person
 * resolving it would ask, and nothing that would turn the evidence store into a
 * debug log.
 */
export const SyncEvidenceSchema = z.strictObject({
  id: z.string().max(128),
  evidence: z.enum(EVIDENCE_KINDS),
  kind: z.enum(SYNC_ENTITY_KINDS),
  localId: z.string().max(128),
  cloudId: Uuid.nullable(),
  attemptedOp: z.enum(SYNC_OPS),
  baseRevision: z.number().int().min(0).nullable(),
  serverRevision: z.number().int().min(0).nullable(),
  detail: z.string().max(400),
  recordedAt: Instant,
  resolved: z.boolean(),
});
export type SyncEvidence = z.infer<typeof SyncEvidenceSchema>;

// ------------------------------------------------------------- lifecycle ----
export const HYDRATION_STATES = ['unhydrated', 'hydrating', 'ready'] as const;
export type HydrationState = (typeof HYDRATION_STATES)[number];

export const SYNC_PHASES = [
  'idle',
  'hydrating',
  'pulling',
  'pushing',
  'offline',
  'backlog',
  'conflicted',
  'error',
] as const;
export type SyncPhase = (typeof SYNC_PHASES)[number];

/**
 * The per-account sync namespace, stored beside the identity block in the v3
 * envelope. It holds no credential: tokens live behind the secure-session
 * boundary and never reach household storage (B4-P0-013).
 */
export const SyncNamespaceSchema = z.strictObject({
  accountId: Uuid,
  householdId: Uuid,
  /**
   * Per INSTALL, not per account. Two devices of one account must differ, or
   * SD4-006 cannot tell a lost acknowledgement from a genuine collision.
   */
  deviceId: Uuid,
  hydration: z.enum(HYDRATION_STATES),
  /** The last cursor whose batch is DURABLE. Never the highest cursor seen. */
  cursor: z.string().max(40),
  lastSyncedAt: Instant.nullable(),
  mappings: z.record(z.string().max(160), MappingSchema),
  queue: z.array(QueueItemSchema).max(MAX_QUEUE_ITEMS),
  evidence: z.array(SyncEvidenceSchema).max(MAX_UNRESOLVED_EVIDENCE * 4),
  /** Set when the queue or the evidence store is full. Work stops before intent is lost. */
  backlog: z.boolean(),
});
export type SyncNamespace = z.infer<typeof SyncNamespaceSchema>;

export function emptyNamespace(input: {
  accountId: string;
  householdId: string;
  deviceId: string;
}): SyncNamespace {
  return {
    accountId: input.accountId,
    householdId: input.householdId,
    deviceId: input.deviceId,
    hydration: 'unhydrated',
    // '0' is xid8 zero: everything ever committed is after it.
    cursor: '0',
    lastSyncedAt: null,
    mappings: {},
    queue: [],
    evidence: [],
    backlog: false,
  };
}

/**
 * The one signal the product surfaces (B4-BE03 addendum I): unresolved intent
 * exists. No revisions, no queue ids, no cursors, no database errors.
 */
export function needsSyncAttention(namespace: SyncNamespace | null): boolean {
  return namespace !== null && (namespace.backlog || unresolvedEvidence(namespace).length > 0);
}

export function needsSyncAttentionCount(namespace: SyncNamespace | null): number {
  return namespace === null ? 0 : unresolvedEvidence(namespace).length;
}

export function unresolvedEvidence(namespace: SyncNamespace): SyncEvidence[] {
  return namespace.evidence.filter((entry) => !entry.resolved);
}
