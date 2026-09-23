# HK-FEATURE-09 — Missing primitives register

Feature 09 (Money OS) built on `integration/wave2-f01-f08` @ `363e473` (tagged `wave2-final`). Same format as
the F04–F08 registers. Every "FEATURE-LOCAL: YES" row is presentation or composition over existing canonical
rows; F09 introduces exactly one new schema column (see MP-09-01 disposition — additive, not itself a gap) and
no new table, kind, or policy.

Fields: **ID · CAPABILITY · ACTUAL FOUNDATION STATE · WHY EXISTING SEMANTICS ARE INSUFFICIENT · IMPACT ·
FEATURE-LOCAL SOLUTION? · NEW DURABLE SEMANTIC? · OWNER CHECKPOINT? · FUTURE DOMAIN · INTEGRATION TIMING**

---

### MP-09-01 · Recurring-obligation materialization
- **State:** `RecurrenceRule`/`nextOccurrence()` (`src/domain/foundation/structure.ts`) is a *derive, never
  store* engine over ONE stable subject (a System, a routine) plus `skipped` exceptions — it answers "what's the
  next expected run of this persistent thing," never "generate N independent, permanently-retained occurrences,
  each with its own resolvable status." The same limitation already exists for Calendar recurrence (MP-07-05).
- **Insufficient because:** a recurring bill needs each month's obligation to keep its OWN paid/unpaid history
  forever (brief: "a recurring template must NOT cause earlier resolved occurrences to change retroactively";
  "resolved retention... canonical resolved Money records are retained"). Pointing one `RecurrenceRule` at one
  rolling anchor Task cannot satisfy this — resolving month N would either destroy month N's identity (rolling
  the same row forward) or require an ad hoc observation-only history with no completed Task to show in
  "Recently resolved."
