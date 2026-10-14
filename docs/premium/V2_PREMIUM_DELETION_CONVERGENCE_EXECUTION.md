# Her Keys V2 Premium + Deletion Convergence — Execution Ledger
Date: 2026-10-14
Authority: manager-created integration branch `integration/v2-premium-deletion-convergence`
Starting commit: `e4462d2a5cb42706a8523f6ba45248ee9396d02e` (Premium).
Deletion branch: `codex/account-deletion` (diverged; do NOT fast-forward or overwrite).
This is a release checklist, not certification evidence.

## Completed live manager operations
- Both additive Premium migrations applied to Supabase Staging `fhhudicklmpofuzkxeqe` and Production `npykvnxnehlsdlbumzwk`. Staging and Production RLS audit: 0 unsecured Premium base tables, 0 anon table privileges, 0 unauthorized INSERT/UPDATE/DELETE grants.
- Runtime identity pinned: staging / production. No test fixtures in either. Staging Premium core enabled but no paid features released and webhook processor disabled until credentials verified. Production Premium core disabled and webhook processor disabled.
- Account-deletion control remains `enabled=false,dry_run=true` on both.
- RevenueCat Play Store app `app3311d4868e` package corrected in place from `com.herkeys.app` to `com.heykeys.app`; read-back verified. iOS app `com.herkeys.app` unchanged.
- RevenueCat only has Test Store products; webhook integration missing. No paid product, price, entitlement, or offering mutations.

## Required source fixes before a unified release
1. **P0/P1 privacy:** Premigrations are present in both DBs, while deletion worker/resource registry predates Premium. Update erasure and terminal verification for all Premium tables. `premium_events` keeps provider `app_user_id`, `original_app_user_id`, aliases, `transferred_from`, `transferred_to` after account FK is nulled; null FK is NOT anonymization. Design targeted privacy-safe scrubbing without destroying other subscribers' evidence or reconciliation. Confirm retention policy and test shared subscriber transfer. Add concurrency and failure-injection deletion tests. Keep Production deletion OFF.
2. **CI:** isolate six Expo patch-version drifts on a dedicated branch (expo, expo-auth-session, expo-constants, expo-linking, expo-notifications, expo-router), keep package lock parity, run full npm/tsc/native identity guard and CI on repair SHA; no unrelated SDK upgrades.
3. **Integration:** compare and selectively integrate `codex/account-deletion` into this branch, preserve Premium providers, `app/_layout.tsx`, sign-in, settings/AccountPanel and RestorePurchasesControl exactly once, JWT/account switching, paywall and consent. Check Welcome Tree earlier branch functions exist; no blind merges.
4. **Backend deployment:** deploy FIVE Premium Edge Functions (revenuecat-webhook, premium-gate, premium-reconcile, premium-ops, smart-inbox-extract) to STAGING with complete internal dependencies and pinned `verify_jwt` contracts. Provision dedicated secrets out-of-band; no secrets in repo/chat. Verify HTTP 401/405 and negative auth, JWT, consent, replay, quota, and ownership. Do not wire a Production webhook until sandbox end-to-end verified.
5. **RevenueCat:** configure Sandbox webhook with verification/HMAC, secret API key and exact UUID mapping. Configure native store SKUs and offerings after store-side identity/product validation. Existing offering currently points to Test Store products; do not represent it as native purchase-ready. iOS App Store Connect API key remains unconfigured.
6. **Feature release:** Daily Load, Smart Inbox, Momentum must each be navigable, fully wired, read/write server-authorized, and tested by signed-in actual subscriber account on a device. Smart Inbox LIVE provider correctness eval is NOT_RUN (43 cases were authored scripts, not model results). Village and Co-Parent Plus are DESIGN CONTRACTS ONLY and shall not be marked released/on until actual backend+frontend+sharing and privacy+deletion tests are built.
7. **Owner/cost limits:** controlled test quotas and Free allowance (currently zero) are not approved sale limits. Activation should only affect authorized Staging tester accounts until paid catalog and product copy approved.

