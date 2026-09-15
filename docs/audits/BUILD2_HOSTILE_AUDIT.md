# Her Keys — Build 2 Hostile Audit

Audit date: 2026-09-14 through 2026-09-15 (America/New_York)

Final verdict: **REPAIRED_CONTINUE_BUILDING**

## Source authority

| Item | Verified value |
| --- | --- |
| Authoritative base | `7f6cf2278ebb5ca4f12294e2b35c9368d0093e52` |
| Build 2 HEAD received and audited | `320c45fde70d994fb6b4cb246a0d4e78318ef908` |
| Build 2 commits | `ad951ad`, `cbe24b7`, `320c45f` |
| Audit branch | `audit/build2-persistence-hostile` |
| P0–P3 repair commit | `35b40b08284f3257e4249183fbf814f6b41af32c` |
| Dev-only category smoke harness | `7a646ac42948ed0e7f00100173881847524a12b6` |
| Final source SHA used for final regression | `7a646ac42948ed0e7f00100173881847524a12b6` |
| `main` and `origin/main` | both remained `7f6cf2278ebb5ca4f12294e2b35c9368d0093e52` |
| Remote containment | no remote branch contained the audit HEAD |

Before editing, `git fetch origin --prune` completed, the Build 2 tree was clean, the authoritative base was an ancestor, all three local Build 2 commits were present, and no Build 2 or audit commit had been pushed. The diff from the base contained the persistence milestone only; no unrelated visual redesign entered the branch.

The branch checkout and `.expo-audit-baseline/` export reported during the audit were audit actions. The generated export directory was removed after its evidence was recorded.

Per `AGENTS.md`, implementation work followed the exact Expo SDK 57 documentation, including the SDK 57 overview, Expo Router, and AsyncStorage guidance.

## Verdict summary

### Required repair severities

| Severity | Found | Repaired | Remaining |
| --- | ---: | ---: | ---: |
| P0 | 0 | 0 | 0 |
| P1 | 4 | 4 | 0 |
| P2 | 1 | 1 | 0 |
| P3 | 0 | 0 | 0 |
| **P0–P3 total** | **5** | **5** | **0** |

### Document-and-defer severities

| Severity | Found | Documented | Intentionally deferred |
| --- | ---: | ---: | ---: |
| P4 | 2 | 2 | 2 |
| P5 | 5 | 5 | 5 |
| P6 | 1 | 1 | 1 |
| P7 | 1 | 1 | 1 |
| P8 | 1 | 1 | 1 |
| P9–P10 | 0 | 0 | 0 |
| **P4–P10 total** | **10** | **10** | **10** |

No deferred item is a hidden Build 2 merge blocker. HK-B2-AUDIT-013 is an explicit production-data release gate, not permission to ship sensitive data in the current local prototype.

## P0–P3 repairs

### HK-B2-AUDIT-001 — P1 — Commit could report durable onboarding completion after every write failed

- **Area / location:** `src/state/appStore.ts` (`commit`), `src/persistence/writeQueue.ts` (`enqueue` and queue status), `src/store/OnboardingContext.tsx`, `app/onboarding/profile.tsx`.
- **Evidence / reproduction:** with both the first write and its immediate retry forced to fail, the original `commit` awaited an exhausted queue and still published the completed onboarding state. The profile screen then navigated to Today. The primary envelope remained onboarding-incomplete, so a process restart lost the claimed completion.
- **Impact:** false success and loss of a user-significant action; routing could authorize Today from memory even though the device did not contain the completed state.
- **Repair:** queue enqueue returns the assigned sequence; `commit` returns `false` unless that exact sequence became canonical. Onboarding only navigates after `true` and presents an accessible, nontechnical retry message after `false`. Deliberately memory-only recovery sessions remain usable without making a storage claim.
- **Regression coverage:** `tests/appStore.test.mjs` — “a commit that exhausts its retry is not shown as completed”, followed by a successful retry; the normal commit-before-publish test remains green.
- **Status:** **REPAIRED** in `35b40b0`.

### HK-B2-AUDIT-002 — P1 — Failed diagnostic cleanup could delete the canonical household during reset

