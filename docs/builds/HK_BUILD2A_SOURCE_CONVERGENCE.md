# Her Keys — Build 2A: source convergence, backend parity and CI certification

Date: 2026-10-12. Role: lead integration engineer. Candidate branch: **`integration/build2a-candidate`**, stacked on PR #8 head
`f57aaeefcbdd74e5bb638f93de755d54082b177b`. Companion documents:
[F01–F04 reconciliation](HK_BUILD2A_F01_F04_RECONCILIATION.md) ·
[backend parity and security evidence](../audits/HK_BUILD2A_BACKEND_PARITY_20261012.md) ·
[Production change proposals P-1…P-5](../audits/HK_BUILD2A_PRODUCTION_CHANGE_PROPOSALS.md) ·
[RevenueCat handoff](../handoffs/HK_BUILD2A_REVENUECAT_CODEX_HANDOFF.md).

This phase did **not** build, submit or distribute anything, changed **nothing in Production**, and makes **no real-device claim**. It was done in two steps: the
first established the baseline, repaired what blocked CI, and stopped on one product decision; the second applied the owner's decision and reconciled the F01–F04
validation branches. Both are recorded here.

```
WELCOME_TREE_CONVERGED=PASS
F01_F04_REPAIRS_RECONCILED=PASS
SOURCE_AND_CI_CERTIFIED=PASS            (repository convergence and exact-SHA CI; scope stated below)
PRODUCTION_SERVICES_VERIFIED=BLOCKED    (SMTP, templates, redirects, secrets, welcome sending and AI refusal need a dashboard session or a user token)
BUILD2A_SOURCE_HANDOFF_READY=PASS
-- from the first step, still true --
BACKEND_PARITY_CERTIFIED=BLOCKED        (measurable items match; dashboard-only settings, OAuth/secrets and server consent enforcement could not be compared)
REVENUECAT_SOURCE_INTEGRATION=PASS
REVENUECAT_LIVE_CERTIFICATION=NOT_RUN
```

Scope of the PASS lines: the converged source is green on **exact-SHA CI** and in a **fresh clone**, with every defect found in scope repaired or recorded, and the owner's
Welcome Tree implemented and tested end to end *in source*. Nothing here proves behaviour on a device, a real RevenueCat purchase, or any live Auth/email behaviour. Premium is not
certified.

**Verified code state:** `727f3ecf835f7f146ba47a64d4da37608d801cb3`: GitHub Actions run
<https://github.com/herkeys/her-keys/actions/runs/38277779158> (workflow *Her Keys V2 Integration Gate*, all 13 steps green), and a fresh clone at that SHA: **4,006 / 4,006** tests.
The branch tip is a **documentation-only** commit on top of it; the tip's own CI run is reported with the hand-off. Earlier code states and runs: `3cddbed` →
<https://github.com/herkeys/her-keys/actions/runs/38272075711>; `f5fc9b7` → <https://github.com/herkeys/her-keys/actions/runs/38273116583>.

## 1. Verified project identity

METHOD: `npm run verify:release-identity` (resolves the **Expo config**, not a grep of `app.json`), run at ENTRY and on the candidate; `tests/releaseIdentity.test.mjs`
(10/10) rejects `com.herkeys.app` as the Android ID.

| Item | Resolved value | Changed? |
|---|---|---|
| Android application ID | `com.heykeys.app` | no |
| iOS bundle identifier | `com.herkeys.app` | no |
| URL scheme | `herkeys://` | no |
| EAS project ID | `7b25f8fe-d7de-49c1-ba69-1fd3a065826a` | no |
| Owner / slug | `ams2dad` / `her-keys` | no |
| Version / Android versionCode / iOS buildNumber | 1.0.0 / 2 / 2 | no |
| Paid tier | display "Her Keys Premium"; entitlement `her_keys_plus` (asserted by test) | no |

**Not independently verified** (no credentialed build operation was performed, so none was required): EAS signing credentials, the Play and Apple registrations, Google OAuth client
associations, RevenueCat app associations. The only prior record is `android-signing-package-identity` (2026-10-04). Before any EAS build, re-verify those four against the live consoles.

## 2. Source lineage and recovered work

