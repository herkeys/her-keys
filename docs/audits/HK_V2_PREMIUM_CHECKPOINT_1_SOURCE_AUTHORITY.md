# Her Keys V2 Premium — Checkpoint 1 source authority

Date: 2026-10-14 (America/New_York). Pass A only. Status: **awaiting owner confirmation; Agent G original-review reconciliation BLOCKED**. No integration, dependency repair, feature certification, hosted activation or native build has occurred in this checkpoint. Source under inspection: `1a0d25e25b8ac0587b448eda392c7a12e6c682c0`. Audit branch: `codex/v2-premium-pass-a`, isolated managed worktree `C:\Users\jsmit\.codex\worktrees\v2-premium-pass-a\Her Keys`.

The existing checkout at `C:\Users\jsmit\Her Keys` is `feature/welcome-tree-auth-frontend` at `69af50f9339f9449e6286cd7c18d8cbc59ca43db` with modified `.gitignore`, `package.json`, and untracked specification/deletion-plan/evaluation/tools files. Those files were not modified by this pass. Existing feature, deletion and platform worktrees are preserved; inventory is in `v2-premium-pass-a-checkpoint1/worktrees.txt`.

## Source heads and ancestry

Producer: `git fetch --all --prune`, `git for-each-ref --format='%(refname:short) %(objectname)' refs/remotes/origin`, `git merge-base`, `git rev-list --left-right --count`, `git log`; environment local Git with remote fetch. Raw head inventory: `v2-premium-pass-a-checkpoint1/remote-heads.txt`. Values are a fetched snapshot, not a promise that other owners stop work.

| Ref | Exact fetched SHA | Interpretation |
|---|---|---|
| integration/v2-premium-deletion-convergence | `1a0d25e25b8ac0587b448eda392c7a12e6c682c0` | authoritative starting candidate; Premium source plus four planning/hosted-evidence commits |
| feature/herkeys-premium-stage1 | `e4462d2a5cb42706a8523f6ba45248ee9396d02e` | ancestor of candidate, fully included |
| integration/build2-shared-consumer-repair | `c660e5927c934f7bd2c172df5fb691e2075d40ee` | Premium baseline; ancestor of candidate, shared/iOS/Android repairs included |
| codex/account-deletion | `4aefa5f20adc38fc867e5a354f1faf279fab65a0` | newer than prior fecc7e2; twelve exclusive commits absent from candidate |
| integration/welcome-tree-auth-runtime | `dc56531a5457307471cbf996e0c3051dcc757047` | ancestor of candidate; candidate 240 commits ahead, no exclusive Welcome commits |
| codex/build2b-shared-integration | `ad72ccd5b517a83bde5e7bbf3bf658193a667b82` | merge base of candidate/deletion; exclusive counts 39 / 12 |
| audit/ios-build2-candidate | `925a9b445b75a3f34a7bd9a102167c65f6895f4b` | ancestor of candidate; candidate 40 commits ahead |
| codex/build2b-android-candidate-audit | `308551bac7b609234dfe440a40bd1096720a08fe` | ancestor of candidate; candidate 42 commits ahead |
| feature/herkeys-email-password-20261008 | `f57aaeefcbdd74e5bb638f93de755d54082b177b` | existing open PR #8; actual auth/recovery source inspected in candidate |
| main | `bab9773226e3b81928af04d5a303596b16502710` | no main merge authorized |

