import type { z } from 'zod';
import type { eventFacetFields, mealFacetFields, systemFacetFields, taskFacetFields } from '../foundation/commitment';
import { PROVENANCE_SOURCES, carriesConfidence, legacyProvenance, type Provenance, type ProvenanceSource } from '../foundation/provenance';
import { EXISTING_FACETS } from './foundationSpecs';

/**
 * The inbound half's shared pieces: how a cloud value becomes a local one, and how a pulled
 * row's provenance and facets are read. A pulled row is transported, never reinterpreted
 * (B4-INGESTION-LOCK): nothing here promotes a confidence, turns an inference into a stated
 * fact or guesses a producer.
 */

/** Cloud uuid -> the local id this device uses for it. */
export type LocalIdResolver = (cloudId: string | null | undefined) => string | null;

export function upsert<T extends { id: string }>(rows: readonly T[], row: T): T[] {
  const index = rows.findIndex((existing) => existing.id === row.id);
  if (index === -1) return [...rows, row];
  const next = [...rows];
  next[index] = row;
  return next;
}

export const str = (value: unknown): string => String(value ?? '');
export const strOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
export const num = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : fallback);
export const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
export const boolOrNull = (value: unknown): boolean | null => (value === null || value === undefined ? null : Boolean(value));

/** A required value of each scalar type, for a column the cloud declares NOT NULL. */
export const applyString = (value: unknown): string => String(value ?? '');
export const applyNumber = (value: unknown): number => Number(value ?? 0);
export const applyBoolean = (value: unknown): boolean => Boolean(value);

/**
 * A timestamptz, in the one form local state stores.
 *
 * PostgREST hands back whatever Postgres rendered -- `2026-09-20 12:00:00+00`
 * on this stack -- and the local model wants a canonical UTC instant. The same
 * moment, written the way the household already writes it; the value is never
 * shifted, only re-rendered.
 */
export const instant = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** The same, where the local model requires a value rather than allowing null. */
export const instantOr = (value: unknown, fallback: string): string => instant(value) ?? fallback;
export const applyInstant = (value: unknown): string => instantOr(value, String(value ?? ''));

/**
 * Whether a value this device would send equals what the cloud holds. Timestamps come back in Postgres'
 * rendering, so the same moment is the same value; a number and its string are the same amount.
 */
export function sameCloudValue(a: unknown, b: unknown): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => sameCloudValue(v, y[i]));
  const looksLikeInstant = (v: unknown) => /^\d{4}-\d{2}-\d{2}[ T]\d/.test(String(v));
  if (looksLikeInstant(x) && looksLikeInstant(y)) return Date.parse(String(x)) === Date.parse(String(y));
  return String(x) === String(y);
}

/**
 * A pulled row's provenance, read from the columns the cloud stores it in.
 *
 * It is transported, never reinterpreted: a row arrives meaning exactly what it
 * meant when it was pushed, so no producer is promoted, demoted or guessed here.
 * A cloud row that carries no producer (an older cloud schema) is
 * `legacy-unknown` — explicit and conservative — rather than being assumed to be
 * hers. `resolve` turns the artifact's cloud uuid into this device's local id.
 */
export function provenanceFromRow(row: Record<string, unknown>, resolve: LocalIdResolver): Provenance {
  const producer = row.producer;
  if (typeof producer !== 'string' || !(PROVENANCE_SOURCES as readonly string[]).includes(producer)) return legacyProvenance();
  const source = producer as ProvenanceSource;
  const confidence = row.confidence;
  return {
    producer: source,
    artifactId: resolve(row.source_artifact_id as string),
    // The schema requires a level exactly for claim-bearing producers; anything else is null, never invented.
    confidence: carriesConfidence(source) ? ((strOrNull(confidence) as Provenance['confidence']) ?? 'possible') : null,
  };
}

type FacetKind = 'task' | 'event' | 'meal' | 'system';

type Facets<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>;
interface FacetTypes {
  task: Facets<typeof taskFacetFields>;
  event: Facets<typeof eventFacetFields>;
  meal: Facets<typeof mealFacetFields>;
  system: Facets<typeof systemFacetFields>;
}

/** A pulled row's commitment facets. A column that is NULL reads back as NULL — "not known" stays unknown. */
export function facetsFromRow<K extends FacetKind>(kind: K, row: Record<string, unknown>): FacetTypes[K] {
  const out: Record<string, unknown> = {};
  for (const facet of EXISTING_FACETS[kind]) {
    if (facet.type === 'money') {
      const amount = row[`${facet.prefix}_amount_minor`];
      out[facet.local] =
        amount === null || amount === undefined
          ? null
          : {
              amountMinor: Number(amount),
              currency: str(row[`${facet.prefix}_currency`]),
              direction: str(row[`${facet.prefix}_direction`]),
            };
    } else if (facet.type === 'bool') out[facet.local] = boolOrNull(row[facet.col]);
    else if (facet.type === 'int') out[facet.local] = numOrNull(row[facet.col]);
    else if (facet.type === 'instant') out[facet.local] = instant(row[facet.col]);
    else out[facet.local] = facet.nullable ? strOrNull(row[facet.col]) : str(row[facet.col] ?? facet.def?.replace(/'/g, ''));
  }
  return out as FacetTypes[K];
}
