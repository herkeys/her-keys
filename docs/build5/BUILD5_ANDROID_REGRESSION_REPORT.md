# Build 5 Android regression report

**Verdict:**
- **Android presentation is unchanged by construction.** This is proven at unit and source level.
- The Android export passes.
- **The Android device pass was NOT RUN.**

## 1. How Android is protected

`src/design/adaptive/sizeClass.ts`: `ADAPTIVE_PLATFORMS = new Set(['ios'])`. For `android`, `computeAdaptiveLayout` always returns:
- `sizeClass: 'compact'`
- `navigation: 'tabBar'`
- `twoPane: false`
- `bodyColumnMaxWidth: null`
- `sheetPresentation: 'bottom'`
- `contentMaxWidth: 680`

That holds for every window: phone, tablet or open foldable. Every shared component renders its pre-Build-5 tree on Android. This is registered as **PC-B5-01 / EX-B5-01** in `docs/audits/HK_PLATFORM_PARITY_REGISTRY.json`.

## 2. Shared components changed, and their Android effect

| Changed file | Android screens affected | Android effect | Evidence |
|---|---|---|---|
| `Screen.tsx` | Every screen | None. Clearance is `xxxl + 68 + inset` (tab bar); there is no column; the workspace prop has no effect. | `build5/adaptiveLayout` "Screen bottom clearance with a tab bar…" on an Android tablet window; `ios/ipadSupport` Android phone and tablet |
| `Sheet.tsx` | Every sheet and confirmation | None. Same style object, handle kept. | `ios/ipadSupport` Android rows |
| `readableColumn.ts` | AI, Talk It Out, consent, `Screen`, `Sheet` | Returns `null` on Android | `ios/ipadSupport` |
| `app/(app)/_layout.tsx` + `appTabs.tsx` | Primary navigation | Bottom-bar options are byte-for-byte the previous ones | `build5/adaptiveNavigation` |
| `AdaptiveSplit` (Today, Calendar, Life hub, Systems hub) | Those four screens | Compact panes have `style: null`. The only added nodes are three plain `View` wrappers (lead, panes, root `flexGrow: 1`). Stacked order equals the old order. | `build5/adaptiveLayout` "compact windows add no styles…"; existing Today and Calendar suites pass unchanged |
| `ConsentFlow.tsx` | Consent stages | `inset` unchanged (column `null`) | `onboardingLayout`, `lightRegression` (consent trees) |

## 3. Checklist (brief §14)

| Item | Result |
|---|---|
| 1. Affected Android screens identified | §2 |
| 2. Styling | Unit: unchanged trees and options. Device: NOT RUN |
| 3. Navigation | Same navigator, same options. Device: NOT RUN |
| 4. Safe areas | Unchanged (`SafeAreaView` edges were already top, left, right) |
| 5. Forms and keyboard | Unchanged (`adjustResize`; the iOS-only `automaticallyAdjustKeyboardInsets` is untouched) |
| 6. Accessibility | Unchanged on Android (TalkBack NOT RUN) |
| 7. Tests | Full suite green (`BUILD5_RELEASE_READINESS.md`) |
| 8. Android release export | `expo export --platform android`: PASS (see readiness §3) |

- **iOS-only imports in shared paths:** none were added. The adaptive layer imports only `react`, `react-native` and `react-native-safe-area-context`.
- **Android IDs:** application ID `com.heykeys.app` and versionCode 2 are unchanged. `app.json` is untouched.

## 4. Remaining Android action

Run the Android emulator pass on a development build. Follow `docs/design-system/evidence` and the emulator recipe. Cover:
- the five tabs
- Today, Calendar, Life and Systems
- a sheet
- consent
- a long form with the keyboard
- TalkBack on the tab bar

Do this on a phone and a tablet AVD, and confirm the tablet still shows the phone presentation.
