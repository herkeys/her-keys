# HK-FEATURE-04-SYSTEMS-ROUTINES — build ledger

Feature 04 of four parallel feature builds (Today / Talk It Out / Calendar / **Systems**).
Autonomous build; independent Codex audit follows. **No push, no PR, no merge, no integration.**

| | |
|---|---|
| Feature branch | `feature/04-systems-routines` |
| Forked from | `design/01-front-end-system` @ `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` |
| Worktree | `C:\Users\jsmit\Her-Keys-F04` (dedicated; `Her Keys` = Feature 01 checkout, `Her-Keys-F02`, `her-keys-f03` untouched) |
| Contract | AUTONOMOUS FEATURE BUILD contract v1 + ADDENDUM 01 + the two owner "PRODUCT WHY" / "Feature 04 WHY" messages |
| Feature WHY | Repeated household work should become reusable infrastructure so she does not have to remember and redesign the process every time. |

Tie-break doctrine for ambiguity (owner message, applied throughout, in order): preserve truth → reduce mental load → preserve
agency → preserve context → make the next moment easier → build for learning → one coherent product → don't create work to
manage the tool. It is a decision framework inside approved scope, never permission to invent durable semantics.

---

## 0. Entry gate (R0)

### 0.1 Source authority — DEVIATION (read this first)

`HK-PARALLEL-SOURCE-01` **could not be found**. Searched: the tracked tree at `5007b0f` (all of `docs/`), untracked files,
the root of the F01/F02/F03 worktrees, `~/Downloads`, `~/Desktop`, `~/Documents`, the three `.claude/` dirs, and the
auto-memory directory. No file, path or string contains the identifier.

Consequence and how it was handled: the contract makes that document authoritative for source branch/HEAD, test baselines,
migration hashes, fingerprint and post-Kimi facts. The source branch and HEAD are stated in the contract itself and were
verified directly. Every other expected value was taken from the **committed in-repo authorities** — the K9 completion report
(`docs/design-system/HK-FE-UI-01-final-report.md`), `docs/builds/BUILD4.md`,
`docs/builds/HK-FE-UI-01-PERMANENT.txt` and `supabase/tools/baselines/build4-foundation-local-fingerprint.json` — and each one
was **independently recomputed** (0.2). All matched, so the foundation-drift risk the gate exists to catch is closed by a
different route. **If HK-PARALLEL-SOURCE-01 states any value different from 0.2, treat it as HIGH-PRIORITY and reconcile.**
Owner action: supply that document to the Codex audit.

### 0.2 Recomputed common-source gates (in the F04 worktree, after `npm ci`)

| Gate | Result | Expected (in-repo authority) |
|---|---|---|
| `git rev-parse HEAD` | `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1` | equals `design/01-front-end-system` |
| `git status` at entry | clean | clean |
| TypeScript `tsc --noEmit` | exit 0 | green |
| App tests `npm test` | **808 / 808**, 169 suites, 0 fail / skip / cancelled | 808 / 169 (K9) |
| Backend harness `node supabase/tests/run.mjs` | **684 / 684** checks, 0 FAIL | 684 (K9) |
| Expo Doctor | **21 / 21** | 21 / 21 |
| Expo export `--platform android` | exit 0 (output kept out of the repo) | succeeds |
| Shipping migration SHA-256 (working-tree/CRLF form, as BUILD4 records it) | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` | same |
| Baseline migration SHA-256 (git-blob form, as BUILD4 records it) | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` | same |
| Local schema fingerprint (`schema-fingerprint.mjs verify --against build4-foundation-local-fingerprint.json`) | **MATCH**, gating `199ed4d4c1b37cd654b5853e91cbde27`, 3613 facts | same |

Measurement notes (honest limits):
- The two migration hashes are measured on different normalizations because that is how BUILD4.md recorded them; both
  match. (Shipping migration git blob is LF: `7582e5e6…`; baseline working tree is CRLF: `81909daa…` — neither is the recorded basis.)
- **Fingerprint was measured read-only** (`print-sql` → `docker exec psql` → `json:` → tool `verify`). I did **not** run
  `supabase db reset --local`: the container `supabase_db_Her_Keys` is shared by every sibling worktree, and a reset would pull
  the floor out from under a parallel build. The catalogs are inspected inside `begin … rollback`.
- **Backend harness parallel hazard:** it uses fixed database names (`b4_env_a`, …) with `DROP DATABASE … WITH (FORCE)` in the
  same shared container. It was run only after `pg_stat_activity` showed no `b4_*` connection. Recorded as an integration
  candidate (harness DB names should be run-unique).

---

## 1. Existing Systems inheritance (R0)

Systems was **not** one of HK-FE-UI-01's four migrated surfaces. What actually exists at `5007b0f`:

| # | Capability | Actual artifact | Verdict |
|---|---|---|---|
| 1 | Systems tab registration | `app/(app)/_layout.tsx` `Tabs.Screen name="systems"` (frozen shell) | **PRESERVE** |
| 2 | Systems route/screen | `app/(app)/systems.tsx` — heading + `SystemsList` + Her Keys+ card | **REFINE** (becomes a nested stack: hub / detail / editor, exactly as `life/` already is) |
| 3 | Systems screen header copy | "…Her Keys protects these rather than replacing them." — claims a behavior with no evidence | **REPLACE** (copy only) |
| 4 | Systems list component | `src/features/systems/SystemsList.tsx` — category + name + description per system, hard-coded `WORKING` tag | **REPLACE** (see 1.1) |
| 5 | System definition type + storage | `HouseholdSystem` (`src/domain/state.ts:188`), `AppState.systems` (≤500) | **PRESERVE** |
| 6 | System step type + storage | `SystemStep` (`foundation/structure.ts:171`), `AppState.systemSteps` (≤5000) | **PRESERVE** |
| 7 | Step transition | `addSystemStep` (`domain/structure.ts:261`), `stepsInOrder` — **no production caller** | **PRESERVE** (consumed as a read selector) |
| 8 | Recurrence rule + transitions | `RecurrenceRule`, `addRecurrence`, `setRecurrenceStatus`, `occurrencesOf`, `nextOccurrence`, `skipOccurrence` — **no production caller** | **PRESERVE** |
| 9 | Responsibility lifecycle | `domain/responsibility.ts` — `delegate/acknowledge/accept/decline/returnToSelf/reassign/…` — **no production caller** | **PRESERVE** |
| 10 | Demo data | 4 `household`-scope systems (Backpack landing zone, Sunday reset, Bill envelope, Autopay for utilities); no steps, recurrence or responsibility | **PRESERVE** |
| 11 | Her Keys+ card on the Systems screen | `useEntitlement().presentPaywall('systems_upgrade')` — a working monetization entry | **PRESERVE** (behavior and copy untouched; owner-owned) |
| 12 | Systems detail / editor | none | **ABSENT** |
| 13 | System **creation** transition (`addSystem`) | none anywhere in `src/` (seeds and migrations only) | **ABSENT** |
| 14 | System edit transition; step edit / reorder / remove | none | **ABSENT** |
| 15 | In-place recurrence edit | none (`addRecurrence` refuses when an active rule exists) | **ABSENT** |
| 16 | Run / guided execution / step completion / occurrence rows | none (§3 model map) | **ABSENT** |
| 17 | System lifecycle status; archive; delete; duplicate | none — `HouseholdSystem` has no status; sync has no delete path | **ABSENT** |
| 18 | Child subject on a System | none — no `subjectMemberId` on `HouseholdSystem` | **ABSENT** |
| 19 | Consequence / reversibility on a System or step | none — only on task/event | **ABSENT** |
| 20 | Loading / recovery treatment specific to Systems | none; relies on the root guard (`RootNavigator` renders nothing until settled) | **ABSENT** (handled in R3/R7) |
| 21 | Other readers of `state.systems` | Home overview, Money overview (`value: 'Working'`), Life hub (`"N systems running"`), One Move (`system` target) | untouched legacy sub-surfaces; see 1.2 |