- **Impact:** F09 V1 does not auto-generate the next occurrence. A recurring obligation is an ordinary `Task`
  (this occurrence only) with an OPTIONAL `RecurrenceRule` used purely for an informational "next expected"
  preview (identical to how a System's schedule preview already works — `previewOccurrences` pattern). Creating
  the next occurrence is an explicit, user-confirmed "duplicate forward" action that copies title/amount/
  category/mechanism into a new `Task` with the previewed due date. Nothing is generated automatically, so
  "time alone never resolves financial truth" holds by construction.
- **Feature-local?** YES (a manual duplicate action). **New durable semantic?** YES, if true automatic
  per-occurrence materialization is ever wanted. **Owner checkpoint?** NO — the brief itself scopes recurring
  money as a *may-include* V1 concept and explicitly forbids building a complete accounting model; the manual
  path is acceptable for V1, matching the exact precedent of MP-07-07 ("task bridge is acceptable for V1. Owner
  checkpoint? NO"). **Future domain:** Money OS (a later milestone). **Timing:** later Money OS work, or a
  shared "materialized recurrence" primitive if Calendar/Systems ever need the same thing (see MP-07-05).

### MP-09-02 · Calendar cross-domain deadline marker
- **State:** Calendar (`src/features/calendar/model/collect.ts`) reads exactly `state.events` and `state.tasks`
  — there is no generic, lighter-weight "marker/overlay" a domain can project a deadline through without being a
  real Task or Event.
- **Impact:** a Money obligation represented as an ordinary `Task` (the normal V1 case, since it also needs
  Today/One-Move eligibility) already appears on Calendar via the *existing* task-with-`dueDate` pathway — no
  gap, no duplicate event. The gap is narrower than the brief assumed: an **expected-income** item that has no
  natural "action" framing (nothing to *do* about money arriving) has no honest reason to be a `Task`, and
  therefore has no Calendar representation at all.
- **Feature-local?** NO. **New durable semantic?** YES (a true cross-domain deadline-marker projection).
  **Owner checkpoint?** NO — brief explicitly says do not refactor Calendar in this branch; record and move on.
  **Future domain:** Calendar / Money OS. **Timing:** `PENDING-INTEGRATION — MONEY CALENDAR PROJECTION`, per
  brief instruction, for Wave 3 integration to decide.

### MP-09-03 · Household default currency
- **State:** unchanged from MP-07-08 — no currency default exists anywhere in state or schema; every `Money`
  value requires an explicit, visible ISO code.
- **Impact:** none for F09 — every F09 amount is entered with an explicit currency exactly like F07's money
  editor already requires, and F09 additionally rejects any non-USD entry at its own mutation boundary (a
  feature-local check, not a foundation default). Listed here only to avoid re-discovering it as if it were new.
- **Feature-local?** YES (F09's own USD-only guard). **New durable?** YES, if a household default is ever
  wanted. **Owner checkpoint?** NO. **Future domain:** Money OS (multi-currency, if ever).

### MP-09-04 · Autopay-aware attention suppression
- **State:** `attentionFor`'s `deadline` reason (`src/domain/reasoning/attention.ts`) fires generically for any
  task with a due date in range — it has no concept of "how this will be paid," because no task had one before
  F09 added `paymentMechanism`.
- **Impact:** without a change, an autopay obligation would get the same pre-due "pay this" nudge as a manual
  one, contradicting the brief's explicit mandate ("For AUTOPAY obligations: routine pre-due 'pay this'
  attention is suppressed"). Repaired with one additive conditional in the shared `deadline` loop (skip when
  `paymentMechanism === 'autopay'` and the due date has not yet passed), with its own regression test — the
  same class of single-line, tested, shared-file change F05 (`claim.ts`) and F07 (risk-attention fix landed as
  `01ed40a`) each made once when a real gap existed. Not a parallel attention system.
- **Feature-local?** PARTIAL (one shared line, tested). **New durable?** NO (extends existing reasoning with a
  fact the row itself now carries). **Owner checkpoint?** NO.

### MP-09-05 · Child archival (inherited from MP-07-04 / B4-P0-066)
- **State:** unchanged — no archival state exists for a `Child`; `household_members` has no status column
  server-side (`supabase/tests/30-child-subject.sql` asserts this explicitly, still true at WAVE3_BASE).
- **Impact:** a Money record referencing a child that is later removed cannot express "this child is archived"
  because that concept does not exist yet. F09 handles a dangling/invalid child reference the same defensive way
  every other feature does — never re-matched by name, never silently reassigned, flagged for review if the
  foundation ever adds a lifecycle.
- **Feature-local?** YES (defensive read, inherited pattern). **New durable?** NO (already tracked as MP-07-04).
  **Owner checkpoint?** NO. **Future domain:** Kids OS / People.

### MP-09-06 · Per-facet provenance for `value` (inherited from MP-07-11)
- **State:** unchanged — a row has one `provenance`; the `value`/`paymentMechanism` facets have none of their
  own, so F09 cannot independently prove whether a given amount was user-entered vs. inferred vs. defaulted, only
  whether the *row* was.
- **Impact:** F09 never writes `value` from anything but an explicit user-entered amount in V1 (no AI-suggested
  amounts in this feature), so the gap is dormant for F09's own writes; it becomes relevant only if a future
  Talk It Out -> Money capture path (still PENDING-INTEGRATION) tries to write an inferred amount.
- **Feature-local?** N/A. **New durable?** NO (already tracked as MP-07-11). **Owner checkpoint?** NO.

### MP-09-07 · Money -> Meals financial context (inherited from HK-INT-MEALS-MONEY-01)
- **State:** unchanged — F08 explicitly carries no budget/cost primitive of its own and defers grocery financial
  context to Money OS.
- **Impact:** the brief forbids building grocery budget/meal-price forecasting in F09. Left open.
- **Feature-local?** N/A. **New durable?** Undetermined — a future Money milestone's decision. **Owner
  checkpoint?** NO (not triggered by F09). **Future domain:** Money OS, later milestone.

---

## Integration candidates (for Wave 3 integration, format matches F07's own table)

| ID | What F09 provides | What integration must verify |
|---|---|---|
| `HK-INT-MONEY-CALENDAR-01` | A Money obligation `Task` already projects onto Calendar via the existing task pathway | Confirm no duplicate event is ever created if Calendar is later given a real cross-domain marker (MP-09-02) |
| `HK-INT-MONEY-ATTENTION-01` | One additive line in `attention.ts` suppressing pre-due autopay nudges (MP-09-04) | Confirm this survives any future refactor of the deadline reason; regression test named explicitly |
| `HK-INT-MONEY-COPARENT-01` | Money reads `buildCoParentLogisticsView(...).moneyFollowUps` read-only, zero F07 changes | Confirm F07's future changes to `MoneyFollowUpView` shape are reflected, not silently drifted from |
| `HK-INT-MONEY-HOME-01` | Money may read `Task.value`/`CalendarEvent.value` on Home-category rows as context (MP-06-13) | Confirm Home never writes a cost the household did not truthfully enter |
| `HK-INT-MONEY-TIO-01` | Talk It Out's existing `$`-amount capture (`src/features/talk-it-out/capture/local/money.ts`) is not wired to Money in this branch | Any future wiring must route reimbursement language to F07's canonical truth, never mint a duplicate |
| `HK-INT-MONEY-BOUNDARY-01` | F09 added genuine, documented shared-file changes: the `paymentMechanism` facet on `commitment.ts`/`tasks.ts` (M2a), and the `otherOpenTasks` reachability fix to `tests/build3Audit.capture.test.mjs` (M3 addendum) | `tests/meals/boundary.test.mjs` (F08's own protected-file/sibling-ancestry exit gate, baselined at `38ab7f14`) now fails three ways once a Wave 3 branch exists with legitimate shared-file changes: `[BM1-3]` (sibling ancestry — reproduces on unmodified `Her-Keys-W2I` from branch existence alone), `[BV1-5]` and `[BL1-2]` (both flag files this build genuinely and correctly changed: `commitment.ts`/`tasks.ts`, and now `tests/build3Audit.capture.test.mjs`, which `[BL]` separately hardcodes as "must be untouched"). All three are the same root cause — a temporally-scoped exit gate never designed to see a Wave 3 sibling branch or a legitimate future extension of shared test infrastructure. Not fixed here (out of F09's scope to edit F08's committed tooling). Integration should retire or rescope this test's temporal assumptions before F10+. |
