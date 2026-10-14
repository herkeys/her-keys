# Her Keys Premium — Stage 1: Implementation Ledger, Evidence and Certification Matrix

Branch `feature/herkeys-premium-stage1` · ENTRY SHA `c660e59` (`integration/build2-shared-consumer-repair`) · repository `herkeys/her-keys`.
Authority: "Her Keys AI — Premium Stage 1, Autonomous Foundation, Entitlement and First-Feature Build (Revision 2)". **No EAS build, public subscription activation, Staging or Production deployment, store action, RevenueCat dashboard change or price was made or authorized.**

## 0. Reading this document

Four evidence levels are kept **separate** and never collapsed into one "PASS":

| Level | Meaning | Reached in Stage 1 |
|---|---|---|
| `SOURCE_VALIDATED` | tests over the source: unit, domain, rendered-component, real-Postgres SQL, concurrency, real-HTTP, mutation | **yes**, for everything marked below |
| `STAGING_VERIFIED` | authenticated execution against the Staging project | **no — NOT RUN** (not authorized) |
| `DEVICE_VERIFIED` | a purchase or journey on an iPhone / Android device | **no — NOT RUN** |
| `PRODUCTION_ACTIVATED` | live to customers | **no — NOT AUTHORIZED** |

Mocked tests are not purchase certification. No skipped test is counted (`skipped 0` in every run below). An exact-SHA green CI validates its specified tests, not a purchase on an iPhone.

## 1. Result in one paragraph

The Premium **foundation is built and source-validated end to end**: a verified RevenueCat webhook and projection, a single server authorization boundary with atomic quotas, an account-safe client, a shared decision ledger with operations tooling, **Daily Load Premium v1** (a complete journey with approval, receipt and undo), **Smart Inbox v1** (server extraction on the existing capture and review path, with an honest evaluation), the **Momentum foundation** (a truthful weekly review that withholds itself when history is thin), and reviewed contracts for **The Village** and **Co-Parent Plus**. Nothing has run against Staging, RevenueCat Sandbox or a device, so public sales are **not** ready. The remaining gates are in §9.

## 2. Certification matrix

