import { z } from 'zod';
import { MOMENTUM_VERSION, THRESHOLDS, type MomentumReport } from './model';

/**
 * A saved weekly review, as it sits in the shared decision ledger.
 *
 * The ledger is a receipt system: typed references and numbers, never content. A saved review therefore holds the AGGREGATE counts it
 * reported, the confidence tier and sighting count of each pattern, and a typed reference (kind + id) to the item a pattern is about.
 * It holds no title, no note and no amount. Titles are shown by looking the reference up in the household's own current records, so a
 * review reopened later after an item was deleted says "an item you've since removed" rather than keeping a copy of what she removed.
 *
 * Reading it needs no subscription: the ledger is readable by its owner whatever Premium's state (RLS is ownership only).
 */

const Ref = z.strictObject({ kind: z.string().min(1).max(32), id: z.string().min(1).max(64) });
const Count = z.number().int().min(0).max(100_000);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CountsSchema = z.strictObject({
  tasksCompleted: Count,
  itemsCompleted: Count,
  oneMovesCompleted: Count,
  routinesDone: Count,
  routinesSkipped: Count,
  routinesMissed: Count,
  postponements: Count,
  postponedTasks: Count,
  finishedAfterPostponing: Count,
  suggestionsApplied: Count,
  suggestionsReverted: Count,
  suggestionsDeclined: Count,
  delegationsAccepted: Count,
  delegationsCompleted: Count,
  totalEvents: Count,
  activeDays: Count,
});

const PatternSchema = z.strictObject({
  kind: z.enum(['repeated_postponement', 'weekday_slippage']),
  tier: z.enum(['possible', 'likely', 'established']),
  about: Ref.nullable(),
  weekday: z.number().int().min(0).max(6).nullable(),
  sightings: Count,
  firstOn: Day,
  lastOn: Day,
  confirmedByHer: z.boolean(),
});

export const SavedReportSchema = z.strictObject({
  v: z.literal(MOMENTUM_VERSION),
  period: z.strictObject({ start: Day, end: Day, days: z.number().int().min(1).max(31) }),
  counts: CountsSchema,
  deltas: z.record(z.string(), z.number().int()).nullable(),
  patterns: z.array(PatternSchema).max(THRESHOLDS.maxPatterns),
  nextStep: z.strictObject({ kind: z.literal('review_repeated_postponement'), about: Ref }).nullable(),
  evidence: z.strictObject({ observations: Count, decisions: Count, truncated: z.boolean() }),
  generatedAtMs: z.number().int().min(0),
});
export type SavedReport = z.infer<typeof SavedReportSchema>;

const sizeOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/** Only a READY review is worth saving: an insufficient-history answer is not a report and consumes nothing. */
export function toSnapshot(report: MomentumReport): SavedReport | null {
  if (report.status !== 'ready') return null;
  const saved: SavedReport = {
    v: MOMENTUM_VERSION,
    period: report.period,
    counts: report.counts,
    deltas: report.comparison ? (Object.fromEntries(Object.entries(report.comparison.deltas).filter(([, v]) => typeof v === 'number')) as Record<string, number>) : null,
    patterns: report.patterns.map((p) => ({ kind: p.kind, tier: p.tier, about: p.about, weekday: p.weekday, sightings: p.sightings, firstOn: p.firstOn, lastOn: p.lastOn, confirmedByHer: p.confirmedByHer })),
    nextStep: report.nextStep ? { kind: report.nextStep.kind, about: report.nextStep.about } : null,
    evidence: { observations: report.evidence.observationIds.length, decisions: report.evidence.decisionIds.length, truncated: report.evidence.truncated },
    generatedAtMs: report.generatedAtMs,
  };
  // Never write a receipt she could not read back: it must satisfy the same strict schema the reader enforces, and fit the ledger column.
  // (Counts and the pattern cap bound the size in practice; an unexpectedly long reference is the case this refuses.)
  return SavedReportSchema.safeParse(saved).success && sizeOf(saved) <= THRESHOLDS.snapshotMaxBytes ? saved : null;
}

/** Strict: an unknown shape, an older version or a tampered value is "not a report", never a guess. */
export function parseSnapshot(raw: unknown): SavedReport | null {
  const parsed = SavedReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
