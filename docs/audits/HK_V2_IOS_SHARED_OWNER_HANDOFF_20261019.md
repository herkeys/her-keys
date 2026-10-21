# Her Keys V2 — Shared/Backend/Store Handoff from iOS Audit (2026-10-19)

## Boundary and current source

- iOS nominated candidate: \`repair/v2-ai-reporting-and-prod-convergence-20261017\` @ \`559e50cdc99e7858b2b259f330a0fe2f8aa87513\` (PR #35, draft/unmerged).
- iOS isolated repair branch: \`audit/ios-v2-pr35-readiness-20261019\`. All app and backend shared source edits **prohibited** in this iOS pass.
- PR #36 \`audit/ios-v2-photos-permission-20261019\` branches from **older** \`integration/build2-shared-consumer-repair\` at \`c660e5927c934f7bd2c172df5fb691e2075d40ee\`; leave unmerged and do not treat it as the current unified source.
- K Scan PR #633 and K Scan repositories are separate; no modification or deployment made in this audit.

## Priority 1 — Current CI failures (SHARED + DELETION)

**IOS-V2-004 / P1 — Account-deletion failing tests.** Owner: account-deletion engineering + V2 Build Manager. [Exact SHA CI 39091377651](https://github.com/herkeys/her-keys/actions/runs/39091377651): 5,152 total, 5,141 pass, 11 fail; eight failing assertions belong to deletion. CI log shows \`unclassified_resource\` during complete cleanup, shared policy and all-43-resource isolation; \`terminal_verification_failed\` during proof/absence assertion. Location: account-deletion suite \`tests/accountDeletion/*\` (exact particular file paths to be fixed by deletion owner from logs) and server deletion/resource registry. Repair: reconcile exact resource ownership classifications against schema/fixture and ensure terminal proof follows actual Auth absence and independent resource verification; do not relax guards or falsify terminal proof. Tests: rerun all eight, A/B household isolation, all 43 registered resources, purge receipt proof, shared-member preservation, retries, real synthetic deletion lifecycle. Production irreversible deletion remains OFF.

**IOS-V2-005 / P1 CI / P2 customer impact — Premium Home three failures.** Owner: Premium client + monetization shared layer. Location \`tests/premiumHome/home.test.mjs:131-165\`, \`src/features/premium/usePremiumHome.ts:37\`, \`src/monetization/PremiumStateProvider.tsx:247-295\`, and \`src/monetization/premiumHomeCopy.ts\`. CI: expected \`manual_upgrade\` placement not called; actual empty list. Copy asserts for cancellation (\`No purchase was made\`) and no offering (\`isn’t available to purchase right now\`) fail against an unavailable generic notice. Strong candidate hypothesis: \`canOfferPurchase()\` server readiness/checkout fails closed even under tests expecting a purchase; fixture and legitimate checkout-OFF behavior need independent adjudication. DO NOT disable purchase-readiness checks simply to pass tests. Repair test fixtures/contract when they no longer reflect the intended commercial guard, or fix genuine logic/copy defect; add real no-offer/cancel/identity-drift negative controls. Rerun the full suite, not just the 3 cases.

## Priority 1 — Apple RevenueCat commerce (REVENUECAT / APP_STORE_CONNECT)

**IOS-V2-002 / P1.** RevenueCat project \`proj93809efe\`, iOS app \`app55f51de583\` (\`com.herkeys.app\`), as read 2026-10-19:
- \`app_store_connect_api_key_configured=false\`; \`subscription_key_configured=true\`. Apple subscription group lookup returns HTTP 422 missing ASC API credential.
- Zero iOS App Store products in RevenueCat.
- Current offering \`ofrng40c3008072\` and \`her_keys_plus\` entitlement refer only to Test Store (\`app3bba22bc6a\`) monthly/yearly/lifetime items; published paywall exists but that does not prove native Apple products.
- Required owner actions: confirm App Store Connect account/paid agreements, Apple product/group/storefront/metadata state (not observable through RC presently), configure ASC credential, import existing approved Apple products and map them to correct entitlement/offering while preserving approved prices and trials. Do not invent SKUs, plans, prices or trial durations. Confirm StoreKit sandbox purchase, cancellation, restore, refund, app reinstall, cross-account identity and backend entitlement reconciliation with actual native iPhone build. Do not enable checkout until approved positive proofs.

**IOS-V2-013 / P2 — Billing webhook positive path unproven.** Owner: billing backend. RC integration destinations exist for sandbox Staging and production Production. Production \`premium_events\` held a **SANDBOX/TEST/ignored_environment** record and one entitlement projection as of this audit; this is evidence that sandbox events did not become Production billing, NOT proof of a real Apple paid transaction. Execute provider-originated signed sandbox events with idempotency/replay/invalid-HMAC checks, reconcile one controlled authorized test account, verify revocations and signed production delivery separation. Avoid writing fake customer entitlements.

## Priority 1 — Deletion service (BACKEND + APPLE REVIEW)

**IOS-V2-003 / P1.** Live Production \`public.account_deletion_control\` returns \`enabled=false\`, \`dry_run=true\`, \`last_run_at=null\`; functions exist but no verified purge path. iOS settings source \`src/features/account/DeleteAccountPanel.tsx:17-33\` is present (not missing). A rendered request UI plus inactive processor cannot be marked end-to-end Apple compliant. Owner must certify in a controlled environment (no real user irreversible deletion): deletion initiation and recent authentication; recovery window/status; full purge, Apple credential revocation, RevenueCat identity erasure where applicable; terminal proof, isolation and reviewer-safe end-user path. Then obtain explicit activation approval. Do not turn off dry-run from this iOS audit.

## Priority 2 — AI reporting/moderation workflow (BACKEND / POLICY)

**IOS-V2-006 / P2.** Production includes \`submit_ai_response_report\`, \`list_ai_response_reports\`, \`review_ai_response_report\` RPCs and \`private.ai_response_reports\`; currently zero Production rows. App source \`src/features/ai-safety/AiReportPanel.tsx\` submits metadata-only report, not conversation body. Owner must confirm named reviewer, cadence, response SLAs, retention/purge policy and authorized signed-in iPhone submission/receipt/limit/retry; validate admin-only review and privacy policy disclosure. Server AI consent guard now unconditional with identical Production/Staging downloaded bundle hash \`6dc2998dd2b86faf54786aa9499ce8944c6fde47b87b64d560308a8877a30733\`. This closes prior server-toggle drift; source parity is not a complete iOS safety workflow pass.

## Priority 2 — Native and App Store responsibilities

**IOS-V2-007 / APP_STORE_CONNECT:** verify membership, team ID, existing version/build, accepted agreements, tax/banking, Apple subscription review/localization, screenshots, age-rating questionnaire, privacy nutrition labels, support/contact/reviewer account. Current authoritative ASC record is inaccessible via available connectors. Record exact observations before submission; do not guess values.

**IOS-V2-008 / SIGNING:** verify EAS profile \`preview\` is Staging/ad hoc internal, and \`production\` is store distribution; uploaded artifact must use Xcode 26+/iOS 26 SDK+, target iOS 13+, correct App ID and provisioning, generated privacy manifests, native entitlements; ensure no published build-number collision. No native signed IPA was produced during this audit.

**IOS-V2-009 / AUTH:** iOS Apple nonce code passes intended source checks (\`src/platform/appleProvider.ts\`), but private relay, credential capture/revocation, first/returning login and cancellation, cross-account household isolation, email-password/OTP recovery, Google PKCE callback all require authorized physical iPhone E2E.

**IOS-V2-011 / PRIVACY MANIFESTS:** inspect compiled \`PrivacyInfo.xcprivacy\` aggregation and required-reason APIs (including embedded RevenueCat/Supabase/Expo dependencies), ATS/encryption, and exact App Privacy declarations; no signed binary currently available.

**IOS-V2-012 / PREMIUM JOURNEYS:** Stage 1 \`daily_load_premium\`, \`smart_inbox_extract\`, \`momentum_report\` all marked \`enabled=true,released=true,rollout_status=general\` in Production with \`checkout_enabled=false\`. Demonstrate each authorized end-to-end iPhone execution and denial/no-consent/undo/household isolation. Backend flags alone do not prove consumer UI.

**IOS-V2-014 / LEGAL:** source \`src/config/legal.ts:9-12\` references the official terms/privacy PDFs; the public PDF URL fetch failed in this audit environment, so HTTP accessibility, content accuracy and AI/reporting retention clauses remain NOT_VERIFIED. Legal owner to verify exact active PDFs and compare against third-party processing.

## Reopen gates

1. Exact unified SHA CI green, 0 deletion and Premium Home fails without any waived assertions.
2. Review/merge isolated iOS Photos purpose fix through Build 2 Manager only, then recertify resolved Info.plist with Expo/native build.
3. Apple RC catalog + ASC credentials + sandbox StoreKit proof; no checkout enablement prior to explicit approval.
4. Safe deletion end-to-end certification, monitored AI reporting, current policy metadata; precise iPhone review.
5. Internal EAS build may be separately approved for evidence gathering before commercial/App Store completion **only after signing/environment safety and consolidated exact SHA review**.

No shared or Production changes were performed in this iOS audit.