| Key | Value | Evidence level and basis |
|---|---|---|
| `PREMIUM_A0_CONTRACTS` | **PASS** | `SOURCE_VALIDATED` — `PREMIUM_STAGE1_A0_ARCHITECTURE.md`; contracts are enforced by tests below |
| `PREMIUM_IDENTITY_BINDING` | **PASS** | `SOURCE_VALIDATED` — App User ID = Supabase UUID, aliases are evidence not accounts, transfer/ambiguous events reconcile and never grant from the event alone (identity + reconcile + webhook tests; HTTP journey). Real RevenueCat behaviour: not exercised |
| `PREMIUM_ENTITLEMENT_STATE_MACHINE` | **PASS** | `SOURCE_VALIDATED` — SQL `premium_derive_state` mirrored by the TypeScript derivation, **4000-row parity check**; unconfirmed expiry is `unknown`, never `expired` |
| `PREMIUM_WEBHOOK_SECURITY` | **PASS** | `SOURCE_VALIDATED` — Authorization (constant-time) + HMAC with 300 s tolerance (required in production), public SDK keys rejected, environment separation, idempotency on `(environment, event_id)`, dead-letter after 5. Not exercised against RevenueCat |
| `PREMIUM_PROJECTION_RECONCILIATION` | **PASS** | `SOURCE_VALIDATED` — per-field last-writer-wins clocks, tie → reconcile, compare-and-swap writer, strict reconcile for refund/transfer (RevenueCat unreachable ⇒ event fails and retries) |
| `PREMIUM_SERVER_AUTHORIZATION` | **PASS** | `SOURCE_VALIDATED` — one boundary (`premium_authorize`): lifecycle → ownership → feature → global switch → entitlement → AI consent → rate → atomic quota. **SQL 119/119**, real-HTTP journey **28/28** |
| `PREMIUM_QUOTA_ENFORCEMENT` | **PASS** | `SOURCE_VALIDATED` — **real multi-session races 11/11** (one conditional UPDATE; replay never double-charges; refusal leaves no pending claim; stale reservations expire). Limits are `controlled_test`, not owner-approved |
| `PREMIUM_FREE_TIER_PARITY` | **PASS** | `SOURCE_VALIDATED` — no Free feature restricted; Talk It Out has no cap; Free capture no longer imports the Premium provider; the whole existing Free suite passes unchanged except contracts deliberately evolved (§6) |
| `PREMIUM_DECISION_LEDGER` | **PASS** | `SOURCE_VALIDATED` — typed refs + snapshots only, state machine enforced by the database, derived keys, readable by the owner regardless of subscription; SQL suite 83 (38 checks) |
| `PREMIUM_OPERATIONAL_ROLLBACK` | **PASS** | `SOURCE_VALIDATED` — kill switches, `premium_health()` alert rules and the fixture-in-production guard are SQL-tested; runbook written. **The runbook has not been rehearsed** (Staging plan step 9) |
| `PREMIUM_DAILY_LOAD_V1` | **PASS** | `SOURCE_VALIDATED` — review, approve, apply, receipt, restart-safe recovery, undo with intervening-change detection; domain 113 tests + rendered panel 19. No device run |
| `PREMIUM_SMART_INBOX_V1` | **PARTIAL** | `SOURCE_VALIDATED` for the server function, the reader seam, review reuse, duplicate and injection handling, a 43-scenario corpus. **PARTIAL because:** no live model has ever been run (the live evaluation is gated and **NOT RUN**), corpus labels and model outputs are agent-authored, and only typed or pasted text is a working input (forwarded e-mail, voice and OCR-to-inbox are **NOT IMPLEMENTED**) |
| `PREMIUM_MOMENTUM_FOUNDATION` | **PASS** (foundation only) | `SOURCE_VALIDATED` — derivation, de-duplication, attribution, aggregation, confidence tiers, thin-history state, saved reviews readable after expiry, isolation; **51 + 23 + 11 + 13 tests, 40/40 mutants killed.** Longitudinal pattern intelligence is **not** claimed or activated; no review has been produced from a real household |
| `PREMIUM_VILLAGE_CONTRACT` | **PASS** | contract document only (`PREMIUM_VILLAGE_AND_COPARENT_PLUS_CONTRACTS.md` §1); no unfinished screen built; owner review pending |
| `PREMIUM_COPARENT_CONTRACT` | **PASS** | contract document only (same file §2); owner review pending |
| `PREMIUM_ACCOUNT_ISOLATION` | **PASS** | `SOURCE_VALIDATED` — RLS ownership matrix, epoch-guarded account switch in the controller, Daily Load / Momentum / Smart Inbox household isolation, ledger filtered by household |
| `PREMIUM_AI_CONSENT_SECURITY` | **PASS** | `SOURCE_VALIDATED` — the server checks the latest `account_consents` and policy version **before** any model call; the local high-stakes screen runs first and refused text is never sent; hostile-output validator and prompt-injection cases (59 server tests) |
| `PREMIUM_ANDROID_IOS_REGRESSION` | **PASS** (source) | `SOURCE_VALIDATED` — platform-parity and release-identity suites pass; no native or platform file was changed. **Device behaviour is a separate key below** |
| `PREMIUM_EXACT_SHA_CI` | **FAIL** | GitHub Actions run 38602275053 on exact SHA `098cdaa`: **4603 / 4603 tests pass, 0 failed, 0 skipped**; backend boundary protection 5/5, release-identity guard, `tsc`, resolved Expo public and native config all pass. The workflow nevertheless concludes **`failure`** because `npx expo install --check` and `npx expo-doctor` report **six packages one patch behind** (see §7.2). That is outside this build: `package.json` and `package-lock.json` are byte-identical to the entry commit. Not awarded PASS until the owner decides the Expo patch bump |
| `PREMIUM_STAGING_E2E` | **NOT_RUN** | not authorized; plan and request in `PREMIUM_STAGE1_STAGING_PLAN.md` |
| `PREMIUM_REVENUECAT_SANDBOX` | **NOT_RUN** | not authorized (Staging steps 5–7) |
| `PREMIUM_DEVICE_VERIFICATION` | **NOT_RUN** | no device pass; no EAS build authorized |
| `PREMIUM_PRODUCTION_ACTIVATION` | **NOT_AUTHORIZED** | — |
| `PREMIUM_STAGE1_SOURCE` | **PASS** | the entitlement foundation and Daily Load's consumer journey both pass at `SOURCE_VALIDATED`; exceptions and baseline findings are listed in §7 |
| `PREMIUM_STAGE1_STAGING` | **NOT_RUN** | — |
| `PREMIUM_PUBLIC_SALES_READY` | **FAIL** | Staging, Sandbox and device are NOT_RUN; no price, limit or Free allowance is owner-approved |

