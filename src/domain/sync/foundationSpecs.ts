import { KIND_CLOUD, type TypedRefKind } from '../foundation/typedRef';

/**
 * THE FOUNDATION SYNC MANIFEST — B4-FE01-029..031.
 *
 * Every synced kind the foundation buildout adds is described here ONCE. Two
 * interpreters read this same data:
 *
 *   - `supabase/tools/gen-foundation-sql.mjs` emits the explicit DDL (tables,
 *     constraints, indexes, triggers, policies, grants) that lives in the shipping
 *     migration, and a drift check fails if the migration is edited by hand;
 *   - `foundationProjection.ts` turns a local row into a cloud row and back.
 *
 * So the column a row is written to, the column the client may UPDATE, and the
 * column a pull reads cannot disagree: there is one definition. This is not a
 * second sync architecture. It is the same push/pull engine, the same change
 * cursor, the same CAS and the same queue; the manifest only says what each kind's
 * columns are.
 *
 * NOT here: hand-written safety logic. The authorization-coverage trigger, the
 * dependency-cycle trigger, the claim closure and the household-context contract are
 * written out in the migration itself, where they can be read and reviewed.
 */

export type ScalarType = 'text' | 'int' | 'bigint' | 'bool' | 'instant' | 'date' | 'smallints';

export type Field =
  /** A plain column. */
  | { local: string; col: string; type: ScalarType; nullable?: boolean }
  /** A typed reference (ADR-005): `{ kind, id }` locally; `<prefix>_type` plus one typed FK column per kind in the cloud. */
  | { local: string; type: 'ref'; prefix: string; kinds: readonly TypedRefKind[]; required: boolean; onDelete: 'cascade' | 'noaction' }
  /** A single reference to another synced row, by local id locally and by cloud uuid in the cloud. */
  | { local: string; col: string; type: 'link'; to: LinkTarget; nullable?: boolean }
  /** An exact amount: minor units, ISO currency and (unless `noDirection`) a direction. */
  | { local: string; type: 'money'; prefix: string; nullable: boolean; noDirection?: boolean };

/** What a `link` points at: another foundation/core kind by sync kind, or a household member (a child). */
export type LinkTarget =
  | 'sourceArtifact' | 'interpretation' | 'externalReference' | 'observation' | 'authority' | 'intent' | 'decision'
  | 'execution' | 'person' | 'responsibility' | 'goal' | 'system' | 'category' | 'member' | 'rebuildFocus' | 'personContext';

/**
 * The synced kinds the manifest describes. A closed list, so `SyncEntityKind` stays a union of literals. The eighteen foundation
 * kinds, then HK-FEATURE-10's `opportunity` (Work / Career), the two HK-FEATURE-11 (Me / Rebuild) kinds and the two HK-FEATURE-13
 * (People OS) kinds, which are owner-private exactly like them and travel the same way. Every kind after the eighteen has its DDL
 * in an additive migration of its own (see `FoundationSpec.migration`).
 */
export const FOUNDATION_KIND_NAMES = [
  'sourceArtifact', 'interpretation', 'externalReference', 'observation', 'authority', 'intent', 'decision', 'execution',
  'outcome', 'person', 'responsibility', 'dependency', 'recurrence', 'goal', 'systemStep', 'capacity', 'pattern', 'evidenceLink',
  'opportunity',
  'rebuildFocus', 'rebuildFocusLink',
  'personContext', 'personTaskLink',
] as const;

/**
 * The shipping migration the original eighteen kinds' DDL is generated into.
 *
 * Which migration file holds a kind's generated DDL has ONE mechanism since the F01-F13 integration. HK-FEATURE-11 keyed later
 * migrations through a `LATER_MIGRATIONS` map and HK-FEATURE-13 named the file directly; the integration keeps HK-FEATURE-13's form,
 * so a spec names its ADDITIVE migration file and the generator emits that kind between the file's own `additive-*` marker pair.
 */
export const SHIPPING_MIGRATION = '20260919231500_build4_cloud_schema.sql';
/**
 * HK-FEATURE-10 (Work / Career): an ADDITIVE migration. Feature 10 first generated its table INTO the shipping migration; the F01-F13
 * integration moved it here (INT13-01), because a database that already applied the shipping migration would never have received it.
 */
export const F10_CAREER_MIGRATION = '20260922181000_f10_career_opportunities.sql';
/**
 * HK-FEATURE-11 (Me / Rebuild): an ADDITIVE migration; the shipping migration is never regenerated for these kinds. (Renumbered from
 * 20260922180000 by the F01-F13 integration: three feature migrations had claimed that one version.)
 */
export const F11_REBUILD_MIGRATION = '20260922182000_f11_rebuild_focus.sql';
/** HK-FEATURE-13 (People OS): an ADDITIVE migration; the shipping migration is never regenerated for these kinds. */
export const F13_PEOPLE_MIGRATION = '20260922200000_f13_people_os.sql';

/** The migration file that carries a kind's generated DDL. */
export const migrationOf = (spec: Pick<FoundationSpec, 'migration'>): string => spec.migration ?? SHIPPING_MIGRATION;
export type FoundationKind = (typeof FOUNDATION_KIND_NAMES)[number];

export interface FoundationSpec {
  /** The sync kind. */
  kind: FoundationKind;
  /** The `AppState` collection, or the singleton's key. */
  collection: string;
  table: string;
  /** A singleton keyed by (household, profile): `capacity`. Its local id is a constant. */
  singleton?: boolean;
  /** Has `revision`, `updated_at`, CAS. Immutable evidence does not. */
  mutable: boolean;
  /** Written by the trusted server boundary. No client INSERT/UPDATE grant; the client only pulls. */
  serverWritten?: boolean;
  /** `own`: the row carries its own `origin` instead of provenance (a source artifact records arrival, not a claim). */
  provenance: 'standard' | 'own';
  fields: readonly Field[];
  /** Columns (or ref/money prefixes) the client may UPDATE. Everything else is fixed at insert. */
  updatable: readonly string[];
  /** Raw CHECK constraints: [name suffix, expression]. */
  checks?: ReadonlyArray<readonly [string, string]>;
  /** Extra UNIQUE constraints, as [name suffix, column list]. */
  uniques?: ReadonlyArray<readonly [string, string]>;
  /** Extra partial/expression indexes: [name suffix, full `CREATE ... INDEX` tail after the name]. */
  indexes?: ReadonlyArray<readonly [string, string, boolean]>;
  /** Other tables reference `(id, <column>)`: adds UNIQUE (id, column). Household is always added. */
  alsoUniqueOn?: readonly string[];
  /** Trigger names to attach beyond the standard set, as `[suffix, timing, events, function-call]`. */
  triggers?: ReadonlyArray<readonly [string, string, string, string]>;
  /** The owner-private profile FK's ON DELETE. Evidence follows the ledger (RESTRICT); mutable rows cascade. */
  profileOnDelete: 'cascade' | 'restrict';
  /**
   * Dependency rank: a row is pushed — and, on a pull, applied — after every row it references. A test derives the
   * reference graph from these fields and fails if any kind ranks at or below a kind it points at.
   */
  rank: number;
  /**
   * The ADDITIVE migration this kind's DDL is generated into. Absent: the shipping migration. A kind added after the
   * shipping migration was applied anywhere must never be spliced into it — that would not upgrade a populated database.
   */
  migration?: string;
}

// ------------------------------------------------------------------ columns ----

/** One column of a foundation table, and what a client may do to it. */
export interface SpecColumn {
  name: string;
  /** The SQL column definition after the name. */
  sql: string;
  /** The client names it on INSERT. */
  insert: boolean;
  /** The client may name it on UPDATE. */
  update: boolean;
  /** Belongs to a typed-reference or money group (its prefix). */
  group?: string;
  /** A derived column (`_type` of a child reference) the server fills and the client never writes. */
  derivedFor?: string;
}

const SQL_TYPE: Record<ScalarType, string> = {
  text: 'text', int: 'integer', bigint: 'bigint', bool: 'boolean', instant: 'timestamptz', date: 'date', smallints: 'smallint[]',
};

/**
 * Every column a spec owns, in table order, with its grants. The generator turns this into DDL and
 * `GRANT`s, and `syncTypes` derives the client's UPDATE column list from the same call, so the
 * column a row is written to, the column the client may update and the column it may name on insert
 * cannot disagree.
 */