STUB findings: none of the above is a dead route. The only stub-like artifact is (4): it is a real read of canonical state
wearing an unearned status claim.

### 1.1 REPLACE record — `SystemsList.tsx`
- **Existing guarantee:** every canonical System is listed once with its area name, name and description.
- **Concrete deficiency:** the tag `WORKING` is hard-coded. It asserts an operating state (that the routine is "working")
  for every System with no data source — the canonical model has no such fact. It also carries no steps, schedule,
  responsibility or navigation, and uses legacy aliases (`Overline`, `micro`, `title`, `Card tone`).
- **Why REFINE is insufficient:** the false claim is part of the component's render contract, not a styling detail.
- **Replacement:** `projectSystemsHub` → `SystemsHub` (state tags come only from canonical facts: schedule / paused / none).
- **Regression mapping:** hub test asserts every canonical System appears exactly once with its area name and description,
  and that no `WORKING`-style status is ever emitted (copy audit).

### 1.2 Claims of "working / running" on untouched legacy surfaces (recorded, not changed)
`MoneyOverview` (`'Working'`), Life hub `describeHome` (`"${n} systems running"`) and the old Systems tag all assert an
operating state the model doesn't hold. Feature 04 removes its own; the other two are shared/frozen surfaces (K7 migrated
Life) → **integration candidate HK-INT-COPY-01**, not touched here.

---

## 2. Existing test disposition (R0)

Feature 04 modifies **no** foundation/domain/sync/persistence module, so no existing guarantee moves.

| Test | Semantic guarantee | Disposition |
|---|---|---|
| `foundationAcceptance3` › FE-25 "a household system is an engine: steps, a schedule, an autonomy setting and an effort" | ordered steps, a weekly rule honoring a skipped week, autonomy + effort | PRESERVED |
| `foundationOps` › "recurrence is ONE convention…", "a routine with a rule: its next occurrence skips a recorded exception…", "system steps keep their order…" | rule shapes, derived next occurrence, skip = history, step order | PRESERVED |
| `foundationOps` › "the whole lifecycle, each step recorded…", "a delegate must exist, and the thing delegated must exist" | responsibility lifecycle; unknown holder refused | PRESERVED |
| `foundationAcceptance` › "…a weekly routine are read through ONE shape"; "…storable targets…" | commitment facets; typed targets | PRESERVED |
| `foundationAcceptance2` › FE-10/11/12 | decomposition, delegation, closed-loop responsibility | PRESERVED |
| `routeAccess` › protected links (`/systems`) | `/systems…` maps to the `(app)` guard | PRESERVED (nested routes map by first segment) |
| `designIndependence`, `tokenBoundary` | no presentation in stored state; no credential surfaces | PRESERVED (Feature 04 adds no stored field) |
| `categories`, `migrationV3ToV4`, `legacyCatalogRemediation` | "system role"/"system-derived" = category role and provenance producer, **not** the Systems feature | PRESERVED (unrelated) |

ENTRY 808 → PRESERVED 808 · REWRITTEN 0 · REPLACED 0 · REMOVED 0. (ADDED / FINAL filled at R9.)

---

## 3. AI-affordance and visual-language disposition (R0)

- **Existing AI affordances on Systems (Addendum M):** none. `systems.tsx` / `SystemsList.tsx` contain no Ask-AI /
  Generate / Suggest-routine control. "Her Keys AI" is a separate primary tab. Nothing removed; no new AI wired.
- **Visual language (Addendum C):** every *new or materially modified* Feature 04 composition uses the permanent HK-FE-UI-01
  primitives and canonical tokens (`color.*`, `type.*`, `spacing`, `radius`, `sizing`). Untouched legacy sub-surfaces
  (Home/Money overviews, Life hub) are not restyled.

---

## 4. Foundation consumption trace (R1 gate)

Governance IDs are not evidence; the **actual module, export and test** are. Verdicts: CONSUME-AS-IS · CONSUME-PARTIAL · NOT-FOUND.