## 3. Per-milestone release evidence

Common to every milestone: ENTRY SHA `c660e59`; final SHA is the head recorded in §8; **Staging verification: NOT RUN**; rollback: runbook §6 (disable, don't drop).

| M | Source authority | Commit(s) | Schema changes | New server functions | Tests (this milestone) | Failed tests repaired | Remaining live dependencies |
|---|---|---|---|---|---|---|---|
| A0 | spec §§3–5 | `aa96d96` | — | — | contract-pinning tests in A1–A4 | — | owner decisions OD-P1-01..08 |
| A1 | spec A1 | `a176a4c` `3076a1d` `b1cf450` | `20261015120000_premium_entitlement_foundation.sql`: 10 tables, `premium_*` functions, no change to any existing table | `revenuecat-webhook`, `premium-reconcile`, `premium-ops` | webhookAuth 15, webhookEvents 9, projection 29, webhookHandler 26, reconcile 22; SQL parity 4000 rows; HTTP journey 28 | projection same-instant tie silently kept the first event → reconcile; transfer/refund with RevenueCat down was marked processed → now fails and retries; late-signed requests in the handler test | RevenueCat sandbox webhook, secrets, OD-P1-01 (restore/transfer setting) |
| A2 | spec A2 | `a176a4c` | same migration (`premium_authorize`, quotas, audit) | `premium-gate` | gateHandler 12; SQL suite 82 **81 checks**; concurrency 11 | SQL mutation survivors (unreleased flag, `complete_now` path, unapproved allowance, leftover claim) → 4 targeted tests; **29/29 SQL mutants killed** | Staging JWT matrix |
| A3 | spec A3 | `a5593e9` | — | — | clientController 15, clientProvider 12, clientState 30; TS mutants 28/28 server, 17/18 client (the survivor was dead code, removed) | "confirming" shown after a single verify attempt (product bug); constructor parameter properties broke Node type stripping | device purchase + paywall return |
| A4 | spec A4 | `0dd254e` | `20261015130000_premium_decision_ledger.sql`: `premium_decisions`, 2 functions, 6 service-only views, `premium_health()` | — | SQL suite 83 **38 checks** | suite 82 predated the ledger (see §6) | OD-P1-05 telemetry export |
| B | spec B | `11beeb9` | — | — | dailyLoadReview 43, Change 27, Flow 24, Ui 19, sha256 4 | fake ledger ignored the household filter (OOM on assertion) | device pass |
| C | spec C | `38db183` `b5297d8` `da2a5e0` | — | `smart-inbox-extract` | smartInboxServer 59, Client 31, Eval 9, Ui 5; **43-scenario corpus** | `smart-inbox` key too short for the server (7 < 8 chars) → `smart-inbox-` prefix; mapper dropped a stated time when the day was unknown → event kept with a provisional day; Free capture imported the Premium provider → decoupled | live provider run (gated, NOT RUN); OD-P1-03 |
| D | spec D | `9af0210` | — (saved reviews are ledger receipts) | — | momentum 51, Flow 23, Ui 11, Copy 13; **40/40 mutants** | snapshot trim loop was dead code → replaced by a validate-before-write guard; 6 surviving mutants found by mutation testing (3 weak tests, 2 missing review-level tests, 1 dead-code guard) | OD-P1-09 thresholds |
| E | spec E | `2e4af9c` | — | — | — (documents) | — | OD-P1-10..13 |
| F | spec F | `2e4af9c` `b48b2c4` `e9b8731` `836fdc3` `f8d9fc4` `098cdaa` | — | — | boundary lane registered | `PBP-1b` consumer contract; suite 82 ledger awareness; Meals scan check G and `--json` truncation (§7.1) | Staging authorization |

**Files changed vs entry (at `098cdaa`, before this ledger):** 113 files, +16,128 / −20 (93 added, 20 modified). **Premium Node tests: 489 (0 failed, 0 skipped).**

## 4. What exactly was measured for Smart Inbox (do not over-read)

`tests/premium/smartInboxEval.test.mjs` runs a **43-scenario corpus** (appointments, dated and undated tasks, money, who-it-is-about, ambiguous days, unsupported meanings, multi-item notes, nothing-to-do, adversarial model output). **Every scenario, label and "model output" was authored by the build agent; none is real household data and none came from a live model.** It measures two different things and reports each separately:

| Reader | What it is | Measured (items / fields / questions / unsupported) |
|---|---|---|
| **LOCAL** (the Free deterministic reader) | a real measurement of that reader against hand labels | precision **79.1 %**, recall **94.4 %**; asks the question she should be asked **14.3 %** of the time; flags unsupported meaning **50.0 %**; guesses instead of asking **2×**. *These are findings about the Free reader, recorded and not changed here.* |
| **PIPELINE** (server validator + client mapper over **authored competent-model** outputs) | fidelity and safety of the Premium path, **not model accuracy** | precision **100 %**, recall **100 %**, every field 100 %, asks-when-should **100 %**, guesses **0**, unsupported **100 %** |
| **PIPELINE incl. adversarial** | the model is scripted to misbehave (URL in a title, wrong weekday, invented child, invented kind) | every adversarial case ends in the safe outcome **except one, recorded as a KNOWN LIMIT**: a plausible *invented time* passes through to a review she must confirm (the pipeline cannot know it was never said) |
| **LIVE** | a real model on this corpus | **NOT RUN.** `scripts-dev/smart-inbox-live-eval.mjs` refuses to run without `GEMINI_API_KEY` **and** `SMART_INBOX_LIVE_EVAL=yes-spend-money` |

Live accuracy of Smart Inbox is therefore **unmeasured**. Model dates are cross-checked against the weekday word in her own quote and dropped (and she is asked) on a mismatch; an appointment with no time stays a dated note; a child is only ever one of her children; a possible duplicate is a warning, never a block.

## 5. Mutation testing (source-level negative controls)

| Area | Mutants | Killed | Notes |
|---|---|---|---|
| Server core (webhook, projection, identity, reconcile, gate) | 28 | 28 | |
| Client (controller, feature state, provider) | 18 | 17 | the survivor was an equivalent mutant (dead code), removed |
| SQL authorization and ledger | 29 | 29 | plus 2 privilege-assertion mutants added in suite 82 (exposed service function; unprotected twelfth table) — both killed |
| Momentum (derivation, aggregation, friction, report, snapshot, flow, copy, card) | 40 | 40 | first run 34/40: 6 survivors each exposed a weak test or dead code; all fixed |

## 6. Existing contracts deliberately evolved (not weakened)

* `tests/premiumFeedback.test.mjs` PBP-1b / PBP-2: Build 2.5 said the store SDK was the authority and no backend read the entitlement. Stage 1 supersedes that (A0 §3): the server projection is authoritative and enforcement lives **only inside the Premium namespace**; PBP-1b now lists the two Premium consumers (Daily Load, Momentum) and still fails for any other.
* `tests/migrationChain.test.mjs`: the two Premium migrations are registered; the sync-registration check exempts them (they create server-authority tables that are deliberately not synced).
* `tests/localNotificationArchitecture.test.mjs`: the five new functions are reviewed as having no notification path.
* `supabase/tests/82-premium-authorization.sql`: written before the ledger; it asserted ten tables and "no client-callable Premium function but two". With the ledger in the chain it **failed 2 of 119 checks** until updated to **exactly eleven tables, all RLS-forced, and exactly four client-callable functions** (stricter than before; mutation-checked).
* `scripts-dev/meals-boundary-scan.cjs`: lane `HK-PREMIUM-STAGE1` registered (owned paths, the two migrations, `SavedReportSchema`, and the shared files it changed with reasons).

## 7. Failures and findings that are NOT fixed here (stated, not hidden)

1. **Meals boundary scan.** In CI it now **passes** (BV1, BM1, BM4, BV6, BV7). Two things were repaired in the scan itself, both registered in the lane with their reason: (a) check G reported the *checked-out branch* as a sibling reaching HEAD — it now exempts the line under test exactly as it exempts `feature/08-meals-os` (every other branch is still judged by ancestry; pinned by `[BM4]`); (b) the scan's `--json` output was truncated on a Linux pipe by `process.exit()` — it now sets `process.exitCode`. **In this working clone only, BV1 and BV7 still fail locally** because the clone holds a local `feature/herkeys-email-password-20261008` branch whose lane claims files that branch never changed (check H, the `V2-EMAIL-PASSWORD` lane, not Premium); those two do not fail in CI. The Premium lane contributes no finding anywhere.
2. **`npx expo install --check` / `expo-doctor`: 6 packages out of date** (`expo`, `expo-auth-session`, `expo-constants`, `expo-linking`, `expo-notifications`, `expo-router`). These are patch releases Expo published after the entry SHA; **this branch changes no dependency, lockfile or app config** (`git diff c660e59..HEAD -- package.json package-lock.json app.json eas.json` is empty). A patch bump here is a separate, owner-visible change (a previous bump nested `expo-modules-core`), so it was not made.
3. **The Free reader asks too rarely and flags unsupported meaning half the time** (§4). Out of scope; recorded.
4. **Daily Load's analysis runs on the device**, so the server meters, authorizes and receipts a review but cannot cryptographically stop local computation. The UI gates on the server's answer and the decision/receipt writes are server-authorized; this is a limitation of any on-device computation and is stated, not claimed away.
5. **Smart Inbox replay semantics:** if a response is lost after the model ran, a retry is a replay that **does not call the model again**; she falls back to the local reading with a plain note.
6. **Google Calendar events are not in app state**, so the Daily Load review always says it cannot see them.
7. A save that fails the strict schema (an unexpectedly long reference) reports "not saved yet" on every open; unreachable in practice (references are ≤ 64 characters) and guarded.

## 8. CI and fresh-clone evidence

| Run | SHA | Result |
|---|---|---|
| 38600956320 | `836fdc3` | failure — full suite 4600 / 4602: the Meals boundary scan reported the Premium branch itself as a "sibling" (check G), a defect of the scan in a push checkout, not of Premium |
| 38601905443 | `f8d9fc4` | failure — with G fixed, the scan's `--json` output (157 KB) was **truncated on a Linux pipe** by `process.exit()` ("Unterminated string in JSON"); the Premium lane's registration pushed the output over the pipe size, exposing a latent bug in the scan |
| **38602275053** | **`098cdaa`** | **full suite 4603 / 4603, 0 skipped**; only the two Expo version-drift steps fail |

Local, same code: `tsc` clean; `deno check` clean for all five functions; SQL suites **119 / 119** (suite 82: 81, suite 83: 38), real concurrency **11 / 11**, parity **2 / 2 (4000 rows)**, real-HTTP journey **28 / 28**; Premium Node tests **489 / 489**; full application suite **4602** (3 local-clone-only Meals findings, see §7.1; 4603 in CI).

**Fresh clone:** the CI run *is* a fresh checkout (`fetch-depth: 0`, `npm ci`, Node 22), so it supplies the fresh-clone evidence the local worktree cannot. Documents added after `098cdaa` (this ledger) change no code and are covered by the lane's `docs/premium/` ownership.

## 9. Remaining release gates (precise)

| # | Gate | Owner | Blocks |
|---|---|---|---|
| 1 | **Authorize the Staging deployment** in `PREMIUM_STAGE1_STAGING_PLAN.md` (two migrations, five functions, secrets, a Sandbox webhook) and run it | owner | `STAGING_VERIFIED`, Sandbox |
| 2 | RevenueCat Sandbox purchase, restore, transfer, cancel, expire on a Staging build | owner + a build approval | purchase certification |
| 3 | Device pass on iPhone **and** Android (paywall return, verification delay, restore, sign-out/in, offline, small screens) | owner + a build approval | `DEVICE_VERIFIED` |
| 4 | Live Smart Inbox evaluation on the corpus with a real key, and review of the labels by a person | owner (spend) | Smart Inbox PASS |
| 5 | Owner decisions: OD-P1-01..08 (A0 §12), **OD-P1-09** Momentum thresholds (5 events / 3 days / 28-day lookback are judgements), **OD-P1-10..13** (Co-Parent entitlement + deletion default, Village host-confirmation and silent revocation, Village reminder notification category, receipt scanning provider) | owner | the affected operation only |
| 6 | Final Free Smart Inbox allowance and Premium fair-use numbers (shipped: Free **0**, `proposed_not_approved`; Premium limits `controlled_test`) | owner | any customer-facing number |
| 7 | Confirm the **account-deletion lifecycle** deletes `premium_decisions` (and, later, the Village and Co-Parent tables) — owned by another engineer, not modified here | account-deletion owner | launch |
| 8 | Notification-category approval before any Village reminder | notification owner | Village build |
| 9 | Production deployment, subscription activation, store submission, pricing | owner | public sales |

## 10. Rollback

Disable, don't drop (`PREMIUM_STAGE1_OPERATIONS.md` §1, §6): global switch, per-feature `enabled`/`kill_switch`, `webhook_processing=false`. Edge Functions are stateless and redeployable to the previous version. The migrations are additive; the drop path is valid **only while the tables are empty**. Never delete `premium_events` or `premium_decisions`.
