import { z } from 'zod';
import { AppStateSchema, validateAppState, type AppState } from '../domain/state';
import { IdentityRecordSchema, UNBOUND_IDENTITY, type IdentityRecord } from '../domain/account/binding';
import { isValidV1AppState } from './legacySchemas';
import { isValidV2AppState } from './legacySchemasV2';
import { isValidV3AppState } from './legacySchemasV3';
import { migrateV3ToV4 } from './migrateV3ToV4';
import { MAX_WRITE_SEQUENCE } from './writeQueue';

/**
 * How household state sits on disk:
 *
 *   { schemaVersion, appVersion, savedAt, writeSeq, data }
 *
 * `schemaVersion` describes `data`. It moves only when the stored shape
 * changes, and each bump comes with a migration from the version before, so
 * an app update never has to throw a household away.
 */

export const CURRENT_SCHEMA_VERSION = 4;

export type InvalidReason =
  | 'malformed_json'
  | 'not_an_object'
  | 'missing_schema_version'
  | 'invalid_schema_version'
  | 'unsupported_schema_version'
  | 'invalid_envelope'
  | 'migration_failed'
  | 'invalid_state'
  | 'integrity_violation';

export type DecodedState =
  | { kind: 'valid'; state: AppState; writeSeq: number; migratedFrom: number | null; identity: IdentityRecord }
  | { kind: 'future_version'; storedVersion: number }
  | { kind: 'invalid'; reason: InvalidReason; issues: string[] };

const EnvelopeSchema = z.strictObject({
  schemaVersion: z.number().int(),
  appVersion: z.string().min(1).max(40),
  savedAt: z.iso.datetime(),
  writeSeq: z.number().int().min(0).max(MAX_WRITE_SEQUENCE),
  /**
   * Which account this household belongs to, if any.
   *
   * It sits beside `data` rather than inside it because it describes the blob,
   * not the household -- the same axis as appVersion and writeSeq -- and because
   * one atomic write then keeps the binding and the content it refers to
   * consistent with each other. It holds NO credential: access and refresh
   * tokens never reach ordinary household storage (B4-P0-013).
   *
   * Absent in every v2 blob, which is exactly what an unbound device means.
   */
  identity: IdentityRecordSchema.nullish(),
  data: z.unknown().refine((value) => value !== undefined, { message: 'Missing data' }),
});

export type Migration = (data: unknown) => unknown;

export interface MigrationPlan {
  currentVersion: number;
  /** `migrations.get(n)` turns version n data into version n + 1. */
  migrations: ReadonlyMap<number, Migration>;
  /** Shape check for each version, run on every migration's input and output. */
  validators: ReadonlyMap<number, (data: unknown) => boolean>;
}

/**
 * Build 3 — events and tasks gain fields the v1 shape never had. None of them
 * can be known for data that predates the field, so every backfill is either
 * `null` (unknown) or the most conservative real value: a pre-existing event's
 * `commitment` becomes `'fixed'` rather than assumed movable, and it's tagged
 * `source: 'demo'` because only the demo seed ever produced an event before
 * Build 3 shipped real event capture.
 */
function migrateV1ToV2(data: unknown): unknown {
  const v1 = data as {
    events: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
    oneMoves: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };

  return {
    ...v1,
    events: v1.events.map((event) => ({
      ...event,
      commitment: 'fixed',
      status: 'active',
      notes: null,
      travelMinutesBefore: null,
      travelMinutesAfter: null,
      preparationMinutes: null,
      source: 'demo',
      createdAt: null,
      updatedAt: null,
    })),
    tasks: v1.tasks.map((task) => ({
      ...task,
      status: 'open',
      notes: null,
      completedAt: null,
      createdAt: null,
      updatedAt: null,
    })),
    oneMoves: v1.oneMoves.map((record) => ({ ...record, targetType: 'catalog' })),
    needsMe: [],
  };
}

/**
 * Build 4 — the local evidence channel arrives, and one thing has to move into
 * it (B4-BE02-OR-002).
 *
 * The v1 -> v2 migration stamped `targetType: 'catalog'` onto EVERY v1 One Move
 * regardless of origin, on the assumption that only the demo seed had ever
 * produced content. That assumption did not hold for a real household, so a
 * real household can be carrying One Moves whose target is a fictional demo
 * catalog item — a target that `oneMoveCatalogFor('empty')` cannot resolve and
 * the app already cannot render.
 *
 * Those records are not truthful current relationships, but they are truthful
 * HISTORY: on that day she made a One Move decision, and she selected or
 * completed it. So the record leaves the claimable collection and its surviving
 * facts move into `migrationEvidence`, verbatim. The target is not fabricated,
 * the outcome is not rewritten, and nothing is silently dropped.
 *
 * Demo households are untouched: there `catalog` is exactly what it says, and a
 * demo household never claims or syncs anyway.
 *
 * Pure and idempotent. The evidence id is derived from the original record, so
 * re-running this can only produce the same entry, never a second one.
 */
