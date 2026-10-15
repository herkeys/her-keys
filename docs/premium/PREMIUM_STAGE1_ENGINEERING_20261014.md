# Her Keys Premium Stage 1 — Engineering convergence and evidence ledger

**Engineering lane:** `engineering/premium-stage1-completion-20261014`
**ENTRY:** `4d0d9b10c90ef3b92cb5bb4c857cd5792122beda` (`codex/v2-premium-final-config`)
**Date:** October 14, 2026
**Status:** source remediation in progress; NOT a hostile test/device or release certificate.
**Forbidden in this lane:** EAS builds, Production Premium/webhook activation, paid-product or pricing changes, deletion worker/registry edits, synthetic Premium grants.

## Source authority graph and selective integration

Remote branches inspected via GitHub:
- `feature/herkeys-premium-stage1` @ `e4462d2`: original complete Premium foundation; independent client, domain and server features.
- `integration/premium-certification` @ `4be74a9`: source-level Premium certification descendant of the feature branch.
- `codex/v2-premium-final-config` @ `4d0d9b1`: descendant of certification, with Staging allowlist SQL, operator CLI, webhook HMAC requirements and Expo SDK 57 patch-aligned `package.json`/`package-lock.json`.
- `codex/v2-premium-pass-a` @ `4e1309a`: ancestor of the older convergence branch; shared account-bound app guards.
- `integration/v2-premium-deletion-convergence` @ `1a0d25e`: retains Premium source and account lifecycle contract but diverges from final-config; relative to original Premium feature branch its 4 extra commits are documentation/evidence. Relative to final-config it lacks the operator lane and has older Expo patch declarations.
- `integration/welcome-tree-auth-runtime` @ `dc56531`: ancestor of original Premium implementation.
- `codex/account-deletion` @ `4aefa5f`: independent deletion owner. NOT merged or modified.
- `main` @ `bab9773`: not the all-inclusive Premium engineering authority.

**Baseline choice:** branch from final-config, not main or the older convergence ref. Preserve final-config's secure operator tooling and patch-aligned SDK dependency graph. Selectively incorporate the convergence documentation/evidence and any later reviewed account-deletion handoffs as documents, not blind merges. No shared deletion-owned SQL or worker edits here. An exact-SHA branch-specific CI lane was added, without changing release branches.

## Feature inventory (source inspection, not device certification)

| Workstream | Existing source / UI → server → persistence | Engineering evidence / unverified gaps |
| --- | --- | --- |
| Daily Load Autopilot | `src/features/daily-load/premium/PremiumDailyLoadSection.tsx` → `usePremiumDailyLoad.ts` → `dailyLoadFlow.ts` / `src/domain/premium/dailyLoadChange.ts` → `premium-gate` / `premium_authorize` → canonical household store commit and `premium_decisions` | Proposal, approval, receipt, undo, stale/conflict logic already implemented; existing source tests documented, but not re-certified on devices or live Staging. Does not claim external Google Calendar events. |
| Smart Inbox | `src/features/smart-inbox/PremiumReaderBridge.tsx` / `smartInboxEnhancer.ts` + Talk It Out review → `smart-inbox-extract` → `_shared/premium/smartInbox/handler.ts` → `geminiProvider.ts` and strict `contract.ts` → accepted canonical task/event | Live Gemini adapter exists and server protects quota, consent, JWT/household, and output validation. 43 scenarios are authored fixtures, **not** measured live-model accuracy. Real calls/evals require Staging credential, consent and cost authorization; no voice/email/SMS/OCR capture approved here. |
| Momentum | `src/features/momentum/premium/PremiumMomentumSection.tsx` → `usePremiumMomentum.ts` → `momentumFlow.ts` → `src/domain/premium/momentum/{aggregate,report,snapshot}.ts` → `premium-gate` + saved `premium_decisions` | Real recorded household observations and decisions drive weekly review; stored reports readable after expiration; no invented time savings. Threshold 5 records over 3 days, 28-day lookback not owner-approved. Live household review unverified. |
| RevenueCat | `src/monetization/revenueCatClient.ts`, `RevenueCatProvider.tsx`, `PremiumStateProvider.tsx`, `PremiumCheckoutAfterConsent.tsx`, Restore control; server reconciliation via `premium-reconcile`, `revenuecat-webhook` | Signed-in UUID binding, server-authoritative gates, paywall and restore source exists. Operator activation gap #18 was repaired in this branch with `stagingActivationProof`; cannot claim live testing or completed native catalog. |
| Supabase | Five `supabase/functions/{premium-gate,premium-reconcile,smart-inbox-extract,revenuecat-webhook,premium-ops}`; shared `premium_authorize`, usage and receipt ledgers | Hosted five Staging functions are deployed; no entitlement grants or paid feature releases. Production switches OFF. New CLI protections remain source-only until specifically verified. |
| Welcome/consent | `src/features/account/WelcomeAuthFlow.tsx`, `src/features/consent/ConsentFlow.tsx`, `src/monetization/PremiumCheckoutAfterConsent.tsx` and `src/store/accountRuntimeInstance.ts` | Existing Email/Google/Apple, early Premium intent, consent before purchase, singleton Restore Purchases and account epoch guards; device onboarding and email delivery require separate verification. |

