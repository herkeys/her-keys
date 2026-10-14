# Her Keys Premium — Stage 1: Staging Certification Plan and Deployment Authorization Request

**Status: NOT AUTHORIZED, NOT RUN.** Stage 1 deployed nothing: no migration, no Edge Function, no secret, no RevenueCat dashboard change, no EAS build, no store action.
This document is the precise request the owner is asked to approve (or amend), and the plan that runs only after approval.

## 1. The request (what is asked, and only this)

> **Authorize deployment of the Premium Stage 1 backend to the Staging Supabase project, and a RevenueCat *Sandbox* webhook pointed at it, for certification only.**

| # | Item | Detail |
|---|---|---|
| 1 | Two **additive** migrations | `20261015120000_premium_entitlement_foundation.sql`, `20261015130000_premium_decision_ledger.sql`. They create only `premium_*` objects; they alter no existing table. Staging only. |
| 2 | Five Edge Functions | `revenuecat-webhook` (`verify_jwt=false`, authenticated by its own secret + HMAC), `premium-ops` (`verify_jwt=false`, operator secret), `premium-gate`, `premium-reconcile`, `smart-inbox-extract` (`verify_jwt=true`) |
| 3 | Secrets (set by the owner or with the owner present; never pasted into chat or git) | `PREMIUM_ENVIRONMENT=staging`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_WEBHOOK_HMAC_SECRET`, `REVENUECAT_SECRET_API_KEY` (sandbox project key), `PREMIUM_OPS_SECRET`; `GEMINI_API_KEY` **only** if the live Smart Inbox evaluation is also approved |
| 4 | RevenueCat | one **Sandbox** webhook to the Staging function with Authorization + HMAC signing. **No product, offering, entitlement, price or paywall is created or changed.** |
| 5 | Staging config | set `premium_runtime_config.environment='staging'`; release the four Stage 1 feature keys to `staging_only` for named test accounts' households |
| 6 | Test accounts | two or more Staging accounts created for this purpose, in Staging only |

**Explicitly not requested:** any Production change; EAS build; store submission; public subscription activation; any price, trial or limit shown to a customer; changing the account-deletion lifecycle, Welcome Tree, Settings integration, platform branches, signing identities or RevenueCat dashboard configuration.

## 2. Preconditions (all must be true before step 1)

1. The exact commit under certification passes the repository gate in CI (see the ledger: exact SHA, `npm test`, `tsc`, `deno check`, SQL suites, expo-doctor).
2. Staging is a **separate** Supabase project from Production (confirm project ref with the owner); the Staging database has no Premium objects yet (`SELECT to_regclass('public.premium_entitlements')` is null).
3. A RevenueCat Sandbox test environment exists with the existing sandbox product; testers are on a **Staging** build (a build is a separate approval, not requested here).
4. The owner has a rollback contact for the run window.

## 3. Plan (each step has a pass criterion and the evidence that goes in the ledger)

| Step | Action | Pass criterion | Evidence |
|---|---|---|---|
| 1 | Apply the two migrations to Staging (`supabase db push` or MCP `apply_migration`, one at a time) | no error; `premium_health()` returns `ok:true`, `environment:'staging'`; the grant-matrix query shows **no** `anon`/`authenticated` privilege on any `premium_*` object except the intended RPCs | query output |
| 2 | Run the **read-only** SQL assertions from `supabase/tests/82-…` / `83-…` equivalent against Staging (default privileges check, RLS on, no fixture helper present) | all pass | output |
| 3 | Deploy the five functions; set secrets | `GET` on each returns its documented 405/401 (never 200 for an unauthenticated call) | status codes |
| 4 | Webhook auth: send an unauthenticated, a bad-HMAC, a stale-timestamp and a **PRODUCTION**-environment event | 401 / 401 / 401 / `ignored_environment`; no projection row created | `premium_events` rows |
| 5 | Sandbox purchase on a Staging build with account A (App User ID = A's Supabase UUID) | `INITIAL_PURCHASE` stored, processed once; `premium_my_entitlement()` = `premium_active`; the app unlocks **after the server confirms**, not on the SDK alone | event row, state query, screen recording |
| 6 | Replay the same event; deliver a late (older) `RENEWAL`; deliver `CANCELLATION` then `EXPIRATION` | idempotent; older event does not overwrite; `premium_canceled_active` until expiry then `premium_expired`/`unknown` per rules | state after each |
| 7 | Restore / transfer: restore on account B; sign out A / in B; account switch mid-purchase | **no** automatic ownership transfer; B is `free` until RevenueCat's authenticated record says otherwise; A's state never appears for B | state queries + screens |
| 8 | Authorization matrix against Staging with real JWTs: Free user, Premium user, wrong household, no AI consent, quota exhausted, kill switch, global disable | each returns the documented reason; the premium-gate and RLS negative matrix matches the local suite | response bodies |
| 9 | Operations rehearsal: halt `webhook_processing`, send an event, resume, run `backlog`; force-reconcile; kill-switch a feature | matches the runbook; Free unaffected | `premium_health()` before/after |
| 10 | Daily Load Premium journey on a device against Staging: review → approve → saved → undo → restart | receipt states `applied` then `reverted`; restart-safe | receipts + recording |
| 11 | Smart Inbox: consent gate, limit, provider failure, replay (**fixture provider**; live provider only if approved) | denied without consent **before** any model call; failed provider releases the unit | usage rows |
| 12 | Momentum review: thin account (insufficient state, no quota), account with history (ready, saved), expired entitlement (saved review readable, new denied) | as the Momentum doc | screens + rows |
| 13 | Cleanup: remove the Staging test accounts' Premium rows; leave schema in place | `premium_health()` ok | output |

Any failed step stops the run; nothing proceeds to the next step on a hunch. Partial results are recorded as they are (PASS / FAIL / NOT RUN per step).

## 4. Rollback during the run

Switches in the runbook (§1) stop new work in seconds. If a migration misbehaves on an empty Staging database, the documented reverse path (drop in reverse dependency order) is valid because Staging holds no customer data. Nothing here touches Production.

## 5. What a pass would — and would not — certify

A full pass certifies `PREMIUM_STAGE1_STAGING` and, with step 5–7, `PREMIUM_REVENUECAT_SANDBOX`. It does **not** certify device parity on both platforms (a separate device pass), Production readiness, store compliance, pricing, or public sales.
Those remain separate gates (ledger §Remaining release gates).