| Capability | Gov. ID | Actual module · export | Tests that pin it | Feature 04 use | Verdict |
|---|---|---|---|---|---|
| System definition | B4-FE01-015/-016 | `domain/state.ts` `HouseholdSystemSchema`, `AppState.systems` | foundationAcceptance3 FE-25; `foundationSpecs` | read + F04 producer | **PARTIAL** (type/storage yes, no producer) |
| System step | B4-FE01-022 | `domain/foundation/structure.ts` `SystemStepSchema`; `domain/structure.ts` `addSystemStep`, `stepsInOrder` | foundationOps "system steps keep their order" | read order; F04 producer for add/edit/reorder | **PARTIAL** (no edit/reorder/remove) |
| Recurrence | B4-FE01-018 (ADR-017) | `structure.ts` `addRecurrence`, `setRecurrenceStatus`, `occurrencesOf`, `nextOccurrence`, `skipOccurrence` | foundationOps recurrence ×2 | create, stop, pause/resume, skip, derive next/preview | **PARTIAL** (no in-place edit) |
| Commitment facets | B4-FE01-015/-016 (ADR-015) | `foundation/commitment.ts` `systemFacetFields`, `commitmentFacetsOf`, `emptySystemFacets` | foundationAcceptance | preserve `automationMode/effortMinutes/energyDemand`; read `effortMinutes` | **PARTIAL** (no consequence on Systems) |
| Responsibility + people | B4-FE01-013/-014 (ADR-019) | `domain/responsibility.ts` `delegate/acknowledge/accept/decline/returnToSelf/reassign/liveResponsibilityFor/unacknowledgedResponsibilities`; `foundation/responsibility.ts` | foundationOps lifecycle, FE-11/12 | System-level assignment + honest state | **AS-IS** (`addPerson` no caller; not offered) |
| Child references | — | `AppState.children`; `Responsibility.responsibleChildId` | foundationOps | a child may **hold** a responsibility | **PARTIAL** — child as System *subject*: **NOT-FOUND** |
| Dependencies | B4-FE01-017 (ADR-016) | `structure.ts` `addDependency`, `blockersOf`, `isBlocked`, `isDone`; endpoints = content kinds (a System, never a step) | foundationOps | read-only, neutral ("Needs …"); `isDone('system')` is always false, so **no "blocked" claim** is made | **PARTIAL** |
| Goals | B4-FE01-021 | `Goal`, `goalProgress` | foundationOps | not used | n/a |
| Consequence / reversibility | B4-FE01-007..010 | `foundation/authorization.ts` (task/event facets only) | — | none | **NOT-FOUND** for System/step → MP-07 |
| Action intent / execution / outcome | B4-FE01-009..012 | `ActionIntentSchema` (`about` may be a System), `IntentDecisionSchema`, `ActionExecutionSchema` + `ActionOutcomeSchema` (**server-written**) | foundationAcceptance3 SCENARIO D | read-only evidence line; no execution language without a real row | **PARTIAL** |
| Reasoning: attention | B4-FE01-019 (ADR-018) | `reasoning/attention.ts` `attentionFor` (delegation → `unacknowledged_delegation` about the responsibility) | foundationAcceptance3 | Systems hub reads the same primitive (`unacknowledgedResponsibilities`) so Today can already see it | **AS-IS** |
| Reasoning: related / evidence | B4-FE01-031 | `reasoning/related.ts` `relatedTo` | foundationAcceptance | not needed | n/a |
| Household context / timezone / logical day | — | `domain/context.ts`, `logicalDay.ts` (`logicalDateAt`, `zonedTimeToEpochMs`, …), `state.user.timezone` | logicalDay | all date/"today" logic | **AS-IS** |
| Provenance | B4-FE01-001/-005 (ADR-001) | `foundation/provenance.ts` `userProvenance`, `provenanceFor` (demo → `demo-seed`); `PROVENANCE_LABEL` in `design/components/intelligence.tsx` | provenance tests | stamp new rows; show origin only when not user-stated | **AS-IS** |
| Confidence | — | `Provenance.confidence` (only for `ai-inference`/`import-sync`); `ConfidenceBadge` | — | display only when present; never set | **AS-IS** |
| Canonical mutation | — | `state/appStore.ts` `commit`/`dispatch(Transition)`; `store/AppStateProvider` `useAppStore`/`useStoreSnapshot` | appStore | the only write path | **AS-IS** |
| Cross-domain refs | B4-FE01-027 (ADR-005) | `foundation/typedRef.ts` `TypedRef`, `refExists` | tokenBoundary/foundationSpecs | refs for responsibility/recurrence/skip | **AS-IS** |

## 5. System / occurrence / run model map (R1 gate)

| Concept | Repository type | Storage | Canonical or derived | Mutable | Creation path | Completion path | Exists |
|---|---|---|---|---|---|---|---|
| SYSTEM DEFINITION | `HouseholdSystem` | `AppState.systems` | canonical | yes (no `updatedAt`) | none in production → **F04 producer** | — | **YES** |
| STEP DEFINITION | `SystemStep` | `AppState.systemSteps` | canonical | yes | `addSystemStep` (uncalled) → **F04 producer** | — | **YES** |
| RECURRENCE RULE | `RecurrenceRule` | `AppState.recurrences` | canonical | status + fields | `addRecurrence` (uncalled) | end via `status:'ended'` | **YES** |
| MATERIALIZED OCCURRENCE | — | — | **derived only** (`occurrencesOf`) | — | none | — | **ABSENT** |
| Occurrence exception | `BehaviorObservation(system, skipped, plannedDate)` | `AppState.observations` | canonical, append-only | no | `skipOccurrence` | — | **YES** |
| ACTIVE RUN / EXECUTION | — | — | — | — | none | — | **ABSENT** |
| STEP COMPLETION | — | — | — | — | none | — | **ABSENT** |
| Her Keys acting on a System | `ActionIntent`/`ActionExecution`/`ActionOutcome` | `AppState.intents…outcomes` | canonical, server-written | no | trusted server only | — | **YES (evidence only)** |
| Responsibility for a System | `Responsibility(about:{system})` | `AppState.responsibilities` | canonical | state machine | `delegate` (uncalled) | `accept`/`completeResponsibility` | **YES** |

`RUN = ABSENT` — recorded, not manufactured. The definition screen is a blueprint: **no completion checkboxes.**

## 5b. Lifecycle map (R1 gate)

- **System entity:** no lifecycle. There is no status; nothing can be paused, archived, activated or deleted (MP-01).
- **Schedule (`RecurrenceRule.status`):** `active ⇄ paused`; `active|paused → ended`; `ended` is terminal for that row (a new rule may be set).
  Presented as *schedule* state only: "Repeats …", "Schedule paused", "Stopped repeating", "No schedule".
- **Responsibility:** `owned` · `requested → acknowledged → accepted` · `declined` · `completed` · `returned`
  (assigned ≠ acknowledged ≠ accepted; delegated ≠ covered).
- **Steps:** none.

## 6. R1 gate answers (Addendum AC)

```
SYSTEM DEFINITION TYPE:        PRESENT
STEP TYPE:                     PRESENT
CANONICAL STORAGE HOME:        PRESENT   (AppState.systems / systemSteps; persisted; synced kinds)
EXISTING PRODUCTION PRODUCER:  ABSENT    (no addSystem anywhere; addSystemStep/addRecurrence/delegate have no callers)
SECTION A FALLBACK ELIGIBLE:   YES       (types ✓, storage ✓, store.commit ✓, no new persisted shape needed)
CREATE CAPABILITY:             FALLBACK-PRODUCER
MEANINGFUL EDIT:               FALLBACK-PRODUCER   (rename, add/edit/reorder steps, change schedule, change responsibility)
RECURRENCE:                    PRESENT
OCCURRENCE MATERIALIZATION:    ABSENT
RUN:                           ABSENT
STEP COMPLETION:               ABSENT
HISTORICAL STEP REFERENCES:    ABSENT    (verified: no durable type references a systemStep)
```

Section A proof obligations (verified at exit): no new AppState key, no envelope/schema-version change, no new sync kind or op,
no migration/RLS/Supabase change, no touch to `src/domain/**`, `src/persistence/**`, `src/state/**`, `supabase/**`.

