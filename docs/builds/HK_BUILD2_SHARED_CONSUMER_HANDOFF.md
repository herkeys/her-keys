# Build 2 shared consumer blocker repair — handoff for final convergence

Date: 2026-10-13. Branch `integration/build2-shared-consumer-repair` (pushed, **not merged**, no PR). Per-repair detail, the Premium
benefit map, the owner decision register and the full unresolved list are in
`docs/audits/HK_BUILD2_SHARED_CONSUMER_REPAIR_LEDGER.md`. The release-branch policy patch is in `docs/release/`.

No EAS command was run. No merge into Production, no backend change, no RevenueCat dashboard change, no store or Supabase setting change.
`app.json` was not edited by this work (its only change on this line is the merged iOS audit commit `26dbbbe`, light appearance). The deletion workstream, the Welcome Tree workstream, iOS native permissions, Apple credential handling and the
Production schema/RLS/functions were not modified.

## Verdicts

```
SYSTEMS_CHILD_CHOOSER=PASS
RESTORE_PURCHASES_SOURCE=PASS
PREMIUM_BENEFIT_PARITY=OWNER_DECISION
RETURNING_USER_RESTORE_SOURCE=PASS
CONSENT_RECOVERY_UX=PASS
TALK_IT_OUT_SHEET=PASS
RELEASE_BRANCH_POLICY=OWNER_APPROVAL_REQUIRED
ANDROID_IOS_REGRESSION=PASS
EXACT_SHA_CI=PASS
SHARED_CONSUMER_BLOCKERS=REMAINING
```

`PASS` on a repair means **source** evidence only: real components or runtime driven by scripted boundaries. Native sandbox purchase/restore,
physical-device keyboard and font behavior, live Supabase reads and live two-device adoption are **NOT RUN** and are listed as such.

Why `SHARED_CONSUMER_BLOCKERS=REMAINING` (and not RESOLVED): every authorized repair is done, but three shared items still block a **paid** or
**store** release and are not engineering-only: no feature is gated on `her_keys_plus` (U-01, owner decision), Restore Purchases still has to be mounted
in Settings by the deletion workstream (U-02), and native store behavior has not been exercised (U-03). Do not claim paid-release readiness.

## What changed, by commit

| Commit | Item | Summary |
|---|---|---|
| `ddf06cf` | merge | iOS audit `925a9b4` merged into the shared line (`ad72ccd`, which already contains the Android audit `308551b`, the Systems chooser and the SDK identity guard). Clean merge. |
| `8130116` | SC-02 | `useRestorePurchases` + `RestorePurchasesControl` extracted from the route; chooser radiogroup semantics |
| `e6e9ff0` | SC-01 | child association pinned through sync projection/apply |
| `6331948` | SC-06 | Fix sheet: scrollable, keyboard-aware, Apply pinned; iOS gap SH-04 removed |
| `b294ecd` | SC-05 | consent gate: Try again / Sign out / bounded read / account-keyed state |
| `49ff56c` | SC-04 | account copy states the real new-phone rule |
| `0de6c25` | SC-03 | every paywall outcome in words; undelivered benefit claims removed; audit pinned as tests |
| `36e85b5` | SC-07 | release policy patch prepared (not applied); CI trigger |

## Instructions for the other workstreams

**Deletion / Settings engineer.** Mount `<RestorePurchasesControl accountId={boundAccountId} onRestoringChange={…} />` once in the permanent Settings surface and hold
Sign out, Delete account and Done while it reports `true`. Retire `AccountPanel`'s interim restore entry at the same time. This branch edits three lines of
`AccountPanel.tsx` (two ledes, one comment). Details: ledger §6.2.

**Welcome Tree owner.** Exact proposed replacements for `accountChoice.lede`, the shared `CROSS_PLATFORM_NOTE`, the Premium offer copy and the three tests
that pin the old words are in ledger §6.1. Nothing under `src/features/welcome/` changed; `tests/platformParity/returningUserCopy.test.mjs` lists the Welcome-owned
strings and fails on any new unavailable-restoration claim elsewhere.

**Final convergence.** Merge order is not constrained by this branch, but note: (a) this branch and the deletion branch both contain `ad72ccd`; (b) the Welcome
branch's tests pin copy that SC-04 deliberately does not touch; (c) `PremiumCheckoutAfterConsent` now renders a banner, additive and non-blocking, with the
existing 26 welcome-premium tests passing unchanged; (d) the boundary scan lane `HK-BUILD2-SHARED-CONSUMER` must be carried with the merge.

## Behavior changes a reviewer should know about

1. **Consent gate state is keyed to the account, not the token pair** (SC-05). Previously a token rotation re-ran the consent check and unmounted the whole
   navigator. This is a deliberate, narrow behavior change made because Retry would otherwise have recurred hourly. Fail-closed is unchanged.
2. **The onboarding Premium step no longer lists benefits** and its Explore button no longer disappears when the offering is unavailable (SC-03). The paywall stays reachable.
3. **A post-consent welcome checkout that cannot open now shows a dismissible banner** under the status bar (SC-03).

## Gate evidence

Code state `842b23f9223f0c81f1df2fbb0934ceceb26ab08c` (everything after it is documentation).

| Gate | Result |
|---|---|
| Exact-SHA GitHub CI, workflow "Her Keys V2 Integration Gate", run `38493190846` on `842b23f` | **success**: backend boundary protection, release identity, TypeScript, full application suite, `expo install --check`, Expo Doctor, public and introspected config |
| `tsc --noEmit` (local) | exit 0 |
| `npm run verify:release-identity` (local) | `RELEASE_IDENTITY=PASS` (Android `com.heykeys.app`, iOS `com.herkeys.app`, EAS project unchanged) |
| `npm test` (local, Node 24 / npm 11) | 4110 / 4112 pass. The 2 failures are the Meals boundary scan checks BV1 and BV7 **only** because a stale local branch ref (`feature/herkeys-email-password-20261008`, `42f1673`) is checked out in another worktree; the scan's only finding is that "lane claims a change the branch never made". With those stale claims filtered, the scan reports zero findings. The same tests pass in CI's fresh clone |
| `expo-doctor` | 21 / 21 |
| `expo install --check`; `expo config --type public`; `expo config --type introspect` | clean / resolve / resolve |
| Baseline for comparison (merged tree before any change) | 4061 tests, 4058 pass; same BV1/BV7 and one wall-clock timing test (calendar combinatorics) that did not fail in the final run |

New or extended tests: restoreControl 8, consentRecovery 14, premiumFeedback 14, returningUserCopy 3, subject.sync 5, talkItOutCapture.ui +6 (SC-06). Mutation checks: consent 6/7 killed (1 equivalent), premium 9/9, Fix sheet 1/1.
Focused regressions run and passing: platformParity (all), tests/ios (3 files), systems (all), accountRuntime 32, syncComposition 55, routeAccess 19, monetization 23, welcomePremiumFlow 26, welcomeAuthShell/Flow, releaseIdentity 10.

Not run (and not claimed): native sandbox purchase/restore/paywall; physical-device keyboard, IME, large-font and small-screen passes; live Supabase consent reads; live two-device household adoption; native iOS/Android builds; the Docker backend harness (a shared DB other sessions use).
