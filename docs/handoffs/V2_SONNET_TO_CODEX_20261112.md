# Her Keys V2 — Autonomous Upgrade: Source Candidate Handoff (Sonnet → Codex)

Date: 2026-11-12
Branch: `integration/v2-autonomous-upgrade-20261112` (base `c37fa45c09facb370f8b6a7bd476a067818aaf3a`, the original branch is untouched)
Scope: SOURCE ONLY. **No EAS build was run and no IPA/AAB or other signed artifact was produced.** No TestFlight/Play upload, no store submission,
no Production change, no checkout activation, no RevenueCat paywall publication, no pricing/trial/consent/legal copy change, no backend contract
change, no migration, no new database permission, no package upgrade. A new signed artifact needs a separate, later, explicit authorization that
names the exact candidate SHA.

## 1. Outcome

**SOURCE CANDIDATE READY WITH DOCUMENTED CARRY-FORWARD** — subject to the exact-head CI result reported with this candidate (run ID and URL are in
the final report; see §10). This is **source-level readiness only**. Native artifact certification, TestFlight/Play testing, store submission,
RevenueCat/Apple/paywall completion and commercial certification are all NOT_RUN.

Owner decisions approved 2026-11-12 (management closeout directive) turn the two items that held this candidate back into owner-assigned
carry-forward to Codex. Neither is resolved by this pass:

| # | Carry-forward | Facts | Assigned |
|---|---|---|---|
| CF-1 | Expo compatibility: `expo install --check` and `expo-doctor` (20/21 checks pass) report 10 SDK 57 **patch** mismatches (expo, expo-auth-session, expo-constants, expo-image-manipulator, expo-image-picker, expo-linking, expo-location, expo-notifications, expo-router, expo-splash-screen) | `package.json`, `package-lock.json` and `app.json` are byte-identical to the base, so this is registry drift since `7bb3c63`, not introduced by this candidate | Codex: a narrowly scoped dependency-alignment pass. No major SDK migration. Lockfile must be regenerated under npm 10, never npm 11; do not nest `expo-modules-core` |
| CF-2 | `zod@4.6.5` advisory GHSA-mrhx-c7xc-m3w5 | Direct dependency and reachable (domain validation, `herkeys-ai`), but exploitability needs an oversized input that is hard to supply. Fix is `zod@4.6.7` | Codex: verified patch update inside the CF-1 pass. **Not resolved** |
| CF-3 | Deep-link advisory (decode-uri-component / query-string / expo-router) | Source mitigation V2UP-SEC-01 accepted **provisionally**. The real fix is expo-router 58 (major) | Codex: independently validate **all** relevant link entry points and authentication callbacks, not only `routerPathForIncomingLink`. **Not marked permanently resolved** |
| CF-4 | RevenueCat, backend activation, integration and implementation verification | Not touched in this pass | Codex, in full |
| CF-5 | Account isolation (V2UP-ISO-01) | Closed with regression tests; preserved as built | Codex: independent hostile verification |

Required confirmations:

- **Meals boundary-scan BASE is intentional.** `BASE = 38ab7f14…` is the Meals lane baseline. Advancing it was tried earlier and reverted; the scan
  therefore measures from the Meals baseline on purpose and this candidate's files are accounted for by a registered lane
  (`HK-V2-AUTONOMOUS-UPGRADE-20261112`, exact files, no migration/schema/root-collection/sync-kind). BASE and `INTEGRATION_CHECKPOINTS` are unchanged.
- **RevenueCat safe state preserved:** checkout OFF, paywall unpublished, no RevenueCat or Production configuration touched, no pricing, trial,
  consent or legal copy changed (`legalCopyLock` passes). The one Premium-adjacent wording change is C's Free-plan description on the Premium
  home: once the SERVER manifest reports the three tools released, it names them and says nothing is saved without approval; it contains no price,
  trial or offer, and the pre-release wording is unchanged. No entitlement or billing code changed beyond C's stale-state refresh, which only
  re-reads server-derived state after a subscription denial.
- **No EAS build, no signed artifact** (§11).

## 2. Candidate