## Issue #18 — source remediation

**Before:** `scripts-dev/premium-final-config.mjs` treated a recent signed TEST row (including its own HMAC-signed local `hk-preflight-*` fixture) plus an existing active projection as sufficient to open the Staging window. It never fetched RevenueCat during enable, and `window verify` ignored the runtime and webhook flags.

**After (this branch):**
1. `--provider-test-event-id` is required and must reference a recent hosted TEST event with an ID other than the locally generated fixture namespace. This is **operator-attested** provider-side evidence; the database row alone is **not proof** of dashboard origin. A separate real native Sandbox subscriber response is mandatory.
2. `window enable` performs a fresh bearer-authenticated `GET /v1/subscribers/{exact-auth-uuid}` and compares the response with a recent server-owned, reconciliation-sourced projection for that UUID. No authenticated provider response, wrong original App User ID, ambiguous alias, wrong store, production/test-store provenance, stale version, subscription expiry/refund/revocation, or mismatch ⇒ fail-closed denial.
3. `window verify` checks **both** `premium_enabled=true`, `webhook_processing=true` and each of the three staging-only feature rows, while reading Production fail-closed state. Post-enable verification failure triggers best-effort fail-closed rollback.
4. New source-level regression `tests/premiumFinalConfig/activationProof.test.mjs` covers provider absence, account switches/aliases, Test Store vs native Sandbox, stale/dirty projections, mismatch, refund, expiry and grace, plus CLI source guards.
5. `docs/premium/PREMIUM_FINAL_CONFIG_RUNBOOK.md` now specifies the required true provider event ID, fresh reconciliation and native Sandbox subscription. Synthetic smoke is transport-only.

**Note:** These changes do NOT provide cryptographic attestation of where a TEST event originated. The missing externally sourced dashboard evidence must be supplied and recorded by the operator. Do not close #18 until exact-SHA CI and a genuine Staging activation/rollback rehearsal succeed.

## Newly closed source defect: dirty provider projection could still authorize work

The existing `premium_authorize` obtains the effective state from `premium_entitlement_state`. The original function read `premium_entitlements.needs_reconcile` but did NOT use it: a previously active projection flagged by an ambiguous transfer or failed webhook could remain `premium_active`. That was a **P1 source authorization defect**.

New additive migration `supabase/migrations/20261015140000_premium_stale_projection_guard.sql` makes `premium_entitlement_state` return `unknown` for ANY existing projection with `needs_reconcile=true`, after the deletion lifecycle overlay and before the original derivation. The same function is used by both the foundation and Staging allowlist implementations of `premium_authorize`; no customer-data RLS/read paths changed. `supabase/tests/82-premium-authorization.sql` now asserts denied Daily Load and Smart Inbox operations for a dirty active projection. `tests/premiumFinalConfig/staleProjectionGuard.test.mjs` pins source contracts.

**Provider freshness extension:** the same additive migration introduces `premium_runtime_config.max_reconciled_age_seconds` with a controlled-test default of **86,400 seconds (24 hours)** and allowed bounds 300–86,400. New paid computation is denied as `entitlement_unknown` when the authoritative row is dirty, lacks a genuine server-side subscriber reconciliation, has a last reconciliation older than the configured age, or carries a future timestamp outside five minutes' clock skew. A signed webhook by itself is not a fresh provider API lookup. The generic `premium-gate` already has a bounded provider-retry-on-unknown path; direct AI extraction safely denies and requires account verification rather than incurring unapproved model cost. Saved historical records remain readable. The owner must approve this TTL and resulting provider-call behavior before public release.

