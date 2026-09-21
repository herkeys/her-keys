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
