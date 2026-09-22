# HK-FEATURE-09 — Money OS

Branch `feature/09-money-os`, worktree `C:\Users\jsmit\Her-Keys-F09`, forked from `integration/wave2-f01-f08` @
`363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (tagged `wave2-final`, pushed to origin and independently verified via
`git ls-remote`). Delta vs `wave2-engineering-complete` (`65c5bba`) is exactly one commit — `363e473`, doc-only
(README STAGING-W2-03 closeout note + one boundary-scan script line) — i.e. `wave2-final` = engineering-complete +
the Staging backend/schema/RLS verification closeout.

Money OS is the household financial-attention layer: what money reality needs her attention next, and how it
touches the rest of her life. It is not a bank, ledger, or accounting product. See the owner brief (this
session) for the full doctrine; this ledger records what was actually found and built, not the brief's prose.

---

## F09-M1 — Existing-primitives audit + canonical Money model

### Environment gate (recorded before any change)

```
git fetch origin                                          -> (no output; up to date)
git status --short (Her-Keys-W2I)                          -> (clean)
git branch --show-current (Her-Keys-W2I)                    -> integration/wave2-f01-f08
git rev-parse HEAD (Her-Keys-W2I)                            -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf
git ls-remote origin refs/heads/integration/wave2-f01-f08   -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf  (MATCH)
git remote -v                                                -> origin git@github-herkeys:herkeys/her-keys.git
```

**Correction to prior session memory**: a memory note from 2026-09-21 recorded that origin held only `main`,
`build/01-core-experience` and `audit/build1-hostile-initial`. That is now stale — origin has since received the
full `integration/wave2-f01-f08` history and both `wave2-*` tags. The live `ls-remote` above is authoritative.

`wave2-final` created as an annotated tag at `363e473` and pushed; independently verified:
```
git ls-remote --tags origin | grep wave2-final
ee39c55f75e3b1bef73be4b53ad938a83de37689  refs/tags/wave2-final
363e473fdf053547a21a41a67b7f62bd9aa2bcdf  refs/tags/wave2-final^{}   (MATCH with WAVE3_BASE)
```
`wave2-engineering-complete` was left untouched (still points at `65c5bba`, one of the explicitly excluded base
commits — it predates the Staging closeout and is not WAVE3_BASE).

Worktree/branch created: `git worktree add -b feature/09-money-os C:\Users\jsmit\Her-Keys-F09 363e473...`. Given
a real (non-junction) `node_modules` via `npm ci` — matching the pattern `Her-Keys-W2I` already uses, not the
junction approach that caused export bugs in F05–F07 (see [[parallel-worktree-gotchas]]). `tsc --noEmit` clean.
Free virtual memory 40.8/66.5 GB at start (no starvation risk); no other `run.mjs`/docker contention detected.

Mini-gate after setup: `feature/09-money-os` @ `363e473`, working tree clean.

### Existing-primitives audit — classification

Four parallel research passes (read-only) traced every relevant seam against the real code, not assumption.
Findings below correct several assumptions in the owner brief itself; corrections are called out explicitly.

| # | Capability | Classification | Evidence |
|---|---|---|---|
| 1 | Amount / currency value type | **PRESERVE** | `src/domain/foundation/money.ts` — `Money`/`MoneySchema` (ADR-014, B4-FE01-020): integer minor units, explicit ISO-4217 currency, explicit `direction: 'outflow'\|'inflow'` (never a sign). `parseMoney`/`formatAmount`/`addMoney`/`totalsOf` helpers. Already a facet on `tasks`/`events`/`interpretations` with cloud columns (`value_amount_minor bigint`, `value_currency`, `value_direction`) and a CHECK constraint since Build 4. Reused as-is, unmodified. |
| 2 | USD-only validation for F09 | **NEW, F09-local** | `MoneySchema` is currency-agnostic (any ISO 4217 code) — correct, because it is shared foundation, not F09's to narrow. F09 adds its own boundary validation (reject non-USD) in its own mutation functions, never in `money.ts`. |
| 3 | Household currency default | **NOT PRESENT** (inherited gap, MP-07-08) | No default currency anywhere in state or schema; `Money` always requires an explicit code. F09 does not need a household default — every F09 amount is entered with an explicit, visible currency the same way F07's money editor already does it. |
| 4 | Financial responsibility (who owes/owns a cost) | **PRESERVE (generic `Responsibility`)** | No money-specific responsibility concept exists or should exist. The generic `Responsibility` state machine (`src/domain/foundation/responsibility.ts`, `RESPONSIBILITY_STATES = ['owned','requested','acknowledged','accepted','declined','completed','returned']`, transition functions in `src/domain/responsibility.ts`) is reused unmodified when a Money obligation names a responsible household member. |
| 5 | Reimbursement lifecycle (F07 Co-Parent) | **PRESERVE / READ-SIDE PROJECT** | See §"F07 reimbursement mapping" below — F07 has **no single reimbursement status enum**. It is three independent, already-real facts: `Task.status` (open/completed/archived), `Responsibility.state`, and a dormant `paid` outcome-evidence hook nothing currently writes. F09 reads `buildCoParentLogisticsView(...).moneyFollowUps` (already public via `src/features/coparent/index.ts`) and re-presents it. **Zero changes to `src/features/coparent/**`.** |
| 6 | Split/allocation calculation | **NOT PRESENT anywhere** | Confirmed by grep (`split\|allocat\|thirds\|divide`) across `src/features/coparent` and `src/domain`: zero matches. There is nothing to avoid duplicating — the "no F09 split engine" mandate is satisfied by construction; there was never a split engine to collide with. |
| 7 | Provenance | **PRESERVE, with a known gap** | `src/domain/foundation/provenance.ts` — full producer/confidence/artifactId model, reused unmodified for every F09 row (via the row's own `provenance` field, same as every other feature). Known inherited gap (MP-07-11): a *facet* (like `value`) has no provenance of its own, only the row does — F09 does not attempt to fix this; it is out of scope and pre-existing. |
| 8 | Life-hub "Money" destination | **PRESERVE — already exists, not a stub to add** | **Correction to the brief's "Navigation" section**: Money is not a sixth destination to create. `SYSTEM_ROLES` (`src/domain/schemaPrimitives.ts:29`) and the starter `cat-money` category (`src/domain/categories.ts:17`, `systemRole:'money'`) have existed since Build 2. `LIFE_SCREEN_ROUTES` (`src/features/life/lifeStatus.ts:37-43`) already maps `money -> '/life/money'`. `app/(app)/life/money.tsx` + `src/features/money/MoneyOverview.tsx` already exist as a generic, content-free stub (reuses the same generic category/task/system projection every Life category uses — no amounts, no ledger). F09's job is to give this existing seam real content, not wire up a new route. Top-level shell (`app/(app)/_layout.tsx`, 5 tabs: Today/Life/Calendar/Systems/Her Keys AI) is untouched by this, as it is for every other Life destination. |
| 9 | Today / attention / briefing candidate pipeline | **PRESERVE, no plug-in point needed** | There is no per-feature "contribute a candidate" function anywhere. `attentionFor`/`briefingFor`/`oneMoveForDay` (`src/domain/reasoning/attention.ts`, `briefing.ts`, `src/domain/oneMove.ts`) scan the shared `AppState` collections (`tasks`, `responsibilities`, `needsMe`, …) directly. A feature "integrates" simply by writing ordinary canonical rows into those collections — F07 does exactly this and has no Today-registration code at all. Money obligations that exist as ordinary `Task` rows with a `dueDate` are picked up automatically by the existing `deadline` attention reason and the existing slot/cap (`MAX_PRIMARY_BLOCKS=3`), ranking (urgency tier), and overload-withholding (`loadTierForDay`) logic — **no new Money-specific Today code required** for the base case. |
| 10 | One Move eligibility | **PRESERVE — Task/NeedsMe only, by design** | `src/domain/oneMove.ts` — the selection engine's candidate pool (`candidatePoolFor`) only ever draws from open, non-blocked `Task` rows and open `NeedsMeItem` rows, even though its adapter registry can resolve other kinds once referenced. This is documented as "a product decision, not a storage limit." **Consequence for design**: a Money action is One-Move-eligible only if represented as an ordinary `Task` — exactly the same "task bridge" pattern F07 already uses for reimbursement follow-ups. F09 does not add a new target-adapter kind. |
| 11 | Calendar cross-domain deadline marker | **NOT PRESENT** | `src/features/calendar/model/collect.ts` (`collectDayItems`) reads exactly two collections: `state.events` and `state.tasks`. There is no generic "marker"/"overlay" projection a domain can hang a deadline on without being a real Task or Event. **Correction to the brief's "Money -> Calendar" assumption** that such a seam "might already" exist — it does not. Resolution: a Money obligation represented as an ordinary `Task` with `dueDate` already appears on Calendar through the *existing* task pathway (no duplicate event, no new marker type). Expected-income items that are not user-actionable (no natural "task" framing) have no Calendar representation today — recorded as `PENDING-INTEGRATION — MONEY CALENDAR PROJECTION` in the missing-primitives register, per brief instruction not to refactor Calendar in this branch. |
| 12 | Recurrence primitive | **PRESERVE for pattern preview; NOT SUFFICIENT for occurrence materialization** | `RecurrenceRuleSchema` (`src/domain/foundation/structure.ts:90-140`) + `nextOccurrence()` is a *derive, never store* engine: one stable subject (`about: task\|event\|system\|meal`), a rule, and `skipped` observations as exceptions — it was built for "what's the next expected run of this one persistent thing" (a System, a routine), not for "a series of independently-retained, independently-resolvable occurrences" (a rent payment every month, each with its own permanent paid/unpaid history). Confirmed by the *same* limitation already flagged for Calendar recurrence (MP-07-05: "a derived future date carries no responsibility/preparation of its own"). **Design decision** (see below): F09 V1 reuses `RecurrenceRule`/`nextOccurrence` purely for an informational "next expected" preview (identical to how Systems' schedule preview works), and uses an explicit, user-confirmed "duplicate forward" action to create the next occurrence's `Task` — never automatic materialization. True automatic per-occurrence materialization is recorded as a missing primitive, not built in V1 (matches the brief's own "do not build a complete accounting model"). |
| 13 | Privacy/scope model | **PRESERVE**, one correction | `VISIBILITY_SCOPES = ['personal','household','child','coparent-shared','professional']` (`src/domain/schemaPrimitives.ts:32`). **Correction to the brief's framing**: `coparent-shared` is NOT shared with the co-parent's own account — `src/features/coparent/identity.ts` (`isOwnerOnlyScope`) and RLS (`can_access_scoped_row`) both prove it is the household's *most private* scope, owner-only. F09's read-side projection of F07 data must preserve that owner-only truth exactly, never imply co-parent visibility. F09's own new rows (household bills/income — see scope decision below) default to `household`, the truthful scope for a shared household financial fact. |
| 14 | RLS pattern | **PRESERVE, template found** | `private.can_access_scoped_row(household_id, scope, owner_profile_id)` (`supabase/migrations/20260919231500_build4_cloud_schema.sql:315-334`), used identically for every scoped table's SELECT/INSERT/UPDATE policy. F09 adds no new table (see schema decision below), so no new RLS policy is needed — the existing, already-audited `tasks` policies cover the new column. |
| 15 | Demo mode | **PRESENT, PRESERVE** | `src/config/dataMode.ts` (`DataMode = 'demo'\|'empty'`, production always resolves to `empty`). Two independent fail-closed isolation layers: client refuses to claim a demo household (`src/domain/account/claim.ts`) and every synced table's `producer` CHECK constraint excludes `'demo-seed'` server-side. F09 inherits this for free by using the same provenance envelope — no Money-specific demo work needed. |
| 16 | Backend/sync envelope | **PRESERVE, template found** | `id, household_id, local_id, origin_device_id, owner_profile_id, scope, producer/confidence/artifact_id, origin_created_at/updated_at, created_at/updated_at, revision` + `change_log` trigger. F09 adds a column to an existing table (`tasks`), inheriting this envelope automatically — no new table means no new trigger/policy/kind registration. |
| 17 | Attention reason discriminator | **PRESERVE, one small additive change planned** | `ATTENTION_REASONS` (`src/domain/reasoning/attention.ts`) is a fixed, hand-enumerated list with no domain/kind registry — a "money due" reason is not a gap, because the existing `deadline` reason already fires generically for any task with a due date. The one real gap is **autopay pre-due suppression** (brief mandate: no "pay this" nudge before an autopay due date). This requires one small, additive conditional in the shared `deadline` loop (skip a task when its new `paymentMechanism` facet is `'autopay'` and the due date is still in the future) — the same class of single-line, justified shared-file change F05 and F07 each made once, with its own regression test. No parallel attention/briefing system is built. |
| 18 | Child/person identity | **PRESERVE** | Referenced only by canonical id (`subjectMemberId`), never by name — proven rename-safe by construction (categories test, same ID-vs-display-name pattern). Child archival is **NOT PRESENT** (B4-P0-066 still deferred, no archival column shipped server-side, per `supabase/tests/30-child-subject.sql`) — an inherited gap, not F09's to solve; F09 treats a dangling child reference the same defensive way every other feature does (never re-matched by name). |

### Canonical Money model (F09 V1)

A money obligation or expected-income item is an ordinary canonical **`Task`** — not a new entity, not a new
table. This directly follows doctrine tie-breaker 7 (one coherent product) and the fact that every piece it needs
already exists as a generic facet:

| Field | Source | Notes |
|---|---|---|
| description | `Task.title` | existing |
| amount + currency + direction | `Task.value: Money` | existing facet; **required** (not null) for a Money row; `direction: 'outflow'` = obligation, `'inflow'` = expected income |
| due / expected date | `Task.dueDate` | existing |
| payment mechanism | **NEW** `Task.paymentMechanism: 'manual' \| 'autopay' \| null` | additive facet field on `taskFacetFields` only (see schema decision); null = not applicable (always null for `inflow` rows) |
| child/person context | `Task.subjectMemberId` | existing, optional |
| responsible household member | `Responsibility` (generic) | existing, optional — reused unmodified |
| category | `cat-money` (`categoryWithRole(state,'money')`) | existing starter category |
| scope | `household` (default) | see decision below |
| resolution (one-off) | `Task.status: open -> completed` | existing mutation; "cancelled"/"no longer expected" -> `archived` (existing) |
| resolution (recurring) | same, per materialized occurrence | see recurrence decision above; no rolling anchor |
| recurrence pattern (optional) | `RecurrenceRule` (about: this task) | existing, preview-only; see decision above |

**Decisions requiring the WHY doctrine** (documented per [[product-why-decision-doctrine]] — decided inside
existing semantics, not a new durable semantic, not an owner-blocking ambiguity):

- **Default scope = `household`, not `personal`.** The brief says "default to the narrowest truthful existing
  scope rather than becoming automatically visible to every household member," which could be read either way.
  Tie-break: (1) PRESERVE TRUTH — a mortgage or utility bill is truthfully a *household* fact, not a private one;
  defaulting it to `personal` would misrepresent who it actually concerns. (2) REDUCE MENTAL LOAD — a second
  adult in the household benefits from seeing that rent is due exactly the way Home/Meals/Kids already default
  their records to `household`. F07's reimbursement data (genuinely private, per-parent) is untouched and stays
  `coparent-shared` (owner-only) exactly as F07 wrote it — this decision only concerns F09's *own* new rows.
- **Recurring money = manual "duplicate forward," not automatic materialization.** See item 12 above. Tie-break:
  doctrine limit #1 (no new durable semantics without necessity) — building a true per-occurrence materialization
  engine is a new durable semantic the existing recurrence primitive cannot honestly provide; the brief itself
  caps V1 at "recurring money template/expectation" as a *may-include* concept, not a required one, and
  explicitly says "do not build a complete accounting model." Recorded as a missing primitive, not blocked on an
  owner checkpoint, following the exact precedent of MP-07-07 ("task bridge is acceptable for V1. Owner
  checkpoint? NO").
- **Payment-mechanism suppression via one additive line in `attention.ts`, not a parallel engine.** Tie-break:
  doctrine limit #7 (keep one coherent product) — the alternative (a Money-only attention layer) is exactly what
  the brief forbids ("Money does NOT create... a parallel prioritization engine"), and the change is the same
  class of single-line, tested, additive shared-file edit F05 and F07 each made once when a real gap existed.

### F07 reimbursement mapping (required artifact)

F07 has **no single reimbursement status enum** to map from. It is three independent, composed facts, read
verbatim through the already-public `buildCoParentLogisticsView(state, householdId, clock).moneyFollowUps:
MoneyFollowUpView[]` (`src/features/coparent/index.ts`) — **F09 makes zero changes to `src/features/coparent/**`**.

| F07 canonical state (real fields) | Money read-side interpretation | Attention consequence |
|---|---|---|
| `Task.status = 'open'`, no `Responsibility` recorded | "Not yet followed up" | Not surfaced by Money (F07's own hub already owns "needs you" for this); excluded from "Outstanding reimbursements" until she has recorded a request |
| `Responsibility.state = 'requested'` | "Requested" | Outstanding — waiting on a response, not money |
| `Responsibility.state = 'acknowledged'` | "Acknowledged" | Outstanding — **not** treated as agreed (ACKNOWLEDGED ≠ ACCEPTED, per MP-07-13, already fixed shared-side in `01ed40a`) |
| `Responsibility.state = 'accepted'` | "Accepted — not yet paid" | Outstanding — an agreement exists, money does not |
| `Task.status = 'completed'` (marked done), `paymentEvidence = 'none'` | "Marked done — Her Keys has no record of a payment" (F07's own fixed sentence, reused verbatim) | **Outstanding reimbursement**, explicitly NOT "Recently resolved" — this is the doctrine-critical row: done ≠ paid |
| `paymentEvidence = 'service_reported_paid'` (dormant — no provider exists today; MP-07-06) | "Paid" | Resolved — moves to "Recently resolved" |
| `Task.status = 'archived'` (removed) | (excluded) | Not shown in Money at all — F07 already treats "Removed" as distinct from resolved and Money does not resurrect it |

### F07/F06/F08 pending-integration items this build consumes or defers

- `HK-INT-COPARENT-MONEY-01` (F07): consumed above — the mapping artifact.
- `HK-INT-HOME-MONEY-01` / MP-06-13 (F06): a repair/service `Task.value` amount may appear as read-only context
  where Money already reads tasks/events by `value !== null`; F09 does not build Home-specific budget/forecast
  UI. No F06 file touched.
- `HK-INT-MEALS-MONEY-01` (F08): explicitly **not resolved in V1** — the brief forbids grocery budget/meal-price
  work in F09. Left open for a later Money milestone.
- `FE-24 — Money OS` (Build 4, `BUILD4_FOUNDATION_BUILDOUT.md:458-473`): F09 is the feature FE-24 named and
  deliberately deferred ("No Money OS, bank connectivity or payments... IMPLEMENTATION APPROACH: ADR-014").

### Talk It Out -> Money capture

**PENDING-INTEGRATION**, per brief instruction. Note for the record: `src/features/talk-it-out/capture/local/money.ts`
already parses `$`-amounts from natural language into a `Money` value and infers `direction` from verbs
("owe"/"reimburse"/"pay back"), feeding `interpretations` rows (which already carry the `value` facet in the
cloud schema). This is existing F02 capability, not new. F09 does not wire it to any new interpreter behavior,
per the brief; when later wired, it must route through F07's canonical reimbursement truth (for reimbursement
language) or F09's own obligation/income mutations (for bill/income language), never mint a duplicate.

---

## F09-M2 — Local commands / persistence

(to be recorded as implementation proceeds)
