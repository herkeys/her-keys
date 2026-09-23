import type { AppState } from '../state';
import { titleForCloud, type Interpretation } from '../foundation/interpretation';
import { KIND_CLOUD } from '../foundation/typedRef';
import { FOUNDATION_SPECS, columnsOfSpec, type FoundationKind, type FoundationSpec } from './foundationSpecs';
import {
  applyBoolean,
  applyInstant,
  applyNumber,
  applyString,
  boolOrNull,
  instant,
  instantOr,
  numOrNull,
  provenanceFromRow,
  str,
  strOrNull,
  upsert,
  type LocalIdResolver,
} from './applySupport';
import { UnresolvedReferenceError, childRef, cloudRef, provenanceColumns, require_, type ProjectionContext } from './projectionSupport';
import type { MappedKind } from './syncTypes';

/**
 * LOCAL <-> CLOUD, for the nineteen foundation kinds.
 *
 * ONE interpreter of the manifest in `foundationSpecs.ts`, in both directions, so that a
 * field cannot be written to one column and read from another. It translates and never
 * reinterprets: a pulled row arrives meaning exactly what it meant when it was pushed
 * (B4-INGESTION-LOCK) — no confidence is promoted, no producer changed, no inference turned
 * into a stated fact because it crossed the network.
 *
 * Not a second sync architecture. The same queue, push engine, CAS, cursor and pull engine
 * carry these rows; this file only says what a row of each kind looks like on either side.
 */

const SPEC_BY_KIND = new Map<FoundationKind, FoundationSpec>(FOUNDATION_SPECS.map((spec) => [spec.kind, spec]));

export const isFoundationKind = (kind: string): kind is FoundationKind => SPEC_BY_KIND.has(kind as FoundationKind);

type LocalRow = Record<string, unknown>;

const localRows = (state: AppState, spec: FoundationSpec): LocalRow[] => {
  const held = (state as unknown as Record<string, unknown>)[spec.collection];
  if (spec.singleton) return held === null || held === undefined ? [] : [{ ...(held as LocalRow), id: 'capacity' }];
  return Array.isArray(held) ? (held as LocalRow[]) : [];
};

/** The local row for a foundation kind, or undefined when it is no longer in state. */
export function foundationLocalRow(state: AppState, kind: FoundationKind, localId: string): LocalRow | undefined {
  const spec = SPEC_BY_KIND.get(kind)!;
  return localRows(state, spec).find((row) => row.id === localId);
}

// ------------------------------------------------------------------ outbound ---

export function foundationToCloudRow(state: AppState, ctx: ProjectionContext, kind: FoundationKind, localId: string): Record<string, unknown> {
  const spec = SPEC_BY_KIND.get(kind)!;
  const row = require_(foundationLocalRow(state, kind, localId), kind, localId);

  const out: Record<string, unknown> = {
    household_id: ctx.householdId,
    local_id: localId,
    profile_id: ctx.profileId,
  };

  for (const field of spec.fields) {
    const value = row[field.local];

    if (field.type === 'ref') {
      const ref = (value ?? null) as { kind: string; id: string } | null;
      out[`${field.prefix}_type`] = ref?.kind ?? null;
      for (const refKind of field.kinds) {
        const column = `${field.prefix}_${KIND_CLOUD[refKind].column}`;
        if (ref !== null && ref.kind === refKind) {
          const cloud = cloudRef(ctx, refKind as MappedKind, ref.id);
          if (cloud === null) throw new UnresolvedReferenceError(kind, localId, `${refKind} ${ref.id}`);
          out[column] = cloud;
        } else {
          out[column] = null;
        }
      }
    } else if (field.type === 'money') {
      const money = (value ?? null) as { amountMinor: number; currency: string; direction: string } | null;
      out[`${field.prefix}_amount_minor`] = money?.amountMinor ?? null;
      out[`${field.prefix}_currency`] = money?.currency ?? null;
      if (!field.noDirection) out[`${field.prefix}_direction`] = money?.direction ?? null;
    } else if (field.type === 'link') {
      const id = (value ?? null) as string | null;
      const cloud = field.to === 'member' ? childRef(ctx, id) : cloudRef(ctx, field.to as MappedKind, id);
      if (id !== null && cloud === null) throw new UnresolvedReferenceError(kind, localId, `${field.to} ${id}`);
      out[field.col] = cloud;
    } else {
      out[field.col] = value ?? null;
    }
  }

  // OD-A: a reading's title is copied from or derived from her words, so until she accepts it the cloud is given a neutral label.
  // Decided here, at the boundary, from the row as it is when it is SENT: a reading queued while pending and accepted before the
  // push goes out with its accepted title, and a superseded or rejected one never carries its title at all.
  if (kind === 'interpretation') out.title = titleForCloud(row as unknown as Interpretation);

  if (spec.provenance === 'standard') Object.assign(out, provenanceColumns(ctx, kind, localId, row.provenance as never));
  out.scope = 'personal';
  out.origin_created_at = row.createdAt;
  if (spec.updatable.includes('origin_updated_at')) out.origin_updated_at = row.updatedAt;
  return out;
}