- **Area / location:** `src/persistence/appStateRepository.ts`, `resetAppState`.
- **Evidence / reproduction:** the original operation removed `herkeys.appState` before removing the optional corrupt diagnostic. If diagnostic removal threw, reset rejected after the canonical household had already been deleted.
- **Impact:** unintended household data loss from a secondary cleanup failure.
- **Repair:** optional diagnostic cleanup now runs first; the primary key is the final removal. A diagnostic failure therefore leaves the household untouched.
- **Regression coverage:** `tests/persistence.test.mjs` — “a diagnostic-cleanup failure cannot delete the canonical household”.
- **Status:** **REPAIRED** in `35b40b0`.

### HK-B2-AUDIT-003 — P1 — Reset was not safe across every memory-only recovery mode

- **Area / location:** `src/state/appStore.ts` (`reset`), `app/dev-tools.tsx`.
- **Evidence / reproduction:** the original store refused reset only for `future_version`. A session whose primary read failed also disabled persistence, yet reset could still remove the possibly valid unreadable primary. Storage-remove failures escaped as rejected event-handler promises.
- **Impact:** a read failure could be converted into destructive data loss; removal errors could surface as unhandled promise rejections while the UI supplied no reliable result.
- **Repair:** reset is refused whenever persistence is intentionally disabled; removal errors are caught and return `false`; memory remains unchanged; dev tools explain future-version protection, real-user-state protection, or a retryable reset failure without exposing internals.
- **Regression coverage:** `tests/appStore.test.mjs` — future-version/read-failed refusal and “a storage removal failure leaves current memory in place and is reported without rejecting”. Emulator future-version reset also returned the refusal message.
- **Status:** **REPAIRED** in `35b40b0`.

### HK-B2-AUDIT-004 — P1 — Empty-origin state could be adopted and overwritten by demo mode

- **Area / location:** `src/state/appStore.ts`, loaded-state mode boundary.
- **Evidence / reproduction:** the original check handled only `demo → empty`. An `empty` primary opened in demo mode was adopted as if it were demo state; demo data did not materialize, and subsequent demo-tool interactions could write into the real-user envelope.
- **Impact:** configuration modes were not an identity boundary. Real-user state could be modified by a demo session, and the approved deterministic demo fixture was absent.
- **Repair:** every origin mismatch creates the requested mode's fresh state. `demo → empty` replaces the fictional primary with a fresh empty envelope. `empty → demo` materializes demo state in memory but disables persistence and reset so the real-user primary is preserved.
- **Regression coverage:** `tests/appStore.test.mjs` covers both mismatch directions; `tests/hostileAudit.test.mjs` covers `demo → empty → demo`, origin isolation, primary preservation, deterministic IDs, and no cross-mode record contamination. Emulator scenarios 13 and 14 passed.
- **Status:** **REPAIRED** in `35b40b0`.

### HK-B2-AUDIT-005 — P2 — Maximum safe `writeSeq` could strand `flush()` forever

- **Area / location:** `src/persistence/envelope.ts`, `src/persistence/writeQueue.ts`.
- **Evidence / reproduction:** an otherwise valid envelope accepted `Number.MAX_SAFE_INTEGER`. JavaScript addition then stopped producing unique integers; queue sequence comparisons could suppress a later job while `flush()` continued waiting. The hostile reproduction hung until terminated.
- **Impact:** a valid stored envelope could deadlock persistence and any durability-gated action. Normal users would need an impractically large number of writes, but the accepted data boundary made the state valid and the failure permanent.
- **Repair:** persisted sequences are capped at `2_147_483_647` and wrap to 1; a separate session-local monotonic order controls queue freshness. Encoding validates the complete envelope, including the bounded sequence.
- **Regression coverage:** `tests/writeQueue.test.mjs` — rollover cannot strand flush or suppress later writes; `tests/persistence.test.mjs` rejects out-of-range sequences.
- **Status:** **REPAIRED** in `35b40b0`.

Every P0–P3 repair has regression coverage, and all relevant automated and runtime scenarios were rerun. No P4–P10 production behavior was repaired as a dependency of these changes. The only additional source change is the explicitly permitted internal category smoke harness; it is unavailable outside internal demo mode.

## Deferred findings

### HK-B2-AUDIT-006 — P4 — Action-to-disk durability window

