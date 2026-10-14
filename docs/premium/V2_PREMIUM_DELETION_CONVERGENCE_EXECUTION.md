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