/** Every key an outbound row may carry: the columns the client is allowed to name on INSERT. */
export const insertableColumnsOf = (spec: FoundationSpec): string[] => columnsOfSpec(spec).filter((c) => c.insert).map((c) => c.name);

// ------------------------------------------------------------------- inbound ---

export function applyFoundationRow(
  state: AppState,
  kind: FoundationKind,
  localId: string,
  row: Record<string, unknown>,
  resolve: LocalIdResolver
): AppState {
  const spec = SPEC_BY_KIND.get(kind)!;
  const local: LocalRow = {};
  if (!spec.singleton) local.id = localId;

  for (const field of spec.fields) {
    if (field.type === 'ref') {
      const type = strOrNull(row[`${field.prefix}_type`]);
      if (type === null) {
        local[field.local] = null;
        continue;
      }
      const refKind = field.kinds.find((k) => k === type);
      const column = refKind === undefined ? null : `${field.prefix}_${KIND_CLOUD[refKind].column}`;
      const cloud = column === null ? null : strOrNull(row[column]);
      // An unresolved reference keeps the raw uuid, so the local integrity gate names it and the
      // cursor does not advance past a batch that cannot be made whole.
      local[field.local] = { kind: type, id: resolve(cloud) ?? str(cloud) };
    } else if (field.type === 'money') {
      const amount = row[`${field.prefix}_amount_minor`];
      local[field.local] =
        amount === null || amount === undefined
          ? null
          : {
              amountMinor: Number(amount),
              currency: str(row[`${field.prefix}_currency`]),
              direction: str(row[`${field.prefix}_direction`]),
            };
    } else if (field.type === 'link') {
      const cloud = strOrNull(row[field.col]);
      local[field.local] = cloud === null ? null : (resolve(cloud) ?? cloud);
    } else if (field.type === 'bool') {
      local[field.local] = field.nullable ? boolOrNull(row[field.col]) : applyBoolean(row[field.col]);
    } else if (field.type === 'int' || field.type === 'bigint') {
      local[field.local] = field.nullable ? numOrNull(row[field.col]) : applyNumber(row[field.col]);
    } else if (field.type === 'instant') {
      local[field.local] = field.nullable ? instant(row[field.col]) : applyInstant(row[field.col]);
    } else if (field.type === 'smallints') {
      local[field.local] = Array.isArray(row[field.col]) ? (row[field.col] as unknown[]).map(Number) : null;
    } else {
      local[field.local] = field.nullable ? strOrNull(row[field.col]) : applyString(row[field.col]);
    }
  }

  if (spec.provenance === 'standard') local.provenance = provenanceFromRow(row, resolve);
  local.scope = 'personal';
  local.createdAt = instantOr(row.origin_created_at, str(row.origin_created_at));
  if (spec.updatable.includes('origin_updated_at')) local.updatedAt = instantOr(row.origin_updated_at, str(row.origin_updated_at));

  const next = state as unknown as Record<string, unknown>;
  if (spec.singleton) return { ...next, [spec.collection]: local } as unknown as AppState;
  const existing = (next[spec.collection] ?? []) as Array<{ id: string }>;
  return { ...next, [spec.collection]: upsert(existing, local as { id: string }) } as unknown as AppState;
}