- **Category / area:** persistence policy; Daily Load and One Move.
- **File / location:** `src/state/appStore.ts`, `dispatch`; AsyncStorage adapter boundary.
- **Evidence:** a controlled delayed adapter test proves Daily Load and One Move update in-memory UI while the old primary remains on disk until the native promise resolves. On the emulator, native writes ranged from single-digit milliseconds to hundreds of milliseconds.
- **Practical impact:** a force-kill or OS process death inside that window can lose the most recent non-commit action. Mobile AsyncStorage does not provide the app with a transactional process-death guarantee. Onboarding completion is separately durability-gated.
- **Recommended fix:** retain the approved immediate-UI policy for Build 2; before making stronger durability claims, add an append-only intent/journal or native transactional persistence and reconcile on launch.
- **Suggested milestone / release gate:** before product copy promises that every tap is durably remembered under abrupt process death.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-007 — P5 — Reset success does not verify that the fresh seed was durably rewritten

- **Category / area:** reset completion semantics.
- **File / location:** `src/state/appStore.ts`, `reset`, after the final `queue.flush()`.
- **Evidence:** after the primary is intentionally removed, reset publishes and queues a fresh state, awaits the queue, and returns `true` without checking the new sequence's committed status. The ordinary write-degraded signal still records failure.
- **Practical impact:** a reset can claim completion while the primary is temporarily empty. On the next launch the same mode reconstructs a fresh state, so this does not preserve stale data or undo the requested deletion, but the success signal is weaker than onboarding commit semantics.
- **Recommended fix:** have reset retain the reseed sequence and return success only when that sequence commits, or define deletion itself as the reset durability point and make that contract explicit.
- **Suggested milestone / release gate:** before reset is exposed outside internal tools.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-008 — P5 — Category transitions can create state beyond schema limits

- **Category / area:** configurable categories / transition validation.
- **File / location:** `src/domain/categories.ts`, `addCategory`; `src/domain/state.ts`, category count and `sortOrder` constraints.
- **Evidence:** starting from a schema-valid 200-category state, `addCategory` produces 201 categories. Starting with legal sort orders ending at 10,000 produces 10,001. A hostile ID factory can also return a duplicate. The next encoder refuses the result, but `dispatch` has already published it in memory.
- **Practical impact:** future category-management UI could create an invalid in-memory state at extreme limits and degrade persistence until restart.
- **Recommended fix:** enforce count/order/id preconditions inside category transitions, or validate all transition results before publication with a safe user-visible refusal.
- **Suggested milestone / release gate:** before category creation ships as production UI.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-009 — P5 — Historical action semantics are only partially validated

- **Category / area:** schema / action history / One Move chronology.
- **File / location:** `src/domain/state.ts`, `findIntegrityProblems` and action/One Move schemas.
- **Evidence:** shape-valid envelopes were accepted when a move action's `before` equaled `after`, `logicalDate` disagreed with the action instant, the reason window had equal bounds, a One Move decision instant fell outside `forDate`, or completion preceded decision. Normal transition tests create correct history, but the data boundary does not reject every semantic contradiction.
- **Practical impact:** tampered storage or a future buggy writer could retain misleading audit history even though current UI transitions do not generate it.
- **Recommended fix:** add cross-field refinements for chronology, changed before/after facts, logical-date agreement, and reason-window ordering; consider a stronger action-ledger reconciliation before external import/sync.
- **Suggested milestone / release gate:** before history is shown as authoritative, imported, or synchronized.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-010 — P5 — Dependency audit retains 13 moderate advisories

- **Category / area:** dependency security.
- **File / location:** `package-lock.json`; transitive Expo development/tooling paths.
- **Evidence:** final `npm audit --json` exited 1 with 13 moderate, 0 high, and 0 critical advisories. The count matches the Build 1/Build 2 baseline. The new direct Build 2 dependencies, AsyncStorage and Zod, did not introduce a new advisory.
- **Practical impact:** known transitive development/toolchain exposure remains; no evidence ties it to household-data compromise in the shipped runtime.
- **Recommended fix:** track Expo-compatible upstream updates and rerun the audit when Expo resolves the chain; do not force incompatible upgrades.
- **Suggested milestone / release gate:** resolve or formally accept before production release; immediately reclassify if a high/critical or runtime-reachable advisory appears.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-011 — P6 — Expo worklets optional-peer range drift