## Integration and user-facing acceptance matrix
A. New signup with Google, Apple on iOS, email, mandatory consent, early paywall, existing subscriber returning/restore, forgot-password email, Android hardware back, no duplicate Restore control.
B. Free vs Premium: Free Today/Talk It Out/calendars/manual tasks unchanged; Free direct call to protected endpoints denied; no cross-household or cross-account leakage.
C. Daily Load: overload detected -> user-friendly explanation -> inspect proposal -> explicit approval -> canonical persisted task reschedule -> restart/resync -> authorized undo, conflict-aware undo refusal, check capacity and observations.
D. Smart Inbox: real captured typed/pasted text -> trusted data exclusion + AI consent -> live model extract -> presented evidence-backed candidate -> user correction -> approve -> persisted canonical item -> no duplicated items; ambiguous time/date, hallucination, duplicates, retries/quotas, offline, refusal tested.
E. Momentum: empty/insufficient history -> honest no-review; enough history -> report exactly from household observations; no fabricated time saved; no false achievement; saved report durable and readable after expiry; undos/dedup and account switch.
F. Village: invitation/accept/revoke/complete with separate free helper account, RLS isolation, opt-in fields, abuse controls, deletion semantics. NOT IMPLEMENTED; FAIL until built.
G. Co-Parent Plus: separate account/household, explicit bounded shares, schedule exceptions, reimbursements, records chronology/export, dispute, receipt privacy, deletion semantics. NOT IMPLEMENTED; FAIL until built.
H. Account deletion: immediate deactivation, 30-day restoration, independent adults preserved, revoke provider credentials, RevenueCat customer cleanup, all new Premium rows removed or anonymized safely; 365-day minimal proof only. Production worker stays OFF.
I. Native: iPhone + Android fresh/reinstall/existing-account, purchase/restore/cancel/transfer/expired/grace, account switching/offline/small screen; store product IDs verified by platform.

## Status
- Schema installed Staging and Production: PASS.
- RLS coarse assertions: PASS.
- RevenueCat Android app package correction: PASS.
- Premium Edge Staging deployment: NOT RUN.
- Premium feature release & live model: NOT RUN.
- Actual device and user journey: NOT RUN.
- Unified integration code: NOT MERGED.
- Public paid launch: BLOCKED.
- Production auto deletion: OFF.

---

## Backend deployment & safeguards — 2026-10-14 recorded update

**Hosted evidence:** [PREMIUM_STAGE1_STAGING_EVIDENCE_20261014.md](PREMIUM_STAGE1_STAGING_EVIDENCE_20261014.md), plus addendum to `PREMIUM_STAGE1_LEDGER.md`. Does not change previously recorded source-level pass/fail results.

