# RevenueCat continuation — 2026-11-14 (UTC evidence through November 15)

**Current engineering readiness: BLOCKED. Live/native subscription certification: NOT_RUN.** This section supersedes the historical November 13 status below. Scope is RevenueCat only; Claude owns shared application activation. Checkout, test checkout and fixtures remain OFF in both environments; deletion workers remain disabled/dry-run. The owner specifically authorized the two-function Production repair described below. No IPA/AAB, commercial activation or paywall publication occurred.

## Source and validation checkpoint

PR #51 is merged (merge `632bf552cdf2e8f5c58c1ffabc253c62cf884498`). The user merged PR #61 into integration at **`86e41f1e4d5ba0da56a503e602cbb2dae2e73056`**; merge-head [CI 43667344764](https://github.com/herkeys/her-keys/actions/runs/43667344764) passed. This continuation uses that verified base in the dedicated `C:\Users\jsmit\Her-Keys-RevenueCat-V2` worktree, branch `codex/v2-revenuecat-continuation-20261114`. Original/Claude worktrees were not edited.

Repair commit **`25cebea0dbefdd4607288082877e8e8b10496223`**, [PR #62](https://github.com/herkeys/her-keys/pull/62), targets the authorized integration branch. Its exact-head [dispatch 43667775686](https://github.com/herkeys/her-keys/actions/runs/43667775686) and [PR validation 43667775869](https://github.com/herkeys/her-keys/actions/runs/43667775869) passed. The documentation checkpoint and its exact-head checks are recorded on the PR. Leave this PR for coordinated integration review; this agent has not merged it.

| Validation | Actual result |
| --- | --- |
| Full local source regression | **PASS: 5,688 passed, 0 failed, 0 skipped, 0 cancelled; 1,130 suites; 562.861 seconds; exit 0** |
| Focused webhook/authentication/reconciliation | **PASS: 70 passed, 0 failed/skipped/cancelled** |
| TypeScript / release identity / Meals boundary | PASS |
| Expo SDK 57 compatibility / Expo Doctor | PASS / **21 of 21** |
| Dependencies / npm 10 lockfile | Unchanged; Expo 57.0.33 and RevenueCat SDK/UI 10.9.1 preserved |
| Refreshed npm audit | Six entries: 0 critical, 3 high, 3 moderate. Router/decode-uri-component/query-string advisory remains OPEN despite source mitigation; fingerprint/minimatch tooling entries remain. No SDK 58 migration. |
| Native purchase, restore, renewal and device switching | NOT_RUN; no signed artifact generated |

Logs: `%TEMP%\herkeys-rc14-full.log`, `herkeys-rc14-webhook-focused.log`, `herkeys-rc14-audit.json`. Full regression includes the relevant RevenueCat, SQL authorization, entitlement, identity and lifecycle contracts; it does not replace hosted provider or native evidence.

## New defect and repair

**RC-V2-WEBHOOK-RECOVERY-01 / P1:** the initial authenticated webhook path records a foreign-environment event durably, then tries to classify it `ignored_environment`. If that classification write fails, the row stays `received`. Backlog recovery previously called `processStoredEvent` without checking the environment again, allowing subscription projection writes or transfer identity/reconciliation side effects from the other environment.

Repair: `_shared/premium/webhookHandler.ts::processStoredEvent` now enforces `acceptedEnvironment(deployment)` before account resolution, identity evidence, reconciliation or projection work. It classifies foreign events `ignored_environment` with no account binding. If classification storage still fails, existing bounded failure/retry behavior applies without processing that event. No exported API, schema, RLS, credential, flag or dependency changed.

Four new executable regressions in the existing `tests/premium/webhookHandler.test.mjs` cover INITIAL_PURCHASE and TRANSFER in both deployment directions. All four failed on merged baseline `86e41f1...`: purchase cases wrote projections; transfer cases wrote identity evidence. The repaired handler passes while classification storage is failing and after storage recovers, with zero projection/identity/provider side effects. Authentication and HMAC remain required; this is a recovery-boundary defect, not evidence that an unauthenticated request can grant Premium. Source FIXED, Staging FIXED, Production FIXED by the specifically authorized deployment below. Real store lifecycle certification remains separate.

## Actual signed provider delivery

The authenticated RevenueCat dashboard was available. Its Staging webhook `whintgr2afbbcfb32` is Active, Sandbox only, with a stored masked Authorization value and **HMAC signing visibly enabled**. Two dashboard-generated TEST deliveries returned **HTTP 200**, response `{"status":"ignored_test"}`. Hosted SQL independently verified exactly one durable receipt per event, SANDBOX/TEST, `ignored_test`, null account binding and no retry attempts:

| RevenueCat event ID | Received UTC | Processed UTC |
| --- | --- | --- |
| `849B21FF-7BE8-4119-BB63-554A271FC4D1` | 2026-11-15 02:37:26.729329 | 02:37:27.398327 |
| `7F9AAAA4-4FC5-4203-BE11-2E3ECA41D1D7` | 2026-11-15 02:38:09.415540 | 02:38:10.092898 |

The deployed runtime requires HMAC in Staging and Production; authenticated 200 plus exact bundle readback establishes that the Staging provider's Authorization and signing configuration matches the hosted verifier for these deliveries. No secret was read, rotated or exported. Staging projection count remained two (the existing free/historical-fixture rows), with fixtures OFF.

**Important limit:** “Resend Test Event” generated a *new* event ID. It proves repeated delivery, not same-event duplicate/replay handling. The ordinary dashboard event-history list showed no entries for these generated tests. Same-event hosted retry, captured-signature expiry rejection and real subscription lifecycle delivery remain NOT_RUN; source tests cover those contracts. Do not replay historical customer events.

Production webhook `whintgrf7d1c93842` is Active, Production only, with masked Authorization and HMAC signing visibly enabled. No Production test event was sent, so matching Production credentials and real authenticated delivery remain BLOCKED/NOT_RUN. Neither webhook was renamed to imply certification.

## Current deployed bundle comparison and rollback

Before the new repair, all eight current Staging/Production returned bundles were compared against the merged source. Every returned file matched after line-ending normalization. **Production already contains PR #51's reconciliation environment guard**; it was promoted outside this continuation. The older report's Production-NOT_DEPLOYED statement for RC-V2-ENV-01 is historical, not the current state. Different build hashes between environments alone are not source drift.

| Function | Staging before new repair | Staging current | Production current |
| --- | --- | --- | --- |
| premium-gate | v9 | v9 / `d4d0c7a7237e2437ddf2704587972a84a4d620da714ddf7585d417b58d5ebc68` | v8 / `0adcb188b7442c72ce928635a874cafcace63a6706b169fed008c4e1160b3c96` |
| premium-reconcile | v10 | v10 / `8072bbb2aa44e0c667651f0d04c8aa0afaf76dbfa529449317cc4515ebcab38c` | v8 / `28b774a942248a231a258eb6cf7e1c1b4c0d442d3d247267282de9797568cd1d` |
| revenuecat-webhook | v11 / `5f174a96f9c23b3507b2e28c4910708e0cc62e5992d892d83bc93ecc3a35be28` | **v12 / `16c6d6425f99bf8678175f297af94a3fa17c794172d2197125aef5b5ec95d0f1`** | **v9 / `0577ccab303d02e92e1b3bd7391b6c1758af3785a619d712e8538854b80b4ea2`** |
| premium-ops | v11 / `c7b387347042f1607e497bb6e76115860ec6a8b95f74c88f9120454dba6b6222` | **v12 / `e36d586b0cec8f849ad985b33a69a9d2ba88c8ac80569c4f9b3fc5b928ce554d`** | **v9 / `2df70b4302944e3f93cf152f67cf46b54dc1a9b8530511768215c8a2be9bc36e`** |

Only webhook and ops were deployed in each environment in this continuation, after focused regressions, TypeScript and health-advisor inspection. Each is ACTIVE; all **13/13 returned files per function per environment** match its submitted candidate. Existing `verify_jwt=false` is preserved, with mandatory handler Authorization/HMAC or operator authentication. Unauthenticated POST probes returned 401 and GET probes 405 for all four deployments. No historical backlog was processed. No database or entitlement mutation was performed to fake purchase evidence.

Exact rollback bundles: `%TEMP%\herkeys-rc-backlog-20261114\rollback.json`; reviewed candidates: adjacent `staging-candidates.json`. Source before-image `86e41f1e4d5ba0da56a503e602cbb2dae2e73056`. Handler SHA-256 before `3098efdaa48c95443d380c9baf6ff53cf872d306571081145d34fe0d67f68461`, after `e74f0a1eca652cd0cbb7cd7fc5fceed012aba13471c4e0aff760251da57e6033`. Roll back by redeploying the corresponding exact preimage with its JWT setting, then read back files/hash/ACTIVE and verify 401/405. No data rollback is necessary; rollback restores this security defect, so prefer forward repair.

**Authorized Production promotion completed:** the owner answered “Authorize the two-function Production repair” for commit `25cebea0dbefdd4607288082877e8e8b10496223`. Fresh Production preimages still matched v8: webhook hash `db054faa4b2fd98fd963b1aa69c0c14a28f70cca5ac09c2a8d2e3375d1b11a73`; ops hash `6d49abc974c1bb9f87450c698f0f2c5e652a49de01ab97ad00f18fc31e74b732`. The only changed source file in either bundle is `functions/_shared/premium/webhookHandler.ts`. Production preimages and candidates are retained at `production-rollback.json` and `production-candidates.json` in the same temporary artifact directory. Existing Production entrypoints, dependencies, JWT settings, secrets and switches were preserved.

Deployment timestamps: webhook **2026-11-15T02:51:30.321Z**, ops **02:51:37.090Z**. Both returned ACTIVE v9, independently read back 13/13 matching files, and passed the four 401/405 negative probes. Runtime readback at 02:52 UTC independently confirmed checkout/test checkout/fixtures OFF and deletion enabled=false/dry_run=true in both environments. Gate/reconcile were not redeployed. Rollback uses the corresponding exact Production v8 preimage, followed by content/hash/ACTIVE, refusal and control checks; no data rollback is needed. Successful authenticated Production reconciliation/delivery remains a separate live gate; none was inferred from deployment or refusal probes.

## Store, paywall and identity status

| Gate | Current evidence / result |
| --- | --- |
| App identities, offering and entitlement | PASS configuration: `proj93809efe`, Apple `app55f51de583` / `com.herkeys.app`, Google `app3311d4868e` / `com.heykeys.app`, `her_keys_plus`, current `default` / `ofrng40c3008072`. Preserved. |
| Apple App Store Connect credential | BLOCKED: still unconfigured, validation/product access HTTP 422. Need secure `.p8` reference for authorized existing key `XTNYDBS8T8`, issuer/team/app access and vendor context; minimum App Manager per linked historical credential documentation. Subscription key remains separate and configured. |
| Google credential | Catalog/base-plan access PASS; purchase validation still package-not-found. Dashboard identifies Cloud project `her-keys` and configured principal `revenuecat-service-account@her-keys.iam.gserviceaccount.com`. Private key material was not opened or copied. |
| Google live US products | Previously verified and preserved: monthly USD9.99/P1M; annual USD79.99/P1Y; ACTIVE free-P1M offers; P7D/P14D grace. Customer eligibility and purchase records NOT_RUN. |
| Google developer notifications | Dashboard has no connected topic; selector is unselected and Connect disabled. Cloud/Play topic and permissions require verification before configuration. [Official setup](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications). |
| Paywall | `pw9aa8edf9bdb34338` still published revision12, draft14. Published placeholder legal/video/savings defects remain; draft14 is corrected and unpublished. Actual Apple pricing/offers, native rendering/actions and commercial publication gates remain. No checkout workaround. |
| Restore policy | Dashboard readback: **Transfer to new App User ID**. No setting changed. Actual A/B restore/transfer lifecycle NOT_RUN. |
| Test-entitlement allowlist | Project setting reads **Anybody**. No setting changed; backend fixture/environment/checkout gates remain OFF. Approved tester allowlist/hardening is a coordinated configuration decision, not permission to use test entitlements in Production. |
| SDK/account/server authority | Existing source contracts PASS in full regression: canonical UUID binding, quarantined timed-out restore lane, immediate account invalidation, exact-account reconciliation, server-confirmed Premium access, failure/staleness/deletion denial. Native restart/restore/device proof NOT_RUN. |

The user opened an authenticated Play Console session for the existing Her Keys app, developer `5226893100792551856`, app `4974814352236449756`. The configured RC principal is **Active / Never expires**, explicitly associated with **Her Keys / com.heykeys.app**. Its permission dialog shows **View app information**, **View financial data** and **Manage orders and subscriptions** checked, inherited from account permissions. Admin and release-to-production/testing boxes are not selected. No permission or access change was made; Apply and Save changes remained disabled. The Google account/developer account is named K Scan, but the inspection was limited to the user-opened Her Keys app and its matching RC service-account grant; no K Scan Supabase credential was used.

The internal track has an **Untitled draft** with no bundle selected and Next disabled. Its existing artifact library contains an **App bundle, version code2, version1.0.0, API24+, uploaded October4,2026**. Thus “no first upload” is not established and must not be asserted as the root cause. The app dashboard shows store setup **8/14** complete, internal testing **2/3** complete and no completed rollout; the Monetize page says to finish app setup first. Correct package and purchase permissions are independently verified, while a prepared/approved testing release, completed applicable setup and an actual license-test purchase remain outstanding. [Official troubleshooting](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials/troubleshooting) also calls for completed release preparation and a sandbox transaction; catalog success alone does not certify purchase access. No permission escalation, package rename, upload, draft edit or release rollout was performed.

The Google notification topic is unselected in RevenueCat. Play's Monetization setup topic value was **NOT_RUN**: Windows Computer Use stopped because it could not verify the browser URL with sufficient confidence. Browser work ended; it was not bypassed with another automation mechanism. The already observed app/grant/artifact facts above remain valid. Production deployment continued independently through the authenticated Supabase connector after the owner's explicit authorization.

## Cross-agent contract and remaining gates

PR #62 changes only the RC-owned webhook helper, its existing tests and this RC report. It needs no shared source-interface change. The owner subsequently assigned RevenueCat activation to this agent and requested working Apple/Google checkout webhooks; that expanded ownership does not change the evidence or commercial safeguards recorded here. The full integrated candidate and general platform-audit readiness remain separate from this focused repair.

### Native checkout routing contract

Latest connector readback confirms both webhook integrations are **active**, with `app_id=null` and `event_types=null`: both Apple and Google apps and all lifecycle types are included. Production sends PRODUCTION to `npykvnxnehlsdlbumzwk`; Staging sends SANDBOX to `fhhudicklmpofuzkxeqe`. No per-platform filter is dropping one store. Both hosted handlers now include the repaired recovery guard. Changing webhook filters to send sandbox grants into Production would contradict the verified environment boundary and is not a checkout fix.

`premium_enabled=true` and `webhook_processing=true` already enable fulfillment in both environments. `checkout_enabled` controls new purchase presentation separately. Test Store checkout and fixtures are not prerequisites for Apple/Google billing; Production Test Store checkout is forbidden by its database constraint. Deletion workers are unrelated to checkout.

The existing EAS preview profile uses native store keys with Staging backend, but internal distribution (Android APK/iOS ad hoc). Production uses native keys, Production backend and store distribution. A future TestFlight or Play license-test artifact must deliberately pair native sandbox purchases with Staging; a Production-backend TestFlight build's SANDBOX purchase cannot be certified by accepting it as a live entitlement. Prepare an explicit store-distributed sandbox profile for the later authorized build phase, preserving both app identifiers. No build or profile mutation is included in PR #62. Actual checkout stays gated while the published paywall and live store/credential/native checks remain incomplete.

The separate Smart Inbox server-cancellation handoff requires design before implementation: the Claude-owned `smart-inbox-extract` entry point would pass an abort signal to RC-owned extraction/provider helpers. Current `premium_fail_usage` refunds both user quota and global cost units; automatically refunding after provider work has started would let cancellations evade global spend accounting. A correct cancellation contract must distinguish pre-dispatch cancellation from actual provider cost, preserve idempotency and account ownership, and test both. This repair does not change that interface or claim server-side cancellation complete.

Open confirmed RC P0–P3 inventory: **0 P0; 1 P1 operational gate** (defective paywall revision still published); the backlog guard is repaired in source and both environments. No newly confirmed open P2/P3 source defect. Apple credential, Google purchase validation/notification setup, Production signed delivery, live reconciliation and native lifecycle remain separate BLOCKED/NOT_RUN certification gates, not invented PASS results.

Next: coordinate PR #62 integration; resolve Apple secure-key reference; complete Play notification-topic inspection and an approval-ready Google Cloud/Play setup plan; let the release owner finish the applicable store/testing release gates after platform audits; certify exact-account reconciliation and controlled store sandbox lifecycle in the later signed-native phase. Keep all commercial switches OFF until the prescribed evidence and authorization exist. No native purchase, terminal deletion, release submission or broad application audit was performed by this checkpoint.

---

# RevenueCat completion agent — 2026-11-13 (historical)

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