function migrateV2ToV3(data: unknown): unknown {
  const v2 = data as {
    origin: 'demo' | 'empty';
    oneMoves: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };

  if (v2.origin === 'demo') return { ...v2, migrationEvidence: [] };

  const kept: Array<Record<string, unknown>> = [];
  const evidence: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const record of v2.oneMoves) {
    if (record.targetType !== 'catalog') {
      kept.push(record);
      continue;
    }
    const id = `evidence:${String(record.id)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    evidence.push({
      id,
      kind: 'one-move',
      reason: 'LEGACY_REAL_CATALOG_ONE_MOVE',
      sourceSchemaVersion: 2,
      original: {
        oneMoveId: record.id,
        forDate: record.forDate,
        targetId: record.targetId,
        targetType: record.targetType,
        status: record.status,
        decidedAt: record.decidedAt,
        completedAt: record.completedAt,
        scope: record.scope,
      },
    });
  }

  return { ...v2, oneMoves: kept, migrationEvidence: evidence };
}

export const migrationPlan: MigrationPlan = {
  currentVersion: CURRENT_SCHEMA_VERSION,
  migrations: new Map([
    [1, migrateV1ToV2],
    [2, migrateV2ToV3],
    // B4-FOUNDATION-BUILDOUT-01: provenance becomes stored truth (see migrateV3ToV4.ts).
    [3, migrateV3ToV4],
  ]),
  validators: new Map([
    [1, isValidV1AppState],
    [2, isValidV2AppState],
    // v3 is validated against its FROZEN schema, never the live one.
    [3, isValidV3AppState],
    [4, (data: unknown) => AppStateSchema.safeParse(data).success],
  ]),
};

export function migrateStoredState(
  fromVersion: number,
  data: unknown,
  plan: MigrationPlan = migrationPlan
): { ok: true; data: unknown } | { ok: false; reason: 'unsupported_schema_version' | 'migration_failed' } {
  if (fromVersion < 1 || fromVersion > plan.currentVersion) return { ok: false, reason: 'unsupported_schema_version' };

  let current = data;
  for (let version = fromVersion; version < plan.currentVersion; version++) {
    const step = plan.migrations.get(version);
    const input = plan.validators.get(version);
    const output = plan.validators.get(version + 1);
    if (!step || (input && !input(current))) return { ok: false, reason: 'migration_failed' };

    try {
      current = step(current);
    } catch {
      return { ok: false, reason: 'migration_failed' };
    }
    if (output && !output(current)) return { ok: false, reason: 'migration_failed' };
  }

  return { ok: true, data: current };
}

/** Raw stored text in, trusted state or a classified failure out. Nothing is assumed about the text. */
export function decodeStoredState(raw: string, plan: MigrationPlan = migrationPlan): DecodedState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalid('malformed_json');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('not_an_object');
  if (!('schemaVersion' in parsed)) return invalid('missing_schema_version');

  const version = (parsed as { schemaVersion: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return invalid('invalid_schema_version');

  // Written by a newer app: don't read it with older rules.
  if (version > plan.currentVersion) return { kind: 'future_version', storedVersion: version };
  if (version < 1) return invalid('unsupported_schema_version');

  const envelope = EnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return invalid('invalid_envelope', envelope.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
  }

  const migrated = migrateStoredState(version, envelope.data.data, plan);
  if (!migrated.ok) return invalid(migrated.reason);

  const validated = validateAppState(migrated.data);
  if (!validated.ok) return invalid(validated.reason, validated.issues);

  return {
    kind: 'valid',
    state: validated.state,
    writeSeq: envelope.data.writeSeq,
    migratedFrom: version === plan.currentVersion ? null : version,
    identity: envelope.data.identity ?? UNBOUND_IDENTITY,
  };
}

/** Refuses to write anything it wouldn't accept back, so a bug can't persist a state that fails the next launch. */
export function encodeStoredState(
  state: AppState,
  meta: { appVersion: string; savedAt: string; writeSeq: number; identity?: IdentityRecord }
): string {
  const validated = validateAppState(state);
  if (!validated.ok) throw new Error(`Refusing to store invalid state (${validated.reason}): ${validated.issues.join('; ')}`);

  const envelope = EnvelopeSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: meta.appVersion,
    savedAt: meta.savedAt,
    writeSeq: meta.writeSeq,
    identity: meta.identity ?? UNBOUND_IDENTITY,
    data: validated.state,
  });
  return JSON.stringify(envelope);
}

function invalid(reason: InvalidReason, issues: string[] = []): DecodedState {
  return { kind: 'invalid', reason, issues };
}