Open PR producer: `gh pr list --repo herkeys/her-keys --state open --limit 100 --json number,title,headRefName,headRefOid,baseRefName,url,statusCheckRollup`; environment GitHub metadata read via local CLI; raw `open-prs.json`. [#8](https://github.com/herkeys/her-keys/pull/8) email/password, [#7](https://github.com/herkeys/her-keys/pull/7) V2 closeout, [#6](https://github.com/herkeys/her-keys/pull/6) Google PKCE. None targets this convergence candidate. Their historical check success does not certify this candidate; no PR changed or merged.

## Read and reconciled source records

All eight required `docs/premium/` documents were read. Architecture/operations/staging-plan original NOT RUN statements are historical; the October 14 staging-evidence report and append-only ledger addenda supersede deployment status only. Five Staging functions ACTIVE and negative 401/405 probes are prior backend evidence, not this pass's hosted test. Custom-auth POST 503 not_configured remains blocked; no signed provider or real-JWT entitlement evidence follows from it. Original architecture's null-FK/payload removal privacy description is insufficient given retained provider IDs; carry #9 open.

Also read Welcome integration, email/password, October 9 smoke handoff, shared consumer repair, iOS audit, relevant platform-parity/Android certification sections, deletion production handoff/registry/runtime at its exact remote SHA, workflows, migrations, Premium function closure/runtime and client composition. Older source reports claiming absence of reset/legal/restore or no gated Premium are superseded by actual current modules; device/live evidence remains separate. Prior smoke documents are instructions or historical evidence, not an authorization for this run to create Production users/builds.

The original **Agent G management review** was not present in repository/worktree documentation or text attachments (`rg -l -i 'Agent G|management review|Premium/deletion divergence'` found only this request). `read_thread` on the relevant management chats returned opaque content references for assistant reports. The October 14 backend execution results are available as the convergence/Stage 1 appendices and Staging evidence file; no separately named original execution report was found. Therefore original-review completeness is **BLOCKED**, not silently reconstructed from the six summary topics. Owner was asked for the original review path/text. Findings provisionally reconciled below and in the integration ledger.

## Integration collisions — preview only

Producer: `git merge-tree --write-tree origin/integration/v2-premium-deletion-convergence origin/codex/account-deletion`; environment local; exit 1 with six conflicts; raw `merge-preview.txt`. This creates Git tree objects only; no index/worktree merge or source edit. Producer for shared-path list: intersection of `git diff --name-only ad72ccd..origin/integration/v2-premium-deletion-convergence` and `git diff --name-only ad72ccd..origin/codex/account-deletion`; raw `overlapping-paths.txt`.

| Collision | Required preservation / proposed resolution |
|---|---|
| app/_layout.tsx (text conflict) | compose DeletionGate with AccountProvider, PremiumStateProvider and PremiumReaderBridge; lifecycle restriction must discard pending Premium; preserve consent/paywall placement and route authority |
| app/sign-in.tsx (text conflict) | keep shared useRestorePurchases single-flight hook; add DeleteAccountPanel/Privacy & Data; one restore entry; hold sign-out/delete/done while pending |
| .gitattributes (text conflict) | preserve both reviewed text/line-ending entries |
| supabase/config.toml (text conflict) | preserve both function JWT contracts; source composition only, no redeployment/configuration activation |
| supabase/tests/migration-chain.mjs (text conflict) | include both additive migration families in correct order; fixture/deletion guard contracts retained; backend-owned authorization SQL unchanged |
| tests/migrationChain.test.mjs (text conflict) | enforce combined chain and exclusions; no weakened count/privilege assertions |
| AccountPanel (auto-merge semantic overlap) | preserve corrected new-phone copy plus Privacy & Data and restore action state |
| appleProvider / Apple tests/stubs (auto-merge overlap) | retain secure per-attempt nonce and server credential capture; no duplicate nonce helpers or token diagnostics |
| meals-boundary-scan / boundary tests (auto-merge overlap) | retain both lanes and strict sibling guards; integration lane registration needs honest ownership accounting |
| localNotificationArchitecture / tsconfig (auto-merge overlap) | keep reviewed function inventory and test/module compatibility |
| package.json/lock (deletion-only change) | deletion adds PGlite test dependency; deliberate SDK patch repair later; no unrelated upgrades |

Six textual conflicts do not imply other files are safe. Candidate-only iOS light/keyboard and Android button repairs must survive integration. `git diff origin/integration/v2-premium-deletion-convergence origin/codex/account-deletion -- app.json eas.json` shows deletion lacks the candidate's iOS Light/splash overrides; do not replace candidate config with deletion's copy. Source identity remains Android `com.heykeys.app`, iOS `com.herkeys.app`, entitlement `her_keys_plus`, project `proj93809efe`, offering `default`.

## Authentication flow status (before any source code change)

Status vocabulary works/broken/missing refers to **current source only**; every live/device row remains BLOCKED or NOT RUN. Source producer: exact command in Evidence section, 313/313 tests, zero skipped, local at `1a0d25e`. It does not prove OAuth provider login, an email arriving, purchase, hosted persistence or native interaction.

| Flow | Source status | Evidence / limitation | Owner if broken or live-blocked |
|---|---|---|---|
| Google Sign-In iOS | works (source) | googleAuthParity, Welcome flow/shell; one Supabase PKCE adapter, system auth session; no live iOS attempt | platform/auth owner, #12 |
| Google Sign-In Android | works (source) | same parity/Welcome tests; no native Apple offered; historical Staging redirect mismatch needs fresh read-back | platform/auth owner, #12 |
| Sign in with Apple | works (source) | tests/ios/appleNonce.test.mjs, Welcome platform choice; native availability/nonces; no iPhone/token exchange run | iOS/auth owner, #12 |
| Email sign-up | works (source) | emailPassword/emailOtp/provider and Welcome tests; confirmation-required no-session cannot bind | auth/mail owner, #12 |
| Email verification | works (source contract) | emailOtpProvider, emailPassword; no fabricated confirmation session; actual mailbox/template callback unverified | auth/mail owner, #12 |
| Forgot password email | works (source request/verify/update) | passwordRecovery.test.mjs; separate ephemeral recovery session; request is enumeration-resistant; delivery/real old-password refusal NOT RUN | auth/mail owner, #12 |
| Existing-account return | works (source) | accountRuntime, routeAccess, accountAccess; restoration/adoption/quarantine; two-device hosted restore NOT RUN | integration agent for regression #10; platform #12 |
| Restore Purchases | works (source SDK guard/control) | restoreIdentity, restoreControl, persistentRestore; UUID guard and rapid-tap/unmount/drop tests; native offerings and server activation unverified | integration #10; RevenueCat/platform #12 |
| Deletion / restoration entry | missing in candidate; exists on deletion branch | candidate AccountPanel lacks onPrivacy/DeleteAccountPanel/DeletionGate; git-show deletion source has entry, receipt/status/recovery path | integrate client #10; deletion privacy sign-off #9 |

Consent copy is **AI Data Processing**. Legal links exist in account choice and ConsentFlow. Root consent wrapper is conditional on `EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE==='true'`; all four EAS profiles set true. Unset/false local configuration needs fail-closed review; do not label it a demonstrated configured-build consent bypass. `PremiumIntentProvider` lives above account composition; pending intents/open screens and first-render Premium state must be reviewed on switch. Restore copy says purchase restored from SDK, while server authority is separate: Checkpoint 2 must verify restored accounts wait for server and do not inherit stale entitlement.

## CI evidence

Producer: `gh run view <id> --repo herkeys/her-keys --json name,headSha,url,conclusion,jobs`, `--log-failed`, and filtered `--log` test summaries. Environment GitHub runner, retrieved read-only locally. Raw `premium-ci.json`, `deletion-ci.json`, `premium-ci-failed-steps.txt`, `premium-ci-test-summary.txt`.

| Workflow / exact head | Per-job result | Failure detail |
|---|---|---|
| [Her Keys V2 Integration Gate, run 38602756957](https://github.com/herkeys/her-keys/actions/runs/38602756957), `e4462d2a5cb42706a8523f6ba45248ee9396d02e` | v2-repository-validation FAIL; only mandatory job | Expo install compatibility exit 1 and Expo Doctor exit 1 (20/21); six one-patch mismatches. Full application 4603/4603, 0 skipped; boundary 5/5; release identity/tsc/public/native config pass; Evidence boundary skipped. Whole workflow FAIL |
| [Account deletion source validation, run 38582944095](https://github.com/herkeys/her-keys/actions/runs/38582944095), `4aefa5f20adc38fc867e5a354f1faf279fab65a0` | validate PASS; only mandatory job | all steps successful including npm/tsc/full suite/Expo/Deno. Run predates the failing Premium run and certifies deletion source only |
| convergence `1a0d25e25b8ac0587b448eda392c7a12e6c682c0` | NOT RUN | `gh run list --branch integration/v2-premium-deletion-convergence` returned []; push filter excludes this branch; workflow_dispatch exists. An authorized final exact-SHA workflow must run after integration/patch repair |

Reported minimal patch targets: expo 57.0.28→~57.0.29, expo-auth-session 57.0.15→~57.0.16, expo-constants 57.0.21→~57.0.22, expo-linking 57.0.12→~57.0.13, expo-notifications 57.0.22→~57.0.23, expo-router 57.0.26→~57.0.27. Re-evaluate exact compatible targets at Checkpoint 3. No dependency file changed. `npm ci --no-audit --no-fund` succeeded (585 packages), with optional expo-modules-core 57.0.22 / react-native-worklets 0.12.2 peer warning; inspect transitive graph in SDK repair.

Expo prerequisite producer: web open `https://docs.expo.dev/versions/v57.0.0/` (2026-10-14); versioned docs read before any source change. SDK 57 requires its targeted React Native/React and minimum Node; local Node 24.14.0/npm 11.9.0 is above the documented Node minimum. Reference: [Expo v57 SDK documentation](https://docs.expo.dev/versions/v57.0.0/).

## Local audit evidence and next gate

Exact producer, environment **local** at `1a0d25e`, result SOURCE_VALIDATED PASS (auth-focused audit only):

```powershell
npm ci --no-audit --no-fund
node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test tests/googleAuthParity.test.mjs tests/ios/appleNonce.test.mjs tests/emailPassword.test.mjs tests/emailOtp.test.mjs tests/emailOtpProvider.test.mjs tests/passwordRecovery.test.mjs tests/welcomeAuthFlow.test.mjs tests/welcomeAuthShell.test.mjs tests/welcomePremiumFlow.test.mjs tests/routeAccess.test.mjs tests/accountRuntime.test.mjs tests/platformParity/accountAccess.test.mjs tests/platformParity/restoreIdentity.test.mjs tests/platformParity/restoreControl.test.mjs tests/platformParity/persistentRestore.test.mjs tests/consent.test.mjs tests/consentRecovery.test.mjs
```

Raw test output `v2-premium-pass-a-checkpoint1/auth-source-tests.txt`: 313 tests, 56 suites, 313 pass, 0 fail/cancel/skip/todo. Captured text logs retain producer output with trailing whitespace/end-of-file blank lines normalized for repository whitespace checks. This is not the full-suite or hostile-feature certification. Source UI/module inspection plus these existing tests informs the flow table; no new auth implementation or tests were written. No hosted HTTP/database/device results were produced in this pass.

Handoffs: [#11 backend contracts/readiness](https://github.com/herkeys/her-keys/issues/11), [#12 platform/RevenueCat/auth](https://github.com/herkeys/her-keys/issues/12), [existing #9 deletion privacy](https://github.com/herkeys/her-keys/issues/9), [#10 integration/Expo/review](https://github.com/herkeys/her-keys/issues/10). `premium-backend-handoff` label created through Her Keys connector and applied to #9/#11/#12. All assigned to available repository maintainer `herkeys` for named owner-role routing; distinct agent GitHub usernames are unknown. No owner response yet. CLI initial account kscanaiapp lacked label/assignment rights; partial #10 creation was retained, and mutations completed/read back through connected Her Keys account. No duplicate issue created.

**Hard stop:** user request §17.11: “Post a short status (≤ 200 words) and wait for owner confirmation before continuing.” Original Agent G review is also required before closing Checkpoint 1 under §17.7. Next action after the owner supplies/reconciles that review and confirms source authority: refetch heads, selectively integrate client deletion + shared Premium/auth/consent/restore wiring without modifying backend-owned workers/SQL; then Expo/full-CI Checkpoint 3. Village/Co-Parent implementation stays BLOCKED and Pass B unauthorized.