The full 40-character SHA, the remote SHA and the CI run are reported in the final report delivered with this candidate (a document cannot
contain the SHA of the commit that holds it). The tree is fully tested at `33ba1749b0fdf59ace11286e01d3bb26e462496a`; the pushed tip differs from it
only by documentation (this file).

## 3. Merge ledger

All merges are non-fast-forward into the integration branch; no workstream branch was rewritten.

| Order | Workstream | Branch @ tip | Merge commit | Status before this pass | Status now |
|---|---|---|---|---|---|
| 1 | D Onboarding / first step / Back | `ws/v2up-d-onboarding` @ d2f8a89 | 417f67e | green on its branch | VERIFIED (source) |
| 2 | A Today / Daily Load / One Move | `ws/v2up-a-today` @ 2fc7134 | dbcd108 | **MERGED-UNVERIFIED** ("not yet run green") | VERIFIED (source): v2up.today 30/30 exit 0, A+D integration 10/10, full suite |
| 3 | E Native UX / A11y / Settings | `ws/v2up-e-native` @ 826f1a9 | 910213c | green on its branch | VERIFIED (source) after one test-harness repair (V2UP-DEF-E02) |
| 4 | C Premium | `ws/v2up-c-premium` @ 7e596f4 | 4931b40 | **MERGED-UNVERIFIED** | VERIFIED (source): premiumStaleState 17/17, premiumHomeFreeCopy 5/5, full suite |
| 5 | B Talk It Out / Smart Inbox | `ws/v2up-b-ai-inbox` @ 5cfb660 | fd0e26c | not merged until green | VERIFIED (source): four v2up.b.* files 88/88 + 17 regression files, tsc, then merged |

Integration-owned commits: 9f269de (V2UP-DEF-A01), 0916236 (V2UP-SEC-01), a6c6923 (validation workflow runs on this branch), b025067 + 7826fbc +
474cdbb (boundary lane, A+D integration test, V2UP-DEF-E02).
No silent promotion: A and C were merged ahead of green and are recorded above as MERGED-UNVERIFIED until this pass proved them.

## 4. Defect register

| ID | Sev | Status | What / disposition |
|---|---|---|---|
| V2UP-ISO-01 | **P1** | **FIXED / CLOSED** | Smart Inbox account-switch write window. Diagnosis correction: a reset does NOT change `household.id` (`createEmptyState` hardcodes `household-1`) and sign-out keeps the binding, so the fence token is (bound owner, **household object identity**). Every coordinator write (submit/accept/reject/bulk/read) carries a `CaptureEpoch`, is checked at start, inside the store turn, after every await and after the Premium reader returns; a refused write reports `not-saved` with nothing written; words are not handed to another account; the composer draft is released on household change. Proved by reset/rebind/switch/mid-reset/Premium-reader tests plus negative controls (sign-out and first claim still work) and a mutation check (10 tests fail when the household clause is disabled) |
| V2UP-DEF-A01 | P1 (verification) | FIXED | `v2up.today` passed every test and then never exited (4 h hangs): `AppStateProvider`'s 60 s refresh interval is cleared only by unmount and the test never unmounted. Fix is in the test (`after` hook unmounts); product code unchanged. 30/30, exits |
| V2UP-SEC-01 | P1-class (advisory exploit) | FIXED in source | GHSA-vcc3-ghjq-m6fr: a crafted link froze the router (measured 7.1 s at 1,025 chars of `%E0`, 28.7 s at 2,048). `routerPathForIncomingLink` now refuses links over 2,048 chars or with invalid percent-encoding before Expo Router parses them. 22 tests incl. a 250 ms bound and negative controls. The real dependency fix is a major expo-router upgrade (not done) |
| V2UP-DEF-E02 | P2 | FIXED | Full suite found `platformParity/persistentRestore` failing to load: E's account status section pulls notifications/location/consent modules the Restore test did not stub. The test now stubs the section (no assertion changed); the section has its own tests |
| V2UP-DEF-B01 | P2 | FIXED | Test fixes in B (unnamed-title map, conversation key shares one household object, per-topic uncertainty assertion instead of an arbitrary count) |
| V2UP-DEF-X01 | P2 | FIXED | My `feature/v2up-*` branch names tripped the Meals boundary scan; renamed to `ws/v2up-*`. The scanner was not weakened |
| V2UP-CF-1..3 | — | OPEN, owner-assigned to Codex | Expo patch drift, zod, deep-link dependency advisory: see §1 |
| V2UP-D-G3 | P2 | OPEN | Onboarding audit: a chip choice is mandatory per step and guard tests pin it; not changed |
| V2UP-B-P2a | P2 | OPEN | Premium `extract` has no abort signal: after a switch/reset the server call completes and spends quota, but the answer is dropped and never written (not a cross-write) |
| V2UP-B-P2b | P2 | OPEN | Server `herkeys-ai` handling of "I don't know yet" was not inspected; the client fix covers local/fallback path and routing only. `correct`, `answerClarification`, `dismissCapture` are not epoch-fenced but key by ids that cannot exist in a fresh household |
| V2UP-A-P3 | P3 | OPEN | A One Move chosen in the morning stays selected if the day later becomes overloaded |
| V2UP-E-P3a | P3 | OPEN | DeleteAccountPanel privacy link `herkeys.app/privacy` vs the accepted legal PDF |
| V2UP-E-P3b | P3 | OPEN | No in-app way to change the AI consent decision (display only) |
| V2UP-E-P3c | P3 | OPEN | iOS live-region gap in PremiumHome, SyncNotice, PersistenceNotice (`useAnnounceOnIOS` not yet applied) |
| V2UP-C-P3a | P3 | OPEN | No free-user Smart Inbox discoverability from Talk It Out / Inbox |
| V2UP-C-P3b | P3 | OPEN | No durable record for Smart Inbox time-saved counts |

