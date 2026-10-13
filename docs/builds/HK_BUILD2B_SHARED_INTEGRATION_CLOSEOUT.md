# Build 2B shared integration closeout

This source closeout repairs the two demonstrated shared consumer-exposure gaps from the Android audit. Systems now lets a
consumer select an existing child or the whole household using its existing domain contracts. Returning account holders can
restore purchases from Your Account after onboarding, with account-aware SDK operation guards and explicit feedback.

Baseline: Android audit `308551bac7b609234dfe440a40bd1096720a08fe`, a descendant of the latest Build 2A branch at entry.
Implementation: isolated managed worktree `build2b-shared-closeout`, branch `codex/build2b-shared-integration`.

Read [the individual repair ledger](../audits/HK_BUILD2B_SHARED_REPAIR_LEDGER.md) for commits, evidence, account ownership,
A/B/C restoration scope, paid-benefit/account-deletion reconciliation and remaining runtime work.
Read [the release branch proposal](../release/BUILD2B_RELEASE_POLICY_PROPOSAL.md) for the exact single-branch policy diff.
The final exact-SHA source/CI certificate is saved alongside local audit logs in `audit-evidence/FINAL_SHARED_CERTIFICATION.md`;
it is an output artifact outside the source tree tracked by Git, so recording final CI does not create a new uncertified SHA.

The release proposal is **AWAITING_OWNER**. The existing release guard is unchanged, and no EAS/build/store action is
authorized by this source closeout. `ANDROID_EAS_CANDIDATE_READY=FAIL` while the policy/preflight gate remains unresolved.

Source repairs and focused checks:

- N01: 55/55 Systems interaction/model/durability/account-backed sync checks, including Android/iOS create/edit/clear,
  missing child, stale editor, failed storage and restart.
- N02: 86/86 restore/account/monetization/Welcome Premium checks, including both platforms, canonical entitlement refresh,
  wrong/anonymous identity, serialized account changes, single-flight UI and late-result/unmount protection.
- Returning-user A/B: 62/62 source state/transport/account-isolation checks. Existing narrow pristine-device adoption is
  preserved; general cross-device migration/recovery is **DEFERRED** and no architectural expansion was made.
- TypeScript passes on the changed source. Full suite, parity, Expo checks and exact-SHA GitHub CI are recorded in the final
  certificate. Only that certificate's actual final results establish those PASS claims.

All verified Build 2A source and the Android compact-button repair remain in the candidate. No Welcome Tree flow/order/copy,
iOS implementation, backend/schema/RLS, signing/application identifier, live RevenueCat product/configuration, or production
identity was changed. Account deletion and accurate paid-benefit delivery remain mandatory before store release; they are
not falsely certified by a restore UI or entitlement receipt. Native sandbox certification remains **NOT RUN**.