### 2.1 What was inspected
`git worktree list --porcelain` showed 17 worktrees; every local and remote branch, the stash, the reflog and the dangling commits were checked.

| Line | Head | Relationship to the PR #8 head `f57aaee` |
|---|---|---|
| `main` | `bab9773` (Build 3 runtime certification, 2026-09-16) | ancestor |
| PR #6 Google OAuth (PKCE) | `15f19a0` | ancestor |
| PR #7 V2 closeout and parity | `3051174` (remote) | ancestor (19 commits above `integration/welcome-tree-auth-runtime`) |
| PR #8 email/password | `f57aaee` | **the base** (143 commits above PR #7; CI green 2026-10-09, run 37918193006) |
| `integration/welcome-tree-auth-runtime`, `integration/f01-f13-convergence`, `repair/hk-integration-readiness-01`, `repair/hk-audit-carryforward-01`, `audit/ios-android-platform-parity`, OCR / weather / calendar refinement lines | various | all ancestors |
| **every remote branch** | — | **0 unique commits** — nothing on GitHub was left out |

### 2.2 The reported keyboard repair `2641898b6f0b96a2e8b1d0340160fd6fe9cef404` — RECOVERED
Found as the detached HEAD of the Codex worktree `herkeys-android-smoke` (on no branch, on no remote); author Justin Smith, 2026-10-09 12:01:11 -0400, reflog
`worktrees/Her-Keys2/HEAD@{0}: commit: Keep Android auth actions above the keyboard`; a one-commit child of `f57aaee`; 2 files, 5+/5−; independent rationale in the existing audit finding PP-D10
(edge-to-edge); **no build provenance** (no APK id attached, so its device effect is unproven; registry item RT-18 stays open). As authored it **failed** the platform-parity guard: it removed two
registered `Platform` conditionals (PC-07, PC-08) without updating the registry. Integrated by fast-forward (SHA preserved), plus the missing companion (`db282ed`): PC-07/PC-08 retired and
`tests/androidAuthKeyboard.test.mjs`, which sets `Platform.OS='android'` before the views load and asserts all five auth screens use `padding`. Two mutants are caught.

