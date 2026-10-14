# Build 2 shared consumer blocker repair ledger

Date: 2026-10-13. Role: shared integration engineer. Scope: shared feature and consumer-experience repairs, **excluding** account deletion
and the Welcome Tree redesign. Branch `integration/build2-shared-consumer-repair` (worktree `C:\Users\jsmit\Her-Keys-B2SC`).
Nothing was merged, deployed or built; no EAS command was run; no backend, Production, RevenueCat dashboard or store setting was touched.

## 1. Source authority

| Source | Ref | Verified |
|---|---|---|
| Certified Android audit | `origin/codex/build2b-android-candidate-audit` = `308551bac7b609234dfe440a40bd1096720a08fe` | fetched, SHA equal to the brief |
| Certified iOS audit | `origin/audit/ios-build2-candidate` = `925a9b445b75a3f34a7bd9a102167c65f6895f4b` | fetched, SHA equal to the brief |
| Prior shared work (descendant of the Android audit) | `origin/codex/build2b-shared-integration` = `ad72ccd5b517a83bde5e7bbf3bf658193a667b82` | contains the Android SHA, does **not** contain the iOS SHA |

Construction: branch from `ad72ccd` (so the Android repairs, the B2B-N01 Systems chooser and the B2B-N02 SDK identity guard are all
inherited, and so is the lineage the deletion workstream already stacks on), then `git merge --no-ff 925a9b4` (clean, no conflicts) →
`ddf06cf`. Both audit lines are therefore in this branch's history. The deletion workstream (`codex/account-deletion` @ `824b258`) and
the Welcome Tree workstream were **not** modified.

### Preserved platform repairs (verified present after the merge)

