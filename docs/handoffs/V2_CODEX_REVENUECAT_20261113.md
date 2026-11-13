# RevenueCat completion agent — 2026-11-13

**Current verdict: BLOCKED for engineering readiness for native purchase testing; live subscriptions are NOT_RUN.** Source repairs, four Staging deployments and configuration preparation are complete below; credentials, authenticated delivery and Production promotion remain gates. This is the dedicated RevenueCat workstream, not a general application certification.

Starting authority: `4f17b917ce8c30c6890c9b2819c191636208d6d6`, integration branch `integration/v2-autonomous-upgrade-20261112`. Isolated worktree `C:\Users\jsmit\Her-Keys-RevenueCat-V2`, branch `codex/v2-revenuecat-completion-20261113`. Repair commit `961acca5104cf2e698de88b14f21ee557552daab`; [PR #51](https://github.com/herkeys/her-keys/pull/51). Original and Claude worktrees preserved. No app identity, exported interface, migration, RLS, dependency, consent or deletion change. No signed artifact generated.

## Current configuration and stores

| Check | Apple | Google |
| --- | --- | --- |
| Project/app identity | PASS: proj93809efe / app55f51de583 / com.herkeys.app | PASS: proj93809efe / app3311d4868e / com.heykeys.app |
| Native products attached to her_keys_plus and default offering | PASS: monthly prod67a939caaa, yearly prod8423a82588 | PASS: monthly:monthly prod0b5bd5665b, yearly:yearly prod813df0d181 |
| Saved credential validation | Subscription key PASS; App Store Connect key BLOCKED, not configured, HTTP 422 | Catalog and base-plan access PASS; subscription-purchase access BLOCKED, validator status unknown |
| Live store prices/availability/offers | BLOCKED by missing App Store Connect credential | PASS for returned US region only: monthly USD 9.99 P1M, annual USD 79.99 P1Y; both ACTIVE/available |
| Introductory offers | BLOCKED: actual Apple offers unreadable | PASS configuration: monthly-free-trial and yearly-free-trial ACTIVE, one free P1M phase; acquisition rule anySubscriptionInApp; actual customer eligibility NOT_RUN |
| Grace period | BLOCKED | Monthly P7D, annual P14D |
| Store test transaction / restore / notification delivery | NOT_RUN | NOT_RUN |
| Restore/transfer policy readback | BLOCKED: not exposed by available configuration tools | BLOCKED: same project setting |

Live store reads refreshed at `2026-11-13T18:31:16Z`. Apple reads failed explicitly because the App Store Connect credential is missing, not because the product IDs were proven invalid. Current offering `default` / `ofrng40c3008072` is active/current and attached to `pw9aa8edf9bdb34338`; monthly and annual packages bind the two native stores correctly. Historical Test Store products and the Test Store-only lifetime package remain preserved. They are not shown on the native paywall or evidence of native purchases.

Google diagnosis: the saved service account successfully reads the same configured package's product and subscription catalogs, while the subscription-purchase validation check returns **“No application was found for the given package name.”** The package matches source and RevenueCat. This does not establish a typo, missing permission, or a completed Play registration. The connector does not expose the service-account principal, Play app-access grants or track/build registration. Those checks remain BLOCKED without an authenticated Play Console session or approved secure service-account reference. Do not replace the package or recreate the app.

[RevenueCat's credential troubleshooting](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials/troubleshooting) identifies incomplete initial build/store-listing registration as a package-lookup prerequisite, and purchase validation also requires financial-data and order/subscription permissions. Confirm actual first-upload/track state and the exact uploaded service-account principal's app grant before deciding which defect exists; then perform a license-tester transaction in the later native phase. Catalog success alone is insufficient, and a real testing transaction may still be necessary to prove purchase-record access. No store permission or product mutation was attempted without that evidence.

Apple secure requirement: an authorized `.p8` reference for existing key `XTNYDBS8T8`, its issuer ID, verified team/app access and Vendor number where required by the RevenueCat upload flow. The previously documented `%LOCALAPPDATA%\HerKeys\billing\herkeys-revenuecat-asc-key.clixml` is absent; exact-key-file searches in Downloads/Documents found no material. The subscription key is a separate working credential and must be preserved. [RevenueCat requires at least App Manager access](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/app-store-connect-api-key-configuration). No key values belong in the report, source or chat. Apple private material remains BLOCKED; independent Android/source work continued.

EAS public-key readback independently matched all four configured values (iOS/Android in both Production and preview) to the corresponding live RevenueCat app's public SDK key. These are the native-store profiles in eas.json; development retains its gated Staging Test Store profile. No EAS variable was changed. This verifies configuration, not the contents of an old TestFlight/Play binary.

## Paywall revision and publication

Independently fetched both component trees and rendered published and draft views. Published revision **12** still contains example.com legal links, an unsupported video feature and a “save 30%” web-checkout action. That P1 remains open until a validated replacement is published. Its component tree was byte-for-byte unchanged by this pass.

Draft **13 -> 14** is saved **unpublished**. The approved Her Keys title, three supported feature rows, annual default, monthly/annual product bindings, dynamic regular prices, purchase/dismiss/restore actions, canonical Terms/Privacy PDFs and renewal notice are preserved. Both introductory-offer price lines now use `product.offer_price` and `product.offer_period_with_unit` inside offer-eligibility overrides; both CTA variants say “Start Premium.” This prevents a paid introductory offer being called free. [RevenueCat documents that offer prices localize to “free” for free trials](https://www.revenuecat.com/docs/tools/paywalls/creating-paywalls/variables); no prices, durations or savings were hardcoded. Old unused video/savings localization strings remain in the editor's localization dictionary but have no reachable component references.

Rendered revision 14 introductory layout and checked the component/localization bindings. Renderer offer values are samples (including a displayed $1.99/week); they are **not** the actual Google one-month free offer or Apple evidence. The renderer's dark request still shows the existing white design, so no native dark-mode certification is claimed. Native taps, scrolling/footer visibility, restoration, cancellation and store confirmation are NOT_RUN. Publication remains BLOCKED on applicable store/commercial/native evidence and authorization. Checkout remains OFF.

Both canonical legal URLs returned HTTP 200 with application/pdf during this pass. That verifies link availability, not a new legal-policy approval.

## Repaired defects and identity results

| ID / severity | Root cause and repair | Executable evidence | Disposition |
| --- | --- | --- | --- |
| RC-V2-RESTORE-01 / P1 | A caller timeout released the SDK queue while restore could still run under the original account. `src/monetization/revenueCatClient.ts` now quarantines all account mutations/paid operations until native restore truly fulfills or rejects. Immediate account invalidation remains in place; late results never publish the old account. | Two new timeout/switch tests failed on baseline (B could identify while A restore remained pending), then passed for both native completion and late rejection. Same-account retry, ordinary errors, existing iOS/Android restore handling and identity deadline tests preserved. | Source FIXED; native verification NOT_RUN |
| RC-V2-ENV-01 / P1 | `parseSubscriberResponse` accepted a subscription from the other store environment; null-expiry records without subscription evidence could default to Production. The parser now requires explicit store-environment evidence matching the deployment before writing any entitlement projection. | Three new service-level regressions failed on baseline, then passed: sandbox into Production, Production into Staging, and null-expiry/missing environment. Valid matching-environment subscriptions, refunds, grace, expiry, renewal and existing supported null-expiry records retain tests. | Source FIXED; all four Staging functions deployed/read back; Production NOT_DEPLOYED |
| RC-V2-OFFER-01 / P2 | An intro_offer condition also covers paid introductory pricing, but draft copy asserted “free.” Replaced with store-provided offer price and neutral CTA. | Full draft component/localization readback; rendered offer preview. Published tree unchanged. | Draft FIXED in revision 14; publication BLOCKED |

The environment guard rejects unsupported non-expiring records rather than guessing provenance. No lifetime native SKU is advertised; implementing a new one-time-product contract would be a separate product change. Reconciliation failures preserve existing projections and report failure; they do not invent an entitlement. Existing staleness/needs-reconcile/lifecycle controls still apply. Current aggregate live projections showed **no granted Production entitlement**: Production has one reconciled free row. Staging has one reconciled free row plus one historical TEST_STORE fixture row, structurally ignored while fixtures are OFF. No private account values or historical customer events were exported or replayed.

Identity contracts remain unchanged: canonical Supabase account UUID; no anonymous checkout; serialized native identity/purchase lane; actor/household lifetime guards and pinned JWT transport; server projection authorizes paid operations. SDK CustomerInfo is a display/reconciliation hint. Free, unknown, stale, deleted/pending, mismatched-household and consent-denied operations remain denied by existing server tests. Account switching discards display and pending results; restore failure cannot grant Premium.

## Webhook and lifecycle certification

| Capability | Source / private database | Actual RevenueCat-to-hosted delivery |
| --- | --- | --- |
| Authorization + raw-body HMAC + 300-second replay window | PASS | BLOCKED: secure matching auth/HMAC references unavailable |
| Durable event receipt / duplicate idempotency | PASS | BLOCKED |
| Out-of-order purchase, renewal, trial transition, cancellation | PASS | BLOCKED |
| Billing failure/grace, expiry, refund/revocation | PASS | BLOCKED |
| Transfers/ambiguous aliases reconcile exact UUIDs; anonymous identity grants nothing | PASS | BLOCKED |
| Backlog retry, CAS conflict recovery and dead-letter handling | PASS | BLOCKED |
| Provider entitlement reconciliation | PASS local handler/service contracts | BLOCKED for authenticated live certification |
| Account deletion overlay/customer cleanup interfaces | PASS existing regression contracts | Terminal deletion/real provider cleanup NOT_RUN; workers remain disabled/dry-run |

Staging sandbox `whintgr2afbbcfb32` and Production-only `whintgrf7d1c93842` are active with correct destinations and unrestricted event/app filters. Their names still say security setup pending. Read APIs do not disclose whether their stored Authorization/HMAC values match the backend secrets; do not rotate Production credentials or rename them to imply certification. Available MCP has no test-event-delivery tool. A locally signed handler request is not a genuine RevenueCat delivery.

Hosted event aggregate evidence remains historical: Staging three ignored TEST and three received TRANSFER deletion fixtures; Production one sandbox TEST ignored_environment. None proves native lifecycle delivery. Historical transfer fixtures were not replayed. Required controlled probe: RevenueCat dashboard-generated TEST to Staging, authenticated receipt readback, duplicate/retry evidence, then authorized sandbox purchase/restore lifecycle. Keep fixtures/test checkout/native checkout OFF until a separately scoped test gate requires otherwise.

## Backend deployment comparison and rollback

Only reviewed Staging changes are authorized in this lane. Production behavior, credentials, flags and identities remain unchanged.

| Function | Staging before | Staging after | Production observed | Production promotion |
| --- | --- | --- | --- | --- |
| premium-reconcile | 8 / a11446ac585c8c5244186817197eb908d0d6a281c6552b1b191ce059e6b35f1f | 9 ACTIVE / 8072bbb2aa44e0c667651f0d04c8aa0afaf76dbfa529449317cc4515ebcab38c | 6 / same pre-change hash | NOT_DEPLOYED |
| premium-gate | 7 / 689de7e4114d0a4df3b545bceddf6de1318145cb8eaef51d7179ad27842db7fd | 8 ACTIVE / d4d0c7a7237e2437ddf2704587972a84a4d620da714ddf7585d417b58d5ebc68 | 6 / same pre-change hash | NOT_DEPLOYED |
| revenuecat-webhook | 9 / 6438daa6300f8044904e43d4f2c0834aa44a2d63a58df47912747d7a19477351 | 10 ACTIVE / 5f174a96f9c23b3507b2e28c4910708e0cc62e5992d892d83bc93ecc3a35be28 | 6 / same pre-change hash | NOT_DEPLOYED |
| premium-ops | 9 / 1a48f11f642c5e00396f37e4889d0842d32a2450790616d804201935f27946d3 | 10 ACTIVE / c7b387347042f1607e497bb6e76115860ec6a8b95f74c88f9120454dba6b6222 | 6 / same pre-change hash | NOT_DEPLOYED |

All eight pre-change deployed bundles were fetched and compared to the candidate. Only `_shared/premium/reconcile.ts` changes executable behavior; other returned files match. Historical extra final newlines in some parser bundles were identified as whitespace, not a separate drift defect. Candidates include the existing source deno.json/deno.lock to preserve locked dependencies. JWT verification stays true for gate/reconcile, false for webhook/operator functions with their own required credentials.

All four Staging deployments were read back: **10/10 reconcile, 11/11 gate, 13/13 webhook and 13/13 operator returned source files match their submitted candidates**. All ACTIVE with preserved JWT configuration. Each unauthenticated POST returned 401; webhook/operator GET returned 405. Full successful authenticated reconciliation and real RevenueCat delivery are BLOCKED, not certified from startup. One gate deployment attempt returned connector internal error and subsequent reads failed. After access recovered, independent function inventory and bundle readback confirmed gate was still version 7 with its old hash; only then was deployment retried successfully. No successful result was inferred from a failed response.

Both live runtime rows were reread: premium_enabled=true, webhook_processing=true, checkout_enabled=false, test_store_checkout_enabled=false, allow_test_fixtures=false. No flag was changed. No migration, schema, RLS or user entitlement write occurred. Security advisor findings were inspected: service-only Premium tables intentionally use RLS without client policies, and authenticated definer RPCs require their existing ownership checks. Other shared warnings (pg_net schema and leaked-password protection) are carried to the shared owner, not fixed by relaxing RC controls. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Rollback: exact eight pre-change bundles are retained outside Git at `%TEMP%\herkeys-rc-completion-20261113\before-bundles.json`; reviewed Staging candidate bundles are adjacent in staging-candidate-bundles.json. Source before-image is immutable starting SHA 4f17b917ce8c30c6890c9b2819c191636208d6d6. Redeploy only the relevant prior bundle with its recorded JWT setting, then verify ACTIVE, hash/content, authentication refusal and runtime gates. No data rollback is needed. Rolling back restores the environment defect; prefer a forward repair. Paywall rollback uses editor version history to restore draft 13; no published content changed. No credential rollback is needed.

Production approval-ready plan: after complete Staging readback and authenticated regression, deploy the exact four reviewed RC bundles, preserving JWT and all existing secrets/switches. Compare current Production before-images again immediately before promotion, require the task's specific Production authorization, read back every returned dependency and hash, probe authorization refusal, then verify a controlled real-account reconciliation without synthetic Production entitlement grants. If deployed bundles drift, stop and review the new diff. No commercial activation is part of this promotion.

## Regression and source evidence

- Full local regression at repair commit: **5,609 passed, 0 failed, 0 skipped, 0 cancelled**; 1,114 suites, serial resource-aware execution, 336 seconds.
- Relevant RC/webhook/identity/platform tests: **513 passed, 0 failed/skipped**. Targeted restore/readiness: 23 passed; reconcile/webhook/period: 57 passed (subsets, not additive totals).
- TypeScript, release identity, Meals boundary, Expo SDK57 compatibility and native introspection PASS; Expo Doctor **21/21**. Installed RC SDK/UI both 10.9.1, Expo57.0.33. Dependencies and npm10 lockfile unchanged.
- Dependency audit: six remaining entries, 0 critical / 3 high / 3 moderate. decode-uri-component/query-string/Router remains an open dependency advisory despite source link guards; Expo fingerprint/minimatch tooling advisory also remains. No SDK58 migration or force audit update.
- Additional Docker parity runner could not start: Docker Desktop Linux engine pipe absent. Marked BLOCKED, not a test PASS. Full repository tests include real disposable PGlite SQL/CAS/RLS coverage; that does not replace a live provider delivery.
- Exact-head workflow dispatch [43485165645](https://github.com/herkeys/her-keys/actions/runs/43485165645) at repair commit **PASS**, including CI full regression 5,609/5,609, zero failures/skips, and 129 launch-critical checks. Final PR head and validation will be recorded in the PR after documentation is pushed. Workflow/boundary guard files were not edited.

Logs are outside Git: `%TEMP%\herkeys-rc-completion-{focused,full,boundary,parity}.log` and audit JSON. No passwords, JWTs, OTPs, HMACs, private keys or SMTP secrets were recorded.

Known open RC defect inventory after source repair: **0 P0; 2 P1 deployment/publication gates; 0 independently confirmed open P2/P3 source defects.** The P1 gates are Production's unpromoted environment guard and the defective published paywall. Native/store/credential checks remain BLOCKED or NOT_RUN and may reveal additional defects; these counts are not exhaustive commercial certification. The draft offer defect and SDK restore defect are repaired as recorded above.

## Cross-agent handoff and remaining gates

Claude owns general activation, auth, household storage and shared Production parity. **No shared source interface change is required by these RC repairs**; exports and response status unions remain unchanged. Consumers must continue treating invalid_response/provider failure as no new grant, and purchase/restore unavailable as a recoverable outcome. Test contract: no B identity mutation or paid operation until A's timed-out native restore actually settles; no cross-environment subscriber projection write.

Deployment coordination blocks complete RC certification: preserve this reviewed four-function promotion set, complete authenticated Staging regression, then obtain specific Production authorization. `rg` of actual imports shows reconciliation is used by these four functions; no Claude-owned screen or unrelated endpoint needs editing or redeployment for this repair. The report intentionally does not request changes to auth/onboarding/calendar/household files. Exact-head workflow_dispatch runs the existing workflow on this branch without changing shared CI triggers. PR #51 is for coordinated integration review; do not silently merge it during unresolved parallel integration.

External secure references requested: Apple key/issuer/vendor context; authenticated Her Keys Play Console or approved service-account reference; matching Staging webhook Authorization/HMAC, RevenueCat server API and operator secret references plus approved synthetic account access. None should be supplied as plaintext in chat. No currently verified reference was found or provided during this pass.

Native phase requirements remain: signed iOS/Android artifact from the coordinated final source; correct per-platform public key and backend profile; store sandbox/license testers and Play testing-track enrollment; monthly/annual offering read; eligible/ineligible offer rendering; purchase/cancel/restore on same and second device; A/B switch during pending transaction; trial renewal/grace/expiry/refund/revocation; real signed webhook receipt; backend reconciliation; cached/offline and deletion-pending denial; native legal/restore/dismiss visibility and subscription-management navigation. This pass generated no IPA/AAB and cannot label those tests PASS.

**RevenueCat engineering readiness: BLOCKED. Fully certified live subscriptions: NOT_RUN.** Source and draft repairs are concrete and tested; remaining live/backend/store gates must be cleared before claiming ready for native purchase testing. This lane does not certify the whole application as ready for independent platform audits; that convergence decision belongs to the shared integration owner.

---

# Prior integration evidence (historical; superseded by current results above)

No native purchase certification, paywall publication or store/product mutation in this pass. Checkout remains disabled.

Project proj93809efe; Apple app app55f51de583 (com.herkeys.app); Google app app3311d4868e (com.heykeys.app). Default offering ofrng40c3008072 is current, attached to paywall pw9aa8edf9bdb34338. Preserve these identities.

## Credentials and live products

Apple subscription key validation passes. App Store Connect API key is missing. Live product-state reads for monthly prod67a939caaa and yearly prod8423a82588 each return HTTP 422 explicitly requiring App Store Connect credentials. The intended reusable key is XTNYDBS8T8; its previously documented encrypted local path and exact-key-file searches in Downloads/Documents did not find private material. A secure location was requested; no secrets were requested in chat. No sibling Apple app in this RevenueCat project supplies a reusable key.

Google service account reads the catalog/base plans. Subscription-purchase permission validation remains unknown: the purchase API reports package not found. Store registration, permissions and native/sandbox evidence remain outstanding. Do not change the Android package as a workaround.

Live get-product-store-state responses at 2026-11-13T13:54:00Z:

| Product | Identifier | Base plan | Live US price | US availability | Trial |
| --- | --- | --- | --- | --- | --- |
| prod0b5bd5665b | monthly:monthly | monthly ACTIVE, P1M | USD 9.99 | enabled | monthly-free-trial ACTIVE, one P1M free phase |
| prod813df0d181 | yearly:yearly | yearly ACTIVE, P1Y | USD 79.99 | enabled | yearly-free-trial ACTIVE, one P1M free phase |

Monthly grace P7D; annual P14D. Both acquisition rules use anySubscriptionInApp. Returned regional maps contain US; do not infer other territories. Eligibility must still come from the store for the actual purchaser. RevenueCat catalog subscription metadata alone was not used as store-price/trial evidence.

## Paywall

Read the full published revision 12 and draft revision 13 component trees and localization bindings. Rendered draft light/no-offer. Renderer values are not native certification.

Published revision 12 has confirmed defects: Terms and Privacy both point to https://example.com; visible video-content claim is unsupported by the product contract; a web-checkout action says “Or, save 30%” without validated commercial support. Keep access gated until a validated correction is published.

Draft revision 13 has the Her Keys Premium title, three supported capabilities (Daily Load proposals approved by the user, consented Smart Inbox, Momentum reviews), annual default selection, dynamic store price/period bindings, renewal wording, purchase/dismiss/restore actions and canonical legal PDFs. No reachable video row or web-checkout/savings action. Old video/savings localization strings are unused; they are not visible draft defects.

The draft intro-offer variant says free/Start free trial. Google offers inspected here are free; Apple offers remain unverified. Do not certify both stores' trial language until Apple is checked. A future paid introductory offer must not use a free-trial claim. The screenshot confirms ordinary-plan copy, CTA and legal links; native restore visibility/interaction, scrolling, eligibility, dismissal/error handling and rendering remain NOT_RUN. Configured actions alone do not prove those native interactions.

Publication BLOCKED pending Apple product/offer validation and required commercial/native evidence. No change was justified solely by unused localization strings. Branding and product identities preserved.

## Webhooks and gates

Staging sandbox whintgr2afbbcfb32 and Production whintgrf7d1c93842 point to their intended Supabase environments and are active. Signing/authentication, delivery, lifecycle mapping, idempotency/replay, reconciliation and failure recovery remain to be challenged; configuration alone is insufficient evidence.

Both live environments: premium_enabled=true, webhook_processing=true, checkout_enabled=false, test_store_checkout_enabled=false. Production allow_test_fixtures=false; Staging true. Daily Load Premium, Smart Inbox and Momentum are enabled/released in both. These are configuration observations, not proof of a purchase or completed Premium journey.