**Minimum-real-feature feasibility = YES.** Create ✓ (F04 producer) · meaningful edit ✓ (rename, add/edit/reorder steps,
schedule, responsibility) · ordered typed steps ✓ · canonical local state ✓. The remove-step gap, the absent run and the
absent System lifecycle do **not** invalidate it (contract §83: none of those is a STOP condition).

## 7. Design decisions (each resolves an ambiguity by the WHY doctrine)

1. **One route stack, no shell change.** `app/(app)/systems.tsx` → `app/(app)/systems/{_layout,index,[id],edit}.tsx`, the same
   nested-stack shape as `life/`. `Tabs.Screen name="systems"` and `rootScreenForPath` already cover it; `app/_layout.tsx`,
   `(app)/_layout.tsx`, `routeAccess.ts` are **not touched**. The editor is a `presentation:'modal'` screen inside that stack.
2. **Explicit save; draft ≠ canonical.** Editor state is component state. Nothing is written until Save. There is no draft
   persistence in the app and none is added (restart drops an unsaved draft; canonical rows are untouched).
3. **Idempotent save.** The draft carries a stable system id and stable step keys; new step ids are derived from them, so a
   double-tap or retry re-applies to the same rows instead of creating duplicates. A same-frame `inFlight` guard (as `TaskForm`).
4. **Stale-editor guard.** The editor records a content fingerprint of the rows it loaded (system, steps, live rule, live
   responsibility). The check runs **inside** the commit transition, on the state that commit will write, so it cannot race.
   Changed underneath ⇒ refuse, keep canonical, show "This System changed while you were editing" and offer *Load latest*.
   No merge is invented. (`store.commit` returns `true` for a no-op transition, so the use-case reads the transition's own
   outcome rather than trusting the boolean.)
5. **Availability before content (Scenarios AB/AC).** The hub reads `useStoreSnapshot()` (not `useHouseholdState`, which throws).
   `loading` ≠ `empty`. When `persistence === 'disabled'` (future-version / read-failed / real-data-under-demo) the session is
   memory-only and its state is a stand-in, so Systems are **not shown and not editable** — a "saved" that isn't durable would
   be a lie. After a normal start-over recovery the fresh state is authoritative and a calm notice is shown.
6. **Step positions are sparse (stride 10) and a reorder moves the fewest rows onto slots nobody holds** (MP-04). The cloud
   holds `UNIQUE(system_id, position)` and pushes are one coalesced row at a time, so any swap collides. `layoutPositions`
   keeps the largest feasible set of rows in place (a small DP) and puts every other row on an integer no current row holds, so
   no push order can collide. There is **no renumber path**: a layout in which every row moves onto a free slot always exists,
   and it is collision-safe where a renumber is not. `stepsInOrder` already sorts by position, so nothing downstream changes.
   Proven three ways: unit + an 800-trial seeded property test (`stepOrder.test.mjs`), and against the REAL `pushPending`
   with a fake transport that enforces the constraint (`syncReorder.test.mjs`: the defect reproduced; the mitigation under every
   push order).
7. **Recurrence edits are in place**, on the single live rule (cloud grants UPDATE on every rule field; history is in
   observations). Change-frequency keeps the row; stop = `ended`; nothing is ever deleted.
8. **Category default.** `categoryId` is required by the schema. The editor pre-selects the household's Home category (visible,
   one tap to change) — a form default, not a claim. `scope` stays `household`; never `child` (MP-02). Provenance goes through
   `provenanceFor(state.origin, userProvenance())`, so demo Systems stay `demo-seed` and never sync.
9. **Duration truth.** Unknown ≠ 0. A total is stated only when every step has a minute value; otherwise "at least N min · M of K
   steps estimated" or "No estimate yet". A System's own stated `effortMinutes` is read, never authored.
10. **Hub order (Scenario AH), no score.** (1) needs attention (unanswered delegation past due; handed back) → (2) next expected
    date ascending → (3) everything without a derivable date, by title → id. Grouping tags come from canonical facts only.
