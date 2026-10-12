# Her Keys — Build 2A: source convergence, backend parity and CI certification

Date: 2026-10-12. Role: lead integration engineer. Candidate branch: **`integration/build2a-candidate`**, stacked on PR #8 head
`f57aaeefcbdd74e5bb638f93de755d54082b177b`. Companion documents:
[backend parity and security evidence](../audits/HK_BUILD2A_BACKEND_PARITY_20261012.md) and the
[RevenueCat handoff](../handoffs/HK_BUILD2A_REVENUECAT_CODEX_HANDOFF.md).

This phase did **not** build, submit or distribute anything, changed **nothing in Production**, and makes **no real-device claim**.

```
SOURCE_AND_CI_CERTIFIED=PASS        (repository convergence and exact-SHA CI; scope stated below)
BACKEND_PARITY_CERTIFIED=BLOCKED    (measurable items match; dashboard-only settings, OAuth/secrets and server consent enforcement could not be compared)
PRODUCTION_SERVICES_VERIFIED=BLOCKED (SMTP, templates, redirects, secrets, welcome sending and AI refusal need a dashboard session or a user token)
REVENUECAT_SOURCE_INTEGRATION=PASS
REVENUECAT_LIVE_CERTIFICATION=NOT_RUN
WELCOME_TREE_ORDERING=STOPPED — owner decision required (section 6)
```

Scope of the PASS: the converged source is green on **exact-SHA CI** and in a fresh clone, with every defect found in scope repaired or recorded. It implements the
repository's *post-audit* Premium order; whether that is the intended order is the open owner decision. **No real-device readiness is claimed**, and Premium is not certified.

GitHub Actions run on the code state `3cddbed` (workflow *Her Keys V2 Integration Gate*, all 13 steps green):
<https://github.com/herkeys/her-keys/actions/runs/38272075711>. The branch tip is a documentation-only commit on top of `3cddbed`; its own run is reported with the hand-off.

## 1. Verified project identity

METHOD: `npm run verify:release-identity` (resolves the **Expo config**, not a grep of `app.json`), run at ENTRY and on the candidate;
`tests/releaseIdentity.test.mjs` (10/10) rejects `com.herkeys.app` as the Android ID.

| Item | Resolved value | Changed in 2A? |
|---|---|---|
| Android application ID | `com.heykeys.app` | no |
| iOS bundle identifier | `com.herkeys.app` | no |
| URL scheme | `herkeys://` | no |
| EAS project ID | `7b25f8fe-d7de-49c1-ba69-1fd3a065826a` | no |
| Owner / slug | `ams2dad` / `her-keys` | no |
| Version / Android versionCode / iOS buildNumber | 1.0.0 / 2 / 2 | no |
| Paid tier | display "Her Keys Premium"; entitlement `her_keys_plus` | no |

**Not independently verified in this phase** (no credentialed build operation was performed, so none was required): EAS signing
credentials, the Play and Apple registrations, Google OAuth client associations, RevenueCat app associations. The only prior record is
`android-signing-package-identity` (2026-10-04: `com.heykeys.app` ↔ upload key `27:EF…`, checked with keytool on an AAB). **No discrepancy was
found and none was looked for beyond the resolved config.** Before any EAS build: re-verify those four against the live consoles.

## 2. Source lineage and recovered work

### 2.1 What was inspected

`git worktree list --porcelain` showed 17 worktrees; every local branch, every remote branch, the stash, the reflog and the dangling commits were checked.

| Line | Head | Relationship to the PR #8 head `f57aaee` |
|---|---|---|
| `main` | `bab9773` (Build 3 runtime certification, 2026-09-16) | ancestor |
| PR #6 Google OAuth (PKCE) | `15f19a0` | ancestor |
| PR #7 V2 closeout and parity | `3051174` (remote) | ancestor (19 commits above `integration/welcome-tree-auth-runtime`) |
| PR #8 email/password | `f57aaee` | **the base** (143 commits above PR #7; CI green 2026-10-09, run 37918193006) |
| `integration/welcome-tree-auth-runtime` | `dc56531` | ancestor |
| `integration/f01-f13-convergence` | `6cc0d77` | ancestor |
| `repair/hk-integration-readiness-01`, `repair/hk-audit-carryforward-01`, `audit/ios-android-platform-parity`, OCR/weather/calendar refinement lines | — | all ancestors |
| **every remote branch** | — | **0 unique commits** — nothing on GitHub was left out |

