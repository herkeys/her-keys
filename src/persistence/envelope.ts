import { z } from 'zod';
import { AppStateSchema, validateAppState, type AppState } from '../domain/state';
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

export const CURRENT_SCHEMA_VERSION = 1;

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
  | { kind: 'valid'; state: AppState; writeSeq: number; migratedFrom: number | null }
  | { kind: 'future_version'; storedVersion: number }
  | { kind: 'invalid'; reason: InvalidReason; issues: string[] };

const EnvelopeSchema = z.strictObject({
  schemaVersion: z.number().int(),
  appVersion: z.string().min(1).max(40),
  savedAt: z.iso.datetime(),
  writeSeq: z.number().int().min(0).max(MAX_WRITE_SEQUENCE),
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

export const migrationPlan: MigrationPlan = {
  currentVersion: CURRENT_SCHEMA_VERSION,
  migrations: new Map(),
  validators: new Map([[1, (data: unknown) => AppStateSchema.safeParse(data).success]]),
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
  };
}

/** Refuses to write anything it wouldn't accept back, so a bug can't persist a state that fails the next launch. */
export function encodeStoredState(state: AppState, meta: { appVersion: string; savedAt: string; writeSeq: number }): string {
  const validated = validateAppState(state);
  if (!validated.ok) throw new Error(`Refusing to store invalid state (${validated.reason}): ${validated.issues.join('; ')}`);

  const envelope = EnvelopeSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: meta.appVersion,
    savedAt: meta.savedAt,
    writeSeq: meta.writeSeq,
    data: validated.state,
  });
  return JSON.stringify(envelope);
}

function invalid(reason: InvalidReason, issues: string[] = []): DecodedState {
  return { kind: 'invalid', reason, issues };
}
