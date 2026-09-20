import { z } from 'zod';
import type { LocalDate } from '../logicalDay';
import { InstantSchema } from '../schemaPrimitives';
import { AUTONOMY_MODES, CONSEQUENCE_LEVELS, type ConsequenceLevel } from './authorization';
import { MoneySchema, type Money } from './money';

/**
 * COMMITMENT FACETS — B4-FE01-015 / -016 (ADR-015).
 *
 * Every obligation — a task, a school form, a bill, an appointment, a chore, a meal
 * to prepare, a repair — needs the same handful of questions answered: when is it
 * due, how long will it take, can it move, what happens if it slips, does it need
 * her, does it cost anything. Four existing kinds already answered them four
 * different ways, and adding money, forms, delegation and meals independently would
 * have made that five.
 *
 * So this is a TYPED FACET CONTRACT, not a table and not a universal object. A task
 * is still a task and an event is still an event. Each carries the facets it can
 * honestly answer, as nullable columns of its own, and reasoning reads them all
 * through `commitmentFacetsOf`, which returns the same shape whatever the kind.
 *
 * NULL MEANS "NOT KNOWN". No facet is ever defaulted to a plausible-looking value:
 * an estimate she never gave is not an estimate. `needsMePersonally` in particular
 * stays null until it is genuinely known; whether a delegated item still needs her
 * is answered by the responsibility record, not by guessing here.
 */

export const ENERGY_DEMANDS = ['low', 'moderate', 'high'] as const;
export type EnergyDemand = (typeof ENERGY_DEMANDS)[number];

export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'] as const;

/** A system's autonomy: `manual` (Her Keys does nothing) or one of the shared modes. */
export const SYSTEM_AUTOMATION_MODES = ['manual', ...AUTONOMY_MODES] as const;
export type SystemAutomationMode = (typeof SYSTEM_AUTOMATION_MODES)[number];

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);
const TravelMinutes = nullable(z.number().int().min(0).max(240));

/**
 * The facets a TASK can answer.
 *
 * `.default(null)` makes a facet's absence read as "not known" — which is exactly
 * what absence means — so a row written before a facet existed needs no rewriting
 * to be truthful. A row that DOES answer it stores the answer.
 */
export const taskFacetFields = {
  /** A deadline with a time of day. `dueDate` remains the calendar-day deadline. */
  dueAt: nullable(InstantSchema),
  /** The scheduling window: not before, and not after. */
  earliestStartAt: nullable(InstantSchema),
  latestFinishAt: nullable(InstantSchema),
  /** Whether it can be done in pieces, and the smallest useful piece. */
  splittable: nullable(z.boolean()),
  minChunkMinutes: nullable(z.number().int().min(5).max(1440)),
  preferredTimeOfDay: nullable(z.enum(TIMES_OF_DAY)),
  energyDemand: nullable(z.enum(ENERGY_DEMANDS)),
  /** What it costs if this slips. */
  consequence: nullable(z.enum(CONSEQUENCE_LEVELS)),
  needsMePersonally: nullable(z.boolean()),
  travelMinutesBefore: TravelMinutes,
  travelMinutesAfter: TravelMinutes,
  preparationMinutes: TravelMinutes,
  value: nullable(MoneySchema),
};

/** The facets an EVENT can answer beyond the ones it already had (travel, preparation, commitment, times). */
export const eventFacetFields = {
  energyDemand: nullable(z.enum(ENERGY_DEMANDS)),
  consequence: nullable(z.enum(CONSEQUENCE_LEVELS)),
  needsMePersonally: nullable(z.boolean()),
  value: nullable(MoneySchema),
};

/** A meal has a preparation time and a demand on her energy. */
export const mealFacetFields = {
  prepMinutes: TravelMinutes,
  energyDemand: nullable(z.enum(ENERGY_DEMANDS)),
};

/** A household system's autonomy and how long one run takes. */
export const systemFacetFields = {
  automationMode: z.enum(SYSTEM_AUTOMATION_MODES).default('manual'),
  effortMinutes: nullable(z.number().int().min(0).max(1440)),
  energyDemand: nullable(z.enum(ENERGY_DEMANDS)),
};

/** A row's facets, all honestly unknown. What every creator starts from. */
export const emptyTaskFacets = () => ({
  dueAt: null, earliestStartAt: null, latestFinishAt: null, splittable: null, minChunkMinutes: null,
  preferredTimeOfDay: null, energyDemand: null, consequence: null, needsMePersonally: null,
  travelMinutesBefore: null, travelMinutesAfter: null, preparationMinutes: null, value: null,
});
export const emptyEventFacets = () => ({ energyDemand: null, consequence: null, needsMePersonally: null, value: null });
export const emptyMealFacets = () => ({ prepMinutes: null, energyDemand: null });
export const emptySystemFacets = () => ({ automationMode: 'manual' as const, effortMinutes: null, energyDemand: null });

