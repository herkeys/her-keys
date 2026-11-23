# Build 5 adaptive baseline audit

**Date:** 2026-11-23
**Baseline:** `integration/v2-autonomous-upgrade-20261112` @ `5ed5b30` (merge of PR #68)
**Build 5 branches:**
- `feature/build5-01-responsive-foundation`
- `feature/build5-02-adaptive-navigation-ipad`
- `feature/build5-ipad-iphone-duo-adaptive`

**Host:** Windows 11. No macOS, Xcode, iOS Simulator, iPad, iPhone Duo or Device Hub was available. Everything below comes from source, configuration and the Node test harness. Nothing is a rendered or on-device result.

## 1. Build 4 isolation record

| Field | Value | Source |
|---|---|---|
| Bundle identifier | `com.herkeys.app` | EAS build list |
| Uploaded build number | 4 (app version 1.0.0) | EAS build list |
| EAS build | `19da0220-1aa5-482d-8f2f-b27d100f58d9`, profile `store-sandbox` | `eas build:list --platform ios` |
| Source SHA | `ef229ebd8848dc2ef39b96966250a8f7ecb5e59a` | EAS build and submission metadata |
| Submission | EAS submission `1c19483d-e485-4f53-b04f-ed7c22429773`, status `finished` (2026-11-15), ASC app 6816197153 | `eas submit:list --platform ios` |
| App Store review status | **Not readable from this host** (no App Store Connect API key) | — |

**Build 4 is not the Build 5 baseline.** The integration branch moved after `ef229eb`:
- PR #67: iOS privacy manifest.
- PR #68: production migration gate.

Build 5 starts from `5ed5b30`, not from the uploaded binary's SHA.

**Carried-forward flag, not acted on.** The 2026-11-17 IPA audit found that build 4 (`store-sandbox`) is wired to the Staging backend. It also found that a production-profile build is needed for submission. Build 5 does not change that. It is repeated here so nobody mistakes Build 4 for a Production binary.

**Nothing done to Build 4:**
- No EAS build, submit or credential command was run.
- No App Store Connect change was made.
- No change was made to `app.json`, `eas.json`, bundle or package IDs, signing or RevenueCat.

**Open PRs at the start:**

| PR | Branch | Effect on the Build 5 baseline |
|---|---|---|
| #66 (draft) | `repair/android-play-html-legal-links-20261115` | Android legal links. No layout files. None. |
| #60 | `audit/ios-ipad-v2-final-pre-eas-20261114` | Docs only. None. |

## 2. Baseline gates at `5ed5b30`

| Gate | Result |
|---|---|
| `npm ci` (npm 11.9, Node 24.14) | PASS, 591 packages |
| `tsc --noEmit` | PASS |
| `npm test` | **5707 / 5707 pass** |

## 3. The real layout architecture (verified in source)

- **Shell:** Expo SDK 57.0.33, React Native 0.86.3, Expo Router 57.0.31 (React Navigation vendored inside `expo-router/build/react-navigation`), react-native-screens 4.26.2, react-native-safe-area-context 5.7.
- **Providers:** the root providers are, in order: `SafeAreaProvider`, `AppearanceProvider`, `RevenueCatProvider`, `AppStateProvider`, `LocalNotificationProvider`, `DeletionGate`, `AccountProvider`, the Premium bridges, `RootNavigator`.
  - None of them reads the window size.
  - A layout change therefore cannot remount an account, household, consent, purchase or OAuth owner, as long as layout decisions stay below the navigator. Build 5 keeps every decision there.
- **Primary navigation:** `app/(app)/_layout.tsx`, a JS `Tabs` (bottom tabs) with five destinations: Today, Life, Calendar, Systems, AI.
  - The tab bar height is fixed at `68 + insets.bottom`, with `tabBarAllowFontScaling: false`. This is a documented HK-FE-UI-02 exception.
  - The vendored navigator already supports `tabBarPosition: 'left' | 'right'` (a sidebar) and switches to beside-icon labels at widths of 768 or more.
- **Screen shell:** `src/design/components/Screen.tsx`.
  - `SafeAreaView` with edges top, left and right. Its horizontal insets are native and per-edge, so asymmetric insets are handled.
  - The scroll content is capped at `sizing.contentWidth` (680) on every platform.
  - The non-scrolling body was capped only when `Platform.OS === 'ios' && Platform.isPad` (IOS-FIX-002).
  - Bottom clearance assumed a bottom tab bar (`spacing.xxxl + 68`).
- **Sheet:** `Sheet.tsx` is a bottom sheet. On the iPad idiom only, it was capped at 680.
- **Conversation frames:** `app/(app)/ai.tsx` and `app/talk-it-out.tsx` used the same isPad-only cap.
- **Orientation** (from `app.json` and the resolved Info.plist, `tests/ios/ipadSupport.test.mjs`):
  - iPhone: Portrait and PortraitUpsideDown.
  - iPad: all four orientations.
  - `UIRequiresFullScreen` false.
  - There is no `expo-screen-orientation` and no runtime lock.
- **`useWindowDimensions`:** used only by `Botanical`, `CaptureCards` and `HeaderBadge` (decoration budget). No screen branched on window width before Build 5.

## 4. Findings

**Labels:**
- **VD:** verified defect, from source or config.
- **DO:** design opportunity.
- **NT:** not yet tested on a simulator or device.
- **Risk:** risk of changing the area.

| ID | Area | Finding | Label | Build 5 action |
|---|---|---|---|---|
| B5-D01 | Consent (legal, permissions, error, loading) | The stages render outside `Screen` with their own `ScrollView` and no width cap. On a full-screen iPad the legal text and buttons stretch to the full width of the window. | VD | **Fixed.** Readable column on windows wider than compact (`ConsentFlow.tsx`). |
| B5-D02 | Shared shell | Every width decision was `Platform.isPad`. This misclassifies windows: a narrow iPad Split View window got the iPad branch, while an iPhone Duo inner display (iPhone idiom) and resized iOS 27 windows never did. | VD (against the Build 5 requirement) | **Fixed.** All decisions now come from the window (`src/design/adaptive`). |
| B5-D03 | `Screen` bottom clearance | The default clearance hard-codes a 68pt bottom tab bar. That was correct while there was only a bottom bar, and is wrong once the bar becomes a sidebar. | VD (latent) | **Fixed.** Clearance now comes from the navigation chrome. |
| B5-O01 | Primary navigation | A bottom tab bar on a 1,376pt-wide window. | DO | A sidebar on expanded iOS windows. Same navigator, same destinations. |
| B5-O02 | Today, Calendar, Life hub, Systems hub | One 680pt column centered in a wide window. | DO | Two panes when the window holds both. One column otherwise. |
| B5-O03 | `Sheet` on iPad | A 680pt strip at the bottom of a 1,000pt-tall window. | DO | A centered dialog card on expanded windows. |
| B5-O04 | Household modules (Kids, Home, Money, Meals, Work, Co-parenting), People, Life Admin, Rebuild | Readable 680pt column on every window. Category list and detail are separate stack screens. | DO | **Not changed in Build 5.** List/detail is the next work package (§6). |
| B5-O05 | Tab-label Dynamic Type | The fixed-height bottom bar disables label scaling. | DO | The sidebar scales its labels. The bottom bar keeps its documented cap and the iOS Large Content Viewer. |
| B5-N01 | Everything native | Rendering, rotation, Split View, Stage Manager, fold transitions, VoiceOver, keyboard frames, pointer. | NT | Handoff in `BUILD5_RESPONSIVE_TEST_MATRIX.md`. |
| B5-N02 | iPhone (and iPhone Duo) orientation | iPhone is portrait-only. With the iOS 27 SDK an orientation lock is a preference where an iPhone app can be resized (Expo, 2026-10-23), so the app must lay out correctly in any window it is given. The width-based layout does. | NT, plus owner decision OD-B5-01 | No orientation change in Build 5 (§7). |

## 5. Screen-by-screen baseline

**Before** describes `5ed5b30`. **Duo** means the iPhone Duo, which is the iPhone idiom:
- outer display about 466pt wide: compact
- inner display about 669pt in portrait: medium
- inner display about 951pt in landscape: expanded
- Duo sizes are derived from Apple's screenshot pixel sizes at @3x and are not device-verified.

Every row's native behavior is **NT**.

### Screens that use the `Screen` scroll cap

| Experience | Before | Safe areas | Build 5 result | Risk | Regression coverage |
|---|---|---|---|---|---|
| Welcome and sign-in | Capped 680 (scroll). Non-scroll body capped on iPad only. | Native top, left and right | Window-based cap. Unchanged on compact windows. | Low | `lightRegression` (welcome/* trees), `ipadSupport`, `build5/adaptiveLayout` |
| Onboarding | `Screen` with `bottomClearance`, capped 680 | Same | Unchanged (readable column) | Low | `onboardingLayout`, `lightRegression` |
| Today | One column, 680 | Same | Two panes on wide windows. Compact order unchanged. | Medium | `today/*`, `v2up.integration.today`, `build5/adaptiveNavigation` |
| Calendar | One column, 680 | Same | Two panes (schedule beside Google Calendar, preview and the week) | Medium | `calendar*` (21 files), `build5/adaptiveNavigation` |
| Life hub | One column | Same | Two panes (household beside private) | Low | `hk-f01f13/lifeHub`, `build5/adaptiveNavigation` |
| Kids, Home, Money, Meals, Work, Co-parenting | One column (stack) | Same | Readable column. List/detail not built. | — | Existing feature suites |
| Systems | Hub plus Premium card, one column | Same | Two panes (hub beside the card) | Low | `systems/*`, `build5/adaptiveNavigation` |
| One Move, Daily Load | Cards inside Today | Same | Main pane of Today | Low | `today/*`, `dailyLoad*` |
| Premium | Systems card. The paywall is the native RevenueCat UI. | Native | Card in the secondary pane. The paywall is untouched. | Low | `premium*`, `build5/adaptiveNavigation` (paywall action above the split) |
| Account | `Screen scroll={false}` plus `ScrollView` | Same | Window-based cap | Low | `ipadSupport` |
| Account deletion | Same | Same | Window-based cap | Low | `accountDeletion/*`, `ipadSupport` |
| AI safety reporting | Inside Talk It Out and sheets | Same | Window-based cap | Low | `aiReport*` |
| OCR and Life Admin | Inside the Life Admin `Screen`. Record sheets inside `Sheet`. | Same | Cap. Sheets become dialogs on expanded windows. | Low | `lifeAdmin/*`, `ocr*` |
| Editors (task, event, opportunity) | Modal routes with `Screen` | Native modal | Readable column. iPad modal presentation unchanged. | Low | `calendarValidation`, task suites |

### Screens outside the `Screen` shell

| Experience | Before | Safe areas | Build 5 result | Risk | Regression coverage |
|---|---|---|---|---|---|
| Consent | **Uncapped** (B5-D01) | Gate adds the top and bottom insets | Capped on windows wider than compact | Low | `onboardingLayout`, `lightRegression` (consent/*), `build5/adaptiveLayout` |
| Talk It Out (AI tab and modal) | Capped on iPad only | Native | Window-based cap. The same view stays mounted. | Low | `ipadSupport`, talk-it-out suites |

## 6. Remaining design opportunities (not built in Build 5)

These are recorded, not attempted, because each one changes feature navigation, not just geometry. Each needs its own review.

1. **Household modules list/detail.** Kids, Home, Money, Meals, Work and Co-parenting would show the category list in one pane and the selected record in the other. Each feature currently routes detail through its own stack screen and route params, so a selected-record pane is a navigation change per feature.
2. **Talk It Out context panel.** This is the optional accepted-context panel beside the conversation. The brief requires it never to expose unapproved private context. Which context is "accepted" is a product and privacy decision. It was not built and needs an owner decision.
3. **Editors as split detail.** The task and event editors would open beside the list on wide windows instead of as modals.

## 7. Owner decisions raised

- **OD-B5-01: iPhone orientation.**
  - iPhone stays portrait-only.
  - On the iOS 27 SDK the lock is only a preference on resizable windows, and the layout already adapts to any window.
  - Declaring iPhone landscape is a native-binary change that affects every iPhone. It needs device evidence, so it was not made.
- **OD-B5-02: Talk It Out context panel scope.** See §6.2.
- **OD-B5-03: SDK 58 migration timing.** See `BUILD5_SDK_COMPATIBILITY.md`.