export function columnsOfSpec(spec: FoundationSpec): SpecColumn[] {
  const cols: SpecColumn[] = [];
  const add = (name: string, sql: string, opts: Partial<SpecColumn> = {}) => cols.push({ name, sql, insert: false, update: false, ...opts });

  add('id', 'uuid NOT NULL DEFAULT gen_random_uuid()');
  add('household_id', 'uuid NOT NULL', { insert: true });
  add('local_id', 'text NOT NULL', { insert: true });
  add('origin_device_id', 'uuid', { insert: true });
  add('profile_id', 'uuid NOT NULL', { insert: true });

  for (const f of spec.fields) {
    if (f.type === 'ref') {
      add(`${f.prefix}_type`, `text${f.required ? ' NOT NULL' : ''}`, { insert: true, group: f.prefix });
      for (const kind of f.kinds) add(`${f.prefix}_${KIND_CLOUD[kind].column}`, 'uuid', { insert: true, group: f.prefix });
    } else if (f.type === 'money') {
      const nn = f.nullable ? '' : ' NOT NULL';
      add(`${f.prefix}_amount_minor`, `bigint${nn}`, { insert: true, group: f.prefix });
      add(`${f.prefix}_currency`, `text${nn}`, { insert: true, group: f.prefix });
      if (!f.noDirection) add(`${f.prefix}_direction`, `text${nn}`, { insert: true, group: f.prefix });
    } else if (f.type === 'link') {
      add(f.col, `uuid${f.nullable ? '' : ' NOT NULL'}`, { insert: true });
      if (f.to === 'member') add(f.col.replace(/_id$/, '_type'), 'text', { derivedFor: f.col });
    } else {
      add(f.col, `${SQL_TYPE[f.type]}${f.nullable ? '' : ' NOT NULL'}`, { insert: true });
    }
  }

  if (spec.provenance === 'standard') {
    add('producer', 'text NOT NULL', { insert: true });
    add('source_artifact_id', 'uuid', { insert: true });
    add('confidence', 'text', { insert: true });
  }
  add('scope', `text NOT NULL DEFAULT 'personal'`, { insert: true });
  add('origin_created_at', 'timestamptz NOT NULL', { insert: true });
  if (spec.updatable.includes('origin_updated_at')) add('origin_updated_at', 'timestamptz NOT NULL', { insert: true });
  add('created_at', 'timestamptz NOT NULL DEFAULT now()');
  if (spec.mutable) {
    add('updated_at', 'timestamptz NOT NULL DEFAULT now()');
    add('revision', 'bigint NOT NULL DEFAULT 1');
  }

  // Which columns UPDATE may name: each entry is a column, or the prefix of a typed ref / money group.
  const byName = new Map(cols.map((c) => [c.name, c]));
  for (const entry of spec.updatable) {
    const grouped = cols.filter((c) => c.group === entry);
    const targets = grouped.length > 0 ? grouped : byName.has(entry) ? [byName.get(entry)!] : null;
    if (targets === null) throw new Error(`${spec.table}: updatable "${entry}" names no column`);
    for (const t of targets) t.update = true;
  }
  return cols;
}

/** The columns a client may UPDATE on this kind, sorted — the sync engine's contract. */
export const updatableColumnsOf = (spec: FoundationSpec): string[] =>
  spec.mutable && !spec.serverWritten ? columnsOfSpec(spec).filter((c) => c.update).map((c) => c.name).sort() : [];

const CONTENT6: readonly TypedRefKind[] = ['task', 'event', 'needsMe', 'system', 'meal', 'goal'];
const CONTENT6_R: readonly TypedRefKind[] = [...CONTENT6, 'responsibility'];
/**
 * `Dependency`'s own endpoint list (F10): every content kind, plus `opportunity`, mirroring
 * `DEPENDENCY_REF_KINDS` in `foundation/structure.ts`. Used ONLY by the `dependency` spec below —
 * `observation`, `pattern`, `external_reference`, `responsibility` and `intent` keep the narrower
 * `CONTENT6`/`CONTENT6_R` they actually need, so their cloud tables gain no unused column.
 */
const CONTENT6_OPP: readonly TypedRefKind[] = [...CONTENT6, 'opportunity'];

/** One COALESCE over a typed reference's columns for the given kinds: how the dependency rules name "the endpoint". */
const endpointOf = (prefix: string, kinds: readonly TypedRefKind[]): string =>
  `COALESCE(${kinds.map((kind) => `${prefix}_${KIND_CLOUD[kind].column}`).join(', ')})`;
/** A dependency may not join a row to itself. Computed from the endpoint kinds, so the rule and the columns cannot disagree. */
const dependencyNotSelf = (kinds: readonly TypedRefKind[]): string =>
  `NOT (from_type = to_type AND ${endpointOf('from', kinds)} = ${endpointOf('to', kinds)})`;
/** At most one live edge per (relation, endpoint, endpoint). Computed from the endpoint kinds, like the rule above. */
const dependencyLiveEdge = (kinds: readonly TypedRefKind[]): string =>
  `ON public.dependencies (household_id, relation, from_type, ${endpointOf('from', kinds)}, to_type, ${endpointOf('to', kinds)}) WHERE status = 'active'`;

const OPEN_CODE = `~ '^[a-z][a-z0-9_.-]{0,63}$'`;