export interface CommitmentFacets {
  dueDate: LocalDate | null;
  dueAt: string | null;
  effortMinutes: number | null;
  flexibility: 'fixed' | 'flexible' | null;
  earliestStartAt: string | null;
  latestFinishAt: string | null;
  splittable: boolean | null;
  minChunkMinutes: number | null;
  preferredTimeOfDay: (typeof TIMES_OF_DAY)[number] | null;
  energyDemand: EnergyDemand | null;
  consequence: ConsequenceLevel | null;
  needsMePersonally: boolean | null;
  transition: { before: number | null; after: number | null; preparation: number | null } | null;
  value: Money | null;
}

export type CommitmentSource =
  | { kind: 'task'; row: Record<string, any> }
  | { kind: 'event'; row: Record<string, any> }
  | { kind: 'meal'; row: Record<string, any> }
  | { kind: 'system'; row: Record<string, any> };

const nul = <T>(value: T | null | undefined): T | null => (value === undefined ? null : value);

/** Which facets a kind can answer AT ALL, as opposed to merely not yet knowing. */
export const ANSWERABLE_FACETS: Record<CommitmentSource['kind'], readonly (keyof CommitmentFacets)[]> = {
  task: ['dueDate', 'dueAt', 'effortMinutes', 'flexibility', 'earliestStartAt', 'latestFinishAt', 'splittable', 'minChunkMinutes', 'preferredTimeOfDay', 'energyDemand', 'consequence', 'needsMePersonally', 'transition', 'value'],
  event: ['effortMinutes', 'flexibility', 'energyDemand', 'consequence', 'needsMePersonally', 'transition', 'value'],
  meal: ['dueDate', 'effortMinutes', 'energyDemand'],
  system: ['effortMinutes', 'energyDemand'],
};

/**
 * The one way reasoning reads an obligation's facets. Same shape for every kind; a
 * facet a kind cannot answer is null, and `ANSWERABLE_FACETS` says whether the null
 * means "not known" or "this kind never says".
 */
export function commitmentFacetsOf(source: CommitmentSource): CommitmentFacets {
  const row = source.row;
  const empty: CommitmentFacets = {
    dueDate: null, dueAt: null, effortMinutes: null, flexibility: null, earliestStartAt: null, latestFinishAt: null,
    splittable: null, minChunkMinutes: null, preferredTimeOfDay: null, energyDemand: nul(row.energyDemand),
    consequence: null, needsMePersonally: null, transition: null, value: null,
  };

  switch (source.kind) {
    case 'task':
      return {
        ...empty,
        dueDate: nul(row.dueDate),
        dueAt: nul(row.dueAt),
        effortMinutes: nul(row.durationMinutes),
        flexibility: nul(row.commitment),
        earliestStartAt: nul(row.earliestStartAt),
        latestFinishAt: nul(row.latestFinishAt),
        splittable: nul(row.splittable),
        minChunkMinutes: nul(row.minChunkMinutes),
        preferredTimeOfDay: nul(row.preferredTimeOfDay),
        consequence: nul(row.consequence),
        needsMePersonally: nul(row.needsMePersonally),
        transition: transitionOf(row),
        value: nul(row.value),
      };
    case 'event': {
      const minutes = Math.round((Date.parse(row.endsAt) - Date.parse(row.startsAt)) / 60_000);
      return {
        ...empty,
        effortMinutes: Number.isFinite(minutes) ? minutes : null,
        flexibility: nul(row.commitment),
        consequence: nul(row.consequence),
        needsMePersonally: nul(row.needsMePersonally),
        transition: transitionOf(row),
        value: nul(row.value),
      };
    }
    case 'meal':
      return { ...empty, dueDate: nul(row.date), effortMinutes: nul(row.prepMinutes) };
    case 'system':
      return { ...empty, effortMinutes: nul(row.effortMinutes) };
  }
}

function transitionOf(row: Record<string, any>): CommitmentFacets['transition'] {
  const before = nul<number>(row.travelMinutesBefore);
  const after = nul<number>(row.travelMinutesAfter);
  const preparation = nul<number>(row.preparationMinutes);
  return before === null && after === null && preparation === null ? null : { before, after, preparation };
}
