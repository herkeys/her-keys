import type { ProvenanceSource } from '../domain/foundation/provenance';
import { BACKFILL_COLLECTIONS, type BackfillCollection } from '../domain/state';

/**
 * v3 -> v4 — B4-FE01-029, the provenance backfill (ADR-004, ledger section 6).
 *
 * v3 stored no provenance; the reasoning layer worked it out from the KIND of
 * entity. This step writes down what can be PROVEN and is honest about what
 * cannot, using three rules:
 *
 *   1. Never invent certainty. A row is attributed only when something durable in
 *      v3 proves the source; otherwise it is `legacy-unknown`, an explicit stored
 *      value that every consumer treats conservatively (it is not user-stated).
 *   2. Never demote real history. A row proven to be hers stays `user-action`
 *      even though it is being migrated — migration is not a producer.
 *   3. Never use entity type as the proof. Every non-demo attribution below rests
 *      on a stored field, or on the fact that exactly one code path could write
 *      the row, and each says which in its `rule` token.
 *
 * Migration LINEAGE is recorded separately, as tallies in `migrationLineage`. No
 * row is ever stamped "migration".
 *
 * Pure and idempotent-by-construction: the lineage id is fixed, so running it
 * again over the same input can only produce the same entry.
 *
 * A demo household is classified as a whole. Everything in it is part of the
 * rehearsal, whoever typed it, exactly as the derivation it replaces said.
 */

type Row = Record<string, unknown>;

interface Classification {
  producer: ProvenanceSource;
  /** Why this producer. A token, so the tally is queryable and the reason survives. */
  rule: string;
}

const DEMO: Classification = { producer: 'demo-seed', rule: 'demo-household' };

/**
 * The rule for one row. `row` is the v3 row, so a rule may read any stored
 * field — but only fields that were durable in v3.
 */
export function classifyV3Row(collection: BackfillCollection, row: Row | null, origin: 'demo' | 'empty'): Classification {
  if (origin === 'demo') return DEMO;

  switch (collection) {
    case 'categories':
      // The eight starters carry a system role; only `addCategory` ever makes a role-less one.
      return row !== null && row.systemRole !== null
        ? { producer: 'system-derived', rule: 'starter-set' }
        : { producer: 'user-action', rule: 'role-less-category-added-by-user' };

    case 'events':
      // v3 stored `source`: 'user' is written only by `addEvent`; 'demo' survives from the v1 -> v2 stamp.
      return row !== null && row.source === 'demo'
        ? { producer: 'demo-seed', rule: 'stored-demo-flag' }
        : { producer: 'user-action', rule: 'stored-user-flag' };

    case 'tasks':
      // `createdAt` is written only by `addTask`. A null one is an unstamped pre-Build-3 row that a
      // non-demo household should not have — and cannot be attributed, so it is not.
      return row !== null && row.createdAt !== null
        ? { producer: 'user-action', rule: 'created-at-stamped-by-capture' }
        : { producer: 'legacy-unknown', rule: 'unstamped-legacy-row' };

    case 'needsMe':
      return { producer: 'user-action', rule: 'written-only-by-needs-me-capture' };

    case 'oneMoves':
      return { producer: 'system-derived', rule: 'chosen-by-recommendation-engine' };

    case 'discovery':
      return { producer: 'talk-it-out', rule: 'written-only-by-a-talk-it-out-turn' };

    case 'onboarding':
      return { producer: 'onboarding', rule: 'intake-flow' };

    case 'systems':
    case 'meals':
      // No production create path existed in v3 (HR-07): a non-demo row here cannot be attributed.
      return { producer: 'legacy-unknown', rule: 'no-production-create-path' };
  }
}

const stamp = ({ producer }: Classification) => ({ producer, artifactId: null, confidence: null });

export function migrateV3ToV4(data: unknown): unknown {
  const v3 = data as {
    origin: 'demo' | 'empty';
    categories: Row[];
    events: Row[];
    tasks: Row[];
    systems: Row[];
    meals: Row[];
    needsMe: Row[];
    oneMoves: Row[];
    discovery: Row | null;
    onboarding: Row;
    [key: string]: unknown;
  };

  const tally = new Map<string, { collection: BackfillCollection; classification: Classification; count: number }>();
  const classify = (collection: BackfillCollection, row: Row | null): Classification => {
    const classification = classifyV3Row(collection, row, v3.origin);
    const key = `${collection}|${classification.producer}|${classification.rule}`;
    const entry = tally.get(key);
    if (entry) entry.count += 1;
    else tally.set(key, { collection, classification, count: 1 });
    return classification;
  };

  const withProvenance = (collection: BackfillCollection, rows: Row[]): Row[] =>
    rows.map((row) => ({ ...row, provenance: stamp(classify(collection, row)) }));

  // Events lose their `source` flag: it was the only stored producer v3 had, and it is now
  // subsumed by `provenance` rather than kept beside it as a second source of truth.
  const events = v3.events.map((event) => {
    const { source: _source, ...rest } = event;
    return { ...rest, provenance: stamp(classify('events', event)) };
  });

  const migrated = {
    ...v3,
    categories: withProvenance('categories', v3.categories),
    events,
    tasks: withProvenance('tasks', v3.tasks),
    systems: withProvenance('systems', v3.systems),
    meals: withProvenance('meals', v3.meals),
    needsMe: withProvenance('needsMe', v3.needsMe),
    oneMoves: withProvenance('oneMoves', v3.oneMoves),
    discovery: v3.discovery === null ? null : { ...v3.discovery, provenance: stamp(classify('discovery', v3.discovery)) },
    onboarding: { ...v3.onboarding, provenance: stamp(classify('onboarding', v3.onboarding)) },
    sourceArtifacts: [],
    externalReferences: [],
  };

  // Deterministic order: the collection order, then insertion order within it.
  const tallies = BACKFILL_COLLECTIONS.flatMap((collection) =>
    [...tally.values()]
      .filter((entry) => entry.collection === collection)
      .map((entry) => ({
        collection,
        producer: entry.classification.producer,
        rule: entry.classification.rule,
        count: entry.count,
      }))
  );

  return {
    ...migrated,
    migrationLineage: [
      {
        id: 'lineage:v3-v4:provenance',
        kind: 'provenance-backfill',
        fromSchemaVersion: 3,
        toSchemaVersion: 4,
        tallies,
      },
    ],
  };
}