export const FOUNDATION_SPECS: readonly FoundationSpec[] = [
  // ------------------------------------------------------------ source artifact
  {
    kind: 'sourceArtifact', collection: 'sourceArtifacts', table: 'source_artifacts', mutable: true, provenance: 'own', profileOnDelete: 'cascade', rank: 0,
    fields: [
      { local: 'kind', col: 'kind', type: 'text' },
      { local: 'origin', col: 'origin', type: 'text' },
      { local: 'provider', col: 'provider', type: 'text', nullable: true },
      { local: 'receivedAt', col: 'received_at', type: 'instant' },
      { local: 'contentDigest', col: 'content_digest', type: 'text', nullable: true },
      { local: 'contentRef', col: 'content_ref', type: 'text', nullable: true },
      { local: 'retractedAt', col: 'retracted_at', type: 'instant', nullable: true },
    ],
    updatable: ['retracted_at'],
    checks: [
      ['kind_check', `kind = ANY (ARRAY['voice-utterance','email','calendar-item','document','screenshot','school-notice','receipt','bill','message','connected-object'])`],
      ['origin_check', `origin = ANY (ARRAY['user-submitted','voice','connector'])`],
      ['voice_pairing_check', `(origin = 'voice') = (kind = 'voice-utterance')`],
      ['connector_provider_check', `origin <> 'connector' OR provider IS NOT NULL`],
      ['provider_check', `provider IS NULL OR provider ${OPEN_CODE}`],
      ['digest_check', `content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$'`],
      ['content_ref_check', `content_ref IS NULL OR content_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'`],
    ],
    indexes: [['digest_uq', `ON public.source_artifacts (household_id, profile_id, content_digest) WHERE content_digest IS NOT NULL`, true]],
    triggers: [['retract_once', 'BEFORE', 'UPDATE', `public.enforce_single_column_transition('retracted_at')`]],
  },

  // ------------------------------------------------------------- interpretation
  {
    kind: 'interpretation', collection: 'interpretations', table: 'interpretations', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'artifactId', col: 'artifact_id', type: 'link', to: 'sourceArtifact' },
      { local: 'proposedKind', col: 'proposed_kind', type: 'text' },
      { local: 'title', col: 'title', type: 'text' },
      { local: 'dueDate', col: 'due_date', type: 'date', nullable: true },
      { local: 'startsAt', col: 'starts_at', type: 'instant', nullable: true },
      { local: 'endsAt', col: 'ends_at', type: 'instant', nullable: true },
      { local: 'durationMinutes', col: 'duration_minutes', type: 'int', nullable: true },
      { local: 'value', type: 'money', prefix: 'value', nullable: true },
      { local: 'subjectMemberId', col: 'subject_member_id', type: 'link', to: 'member', nullable: true },
      { local: 'categoryHint', col: 'category_hint', type: 'text', nullable: true },
      { local: 'state', col: 'state', type: 'text' },
      { local: 'clarification', col: 'clarification', type: 'text', nullable: true },
      { local: 'acceptedRef', type: 'ref', prefix: 'accepted', kinds: ['task', 'event', 'needsMe'], required: false, onDelete: 'noaction' },
      { local: 'supersedesId', col: 'supersedes_id', type: 'link', to: 'interpretation', nullable: true },
      { local: 'interpretationVersion', col: 'interpretation_version', type: 'int' },
      { local: 'decidedAt', col: 'decided_at', type: 'instant', nullable: true },
    ],
    updatable: ['title', 'due_date', 'starts_at', 'ends_at', 'duration_minutes', 'value', 'subject_member_id', 'category_hint', 'state', 'clarification', 'accepted', 'decided_at', 'confidence'],
    checks: [
      ['kind_check', `proposed_kind = ANY (ARRAY['task','event','needsMe'])`],
      ['state_check', `state = ANY (ARRAY['pending','clarifying','accepted','rejected','superseded'])`],
      ['title_check', `char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200`],
      ['duration_check', `duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440)`],
      ['hint_check', `category_hint IS NULL OR category_hint = ANY (ARRAY['kids','home','money','meals','work','wellbeing','relationships','coparenting'])`],
      ['clarification_check', `(state = 'clarifying') = (clarification IS NOT NULL) AND (clarification IS NULL OR clarification ${OPEN_CODE})`],
      ['accepted_check', `(state = 'accepted') = (accepted_type IS NOT NULL)`],
      ['accepted_kind_check', `accepted_type IS NULL OR accepted_type = proposed_kind`],
      ['decided_check', `(state IN ('accepted','rejected','superseded')) = (decided_at IS NOT NULL)`],
      ['event_times_check', `CASE WHEN proposed_kind = 'event' THEN starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at ELSE starts_at IS NULL AND ends_at IS NULL END`],
      ['producer_check', `producer = ANY (ARRAY['ai-inference','import-sync'])`],
      // A CHECK that evaluates to NULL PASSES, so this must say NOT NULL: a reading with no provenance artifact would otherwise slip through.
      ['artifact_provenance_check', `source_artifact_id IS NOT NULL AND source_artifact_id = artifact_id`],
      ['version_check', `interpretation_version >= 1 AND interpretation_version <= 1000`],
    ],
    triggers: [['freeze_decided', 'BEFORE', 'UPDATE', `public.freeze_decided_interpretation()`]],
  },

  // -------------------------------------------------------- external reference
  {
    kind: 'externalReference', collection: 'externalReferences', table: 'external_references', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'provider', col: 'provider', type: 'text' },
      { local: 'externalAccount', col: 'external_account', type: 'text' },
      { local: 'externalObjectId', col: 'external_object_id', type: 'text' },
      { local: 'externalVersion', col: 'external_version', type: 'text', nullable: true },
      { local: 'origin', col: 'origin', type: 'text' },
      { local: 'direction', col: 'direction', type: 'text' },
      { local: 'authority', col: 'authority', type: 'text' },
      { local: 'lastObservedAt', col: 'last_observed_at', type: 'instant', nullable: true },
      { local: 'lastObservedDigest', col: 'last_observed_digest', type: 'text', nullable: true },
      { local: 'linked', type: 'ref', prefix: 'linked', kinds: CONTENT6, required: false, onDelete: 'noaction' },
      { local: 'writtenAt', col: 'written_at', type: 'instant', nullable: true },
      { local: 'status', col: 'status', type: 'text' },
    ],
    updatable: ['external_version', 'last_observed_at', 'last_observed_digest', 'status', 'linked', 'confidence', 'origin_updated_at'],
    checks: [
      ['provider_check', `provider ${OPEN_CODE}`],
      ['account_check', `char_length(external_account) >= 1 AND char_length(external_account) <= 128`],
      ['object_check', `char_length(external_object_id) >= 1 AND char_length(external_object_id) <= 256`],
      ['version_check', `external_version IS NULL OR char_length(external_version) <= 128`],
      ['origin_check', `origin = ANY (ARRAY['external','her-keys'])`],
      ['direction_check', `direction = ANY (ARRAY['inbound','outbound','bidirectional'])`],
      ['authority_check', `authority = ANY (ARRAY['external','her-keys'])`],
      ['status_check', `status = ANY (ARRAY['active','unlinked','gone'])`],
      ['digest_check', `last_observed_digest IS NULL OR last_observed_digest ~ '^[0-9a-f]{64}$'`],
      ['her_keys_written_check', `origin <> 'her-keys' OR written_at IS NOT NULL`],
      ['external_not_written_check', `origin <> 'external' OR written_at IS NULL`],
      ['her_keys_linked_check', `NOT (origin = 'her-keys' AND status = 'active') OR linked_type IS NOT NULL`],
    ],
    // The identity that makes a returning object recognisable. Two rows may never claim it -- and the boundary is
    // the owner's, like every other uniqueness here, so one profile can never learn another's objects by colliding.
    uniques: [['identity_key', `(household_id, profile_id, provider, external_account, external_object_id)`]],
  },

  // -------------------------------------------------------------- observation
  {
    kind: 'observation', collection: 'observations', table: 'behavior_observations', mutable: false, provenance: 'standard', profileOnDelete: 'restrict', rank: 5,
    fields: [
      { local: 'about', type: 'ref', prefix: 'about', kinds: ['task', 'event', 'needsMe', 'system', 'meal', 'goal', 'responsibility', 'oneMove', 'interpretation'], required: true, onDelete: 'noaction' },
      { local: 'outcome', col: 'outcome', type: 'text' },
      { local: 'occurredAt', col: 'occurred_at', type: 'instant' },
      { local: 'logicalDate', col: 'logical_date', type: 'date' },
      { local: 'plannedDate', col: 'planned_date', type: 'date', nullable: true },
      { local: 'toDate', col: 'to_date', type: 'date', nullable: true },
    ],
    updatable: [],
    checks: [
      ['outcome_check', `outcome = ANY (ARRAY['completed','reopened','deferred','skipped','missed','cancelled','rescheduled','selected','withheld','cleared','delegated','acknowledged','accepted','declined','returned','reassigned','unacknowledged'])`],
      // Domain semantics, enforced where the data lives: which outcomes mean something for which kind of thing.
      ['outcome_validity_check', `CASE about_type
        WHEN 'task'           THEN outcome IN ('completed','reopened','deferred','skipped','cancelled','missed')
        WHEN 'event'          THEN outcome IN ('cancelled','rescheduled')
        WHEN 'needsMe'        THEN outcome IN ('completed','reopened')
        WHEN 'system'         THEN outcome IN ('completed','skipped','missed')
        WHEN 'meal'           THEN outcome IN ('completed','skipped')
        WHEN 'goal'           THEN outcome IN ('completed','cancelled')
        WHEN 'responsibility' THEN outcome IN ('delegated','acknowledged','accepted','declined','completed','returned','reassigned','unacknowledged')
        WHEN 'oneMove'        THEN outcome IN ('selected','completed','withheld','cleared')
        WHEN 'interpretation' THEN outcome IN ('accepted','declined')
        ELSE false END`],
      ['to_date_check', `to_date IS NULL OR outcome IN ('deferred','rescheduled')`],
    ],
    indexes: [['about_time_idx', `ON public.behavior_observations (household_id, profile_id, logical_date DESC)`, false]],
  },

  // ---------------------------------------------------------------- authority
  {
    kind: 'authority', collection: 'authorities', table: 'automation_authorities', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    fields: [
      { local: 'category', col: 'category', type: 'text' },
      { local: 'mode', col: 'mode', type: 'text' },
      { local: 'maxConsequence', col: 'max_consequence', type: 'text' },
      { local: 'persistent', col: 'persistent', type: 'bool' },
      { local: 'categoryId', col: 'category_id', type: 'link', to: 'category', nullable: true },
      { local: 'subjectMemberId', col: 'subject_member_id', type: 'link', to: 'member', nullable: true },
      { local: 'provider', col: 'provider', type: 'text', nullable: true },
      { local: 'maxAmountMinor', col: 'max_amount_minor', type: 'bigint', nullable: true },
      { local: 'maxAmountCurrency', col: 'max_amount_currency', type: 'text', nullable: true },
      { local: 'grantedAt', col: 'granted_at', type: 'instant' },
      { local: 'expiresAt', col: 'expires_at', type: 'instant', nullable: true },
      { local: 'revokedAt', col: 'revoked_at', type: 'instant', nullable: true },
    ],
    // Revoking is the only edit an authority takes.
    updatable: ['revoked_at', 'origin_updated_at'],
    alsoUniqueOn: ['profile_id'],
    checks: [
      ['category_check', `category = ANY (ARRAY['internal_reminder','task_change','schedule_change','delegation_request','outbound_message','external_calendar_write','external_appointment','financial_action'])`],
      ['mode_check', `mode = ANY (ARRAY['suggest','prepare','ask_approval','execute_authorized'])`],
      ['consequence_check', `max_consequence = ANY (ARRAY['low','moderate','high','critical'])`],
      ['provider_check', `provider IS NULL OR provider ${OPEN_CODE}`],
      ['amount_pair_check', `(max_amount_minor IS NULL) = (max_amount_currency IS NULL)`],
      ['amount_range_check', `max_amount_minor IS NULL OR (max_amount_minor >= 0 AND max_amount_minor <= 9007199254740991)`],
      ['currency_check', `max_amount_currency IS NULL OR max_amount_currency ~ '^[A-Z]{3}$'`],
      // Permission to move money unattended must say how much.
      ['financial_limit_check', `NOT (category = 'financial_action' AND mode = 'execute_authorized') OR max_amount_minor IS NOT NULL`],
      ['expiry_check', `expires_at IS NULL OR expires_at > granted_at`],
      ['revoked_check', `revoked_at IS NULL OR revoked_at >= granted_at`],
      // Only she can grant Her Keys permission. A permission an inference wrote for itself is not a permission.
      ['granted_by_user_check', `producer = 'user-action'`],
    ],
    triggers: [['revoke_only', 'BEFORE', 'UPDATE', `public.enforce_single_column_transition('revoked_at', 'origin_updated_at')`]],
  },

  // ------------------------------------------------------------------- intent
  {
    kind: 'intent', collection: 'intents', table: 'action_intents', mutable: false, provenance: 'standard', profileOnDelete: 'restrict', rank: 4,
    fields: [
      { local: 'category', col: 'category', type: 'text' },
      { local: 'about', type: 'ref', prefix: 'about', kinds: CONTENT6_R, required: false, onDelete: 'noaction' },
      { local: 'consequence', col: 'consequence', type: 'text' },
      { local: 'reversibility', col: 'reversibility', type: 'text' },
      { local: 'summaryCode', col: 'summary_code', type: 'text' },
      { local: 'amount', type: 'money', prefix: 'amount', nullable: true },
      { local: 'provider', col: 'provider', type: 'text', nullable: true },
      { local: 'permittedMode', col: 'permitted_mode', type: 'text' },
      { local: 'expiresAt', col: 'expires_at', type: 'instant', nullable: true },
    ],
    updatable: [],
    alsoUniqueOn: ['profile_id'],
    checks: [
      ['category_check', `category = ANY (ARRAY['internal_reminder','task_change','schedule_change','delegation_request','outbound_message','external_calendar_write','external_appointment','financial_action'])`],
      ['consequence_check', `consequence = ANY (ARRAY['low','moderate','high','critical'])`],
      ['reversibility_check', `reversibility = ANY (ARRAY['reversible','compensable','irreversible'])`],
      ['mode_check', `permitted_mode = ANY (ARRAY['suggest','prepare','ask_approval','execute_authorized'])`],
      ['summary_check', `summary_code ${OPEN_CODE}`],
      ['provider_check', `provider IS NULL OR provider ${OPEN_CODE}`],
      ['financial_amount_check', `category <> 'financial_action' OR amount_amount_minor IS NOT NULL`],
      // An intent is Her Keys' proposal. It is never something she stated.
      ['proposed_by_her_keys_check', `producer = ANY (ARRAY['ai-inference','automation','system-derived'])`],
    ],
  },

  // ----------------------------------------------------------------- decision
  {
    kind: 'decision', collection: 'decisions', table: 'intent_decisions', mutable: false, provenance: 'standard', profileOnDelete: 'restrict', rank: 5,
    fields: [
      { local: 'intentId', col: 'intent_id', type: 'link', to: 'intent' },
      { local: 'decision', col: 'decision', type: 'text' },
      { local: 'basis', col: 'basis', type: 'text' },
      { local: 'authorityId', col: 'authority_id', type: 'link', to: 'authority', nullable: true },
      { local: 'decidedAt', col: 'decided_at', type: 'instant' },
    ],
    updatable: [],
    alsoUniqueOn: ['intent_id'],
    checks: [
      ['decision_check', `decision = ANY (ARRAY['approved','declined','withdrawn'])`],
      ['basis_check', `basis = ANY (ARRAY['explicit','standing_authority'])`],
      ['standing_check', `CASE WHEN basis = 'standing_authority' THEN authority_id IS NOT NULL AND decision = 'approved' AND producer = 'automation' ELSE authority_id IS NULL AND producer = 'user-action' END`],
    ],
    // One answer per intent — two devices approving one intent collide here, exactly as two One Move decisions for one day do.
    indexes: [
      ['one_answer_uq', `ON public.intent_decisions (intent_id) WHERE decision IN ('approved','declined')`, true],
      ['one_withdrawal_uq', `ON public.intent_decisions (intent_id) WHERE decision = 'withdrawn'`, true],
    ],
    triggers: [['withdrawal_needs_approval', 'BEFORE', 'INSERT', `public.guard_withdrawal()`]],
  },

  // ---------------------------------------------------------------- execution
  {
    kind: 'execution', collection: 'executions', table: 'action_executions', mutable: false, serverWritten: true, provenance: 'standard', profileOnDelete: 'restrict', rank: 6,
    fields: [
      { local: 'intentId', col: 'intent_id', type: 'link', to: 'intent' },
      { local: 'decisionId', col: 'decision_id', type: 'link', to: 'decision', nullable: true },
      { local: 'authorityId', col: 'authority_id', type: 'link', to: 'authority', nullable: true },
      { local: 'attempt', col: 'attempt', type: 'int' },
      { local: 'attemptedAt', col: 'attempted_at', type: 'instant' },
      { local: 'provider', col: 'provider', type: 'text', nullable: true },
      { local: 'externalActionId', col: 'external_action_id', type: 'text', nullable: true },
      { local: 'externalReferenceId', col: 'external_reference_id', type: 'link', to: 'externalReference', nullable: true },
      { local: 'result', col: 'result', type: 'text' },
      { local: 'errorClass', col: 'error_class', type: 'text' },
      { local: 'reversibility', col: 'reversibility', type: 'text' },
      { local: 'compensationCode', col: 'compensation_code', type: 'text', nullable: true },
      { local: 'compensatesExecutionId', col: 'compensates_execution_id', type: 'link', to: 'execution', nullable: true },
    ],
    updatable: [],
    alsoUniqueOn: ['profile_id'],
    uniques: [['intent_attempt_key', `(intent_id, attempt)`]],
    checks: [
      ['attempt_check', `attempt >= 1 AND attempt <= 1000`],
      ['result_check', `result = ANY (ARRAY['succeeded','failed','partial','unknown'])`],
      ['error_class_check', `error_class = ANY (ARRAY['none','transient','permanent','unauthorized','rate_limited','validation'])`],
      ['reversibility_check', `reversibility = ANY (ARRAY['reversible','compensable','irreversible'])`],
      ['provider_check', `provider IS NULL OR provider ${OPEN_CODE}`],
      ['compensation_check', `compensation_code IS NULL OR compensation_code ${OPEN_CODE}`],
      ['undo_says_how_check', `compensates_execution_id IS NULL OR compensation_code IS NOT NULL`],
      ['authorization_named_check', `decision_id IS NOT NULL OR authority_id IS NOT NULL`],
      ['result_error_check', `(result = 'succeeded') = (error_class = 'none')`],
      ['automation_only_check', `producer = 'automation'`],
    ],
    triggers: [['guard_authorization', 'BEFORE', 'INSERT', `public.guard_execution_authorization()`]],
  },

  // ------------------------------------------------------------------ outcome
  {
    kind: 'outcome', collection: 'outcomes', table: 'action_outcomes', mutable: false, serverWritten: true, provenance: 'standard', profileOnDelete: 'restrict', rank: 7,
    fields: [
      { local: 'executionId', col: 'execution_id', type: 'link', to: 'execution' },
      { local: 'kind', col: 'kind', type: 'text' },
      { local: 'observedAt', col: 'observed_at', type: 'instant' },
    ],
    updatable: [],
    checks: [
      ['kind_check', `kind = ANY (ARRAY['verified','verification_failed','delivered','acknowledged','accepted','declined','completed','paid','cancelled','followed','expired','no_effect'])`],
    ],
  },

  // ------------------------------------------------------------------- person
  {
    kind: 'person', collection: 'people', table: 'household_people', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    fields: [
      { local: 'displayName', col: 'display_name', type: 'text' },
      { local: 'relationship', col: 'relationship', type: 'text' },
      { local: 'channel', col: 'channel', type: 'text' },
      { local: 'status', col: 'status', type: 'text' },
    ],
    updatable: ['display_name', 'relationship', 'channel', 'status', 'confidence', 'origin_updated_at'],
    checks: [
      ['name_check', `char_length(btrim(display_name)) >= 1 AND char_length(display_name) <= 80`],
      ['relationship_check', `relationship = ANY (ARRAY['co-parent','partner','grandparent','caregiver','neighbor','contractor','friend','other'])`],
      ['channel_check', `channel = ANY (ARRAY['unspecified','sms','email','whatsapp','in-app'])`],
      ['status_check', `status = ANY (ARRAY['active','archived'])`],
    ],
  },

  // ----------------------------------------------------------- responsibility
  {
    kind: 'responsibility', collection: 'responsibilities', table: 'responsibilities', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'about', type: 'ref', prefix: 'about', kinds: CONTENT6, required: true, onDelete: 'noaction' },
      { local: 'responsibleKind', col: 'responsible_kind', type: 'text' },
      { local: 'responsiblePersonId', col: 'responsible_person_id', type: 'link', to: 'person', nullable: true },
      { local: 'responsibleChildId', col: 'responsible_child_id', type: 'link', to: 'member', nullable: true },
      { local: 'state', col: 'state', type: 'text' },
      { local: 'requestedAt', col: 'requested_at', type: 'instant', nullable: true },
      { local: 'acknowledgedAt', col: 'acknowledged_at', type: 'instant', nullable: true },
      { local: 'respondedAt', col: 'responded_at', type: 'instant', nullable: true },
      { local: 'completedAt', col: 'completed_at', type: 'instant', nullable: true },
      { local: 'returnedAt', col: 'returned_at', type: 'instant', nullable: true },
      { local: 'ackDueAt', col: 'ack_due_at', type: 'instant', nullable: true },
      { local: 'stillNeedsMe', col: 'still_needs_me', type: 'bool' },
      { local: 'previousResponsibilityId', col: 'previous_responsibility_id', type: 'link', to: 'responsibility', nullable: true },
    ],
    updatable: ['responsible_kind', 'responsible_person_id', 'responsible_child_id', 'state', 'requested_at', 'acknowledged_at', 'responded_at', 'completed_at', 'returned_at', 'ack_due_at', 'still_needs_me', 'confidence', 'origin_updated_at'],
    checks: [
      ['kind_check', `responsible_kind = ANY (ARRAY['self','person','child'])`],
      ['state_check', `state = ANY (ARRAY['owned','requested','acknowledged','accepted','declined','completed','returned'])`],
      // exactly the holder the kind names
      ['holder_check', `CASE responsible_kind
        WHEN 'self'   THEN responsible_person_id IS NULL AND responsible_child_id IS NULL
        WHEN 'person' THEN responsible_person_id IS NOT NULL AND responsible_child_id IS NULL
        ELSE               responsible_person_id IS NULL AND responsible_child_id IS NOT NULL END`],
      ['lifecycle_check', `CASE state
        WHEN 'owned'        THEN true
        WHEN 'requested'    THEN requested_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'acknowledged' THEN requested_at IS NOT NULL AND acknowledged_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'accepted'     THEN requested_at IS NOT NULL AND responded_at IS NOT NULL AND responsible_kind <> 'self'
        WHEN 'declined'     THEN requested_at IS NOT NULL AND responded_at IS NOT NULL
        WHEN 'completed'    THEN completed_at IS NOT NULL
        ELSE                     returned_at IS NOT NULL AND responsible_kind = 'self' END`],
      ['completed_only_check', `(state = 'completed') = (completed_at IS NOT NULL)`],
      ['returned_only_check', `(state = 'returned') = (returned_at IS NOT NULL)`],
    ],
    // One live owner per thing: a second live handoff of the same item is refused by the database. AS CREATED by the shipping migration;
    // TODAY the rule is per owner (profile_id after household_id): see PER_OWNER_UNIQUENESS (HK13-D24).
    indexes: [['one_live_owner_uq', `ON public.responsibilities (household_id, COALESCE(about_task_id, about_event_id, about_needs_me_id, about_system_id, about_meal_id, about_goal_id)) WHERE state IN ('owned','requested','acknowledged','accepted')`, true]],
  },

  // --------------------------------------------------------------- dependency
  {
    kind: 'dependency', collection: 'dependencies', table: 'dependencies', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'relation', col: 'relation', type: 'text' },
      { local: 'from', type: 'ref', prefix: 'from', kinds: CONTENT6_OPP, required: true, onDelete: 'cascade' },
      { local: 'to', type: 'ref', prefix: 'to', kinds: CONTENT6_OPP, required: true, onDelete: 'cascade' },
      { local: 'status', col: 'status', type: 'text' },
    ],
    updatable: ['status', 'confidence', 'origin_updated_at'],
    checks: [
      ['relation_check', `relation = ANY (ARRAY['requires','part_of','alternative_to'])`],
      ['status_check', `status = ANY (ARRAY['active','removed'])`],
      // The endpoint set is today's (HK-FEATURE-10 added `opportunity`); `specAsCreated` gives the shipping migration its own text back.
      ['not_self_check', dependencyNotSelf(CONTENT6_OPP)],
    ],
    // As F10's widening left it; TODAY per owner (PER_OWNER_UNIQUENESS, HK13-D24).
    indexes: [['live_edge_uq', dependencyLiveEdge(CONTENT6_OPP), true]],
    triggers: [['forbid_cycle', 'BEFORE', 'INSERT OR UPDATE', `public.forbid_dependency_cycle()`]],
  },

  // --------------------------------------------------------------- recurrence
  {
    kind: 'recurrence', collection: 'recurrences', table: 'recurrence_rules', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'about', type: 'ref', prefix: 'about', kinds: ['task', 'event', 'system', 'meal'], required: true, onDelete: 'cascade' },
      { local: 'trigger', col: 'trigger_kind', type: 'text' },
      { local: 'frequency', col: 'frequency', type: 'text', nullable: true },
      { local: 'interval', col: 'interval_count', type: 'int' },
      { local: 'byWeekday', col: 'by_weekday', type: 'smallints', nullable: true },
      { local: 'byMonthDay', col: 'by_month_day', type: 'int', nullable: true },
      { local: 'anchorDate', col: 'anchor_date', type: 'date' },
      { local: 'timeOfDayMinutes', col: 'time_of_day_minutes', type: 'int', nullable: true },
      { local: 'timezone', col: 'timezone', type: 'text' },
      { local: 'endsOn', col: 'ends_on', type: 'date', nullable: true },
      { local: 'occurrenceCount', col: 'occurrence_count', type: 'int', nullable: true },
      { local: 'status', col: 'status', type: 'text' },
    ],
    updatable: ['trigger_kind', 'frequency', 'interval_count', 'by_weekday', 'by_month_day', 'anchor_date', 'time_of_day_minutes', 'timezone', 'ends_on', 'occurrence_count', 'status', 'confidence', 'origin_updated_at'],
    checks: [
      ['trigger_check', `trigger_kind = ANY (ARRAY['schedule','after_completion','manual'])`],
      ['frequency_check', `frequency IS NULL OR frequency = ANY (ARRAY['daily','weekly','monthly','yearly'])`],
      ['manual_check', `(trigger_kind = 'manual') = (frequency IS NULL)`],
      ['interval_check', `interval_count >= 1 AND interval_count <= 366`],
      ['weekday_check', `by_weekday IS NULL OR (COALESCE(frequency = 'weekly', false) AND cardinality(by_weekday) <= 7 AND by_weekday <@ ARRAY[0,1,2,3,4,5,6]::smallint[])`],
      ['month_day_check', `by_month_day IS NULL OR (COALESCE(frequency = 'monthly', false) AND by_month_day >= 1 AND by_month_day <= 31)`],
      ['time_check', `time_of_day_minutes IS NULL OR (time_of_day_minutes >= 0 AND time_of_day_minutes <= 1439)`],
      ['timezone_check', `char_length(timezone) >= 1 AND char_length(timezone) <= 64`],
      ['end_check', `NOT (ends_on IS NOT NULL AND occurrence_count IS NOT NULL) AND (ends_on IS NULL OR ends_on >= anchor_date)`],
      ['count_check', `occurrence_count IS NULL OR (occurrence_count >= 1 AND occurrence_count <= 10000)`],
      ['status_check', `status = ANY (ARRAY['active','paused','ended'])`],
    ],
    // AS CREATED; TODAY per owner (PER_OWNER_UNIQUENESS, HK13-D24).
    indexes: [['one_active_rule_uq', `ON public.recurrence_rules (household_id, COALESCE(about_task_id, about_event_id, about_system_id, about_meal_id)) WHERE status = 'active'`, true]],
  },

  // --------------------------------------------------------------------- goal
  {
    kind: 'goal', collection: 'goals', table: 'goals', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    fields: [
      { local: 'title', col: 'title', type: 'text' },
      { local: 'status', col: 'status', type: 'text' },
      { local: 'targetDate', col: 'target_date', type: 'date', nullable: true },
      { local: 'categoryId', col: 'category_id', type: 'link', to: 'category', nullable: true },
      { local: 'catalogGoalId', col: 'catalog_goal_id', type: 'text', nullable: true },
    ],
    updatable: ['title', 'status', 'target_date', 'category_id', 'catalog_goal_id', 'confidence', 'origin_updated_at'],
    checks: [
      ['title_check', `char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200`],
      ['status_check', `status = ANY (ARRAY['active','achieved','paused','abandoned'])`],
      ['catalog_goal_check', `catalog_goal_id IS NULL OR catalog_goal_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`],
    ],
  },

  // -------------------------------------------------------------- system step
  {
    kind: 'systemStep', collection: 'systemSteps', table: 'system_steps', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'systemId', col: 'system_id', type: 'link', to: 'system' },
      { local: 'position', col: 'position', type: 'int' },
      { local: 'title', col: 'title', type: 'text' },
      { local: 'effortMinutes', col: 'effort_minutes', type: 'int', nullable: true },
    ],
    updatable: ['position', 'title', 'effort_minutes', 'confidence', 'origin_updated_at'],
    // AS CREATED; TODAY per owner, (system_id, profile_id, position) (PER_OWNER_UNIQUENESS, HK13-D24).
    uniques: [['system_position_key', `(system_id, position)`]],
    checks: [
      ['position_check', `position >= 0 AND position <= 999`],
      ['title_check', `char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 200`],
      ['effort_check', `effort_minutes IS NULL OR (effort_minutes >= 0 AND effort_minutes <= 1440)`],
    ],
  },

  // ----------------------------------------------------------------- capacity
  {
    // Local state holds ONE profile with no id; its local id in the cloud is the constant `capacity`, and the
    // (household, profile) key makes a second row impossible.
    kind: 'capacity', collection: 'capacity', table: 'capacity_profiles', singleton: true, mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    fields: [
      { local: 'dayStartMinutes', col: 'day_start_minutes', type: 'int', nullable: true },
      { local: 'dayEndMinutes', col: 'day_end_minutes', type: 'int', nullable: true },
      { local: 'transitionBufferMinutes', col: 'transition_buffer_minutes', type: 'int', nullable: true },
    ],
    updatable: ['day_start_minutes', 'day_end_minutes', 'transition_buffer_minutes', 'confidence', 'origin_updated_at'],
    // A household has one capacity profile per person, so it is a singleton by constraint.
    uniques: [['owner_key', `(household_id, profile_id)`]],
    checks: [
      ['start_check', `day_start_minutes IS NULL OR (day_start_minutes >= 0 AND day_start_minutes <= 1439)`],
      ['end_check', `day_end_minutes IS NULL OR (day_end_minutes >= 1 AND day_end_minutes <= 1440)`],
      ['buffer_check', `transition_buffer_minutes IS NULL OR (transition_buffer_minutes >= 0 AND transition_buffer_minutes <= 240)`],
      ['window_check', `day_start_minutes IS NULL OR day_end_minutes IS NULL OR day_start_minutes < day_end_minutes`],
    ],
  },

  // ------------------------------------------------------------------ pattern
  {
    kind: 'pattern', collection: 'patterns', table: 'patterns', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    fields: [
      { local: 'kind', col: 'kind', type: 'text' },
      { local: 'about', type: 'ref', prefix: 'about', kinds: CONTENT6, required: false, onDelete: 'noaction' },
      { local: 'categoryId', col: 'category_id', type: 'link', to: 'category', nullable: true },
      { local: 'weekday', col: 'weekday', type: 'int', nullable: true },
      { local: 'timeBucket', col: 'time_bucket', type: 'text', nullable: true },
      { local: 'status', col: 'status', type: 'text' },
      { local: 'firstObservedOn', col: 'first_observed_on', type: 'date' },
      { local: 'lastObservedOn', col: 'last_observed_on', type: 'date' },
    ],
    updatable: ['status', 'weekday', 'time_bucket', 'last_observed_on', 'confidence', 'origin_updated_at'],
    checks: [
      ['kind_check', `kind = ANY (ARRAY['routine','deferral','energy','preference','reliability','timing'])`],
      ['weekday_check', `weekday IS NULL OR (weekday >= 0 AND weekday <= 6)`],
      ['bucket_check', `time_bucket IS NULL OR time_bucket = ANY (ARRAY['morning','afternoon','evening'])`],
      ['status_check', `status = ANY (ARRAY['candidate','confirmed','rejected','retired'])`],
      ['observed_order_check', `last_observed_on >= first_observed_on`],
      // A pattern is an inference, and only she can establish one — which is what confirms it.
      ['inference_check', `producer = 'ai-inference'`],
      ['confirmed_check', `status <> 'confirmed' OR confidence = 'established'`],
      ['established_check', `confidence <> 'established' OR status IN ('confirmed','retired')`],
    ],
  },

  // ------------------------------------------------------------ evidence link
  {
    kind: 'evidenceLink', collection: 'evidenceLinks', table: 'evidence_links', mutable: false, provenance: 'standard', profileOnDelete: 'restrict', rank: 6,
    fields: [
      { local: 'for', type: 'ref', prefix: 'for', kinds: ['pattern', 'oneMove', 'intent'], required: true, onDelete: 'noaction' },
      { local: 'support', type: 'ref', prefix: 'support', kinds: [...CONTENT6_R, 'observation'], required: true, onDelete: 'noaction' },
      { local: 'code', col: 'code', type: 'text' },
    ],
    updatable: [],
    checks: [['code_check', `code ${OPEN_CODE}`]],
  },

  // ------------------------------------------------------------ opportunity
  // F10 Work/Career OS. A professional possibility she is tracking — never a verified fact about the
  // world (ADR: F10 semantic contract). The next action is a Task and an interview is an Event, both
  // reached through `dependency` above (`relation: 'part_of'`, endpoint kind `opportunity`); this table
  // carries no next-action text and no interview sub-record, and no structured compensation amount.
  {
    kind: 'opportunity', collection: 'careerOpportunities', table: 'career_opportunities', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    migration: F10_CAREER_MIGRATION,
    fields: [
      { local: 'title', col: 'title', type: 'text' },
      { local: 'organizationName', col: 'organization_name', type: 'text', nullable: true },
      { local: 'opportunityType', col: 'opportunity_type', type: 'text' },
      { local: 'stage', col: 'stage', type: 'text' },
      { local: 'closedReason', col: 'closed_reason', type: 'text', nullable: true },
      { local: 'sourceNote', col: 'source_note', type: 'text', nullable: true },
      { local: 'applicationDeadline', col: 'application_deadline', type: 'date', nullable: true },
      { local: 'followUpDate', col: 'follow_up_date', type: 'date', nullable: true },
      { local: 'contactName', col: 'contact_name', type: 'text', nullable: true },
      { local: 'compensationNote', col: 'compensation_note', type: 'text', nullable: true },
      { local: 'notes', col: 'notes', type: 'text', nullable: true },
      { local: 'stageChangedAt', col: 'stage_changed_at', type: 'instant' },
      { local: 'archivedAt', col: 'archived_at', type: 'instant', nullable: true },
    ],
    updatable: [
      'title', 'organization_name', 'opportunity_type', 'stage', 'closed_reason', 'source_note',
      'application_deadline', 'follow_up_date', 'contact_name', 'compensation_note', 'notes',
      'stage_changed_at', 'archived_at', 'confidence', 'origin_updated_at',
    ],
    checks: [
      ['title_check', `char_length(btrim(title)) >= 1 AND char_length(title) <= 200`],
      ['org_check', `organization_name IS NULL OR char_length(organization_name) <= 120`],
      ['type_check', `opportunity_type = ANY (ARRAY['job','freelance','contract','education_program','other'])`],
      ['stage_check', `stage = ANY (ARRAY['exploring','interested','applied','interviewing','offer','accepted','closed'])`],
      ['closed_reason_check', `closed_reason IS NULL OR closed_reason = ANY (ARRAY['withdrawn','declined_by_organization','offer_rescinded','no_further_response','other'])`],
      // No response is never upgraded to a rejection she never received: a reason is recorded exactly when closed.
      ['closed_pairing_check', `(stage = 'closed') = (closed_reason IS NOT NULL)`],
      ['source_note_check', `source_note IS NULL OR char_length(source_note) <= 300`],
      ['contact_name_check', `contact_name IS NULL OR char_length(contact_name) <= 120`],
      // Deliberately no structured compensation column exists to check: F10 V1 carries compensation only as this free-text note.
      ['compensation_note_check', `compensation_note IS NULL OR char_length(compensation_note) <= 300`],
      ['notes_check', `notes IS NULL OR char_length(notes) <= 1000`],
    ],
  },

  // ------------------------------------------------ HK-FEATURE-11: rebuild focus
  // An area of her own life she chose to keep visible. Owner-private like every kind here. No score, no progress, no completion.
  {
    kind: 'rebuildFocus', collection: 'rebuildFocuses', table: 'rebuild_focuses', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 2,
    migration: F11_REBUILD_MIGRATION,
    fields: [
      { local: 'title', col: 'title', type: 'text' },
      { local: 'note', col: 'note', type: 'text', nullable: true },
      { local: 'state', col: 'state', type: 'text' },
    ],
    updatable: ['title', 'note', 'state', 'confidence', 'origin_updated_at'],
    checks: [
      ['title_check', `char_length(title) >= 1 AND char_length(title) <= 200 AND title = btrim(title)`],
      ['note_check', `note IS NULL OR (char_length(note) >= 1 AND char_length(note) <= 500 AND note = btrim(note))`],
      ['state_check', `state = ANY (ARRAY['active','paused','archived'])`],
    ],
  },

  // ------------------------------------------- HK-FEATURE-11: rebuild focus link
  // A Focus's connection to a canonical Task/Goal/System/Event, by typed reference (ADR-005): exactly one real FK is set. It belongs
  // to its Focus's owner (the same-owner composite FK on focus_id), so it is exactly as private as the Focus. A deleted shared target
  // removes the link (CASCADE) rather than refusing with an error that would reveal it; unlinking is a status change.
  {
    kind: 'rebuildFocusLink', collection: 'rebuildFocusLinks', table: 'rebuild_focus_links', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    migration: F11_REBUILD_MIGRATION,
    fields: [
      { local: 'focusId', col: 'focus_id', type: 'link', to: 'rebuildFocus' },
      { local: 'target', type: 'ref', prefix: 'target', kinds: ['task', 'goal', 'system', 'event'], required: true, onDelete: 'cascade' },
      { local: 'relation', col: 'relation', type: 'text' },
      { local: 'status', col: 'status', type: 'text' },
    ],
    updatable: ['status', 'confidence', 'origin_updated_at'],
    checks: [
      ['relation_check', `relation = ANY (ARRAY['next_action','supports'])`],
      ['next_action_task_check', `relation <> 'next_action' OR target_type = 'task'`],
      ['status_check', `status = ANY (ARRAY['active','removed'])`],
    ],
    indexes: [['live_link_uq', `ON public.rebuild_focus_links (household_id, profile_id, focus_id, target_type, COALESCE(target_task_id, target_goal_id, target_system_id, target_event_id)) WHERE status = 'active'`, true]],
    // A link may name only what its writer can see: a task/event/routine another member keeps private is "not there".
    triggers: [['target_visible', 'BEFORE', 'INSERT', 'private.rebuild_focus_link_target_visible()']],
  },

  // ----------------------------------------------------------- person context (HK-FEATURE-13, People OS)
  {
    // What SHE wants Her Keys to remember about one canonical person. Owner-private like every foundation row; exactly one real
    // foreign key names the person — a CHILD member (the existing child-proving key, so the account holder, an adult, can never be
    // named) or her own non-account person. One per owner and person, and the boundary is the OWNER's: another member of the
    // household making her own context on the same child can never collide with, and so never learn of, this one.
    kind: 'personContext', collection: 'personContexts', table: 'person_contexts', mutable: true, provenance: 'standard', profileOnDelete: 'cascade', rank: 3,
    migration: F13_PEOPLE_MIGRATION,
    fields: [
      { local: 'childId', col: 'child_id', type: 'link', to: 'member', nullable: true },
      { local: 'personId', col: 'person_id', type: 'link', to: 'person', nullable: true },
      { local: 'relationshipName', col: 'relationship_name', type: 'text', nullable: true },
      { local: 'organizationName', col: 'organization_name', type: 'text', nullable: true },
      { local: 'contextNote', col: 'context_note', type: 'text', nullable: true },
      { local: 'status', col: 'status', type: 'text' },
    ],
    // Which person it is about is fixed at insert: a context is never re-pointed at somebody else.
    updatable: ['relationship_name', 'organization_name', 'context_note', 'status', 'origin_updated_at'],
    checks: [
      ['one_person_check', `(child_id IS NULL) <> (person_id IS NULL)`],
      ['relationship_name_check', `relationship_name IS NULL OR (relationship_name = btrim(relationship_name) AND char_length(relationship_name) >= 1 AND char_length(relationship_name) <= 60 AND relationship_name !~ '[[:cntrl:]]')`],
      ['organization_name_check', `organization_name IS NULL OR (organization_name = btrim(organization_name) AND char_length(organization_name) >= 1 AND char_length(organization_name) <= 80 AND organization_name !~ '[[:cntrl:]]')`],
      // Line breaks and tabs are hers; any other control character is refused.
      ['context_note_check', `context_note IS NULL OR (context_note = btrim(context_note) AND char_length(context_note) >= 1 AND char_length(context_note) <= 500 AND replace(replace(replace(context_note, chr(10), ''), chr(13), ''), chr(9), '') !~ '[[:cntrl:]]')`],
      ['status_check', `status = ANY (ARRAY['active','archived'])`],
      // What she tells Her Keys about a person is hers. An inference about a person is not a relationship fact.
      ['stated_by_her_check', `producer = 'user-action'`],
    ],
    indexes: [
      ['one_per_child_uq', `ON public.person_contexts (household_id, profile_id, child_id) WHERE child_id IS NOT NULL`, true],
      ['one_per_person_uq', `ON public.person_contexts (household_id, profile_id, person_id) WHERE person_id IS NOT NULL`, true],
    ],
  },

  // -------------------------------------------------------- person task link (HK-FEATURE-13, People OS)
  {
    // "This Task is a follow-up I created from this person context." Created once, with the Task, and never edited. The Task must be
    // one of the caller's OWN private tasks, and that is checked BEFORE any key is consulted (`guard_follow_up_task`), so a link can
    // neither expose private context through a household-visible Task nor be used to probe for somebody else's private Task.
    kind: 'personTaskLink', collection: 'personTaskLinks', table: 'person_task_links', mutable: false, provenance: 'standard', profileOnDelete: 'cascade', rank: 4,
    migration: F13_PEOPLE_MIGRATION,
    fields: [
      { local: 'contextId', col: 'context_id', type: 'link', to: 'personContext' },
      { local: 'followUp', type: 'ref', prefix: 'follow_up', kinds: ['task'], required: true, onDelete: 'cascade' },
      { local: 'relation', col: 'relation', type: 'text' },
    ],
    updatable: [],
    checks: [
      ['relation_check', `relation = 'follow_up'`],
      ['stated_by_her_check', `producer = 'user-action'`],
    ],
    indexes: [['one_link_per_task_uq', `ON public.person_task_links (household_id, profile_id, follow_up_task_id)`, true]],
    triggers: [['follow_up_task_guard', 'BEFORE', 'INSERT', `public.guard_follow_up_task()`]],
  },
];