- **Category / area:** dependency integrity.
- **File / location:** installed Expo SDK 57 dependency graph from `package-lock.json`.
- **Evidence:** `npm ls --all` exits `ELSPROBLEMS` because `react-native-worklets@0.12.2`, selected with `react-native-reanimated@4.6.0`, is outside `expo-modules-core@57.0.18`'s optional peer range through `0.10.x`. `npm ci`, top-level install, Expo Doctor, typecheck, export, and runtime all pass. This is unchanged from the Build 1 baseline.
- **Practical impact:** noisy dependency-health checks and possible future native incompatibility, with no reproduced Build 2 runtime fault.
- **Recommended fix:** follow the Expo SDK 57 compatible set and upgrade only when Expo's package metadata converges.
- **Suggested milestone / release gate:** monitor on every Expo patch upgrade; resolve before a production native build if Doctor begins failing.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-012 — P5 — Bundle growth and development hydration/write budgets need release-grade measurement

- **Category / area:** performance.
- **File / location:** Zod-backed validation in `src/domain/state.ts` and persistence hydration path.
- **Evidence:** the final Android Hermes export is 3,550,416 bytes versus Build 1's 2,770,964 bytes, an increase of 779,452 bytes. Emulator development-mode hydration markers during the audit ranged approximately 47.5–210.6 ms across fresh, valid, mismatch, and recovery launches; steady valid launches were commonly about 69–119 ms, with slower outliers. Native AsyncStorage writes ranged from single-digit milliseconds to about 656 ms while UI remained immediate. Expo Go cold/bundle timings were dominated by cache rebuilds and emulator variance.
- **Practical impact:** the approximately 100 ms hydration target is met inconsistently in development, the native write target is often exceeded, and the bundle is materially larger. No user-visible freeze, startup crash, or release-size limit was demonstrated.
- **Recommended fix:** measure a release Hermes build on representative devices; attribute validation and bundle cost before optimizing. Do not weaken validation merely to reduce size.
- **Suggested milestone / release gate:** production performance gate / first release candidate.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-013 — P4 — Household state is local, unencrypted, and has no account recovery

- **Category / area:** privacy / storage architecture.
- **File / location:** `src/persistence/asyncStorageAdapter.ts`; Build 2 architecture documentation.
- **Evidence:** AsyncStorage is the only storage implementation/import; the repository has no encryption, account, cloud backup, cross-device sync, or credential recovery. Source scans found no network calls and no secrets/tokens.
- **Practical impact:** a compromised or backed-up device context may expose local household facts, and device loss means data loss. Build 2 contains fictional demo data and an empty real-mode foundation, but later real facts increase the consequence.
- **Recommended fix:** define a data classification and threat model, select protected-at-rest storage for sensitive fields, and design authenticated backup/recovery before real-user rollout.
- **Suggested milestone / release gate:** mandatory before storing production credentials, financial details, private transcripts, or promising account recovery.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-014 — P7 — Identical direct queue requests are not coalesced

- **Category / area:** persistence efficiency.
- **File / location:** `src/persistence/writeQueue.ts`, `enqueue`.
- **Evidence:** enqueueing the same object after the first flush writes it again with the next sequence. Store-level no-op transitions already avoid the normal duplicate path, and burst actions are bounded to at most two writes.
- **Practical impact:** a future caller that bypasses no-op transition identity can create avoidable AsyncStorage writes; correctness and newest-state ordering remain intact.
- **Recommended fix:** add an optional digest/equality coalescer only if production metrics show meaningful amplification.
- **Suggested milestone / release gate:** performance hardening, not a merge gate.
- **Status:** **DEFERRED**.

### HK-B2-AUDIT-015 — P8 — Recoverable Metro/cache and color-environment warnings