**Staging deployment status (October 14, 2026):** The reviewed migration was **APPLIED and read back on Staging** under Supabase migration history entry `20261015015427_premium_stale_projection_guard`. Hosted Postgres transaction/rollback negative tests PASS; the complete disposable-database `supabase/tests/82-premium-authorization.sql` harness has not been run in this operator session. Production's schema, Premium switches, and webhook processing remain untouched/OFF. Git source file is named `20261015140000_premium_stale_projection_guard.sql`, while the connected Supabase migration API assigned hosted version `20261015015427`; preserve the name-to-version mapping and reconcile CLI migration-history planning before a future automated Production deployment. No manual mutation of migration history is authorized. Live provider/transfer checks are still outstanding.

## Live nonsecret read-back, October 14, 2026

- RevenueCat project `proj93809efe`: two entitlements including `her_keys_plus`; current `default` offering has monthly, annual, lifetime **Test Store** products only; no App Store or Google Play native package products.
- RevenueCat iOS app bundle `com.herkeys.app`, subscription key VALID, App Store Connect key MISSING. Android package `com.heykeys.app`, service credentials have valid catalog permissions but **subscription purchase permissions UNKNOWN**, with package-not-found response. Two pre-existing webhooks target Staging and Production; no new integrations created.
- Supabase Staging `fhhudicklmpofuzkxeqe`: `premium_enabled=true` (runtime core only), `webhook_processing=false`, all three feature rows `enabled=false,released=false`, zero `premium_entitlements`, zero `premium_events`, zero `premium_decisions`; Staging allowlist guard installed. Five Premium functions deployed.
- Supabase Production `npykvnxnehlsdlbumzwk`: `premium_enabled=false`, `webhook_processing=false`, all three feature rows OFF, zero entitlement/event/decision rows; no Staging allowlist guard, as intended. Five functions deployed but protected runtime OFF.
- Initial engineering inspection was read-only; a separate authorized Staging-only database completion pass subsequently applied the additive freshness migration. It changed Staging schema/function only, no customer account/entitlement data or paid release flags. Production remains unchanged.

## Staging database freshness completion — direct hosted SQL evidence

**Project:** `fhhudicklmpofuzkxeqe` (Staging only). **Applied migration name:** `premium_stale_projection_guard`; Supabase migration version `20261015015427`, exactly ONE history row. **Source:** `supabase/migrations/20261015140000_premium_stale_projection_guard.sql`. The version differs because the managed migration API assigned a timestamp at application; DO NOT edit historical entries or assume name/version parity with the future-dated repo filename.

**Read-back PASS:**
- `premium_runtime_config.environment='staging'`, `premium_enabled=true` (core switch, not release), `webhook_processing=false`, `allow_test_fixtures=false`; three paid feature rows remain `enabled=false,released=false,rollout_status='not_released'`.
- `max_reconciled_age_seconds=86400`, `NOT NULL`, server default `86400`; CHECK constraint restricts `300..86400`.
- `public.premium_entitlement_state(uuid,timestamptz)` uses the actual dirty, stale, absent, and future timestamp guards. `SECURITY DEFINER` EXECUTE: `anon=false`, `authenticated=false`, `service_role=true`.
- Staging auth users: 4 (unchanged). Zero persisted `premium_entitlements`, `premium_events`, `premium_decisions`, `premium_authorization_audit`, `premium_usage_events`, and `premium_usage` after probes; all temporary writes rolled back.

**Real Postgres transactional negative tests — PASS, explicit final ROLLBACK:** Select an active member of an existing Staging household; temporarily introduce a reconcile-sourced test row and enable only the calling transaction's feature configuration. The transaction asserts: unknown without projection; fresh reconciled active; deterministic Daily Load `allowed` on legitimate membership; `needs_reconcile=true` denies each Daily Load, Smart Inbox, Momentum with `entitlement_unknown`; 25-hour stale denies a new Momentum review; absent timestamp denies; +6-minute future timestamp denies; 23-hour reconciled active at default 24-hour TTL; explicit TTL=300 seconds denies the same 23-hour evidence; newly reconciled evidence restores active; canceled-active and revocation derived correctly; another account receives no paid entitlement. **No test fixture/provider identity/paid release flag persists.** These are SQL integration checks, NOT a live RevenueCat subscriber, webhook, Gemini request, physical-device purchase, or the full disposable DB harness.