No P0 is known. No open P1.

## 5. Isolation-race disposition

CLOSED (V2UP-ISO-01). Coverage: reset to an unbound household; reset then bind to another account; switch to another account; store with no
household (mid-reset); unbound household reset before the write; reset while the Premium reader is out. Each is tested for submit, accept, reject
and bulk with zero sources/readings/tasks written and nothing on disk. Negative controls: sign-out, first-account claim, and nothing-changed all
still succeed. Residual limits are in V2UP-B-P2a/P2b and in the stated assumption that no transition rebuilds `state.household` (a future one would
fail closed: `not-saved`, draft kept, never a wrong write). Not device-tested.

## 6. Verification matrix

Source-level evidence is node:test with react-test-renderer; it proves contracts and structure, not pixels or native behavior. Every device/emulator/
simulator cell is NOT_RUN: nothing was installed or run on a device in this pass.

| Area | Evidence | Result |
|---|---|---|
| A Today / Daily Load / One Move | v2up.today 30/30 (exits), today/guarantees 25, today/components 27, today/inheritance 14, dailyLoad suites in full run | PASS |
| A + D combined | v2up.integration.today 10/10: first-step shows only for an empty household and only navigates; capacity recommendation leads for a crowded day; another-option, accept, decline each behave; no automatic commit; decision survives remount without a second record | PASS |
| B Talk It Out / Smart Inbox | v2up.b.review 52, reviewUi 6, uncertainty 13, captureTurn 17; regression: talkItOut*, capture.*, premium/smartInbox*, aiClientAccountBoundary and others (all green on its branch and in the full run) | PASS |
| C Premium | v2up.premiumStaleState 17, premiumHomeFreeCopy 5, premium/*, premiumHome/* in full run | PASS |
| D Onboarding | v2up.onboarding 29 (new user → audit → app; returning user → app; back-nav; remount; kill mid-audit), routeAccess 19 | PASS |
| E Native UX / A11y | v2up.e.announce 8, accountStatus 39, consentSummary 10, nativeA11y 14; design-system lightRegression 6, appearance 17, themeBoundary 9, legalCopyLock 2; platformParity registryGuard 17, accountAccess 26, restoreControl 8, persistentRestore 6 | PASS |
| Deep links | v2up.deepLinkHardening 22 | PASS |
| Account switching / offline | covered by B's fence tests, accountAccess, premium transport/account-boundary suites in the full run; D06 offline lockout is the owner item in the prior Android report | PASS (source) |
| Meals boundary scan | meals/boundary 13/13, BASE `38ab7f14…` unchanged and intentional (the Meals baseline); every changed file has a lane reason | PASS |
| `tsc --noEmit` | exit 0 | PASS |
| `verify:release-identity` | `RELEASE_IDENTITY=PASS` (iOS com.herkeys.app, Android com.heykeys.app, EAS project 7b25f8fe-d7de-49c1-ba69-1fd3a065826a, version 1.0.0, Android versionCode 2, iOS build 2) | PASS |
| Expo compatibility | expo-doctor 20/21; 10 patch mismatches, unchanged vs base | **FAIL — pre-existing, owner-assigned carry-forward CF-1** |
| Full suite (serial) | 5563 tests, 5563 pass, 0 fail, 0 skipped, exit 0 (§10) | PASS |
| iOS device / simulator | not run | NOT_RUN |
| Android device / emulator | not run | NOT_RUN |
| Exact-head CI | run ID and URL in the final report | see final report |

## 7. Dependency triage (17 advisories, `npm audit` at the base lockfile; no package changed)

| Package | Sev | Class | Disposition |
|---|---|---|---|
| shell-quote | critical | build/dev tooling only (react-native → react-devtools-core); not in the app bundle | no runtime exposure; upgrade in a tooling pass |
| @expo/cli, @expo/config, @expo/config-plugins, @expo/fingerprint, @expo/metro-config, @expo/prebuild-config, expo, glob, minimatch, brace-expansion, node-forge, deepmerge | high/moderate/low | build tooling only (CLI, prebuild, fingerprint, Metro); not shipped | upgrade with the Expo patch alignment (NR-1) |
| decode-uri-component, query-string, expo-router | high | **reachable runtime** (deep-link parsing) | **Owner disposition recorded 2026-11-12: source mitigation V2UP-SEC-01 accepted PROVISIONALLY; advisory NOT resolved** (CF-3). Real fix is expo-router 58 (major), not done. Codex must independently validate all relevant entry points and authentication callbacks, not only `routerPathForIncomingLink` |
| zod 4.6.5 (direct) | high (GHSA-mrhx-c7xc-m3w5) | **direct and reachable** (domain validation; `herkeys-ai` function); exploitability requires an oversized input that is hard to supply | **Owner disposition recorded 2026-11-12: verified patch update to `zod@4.6.7` approved for the Codex dependency-alignment pass (CF-2); advisory NOT resolved.** No package changed in this pass; lockfile must be regenerated under npm 10 |

## 8. External blockers and owner actions (unchanged by this pass)

RevenueCat: project and the `her_keys_plus` offerings, store trial configuration, webhook secrets, manifest release, device restore/manage tests,
sandbox accounts; the paywall must stay unpublished. App Store Connect / Play: Apple and Google subscription settlement needs security sign-off;
no Apple devices are registered; store listings and review steps remain. Staging/Production hosted checks need their own authorization.
Account deletion Phase 2 stays in its draft PRs.

## 9. Decisions this pass did not make

Package upgrades; any Production or backend change; the paywall; consent or legal wording. (The advisory dispositions and the Expo patch drift
were decided by the owner on 2026-11-12 and are recorded in §1 and §7.)

## 10. Final results

**Full suite, serial** (`node --test --test-timeout=600000 --test-concurrency=1 "tests/**/*.test.mjs"`), run on commit
`33ba1749b0fdf59ace11286e01d3bb26e462496a` (the handoff commit, clean tree, before this section was filled): **exit 0, 5563 tests, 1114 suites,
5563 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, 401 s.** The first full run (at 7826fbc) had one failing file, `platformParity/persistentRestore`
(V2UP-DEF-E02, repaired in test with no assertion changed); the repaired tree is the one above.

The pushed tip differs from the tested commit only by this section and the §1/§7 owner-decision text (documentation, no code). The remote SHA, the
local SHA it equals, and the exact-head CI run ID and URL are in the final report delivered with this candidate (a document cannot name the commit
that contains it).

Native and store evidence, all **NOT_RUN**: iOS device/simulator, Android device/emulator, signed artifact, TestFlight, Play testing, store
submission, RevenueCat/Apple/Google paywall and settlement, commercial certification.

## 11. EAS / artifact statement

No EAS build, submit, IPA, AAB, TestFlight or Play upload was run or produced. A new signed artifact requires a separate, later, explicit
authorization that names the exact candidate SHA.