/**
 * A typed-reference kind that an ADDITIVE migration added to a table an EARLIER migration created (HK-F01-F13 integration, INT13-01).
 *
 * The manifest describes every table as it is NOW, because the sync engine projects and reads today's columns. When a later feature
 * widens an existing table's typed reference, the widening belongs to that feature's own additive migration: the table's creating
 * migration may already be applied to a populated database, so it is never regenerated. The generator emits the creating migration
 * from `specAsCreated` (the spec with the widening taken back out) and emits the widening itself — the new columns, the re-issued
 * reference checks, the new foreign keys and their indexes, the re-issued rules whose text names every endpoint, and the new
 * columns' INSERT grant — into the additive migration named here.
 */
export interface RefExtension {
  /** The ADDITIVE migration that makes the widening. */
  migration: string;
  kind: FoundationKind;
  /** The typed-reference fields, by prefix, that gain the kinds. */
  prefixes: readonly string[];
  added: readonly TypedRefKind[];
  /** The rules whose text names every endpoint, AS THE CREATING MIGRATION WROTE THEM (the spec itself holds today's text). */
  createdChecks: ReadonlyArray<readonly [string, string]>;
  createdIndexes: ReadonlyArray<readonly [string, string, boolean]>;
}

export const REF_EXTENSIONS: readonly RefExtension[] = [
  {
    // HK-FEATURE-10: a Task or an Event can be `part_of` a career opportunity, through the one Dependency edge a Goal's steps use.
    migration: F10_CAREER_MIGRATION, kind: 'dependency', prefixes: ['from', 'to'], added: ['opportunity'],
    createdChecks: [['not_self_check', dependencyNotSelf(CONTENT6)]],
    createdIndexes: [['live_edge_uq', dependencyLiveEdge(CONTENT6), true]],
  },
];