### 2.3 Other worktrees, stash and dangling work
| Item | State | Disposition |
|---|---|---|
| Shared checkout `C:\Users\jsmit\Her Keys` (`feature/welcome-tree-auth-frontend`) | uncommitted `.gitignore`, `package.json`, untracked `tests/ai-evals/`, `tools/`, `HER_KEYS_WEB_BUILD1_SPEC.txt` (another session's work) | untouched, byte for byte |
| `validate/hk-ir01-f01…f04` (local-only) | feature-specific repairs **not** in the candidate | **reconciled in the second step** — see §8 and the reconciliation record; the branches themselves are unmodified |
| `docs/hk-external-intelligence-prebuild` (local-only, 2 commits) | read-only prebuild report | not source; not absorbed |
| local `feature/herkeys-email-password-20261008` ref `42f1673` | 108 commits behind origin; checked out in a Codex worktree | not moved; it makes the Meals boundary scan fail **locally** (§3) |
| Stash `On main: pre-build2 local untracked files 2026-10-04`; 6 dangling pre-V2 commits | irrelevant to source | none |

## 3. ENTRY baseline (unmodified `f57aaee`) — METHOD / RAW / INTERPRETATION

Last verifiable certification evidence, **not invented**: Build 3 runtime certification on clean Android emulators (`main` `bab9773`, 2026-09-16, `RUNTIME_CERTIFIED`); F01–F13 **local** backend
certification (`6cc0d77`, 1,592/1,592 checks, "zero reads or writes" of Staging/Production, so it proves nothing about deployed state). V1 "Part 1" platform parity ended **FAIL**
(CFG-01); the V2 closeout (2026-10-08) is **"BLOCKED / NOT CERTIFIED"**. There is no complete Build 1/V1 certification record in the repository.

| Gate | METHOD | RAW | INTERPRETATION |
|---|---|---|---|
| Recorded CI at `f57aaee` | run 37918193006 (2026-10-09) | `success` | green **then** |
| Backend boundary protection / release identity / tsc | as in CI | 5/5 · PASS · exit 0 | pass |
| App suite — **fresh clone** | `git clone`, detached HEAD, `npm ci` (npm 10.9.4), `npm test` | **3752 tests, 851 suites, 3752 pass**, 0 fail | pass |
| App suite — shared local worktree | same, local branch refs present | 3752 tests, **3750 pass, 2 fail** (`[BV]`, `[BV7]`) | **environmental**: the scan reads lane branches as local refs and the local `feature/herkeys-email-password-20261008` is stale. In CI that ref does not exist. Only a fresh clone is faithful |
| `expo install --check` / `expo-doctor` | | exit 1 / 20 of 21 | **fails today although it passed on 2026-10-09**: Expo published newer SDK 57 patches. Time-dependent |

### Lineage appendix — previously certified behaviour → candidate
| Capability | Certification record | In candidate? | Re-verified by |
|---|---|---|---|
| Build 1 core · Build 2 persistence + Gemini | `BUILD1/2_HOSTILE_AUDIT.md`; Build 2 gate green at `7bb3c63` | yes | full suite |
| Build 3 daily load | `RUNTIME_CERTIFIED` (emulators, 2026-09-16) | yes | full suite; **no device re-run** |
| Wave 1 / Wave 2 (F01–F08) · F01–F13 convergence | `363e473` · `6cc0d77` (1,592-check **local** harness, 311 mutants) | yes | app suite; **harness NOT RUN** (Docker down) |
| Integration readiness (HK-IR01) · audit carry-forward | `14bd58e` · `9adccde` | yes | full suite; the F01–F04 feature repairs were missing and are now reconciled (§8) |
| OCR, weather, calendar (PRs #3–#5) | merged green | yes | full suite |
| Google PKCE (PR #6) · V2 closeout (PR #7) · email/password (PR #8) | code PASS / BLOCKED / CI green | yes | `googleAuthParity` 38, `emailPassword` 5, `passwordRecovery` 5; parity re-measured live (companion report) |

## 4. Repairs and changes, in order (each with a focused mini-gate)

| Commit | Change | Mini-gate / mutants |
|---|---|---|
| `2641898` | recovered keyboard repair (fast-forward, SHA preserved) | exposed the parity-guard failure |
| `db282ed` | retire PC-07/PC-08; Android keyboard test | 155/155, tsc 0; 2 mutants caught |
| `5a36946` | six Expo SDK 57 patch versions; lock regenerated with npm 10.9.4 then **minimized** (raw regeneration moved 46 packages incl. `react-native-reanimated` 4.6→4.7 and `react-native-worklets` 0.12→0.13; those and 10 others restored — 34 move, all Expo-family or web-only Radix) | `expo install --check` clean; doctor 21/21 |
| `ab3822f` | `development` and `preview` EAS profiles compile the consent gate; the EAS build hook refuses any build without it; every profile must name a backend; server/client AI policy versions pinned together | 14/14 on the edited suites; 5 mutants caught |
| `bde7d20` `3cddbed` `f5fc9b7` | boundary lane, three reports; a `push` trigger on this branch for the existing gate (`gh workflow run` was refused: HTTP 403, repository admin rights required); verdicts | CI green |
| `3167518` | **Premium offer before account choice** (§6) | 26 new tests + updated suites; **10 mutants caught** |
| `20 commits` `4a6441b`…`f3dd5b7` | **F01–F04 reconciliation** (§8) | each repair has a mutant or its own test that fails without it |
| `727f3ec` | reconciliation record and lane registration (86 files) | CI green |

Why the consent change: the gate is one build-time flag (`EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE === 'true'`, default **off**), and the client AI recheck depends on the same flag. A cold-cache
A/B export proved a build without it ships **no** AI consent recheck. **Residual risk:** the flag is still default-off in code, so a non-EAS build (a local `expo run`) skips the gate;
the EAS hook closes the shipping path. Flipping the default is OD-2A-03.

## 5. EXIT results

METHOD: (a) GitHub Actions on the exact pushed SHA, Node 22 / npm 10; (b) a **fresh `git clone`** from GitHub at that SHA, `npm ci` with npm 10.9.4, Node 24.14.0.

| Gate | ENTRY `f57aaee` (fresh clone) | after step 1 `3cddbed` | **EXIT `727f3ec`** (fresh clone) | EXIT GitHub run `38277779158` |
|---|---|---|---|---|
| Backend boundary protection | 5/5 | 5/5 | 5/5 | success |
| Release identity | PASS | PASS | PASS | success |
| `tsc --noEmit` | exit 0 | exit 0 | exit 0 | success |
| Full app suite | 3752 / 851 suites, all pass | 3762 / 852, all pass | **4006 / 912 suites, 4006 pass, 0 fail, 0 skipped** | success |
| `expo install --check` | **FAIL** (6 patches) | clean | clean ("Dependencies are up to date") | success |
| `expo-doctor` | **20/21** | 21/21 | **21/21** | success |
| `expo config` public / introspect | pass / pass | pass / pass | pass / pass | success / success |

INTERPRETATION: the continuation added **+244 tests** (26 Premium-flow tests; the rest are the recovered F01–F04 tests and updated suites). No test was weakened, skipped or deleted; edits to existing
tests either add assertions or move a pin from the old order to the owner's order, each stated in its commit.

| Additional evidence | METHOD | RAW | INTERPRETATION |
|---|---|---|---|
| Android bundle export | fresh clone at `727f3ec`, cold private Metro cache, consent flag set as EAS now sets it | exit 0, 92 s, 8,281,567 B; present in the bundle: the Premium offer's *Select Premium* and *Continue Free*, "Nothing is purchased on this screen", the post-confirmation sign-in action, the `welcome_premium` placement, `her_keys_plus`, "Her Keys Premium", the consent-refusal reason, the F01 inferred-duration wording and gone-prerequisite line, the F02 high-stakes code, the F04 subject code | the new flow and the recovered repairs really ship; some strings are UTF-16 (curly apostrophes) and were searched in both encodings |
| Consent flag A/B | two cold, isolated-cache exports differing only by the flag | unset → client AI-consent refusal **absent**; `true` → **present** | the flag compiles consent in or out; a first attempt reused Metro's cache and gave an identical bundle, hence private cache dirs |
| Mutation controls | each mutant applied, judged, restored with git | keyboard 2 · consent profile 5 · routing 2 · RevenueCat identity 2 · **Premium flow 10** · **F01 1 · F02 high-stakes 1 + OD-A script 6/6 · F03 3 · F04 1** — all caught by assertion failures | the guards fail when the behaviour they protect is removed |
| Negative controls on Staging / deployed functions | companion report §5 | 11 role-based ledger controls + 9 unauthenticated function calls, all as required | the ledger and both function front doors refuse what they must |

NOT RUN: the SQL harness and migration replay (Docker engine down); live provider, signup, recovery, email and cross-account tests (no accounts, mailbox or dashboard); server AI refusal; device runs of any
kind; Premium purchase flows.

## 6. Welcome Tree — owner decision implemented

**Decision (owner, 2026-10-12):** Welcome → Get Started → **Premium offer** → Continue Free or Select Premium → Account Choice → Signup → Email Confirmation → Legal and AI Consent → Permissions/Onboarding
→ App. An existing user selects "I Already Have An Account" and goes directly to sign-in, with current consents and entitlements respected. Premium selection may be kept before signup, but **checkout waits until
account ownership is established and required consent is complete; no anonymous purchase transfer is authorized.** `her_keys_plus` is preserved.

*History, kept for the record:* the first step found the repository contradicting the brief (six 2026-10-08 commits "Align V2 welcome with approved post-audit Premium journey", no body, no cited approval, plus two V2
smoke documents saying Premium comes after the audit) and **stopped** rather than choose. The owner's decision settles it; those commits' ordering is superseded, and the smoke-document lines
(`HK_V2_PRODUCTION_ANDROID_SMOKE_20261008.md:42,46`, `HK_V2_SMOKE_P0_P1_CLOSEOUT_20261009.md:55`) are now stale and should be corrected when those documents are next edited.

**How it is built** (`3167518`):

| Step | Behaviour | Where |
|---|---|---|
| Get Started | opens the **Premium offer**, not the account choice | `welcomeFlowModel.ts` (`begin` → `premium`) |
| Offer | **Select Premium** and **Continue Free**, equally visible; says "Nothing is purchased on this screen" and states no price, plan or trial; both go on to the account choice | `PremiumIntroView.tsx`, `copy.ts` |
| Intent | recorded in memory (`PremiumChoice`), reported upward; **not persisted** | `PremiumIntentContext.tsx` |
| Welcome tree | has **no RevenueCat access** (scan test over the whole tree); the old busy/notice state, `premiumStarted/Settled` events and the paywall presenter prop are gone | `welcomeFlowModel.ts`, `WelcomeAuthFlow.tsx` |
| Existing account | "I Already Have An Account" skips the offer and carries no intent | reducer |
| Back | a new user's Back from the account choice returns to the offer; an existing user's to Welcome; going back to the offer or Welcome **withdraws** the intent | `stepAfterBack(step, entry)` |
| Signup → confirmation | sign-up that needs email confirmation binds nothing and keeps the intent; **new:** a contextual "I've confirmed my email — Sign in" action (shown only in that state) switches the same screen to sign-in | `EmailPasswordView.tsx` |
| Consent | unchanged: the gate stands between a bound account and the app, then optional permissions | `ConsentGate` |
| Checkout | `PremiumCheckoutAfterConsent`, **inside** the consent gate and **around** the navigator: acts only when the account is `accountBound` and the intent is `premium`, presents the existing `welcome_premium` placement **once**, never blocks the app | `app/_layout.tsx`, `src/monetization/PremiumCheckoutAfterConsent.tsx` |
| Purchase ownership | RevenueCat is logged in to the account UUID *before* the runtime publishes a bound account, and the gate does not exist until after; no code path buys while anonymous | `accountRuntime.ts` |

**Verified (source and scripted store, no device):** the reducer's state machine incl. a seeded 3,000-sequence fuzz with invariants (an intent exists only past the offer on the new path; an existing path never holds one; Welcome holds
none; a reconnect holds none); the checkout gate (premium+bound once; not bound → nothing, then once; free → nothing; throws never block; a new intent after a cleared one acts again); and whole journeys through the **real**
welcome flow and **real** account runtime with the paywall presenter as the only spy: new user selecting Premium (no checkout while signing up, none before consent, exactly one after), Continue Free, existing user,
interrupted signup with email confirmation, back navigation, session recovery, the same account signing back in (no second checkout), a different account on the device (quarantined, never offered one), checkout failure.
`routeAccess`: returning users bypass Welcome, signup and the audit; no guest path; no persisted "welcome seen".

**Two things for the owner to know or veto:**
1. *The post-confirmation sign-in action.* The password screen has no Sign In / Sign Up switch (the tabs were removed on purpose and a test still asserts they are absent), so after "confirmation required" a new user's only route to
   sign in was to back out to Welcome and choose "I Already Have An Account", which would also have dropped her Premium decision. The new action appears **only** after a confirmation-required sign-up. If you would rather keep that
   path as it was, remove it (`onGoToSignIn`); nothing else depends on it, but the intent would then not survive that route (OD-2A-08).
2. *The intent is in memory only.* If Android kills the process while she is away confirming her email, she restarts at Welcome and sees the offer again. Persisting it was rejected on purpose (a stored "wanted Premium"
   could outlive its owner on a shared device). R-10 in the RevenueCat handoff.

## 7. Authentication, consent, production authority

Unchanged from the first step except where noted; full tables are in the companion backend report.

* **Auth (source):** Apple on iOS only (PC-09); Google PKCE (code-only callback, tokens refused, exact return route); email/password with confirmation-required binding nothing; recovery on a separate non-persisted client that never
  binds a household; uniform recovery responses; account = Supabase user id with no merging by email, so a second method with the same address may create a second account/household (**not observed**: needs live accounts).
  Reset-vs-other-sessions is **unverified** (the recovery client ends only its own session). No account creation or live sign-in was performed.
* **Consent:** gate only for a bound account; fails **closed** on an unreadable ledger; current-version matching forces fresh acceptance while older receipts remain; declining AI still reaches the app; the database ledger is
  identical in both environments and passed 11 Staging negative controls; Production holds the authorized identity's four receipts with **`ai_processing` declined**. **Server AI refusal: NOT RUN** — it depends on
  `HER_KEYS_AI_REQUIRE_CONSENT`, unreadable here, and needs a user token (P-1).
* **Production:** read-only throughout. The five proposed writes are in the [proposals document](../audits/HK_BUILD2A_PRODUCTION_CHANGE_PROPOSALS.md) with exact change, risk, rollback and evidence — **none executed**.
  The Supabase dashboard was checked twice and is not signed in.

## 8. F01–F04 validation branches — reconciled

Full disposition of every commit: [HK_BUILD2A_F01_F04_RECONCILIATION.md](HK_BUILD2A_F01_F04_RECONCILIATION.md). In short: the shared foundation repairs were already present; the **feature-specific** repairs the convergence never
brought in were ported (`cherry-pick -x`) and reconciled where the candidate is stricter:

* **F01 Today:** a removed/archived/missing prerequisite is never "needed" or "done"; an *inferred* duration is worded as Her Keys' estimate (the candidate already refuses to quote a default or unrecorded one); the sync notice never says "0 changes".
* **F02 Talk It Out:** high-stakes wording is routed to the capture guard, never Discovery (a real gap once Gemini was added); an unnamed reading must be named before it is saved (OD-A; mutation script 6/6); the account, round-trip and duration tests.
* **F03 Calendar:** acceptance is not coverage while the load still needs her; durations carry how far they are known (HA-010); a gone prerequisite is neither met nor a blocker (HA-009).
* **F04 Systems:** a System names the child it is about (HA-011), with second-device and restart round trips.

Already present (skipped): F01's TaskForm test shape, F04's accepted-System audit. Not imported: the compatibility records and "re-validated at …" notes (they describe a different tree). The four branches are untouched.

## 9. RevenueCat

See the [handoff](../handoffs/HK_BUILD2A_REVENUECAT_CODEX_HANDOFF.md). Source integration: **PASS** (identity contract, sign-out reset, fail-open, no secret, checkout only after account and consent). Live: **NOT RUN**. Premium is **not**
certified and the candidate is **not** ready for real-device Premium testing until its section 6 has passed or the test scope excludes Premium. New live item: RevenueCat's project-level *transfer behaviour* must match "no transfer authorized".

## 10. Owner decisions and external dependencies

| ID | Item | State |
|---|---|---|
| OD-2A-01 | Premium placement | **decided** (before account choice, as an intent) and implemented |
| OD-2A-02 | Anonymous → account purchase transfer | **decided** (none authorized); the app cannot buy anonymously; the RevenueCat transfer setting remains to be verified |
| OD-2A-03 | Make the consent gate default-on in code | open (EAS builds are guarded; local builds are not) |
| OD-2A-04 | Approve or reject Production writes **P-1…P-5** | open — one decision each |
| OD-2A-05 | `validate/hk-ir01-f01…f04` | **resolved**: reconciled; the branches can be retired when the owner is satisfied with the record |
| OD-2A-06 | Should a password reset revoke other sessions? | open (needs a live observation first) |
| OD-2A-07 | A persistent Restore Purchases entry (RevenueCat R-02) | open |
| OD-2A-08 | Keep or remove the post-confirmation sign-in action (§6) | open — implemented, easy to remove |
| Access | Supabase dashboard session; Docker engine; two designated Staging accounts + a controlled mailbox; RevenueCat / App Store / Play access; a physical iPhone; a user token for `4efe7570-…` | needed for the BLOCKED / NOT RUN items |

## 11. Handoff to Build 2B

* Build from `integration/build2a-candidate` at the **final tip only**; do not rebuild from PR #8, from the shared checkout, or from `validate/*`.
* Re-run `npx expo install --check` on that exact SHA first: it is time-dependent.
* Local suites are meaningful only from a fresh clone (`git clone` + `npm ci` with npm 10): stale local branch refs falsely fail the Meals boundary scan.
* Do **not** build for testers until P-1…P-3 are decided: a build now tests an unenforced AI refusal and an undeliverable confirmation/recovery email.
* Nothing is merged, nothing is deployed, no PR was opened.