- **Category / area:** development tooling.
- **File / location:** Metro/Expo CLI cache and environment, outside application source.
- **Evidence:** Android export initially reported a cache deserialization failure and performed a full crawl; clean Metro runs repeatedly reported that `NO_COLOR` was ignored because `FORCE_COLOR` was set. Every bundle/export completed and no app error followed.
- **Practical impact:** slower/noisier first development builds; no runtime or release correctness impact demonstrated.
- **Recommended fix:** clear Metro caches when the warning recurs and normalize CI color variables if log noise matters.
- **Suggested milestone / release gate:** developer-experience cleanup only.
- **Status:** **DEFERRED**.

## Persistence integrity

Hostile coverage now includes serialized rapid writes, stale completion ordering, first-attempt retry, two-attempt cycle failure, next-action catch-up, degradation and recovery, state changes during old writes, bounded bursts, duplicate identical requests, read/write/remove failures, malformed/invalid/dangling/duplicate data, future and unsupported versions, and sequence rollover.

Results:

- Memory remains authoritative during ordinary dispatch.
- Writes are serialized and only the newest waiting snapshot is retained.
- A later write cannot be overwritten by an older completion.
- Two failed cycles set the quiet degraded state; later success clears it.
- Commit-gated onboarding does not publish false durable success.
- Future/read-failed/real-user-preserving demo sessions write the primary key zero times.
- The unavoidable non-commit durability window is documented as HK-B2-AUDIT-006.

## Hydration and routing/deep links

Concurrent hydrate, sequential hydrate, provider-remount/StrictMode-like calls, delayed reads, recovery launches, and daily One Move initialization converge on one hydration promise. A valid load performs one read and zero writes; first launch writes one materialized state; no duplicate seed, action, or One Move is created.

Automated route guards prove that nothing opens before hydration, all protected links are refused before onboarding, all are allowed afterward, the requested root is retained, every file route is guarded, and no guarded route is forced as a fixed initial route.

Emulator cold links were checked individually:

| Route | Before onboarding | After onboarding |
| --- | --- | --- |
| `/today` | onboarding step 2, no Today content | Today |
| `/life` | onboarding step 2, no Life content | Life |
| `/life/kids` | onboarding step 2, no child content | Kids child screen, not Today |
| `/calendar` | onboarding step 2, no Calendar content | Calendar |
| `/systems` | onboarding step 2, no Systems content | Systems |
| `/ai` | onboarding step 2, no AI content | Her Keys AI |
| `/talk-it-out` | onboarding step 2, no modal content | Talk It Out modal |

Android Back left the app after onboarding completion, returned from a Life child to Life, and returned from a Talk It Out modal opened from Today back to Today after first dismissing the keyboard. No protected-content flash was observed in repeated UI-tree sampling.

## Logical day / rollover

Deterministic clock-injected tests cover 23:59, 00:00, 00:01, month end, leap day, timezone-vs-UTC date, DST gaps and overlaps, multi-day foreground absence, due and overdue projection, cross-midnight event clipping, and foreground rollover without process restart.

Yesterday remains history, a completed move never becomes today's unfinished move, the current day receives at most one decision, Daily Load recomputes, historical actions keep their original logical date, and overdue tasks cannot be automatically moved.

The emulator clock was not changed because doing so risked destabilizing the required smoke environment. Runtime day rollover is **NOT_EXECUTED**; deterministic injected-clock coverage is green.

## Demo / real-user isolation

Automated and emulator coverage exercised `demo → empty → demo`:

- Empty mode rejected a valid stored demo envelope with `mode_mismatch` and wrote a fresh empty-origin envelope.
- Across Today, Life, Kids, Home, Money, Meals, Work, Calendar, Systems, AI, and Talk It Out, UI evidence contained no Maren/Ellis identity, fictional children, demo events/tasks, systems, meals, One Move, or discovery state.
- Empty Today showed `Hi there`, `Nothing scheduled.`, and `No One Move today.`; Meals showed `Nothing planned.`.
- `/dev-tools` resolved to Today in empty mode before and after onboarding.
- Returning to demo created the deterministic demo fixture in memory, used starter IDs such as `cat-kids`, re-anchored to `2026-09-15`, created no duplicate records, and kept the empty-origin primary protected by disabling persistence/reset.

Result: **PASS**.

## Household/category customization and identity

Schema validation requires one household object, every category's `householdId` to match it, unique IDs/orders/system roles, valid child subjects, and valid task/event/category relationships.