/**
 * Uniqueness rules a LATER migration re-issued PER OWNER (HK13-D24, `20260922210000_int13_per_owner_uniqueness.sql`, hand-written).
 *
 * Each of these tables is owner-private, yet its rule spanned the household: a member's ordinary action on a SHARED item was refused
 * exactly when another member privately held a row there — a relationship inference leak. The specs above keep each rule AS the
 * earlier migrations wrote it, so the generated shipping and F10 regions never change; this is the rule the database enforces TODAY
 * (the same columns, with `profile_id` after the household). A device only ever holds its own owner's rows of these tables, so the
 * pull's clash rules (`clash.ts`) and the client's DOMAIN_INVARIANTS (index names unchanged) already see exactly this per-owner rule.
 */
export const PER_OWNER_UNIQUENESS: ReadonlyArray<{ kind: FoundationKind; name: string; columns: string }> = [
  { kind: 'responsibility', name: 'responsibilities_one_live_owner_uq', columns: 'household_id, profile_id, about' },
  { kind: 'dependency', name: 'dependencies_live_edge_uq', columns: 'household_id, profile_id, relation, from, to' },
  { kind: 'recurrence', name: 'recurrence_rules_one_active_rule_uq', columns: 'household_id, profile_id, about' },
  { kind: 'systemStep', name: 'system_steps_system_position_key', columns: 'system_id, profile_id, position' },
];

