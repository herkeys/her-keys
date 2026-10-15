# Premium source convergence — integration report (2026-10-14)

Branch `integration/premium-source-convergence-20261014` (worktree `Her-Keys-PC01`). Source-level evidence only: nothing here claims
activation, native billing, live AI, Staging, device or Production readiness.

## 1. Verdict

**PASS (scoped): the integrated source is safe to advance to Premium feature refinement and controlled Staging device testing.**
**It is NOT release-safe.** One mandatory gate is deliberately red and owner-deferred: the 8 deletion-lifecycle test failures
(issue #9, section 6). Production account deletion stays OFF; no V2 release or deletion activation may proceed until #9 is closed
with the deletion owner's signoff. CI on this branch is therefore expected to report `failure` on `npm test` only.

## 2. Entry / exit SHAs and authority diagram

| Role | Ref | SHA (verified against `git ls-remote` 2026-10-14) |
|---|---|---|
| Authority 1: Stage 1 engineering | `engineering/premium-stage1-completion-20261014` (PR #19, draft) | `5e54d811fc560d2c3a0c7967c9680451dee251c3` |
| Authority 2: Pass A mobile + account | `codex/v2-premium-pass-a` (PR #13, draft) | `4e1309a01e733cd958680bfe0e3a4c26327e47ef` |
| Deletion owner (protected, separate signoff) | `codex/account-deletion` | `4aefa5f20adc38fc867e5a354f1faf279fab65a0` (an ancestor of Pass A) |
| Common ancestor of both authorities | `feature/herkeys-premium-stage1` | `e4462d2a5cb42706a8523f6ba45248ee9396d02e` |
| main | `main` | `bab9773226e3b81928af04d5a303596b16502710` |
| ENTRY | integration branch cut from Pass A | `4e1309a01e733cd958680bfe0e3a4c26327e47ef` |
| merge | Stage 1 completion merged in | `842f8060a4540d2e24b349dd0ebf457d6bfb5145` |
| EXIT | `integration/premium-source-convergence-20261014` | see `git log` (merge + SQL repair + this report) |

```
main bab9773
  |
  +-- feature/herkeys-premium-stage1 e4462d2 (common ancestor)
        |                                   \
        | +70 commits                        \ +deletion lifecycle (4aefa5f) merged, +33 Pass A commits
        v                                     v
  engineering/premium-stage1-completion   codex/v2-premium-pass-a
  5e54d81  (PR #19, base: final-config)   4e1309a  (PR #13, base: deletion-convergence)
        \                                     /
         \_____ merge 842f806 ______________/
                       |
        integration/premium-source-convergence-20261014   <- this branch
```

Pass A already contains the deletion owner's source byte-for-byte. Verified: every deletion-owned path (`supabase/migrations/20261014*`,
`supabase/functions/process-account-deletions`, `_shared/deletion*`, `supabase/tests/deletion-database.mjs`, `src/domain/account`,
`tests/accountDeletion`, `docs/account-deletion`) shows an empty diff against `origin/codex/account-deletion`.

## 3. Inventory and file-level change ledger

Files changed since the common ancestor: Stage 1 completion 24, Pass A 158, **shared by both: 7**.

Semantic overlap is nil. `git diff` of the merge against Pass A touches no file under `src/` or `app/` (the Stage 1 completion
branch changed no client code), and the merge's Premium backend files are identical to Stage 1 completion. Pass A's client safeguards
(synchronous account-switch fences, `isCurrent()` lifecycle checks, guarded household commits, restoration and navigation
protections) and Stage 1's server freshness/authorization protections therefore both survive unmodified.

| File | Origin | Resolution |
|---|---|---|
| `.github/workflows/v2-integration-validation.yml` | both | CONFLICT (trigger list). Union kept; the duplicate `codex/v2-premium-final-config` line removed; this branch added. No step touched. |
| `scripts-dev/meals-boundary-scan.cjs` | both | CONFLICT (two adjacent lane registrations). Both kept: `HK-V2-PREMIUM-PASS-A`, `V2-POST-PASSWORD`, `HK-ACCOUNT-DELETION` and `HK-PREMIUM-FINAL-CONFIG`. No check or finding weakened. |
| `package.json`, `package-lock.json` | both | Auto-merged; identical to Pass A (its SDK 57 patch alignment is retained). |
| `supabase/tests/migration-chain.mjs`, `tests/migrationChain.test.mjs` | both | Auto-merged; chain is 26 migrations ending `20261015140000_premium_stale_projection_guard.sql`. |
| `tests/calendarActionsUi.test.mjs` | both | Auto-merged. |
| `supabase/migrations/20261015140000_premium_stale_projection_guard.sql` | Stage 1 | Added (additive provider-freshness guard). |
| `supabase/functions/_shared/premium/runtime.ts`, `staging_tester_guard.sql` | Stage 1 | Added/updated (configurable 24h freshness; Staging-only tester allowlist, kept outside the shipping chain). |
| `scripts-dev/premium-final-config.mjs`, `scripts-dev/premium-final-config/core.mjs` | Stage 1 | Added (operator CLI: preflight, receipt smoke, reconcile). |
| `tests/premiumFinalConfig/*` (7 files) | Stage 1 | Added. |
| `docs/premium/PREMIUM_FINAL_CONFIG_*`, `PREMIUM_PRODUCTION_PARITY_*`, `PREMIUM_STAGE1_ENGINEERING_*` | Stage 1 | Added. |
| `supabase/tests/82-premium-authorization.sql` | Stage 1 + this branch | Stage 1 added freshness suites; **this branch repaired the deletion-table collision** (section 5). |
| everything else (137 Pass A files: deletion lifecycle, account UI, fences, audits, docs) | Pass A | Unchanged. |

## 4. Gates run on the merge (all local, serial, Node 24.14 / npm 11.9)

| Gate | Result |
|---|---|
| `npm ci` (lockfile) | pass, 586 packages |
| `node --test tests/build2BackendProtection.test.mjs` | pass |
| `npm run verify:release-identity` | `RELEASE_IDENTITY=PASS` (Android versionCode 2, iOS build 2) |
| `npm run typecheck` | pass |
| `npx expo install --check` | pass ("Dependencies are up to date") |
| `npx expo-doctor` | 21/21 pass |
| `expo config --type public` / `--type introspect` | pass / pass |
| `npm test` (full app suite) | **4682 tests, 4674 pass, 8 fail, 0 skipped** (CI at Pass A tip `0f27acf` was 4655 / 8 fail; the 27 extra tests are Stage 1's and all pass) |
| `run-premium.mjs` (SQL suites 82/83) | **126/126** after the repair in section 5 (it aborted at the 82 suite before) |
| `run-premium.mjs --concurrency` | 11/11 |
| `run-premium.mjs --parity` | 2/2 (SQL and TypeScript agree on 4000 generated rows, all 7 derivable states reached) |
| `run-premium.mjs --journey` | 26 pass, **2 fail** before repair: see D2. A repair is written but NOT run or committed (section 5). |

## 5. Repairs

1. **D1 fixed (commit `95d71ab`)** `supabase/tests/82-premium-authorization.sql`: the lifecycle probe did
   `CREATE TABLE public.account_deletion_requests (account_id, status)`. On the converged lineage the deletion migration already creates
   that table, so the run died with `relation "account_deletion_requests" already exists` and no Premium SQL assertion ran. It now inserts a valid row
   into the real table (explicit `receipt_hash`, `requested_at`, `grace_period_ends_at` to satisfy the real CHECKs) and creates the
   stand-in only when the table is absent. No assertion removed; no deletion-owned file touched.
2. **D2 written, not committed:** `supabase/tests/premium-journey.mjs` (working-tree edit). Stage 1's 24h freshness guard
   (correctly) makes a webhook-only purchase `entitlement_unknown`. The journey still expected `premium_active` straight after the webhook. The edit adds a
   proof of that denial (`entitlement_unknown` / `retry_verification`), reconciles A through the RevenueCat fake with `reconcileAccount`, then keeps the
   original assertions. The run to verify it was refused by the session's permission classifier, so it is unverified and left uncommitted for the owner's decision.

## 6. The eight deletion failures: reproduced, root cause separated

Reproduced on this branch (full suite log: 8 fail, 0 cancelled, 0 skipped), identical to the documented CI set at `0f27acf`.

**Single root cause.** The deletion `database_cleanup` command (`20261014002726_account_deletion_lifecycle.sql`, drift guard at the
`information_schema.tables` check) raises `unclassified_resource` when any public base table is missing from `private.deletion_resource_registry`
(43 rows). A read-only probe against the same PGlite database the tests use lists exactly the unclassified tables:

`premium_authorization_audit, premium_decisions, premium_entitlements, premium_events, premium_feature_config, premium_reconcile_state,
premium_runtime_config, premium_subscriber_identities, premium_usage, premium_usage_events, premium_usage_global` (all 11 Premium tables, nothing else).

| # | Test | Error | Class |
|---|---|---|---|
| 1 | `database.test.mjs:103` complete database cleanup preserves the other account | `unclassified_resource` | ROOT |
| 2 | `mutations.test.mjs:39` approved shared policy deletes private records… | `unclassified_resource` | ROOT |
| 3-5 | `resourceCoverage.test.mjs:69` all 43 registered resources: `shared`, `former_member`, `single` | `unclassified_resource` | ROOT (x3) |
| 6 | `database.test.mjs:108` purged requires Auth absence and independent resource evidence | `terminal_verification_failed` | DOWNSTREAM: `finish` requires `evidence @> {"database":true,...}`, which only a successful `database_cleanup` writes; the cleanup in #1 aborted, so the flag is never set |
| 7-8 | parents `account deletion: real SQL state…` and `critical lifecycle negative controls…` | implicit "all children pass" | AGGREGATORS |

So: 5 root failures from one cause, 1 downstream, 2 aggregators. Adding the registry rows alone will not finish the job.

**Not repaired here (owner deferred this to the next build, and your original rules reserve the deletion registry, migrations and
terminal erasure to the deletion owner).** Suggested repair for that build, in the owner's lane:
- Location: `supabase/migrations/20261014002726_account_deletion_lifecycle.sql` registry `INSERT` (line 75) and the drift guard (line ~355); new additive
  migration after `20261015140000`.
- Register the 7 per-account tables (`premium_entitlements`, `premium_subscriber_identities`, `premium_reconcile_state`, `premium_usage`,
  `premium_usage_events`, `premium_authorization_audit`, `premium_decisions`) with their owner column.
- Add an explicit "shared/global" classification (the registry has none) for `premium_runtime_config`, `premium_feature_config`, `premium_usage_global`, so the
  guard accepts them without deleting them.
- `premium_events` needs bounded, account-specific provider-id scrubbing (`app_user_id`, `original_app_user_id`, `aliases`, `transferred_from`,
  `transferred_to` and `payload`), not deletion, then terminal proof over JSON arrays. Full acceptance criteria are in issue #9.

## 7. Residual defect register

| ID | Defect | Class | Location | Status |
|---|---|---|---|---|
| D1 | Premium suite 82 collided with the real deletion table, aborting every Premium SQL assertion | functional defect (test composition) | `supabase/tests/82-premium-authorization.sql:150` | FIXED `95d71ab` |
| D2 | Journey asserts webhook-only purchase is `premium_active`; contradicts the 24h freshness guard | missing test proof | `supabase/tests/premium-journey.mjs:112-117` | Repair written, unverified, uncommitted |
| D3 | Premium tables unclassified in deletion registry; 8 test failures; no provider-id erasure | functional defect (deletion-owned) | registry above; issue #9 | DEFERRED to next build (owner); CI stays red |
| D4 | No Premium home, plan status or manage/cancel entry. Premium is reachable only through Today sections and silent Talk It Out enhancement; Account has no Premium status or "manage subscription" | UX improvement | `src/features/account/AccountPanel.tsx` (no Premium reference), `src/features/today/TodayBriefing.tsx` | Backlog WP-1 |
| D5 | Client verifies once per account session automatically; after the 24h freshness window a returning subscriber who is offline on that attempt is denied (`entitlement_unknown`) until a manual retry. Copy for this state is not proven | UX improvement + missing test proof | `src/monetization/premiumController.ts` (verify), `premiumCopy.ts` | Backlog WP-2 |
| D6 | Real purchase, RevenueCat webhook/Sandbox, store listing and native billing never exercised; Smart Inbox live eval gated and NOT RUN | external dependency | `PREMIUM_STAGE1_STAGING_PLAN.md`, `PREMIUM_FINAL_CONFIG_RUNBOOK.md` | Not run (no purchases or EAS by constraint) |
| D7 | No native build with the current Pass A SDK 57 lock has run on a device | new build requirement | n/a | Needs an EAS build (not authorized) |
| D8 | Owner decisions OD-P1-01..13 (pricing, free allowance 0 `proposed_not_approved`, Momentum thresholds, Village/Co-Parent) still open | external dependency | `PREMIUM_STAGE1_A0_ARCHITECTURE.md` section 12 | Open |
| D9 | `supabase/functions/_shared/premium/*.ts` loaded by Node harness emits `MODULE_TYPELESS_PACKAGE_JSON` warning (reparse cost only) | tooling | root `package.json` | Left: adding `"type":"module"` would change every `.js` in the tree |
| D10 | `meals-boundary-scan.cjs` needs a new lane entry for every owner lane (now 4 on this lineage); lane text duplicates across branches | tooling debt | `scripts-dev/meals-boundary-scan.cjs` | Left |
| D11 | Workflow `v2-integration-validation.yml` listed `codex/v2-premium-final-config` twice on Stage 1's branch | trivial | workflow | FIXED in merge |

## 8. Prioritized frontend backlog (Premium home, Daily Load, Smart Inbox, Momentum)

Each package keeps Free untouched, passes the existing source tests, and adds the tests named.

**WP-1 Premium home and plan status (D4)** — A Premium entry in Account (status: Free / Premium / verifying / restoring; plan; renewal date from the
server projection only; Manage subscription deep link to the store; Restore purchases stays the single control). Acceptance: exactly one restore control
(existing `persistentRestore.test`); status text is derived only from the server-confirmed state, never the store SDK; account switch clears it
(extend `clientProvider.test`); Free user sees an honest upgrade path with no AI claim; screen reader order and 44pt targets verified in a component test.

**WP-2 Verification and freshness states (D5)** — Distinct, calm copy and one-tap retry for `entitlement_unknown` / `retry_verification`, plus a second automatic
verify on foreground resume after the freshness window. Acceptance: tests that a stale-but-paying account is never shown "Free" or "Upgrade", that retry is
bounded (existing backoff), and that offline shows a non-alarming state.

**WP-3 Daily Load Premium** — Surface the review entry only when the day is tight or overloaded (current rule), add a visible "why this" line and a
receipt link in the saved-decision view. Acceptance: no write without her approval; reschedule rules unchanged; ledger replay shows "already saved"; mutation
suite for the flow still kills all mutants.

**WP-4 Smart Inbox** — A visible, dismissible "Premium read this" marker on Talk It Out results plus a per-capture "use the basic reading" control; denial reasons
(`consent`, `limit`, `unavailable`) only shown to Premium. Acceptance: Free capture never imports `PremiumStateProvider`; high-stakes text is never sent; every
proposal requires review; the 43-scenario corpus passes; live eval stays gated until Staging is authorized.

**WP-5 Momentum** — Empty/sparse state under the 5-events / 3-days threshold, last-review receipt, and weekly review reminder as a local notification only.
Acceptance: attribution of deferrals to the ledger (no double count), thresholds read from one constant, no network in the empty state.

## 9. Next gates, in order

1. Decide D2: allow the journey edit to be verified and committed (it is additive).
2. Push and read exact-SHA CI; expect only the 8 deletion failures.
3. Owner authorizes Staging per `PREMIUM_STAGE1_STAGING_PLAN.md`; device testing then covers D6 and D7.
4. Next build: deletion owner closes #9 (section 6), then the integrated suite must be 0 failures before any V2 release.
