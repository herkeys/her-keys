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