Automated coverage includes all requested category cases: Kids → Family, Money → Household Finances, custom Pets, another custom category named Money with `systemRole = null`, archive/restore with live references, reorder/relaunch, stable IDs, retained scope, custom-category Daily Load, renamed-role Daily Load, no visible-name inference, dangling references, and child `subjectMemberId`.

The dev-only harness was extended only enough to expose category IDs, role, status and order and to invoke existing rename/add/reorder/archive/restore transitions. Emulator evidence after a cold relaunch showed:

- `0: Pets · id=cat-mu21l79x-1lpqk · role=none · active`
- `1: Family · id=cat-kids · role=kids · active`
- Home retained `id=cat-home` across archive and restore.
- The renamed Family screen still resolved Josie/Theo, the soccer event, and the referenced teacher task.

Result: **PASS**. The extreme-limit concern remains HK-B2-AUDIT-008.

## Talk It Out privacy and replay

Tests cover matchable and unmatched free text, first/second structured answer resume, corrupt topic/question/option IDs, catalog drift, repeated Start Over, restart fallback, 100,000-character unmatched input, and `__proto__`/`constructor`-like input.

The stored record contains topic/question/option identifiers only: no raw transcript, unmatched text, generated messages, hypothesis prose, or confidence prose. Rebuilt answers appear under `YOUR ANSWER`, not as fabricated verbatim quotations. Confidence and hypothesis are recomputed.

On the emulator, `I’m always behind` plus `After school pickup` resumed after a force-stop as structured `YOUR TOPIC` / `YOUR ANSWER` context. Start Over remained clear after another force-stop and relaunch. Result: **PASS**.

## Daily Load / One Move

Daily Load coverage includes due today, overdue, fixed work, nested events, negative gaps, zero-duration work, tomorrow planning, recomputation, custom/renamed categories, kept recommendations, repeated actions, historical reason stability, and restart. The approved move changes the task fact; stored actions never replace recomputation authority.

One Move coverage includes OPEN/TIGHT/OVERLOADED boundaries (`45`, `44`, `23`, `22`), selection, overloaded withholding, same-day withholding stability, invalid catalog selection repair, completion idempotence, rapid taps, one-time catalog behavior, restart, double hydration, rollover, and no catalog in empty mode.

On the emulator, moving “Return library books” changed the buffer from 35 to 65 minutes and the load from Tight to Steady. A cold relaunch retained the moved task and independently rebuilt the same consequence. Completing the mail-basket One Move survived relaunch as `Done. That’s enough for today.` with no replacement. Result: **PASS**.

## Recovery/schema behavior

Malformed JSON and a structurally valid dangling `categoryId` were injected with the internal simulator. Cold relaunches produced `recovery` through normal hydration, fresh derived screens, and development diagnostic copies (`malformed_json` and `integrity_violation`, both “kept aside”). No stale derived state appeared.

A future schema envelope produced `future_version`, a safe fresh fallback, disabled/degraded persistence, a preserved copy, and a refused reset. An ordinary category rename changed only memory; after a cold relaunch the app again read `future_version` and the rename was absent, proving zero primary writes for that session.

Result: **PASS**.

## Negative controls

Each mutant was applied one at a time with a targeted patch, the expected tests failed, the source was restored exactly, and relevant tests returned green. Source hashes were checked after restoration.

| Control | Mutation | Expected detector |
| --- | --- | --- |
| M1 | strip onboarding completion from storage | onboarding resume/commit tests failed |
| M2 | leave the task fact unchanged after Daily Load approval | relaunch/recompute tests failed |
| M3 | bypass onboarding route guard | protected-link test failed |
| M4 | bypass integrity validation | dangling/duplicate/action-reference tests failed |
| M5 | offer One Move on overloaded day | boundary/withheld tests failed |
| M6 | permit primary writes in future-version session | zero-write tests failed |
| M7 | shift the 23/22 boundary | load-tier and One Move tests failed |
| M8 | infer category identity from visible name | rename/system-role test failed |
| M9 | remove write serialization | ordering/stale-write tests failed |
| M10 | ignore existing daily One Move | completion/stability tests failed |
| M11 | accept demo origin in empty mode | mode-isolation tests failed |
| M12 | add raw Talk It Out text to the discovery record | privacy test failed |
| M13 | force a fixed guarded root / lose requested destination | routing source-guard test failed |