/** A spec exactly as the migration that CREATED its table created it: every later `RefExtension` taken back out. */
export function specAsCreated(spec: FoundationSpec): FoundationSpec {
  const extensions = REF_EXTENSIONS.filter((ext) => ext.kind === spec.kind);
  if (extensions.length === 0) return spec;
  const createdCheck = new Map(extensions.flatMap((ext) => ext.createdChecks.map(([name, body]) => [name, body] as const)));
  const createdIndex = new Map(extensions.flatMap((ext) => ext.createdIndexes.map((row) => [row[0], row] as const)));
  return {
    ...spec,
    fields: spec.fields.map((f) => {
      if (f.type !== 'ref') return f;
      const added = extensions.filter((ext) => ext.prefixes.includes(f.prefix)).flatMap((ext) => ext.added);
      return added.length === 0 ? f : { ...f, kinds: f.kinds.filter((kind) => !added.includes(kind)) };
    }),
    checks: spec.checks?.map(([name, body]) => [name, createdCheck.get(name) ?? body] as const),
    indexes: spec.indexes?.map((row) => createdIndex.get(row[0]) ?? row),
  };
}

/** Sync kinds the manifest adds, in dependency order. */
export const FOUNDATION_KINDS = FOUNDATION_SPECS.map((spec) => spec.kind);

