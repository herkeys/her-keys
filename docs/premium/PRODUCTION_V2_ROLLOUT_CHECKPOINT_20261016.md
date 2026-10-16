# Her Keys V2 — Production Premium readiness & Welcome Tree internal build checkpoint

**Checkpoint:** 2026-10-16. **Workstream:** Production BACKEND enablement with paid checkout explicitly disabled.  
**Source base:** `candidate/welcome-tree-premium-android-internal-20261016` @ `ae742a36292e126fea976d6d032bee430c873abd`.  
**Repair branch:** `repair/v2-production-premium-rollout-readiness-20261016`.

## Production changes executed and verified

Supabase Production project `npykvnxnehlsdlbumzwk`.

- Deployed canonical actor-only `premium_purchase_readiness()` migration. `anon` EXECUTE revoked, `authenticated` EXECUTE granted.
- Deployed additive `checkout_enabled boolean NOT NULL DEFAULT false` column on `public.premium_runtime_config`; purchase-readiness RPC now requires `checkout_enabled = true`, in addition to active account, Premium enabled, functioning webhook-processing flag and ALL THREE promised benefits released.
- Applied one transaction guarding Production environment and all original flag values, then:
  - `premium_runtime_config.premium_enabled = true`
  - `premium_runtime_config.webhook_processing = true`
  - `premium_runtime_config.checkout_enabled = false`
  - `allow_test_fixtures = false` (unchanged)
  - `daily_load_premium`, `smart_inbox_extract`, `momentum_report`: `enabled=true,released=true,rollout_status='general',limit_status='owner_approved'`; incremented manifest revision
  - `village_delegation` and `coparent_plus`: still `enabled=false,released=false,rollout_status='not_released'`.
- Follow-up database reads verified exact flags, RPC privileges, and `premium_health() = {ok:true,alerts:[]}` with no observed backlog/dead-letter alerts.
- No Production entitlement grants, account credentials, transaction records, prices, app packages or RevenueCat offering were changed.

**Important:** A healthy database and `webhook_processing=true` are NOT evidence that the RevenueCat sender's Authorization/HMAC credentials match the deployed Edge Function secrets, or that a signed event was processed. The RevenueCat webhook dashboard still describes this integration as `security setup pending`. The connector can read webhook configurations, but cannot set the Authorization delivery header; the available Supabase connector cannot inspect/configure Edge Function environment secrets. A real signed test is still required.

Existing Production Edge Functions `premium-gate`, `premium-reconcile`, `smart-inbox-extract` are deployed ACTIVE and source-matched to Staging; `revenuecat-webhook` Production v1's enforced HMAC policy matches v2 for the Production environment. Do not redeploy only for cosmetic version parity. Verify live signed delivery before calling the webhook VERIFIED.

## Staging state

Supabase Staging `fhhudicklmpofuzkxeqe`: three Stage 1 features `staging_only`, Premium runtime enabled, webhook-processing flag enabled, `checkout_enabled=false`. The Stage-only allowlist still restricts functional use; earlier query found zero users with admin-controlled `herkeys_premium_tester` flag. Do not grant faux store entitlements to overcome this restriction.

## RevenueCat and external store blockers

RevenueCat project `proj93809efe`, current offering `default` (`ofrng40c3008072`), published paywall `pw9aa8edf9bdb34338`. All three current packages map ONLY to Test Store products. There is no verified native Google or Apple product mapping or transaction. Google subscription purchase lookup is still inconclusive; Apple App Store Connect API credential is unconfigured. Preserve all native store pricing/trials and do not turn on `checkout_enabled` until a real, legitimate test purchase, restore, webhook and entitlement lifecycle is certified.

## CI repair and build gates

- Added migration ownership and LF pins to `supabase/tests/migration-chain.mjs`, `tests/migrationChain.test.mjs`, `scripts-dev/meals-boundary-scan.cjs` and `.gitattributes`. No previous migration was edited.
- Updated Daily Load UI test fixture to model ALL THREE published Stage 1 feature manifest entries and an explicitly eligible server purchase response.
- Added `tests/premiumCheckoutSwitch.test.mjs` covering the independent commercial switch, backend guards and anonymous-function restrictions.
- Exact-SHA CI now has a focused Welcome Tree/Premium source-validation lane ahead of the full app suite. At the checkpoint its backend boundary, release identity, TypeScript, and focused tests pass. The full suite has prior account-deletion failures (#9) and must not be represented as fully green without an exact-run result.
- An internal-Android EAS workflow `.github/workflows/v2-internal-production-apk.yml` is enabled on push to the repair branch. It requires `EXPO_TOKEN` and builds only profile `smoke-production-android` (internal APK, Production backend, no IPA/AAB, no store submission or OTA). Its build URL and APK checksum must be captured once successful.
- The mobile Welcome Tree frontend is **not installed into any customer's phone by these SQL changes**. It requires a native distribution artifact or an approved app update. Android and iOS pixel-level Welcome/Continue placement remains unverified on this candidate.

## Rollback protocol

For an issue **before any paid subscriptions**: keep `checkout_enabled=false`; safely restore feature flags only if necessary and after recording failures. Existing webhook event processing can remain active to preserve transaction lifecycle evidence. No native customer purchases are currently certified.

After any real paid subscriptions: NEVER stop webhook processing, revocation, renewal, billing grace, refund, reconciliation or ongoing fulfillment as a routine rollback. Block only NEW checkout using `checkout_enabled=false` or a separately approved store offering kill switch; preserve earned Premium entitlements and remediate affected paying users.

## Remaining certification

1. Verify and resolve RevenueCat webhook Authorization + HMAC secret setup and deliver a signed sandbox/Production event with durable processing evidence. No secret should appear in logs or tickets.
2. Establish one authorized Staging test account; demonstrate true account/household/consent/entitlement/feature flows without fake paid grants.
3. Complete real native Google Play/Apple SKU mapping, restore, refunds, retries and transaction account isolation (keep checkout OFF meanwhile).
4. Finish exact-SHA full CI, resolve unrelated deletion owners' eight failures, and fix any other integration regressions.
5. Obtain EAS internal APK from the configured workflow and test Android small/large screen, Welcome auth, consent, four audit steps, Life Operating Profile, final Premium, Free continuation, and feature UI.
6. iOS device test using the same source; never claim iOS native certification from shared source code alone.
7. Obtain explicit commercial go-live approval before `checkout_enabled=true` or publishing a paid store offering.