Result: **PASS — 13/13 controls killed**.

## POST-AUDIT EMULATOR SMOKE

### Environment

- Audited application source: `7a646ac42948ed0e7f00100173881847524a12b6`.
- The only change made during smoke was the dev-only category harness later committed as `7a646ac`; all harness-dependent cases ran against that exact content, and unchanged app surfaces were repeated in the final walk.
- Device: `emulator-5554`, AVD `Pixel_8_Pro`, Android API 37 image (`sdk_gphone16k_x86_64`).
- Runtime: Expo Go, SDK 57.
- Metro: one instance at a time on port `8081`; `adb reverse tcp:8081 tcp:8081` restored after emulator/host restarts.
- Modes: demo with `EXPO_PUBLIC_HERKEYS_INTERNAL_TOOLS=1`; empty with internal tools disabled.
- Driver: adb plus uiautomator trees. Tap coordinates were taken from UI-tree bounds, not screenshots.

### Results

| # | Scenario | Mode | Result | Evidence summary |
| ---: | --- | --- | --- | --- |
| 1 | Clean runtime start | demo / empty | **PASS** | branch/SHA verified, stale Metro absent/stopped, one Metro instance, device and reverse verified |
| 2 | Fresh demo boot | demo | **PASS** | Welcome only; no demo facts before onboarding; no crash, route flash, or persistence notice |
| 3 | Onboarding resume | demo | **PASS** | step 2 of 4 and selected `Cooking` survived force-stop; protected routes remained guarded |
| 4 | Completion + relaunch | demo | **PASS** | Today opened; Back left app; cold relaunch returned directly to Today; no routing fault or duplicate One Move |
| 5 | Daily Load move + restart | demo | **PASS** | task moved tomorrow; 35 → 65 minutes; Tight → Steady; cold relaunch retained facts/result |
| 6 | One Move completion + restart | demo | **PASS** | completion remained; no unfinished or replacement same-day move |
| 7 | Pre-onboarding deep links | demo | **PASS** | all seven routes ended at onboarding step 2 with no protected content in UI trees |
| 8 | Post-onboarding deep links | demo | **PASS** | all seven destinations retained; `/life/kids` opened Kids; modal/Back and child/Back worked |
| 9 | Talk It Out resume/privacy | demo | **PASS** | structured topic/answer resumed; Start Over survived another relaunch; no transcript replay |
| 10 | Category customization | demo/internal | **PASS** | Family/Pets/order/archive/restore and IDs persisted; referenced Kids facts still resolved |
| 11A | Malformed JSON | demo/internal | **PASS** | rejected, quarantined, normal recovery render, no stale state |
| 11B | Dangling category | demo/internal | **PASS** | integrity violation rejected/quarantined, normal recovery render |
| 12 | Future schema | demo/internal | **PASS** | preserved, disabled writes, reset refused, interaction remained memory-only across relaunch |
| 13 | Demo → empty | empty | **PASS** | all required screens neutral; no demo fact strings; internal tools unreachable |
| 14 | Empty → demo return | demo/internal | **PASS** | deterministic demo materialized/re-anchored without overwriting empty primary or duplicating records |
| 15 | Persistence-degraded runtime injection | — | **NOT_EXECUTED** | no on-device failing-adapter hook; adding one would change production architecture; automated failure/recovery tests pass |
| 16 | Build 1 regression walk | demo | **PASS** | Welcome, onboarding, Today/Daily Load/One Move, all Life screens, Calendar, Systems, AI/modal, tabs, Back, keyboard, safe area |
| 17 | Console/runtime errors | both | **PASS** | no red screen, fatal exception, unhandled rejection, navigation/AsyncStorage/validation/duplicate-key warning |
| 18 | Post-smoke check | — | **PASS** | Metro stopped cleanly; temporary UI trees and exports removed; final regression rerun |

The host reset between two smoke phases and the emulator temporarily disappeared from `adb`. The same named AVD was relaunched, boot completion and Expo Go were verified, reverse forwarding was restored, and the affected empty-mode phase was restarted from a clean Metro bundle. This was infrastructure interruption, not an app failure.

