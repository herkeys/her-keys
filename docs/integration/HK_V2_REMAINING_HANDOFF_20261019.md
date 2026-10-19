# Remaining platform and external handoff — October 19, 2026

Shared repairs are in [Draft PR #38](https://github.com/herkeys/her-keys/pull/38), final executable commit `c66caeccc72951d46470eef8eb94fb8fe388f239`. These are eight distinct handoffs, not eight outstanding shared-source defects. All device execution is DEVICE_TEST_PENDING. No EAS build or release is authorized by this report.

## 1. iOS owner — SHR-V2-005

PR #37 is a sibling of this repair, based on `559e50c`, with head `3bbc68b590c1ba160c2cb0e96e3488d873984c9d`. Its four paths are `app.json`, two iOS audit/handoff documents, and `tests/ios/nativeConfig.test.mjs`. The iOS/Build Manager retains Photos-purpose-string review and integration authority. This sprint changes none of them. After convergence, execute Apple sign-in, restore/purchase identity, account switches, AI reporting, Stage 1 UI and save/export behavior on the real device/store configuration. Bundle ID stays `com.herkeys.app`.

## 2. Android owner — SHR-V2-006

Validate Google OAuth/callbacks, password/verification/recovery, switching/logout, Free access with checkout OFF, Premium denial/verification, consent/reporting and three Stage 1 device journeys on the final shared source. Confirm `com.heykeys.app`; do not normalize it to the iOS identifier. Native store interaction remains pending owner configuration and build authorization.

## 3. Apple billing catalog — SHR-V2-007

RevenueCat `proj93809efe`, app `app55f51de583`, bundle `com.herkeys.app`: no App Store products registered; App Store Connect API key not configured; subscription key configured. Apple/store owner must provide approved actual App Store product identifiers and credential relationships, verify product availability, and map the approved products to the intended entitlement/package/offering. No SKUs, prices, products, trials or credentials were created or changed here.

## 4. Google billing catalog — SHR-V2-008

RevenueCat app `app3311d4868e`, package `com.heykeys.app`: no Play products registered; Play service-account credential configured. Google/store owner must establish approved real products/base plans and their entitlement/package/offering relationships and availability. A configured credential alone does not prove a usable catalog.

## 5. RevenueCat fulfillment and certification — SHR-V2-009

Current `default` offering `ofrng40c3008072`, paywall `pw9aa8edf9bdb34338`:

| Package | Package ID | Only attached product | App |
|---|---|---|---|
| `$rc_monthly` | `pkgefa04de4299` | `prod610eb92af6` / `monthly` | Test Store `app3bba22bc6a` |
| `$rc_annual` | `pkgee00df65b84` | `prod4834df1fd3` / `yearly` | Test Store |
| `$rc_lifetime` | `pkge40d8807508` | `prod192993ad34` / `lifetime` | Test Store |

These relationships do not certify native Apple/Google purchases. After approved native catalog setup, the operator/platform owners must demonstrate account UUID identity, actual store result, provider-originated signed delivery, durable idempotent receipt, v1 subscriber lookup, correct server entitlement, restore and UI authorization with genuine approved test accounts. Include authenticated Ops, bad auth/HMAC rejection and environment separation. This sprint proved source contracts, current invalid-auth 401s and existing ignored test receipts; it did not execute a new valid signed event or authenticated Ops call.

Keep both `checkout_enabled=false` and all business rules unchanged until the separately authorized owner decision. Never grant a paid Production entitlement by test flag or direct write.

## 6. AI reporting policy and operations — SHR-V2-010

Production reporting RPCs and private queue are installed; do not replay their migrations. Local real-SQL and mounted UI regressions pass. Production currently has zero queue receipts and zero server-authorized reviewers. Staging has six receipts, five pending, and also zero configured reviewers. Daily cleanup is active at 03:19 UTC; the current schema expires metadata after 30 days.

Product/policy/privacy/operations must decide and record:

1. Named accountable reviewer and approved server-owned permission assignment; no self-assigned client/JWT metadata authority.
2. Actual review cadence, backup coverage and response/escalation procedure. No human-review promise until staffed.
3. Approval of the existing 30-day metadata expiry, daily cleanup and exception handling, with accurate privacy disclosure and versioned consent copy. Source/runtime mechanics alone are not policy approval.
4. An approved signed-in consumer-to-queue-to-authorized-reviewer rehearsal, including retries, duplicate key, quota, unauthorized reviewer and disposition evidence. Use synthetic content; no conversation bodies or model output attachments.

Current affirmative AI Processing consent, withdrawal and account ownership remain enforced by the AI server path and covered by source/SQL contracts. Metadata reporting does not send content to an AI provider. Native Report-action placement and the complete Production consumer/review journey are still pending.

## 7. Backend deployment manifest — SHR-V2-011

No backend code, migration, deployment or operational setting changed here. Existing AI bundle hash is identical across environments and the handler matches current source. Webhook/Ops bundle hashes differ: Staging v7, Production v5, with the existing staging HMAC guard difference; both enforce HMAC in their actual Production configuration. Bundled admin-helper versions differ from current source. Staging `premium_authorize` also retains the intended server-owned staging tester gate absent from Production.

The backend owner/Build Manager must record the intended per-environment source/deployment manifest and reconcile its ownership before any separately approved promotion. Preserve all installed safeguards and independent lifecycle ownership. There is no authorization here for blanket redeployment, weakening HMAC, changing rollout, or reapplying installed reporting migrations.

## 8. Build Manager integration controls — SHR-V2-012

Keep PR #38 Draft until its current exact head is validated and integration order is confirmed. Review the attached manifest and final PR head, retain PR #32/#34/#35 ancestry, and integrate the iOS sibling only under its owner's authority. Rerun all gates at the actual converged SHA. Release allowlist currently contains only `build/02-gemini-integration`; this repair did not change it.

Overall CI remains FAIL solely for the independent account-deletion workstream. That ownership remains separate; this document gives no deletion implementation instructions. Shared repair review may proceed while that dependency is unresolved. EAS, checkout activation, store submission, merge and public release each remain separately governed.