export const specOf = (kind: string): FoundationSpec | undefined => FOUNDATION_SPECS.find((spec) => spec.kind === kind);

/** A column an EXISTING kind gained: a commitment facet. `check` is the column's own CHECK; row-level rules are in `EXISTING_ROW_CHECKS`. */
export interface FacetColumn {
  local: string;
  col: string;
  type: ScalarType | 'money';
  nullable: boolean;
  def?: string;
  check?: string;
  prefix?: string;
}

const ENERGY = `energy_demand IS NULL OR energy_demand = ANY (ARRAY['low','moderate','high'])`;
const CONSEQUENCE = `consequence IS NULL OR consequence = ANY (ARRAY['low','moderate','high','critical'])`;
const TRAVEL = (col: string) => `${col} IS NULL OR (${col} >= 0 AND ${col} <= 240)`;

/** Facets the existing kinds gained, as cloud columns. Used by the generator's ALTERs and by projection. */
export const EXISTING_FACETS: Record<string, readonly FacetColumn[]> = {
  task: [
    { local: 'dueAt', col: 'due_at', type: 'instant', nullable: true },
    { local: 'earliestStartAt', col: 'earliest_start_at', type: 'instant', nullable: true },
    { local: 'latestFinishAt', col: 'latest_finish_at', type: 'instant', nullable: true },
    { local: 'splittable', col: 'splittable', type: 'bool', nullable: true },
    { local: 'minChunkMinutes', col: 'min_chunk_minutes', type: 'int', nullable: true, check: `min_chunk_minutes IS NULL OR (min_chunk_minutes >= 5 AND min_chunk_minutes <= 1440)` },
    { local: 'preferredTimeOfDay', col: 'preferred_time_of_day', type: 'text', nullable: true, check: `preferred_time_of_day IS NULL OR preferred_time_of_day = ANY (ARRAY['morning','afternoon','evening'])` },
    { local: 'energyDemand', col: 'energy_demand', type: 'text', nullable: true, check: ENERGY },
    { local: 'consequence', col: 'consequence', type: 'text', nullable: true, check: CONSEQUENCE },
    { local: 'needsMePersonally', col: 'needs_me_personally', type: 'bool', nullable: true },
    { local: 'travelMinutesBefore', col: 'travel_minutes_before', type: 'int', nullable: true, check: TRAVEL('travel_minutes_before') },
    { local: 'travelMinutesAfter', col: 'travel_minutes_after', type: 'int', nullable: true, check: TRAVEL('travel_minutes_after') },
    { local: 'preparationMinutes', col: 'preparation_minutes', type: 'int', nullable: true, check: TRAVEL('preparation_minutes') },
    { local: 'value', col: 'value', type: 'money', nullable: true, prefix: 'value' },
  ],
  event: [
    { local: 'energyDemand', col: 'energy_demand', type: 'text', nullable: true, check: ENERGY },
    { local: 'consequence', col: 'consequence', type: 'text', nullable: true, check: CONSEQUENCE },
    { local: 'needsMePersonally', col: 'needs_me_personally', type: 'bool', nullable: true },
    { local: 'value', col: 'value', type: 'money', nullable: true, prefix: 'value' },
  ],
  meal: [
    { local: 'prepMinutes', col: 'prep_minutes', type: 'int', nullable: true, check: TRAVEL('prep_minutes') },
    { local: 'energyDemand', col: 'energy_demand', type: 'text', nullable: true, check: ENERGY },
  ],
  system: [
    { local: 'automationMode', col: 'automation_mode', type: 'text', nullable: false, def: `'manual'`, check: `automation_mode = ANY (ARRAY['manual','suggest','prepare','ask_approval','execute_authorized'])` },
    { local: 'effortMinutes', col: 'effort_minutes', type: 'int', nullable: true, check: `effort_minutes IS NULL OR (effort_minutes >= 0 AND effort_minutes <= 1440)` },
    { local: 'energyDemand', col: 'energy_demand', type: 'text', nullable: true, check: ENERGY },
  ],
};