**Security lint after deployment:** 23 informational RLS-without-policies table notices (private service-only tables), one pre-existing `pg_net` extension-in-public warning, seven authenticated SECURITY DEFINER warnings on existing functions, and one leaked-password-protection warning; the target entitlement-state function itself remains non-executable by authenticated clients. Do not change account-deletion RLS/security controls in this Premium workstream. Reference: [Supabase RLS advisories](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

**Deployment disposition:** `PREMIUM_STAGING_FRESHNESS_DATABASE=PASS`; `PREMIUM_STAGING_E2E=NOT_RUN`; `PREMIUM_PRODUCTION_PREMIUM=OFF`. The 24-hour TTL is a controlled-test default requiring product approval before release.

## Outstanding blockers by accountable owner

| # | Type | Severity | Owner | Source / precise closure |
| --- | --- | --- | --- | --- |
| 1 | External config / store | P0 paid end-to-end | Store/RevenueCat owner | Add owner-approved native iOS/Android subscriptions and prices in store dashboards, map existing offering packages, then verify both app public API keys; do not invent SKUs. `revenueCatClient.ts`, RC `default` offering. |
| 2 | External credential | P1 | Store/RevenueCat owner | Complete iOS App Store Connect API key; confirm Google Play package track/purchase permissions with RC credential validator; `app55f51de583` / `app3311d4868e`. |
| 3 | External credential & provider delivery | P1 | Backend/RevenueCat owner | Configure per-environment Authorization and HMAC, server secret API keys and Edge environment; record actual RC-dashboard initiated TEST and native Sandbox subscriber proof. Operator `scripts-dev/premium-final-config.mjs`. |
| 4 | Staging verification | P1 | Premium/backend QA | Run real JWT/consent/entitlement/rate/quota/HMAC/transfer/expiry/rollback matrix with allowlisted Staging accounts. Current paid entitlements: zero. |
| 5 | Live AI/provider verification | P1 | Premium AI lead | Run consented live Gemini corpus with approved spend limits and separate measurement from 43 authored scenarios; `scripts-dev/smart-inbox-live-eval.mjs`. |
| 6 | Product-owner decision | P2 | Product owner | Approve Premium quota/cost/free-allowance settings, RC restore/transfer mode, Momentum thresholds (5 records/3 days; 28-day lookback), paywall benefit copy and Store metadata. |
| 7 | Device verification | P1 | iOS & Android QA | Native Sandbox purchase/restore, Welcome Tree, Apple/Google/email auth, account switching, offline, cancelled/expired/grace, save/undo persistence and keyboard/back tests. No EAS build authorized here. |
| 8 | Account deletion convergence | P0 | Deletion owner | Issue #9: per-account Premium table erasure, provider-ID/payload scrubbing in `premium_events`, transfer handling, 30-day recovery, zero-data terminal proof. Do NOT touch deletion worker/resource registry from this branch. |
| 9 | Production/store release | P0 | Release owner | Separate hostile certification, full account-deletion signoff, approved pricing/metadata, store submissions and protected Production rollout. Production paid runtime and webhook processing remain OFF. |\n| 10 | Staging freshness database migration | CLOSED (database gate) | Premium backend owner | Applied/read back as hosted version `20261015015427`; rollback negative tests passed; no live provider tests. Track source-vs-hosted version mapping before automated migration rollouts. |\n| 11 | Product-owner freshness policy | P2 | Premium backend + product owner | Approve 24-hour controlled-test `max_reconciled_age_seconds` TTL (valid 300–86,400), provider outage behavior, and API cost envelope; hosted Staging SQL negative tests passed, but actual RevenueCat end-to-end provider behavior remains unverified. |

### Account-deletion owner's required data inventory

Per-account resources: `premium_entitlements`, `premium_subscriber_identities`, `premium_reconcile_state`, `premium_usage`, `premium_usage_events`, `premium_authorization_audit`, `premium_decisions`. Scrub `premium_events` `app_user_id`, `original_app_user_id`, `aliases`, `transferred_from`, `transferred_to`, nested `payload` and any subject keys, without destroying another customer's evidence. Treat `premium_runtime_config`, `premium_feature_config`, `premium_usage_global` as shared/global. Deletion worker and terminal-proof ownership remain with issue #9.

## Validation and disposition policy

The dedicated workflow `.github/workflows/v2-integration-validation.yml` now runs on the engineering branch's exact pushed SHA and exercises full Node 22 suite, backend boundary protection, native release identity, TypeScript, Expo install compatibility, Doctor and config introspection. Report CI only after the exact candidate SHA completes. Live user/provider/device verification remains **NOT RUN** regardless of source success.

This is an engineering evidence ledger. A merged PR, green source CI, or Test Store event must never be interpreted as permission to release or activate paid subscriptions.