| Repair | Where | Guard that still passes |
|---|---|---|
| Android compact buttons 48dp (B2B-A02) | `src/design/components/Button.tsx` (`androidSmallTarget`, Android only) | `tests/platformParity/androidButtonTarget.test.mjs` |
| iOS Apple nonce (IOS-D01) | `src/platform/appleProvider.ts` | `tests/ios/appleNonce.test.mjs` |
| iOS light appearance (IOS-D02) | `app.json` (owner's file, **not edited**) | `tests/ios/nativeConfig.test.mjs` |
| iOS keyboard insets (IOS-D04) | `Screen.tsx` + six input sheets | `tests/ios/keyboardInsets.test.mjs` (its registered gap SH-04 was **repaired and removed**, see SC-06) |
| Android package identity, iOS bundle identity | resolved Expo config | `tests/releaseIdentity.test.mjs` |

## 2. Per-repair record

Each row: defect → source files → root cause → minimal correction → tests → commit. `NOT RUN` means no device, store or live service
evidence exists; it is never implied by a source test.

### SC-01 Systems child chooser (P1) — `SYSTEMS_CHILD_CHOOSER=PASS` (source)

- **Defect.** The System editor had the model contract (`subjectChoices`, `actions.setSubject`) but no consumer control; a child
  association could not be chosen, and a pinned sentinel test enshrined the omission.
- **Files.** `src/features/systems/editor/SystemEditor.tsx`, `useSystemEditor.ts` (comment only) — implemented by B2B-N01 (`35d7c01`, inherited);
  this line adds radiogroup semantics to the chooser (`8130116`) and sync evidence (`e6e9ff0`).
- **Root cause.** Integration placement of the control was deferred and never done.
- **Correction.** Household-wide option plus one chip per existing child; selected state announced; an unavailable saved child is shown in
  words and never silently cleared; ownership semantics, domain, persistence and sync rules unchanged.
- **Tests.** `tests/systems/ui.subject.test.mjs` (both platforms: create → choose → save → restart → edit → clear; no-child default; refused
  save keeps the choice; missing child), `tests/systems/subject.test.mjs`, `tests/hk-ir01/systemSubject.test.mjs` (16),
  `tests/hk-ir01/f04SystemsSync.test.mjs` (7), and the new `tests/systems/subject.sync.test.mjs` (5): outbound carries the child's cloud id
  with child scope and no owner profile; inbound restores this device's local child id; household stays household; an unresolvable child is
  refused outbound and kept raw inbound, never demoted to a household routine.
- **Account restoration.** A pristine phone adopts the household and pulls synced rows through the same `applyCloudRow` path pinned above.
  Cloud-side proof (RLS, `30-child-subject.sql`, `journey-composition.mjs`) is the backend harness and was **not re-run** (shared Docker DB).
- **Not run.** Physical interaction on Android/iOS.

### SC-02 Persistent Restore Purchases (P1) — `RESTORE_PURCHASES_SOURCE=PASS` (source)

- **Defect (IOS-S02).** Restore existed only inside onboarding; a returning subscriber who skipped it had no way back.
- **Files.** New `src/monetization/useRestorePurchases.ts`, new `src/features/account/RestorePurchasesControl.tsx`; `app/sign-in.tsx` now uses
  the hook instead of 40 lines of inline logic. SDK identity protection (`revenueCatClient.ts`, `RevenueCatProvider.tsx`) is B2B-N02, inherited.
- **Root cause.** Restore was wired as an onboarding step, never as an account-level capability.
- **Correction.** One hook over the existing `useEntitlement().restore(expectedAccountId)` boundary, and one self-contained control. The SDK
  boundary refuses a store restore unless its RevenueCat identity is exactly the bound account UUID (anonymous, stale or another account's →
  `unavailable`). `AccountPanel` is **not modified** by this repair.
- **Behavior.** Single-flight (even before a re-render); loading label; outcome words for restored / no purchases / unavailable / error (the
  SDK message is never shown); a throwing restore is recoverable; a late result for a different account or an unmounted screen is dropped.
- **Tests.** `tests/platformParity/restoreControl.test.mjs` (8, both platforms), the unchanged `persistentRestore` (route) and
  `restoreIdentity` (SDK boundary) suites.
- **Not run.** Native sandbox purchase, restore, and cross-store-account behavior; RevenueCat transfer policy (dashboard).

### SC-03 Premium benefit and presentation audit (P1) — `PREMIUM_BENEFIT_PARITY=OWNER_DECISION`

See section 3 (map) and section 5 (decisions). Summary: **no feature or backend path is gated on `her_keys_plus`.** `isPlus` only hides the
Systems upsell card.

- **Files.** New `src/monetization/paywallFeedback.ts`, `usePaywallAction.ts`, `PaywallNoticeView.tsx`; `app/(app)/systems/index.tsx`,
  `app/onboarding/plus.tsx`, `src/monetization/PremiumCheckoutAfterConsent.tsx`.
- **Root cause.** Foundation shipped the paywall without a gated capability (IOS-S03); outcomes of the paywall were discarded (IOS-S09): the
  Systems card ignored the result, the onboarding step *hid* its Explore button on an unavailable offering without a word, and a user who
  chose Premium on the Welcome screen got nothing visible if the checkout could not open after consent.
- **Correction.** Every paywall outcome ends in words and a tone (purchased / restored / already active = success; cancelled = info;
  no offering / unavailable / failed = attention). Single-flight; a throwing paywall is a failed paywall; the SDK text is never shown. The
  post-consent checkout shows a dismissible banner under the status bar and **never blocks the app**. The onboarding step stops listing four
  benefits nothing delivers and states only what is true.
- **Not done, by instruction.** No paid feature invented, no entitlement enabled, no price/offering/dashboard change, the paywall is still
  reachable. Welcome Tree Premium copy is unchanged (section 6).
- **Tests.** `tests/premiumFeedback.test.mjs` (14, 9/9 mutants killed) including source guards PBP-1 (no consumer reads the entitlement except the
  Systems card), PBP-2 (no Supabase function/migration reads the entitlement), PBP-3 (no undelivered-benefit copy outside the Welcome Tree).
  Existing `monetization` (23) and `welcomePremiumFlow` (26) pass unchanged.

### SC-04 Returning-user restoration (P2) — `RETURNING_USER_RESTORE_SOURCE=PASS` (source)

The five contracts were verified against the real runtime tests (all run in this worktree):

| Scenario | Contract (source) | Evidence |
|---|---|---|
| Same-device session restoration | stored session restores and re-identifies; an unreadable keychain degrades, never offers a fresh start; routing waits for hydration and session resolution | `accountRuntime` #20, #22; `routeAccess` (19); `sessionContinuityTransport` (3); `supabaseSessionClient` (4) |
| Same-account reconnection | an expired session degrades (local work continues); signing out keeps the binding and the same account resumes; a wrong actor is refused | `accountRuntime` #21, #24; `accountAccess` (26) |
| Pristine-device cloud household adoption | a device with nothing local whose bootstrap is answered `superseded_by_cloud` durably binds the existing household with an unhydrated namespace and pulls; invalid id never binds; failed write rolls back | `accountRuntime` "fresh-device household adoption" (4); `hk-ir01/syncComposition` (55) |
| Non-pristine device with a local household | a claim is refused, recorded, not retried, **never merged**; work created while bootstrap is in flight prevents adoption; recovery fallback is not eligible | `accountRuntime` #15, "work created while bootstrap is in flight"; `syncComposition` "a server refusal … nothing is uploaded" |
| Wrong-account quarantine and isolation | the other household is preserved and never rendered; only `account-conflict` opens; nothing uploads or deletes | `accountRuntime` #23; `routeAccess` quarantine cases; `hk-ir01/syncComposition` |

- **Defect (IOS-S05).** `AccountPanel` said restoring a household on a new phone "is not available yet" although pristine-device adoption is
  implemented. Its doc comment said "fresh-device adoption is not implemented yet".
- **Files.** `src/features/account/AccountPanel.tsx` (two strings and a comment — a deliberately minimal edit so it merges with the deletion
  workstream's changes to that file).
- **Correction.** "On a new phone with nothing set up yet, signing in to an existing account brings its synced records here", scoped to
  synced records, promising no merge and no complete recovery. The runtime was not changed: no automatic merge of unrelated households.
- **Tests.** `tests/platformParity/returningUserCopy.test.mjs` (3): every panel mode is free of "not available/supported"; the signed-in
  modes state the real rule; a source scan fails on any new unavailable-restoration claim outside the registered Welcome-owned strings. It fails
  3/3 on the old copy.
- **Not run.** Live two-device adoption, a real expired Supabase token, a real keychain.

### SC-05 Consent failure recovery (P2) — `CONSENT_RECOVERY_UX=PASS` (source)

- **Defect (IOS-S07).** When consent state could not be loaded the gate showed a dead-end message ("reopen Her Keys") with no Retry and no
  Sign out. A request that never answered left "Checking your account setup…" forever.
- **Related root cause found on the way.** The gate's `ledger` was memoised on `session.accessToken`. Supabase rotates tokens during normal
  use, which rebuilt the ledger, reset the stage to `loading` and **unmounted the whole navigator** (and, offline, would strand a user who had
  already consented on the error screen). Recovery without fixing this would have recurred on every token rotation.
- **Files.** `src/features/consent/ConsentFlow.tsx` only.
- **Correction.** Error stage offers **Try again** and **Sign out** (single-flight; disabled while a sign-out is pending; a failing sign-out
  returns the controls). The ledger read is bounded at 15 s and a thrown read is a failure. State is keyed to the **account**; each request
  reads the freshest tokens at the moment it is made; another account never inherits a decision, not even for one render; a late answer
  for a previous account is ignored. **Fail closed is unchanged**: the app opens only when the ledger confirms accepted legal terms and a
  recorded AI decision.
- **Tests.** `tests/consentRecovery.test.mjs` (14, both platforms): fail closed, retry success/failure/double press, throwing read, hung read
  (mock timers), not-consented never opens, sign-out single-flight and failure, token rotation does not re-check or unmount, retry uses fresh
  tokens, account switch (including a render-level spy proving the app is never rendered under the new account), late answer ignored.
  6 of 7 mutants killed; the survivor is a proven-equivalent mutant (the effect closure is already rebuilt on every retry).
- **Residual.** The legal-acceptance stage has no Sign out and `record()` has no timeout (U-08).
- **Not run.** A live network drop against the real Supabase read.

### SC-06 Talk It Out capture Fix sheet (P2) — `TALK_IT_OUT_SHEET=PASS` (source)

- **Defect (IOS-S04).** Six-plus fields and chip groups in a bottom-anchored Modal with no scroll container: on small phones, with larger text
  or with the iOS keyboard up, lower fields and Apply could sit off-screen.
- **Files.** `src/features/talk-it-out/capture/CaptureCards.tsx`, `fixForm.ts` (pure height rule); tests/support `rn-stub.tsx`
  (`useWindowDimensions` with test-controlled metrics); `tests/ios/keyboardInsets.test.mjs` (the registered gap was removed, as its rule requires).
- **Correction.** All fields live in one `ScrollView` (`keyboardShouldPersistTaps="handled"`, `automaticallyAdjustKeyboardInsets`) bounded by
  `fixSheetFieldsMaxHeight(windowHeight, fontScale)`; **Apply and Cancel are pinned outside the scroll area**. Capture, approval and revision
  semantics are untouched (the whole existing "Fix it" suite passes unchanged).
- **Tests.** `tests/talkItOutCapture.ui.test.mjs` SC-06 block (structure for note and event kinds; 568 pt phone, 568 pt at 2x text and 926 pt
  at 1.3x text each keep Apply working; height-rule table). A mutant moving Apply into the scroll area is killed by two tests.
- **Not run.** On-device keyboard/IME and large-font behavior (parity registry RT-18).

### SC-07 Release-policy reconciliation — `RELEASE_BRANCH_POLICY=OWNER_APPROVAL_REQUIRED`

- **Finding.** `release:preflight` authorizes only `build/02-gemini-integration` (remote tip `0cf041a`, **219 commits behind** this line, an
  ancestor of it). No converged candidate can pass it, and the guard's own comment states that changing the list is an owner decision.
- **Prepared, not applied.** `docs/release/patches/build2-release-branch-allowlist.patch` adds exactly one literal branch name
  (`codex/build2b-release-candidate`, the name already proposed in `BUILD2B_RELEASE_POLICY_PROPOSAL.md`) plus two regression tests. Applied to a
  scratch copy it passed `tests/releaseIdentity.test.mjs` 12/12; `git apply --check` is clean on this tree; the guard on this branch is unchanged.
  Full procedure and what approval would permit: `docs/release/BUILD2_RELEASE_POLICY_UPDATE.md`.
- **Safeguards kept (and re-asserted by the patch's tests).** Package and bundle identity, owner/slug/EAS project, clean tracked tree, upstream
  HEAD equality, explicit Supabase environment and project URL/key, empty data mode, mandatory consent flag exactly `true`. No wildcard, no
  environment bypass, no "audit branch" exception.
- **CI.** This branch is added to the exact-SHA push triggers of `v2-integration-validation.yml` (the iOS audit did the same; remove with the branch).

## 3. Premium benefit map

"Delivered" means a user can observe a difference **and** it is enforced by `her_keys_plus`.

| Where | Claim | Real functionality | Enforced by `her_keys_plus`? | Disposition |
|---|---|---|---|---|
| Welcome Premium offer (`src/features/welcome/copy.ts:31-45`, Welcome-owned) | "Deeper household intelligence"; "More proactive planning support"; "Enhanced Talk It Out capabilities"; "Explore deeper planning support and more proactive help as Her Keys grows." | Talk It Out and planning work identically for every user; AI use is governed by the consent receipt, not the entitlement | **No** | Not delivered. Welcome owner — proposal in section 6 |
| Onboarding final step (`app/onboarding/plus.tsx`) before this repair | "Deeper household intelligence and pattern recognition"; "More proactive planning and recommendations"; "Enhanced Talk It Out and Life OS intelligence"; "Future automation for repeatable work" | none | **No** | **Corrected** to what is true (SC-03) |
| Systems upsell card (`app/(app)/systems/index.tsx`) | "More of Her Keys' intelligence is on the way." | forward-looking only; no present claim | n/a | Left as is; outcomes now worded |
| `featureAccess.ts` manifest | `advanced_daily_load_patterns`, `momentum_insights` = plus | **no code consumes them** (PBP-1); the two names appear nowhere else | **No** | Placeholder only |
| `usePremiumGate` | the one call a premium capability should make | **no caller** | n/a | Unused |
| Supabase functions / migrations | any server-side entitlement check | **none** (PBP-2) | **No** | Server never enforces Premium |
| `isPlus` | hides the Systems upsell card | the only visible effect of purchasing | n/a | Purchasing changes nothing else |

Conclusion: a purchaser currently receives nothing different. **Do not claim paid-release readiness.** Store review risk (App Store 3.1.2 /
2.3.1, Play subscriptions policy) is the owner's to weigh.

## 4. Returning-user copy corrected vs proposed

Corrected here (outside the Welcome Tree): `AccountPanel` `signIn` and `connected` ledes and its doc comment (SC-04).

## 5. Owner decision register

| ID | Question | Why the doctrine does not resolve it | Conservative state in this branch |
|---|---|---|---|
| OD-SC-03-01 | What is the first **real** Premium benefit, and is it gated through `usePremiumGate`? | It needs a new product semantic and pricing/positioning judgement | Premium copy states only what is true; nothing new is gated |
| OD-SC-03-02 | Should the paywall stay reachable (Systems card, onboarding "Explore", welcome checkout) until a benefit exists? (IOS-S03: "do not take payment until a benefit exists") | Hiding it changes the monetization surface | Reachable, with honest copy and outcome words |
| OD-SC-03-03 | Keep the onboarding "Where Premium stands" card, or remove the Premium step for now? | Onboarding resolution policy is owner-owned (`PAYWALL_POLICY`) | Kept; policy unchanged |
| OD-SC-04-01 | Welcome Tree copy corrections (section 6) | Welcome Tree owner | Not touched; guard test lists the owned strings |
| OD-SC-04-02 | What should a **non-pristine** device be told, and offered, when its account already has a household (IOS-S06)? | Needs a user choice (keep local / use cloud) = new durable semantics | Refused and never merged; the Welcome flow still says "you can try again", which cannot succeed |
| OD-SC-07-01 | Approve the release-branch policy patch (name and scope) | Owner decision by the guard's own text | Not applied |

## 6. Proposals for other owners (exact text; nothing here was applied)

### 6.1 Welcome Tree owner

1. `src/features/welcome/copy.ts:47` `accountChoice.lede`
   - now: `Sign in to connect your household to your account and sync eligible records. Restoring an existing household on a different phone is not available yet.`
   - proposed: `Sign in to connect your household to your account and sync eligible records. On a new phone with nothing set up yet, signing in to an existing account brings its synced records here. A household already started on a phone isn’t merged into an existing account’s.`
2. `src/features/account/accountModel.ts` `CROSS_PLATFORM_NOTE` (imported into the Welcome copy as `accountChoice.crossPlatformNote`)
   - now: `Google sign-in is available on iOS and Android. Restoring your existing household on a new phone is not yet supported.`
   - proposed: `Google sign-in is available on iOS and Android. Apple sign-in is iOS-only, so an Apple account can’t be used on an Android phone.`
   - constraints: stays a single-quoted literal with no straight apostrophe (`registryGuard` parses `'([^']+)'`); must keep the words "Android" and "Google" (EX-01 guard).
3. Tests that pin the old words and must change with 1 and 2: `tests/welcomeAuthShell.test.mjs:176-177` (`/not available yet/`, `/not yet supported/`). Keep `:179` (the AccountPanel guard).
4. Premium offer, `copy.ts:31-45`: replace the three benefits and the lede (nothing delivers them) with, for example, lede `Premium is optional. Everything in Her Keys works without it, and Premium features are still being built.` and an empty `benefits` list (confirm `PremiumIntroView` renders an empty list). Subject to OD-SC-03-01/02.
5. `attemptFailed` (`copy.ts:62`, "you can try again") is untrue after a **refused** household claim; fixing it needs the runtime to expose the refusal reason (OD-SC-04-02), so it is a design item and not a wording one.

### 6.2 Deletion / Settings engineer

- Mount `<RestorePurchasesControl accountId={boundAccountId} onRestoringChange={setHoldAccountActions} />` (`src/features/account/RestorePurchasesControl.tsx`) in the permanent Settings/Account surface. `accountId` is the bound account's id or `null` (renders nothing). Hold **Sign out, Delete account and Done** while `onRestoringChange(true)`.
- Mount exactly **one** restore control per surface. `AccountPanel` still renders the interim `onRestore` button supplied by `app/sign-in.tsx` (the same hook); when Settings takes over, drop that entry rather than showing two.
- `src/features/account/AccountPanel.tsx` was edited here in three lines (two ledes and one comment) on top of the B2B-N02 changes already in the deletion branch's base; expect a trivial textual conflict only if the deletion branch edits the same lines.
- Do not call `restoreRevenueCatPurchases` without the account UUID: the SDK guard then falls back to the last verified identity.

## 7. Unresolved items

| ID | Sev | Exact location | Owner | Minimum required correction |
|---|---|---|---|---|
| U-01 | P1 (store) / owner decision | `src/monetization/featureAccess.ts:16-25` (no consumer), `src/features/welcome/copy.ts:31-45` | Product (owner) | Decide OD-SC-03-01/02; gate one real capability through `usePremiumGate` with a test, or remove the upsell until one exists; correct Welcome copy |
| U-02 | P1 (integration) | Settings surface (deletion workstream) | Deletion/Settings engineer | Mount `RestorePurchasesControl` once; hold Sign out/Delete/Done while restoring; drop `AccountPanel`'s interim entry |
| U-03 | P1 (release gate, NOT RUN) | native store paywall, purchase, restore; RevenueCat dashboard (offering, product→entitlement mapping, transfer behavior) | Owner / sandbox QA | Sandbox purchase and restore on iOS and Android; verify dashboard; no source change |
| U-04 | Owner approval | `scripts/verify-release-identity.mjs:21` | Owner | Approve and apply `docs/release/patches/build2-release-branch-allowlist.patch` on the release-candidate branch |
| U-05 | P3 (copy) | `src/features/welcome/copy.ts:47`, `accountModel.ts` `CROSS_PLATFORM_NOTE`, `tests/welcomeAuthShell.test.mjs:176-177` | Welcome Tree owner | Apply section 6.1 |
| U-06 | P4 | `src/domain/account/accountRuntime.ts:592-640` + `copy.ts:62` | Owner decision (OD-SC-04-02, IOS-S06) | Surface the refusal reason and offer an explicit choice; no automatic merge |
| U-07 | P4 (NOT RUN) | Fix sheet, consent screens, Systems chooser on devices | QA / platform owners | Device pass: IME, 2x font, small screen, offline consent retry |
| U-08 | P3 | `src/features/consent/ConsentFlow.tsx` `commit()` and the `legal` stage | Consent owner | Add Sign out to the legal stage and bound `record()` like `read()` |
| U-09 | P3 | live `HER_KEYS_AI_REQUIRE_CONSENT` enforcement and server refusal evidence (prior N05/N10) | Security/backend | Post-build direct-refusal test with a declined and a consenting account |
| U-10 | P4 | `identifyRevenueCatAccount` result discarded in composition (prior N03) | Monetization owner | Diagnostics and a guarded retry; unsafe operations are already refused |
| U-11 | P2 | in-app account deletion (IOS-S01), Settings/legal/support (IOS-S18), Apple credential lifecycle (IOS-S11), keychain after reinstall (IOS-S10), IOS-D03 photo purpose string | Deletion / iOS / owner | Out of scope here; see the iOS audit register |
| U-12 | P3 | Welcome Premium offer checkout copy "Plans and prices are shown by the App Store or Google Play" | Welcome owner | Re-check after OD-SC-03 |

## 8. Verification record

See `docs/builds/HK_BUILD2_SHARED_CONSUMER_HANDOFF.md` for the gate results, exact SHAs and CI run.