- `STAGING_PREMIUM_EDGE_FUNCTIONS=PASS`: all five Staging functions ACTIVE v1, JWT on for `premium-gate`, `premium-reconcile`, `smart-inbox-extract`; JWT off and custom authentication in `revenuecat-webhook`, `premium-ops`. Exact imported-file closure and deployed SHA-256 recorded in evidence.
- `STAGING_PUBLIC_AUTH_NEGATIVE_GET=PASS`: 401/401/401/405/405 (HTTP requests 340–344). `STAGING_UNCONFIGURED_WEBHOOK_AND_OPS=BLOCKED`: the custom-authenticated endpoints return `503 not_configured` on both missing and invalid credentials (POST 346–349). This is a **fail-closed** response, not passing 401 after valid credentials.
- `STAGING_RLS_RPC_SECURITY=PASS`: 11 RLS-forced tables, zero anonymous grants, four allowed authenticated RPCs, no fixture helper.
- `PRODUCTION_PREMIUM_SECURITY=PASS` (read-only): 11 RLS-forced tables, zero anonymous grants, four authenticated RPCs, zero test fixtures, explicit structural CHECK; Premium and webhook OFF, deletion OFF.
- `REVENUECAT_SANDBOX_WEBHOOK=BLOCKED`: dashboard must configure Authorization header and HMAC, and Staging Edge secrets must be set first. No insecure webhook registration was attempted.
- `BACKEND_EVENT_MATRIX=BLOCKED`, `REAL_JWT_AUTH_MATRIX=BLOCKED`, `HOSTED_QUOTAS=NOT_RUN`, `OPERATIONS_REHEARSAL=BLOCKED`, `LIVE_SMART_INBOX_EVAL=NOT_RUN`.
- `DELETION_PRIVACY_SIGNOFF=BLOCKED`: explicit deletion-owner issue [#9](https://github.com/herkeys/her-keys/issues/9). No deletion lifecycle source touched.
- `PREMIUM_USER_FACING_INTEGRATION=NOT_RUN`: client integration and devices are the build/platform owner scopes; no premature Village or Co-Parent Plus release.

**Next:** Owner sets Staging Edge secrets and RC Sandbox webhook credentials through dashboards, provider and platform owners furnish two authorized Staging test sessions. Backend agent then re-runs real security/receipt/quota/ops matrices and requests deletion-owner signoff. Production remains OFF.

---

## Pass A — Checkpoint 1 source authority, 2026-10-14

**Status: awaiting owner confirmation; original Agent G review reconciliation BLOCKED.** Authority: current build/integration request §§17.1–17.16. Checkpoints 1, 3 and 4 are hard stops. Pass B is excluded: no Village/Co-Parent screens, mocks, routes, state or release-flag changes.

Exact source under inspection / ENTRY SHA: `1a0d25e25b8ac0587b448eda392c7a12e6c682c0`. Audit branch `codex/v2-premium-pass-a`, isolated worktree `C:\Users\jsmit\.codex\worktrees\v2-premium-pass-a\Her Keys`. No application, dependency, backend, native config or worker change at this checkpoint. Audit evidence is attached to the documentation commit containing this appendix; no integration EXIT SHA exists yet.

Evidence artifact: [HK_V2_PREMIUM_CHECKPOINT_1_SOURCE_AUTHORITY.md](../audits/HK_V2_PREMIUM_CHECKPOINT_1_SOURCE_AUTHORITY.md). Raw evidence: `docs/audits/v2-premium-pass-a-checkpoint1/`. All statements below refer to local source inspection or GitHub metadata unless expressly attributed to the prior backend's Staging report. No hosted test rerun or Production mutation in this pass.

| Source observation | Result | Exact producer | Environment |
|---|---|---|---|
| Fetched convergence tip | `1a0d25e25b8ac0587b448eda392c7a12e6c682c0` | git fetch --all --prune; git for-each-ref (full command in artifact) | local Git / remote fetch |
| Premium tip included | `e4462d2a5cb42706a8523f6ba45248ee9396d02e` | git log; git merge-base | local |
| Deletion advanced / absent from candidate | `4aefa5f20adc38fc867e5a354f1faf279fab65a0`; 12 exclusive commits | git log candidate..deletion; git rev-list --left-right --count | local |
| Common base and divergence | `ad72ccd5b517a83bde5e7bbf3bf658193a667b82`; 39 / 12 | git merge-base origin/integration/v2-premium-deletion-convergence origin/codex/account-deletion | local |
| Welcome / shared / iOS / Android source | included ancestors; source audit preserves repairs | git rev-list and shared/iOS/Android docs listed in artifact | local |
| Collision preview | 6 textual conflicts; 16 shared paths; no merge applied | git merge-tree --write-tree origin/integration/v2-premium-deletion-convergence origin/codex/account-deletion; two git diff path-set intersection | local |
| Focused authentication audit | SOURCE_VALIDATED: 313/313, 0 failed/0 skipped; install exit 0 | exact 17-file node --test command in artifact; auth-source-tests.txt; npm ci --no-audit --no-fund | local, Node 24.14.0 / npm 11.9.0 |
| Premium latest exact-SHA CI | FAIL, run 38602756957, `e4462d2`; one job v2-repository-validation FAIL | gh run view 38602756957 --repo herkeys/her-keys --json name,headSha,url,conclusion,jobs; --log-failed | GitHub runner / local metadata read |
| Deletion latest exact-SHA CI | PASS, run 38582944095, `4aefa5f`; one job validate PASS | gh run view 38582944095 --repo herkeys/her-keys --json name,headSha,url,conclusion,jobs | GitHub runner / local metadata read |
| Convergence exact-SHA CI | NOT RUN; branch has no run and is absent from push trigger; workflow_dispatch available | gh run list --repo herkeys/her-keys --branch integration/v2-premium-deletion-convergence --limit 10 --json databaseId,workflowName,headSha,status,conclusion,url; workflow read | local / GitHub |

Conflicts: `.gitattributes`, `app/_layout.tsx`, `app/sign-in.tsx`, `supabase/config.toml`, `supabase/tests/migration-chain.mjs`, `tests/migrationChain.test.mjs`. Auto-merged overlaps still require semantic review: AccountPanel, Apple provider/nonce tests/stubs, boundary scanner/tests, notification architecture and tsconfig. Root must preserve Premium provider + ReaderBridge while adding DeletionGate; Account screen must retain the shared restore hook with one rendered entry and hold delete/sign-out/done. Candidate iOS Light/splash override is absent on deletion tip; do not overwrite config from that branch. Existing workstream identities and all unrelated local changes are preserved (full worktree inventory in artifact).

### Authentication status before code changes (§17.3)

“works” below means source behavior exercised by existing tests; hosted/device results for every row remain BLOCKED or NOT RUN. Producer: exact node --test command and raw auth-source-tests.txt named above; local source at `1a0d25e`.

| Flow | Status | Evidence | Owner if broken / hosted blocked |
|---|---|---|---|
| Google Sign-In (iOS) | works (source) | googleAuthParity + Welcome tests; PKCE adapter | platform/auth, #12 |
| Google Sign-In (Android) | works (source) | parity + Welcome platform method tests | platform/auth, #12 |
| Sign in with Apple | works (source) | tests/ios/appleNonce.test.mjs + Welcome shell | iOS/auth, #12 |
| Email sign-up | works (source) | emailPassword/emailOtp/provider + Welcome tests | auth/mail, #12 |
| Email verification | works (source contract) | emailOtpProvider; confirmation-required without session cannot bind | auth/mail, #12 |
| Forgot password email | works (source request/recovery) | passwordRecovery.test.mjs; isolated recovery client; real delivery NOT RUN | auth/mail, #12 |
| Existing-account return | works (source) | accountRuntime, routeAccess, accountAccess | integration #10 / platform #12 |
| Restore Purchases | works (source SDK/control) | restoreIdentity, restoreControl, persistentRestore; server/native outcome unverified | integration #10 / RevenueCat #12 |
| Deletion / restoration entry | missing from candidate; present on deletion branch | git show at `4aefa5f`: AccountPanel/onPrivacy, DeleteAccountPanel, DeletionGate, deletionRuntimeInstance | integration #10 / deletion #9 |

AI Data Processing wording and Terms/Privacy links are present. Root mandatory-consent wrapper depends on a build flag; all EAS profiles set true. Fail-closed behavior for unset/false configurations and all purchase entry points requires review after this hard stop. This is not recorded as a demonstrated configured-build P0. Premium provider resets its controller in an effect; pending intent lives above account provider. Checkpoint 2 must test immediate render, same-account return, async switch, lifecycle restrictions, and restore/server freshness. No auth rebuild is authorized.

### Agent G findings reconciliation

Original review **unavailable**: local repository/worktrees/attachments search found only the request; management chat reader returned opaque content references. Owner question asks for review path/text. The following covers the six findings named in §17.7 and corresponding existing manager ledger entries; it is provisional and cannot certify the original review has no additional findings. Source producer: git/rg/Get-Content inspections named in Checkpoint 1 artifact; local. Prior hosted findings retain the original backend report's evidence level and HTTP/query producers, not a fresh hosted PASS.

| Finding | Current status / disposition | Owner / issue | Evidence producer / environment |
|---|---|---|---|
| Premium/deletion divergence | confirmed; selective integration scheduled after owner confirmation | integration agent, [#10](https://github.com/herkeys/her-keys/issues/10) | merge-base/rev-list/merge-tree, local |
| Premium deletion privacy gap | open P0 carry-forward; premium_events retains provider subject IDs after null FK; worker/registry lacks signed-off Premium coverage | deletion lifecycle owner, [existing #9](https://github.com/herkeys/her-keys/issues/9) | issue #9 body; migration premium_events and deletion registry git-show, local; no new destructive reproduction |
| RevenueCat catalog findings | native purchase certification BLOCKED; manager reported Test Store only, Android corrected in place; no current dashboard certification in this pass | RevenueCat/platform, [#12](https://github.com/herkeys/her-keys/issues/12) | convergence ledger / Staging report; local document reconciliation, not fresh provider read-back |
| Expo drift | confirmed CI FAIL; six precise patch targets, transitive worklets warning to inspect; repair authorized but gated after CP1 | integration agent, [#10](https://github.com/herkeys/her-keys/issues/10) | run 38602756957 failed-step logs; npm ci; GitHub/local |
| Smart Inbox residual risk | live accuracy unmeasured; authored 43-case corpus not accuracy proof; invented plausible time still requires user review; hosted readiness blocked | backend owner, [#11](https://github.com/herkeys/her-keys/issues/11); client risk review #10 | Stage1 ledger §4/§7, handler/mapper/coordinator inspection; local |
| Momentum scope limits | foundation only; 7 logical days, 5 things/3 days threshold, 28-day pattern lookback; no time-saved/performance/longitudinal claim; real household report NOT RUN | integration source verification #10; hosted owner #11 | PREMIUM_MOMENTUM_FOUNDATION.md / domain modules, local |
| Original-review completeness | BLOCKED; obtain actual Agent G review before CP1 closure | owner supplies review; #10 | rg search + read_thread output limitation, local |

### Open backend handoffs

Typed contract deliverable: [PREMIUM_BACKEND_HANDOFF_REQUIRED.md](PREMIUM_BACKEND_HANDOFF_REQUIRED.md). Proposed schemas/signatures are explicitly unimplemented and pending backend confirmation. Village/Co-Parent remain BLOCKED; no UI scaffolding.

| Issue | Assigned GitHub account / responsible role | Response / gate |
|---|---|---|
| [#11 Village / Co-Parent / hosted readiness](https://github.com/herkeys/her-keys/issues/11) | herkeys; Premium backend owner routing | unanswered; BLOCKED |
| [#12 native catalog / auth / Sandbox / platform](https://github.com/herkeys/her-keys/issues/12) | herkeys; platform/RevenueCat/auth owners routing | unanswered; BLOCKED |
| [#9 existing deletion/privacy](https://github.com/herkeys/her-keys/issues/9) | herkeys; deletion lifecycle owner routing | unanswered; open P0; BLOCKED |
| [#10 mobile/Expo/review checkpoint](https://github.com/herkeys/her-keys/issues/10) | herkeys; this integration agent | owner CP1 confirmation pending |

Producer: connected GitHub Her Keys create_issue/add_issue_assignees/add_issue_labels; verified by gh issue list JSON in handoff-issues.json; environment GitHub metadata/local. Required label premium-backend-handoff exists on #9/#11/#12. Only herkeys was returned as an assignable repo user; distinct agent logins are unknown. Assignment routes work to named roles and is not proof an agent responded. Initial CLI kscanaiapp permissions were read-only; partial issue #10 was retained and correctly assigned through the Her Keys connector, no duplicate.

### CI failure detail and checkpoint boundary

Workflow **Her Keys V2 Integration Gate** [run 38602756957](https://github.com/herkeys/her-keys/actions/runs/38602756957), head `e4462d2a5cb42706a8523f6ba45248ee9396d02e`, job `v2-repository-validation=FAIL`. Full suite 4603/4603 with no skips, boundary 5/5, identity/typecheck/config successful. `Expo install compatibility` and `Expo Doctor` fail: expo expected ~57.0.29, auth-session ~57.0.16, constants ~57.0.22, linking ~57.0.13, notifications ~57.0.23, router ~57.0.27. Evidence boundary skipped. No suppression or code/lockfile edit made.

Workflow **Account deletion source validation** [run 38582944095](https://github.com/herkeys/her-keys/actions/runs/38582944095), head `4aefa5f20adc38fc867e5a354f1faf279fab65a0`, job `validate=PASS`, all steps success. This earlier run certifies deletion source only, not convergence or native/hosted Premium.

Expo v57 docs read before source work: [versioned SDK reference](https://docs.expo.dev/versions/v57.0.0/), producer web open, 2026-10-14. No build or native generation. Production/Staging switches, RevenueCat catalog/prices, deletion worker/resource registry and provider secrets were not changed.

Next authorized action after the original-review requirement is satisfied and owner confirms Checkpoint 1: refetch/recompare, selectively integrate client/shared code, then minimal SDK/lock repair and full exact-SHA CI to Checkpoint 3. No feature certification begins until CP3 green or a documented owner exception. Checkpoint 4 also requires confirmation. Final hostile/user-journey/repair-release documents will be completed at their authorized phases; this checkpoint artifact does not substitute for those reports or a release verdict.

### Owner acceptance and superseding documentation waiver — 2026-10-14

Owner accepted the Checkpoint 1 source authority, authentication baseline, collisions and CI evidence. The owner subsequently instructed: "skip that and continue with the integration. That is the most important part. We need to remove the blockers and integration" in response to the missing reconstructed-reference file. This explicitly waives the outstanding original/reconstructed Agent G document prerequisite and authorizes Checkpoint 2 immediately. The six provisional evidence-based finding rows above remain accurate carry-forward records; no original review is claimed to have been recovered or supplied. Checkpoint 1 closes on inspected source `1a0d25e25b8ac0587b448eda392c7a12e6c682c0` and evidence commit `880a02ca7dcd838066e8db29631800b715dd7c57` under that waiver. Producer: direct owner messages in this chat; environment management instruction, not runtime evidence. Refetch shows candidate and deletion tips unchanged. Checkpoint 3 remains a hard stop; no Production activation, worker/authorization-SQL edits, builds, or Pass B.

## Checkpoint 2 — Shared integration, 2026-10-14

Reviewed merge source: `7eb6592348422dd54e6b3b5d3377c03b75694078`, parents include deletion `4aefa5f20adc38fc867e5a354f1faf279fab65a0` and the authorized Pass A evidence line. Integration guard/input follow-up: `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17`. All six textual conflicts resolved; backend authorization SQL and deletion worker/registry imported unchanged. `app.json`/`eas.json` have zero diff from entry, retaining iOS Light/nonce/keyboard and Android identity/button corrections.

Client scope: DeletionGate composes with AccountProvider, actor-bound PremiumIntentProvider, PremiumStateProvider and ReaderBridge. Settings reaches Privacy & Data, with one reusable restore control; onboarding routes to Account for restore. Every bound account is wrapped by mandatory consent. Actor/household-keyed consumer state and immediate SDK identity generation prevent first-frame/stale results; old ledger/authorization/extraction/canonical commit/purchase callbacks are fenced by live account and deletion lifecycle. Restored account tests require fresh server projection despite SDK paid hints. Existing saved-data reads do not require an active subscription.

**Confirmed P0-INT-01 and repair:** first frame after A→B exposed A's Premium server snapshot and retained open consumer state, including shared-household switches. Reported immediately to owner. Repair/source reproduction is in [hostile interim report](../audits/HK_V2_PREMIUM_HOSTILE_FEATURE_CERTIFICATION.md); now SOURCE_VALIDATED PASS at `7eb6592`, hosted/device regression BLOCKED. Stale RevenueCat paid display (P1-INT-02) was also reproduced and repaired. Existing permanent-deletion/privacy P0 #9 remains open.

| Evidence / obligation | Status | Producer | Environment / exact source |
|---|---|---|---|
| Client integration: switch, restore, lifecycle, consent, Settings and saved reads | SOURCE_VALIDATED PASS: 137/137, no skips | exact 10-file node --test command in user-journey report; client-integration-7eb6592.txt | local, `7eb6592348422dd54e6b3b5d3377c03b75694078` |
| Strict consent/keyboard/contract/boundary/Premium namespace guards | SOURCE_VALIDATED PASS: 77/77, no skips | 5-file node --test command in user-journey report; guard-repairs-420365a.txt | local, `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17` |
| Combined deletion SQL cleanup/terminal verification | FAIL: unclassified_resource / terminal_verification_failed; 8 counted test failures in 66-test developing run | node --test accountDeletion + migrationChain + restore-control command; deletion-unclassified-resource.txt | local PGlite, unified working tree; no hosted purge |
| Developing full suite | FAIL: 4655 tests / 4642 pass / 13 failed / 0 skipped; later client/guard fixes recorded separately | npm test; development-full-suite-summary.txt | local during working-tree repairs; not exact-SHA certification |
| Native / backend source preservation | PASS for byte comparison only | git diff commands in engineering repair ledger; no output | local at `420365a`; not native build or hosted evidence |

Guard changes were contract corrections, not suppression: mandatory consent assertion is stronger; enum parsing is CRLF-safe but retains exact sets; deletion-only provider mentions are three explicit files forbidden from reading entitlement; boundary import is one reviewed immutable Premium SHA and rejects future/other tips; all resource-deletion tests remain failing. Timing tolerance in the existing calendar growth test remains unchanged.

Source/client obligations are integrated. **Unified account-deletion certification and complete mandatory CI remain FAIL/BLOCKED on #9**, which was updated with the unified-chain reproduction. Checkpoint 2 is not a hosted feature PASS or release approval. Proceeding to the authorized Checkpoint 3 SDK/CI repair only; feature work remains gated.

### Agent G findings reconciliation — post-integration update

Owner waived creation of the unavailable reconstructed reference; these six evidence-based rows supersede only current dispositions, preserving the earlier audit history.

| Finding | Responsible owner / issue | Evidence level and status | Exact evidence producer / environment | Next required action |
|---|---|---|---|---|
| Premium/deletion branch divergence | integration agent, [#10](https://github.com/herkeys/her-keys/issues/10) | SOURCE_VALIDATED client merge PASS; complete lifecycle BLOCKED | git merge reviewed six conflicts; 137 client tests at `7eb6592`, local | complete SDK/full exact-SHA CI; owner #9 closes shared backend blocker |
| Account deletion privacy gap | deletion lifecycle owner, [#9](https://github.com/herkeys/her-keys/issues/9) | SOURCE_VALIDATED FAIL/BLOCKED; open P0; hosted sign-off absent | existing accountDeletion SQL tests with combined chain, P0001 unclassified_resource and terminal_verification_failed, local PGlite | classify every Premium table, scrub provider IDs safely and prove terminal erasure/other-user preservation at exact SHA and Staging |
| RevenueCat identity, catalog and webhook readiness | client integration #10; platform [#12](https://github.com/herkeys/her-keys/issues/12); backend [#11](https://github.com/herkeys/her-keys/issues/11) | client SOURCE_VALIDATED PASS; native catalog/webhook BLOCKED | restoreIdentity/clientProvider tests; prior backend Staging report 503 not_configured, source/local and attributed prior Staging evidence | configure/read back approved Sandbox readiness, real A/B UUID mapping/purchase/restore/TRANSFER; no catalog/price activation here |
| Expo SDK 57 dependency drift | integration agent, #10 | SDK SOURCE_VALIDATED PASS; mandatory jobs FAIL only on deletion #9 | exact 0f27acf runs 38626302663 / 38626302655; compatibility/Doctor/TypeScript/identity/Deno pass, 4655 tests/4647 pass/8 deletion failures/0 skips | deletion owner closes #9, rerun both mandatory workflows at owner-integrated exact SHA; CP3 hard stop persists |
| Smart Inbox residual accuracy / hallucination risk | backend owner #11; later source lane integration #10 | live accuracy NOT RUN; source pipeline limitations carried | Stage1 ledger §4 and typed/pasted capture review source, local inspection | approved live Gemini/model evaluation plus review/correction/consent/persistence hostile tests after CP3; never infer accuracy from authored corpus |
| Momentum scope / unsupported claims | integration source lane #10; hosted backend #11 | foundation only; full feature certification BLOCKED at CP3 | Momentum foundation and existing exact-source UI tests for saved-data reads, local | later verify seven-day logical window/dedup/undo/minimum evidence and prohibited claims; no hours-saved, performance or longitudinal assertion |

Reports: [engineering repair ledger](../audits/HK_V2_PREMIUM_ENGINEERING_REPAIR_LEDGER.md), [interim hostile findings](../audits/HK_V2_PREMIUM_HOSTILE_FEATURE_CERTIFICATION.md), [source journeys](../audits/HK_V2_PREMIUM_USER_JOURNEY_CERTIFICATION.md). #11/#12 remain unanswered; our #9 reproduction comment is not deletion-owner sign-off. Village and Co-Parent Plus remain BLOCKED and unimplemented in Pass A.

## Checkpoint 3 — exact-source CI hard stop, 2026-10-14

Final application/workflow source `0f27acfa44874e4d15b20888af23952a8d205fbf`. SDK patch source `bbe7f209e3f731d81717d76ce24bafe3f5c8835e`. [Integration run 38626302663](https://github.com/herkeys/her-keys/actions/runs/38626302663) and [deletion run 38626302655](https://github.com/herkeys/her-keys/actions/runs/38626302655) both FAIL: 4655 tests, 4647 pass, 8 counted deletion failures, 0 skipped. All mandatory install/boundary/identity/TypeScript/Expo compatibility/Doctor/config/Deno steps applicable to each job executed and passed. Eight failures comprise six real SQL cases plus two failed parents; every remaining failure belongs to open P0 #9. No CI exception is approved.

Dependency graph: six SDK 57 patch roots plus exact SDK-native Reanimated 4.5.1 / Worklets 0.10.1 pins; transitive native core is one root-resolvable copy, no direct core dependency or validation exclusion. Calendar's no-gesture source guard remains; its package guard now verifies those SDK peers and still rejects every Calendar-specific dependency. Exact commands, all 28 changed lock paths and complete job/step evidence are in [Checkpoint 3 Expo/CI](../audits/HK_V2_PREMIUM_CHECKPOINT_3_EXPO_CI.md).

Client integration and this lane's SDK/CI repairs are committed and reviewable in [draft PR #13](https://github.com/herkeys/her-keys/pull/13). Unified deletion/release remains FAIL/BLOCKED. Required owner action: deletion lifecycle owner resolves #9 with canonical Premium-resource/provider-identifier coverage, then integrate reviewed owner source and rerun both jobs at the resulting SHA. No worker/registry/backend authorization SQL edit was made here. No feature work, Production activation, Staging activation, EAS build or Pass B began. This checkpoint is a hard stop; continuation requires exact-SHA green or an explicit documented management exception.


## Checkpoint 3 parent failure attribution — 2026-10-14

**Source producer:** read-only inspection of `docs/audits/v2-premium-pass-a-checkpoint3/ci-0f27acf-failures.txt`, `ci-0f27acf-test-summary.txt`, `tests/accountDeletion/database.test.mjs`, and `tests/accountDeletion/mutations.test.mjs` on `codex/v2-premium-pass-a`. **Environment:** GitHub Actions Node 22 and Node 24, exact application/workflow source `0f27acfa44874e4d15b20888af23952a8d205fbf`; full suite: 4,655 tests, 4,647 pass, 8 fail, 0 skipped. Both workflows remain FAIL (38626302663, 38626302655).

| Parent name and producer path | Exact failed parent condition | Attribution | Underlying failures |
|---|---|---|---|
| `account deletion: real SQL state, privileges, recovery and purge` — `tests/accountDeletion/database.test.mjs:7` | Implicit `node:test` parent condition that **all child `t.test` subtests pass**; not a separate authored `assert.*`. Child `complete database cleanup preserves the other account` at line 103 aborts on `await cmd('database_cleanup',...)` at line 104 with SQLSTATE P0001 `unclassified_resource`; child `purged requires Auth absence and independent resource evidence` at line 108 aborts on `await cmd('finish',...)` at line 112 with `terminal_verification_failed`. | **AGGREGATOR**, not an independently failing client integration assertion. Its two child failures are counted individually, and `node:test` counts the failed parent. | Database SQL failures 1–2 of 6, issue [#9](https://github.com/herkeys/her-keys/issues/9). |
| `critical lifecycle negative controls detect unsafe guard mutations` — `tests/accountDeletion/mutations.test.mjs:5` | Implicit `node:test` parent condition that **all child `t.test` subtests pass**; not a separate authored `assert.*`. Child `approved shared policy deletes private records, restricts ambiguous records and preserves the other adult` at line 39 aborts during `await cmd('database_cleanup',...)` at line 53 with SQLSTATE P0001 `unclassified_resource`. | **AGGREGATOR**, not an independent client integration regression. | Database SQL failure 3 of 6, issue [#9](https://github.com/herkeys/her-keys/issues/9). |

The other three actual SQL failures are `tests/accountDeletion/resourceCoverage.test.mjs:69`: `all 43 registered resources` scenarios `shared`, `former_member`, and `single`, each aborting at `await cmd('database_cleanup',args)` (line 114) with P0001 `unclassified_resource`. **Total: six failing child/source SQL tests plus two failed `node:test` parents = eight counted failures**. The parent failure condition is an inference verified against the parent/child declarations and the six logged exceptions; the captured `--log-failed` excerpt is excerpted and does not itself contain a separate parent assertion message. No test source, deletion worker, registry or SQL was changed. The deletion owner must repair [#9](https://github.com/herkeys/her-keys/issues/9); no CI green or release PASS is claimed.


## Checkpoint 3 authentication status table (§17.3) — reaffirmed 2026-10-14

**Source producer:** `docs/audits/v2-premium-pass-a-checkpoint1/auth-source-tests.txt`, `docs/audits/HK_V2_PREMIUM_CHECKPOINT_1_SOURCE_AUTHORITY.md` where present, targeted auth tests at integration source `1a0d25e25b8ac0587b448eda392c7a12e6c682c0` and the Checkpoint 2 integration guards at `0f27acfa44874e4d15b20888af23952a8d205fbf`; environment **local SOURCE_VALIDATED** (313/313 focused tests passed at CP1). This table uses `works` for **source contract only**; none of its actual external/provider/device behaviors has a `STAGING_VERIFIED` or `DEVICE_VERIFIED` verdict. No auth code changes are authorized by or implied by this table.

| Flow | Status (source only) | Evidence and scope limitation | Owner if broken / live blocked |
|---|---|---|---|
| Google Sign-In (iOS) | works (source) | `tests/googleAuthParity.test.mjs`, Welcome session/PKCE guard; real native OAuth NOT RUN | Platform/auth; [#12](https://github.com/herkeys/her-keys/issues/12) |
| Google Sign-In (Android) | works (source) | Same `googleAuthParity`/Welcome tests; native redirect/token handoff NOT RUN | Platform/auth; #12 |
| Sign in with Apple (iOS) | works (source) | `tests/ios/appleNonce.test.mjs`, secure nonce/Welcome parity; native identity token exchange NOT RUN | iOS/auth; #12 |
| Email sign-up | works (source) | `tests/emailPassword.test.mjs`, `tests/emailOtpProvider.test.mjs`; confirmation/session reality NOT RUN | Auth/mail; #12 |
| Email verification | works (source contract) | `tests/emailOtp.test.mjs`, provider contract; mailbox/template/redirect NOT RUN | Auth/mail; #12 |
| Forgot password email | works (source) | `tests/passwordRecovery.test.mjs`, separate recovery session and update; message delivery + old password refusal NOT RUN | Auth/mail; #12 |
| Existing-account return | works (source) | `tests/accountRuntime.test.mjs`, `tests/routeAccess.test.mjs` and `tests/platformParity/accountAccess.test.mjs`; remote multi-device recovery NOT RUN | Build integration / platform; [#10](https://github.com/herkeys/her-keys/issues/10), #12 |
| Restore Purchases | works (source) | `tests/platformParity/restoreIdentity.test.mjs`, `restoreControl.test.mjs`, `persistentRestore.test.mjs`; real RC restore, purchase A/B and server reconciliation NOT RUN | Integration / RC platform; #10, #12 |
| Deletion / restoration entry | works (integrated source; not hosted) | On convergence baseline this was missing; now selectively integrated from deletion branch, AccountPanel/DeletionGate/restore single-mount guards in CP2; signed-in end-to-end NOT RUN | Build for client; deletion privacy [#9](https://github.com/herkeys/her-keys/issues/9) |

No OAuth, App Store, RevenueCat, email-delivery or device test was run for this table. The consent-gate missing/false configuration is pending hostile source examination, not proof of a bypass. Keep conditional `deletion_pending` and fresh server-entitlement confirmation as source test obligations; do not grant a hosted PASS.
