# Premium home and account management (WP-1) — 2026-10-15

Branch `feature/premium-home-account-20261014` (worktree `Her-Keys-PH01`), cut from `integration/premium-source-convergence-20261014`
ENTRY `95f6ad231a345f3b459931fd93ce7587e07b490d` (head verified against `git ls-remote` before work began).
Source-level evidence only: nothing here claims a native purchase, a store listing, a device pass or Production readiness.

## What a customer gets

Your Account (the existing `/sign-in` modal, reached from the Today header) now has a **Her Keys Premium** section, shown only when an
account is bound:

1. **Status** from the server's confirmed state, in one of eleven states: Free, Premium Active, Canceled but Active, Billing Grace,
   Verification Pending (four causes), Expired, Revoked, Service Unavailable, plus loading, signed-out and account-closing.
2. **The three Stage 1 tools** (Daily Load review, Smart Inbox, Weekly review): what each does today, where to find it, and
   whether it is ready, part of Premium, paused, or not switched on for her account (the server manifest can switch a tool off).
3. **Actions that fit the state:** See Her Keys Premium (store purchase interface), Check again / Try again, Manage subscription
   (the platform's own subscriptions screen) or Update payment method in grace.
4. **Restore purchases**, the one existing control, now directly beneath the section.

## Design decisions

- **Server-confirmed only.** `derivePremiumHomeState` calls the same `deriveFeatureState` every Premium feature uses, so the home and the
  features cannot disagree. The store SDK is a hint that can only produce "confirming"; it can never produce an entitled state.
- **No price in Her Keys.** Product pricing is rendered only by the store's own purchase interface (`presentPaywallIfNeeded` over the
  approved RevenueCat offering). The home and its copy reference no price, currency, offering or package; a source guard pins it.
- **One Restore control, one path.** The `RestorePurchasesControl` is mounted only by `app/sign-in.tsx` and is *moved*, not copied, into the
  Premium group. The home renders none. **Defect found and fixed:** the Daily Load and Momentum notices showed a "Restore purchases"
  button that actually called `upgrade.start()` (it opened the purchase paywall under a restore label). Those affordances now read
  "Restore in Your Account" and navigate to the single control (`openAccountToRestore`).
- **Manage subscription** opens `https://apps.apple.com/account/subscriptions` (iOS) or
  `https://play.google.com/store/account/subscriptions?package=com.heykeys.app` (Android); a test pins the package to `app.json`.
  Her Keys never cancels, refunds or changes a subscription itself.
- **Pass A protections preserved.** The provider's account fences, `isCurrent()` checks and the restore hold (Sign out, Done and Privacy &
  Data stay disabled while a restore is pending) are unchanged; the new actions are also held while the host is busy.

## Files

| File | Change |
|---|---|
| `src/monetization/premiumHomeState.ts` | new: the single home state, derived from the server |
| `src/monetization/premiumHomeCopy.ts` | new: every word, the three tools, capability status |
| `src/monetization/subscriptionManagement.ts` | new: platform subscriptions destination |
| `src/monetization/accountNavigation.ts` | new: the one navigation path to the Restore control |
| `src/features/premium/usePremiumHome.ts`, `PremiumHome.tsx` | new: hook and view |
| `src/monetization/PremiumStateProvider.tsx` | `usePremiumStateIfMounted` (read-only accessor) |
| `src/features/account/AccountPanel.tsx`, `app/sign-in.tsx` | Premium section slot; mount |
| `src/monetization/premiumCopy.ts`, the two feature sections | restore affordance navigates to Your Account |
| `tests/premiumHome/*` (5 files, 80 tests), `tests/premiumFeedback.test.mjs` | new guards; consumer allow-list names the purchase surface |
| `scripts-dev/meals-boundary-scan.cjs` | lane `HK-PREMIUM-HOME` |

## Acceptance mapping

| Requirement | Evidence |
|---|---|
| Discoverable within existing account navigation | Section is in `/sign-in`; `home.test.mjs`, `structure.test.mjs` placement test |
| Discover all three capabilities | `copy.test.mjs` "the three tools" (exactly three, plain summaries, where to find) |
| Subscription status, eight named states | `state.test.mjs`, `home.test.mjs` "each state, rendered from the server" |
| Open purchase interface | `home.test.mjs` "buying" (single flight, `manual_upgrade`, server verification, cancel/no-offering/error) |
| Restore purchases; no duplicate control or path | `structure.test.mjs` (one mount, one caller, home renders none, feature notices navigate) |
| Platform subscription management | `subscriptionManagement.test.mjs`, `home.test.mjs` "managing the subscription" |
| Server-confirmed descriptions | `state.test.mjs` "the server is the authority"; `home.test.mjs` store-vs-server cases |
| Pricing from the store catalog | `structure.test.mjs` "shows no price"; `copy.test.mjs` no price in any state |
| Account safety | `home.test.mjs` account switch; Pass A provider tests unchanged and passing |
| Tests bite | 7/7 deliberate mutants killed (store SDK grants active, second restore control, restore opens paywall, price in copy, wrong Android package, Ready without server, held actions enabled) |

## Not done / not proven

- **No device or pixel evidence.** The project has no web renderer; layout, 44pt targets and screen-reader order were not checked on a device.
- **Native purchase, restore and platform subscription screens: NOT RUN** (no EAS build, no store listing, no real purchase by constraint).
- **Manage subscription for a Google Play purchase made under a different Play account** opens the signed-in account's list; Her Keys cannot know which.
- The tool rows are descriptive. A "Go to Today / Talk It Out" jump was deliberately left out (navigating out of a modal needs a router decision); tracked as WP-1b.
- The pasted brief for this build ended mid-sentence at "Implement" inside WP-1, so WP-2 onward (Daily Load, Smart Inbox, Momentum refinement) were not specified and are not part of this commit.