So convergence was a fast-forward onto one line, not a multi-way merge, and nothing legitimate was discarded.

### 2.2 The reported keyboard repair `2641898b6f0b96a2e8b1d0340160fd6fe9cef404` — RECOVERED

| Question | Evidence |
|---|---|
| Does it exist? | Yes, locally. `git cat-file -t` → `commit` |
| Where? | Detached HEAD of the Codex worktree `C:\Users\jsmit\.codex\worktrees\herkeys-android-smoke\Her Keys` (git admin dir `worktrees/Her-Keys2`); `git status` clean there; on **no** branch and on **no** remote |
| Provenance | author Justin Smith `<justin.landes@gmail.com>`, 2026-10-09 12:01:11 -0400; reflog `worktrees/Her-Keys2/HEAD@{0}: commit: Keep Android auth actions above the keyboard` |
| Parent | exactly `f57aaee` (verified PR #8 head) — a one-commit child |
| Diff | 2 files, 5+/5−: `EmailEntryView.tsx` (`EMAIL_AUTH_KEYBOARD_BEHAVIOR` is `'padding'` instead of iOS-only) and `OtpEntryView.tsx` (`behavior="padding"`). `EmailPasswordView` and `PasswordRecoveryView` import the same constant |
| Independent rationale | existing audit finding PP-D10: under edge-to-edge (target SDK 36) `adjustResize` may not lift content; Talk It Out already uses explicit avoidance |
| Build provenance | **not established**: no APK or build id was attached to it; its effect on a device is unproven (registry item RT-18 stays open) |
| Tests as authored | **FAILED** the platform parity guard: it removed two registered `Platform` conditionals (PC-07, PC-08) without updating the registry |

Integration: fast-forwarded (**SHA preserved**), then repaired with the missing companion (commit `db282ed`): PC-07/PC-08 retired in the registry and the
parity report, and a new test, `tests/androidAuthKeyboard.test.mjs`, which sets `Platform.OS='android'` *before* the views load and asserts all
five auth screens render `KeyboardAvoidingView` with `padding`. **Two mutants** (shared constant OS-dependent again; OTP view loses padding) are caught by assertion failures.
Mini-gate: 155/155 across parity + welcome + auth suites, `tsc` 0.

### 2.3 Other worktrees, stash and dangling work — NOT absorbed

| Item | State | Decision |
|---|---|---|
| Shared checkout `C:\Users\jsmit\Her Keys` (`feature/welcome-tree-auth-frontend`) | uncommitted `.gitignore`, `package.json`, untracked `tests/ai-evals/`, `tools/`, `HER_KEYS_WEB_BUILD1_SPEC.txt` (another session's AI-02 eval work and web spec) | untouched; Build 2A used its own worktree `Her-Keys-B2A` |
| `validate/hk-ir01-f01…f04` (local-only) | 8–10 commits each whose **patches are not in the candidate** (IR7/IR9 repairs on F01–F04). Spot-check: the candidate's `SyncNotice.tsx` has no zero guard, while `validate/hk-ir01-f01` adds `syncNoticeLine.ts` so it can never say "0 changes need your attention" | **not absorbed**; real, distinct, unmerged repairs. Owner decision OD-2A-05 |
| `docs/hk-external-intelligence-prebuild` (local-only, 2 commits) | read-only prebuild report | not source; not absorbed |
| `feature/herkeys-email-password-20261008` **local** ref `42f1673` | 108 commits behind origin; checked out in the Codex worktree `v2-password-runtime` | not moved. It makes the Meals boundary scan fail **locally** (section 3) |
| Stash `On main: pre-build2 local untracked files 2026-10-04` | untracked design review, an image, Supabase CLI temp files | irrelevant to source |
| 6 dangling commits (WIP stashes and two Claude audit commits, 2026-09-16…25) | unreachable, all pre-V2 | not relevant |

## 3. ENTRY baseline (unmodified `f57aaee`) — METHOD / RAW / INTERPRETATION

Last verifiable certification evidence, **not invented**: Build 3 runtime certification on clean Android emulators (`main` `bab9773`, 2026-09-16,
`BUILD3_HOSTILE_AUDIT.md`: `RUNTIME_CERTIFIED`); F01–F13 **local** backend certification (`6cc0d77`, 1,592/1,592 checks; "zero reads or writes" of Staging/Production, so
it proves nothing about deployed state, per `HK_V2_STAGING_PRODUCTION_PARITY_GATE.md`). V1 "Part 1" platform parity ended **FAIL** (`audit/ios-android-platform-parity`,
CFG-01); the V2 closeout (2026-10-08) is **"BLOCKED / NOT CERTIFIED"**. There is **no** complete Build 1/V1 certification record in the repository; the lineage appendix says so.

| Gate | METHOD | RAW | INTERPRETATION |
|---|---|---|---|
| Recorded CI at `f57aaee` | GitHub run 37918193006 (2026-10-09) | `success` | green **then**; see the expo rows for why it would not be green today |
| Backend boundary protection | `node --test tests/build2BackendProtection.test.mjs` | exit 0 (5/5) | pass |
| Release identity | `npm run verify:release-identity` | exit 0 | pass |
| TypeScript | `tsc --noEmit` | exit 0 | pass |
| App suite — **CI-parity clone** | fresh `git clone` of GitHub, detached HEAD, `npm ci` (npm 10.9.4), `npm test` | **3752 tests / 851 suites, 3752 pass, 0 fail**, 48 s | pass |
| App suite — shared local worktree | same, but local branch refs present | 3752 tests, **3750 pass, 2 fail** (`[BV]` boundary scan, `[BV7]`) | **environmental, not a defect.** The scan reads lane branches as local refs; local `feature/herkeys-email-password-20261008` is the stale `42f1673`. In CI that ref does not exist and the lane is "unverified". The clone run above is the faithful result |
| `npx expo install --check` | exit 1 | six SDK 57 patches out of date | **fails today although it passed on 2026-10-09**: Expo published newer patches. Time-dependent, repaired in 2A |
| `npx expo-doctor` | 20/21 | same six packages | same cause |
| `expo config --type public` / `--type introspect` | exit 0 / exit 0 | pass | pass |

Defects known at ENTRY: the six patch mismatches; the keyboard defect on Android email/OTP screens (reported, unreproduced on a device); the testing profiles
omit the consent gate (found in 2A); the Premium-ordering ambiguity (section 6).

### Lineage appendix — previously certified behavior → candidate

| Capability | Certification record | Present in candidate? | Re-verified in 2A by |
|---|---|---|---|
| Build 1 core experience | PR #1 merged; `BUILD1_HOSTILE_AUDIT.md` (repaired) | yes (`203dda5`, `7f6cf22` ancestors) | full suite |
| Build 2 persistence + Gemini | `BUILD2_HOSTILE_AUDIT.md`; Build 2 gate CI green at `7bb3c63` | yes | full suite |
| Build 3 daily load | `BUILD3_HOSTILE_AUDIT.md`: `RUNTIME_CERTIFIED` (emulators, 2026-09-16) | yes (`main` ancestor) | full suite; **no device re-run** |
| Wave 1 / Wave 2 (F01–F08) | integration `363e473`; per-feature ledgers | yes | full suite |
| F01–F13 convergence | `6cc0d77`: 1,592-check **local** backend harness, 311 mutants, fingerprint `4371/17dccce9` | yes | app suite; **harness NOT RUN** (Docker down) |
| Integration readiness (HK-IR01), audit carry-forward | ledgers `14bd58e`, `9adccde` | yes | full suite. The F01–F04 `validate/*` repairs are **not** in the candidate (2.3) |
| OCR, weather, calendar activation (PRs #3–#5) | merged green | yes | full suite |
| Google OAuth PKCE (PR #6) | code PASS, Staging config FAIL at the time (CFG-01) | yes | `googleAuthParity` 38/38 |
| V2 closeout (PR #7) | `BLOCKED / NOT CERTIFIED` | yes | schema/function parity re-measured live (companion report) |
| Email/password + recovery (PR #8) | CI green; runtime not exercised | yes | `emailPassword` 5/5, `passwordRecovery` 5/5 |

## 4. Repairs made in Build 2A (each with a focused mini-gate before moving on)

| Commit | Change | Mini-gate / mutants |
|---|---|---|
| `2641898` | recovered keyboard repair (fast-forward, SHA preserved) | exposed the parity-guard failure |
| `db282ed` | retire PC-07/PC-08, add Android keyboard test | 155/155, tsc 0; 2 mutants caught |
| `5a36946` | six Expo SDK 57 patch versions; lock regenerated with npm 10.9.4 then **minimized** | `expo install --check` clean; doctor 21/21; tsc 0; config introspect ok. The raw regeneration moved 46 packages incl. `react-native-reanimated` 4.6→4.7 and `react-native-worklets` 0.12→0.13; those and 10 others were restored — 34 move, all Expo-family or web-only Radix transitives; a second npm 10 pass leaves the package set unchanged and `npm ci` accepts it |
| `ab3822f` | `development` and `preview` EAS profiles now compile the consent gate; the EAS build hook refuses any build without it; every profile must name a backend; server/client AI policy versions pinned together | the two edited suites 14/14 (`productionConsentBuildProfile` 4, `releaseIdentity` 10); 5 mutants caught by assertion failures (preview loses flag; hook stops checking; new ungated profile; server version drifts; server guard accepts a decline) |
| `bde7d20` | boundary lane `BUILD-2A`, three reports | boundary scan: no finding of its own |
| `3cddbed` | `v2-integration-validation.yml` also runs on **pushes to `integration/build2a-candidate`** (nothing else in the workflow changes). `gh workflow run` was refused with HTTP 403 ("Must have admin rights"); a push trigger needs no extra privilege and tests the exact SHA instead of a merge ref | CI run 38272075711 green |
| tip (docs only) | verdict block, EXIT results, this table | CI on the tip |

Why the consent change: the gate is one build-time flag (`EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE === 'true'`, default **off**), and the client-side AI recheck depends on the same flag. Only production
and the smoke APK set it, so a Staging tester build silently skipped Terms, Privacy, age-18 and AI Data Processing. Staging has had the ledger since 2026-10-09, so the original reason to leave it off is gone.
**Residual risk:** the flag is still default-off in code, so a non-EAS build (a local `expo run`) skips the gate. The EAS hook closes the shipping path; flipping the default is OD-2A-03.

## 5. EXIT results (code state `3cddbed`) — METHOD / RAW / INTERPRETATION

METHOD: two independent runs of the same gate sequence: (a) GitHub Actions, push event on the exact SHA, Node 22 / npm 10; (b) a **fresh `git clone`** from GitHub (no local
branch refs), detached at `3cddbed`, `npm ci` with npm 10.9.4, run on Node 24.14.0.

| Gate | ENTRY `f57aaee` (fresh clone) | EXIT `3cddbed` (fresh clone) | EXIT GitHub run |
|---|---|---|---|
| Backend boundary protection | 5/5 | 5/5 | success |
| Release identity | PASS | PASS (`com.heykeys.app` / `com.herkeys.app` / `7b25f8fe-…`) | success |
| `tsc --noEmit` | exit 0 | exit 0 | success |
| Full app suite | 3752 tests, 851 suites, **3752 pass**, 0 fail | **3762 tests, 852 suites, 3762 pass**, 0 fail, 0 skipped, 37 s | success |
| `expo install --check` | **FAIL** (6 patches) | "Dependencies are up to date" | success |
| `expo-doctor` | **20/21** | **21/21** | success |
| `expo config` public / introspect | pass / pass | pass / pass | success / success |

INTERPRETATION: the +10 tests are the 8 Android keyboard tests and 2 consent/profile guards. The two defects at ENTRY (Expo patch drift, and the ungated testing profiles) are gone; no
test was weakened, skipped or deleted (the only edits to existing tests *add* assertions, plus the registry/report rows that the recovered commit had orphaned).

Additional executed evidence (not part of the CI gate):

| Evidence | METHOD | RAW | INTERPRETATION |
|---|---|---|---|
| Targeted security suites | 28 files, each in its own process | 372 / 372 pass (`accountRuntime` 32, `routeAccess` 19, `emailOtp` 21, `emailPassword` 5, `passwordRecovery` 5, `googleAuthParity` 38, `consent*` 7, `welcomeAuthFlow` 41, `welcomeAuthShell` 38, `monetization` 23, parity guard 58, `migrationChain` 12, …) | auth, consent, isolation, RevenueCat identity, Welcome Tree and Android Back semantics all pass. These are scripted-boundary tests, not live-service tests |
| Mutation controls | each mutant applied, judged, restored with git | **11 / 11 caught**: keyboard ×2; consent profile ×3; server AI guard ×2; routing ×2 (signed-out opens protected screens; returning user sees Welcome); RevenueCat identity ×2 (sign-out no longer anonymizes; sign-in sends the wrong id) | the guards fail when the behavior they protect is removed |
| Android bundle export | fresh clone, `expo export --platform android` | exit 0, 94 s, 8,262,523 B; welcome, consent, entitlement and display-name control strings all present | the new SDK versions resolve and bundle; the bundle is this tree |
| Consent flag A/B | two **cold, isolated-cache** exports differing only by `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE` | unset → the client AI-consent refusal string `ai_processing_consent_required` is **absent** (0); `true` → **present** (1), different bundle hash | the flag really compiles the consent recheck in or out; a build without it ships no AI consent recheck. A first attempt reused Metro's cache and produced an identical bundle, which is why the A/B uses private cache directories |
| Negative controls on Staging / deployed functions | companion report §5 | 11 role-based ledger controls + 9 unauthenticated function calls, all as required | the ledger and both function front doors refuse what they must |

NOT RUN: the SQL harness and migration replay (Docker engine down); live provider, signup, recovery, email and cross-account tests (no accounts, mailbox or dashboard); server AI refusal;
device runs of any kind; Premium purchase flows.

## 6. Welcome Tree product authority — **STOPPED**

The brief's required order for a new account is: Welcome → Get Started → **Premium offer / free continuation** → Account choice → Signup → Confirmation → Legal/AI consent →
Permissions → Life Systems Audit → App. For an existing account: Welcome → I Already Have An Account → Sign In → Existing account binding → App.

**The repository contains a newer, conflicting ordering.** I did not choose between them.

| Source | Exact text / fact |
|---|---|
| Brief §4 (this assignment) | "Premium offer/free continuation" sits between *Get Started* and *Account choice* |
| `docs/builds/HK_V2_PRODUCTION_ANDROID_SMOKE_20261008.md:42` | "`Get Started` opens the account-choice tree without an upfront Premium paywall." |
| same file `:46` | "Note paywall positioning; Premium is not supposed to appear before signup." |
| `docs/builds/HK_V2_SMOKE_P0_P1_CLOSEOUT_20261009.md:55` | "…and approved Premium placement after the Life Systems Audit." (and `:57`: "…consent storage/enforcement, Premium ordering.") |
| Commits `60a5f47`…`f895a64`, 2026-10-08 20:18–20:21 | "feat(premium): add new-user Premium offer screen ahead of authentication", wiring to RevenueCat, "pin front-door purchase intent and free account path" |
| Commit `dfb2b02`, 20:22 | "ux(premium): prevent a second mandatory paywall after the Life Systems Audit" |
| Commits `7cd617f`, `71f198e`, `c675fda`, `ea4d0f4`, `e32c77f`, `876375e`, 20:42–20:43 | six commits, each titled **"Align V2 welcome with approved post-audit Premium journey"**: `begin` now goes to account choice; `app/index.tsx` no longer passes a welcome paywall; legal-notice copy changed; tests rewritten |
| Code today | `welcomeFlowModel.ts` `begin` → `account-choice`; the `premium` step and `premiumStarted/Settled/ContinueFree` are **unreachable**; the live paywalls are `onboarding/plus` (after the audit) and `systems_upgrade` |
| Provenance gap | the six alignment commits carry **no body and cite no written approval**; their author is the `herkeys` identity |

So the repository was changed 20 minutes after a front-door Premium build to the opposite order, under a claim of owner approval that I cannot find in writing. **Decision needed (OD-2A-01):**

* **A.** Premium *after* the audit (what the code does now) — then the brief's §4 order is amended, and RevenueCat never sees an anonymous purchase.
* **B.** Premium *before* account choice (the brief) — then the unreachable step and the `welcome_premium` placement must be wired back, and the anonymous-purchase transfer policy
  (OD-2A-02, RevenueCat handoff R-03) must be decided first.

What **was** verified and is independent of the decision (code and tests, no device): the existing-account path (`existingAccount` → account choice in sign-in mode → binding); returning users bypass Welcome, signup and the audit
(`routeAccess` "RETURNING USER BYPASS", "NO GUEST PATH", "NO WELCOME SEEN PERSISTENCE", "WELCOME REQUIRES AUTH BEFORE THE AUDIT"); the consent gate sits between a bound account and the navigator, then an optional-permissions stage,
then "Continue to Life Systems Audit"; Android hardware Back follows the visible back control; no navigator mounts before the account settles.

## 7. Authentication convergence — what the source does (no live accounts were created)

| Required | Finding (evidence) | Live status |
|---|---|---|
| Native Apple on iOS | iOS always shows Apple (PC-09); adapter `appleProvider.ts`; Android never | NOT RUN (no iPhone) |
| Google OAuth PKCE, both platforms | one path, `flowType:'pkce'`, `persistSession:false`, code-only callback, tokens in the URL refused, return route matched exactly; `googleAuthParity` 38/38 | NOT RUN on device; the Staging Google-client defect (CFG-01) is recorded as repaired on 2026-10-05 by a prior session, **not re-verified here** (dashboard access) |
| Email/password signup + sign-in | `signUp`/`signInWithPassword` on the isolated provider client; password never enters state/logs; `emailPassword` 5/5 | NOT RUN live |
| Email OTP | `signInWithOtp({shouldCreateUser:true})`, `verifyOtp`; service answers wrong and expired codes identically (`otp_expired`), so the UI says "didn't work" | NOT RUN live; **OTP length Production 8 vs six-digit field** (backend report B2A-BE-02) |
| Confirmation-required | signup with no session → `confirmationRequired`; **no household bound** | NOT RUN live (SMTP not configured per record) |
| Account binding / ownership | account = Supabase user id; no code compares addresses; no merging; `accountRuntime` 32/32, `accountSwitch`, quarantine | scripted only |
| Logout / durable restore | sign-out keeps the binding, clears the credential; restore re-identifies; `routeAccess` waits for restore | scripted only |
| Six-digit recovery | request → verify (recovery OTP) → update password, on a **separate, non-persisted client that never binds a household**; update refused before verification and under 8 chars | NOT RUN live |
| Throttling / expired / reused tokens | 429 → `rateLimited`; limits are Supabase's; expiry/reuse indistinguishable by design | limits unverified (dashboard) |
| Existing vs non-existing email | recovery request returns the same UI for any non-429/5xx; signup with confirm-email returns no session either way; sign-in failures map to one `rejected` | not compared against a real existing address |
| Reset vs existing sessions | the recovery client ends only its **own** local session | **unverified whether Supabase revokes others** (B2A-BE-05) |
| Provider linking / identity conflicts | **Not observed.** By design a second method with the same email may create a second Supabase user and therefore a second household; the client never merges. Apple private-relay addresses will not match a Google/email address, so they are separate accounts | NOT RUN: needs live accounts. Test matrix: email→Google, Google→email, Apple(relay)→Google, same address twice |

Account-creation and sign-in against Staging/Production were **not performed** (out of scope for this agent: creating accounts is a prohibited action).

## 8. Consent convergence

Client (code + tests): the gate is mounted only for an `accountBound` account; it reads the account's receipts and passes only when Terms, Privacy and age-18 are each **granted at the current version**
and an AI decision exists at the current version; an unreadable ledger fails **closed** (a blocking screen, no navigator); declining AI ("Continue without optional AI Data Processing") still reaches the app;
a bumped version constant forces fresh acceptance while earlier receipts remain (append-only). `HER_KEYS_CONSENT_VERSIONS` and the server literal are now pinned together by a test.

Database: identical in both environments and exercised on Staging with 11 negative controls (companion report §5): anon denied, cross-account insert denied, client-set `id`/`recorded_at` denied, update/delete denied,
check constraints enforced. Production holds the authorized identity's four receipts (three granted, `ai_processing` **declined**), with server timestamps.

Server AI refusal: **NOT RUN** — requires `HER_KEYS_AI_REQUIRE_CONSENT=true` (state unreadable) and a user token. Unauthenticated calls to `herkeys-ai` are refused in both environments. The brief's requirement that this be tested directly is **unmet**; the exact missing access is in the companion report §7.

## 9. RevenueCat

See the [handoff](../handoffs/HK_BUILD2A_REVENUECAT_CODEX_HANDOFF.md). Source integration: PASS (identity contract, sign-out reset, fail-open, no secret, restore present only on the post-audit screen). Live: NOT RUN.
Premium is **not** certified, and the candidate is **not** ready for real-device Premium testing until its section 6 has passed or the test scope excludes Premium.

## 10. Production authority

Read-only throughout: catalog queries, function listings and one source read, public Auth settings, advisors, aggregate counts, and the authorized identity's four receipts (type, version, granted, time — no email, no profile).
No Production write of any kind. The proposed Production writes (P-1…P-5) with change, reason, risk, verification and rollback are in the companion report §9, awaiting named approval.

## 11. Unresolved external dependencies and owner decisions

| ID | Item |
|---|---|
| OD-2A-01 | Premium placement: before account choice (brief) or after the audit (repository). Blocks the Welcome Tree workstream |
| OD-2A-02 | Anonymous → account purchase transfer policy (only matters if OD-2A-01 = before) |
| OD-2A-03 | Make the consent gate default-on in code (today default-off; EAS builds are now guarded) |
| OD-2A-04 | Approve or reject Production writes P-1…P-5 (server AI switch, OTP length, SMTP/templates/redirects, welcome switch, password policy) |
| OD-2A-05 | `validate/hk-ir01-f01…f04` repairs (IR7/IR9): bring into the line or retire |
| OD-2A-06 | Should password reset revoke the user's other sessions (B2A-BE-05)? |
| OD-2A-07 | A persistent Restore Purchases entry (RevenueCat R-02) |
| Access | Supabase dashboard session; Docker engine; two designated Staging accounts and a controlled mailbox; RevenueCat/App Store/Play access; a physical iPhone; a user token for `4efe7570-…` |

## 12. Handoff to Build 2B

* Build from `integration/build2a-candidate` at the final SHA only; do not rebuild from PR #8 or from the shared checkout.
* Re-run `npx expo install --check` on that exact SHA first: it is time-dependent.
* Do **not** build for testers until OD-2A-01 is settled and P-1/P-2 are decided; a build now would test the post-audit Premium order and an unenforced AI refusal.
* Local suites are meaningful only from a fresh clone (`git clone` + `npm ci` with npm 10): stale local branch refs falsely fail the Meals boundary scan.
* Nothing is merged, nothing is deployed, no PR was opened.
