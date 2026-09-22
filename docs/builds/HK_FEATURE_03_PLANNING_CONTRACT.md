# HK-FEATURE-03 — Future planning contract (documentation only)

Contract §43–44. This file defines the **typed seam** a future LLM (or any other) planner would plug into. It contains
**no implementation, no provider, no prompt, no model configuration and no generic AI service**, on purpose: the only code
that could sit behind it today would be an interface whose provider always returns nothing and has no consumer — architecture
theater. What *is* built, tested and shipped is the **downstream half** of the flow, which is the part with real behaviour.

```
TYPED FACTS                 canonical AppState (events, tasks, dependencies, responsibilities, capacity ...)
  -> DETERMINISTIC PROJECTION   src/features/calendar/model/projectCalendar.ts        BUILT + TESTED
  -> BOUNDED PLANNING SYNTHESIS  CalendarPlanningInput -> planner -> CalendarPlanningResult   NOT BUILT (this contract)
  -> TYPED SUGGESTION             CalendarPlanningSuggestion   == PreviewableIntent + evidence   (shape BUILT)
  -> USER REVIEW                  computePreview / PreviewPanel (ephemeral, stale-safe)         BUILT + TESTED
  -> LEGITIMATE MUTATION          acceptIntent -> foundation approve* functions                 BUILT + TESTED
```

**The LLM must never replace deterministic schedule truth.** Ordering, day projection, overlap detection, capacity
classification, known-transition math, deadline/window feasibility, direct dependency checks, responsibility and action
availability all stay in the deterministic projection. A planner may *synthesise, explain trade-offs, and express soft
preferences*; it may not decide whether two commitments overlap or whether an action is legitimate.

## Conceptual types

```ts
/** Everything a planner is allowed to read. It is the DETERMINISTIC projection, plus context; never raw AppState. */
interface CalendarPlanningInput {
  /** The day (or week) the planner is asked about. */
  target: { kind: 'day'; date: LocalDate } | { kind: 'week'; weekOf: LocalDate };
  /** The deterministic projection output for that target: items, conflicts, unplaced items, capacity state, unknowns, actions. */
  projection: CalendarDayViewModel | CalendarWeekViewModel;
  /** Household logical-time context, so a suggestion is about the right "today". */
  time: { today: LocalDate; timeZone: string; asOfMs: number };
  /** The revision the projection was computed from; a result is only valid against it (see staleness below). */
  basedOnRevision: string;
  /** Explicit preferences, where they exist as typed facts (e.g. preferredTimeOfDay). Absent means "no stated preference", never a default. */
  preferences: { itemRef: ItemRef; field: string; value: unknown; evidenceRef: EvidenceRef }[];
}

/** One proposed change, in EXISTING action vocabulary. No new canonical action is invented and there is no COMBINE. */
interface CalendarPlanningSuggestion {
  id: string;
  affected: ItemRef;
  change: PreviewableIntent;                 // MOVE | DROP | SHORTEN | PROTECT — exactly the actions in HK_FEATURE_03_ACTION_MAP.md
  expectedCapacityEffect: { from: CapacityCategory | null; to: CapacityCategory | null };
  evidenceRefs: EvidenceRef[];               // typed facts the suggestion rests on; free prose is never authoritative
  /** Present ONLY if existing semantics support it (provenance.confidence: possible | likely | established). Never a number. */
  confidence?: 'possible' | 'likely' | 'established';
}

interface CalendarPlanningResult {
  basedOnRevision: string;                   // must equal the input's, or the whole result is discarded as stale
  suggestions: CalendarPlanningSuggestion[]; // each independently reviewable
  /** Facts the planner needed and did not have. Surfaced to her exactly like the projection's own unknowns. */
  missing: MissingEvidence[];
}
```

## Rules that make it safe (all already enforced by code that exists)

| Rule | Enforced by |
|---|---|
| A suggestion is not state. It is never applied, stored or synced. | `computePreview` runs the mutation on a discarded copy; nothing is written (tests AA, AH) |
| Review is required, and it shows what would change, including tomorrow. | `PreviewPanel`, `previewLines` |
| A result computed against an old schedule cannot be applied. | `RevisionToken` / `validityOf` / `refreshPreview`; `acceptIntent` refuses a stale token (test AG) |
| Only legitimate mutations run; a proposal the foundation would not accept is refused. | `applyIntent` = the foundation's `approve*` functions; availability is a dry run (test `calendarActions`) |
| Unknown never becomes zero. A planner receives `unknownStates` and may not fill them in. | projection's `MissingEvidence`; no default anywhere (validation scan) |
| Fixed is never movable; delegated is not covered; date-only is not midnight. | projection + `approve*` gates; scenarios B, I, L |
| Free-form prose is never authoritative. | suggestions carry typed `change` + `evidenceRefs` only |

## Why no code

A port with no provider and no consumer would be an interface that returns an empty array: it would add a file, a type and a
test that proves nothing. When a planner exists, the missing piece is small and precisely specified above: build a
`CalendarPlanningInput` from `projectCalendarDay`, call the planner, validate each returned `change` by *dry-running it through
`computePreview`* (a suggestion that does not preview as `ok` is discarded), and hand the survivors to the existing review UI.

## Deferred (recorded, not built)

- A planner implementation (LLM or otherwise), prompts, model configuration: **PENDING-INTEGRATION**.
- Planning across the week (moving work between days): the foundation has no move-to-date mutation (F03-FG-08), so suggestions are limited to today's offered actions until it does.
- `confidence`: present in the type only because provenance already carries `possible | likely | established`; nothing computes it here.