11. **Editor form factor (Addendum N).** One primary editor surface (`Screen` + `TextField` + `ChipToggle` + `Button`),
    sections disclosed progressively (Steps, Schedule, Who's responsible). `ConfirmationSheet` only for the irreversible skip.
    No wizard, no property sheet, no nested modals. Needs two primitives the system lacks → MP-10, MP-11.
12. **Copy is centralized** in `src/features/systems/copy.ts`; JSX carries no operational sentences.

## 8. Shared files touched (planned, updated at each commit)

| Path | Why | Commit | Likely sibling collision | Integration need |
|---|---|---|---|---|
| `app/(app)/systems.tsx` → moved to `app/(app)/systems/index.tsx` | Systems tab becomes a nested stack (hub/detail/editor), like `life/` | R3 | none expected (Features 01–03 do not own the Systems tab) | record the move; the tab registration is unchanged |
| *(none other planned)* | Feature code lives under `src/features/systems/**`, `tests/systems/**`, `tests/fixtures/systems/**`, `docs/builds/HK_FEATURE_04_*` | — | — | — |

## 9. Common-fork assumptions (§78 — template the integration wave applies to Features 01–03)

What Feature 04 assumed existed at `5007b0f`, each verified against code:
- **System primitives:** `HouseholdSystem` (id, name ≤120, description ≤500, required `categoryId`, `automationMode`, `effortMinutes`, `energyDemand`, provenance, scope), in `AppState.systems` ≤ 500.
- **Step primitives:** `SystemStep` (position 0–999, title ≤200, `effortMinutes` nullable); unique `(systemId, position)` in state integrity **and** in the cloud.
- **Recurrence primitives:** §RECURRENCE_AT_FORK_FACTS.
- **Mutation APIs:** `store.commit/dispatch(Transition)`; foundation transitions listed in §4. **No System producer.**
- **Runtime state:** `useStoreSnapshot()` → `status`, `state`, `today`, `recovery`, `persistence`; hydration is complete before `(app)` mounts; `recovery` still mounts the app on a stand-in state.
- **UI primitives:** `Screen, AppText, Overline, Card, Button, ChipToggle, Tag, StatusList, TextField, Sheet, ConfirmationSheet, InlineNotice, EmptyState, LoadingState, ErrorState, SegmentBar`, intelligence set; tokens `color/type/spacing/radius/sizing`.
- **Shell route:** Systems is one of five tabs; nested routes under a tab map to the `(app)` guard by first segment.
- **Run / execution:** none. **Notifications:** none. **AI/Gemini:** none.

---

# COMPLETION RECORD (R9)

## 10. What was built

`src/features/systems/` (25 new files) · `app/(app)/systems/` (4) · `tests/systems/` (19) · `tests/fixtures/systems/scenarios/`
(29 evidence artifacts) · `docs/builds/HK_FEATURE_04_*` (4). 83 files changed since the fork: 9,866 insertions, 81 deletions
(the deletions are the two replaced files, `systems.tsx` and `SystemsList.tsx`).

| Layer | Files | Job |
|---|---|---|
| `model/` | `types, hub, detail, schedule, steps, responsibility, availability, actions, fingerprint, canonical, evidence` | Derived projections. Facts and machine codes only; nothing stored. |
| `commands/` | `saveDraft, draft, schedule, responsibility, stepOrder` | **The production producer** (Addendum A): pure transitions over existing durable types. |
| `useCases/commit.ts` | | The only place commands meet the store; reports `saved / unchanged / not_saved` honestly. |
| `copy.ts`, `format.ts` | | Every operational sentence; deterministic date/clock text. |
| `ui/`, `editor/` | `SystemsHub, SystemCard, SystemDetail, SystemEditor, useSystemEditor` | Screens built from the permanent primitives. |
| `ai/systemProposalTypes.ts` | | The future contract — **types only** (Addendum L). |

## 11. Scenario matrix (Q) — A through AJ, mechanically resolved

Statuses: PASS · SAFE-UNAVAILABLE · NOT-APPLICABLE. **No FAIL. No DEFERRED-IN-RUN.** "Evidence" is the committed artifact under
`tests/fixtures/systems/scenarios/`; every artifact is regenerated and compared by its scenario (mismatch = failure).

| ID | Tier | Status | Proof (tests · evidence) |
|---|---|---|---|
| A empty | 1 | **PASS** | `scenarios.read` · `ui.hub` · A-empty |
| B create simple System | 1 | **PASS** | `scenarios.write` · `ui.editor` · B-create-simple (incl. remount) |
| C edit System | 1 | **PASS** | `scenarios.write` · C-edit-system |
| D add / edit / remove step | 1 | **PASS** (add, edit) · remove **SAFE-UNAVAILABLE** | `scenarios.write` · `ui.editor` · D-steps · V-lifecycle-unavailable |
| E reorder | 1 | **PASS** | `scenarios.write` · `syncReorder` · `stepOrder` · E-reorder |
| F recurrence | 1 | **PASS** | `scenarios.read/write` · F-recurrence-weekly · F-recurrence-saved |
| **H child-scoped System** | 1 | **SAFE-UNAVAILABLE** | A System has no child subject and the cloud rejects `scope:'child'` without one (MP-02); the editor cannot produce one. `scenarios.lifecycle` · H-child-unavailable |
| J responsibility | 1 | **PASS** | `scenarios.lifecycle` · `ui.detail` · J-responsibility |
| N template ≠ run | 1 | **PASS** | `scenarios.read` · `ui.hub` · `ui.detail` · N-template-not-run |
| R recurrence timezone | 1 | **PASS** | `scenarios.read` · `boundaries` (no device clock) · R-recurrence-timezone |
| W draft vs save | 1 | **PASS** | `scenarios.write` · `ui.editor` |
| G recurrence preview | 2 | **PASS** | `scenarios.read` · `ui.editor` (bounded 3, presentation-only, honors skips) |
| I multiple children | 2 | **PASS** (holder distinctness) · subject **SAFE-UNAVAILABLE** | `scenarios.lifecycle` · I-two-children |
| K unknown person | 2 | **PASS** | `scenarios.lifecycle` · `ui.detail` · K-unknown-person |
| L no recurrence | 2 | **PASS** | `scenarios.read` · `ui.editor` · L-no-recurrence |
| M pause / resume | 2 | **PASS** — schedule-scoped (System pause **SAFE-UNAVAILABLE**, MP-01) | `scenarios.lifecycle` · `ui.detail` · M-pause-resume |
| O real run | 2 | **SAFE-UNAVAILABLE** | no run entity or step completion exists · N-template-not-run |
| P run restart | 2 | **SAFE-UNAVAILABLE** | same |
| Q template edit during run | 2 | **SAFE-UNAVAILABLE** | no run can be active, so nothing to block or version |
| S DST | 2 | **PASS** | `scenarios.read` · S-dst |
| X double save / idempotency | 2 | **PASS** | `scenarios.write` · `ui.editor` |
| AA demo isolation | 2 | **PASS** | `scenarios.durability` · AA-demo-isolation |
| T unknown step duration | 3 | **PASS** | `scenarios.read` · T-unknown-duration |
| U dependency | 3 | **PASS** | `scenarios.read` · U-dependency |
| V archive / delete | 3 | **SAFE-UNAVAILABLE** | no status, no delete path · V-lifecycle-unavailable |
| Y editor staleness | 3 | **PASS** | `scenarios.write` · `ui.editor` · Y-stale-editor |
| Z restart during unsaved edit | 3 | **PASS** | `scenarios.durability` · Z-restart-unsaved (no draft persistence exists, and none was added) |
| AB loading vs empty | 3 | **PASS** | `scenarios.read` · `ui.hub` · AB-loading |
| AC recovery / quarantine | 3 | **PASS** | `scenarios.read/durability` · `ui.hub/detail/editor` · AC-recovery |
| AD large System | 3 | **PASS** | `scenarios.read` · `audits` (perf) · AD-large-system |
| AE cross-domain System | 3 | **NOT-APPLICABLE** (evidence) | `HouseholdSystem` has exactly one required area · AE-not-applicable |
| AF.1 no execution evidence | 3 | **PASS** | `scenarios.read` |
| AF.2 legitimate execution evidence | 3 | **PASS** | fixture-built intent/decision/execution/outcome rows; stage from the foundation's `intentLifecycle` · `ui.detail` · AF-execution-claims |
| AG delete with references | 3 | **SAFE-UNAVAILABLE** | no delete path (V) |
| AH hub ordering | 3 | **PASS** | `scenarios.read` · `ui.hub` · AH-hub-ordering |
| AI legacy System edit | 3 | **PASS** | `scenarios.write` (child-scoped, foreign facets, demo seed) · AI-legacy-edit |
| AJ duplicate | 3 | **SAFE-UNAVAILABLE** | no copy mutation; reset-vs-carry undefined · V-lifecycle-unavailable |

**Read this honestly:** Tier-1 scenario **H is SAFE-UNAVAILABLE, not PASS.** Child-subject integrity is *preserved* (nothing can violate
it because nothing can express it), but a woman cannot say "this System is for Josie". Whether that satisfies "Tier 1 resolved" is the
auditor's/owner's call; it is the single biggest product gap (MP-02), together with MP-01 (Systems can never be removed).

## 12. Production producer status (Addendum AH.1) and proof nothing durable changed

- **Existed at the fork?** No. Types, storage, sync kinds and `store.commit` existed; nothing created or edited a System.
- **Feature 04 producer created?** **YES** — `src/features/systems/commands/{saveDraft,schedule,responsibility,draft,stepOrder}.ts`
  + `useCases/commit.ts`. **PRODUCTION PRODUCER ADDED BY FEATURE 04 — NOT PRESENT AT COMMON FORK.**
- **Canonical APIs used:** `store.commit(Transition)`; foundation `addRecurrence`, `setRecurrenceStatus`, `skipOccurrence`,
  `nextOccurrence`, `delegate`, `acknowledge`, `accept`, `decline`, `returnToSelf`, `reassign`, `provenanceFor`, `userProvenance`,
  `emptySystemFacets`; whole-state validation (`validateAppState`) happens inside `store.commit`.
- **Proof no durable state shape, schema or sync change occurred** (mechanical, from git):
  `git diff --stat 5007b0f..HEAD -- src/domain src/persistence src/state src/store src/design src/config src/platform src/monetization supabase package.json package-lock.json app.json app/_layout.tsx "app/(app)/_layout.tsx" tests/support .claude`
  → **empty**. No new `AppState` key, no envelope/schema-version change, no new sync kind or op, no migration/RLS/Supabase change.
  A test (`boundaries`) also forbids Systems from importing `domain/sync`, `persistence`, or any Supabase code.
- **INTEGRATION CANDIDATE — PRODUCER OWNERSHIP / SHARED-LOCATION RECONCILIATION** (MP-06): Talk It Out accepting a proposed System
  must call this same producer; it belongs in `src/domain/` once the integration wave decides.

## 13. MINIMUM SHIPPABLE SYSTEMS CORE = **YES**

Checked against Addendum AD after R2 + R3 + R4 (commits `32e5959`, `103d94f`, `6a49189`): a real canonical System can be **created**
and **meaningfully edited** (rename, add/edit/reorder steps, change schedule, change responsibility — not metadata-only); ordered steps
work; add/edit/reorder are truthful, and **remove is honestly unavailable**; the recurrence editor exists only because recurrence
exists; child/person integrity preserved; no fake run/execution; permanent UI system used for every touched composition; app tests,
TypeScript and the backend baseline green; no foundation or source drift.

## 14. Structural evidence, regeneration and mutation testing

- 29 committed artifacts; each scenario regenerates its evidence and compares it with the committed file (Addendum P). The manifest
  test fails on an orphaned or missing artifact. Regeneration is explicit (`UPDATE_SYSTEMS_EVIDENCE=1`). Beyond initial generation it was used twice to change existing
  artifacts, each explained in its commit and verified to be only the intended lines (added `anchorDate`; added intent
  `stage`/`latestOutcome`).
- **Mutation testing** (a regression test only counts once it fails with the defect put back): 14 defects in behavior and 9 in the
  audits were injected and restored (stale-check removed, random step ids, child scope, unknown-duration-as-total, loading-as-empty,
  false save claim, unbounded preview, hub ignoring attention, accept≈acknowledge, step completion state, renumber-everything, second
  rule on edit, skip ignoring the date seen, phantom person; a JSX sentence, celebration and reminder claims, shame wording, an
  unexplained disabled control, a truncated step title, a TODO, runtime code in the AI seam, a slowed projection). **23/23 caught.**
  One initially escaped (loading-vs-status) and exposed a real test gap, which was fixed.

## 15. Performance (measured, not assumed)

Dense fixture: 50 Systems, ≈ 500 steps, 40 schedules (mixed active/paused, all four frequencies), 5,000 observations.

| Projection | Median | Soft target |
|---|---|---|
| Systems hub (`projectSystemsHub`) | **≈ 33 ms** | < 100 ms |
| System detail (14 steps + schedule) | **≈ 0.3 ms** | < 50 ms |
| 90-step System detail | **< 0.1 ms** | < 50 ms |

No persistent cache was added. (Measured on a machine already under heavy memory pressure from parallel sessions.)

## 16. Accessibility

Verified by rendered-tree tests, `audits.test.mjs` and the design system's own contracts: each step is one spoken item in order
(`Step 2: Fill water bottle, about 5 minutes`); a hub card is one button with one spoken sentence; the detail title is a header;
every field has a visible label and an accessibility label; chip rows carry `selected` state inside a labelled group (MP-12);
lifecycle state is always **words**, never colour alone ("Schedule paused", "Josie hasn't answered yet"); touch targets meet 44 pt
(design tokens asserted); nothing disables font scaling; step titles are never truncated (only the optional purpose line is clamped to
2 lines); reorder controls carry step-specific hints and exist only where they can act; sheets and confirmations use the permanent
`Sheet`/`ConfirmationSheet`; the editor sits in a `KeyboardAvoidingView`. Screen-reader behavior on a **device** was not exercised
(see §24).

## 17. Copy / tone verification (Section 74)

`audits.test.mjs`: (1) a static scan of `copy.ts`; (2) a dynamic scan of **>1,000 generated sentences** over every schedule shape,
state, responsibility state, duration kind, issue code and unavailable reason — for shame, habit, coaching, scoring, celebration,
instruction-of-her, productivity pressure, reminder claims, execution claims and completion claims; (3) **no sentence lives in JSX**
(the one exception is the pre-existing Her Keys+ card, whose owner-approved words are untouched). The only sentence naming a reminder
is "Nothing is scheduled, and no reminder is sent." — a negation, allowed by exact text. The old hard-coded `WORKING` tag and the
claim "Her Keys protects these" are gone (confirmed absent from the production Hermes bundle).

## 18. UI-system consumption and visual-language disposition

Used, with their real APIs: `Screen, AppText (canonical rungs only), Overline, Card (surface/subtle/attention), Button, ChipToggle,
Tag, Divider, TextField, Sheet, ConfirmationSheet, InlineNotice, EmptyState, LoadingState, ActionStateBlock, ProvenanceLabel,
ConfidenceBadge` and tokens `color.*`, `spacing`, `radius`, `sizing`. **Zero** legacy typography aliases, zero raw hex, zero use of the
legacy flat `colors` alias, zero Systems-specific tokens (mechanically grepped). Clay stays the interaction colour; nothing is a
per-category pastel. Untouched legacy sub-surfaces (Home/Money overviews, Life hub) were not restyled. The Her Keys+ card was touched
only to converge its type rung and colour token; its behavior and words are unchanged. Two missing primitives are recorded (MP-10
reorder control, MP-11 time input; MP-12 radio-group semantics).

## 19. Parallel-branch safety (final, mechanical)

- **Sibling-independence:** `boundaries.test.mjs` fails on any import from `features/today`, `talk-it-out`, `calendar`, `daily-load`,
  `one-move`, or their contexts/routes, and restricts Systems to `domain`, `design`, `state`, `store`, `config`,
  `platform`, `monetization`, `types` and itself — and separately forbids any import of `domain/sync`, `persistence/` or
  Supabase code. Result: **zero** sibling imports.
- **SHARED FILES TOUCHED** (everything outside Feature 04's own trees): `app/(app)/systems.tsx` (**deleted**) and
  `app/(app)/systems/{index,[id],_layout,edit}.tsx` (**added**), commit `6a49189`. Reason: the Systems tab becomes a nested stack, the
  shape `life/` already uses. Likely sibling collision: none expected (no sibling owns the Systems tab). Integration need: record the
  route move; the tab registration and route guard are unchanged. **Nothing else** — not `app/_layout.tsx`, not `(app)/_layout.tsx`,
  not `routeAccess.ts`, not any test-support file, not `.claude/`.
- **Shell freeze:** no tab, no root screen, no route guard, no second navigator.
- **Shared-resource hazards observed and respected:** the shared Supabase container (no `db reset`; harness run only when no `b4_*`
  session existed — MP-17); the emulator and Metro port (see §24).

## 20. Defects found and repaired during the build

| # | Found by | Defect | Repair |
|---|---|---|---|
| 1 | property tests | a step wanting to go above the row at position 0 had no free slot and fell back to a multi-row renumber | replaced the layout with a DP that maximises rows left in place; **no renumber path** |
| 2 | scenario E design | append/prepend fell back to spreading across the whole range (positions ≈ 500) | nearest-stride placement, stepping over held slots |
| 3 | scenario Y | a step added underneath returned `invalid` instead of `stale` | staleness/existence checks now precede validation |
| 4 | mutation testing | the hydration-status check in `availabilityOf` was untested whenever state was null | AB now covers "state present but unsettled" |
| 5 | own review | intent stage summarised independently of the foundation | carries `intentLifecycle`'s stage and latest outcome |
| 6 | copy audit design | operational strings left inline in JSX | centralized; audit enforces it |
| 7 | own review | a weekly rule with no listed weekday could not be described | `anchorDate` added to the schedule view |
| 8 | own review | editing a paused schedule did not say it was paused | editor states it; saving keeps it paused |
| 9 | evidence tests | end conditions promised by the recurrence map were not shown | shown neutrally on the detail screen |
| 10 | tooling | the preview tool started Metro in the **Feature 01** worktree | stopped immediately; nothing of F01's was modified (§24) |

## 21. Builder validation (Section 84 + Addendum AE) — attacks and answers

Each attack was tried against the built code; "caught" means an injected defect made a named test fail.

| Attack | Result |
|---|---|
| habit-tracker / streak / gamification / checklist drift | none: no completion state exists; tone + gamification scans; no checkbox/switch/progress on any screen |
| recurrence = notification / = occurrence | no notification code (scan); preview says nothing is scheduled or sent; no occurrence rows are ever created (F/G) |
| template = run; step completion mutating template; fake run checkboxes | RUN absent; steps carry no completion field; UI has no such role |
| assignment = acceptance; delegated = covered | a request stays `requested`, `stillNeedsMe` stays true until she records their yes (J) |
| child subject loss; unknown person auto-created | H, I, K; a phantom-person mutation is caught |
| order = dependency; unknown duration = zero | E/U/T; both mutations caught |
| template edits rewriting history | rule edited in place with history in observations; untouched rows keep identity and timestamps; a skipped date stays skipped after a schedule edit |
| fake execution / lifecycle / reminder claims | AF, V, audits; no lifecycle command exists to fake |
| unbounded recurrence expansion | preview hard-capped at 3; mutation caught |
| device-timezone drift | R, S; scan forbids device clock/zone APIs in model and commands |
| stale editor overwrite | Y; mutation caught; content-based so a sync rebuild is not a false conflict |
| sibling imports; new primary nav; shared-foundation mutation | none — mechanically reported (§19) |
| second design system / legacy visual language leaking | none — grepped (§18) |
| metadata-only edit called "meaningful" | every editable field changes operational behavior |
| invented recurrence | only the foundation's shapes; unsupported shapes are preserved verbatim and never given a date |
| deleted step orphaning history; duplicate carrying accepted responsibility | both actions are unavailable; nothing to orphan or carry |
| broken inherited AI affordance | none existed |
| stale evidence; dead or coming-soon controls | manifest + compare; affordance audit; disabled controls limited to two stated reasons |
| production producer creating a second persistence model | none — diff empty (§12) |
| Feature 03 / 04 recurrence assumptions unrecorded | `RECURRENCE_AT_FORK_FACTS` recorded for reconciliation |

## 22. Considered + deferred

| Item | State | Note |
|---|---|---|
| System removal / archive / status (MP-01) | **PENDING-OWNER** | the top product gap: a System can be made and edited, never removed |
| Child subject on a System (MP-02) | **PENDING-OWNER** | needs `subjectMemberId` + projection (a schema/sync change) |
| Step retire semantic (MP-03) | **PENDING-OWNER** | status field or tombstone op |
| Deferrable position constraint / batched reorder (MP-04) | PENDING-INTEGRATION | mitigated locally; the cloud limitation remains |
| Promote `setCalendarSchedule` and the System producer into `src/domain/` (MP-05/06) | PENDING-INTEGRATION | |
| Run / step completion / occurrence materialization (MP-08) | PENDING-INTEGRATION | needs foundation |
| Whole-occurrence "I did this" (`completed` observation for a System is valid) | PENDING-OWNER | offering it pushes Systems toward a completion tracker |
| Draft persistence and a discard-on-back confirmation (MP-16) | PENDING-OWNER | back from a dirty editor discards silently; documented behavior |
| "Add a person" inside Systems | PERMANENT-DEFER | people management is not Systems' job; assignment offers only existing records |
| Notification delivery, autonomous execution, LLM System drafting, pattern-derived suggestions | PENDING-INTEGRATION | typed seam only (`ai/systemProposalTypes.ts`); nothing wired |
| Advanced recurrence authoring (`endsOn`/`occurrenceCount`, `after_completion`) | PENDING-INTEGRATION | preserved and shown, never authored |
| Legacy "Working / running" claims on Money/Life (MP-14) | RESUMED-ELSEWHERE | HK-INT-COPY-01 |
| Emulator visual evidence | see §24 | not executed |

## 23. Integration candidates (recorded, none implemented)

- **HK-INT-RECURRENCE-01 — Calendar / Systems recurrence-materialization reconciliation.** Inputs: Feature 03 Scenario AC + assumptions,
  and Feature 04's `RECURRENCE_AT_FORK_FACTS` (`docs/builds/HK_FEATURE_04_RECURRENCE_MAP.md`). *HIGH PRIORITY* if the two branches reached
  different conclusions about the same fork.
- **HK-INT-COPY-01 — Today / Calendar / Systems semantic-copy reconciliation.** Feature 04's temporary copy: paused · next occurrence ·
  responsibility unresolved · skipped · "hasn't answered yet". Not imported anywhere; `copy.ts` is the reference for the wording.
- **SYSTEMS → TODAY** (attention, routine due state, unresolved responsibility): Systems' attention is the SAME derivation the
  foundation's `attentionFor` already emits for an unanswered delegation, so Today can see it with no Systems import.
- **SYSTEMS → CALENDAR** (recurrence, occurrences, expected duration): needs a materialized-occurrence shape (`RECURRENCE_AT_FORK_FACTS`).
- **TALK IT OUT → SYSTEMS** (proposed definition): through `SystemProposal` → review → `applySystemDraft`; needs the producer to accept a
  provenance argument (noted in the contract).
- **PATTERN INTELLIGENCE → SYSTEMS**, **SYSTEMS → NOTIFICATIONS**, **SYSTEMS → FUTURE AI**: contract only; nothing built.
- **Producer ownership / shared location** (MP-06); **harness DB-name collision** (MP-17).

## 24. Runtime / visual evidence — NOT EXECUTED (honest limitation)

The contract asks for visual evidence "where tooling supports". It did not, for reasons that are specific and not excuses:

1. The sanctioned dev-server tool is anchored to the original project directory, so it started Metro **from the Feature 01 worktree**
   (`Starting project at C:\Users\jsmit\Her Keys`) and loaded that folder's private `.env.local`. I noticed from Metro's own log, stopped
   the server at once, removed the emulator tunnel, and verified I had modified nothing there (its only change, `canWait.ts`, is
   Feature 01's own work; I only ran a read-only `git status`).
2. Running my own Metro by hand would break the tool rule and was not attempted on a machine with ~0.15 GB free (four parallel sessions,
   Docker, an emulator).
3. The headless emulator's `screencap` returns an empty file (the known black-screencap issue in my notes).

**What stands in its place:** `expo export` bundles the app with Metro and compiles it to Hermes bytecode with the final code
(exit 0), and the bundle contains every Systems string (checked) and none of the old claim; the screens are exercised as rendered
trees through a real store; the route structure is the same nested-stack pattern the Life tab already uses.

**What was therefore NOT verified on a device** (a checklist for the audit or owner, from the F04 worktree with `npx expo start --go`):
hub → card → detail → Edit → Save round trip; the modal editor's presentation and the Android back button (a dirty draft is discarded
silently — see §22); `KeyboardAvoidingView` behavior with the number pad on the schedule fields; the `Sheet`/`ConfirmationSheet` flows;
long names and 90 steps at large text sizes; and a TalkBack pass over the hub and detail.

## 25. Exit gates (recomputed at the end, not copied)

| Gate | Result |
|---|---|
| Branch / HEAD | `feature/04-systems-routines`; forked from `5007b0f`; no push, no PR, no merge |
| TypeScript | **exit 0** (a first attempt died with a JS-heap OOM under machine-wide memory pressure; re-ran clean) |
| Full app tests | **954 / 954**, 225 suites, 0 fail / cancelled / skipped (run serially, `--test-concurrency=1`: the parallel runner's esbuild child processes died with `spawn UNKNOWN` / OOM at ~0.15 GB free; the parallel run had passed 953/953 earlier) |
| Feature 04 tests | **146** (`tests/systems/**`) — all in the 954 |
| Backend harness | **684 / 684**, 0 FAIL (run when no `b4_*` session existed) |
| Expo Doctor | **21 / 21** (first attempt OOM-crashed; passed on the third) |
| Expo export (android) | **exit 0**; Hermes bundle contains the final Systems strings |
| Shipping migration SHA-256 | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` — unchanged |
| Baseline migration SHA-256 | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` — unchanged |
| Local schema fingerprint | **MATCH**, `199ed4d4c1b37cd654b5853e91cbde27` / 3613 (read-only) |
| Foundation / shared-file drift | **zero** (git diff empty, §12) |
| Sibling-import audit | **zero** (`boundaries.test.mjs`) |
| Affordance audit | **0** unresolved product-facing affordances |
| Forbidden-copy audit | **clean** (>1,000 generated sentences) |
| Structural-evidence regeneration | **29 artifacts**, all compared; manifest clean |
| Feature-owned producer? | **YES**; **proof no durable/schema/sync change: git diff empty** |
| HK-INT-RECURRENCE-01, HK-INT-COPY-01 | recorded (§23) |

Test floor: **ENTRY 808 · PRESERVED 808 · REWRITTEN 0 · REPLACED 0 · REMOVED 0 · ADDED 146 · FINAL 954 · FAILURES 0.**

## 26. Feature value statement (Addendum AB)

**After Feature 04, a woman can** create and edit reusable household Systems — a named routine with its area, its purpose, and its
steps in a meaningful order, an optional calendar schedule she can pause, skip once, or stop, and a person or child she has asked to
take it — while Her Keys states plainly what is and is not known (a step's minutes, when it's next expected, whether anyone has
answered) and never pretends that defining a System is the same as doing it.

## 27. Feature verdicts (independent answers)

1. **Does Systems let her externalize repeatable household operations so she does not re-design them every time?** **PASS.** (With two
   honest gaps she must know about: a System can never be removed, and cannot say which child it is for.)
2. **Are definition, recurrence, occurrence, run and completion kept semantically distinct?** **PASS.** Definition and step are stored;
   recurrence is a stored rule; occurrences are derived and never materialized; run and completion are absent and shown as absent.
3. **Does recurrence stay a truthful bounded System semantic rather than a calendar, notification or automation engine?** **PASS.**
4. **Does the feature avoid habit-tracker / streak / shame drift?** **PASS** — mechanically scanned, and there is nothing to count.
5. **Can Today, Calendar, Talk It Out, Pattern Intelligence, Notifications and future LLMs integrate through canonical state and typed
   projections without feature-to-feature imports?** **PASS** — through canonical rows (`systems`, `systemSteps`, `recurrences`,
   `responsibilities`), the foundation's own `attentionFor`/`nextOccurrence`, and the typed `SystemProposal` seam.

## 28. Final status

```
HK-FEATURE-04-SYSTEMS-ROUTINES = PASS
READY FOR INDEPENDENT FEATURE 04 AUDIT = YES
```

Caveats stated once, plainly: `HK-PARALLEL-SOURCE-01` was not found (§0.1); Tier-1 scenario H is SAFE-UNAVAILABLE, not PASS (§11); and
runtime/visual verification on a device was not executed (§24).