/** Row-level rules the local schema states across facets, mirrored by the cloud. [kind, name suffix, expression]. */
export const EXISTING_ROW_CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['task', 'window_check', `earliest_start_at IS NULL OR latest_finish_at IS NULL OR earliest_start_at <= latest_finish_at`],
  ['task', 'chunk_split_check', `min_chunk_minutes IS NULL OR splittable IS TRUE`],
  ['task', 'chunk_length_check', `min_chunk_minutes IS NULL OR min_chunk_minutes <= duration_minutes`],
];

/** The kinds whose local rows carry provenance and so gained the three provenance columns. */
export const PROVENANCE_EXISTING: Record<string, { table: string; ownerPrivate: boolean }> = {
  category: { table: 'household_categories', ownerPrivate: false },
  event: { table: 'events', ownerPrivate: false },
  task: { table: 'tasks', ownerPrivate: false },
  system: { table: 'household_systems', ownerPrivate: false },
  meal: { table: 'meal_plan_entries', ownerPrivate: false },
  needsMe: { table: 'needs_me_items', ownerPrivate: true },
  oneMove: { table: 'one_move_records', ownerPrivate: true },
  discovery: { table: 'discovery_records', ownerPrivate: true },
  onboarding: { table: 'onboarding_state', ownerPrivate: true },
};

/** Producers a synced row may carry. `demo-seed` is absent: a rehearsal never reaches the cloud (B4-P0-010). */
export const CLOUD_PRODUCERS = ['onboarding', 'user-action', 'talk-it-out', 'system-derived', 'import-sync', 'ai-inference', 'automation', 'legacy-unknown'] as const;
