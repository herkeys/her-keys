# HK-FEATURE-04 — action / mutation map (R1 gate)

Rule: **an action that is not "available" is not rendered.** No disabled decoy buttons, no "coming soon".
Every available mutation is a pure `Transition` (`(state, ctx) => AppState`) handed to `store.commit(...)`, which validates the
whole state (`validateAppState`) and persists before it is shown. No mutation adds a persisted field, kind or sync op.

Legend — **F04 producer** = a Feature 04 command under `src/features/systems/commands/` (Addendum A: feature-owned producer of
EXISTING durable types, nothing new persisted). **Foundation** = an existing exported domain transition, reused unchanged.

| Action | Domain type | Mutation module (actual) | Preconditions | Consequence / reversibility | Confirmation | Available | Reason |
|---|---|---|---|---|---|---|---|
| CREATE SYSTEM | `HouseholdSystem` (+ optional `SystemStep[]`, optional `RecurrenceRule`) | **F04 producer** `commands/saveDraft.ts` `applySystemDraft` (steps/recurrence composed in one transition) | name non-blank ≤120; an *active* category; ≤ step/system caps; idempotent by draft system id | low. **Not removable afterwards** (no delete/archive exists — see DELETE); everything on it stays editable | none (explicit Save is the deliberate act; draft ≠ canonical) | **YES** | types + storage + `store.commit` exist; only the producer is missing (Addendum A) |
| EDIT SYSTEM (name, purpose, area) | `HouseholdSystem.name / description / categoryId` | **F04 producer** `commands/saveDraft.ts` `applySystemDraft` (in-place; `scope`, facets, provenance preserved) | system exists; name non-blank; category active or unchanged; base version fresh | low, reversible (edit again) | none | **YES** | cloud grants UPDATE on `name, description, category_id`; local rows are mutable |
| ADD STEP | `SystemStep` | **F04 producer** `commands/saveDraft.ts` (sparse positions via `stepOrder.ts`, see ledger §7) | system exists; title non-blank ≤200; effort 0–1440 or unknown; position ≤ 999 | low, reversible only by editing (no remove) | none | **YES** | type + storage exist; `addSystemStep` has no caller and is dense-only |
| EDIT STEP (title, minutes) | `SystemStep.title / effortMinutes` | **F04 producer** `commands/saveDraft.ts` (bumps `updatedAt`; id/provenance kept) | step exists; unknown minutes stay `null`, never `0` | low, reversible | none | **YES** | cloud grants UPDATE on `title, effort_minutes` |
| REMOVE STEP | `SystemStep` | — | — | — | — | **NO — SAFE-UNAVAILABLE** | (a) no `status`/retire field on `SystemStep`; (b) sync `ALLOWED_OPS` = create/update only, "this wave does not invent removal"; a local-only delete would resurrect on another device and collide on `(system_id, position)`. History-reference check (Addendum G): **no durable type references a step** (`TYPED_REF_KINDS`/`CONTENT_REF_KINDS`/observation/intent/dependency/responsibility all exclude `systemStep`) — so this is a missing retire semantic, not an orphaning risk. → MP-03 |
| REORDER STEP | `SystemStep.position` | **F04 producer** `commands/saveDraft.ts` via `commands/stepOrder.ts` `layoutPositions` (fewest rows move, each onto a slot nobody holds; no renumber path) | ≥2 steps; unique `(systemId, position)` preserved; no dependency implied | low, reversible | none | **YES** | order is meaningful (`stepsInOrder`); cloud grants UPDATE on `position`. Sync caveat MP-04 |
| SET RECURRENCE (create) | `RecurrenceRule` (`about: system`) | **Foundation** `addRecurrence` | system exists; no *active* rule for it; schedule trigger, frequency daily/weekly/monthly/yearly | low, reversible | none | **YES** | consumed as-is |
| SET RECURRENCE (change) | `RecurrenceRule` | **F04 producer** `commands/schedule.ts` `setCalendarSchedule` (in-place on the live rule; history stays in observations) | live (active/paused) rule exists; result passes `RecurrenceRuleSchema` | low, reversible | none | **YES** | cloud `updatable` lists every rule field; no transition existed → MP-05 |
| REMOVE RECURRENCE ("Stop repeating") | `RecurrenceRule.status → ended` | **Foundation** `setRecurrenceStatus` | live rule exists | low; the rule row is kept as `ended` (history), a new schedule can be set | none | **YES** | there is no delete path for rules; `ended` is the foundation's "no longer applies" |
| PAUSE (schedule) | `RecurrenceRule.status → paused` | **Foundation** `setRecurrenceStatus` | active rule exists | reversible | none | **YES — scoped to the schedule** | the *System* has no status; only its rule can pause. UI says "Schedule paused", never "System paused" |
| RESUME (schedule) | `RecurrenceRule.status → active` | **Foundation** `setRecurrenceStatus` (F04 guard: no other active rule) | paused rule; no other active rule for the subject | reversible | none | **YES** | guard prevents the "two active rules" integrity violation |
| SKIP OCCURRENCE | `BehaviorObservation(system, skipped, plannedDate)` | **Foundation** `skipOccurrence` | active rule; a next expected date exists | recorded, append-only, **no un-skip outcome exists** → not reversible; the schedule continues | **YES** (`ConfirmationSheet` states that) | **YES** | consumed as-is; skip ≠ disabled System, ≠ failure |
| ASSIGN RESPONSIBILITY | `Responsibility(about: system, state: requested)` | **Foundation** `delegate` | holder is an existing person or child (else refused); no live responsibility for the System | moderate (a request, not a handoff proven); reversible via take-back | none | **YES** if ≥1 holder exists | `delegate` refuses unknown holders → no phantom person |
| REASSIGN | — | **Foundation** `reassign` | live non-self responsibility | reversible | none | **YES** | consumed |
| TAKE IT BACK | — | **Foundation** `returnToSelf` | live non-self responsibility | reversible | none | **YES** | consumed |
| RECORD THEIR ANSWER | `Responsibility.state` | **Foundation** `acknowledge` / `accept` / `decline` | `requested` (or `acknowledged`) | recorded in observations | none | **YES** | assigned ≠ acknowledged ≠ accepted stays visible |
| ADD PERSON | `HouseholdPerson` | **Foundation** `addPerson` (no production caller) | — | — | — | **NO — not offered by Feature 04** | people management is not Systems' job; a phantom person is never created to satisfy an assignment. Limitation recorded (K) |
| PAUSE / ARCHIVE / ACTIVATE / DEACTIVATE (System) | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | `HouseholdSystem` has no status field → MP-01 |
| DELETE (System) | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | sync has no delete path for `system` ("does not invent removal"); local delete would dangle deps/observations and resurrect. → MP-01 |
| DUPLICATE | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | no copy mutation exists; inventing one would have to decide what resets vs carries (accepted responsibility, history) — underdefined (Addendum H) |
| START RUN | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | no run entity / identity (§ model map) |
| COMPLETE STEP | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | no step-completion semantic; local checkboxes would be fake durability |
| SKIP STEP | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | needs a run |
| COMPLETE RUN | — | — | — | — | — | **NO — SAFE-UNAVAILABLE** | needs a run. (A whole-occurrence `completed` observation is *valid* for `system`, but no run exists to complete, and offering it would push Systems toward a completion tracker → DEFERRED, PENDING-OWNER) |

Notes
- **Unknown stays unknown.** Nothing here defaults an unknown facet: step minutes stay `null`; System `effortMinutes`,
  `energyDemand`, `automationMode` are preserved verbatim and never set by Feature 04.
- **No autonomy.** `automationMode` is never written by Feature 04, and no action here executes anything, sends anything,
  schedules a notification or touches a provider.
- **Sync ops used:** only `create`/`update` of `system`, `systemStep`, `recurrence`, `responsibility`, `observation` — all
  already in `ALLOWED_OPS`. No new kind, no new op, no schema change.
