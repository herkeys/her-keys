# HK-WAVE2-SOURCE-01 — Wave 2 source record (created at K0 of Feature 05)

**What this is.** The single record of the baseline that Wave 2 feature development starts from, created at K0 of
HK-FEATURE-05-KIDS from facts that were **mechanically re-verified in this repository**, not copied from an earlier report.

**How it came to exist.** The original Feature 05 contract required a certified, integrated Wave 1 common fork and a
separately supplied HK-WAVE2-SOURCE-01, and the first Feature 05 run correctly stopped because neither existed. On
2026-09-21 the owner changed the build contract: full Wave 1 integration and a generalized Life registration mechanism are **not**
prerequisites; the repaired common foundation is the Wave 2 feature-development baseline; and this record is to be created from the
verified baseline as part of K0. Nothing in this file is a claim that Wave 1 is integrated. It is not.

Any sibling Wave 2 feature that writes its own copy of this record should be reconciled at integration; the values below are
measurements of one tree.

## 1. Baseline authority

| Item | Value | Verified how |
|---|---|---|
| Repair branch | `repair/hk-integration-readiness-01` | `git rev-parse` |
| Final report HEAD (fork point of `feature/05-kids-os`) | `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` (IR10, ledger only) | `git rev-parse`; worktree `HEAD` |
| Tested code HEAD underneath | `9dbe02aa9a581505381ebe4589e0b6c7c9e671fb` (IR9c) | is an ancestor of the report HEAD |
| Delta between them | **one commit, one file, `docs/builds/HK_INTEGRATION_READINESS_01.md` (63+/54-)** | `git diff --name-only 9dbe02a 14bd58e` printed nothing outside `docs/` |
| Feature branch / worktree | `feature/05-kids-os` in `C:\Users\jsmit\Her-Keys-F05` | created at K0, isolated, no sibling ancestry |
| Worktree state at entry | clean | `git status --short` empty |
| Wave 1 integration | **NOT PRESENT and NOT REQUIRED** (owner rule 2). F01–F04 remain unmerged siblings | no ref descends from two feature tips |
| Life registration mechanism | **ABSENT and NOT REQUIRED** (owner rule 3). Life is a set of hardcoded routes; final registration is an integration item | see the Feature 05 ledger §3 |

## 2. Recomputed gates at the baseline (this session, one process at a time)

| Gate | Recorded by the repair | Recomputed here |
|---|---|---|
| TypeScript `tsc --noEmit` (`--max-old-space-size=1600`) | exit 0 | **exit 0, no diagnostics** |
| Full application suite (serial) | 975 / 975 (207 suites) | **975 tests / 207 suites, 975 pass, 0 fail, 0 skipped** |
| Targeted `tests/hk-ir01` | 163 / 163 (38 suites) | **163 tests / 38 suites, 163 pass** |
| Local schema fingerprint (read-only, default DB of `supabase_db_Her_Keys`) | `43e7c8a4402a3387cb2e1add4170921e` / 3617 | **`43e7c8a4402a3387cb2e1add4170921e` / 3617 — `verify` prints MATCH** |
| Migration SHA-256, baseline | `81909daa…` working tree (CRLF) / `8bc38d66…` LF blob | **identical** (`git show HEAD:… \| sha256sum` = `8bc38d66fcffbb9f…`) |
| Migration SHA-256, shipping | `1e9169de…` | **`1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb`** |
| Migration SHA-256, additive IR01 | `73db6639…` | **`73db663974354f0c968b6b11b0a92f901aff6e5f464ad9bcfc953ff43a1901a4`** |
| Backend harness `node supabase/tests/run.mjs` (real local PostgreSQL + PostgREST, run alone) | 800 / 800 | **800/800 checks passed, exit 0** (a first attempt died before any check with `spawnSync docker UNKNOWN`, errno -4094, while free commit memory was ~0.2 GB; it was re-run alone after memory recovered and is not counted as a result) |
| IR01 mutation check `scripts-dev/ir01-mutation-check.cjs` | 35 / 35 | **35 caught, 0 survived, 0 broken, exit 0**; `git diff` empty afterwards (every file restored byte for byte) |

