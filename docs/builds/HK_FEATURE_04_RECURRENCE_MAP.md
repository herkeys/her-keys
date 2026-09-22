# HK-FEATURE-04 — recurrence capability map (R1 gate)

Feature 04 owns the **experience of editing** the recurrence the foundation already defines. It invents no recurrence semantic:
no Feature-04 frequency enum, no rule string, no JSON payload, no "every Monday" field without a canonical row behind it.

## RECURRENCE_AT_FORK_FACTS  (Addendum F — emitted for HK-INT-RECURRENCE-01)

Common fork `5007b0f`. Feature 04 did **not** read or import Feature 03; these are Feature 04's own findings.

```
recurrence_primitive:                 PRESENT
recurrence_mutation:                  PRESENT   (addRecurrence, setRecurrenceStatus; NO in-place edit transition —
                                                 cloud UPDATE grant covers every rule field, see MP-05)
derived_next_occurrence:              PRESENT   (nextOccurrence — honors recorded `skipped` exceptions; occurrencesOf)
occurrence_materialization_api:       ABSENT
canonical_materialized_occurrences:   ABSENT    (no occurrence collection in AppState; occurrences are derived;
                                                 exceptions are append-only `skipped` BehaviorObservations)
calendar_consumable_occurrence_shape: ABSENT    (occurrencesOf → LocalDate[] only: no occurrence entity, no id, no
                                                 start/end instants. Nothing in app/ or src/ consumes recurrences except
                                                 domain/reasoning/related.ts, a related-row aggregator)
actual modules:
  src/domain/foundation/structure.ts   RecurrenceRuleSchema, RECURRENCE_* vocab
  src/domain/structure.ts              addRecurrence, setRecurrenceStatus, occurrencesOf, nextOccurrence, skipOccurrence
  src/domain/sync/foundationSpecs.ts   kind 'recurrence' (table recurrence_rules; one_active_rule_uq)
  src/domain/logicalDay.ts             LocalDate arithmetic, zonedTimeToEpochMs, logicalDateAt
  src/domain/reasoning/related.ts      the only reader (aggregator)
```

HIGH-PRIORITY INTEGRATION RECONCILIATION: compare these facts with Feature 03 Scenario AC. If the two branches reached
different conclusions about the same fork, that is a factual reconciliation, not routine feature divergence.

## Canonical shape

`RecurrenceRule { id, about: task|event|system|meal, trigger, frequency, interval 1–366, byWeekday, byMonthDay, anchorDate,
timeOfDayMinutes, timezone, endsOn, occurrenceCount, status active|paused|ended, …provenance }`
Invariants (schema + integrity + cloud): a `manual` rule has no frequency, every other rule has one; weekdays only on weekly;
month day only on monthly; ends by date **or** count, never both; `endsOn ≥ anchorDate`; **one active rule per subject**.

## Matrix

| # | Shape | Fields | Timezone / logical-day semantics | Mutation path | Next-occurrence derivation | Materialization | In Feature 04 UI |
|---|---|---|---|---|---|---|---|
| R-1 | schedule / **daily** | `interval` (every N days) | dates are `LocalDate` in the household zone; no instant math | create: `addRecurrence`; change: F04 `updateRecurrence`; stop/pause: `setRecurrenceStatus` | `nextOccurrence` ✓ | none | **YES** |
| R-2 | schedule / **weekly** | `interval`, `byWeekday[0=Sun…6=Sat]` (default: anchor's weekday) | phase kept from the anchor's own week | same | ✓ | none | **YES** |
| R-3 | schedule / **monthly** | `interval`, `byMonthDay` (default: anchor's day; clamps to month end) | LocalDate arithmetic | same | ✓ | none | **YES** |
| R-4 | schedule / **yearly** | `interval`; month+day from anchor (29 Feb → 28 Feb in common years) | LocalDate arithmetic | same | ✓ | none | **YES** |
| R-5 | **manual** (`frequency = null`) | — | none | representable | `[]` (no dates) | none | **NO** — it is a second way to say "no schedule"; a System with no rule already means that (Scenario L). Preserved and shown neutrally if one exists |
| R-6 | **after_completion** | needs `frequency` | "restart the clock when it is done" | representable | `[]` — `occurrencesOf` derives dates for `schedule` only | none | **NO** — it requires a completion signal and Systems have no run completion. Preserved verbatim; shown as "Repeats after it's done" with no date claim |
| M-1 | `timeOfDayMinutes` (0–1439) | wall-clock minutes in `rule.timezone` | interpreted in the rule's zone; convert with `zonedTimeToEpochMs` only | in the same commands | n/a (date-only derivation) | none | **YES, optional** (`HH:MM`, disclosed) |
| M-2 | `endsOn` / `occurrenceCount` | end by date **or** count | LocalDate | representable | honored by `occurrencesOf` | none | **NO** to author (adds burden); **preserved** on every edit and shown neutrally ("Until <date>") |
| M-3 | `anchorDate` | phase/start | LocalDate | set to *today* on create; **kept** on edit unless frequency changes | drives derivation | none | not exposed; the preview shows what it means |
| S-1 | status `active` / `paused` / `ended` | — | — | `setRecurrenceStatus` | only `active` yields a date | none | pause/resume/stop **YES** (schedule-scoped wording) |

Time truth
- **Household zone only.** Rules are created with `timezone = state.user.timezone` (foundation behaviour). Feature 04 never
  reads the device zone or `new Date()`: "today" is the store's logical day.
- **DST.** Date arithmetic is on calendar dates, so a DST weekend cannot move an occurrence to a different day. A rule's wall-clock
  time converts through `zonedTimeToEpochMs`: on a **fall-back** day it uses the *earlier* repeated time; on **spring-forward** a
  non-existent time moves *forward* past the gap (02:30 → 03:30). Feature 04 does not re-implement any of this.

## Preview boundary (§22–23)

The preview is **presentation only**: `previewOccurrences` builds a throw-away, non-stored rule from the draft and calls the
foundation's own `nextOccurrence` up to **3 times** (default "next 3 expected dates"), so recorded skips are honored by the same
code that decides the real answer. It never writes, never materializes, never caches, never generates beyond 3.

Editing a rule changes the definition **prospectively**; it does not rewrite history: past outcomes live in append-only
observations keyed by system + planned date, untouched by a rule edit. No calendar row is created or altered by Feature 04.
A recurrence is **not** a notification: nothing here schedules a reminder, requests a permission, or claims one was sent.