No P0–P3 runtime defect was discovered after the repair set. The category harness was the only smoke-driven source addition and exercised existing domain transitions; it is internal/demo-only and not production navigation.

Console noise was limited to the recoverable Metro cache/full-crawl notice and `NO_COLOR`/`FORCE_COLOR` development warnings in HK-B2-AUDIT-015.

Final runtime verdict: **PASS** (with only scenario 15 explicitly permitted as **NOT_EXECUTED**).

## Performance

Performance evidence is descriptive because Expo Go development timing is noisy:

- Host pure-function samples (100 iterations): envelope decode median 0.601 ms / p95 3.069 ms; Daily Load derivation median 1.264 ms / p95 3.555 ms.
- Host store samples (30 iterations): in-memory hydration median 0.607 ms / p95 1.491 ms; action-to-JS-state median 0.368 ms / p95 0.769 ms.
- Emulator development hydration markers: approximately 47.5–210.6 ms across all launch/recovery shapes; steady valid launches commonly about 69–119 ms.
- Native writes varied from single-digit milliseconds to about 656 ms and never blocked immediate UI.
- Final Android Hermes bundle: 3,550,416 bytes, 1,420 modules.
- Warm post-bundle activity starts observed in roughly the 0.9–1.9 second range; full clean Metro crawls took tens of seconds and are not app cold-start measurements.

There is no evidence-based reason to weaken schema validation. Release-build measurement remains HK-B2-AUDIT-012.

## Dependency and security checks

- AsyncStorage import exists only in `src/persistence/asyncStorageAdapter.ts`.
- No application network calls were found.
- No secret/token material was found.
- Diagnostics log event types, timings, sequence numbers, outcome/recovery identifiers, and repair IDs; they do not log household content or typed Talk It Out text.
- No stored presentation/derived authority was found.
- Prototype-looking keys and values do not reach `Object.prototype`.
- `npm audit`: 13 moderate, 0 high, 0 critical; unchanged baseline.
- `npm ls --all`: only the known worklets optional-peer problem.
- Expo Doctor: 21/21.

## Final regression

Run after the P0–P3 repair commit and dev-only harness were locked at `7a646ac42948ed0e7f00100173881847524a12b6`:

| Check | Result |
| --- | --- |
| `npm ci` | **PASS**, 552 packages; warnings only |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 144/144 tests, 29/29 suites** |
| `npx expo-doctor` | **PASS — 21/21** |
| `npx expo config --type public --json` | **PASS — SDK 57.0.0, scheme `herkeys`** |
| Android export | **PASS — 1,420 modules, 3,550,416-byte Hermes bundle** |
| `npm audit --json` | expected baseline failure — 13 moderate |
| `npm ls --all` | expected baseline failure — worklets optional-peer drift |

Compared with the received Build 2 baseline, the hostile suite adds 18 tests and 4 suites:

```text
KNOWN_BASELINE_FAILURES=2
EXPECTED_CHANGED_TESTS=+18 tests / +4 suites
NEW_UNEXPECTED_FAILURES=0
```

The Build 1 report's historical `KNOWN_BASELINE_FAILURES=3` included an earlier `npm ci` failure. On the received and repaired Build 2 tree, `npm ci` exits 0; warnings are not counted as a command failure.

## Git state

Local audit commits:

1. `35b40b0 audit: repair Build 2 persistence blockers`
2. `7a646ac audit: add category smoke controls`

The final audit document is committed separately after the code/runtime evidence. Generated Metro/export/UI-tree artifacts were removed. `main`, `origin/main`, and the original Build 2 branch were not moved. Nothing was pushed, no PR was created, nothing was merged, and Build 3 was not started.

## Final verdict

**REPAIRED_CONTINUE_BUILDING**

- P0–P3 found: **5**
- P0–P3 repaired: **5**
- P0–P3 remaining: **0**
- P4–P10 found: **10**
- P4–P10 documented: **10**
- P4–P10 intentionally deferred: **10**
- Mandatory emulator smoke: **PASS**, with only the explicitly allowed failing-adapter case **NOT_EXECUTED**
- `NEW_UNEXPECTED_FAILURES=0`