## 3. What the baseline gives Feature 05 (verified by reading the code and by the passing suites)

| Contract | Present? | Where |
|---|---|---|
| HA-001 — account binding leads to operating durable sync through the production path | yes | `src/store/accountRuntimeInstance.ts:71` calls `composeAccountApp`; `src/store/appStoreInstance.ts:25` passes `changeObserver.observe`; `tests/hk-ir01/syncComposition` (37) and `productionWiring` (7) |
| HA-009 — one shared dependency standing/readiness | yes | `standingOf`, `readinessOf`, `blockersOf`, `unavailablePrerequisitesOf` in `src/domain/structure.ts:92-155` |
| HA-010 — duration value and provenance survive persistence and sync | yes | `Task.durationSource` (`src/domain/state.ts:163`), `durationKnowledgeOf`, `durationSourceForSave` in `src/domain/foundation/duration.ts` |
| HA-011 — subject identity round-trips | yes (System subject; Task/Event use `childRef`) | `HouseholdSystem.subjectMemberId` (`state.ts:201`); `projectionSupport.childRef` |
| OD-A — an undecided Talk It Out reading never syncs a title derived from her words | yes | `titleForCloud` in `src/domain/foundation/interpretation.ts`, applied in `foundationProjection` |
| Canonical child identity | yes | `AppState.children[]`, `ChildSchema` (`state.ts:103`); cloud `household_members` (child rows), created only by the claim RPC, hydrated on pull |
| Canonical child association | yes | `Task.subjectMemberId`, `CalendarEvent.subjectMemberId`, `HouseholdSystem.subjectMemberId`; `scope: 'child'` requires a real child |
| Responsibility lifecycle | yes | `owned / requested / acknowledged / accepted / declined / completed / returned` (`foundation/responsibility.ts:52`); `stillNeedsMe`; one live holder per thing |
| Shared attention primitive | yes | `attentionFor(state, nowMs)` in `src/domain/reasoning/attention.ts`; `briefingFor` consumes it |
| Household timezone / logical day | yes | `state.user.timezone`; `logicalDateAt`, `zonedTimeToEpochMs`, `addDays`, `daysBetween` in `src/domain/logicalDay.ts` |
| Emergency / fallback / pickup-authority capability | **none** | no fallback, backup or pickup concept exists; `authorization.ts` is *automation* authority (what Her Keys may do), unrelated |
| Child **create** path | **none** (deferred since Build 4: B4-P0-066, SD4-028; IR01 debt D6) | recorded as Feature 05 finding F-K0-01 and missing primitive MP-K-01 |

## 4. Known inherited debt that Feature 05 must not paper over

The debt list of `HK_INTEGRATION_READINESS_01.md` §6.8 stands (HA-012..020, IR-D7..D9, D1, D2, D3, D8..D10, OD-C). Those touching Kids:

* **IR-D8** — the local rule still admits the adult user id as a Task/Event subject although the cloud will not; Kids only ever writes a *child* id.
* **D1** — adopting an existing cloud household on a new binding is not implemented; a real second device cannot be bound through the app yet (a second device is proven in tests and against PostgreSQL only).
* **D6** — a child created after account binding has no cloud identity and no server path; rows about that child become `unresolvable-dependency` evidence. Feature 05 does not build that server semantic; it is an owner checkpoint (`HK_FEATURE_05_OWNER_CHECKPOINT_01.md`).
* `attentionFor`'s `risk` branch counts an `acknowledged` (not `accepted`) delegation as "handled elsewhere" (`reasoning/attention.ts:60-62`), which is looser than ACKNOWLEDGED ≠ ACCEPTED. Kids consumes the primitive and does not correct it; recorded as a foundation observation.

## 5. Owner-gated release item (unchanged)

Approval to apply `20260921120000_ir01_duration_source_and_claim_v3.sql` to any real environment before a repaired client ships.
Feature 05 changes no schema, so it adds nothing to that gate.
